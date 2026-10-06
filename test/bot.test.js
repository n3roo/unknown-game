'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const G = require('../lib/game');
const B = require('../lib/bot');

function seeded(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); }

function simulate(n, seed) {
  const rnd = seeded(seed);
  const g = G.createGame('p0');
  for (let i = 0; i < n; i++) G.addPlayer(g, { id: 'p' + i, name: 'Bot' + i, avatar: ['teufel', 'alien', 'geist', 'hase'][i] });
  G.startGame(g, 'p0', (max) => Math.floor(rnd() * max));
  let steps = 0;
  while (g.phase !== 'finished' && steps++ < 600) {
    let acted = false;
    for (const p of g.players) {
      const r = B.act(g, p.id, rnd);
      if (r) { assert.ok(!r.error, `Fehler im Bot-Zug: ${r.error}`); acted = true; break; }
    }
    assert.ok(acted, 'Spiel hängt: kein Bot kann handeln (Phase ' + g.phase + ')');
  }
  return { g, steps };
}

test('Bots spielen 2-, 3- und 4-Spieler-Partien bis zum Ende ohne Fehler', () => {
  const wins = [];
  for (let seed = 1; seed <= 60; seed++) {
    for (const n of [2, 3, 4]) {
      const { g, steps } = simulate(n, seed * 7 + n);
      assert.strictEqual(g.phase, 'finished');
      assert.ok(steps < 600);
      wins.push(g.events.filter((e) => e.type === 'turn').length);
    }
  }
  const avg = wins.reduce((a, b) => a + b, 0) / wins.length;
  console.log('Durchschnittliche Züge pro Partie:', avg.toFixed(1));
  assert.ok(avg < 60);
});

test('Bot kennt nur sichtbare Karten: Kandidaten enthalten immer die echte Geheimkarte', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const rnd = seeded(seed);
    const g = G.createGame('p0');
    for (let i = 0; i < 3; i++) G.addPlayer(g, { id: 'p' + i, name: 'B' + i, avatar: ['teufel', 'alien', 'geist'][i] });
    G.startGame(g, 'p0', (max) => Math.floor(rnd() * max));
    let guard = 0;
    while (g.phase !== 'finished' && guard++ < 300) {
      for (const p of g.players) {
        const v = G.viewFor(g, p.id);
        if (g.phase === 'playing') assert.ok(B.candidates(v).includes(p.secret), 'Geheimkarte darf nie ausgeschlossen werden');
      }
      let acted = false;
      for (const p of g.players) { if (B.act(g, p.id, rnd)) { acted = true; break; } }
      if (!acted) break;
    }
  }
});
