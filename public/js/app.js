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
    ui: { notes: true, sel: null, modal: null, guess: { sel: {} }, pickAvatar: false, hideEnd: false },
  };

  /* ------------------------------------------------------ Helfer */

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
    return `<div class="card ${cls}" role="img" aria-label="${esc(label)}"><div class="card-face">
      <div class="pic">
        <img class="bg" src="${esc(f.l.img)}" alt="" draggable="false">
        <div class="who" style="--ar:${ch.ar};--h:${ch.scale || 128}%;--cx:${left}%">
          ${accImg}
          <img class="ch" src="${esc(ch.cut)}" alt="" draggable="false">
        </div>
      </div>
      <div class="c-cap">${esc(ch.name)} · ${esc(ac.name)} · ${esc(f.l.name)}</div>
    </div></div>`;
  }
  function backHTML() {
    return `<div class="card back" role="img" aria-label="Verdeckte Karte"><div class="card-face"><span class="mask">🎭</span><span class="q">?</span></div></div>`;
  }
  function avatarHTML(id, size = 44) {
    const a = avatarDef(id);
    return `<span class="avatar" style="--c:${esc(a.color)};--s:${size}px" title="${esc(a.name)}">${a.emoji}<img src="assets/avatars/${esc(a.id)}_head.png" alt="" loading="lazy" onerror="this.remove()"></span>`;
  }
  function figHTML(id, cls = '') {
    const a = avatarDef(id);
    return `<span class="fig ${cls}"><b aria-hidden="true">${a.emoji}</b><img src="assets/avatars/${esc(a.id)}_cut.png" alt="${esc(a.name)}" onerror="this.remove()"></span>`;
  }
  const LOGO = (cls = '') => `<img class="logo-img ${cls}" src="assets/logo.png" alt="UNKNOWN" draggable="false">`;
  function avatarPicker(selected, taken = []) {
    return `<div class="avatar-grid" role="group" aria-label="Avatar wählen">${S.data.avatars.map((a) => {
      const isTaken = taken.includes(a.id) && a.id !== selected;
      return `<button class="avatar-pick" data-act="avatar" data-id="${esc(a.id)}" aria-pressed="${a.id === selected}" ${isTaken ? 'disabled' : ''} aria-label="${esc(a.name)}">${avatarHTML(a.id, 38)}</button>`;
    }).join('')}</div>`;
  }

  /* ----------------------------------------------------- Netzwerk */

  function send(msg) {
    if (S.ws && S.open) S.ws.send(JSON.stringify(msg));
    else if (msg.type === 'create' || msg.type === 'join') { S.queue.push(msg); toast('Verbinde …'); }
    else toast('Keine Verbindung. Einen Moment …', true);
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}`);
    S.ws = ws;
    ws.onopen = () => {
      S.open = true;
      S.reconnectDelay = 800;
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
        S.session = { code: m.code, token: m.token, playerId: m.playerId };
        LS.set('unknown.session', S.session);
        if (new URLSearchParams(location.search).has('code')) history.replaceState(null, '', location.pathname);
        break;
      case 'state':
        S.st = m.state; S.code = m.code; S.setId = m.setId;
        if (m.state.phase !== 'finished') S.ui.hideEnd = false;
        render();
        break;
      case 'error':
        toast(m.message, true);
        break;
      case 'gone':
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
    if (!S.st && S.session) renderResume();
    else if (!S.st) renderHome();
    else if (S.st.phase === 'lobby') renderLobby();
    else renderGame();
    renderModals();
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
    $app.innerHTML = `
      <h1 class="logo-h">${LOGO()}</h1>
      <p class="tagline">Alle sehen, wer du bist. Nur du nicht.</p>
      <div class="hero" id="hero">${figHTML(S.profile.avatar, 'hero-fig')}</div>
      <section class="panel stack">
        <label class="field"><span>Dein Name</span>
          <input id="in-name" type="text" maxlength="16" autocomplete="nickname" placeholder="z. B. Mia" value="${esc(S.profile.name)}"></label>
        <div><div class="field"><span>Dein Avatar</span></div>${avatarPicker(S.profile.avatar)}</div>
        <button class="btn primary" data-act="create">Lobby erstellen</button>
        <div class="row">
          <input id="in-code" class="code" type="text" maxlength="4" placeholder="CODE" autocapitalize="characters" autocomplete="off" aria-label="Lobby-Code" value="${esc(prefill)}">
          <button class="btn" data-act="join">Beitreten</button>
        </div>
        ${S.open ? '' : '<p class="hint center" id="conn-hint">Verbindung wird aufgebaut …</p>'}
      </section>
      <button class="link-btn" data-act="rules">Spielregeln</button>`;
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
          <button class="btn small primary" data-act="share">Einladen</button></div>
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
    1: [[50, 4]],
    2: [[24, 8], [76, 8]],
    3: [[15, 33], [50, 2], [85, 33]],
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
    return `<button class="ps ${yes ? 'yes' : 'no'} ${hidden ? 'hid' : ''} ${count > 1 && !hidden ? 'multi' : ''}" data-act="pile" data-pid="${esc(p.id)}" aria-label="${esc(p.name)}: ${yes ? 'passt' : 'passt nicht'}, ${count} Karten${hidden ? ', umgedreht' : ''}">
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
    else if (!p.connected) tag = 'getrennt';
    else if (st.phase === 'clues' && !p.clueGiven) tag = 'überlegt';
    const plate = `<div class="s3-plate"><span class="nm">${esc(p.name)}</span><span class="pips" title="Falsche Tipps">${pips}</span>${tag ? `<em>${tag}</em>` : ''}</div>`;
    const style = `left:${pos[0]}%;top:${pos[1]}%`;
    if (isMe) {
      return `<div class="s3 me ${turn ? 'turn' : ''} ${p.out ? 'out' : ''}" style="${style}">
        <div class="me-side">${pileStack(p, 'related')}</div>
        <div class="me-mid">${secret}<div class="me-bust">${figHTML(p.avatar)}</div>${plate}</div>
        <div class="me-side">${pileStack(p, 'notRelated')}</div>
      </div>`;
    }
    return `<div class="s3 ${pos[1] < 15 ? 'back' : ''} ${turn ? 'turn' : ''} ${p.out ? 'out' : ''}" style="${style}">
      ${secret}
      <div class="s3-fig">${figHTML(p.avatar)}</div>
      ${plate}
      <div class="s3-piles">${pileStack(p, 'related')}${pileStack(p, 'notRelated')}</div>
    </div>`;
  }

  /** Meine beiden Stapel, dauerhaft offen (zum Nachdenken). */
  function notesHTML() {
    const st = S.st;
    const me = st.players[st.you];
    const open = S.ui.notes;
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
    return `<section class="notes">
      <button class="notes-toggle" data-act="togglenotes" aria-expanded="${open}">Deine Hinweise <span>${open ? 'ausblenden' : 'einblenden'}</span></button>
      ${open ? `<div class="notes-cols">${col('related', 'yes', '✓ Passt')}${col('notRelated', 'no', '✕ Passt nicht')}</div>` : ''}
    </section>`;
  }

  function centerHTML() {
    const st = S.st;
    const last = [...st.events].reverse().find((e) => e.type === 'play' || e.type === 'guess');
    let card = '<div class="last-empty">Noch keine Karte</div>';
    if (last) {
      const p = byId(last.player);
      const ok = last.type === 'play' ? last.related : last.ok;
      const label = last.type === 'play' ? (ok ? 'Passt' : 'Passt nicht') : (ok ? 'Richtig' : 'Falsch');
      card = `<div class="last"><div class="last-card">${cardHTML(last.type === 'guess' ? last.guess : last.card)}</div>
        <div class="stamp ${ok ? 'yes' : 'no'}" title="${esc(p ? p.name : '')}">${label}</div></div>`;
    }
    return `<div class="center">
      <div class="deck" title="Nachziehstapel"><div class="deck-card">${backHTML()}</div><span class="deck-n">${st.deckCount}</span></div>
      ${card}
    </div>`;
  }

  function feedHTML() {
    const items = S.st.events.filter((e) => ['play', 'guess', 'flip', 'out'].includes(e.type)).slice(-2).reverse();
    return items.map((ev) => {
      const p = byId(ev.player);
      const name = `<b>${esc(p ? p.name : '?')}</b>`;
      if (ev.type === 'play') {
        return `<div class="feed-item"><div class="mini">${cardHTML(ev.card)}</div><span>${name} legt aus</span><span class="stamp ${ev.related ? 'yes' : 'no'}">${ev.related ? 'Passt' : 'Passt nicht'}</span></div>`;
      }
      if (ev.type === 'guess') {
        return `<div class="feed-item"><div class="mini">${cardHTML(ev.guess)}</div><span>${name} rät</span><span class="stamp ${ev.ok ? 'yes' : 'no'}">${ev.ok ? 'Richtig' : 'Falsch'}</span></div>`;
      }
      if (ev.type === 'flip') {
        return `<div class="feed-item"><span>${name} dreht den ${ev.pile === 'related' ? '„passt“' : '„passt nicht“'}-Stapel um${ev.auto ? ' (zweiter Fehler)' : ''}</span></div>`;
      }
      return `<div class="feed-item"><span>${name} ${ev.left ? 'hat das Spiel verlassen' : 'scheidet aus'}</span></div>`;
    }).join('');
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
    const handCards = [];
    for (let i = 0; i < 5; i++) {
      const id = st.hand[i];
      if (id === undefined) { handCards.push('<div></div>'); continue; }
      const ok = selectable(id);
      handCards.push(`<button class="card-btn slot-card ${S.ui.sel === id ? 'sel' : ''} ${(clueMode || myTurn) && !ok ? 'dim' : ''}" data-act="sel" data-id="${id}" aria-pressed="${S.ui.sel === id}">${cardHTML(id)}</button>`);
    }

    let picked = '';
    if (S.ui.sel !== null) {
      const f = feats(S.ui.sel);
      picked = `<div class="picked"><div>${cardHTML(S.ui.sel)}</div>
        <div class="names"><b>${esc(f.c.name)}</b>${esc(f.a.name)} · ${esc(f.l.name)}
          <span class="muted" style="display:block;font-size:12px;margin-top:4px">${clueMode ? 'Geht an den linken Nachbarn.' : 'Alle sehen, ob sie zu dir passt.'}</span></div></div>`;
    }
    let actions = '';
    if (clueMode) {
      actions = `<div class="actions"><button class="btn primary full" data-act="giveclue" ${S.ui.sel === null ? 'disabled' : ''}>Hinweis geben</button></div>`;
    } else if (myTurn) {
      actions = `<div class="actions">
        <button class="btn primary" data-act="play" ${S.ui.sel === null ? 'disabled' : ''}>Karte ausspielen</button>
        <button class="btn" data-act="openguess">Raten</button></div>`;
    }

    $app.innerHTML = `
      <div class="topbar">
        <span class="chip" title="Lobby-Code">🔑 ${esc(S.code)}</span>
        <span class="grow">${S.open ? LOGO('tb') : '<span class="chip">Verbinde …</span>'}</span>
        <button class="icon-btn" data-act="rules" aria-label="Spielregeln">?</button>
        <button class="icon-btn" data-act="leavepage" aria-label="Spiel verlassen">⎋</button>
      </div>
      <section class="stage" aria-label="Spieltisch">
        <span class="lantern l"></span><span class="lantern r"></span>
        <div class="table-surface"></div>
        ${others.map((i, k) => seatHTML(st.players[i], i, false, pos[k])).join('')}
        ${centerHTML()}
        ${seatHTML(me, st.you, true, [50, 67])}
      </section>
      <section class="stage-info">
        <div class="status ${status.mine ? 'mine' : ''}">${esc(status.text)}</div>
        <div class="feed">${feedHTML()}</div>
      </section>
      ${notesHTML()}
      <section class="tray">
        ${picked}
        ${actions}
        <div class="hand" aria-label="Deine Handkarten">${handCards.join('')}</div>
      </section>`;
  }

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
      if (m.type === 'rules') html = `${RULES}<button class="btn" data-act="close">Verstanden</button>`;
      else if (m.type === 'zoom') html = zoomHTML(m.id);
      else if (m.type === 'pile') html = pileHTML(m.pid);
      else if (m.type === 'guess') html = guessHTML();
      else if (m.type === 'leave') {
        html = `<h2>Spiel verlassen?</h2><p>${st && st.phase === 'lobby' ? 'Du verlässt die Lobby.' : 'Du scheidest aus der laufenden Partie aus.'}</p>
          <div class="actions"><button class="btn" data-act="close">Bleiben</button><button class="btn no" data-act="leaveconfirm">Verlassen</button></div>`;
      }
    }
    if (!html) { $modal.innerHTML = ''; return; }
    const keepScroll = $modal.querySelector('.sheet')?.scrollTop || 0;
    $modal.innerHTML = `<div class="modal" data-closable="${closable}" role="dialog" aria-modal="true"><div class="sheet">${html}</div></div>`;
    const sheet = $modal.querySelector('.sheet');
    if (sheet) sheet.scrollTop = keepScroll;
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
      <p class="muted" style="margin:0">So sahen die Geheimkarten aus:</p>
      <div class="reveal" style="--n:${Math.min(st.players.length, 4)}">${st.players.map((p) =>
        `<div class="p">${avatarHTML(p.avatar, 30)}<span>${esc(p.name)}</span><button class="card-btn" data-act="zoom" data-id="${p.secret}">${cardHTML(p.secret)}</button></div>`).join('')}</div>
      <div class="stack">
        ${isHost ? '<button class="btn primary" data-act="rematch">Neue Runde</button>' : '<p class="muted center" style="margin:0">Der Host startet die nächste Runde.</p>'}
        <div class="row"><button class="btn ghost" data-act="hideend">Tisch ansehen</button><button class="btn ghost" data-act="leaveconfirm">Verlassen</button></div>
      </div></div>`;
  }

  /* ------------------------------------------------- Aktionen */

  function saveProfile() { LS.set('unknown.profile', S.profile); }

  function leaveNow() {
    S.leaving = true;
    send({ type: 'leave' });
    S.session = null; LS.del('unknown.session');
    S.st = null; S.ui.modal = null; S.ui.sel = null; S.ui.hideEnd = false;
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
      if (hero) hero.innerHTML = figHTML(id, 'hero-fig');
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
    togglenotes() { S.ui.notes = !S.ui.notes; render(); },
    zoom(t) { S.ui.modal = { type: 'zoom', id: Number(t.dataset.id) }; renderModals(); },
    flip(t) { send({ type: 'flip', pile: t.dataset.pile }); },
    rematch() { send({ type: 'rematch' }); },
    hideend() { S.ui.hideEnd = true; renderModals(); },
  };

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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.ui.modal) actions.close();
    if (e.key === 'Enter' && e.target.id === 'in-code') actions.join();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !S.open && !S.noReconnect && (!S.ws || S.ws.readyState > 1)) connect();
  });

  /* ------------------------------------------------------- Start */

  async function init() {
    try {
      const [avatars, sets] = await Promise.all([
        fetch('data/avatars.json').then((r) => r.json()),
        fetch('data/sets.json').then((r) => r.json()),
      ]);
      S.data = { avatars, sets };
    } catch {
      $app.innerHTML = '<p class="center" style="margin-top:40px">Konnte die Spieldaten nicht laden. Bitte Seite neu laden.</p>';
      return;
    }
    render();
    connect();
  }
  init();
})();
