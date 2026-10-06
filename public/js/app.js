'use strict';
/* UNKNOWN – Client. Der Server hält den Spielstand; hier wird nur angezeigt und angefragt. */
(() => {
  const N = 7;
  const $app = document.getElementById('app');
  const $modal = document.getElementById('modal-root');
  const $toast = document.getElementById('toast');

  const LS = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* egal */ } },
  };

  const S = {
    data: null,
    ws: null,
    open: false,
    queue: [],
    session: LS.get('unknown.session'),
    profile: LS.get('unknown.profile') || { name: '', avatar: null },
    st: null,
    code: null,
    setId: null,
    leaving: false,
    reconnectDelay: 800,
    noReconnect: false,
    pingTimer: null,
    me: null, friends: null, regions: [], leagues: [], storeKind: null, hatsDef: [], q: null, lb: null, ranked: false, rewards: null,
    secret: null,
    ui: { prevHat: null, lbScope: 'world', drawer: null, marks: { c: {}, a: {}, l: {} }, sel: null, modal: null, guess: { sel: {} }, pickAvatar: false, hideEnd: false },
  };

  /* ------------------------------------------------------ Helfer */

  function deviceSecret() {
    let sec = LS.get('unknown.secret');
    if (!(typeof sec === 'string' && /^[0-9a-f]{32,64}$/.test(sec))) {
      const b = new Uint8Array(24); crypto.getRandomValues(b);
      sec = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      LS.set('unknown.secret', sec);
    }
    return sec;
  }
  const flag = (code) => (code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🌍');
  let regionNames = null;
  const regionName = (code) => { try { regionNames = regionNames || new Intl.DisplayNames(['de'], { type: 'region' }); return regionNames.of(code); } catch { return code; } };
  const leagueDef = (id) => S.leagues.find((l) => l.id === id) || { id, name: id, icon: '🏅', min: 0 };
  const hatDef = (id) => S.hatsDef.find((h) => h.id === id);
  const leagueFor = (rating) => { let l = S.leagues[0] || { id: 'bronze', name: 'Bronze', icon: '🥉', min: 0 }; for (const x of S.leagues) if (rating >= x.min) l = x; return l; };


  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dec = (id) => { const c = Math.floor(id / N); const a = id % N; return { c, a, l: (c + a) % N }; };
  const match = (x, y) => { const A = dec(x); const B = dec(y); return A.c === B.c || A.a === B.a || A.l === B.l; };

  let toastTimer = null;
  function toast(text, isError = false) {
    $toast.textContent = text;
    $toast.className = 'show' + (isError ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.className = ''; }, 3000);
  }

  function setDef() {
    const sets = S.data.sets.sets;
    return sets.find((s) => s.id === S.setId) || sets[0];
  }
  /** id (Zahl) oder { c, a, l } -> die drei Merkmale als Objekte */
  function feats(x) {
    const { c, a, l } = typeof x === 'object' ? x : dec(x);
    const sh = S.data.sets.shared;
    return { c: setDef().characters[c], a: sh.accessories[a], l: sh.locations[l] };
  }
  const avatarDef = (id) => S.data.avatars.find((a) => a.id === id) || S.data.avatars[0];
  const byId = (id) => (S.st ? S.st.players.find((p) => p.id === id) : null);

  /* --------------------------------------------------- Bausteine */

  /** Karte: Charakter mit Kopfbedeckung/Accessoire vor dem Ort, in einem Bild. */
  function cardHTML(x, cls = '') {
    const f = feats(x);
    const ch = f.c; const ac = f.a; const hd = ch.head; const w = ac.wear;
    const label = `${ch.name}, ${ac.name}, ${f.l.name}`;
    const left = (hd.cx * 100).toFixed(1);
    const width = (hd.w * w.scale * 100).toFixed(1);
    let top; let tf;
    if (w.type === 'eyes') { top = hd.eye * 100; tf = 'translate(-50%,-50%)'; }
    else if (w.type === 'phones') { top = (hd.top + w.dy * hd.hh) * 100; tf = 'translate(-50%,-66%)'; }
    else { top = (hd.top + w.dy * hd.hh) * 100; tf = `translate(-50%,-100%) rotate(${w.rot || 0}deg)`; }
    const accImg = `<img class="acc ${w.behind ? 'behind' : ''}" src="${esc(ac.cut)}" alt="" draggable="false" style="left:${left}%;top:${top.toFixed(1)}%;width:${width}%;transform:${tf}">`;
    /* Sobald fertig gemalte Karten existieren: sets.json -> "cardArt": "assets/cards/western/{id}.webp".
       Das Bild liegt dann über der Platzhalter-Komposition; fehlt eine Datei, bleibt die Komposition sichtbar. */
    const id = typeof x === 'object' ? x.c * N + x.a : x;
    const art = setDef().cardArt && (setDef().cardArtIds || []).includes(id)
      ? `<img class="art" src="${esc(setDef().cardArt.replace('{id}', id))}" alt="" draggable="false" loading="lazy" onload="this.closest('.card').classList.add('painted')" onerror="this.remove()">` : '';
    return `<div class="card ${cls}" role="img" aria-label="${esc(label)}"><div class="card-face">
      <div class="pic">
        <img class="bg" src="${esc(f.l.img)}" alt="" draggable="false">
        <div class="who" style="--ar:${ch.ar};--h:${ch.scale || 100}%;--cx:${left}%">
          ${accImg}
          <img class="ch" src="${esc(ch.cut)}" alt="" draggable="false">
        </div>
        ${art}
      </div>
      <div class="c-cap"><b>${esc(ch.name)}</b><span>${esc(ac.name)} · ${esc(f.l.name)}</span></div>
    </div></div>`;
  }
  function backHTML() {
    return `<div class="card back" role="img" aria-label="Verdeckte Karte"><div class="card-face"><span class="mask">🎭</span><span class="q">?</span></div></div>`;
  }
  function avatarHTML(id, size = 44) {
    const a = avatarDef(id);
    return `<span class="avatar" style="--c:${esc(a.color)};--s:${size}px" title="${esc(a.name)}">${a.emoji}<img src="assets/avatars/${esc(a.id)}_head.png" alt="" loading="lazy" onerror="this.remove()"></span>`;
  }
  function hatHTML(av, hat) {
    if (!hat || !window.HATS || !window.HATS[hat] || !av.hat) return '';
    const h = av.hat;
    return `<span class="hat ${/krone|liga_|^dev$/.test(hat) ? 'crown' : ''}" style="left:${h.x}%;top:${h.y}%;width:${h.w}%;--hs:${(window.HAT_FIT || {})[hat] || 1.25};--hk:${(window.HAT_SINK || {})[hat] || 85}%">${window.HATS[hat]}</span>`;
  }
  function figHTML(id, cls = '', hat = null) {
    const a = avatarDef(id);
    return `<span class="fig ${cls}"><span class="fb" style="--ar:${a.ar || 1}"><img src="assets/avatars/${esc(a.id)}_cut.png" alt="${esc(a.name)}" data-e="${a.emoji}" onerror="this.replaceWith(Object.assign(document.createElement('b'),{textContent:this.dataset.e,className:'emo'}))">${hatHTML(a, hat)}</span></span>`;
  }
  const LOGO = (cls = '') => `<img class="logo-img ${cls}" src="assets/logo.png" alt="UNKNOWN" draggable="false">`;
  function avatarPicker(selected, taken = []) {
    return `<div class="avatar-grid" role="group" aria-label="Avatar wählen">${S.data.avatars.map((a) => {
      const isTaken = taken.includes(a.id) && a.id !== selected;
      return `<button class="avatar-pick" data-act="avatar" data-id="${esc(a.id)}" aria-pressed="${a.id === selected}" ${isTaken ? 'disabled' : ''} aria-label="${esc(a.name)}">${avatarHTML(a.id, 38)}</button>`;
    }).join('')}</div>`;
  }


  /* ------------------------------------------------- Effekte */

  S.fx = { fresh: false, deal: false };
  let fxTimer = null;
  const fxLayer = () => { let l = document.getElementById('fx-layer'); if (!l) { l = document.createElement('div'); l.id = 'fx-layer'; document.body.appendChild(l); } return l; };

  function banner(text, cls = '') {
    const el = document.createElement('div');
    el.className = `fx-banner ${cls}`; el.textContent = text;
    fxLayer().appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }
  function confetti() {
    const layer = fxLayer(); const colors = ['#ffd24a', '#ff5a8a', '#4be0ff', '#6be28a', '#ff8a2b', '#b48cff'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i'); c.className = 'confetti';
      c.style.cssText = `left:${Math.random() * 100}%;background:${colors[i % colors.length]};--dx:${(Math.random() - .5) * 160}px;--rot:${Math.random() * 720}deg;animation-duration:${1.8 + Math.random() * 1.6}s;animation-delay:${Math.random() * .5}s;width:${6 + Math.random() * 6}px;height:${9 + Math.random() * 8}px`;
      layer.appendChild(c); setTimeout(() => c.remove(), 4200);
    }
  }

  /** Töne, Banner und Animations-Marker nach einem neuen Spielstand. */
  function fxFor(prev, st, m) {
    const fx = { fresh: false, deal: false };
    const wasPlaying = prev && prev.phase !== 'lobby';
    if (st.phase === 'clues' && (!prev || prev.phase === 'lobby' || prev.phase === 'finished')) fx.deal = true;
    if (prev && prev.events && st.events.length > prev.events.length && prev.phase !== 'lobby') {
      for (const ev of st.events.slice(prev.events.length)) {
        if (ev.type === 'play') { fx.fresh = true; SFX.card(); setTimeout(() => (ev.related ? SFX.yes() : SFX.no()), 220); }
        else if (ev.type === 'guess') { fx.fresh = true; SFX.card(); setTimeout(() => (ev.ok ? SFX.yes() : SFX.wrong()), 220); }
        else if (ev.type === 'flip') SFX.tap();
      }
    }
    const myTurnNow = st.phase === 'playing' && st.current === st.you && !st.players[st.you].out;
    const myTurnBefore = prev && prev.phase === 'playing' && prev.current === prev.you;
    if (wasPlaying && myTurnNow && !myTurnBefore) { setTimeout(() => { SFX.turn(); banner('Du bist dran!'); }, 450); }
    if (st.phase === 'finished' && prev && prev.phase !== 'finished') {
      const won = st.winner === st.youId;
      setTimeout(() => { if (won) { SFX.win(); confetti(); } else SFX.lose(); }, 500);
      if (m && m.rewards) {
        if (m.rewards.gold) setTimeout(() => SFX.coin(), 1300);
        if (m.rewards.levelUp || m.rewards.leagueUp) setTimeout(() => SFX.levelup(), 1800);
      }
    }
    S.fx = fx;
    clearTimeout(fxTimer); fxTimer = setTimeout(() => { S.fx = { fresh: false, deal: false }; }, 1200);
  }

  /* ----------------------------------------------------- Netzwerk */

  function send(msg) {
    if (S.ws && S.open) S.ws.send(JSON.stringify(msg));
    else if (msg.type === 'create' || msg.type === 'join') { S.queue.push(msg); toast('Verbinde …'); }
    else toast('Keine Verbindung. Einen Moment …', true);
  }

  function guessRegion() { const m = /[-_]([A-Za-z]{2})\b/.exec(navigator.language || ''); return m ? m[1].toUpperCase() : 'DE'; }
  let qTimer = null;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}`);
    S.ws = ws;
    ws.onopen = () => {
      S.open = true;
      S.reconnectDelay = 800;
      ws.send(JSON.stringify({ type: 'hello', secret: deviceSecret(), init: { name: S.profile.name || undefined, avatar: S.profile.avatar || undefined, region: guessRegion() } }));
      if (S.session) ws.send(JSON.stringify({ type: 'rejoin', code: S.session.code, token: S.session.token }));
      for (const m of S.queue.splice(0)) ws.send(JSON.stringify(m));
      clearInterval(S.pingTimer);
      S.pingTimer = setInterval(() => { if (S.open) ws.send('{"type":"ping"}'); }, 20000);
      document.getElementById('conn-hint')?.remove();
      if (S.st) render();
    };
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } handle(m); };
    ws.onclose = (ev) => {
      if (S.ws !== ws) return;
      S.open = false;
      clearInterval(S.pingTimer);
      if (ev.code === 4000) {
        S.noReconnect = true;
        toast('UNKNOWN wurde in einem anderen Fenster geöffnet.', true);
        return;
      }
      if (ev.code === 4001) {
        S.session = null; LS.del('unknown.session'); S.st = null; S.ui.modal = null;
        if (!S.leaving) toast('Du wurdest aus der Lobby entfernt.', true);
        S.leaving = false;
        render();
      }
      if (S.st) render();
      setTimeout(connect, ev.code === 4001 ? 50 : S.reconnectDelay);
      S.reconnectDelay = Math.min(S.reconnectDelay * 1.6, 8000);
    };
    ws.onerror = () => { /* onclose übernimmt */ };
  }

  function handle(m) {
    switch (m.type) {
      case 'joined':
        S.q = null; if (S.ui.modal && ['ranked', 'wardrobe', 'shop', 'leaderboard', 'account', 'friends'].includes(S.ui.modal.type)) S.ui.modal = null;
        S.session = { code: m.code, token: m.token, playerId: m.playerId };
        if (m.vsBot) toast('Übungsrunde gegen Bots (ohne Rangpunkte)');
        LS.set('unknown.session', S.session);
        if (new URLSearchParams(location.search).has('code')) history.replaceState(null, '', location.pathname);
        break;
      case 'state':
        { const prev = S.st; S.st = m.state; fxFor(prev, m.state, m); }
        if (m.state.phase === 'clues' && !LS.get('unknown.tutorial') && !S.ui.modal) S.ui.modal = { type: 'tutorial', page: 0 };
        S.code = m.code; S.setId = m.setId; S.ranked = !!m.ranked; S.rewards = m.rewards || null;
        if (m.state.phase !== 'finished') S.ui.hideEnd = false;
        render();
        break;
      case 'profile':
        { const old = S.me; if (old && m.profile.hats.length > old.hats.length) SFX.buy(); }
        if (!S.autoDone) {
          S.autoDone = true;
          const q = new URLSearchParams(location.search);
          if (q.get('code') && q.get('auto')) { const code = q.get('code').toUpperCase(); history.replaceState(null, '', location.pathname); setTimeout(() => send({ type: 'join', code, name: S.profile.name, avatar: S.profile.avatar }), 300); }
        }
        S.me = m.profile; S.storeKind = m.store; if (m.regions) S.regions = m.regions; if (m.leagues) S.leagues = m.leagues; S.rankedBots = !!m.rankedBots;
        if (!S.profile.name) { S.profile.name = S.me.name; saveProfile(); }
        if (S.me.avatar && !S.st) { S.profile.avatar = S.me.avatar; saveProfile(); }
        if (!S.st || S.ui.modal) { if (!S.st) render(); else renderModals(); }
        break;
      case 'queue':
        S.q = m.status === 'searching' ? { since: m.since || (S.q && S.q.since) || Date.now(), size: m.size } : null;
        clearInterval(qTimer);
        if (S.q) qTimer = setInterval(() => { const el = document.getElementById('q-timer'); if (el) el.textContent = Math.floor((Date.now() - S.q.since) / 1000) + ' s'; }, 1000);
        if (S.ui.modal && S.ui.modal.type === 'ranked') renderModals();
        break;
      case 'leaderboard':
        S.lb = m; if (S.ui.modal && S.ui.modal.type === 'leaderboard') renderModals();
        break;
      case 'claimed':
        SFX.coin(); toast(`+${m.gold} Gold${m.kind === 'daily' ? ` · Serie ${m.streak}` : ''}`);
        break;
      case 'toast': toast(m.message); break;
      case 'friends': {
        const first = !S.friends;
        S.friends = m;
        const fp = new URLSearchParams(location.search).get('friend');
        if (first && fp) { history.replaceState(null, '', location.pathname); send({ type: 'friendadd', code: fp }); }
        if (S.ui.modal && S.ui.modal.type === 'friends') { const inp = document.getElementById('in-fcode'); const v = inp ? inp.value : ''; renderModals(); const n = document.getElementById('in-fcode'); if (n && v) n.value = v; }
        else if (!S.st) render();
        break;
      }
      case 'invite': showInvite(m); break;
      case 'pushkey': if (S.wantPush) { S.wantPush = false; subscribePush(m.key); } break;
      case 'error':
        toast(m.message, true);
        break;
      case 'gone':
        toast('Die Partie gibt es nicht mehr (der Server wurde aktualisiert). Starte eine neue Lobby.', true);
        S.session = null; LS.del('unknown.session'); S.st = null;
        render();
        break;
      default:
    }
  }

  /* ----------------------------------------------------- Ansichten */

  function render() {
    if (!S.data) return;
    document.body.classList.toggle('room', !!(S.st && S.st.phase !== 'lobby'));
    document.body.classList.toggle('night', !(S.st && S.st.phase !== 'lobby'));
    if (!(S.st && S.st.phase !== 'lobby')) $app.className = '';
    if (!S.st && S.session) renderResume();
    else if (!S.st) renderHome();
    else if (S.st.phase === 'lobby') renderLobby();
    else renderGame();
    renderModals();
    renderDrawers();
  }

  function renderResume() {
    $app.innerHTML = `
      <h1 class="logo-h">${LOGO()}</h1>
      <section class="panel stack center">
        <p style="margin:6px 0">Du kehrst in deine Lobby ${esc(S.session.code)} zurück …</p>
        <button class="btn ghost" data-act="cancelresume">Abbrechen</button>
      </section>`;
  }

  function renderHome() {
    const prefill = (new URLSearchParams(location.search).get('code') || '').toUpperCase().slice(0, 4);
    if (!S.data.avatars.some((a) => a.id === S.profile.avatar)) S.profile.avatar = S.data.avatars[0].id;
    const av = avatarDef(S.profile.avatar);
    const me = S.me;
    const lg = me ? leagueFor(me.rating) : null;
    $app.innerHTML = `
      <div class="chips">
        <button class="chip" data-act="friends" aria-label="Freunde"><i>👥</i><b>${friendsChip()}</b>${S.friends && S.friends.incoming.length ? `<em class="dotbadge">${S.friends.incoming.length}</em>` : ''}</button>
        <button class="chip" data-act="shop" aria-label="Shop"><i>🪙</i><b>${me ? me.gold : '–'}</b></button>
        <button class="chip" data-act="ranked" aria-label="Rang"><i>${lg ? lg.icon : '🏅'}</i><b>${me ? me.rating : '–'}</b></button>
        <button class="chip" data-act="account" aria-label="Konto"><i>⭐</i><b>Lv ${me ? me.level : 1}</b></button>
      </div>
      <h1 class="logo-h">${LOGO()}</h1>
      <div class="home-top">
        <div class="hero" id="hero">${figHTML(S.profile.avatar, 'hero-fig', me && me.hat)}<button class="dress" data-act="wardrobe">🎩 Umziehen</button></div>
        <div class="profile">
          <label class="field"><span>Dein Name</span>
            <input id="in-name" type="text" maxlength="16" autocomplete="nickname" placeholder="z. B. Mia" value="${esc(S.profile.name)}"></label>
          <p class="tagline" style="margin:0">Alle sehen, wer du bist.<br>Nur du nicht.</p>
        </div>
      </div>
      <button class="tile-big ranked" data-act="ranked"><span class="tb-txt"><b>Ranked</b><small>${lg ? `${lg.icon} ${lg.name} · ${me.rating} Punkte` : 'Steige in der Rangliste auf'}</small></span><i>›</i></button>
      ${todayHTML()}
      <button class="tile-big play" data-act="botgame"><span class="tb-txt"><b>Gegen Bots üben</b><small>Sofort spielen · ohne Rangpunkte</small></span><i>›</i></button>
      <button class="tile-big play" data-act="create"><span class="tb-txt"><b>Lobby erstellen</b><small>Spiel mit Freunden · 2–4 Spieler</small></span><i>›</i></button>
      <div class="tile-big join">
        <span class="tb-txt"><b>Beitreten</b><small>Code von deinen Freunden</small></span>
        <input id="in-code" class="code" type="text" maxlength="4" placeholder="CODE" autocapitalize="characters" autocomplete="off" aria-label="Lobby-Code" value="${esc(prefill)}">
        <button class="btn go" data-act="join" aria-label="Beitreten">Los</button>
      </div>
      <section class="panel stack">
        <div class="sec-h"><b>Dein Avatar</b><span class="muted">${esc(av.name)}</span></div>
        ${avatarPicker(S.profile.avatar)}
      </section>
      <div class="tiles">
        <button class="tile" data-act="shop"><b>Shop</b><span>Hüte kaufen</span><em>🛒</em></button>
        <button class="tile" data-act="leaderboard"><b>Rangliste</b><span>Weltweit &amp; Land</span><em>🏆</em></button>
        <button class="tile" data-act="collection"><b>Deine Karten</b><span>${setDef().name} · 49</span><em>🃏</em></button>
        <button class="tile" data-act="rules"><b>Spielregeln</b><span>Kurz erklärt</span><em>📜</em></button>
      </div>
      <p class="legal"><a href="/datenschutz.html">Datenschutz</a> · <a href="/impressum.html">Impressum</a></p>
      ${S.open ? '' : '<p class="hint center" id="conn-hint">Verbindung wird aufgebaut …</p>'}`;
  }

  /** Tagesbelohnung und Missionen (Hauptmenü). */
  function todayHTML() {
    const me = S.me;
    if (!me || !me.daily) return '';
    const d = me.daily;
    const days = d.rewards.map((g, i) => {
      const done = d.claimedToday ? i < d.streak % 7 || (d.streak % 7 === 0 && d.streak > 0) : i < d.streak % 7;
      const isNext = !d.claimedToday && i === d.nextDay - 1;
      return `<span class="dd ${done ? 'done' : ''} ${isNext ? 'next' : ''}"><small>Tag ${i + 1}</small><b>${g}</b></span>`;
    }).join('');
    const claim = d.claimedToday
      ? '<p class="hint center" style="margin:6px 0 0">Heute abgeholt. Morgen geht es weiter.</p>'
      : `<button class="btn primary" data-act="claimdaily">Tagesbelohnung abholen · +${d.nextReward} 🪙</button>`;
    const ms = me.missions.map((m) => {
      const ready = m.progress >= m.goal && !m.claimed;
      return `<li class="${m.claimed ? 'done' : ''}">
        <div class="ms-t"><b>${esc(m.text)}</b><div class="bar"><i style="width:${(m.progress / m.goal) * 100}%"></i></div><small>${m.progress}/${m.goal}</small></div>
        ${m.claimed ? '<span class="ms-ok">✓</span>' : `<button class="btn small ${ready ? 'primary' : 'ghost'}" data-act="claimmission" data-id="${esc(m.id)}" ${ready ? '' : 'disabled'}>+${m.reward} 🪙</button>`}</li>`;
    }).join('');
    return `<section class="panel stack today">
      <div class="sec-h"><b>Heute</b><span class="muted">Serie: ${d.streak} ${d.streak === 1 ? 'Tag' : 'Tage'}</span></div>
      <div class="daily-row">${days}</div>
      ${claim}
      <ul class="missions">${ms}</ul>
    </section>`;
  }

  function renderLobby() {
    const st = S.st;
    const isHost = st.hostId === st.youId;
    const me = st.players[st.you];
    const slots = [];
    for (let i = 0; i < 4; i++) {
      const p = st.players[i];
      if (!p) { slots.push('<div class="slot empty">Freier Platz</div>'); continue; }
      slots.push(`<div class="slot">
        ${avatarHTML(p.avatar, 44)}
        <span class="name">${esc(p.name)}${p.id === st.youId ? ' (du)' : ''}</span>
        ${p.id === st.hostId ? '<span class="tag">Host</span>' : ''}
        <span class="dot ${p.connected ? '' : 'off'}" title="${p.connected ? 'online' : 'getrennt'}"></span>
        ${isHost && p.id !== st.youId ? `<button class="btn small ghost" data-act="kick" data-id="${esc(p.id)}" aria-label="${esc(p.name)} entfernen">✕</button>` : ''}
      </div>`);
    }
    const canStart = isHost && st.players.length >= 2;
    $app.innerHTML = `
      <h1 class="logo-h">${LOGO("sm")}</h1>
      <section class="panel stack">
        <div class="code-box"><div><span class="muted" style="font-size:13px">Lobby-Code</span><br><strong>${esc(S.code)}</strong></div>
          <span class="row"><button class="btn small" data-act="friends" aria-label="Freunde einladen">👥 Freunde</button><button class="btn small primary" data-act="share">Link</button></span></div>
        <p class="hint" style="margin:0">Set: ${esc(setDef().name)} · 2 bis 4 Spieler</p>
      </section>
      <section class="panel"><h2>Spieler (${st.players.length}/4)</h2><div class="slots">${slots.join('')}</div></section>
      <section class="panel stack">
        <button class="btn ghost" data-act="toggleavatar">${S.ui.pickAvatar ? 'Avatar-Auswahl schließen' : 'Avatar ändern'}</button>
        ${S.ui.pickAvatar ? avatarPicker(me.avatar, st.players.map((p) => p.avatar)) : ''}
      </section>
      <section class="stack">
        ${isHost
          ? `<button class="btn primary" data-act="start" ${canStart ? '' : 'disabled'}>Spiel starten</button>
             ${canStart ? '' : '<p class="hint center">Es braucht mindestens 2 Spieler.</p>'}`
          : '<p class="center muted">Warte, bis der Host das Spiel startet …</p>'}
        <div class="row"><button class="btn ghost" data-act="rules">Spielregeln</button><button class="btn ghost" data-act="leavepage">Verlassen</button></div>
      </section>`;
  }

  const SEAT_POS = {
    1: [[50, 2]],
    2: [[26, 5], [74, 5]],
    3: [[16, 12], [50, 0], [84, 12]],
  };

  /** Stapel auf dem Tisch: oberste Karte sichtbar, Zahl als Marke, Tippen öffnet beide Stapel des Spielers. */
  function pileStack(p, which) {
    const yes = which === 'related';
    const cards = p[which];
    const count = yes ? p.relatedCount : p.notRelatedCount;
    const hidden = p.flipped[which];
    let face;
    if (hidden) face = backHTML();
    else if (cards && cards.length) face = cardHTML(cards[cards.length - 1]);
    else face = '<div class="ps-empty"></div>';
    return `<button class="ps ${yes ? 'yes' : 'no'} ${hidden ? 'hid' : ''} ${count > 1 && !hidden ? 'multi' : ''}" data-act="${p.id === S.st.youId ? 'opennotes' : 'pile'}" data-pid="${esc(p.id)}" aria-label="${esc(p.name)}: ${yes ? 'passt' : 'passt nicht'}, ${count} Karten${hidden ? ', umgedreht' : ''}">
      <span class="ps-card">${face}</span><span class="ps-n">${hidden ? '🔒 ' : ''}${count}</span></button>`;
  }

  function seatHTML(p, i, isMe, pos) {
    const st = S.st;
    const turn = st.phase === 'playing' && st.current === i && !p.out;
    const secret = p.secret !== null
      ? `<button class="card-btn s3-secret" data-act="zoom" data-id="${p.secret}" aria-label="Verdächtigen von ${esc(p.name)} ansehen">${cardHTML(p.secret)}</button>`
      : `<div class="s3-secret">${backHTML()}</div>`;
    const pips = [0, 1, 2].map((k) => `<span class="pip ${k < p.wrong ? 'on' : ''}"></span>`).join('');
    let tag = '';
    if (p.out) tag = 'raus';
    else if (p.bot) tag = '🤖';
    else if (!p.connected) tag = 'getrennt';
    else if (st.phase === 'clues' && !p.clueGiven) tag = 'überlegt';
    const plate = `<div class="s3-plate"><span class="nm">${S.ranked && p.region ? `<i class="fl">${flag(p.region)}</i>` : ''}${esc(isMe ? 'Du' : p.name)}</span><span class="pips" title="Falsche Tipps">${pips}</span>${tag ? `<em>${tag}</em>` : ''}</div>`;
    if (isMe) {
      return `<div class="s3 me ${turn ? 'turn' : ''} ${p.out ? 'out' : ''}">
        <div class="me-side">${pileStack(p, 'related')}</div>
        <div class="me-mid">${secret}<div class="me-bust">${figHTML(p.avatar, '', p.hat)}</div>${plate}</div>
        <div class="me-side">${pileStack(p, 'notRelated')}</div>
      </div>`;
    }
    return `<div class="s3 opp ${turn ? 'turn' : ''} ${p.out ? 'out' : ''}" style="left:${pos[0]}%;top:${pos[1]}cqw">
      ${secret}
      <div class="s3-fig">${figHTML(p.avatar, '', p.hat)}</div>
      ${plate}
      <div class="s3-piles">${pileStack(p, 'related')}${pileStack(p, 'notRelated')}</div>
    </div>`;
  }

  /** Meine beiden Stapel, beide gleichzeitig offen (Seitenleiste links). */
  function notesHTML() {
    const st = S.st;
    const me = st.players[st.you];
    const col = (which, cls, title) => {
      const cards = me[which];
      const count = which === 'related' ? me.relatedCount : me.notRelatedCount;
      const body = cards === null
        ? '<p class="notes-empty">Umgedreht, nicht mehr sichtbar.</p>'
        : cards.length === 0
          ? '<p class="notes-empty">Noch keine Karten.</p>'
          : `<div class="notes-grid">${cards.map((id) => `<button class="card-btn" data-act="zoom" data-id="${id}">${cardHTML(id)}</button>`).join('')}</div>`;
      return `<div class="notes-col ${cls}"><h4>${title} <span>${count}</span></h4>${body}</div>`;
    };
    return `<div class="notes-cols">${col('related', 'yes', '✓ Passt')}${col('notRelated', 'no', '✕ Passt nicht')}</div>`;
  }

  function centerHTML() {
    const st = S.st;
    const last = [...st.events].reverse().find((e) => e.type === 'play' || e.type === 'guess');
    let card = st.phase === 'clues' ? '' : '<div class="last-empty">Noch keine Karte<br>ausgespielt</div>';
    if (last) {
      const p = byId(last.player);
      const ok = last.type === 'play' ? last.related : last.ok;
      const label = last.type === 'play' ? (ok ? 'Passt' : 'Passt nicht') : (ok ? 'Richtig' : 'Falsch');
      card = `<div class="last ${S.fx.fresh ? 'fresh' : ''}"><div class="last-card">${cardHTML(last.type === 'guess' ? last.guess : last.card)}</div>
        <div class="stamp ${ok ? 'yes' : 'no'}">${esc(p ? p.name + ': ' : '')}${label}</div></div>`;
    }
    return `<div class="center">${card}</div>
      <div class="deck" title="Nachziehstapel"><div class="deck-card">${backHTML()}</div><span class="deck-n"><small>Nachziehstapel</small>${st.deckCount}</span></div>`;
  }

  /** Verlauf: eine Zeile pro Ereignis */
  function eventLine(ev, mini) {
    const p = byId(ev.player);
    const name = `<b>${esc(p ? p.name : '?')}</b>`;
    if (ev.type === 'play') {
      return `<div class="feed-item"><div class="mini">${cardHTML(ev.card)}</div><span>${name} legt aus</span><span class="dotmark ${ev.related ? 'yes' : 'no'}">${ev.related ? 'passt' : 'passt nicht'}</span></div>`;
    }
    if (ev.type === 'guess') {
      return `<div class="feed-item"><div class="mini">${cardHTML(ev.guess)}</div><span>${name} rät</span><span class="dotmark ${ev.ok ? 'yes' : 'no'}">${ev.ok ? 'richtig' : 'falsch'}</span></div>`;
    }
    if (ev.type === 'flip') {
      return `<div class="feed-item"><span>${name} dreht den ${ev.pile === 'related' ? '„passt“' : '„passt nicht“'}-Stapel um${ev.auto ? ' (zweiter Fehler)' : ''}</span></div>`;
    }
    return `<div class="feed-item"><span>${name} ${ev.left ? 'hat das Spiel verlassen' : 'scheidet aus'}</span></div>`;
  }
  const feedEvents = () => S.st.events.filter((e) => ['play', 'guess', 'flip', 'out'].includes(e.type));
  function feedHTML() {
    const items = feedEvents().slice().reverse();
    return items.length ? items.map((ev) => eventLine(ev)).join('') : '<p class="notes-empty">Noch nichts passiert.</p>';
  }
  /** Dezente Mini-Leiste am linken Tischrand: die letzten drei Züge */
  function tickerHTML() {
    const items = feedEvents().slice(-2).reverse();
    if (!items.length) return '';
    return `<button class="ticker" data-act="opennotes" aria-label="Verlauf öffnen">${items.map((ev, k) => {
      const ok = ev.type === 'play' ? ev.related : ev.type === 'guess' ? ev.ok : null;
      const card = ev.type === 'play' ? ev.card : ev.type === 'guess' ? ev.guess : null;
      return `<span class="tk ${ok === null ? '' : ok ? 'yes' : 'no'}" style="opacity:${1 - k * 0.28}">${card !== null ? cardHTML(card) : '<i>⚑</i>'}</span>`;
    }).join('')}</button>`;
  }

  /** Übersichtskarte: alle Merkmale des Sets; Tippen streicht durch (nur für dich) */
  function overviewHTML() {
    const set = setDef();
    const sh = S.data.sets.shared;
    const m = S.ui.marks;
    const sec = (k, title, list, cls) => `<section class="ov-sec"><h3>${title}</h3><div class="ov-grid ${cls}">${list.map((it, i) =>
      `<button class="ov-item ${m[k][i] ? 'x' : ''}" data-act="mark" data-k="${k}" data-v="${i}" aria-pressed="${!!m[k][i]}">
        <span class="ov-img"><img src="${esc(k === 'c' ? it.cut : (k === 'a' ? it.cut : it.img))}" alt="" draggable="false"></span><span class="ov-name">${esc(it.name)}</span></button>`).join('')}</div></section>`;
    return `<div class="dr-head"><h2>Übersichtskarte</h2><button class="dr-x" data-act="closedrawer" aria-label="Schließen">✕</button></div>
      <p class="muted dr-sub">Tippe auf ein Merkmal, um es für dich durchzustreichen.</p>
      ${sec('c', 'Charaktere', set.characters, 'ch')}${sec('a', 'Accessoires', sh.accessories, 'ac')}${sec('l', 'Orte', sh.locations, 'lo')}
      <button class="btn ghost" data-act="clearmarks">Streichungen zurücksetzen</button>`;
  }
  function notesDrawerHTML() {
    return `<div class="dr-head"><h2>Hinweise</h2><button class="dr-x" data-act="closedrawer" aria-label="Schließen">✕</button></div>
      <p class="muted dr-sub">Deine beiden Stapel, immer offen zum Nachdenken.</p>
      ${notesHTML()}
      <h2 class="dr-h2">Verlauf</h2><div class="feed">${feedHTML()}</div>`;
  }

  function statusText() {
    const st = S.st;
    const me = st.players[st.you];
    if (me.out) return { text: 'Du bist ausgeschieden. Du kannst weiter zuschauen.', mine: false };
    if (st.phase === 'clues') {
      if (st.clue) {
        const target = st.players[st.clue.target];
        const needs = match(st.clue.allowed[0], target.secret);
        return {
          text: needs
            ? `Gib ${target.name} einen Hinweis: eine Karte, die zu seinem Verdächtigen passt.`
            : `Gib ${target.name} einen Hinweis. Du hast keine passende Karte, also gib irgendeine.`,
          mine: true,
        };
      }
      return { text: 'Warte auf die anderen Hinweise …', mine: false };
    }
    if (st.pending) {
      const p = byId(st.pending.player);
      return { text: `${p ? p.name : '?'} muss einen Stapel umdrehen.`, mine: false };
    }
    if (st.current === st.you) return { text: 'Du bist dran: Karte ausspielen oder raten.', mine: true };
    return { text: `${st.players[st.current].name} ist dran.`, mine: false };
  }

  function renderGame() {
    const st = S.st;
    const me = st.players[st.you];
    const n = st.players.length;
    const others = [];
    for (let k = 1; k < n; k++) others.push((st.you + k) % n);
    const pos = SEAT_POS[others.length] || SEAT_POS[3];

    const myTurn = st.phase === 'playing' && st.current === st.you && !st.pending && !me.out;
    const clueMode = st.phase === 'clues' && !!st.clue;
    const selectable = (id) => (clueMode ? st.clue.allowed.includes(id) : myTurn);
    if (S.ui.sel !== null && (!st.hand.includes(S.ui.sel) || !selectable(S.ui.sel))) S.ui.sel = null;

    const status = statusText();
    let line = status.text;
    if (S.ui.sel !== null) { const f = feats(S.ui.sel); line = `${f.c.name} · ${f.a.name} · ${f.l.name}`; }

    const handCards = st.hand.map((id, i) => {
      const ok = selectable(id);
      const mid = (st.hand.length - 1) / 2;
      return `<button class="card-btn slot-card ${S.ui.sel === id ? 'sel' : ''} ${(clueMode || myTurn) && !ok ? 'dim' : ''}" style="--i:${i - mid};--z:${i}" data-act="sel" data-id="${id}" aria-pressed="${S.ui.sel === id}">${cardHTML(id)}</button>`;
    });

    let actions = '';
    if (clueMode) {
      actions = `<button class="btn primary" data-act="giveclue" ${S.ui.sel === null ? 'disabled' : ''}>Hinweis geben</button>`;
    } else if (myTurn) {
      actions = `<button class="btn yes" data-act="play" ${S.ui.sel === null ? 'disabled' : ''}>Ausspielen</button>
        <button class="btn primary" data-act="openguess">Raten</button>`;
    }
    if (actions && S.ui.sel !== null) actions += `<button class="btn ghost zoom-btn" data-act="zoomsel" aria-label="Karte groß ansehen">🔍</button>`;

    $app.className = 'game-app';
    $app.innerHTML = `
      <div class="topbar">
        <button class="icon-btn" data-act="opennotes" aria-label="Hinweise und Verlauf">📋</button>
        <span class="grow">${S.open ? LOGO('tb') : '<span class="chip">Verbinde …</span>'}</span>
        <span class="chip" title="Lobby-Code">🔑 ${esc(S.code)}</span>
        <button class="pill-btn ${LS.get('unknown.ovseen') ? '' : 'pulse'}" data-act="openoverview" aria-label="Übersichtskarte">🗂 Karte</button>
        <button class="icon-btn" data-act="rules" aria-label="Spielregeln">?</button>
        <button class="icon-btn" data-act="leavepage" aria-label="Spiel verlassen">⎋</button>
      </div>
      <div class="statusline ${status.mine ? 'mine' : ''}">${esc(line)}</div>
      <section class="board" aria-label="Spieltisch"><div class="bstage">
        <span class="lantern l"></span><span class="lantern r"></span>
        <div class="table-surface"></div>
        ${others.map((i, k) => seatHTML(st.players[i], i, false, pos[k])).join('')}
        ${centerHTML()}
        ${tickerHTML()}
        ${actions ? `<div class="actions-row">${actions}</div>` : ''}
        ${seatHTML(me, st.you, true, null)}
        <div class="hand ${S.fx.deal ? 'dealing' : ''}" aria-label="Deine Handkarten">${handCards.join('')}</div>
      </div></section>`;
    fitBoard();
  }

  /** Kurze Bildschirme: den ganzen Tisch gleichmäßig verkleinern, damit nichts übereinanderliegt. */
  const DESIGN_H = 1.85; // Spielfeld ist für Höhe = 1,85 x Breite entworfen
  function fitBoard() {
    const board = document.querySelector('.board');
    const stage = board && board.querySelector('.bstage');
    if (!stage) return;
    const W = board.clientWidth; const H = board.clientHeight;
    if (!W || !H) return;
    const k = Math.min(1, H / (W * DESIGN_H));
    stage.style.width = `${W / k}px`;
    stage.style.height = `${H / k}px`;
    stage.style.transform = k < 1 ? `scale(${k})` : 'none';
    stage.style.setProperty('--ex', `${Math.max(0, (H / k - W * DESIGN_H) / W * 100).toFixed(1)}cqw`);
  }
  window.addEventListener('resize', fitBoard);
  window.addEventListener('orientationchange', () => setTimeout(fitBoard, 200));

  /* ------------------------------------------- Seiten-Schubladen */

  function ensureDrawers() {
    if (document.getElementById('dr-left')) return;
    document.body.insertAdjacentHTML('beforeend',
      '<div id="dr-scrim"></div><aside id="dr-left" class="drawer left" aria-hidden="true"></aside><aside id="dr-right" class="drawer right" aria-hidden="true"></aside>');
    document.getElementById('dr-scrim').addEventListener('click', () => setDrawer(null));
  }
  function setDrawer(which) {
    S.ui.drawer = which;
    renderDrawers();
  }
  function renderDrawers() {
    ensureDrawers();
    const inGame = !!(S.st && S.st.phase !== 'lobby');
    const w = inGame ? S.ui.drawer : null;
    const L = document.getElementById('dr-left');
    const R = document.getElementById('dr-right');
    if (inGame && w === 'notes') { const keep = L.scrollTop; L.innerHTML = notesDrawerHTML(); L.scrollTop = keep; }
    if (inGame && w === 'overview') { const keep = R.scrollTop; R.innerHTML = overviewHTML(); R.scrollTop = keep; }
    L.classList.toggle('open', w === 'notes');
    R.classList.toggle('open', w === 'overview');
    L.setAttribute('aria-hidden', String(w !== 'notes'));
    R.setAttribute('aria-hidden', String(w !== 'overview'));
    document.getElementById('dr-scrim').classList.toggle('on', !!w);
  }

  /** Wischen vom Rand: links -> Hinweise, rechts -> Übersichtskarte; zum Schließen zurückwischen */
  (() => {
    let t0 = null;
    const EDGE = 26;
    document.addEventListener('touchstart', (e) => {
      if (!S.st || S.st.phase === 'lobby' || S.ui.modal || e.touches.length !== 1) { t0 = null; return; }
      const t = e.touches[0];
      const w = window.innerWidth;
      t0 = { x: t.clientX, y: t.clientY, edge: t.clientX < EDGE ? 'l' : t.clientX > w - EDGE ? 'r' : null, inL: !!e.target.closest('#dr-left'), inR: !!e.target.closest('#dr-right') };
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
      if (!t0) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - t0.x; const dy = t.clientY - t0.y;
      const s = t0; t0 = null;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      if (S.ui.drawer === 'notes' && dx < 0) setDrawer(null);
      else if (S.ui.drawer === 'overview' && dx > 0) setDrawer(null);
      else if (!S.ui.drawer && s.edge === 'l' && dx > 0) setDrawer('notes');
      else if (!S.ui.drawer && s.edge === 'r' && dx < 0) setDrawer('overview');
    }, { passive: true });
  })();

  /* ----------------------------------------------------- Modale */

  const RULES = `
    <h2>Spielregeln</h2>
    <ul>
      <li>Jeder hat eine <b>geheime Karte</b> über sich. Alle sehen sie, nur du nicht. Finde heraus, welcher <b>Charakter</b> mit welchem <b>Accessoire</b> an welchem <b>Ort</b> du bist.</li>
      <li>Es gibt 49 Karten, jede Kombination nur einmal. Zwei Karten haben höchstens ein gemeinsames Merkmal.</li>
      <li>Du hast fünf Handkarten. Am Anfang bekommst du von deinem rechten Nachbarn einen ersten Hinweis.</li>
      <li><b>Ausspielen:</b> Deine Karte kommt offen auf den Tisch. „Passt“ heißt: mindestens ein Merkmal stimmt mit deiner Geheimkarte überein. Sonst „passt nicht“. Alle sehen deine Stapel.</li>
      <li><b>Raten:</b> Statt eine Karte zu spielen, nennst du Charakter, Accessoire und Ort. Alle drei müssen stimmen, dann gewinnst du sofort.</li>
      <li>Ein falscher Tipp dreht einen deiner Stapel um (beim ersten Fehler wählst du, beim zweiten der andere). Beim dritten Fehler bist du raus.</li>
      <li>Tipp: Karten der anderen schließen Möglichkeiten aus. Eine „passt nicht“-Karte streicht gleich drei Merkmale.</li>
    </ul>`;

  /** Kurz-Tutorial: drei Seiten, einmalig beim ersten Spiel, danach über die Regeln abrufbar. */
  function tutorialHTML(page) {
    const mini = (id, tag) => `<div class="tut-card">${cardHTML(id)}${tag ? `<span class="tut-tag ${tag === 'yes' ? 'yes' : 'no'}">${tag === 'yes' ? 'passt' : 'passt nicht'}</span>` : ''}</div>`;
    const secret = 10; // Charakter 2, Accessoire 4, Ort 5
    const pages = [
      { h: 'Wer bist du?', body: `<p>Jeder Spieler hat eine <b>Geheimkarte</b> über dem Kopf. <b>Alle</b> sehen sie, nur <b>du nicht</b>.</p>
          <div class="tut-row">${mini(secret)}</div><p class="muted">Jede Karte zeigt <b>Charakter</b>, <b>Accessoire</b> und <b>Ort</b>. Finde heraus, welche Kombination du bist.</p>` },
      { h: 'Passt oder passt nicht', body: `<p>Du bekommst Hinweise und spielst Karten aus. Eine Karte <b>passt</b>, wenn sie in mindestens <b>einem Merkmal</b> mit deiner Geheimkarte übereinstimmt.</p>
          <div class="tut-row">${mini(secret)}${mini(11, match(secret, 11) ? 'yes' : 'no')}${mini(36, match(secret, 36) ? 'yes' : 'no')}</div>
          <p class="muted">Links: deine Geheimkarte. Mitte: gleicher Charakter → passt. Rechts: nichts gleich → passt nicht.</p>` },
      { h: 'Raten und gewinnen', body: `<p>Bist du sicher, tippst du auf <b>Raten</b> und nennst Charakter, Accessoire und Ort. Stimmen alle drei, <b>gewinnst du sofort</b>.</p>
          <p>Ein falscher Tipp kostet dich einen Hinweisstapel. Nach dem dritten Fehler bist du raus. Also lieber erst Karten ausschließen!</p>
          <p class="muted">Tipp: Eine „passt nicht“-Karte streicht gleich drei Merkmale.</p>` },
    ];
    const last = page >= pages.length - 1;
    const pg = pages[Math.min(page, pages.length - 1)];
    return `<div class="tut"><h2>${esc(pg.h)}</h2>${pg.body}
      <div class="dots">${pages.map((_, i) => `<i class="${i === page ? 'on' : ''}"></i>`).join('')}</div>
      <div class="actions">${page > 0 ? '<button class="btn ghost" data-act="tutprev">Zurück</button>' : '<button class="btn ghost" data-act="tutdone">Überspringen</button>'}
        <button class="btn primary" data-act="${last ? 'tutdone' : 'tutnext'}">${last ? 'Los geht’s!' : 'Weiter'}</button></div></div>`;
  }

  function renderModals() {
    const st = S.st;
    const ui = S.ui;
    let html = '';
    let closable = true;

    if (st && st.phase === 'finished' && !ui.hideEnd) {
      html = endHTML(); closable = false;
    } else if (st && st.pending && st.pending.type === 'flip' && st.pending.player === st.youId) {
      html = flipHTML(); closable = false;
    } else if (ui.modal) {
      const m = ui.modal;
      if (m.type === 'rules') html = `${RULES}<button class="btn ghost" data-act="tutorial">Kurz-Tutorial ansehen</button><button class="btn" data-act="close">Verstanden</button>`;
      else if (m.type === 'tutorial') { html = tutorialHTML(m.page); closable = false; }
      else if (m.type === 'zoom') html = zoomHTML(m.id);
      else if (m.type === 'collection') html = collectionHTML();
      else if (m.type === 'pile') html = pileHTML(m.pid);
      else if (m.type === 'ranked') html = rankedHTML();
      else if (m.type === 'wardrobe') html = wardrobeHTML();
      else if (m.type === 'shop') html = shopHTML();
      else if (m.type === 'leaderboard') html = leaderboardHTML();
      else if (m.type === 'account') html = accountHTML();
      else if (m.type === 'friends') html = friendsHTML();
      else if (m.type === 'guess') html = guessHTML();
      else if (m.type === 'leave') {
        html = `<h2>Spiel verlassen?</h2><p>${st && st.phase === 'lobby' ? 'Du verlässt die Lobby.' : S.ranked ? 'In einer Ranked-Partie zählt das als Niederlage: −20 Punkte.' : 'Du scheidest aus der laufenden Partie aus.'}</p>
          <div class="actions"><button class="btn" data-act="close">Bleiben</button><button class="btn no" data-act="leaveconfirm">Verlassen</button></div>`;
      }
    }
    if (!html) { $modal.innerHTML = ''; S.lastModalKey = null; return; }
    const keepScroll = $modal.querySelector('.sheet')?.scrollTop || 0;
    const mkey = html.slice(0, 40);
    const enter = S.lastModalKey !== mkey; S.lastModalKey = mkey;
    $modal.innerHTML = `<div class="modal ${enter ? 'enter' : ''}" data-closable="${closable}" role="dialog" aria-modal="true"><div class="sheet">${html}</div></div>`;
    const sheet = $modal.querySelector('.sheet');
    if (sheet) sheet.scrollTop = keepScroll;
  }

  function collectionHTML() {
    const ids = Array.from({ length: N * N }, (_, i) => i);
    return `<h2>Deine Karten · ${esc(setDef().name)}</h2>
      <p class="muted" style="margin:2px 0 8px">Alle 49 Karten des Sets. Tippen zum Vergrößern.</p>
      <div class="cards-grid coll">${ids.map((id) => `<button class="card-btn" data-act="zoom" data-id="${id}">${cardHTML(id)}</button>`).join('')}</div>
      <button class="btn" data-act="close">Schließen</button>`;
  }

  function zoomHTML(id) {
    const f = feats(id);
    return `<div class="zoom">${cardHTML(id)}</div>
      <p class="zoom-names"><b>${esc(f.c.name)}</b><br>${esc(f.a.name)} · ${esc(f.l.name)}</p>
      <button class="btn" data-act="close">Schließen</button>`;
  }

  function pileHTML(pid) {
    const p = byId(pid);
    if (!p) return '<p>Spieler nicht gefunden.</p><button class="btn" data-act="close">Schließen</button>';
    const sec = (which, cls, title, count) => {
      const cards = p[which];
      const body = cards === null
        ? '<p class="notes-empty">Dieser Stapel wurde nach einem falschen Tipp umgedreht.</p>'
        : cards.length === 0
          ? '<p class="notes-empty">Noch keine Karten.</p>'
          : `<div class="cards-grid">${cards.map((id) => `<button class="card-btn" data-act="zoom" data-id="${id}">${cardHTML(id)}</button>`).join('')}</div>`;
      return `<div class="pile-sec ${cls}"><h3>${title} <span>${count}</span></h3>${body}</div>`;
    };
    return `<h2>Stapel von ${esc(p.name)}</h2>
      ${sec('related', 'yes', '✓ Passt', p.relatedCount)}
      ${sec('notRelated', 'no', '✕ Passt nicht', p.notRelatedCount)}
      <button class="btn" data-act="close">Schließen</button>`;
  }

  function flipHTML() {
    const me = S.st.players[S.st.you];
    return `<h2>Falsch geraten</h2>
      <p>Dreh einen deiner Hinweisstapel um. Du und alle anderen sehen ihn danach nicht mehr.</p>
      <div class="actions">
        <button class="btn yes" data-act="flip" data-pile="related" ${me.flipped.related ? 'disabled' : ''}>„Passt“ (${me.relatedCount})</button>
        <button class="btn no" data-act="flip" data-pile="notRelated" ${me.flipped.notRelated ? 'disabled' : ''}>„Passt nicht“ (${me.notRelatedCount})</button>
      </div>`;
  }

  function guessHTML() {
    const set = setDef();
    const sh = S.data.sets.shared;
    const g = S.ui.guess;
    const rows = [
      ['c', 'Charakter', set.characters, ''],
      ['a', 'Accessoire', sh.accessories, ''],
      ['l', 'Ort', sh.locations, 'loc'],
    ];
    const done = g.sel.c !== undefined && g.sel.a !== undefined && g.sel.l !== undefined;
    return `<h2>Wer bist du?</h2>
      <p class="muted" style="margin-top:2px">Wähle Charakter, Accessoire und Ort. Nur wenn alle drei stimmen, gewinnst du.</p>
      ${rows.map(([k, title, list, cls]) => `<div class="guess-row"><h3>${title}</h3><div class="opts">${list.map((it, i) =>
        `<button class="opt ${cls}" data-act="gpick" data-k="${k}" data-v="${i}" aria-pressed="${g.sel[k] === i}"><img src="${esc(it.img)}" alt=""><span>${esc(it.name)}</span></button>`).join('')}</div></div>`).join('')}
      <p class="hint">Ein falscher Tipp kostet dich einen Hinweisstapel.</p>
      <div class="actions"><button class="btn" data-act="close">Abbrechen</button><button class="btn primary" data-act="gsend" ${done ? '' : 'disabled'}>Tipp abgeben</button></div>`;
  }

  function endHTML() {
    const st = S.st;
    const w = byId(st.winner);
    const isHost = st.hostId === st.youId;
    const title = w ? (w.id === st.youId ? '🏆 Du hast gewonnen!' : `🏆 ${esc(w.name)} gewinnt!`) : 'Niemand hat gewonnen.';
    return `<div class="winner"><div class="big">${title}</div>
      ${rewardsHTML()}
      <p class="muted" style="margin:0">So sahen die Geheimkarten aus:</p>
      <div class="reveal" style="--n:${Math.min(st.players.length, 4)}">${st.players.map((p) =>
        `<div class="p">${avatarHTML(p.avatar, 30)}<span>${esc(p.name)}</span><button class="card-btn" data-act="zoom" data-id="${p.secret}">${cardHTML(p.secret)}</button></div>`).join('')}</div>
      <div class="stack">
        ${S.ranked ? '<button class="btn primary" data-act="rankedagain">Nochmal suchen</button>' : isHost ? '<button class="btn primary" data-act="rematch">Neue Runde</button>' : '<p class="muted center" style="margin:0">Der Host startet die nächste Runde.</p>'}
        <div class="row"><button class="btn ghost" data-act="hideend">Tisch ansehen</button><button class="btn ghost" data-act="leaveconfirm">Verlassen</button></div>
      </div></div>`;
  }


  /* ------------------------------------------- Profil, Ranked, Hüte */

  function rewardsHTML() {
    const r = S.rewards;
    if (!r) return '';
    const rows = [];
    if (r.gold) rows.push(`<li><i>🪙</i><span>Gold${r.dailyBonus ? ` (inkl. ${r.dailyBonus} Tagesbonus)` : ''}</span><b>+${r.gold - (r.bonusGold || 0)}</b></li>`);
    else if (r.capped) rows.push('<li><i>🪙</i><span>Tageslimit für Gold erreicht</span><b>–</b></li>');
    if (r.ranked && r.ratingBefore !== undefined) {
      const d = r.ratingDelta;
      rows.push(`<li><i>${leagueFor(r.ratingAfter).icon}</i><span>Rang ${r.ratingBefore} → ${r.ratingAfter}</span><b class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</b></li>`);
    }
    if (r.leagueUp) rows.push(`<li class="hl"><i>${leagueDef(r.leagueUp).icon}</i><span>Aufstieg in ${esc(leagueDef(r.leagueUp).name)}!</span><b>+${r.bonusGold} 🪙</b></li>`);
    if (r.newHat) rows.push(`<li class="hl"><i class="mini-hat">${(window.HATS || {})[r.newHat] || '🎩'}</i><span>Neuer Hut: ${esc((hatDef(r.newHat) || {}).name || '')}</span><b>NEU</b></li>`);
    rows.push(`<li><i>✨</i><span>Erfahrung</span><b>+${r.xp} XP</b></li>`);
    if (r.levelUp) rows.push(`<li class="hl"><i>⭐</i><span>Level ${r.levelUp} erreicht!</span><b></b></li>`);
    return `<ul class="rewards">${rows.join('')}</ul>`;
  }

  function rankedHTML() {
    const me = S.me;
    if (!me) return '<p>Profil wird geladen …</p><button class="btn" data-act="close">Schließen</button>';
    const lg = leagueFor(me.rating);
    const nx = S.leagues.find((l) => l.min > me.rating);
    const pct = nx ? Math.max(0, Math.min(100, ((me.rating - lg.min) / (nx.min - lg.min)) * 100)) : 100;
    const searching = !!S.q;
    return `<div class="rk-head"><div class="rk-badge">${lg.icon}</div><div><h2 style="margin:0">${esc(lg.name)}</h2><p class="muted" style="margin:0">${me.rating} Punkte · ${me.rankedWins}/${me.rankedPlayed} Siege</p></div></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <p class="hint" style="margin:4px 0 10px">${nx ? `Noch ${nx.min - me.rating} Punkte bis ${nx.icon} ${esc(nx.name)}` : 'Höchste Liga erreicht!'}</p>
      <label class="field"><span>Dein Land (für die Länderrangliste)</span>
        <select id="sel-region" data-act="noop">${S.regions.map((c) => `<option value="${c}" ${c === me.region ? 'selected' : ''}>${flag(c)} ${esc(regionName(c))}</option>`).join('')}</select></label>
      ${searching
        ? `<div class="searching"><span class="spin"></span><div><b>Suche Gegner …</b><br><span class="muted">${S.q.size || 1} in der Warteschlange · <span id="q-timer">${Math.floor((Date.now() - S.q.since) / 1000)} s</span></span></div></div>
           <button class="btn ghost" data-act="rankedleave">Suche abbrechen</button>`
        : `<button class="btn primary" data-act="rankedjoin">Gegner suchen</button><p class="hint center" style="margin:6px 0 0">2–4 Spieler · Sieg: +120 🪙 · Teilnahme: +30 🪙${S.rankedBots ? '<br>Findet sich niemand, spielst du nach 15 s gegen Bots.' : ''}</p>`}
      <h3 style="margin:14px 0 6px">Liga-Belohnungen</h3>
      <ul class="leagues">${S.leagues.map((l) => `<li class="${me.rating >= l.min ? 'got' : ''}"><i>${l.icon}</i><span>${esc(l.name)} <small>ab ${l.min}</small></span><b>${l.gold ? `+${l.gold} 🪙` : ''}${l.hat ? ` <span class="mini-hat">${(window.HATS || {})[l.hat] || ''}</span>` : ''}</b></li>`).join('')}</ul>
      <button class="btn ghost" data-act="leaderboard">Rangliste ansehen</button>
      <button class="btn" data-act="close">Schließen</button>`;
  }

  function leaderboardHTML() {
    const lb = S.lb; const scope = S.ui.lbScope;
    const tabs = `<div class="tabs"><button data-act="lbscope" data-scope="world" aria-pressed="${scope === 'world'}">🌍 Weltweit</button><button data-act="lbscope" data-scope="region" aria-pressed="${scope === 'region'}">${flag(S.me && S.me.region)} Mein Land</button></div>`;
    let body = '<p class="muted center">Lade …</p>';
    if (lb && lb.scope === scope) {
      body = lb.rows.length ? `<ol class="lb">${lb.rows.map((r) => `<li class="${r.you ? 'you' : ''}"><em>${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</em><span class="lb-av">${avatarHTML(r.avatar, 32)}</span><span class="lb-n"><b>${flag(r.region)} ${esc(r.name)}</b><small>${leagueDef(r.league).icon} ${esc(leagueDef(r.league).name)} · Lv ${r.level}</small></span><strong>${r.rating}</strong>${r.you ? '' : r.friend ? '<span class="lb-f" title="Freund">👥</span>' : r.pending ? '<span class="lb-f" title="Anfrage gesendet">⏳</span>' : `<button class="lb-add" data-act="lbadd" data-code="${esc(r.fc)}" aria-label="Als Freund hinzufügen">＋</button>`}</li>`).join('')}</ol>`
        : '<p class="muted center">Noch niemand in dieser Rangliste. Spiel Ranked und sei der Erste!</p>';
      if (lb.you) body += `<p class="hint center">Dein Platz: <b>${lb.you.rank}</b> (${lb.you.rating} Punkte)</p>`;
    }
    return `<h2>Rangliste</h2>${tabs}${body}<button class="btn" data-act="close">Schließen</button>`;
  }

  const hatItem = (h, me, state) => `<button class="hat-item ${state.sel ? 'sel' : ''} ${state.own ? 'own' : ''}" data-act="${state.act}" data-hat="${h ? h.id : ''}" aria-label="${esc(h ? h.name : 'Ohne Hut')}">
      <span class="hi-svg">${h ? (window.HATS || {})[h.id] || '' : '<i class="nohat">🚫</i>'}</span><b>${esc(h ? h.name : 'Ohne Hut')}</b><small>${state.label}</small></button>`;

  /** Garderobe: nur besessene Hüte, Tippen zieht sofort an. */
  function wardrobeHTML() {
    const me = S.me;
    if (!me) return '<p>Profil wird geladen …</p><button class="btn" data-act="close">Schließen</button>';
    const mine = S.hatsDef.filter((h) => me.hats.includes(h.id));
    return `<h2 style="margin:0 0 6px">Garderobe</h2>
      <div class="wd-stage">${figHTML(me.avatar, 'wd-fig', me.hat)}</div>
      <div class="hat-grid">${hatItem(null, me, { sel: !me.hat, own: false, act: 'equip', label: me.hat ? 'Ausziehen' : 'Getragen' })}
        ${mine.map((h) => hatItem(h, me, { sel: me.hat === h.id, own: true, act: 'equip', label: me.hat === h.id ? 'Getragen' : 'Anziehen' })).join('')}</div>
      ${mine.length ? '' : '<p class="hint center">Du hast noch keine Hüte. Im Shop gibt es welche!</p>'}
      <button class="btn ghost" data-act="shop">🛒 Zum Shop</button>
      <button class="btn" data-act="close">Schließen</button>`;
  }

  /** Shop: nur kaufen. Vorschau auf dem eigenen Avatar. */
  function shopHTML() {
    const me = S.me;
    if (!me) return '<p>Profil wird geladen …</p><button class="btn" data-act="close">Schließen</button>';
    const prev = S.ui.prevHat || null;
    const sel = prev ? hatDef(prev) : null;
    const owned = (id) => me.hats.includes(id);
    let action = '<p class="hint center">Tippe einen Hut für die Vorschau.</p>';
    if (sel) {
      if (owned(sel.id)) action = '<p class="hint center">Den Hut besitzt du schon. Zieh ihn oben im Menü an (🎩 Umziehen).</p>';
      else if (sel.league) action = `<p class="hint center">Diesen Hut bekommst du beim Aufstieg in die ${esc(leagueDef(sel.league).name)}-Liga.</p>`;
      else action = `<button class="btn primary" data-act="buy" data-hat="${sel.id}" ${me.gold < sel.price ? 'disabled' : ''}>Kaufen · ${sel.price} 🪙</button>${me.gold < sel.price ? `<p class="hint center">Dir fehlen ${sel.price - me.gold} Gold. Gewinne Runden, um Gold zu verdienen.</p>` : ''}`;
    }
    const item = (h) => hatItem(h, me, { sel: prev === h.id, own: owned(h.id), act: 'prevhat', label: owned(h.id) ? '✓ Im Besitz' : h.league ? '🔒 Liga' : `${h.price} 🪙` });
    return `<div class="wd-top"><h2 style="margin:0">Shop</h2><span class="gold-pill">🪙 ${me.gold}</span></div>
      <div class="wd-stage">${figHTML(me.avatar, 'wd-fig', prev)}</div>
      ${action}
      <h3 style="margin:12px 0 6px">Hüte</h3><div class="hat-grid">${S.hatsDef.filter((h) => !h.league && !h.special).map(item).join('')}</div>
      <h3 style="margin:12px 0 6px">Liga-Hüte</h3><div class="hat-grid">${S.hatsDef.filter((h) => h.league).map(item).join('')}</div>
      <button class="btn" data-act="close">Schließen</button>`;
  }

  /* ------------------------------------------------- Freunde */

  function friendsChip() {
    const f = S.friends; if (!f) return '–';
    return `${f.friends.filter((x) => x.online).length}/${f.friends.length}`;
  }
  function friendRow(f, kind) {
    const inLobbyMe = !!(S.st && S.st.phase === 'lobby');
    let status = 'offline'; let cls = 'off';
    if (f.online) { status = f.lobby ? 'in einer Lobby' : f.busy ? 'in einer Partie' : 'online'; cls = f.busy ? 'busy' : 'on'; }
    let btns = '';
    if (kind === 'friend') {
      if (inLobbyMe && f.online && !f.busy && !f.lobby) btns += `<button class="btn small primary" data-act="invitefriend" data-id="${esc(f.id)}">Einladen</button>`;
      if (!S.st && f.lobby) btns += `<button class="btn small primary" data-act="joinfriend" data-code="${esc(f.lobby)}">Beitreten</button>`;
      btns += S.ui.frConfirm === f.id
        ? `<button class="btn small no" data-act="friendremove" data-id="${esc(f.id)}">Entfernen?</button>`
        : `<button class="btn small ghost" data-act="frconfirm" data-id="${esc(f.id)}" aria-label="Freund entfernen">✕</button>`;
    } else if (kind === 'in') {
      btns = `<button class="btn small primary" data-act="friendaccept" data-id="${esc(f.id)}">Annehmen</button><button class="btn small ghost" data-act="friendreject" data-id="${esc(f.id)}" aria-label="Ablehnen">✕</button>`;
    } else {
      btns = `<button class="btn small ghost" data-act="friendremove" data-id="${esc(f.id)}">Zurückziehen</button>`;
    }
    return `<li class="fr-row"><span class="fr-av">${avatarHTML(f.avatar, 38)}</span><span class="fr-n"><b>${esc(f.name)}</b><small class="${kind === 'friend' ? cls : ''}">${kind === 'friend' ? status : kind === 'in' ? 'möchte dein Freund sein' : 'Anfrage gesendet'}</small></span><span class="fr-b">${btns}</span></li>`;
  }
  function friendsHTML() {
    const f = S.friends;
    if (!f) return '<h2>Freunde</h2><p class="muted">Lade …</p><button class="btn" data-act="close">Schließen</button>';
    const list = (arr, kind) => (arr.length ? `<ul class="fr-list">${arr.map((x) => friendRow(x, kind)).join('')}</ul>` : '');
    const online = [...f.friends].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    return `<h2>Freunde</h2>
      <div class="fr-code"><div><small>Dein Freundescode</small><strong>${esc(f.code)}</strong></div>
        <span class="row"><button class="btn small" data-act="copyfcode">Kopieren</button><button class="btn small primary" data-act="sharefcode">Teilen</button></span></div>
      <div class="fr-add"><input id="in-fcode" type="text" inputmode="text" maxlength="9" autocomplete="off" autocapitalize="characters" placeholder="Freundescode eingeben"><button class="btn small primary" data-act="friendadd">Hinzufügen</button></div>
      ${f.incoming.length ? `<h3 class="fr-h">Anfragen (${f.incoming.length})</h3>${list(f.incoming, 'in')}` : ''}
      <h3 class="fr-h">Freunde (${f.friends.length})</h3>
      ${online.length ? list(online, 'friend') : '<p class="hint">Noch keine Freunde. Tausche deinen Code mit jemandem und gib seinen oben ein.</p>'}
      ${f.outgoing.length ? `<h3 class="fr-h">Gesendet</h3>${list(f.outgoing, 'out')}` : ''}
      ${pushSupported() && !S.pushOn ? `<div class="row" style="margin-top:10px">${pushButton()}</div>` : ''}
      <button class="btn" data-act="close">Schließen</button>`;
  }
  let inviteTimer = null;
  function showInvite(m) {
    if (S.st) return; // schon in einer Lobby/Partie
    let el = document.getElementById('invite-pop');
    if (!el) { el = document.createElement('div'); el.id = 'invite-pop'; document.body.appendChild(el); }
    el.innerHTML = `<span class="ip-av">${avatarHTML(m.from.avatar, 40)}</span><span class="ip-t"><b>${esc(m.from.name)}</b> lädt dich ein</span>
      <button class="btn small primary" data-act="acceptinvite" data-code="${esc(m.code)}">Beitreten</button><button class="btn small ghost" data-act="dismissinvite" aria-label="Ablehnen">✕</button>`;
    el.className = 'show';
    SFX.coin && SFX.coin();
    clearTimeout(inviteTimer);
    inviteTimer = setTimeout(() => { el.className = ''; }, 30000);
  }
  const hideInvite = () => { const el = document.getElementById('invite-pop'); if (el) el.className = ''; clearTimeout(inviteTimer); };

  /* ------------------------------------------------- Benachrichtigungen */

  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  async function refreshPushState() {
    if (!pushSupported()) { S.pushOn = null; return; }
    try { const reg = await navigator.serviceWorker.ready; S.pushOn = !!(await reg.pushManager.getSubscription()) && Notification.permission === 'granted'; } catch { S.pushOn = false; }
    if (S.ui.modal && ['account', 'friends'].includes(S.ui.modal.type)) renderModals();
  }
  async function subscribePush(key) {
    try {
      if (!key) return toast('Benachrichtigungen sind gerade nicht verfügbar.', true);
      const reg = await navigator.serviceWorker.ready;
      const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/'));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
      send({ type: 'pushsub', sub: sub.toJSON() });
      S.pushOn = true; renderModals();
    } catch (err) { toast('Benachrichtigungen konnten nicht aktiviert werden.', true); }
  }
  const pushButton = () => (S.pushOn === null ? '' : `<button class="btn small ${S.pushOn ? '' : 'primary'}" data-act="togglepush">${S.pushOn ? '🔔 Benachrichtigungen an' : '🔕 Benachrichtigungen einschalten'}</button>`);

  function accountHTML() {
    const me = S.me; const sec = deviceSecret();
    const grouped = sec.match(/.{1,4}/g).join('-');
    return `<h2>Dein Konto</h2>
      <p class="muted" style="margin-top:0">${me ? `${esc(me.name)} · Level ${me.level} · ${me.played} Spiele · ${me.wins} Siege` : ''}</p>
      ${S.storeKind === 'memory' ? '<p class="hint warn">Hinweis: Der Server speichert gerade nur vorübergehend. Nach einem Neustart kann der Spielstand weg sein.</p>' : ''}
      <div class="row" style="margin:6px 0"><button class="btn small ${SFX.on ? '' : 'ghost'}" data-act="togglesound">${SFX.on ? '🔊 Sound an' : '🔇 Sound aus'}</button><button class="btn small ${SFX.vib ? '' : 'ghost'}" data-act="togglevib">${SFX.vib ? '📳 Vibration an' : 'Vibration aus'}</button></div>
      ${pushSupported() ? `<div class="row" style="margin:6px 0">${pushButton()}</div><p class="hint" style="margin:0 0 6px">Melde dich bei Freundschaftsanfragen und Lobby-Einladungen, auch wenn die App zu ist.</p>` : ''}
      <p style="margin:8px 0 4px"><b>Wiederherstellungs-Code</b></p>
      <p class="hint" style="margin:0 0 6px">Damit holst du dein Konto (Gold, Hüte, Rang) auf einem anderen Gerät zurück. Geheim halten!</p>
      <div class="secret" id="secret-box">${grouped}</div>
      <div class="row"><button class="btn small" data-act="copysecret">Kopieren</button></div>
      <p style="margin:14px 0 4px"><b>Konto wiederherstellen</b></p>
      <input id="in-restore" type="text" placeholder="Code einfügen" autocomplete="off" style="width:100%">
      <button class="btn ghost" data-act="restore">Wiederherstellen</button>
      <p style="margin:14px 0 4px"><b>Entwickler-Code</b></p>
      <input id="in-dev" type="password" placeholder="Nur für den Entwickler" autocomplete="off" style="width:100%">
      <button class="btn ghost" data-act="devcode">Freischalten</button>
      <button class="btn" data-act="close">Schließen</button>`;
  }

  /* ------------------------------------------------- Aktionen */

  function saveProfile() { LS.set('unknown.profile', S.profile); }

  function leaveNow() {
    S.leaving = true;
    send({ type: 'leave' });
    S.session = null; LS.del('unknown.session');
    S.st = null; S.ui.modal = null; S.ui.sel = null; S.ui.hideEnd = false; S.ui.drawer = null; S.ui.marks = { c: {}, a: {}, l: {} };
    render();
  }

  function guessPick(k, v) {
    S.ui.guess.sel[k] = S.ui.guess.sel[k] === v ? undefined : v;
    renderModals();
  }

  const actions = {
    avatar(t) {
      const id = t.dataset.id;
      if (S.st) { send({ type: 'avatar', avatar: id }); return; }
      S.profile.avatar = id; saveProfile();
      document.querySelectorAll('.avatar-pick').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
      const hero = document.getElementById('hero');
      if (hero) hero.innerHTML = figHTML(id, 'hero-fig', S.me && S.me.hat) + '<button class="dress" data-act="wardrobe">🎩 Umziehen</button>';
      if (S.me) { S.me.avatar = id; send({ type: 'setprofile', avatar: id }); }
    },
    create() {
      S.profile.name = document.getElementById('in-name').value.trim();
      saveProfile();
      send({ type: 'create', name: S.profile.name, avatar: S.profile.avatar });
    },
    join() {
      S.profile.name = document.getElementById('in-name').value.trim();
      saveProfile();
      const code = document.getElementById('in-code').value.trim().toUpperCase();
      if (code.length !== 4) { toast('Gib den 4-stelligen Code ein.', true); return; }
      send({ type: 'join', code, name: S.profile.name, avatar: S.profile.avatar });
    },
    collection() { S.ui.modal = { type: 'collection' }; renderModals(); },
    cancelresume() { S.session = null; LS.del('unknown.session'); render(); },
    rules() { S.ui.modal = { type: 'rules' }; renderModals(); },
    close() { S.ui.modal = null; renderModals(); },
    toggleavatar() { S.ui.pickAvatar = !S.ui.pickAvatar; render(); },
    async share() {
      const url = `${location.origin}/?code=${S.code}`;
      const text = `Spiel mit mir UNKNOWN! Code: ${S.code}`;
      try {
        if (navigator.share) { await navigator.share({ title: 'UNKNOWN', text, url }); return; }
        await navigator.clipboard.writeText(url);
        toast('Einladungslink kopiert.');
      } catch { /* abgebrochen */ }
    },
    start() { send({ type: 'start' }); },
    kick(t) { send({ type: 'kick', id: t.dataset.id }); },
    leavepage() { S.ui.modal = { type: 'leave' }; renderModals(); },
    leaveconfirm() { leaveNow(); },
    sel(t) {
      SFX.select();
      const id = Number(t.dataset.id);
      S.ui.sel = S.ui.sel === id ? null : id;
      render();
    },
    play() { if (S.ui.sel !== null) { send({ type: 'play', card: S.ui.sel }); S.ui.sel = null; } },
    giveclue() { if (S.ui.sel !== null) { send({ type: 'clue', card: S.ui.sel }); S.ui.sel = null; } },
    openguess() { S.ui.guess = { sel: {} }; S.ui.modal = { type: 'guess' }; renderModals(); },
    gpick(t) { guessPick(t.dataset.k, Number(t.dataset.v)); },
    gsend() {
      const s = S.ui.guess.sel;
      send({ type: 'guess', c: s.c, a: s.a, l: s.l });
      S.ui.modal = null; renderModals();
    },
    pile(t) { S.ui.modal = { type: 'pile', pid: t.dataset.pid }; renderModals(); },
    opennotes() { setDrawer('notes'); },
    openoverview() { LS.set('unknown.ovseen', 1); setDrawer('overview'); },
    closedrawer() { setDrawer(null); },
    mark(t) { const m = S.ui.marks[t.dataset.k]; const v = t.dataset.v; m[v] = !m[v]; renderDrawers(); },
    clearmarks() { S.ui.marks = { c: {}, a: {}, l: {} }; renderDrawers(); },
    zoomsel() { if (S.ui.sel !== null) { S.ui.modal = { type: 'zoom', id: S.ui.sel }; renderModals(); } },
    zoom(t) { S.ui.modal = { type: 'zoom', id: Number(t.dataset.id) }; renderModals(); },
    flip(t) { send({ type: 'flip', pile: t.dataset.pile }); },
    rematch() { S.ui.marks = { c: {}, a: {}, l: {} }; send({ type: 'rematch' }); },
    noop() {},
    ranked() { S.ui.modal = { type: 'ranked' }; renderModals(); },
    rankedjoin() { send({ type: 'rankedjoin' }); },
    devcode() { const v = (document.getElementById('in-dev') || {}).value || ''; if (v) send({ type: 'devcode', code: v }); },
    friends() { refreshPushState(); S.ui.frConfirm = null; S.ui.modal = { type: 'friends' }; send({ type: 'friends' }); renderModals(); },
    friendadd() {
      const el = document.getElementById('in-fcode'); const v = el ? el.value.trim() : '';
      if (!v) return toast('Gib den Code deines Freundes ein.', true);
      send({ type: 'friendadd', code: v }); if (el) el.value = '';
    },
    friendaccept(t) { send({ type: 'friendaccept', id: t.dataset.id }); },
    friendreject(t) { send({ type: 'friendreject', id: t.dataset.id }); },
    friendremove(t) { S.ui.frConfirm = null; send({ type: 'friendremove', id: t.dataset.id }); },
    frconfirm(t) { S.ui.frConfirm = t.dataset.id; renderModals(); },
    invitefriend(t) { send({ type: 'invite', id: t.dataset.id }); },
    joinfriend(t) { S.ui.modal = null; renderModals(); send({ type: 'join', code: t.dataset.code, name: S.profile.name, avatar: S.profile.avatar }); },
    acceptinvite(t) { hideInvite(); send({ type: 'join', code: t.dataset.code, name: S.profile.name, avatar: S.profile.avatar }); },
    dismissinvite() { hideInvite(); },
    async copyfcode() { try { await navigator.clipboard.writeText(S.friends.code); toast('Code kopiert.'); } catch { toast(S.friends.code); } },
    async sharefcode() {
      const code = S.friends.code;
      const url = `${location.origin}/?friend=${code.replace('-', '')}`;
      try {
        if (navigator.share) { await navigator.share({ title: 'UNKNOWN', text: `Sei mein Freund bei UNKNOWN! Code: ${code}`, url }); return; }
        await navigator.clipboard.writeText(url); toast('Link kopiert.');
      } catch { /* abgebrochen */ }
    },
    async togglepush() {
      if (!pushSupported()) return toast('Dein Browser unterstützt das leider nicht.', true);
      const reg = await navigator.serviceWorker.ready; const cur = await reg.pushManager.getSubscription();
      if (cur && S.pushOn) { send({ type: 'pushoff', endpoint: cur.endpoint }); await cur.unsubscribe(); S.pushOn = false; toast('Benachrichtigungen aus'); renderModals(); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return toast('Benachrichtigungen sind in den Browser-Einstellungen blockiert.', true);
      S.wantPush = true; send({ type: 'pushkey' });
    },
    lbadd(t) { send({ type: 'friendadd', code: t.dataset.code }); setTimeout(() => send({ type: 'leaderboard', scope: S.ui.lbScope }), 500); },
    botgame() { send({ type: 'botgame', bots: 2 }); },
    rankedleave() { send({ type: 'rankedleave' }); },
    rankedagain() { leaveNow(); S.ui.modal = { type: 'ranked' }; send({ type: 'rankedjoin' }); renderModals(); },
    leaderboard() { S.ui.modal = { type: 'leaderboard' }; S.lb = null; send({ type: 'leaderboard', scope: S.ui.lbScope }); renderModals(); },
    lbscope(t) { S.ui.lbScope = t.dataset.scope; S.lb = null; send({ type: 'leaderboard', scope: S.ui.lbScope }); renderModals(); },
    wardrobe() { S.ui.modal = { type: 'wardrobe' }; renderModals(); },
    shop() { S.ui.modal = { type: 'shop' }; S.ui.prevHat = null; renderModals(); },
    prevhat(t) { S.ui.prevHat = t.dataset.hat; renderModals(); },
    buy(t) { send({ type: 'buy', hat: t.dataset.hat }); },
    equip(t) { send({ type: 'equip', hat: t.dataset.hat || null }); },
    claimdaily() { send({ type: 'claimdaily' }); },
    claimmission(t) { send({ type: 'claimmission', id: t.dataset.id }); },
    tutorial() { S.ui.modal = { type: 'tutorial', page: 0 }; renderModals(); },
    tutnext() { S.ui.modal.page += 1; renderModals(); },
    tutprev() { S.ui.modal.page = Math.max(0, S.ui.modal.page - 1); renderModals(); },
    tutdone() { LS.set('unknown.tutorial', 1); S.ui.modal = null; renderModals(); },
    togglesound() { SFX.on = !SFX.on; renderModals(); },
    togglevib() { SFX.vib = !SFX.vib; renderModals(); },
    account() { refreshPushState(); S.ui.modal = { type: 'account' }; renderModals(); },
    async copysecret() { try { await navigator.clipboard.writeText(deviceSecret()); toast('Code kopiert.'); } catch { toast('Kopieren nicht möglich – bitte markieren und kopieren.', true); } },
    restore() {
      const v = (document.getElementById('in-restore').value || '').toLowerCase().replace(/[^0-9a-f]/g, '');
      if (!/^[0-9a-f]{32,64}$/.test(v)) { toast('Der Code ist ungültig.', true); return; }
      LS.set('unknown.secret', v); LS.del('unknown.session'); LS.del('unknown.profile');
      location.reload();
    },
    hideend() { S.ui.hideEnd = true; renderModals(); },
  };

  /* ---- Karten per Drag & Drop auf den Tisch ziehen ---- */
  let drag = null, suppressClick = 0;
  function dragKind(id) {
    const st = S.st; if (!st || !st.hand || !st.hand.includes(id)) return null;
    const me = st.players[st.you];
    if (st.phase === 'clues' && st.clue) return st.clue.allowed.includes(id) ? 'clue' : null;
    if (st.phase === 'playing' && st.current === st.you && !st.pending && !me.out) return 'play';
    return null;
  }
  function overTable(y) { const h = document.querySelector('.hand'); if (!h) return false; const r = h.getBoundingClientRect(); return y < r.top + r.height * 0.3; }
  document.addEventListener('pointerdown', (e) => {
    const c = e.target.closest && e.target.closest('.slot-card'); if (!c || drag || e.button) return;
    drag = { id: Number(c.dataset.id), x: e.clientX, y: e.clientY, on: false, pid: e.pointerId, ghost: null, w: c.getBoundingClientRect().width, html: c.innerHTML };
    drag.kind = dragKind(drag.id);
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.on) {
      if (!drag.kind || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 12) return;
      drag.on = true;
      try { document.documentElement.setPointerCapture(e.pointerId); } catch { /* egal */ }
      const g = document.createElement('div'); g.className = 'drag-ghost'; g.style.width = drag.w * 1.15 + 'px'; g.innerHTML = drag.html;
      document.body.appendChild(g); drag.ghost = g;
      document.body.classList.add('dragging');
      if (S.ui.sel !== drag.id) { S.ui.sel = drag.id; }
      SFX.select();
    }
    e.preventDefault();
    drag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -62%) rotate(${Math.max(-12, Math.min(12, (e.clientX - drag.x) / 12))}deg)`;
    const over = overTable(e.clientY);
    document.body.classList.toggle('drop-ready', over);
  }, { passive: false });
  function endDrag(e, cancel) {
    if (!drag || (e && e.pointerId !== drag.pid)) return;
    const d = drag; drag = null;
    document.body.classList.remove('dragging', 'drop-ready');
    if (d.ghost) d.ghost.remove();
    if (!d.on) return;
    suppressClick = Date.now() + 350;
    if (!cancel && overTable(e.clientY)) {
      S.ui.sel = d.id;
      if (d.kind === 'clue') actions.giveclue(); else actions.play();
      SFX.select && SFX.select();
    }
    render();
  }
  document.addEventListener('pointerup', (e) => endDrag(e, false));
  document.addEventListener('pointercancel', (e) => endDrag(e, true));
  document.addEventListener('click', (e) => { if (Date.now() < suppressClick) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  document.addEventListener('click', (e) => {
    const closer = e.target.closest('.modal');
    if (closer && e.target === closer && closer.dataset.closable === 'true') { actions.close(); return; }
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const fn = actions[t.dataset.act];
    if (fn) fn(t);
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'in-name') { S.profile.name = e.target.value; saveProfile(); }
    if (e.target.id === 'in-code') e.target.value = e.target.value.toUpperCase();
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'sel-region') send({ type: 'setprofile', region: e.target.value });
    if (e.target.id === 'in-name' && S.me) send({ type: 'setprofile', name: e.target.value });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (S.ui.modal) actions.close(); else if (S.ui.drawer) setDrawer(null); }
    if (e.key === 'Enter' && e.target.id === 'in-code') actions.join();
  });

  setInterval(() => { if (S.ui.modal && S.ui.modal.type === 'friends' && S.open) send({ type: 'friends' }); }, 8000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !S.open && !S.noReconnect && (!S.ws || S.ws.readyState > 1)) connect();
  });

  /* ------------------------------------------------------- Start */

  async function init() {
    try {
      const [avatars, sets, hatsDef] = await Promise.all([
        fetch('data/avatars.json').then((r) => r.json()),
        fetch('data/sets.json').then((r) => r.json()),
        fetch('data/hats.json').then((r) => r.json()),
      ]);
      S.data = { avatars, sets }; S.hatsDef = hatsDef;
    } catch {
      $app.innerHTML = '<p class="center" style="margin-top:40px">Konnte die Spieldaten nicht laden. Bitte Seite neu laden.</p>';
      return;
    }
    render();
    connect();
  }
  if (location.search.includes('debug')) window.__unknown = { cardHTML, S };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  init();
})();
