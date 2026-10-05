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
  };
}

function log(g, event) {
  g.seq += 1;
  g.events.push({ seq: g.seq, ...event });
  if (g.events.length > 40) g.events.shift();
}

function playerIndex(g, id) {
  return g.players.findIndex((p) => p.id === id);
}

function newPlayer({ id, name, avatar }) {
  return {
    id,
    name,
    avatar,
    connected: true,
    secret: null,
    hand: [],
    related: [],
    notRelated: [],
    flipped: { related: false, notRelated: false },
    wrong: 0,
    out: false,
    clueGiven: false,
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
  }
  g.current = 0;
  g.pending = null;
  g.winner = null;
  g.events = [];
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
  }
  return { ok: true };
}

function finish(g, winnerId, reason) {
  g.phase = 'finished';
  g.pending = null;
  g.winner = winnerId;
  log(g, { type: 'end', winner: winnerId, reason });
}

/** Nächster Spieler am Zug; beendet das Spiel, wenn nur noch einer übrig ist. */
function endTurn(g) {
  const alive = g.players.filter((p) => !p.out);
  if (alive.length <= 1) {
    finish(g, alive.length === 1 ? alive[0].id : null, 'lastStanding');
    return;
  }
  const n = g.players.length;
  let i = g.current;
  do {
    i = (i + 1) % n;
  } while (g.players[i].out);
  g.current = i;
  log(g, { type: 'turn', player: g.players[i].id });
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
  endTurn(g);
  return { ok: true };
}

/** Statt eine Karte zu spielen: Charakter, Accessoire und Ort nennen. */
function guess(g, playerId, c, a, l) {
  const t = checkTurn(g, playerId);
  if (t.error) return t;
  if (![c, a, l].every((v) => Number.isInteger(v) && v >= 0 && v < N)) {
    return { error: 'Ungültige Auswahl.' };
  }
  if ((c + a) % N !== l) {
    return { error: 'Diese Kombination gibt es im Set nicht. Dein Tipp zählt nicht.' };
  }
  const p = g.players[t.idx];
  const s = decode(p.secret);
  const guessCard = c * N + a;

  if (s.c === c && s.a === a) {
    log(g, { type: 'guess', player: p.id, card: guessCard, ok: true });
    finish(g, p.id, 'solved');
    return { ok: true };
  }

  p.wrong += 1;
  log(g, { type: 'guess', player: p.id, card: guessCard, ok: false, wrong: p.wrong });

  if (p.wrong === 1) {
    g.pending = { type: 'flip', player: p.id };
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

/** Zurück in die Lobby für eine neue Partie. */
function rematch(g, playerId) {
  if (g.phase !== 'finished') return { error: 'Die Partie ist noch nicht vorbei.' };
  if (playerId !== g.hostId) return { error: 'Nur der Host kann eine neue Runde starten.' };
  g.players = g.players.filter((p) => p.connected);
  for (const p of g.players) Object.assign(p, newPlayer(p), { connected: p.connected });
  g.phase = 'lobby';
  g.deck = [];
  g.pending = null;
  g.winner = null;
  g.events = [];
  return { ok: true };
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
    players: g.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      connected: p.connected,
      out: p.out,
      wrong: p.wrong,
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
  decode,
  isCardId,
  cardsMatch,
  shuffle,
  createGame,
  addPlayer,
  setAvatar,
  startGame,
  giveClue,
  playCard,
  guess,
  flipPile,
  removePlayer,
  rematch,
  viewFor,
  allowedClues,
};
