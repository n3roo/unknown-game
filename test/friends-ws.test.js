'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const S = require('../server');

function client(port) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d)));
  const last = (type) => msgs.filter((m) => m.type === type).pop();
  return new Promise((r) => ws.on('open', () => r({ ws, msgs, last, send: (m) => ws.send(JSON.stringify(m)) })));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('Freunde: Anfrage per Code, annehmen, in Lobby einladen und beitreten', async () => {
  await new Promise((r) => S.server.listen(0, r));
  const port = S.server.address().port;
  const a = await client(port); const b = await client(port);
  a.send({ type: 'hello', secret: '11'.repeat(16), init: { name: 'Anna', avatar: 'teufel', region: 'DE' } });
  b.send({ type: 'hello', secret: '22'.repeat(16), init: { name: 'Ben', avatar: 'teufel', region: 'DE' } });
  await wait(500);
  const codeB = b.last('friends').code;
  assert.match(codeB, /^[0-9A-F]{4}-[0-9A-F]{4}$/);

  a.send({ type: 'friendadd', code: codeB.toLowerCase() });
  await wait(400);
  assert.strictEqual(a.last('friends').outgoing.length, 1);
  assert.strictEqual(b.last('friends').incoming.length, 1);
  assert.strictEqual(b.last('friends').incoming[0].name, 'Anna');
  a.send({ type: 'friendadd', code: 'zzzz-zzzz' });
  a.send({ type: 'friendadd', code: '00000000' });
  await wait(200);
  assert.ok(a.msgs.filter((m) => m.type === 'error').length >= 2);

  b.send({ type: 'friendaccept', id: b.last('friends').incoming[0].id });
  await wait(400);
  assert.strictEqual(a.last('friends').friends.length, 1);
  assert.strictEqual(a.last('friends').friends[0].online, true);
  assert.strictEqual(b.last('friends').friends[0].name, 'Anna');

  // Einladung nur mit Lobby
  const friendId = a.last('friends').friends[0].id;
  a.send({ type: 'invite', id: friendId });
  await wait(200);
  assert.match(a.last('error').message, /Lobby/);
  a.send({ type: 'create', name: 'Anna', avatar: 'teufel' });
  await wait(300);
  a.send({ type: 'invite', id: friendId });
  await wait(400);
  const inv = b.last('invite');
  assert.ok(inv && inv.code && inv.from.name === 'Anna');
  b.send({ type: 'join', code: inv.code, name: 'Ben', avatar: 'teufel' });
  await wait(400);
  assert.ok(b.last('joined'));

  // Entfernen
  b.send({ type: 'friendremove', id: b.last('friends').friends[0].id });
  await wait(300);
  assert.strictEqual(a.last('friends').friends.length, 0);
  a.ws.close(); b.ws.close();
  await wait(100);
  process.exit(0);
});
