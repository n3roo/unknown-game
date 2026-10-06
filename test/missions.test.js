'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const M = require('../lib/missions');
const E = require('../lib/economy');
const { dayKey } = require('../lib/day');

const D = (d, h = 12) => Date.UTC(2026, 9, d, h); // Oktober 2026
const fresh = () => E.newProfile('x'.repeat(24), D(1));

test('Tag wechselt um Mitternacht deutscher Zeit', () => {
  assert.strictEqual(dayKey(Date.UTC(2026, 9, 6, 21, 59)), '2026-10-06'); // 23:59 MESZ
  assert.strictEqual(dayKey(Date.UTC(2026, 9, 6, 22, 0)), '2026-10-07'); // 00:00 MESZ
});

test('Tagesbelohnung: Serie wächst, Lücke setzt zurück, einmal pro Tag', () => {
  const p = fresh(); const g0 = p.gold;
  assert.strictEqual(M.claimDaily(p, D(1)).gold, 20);
  assert.ok(M.claimDaily(p, D(1, 20)).error, 'zweimal am selben Tag nicht');
  assert.strictEqual(M.claimDaily(p, D(2)).gold, 30);
  assert.strictEqual(M.claimDaily(p, D(3)).gold, 40);
  assert.strictEqual(p.gold, g0 + 90);
  const v = M.view(p, D(3, 15));
  assert.strictEqual(v.daily.claimedToday, true);
  assert.strictEqual(v.daily.streak, 3);
  // Tag 4 ausgelassen -> Serie startet neu
  assert.strictEqual(M.view(p, D(5)).daily.streak, 0);
  const r = M.claimDaily(p, D(5));
  assert.strictEqual(r.streak, 1);
  assert.strictEqual(r.gold, 20);
});

test('Serie läuft nach Tag 7 wieder bei Tag 1 los', () => {
  const p = fresh();
  const got = [];
  for (let d = 1; d <= 8; d++) got.push(M.claimDaily(p, D(d)).gold);
  assert.deepStrictEqual(got, [20, 30, 40, 50, 60, 80, 150, 20]);
});

test('Missionen: Fortschritt, Abholen, nicht doppelt, Tageswechsel', () => {
  const p = fresh();
  const ids = M.missionIdsFor(dayKey(D(2)));
  assert.strictEqual(ids.length, 5);
  const v0 = M.view(p, D(2));
  assert.ok(v0.missions.every((m) => m.progress === 0 && !m.claimed));
  const mPlay = v0.missions.find((m) => /^play/.test(m.id));
  assert.ok(M.claimMission(p, mPlay.id, D(2)).error, 'noch nicht geschafft');
  for (let i = 0; i < 5; i++) M.track(p, { won: i < 2, ranked: i === 0 }, D(2));
  const v1 = M.view(p, D(2));
  assert.strictEqual(v1.missions.find((m) => m.id === mPlay.id).progress, mPlay.goal);
  const g = p.gold;
  assert.strictEqual(M.claimMission(p, mPlay.id, D(2)).gold, mPlay.reward);
  assert.strictEqual(p.gold, g + mPlay.reward);
  assert.ok(M.claimMission(p, mPlay.id, D(2)).error, 'nicht doppelt');
  assert.ok(M.claimMission(p, 'gibtsnicht', D(2)).error);
  // nächster Tag: alles frisch
  const v2 = M.view(p, D(3));
  assert.ok(v2.missions.every((m) => m.progress === 0 && !m.claimed));
});

test('Spielende zählt für Missionen (settleGame)', () => {
  const a = E.newProfile('a'.repeat(24)); const b = E.newProfile('b'.repeat(24));
  const now = D(4);
  E.settleGame({ entries: [{ id: 'A', profile: a }, { id: 'B', profile: b }], winnerId: 'A', ranked: false, now });
  assert.strictEqual(a.missions.progress.won, 1);
  assert.strictEqual(b.missions.progress.won, 0);
  assert.strictEqual(b.missions.progress.played, 1);
  E.settleGame({ entries: [{ id: 'A', profile: a }, { id: 'B', profile: b }], winnerId: 'B', ranked: true, now });
  assert.strictEqual(a.missions.progress.ranked, 1);
});

test('selfView enthält Tagesbelohnung und Missionen', () => {
  const v = E.selfView(fresh());
  assert.ok(v.daily && Array.isArray(v.missions) && v.missions.length === 5);
});
