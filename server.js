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
const E = require('./lib/economy');
const { leagueOf } = require('./lib/rating');
const { Queue } = require('./lib/queue');
const { createStore } = require('./lib/store');

const PORT = Number(process.env.PORT) || 10000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const AVATARS = require('./public/data/avatars.json').map((a) => a.id);
const SETS = require('./public/data/sets.json').sets.map((s) => s.id);

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const store = createStore();
const profiles = new Map(); // geladene Profile (id -> Profil), Quelle der Wahrheit im Betrieb
const queue = new Queue();
const queueSockets = new Map(); // Profil-ID -> ws
const LEAVE_TIMEOUT_MS = 90 * 1000; // getrennte Ranked-Spieler gelten danach als ausgestiegen
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
  settleIfFinished(room);
  for (const [playerId, ws] of room.clients) {
    send(ws, {
      type: 'state',
      code: room.code,
      setId: room.setId,
      ranked: !!room.ranked,
      rewards: (room.rewards && room.rewards[playerId]) || null,
      state: G.viewFor(room.game, playerId),
    });
  }
}

/* ------------------------------------------------------------ Profile */

async function loadProfile(secret) {
  const id = E.profileIdFor(secret);
  let p = profiles.get(id);
  if (!p) {
    p = (await store.get(id)) || E.newProfile(id);
    // Beim Laden gleichzeitiger Verbindungen nicht doppelt anlegen
    p = profiles.get(id) || p;
    profiles.set(id, p);
  }
  E.rollDaily(p);
  return p;
}

const saveProfile = (p) => store.put(p).catch((err) => console.error('Profil speichern fehlgeschlagen:', err.message));

function sendProfile(ws) {
  if (ws.profile) send(ws, { type: 'profile', profile: E.selfView(ws.profile), store: store.kind });
}

/** Spielerdaten aus dem Profil in eine Partie übernehmen (Hut, Rating, Land). */
function syncPlayerFromProfile(room, profile) {
  const pl = room.game.players.find((q) => q.profileId === profile.id);
  if (!pl) return;
  pl.name = profile.name;
  pl.hat = profile.hat;
  pl.rating = room.ranked ? profile.rating : null;
  pl.region = profile.region;
}

/** Partie ist zu Ende: Gold, Erfahrung und (bei Ranked) Rating verteilen. Passiert pro Partie genau einmal. */
function settleIfFinished(room) {
  if (room.settled || room.game.phase !== 'finished') return;
  room.settled = true;
  const entries = room.game.players
    .map((p) => ({ id: p.id, profile: p.profileId ? profiles.get(p.profileId) : null }))
    .filter((e) => e.profile);
  room.rewards = E.settleGame({ entries, winnerId: room.game.winner, ranked: room.ranked });
  for (const e of entries) {
    saveProfile(e.profile);
    const ws = room.clients.get(e.id);
    if (ws && ws.profile === e.profile) sendProfile(ws);
  }
}

/** Spieler verlässt/verliert die Verbindung für immer, während eine Ranked-Partie läuft. */
function penalizeLeaver(room, playerId) {
  if (!room.ranked || room.settled) return;
  if (!['clues', 'playing'].includes(room.game.phase)) return;
  const pl = room.game.players.find((q) => q.id === playerId);
  const profile = pl && pl.profileId ? profiles.get(pl.profileId) : null;
  if (!profile || pl.out) return;
  E.applyLeave(profile);
  saveProfile(profile);
  for (const ws of wss.clients) if (ws.profile === profile) sendProfile(ws);
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
  if (p) { p.connected = true; p.disconnectedAt = null; }
  room.lastActive = Date.now();
}

function tokenFor(room, playerId) {
  for (const [token, id] of room.tokens) if (id === playerId) return token;
  return null;
}

function dropPlayer(room, playerId) {
  penalizeLeaver(room, playerId);
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
  const profile = ws.profile;
  if (!profile) return send(ws, { type: 'error', message: 'Profil wird noch geladen. Bitte gleich nochmal.' });
  let avatar = profile.avatar;
  // Schon vergeben? Dann bekommt der neue Spieler automatisch einen freien Avatar.
  if (room.game.players.some((p) => p.avatar === avatar)) {
    avatar = AVATARS.find((id) => !room.game.players.some((p) => p.avatar === id)) || avatar;
  }
  const playerId = randomId(4);
  const r = G.addPlayer(room.game, { id: playerId, name: profile.name, avatar, hat: profile.hat, rating: room.ranked ? profile.rating : null, region: profile.region });
  if (r.error) return send(ws, { type: 'error', message: r.error });
  room.game.players[room.game.players.length - 1].profileId = profile.id;
  if (!room.game.hostId || room.game.players.length === 1) room.game.hostId = playerId;
  const token = randomId(16);
  room.tokens.set(token, playerId);
  attach(room, playerId, ws);
  joinOk(room, playerId, ws);
}

/* -------------------------------------------------------- Ranked */

function runMatchmaking() {
  for (const group of queue.match()) {
    const socks = group.map((id) => queueSockets.get(id)).filter((w) => w && w.readyState === w.OPEN && !w.ctx);
    group.forEach((id) => queueSockets.delete(id));
    if (socks.length < 2) {
      // Jemand ist weg: die Übrigen wieder einreihen
      for (const w of socks) { queue.add(w.profile.id, w.profile.rating); queueSockets.set(w.profile.id, w); }
      continue;
    }
    const code = newRoomCode();
    const room = {
      code, game: G.createGame(null), setId: SETS[0], clients: new Map(), tokens: new Map(),
      lastActive: Date.now(), ranked: true, settled: false, rewards: null,
    };
    rooms.set(code, room);
    for (const w of socks) {
      // Jeder Avatar nur einmal: bei Doppelungen bekommt der Spätere einen freien
      const taken = room.game.players.map((p) => p.avatar);
      const keep = w.profile.avatar;
      const avatar = taken.includes(keep) ? AVATARS.find((a) => !taken.includes(a)) : keep;
      const playerId = randomId(4);
      G.addPlayer(room.game, { id: playerId, name: w.profile.name, avatar, hat: w.profile.hat, rating: w.profile.rating, region: w.profile.region });
      room.game.players[room.game.players.length - 1].profileId = w.profile.id;
      const token = randomId(16);
      room.tokens.set(token, playerId);
      attach(room, playerId, w);
      send(w, { type: 'queue', status: 'idle' });
      send(w, { type: 'joined', code, playerId, token });
    }
    room.game.hostId = room.game.players[0].id;
    G.startGame(room.game, room.game.hostId);
    broadcast(room);
  }
  for (const [id, w] of queueSockets) send(w, { type: 'queue', status: 'searching', size: queue.size, since: queue.entries.get(id)?.since });
}

/* ------------------------------------------------------- Nachrichten */

const handlers = {
  /** Geräteschlüssel -> Profil laden/anlegen. Jede Verbindung beginnt damit. */
  async hello(ws, msg) {
    const secret = String(msg.secret ?? '');
    if (!/^[0-9a-f]{32,64}$/.test(secret)) return send(ws, { type: 'error', message: 'Ungültiger Geräteschlüssel.' });
    ws.profile = await loadProfile(secret);
    if (msg.init && !ws.profile.initialized) {
      // Erster Start: Name, Avatar und Land aus der Startseite übernehmen
      E.updateSettings(ws.profile, msg.init, AVATARS);
      ws.profile.initialized = true;
      saveProfile(ws.profile);
    }
    sendProfile(ws);
  },

  /** Name, Avatar, Land ändern. */
  setprofile(ws, msg) {
    if (!ws.profile) return;
    E.updateSettings(ws.profile, msg, AVATARS);
    saveProfile(ws.profile);
    sendProfile(ws);
    if (ws.ctx && ws.ctx.room.game.phase === 'lobby') {
      const { room } = ws.ctx;
      const pl = room.game.players.find((q) => q.profileId === ws.profile.id);
      if (pl && msg.avatar !== undefined && ws.profile.avatar !== pl.avatar) {
        const r = G.setAvatar(room.game, pl.id, ws.profile.avatar);
        if (r.error) ws.profile.avatar = pl.avatar; // vergeben: Avatar behalten
      }
      syncPlayerFromProfile(room, ws.profile);
      broadcast(room);
    }
  },

  buy(ws, msg) {
    if (!ws.profile) return;
    const r = E.buyHat(ws.profile, String(msg.hat ?? ''));
    if (r.error) return send(ws, { type: 'error', message: r.error });
    saveProfile(ws.profile);
    sendProfile(ws);
  },

  equip(ws, msg) {
    if (!ws.profile) return;
    const r = E.equipHat(ws.profile, msg.hat === null || msg.hat === undefined ? null : String(msg.hat));
    if (r.error) return send(ws, { type: 'error', message: r.error });
    saveProfile(ws.profile);
    sendProfile(ws);
    if (ws.ctx && ws.ctx.room.game.phase === 'lobby') {
      syncPlayerFromProfile(ws.ctx.room, ws.profile);
      broadcast(ws.ctx.room);
    }
  },

  async leaderboard(ws, msg) {
    const p = ws.profile;
    const region = msg.scope === 'region' && p ? p.region : null;
    const rows = await store.top({ region, limit: 50 });
    const me = p ? await store.rankOf(p, { region }) : null;
    send(ws, {
      type: 'leaderboard',
      scope: region ? 'region' : 'world',
      region,
      rows: rows.map((r, i) => ({ rank: i + 1, ...E.publicView(r), you: !!p && r.id === p.id })),
      you: p && me ? { rank: me, rating: p.rating } : null,
    });
  },

  rankedjoin(ws) {
    if (!ws.profile) return send(ws, { type: 'error', message: 'Profil wird noch geladen.' });
    if (ws.ctx) return send(ws, { type: 'error', message: 'Du bist schon in einer Partie.' });
    const p = ws.profile;
    queue.add(p.id, p.rating);
    queueSockets.set(p.id, ws);
    send(ws, { type: 'queue', status: 'searching', size: queue.size });
    runMatchmaking();
  },

  rankedleave(ws) {
    if (!ws.profile) return;
    queue.remove(ws.profile.id);
    if (queueSockets.get(ws.profile.id) === ws) queueSockets.delete(ws.profile.id);
    send(ws, { type: 'queue', status: 'idle' });
  },

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
    const r = G.setAvatar(room.game, playerId, msg.avatar);
    if (!r.error && ws.profile) {
      ws.profile.avatar = msg.avatar;
      saveProfile(ws.profile);
      sendProfile(ws);
    }
    act(ws, room, r);
  },

  set(ws, msg, room, playerId) {
    if (room.game.phase !== 'lobby') return send(ws, { type: 'error', message: 'Das Set lässt sich nur in der Lobby ändern.' });
    if (playerId !== room.game.hostId) return send(ws, { type: 'error', message: 'Nur der Host wählt das Set.' });
    if (!SETS.includes(msg.setId)) return send(ws, { type: 'error', message: 'Unbekanntes Set.' });
    room.setId = msg.setId;
    broadcast(room);
  },

  kick(ws, msg, room, playerId) {
    if (room.ranked) return send(ws, { type: 'error', message: 'In Ranked-Partien kann niemand entfernt werden.' });
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
    if (room.ranked) return send(ws, { type: 'error', message: 'Ranked-Partien haben keine Revanche. Starte eine neue Suche.' });
    room.settled = false;
    room.rewards = null;
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

  // Nachrichten einer Verbindung laufen nacheinander (hello muss vor rejoin fertig sein).
  ws.chain = (ws.chain || Promise.resolve()).then(async () => {
    try {
      if (NEEDS_ROOM.has(msg.type)) {
        if (!ws.ctx) return send(ws, { type: 'error', message: 'Du bist in keiner Lobby.' });
        const { room, playerId } = ws.ctx;
        room.lastActive = Date.now();
        await handler(ws, msg, room, playerId);
      } else {
        await handler(ws, msg);
      }
    } catch (err) {
      console.error('Fehler bei Nachricht', msg.type, err);
      send(ws, { type: 'error', message: 'Interner Fehler.' });
    }
  });
}

function onClose(ws) {
  if (ws.profile) {
    queue.remove(ws.profile.id);
    if (queueSockets.get(ws.profile.id) === ws) queueSockets.delete(ws.profile.id);
  }
  if (!ws.ctx) return;
  const { room, playerId } = ws.ctx;
  if (room.clients.get(playerId) !== ws) return;
  room.clients.delete(playerId);
  const p = room.game.players.find((q) => q.id === playerId);
  if (p) { p.connected = false; p.disconnectedAt = Date.now(); }
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

const matchTick = setInterval(() => { if (queue.size) runMatchmaking(); }, 2000);
const janitor = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.ranked || room.settled) continue;
    for (const p of [...room.game.players]) {
      if (!p.connected && p.disconnectedAt && now - p.disconnectedAt > LEAVE_TIMEOUT_MS) {
        dropPlayer(room, p.id);
        if (rooms.has(room.code)) broadcast(room);
      }
    }
  }
  for (const [code, room] of rooms) {
    const anyone = room.game.players.some((p) => p.connected);
    if (!anyone && now - room.lastActive > ROOM_IDLE_MS) rooms.delete(code);
  }
}, 10 * 1000);

wss.on('close', () => {
  clearInterval(heartbeat);
  clearInterval(janitor);
  clearInterval(matchTick);
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`UNKNOWN läuft auf Port ${PORT}`));
}

module.exports = { server, wss, rooms, store, profiles, queue };
