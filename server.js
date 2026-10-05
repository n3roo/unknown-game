'use strict';
/*
 * UNKNOWN – Server.
 * Liefert die Dateien aus /public aus und verwaltet die Spielräume per WebSocket.
 * Die gesamte Spiellogik liegt in lib/game.js; der Server prüft jeden Zug,
 * verschickt aber jedem Spieler nur das, was er sehen darf.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');
const G = require('./lib/game');

const PORT = Number(process.env.PORT) || 10000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const AVATARS = require('./public/data/avatars.json').map((a) => a.id);
const SETS = require('./public/data/sets.json').sets.map((s) => s.id);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOBBY_GRACE_MS = 60 * 1000; // so lange bleibt ein getrennter Spieler in der Lobby
const ROOM_IDLE_MS = 30 * 60 * 1000; // leere Räume werden nach 30 Minuten gelöscht

/* ---------------------------------------------------------------- HTTP */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    return;
  }
  if (pathname === '/favicon.ico') {
    res.writeHead(204).end();
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nicht gefunden');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const isAsset = pathname.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': isAsset ? 'public, max-age=86400' : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

/* --------------------------------------------------------------- Räume */

/** code -> { code, game, setId, clients: Map(playerId -> ws), tokens: Map(token -> playerId), lastActive } */
const rooms = new Map();

function randomId(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function newRoomCode() {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('Kein freier Lobby-Code');
}

function cleanName(raw) {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 16);
  return s || 'Spieler';
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room) {
  for (const [playerId, ws] of room.clients) {
    send(ws, {
      type: 'state',
      code: room.code,
      setId: room.setId,
      state: G.viewFor(room.game, playerId),
    });
  }
}

function attach(room, playerId, ws) {
  const old = room.clients.get(playerId);
  if (old && old !== ws) {
    old.ctx = null;
    old.close(4000, 'Neue Verbindung');
  }
  room.clients.set(playerId, ws);
  ws.ctx = { room, playerId };
  const p = room.game.players.find((q) => q.id === playerId);
  if (p) p.connected = true;
  room.lastActive = Date.now();
}

function tokenFor(room, playerId) {
  for (const [token, id] of room.tokens) if (id === playerId) return token;
  return null;
}

function dropPlayer(room, playerId) {
  G.removePlayer(room.game, playerId);
  const ws = room.clients.get(playerId);
  room.clients.delete(playerId);
  for (const [token, id] of room.tokens) if (id === playerId) room.tokens.delete(token);
  if (ws) {
    ws.ctx = null;
    ws.close(4001, 'Entfernt');
  }
  if (room.game.players.length === 0) rooms.delete(room.code);
}

function joinOk(room, playerId, ws) {
  send(ws, {
    type: 'joined',
    code: room.code,
    playerId,
    token: tokenFor(room, playerId),
  });
  broadcast(room);
}

function addToRoom(room, ws, msg) {
  const avatar = AVATARS.includes(msg.avatar) ? msg.avatar : null;
  if (!avatar) return send(ws, { type: 'error', message: 'Bitte wähle einen Avatar.' });
  const playerId = randomId(4);
  const r = G.addPlayer(room.game, { id: playerId, name: cleanName(msg.name), avatar });
  if (r.error) return send(ws, { type: 'error', message: r.error });
  if (!room.game.hostId || room.game.players.length === 1) room.game.hostId = playerId;
  const token = randomId(16);
  room.tokens.set(token, playerId);
  attach(room, playerId, ws);
  joinOk(room, playerId, ws);
}

/* ------------------------------------------------------- Nachrichten */

const handlers = {
  create(ws, msg) {
    if (ws.ctx) return send(ws, { type: 'error', message: 'Du bist schon in einer Lobby.' });
    const code = newRoomCode();
    const room = {
      code,
      game: G.createGame(null),
      setId: SETS[0],
      clients: new Map(),
      tokens: new Map(),
      lastActive: Date.now(),
    };
    rooms.set(code, room);
    addToRoom(room, ws, msg);
    if (room.game.players.length === 0) rooms.delete(code);
  },

  join(ws, msg) {
    if (ws.ctx) return send(ws, { type: 'error', message: 'Du bist schon in einer Lobby.' });
    const code = String(msg.code ?? '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return send(ws, { type: 'error', message: 'Diese Lobby gibt es nicht.' });
    addToRoom(room, ws, msg);
  },

  rejoin(ws, msg) {
    const room = rooms.get(String(msg.code ?? '').toUpperCase());
    const playerId = room && room.tokens.get(String(msg.token ?? ''));
    if (!room || !playerId || !room.game.players.some((p) => p.id === playerId)) {
      return send(ws, { type: 'gone' });
    }
    attach(room, playerId, ws);
    joinOk(room, playerId, ws);
  },

  start(ws, _msg, room, playerId) {
    const r = G.startGame(room.game, playerId);
    if (r.error) return send(ws, { type: 'error', message: r.error });
    broadcast(room);
  },

  clue(ws, msg, room, playerId) {
    act(ws, room, G.giveClue(room.game, playerId, msg.card));
  },

  play(ws, msg, room, playerId) {
    act(ws, room, G.playCard(room.game, playerId, msg.card));
  },

  guess(ws, msg, room, playerId) {
    act(ws, room, G.guess(room.game, playerId, msg.c, msg.a, msg.l));
  },

  flip(ws, msg, room, playerId) {
    act(ws, room, G.flipPile(room.game, playerId, msg.pile));
  },

  avatar(ws, msg, room, playerId) {
    if (!AVATARS.includes(msg.avatar)) return send(ws, { type: 'error', message: 'Unbekannter Avatar.' });
    act(ws, room, G.setAvatar(room.game, playerId, msg.avatar));
  },

  set(ws, msg, room, playerId) {
    if (room.game.phase !== 'lobby') return send(ws, { type: 'error', message: 'Das Set lässt sich nur in der Lobby ändern.' });
    if (playerId !== room.game.hostId) return send(ws, { type: 'error', message: 'Nur der Host wählt das Set.' });
    if (!SETS.includes(msg.setId)) return send(ws, { type: 'error', message: 'Unbekanntes Set.' });
    room.setId = msg.setId;
    broadcast(room);
  },

  kick(ws, msg, room, playerId) {
    const target = room.game.players.find((p) => p.id === msg.id);
    if (playerId !== room.game.hostId) return send(ws, { type: 'error', message: 'Nur der Host kann Spieler entfernen.' });
    if (!target || target.id === playerId) return send(ws, { type: 'error', message: 'Spieler nicht gefunden.' });
    if (room.game.phase !== 'lobby' && target.connected) {
      return send(ws, { type: 'error', message: 'Im Spiel lassen sich nur getrennte Spieler entfernen.' });
    }
    dropPlayer(room, target.id);
    broadcast(room);
  },

  rematch(ws, _msg, room, playerId) {
    act(ws, room, G.rematch(room.game, playerId));
  },

  leave(ws, _msg, room, playerId) {
    dropPlayer(room, playerId);
    if (rooms.has(room.code)) broadcast(room);
  },

  ping(ws) {
    send(ws, { type: 'pong' });
  },
};

function act(ws, room, result) {
  if (result.error) return send(ws, { type: 'error', message: result.error });
  broadcast(room);
}

const NEEDS_ROOM = new Set(['start', 'clue', 'play', 'guess', 'flip', 'avatar', 'set', 'kick', 'rematch', 'leave']);

function onMessage(ws, raw) {
  const now = Date.now();
  ws.recent = (ws.recent || []).filter((t) => now - t < 10000);
  if (ws.recent.length >= 40) return send(ws, { type: 'error', message: 'Zu viele Anfragen. Bitte kurz warten.' });
  ws.recent.push(now);

  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
  const handler = Object.hasOwn(handlers, msg.type) ? handlers[msg.type] : null;
  if (!handler) return;

  try {
    if (NEEDS_ROOM.has(msg.type)) {
      if (!ws.ctx) return send(ws, { type: 'error', message: 'Du bist in keiner Lobby.' });
      const { room, playerId } = ws.ctx;
      room.lastActive = now;
      handler(ws, msg, room, playerId);
    } else {
      handler(ws, msg);
    }
  } catch (err) {
    console.error('Fehler bei Nachricht', msg.type, err);
    send(ws, { type: 'error', message: 'Interner Fehler.' });
  }
}

function onClose(ws) {
  if (!ws.ctx) return;
  const { room, playerId } = ws.ctx;
  if (room.clients.get(playerId) !== ws) return;
  room.clients.delete(playerId);
  const p = room.game.players.find((q) => q.id === playerId);
  if (p) p.connected = false;
  room.lastActive = Date.now();
  broadcast(room);

  if (room.game.phase === 'lobby') {
    setTimeout(() => {
      const q = room.game.players.find((x) => x.id === playerId);
      if (q && !q.connected && room.game.phase === 'lobby') {
        dropPlayer(room, playerId);
        if (rooms.has(room.code)) broadcast(room);
      }
    }, LOBBY_GRACE_MS).unref();
  }
}

/* ----------------------------------------------------------- WebSocket */

const wss = new WebSocketServer({ server, maxPayload: 4096 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.ctx = null;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  ws.on('message', (raw) => onMessage(ws, raw));
  ws.on('close', () => onClose(ws));
  ws.on('error', () => {});
});

// Verbindungen am Leben halten (Render trennt sonst leere Leitungen) und tote erkennen.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 25000);

const janitor = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = room.game.players.some((p) => p.connected);
    if (!anyone && now - room.lastActive > ROOM_IDLE_MS) rooms.delete(code);
  }
}, 60 * 1000);

wss.on('close', () => {
  clearInterval(heartbeat);
  clearInterval(janitor);
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`UNKNOWN läuft auf Port ${PORT}`));
}

module.exports = { server, wss, rooms };
