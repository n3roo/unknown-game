'use strict';
/*
 * UNKNOWN – Bot-Spieler. Ein Bot nutzt nur das, was ein Mensch auch sieht (viewFor):
 * fremde Geheimkarten, eigene Hand und alle offenen Stapel. Daraus schließt er, welche Karten
 * seine Geheimkarte noch sein können, und spielt immer die Karte, die den Kreis am besten halbiert.
 */
const G = require('./game');

const ALL = Array.from({ length: G.CARD_COUNT }, (_, i) => i);

/** Welche Karten kann meine Geheimkarte noch sein? */
function candidates(view) {
  const me = view.players[view.you];
  const known = new Set(view.hand);
  for (const p of view.players) {
    if (p.secret !== null && p.id !== view.youId) known.add(p.secret);
    for (const c of p.related || []) known.add(c);
    for (const c of p.notRelated || []) known.add(c);
  }
  return ALL.filter((id) => {
    if (known.has(id)) return false;
    for (const c of me.related || []) if (!G.cardsMatch(id, c)) return false;
    for (const c of me.notRelated || []) if (G.cardsMatch(id, c)) return false;
    return true;
  });
}

const pick = (arr, rnd) => arr[Math.floor(rnd() * arr.length)];

/** Entscheidung für einen Bot. Gibt { type, ... } zurück oder null, wenn er gerade nichts tun muss. */
function decide(g, botId, rnd = Math.random) {
  const view = G.viewFor(g, botId);
  const me = view.players[view.you];
  if (!me || me.out) return null;

  if (view.pending && view.pending.type === 'flip') {
    if (view.pending.player !== botId) return null;
    const pile = me.flipped.related ? 'notRelated' : me.flipped.notRelated ? 'related' : (me.relatedCount <= me.notRelatedCount ? 'related' : 'notRelated');
    return { type: 'flip', pile };
  }

  if (view.phase === 'clues') {
    if (me.clueGiven || !view.clue) return null;
    return { type: 'clue', card: pick(view.clue.allowed, rnd) };
  }

  if (view.phase !== 'playing' || view.current !== view.you) return null;

  const cand = candidates(view);
  const slip = rnd(); // etwas Menschlichkeit: Bots sind nicht perfekt
  const guessId = (id) => { const d = G.decode(id); return { type: 'guess', c: d.c, a: d.a, l: d.l }; };
  if (cand.length === 0) {
    // Widerspruch (z. B. umgedrehter Stapel): raten, so gut es geht
    return { type: 'guess', c: Math.floor(rnd() * 7), a: Math.floor(rnd() * 7), l: Math.floor(rnd() * 7) };
  }
  if (cand.length === 1 && slip < 0.8) return guessId(cand[0]);
  if (cand.length === 2 && slip < 0.15) return guessId(pick(cand, rnd)); // gewagter Tipp
  if (cand.length > 1 && slip > 0.65 && view.hand.length) return { type: 'play', card: pick(view.hand, rnd) }; // nicht immer die klügste Karte

  let best = null;
  for (const card of view.hand) {
    const k = cand.filter((id) => G.cardsMatch(id, card)).length;
    if (k === 0 || k === cand.length) continue; // bringt keine Information
    const score = Math.abs(k - cand.length / 2);
    if (!best || score < best.score) best = { card, score };
  }
  if (best) return { type: 'play', card: best.card };
  if (cand.length === 1) return guessId(cand[0]);
  return guessId(pick(cand, rnd));
}

/** Führt die Entscheidung im Spiel aus. Gibt das Ergebnis von G.* zurück (oder null). */
function act(g, botId, rnd = Math.random) {
  const d = decide(g, botId, rnd);
  if (!d) return null;
  if (d.type === 'clue') return G.giveClue(g, botId, d.card);
  if (d.type === 'play') return G.playCard(g, botId, d.card);
  if (d.type === 'guess') return G.guess(g, botId, d.c, d.a, d.l);
  if (d.type === 'flip') return G.flipPile(g, botId, d.pile);
  return null;
}

const BOT_NAMES = ['Rusty', 'Calamity', 'Doc Bolt', 'Lasso-Lou', 'Dusty', 'Miss Mojo', 'Sheriff Zed', 'Tumbleweed'];

module.exports = { candidates, decide, act, BOT_NAMES };
