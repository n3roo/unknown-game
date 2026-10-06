'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const F = require('../lib/friends');
const E = require('../lib/economy');

const mk = (id) => E.newProfile(id.padEnd(24, '0'));

test('Freundescode und Eingabe', () => {
  const p = mk('abcd1234ef');
  assert.equal(F.prettyCode(p.id), 'ABCD-1234');
  assert.equal(F.parseCode('abcd-1234'), 'abcd1234');
  assert.equal(F.parseCode(' ABCD 1234 '), 'abcd1234');
  assert.equal(F.parseCode('abc'), null);
  assert.equal(F.parseCode('zzzz-zzzz'), null);
});

test('Anfrage, Annahme, gegenseitige Anfrage, Entfernen', () => {
  const a = mk('aaaa'); const b = mk('bbbb'); const c = mk('cccc');
  assert.match(F.request(a, a).error, /selbst/);
  assert.ok(F.request(a, b).ok);
  assert.deepEqual(b.reqIn, [a.id]);
  assert.match(F.request(a, b).error, /schon gesendet/);
  assert.ok(F.accept(b, a).accepted);
  assert.deepEqual(a.friends, [b.id]); assert.deepEqual(b.friends, [a.id]);
  assert.equal(a.reqOut.length + b.reqIn.length, 0);
  assert.match(F.request(a, b).error, /befreundet/);
  // gegenseitig: c fragt a, a fragt c → sofort Freunde
  F.request(c, a);
  assert.ok(F.request(a, c).accepted);
  assert.ok(a.friends.includes(c.id) && c.friends.includes(a.id));
  F.remove(a, b);
  assert.deepEqual(b.friends, []); assert.ok(!a.friends.includes(b.id));
});

test('Ablehnen und Limits', () => {
  const a = mk('aaaa'); const b = mk('bbbb');
  F.request(a, b); F.decline(b, a);
  assert.equal(b.reqIn.length + a.reqOut.length, 0);
  assert.match(F.accept(b, a).error, /Keine Anfrage/);
  F.request(a, b); F.remove(a, b); // Anfrage zurückziehen
  assert.equal(b.reqIn.length, 0);
  const x = mk('xxxx');
  for (let i = 0; i < F.MAX_REQ; i++) F.request(mk('p' + i), x);
  assert.match(F.request(mk('late'), x).error, /zu viele/);
});
