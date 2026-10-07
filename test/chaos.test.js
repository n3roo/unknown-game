'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const G = require('../lib/game');

function seeded(seed = 1) {
  let s = seed;
  return (max) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % max; };
}

function chaosGame(n = 3, { blitz = false, seed = 7 } = {}) {
  const g = G.createGame('p0');
  for (let i = 0; i < n; i++) G.addPlayer(g, { id: `p${i}`, name: `S${i}`, avatar: `av${i}` });
  assert.ok(G.setMode(g, 'p0', 'chaos', blitz).ok);
  assert.ok(G.startGame(g, 'p0', seeded(seed)).ok);
  // Hinweisrunde abschließen
  for (let i = 0; i < n; i++) assert.ok(G.giveClue(g, `p${i}`, G.allowedClues(g, i)[0]).ok);
  assert.strictEqual(g.phase, 'playing');
  return g;
}
const give = (g, id, ...kinds) => { const p = g.players.find((q) => q.id === id); p.chaos = kinds; return p; };

test('Modus lässt sich nur vom Host in der Lobby ändern', () => {
  const g = G.createGame('p0');
  G.addPlayer(g, { id: 'p0', name: 'A', avatar: 'a' });
  G.addPlayer(g, { id: 'p1', name: 'B', avatar: 'b' });
  assert.ok(G.setMode(g, 'p1', 'chaos', false).error);
  assert.ok(G.setMode(g, 'p0', 'unsinn', false).error);
  assert.ok(G.setMode(g, 'p0', 'chaos', true).ok);
  assert.strictEqual(g.mode, 'chaos');
  assert.strictEqual(g.blitz, true);
  G.startGame(g, 'p0');
  assert.ok(G.setMode(g, 'p0', 'classic', false).error, 'im Spiel nicht mehr änderbar');
});

test('Klassisch: keine Chaoskarten, Chaos: jeder bekommt zwei verschiedene', () => {
  const g = G.createGame('p0');
  G.addPlayer(g, { id: 'p0', name: 'A', avatar: 'a' });
  G.addPlayer(g, { id: 'p1', name: 'B', avatar: 'b' });
  G.startGame(g, 'p0');
  assert.ok(g.players.every((p) => p.chaos.length === 0));
  assert.ok(G.useAction(g, 'p0', 'shield', 'p1').error);

  const c = chaosGame(4);
  assert.ok(c.players.every((p) => p.chaos.length === 2 && p.chaos[0] !== p.chaos[1] && p.chaos.every((k) => G.POWERS.includes(k))));
  const v = G.viewFor(c, 'p1');
  assert.strictEqual(v.mode, 'chaos');
  assert.ok(v.power && v.power.cards.length === 2);
  // Fremde Aktionen bleiben geheim, nur „hat noch eine“ ist sichtbar
  assert.ok(v.players.every((p) => p.powerReady === true && p.chaosCount === 2));
  assert.ok(!JSON.stringify(v.players).includes('"chaos"'));
});

test('Chaoskarte nur im eigenen Zug und nur einmal, sie ersetzt den Zug', () => {
  const g = chaosGame(3);
  const other = g.players[1];
  give(g, other.id, 'shield');
  assert.ok(G.useAction(g, other.id, 'shield').error, 'nicht am Zug');
  const idx = g.current;
  const me = give(g, g.players[idx].id, 'shield', 'oracle');
  assert.ok(G.useAction(g, me.id, 'block', 'p1').error, 'Karte nicht auf der Hand');
  assert.ok(G.useAction(g, me.id, 'shield').ok);
  assert.deepStrictEqual(me.chaos, ['oracle']);
  assert.notStrictEqual(g.current, idx, 'Zug ist vorbei, wie bei einer normalen Karte');
});

test('Orakel verrät genau ein echtes Merkmal der eigenen Geheimkarte', () => {
  const g = chaosGame(3);
  const me = give(g, g.players[g.current].id, 'oracle');
  assert.ok(G.useAction(g, me.id, 'oracle', null, seeded(3)).ok);
  const d = G.decode(me.secret);
  assert.ok(['c', 'a', 'l'].includes(me.oracle.kind));
  assert.strictEqual(me.oracle.value, d[me.oracle.kind]);
  assert.deepStrictEqual(G.viewFor(g, me.id).power.oracle, me.oracle);
  const others = g.players.filter((p) => p !== me);
  for (const o of others) assert.strictEqual(G.viewFor(g, o.id).power.oracle, null);
});

test('Klauen: die Karte des Opfers wird sofort auf meine Stapel gelegt, mein Blatt bleibt', () => {
  const g = chaosGame(3);
  const me = give(g, g.players[g.current].id, 'steal');
  const victim = g.players.find((p) => p !== me);
  const myHand = me.hand.slice();
  const before = new Set(victim.hand);
  assert.ok(G.useAction(g, me.id, 'steal', victim.id, seeded(5)).ok);
  assert.deepStrictEqual(me.hand, myHand, 'eigene Hand unverändert');
  const placed = me.related.concat(me.notRelated);
  assert.strictEqual(placed.filter((c) => before.has(c)).length, 1);
  assert.strictEqual(victim.hand.length, 5, 'Opfer zieht nach');
  const ev = g.events.find((e) => e.type === 'power');
  assert.ok(placed.includes(ev.card));
  assert.notStrictEqual(g.players[g.current].id, me.id);
});

test('Klauen und Sperre brauchen ein gültiges Ziel', () => {
  const g = chaosGame(3);
  const me = give(g, g.players[g.current].id, 'steal', 'block');
  for (const k of ['steal', 'block']) {
    assert.ok(G.useAction(g, me.id, k, null).error);
    assert.ok(G.useAction(g, me.id, k, me.id).error);
    assert.ok(G.useAction(g, me.id, k, 'niemand').error);
  }
  assert.deepStrictEqual(me.chaos, ['steal', 'block'], 'Fehler verbraucht die Karte nicht');
});

test('Sperre überspringt den nächsten Zug des Ziels genau einmal', () => {
  const g = chaosGame(3);
  const startIdx = g.current;
  const me = give(g, g.players[startIdx].id, 'block');
  const next = g.players[(startIdx + 1) % 3];
  assert.ok(G.useAction(g, me.id, 'block', next.id).ok);
  const after = g.players[g.current];
  assert.strictEqual(after.id, g.players[(startIdx + 2) % 3].id, 'gesperrter Spieler wird übersprungen');
  assert.strictEqual(next.skip, false, 'Sperre ist verbraucht');
  assert.ok(g.events.some((e) => e.type === 'skip' && e.player === next.id));
  G.playCard(g, after.id, after.hand[0]);
  assert.strictEqual(g.players[g.current].id, me.id);
});

test('Sperre bei zwei Spielern: ich bin direkt nochmal dran', () => {
  const g = chaosGame(2);
  const me = give(g, g.players[g.current].id, 'block');
  const opp = g.players.find((p) => p !== me);
  G.useAction(g, me.id, 'block', opp.id);
  assert.strictEqual(g.players[g.current].id, me.id);
});

test('Doppelzug: danach darf ich genau zwei normale Karten ausspielen', () => {
  const g = chaosGame(3);
  const me = give(g, g.players[g.current].id, 'double');
  assert.ok(G.useAction(g, me.id, 'double').ok);
  assert.strictEqual(g.players[g.current].id, me.id, 'Zug bleibt bei mir');
  assert.strictEqual(me.bonus, 2);
  G.playCard(g, me.id, me.hand[0]);
  assert.strictEqual(g.players[g.current].id, me.id, 'noch eine Karte');
  G.playCard(g, me.id, me.hand[0]);
  assert.notStrictEqual(g.players[g.current].id, me.id);
  assert.strictEqual(me.bonus, 0);
});

test('Doppelzug: ein Tipp beendet den Zug sofort', () => {
  const g = chaosGame(3);
  const me = give(g, g.players[g.current].id, 'double');
  G.useAction(g, me.id, 'double');
  G.playCard(g, me.id, me.hand[0]);
  const d = G.decode(me.secret);
  G.guess(g, me.id, (d.c + 1) % 7, (d.a + 1) % 7, (d.l + 1) % 7);
  assert.strictEqual(me.bonus, 0);
  G.flipPile(g, me.id, 'related');
  assert.notStrictEqual(g.players[g.current].id, me.id);
});

test('Schutzschild: ein falscher Tipp kostet nichts, danach wirkt er nicht mehr', () => {
  const g = chaosGame(3);
  const idx = g.current;
  const me = give(g, g.players[idx].id, 'shield');
  G.useAction(g, me.id, 'shield');
  // Wieder an mir (zwei Runden später)
  G.playCard(g, g.players[g.current].id, g.players[g.current].hand[0]);
  G.playCard(g, g.players[g.current].id, g.players[g.current].hand[0]);
  assert.strictEqual(g.players[g.current].id, me.id);
  const d = G.decode(me.secret);
  assert.ok(G.guess(g, me.id, (d.c + 1) % 7, (d.a + 1) % 7, (d.l + 1) % 7).ok);
  assert.strictEqual(me.wrong, 0);
  assert.strictEqual(g.pending, null, 'kein Stapel muss umgedreht werden');
  assert.strictEqual(me.shield, false);
  assert.ok(g.events.some((e) => e.type === 'guess' && e.shielded));
});

test('Gesperrte Spieler dürfen die Partie nicht festfahren (alle anderen gesperrt)', () => {
  const g = chaosGame(3);
  g.players.forEach((p, i) => { if (i !== g.current) p.skip = true; });
  const me = g.players[g.current];
  G.playCard(g, me.id, me.hand[0]);
  assert.strictEqual(g.players[g.current].id, me.id, 'alle anderen waren gesperrt: ich bin wieder dran');
  assert.ok(g.players.every((p) => !p.skip));
});

test('Blitz: abgelaufene Zeit spielt automatisch eine Karte', () => {
  const g = chaosGame(3, { blitz: true });
  assert.ok(g.turnEndsAt > Date.now(), 'Timer läuft');
  const who = g.players[g.current];
  assert.strictEqual(G.tick(g, Date.now(), seeded(1)), false, 'noch nicht abgelaufen');
  assert.ok(G.viewFor(g, who.id).turnMs > 0);
  const handBefore = who.hand.slice();
  const pilesBefore = who.related.length + who.notRelated.length; // enthält schon den Hinweis aus der Startrunde
  assert.strictEqual(G.tick(g, g.turnEndsAt + 1, seeded(1)), true);
  assert.strictEqual(who.related.length + who.notRelated.length, pilesBefore + 1, 'eine Karte wurde ausgespielt');
  assert.ok(g.events.some((e) => e.type === 'timeout' && e.player === who.id));
  assert.notStrictEqual(g.players[g.current].id, who.id);
  assert.strictEqual(who.hand.length, handBefore.length);
  assert.ok(g.turnEndsAt > Date.now(), 'Timer für den nächsten Spieler');
});

test('Blitz: bei offenem Stapel-Umdrehen wird automatisch ein Stapel gewählt', () => {
  const g = chaosGame(2, { blitz: true });
  const who = g.players[g.current];
  const d = G.decode(who.secret);
  G.guess(g, who.id, (d.c + 1) % 7, (d.a + 1) % 7, (d.l + 1) % 7);
  assert.ok(g.pending);
  assert.ok(G.tick(g, g.turnEndsAt + 1, seeded(2)));
  assert.strictEqual(g.pending, null);
  assert.ok(who.flipped.related || who.flipped.notRelated);
});

test('Blitz: Bots werden nicht vom Timer gespielt, ohne Blitz gibt es keinen Timer', () => {
  const g = chaosGame(2, { blitz: true });
  g.players[g.current].bot = true;
  assert.strictEqual(G.tick(g, g.turnEndsAt + 1), false);
  const c = chaosGame(2, { blitz: false });
  assert.strictEqual(c.turnEndsAt, null);
  assert.strictEqual(G.tick(c, Date.now() + 999999), false);
});

test('Revanche: alle verbundenen Spieler müssen zustimmen, Modus bleibt erhalten', () => {
  const g = chaosGame(3, { blitz: true });
  const who = g.players[g.current];
  const d = G.decode(who.secret);
  G.guess(g, who.id, d.c, d.a, d.l);
  assert.strictEqual(g.phase, 'finished');
  assert.strictEqual(g.turnEndsAt, null);
  assert.deepStrictEqual(G.rematchVote(g, 'p0'), { ok: true, ready: false });
  assert.deepStrictEqual(G.rematchVote(g, 'p0'), { ok: true, ready: false }, 'doppeltes Drücken zählt einmal');
  assert.deepStrictEqual(G.viewFor(g, 'p1').rematchVotes, ['p0']);
  assert.deepStrictEqual(G.rematchVote(g, 'p1'), { ok: true, ready: false });
  g.players[2].connected = false; // der Dritte ist weg: zwei Stimmen reichen
  assert.deepStrictEqual(G.rematchVote(g, 'p1'), { ok: true, ready: true });
  assert.ok(G.rematch(g, g.hostId).ok);
  assert.strictEqual(g.players.length, 2);
  assert.strictEqual(g.mode, 'chaos');
  assert.strictEqual(g.blitz, true);
  assert.ok(G.startGame(g, g.hostId).ok);
  assert.ok(g.players.every((p) => p.chaos.length === 2), 'neue Chaoskarten für die neue Runde');
  assert.deepStrictEqual(g.rematchVotes, []);
});

test('Revanche geht erst nach Spielende, Host wechselt wenn er weg ist', () => {
  const g = chaosGame(3);
  assert.ok(G.rematchVote(g, 'p0').error);
  const who = g.players[g.current];
  const d = G.decode(who.secret);
  G.guess(g, who.id, d.c, d.a, d.l);
  g.players[0].connected = false; // Host weg
  assert.ok(G.rematch(g, 'p0').ok);
  assert.notStrictEqual(g.hostId, 'p0');
  assert.ok(g.players.some((p) => p.id === g.hostId));
});

test('Ganze Chaos-Partien mit zufälligen Aktionen laufen immer sauber zu Ende', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const rnd = seeded(seed);
    const n = 2 + (seed % 3);
    const g = chaosGame(n, { seed, blitz: seed % 2 === 0 });
    let steps = 0;
    while (g.phase === 'playing' && steps++ < 2000) {
      const p = g.players[g.current];
      assert.ok(p && !p.out, `Spieler am Zug darf nicht ausgeschieden sein (Seed ${seed})`);
      if (g.pending) { G.flipPile(g, p.id, p.flipped.related ? 'notRelated' : 'related'); continue; }
      if (p.chaos.length && rnd(2) === 0) {
        const targets = g.players.filter((q) => q.id !== p.id && !q.out);
        G.useAction(g, p.id, p.chaos[rnd(p.chaos.length)], targets[rnd(targets.length)].id, rnd);
        continue;
      }
      const roll = rnd(10);
      if (roll < 2 || !p.hand.length) G.guess(g, p.id, rnd(7), rnd(7), rnd(7));
      else G.playCard(g, p.id, p.hand[rnd(p.hand.length)]);
      if (g.blitz && g.phase === 'playing' && rnd(4) === 0) G.tick(g, g.turnEndsAt + 1, rnd);
    }
    assert.strictEqual(g.phase, 'finished', `Partie beendet (Seed ${seed}, ${steps} Schritte)`);
    assert.ok(steps < 2000, 'keine Endlosschleife');
  }
});
