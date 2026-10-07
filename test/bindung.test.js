'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const E = require('../lib/economy');
const M = require('../lib/missions');
const FR = require('../lib/friends');

const prof = (id) => E.newProfile(id.padEnd(16, '0'));
const day = (n) => Date.UTC(2026, 9, 1 + n, 10, 0, 0);

test('Chaos-Runde mit Freunden zählt für die Chaos-Mission, klassische nicht', () => {
  const a = prof('a'); const b = prof('b');
  E.settleGame({ entries: [{ id: 'A', profile: a }, { id: 'B', profile: b }], winnerId: 'A', ranked: false, chaos: false, now: day(0) });
  assert.strictEqual(a.missions.progress.chaos, 0);
  E.settleGame({ entries: [{ id: 'A', profile: a }, { id: 'B', profile: b }], winnerId: 'A', ranked: false, chaos: true, now: day(0) });
  assert.strictEqual(a.missions.progress.chaos, 1);
  assert.strictEqual(b.missions.progress.chaos, 1, 'auch der Verlierer hat gespielt');
});

test('Chaos gegen Bots oder in Ranked zählt nicht', () => {
  const a = prof('a');
  E.settleGame({ entries: [{ id: 'A', profile: a }], winnerId: 'A', ranked: false, botGame: true, chaos: true, now: day(0) });
  assert.strictEqual(a.missions.progress.chaos || 0, 0);
  const b = prof('b'); const c = prof('c');
  E.settleGame({ entries: [{ id: 'B', profile: b }, { id: 'C', profile: c }], winnerId: 'B', ranked: true, chaos: true, now: day(0) });
  assert.strictEqual(b.missions.progress.chaos || 0, 0);
});

test('Chaos-Mission erscheint an manchen Tagen und lässt sich abholen', () => {
  let found = null;
  for (let n = 0; n < 60 && found === null; n++) if (M.missionIdsFor(`2026-10-${n}`).includes('chaos1')) found = n;
  assert.notStrictEqual(found, null, 'kommt in den Tagesaufgaben vor');
  // über echte Kalendertage suchen, damit view()/claimMission denselben Tag benutzen
  let when = null;
  for (let n = 0; n < 120 && when === null; n++) {
    const p = prof('x');
    if (M.view(p, day(n)).missions.some((m) => m.id === 'chaos1')) when = day(n);
  }
  assert.ok(when, 'an einem echten Tag aktiv');
  const p = prof('y'); const q = prof('z');
  E.settleGame({ entries: [{ id: 'Y', profile: p }, { id: 'Z', profile: q }], winnerId: 'Y', ranked: false, chaos: true, now: when });
  const gold = p.gold;
  assert.ok(M.claimMission(p, 'chaos1', when).ok);
  assert.strictEqual(p.gold, gold + 70);
  assert.ok(M.claimMission(p, 'chaos1', when).error, 'nur einmal');
});

function befriend(a, b) { FR.request(a, b); assert.ok(FR.accept(b, a).ok); }

test('Bilanz: Sieger zählt gegen befreundete Mitspieler, Verlierer bekommt die Niederlage', () => {
  const a = prof('a'); const b = prof('b'); const c = prof('c');
  befriend(a, b); // c ist kein Freund
  assert.deepStrictEqual(FR.record(a, b.id), { w: 0, l: 0 });
  FR.recordGame(a, [b, c]);
  FR.recordGame(a, [b]);
  FR.recordGame(b, [a]);
  assert.deepStrictEqual(FR.record(a, b.id), { w: 2, l: 1 });
  assert.deepStrictEqual(FR.record(b, a.id), { w: 1, l: 2 });
  assert.deepStrictEqual(FR.record(a, c.id), { w: 0, l: 0 }, 'gegen Nicht-Freunde wird nichts gespeichert');
  assert.ok(!a.h2h[c.id] && !c.h2h);
});

test('Bilanz in 3er-Runde: Verlierer untereinander bekommen nichts', () => {
  const a = prof('a'); const b = prof('b'); const c = prof('c');
  befriend(a, b); befriend(a, c); befriend(b, c);
  FR.recordGame(a, [b, c]);
  assert.deepStrictEqual(FR.record(a, b.id), { w: 1, l: 0 });
  assert.deepStrictEqual(FR.record(a, c.id), { w: 1, l: 0 });
  assert.deepStrictEqual(FR.record(b, c.id), { w: 0, l: 0 });
  assert.deepStrictEqual(FR.record(c, a.id), { w: 0, l: 1 });
});

test('Bilanz wird beim Entfernen der Freundschaft gelöscht', () => {
  const a = prof('a'); const b = prof('b');
  befriend(a, b);
  FR.recordGame(a, [b]);
  FR.remove(a, b);
  assert.deepStrictEqual(FR.record(a, b.id), { w: 0, l: 0 });
  assert.deepStrictEqual(FR.record(b, a.id), { w: 0, l: 0 });
  befriend(a, b);
  assert.deepStrictEqual(FR.record(a, b.id), { w: 0, l: 0 }, 'neue Freundschaft startet bei 0:0');
});

test('Alte Profile ohne Bilanz-Feld funktionieren', () => {
  const a = prof('a'); delete a.h2h;
  assert.deepStrictEqual(FR.record(a, 'irgendwer'), { w: 0, l: 0 });
});
