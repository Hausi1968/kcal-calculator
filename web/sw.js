/* KalorienKompass – Service Worker
 * Netzwerk zuerst: Ist das Gerät online, kommt immer die neueste Version von GitHub Pages
 * (Update „aus der Luft“). Offline wird die zuletzt geladene Version aus dem Cache genutzt.
 * Bei jeder Veröffentlichung VERSION erhöhen, damit Nutzer den Update-Hinweis sehen.
 */
const VERSION = "1.0.0";
const CACHE = "kalorienkompass-" + VERSION;
const CORE = [
  "./", "index.html", "styles.css", "calc.js", "app.js", "manifest.webmanifest",
  "icons/logo.svg", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("kalorienkompass-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: "no-cache" })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html")))
  );
});
