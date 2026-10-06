'use strict';
/* UNKNOWN – Service Worker: App-Hülle und Bilder offline zwischenspeichern.
   Spielstand läuft ausschließlich über WebSocket und wird nie gecacht. */
const VERSION = 'unknown-v27';
const SHELL = ['/', '/css/style.css', '/js/app.js', '/data/sets.json', '/data/avatars.json', '/manifest.webmanifest', '/assets/logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const isAsset = url.pathname.startsWith('/assets/');
  if (isAsset) {
    // Bilder: erst Cache, sonst Netz (und merken)
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  // Code und Daten: erst Netz (immer aktuell), offline aus dem Cache
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('/'))));
});
