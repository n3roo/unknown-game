'use strict';
/*
 * UNKNOWN – Konten (Anmeldung per E-Mail-Code oder Google).
 *
 * Idee: Das bisherige Geräte-Profil bleibt bestehen. Ein Konto ist nur eine Zuordnung
 *   E-Mail (gehasht)  ->  Profil-ID
 * Meldet sich ein anderes Gerät an, wird dessen Geräte-Profil per "Link" auf das Konto-Profil umgeleitet.
 * Passwörter gibt es nicht: E-Mail-Einmalcode (6 Ziffern, 10 Min. gültig) oder Google-ID-Token.
 *
 * Umgebung:
 *   RESEND_API_KEY + MAIL_FROM   E-Mail-Versand über resend.com (sonst ist E-Mail-Anmeldung aus)
 *   GOOGLE_CLIENT_ID             OAuth-Client-ID aus der Google Cloud Console (sonst ist Google-Login aus)
 */
const crypto = require('node:crypto');

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_TRIES = 5;
const MAX_REQUESTS_PER_HOUR = 5;

const normEmail = (e) => String(e ?? '').trim().toLowerCase();
const validEmail = (e) => e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const emailKey = (email) => `acct:${crypto.createHash('sha256').update(`unknown-mail:${normEmail(email)}`).digest('hex').slice(0, 40)}`;
const linkKey = (deviceId) => `link:${deviceId}`;
const hashCode = (email, code) => crypto.createHash('sha256').update(`unknown-code:${normEmail(email)}:${code}`).digest('hex');

/** Verschickt eine Mail über Resend. */
async function resendMail({ to, subject, text }, env = process.env, fetchFn = fetch) {
  const res = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text }),
  });
  if (!res.ok) throw new Error(`Mailversand fehlgeschlagen (${res.status})`);
}

class Auth {
  /**
   * @param store    Profil-Speicher mit getKV/putKV/delKV
   * @param opts     { mail(fn), googleClientId, fetch, now }
   */
  constructor(store, opts = {}) {
    this.store = store;
    this.env = opts.env || process.env;
    this.fetch = opts.fetch || fetch;
    this.now = opts.now || Date.now;
    this.googleClientId = opts.googleClientId ?? this.env.GOOGLE_CLIENT_ID ?? '';
    this.mail = opts.mail || (this.env.RESEND_API_KEY && this.env.MAIL_FROM ? (m) => resendMail(m, this.env, this.fetch) : null);
    this.codes = new Map(); // email -> { hash, exp, tries }
    this.requests = new Map(); // email|ip -> [timestamps]
  }

  /** Was der Client anzeigen darf. */
  config() { return { email: !!this.mail, google: this.googleClientId || null }; }

  limited(key) {
    const t = this.now();
    const list = (this.requests.get(key) || []).filter((x) => t - x < 3600e3);
    if (list.length >= MAX_REQUESTS_PER_HOUR) { this.requests.set(key, list); return true; }
    list.push(t); this.requests.set(key, list);
    return false;
  }

  /** Einmalcode per Mail senden. */
  async requestCode(emailRaw, ip = '') {
    const email = normEmail(emailRaw);
    if (!this.mail) return { error: 'Anmeldung per E-Mail ist gerade nicht verfügbar.' };
    if (!validEmail(email)) return { error: 'Bitte eine gültige E-Mail-Adresse eingeben.' };
    if (this.limited(`m:${email}`) || (ip && this.limited(`i:${ip}`))) return { error: 'Zu viele Versuche. Bitte warte eine Stunde.' };
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    this.codes.set(email, { hash: hashCode(email, code), exp: this.now() + CODE_TTL_MS, tries: 0 });
    try {
      await this.mail({ to: email, subject: `Dein UNKNOWN-Code: ${code}`, text: `Dein Anmelde-Code für UNKNOWN lautet ${code}.\nEr ist 10 Minuten gültig. Wenn du ihn nicht angefordert hast, ignoriere diese Mail.` });
    } catch (err) {
      this.codes.delete(email);
      return { error: 'Die E-Mail konnte nicht gesendet werden. Bitte später erneut versuchen.' };
    }
    return { ok: true };
  }

  /** Einmalcode prüfen. */
  verifyCode(emailRaw, codeRaw) {
    const email = normEmail(emailRaw);
    const entry = this.codes.get(email);
    if (!entry || entry.exp < this.now()) return { error: 'Der Code ist abgelaufen. Bitte neu anfordern.' };
    if (++entry.tries > MAX_TRIES) { this.codes.delete(email); return { error: 'Zu viele falsche Eingaben. Bitte neuen Code anfordern.' }; }
    const got = hashCode(email, String(codeRaw ?? '').replace(/\D/g, ''));
    const ok = got.length === entry.hash.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(entry.hash));
    if (!ok) return { error: 'Der Code stimmt nicht.' };
    this.codes.delete(email);
    return { ok: true, email, provider: 'email' };
  }

  /** Google-ID-Token prüfen (über Googles tokeninfo-Endpunkt). */
  async verifyGoogle(credential) {
    if (!this.googleClientId) return { error: 'Google-Anmeldung ist gerade nicht verfügbar.' };
    const tok = String(credential ?? '');
    if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(tok) || tok.length > 4000) return { error: 'Ungültige Google-Anmeldung.' };
    let info;
    try {
      const res = await this.fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tok)}`);
      if (!res.ok) return { error: 'Google-Anmeldung fehlgeschlagen.' };
      info = await res.json();
    } catch { return { error: 'Google ist gerade nicht erreichbar.' }; }
    const okAud = info.aud === this.googleClientId;
    const okIss = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
    const okExp = Number(info.exp) * 1000 > this.now();
    const verified = info.email_verified === true || info.email_verified === 'true';
    const email = normEmail(info.email);
    if (!okAud || !okIss || !okExp || !verified || !validEmail(email)) return { error: 'Google-Anmeldung fehlgeschlagen.' };
    return { ok: true, email, provider: 'google' };
  }

  /* ---------------------------------------------------- Konto-Zuordnung */

  async accountProfile(email) { return this.store.getKV(emailKey(email)); }
  async bind(email, profileId) { await this.store.putKV(emailKey(email), profileId); }
  async unbind(email) { await this.store.delKV(emailKey(email)); }

  /** Geräte-Profil -> Konto-Profil (oder dieselbe ID, wenn kein Link besteht). */
  async resolve(deviceId) { return (await this.store.getKV(linkKey(deviceId))) || deviceId; }
  async link(deviceId, targetId) { if (deviceId === targetId) await this.store.delKV(linkKey(deviceId)); else await this.store.putKV(linkKey(deviceId), targetId); }
  async unlink(deviceId) { await this.store.delKV(linkKey(deviceId)); }
}

module.exports = { Auth, normEmail, validEmail, emailKey, resendMail };
