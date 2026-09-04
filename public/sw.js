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
const CACHE = 'beramethode-v8';
const CACHE_DONNEES = 'beramethode-donnees-v1';

const CLE_PAGE = '/index.html';

// Lectures que l on garde sur l appareil : ouvrir l application hors reseau
// doit montrer le dernier etat connu plutot qu une page vide.
//
// TOUTES les lectures de l API, et non plus cinq domaines choisis : l atelier
// qui perd le Wi-Fi ouvrait bien la page, puis tombait sur des ecrans vides des
// qu il quittait la facturation — le planning, les effectifs et le suivi n
// etaient gardes nulle part. Y compris `/api/auth/me` : sans lui, la coquille
// s ouvre sur l ecran de connexion, et se connecter sans reseau est impossible.
//
// Restent dehors ce qu il serait faux ou inutile de rendre depuis une copie :
// se connecter, se deconnecter, l IA, la licence et la synchro.
const API_LECTURE = /^\/api\//;
//
// `stream` en fait partie, et pour une raison plus grave que les autres : un
// flux SSE (`/api/dashboard/kpis/stream`) ne se termine JAMAIS. Le mettre en
// cache reviendrait a en lire le corps jusqu'au bout — c'est-a-dire a le
// retenir indefiniment, en memoire, pendant que le tableau de bord attend ses
// chiffres.
const API_JAMAIS_EN_CACHE = /^\/api\/(auth\/(login|logout|register|reset)|gemini|ai\/|license|sync\/|.*stream)/;
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

  // La coquille ne cite que ses entrees : onze fichiers sur cinquante-sept.
  // Tous les ecrans charges en `lazy` — planning, magasin, facturation — n
  // arrivaient qu au moment ou on les ouvrait, donc seulement avec du reseau.
  // Couper le Wi-Fi avant d avoir visite un ecran, et il n existait plus :
  // import dynamique en echec, page NOIRE. La liste ecrite a la construction
  // les nomme tous ; on les range des l installation.
  try {
    const liste = await fetch('/sw-precache.json', { cache: 'reload' });
    if (liste.ok) {
      const { fichiers } = await liste.json();
      if (Array.isArray(fichiers)) fichiers.forEach((f) => adresses.add(f));
    }
  } catch {
    // Pas de liste (ancienne version, reseau coupe en plein vol) : on garde au
    // moins la coquille. Le reste se mettra en cache au fil des visites.
  }

  // Par paquets : `addAll` echoue en bloc des qu un seul fichier manque, et
  // cinquante-sept telechargements lances d un coup etranglent un telephone.
  const tableau = [...adresses];
  for (let i = 0; i < tableau.length; i += 6) {
    await Promise.all(tableau.slice(i, i + 6).map((a) => cache.add(a).catch(() => undefined)));
  }
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
      // Un nouveau deploiement renomme tous les fichiers : le cache qu on vient
      // de purger est vide, et l appareil serait a nouveau sans rien hors
      // reseau jusqu a ce qu on rouvre chaque ecran. On le regarnit tout de
      // suite, pendant que la connexion est encore la.
      .then(() => precharger().catch(() => undefined))
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
          // Un chunk supprimé par un nouveau déploiement peut revenir en 200
          // avec index.html (repli SPA de l'hébergeur). Le mettre en cache
          // condamnerait l'appareil : chaque chargement suivant recevrait du
          // HTML à la place d'un module JS ("'text/html' is not a valid
          // JavaScript MIME type"). On ne garde que du vrai code, et on purge
          // l'entrée empoisonnée d'une ancienne version.
          const type = res.headers.get('content-type') || '';
          if (res.ok && !/javascript|ecmascript|text\/css/i.test(type)) {
            caches.open(CACHE).then((c) => c.delete(request)).catch(() => {});
            return res;
          }
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
  if (request.method === 'GET' && API_LECTURE.test(url.pathname) && !API_JAMAIS_EN_CACHE.test(url.pathname)) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          // Ceinture ET bretelles : une route de flux qui ne dirait pas
          // « stream » dans son adresse se reconnait encore a son type. La
          // mettre en cache figerait le tableau de bord sur une attente sans
          // fin.
          const flux = /event-stream/i.test(res.headers.get('content-type') || '');
          if (res.ok && !flux) {
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

  // ÉCRITURES de l'API → on ne touche à rien, volontairement.
  //
  // Le repli ci-dessous transforme une panne de réseau en réponse 504. Pour une
  // lecture c'est un progrès : l'appelant lit un code au lieu d'une erreur
  // opaque. Pour une écriture c'est un désastre : la file hors ligne de la page
  // reconnaît la coupure au REJET du fetch, et un 504 est une réponse — donc
  // pas un rejet. La saisie était comptée comme envoyée, et perdue. En laissant
  // passer la requête sans l'habiller, le fetch échoue pour de vrai et la file
  // la garde.
  if (url.pathname.startsWith('/api/') && request.method !== 'GET') return;

  // Le reste → réseau, avec une réponse d'erreur claire si le réseau manque.
  e.respondWith(fetch(request).catch(() => reponseIndisponible('hors ligne')));
});
