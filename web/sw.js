/* KalorienKompass – Service Worker
 * Netzwerk zuerst (mit 3-Sekunden-Grenze): online kommt immer die neueste Version,
 * bei schlechtem Empfang oder offline die zuletzt geladene aus dem Cache.
 */
importScripts("version.js");
const CACHE = "kalorienkompass-" + self.APP_VERSION;
const CORE = [
  "./", "index.html", "styles.css", "version.js", "calc.js", "app.js", "manifest.webmanifest",
  "icons/logo.svg", "icons/icon-192.png", "icons/icon-512.png",
];
const TIMEOUT_MS = 3000;

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

function fromNetwork(req) {
  return fetch(req, { cache: "no-cache" }).then((res) => {
    // Nur echte, eigene Antworten speichern – keine Weiterleitungen (z. B. WLAN-Anmeldeseiten)
    if (res.ok && !res.redirected && res.type === "basic") {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });
}

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined));
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(new Promise((resolve) => {
    let done = false;
    const finish = (res) => { if (!done && res) { done = true; resolve(res); } };
    const net = fromNetwork(req);
    // Zu langsam? Dann erst einmal die gespeicherte Version zeigen
    const timer = setTimeout(() => fromCache(req).then(finish), TIMEOUT_MS);
    net.then((res) => { clearTimeout(timer); finish(res); })
      .catch(() => { clearTimeout(timer); fromCache(req).then((hit) => finish(hit || Response.error())); });
  }));
});
