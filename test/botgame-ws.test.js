'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { server } = require('../server');

test('Botspiel: startet, Bots handeln', async () => {
  await new Promise((r) => server.listen(0, r));
  const ws = new WebSocket(`ws://localhost:${server.address().port}`);
  const msgs = [];
  ws.on('message', (d) => msgs.push(JSON.parse(d)));
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ type: 'hello', secret: 'cd'.repeat(16), init: { name: 'Bottester', avatar: 'teufel', region: 'DE' } }));
  await new Promise((r) => setTimeout(r, 300));
  ws.send(JSON.stringify({ type: 'botgame', bots: 2 }));
  await new Promise((r) => setTimeout(r, 4000));
  const j = msgs.find((m) => m.type === 'joined');
  assert.ok(j && j.vsBot);
  const states = msgs.filter((m) => m.type === 'state');
  const last = states[states.length - 1].state;
  assert.strictEqual(last.players.length, 3);
  assert.strictEqual(last.players.filter((p) => p.bot).length, 2);
  assert.notStrictEqual(last.phase, 'lobby');
  const cluesGiven = last.players.filter((p) => p.bot && p.clueGiven).length;
  assert.ok(cluesGiven >= 1 || last.phase !== 'clues', 'Bots geben Hinweise');
  ws.close();
  await new Promise((r) => setTimeout(r, 100));
  process.exit(0);
});
