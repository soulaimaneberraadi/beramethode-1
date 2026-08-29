// Service worker BERAMETHODE.
// ⚠️ Le code (JS/CSS) est servi en NETWORK-FIRST : sinon un ancien bundle mis en
// cache continue de tourner après un déploiement (les correctifs n'arrivent
// jamais sur l'appareil, surtout mobile/PWA). Le cache ne sert que de repli
// hors-ligne. Les médias (images/polices) restent en cache-first (rarement
// modifiés). Bump du nom de cache → l'ancien cache est purgé à l'activation.
const CACHE = 'beramethode-v4';
const CACHE_DONNEES = 'beramethode-donnees-v1';

// Lectures que l on garde sur l appareil : ouvrir l application hors reseau
// doit montrer le dernier etat connu plutot qu une page vide.
const API_LECTURE = new RegExp("^/api/(ventes|facturation|clients|subcontract|magasin)/");
const CODE_REGEX = /\.(js|css)$/;
const MEDIA_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|woff2?)$/;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE && k !== CACHE_DONNEES).map((k) => caches.delete(k)))
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

  // Lectures d'API → RESEAU D'ABORD, cache en repli.
  //
  // Jamais l'inverse : ces chiffres sont de l'argent. Servir un solde perime
  // pendant que la connexion marche ferait prendre une decision sur un montant
  // faux. Hors reseau en revanche, le dernier etat connu vaut mieux qu'une page
  // vide — et la reponse est marquee pour que l'ecran puisse le dire.
  if (request.method === 'GET' && API_LECTURE.test(url.pathname)) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copie = res.clone();
            caches.open(CACHE_DONNEES).then((c) => c.put(request, copie));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_DONNEES);
          const garde = await cache.match(request);
          if (!garde) throw new Error('hors ligne');
          const entetes = new Headers(garde.headers);
          entetes.set('X-Bera-Cache', '1');
          return new Response(await garde.blob(), { status: 200, headers: entetes });
        })
    );
    return;
  }

  // Le reste → network-only
  e.respondWith(fetch(request));
});
