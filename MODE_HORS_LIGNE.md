# Mode hors ligne — écriture et rattrapage

L'application s'ouvrait déjà sans réseau (service worker), mais **tout ce qui
était saisi pendant une coupure était perdu**. Dans un atelier dont le Wi-Fi
tombe, cela veut dire ressaisir une demi-journée de pointage.

## Ce qui a changé

| Pièce | Rôle |
|---|---|
| `src/lib/filaHorsLigne.ts` | File d'attente (IndexedDB) des écritures qui n'ont pas pu partir |
| `server/idempotence.ts` | Empêche un renvoi de créer une deuxième facture / sortie de stock |
| `public/sw.js` | Garde en cache **toutes** les lectures `/api/`, et ne masque plus l'échec des écritures |
| `components/shared/BandeauHorsLigne.tsx` | Affiche le nombre de saisies en attente, l'envoi en cours, les refus |
| `vite.config.ts` + `public/sw.js` | Écrit et précharge la liste **complète** des fichiers du build |
| `lib/lazyWithRetry.ts` | Ne recharge plus la page hors réseau (c'était la page noire) |

## Pourquoi l'écran restait noir

Deux causes, mesurées et corrigées :

1. **11 fichiers JS sur 57 étaient gardés.** Le worker ne préchargeait que la
   coquille et les scripts cités dans `index.html`. Tous les écrans chargés en
   `lazy` (planning, magasin, facturation…) n'arrivaient qu'au moment où on les
   ouvrait — donc seulement avec du réseau. Couper le Wi-Fi avant d'avoir visité
   un écran, et cet écran n'existait plus : import dynamique en échec, page
   noire. La liste complète est désormais écrite à la construction
   (`dist/sw-precache.json`) et rangée dès l'installation, puis regarnie à
   chaque déploiement (un déploiement renomme tous les fichiers).

2. **`lazyWithRetry` rechargeait la page.** Ce rechargement répare le cas pour
   lequel il a été écrit — un chunk supprimé par un déploiement. Sans réseau il
   ne répare rien : il rouvre la même page, qui redemande le même fichier
   absent, et entre les deux l'écran est noir. Hors ligne, l'erreur remonte
   maintenant au garde-fou, qui explique et propose de revenir au menu.

## Comment ça marche

1. **Hors ligne** — un `POST/PUT/PATCH/DELETE` vers `/api/` est rangé dans
   IndexedDB et l'écran reçoit un `202` : la saisie est acceptée, pas perdue.
2. **Retour du réseau** — la file part **seule**, **une par une**, **dans
   l'ordre de saisie** (une réception de tissu doit précéder la sortie qui
   l'entame). Déclenchée par l'événement `online`, le retour au premier plan,
   et une reprise toutes les 60 s (un `online` peut manquer : veille, bascule
   Wi-Fi/4G).
3. **Sans doublon** — chaque renvoi porte `X-Bera-Idempotence`. Si la coupure a
   eu lieu *après* l'enregistrement serveur mais *avant* la réponse, le serveur
   reconnaît la clé et rend la réponse d'origine au lieu de réexécuter.

### La synchronisation vers le serveur n'est pas touchée

C'est la question qui compte : rien de tout cela ne doit ralentir ou fausser la
remontée vers le serveur. Vérifié, mesuré :

| Chemin de synchro | État |
|---|---|
| Flux SSE `/api/dashboard/kpis/stream` | Traverse le worker sans être mis en cache (161/161 événements reçus) |
| `POST /api/sync/push-now` | Passe intact, jamais mis en file |
| Supabase / `cloudSync` (URL absolue) | Hors de portée : le worker est *same-origin*, la file ne regarde que `/api/` |
| Lectures pendant que le réseau est là | **Toujours le serveur** (network-first) — jamais une copie périmée |

En corrigeant on a d'ailleurs trouvé une bévue introduite en élargissant le
cache : un flux SSE ne se termine jamais, et `cache.put` sur son clone ne peut
donc jamais aboutir — l'entrée n'apparaît d'ailleurs **jamais** dans le cache
(mesuré : `[]`), pendant que le navigateur bufferise le clone tant que le
tableau de bord reste ouvert. Les événements arrivaient quand même : ce n'était
pas une panne, mais un travail commencé sans fin. Les flux sont désormais
exclus, par leur adresse **et** par leur `Content-Type`.

### Ce qui n'entre jamais en file

`/api/auth/`, `/api/gemini`, `/api/ai/`, `/api/license`, `/api/sync/`,
`/api/diagnostics`, `/api/crash` — les rejouer plus tard n'a pas de sens
(se connecter hors ligne ne connecte pas). Ces appels échouent franchement.

### Limites connues

- La réponse `202` ne contient pas l'entité créée par le serveur (id, numéro de
  pièce…) : un écran qui exploite ce retour affiche l'objet local jusqu'au
  rechargement. Le bandeau vert « saisies envoyées » recharge la page d'un clic.
- Après 5 échecs, une saisie passe en **refusée** (bandeau rouge, cliquable pour
  réessayer) : sans cela, une requête que le serveur rejette en boucle bloquerait
  toute la file derrière elle.
- La session peut expirer pendant une longue coupure. Un `401/403` au rattrapage
  **conserve** la file intacte et s'arrête là : elle repartira après reconnexion.
- Le mode statique (Vercel, `VITE_STATIC_MODE=true`) reste servi par `apiShim`
  (écritures directes en localStorage + Supabase) : la file n'y intervient pas.

## Vérifications effectuées

- Hors ligne dans un vrai Chromium, **sans avoir ouvert un seul écran au
  préalable** : 57 fichiers JS gardés (contre 11), la page s'ouvre, le tableau
  de bord s'ouvre, l'écran « Planning » — jamais visité en ligne — s'affiche,
  aucun échec d'import dynamique.
- Idempotence serveur : un rejeu ne réexécute pas (compteur inchangé, en-tête
  `X-Bera-Rejeu`) ; un échec `4xx` n'est **pas** mémorisé et reste rejouable ;
  une requête sans clé passe intacte.
- File, dans un vrai Chromium hors ligne : `202` et rien n'atteint le serveur ;
  compteur du bandeau exact ; au retour du réseau les saisies partent dans
  l'ordre, avec des clés distinctes, et un second passage ne renvoie rien.
