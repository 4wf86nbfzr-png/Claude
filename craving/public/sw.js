/**
 * Service Worker — schlank und bewusst zurueckhaltend.
 *
 * - Dokumente: erst Netz, bei Ausfall die Offline-Seite. So sieht niemand
 *   eine veraltete Speisekarte, nur weil er die Seite schon einmal offen
 *   hatte.
 * - Statische Dateien (/_next/static, Schriften, Symbole): erst Cache.
 *   Diese Pfade tragen einen Hash im Namen, koennen also nie veralten.
 * - Alles andere: unveraendert ans Netz durchreichen.
 *
 * Bestellungen und Zahlungen laufen nie ueber den Cache.
 */
const VERSION = "craving-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(VERSION);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }),
    );
    return;
  }

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:woff2?|png|svg|avif|webp|jpg|jpeg|mp4|webm)$/.test(url.pathname);

  if (!isStatic) return;

  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});
