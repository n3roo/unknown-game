'use strict';
const WebSocket = require('ws');
const { server } = require('../server');

let started = null;
function start() {
  if (!started) started = new Promise((r) => server.listen(0, () => r(server.address().port)));
  return started;
}

/** Test-Client: sammelt alle Nachrichten, wartet gezielt auf einen Typ. */
async function client(secretSeed, init) {
  const port = await start();
  const ws = new WebSocket(`ws://localhost:${port}`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (d) => { inbox.push(JSON.parse(d)); for (const w of waiters.slice()) w(); });
  const c = {
    ws, inbox, secret: secretSeed.padEnd(32, 'a').slice(0, 32).replace(/[^0-9a-f]/g, 'a'),
    send: (m) => ws.send(JSON.stringify(m)),
    next(type, ms = 4000, pred = () => true) {
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('Zeitüberschreitung: ' + type)), ms);
        const check = () => {
          const i = inbox.findIndex((m) => m.type === type && pred(m));
          if (i >= 0) { clearTimeout(t); waiters.splice(waiters.indexOf(check), 1); res(inbox.splice(i, 1)[0]); }
        };
        waiters.push(check); check();
      });
    },
    /** Letzten 'state' lesen (wartet auf den nächsten, wenn noch keiner da ist). */
    async lastState(ms = 4000) {
      let last = null;
      try { for (;;) last = await c.next('state', last ? 150 : ms); } catch { /* keine weiteren */ }
      return last;
    },
    close: () => ws.close(),
  };
  await new Promise((r) => ws.on('open', r));
  c.send({ type: 'hello', secret: c.secret, init });
  c.profile = (await c.next('profile')).profile;
  return c;
}

module.exports = { client, start, server };
