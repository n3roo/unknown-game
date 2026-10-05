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
    ui: { sel: null, modal: null, guess: { sel: {}, order: [], auto: null }, pickAvatar: false, hideEnd: false },
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
  function feats(id) {
    const { c, a, l } = dec(id);
    const sh = S.data.sets.shared;
    return { c: setDef().characters[c], a: sh.accessories[a], l: sh.locations[l] };
  }
  const avatarDef = (id) => S.data.avatars.find((a) => a.id === id) || S.data.avatars[0];
  const byId = (id) => (S.st ? S.st.players.find((p) => p.id === id) : null);

  /* --------------------------------------------------- Bausteine */

  function cardHTML(id, cls = '') {
    const f = feats(id);
    const label = `${f.c.name}, ${f.a.name}, ${f.l.name}`;
    return `<div class="card ${cls}" role="img" aria-label="${esc(label)}"><div class="card-face">
      <div class="c-char"><img src="${esc(f.c.img)}" alt="" draggable="false"></div>
      <div class="c-loc"><img src="${esc(f.l.img)}" alt="" draggable="false"></div>
      <div class="c-acc"><img src="${esc(f.a.img)}" alt="" draggable="false"></div>
      <div class="c-cap">${esc(f.c.name)} · ${esc(f.a.name)} · ${esc(f.l.name)}</div>
    </div></div>`;
  }
  function backHTML() {
    return `<div class="card back" role="img" aria-label="Verdeckte Karte"><div class="card-face"><span class="mask">🎭</span><span class="q">?</span></div></div>`;
  }
  function avatarHTML(id, size = 44) {
    const a = avatarDef(id);
    return `<span class="avatar" style="--c:${esc(a.color)};--s:${size}px" title="${esc(a.name)}">${a.emoji}<img src="assets/avatars/${esc(a.id)}.png" alt="" onerror="this.remove()"></span>`;
  }
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
    if (!S.st && S.session) renderResume();
    else if (!S.st) renderHome();
    else if (S.st.phase === 'lobby') renderLobby();
    else renderGame();
    renderModals();
  }

  function renderResume() {
    $app.innerHTML = `
      <h1 class="logo">Unknown</h1>
      <section class="panel stack center">
        <p style="margin:6px 0">Du kehrst in deine Lobby ${esc(S.session.code)} zurück …</p>
        <button class="btn ghost" data-act="cancelresume">Abbrechen</button>
      </section>`;
  }

  function renderHome() {
    const prefill = (new URLSearchParams(location.search).get('code') || '').toUpperCase().slice(0, 4);
    if (!S.profile.avatar) S.profile.avatar = S.data.avatars[0].id;
    $app.innerHTML = `
      <h1 class="logo">Unknown</h1>
      <p class="tagline">Alle sehen, wer du bist. Nur du nicht.</p>
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
      <h1 class="logo small">Unknown</h1>
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

  function seatHTML(p, i, isMe) {
    const st = S.st;
    const turn = st.phase === 'playing' && st.current === i && !p.out;
    const secret = p.secret !== null
      ? `<button class="card-btn secret" data-act="zoom" data-id="${p.secret}" aria-label="Verdächtigen von ${esc(p.name)} ansehen">${cardHTML(p.secret)}</button>`
      : `<div class="secret">${backHTML()}</div>`;
    const pips = [0, 1, 2].map((k) => `<span class="pip ${k < p.wrong ? 'on' : ''}"></span>`).join('');
    const pile = (which, icon, label, cls, count) =>
      `<button class="pile ${cls}" data-act="pile" data-pid="${esc(p.id)}" data-which="${which}" aria-label="${esc(p.name)}: ${label}-Stapel mit ${count} Karten">${icon} ${count}<small>${p.flipped[which] ? 'verdeckt' : label}</small></button>`;
    let tag = '';
    if (p.out) tag = 'ausgeschieden';
    else if (!p.connected) tag = 'getrennt';
    else if (turn) tag = 'am Zug';
    else if (st.phase === 'clues' && !p.clueGiven) tag = 'überlegt …';
    const who = `<div class="who">${avatarHTML(p.avatar, isMe ? 40 : 30)}<span class="nm">${esc(p.name)}</span></div>`;
    const piles = `<div class="piles">${pile('related', '✓', 'passt', 'yes', p.relatedCount)}${pile('notRelated', '✕', 'passt nicht', 'no', p.notRelatedCount)}</div>`;
    if (isMe) {
      return `<section class="seat me ${turn ? 'turn' : ''} ${p.out ? 'out' : ''}">
        ${secret}
        <div class="info">${who}<div class="pips" title="Falsche Tipps">${pips}</div>${piles}<div class="state">${tag}</div></div>
      </section>`;
    }
    return `<div class="seat ${turn ? 'turn' : ''} ${p.out ? 'out' : ''}">
      ${secret}${who}<div class="pips" title="Falsche Tipps">${pips}</div>${piles}<div class="state">${tag}</div>
    </div>`;
  }

  function feedHTML() {
    const items = S.st.events.filter((e) => ['play', 'guess', 'flip', 'out'].includes(e.type)).slice(-3).reverse();
    return items.map((ev) => {
      const p = byId(ev.player);
      const name = `<b>${esc(p ? p.name : '?')}</b>`;
      if (ev.type === 'play') {
        return `<div class="feed-item"><div class="mini">${cardHTML(ev.card)}</div><span>${name} legt aus</span><span class="stamp ${ev.related ? 'yes' : 'no'}">${ev.related ? 'Passt' : 'Passt nicht'}</span></div>`;
      }
      if (ev.type === 'guess') {
        return `<div class="feed-item"><div class="mini">${cardHTML(ev.card)}</div><span>${name} rät</span><span class="stamp ${ev.ok ? 'yes' : 'no'}">${ev.ok ? 'Richtig' : 'Falsch'}</span></div>`;
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
        <span class="grow">${S.open ? '' : '<span class="chip">Verbinde …</span>'}</span>
        <span class="chip" title="Karten im Nachziehstapel">🂠 ${st.deckCount}</span>
        <button class="icon-btn" data-act="rules" aria-label="Spielregeln">?</button>
        <button class="icon-btn" data-act="leavepage" aria-label="Spiel verlassen">⎋</button>
      </div>
      <section class="seats" style="--n:${others.length}">${others.map((i) => seatHTML(st.players[i], i, false)).join('')}</section>
      <section class="stage">
        <div class="status ${status.mine ? 'mine' : ''}">${esc(status.text)}</div>
        <div class="feed">${feedHTML()}</div>
      </section>
      ${seatHTML(me, st.you, true)}
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
      <li><b>Raten:</b> Statt eine Karte zu spielen, nennst du deine Karte. Richtig gewinnt sofort.</li>
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
      else if (m.type === 'pile') html = pileHTML(m.pid, m.which);
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

  function pileHTML(pid, which) {
    const p = byId(pid);
    if (!p) return '<p>Spieler nicht gefunden.</p><button class="btn" data-act="close">Schließen</button>';
    const title = which === 'related' ? 'Passt' : 'Passt nicht';
    const cards = p[which];
    const body = cards === null
      ? '<p>Dieser Stapel wurde nach einem falschen Tipp umgedreht. Niemand kann ihn mehr sehen.</p>'
      : cards.length === 0
        ? '<p class="muted">Noch keine Karten.</p>'
        : `<div class="cards-grid">${cards.map((id) => `<button class="card-btn" data-act="zoom" data-id="${id}">${cardHTML(id)}</button>`).join('')}</div>`;
    return `<h2>${esc(p.name)}: ${title}</h2>${body}<button class="btn" data-act="close">Schließen</button>`;
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
      <p class="muted" style="margin-top:2px">Wähle zwei Merkmale. Das dritte ergibt sich, weil es jede Kombination nur einmal gibt.</p>
      ${rows.map(([k, title, list, cls]) => `<div class="guess-row"><h3>${title}</h3><div class="opts">${list.map((it, i) =>
        `<button class="opt ${cls}" data-act="gpick" data-k="${k}" data-v="${i}" aria-pressed="${g.sel[k] === i}"><img src="${esc(it.img)}" alt=""><span>${esc(it.name)}${g.auto === k && g.sel[k] === i ? '<br><span class="auto">ergibt sich</span>' : ''}</span></button>`).join('')}</div></div>`).join('')}
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
    const g = S.ui.guess;
    g.sel[k] = v;
    g.order = g.order.filter((x) => x !== k);
    g.order.push(k);
    g.auto = null;
    if (g.order.length >= 2) {
      const [k1, k2] = g.order.slice(-2);
      const rest = ['c', 'a', 'l'].find((x) => x !== k1 && x !== k2);
      const s = g.sel;
      s[rest] = rest === 'l' ? (s.c + s.a) % N : rest === 'a' ? (s.l - s.c + N) % N : (s.l - s.a + N) % N;
      g.auto = rest;
    }
    renderModals();
  }

  const actions = {
    avatar(t) {
      const id = t.dataset.id;
      if (S.st) { send({ type: 'avatar', avatar: id }); return; }
      S.profile.avatar = id; saveProfile();
      document.querySelectorAll('.avatar-pick').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
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
    openguess() { S.ui.guess = { sel: {}, order: [], auto: null }; S.ui.modal = { type: 'guess' }; renderModals(); },
    gpick(t) { guessPick(t.dataset.k, Number(t.dataset.v)); },
    gsend() {
      const s = S.ui.guess.sel;
      send({ type: 'guess', c: s.c, a: s.a, l: s.l });
      S.ui.modal = null; renderModals();
    },
    pile(t) { S.ui.modal = { type: 'pile', pid: t.dataset.pid, which: t.dataset.which }; renderModals(); },
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
