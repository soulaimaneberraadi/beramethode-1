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

- Idempotence serveur : un rejeu ne réexécute pas (compteur inchangé, en-tête
  `X-Bera-Rejeu`) ; un échec `4xx` n'est **pas** mémorisé et reste rejouable ;
  une requête sans clé passe intacte.
- File, dans un vrai Chromium hors ligne : `202` et rien n'atteint le serveur ;
  compteur du bandeau exact ; au retour du réseau les saisies partent dans
  l'ordre, avec des clés distinctes, et un second passage ne renvoie rien.
