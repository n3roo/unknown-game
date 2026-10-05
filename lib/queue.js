'use strict';
/* UNKNOWN – Ranked-Warteschlange. Gruppiert wartende Spieler nach ähnlichem Rating. */

const MAX_GROUP = 4;
const MIN_GROUP = 2;
const BASE_WINDOW = 150; // erlaubter Rating-Unterschied am Anfang
const WINDOW_PER_SEC = 25; // pro Sekunde Wartezeit wächst das Fenster
const FORCE_START_MS = 12000; // nach dieser Wartezeit reicht eine Gruppe ab 2 Spielern

class Queue {
  constructor() {
    this.entries = new Map(); // profileId -> { id, rating, since }
  }

  add(id, rating, now = Date.now()) {
    if (!this.entries.has(id)) this.entries.set(id, { id, rating, since: now });
  }

  remove(id) {
    return this.entries.delete(id);
  }

  has(id) {
    return this.entries.has(id);
  }

  get size() {
    return this.entries.size;
  }

  /**
   * Bildet so viele Gruppen wie möglich. Gibt Arrays von Profil-IDs zurück und entfernt sie aus der Warteschlange.
   * Der am längsten Wartende bestimmt, wer in seine Gruppe passt.
   */
  match(now = Date.now()) {
    const groups = [];
    for (;;) {
      const waiting = [...this.entries.values()].sort((a, b) => a.since - b.since);
      if (waiting.length < MIN_GROUP) break;
      const anchor = waiting[0];
      const waited = now - anchor.since;
      const window = BASE_WINDOW + (waited / 1000) * WINDOW_PER_SEC;
      const candidates = waiting
        .filter((e) => e.id !== anchor.id && Math.abs(e.rating - anchor.rating) <= window)
        .sort((a, b) => Math.abs(a.rating - anchor.rating) - Math.abs(b.rating - anchor.rating))
        .slice(0, MAX_GROUP - 1);
      const group = [anchor, ...candidates];
      const ready = group.length === MAX_GROUP || (group.length >= MIN_GROUP && waited >= FORCE_START_MS);
      if (!ready) {
        // Der Älteste findet noch niemanden: versuche es mit dem Nächsten, sonst Schluss.
        const rest = waiting.slice(1);
        if (rest.length < MIN_GROUP) break;
        // temporär ohne den Ältesten weiterprüfen
        const sub = new Queue();
        for (const e of rest) sub.entries.set(e.id, e);
        const more = sub.match(now);
        for (const g of more) {
          for (const id of g) this.entries.delete(id);
          groups.push(g);
        }
        break;
      }
      for (const e of group) this.entries.delete(e.id);
      groups.push(group.map((e) => e.id));
    }
    return groups;
  }
}

module.exports = { Queue, MAX_GROUP, MIN_GROUP, FORCE_START_MS };
