'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const WebSocket = require('ws');
const { server, wss, profiles, auth, store } = require('../server');
const { Auth } = require('../lib/auth');

function client(port) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const inbox = []; const waiters = [];
  ws.on('message', (d) => { inbox.push(JSON.parse(d)); for (const w of waiters.slice()) w(); });
  const next = (type, ms = 3000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout ' + type)), ms);
    const check = () => { const i = inbox.findIndex((m) => m.type === type); if (i >= 0) { clearTimeout(t); waiters.splice(waiters.indexOf(check), 1); res(inbox.splice(i, 1)[0]); } };
    waiters.push(check); check();
  });
  return new Promise((r) => ws.on('open', () => r({ ws, next, send: (m) => ws.send(JSON.stringify(m)) })));
}

test('Auth: Limits, Ablauf und Google-Prüfung', async () => {
  let t = 1000;
  const sent = [];
  const A = new Auth({ getKV: async () => null, putKV: async () => {}, delKV: async () => {} }, {
    now: () => t, googleClientId: 'cid', mail: async (m) => sent.push(m),
    fetch: async (url) => ({ ok: true, json: async () => ({ aud: 'cid', iss: 'accounts.google.com', exp: String(9e9), email: 'g@x.de', email_verified: 'true' }) }),
  });
  assert.ok((await A.requestCode('nope')).error);
  for (let i = 0; i < 5; i++) assert.ok((await A.requestCode('x@y.de')).ok);
  assert.match((await A.requestCode('x@y.de')).error, /Zu viele/);
  t += 11 * 60 * 1000;
  assert.match(A.verifyCode('x@y.de', '123456').error, /abgelaufen/);
  const g = await A.verifyGoogle('aaa.bbb.ccc');
  assert.strictEqual(g.email, 'g@x.de');
  A.googleClientId = 'other';
  assert.ok((await A.verifyGoogle('aaa.bbb.ccc')).error);
});

test('E-Mail-Anmeldung: Konto anlegen, auf zweitem Gerät laden, abmelden, löschen', async () => {
  const mails = [];
  auth.mail = async (m) => { mails.push(m); };
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  // Gerät A: Konto anlegen
  const a = await client(port);
  a.send({ type: 'hello', secret: 'aa'.repeat(16), init: { name: 'Anna', avatar: 'teufel', region: 'DE' } });
  const pa = (await a.next('profile')).profile;
  assert.strictEqual(pa.account, null);
  profiles.get(pa.id).gold = 777;
  a.send({ type: 'authemail', email: 'Anna@Example.com' });
  await a.next('authcode');
  const code = /(\d{6})/.exec(mails[0].subject)[1];
  a.send({ type: 'authverify', email: 'anna@example.com', code: '000000' });
  assert.match((await a.next('error')).message, /Code stimmt nicht/);
  a.send({ type: 'authverify', email: 'anna@example.com', code });
  const logged = (await a.next('profile')).profile;
  assert.strictEqual(logged.account.email, 'anna@example.com');
  assert.strictEqual(logged.gold, 777);

  // Gerät B: anderer Schlüssel, meldet sich mit derselben Mail an -> bekommt Annas Profil
  const b = await client(port);
  b.send({ type: 'hello', secret: 'bb'.repeat(16), init: { name: 'Zweitgerät', avatar: 'alien', region: 'DE' } });
  const pb = (await b.next('profile')).profile;
  assert.notStrictEqual(pb.id, pa.id);
  b.send({ type: 'authemail', email: 'anna@example.com' });
  await b.next('authcode');
  b.send({ type: 'authverify', email: 'anna@example.com', code: /(\d{6})/.exec(mails[1].subject)[1] });
  const pb2 = (await b.next('profile')).profile;
  assert.strictEqual(pb2.id, pa.id);
  assert.strictEqual(pb2.gold, 777);
  b.ws.close();

  // Nach neuem Verbinden bleibt Gerät B auf dem Konto
  const b2 = await client(port);
  b2.send({ type: 'hello', secret: 'bb'.repeat(16) });
  assert.strictEqual((await b2.next('profile')).profile.gold, 777);

  // Abmelden entfernt den Link
  b2.send({ type: 'authlogout' });
  await b2.next('loggedout');
  b2.ws.close();
  const b3 = await client(port);
  b3.send({ type: 'hello', secret: 'bb'.repeat(16) });
  assert.notStrictEqual((await b3.next('profile')).profile.id, pa.id);
  b3.ws.close();

  // Löschen braucht Bestätigung
  a.send({ type: 'authdelete', confirm: 'nein' });
  assert.match((await a.next('error')).message, /löschen/);
  a.send({ type: 'authdelete', confirm: 'löschen' });
  assert.strictEqual((await a.next('loggedout')).deleted, true);
  assert.strictEqual(await store.get(pa.id), null);
  assert.strictEqual(await auth.accountProfile('anna@example.com'), null);
  a.ws.close();
  await new Promise((r) => setTimeout(r, 100));
  for (const c of wss.clients) c.terminate();
  server.close();
});

