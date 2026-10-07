'use strict';
/*
 * UNKNOWN – reine Spiellogik (kein Netzwerk, kein DOM).
 *
 * Karten: 7 Charaktere x 7 Accessoires = 49 Karten.
 * Der Ort ergibt sich aus (Charakter + Accessoire) mod 7. Dadurch kommt jedes
 * Paar von Merkmalen auf genau einer Karte vor (lateinisches Quadrat), und
 * zwei verschiedene Karten teilen höchstens ein Merkmal.
 *
 * Eine Karte wird nur als Zahl (id = charakter * 7 + accessoire) gespeichert.
 */
const crypto = require('node:crypto');

const N = 7;
const HAND_SIZE = 5;
const MAX_WRONG = 3;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const CARD_COUNT = N * N;

// Chaos-Modus: jeder Spieler bekommt zu Beginn eine geheime Spezialaktion (einmal pro Partie).
const CHAOS_HAND = 2;
const POWERS = ['oracle', 'steal', 'block', 'double', 'shield'];
const TURN_MS = 25000; // Blitz: so lange hat ein Spieler pro Zug

function decode(id) {
  const c = Math.floor(id / N);
  const a = id % N;
  return { c, a, l: (c + a) % N };
}

function isCardId(id) {
  return Number.isInteger(id) && id >= 0 && id < CARD_COUNT;
}

/** Haben zwei Karten mindestens ein gemeinsames Merkmal? */
function cardsMatch(idA, idB) {
  const x = decode(idA);
  const y = decode(idB);
  return x.c === y.c || x.a === y.a || x.l === y.l;
}

function defaultRandom(max) {
  return crypto.randomInt(max);
}

function shuffle(array, rnd = defaultRandom) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createGame(hostId) {
  return {
    phase: 'lobby', // lobby | clues | playing | finished
    hostId,
    players: [],
    deck: [],
    current: 0,
    pending: null, // { type: 'flip', player: id }
    winner: null,
    events: [],
    seq: 0,
    mode: 'classic', // classic | chaos
    blitz: false, // Zugzeit begrenzen
    turnEndsAt: null,
    rematchVotes: [],
  };
}

function log(g, event) {
  g.seq += 1;
  g.events.push({ seq: g.seq, ...event });
  if (g.events.length > 40) g.events.shift();
}

/** Blitz: Zugzeit neu starten (nur während der Spielphase). */
function armTimer(g) {
  g.turnEndsAt = g.blitz && g.phase === 'playing' ? Date.now() + TURN_MS : null;
}

function playerIndex(g, id) {
  return g.players.findIndex((p) => p.id === id);
}

function newPlayer({ id, name, avatar, hat = null, rating = null, region = null }) {
  return {
    id,
    name,
    avatar,
    hat,
    rating,
    region,
    connected: true,
    secret: null,
    hand: [],
    related: [],
    notRelated: [],
    flipped: { related: false, notRelated: false },
    wrong: 0,
    out: false,
    clueGiven: false,
    chaos: [], // Chaos-Modus: zweite Hand aus Chaoskarten (oracle | steal | block | double | shield)
    bonus: 0, // Doppelzug: so viele normale Karten darf ich noch ausspielen
    shield: false, // nächster falscher Tipp zählt nicht
    skip: false, // Sperre: nächster Zug wird übersprungen
    oracle: null, // { kind: 'c'|'a'|'l', value } – nur für den Besitzer sichtbar
  };
}

function addPlayer(g, info) {
  if (g.phase !== 'lobby') return { error: 'Das Spiel läuft schon.' };
  if (g.players.length >= MAX_PLAYERS) return { error: 'Die Lobby ist voll (max. 4 Spieler).' };
  if (g.players.some((p) => p.avatar === info.avatar)) return { error: 'Dieser Avatar ist schon vergeben.' };
  g.players.push(newPlayer(info));
  return { ok: true };
}

function setAvatar(g, playerId, avatar) {
  if (g.phase !== 'lobby') return { error: 'Der Avatar lässt sich nur in der Lobby ändern.' };
  const p = g.players[playerIndex(g, playerId)];
  if (!p) return { error: 'Spieler nicht gefunden.' };
  if (g.players.some((q) => q.id !== playerId && q.avatar === avatar)) {
    return { error: 'Dieser Avatar ist schon vergeben.' };
  }
  p.avatar = avatar;
  return { ok: true };
}

/** Host wählt in der Lobby Modus (classic | chaos) und Blitz. */
function setMode(g, playerId, mode, blitz) {
  if (g.phase !== 'lobby') return { error: 'Der Modus lässt sich nur in der Lobby ändern.' };
  if (playerId !== g.hostId) return { error: 'Nur der Host wählt den Modus.' };
  if (mode !== 'classic' && mode !== 'chaos') return { error: 'Unbekannter Modus.' };
  g.mode = mode;
  g.blitz = !!blitz;
  return { ok: true };
}

function drawUp(g, p) {
  while (p.hand.length < HAND_SIZE && g.deck.length > 0) p.hand.push(g.deck.pop());
}

function startGame(g, playerId, rnd = defaultRandom) {
  if (g.phase !== 'lobby') return { error: 'Das Spiel läuft schon.' };
  if (playerId !== g.hostId) return { error: 'Nur der Host kann das Spiel starten.' };
  if (g.players.length < MIN_PLAYERS) return { error: 'Es braucht mindestens 2 Spieler.' };

  g.deck = shuffle(Array.from({ length: CARD_COUNT }, (_, i) => i), rnd);
  for (const p of g.players) {
    Object.assign(p, newPlayer(p), { connected: p.connected });
    p.secret = g.deck.pop();
    for (let i = 0; i < HAND_SIZE; i++) p.hand.push(g.deck.pop());
    if (g.mode === 'chaos') {
      const pool = POWERS.slice();
      for (let k = 0; k < CHAOS_HAND; k++) p.chaos.push(pool.splice(rnd(pool.length), 1)[0]);
    }
  }
  g.current = 0;
  g.pending = null;
  g.winner = null;
  g.events = [];
  g.turnEndsAt = null;
  g.rematchVotes = [];
  g.phase = 'clues';
  log(g, { type: 'start' });
  return { ok: true };
}

/** Karten, die `giverIdx` seinem linken Nachbarn geben darf. */
function allowedClues(g, giverIdx) {
  const giver = g.players[giverIdx];
  const receiver = g.players[(giverIdx + 1) % g.players.length];
  const matching = giver.hand.filter((id) => cardsMatch(id, receiver.secret));
  return matching.length > 0 ? matching : giver.hand.slice();
}

/** Startphase: jeder gibt dem nächsten Spieler eine erste Hinweiskarte. */
function giveClue(g, playerId, cardId) {
  if (g.phase !== 'clues') return { error: 'Gerade ist keine Hinweisrunde.' };
  const idx = playerIndex(g, playerId);
  if (idx < 0) return { error: 'Spieler nicht gefunden.' };
  const giver = g.players[idx];
  if (giver.clueGiven) return { error: 'Du hast deinen Hinweis schon gegeben.' };
  if (!giver.hand.includes(cardId)) return { error: 'Diese Karte hast du nicht auf der Hand.' };

  const allowed = allowedClues(g, idx);
  if (!allowed.includes(cardId)) {
    return { error: 'Du musst eine Karte geben, die ein Merkmal mit dem Verdächtigen teilt.' };
  }
  const receiver = g.players[(idx + 1) % g.players.length];
  const related = cardsMatch(cardId, receiver.secret);
  (related ? receiver.related : receiver.notRelated).push(cardId);
  giver.hand.splice(giver.hand.indexOf(cardId), 1);
  drawUp(g, giver);
  giver.clueGiven = true;
  log(g, { type: 'clue', from: giver.id, to: receiver.id, card: cardId, related });

  if (g.players.every((p) => p.clueGiven)) {
    g.phase = 'playing';
    g.current = 0;
    log(g, { type: 'turn', player: g.players[0].id });
    armTimer(g);
  }
  return { ok: true };
}

function finish(g, winnerId, reason) {
  g.phase = 'finished';
  g.pending = null;
  g.winner = winnerId;
  g.turnEndsAt = null;
  g.rematchVotes = [];
  log(g, { type: 'end', winner: winnerId, reason });
}

/**
 * Nächster Spieler am Zug; beendet das Spiel, wenn nur noch einer übrig ist.
 * Doppelzug: wer ihn aktiviert hat, ist direkt nochmal dran. Gesperrte Spieler werden einmal übersprungen.
 */
function endTurn(g) {
  const alive = g.players.filter((p) => !p.out);
  if (alive.length <= 1) {
    finish(g, alive.length === 1 ? alive[0].id : null, 'lastStanding');
    return;
  }
  const cur = g.players[g.current];
  if (cur) cur.bonus = 0;
  const n = g.players.length;
  let i = g.current;
  // Höchstens zwei Runden: in der ersten werden Sperren verbraucht, in der zweiten wird jemand gewählt.
  for (let guard = 0; guard < n * 2 + 2; guard++) {
    i = (i + 1) % n;
    const q = g.players[i];
    if (q.out) continue;
    if (q.skip) {
      q.skip = false;
      log(g, { type: 'skip', player: q.id });
      continue;
    }
    break;
  }
  g.current = i;
  log(g, { type: 'turn', player: g.players[i].id });
  armTimer(g);
}

function checkTurn(g, playerId) {
  if (g.phase !== 'playing') return { error: 'Das Spiel läuft gerade nicht.' };
  if (g.pending) return { error: 'Erst muss der Stapel umgedreht werden.' };
  const idx = playerIndex(g, playerId);
  if (idx < 0) return { error: 'Spieler nicht gefunden.' };
  if (idx !== g.current) return { error: 'Du bist nicht am Zug.' };
  if (g.players[idx].out) return { error: 'Du bist ausgeschieden.' };
  return { idx };
}

/** Eine Handkarte offen ausspielen. Der Server beantwortet Ja/Nein selbst. */
function playCard(g, playerId, cardId) {
  const t = checkTurn(g, playerId);
  if (t.error) return t;
  const p = g.players[t.idx];
  if (!p.hand.includes(cardId)) return { error: 'Diese Karte hast du nicht auf der Hand.' };

  const related = cardsMatch(cardId, p.secret);
  (related ? p.related : p.notRelated).push(cardId);
  p.hand.splice(p.hand.indexOf(cardId), 1);
  drawUp(g, p);
  log(g, { type: 'play', player: p.id, card: cardId, related });
  spendPlay(g, p);
  return { ok: true };
}

/** Ein „Spielzug“ ist verbraucht. Nach einem Doppelzug bleiben noch Karten übrig, sonst ist der nächste dran. */
function spendPlay(g, p) {
  if (p.bonus > 0) {
    p.bonus -= 1;
    if (p.bonus > 0) { armTimer(g); return; }
  }
  endTurn(g);
}

/**
 * Statt eine Karte zu spielen: Charakter, Accessoire und Ort nennen.
 * Es müssen alle drei Merkmale stimmen. Auch eine Kombination, die es als Karte
 * gar nicht gibt, ist einfach ein falscher Tipp.
 */
function guess(g, playerId, c, a, l) {
  const t = checkTurn(g, playerId);
  if (t.error) return t;
  if (![c, a, l].every((v) => Number.isInteger(v) && v >= 0 && v < N)) {
    return { error: 'Bitte wähle Charakter, Accessoire und Ort.' };
  }
  const p = g.players[t.idx];
  p.bonus = 0;
  const s = decode(p.secret);
  const ok = s.c === c && s.a === a && s.l === l;

  if (ok) {
    log(g, { type: 'guess', player: p.id, guess: { c, a, l }, ok: true });
    finish(g, p.id, 'solved');
    return { ok: true };
  }

  if (p.shield) {
    // Schutzschild: dieser Fehler kostet nichts, der Zug ist trotzdem vorbei.
    p.shield = false;
    log(g, { type: 'guess', player: p.id, guess: { c, a, l }, ok: false, shielded: true, wrong: p.wrong });
    endTurn(g);
    return { ok: true };
  }

  p.wrong += 1;
  log(g, { type: 'guess', player: p.id, guess: { c, a, l }, ok: false, wrong: p.wrong });

  if (p.wrong === 1) {
    g.pending = { type: 'flip', player: p.id };
    armTimer(g);
    return { ok: true }; // Zug endet nach der Stapelwahl
  }
  if (p.wrong === 2) {
    const left = p.flipped.related ? 'notRelated' : 'related';
    p.flipped[left] = true;
    log(g, { type: 'flip', player: p.id, pile: left, auto: true });
  } else {
    p.out = true;
    log(g, { type: 'out', player: p.id });
  }
  endTurn(g);
  return { ok: true };
}

/** Nach dem ersten falschen Tipp: einen eigenen Hinweisstapel umdrehen. */
function flipPile(g, playerId, pile) {
  if (!g.pending || g.pending.type !== 'flip') return { error: 'Gerade muss kein Stapel umgedreht werden.' };
  if (g.pending.player !== playerId) return { error: 'Du bist nicht dran.' };
  if (pile !== 'related' && pile !== 'notRelated') return { error: 'Ungültiger Stapel.' };
  const p = g.players[playerIndex(g, playerId)];
  if (p.flipped[pile]) return { error: 'Dieser Stapel ist schon umgedreht.' };
  p.flipped[pile] = true;
  g.pending = null;
  log(g, { type: 'flip', player: p.id, pile, auto: false });
  endTurn(g);
  return { ok: true };
}

/** Spieler entfernen: in der Lobby ganz, im Spiel scheidet er aus. */
function removePlayer(g, playerId) {
  const idx = playerIndex(g, playerId);
  if (idx < 0) return { error: 'Spieler nicht gefunden.' };

  if (g.phase === 'lobby' || g.phase === 'finished') {
    g.players.splice(idx, 1);
  } else {
    const p = g.players[idx];
    p.out = true;
    p.connected = false;
    log(g, { type: 'out', player: p.id, left: true });
    if (g.pending && g.pending.player === p.id) g.pending = null;
    if (g.phase === 'clues') {
      p.clueGiven = true;
      if (g.players.every((q) => q.clueGiven || q.out)) {
        g.phase = 'playing';
        g.current = g.players.findIndex((q) => !q.out);
        armTimer(g);
      }
      const alive = g.players.filter((q) => !q.out);
      if (alive.length <= 1) finish(g, alive.length === 1 ? alive[0].id : null, 'lastStanding');
    } else if (g.phase === 'playing') {
      if (idx === g.current) endTurn(g);
      else {
        const alive = g.players.filter((q) => !q.out);
        if (alive.length <= 1) finish(g, alive.length === 1 ? alive[0].id : null, 'lastStanding');
      }
    }
  }
  if (g.hostId === playerId) {
    const next = g.players.find((q) => q.connected && !q.out) || g.players[0];
    if (next) g.hostId = next.id;
  }
  return { ok: true };
}

/** Zurück in die Lobby für eine neue Partie. Modus und Blitz bleiben erhalten. */
function rematch(g, playerId) {
  if (g.phase !== 'finished') return { error: 'Die Partie ist noch nicht vorbei.' };
  if (playerId !== g.hostId) return { error: 'Nur der Host kann eine neue Runde starten.' };
  g.players = g.players.filter((p) => p.connected);
  for (const p of g.players) Object.assign(p, newPlayer(p), { connected: p.connected });
  if (!g.players.some((p) => p.id === g.hostId) && g.players[0]) g.hostId = g.players[0].id;
  g.phase = 'lobby';
  g.deck = [];
  g.pending = null;
  g.winner = null;
  g.events = [];
  g.turnEndsAt = null;
  g.rematchVotes = [];
  return { ok: true };
}

/**
 * Revanche-Wunsch: jeder Spieler kann „Nochmal“ drücken. Sobald alle verbundenen Menschen zugestimmt haben,
 * ist `ready` wahr und der Server startet die nächste Runde.
 */
function rematchVote(g, playerId) {
  if (g.phase !== 'finished') return { error: 'Die Partie ist noch nicht vorbei.' };
  if (playerIndex(g, playerId) < 0) return { error: 'Spieler nicht gefunden.' };
  if (!g.rematchVotes) g.rematchVotes = [];
  if (!g.rematchVotes.includes(playerId)) g.rematchVotes.push(playerId);
  const humans = g.players.filter((q) => q.connected && !q.bot);
  const ready = humans.length > 0 && humans.every((q) => g.rematchVotes.includes(q.id));
  return { ok: true, ready };
}

/**
 * Chaos-Modus: eine Chaoskarte aus der zweiten Hand spielen. Sie ersetzt die normale Karte im Zug
 * (der Zug ist danach vorbei), nur der Doppelzug schenkt zwei normale Karten.
 */
function useAction(g, playerId, kind, targetId, rnd = defaultRandom) {
  if (g.mode !== 'chaos') return { error: 'Chaoskarten gibt es nur im Chaos-Modus.' };
  const t = checkTurn(g, playerId);
  if (t.error) return t;
  const p = g.players[t.idx];
  if (!p.chaos.includes(kind)) return { error: 'Diese Chaoskarte hast du nicht.' };

  let target = null;
  if (kind === 'steal' || kind === 'block') {
    target = g.players.find((q) => q.id === targetId);
    if (!target || target.id === p.id || target.out) return { error: 'Wähle einen Mitspieler als Ziel.' };
    if (kind === 'steal' && target.hand.length === 0) return { error: 'Dieser Spieler hat keine Karten.' };
  }

  let stolen = null;
  let related = null;
  switch (kind) {
    case 'oracle': {
      const k = ['c', 'a', 'l'][rnd(3)];
      p.oracle = { kind: k, value: decode(p.secret)[k] };
      break;
    }
    case 'steal': {
      // Die geklaute Karte wird sofort offen auf meine Stapel gelegt.
      stolen = target.hand.splice(rnd(target.hand.length), 1)[0];
      drawUp(g, target);
      related = cardsMatch(stolen, p.secret);
      (related ? p.related : p.notRelated).push(stolen);
      break;
    }
    case 'block':
      target.skip = true;
      break;
    case 'double':
      break;
    case 'shield':
      p.shield = true;
      break;
    default:
      return { error: 'Unbekannte Chaoskarte.' };
  }
  p.chaos.splice(p.chaos.indexOf(kind), 1);
  log(g, { type: 'power', kind, player: p.id, target: target ? target.id : null, card: stolen, related });
  if (kind === 'double') {
    p.bonus = 2; // der Zug bleibt bei mir, ich spiele jetzt zwei normale Karten
    armTimer(g);
  } else spendPlay(g, p);
  return { ok: true };
}

/**
 * Blitz: läuft die Zugzeit eines Menschen ab, wird für ihn gespielt (zufällige Handkarte bzw. Stapel).
 * Gibt true zurück, wenn sich der Zustand geändert hat.
 */
function tick(g, now = Date.now(), rnd = defaultRandom) {
  if (!g.blitz || g.phase !== 'playing' || !g.turnEndsAt || now < g.turnEndsAt) return false;
  const actorId = g.pending ? g.pending.player : g.players[g.current].id;
  const p = g.players[playerIndex(g, actorId)];
  if (!p || p.bot || p.out) {
    armTimer(g);
    return false;
  }
  log(g, { type: 'timeout', player: p.id });
  let r;
  if (g.pending) {
    const open = ['related', 'notRelated'].filter((k) => !p.flipped[k]);
    r = flipPile(g, p.id, open[rnd(open.length)]);
  } else if (p.hand.length) {
    r = playCard(g, p.id, p.hand[rnd(p.hand.length)]);
  } else {
    r = guess(g, p.id, rnd(N), rnd(N), rnd(N));
  }
  if (r && r.error) armTimer(g); // Notbremse, damit nichts im Kreis läuft
  return true;
}

/**
 * Sicht eines einzelnen Spielers auf das Spiel.
 * Die eigene Geheimkarte und fremde Handkarten werden nie verschickt.
 */
function viewFor(g, playerId) {
  const me = playerIndex(g, playerId);
  const revealAll = g.phase === 'finished';
  const view = {
    phase: g.phase,
    hostId: g.hostId,
    you: me,
    youId: playerId,
    current: g.current,
    deckCount: g.deck.length,
    winner: g.winner,
    pending: g.pending,
    events: g.events.slice(-12),
    mode: g.mode || 'classic',
    blitz: !!g.blitz,
    // Restzeit statt Zeitstempel, damit Uhren der Geräte keine Rolle spielen
    turnMs: g.turnEndsAt ? Math.max(0, g.turnEndsAt - Date.now()) : null,
    rematchVotes: g.phase === 'finished' ? (g.rematchVotes || []).slice() : [],
    power: me >= 0 && g.mode === 'chaos'
      ? { cards: g.players[me].chaos.slice(), shield: g.players[me].shield, bonus: g.players[me].bonus, oracle: g.players[me].oracle }
      : null,
    players: g.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      hat: p.hat || null,
      rating: p.rating,
      region: p.region,
      connected: p.connected,
      bot: !!p.bot,
      out: p.out,
      wrong: p.wrong,
      skip: !!p.skip,
      powerReady: g.mode === 'chaos' && p.chaos.length > 0,
      chaosCount: g.mode === 'chaos' ? p.chaos.length : 0,
      clueGiven: p.clueGiven,
      handCount: p.hand.length,
      secret: i === me && !revealAll ? null : p.secret,
      related: p.flipped.related ? null : p.related,
      notRelated: p.flipped.notRelated ? null : p.notRelated,
      relatedCount: p.related.length,
      notRelatedCount: p.notRelated.length,
      flipped: p.flipped,
    })),
    hand: me >= 0 ? g.players[me].hand : [],
    clue: null,
  };
  if (g.phase === 'clues' && me >= 0 && !g.players[me].clueGiven && !g.players[me].out) {
    view.clue = {
      target: (me + 1) % g.players.length,
      allowed: allowedClues(g, me),
    };
  }
  return view;
}

module.exports = {
  N,
  HAND_SIZE,
  MAX_WRONG,
  MIN_PLAYERS,
  MAX_PLAYERS,
  CARD_COUNT,
  POWERS,
  TURN_MS,
  decode,
  isCardId,
  cardsMatch,
  shuffle,
  createGame,
  addPlayer,
  setAvatar,
  setMode,
  startGame,
  useAction,
  tick,
  rematchVote,
  giveClue,
  playCard,
  guess,
  flipPile,
  removePlayer,
  rematch,
  viewFor,
  allowedClues,
};
