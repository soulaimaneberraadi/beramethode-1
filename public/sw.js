const CACHE = 'beramethode-v1';
const ASSET_REGEX = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Same-origin only
  if (url.origin !== location.origin) return;

  // Navigation requests → serve index.html from cache or network
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets → cache-first
  if (ASSET_REGEX.test(url.pathname)) {
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

  // Everything else → network-only
  e.respondWith(fetch(request));
});
