'use strict';
/*
 * UNKNOWN – Web-Push (Benachrichtigungen, wenn die App zu ist), ohne externe Bibliothek.
 * RFC 8291 (aes128gcm) + VAPID (RFC 8292, ES256). Schlüssel werden einmal erzeugt und im Store abgelegt
 * (oder per VAPID_PUBLIC / VAPID_PRIVATE vorgegeben, jeweils base64url: öffentlicher Punkt 65 Byte, privater Wert 32 Byte).
 */
const crypto = require('node:crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(String(s), 'base64url');
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

function generateVapid() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), unb64u(jwk.x), unb64u(jwk.y)]);
  return { publicKey: b64u(pub), privateKey: jwk.d };
}

function vapidKeyObject(pubB64, privB64) {
  const pub = unb64u(pubB64);
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: privB64 }, format: 'jwk' });
}

function vapidHeader(endpoint, pubB64, privB64, subject) {
  const aud = new URL(endpoint).origin;
  const enc = (o) => b64u(JSON.stringify(o));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })}`;
  const sig = crypto.sign('sha256', Buffer.from(unsigned), { key: vapidKeyObject(pubB64, privB64), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64u(sig)}, k=${pubB64}`;
}

/** Nachricht für ein Abo (keys.p256dh, keys.auth) verschlüsseln. */
function encrypt(sub, payload, ephemeral = crypto.createECDH('prime256v1'), salt = crypto.randomBytes(16)) {
  const uaPublic = unb64u(sub.keys.p256dh);
  const authSecret = unb64u(sub.keys.auth);
  ephemeral.generateKeys();
  const asPublic = ephemeral.getPublicKey();
  const shared = ephemeral.computeSecret(uaPublic);
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

class Pusher {
  constructor(store, env = process.env, fetchFn = fetch) {
    this.store = store; this.env = env; this.fetch = fetchFn; this.ready = null; this.pub = null; this.priv = null;
  }
  init() {
    if (!this.ready) {
      this.ready = (async () => {
        let pub = this.env.VAPID_PUBLIC; let priv = this.env.VAPID_PRIVATE;
        if (!pub || !priv) {
          pub = await this.store.getKV('vapid_public'); priv = await this.store.getKV('vapid_private');
          if (!pub || !priv) {
            const k = generateVapid(); pub = k.publicKey; priv = k.privateKey;
            await this.store.putKV('vapid_public', pub); await this.store.putKV('vapid_private', priv);
          }
        }
        this.pub = pub; this.priv = priv;
        return true;
      })().catch((e) => { console.error('Push nicht verfügbar:', e.message); return false; });
    }
    return this.ready;
  }
  async key() { return (await this.init()) ? this.pub : null; }
  /** Sendet an alle Abos; liefert die noch gültigen zurück (abgelaufene 404/410 fallen heraus). */
  async send(subs, payload) {
    if (!subs || !subs.length || !(await this.init())) return subs || [];
    const keep = [];
    await Promise.all(subs.map(async (sub) => {
      try {
        const res = await this.fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '3600', Urgency: 'high',
            Authorization: vapidHeader(sub.endpoint, this.pub, this.priv, this.env.VAPID_SUBJECT || 'mailto:admin@unknown-game.example'),
          },
          body: encrypt(sub, JSON.stringify(payload)),
        });
        if (res.status !== 404 && res.status !== 410) keep.push(sub);
      } catch { keep.push(sub); }
    }));
    return keep;
  }
}

module.exports = { Pusher, generateVapid, encrypt, vapidHeader, b64u, unb64u };
