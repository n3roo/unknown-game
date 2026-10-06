'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const WebSocket = require('ws');
const S = require('../server');
const P = require('../lib/push');

function client(port) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d)));
  const last = (type) => msgs.filter((m) => m.type === type).pop();
  return new Promise((r) => ws.on('open', () => r({ ws, msgs, last, send: (m) => ws.send(JSON.stringify(m)) })));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('Push: Abo speichern, Offline-Freund wird per Benachrichtigung eingeladen', async () => {
  await new Promise((r) => S.server.listen(0, r));
  const port = S.server.address().port;
  const a = await client(port); const b = await client(port);
  a.send({ type: 'hello', secret: '33'.repeat(16), init: { name: 'Ana', avatar: 'teufel', region: 'DE' } });
  b.send({ type: 'hello', secret: '44'.repeat(16), init: { name: 'Bob', avatar: 'teufel', region: 'DE' } });
  await wait(500);
  b.send({ type: 'pushkey' }); await wait(200);
  assert.strictEqual(P.unb64u(b.last('pushkey').key).length, 65);
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  b.send({ type: 'pushsub', sub: { endpoint: 'https://127.0.0.1:1/push/abc', keys: { p256dh: P.b64u(ua.getPublicKey()), auth: P.b64u(crypto.randomBytes(16)) } } });
  b.send({ type: 'pushsub', sub: { endpoint: 'http://unsicher.example', keys: { p256dh: 'x', auth: 'y' } } }); // wird abgelehnt
  await wait(200);
  a.send({ type: 'friendadd', code: b.last('friends').code }); await wait(300);
  b.send({ type: 'friendaccept', id: b.last('friends').incoming[0].id }); await wait(300);
  const bobId = a.last('friends').friends[0].id;
  b.ws.close(); await wait(300);
  a.send({ type: 'create', name: 'Ana', avatar: 'teufel' }); await wait(300);
  a.send({ type: 'invite', id: bobId }); await wait(500);
  assert.match(a.last('toast').message, /Benachrichtigung gesendet/);
  assert.strictEqual(S.profiles.get([...S.profiles.keys()].find((k) => S.profiles.get(k).name === 'Bob')).push.length, 1);
  a.ws.close(); await wait(100);
  process.exit(0);
});
