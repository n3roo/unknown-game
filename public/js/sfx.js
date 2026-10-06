'use strict';
/* UNKNOWN – Klänge (mit Web Audio erzeugt, keine Dateien nötig) und Vibration. */
(() => {
  let ctx = null;
  const LSK = 'unknown.sfx';
  let on = true; let vib = true;
  try { const v = JSON.parse(localStorage.getItem(LSK)); if (v) { on = v.on !== false; vib = v.vib !== false; } } catch { /* egal */ }
  const save = () => { try { localStorage.setItem(LSK, JSON.stringify({ on, vib })); } catch { /* egal */ } };

  function ac() {
    if (!on) return null;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch { return null; }
  }
  /** Ein Ton: Frequenz (auch Gleitton), Dauer, Wellenform, Lautstärke, Startverzögerung. */
  function tone(f0, dur, { type = 'sine', vol = 0.18, delay = 0, f1 = null, attack = 0.005 } = {}) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, { vol = 0.12, delay = 0, hp = 800 } = {}) {
    const c = ac(); if (!c) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = c.createGain(); const t = c.currentTime + delay;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t);
  }
  const buzz = (ms) => { if (vib && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* egal */ } } };

  const SFX = {
    tap() { tone(520, 0.06, { type: 'triangle', vol: 0.08 }); },
    select() { tone(660, 0.07, { type: 'triangle', vol: 0.09 }); buzz(8); },
    card() { noise(0.09, { vol: 0.16, hp: 1200 }); tone(180, 0.09, { type: 'sine', vol: 0.12, f1: 90 }); buzz(12); },
    yes() { tone(660, 0.14, { vol: 0.14 }); tone(880, 0.2, { vol: 0.14, delay: 0.09 }); },
    no() { tone(220, 0.22, { type: 'sawtooth', vol: 0.08, f1: 150 }); },
    turn() { tone(784, 0.12, { type: 'triangle', vol: 0.1 }); tone(1046, 0.18, { type: 'triangle', vol: 0.1, delay: 0.1 }); buzz([20, 40, 20]); },
    wrong() { tone(200, 0.35, { type: 'sawtooth', vol: 0.1, f1: 90 }); tone(150, 0.35, { type: 'square', vol: 0.05, f1: 70, delay: 0.05 }); buzz([60, 40, 60]); },
    win() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.28, { type: 'triangle', vol: 0.15, delay: i * 0.11 })); tone(1568, 0.7, { vol: 0.1, delay: 0.6 }); buzz([40, 30, 40, 30, 120]); },
    lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.11, delay: i * 0.16 })); },
    coin() { tone(988, 0.08, { type: 'square', vol: 0.07 }); tone(1319, 0.3, { type: 'square', vol: 0.07, delay: 0.07 }); },
    buy() { SFX.coin(); tone(1568, 0.25, { vol: 0.08, delay: 0.2 }); },
    levelup() { [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.12, delay: i * 0.08 })); },
    get on() { return on; },
    set on(v) { on = !!v; save(); if (on) SFX.tap(); },
    get vib() { return vib; },
    set vib(v) { vib = !!v; save(); if (vib) buzz(30); },
  };
  window.SFX = SFX;
  // Audio darf erst nach einer Berührung starten
  const unlock = () => { ac(); document.removeEventListener('pointerdown', unlock); };
  document.addEventListener('pointerdown', unlock);
})();
