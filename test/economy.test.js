'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/economy');
const R = require('../lib/rating');
const { Queue } = require('../lib/queue');

const mk = (id, rating = 1000) => { const p = E.newProfile(id); p.rating = rating; return p; };

test('Profil-ID ist stabil und verrät den Schlüssel nicht', () => {
  const id = E.profileIdFor('abc');
  assert.equal(id, E.profileIdFor('abc'));
  assert.notEqual(id, E.profileIdFor('abd'));
  assert.ok(!id.includes('abc'));
});

test('Rating: Sieger gewinnt, Verlierer verliert, bei gleichem Rating gleich viel (2 Spieler)', () => {
  const d = R.ratingDeltas([{ id: 'a', rating: 1000, played: 20 }, { id: 'b', rating: 1000, played: 20 }], 'a');
  assert.equal(d.a, 14);
  assert.equal(d.b, -14);
});

test('Rating: Außenseiter-Sieg bringt mehr als Favoriten-Sieg', () => {
  const up = R.ratingDeltas([{ id: 'a', rating: 900, played: 20 }, { id: 'b', rating: 1300, played: 20 }], 'a').a;
  const fav = R.ratingDeltas([{ id: 'a', rating: 1300, played: 20 }, { id: 'b', rating: 900, played: 20 }], 'a').a;
  assert.ok(up > fav);
});

test('Rating: ohne Sieger keine Änderung', () => {
  const d = R.ratingDeltas([{ id: 'a', rating: 1000 }, { id: 'b', rating: 1000 }], null);
  assert.deepEqual(d, { a: 0, b: 0 });
});

test('Ligen', () => {
  assert.equal(R.leagueOf(0).id, 'bronze');
  assert.equal(R.leagueOf(1099).id, 'bronze');
  assert.equal(R.leagueOf(1100).id, 'silber');
  assert.equal(R.leagueOf(2500).id, 'meister');
});

test('Freie Partie: Gold für Sieger und Teilnehmer, Tagesbonus nur einmal', () => {
  const a = mk('a'); const b = mk('b');
  const g0 = a.gold;
  let r = E.settleGame({ entries: [{ id: 'x', profile: a }, { id: 'y', profile: b }], winnerId: 'x', ranked: false });
  assert.equal(r.x.gold, E.GOLD.casualWin + E.GOLD.firstWinOfDay);
  assert.equal(r.y.gold, E.GOLD.casualPlay);
  assert.equal(a.gold, g0 + r.x.gold);
  r = E.settleGame({ entries: [{ id: 'x', profile: a }, { id: 'y', profile: b }], winnerId: 'x', ranked: false });
  assert.equal(r.x.gold, E.GOLD.casualWin); // kein zweiter Tagesbonus
});

test('Freie Partie: Tageslimit stoppt Gold-Farming', () => {
  const a = mk('a'); const b = mk('b');
  for (let i = 0; i < E.CASUAL_REWARDED_PER_DAY; i++) E.settleGame({ entries: [{ id: 'x', profile: a }, { id: 'y', profile: b }], winnerId: 'x', ranked: false });
  const gold = a.gold;
  const r = E.settleGame({ entries: [{ id: 'x', profile: a }, { id: 'y', profile: b }], winnerId: 'x', ranked: false });
  assert.equal(r.x.gold, 0);
  assert.equal(r.x.capped, true);
  assert.equal(a.gold, gold);
});

test('Allein gespielt: kein Gold', () => {
  const a = mk('a');
  const r = E.settleGame({ entries: [{ id: 'x', profile: a }], winnerId: 'x', ranked: false });
  assert.equal(r.x.gold, 0);
});

test('Ranked: Rating und Gold, Liga-Aufstieg bringt Belohnung und Hut einmalig', () => {
  const a = mk('a', 1095); const b = mk('b', 1095);
  a.rankedPlayed = 20; b.rankedPlayed = 20;
  const r = E.settleGame({ entries: [{ id: 'x', profile: a }, { id: 'y', profile: b }], winnerId: 'x', ranked: true });
  assert.equal(r.x.leagueUp, 'silber');
  assert.ok(a.hats.includes('liga_silber'));
  assert.ok(r.x.ratingDelta > 0 && r.y.ratingDelta < 0);
  assert.equal(r.x.gold, E.GOLD.rankedWin + E.GOLD.firstWinOfDay + 150);
  // nochmal runter und wieder rauf: keine zweite Belohnung
  a.rating = 1090;
  const gold = a.gold;
  const info = E.applyRating(a, 20);
  assert.equal(info.bonusGold, 0);
  assert.equal(a.gold, gold);
});

test('Hüte kaufen und anziehen', () => {
  const p = mk('a');
  assert.match(E.buyHat(p, 'krone').error, /fehlen/);
  assert.ok(E.buyHat(p, 'basecap').ok);
  assert.equal(p.gold, E.START_GOLD - 100);
  assert.match(E.buyHat(p, 'basecap').error, /schon/);
  assert.match(E.buyHat(p, 'liga_gold').error, /Belohnung/);
  assert.match(E.buyHat(p, 'gibtsnicht').error, /nicht/);
  assert.match(E.equipHat(p, 'cowboy').error, /nicht/);
  assert.ok(E.equipHat(p, 'basecap').ok);
  assert.equal(p.hat, 'basecap');
  E.equipHat(p, null);
  assert.equal(p.hat, null);
});

test('Einstellungen werden bereinigt', () => {
  const p = mk('a');
  E.updateSettings(p, { name: '  <b>Mia</b>  ', avatar: 'nix', region: 'XX' }, ['weiss', 'hase']);
  assert.equal(p.name, 'bMia/b');
  assert.equal(p.avatar, 'weiss');
  assert.equal(p.region, 'DE');
  E.updateSettings(p, { avatar: 'hase', region: 'AT' }, ['weiss', 'hase']);
  assert.equal(p.avatar, 'hase');
  assert.equal(p.region, 'AT');
});

test('Verlassen kostet Rating', () => {
  const p = mk('a', 1050);
  const r = E.applyLeave(p);
  assert.equal(r.ratingDelta, -20);
  assert.equal(p.rankedPlayed, 1);
});

test('Warteschlange: 4 ähnliche Spieler sofort, 2 erst nach Wartezeit, Rating-Fenster wächst', () => {
  const q = new Queue();
  q.add('a', 1000, 0); q.add('b', 1050, 0); q.add('c', 1100, 0); q.add('d', 1020, 0);
  const g = q.match(0);
  assert.equal(g.length, 1);
  assert.equal(g[0].length, 4);

  q.add('a', 1000, 0); q.add('b', 1050, 0);
  assert.deepEqual(q.match(1000), []); // zu früh
  assert.equal(q.match(13000).length, 1);

  q.add('x', 800, 0); q.add('y', 1400, 0);
  assert.deepEqual(q.match(13000), []); // 600 Unterschied: Fenster noch zu klein
  assert.equal(q.match(30000).length, 1); // 150 + 30*25 = 900
});
