'use strict';
/* Lustige Hüte als SVG. Alle: viewBox 100x70, Unterkante (Kopfkontakt) bei y≈66, Mitte x=50. */
(() => {
  const O = 'stroke="#2a1a0c" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"';
  const svg = (inner, defs = '') => `<svg viewBox="0 0 100 70" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${defs ? `<defs>${defs}</defs>` : ''}${inner}</svg>`;
  const grad = (id, a, b) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;

  function crown(id, main, dark, gem, gem2) {
    return svg(`
      <path d="M14 62 L10 22 L33 40 L50 12 L67 40 L90 22 L86 62 Z" fill="url(#${id})" ${O}/>
      <rect x="13" y="56" width="74" height="10" rx="3" fill="${dark}" ${O}/>
      <circle cx="10" cy="21" r="5" fill="${gem2}" ${O}/><circle cx="90" cy="21" r="5" fill="${gem2}" ${O}/><circle cx="50" cy="11" r="6" fill="${gem2}" ${O}/>
      <ellipse cx="50" cy="42" rx="6" ry="8" fill="${gem}" ${O}/>
      <circle cx="30" cy="61" r="2.6" fill="${gem}"/><circle cx="50" cy="61" r="2.6" fill="${gem}"/><circle cx="70" cy="61" r="2.6" fill="${gem}"/>
      <path d="M22 30 L26 52" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"/>`, grad(id, main, dark));
  }

  const HATS = {
    basecap: svg(`
      <path d="M22 62 C20 30 38 14 56 16 C76 18 82 42 82 62 Z" fill="url(#g-bc)" ${O}/>
      <path d="M44 63 C54 70 94 70 98 60 C96 56 70 56 60 60 Z" fill="#d12f2f" ${O}/>
      <circle cx="54" cy="16" r="3.4" fill="#a82020" ${O}/>
      <path d="M36 28 C42 20 52 18 56 18" stroke="rgba(255,255,255,.5)" stroke-width="3" fill="none" stroke-linecap="round"/>`, grad('g-bc', '#4f86ee', '#2a52b8')),
    muetze: svg(`
      <path d="M18 62 C16 34 30 18 50 18 C70 18 84 34 82 62 Z" fill="url(#g-mu)" ${O}/>
      <rect x="14" y="52" width="72" height="14" rx="7" fill="#f2f0ea" ${O}/>
      <path d="M26 54 V64 M38 54 V64 M50 54 V64 M62 54 V64 M74 54 V64" stroke="#d4cfc2" stroke-width="2.2"/>
      <circle cx="50" cy="14" r="10" fill="#f2f0ea" ${O}/>
      <path d="M26 40 C32 30 38 26 44 24" stroke="rgba(255,255,255,.4)" stroke-width="3" fill="none" stroke-linecap="round"/>`, grad('g-mu', '#e44a4a', '#a62828')),
    partyhut: svg(`
      <path d="M50 8 L82 64 L18 64 Z" fill="url(#g-pa)" ${O}/>
      <path d="M38 34 L62 34 M31 48 L69 48" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/>
      <circle cx="46" cy="25" r="3" fill="#ffd83a"/><circle cx="56" cy="42" r="3" fill="#4be08a"/><circle cx="42" cy="56" r="3" fill="#ff5a8a"/><circle cx="62" cy="57" r="3" fill="#6ad4ff"/>
      <path d="M16 64 Q50 72 84 64" stroke="#2a1a0c" stroke-width="2.6" fill="#ffd83a"/>
      <circle cx="50" cy="8" r="7" fill="#ff4f6e" ${O}/>`, grad('g-pa', '#a35cf0', '#e0489a')),
    cowboy: svg(`
      <path d="M2 58 C14 66 30 62 36 56 L64 56 C70 62 86 66 98 58 C94 50 82 52 74 52 L26 52 C18 52 6 50 2 58 Z" fill="url(#g-cb2)" ${O}/>
      <path d="M26 54 C22 28 30 16 40 20 C46 24 54 24 60 20 C70 16 78 28 74 54 Z" fill="url(#g-cb)" ${O}/>
      <path d="M26 48 H74" stroke="#2a1a0c" stroke-width="6"/><rect x="45" y="44" width="10" height="9" rx="1.5" fill="#f2c22b" ${O}/>
      <path d="M32 30 C34 24 38 22 40 22" stroke="rgba(255,255,255,.35)" stroke-width="3" fill="none" stroke-linecap="round"/>`,
      grad('g-cb', '#b97a42', '#80491f') + grad('g-cb2', '#a96a35', '#6e3e18')),
    fez: svg(`
      <path d="M24 64 L32 22 L68 22 L76 64 Z" fill="url(#g-fz)" ${O}/>
      <ellipse cx="50" cy="22" rx="18" ry="5" fill="#d93a3a" ${O}/>
      <path d="M50 22 C60 22 70 28 72 46 L72 52" stroke="#f2c22b" stroke-width="3.2" fill="none" stroke-linecap="round"/>
      <circle cx="72" cy="55" r="3.8" fill="#f2c22b" ${O}/>
      <path d="M34 34 L38 58" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-linecap="round"/>`, grad('g-fz', '#d63030', '#9a1c1c')),
    koch: svg(`
      <path d="M22 66 V50 C8 46 8 24 26 22 C28 8 46 4 52 12 C60 4 76 8 76 22 C94 22 94 46 78 50 V66 Z" fill="#fbfbf7" ${O}/>
      <path d="M36 28 V60 M50 24 V62 M64 28 V60" stroke="#e1ddd2" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="22" y="56" width="56" height="10" rx="3" fill="#ececE4" ${O}/>`),
    zylinder: svg(`
      <ellipse cx="50" cy="60" rx="46" ry="8" fill="#1d1d24" ${O}/>
      <path d="M26 60 L29 10 C40 6 60 6 71 10 L74 60 Z" fill="url(#g-zy)" ${O}/>
      <ellipse cx="50" cy="10" rx="21" ry="4.5" fill="#34343e" ${O}/>
      <path d="M27 48 L73 48 L74 58 L26 58 Z" fill="#c12b3a" ${O}/>
      <rect x="44" y="47" width="12" height="11" rx="2" fill="#f2c22b" ${O}/>
      <path d="M34 18 L36 44" stroke="rgba(255,255,255,.28)" stroke-width="3" stroke-linecap="round"/>`, grad('g-zy', '#3b3b46', '#16161c')),
    propeller: svg(`
      <path d="M16 64 C14 34 30 22 50 22 C70 22 86 34 84 64 Z" fill="url(#g-pr)" ${O}/>
      <path d="M50 22 C34 24 22 36 18 64" stroke="#f2c22b" stroke-width="12" fill="none" opacity=".0"/>
      <path d="M50 22 V32 M34 28 C40 40 44 56 44 64 M66 28 C60 40 56 56 56 64" stroke="#2a1a0c" stroke-width="0" />
      <path d="M50 22 C42 24 36 30 33 40 L36 64 L50 64 Z" fill="#ffd83a" opacity=".9"/>
      <path d="M16 64 C14 34 30 22 50 22 C70 22 86 34 84 64 Z" fill="none" ${O}/>
      <rect x="47" y="12" width="6" height="12" fill="#999" ${O}/>
      <g class="prop"><ellipse cx="32" cy="10" rx="20" ry="4.5" fill="#4be08a" ${O}/><ellipse cx="68" cy="10" rx="20" ry="4.5" fill="#ff5a8a" ${O}/></g>
      <circle cx="50" cy="10" r="4" fill="#ffd83a" ${O}/>`, grad('g-pr', '#4f86ee', '#e0489a')),
    pirat: svg(`
      <path d="M2 50 C8 24 26 12 50 12 C74 12 92 24 98 50 C88 58 74 56 64 62 C58 66 42 66 36 62 C26 56 12 58 2 50 Z" fill="url(#g-pi)" ${O}/>
      <path d="M2 50 C14 54 30 54 36 62 M98 50 C86 54 70 54 64 62" fill="none" stroke="#c9a53a" stroke-width="3" stroke-linecap="round"/>
      <ellipse cx="50" cy="34" rx="7" ry="8" fill="#f4f1e8" ${O}/>
      <circle cx="47" cy="33" r="1.8" fill="#222"/><circle cx="53" cy="33" r="1.8" fill="#222"/>
      <path d="M38 48 L62 54 M62 48 L38 54" stroke="#f4f1e8" stroke-width="3.4" stroke-linecap="round"/>`, grad('g-pi', '#3a3a46', '#17171d')),
    wikinger: svg(`
      <path d="M18 64 C14 30 32 16 50 16 C68 16 86 30 82 64 Z" fill="url(#g-wi)" ${O}/>
      <rect x="14" y="54" width="72" height="11" rx="4" fill="#8a5a30" ${O}/>
      <circle cx="26" cy="59.5" r="2.2" fill="#e0c070"/><circle cx="50" cy="59.5" r="2.2" fill="#e0c070"/><circle cx="74" cy="59.5" r="2.2" fill="#e0c070"/>
      <path d="M50 16 V54" stroke="#6b6f78" stroke-width="5" ${O}/>
      <path d="M20 40 C4 38 2 22 8 8 C14 16 20 22 24 30 Z" fill="#f4f0e2" ${O}/>
      <path d="M80 40 C96 38 98 22 92 8 C86 16 80 22 76 30 Z" fill="#f4f0e2" ${O}/>
      <path d="M30 32 C34 24 40 20 46 19" stroke="rgba(255,255,255,.5)" stroke-width="3" fill="none" stroke-linecap="round"/>`, grad('g-wi', '#a9aeb8', '#6a6f7a')),
    zauberer: svg(`
      <path d="M2 62 C22 70 78 70 98 62 C90 54 70 56 64 54 L50 4 L36 54 C30 56 10 54 2 62 Z" fill="url(#g-za)" ${O}/>
      <path d="M31 56 C44 60 56 60 69 56 L66 46 C54 50 46 50 34 46 Z" fill="#f2c22b" ${O}/>
      <path d="M50 18 l2.6 6 6.4.6 -4.8 4.2 1.5 6.3 -5.7 -3.4 -5.7 3.4 1.5 -6.3 -4.8 -4.2 6.4 -.6 Z" fill="#ffe36a" stroke="#2a1a0c" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="58" cy="38" r="2" fill="#ffe36a"/><circle cx="42" cy="34" r="1.6" fill="#ffe36a"/>`, grad('g-za', '#7a4ee0', '#3c1f9a')),
    krone: crown('g-kr', '#ffd24a', '#c8861a', '#e8323f', '#4be0ff'),
    liga_silber: crown('g-ls', '#eef0f5', '#8f97a6', '#6ab0ff', '#ffffff'),
    liga_gold: crown('g-lg', '#ffe066', '#d09a1c', '#e8323f', '#fff1a6'),
    liga_platin: crown('g-lp', '#c6f2ee', '#58b8b0', '#2fd9c8', '#ffffff'),
    liga_diamant: crown('g-ld', '#b4e6ff', '#3a8bd6', '#ffffff', '#7ad0ff'),
    dev: crown('g-dv', '#7dffb0', '#16a05a', '#ffffff', '#00e0ff'),
    liga_meister: crown('g-lm', '#ff9ad8', '#8a2bd6', '#ffe066', '#ff5a5a'),
  };

  /* Position je Avatar (Prozent des Bildes): x/y = Kopfoberseite-Mitte, w = Hutbreite. Siehe avatars.json "hat". */
  /* Gemalte Hüte (ChatGPT-Raster, via tools/process_hats.py) ersetzen die SVG-Platzhalter. */
  const img = (id) => `<img src="assets/hats/${id}.webp" alt="" draggable="false" decoding="async">`;
  for (const id of Object.keys(HATS)) HATS[id] = img(id);
  /* Skalierung je Hut (Mützen mit schmaler Basis größer, damit sie den Kopf umschließen) */
  window.HAT_FIT = { basecap: 1.25, muetze: 1.4, partyhut: 1.35, koch: 1.4, cowboy: 1.15, fez: 1.35, zylinder: 1.3, propeller: 1.3, pirat: 1.2, wikinger: 1.3, zauberer: 1.4,
    krone: 1.35, liga_silber: 1.35, liga_gold: 1.35, liga_platin: 1.35, liga_diamant: 1.35, liga_meister: 1.35, dev: 1.4 };
  /* Aufsetz-Tiefe je Hut in % der Hutbox (größer = sitzt höher): flache Böden (Koch, Zylinder, Fez) höher, Mützen tiefer */
  window.HAT_SINK = { koch: 92, zylinder: 90, fez: 90, partyhut: 86, zauberer: 86, muetze: 83, basecap: 85, propeller: 85, cowboy: 84, pirat: 84, wikinger: 86,
    krone: 82, liga_silber: 82, liga_gold: 82, liga_platin: 82, liga_diamant: 82, liga_meister: 82, dev: 82 };
  window.HATS = HATS;
})();
