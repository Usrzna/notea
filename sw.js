/* Notéa — service worker : l'appli s'installe sur le téléphone et marche sans connexion.
   Le réseau d'abord (toujours la dernière version quand on est en ligne), sinon la copie gardée sur l'appareil.
   Rien n'est envoyé : seuls les fichiers de l'appli et les polices sont gardés. Les cours restent dans le stockage local. */
const CACHE = "notea-app", POLICES = "notea-polices";
const BASE = ["./", "./index.html", "./manifest.json", "./icon.svg", "./img/icons/icon-192.png", "./img/icons/apple-touch-icon.png", "./img/singe-hero.webp", "./img/singe-tete.webp"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
const delai = (p, ms) => new Promise((ok, ko) => { const t = setTimeout(() => ko(new Error("délai")), ms); p.then(r => { clearTimeout(t); ok(r); }, x => { clearTimeout(t); ko(x); }); });
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    e.respondWith(delai(fetch(r), r.mode === "navigate" ? 4000 : 8000).then(res => {
      if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r.mode === "navigate" ? "./index.html" : r, cp)); }
      return res;
    }).catch(() => caches.match(r.mode === "navigate" ? "./index.html" : r, {ignoreSearch: true}).then(h => h || caches.match(r, {ignoreSearch: true}))));
    return;
  }
  if (u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(POLICES).then(c => c.match(r).then(h => { const n = fetch(r).then(res => { if (res && (res.ok || res.type === "opaque")) c.put(r, res.clone()); return res; }).catch(() => h); return h || n; })));
  }
});
