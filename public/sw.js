// Service worker BERAMETHODE.
//
// ⚠️ RÈGLE ABSOLUE : tout ce qui entre dans `respondWith` doit se terminer par
// une vraie réponse. Une promesse qui vaut `undefined` — c'est ce que rend
// `caches.match()` quand l'entrée n'existe pas — fait échouer la navigation
// avec « FetchEvent.respondWith received an error: Returned response is null »,
// et le site devient tout simplement impossible à ouvrir. C'est arrivé : le
// repli de navigation pointait vers `/index.html`, que RIEN ne mettait jamais
// en cache. Le repli censé sauver la page hors ligne la condamnait à chaque
// hoquet de réseau.
//
// ⚠️ Le code (JS/CSS) est servi en NETWORK-FIRST : sinon un ancien bundle mis en
// cache continue de tourner après un déploiement (les correctifs n'arrivent
// jamais sur l'appareil, surtout mobile/PWA). Le cache ne sert que de repli
// hors-ligne. Les médias (images/polices) restent en cache-first (rarement
// modifiés). Bump du nom de cache → l'ancien cache est purgé à l'activation.
const CACHE = 'beramethode-v5';
const CACHE_DONNEES = 'beramethode-donnees-v1';

const CLE_PAGE = '/index.html';

// Lectures que l on garde sur l appareil : ouvrir l application hors reseau
// doit montrer le dernier etat connu plutot qu une page vide.
const API_LECTURE = new RegExp("^/api/(ventes|facturation|clients|subcontract|magasin)/");
const CODE_REGEX = /\.(js|css)$/;
const MEDIA_REGEX = /\.(png|jpg|jpeg|gif|svg|ico|woff2?)$/;

/** Dernier recours : une réponse, toujours. Jamais `undefined`. */
const reponseIndisponible = (message) =>
  new Response(message, {
    status: 504,
    statusText: 'Hors ligne',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });

/** Page minimale quand la coquille de l'application n'a jamais pu être mise en cache. */
const pageHorsLigne = () =>
  new Response(
    '<!doctype html><html lang="fr"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>BERAMETHODE — hors ligne</title>' +
    '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;' +
    'min-height:100vh;margin:0;background:#0b1220;color:#e5e7eb;text-align:center;padding:24px">' +
    '<div><h1 style="margin:0 0 8px;font-size:20px">BERAMETHODE</h1>' +
    '<p style="margin:0;color:#9ca3af">Pas de connexion. Réessayez une fois le réseau revenu.</p>' +
    '<p style="margin:16px 0 0"><button onclick="location.reload()" ' +
    'style="padding:10px 18px;border:0;border-radius:8px;background:#10b981;color:#fff;font-size:15px">' +
    'Réessayer</button></p></div></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );

// `skipWaiting()` EN PREMIER, avant toute attente.
//
// Il etait appele au bout de la chaine, apres la mise en cache de la coquille —
// donc apres un aller-retour reseau. Le nouveau worker ne prenait la main
// qu'une fois ce telechargement termine : parfois pendant la premiere
// ouverture, parfois pas, au hasard du reseau. Or c'est exactement le moment
// qui compte, celui ou un worker fautif doit ceder la place. Il cede
// maintenant tout de suite ; la coquille se met en cache derriere, sans
// retenir personne.
/**
 * Met de cote la coquille ET les fichiers qu'elle reclame.
 *
 * La coquille seule ne suffit pas : hors reseau, la page s'ouvrait mais restait
 * BLANCHE, parce que son bundle n'etait pas la. Le premier chargement d'une
 * page se fait avant que le worker n'en prenne le controle — ses fichiers ne
 * passent donc jamais par lui. On lit la coquille, on y releve les adresses des
 * scripts et des feuilles de style, et on range le tout ensemble. Des la
 * premiere visite, l'atelier peut rouvrir l'application sans reseau.
 */
const precharger = async () => {
  const cache = await caches.open(CACHE);
  const reponse = await fetch(new Request(CLE_PAGE, { cache: 'reload' }));
  if (!reponse.ok) return;
  const html = await reponse.clone().text();
  await cache.put(CLE_PAGE, reponse);
  const adresses = new Set(
    [...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]),
  );
  await Promise.all([...adresses].map((a) => cache.add(a).catch(() => undefined)));
};

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Hors ligne a l'installation : on reessaiera a la 1re navigation.
  e.waitUntil(precharger().catch(() => undefined));
});

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

  // Navigation → network-first (toujours le dernier index.html), et on garde
  // une copie fraîche de la coquille à chaque succès : le repli hors-ligne ne
  // peut ainsi jamais être vide une fois la première visite faite.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copie = res.clone();
            caches.open(CACHE).then((c) => c.put(CLE_PAGE, copie)).catch(() => {});
          }
          return res;
        })
        .catch(async () => (await caches.match(CLE_PAGE)) || pageHorsLigne()),
    );
    return;
  }

  // Code (JS/CSS) → NETWORK-FIRST : toujours le dernier déploiement.
  if (CODE_REGEX.test(url.pathname)) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone())).catch(() => {});
          return res;
        })
        // Repli hors-ligne. `caches.match` peut ne rien trouver : on répond
        // alors 504 plutôt que `undefined`, qui casserait la page entière.
        .catch(async () => (await caches.match(request)) || reponseIndisponible('script indisponible hors ligne')),
    );
    return;
  }

  // Médias (images/polices) → cache-first (rarement modifiés)
  if (MEDIA_REGEX.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone()).catch(() => {});
          return res;
        } catch {
          // Une image manquante ne doit pas faire tomber la page qui la porte.
          return reponseIndisponible('média indisponible hors ligne');
        }
      }),
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
            caches.open(CACHE_DONNEES).then((c) => c.put(request, copie)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          try {
            const cache = await caches.open(CACHE_DONNEES);
            const garde = await cache.match(request);
            if (garde) {
              const entetes = new Headers(garde.headers);
              entetes.set('X-Bera-Cache', '1');
              return new Response(await garde.blob(), { status: 200, headers: entetes });
            }
          } catch { /* cache illisible : on tombe sur la réponse ci-dessous */ }
          // Auparavant on levait une exception ici : l'appelant recevait une
          // erreur réseau opaque. Un 504 explicite se lit et se rattrape.
          return reponseIndisponible('hors ligne');
        }),
    );
    return;
  }

  // Le reste → réseau, avec une réponse d'erreur claire si le réseau manque.
  e.respondWith(fetch(request).catch(() => reponseIndisponible('hors ligne')));
});
