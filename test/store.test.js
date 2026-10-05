'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { MemoryStore, FileStore, TursoStore, createStore } = require('../lib/store');
const E = require('../lib/economy');

const prof = (id, rating, region, ranked = 1, created = 1) => ({ ...E.newProfile(id), rating, region, rankedPlayed: ranked, createdAt: created });

test('MemoryStore: speichern, laden, Rangliste und Platz', async () => {
  const s = new MemoryStore();
  await s.put(prof('a', 1200, 'DE'));
  await s.put(prof('b', 1500, 'AT'));
  await s.put(prof('c', 1300, 'DE'));
  await s.put(prof('d', 1700, 'DE', 0)); // noch nie Ranked gespielt: nicht gelistet
  assert.equal((await s.get('a')).rating, 1200);
  assert.equal(await s.get('zzz'), null);
  assert.deepEqual((await s.top()).map((p) => p.id), ['b', 'c', 'a']);
  assert.deepEqual((await s.top({ region: 'DE' })).map((p) => p.id), ['c', 'a']);
  assert.equal(await s.rankOf(await s.get('a')), 3);
  assert.equal(await s.rankOf(await s.get('a'), { region: 'DE' }), 2);
  assert.equal(await s.rankOf(await s.get('d')), null);
});

test('FileStore: übersteht einen Neustart', async () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'unk-')), 'p.json');
  const s = new FileStore(f);
  await s.put(prof('a', 1234, 'DE'));
  await new Promise((r) => setTimeout(r, 700));
  const s2 = new FileStore(f);
  assert.equal((await s2.get('a')).rating, 1234);
});

test('createStore wählt nach Umgebung', () => {
  assert.equal(createStore({}).kind, 'memory');
  assert.equal(createStore({ DATA_FILE: path.join(os.tmpdir(), 'x.json') }).kind, 'file');
  assert.equal(createStore({ TURSO_URL: 'libsql://x.turso.io', TURSO_TOKEN: 't' }).kind, 'turso');
});

test('TursoStore: spricht das Pipeline-Protokoll korrekt', async () => {
  // Kleine Attrappe, die SQL nur erkennt, nicht ausführt
  const calls = [];
  const rows = { 'SELECT data': [[{ type: 'text', value: JSON.stringify(prof('a', 1111, 'DE')) }]] };
  const fake = async (url, opts) => {
    const body = JSON.parse(opts.body);
    const stmt = body.requests[0].stmt;
    calls.push({ url, auth: opts.headers.Authorization, sql: stmt.sql, args: stmt.args });
    let result = { cols: [], rows: [] };
    if (stmt.sql.startsWith('SELECT data')) result = { cols: [{ name: 'data' }], rows: rows['SELECT data'] };
    if (stmt.sql.startsWith('SELECT COUNT')) result = { cols: [{ name: 'n' }], rows: [[{ type: 'integer', value: '4' }]] };
    return { ok: true, json: async () => ({ results: [{ type: 'ok', response: { type: 'execute', result } }, { type: 'ok' }] }) };
  };
  const s = new TursoStore('libsql://db.example.turso.io/', 'TOKEN', fake);
  assert.equal((await s.get('a')).rating, 1111);
  assert.equal(calls[0].url, 'https://db.example.turso.io/v2/pipeline');
  assert.equal(calls[0].auth, 'Bearer TOKEN');
  assert.ok(calls.some((c) => c.sql.startsWith('CREATE TABLE')));
  await s.put(prof('a', 1111, 'DE'));
  const put = calls.find((c) => c.sql.startsWith('INSERT'));
  assert.equal(put.args[0].value, 'a');
  assert.equal(put.args[2].type, 'integer');
  assert.equal(await s.rankOf(prof('a', 1111, 'DE')), 5);
  assert.equal((await s.top()).length, 1);
});
