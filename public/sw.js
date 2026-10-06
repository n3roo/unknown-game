'use strict';
/* UNKNOWN – Service Worker: App-Hülle und Bilder offline zwischenspeichern.
   Spielstand läuft ausschließlich über WebSocket und wird nie gecacht. */
const VERSION = 'unknown-v33';
const SHELL = ['/', '/css/style.css', '/js/app.js', '/data/sets.json', '/data/avatars.json', '/manifest.webmanifest', '/assets/logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
/* Benachrichtigungen (Freundschaftsanfragen, Lobby-Einladungen) */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { /* leer */ }
  e.waitUntil(self.registration.showNotification(d.title || 'UNKNOWN', {
    body: d.body || '', tag: d.tag || 'unknown', icon: '/assets/icons/icon-192.png', badge: '/assets/icons/icon-192.png', data: { url: d.url || '/' }, renotify: true,
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
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
