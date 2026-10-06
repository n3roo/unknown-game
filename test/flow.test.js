'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert');
const { client, server } = require('./helpers');
const { rooms, profiles } = require('../server');
const G = require('../lib/game');

after(() => { setTimeout(() => process.exit(0), 50).unref(); server.close(); });

const dec = (id) => ({ c: Math.floor(id / 7), a: id % 7, l: (Math.floor(id / 7) + (id % 7)) % 7 });

async function lobby(clients) {
  const [host, ...rest] = clients;
  host.send({ type: 'create' });
  const j = await host.next('joined');
  host.session = { code: j.code, token: j.token, playerId: j.playerId };
  for (const c of rest) {
    c.send({ type: 'join', code: j.code });
    const jj = await c.next('joined');
    c.session = { code: jj.code, token: jj.token, playerId: jj.playerId };
  }
  return j.code;
}

async function runClues(code, clients) {
  const room = rooms.get(code);
  for (let i = 0; i < room.game.players.length; i++) {
    const p = room.game.players[i];
    const c = clients.find((x) => x.session && x.session.playerId === p.id);
    const al = G.allowedClues(room.game, i);
    c.send({ type: 'clue', card: al[0] });
    await new Promise((r) => setTimeout(r, 60));
  }
  assert.strictEqual(room.game.phase, 'playing');
}

test('Gelegenheitspartie mit 2 Spielern bis zum Sieg, Gold wird verteilt', async () => {
  const a = await client('a1', { name: 'Anna', avatar: 'teufel', region: 'DE' });
  const b = await client('b2', { name: 'Ben', avatar: 'alien', region: 'AT' });
  const goldA = a.profile.gold; const goldB = b.profile.gold;
  const code = await lobby([a, b]);
  a.send({ type: 'start' });
  const st = await a.lastState();
  assert.strictEqual(st.state.phase, 'clues');
  assert.strictEqual(st.state.hand.length, 5);
  await runClues(code, [a, b]);
  const room = rooms.get(code);
  const cur = room.game.players[room.game.current];
  const winner = [a, b].find((c) => c.session.playerId === cur.id);
  const g = dec(cur.secret);
  winner.send({ type: 'guess', ...g });
  const fin = await winner.next('state', 4000, (m) => m.state.phase === 'finished');
  assert.strictEqual(fin.state.winner, cur.id);
  assert.ok(fin.rewards && fin.rewards.won && fin.rewards.gold >= 40, 'Sieger bekommt Gold');
  const loser = winner === a ? b : a;
  const fin2 = await loser.next('state', 4000, (m) => m.state.phase === 'finished');
  assert.ok(fin2.rewards && !fin2.rewards.won && fin2.rewards.gold >= 10, 'Verlierer bekommt Teilnahme-Gold');
  const prof = (await winner.next('profile', 4000)).profile;
  assert.ok(prof.gold > (winner === a ? goldA : goldB));
  a.close(); b.close();
});

test('Verbindung weg und wieder da: Platz und Karten bleiben', async () => {
  const a = await client('a3', { name: 'Cara', avatar: 'teufel' });
  const b = await client('b4', { name: 'Dirk', avatar: 'geist' });
  const code = await lobby([a, b]);
  a.send({ type: 'start' });
  await a.lastState();
  const handBefore = rooms.get(code).game.players.find((p) => p.id === a.session.playerId).hand.slice();
  a.close();
  await new Promise((r) => setTimeout(r, 150));
  assert.strictEqual(rooms.get(code).game.players.find((p) => p.id === a.session.playerId).connected, false);
  const a2 = await client('a3', {});
  a2.send({ type: 'rejoin', code, token: a.session.token });
  const st = await a2.next('state');
  assert.deepStrictEqual(st.state.hand, handBefore);
  assert.strictEqual(rooms.get(code).game.players.find((p) => p.id === a.session.playerId).connected, true);
  a2.close(); b.close();
});

test('Falscher Rejoin-Token wird abgelehnt', async () => {
  const a = await client('a5', {});
  a.send({ type: 'rejoin', code: 'ZZZZ', token: 'x' });
  await a.next('gone');
  a.close();
});

test('4 Spieler: alle bekommen 5 Karten, Reihenfolge läuft', async () => {
  const cs = [];
  for (const s of ['a6', 'b7', 'c8', 'd9']) cs.push(await client(s, { name: 'S' + s }));
  const code = await lobby(cs);
  cs[0].send({ type: 'start' });
  const room = rooms.get(code);
  await new Promise((r) => setTimeout(r, 200));
  assert.strictEqual(room.game.players.length, 4);
  for (const p of room.game.players) assert.strictEqual(p.hand.length, 5);
  await runClues(code, cs);
  const seen = new Set();
  for (let k = 0; k < 4; k++) {
    const cur = room.game.players[room.game.current];
    seen.add(cur.id);
    const c = cs.find((x) => x.session.playerId === cur.id);
    c.send({ type: 'play', card: cur.hand[0] });
    await new Promise((r) => setTimeout(r, 80));
  }
  assert.strictEqual(seen.size, 4, 'jeder war einmal dran');
  cs.forEach((c) => c.close());
});

test('Dasselbe Profil zweimal in einer Partie: kein Gold', async () => {
  const a = await client('a9', { name: 'Eva' });
  const a2 = await client('a9', { name: 'Eva' });
  const code = await lobby([a, a2]);
  a.send({ type: 'start' });
  await new Promise((r) => setTimeout(r, 150));
  await runClues(code, [a, a2]);
  const room = rooms.get(code);
  const cur = room.game.players[room.game.current];
  const c = [a, a2].find((x) => x.session.playerId === cur.id);
  const goldBefore = [...profiles.values()].find((p) => p.name === 'Eva').gold;
  c.send({ type: 'guess', ...dec(cur.secret) });
  await new Promise((r) => setTimeout(r, 300));
  assert.strictEqual(room.game.phase, 'finished');
  assert.strictEqual([...profiles.values()].find((p) => p.name === 'Eva').gold, goldBefore);
  a.close(); a2.close();
});

test('Ranked: zwei Spieler werden gepaart, Aufgeben kostet Punkte', { timeout: 30000 }, async () => {
  const a = await client('ca', { name: 'Rank1' });
  const b = await client('cb', { name: 'Rank2' });
  a.send({ type: 'rankedjoin' }); b.send({ type: 'rankedjoin' });
  const ja = await a.next('joined', 20000);
  await b.next('joined', 20000);
  const st = await a.next('state', 5000, (m) => m.ranked);
  assert.strictEqual(st.state.phase, 'clues');
  assert.strictEqual(st.ranked, true);
  profiles.get(a.profile.id).rating = 100; a.profile.rating = 100;
  const before = a.profile.rating;
  a.send({ type: 'leave' });
  const prof = await a.next('profile', 4000, (m) => m.profile.rating < before);
  assert.strictEqual(prof.profile.rating, before - 20);
  assert.ok(ja.code);
  a.close(); b.close();
});
