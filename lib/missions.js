'use strict';
/* UNKNOWN – Tagesbelohnung (Serie über 7 Tage) und tägliche Missionen. Reine Logik. */
const { dayKey, prevDayKey } = require('./day');

const DAILY = [20, 30, 40, 50, 60, 80, 150]; // Gold für Tag 1..7 der Serie

const POOL = [
  { id: 'play3', text: 'Spiele 3 Runden', stat: 'played', goal: 3, reward: 40 },
  { id: 'play5', text: 'Spiele 5 Runden', stat: 'played', goal: 5, reward: 70 },
  { id: 'win1', text: 'Gewinne 1 Runde', stat: 'won', goal: 1, reward: 50 },
  { id: 'win2', text: 'Gewinne 2 Runden', stat: 'won', goal: 2, reward: 100 },
  { id: 'ranked1', text: 'Spiele 1 Ranked-Partie', stat: 'ranked', goal: 1, reward: 60 },
  { id: 'ranked2', text: 'Spiele 2 Ranked-Partien', stat: 'ranked', goal: 2, reward: 110 },
];
const GROUPS = [['play3', 'play5'], ['win1', 'win2'], ['ranked1', 'ranked2']]; // jeden Tag eine Aufgabe je Gruppe

function hash(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const byId = (id) => POOL.find((m) => m.id === id);

function missionIdsFor(day) {
  return GROUPS.map((g, i) => g[hash(`${day}:${i}`) % g.length]);
}

/** Tageswechsel: Fortschritt und Abholungen zurücksetzen. */
function ensureDay(p, now = Date.now()) {
  const day = dayKey(now);
  if (!p.missions || p.missions.date !== day) p.missions = { date: day, progress: { played: 0, won: 0, ranked: 0 }, claimed: [] };
  if (!p.login) p.login = { last: null, streak: 0 };
  return day;
}

/** Nach einer gewerteten Partie aufrufen. */
function track(p, { won, ranked }, now = Date.now()) {
  ensureDay(p, now);
  p.missions.progress.played += 1;
  if (won) p.missions.progress.won += 1;
  if (ranked) p.missions.progress.ranked += 1;
}

function view(p, now = Date.now()) {
  const day = ensureDay(p, now);
  const last = p.login.last;
  const claimedToday = last === day;
  const alive = claimedToday || last === prevDayKey(now);
  const streak = alive ? p.login.streak : 0;
  const nextIndex = claimedToday ? (streak - 1) % 7 : streak % 7;
  return {
    daily: { streak, claimedToday, nextDay: nextIndex + 1, nextReward: DAILY[nextIndex], rewards: DAILY },
    missions: missionIdsFor(day).map((id) => {
      const m = byId(id);
      return { id, text: m.text, goal: m.goal, reward: m.reward, progress: Math.min(m.goal, p.missions.progress[m.stat]), claimed: p.missions.claimed.includes(id) };
    }),
  };
}

function claimDaily(p, now = Date.now()) {
  const day = ensureDay(p, now);
  if (p.login.last === day) return { error: 'Die Tagesbelohnung hast du heute schon geholt.' };
  const streak = p.login.last === prevDayKey(now) ? p.login.streak + 1 : 1;
  const gold = DAILY[(streak - 1) % 7];
  p.login = { last: day, streak };
  p.gold += gold;
  return { ok: true, gold, streak };
}

function claimMission(p, id, now = Date.now()) {
  const day = ensureDay(p, now);
  if (!missionIdsFor(day).includes(id)) return { error: 'Diese Mission gibt es heute nicht.' };
  const m = byId(id);
  if (p.missions.claimed.includes(id)) return { error: 'Schon abgeholt.' };
  if (p.missions.progress[m.stat] < m.goal) return { error: 'Die Mission ist noch nicht geschafft.' };
  p.missions.claimed.push(id);
  p.gold += m.reward;
  return { ok: true, gold: m.reward };
}

module.exports = { DAILY, POOL, missionIdsFor, ensureDay, track, view, claimDaily, claimMission };
