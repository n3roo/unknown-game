'use strict';
/*
 * UNKNOWN – Speicher für Profile.
 * Drei Varianten mit gleicher Schnittstelle (alles async):
 *   MemoryStore  nur im Arbeitsspeicher (Tests, Entwicklung)
 *   FileStore    JSON-Datei (lokal / Server mit dauerhafter Festplatte)
 *   TursoStore   Datenbank per HTTP (kostenloser Plan bei turso.tech) – überlebt Neustarts auf Render
 * Auswahl über Umgebungsvariablen: TURSO_URL + TURSO_TOKEN, sonst DATA_FILE, sonst Arbeitsspeicher.
 */
const fs = require('node:fs');

class MemoryStore {
  constructor() {
    this.map = new Map();
    this.kind = 'memory';
  }
  async get(id) { return this.map.has(id) ? structuredClone(this.map.get(id)) : null; }
  async put(p) { this.map.set(p.id, structuredClone(p)); }
  /* Kleine Schlüssel-Wert-Ablage (z. B. VAPID-Schlüssel für Benachrichtigungen) */
  async getKV(k) { return this.kv && this.kv.has(k) ? this.kv.get(k) : null; }
  async putKV(k, v) { (this.kv = this.kv || new Map()).set(k, v); }
  async delKV(k) { if (this.kv) this.kv.delete(k); }
  async del(id) { this.map.delete(id); }
  /** Profil per Freundescode (ID-Präfix) finden; null bei keinem oder mehrdeutigem Treffer. */
  async findByPrefix(prefix) {
    const hits = [...this.map.values()].filter((p) => p.id.startsWith(prefix));
    return hits.length === 1 ? structuredClone(hits[0]) : null;
  }
  /* Laufende Räume (damit Partien Neustarts überstehen) */
  async putRoom(code, data) { (this.rooms = this.rooms || new Map()).set(code, JSON.stringify(data)); }
  async delRoom(code) { if (this.rooms) this.rooms.delete(code); }
  async loadRooms() { return this.rooms ? [...this.rooms.values()].map((x) => JSON.parse(x)) : []; }
  ranked() { return [...this.map.values()].filter((p) => p.rankedPlayed > 0); }
  /** Beste Spieler nach Rating, optional nur eine Region. */
  async top({ region = null, limit = 50 } = {}) {
    return this.ranked()
      .filter((p) => !region || p.region === region)
      .sort((a, b) => b.rating - a.rating || a.createdAt - b.createdAt)
      .slice(0, limit)
      .map((p) => structuredClone(p));
  }
  /** Platz des Spielers (1 = Beste). */
  async rankOf(p, { region = null } = {}) {
    if (!(p.rankedPlayed > 0)) return null;
    return 1 + this.ranked().filter((q) => (!region || q.region === region) && (q.rating > p.rating || (q.rating === p.rating && q.createdAt < p.createdAt))).length;
  }
}

class FileStore extends MemoryStore {
  constructor(file) {
    super();
    this.kind = 'file';
    this.file = file;
    this.roomFile = `${file}.rooms`;
    this.kvFile = `${file}.kv`;
    try { this.kv = new Map(Object.entries(JSON.parse(fs.readFileSync(this.kvFile, 'utf8')))); } catch { this.kv = new Map(); }
    try { this.rooms = new Map(Object.entries(JSON.parse(fs.readFileSync(this.roomFile, 'utf8')))); } catch { this.rooms = new Map(); }
    this.timer = null;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const p of data) this.map.set(p.id, p);
    } catch { /* neue Datei */ }
  }
  async putKV(k, v) { await super.putKV(k, v); try { fs.writeFileSync(this.kvFile, JSON.stringify(Object.fromEntries(this.kv))); } catch { /* egal */ } }
  async delKV(k) { await super.delKV(k); try { fs.writeFileSync(this.kvFile, JSON.stringify(Object.fromEntries(this.kv))); } catch { /* egal */ } }
  async del(id) { await super.del(id); try { fs.writeFileSync(`${this.file}.tmp`, JSON.stringify([...this.map.values()])); fs.renameSync(`${this.file}.tmp`, this.file); } catch { /* egal */ } }
  async putRoom(code, data) { await super.putRoom(code, data); this.saveRooms(); }
  async delRoom(code) { await super.delRoom(code); this.saveRooms(); }
  saveRooms() {
    try { fs.writeFileSync(`${this.roomFile}.tmp`, JSON.stringify(Object.fromEntries(this.rooms))); fs.renameSync(`${this.roomFile}.tmp`, this.roomFile); } catch (err) { console.error('Räume speichern fehlgeschlagen', err.message); }
  }
  async put(p) {
    await super.put(p);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        fs.writeFileSync(`${this.file}.tmp`, JSON.stringify([...this.map.values()]));
        fs.renameSync(`${this.file}.tmp`, this.file);
      } catch (err) { console.error('Speichern fehlgeschlagen', err.message); }
    }, 500);
    this.timer.unref();
  }
}

/** libSQL/Turso über die HTTP-Schnittstelle (nur fetch, keine Abhängigkeit). */
class TursoStore {
  constructor(url, token, fetchFn = fetch) {
    this.kind = 'turso';
    this.url = url.replace(/^libsql:\/\//, 'https://').replace(/\/$/, '');
    this.token = token;
    this.fetch = fetchFn;
    this.ready = null;
  }
  async exec(sql, args = []) {
    const res = await this.fetch(`${this.url}/v2/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql, args: args.map((v) => (v === null ? { type: 'null' } : typeof v === 'number' ? { type: 'integer', value: String(Math.trunc(v)) } : { type: 'text', value: String(v) })) } },
          { type: 'close' },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Datenbank-Fehler ${res.status}`);
    const json = await res.json();
    const r = json.results && json.results[0];
    if (!r || r.type !== 'ok') throw new Error(`Datenbank-Fehler: ${JSON.stringify(r && r.error)}`);
    const result = r.response.result;
    const cols = result.cols.map((c) => c.name);
    return result.rows.map((row) => Object.fromEntries(row.map((cell, i) => [cols[i], cell.type === 'null' ? null : cell.value])));
  }
  init() {
    if (!this.ready) {
      this.ready = this.exec(`CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY, region TEXT, rating INTEGER, ranked INTEGER, created INTEGER, data TEXT)`)
        .then(() => this.exec('CREATE INDEX IF NOT EXISTS idx_rating ON profiles (rating DESC)'));
    }
    return this.ready;
  }
  async getKV(k) {
    await this.init(); await this.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
    const rows = await this.exec('SELECT v FROM kv WHERE k = ?', [k]);
    return rows[0] ? rows[0].v : null;
  }
  async putKV(k, v) {
    await this.init(); await this.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)');
    await this.exec('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', [k, String(v)]);
  }
  async delKV(k) { await this.init(); await this.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT)'); await this.exec('DELETE FROM kv WHERE k = ?', [k]); }
  async del(id) { await this.init(); await this.exec('DELETE FROM profiles WHERE id = ?', [id]); }
  async findByPrefix(prefix) {
    await this.init();
    const rows = await this.exec('SELECT data FROM profiles WHERE id LIKE ? LIMIT 2', [`${prefix.replace(/[^0-9a-f]/g, '')}%`]);
    return rows.length === 1 ? JSON.parse(rows[0].data) : null;
  }
  async putRoom(code, data) {
    await this.initRooms();
    await this.exec('INSERT INTO rooms (code, updated, data) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET updated=excluded.updated, data=excluded.data', [code, Date.now(), JSON.stringify(data)]);
  }
  async delRoom(code) { await this.initRooms(); await this.exec('DELETE FROM rooms WHERE code = ?', [code]); }
  async loadRooms() { await this.initRooms(); return (await this.exec('SELECT data FROM rooms')).map((r) => JSON.parse(r.data)); }
  initRooms() {
    if (!this.roomsReady) this.roomsReady = this.exec('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, updated INTEGER, data TEXT)');
    return this.roomsReady;
  }
  async get(id) {
    await this.init();
    const rows = await this.exec('SELECT data FROM profiles WHERE id = ?', [id]);
    return rows[0] ? JSON.parse(rows[0].data) : null;
  }
  async put(p) {
    await this.init();
    await this.exec(
      'INSERT INTO profiles (id, region, rating, ranked, created, data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET region=excluded.region, rating=excluded.rating, ranked=excluded.ranked, data=excluded.data',
      [p.id, p.region, p.rating, p.rankedPlayed, p.createdAt, JSON.stringify(p)],
    );
  }
  async top({ region = null, limit = 50 } = {}) {
    await this.init();
    const rows = region
      ? await this.exec('SELECT data FROM profiles WHERE ranked > 0 AND region = ? ORDER BY rating DESC, created ASC LIMIT ?', [region, limit])
      : await this.exec('SELECT data FROM profiles WHERE ranked > 0 ORDER BY rating DESC, created ASC LIMIT ?', [limit]);
    return rows.map((r) => JSON.parse(r.data));
  }
  async rankOf(p, { region = null } = {}) {
    if (!(p.rankedPlayed > 0)) return null;
    await this.init();
    const rows = region
      ? await this.exec('SELECT COUNT(*) AS n FROM profiles WHERE ranked > 0 AND region = ? AND (rating > ? OR (rating = ? AND created < ?))', [region, p.rating, p.rating, p.createdAt])
      : await this.exec('SELECT COUNT(*) AS n FROM profiles WHERE ranked > 0 AND (rating > ? OR (rating = ? AND created < ?))', [p.rating, p.rating, p.createdAt]);
    return 1 + Number(rows[0].n);
  }
}

function createStore(env = process.env) {
  if (env.TURSO_URL && env.TURSO_TOKEN) return new TursoStore(env.TURSO_URL, env.TURSO_TOKEN);
  if (env.DATA_FILE) return new FileStore(env.DATA_FILE);
  return new MemoryStore();
}

module.exports = { MemoryStore, FileStore, TursoStore, createStore };
