// Service worker BERAMETHODE.
// ⚠️ Le code (JS/CSS) est servi en NETWORK-FIRST : sinon un ancien bundle mis en
// cache continue de tourner après un déploiement (les correctifs n'arrivent
// jamais sur l'appareil, surtout mobile/PWA). Le cache ne sert que de repli
// hors-ligne. Les médias (images/polices) restent en cache-first (rarement
// modifiés). Bump du nom de cache → l'ancien cache est purgé à l'activation.
const CACHE = 'beramethode-v3';
const CODE_REGEX = /\.(js|css)$/;
const MEDIA_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|woff2?)$/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Same-origin only
  if (url.origin !== location.origin) return;

  // Navigation → network-first (toujours le dernier index.html)
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // Code (JS/CSS) → NETWORK-FIRST : toujours le dernier déploiement.
  if (CODE_REGEX.test(url.pathname)) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request)) // repli hors-ligne
    );
    return;
  }

  // Médias (images/polices) → cache-first (rarement modifiés)
  if (MEDIA_REGEX.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const fetchAndCache = fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          });
          return cached || fetchAndCache;
        })
      )
    );
    return;
  }

  // Le reste → network-only
  e.respondWith(fetch(request));
});
