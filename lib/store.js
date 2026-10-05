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
    this.timer = null;
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const p of data) this.map.set(p.id, p);
    } catch { /* neue Datei */ }
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
