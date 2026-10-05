'use strict';
/* UNKNOWN – Ranked: Rating (Elo-Variante für 2–4 Spieler) und Ligen. */

const START_RATING = 1000;

/** Ligen mit Mindest-Rating. Belohnung (Gold + Hut) gibt es einmalig beim ersten Erreichen. */
const LEAGUES = [
  { id: 'bronze', name: 'Bronze', min: 0, icon: '🥉', gold: 0, hat: null },
  { id: 'silber', name: 'Silber', min: 1100, icon: '🥈', gold: 150, hat: 'liga_silber' },
  { id: 'gold', name: 'Gold', min: 1300, icon: '🥇', gold: 300, hat: 'liga_gold' },
  { id: 'platin', name: 'Platin', min: 1500, icon: '💠', gold: 500, hat: 'liga_platin' },
  { id: 'diamant', name: 'Diamant', min: 1700, icon: '💎', gold: 800, hat: 'liga_diamant' },
  { id: 'meister', name: 'Meister', min: 1900, icon: '👑', gold: 1500, hat: 'liga_meister' },
];

function leagueOf(rating) {
  let l = LEAGUES[0];
  for (const x of LEAGUES) if (rating >= x.min) l = x;
  return l;
}

function nextLeague(rating) {
  return LEAGUES.find((x) => x.min > rating) || null;
}

const expected = (ra, rb) => 1 / (1 + 10 ** ((rb - ra) / 400));

/**
 * Rating-Änderung nach einer Partie.
 * players: [{ id, rating, played }]  winnerId: Gewinner oder null (kein Sieger -> keine Änderung)
 * Der Sieger gewinnt im Schnitt gegen alle Gegner, jeder Verlierer verliert gegen den Sieger.
 * Neue Spieler (< 10 Ranked-Partien) bewegen sich schneller.
 */
function ratingDeltas(players, winnerId) {
  const out = {};
  const w = players.find((p) => p.id === winnerId);
  if (!w || players.length < 2) {
    for (const p of players) out[p.id] = 0;
    return out;
  }
  const k = (p) => ((p.played || 0) < 10 ? 40 : 28);
  const others = players.filter((p) => p.id !== winnerId);
  const gain = others.reduce((s, o) => s + (1 - expected(w.rating, o.rating)), 0) / others.length;
  out[w.id] = Math.max(6, Math.round(k(w) * gain));
  for (const o of others) {
    out[o.id] = -Math.max(4, Math.round(k(o) * expected(o.rating, w.rating)));
  }
  return out;
}

/** Strafe für Aufgeben/Verlassen einer laufenden Ranked-Partie. */
const LEAVE_PENALTY = 20;

module.exports = { START_RATING, LEAGUES, leagueOf, nextLeague, ratingDeltas, LEAVE_PENALTY };
