'use strict';
/*
 * UNKNOWN – Freundesliste.
 * Freundescode = die ersten 8 Zeichen der Profil-ID (nicht umkehrbar, ID selbst bleibt geheim).
 * Pro Profil: friends (Freunde), reqIn (erhaltene Anfragen), reqOut (gesendete Anfragen).
 */
const MAX_FRIENDS = 50;
const MAX_REQ = 30;

const codeOf = (id) => id.slice(0, 8).toUpperCase();
const prettyCode = (id) => `${codeOf(id).slice(0, 4)}-${codeOf(id).slice(4)}`;
/** Eingabe wie "ab12-cd34" → Präfix für die Suche oder null. */
function parseCode(raw) {
  const s = String(raw ?? '').toLowerCase().replace(/[^0-9a-f]/g, '');
  return s.length === 8 ? s : null;
}
function norm(p) {
  p.friends = p.friends || [];
  p.reqIn = p.reqIn || [];
  p.reqOut = p.reqOut || [];
  return p;
}
const drop = (arr, id) => { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); };

/** me schickt other eine Anfrage. Hat other schon angefragt, werden beide sofort Freunde. */
function request(me, other) {
  norm(me); norm(other);
  if (me.id === other.id) return { error: 'Das bist du selbst.' };
  if (me.friends.includes(other.id)) return { error: 'Ihr seid schon befreundet.' };
  if (me.reqIn.includes(other.id)) return accept(me, other);
  if (me.reqOut.includes(other.id)) return { error: 'Anfrage wurde schon gesendet.' };
  if (me.friends.length >= MAX_FRIENDS) return { error: 'Deine Freundesliste ist voll.' };
  if (me.reqOut.length >= MAX_REQ) return { error: 'Du hast zu viele offene Anfragen.' };
  if (other.reqIn.length >= MAX_REQ) return { error: 'Diese Person hat gerade zu viele Anfragen.' };
  me.reqOut.push(other.id);
  other.reqIn.push(me.id);
  return { ok: true, accepted: false };
}

function accept(me, other) {
  norm(me); norm(other);
  if (!me.reqIn.includes(other.id)) return { error: 'Keine Anfrage vorhanden.' };
  if (me.friends.length >= MAX_FRIENDS || other.friends.length >= MAX_FRIENDS) return { error: 'Freundesliste voll.' };
  drop(me.reqIn, other.id); drop(other.reqOut, me.id);
  drop(me.reqOut, other.id); drop(other.reqIn, me.id);
  if (!me.friends.includes(other.id)) me.friends.push(other.id);
  if (!other.friends.includes(me.id)) other.friends.push(me.id);
  return { ok: true, accepted: true };
}

function decline(me, other) {
  norm(me); norm(other);
  drop(me.reqIn, other.id); drop(other.reqOut, me.id);
  return { ok: true };
}

/** Freundschaft beenden bzw. eigene offene Anfrage zurückziehen. Die Bilanz wird dabei gelöscht. */
function remove(me, other) {
  norm(me); norm(other);
  for (const [a, b] of [[me, other], [other, me]]) {
    drop(a.friends, b.id); drop(a.reqIn, b.id); drop(a.reqOut, b.id);
    if (a.h2h) delete a.h2h[b.id];
  }
  return { ok: true };
}

/** Bilanz von `me` gegen einen Freund: w = Siege über ihn, l = Niederlagen gegen ihn. */
const record = (me, otherId) => ({ w: 0, l: 0, ...((me.h2h && me.h2h[otherId]) || {}) });

function bumpRecord(p, otherId, key) {
  p.h2h = p.h2h || {};
  const r = p.h2h[otherId] || { w: 0, l: 0 };
  r[key] += 1;
  p.h2h[otherId] = r;
}

/**
 * Nach einer Partie mit Menschen: Der Sieger bekommt gegen jeden befreundeten Mitspieler einen Sieg,
 * dieser eine Niederlage. Nur zwischen Freunden, damit die Daten klein bleiben.
 */
function recordGame(winner, others) {
  norm(winner);
  for (const o of others) {
    norm(o);
    if (o.id === winner.id || !winner.friends.includes(o.id) || !o.friends.includes(winner.id)) continue;
    bumpRecord(winner, o.id, 'w');
    bumpRecord(o, winner.id, 'l');
  }
}

module.exports = { MAX_FRIENDS, MAX_REQ, codeOf, prettyCode, parseCode, norm, request, accept, decline, remove, record, recordGame };
