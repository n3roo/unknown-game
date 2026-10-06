'use strict';
/*
 * UNKNOWN – Profile, Gold, Hüte, Ranked-Ergebnisse. Reine Logik (kein Netzwerk, kein Speicher),
 * damit sie sich gut testen lässt. Der Server ruft diese Funktionen auf und speichert danach.
 */
const crypto = require('node:crypto');
const { START_RATING, LEAGUES, leagueOf, ratingDeltas, LEAVE_PENALTY } = require('./rating');
const HATS = require('../public/data/hats.json');
const AVATAR_DEFS = require('../public/data/avatars.json');
const M = require('./missions');
const { dayKey } = require('./day');

const START_GOLD = 150;
const CASUAL_REWARDED_PER_DAY = 6;
const GOLD = {
  casualWin: 40,
  casualPlay: 10,
  rankedWin: 120,
  rankedPlay: 30,
  botWin: 15,
  botPlay: 5,
  firstWinOfDay: 60,
};
const XP = { play: 20, win: 30 };

const REGIONS = [
  'DE', 'AT', 'CH', 'LU', 'NL', 'BE', 'FR', 'IT', 'ES', 'PT', 'GB', 'IE', 'DK', 'SE', 'NO', 'FI', 'PL', 'CZ', 'HU', 'RO',
  'GR', 'TR', 'UA', 'RU', 'US', 'CA', 'MX', 'BR', 'AR', 'AU', 'NZ', 'JP', 'KR', 'CN', 'IN', 'ZA', 'EG', 'AE', 'IL', 'OTHER',
];

const today = (now = Date.now()) => dayKey(now);

/** Profil-ID aus dem geheimen Geräteschlüssel (der Schlüssel selbst wird nie gespeichert). */
function profileIdFor(secret) {
  return crypto.createHash('sha256').update(`unknown:${secret}`).digest('hex').slice(0, 24);
}

function levelOf(xp) {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 40));
}

function newProfile(id, now = Date.now()) {
  return {
    id,
    name: 'Spieler',
    avatar: 'weiss',
    hat: null,
    region: 'DE',
    gold: START_GOLD,
    xp: 0,
    rating: START_RATING,
    rankedPlayed: 0,
    rankedWins: 0,
    played: 0,
    wins: 0,
    hats: [],
    avatars: [],
    leaguesClaimed: ['bronze'],
    daily: { date: today(now), rewarded: 0, won: false },
    createdAt: now,
  };
}

/** Was andere Spieler und der Besitzer selbst sehen dürfen. */
function publicView(p) {
  const l = leagueOf(p.rating);
  return {
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    hat: p.hat,
    region: p.region,
    rating: p.rating,
    league: l.id,
    level: levelOf(p.xp),
  };
}
function selfView(p) {
  return {
    ...publicView(p),
    gold: p.gold,
    xp: p.xp,
    hats: p.hats,
    avatars: p.avatars || [],
    rankedPlayed: p.rankedPlayed,
    rankedWins: p.rankedWins,
    played: p.played,
    wins: p.wins,
    leaguesClaimed: p.leaguesClaimed,
    ...M.view(p),
  };
}

function rollDaily(p, now = Date.now()) {
  const d = today(now);
  if (!p.daily || p.daily.date !== d) p.daily = { date: d, rewarded: 0, won: false };
}

const hatById = (id) => HATS.find((h) => h.id === id) || null;

function buyHat(p, hatId) {
  const h = hatById(hatId);
  if (!h) return { error: 'Diesen Hut gibt es nicht.' };
  if (h.special) return { error: 'Diesen Hut kann man nicht kaufen.' };
  if (h.league) return { error: 'Diesen Hut bekommst du als Belohnung in der Rangliste.' };
  if (p.hats.includes(hatId)) return { error: 'Den Hut hast du schon.' };
  if (p.gold < h.price) return { error: `Dir fehlen ${h.price - p.gold} Gold.` };
  p.gold -= h.price;
  p.hats.push(hatId);
  M.bump(p, 'bought');
  return { ok: true };
}

const avatarDef = (id) => AVATAR_DEFS.find((a) => a.id === id) || null;
/** Frei nutzbar (kostenlos) oder gekauft. */
const ownsAvatar = (p, id) => { const a = avatarDef(id); return !!a && (!a.price || (p.avatars || []).includes(id)); };

function buyAvatar(p, id) {
  const a = avatarDef(id);
  if (!a) return { error: 'Diesen Avatar gibt es nicht.' };
  if (!a.price) return { error: 'Dieser Avatar ist kostenlos.' };
  if (!p.avatars) p.avatars = [];
  if (p.avatars.includes(id)) return { error: 'Den Avatar hast du schon.' };
  if (p.gold < a.price) return { error: `Dir fehlen ${a.price - p.gold} Gold.` };
  p.gold -= a.price;
  p.avatars.push(id);
  M.bump(p, 'bought');
  return { ok: true };
}

/** Alte oder unbekannte Avatare auf einen freien zurücksetzen (z. B. entfernte Figur). */
function fixAvatar(p) {
  if (!p.avatars) p.avatars = [];
  if (!ownsAvatar(p, p.avatar)) p.avatar = 'weiss';
  // Einmalig: Ranking startet jetzt bei 0 (früher 1000)
  if (!p.rv2) { p.rv2 = true; p.rating = Math.max(0, (p.rating || 0) - 1000); }
}

function equipHat(p, hatId) {
  if (hatId === null || hatId === undefined) {
    p.hat = null;
    return { ok: true };
  }
  if (!p.hats.includes(hatId)) return { error: 'Diesen Hut besitzt du nicht.' };
  p.hat = hatId;
  return { ok: true };
}

function cleanName(raw) {
  const s = String(raw ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
  return s || 'Spieler';
}

/** Anzeige-Einstellungen ändern (Name, Avatar, Land). */
function updateSettings(p, { name, avatar, region }, avatarIds) {
  if (name !== undefined) p.name = cleanName(name);
  if (avatar !== undefined && avatarIds.includes(avatar) && ownsAvatar(p, avatar)) p.avatar = avatar;
  if (region !== undefined && REGIONS.includes(region)) p.region = region;
}

/** Rating ändern und Liga-Belohnungen vergeben. Gibt Infos für die Ergebnisanzeige zurück. */
function applyRating(p, delta) {
  const before = p.rating;
  p.rating = Math.max(0, p.rating + delta);
  const info = { ratingBefore: before, ratingAfter: p.rating, leagueUp: null, bonusGold: 0, newHat: null };
  for (const l of LEAGUES) {
    if (p.rating >= l.min && !p.leaguesClaimed.includes(l.id)) {
      p.leaguesClaimed.push(l.id);
      p.gold += l.gold;
      info.bonusGold += l.gold;
      info.leagueUp = l.id;
      if (l.hat && !p.hats.includes(l.hat)) {
        p.hats.push(l.hat);
        info.newHat = l.hat;
      }
    }
  }
  return info;
}

/**
 * Wertet eine beendete Partie aus.
 * entries: [{ profile, id (Spieler-ID im Spiel) }]; winnerId = Spieler-ID im Spiel oder null.
 * Ändert die Profile direkt und gibt pro Spieler-ID die Belohnungen zurück.
 */
function settleGame({ entries, winnerId, ranked, botGame = false, now = Date.now() }) {
  const out = {};
  const humans = entries.length;
  const deltas = ranked
    ? ratingDeltas(entries.map((e) => ({ id: e.id, rating: e.profile.rating, played: e.profile.rankedPlayed })), winnerId)
    : {};
  for (const e of entries) {
    const p = e.profile;
    rollDaily(p, now);
    const won = e.id === winnerId;
    const r = { gold: 0, xp: XP.play + (won ? XP.win : 0), won, ranked: !!ranked, capped: false, dailyBonus: 0 };
    if (!botGame) { // Übungsrunden gegen Bots zählen nicht für Statistik und Tagesaufgaben
      p.played += 1;
      if (won) p.wins += 1;
      M.track(p, { won, ranked: !!ranked }, now);
      if (won && ranked) M.bump(p, 'rankedwon', 1, now);
      if (!ranked && entries.length >= 2) M.bump(p, 'lobby', 1, now);
    } else if (won) {
      M.bump(p, 'botwon', 1, now);
    }

    let gold = 0;
    if (humans >= 2 || botGame) {
      if (ranked) gold = won ? GOLD.rankedWin : GOLD.rankedPlay;
      else if (botGame) {
        p.daily.bots = (p.daily.bots || 0) + 1; // eigenes kleines Tageslimit, verbraucht nicht die echten Runden
        if (p.daily.bots <= 3) gold = won ? GOLD.botWin : GOLD.botPlay; else r.capped = true;
      } else if (p.daily.rewarded < CASUAL_REWARDED_PER_DAY) {
        gold = won ? GOLD.casualWin : GOLD.casualPlay;
        p.daily.rewarded += 1;
      } else r.capped = true;
      if (won && !p.daily.won && gold > 0 && !botGame) {
        p.daily.won = true;
        r.dailyBonus = GOLD.firstWinOfDay;
        gold += GOLD.firstWinOfDay;
      }
    }
    p.gold += gold;
    r.gold = gold;

    const oldLevel = levelOf(p.xp);
    p.xp += r.xp;
    r.levelUp = levelOf(p.xp) > oldLevel ? levelOf(p.xp) : null;

    if (ranked) {
      p.rankedPlayed += 1;
      if (won) p.rankedWins += 1;
      Object.assign(r, applyRating(p, deltas[e.id] || 0));
      r.ratingDelta = r.ratingAfter - r.ratingBefore;
      r.gold += r.bonusGold;
    }
    out[e.id] = r;
  }
  return out;
}

/** Spieler verlässt eine laufende Ranked-Partie: Niederlage + Strafe, kein Gold. */
function applyLeave(p) {
  p.played += 1;
  p.rankedPlayed += 1;
  const info = applyRating(p, -LEAVE_PENALTY);
  return { ...info, ratingDelta: info.ratingAfter - info.ratingBefore };
}

module.exports = {
  M, HATS, REGIONS, GOLD, START_GOLD, CASUAL_REWARDED_PER_DAY,
  profileIdFor, newProfile, publicView, selfView, buyHat, equipHat, buyAvatar, ownsAvatar, fixAvatar, updateSettings, cleanName,
  settleGame, applyLeave, applyRating, levelOf, hatById, rollDaily,
};
