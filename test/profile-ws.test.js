'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { server } = require('../server');

function client(port) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => { inbox.push(JSON.parse(d)); for (const w of waiters.slice()) w(); });
  const next = (type, ms = 3000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout ' + type)), ms);
    const check = () => { const i = inbox.findIndex((m) => m.type === type); if (i >= 0) { clearTimeout(t); waiters.splice(waiters.indexOf(check), 1); res(inbox.splice(i, 1)[0]); } };
    waiters.push(check); check();
  });
  return new Promise((r) => ws.on('open', () => r({ ws, next, send: (m) => ws.send(JSON.stringify(m)) })));
}

test('hello, Hut kaufen/anziehen, Rangliste', async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const c = await client(port);
  c.send({ type: 'hello', secret: 'ab'.repeat(16), init: { name: 'Tester', avatar: 'hase', region: 'DE' } });
  const p = (await c.next('profile')).profile;
  assert.strictEqual(p.name, 'Tester');
  assert.strictEqual(p.avatar, 'hase');
  c.send({ type: 'buy', hat: 'basecap' });
  assert.ok((await c.next('profile')).profile.hats.includes('basecap'));
  c.send({ type: 'equip', hat: 'basecap' });
  assert.strictEqual((await c.next('profile')).profile.hat, 'basecap');
  c.send({ type: 'buy', hat: 'liga_gold' });
  assert.match((await c.next('error')).message, /Rangliste/);
  c.send({ type: 'leaderboard', scope: 'world' });
  assert.ok(Array.isArray((await c.next('leaderboard')).rows));
  c.ws.close();
  await new Promise((r) => setTimeout(r, 100));
  process.exit(0);
});
