'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const P = require('../lib/push');
const { MemoryStore } = require('../lib/store');

// Gegenstück des Browsers: entschlüsselt nach RFC 8291
function decrypt(body, uaEcdh, authSecret) {
  const salt = body.subarray(0, 16); const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen); const data = body.subarray(21 + idlen);
  const uaPublic = uaEcdh.getPublicKey();
  const shared = uaEcdh.computeSecret(asPublic);
  const h = (s, i, info, l) => Buffer.from(crypto.hkdfSync('sha256', i, s, info, l));
  const ikm = h(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = h(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = h(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  assert.strictEqual(plain[plain.length - 1], 2);
  return plain.subarray(0, plain.length - 1).toString();
}

test('Push: Verschlüsselung lässt sich vom „Browser“ entschlüsseln', () => {
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: P.b64u(ua.getPublicKey()), auth: P.b64u(auth) } };
  const body = P.encrypt(sub, '{"title":"Hallo ÄÖÜ"}');
  assert.strictEqual(decrypt(body, ua, auth), '{"title":"Hallo ÄÖÜ"}');
});

test('Push: VAPID-Header ist ein gültiges ES256-JWT', () => {
  const k = P.generateVapid();
  assert.strictEqual(P.unb64u(k.publicKey).length, 65);
  const h = P.vapidHeader('https://fcm.googleapis.com/fcm/send/xyz', k.publicKey, k.privateKey, 'mailto:a@b.de');
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  assert.ok(m && m[4] === k.publicKey);
  assert.strictEqual(JSON.parse(P.unb64u(m[2]).toString()).aud, 'https://fcm.googleapis.com');
  const pub = P.unb64u(k.publicKey);
  const pubKey = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: P.b64u(pub.subarray(1, 33)), y: P.b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  assert.ok(crypto.verify('sha256', Buffer.from(`${m[1]}.${m[2]}`), { key: pubKey, dsaEncoding: 'ieee-p1363' }, P.unb64u(m[3])));
});

test('Pusher: Schlüssel bleiben im Store, abgelaufene Abos fallen heraus', async () => {
  const store = new MemoryStore();
  const calls = [];
  const fake = async (url) => { calls.push(url); return { status: url.includes('gone') ? 410 : 201 }; };
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const keys = { p256dh: P.b64u(ua.getPublicKey()), auth: P.b64u(crypto.randomBytes(16)) };
  const p = new P.Pusher(store, {}, fake);
  const key1 = await p.key();
  assert.strictEqual(await new P.Pusher(store, {}, fake).key(), key1);
  const keep = await p.send([{ endpoint: 'https://push.example/ok', keys }, { endpoint: 'https://push.example/gone', keys }], { title: 'x' });
  assert.deepStrictEqual(keep.map((s) => s.endpoint), ['https://push.example/ok']);
  assert.strictEqual(calls.length, 2);
});
