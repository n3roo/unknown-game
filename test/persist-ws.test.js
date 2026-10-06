'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const S = require('../server');

function client(port) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d)));
  return new Promise((r) => ws.on('open', () => r({ ws, msgs, send: (m) => ws.send(JSON.stringify(m)) })));
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('Partie übersteht Neustart (Räume im Store) und Rejoin klappt', async () => {
  await new Promise((r) => S.server.listen(0, r));
  const port = S.server.address().port;
  const secret = 'ef'.repeat(16);
  const c = await client(port);
  c.send({ type: 'hello', secret, init: { name: 'Persist', avatar: 'hase', region: 'DE' } });
  await wait(300);
  c.send({ type: 'botgame', bots: 2 });
  await wait(1500);
  const joined = c.msgs.find((m) => m.type === 'joined');
  assert.ok(joined);
  await S.flushRooms();
  const saved = await S.store.loadRooms();
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].code, joined.code);

  // „Neustart“: Verbindung weg, Räume im Speicher verloren, aus dem Store wiederherstellen
  c.ws.close();
  await wait(200);
  S.rooms.clear();
  assert.strictEqual(await S.restoreRooms(), 1);
  assert.ok(S.rooms.has(joined.code));

  const d = await client(port);
  d.send({ type: 'hello', secret, init: {} });
  await wait(300);
  d.send({ type: 'rejoin', code: joined.code, token: joined.token });
  await wait(500);
  const st = d.msgs.filter((m) => m.type === 'state').pop();
  assert.ok(st, 'Zustand nach Rejoin');
  assert.strictEqual(st.state.players.length, 3);
  assert.strictEqual(st.state.players.filter((p) => p.bot).length, 2);
  d.ws.close();
  await wait(100);
  process.exit(0);
});
