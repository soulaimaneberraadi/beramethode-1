# Plan — Caisse / Point de vente (style Odoo)

> Document de reprise. À donner tel quel au début de la nouvelle conversation.
> Écrit après la session qui a construit les canaux de vente, le tiki et le
> contrôle d'intégrité du stock.

---

## 1. Le besoin, en une phrase

Un écran de **vente au comptoir** : on scanne le tiki d'un article, il s'ajoute
au panier au **prix « Ma boutique »**, on encaisse, et le stock est déduit —
sans passer par la sortie de stock actuelle, qui est un formulaire de gestion,
pas une caisse.

**Ce n'est pas** un nouveau module de stock : c'est une nouvelle **façade** sur
le stock qui existe déjà.

---

## 2. Ce qui existe déjà et se réutilise tel quel

Rien de la mécanique de fond n'est à réécrire. Tout est en place :

| Brique | Où | Ce qu'elle apporte à la caisse |
|---|---|---|
| Lecteur code-barres | `components/SousTraitance.tsx` → `traiterScan`, `resolveVariantByEAN` | Décode un EAN-13 en (modèle, taille, couleur). Gère déjà les modèles ET les articles achetés. |
| Prix « Ma boutique » | `st_prix.canal = 'MAGASIN'` | Le prix de vente au comptoir, déjà réglable dans « Prix de vente ». |
| Résolution de prix | `GET /api/prix/resolve?modelId=…&canal=MAGASIN` | Rend le prix applicable, repli catalogue compris. |
| Sortie de stock | `POST /api/subcontract/stock-sorties` (`createStockSortie`) | Déduit du stock **cellule par cellule**, refuse de sortir ce qui n'existe pas, rejoue le garde-fou « vente à perte ». |
| Colonne `canal` sur les sorties | `st_stock_sorties.canal` | Permet de distinguer une vente caisse d'une sortie atelier — **déjà présente, jamais utilisée par l'UI**. |
| Facture | `POST /api/subcontract/clients/facturer` (`createClientInvoice`) | Fabrique une facture VENTE à partir d'identifiants de sorties. |
| Encaissement | table `paiements` (`mode`: ESPECES / CHEQUE / VIREMENT / LCN) | Le règlement comptant existe déjà comme notion. |
| Impression | `server/printBridge.ts` + `lib/zpl.ts` | Envoi direct à une imprimante réseau (port 9100). |

**Conséquence** : la caisse est surtout un travail d'**interface** et
d'**orchestration**, pas de base de données.

---

## 3. Ce qui manque

1. **L'écran caisse** — plein écran, pensé pour un comptoir : gros boutons,
   panier à droite, scan permanent, pas de menus.
2. **Le panier** — un état local (lignes, quantités, remises) avant validation.
   Rien ne doit toucher le stock tant que la vente n'est pas encaissée.
3. **Le ticket de caisse** — court, 80 mm, différent du tiki (qui est une
   étiquette produit). À générer en HTML `@page` et/ou en ZPL.
4. **Le mode « client de passage »** — une vente comptoir n'a souvent pas de
   client nommé. Aujourd'hui la facture exige un client.
5. **Le fond de caisse / clôture de journée** — total encaissé, par mode de
   règlement. Optionnel en phase 1.

---

## 4. Décisions à trancher AVANT de coder

Ces choix changent la structure ; les fixer d'abord évite de refaire.

1. **Une vente caisse crée-t-elle une facture systématiquement ?**
   - *Option A* — Sortie de stock seulement, facture à la demande.
     Plus simple, mais le chiffre d'affaires caisse n'est pas dans `factures`.
   - *Option B* — Facture VENTE à chaque ticket, marquée `canal = MAGASIN`.
     Cohérent comptablement, mais génère beaucoup de factures.
   - **Recommandation : B**, avec une numérotation dédiée (ex. `TK-2026-0001`)
     pour ne pas mélanger tickets et factures clients.

2. **Client de passage** : créer un client « Comptoir » unique, ou autoriser
   `client_id = NULL` sur la facture ?
   - **Recommandation** : `client_id NULL` toléré + nom libre facultatif.
     Un client « Comptoir » fourre-tout fausserait les statistiques clients.

3. **Le stock est-il déduit au scan ou à l'encaissement ?**
   - **Recommandation : à l'encaissement.** Un article scanné puis retiré du
     panier ne doit jamais avoir bougé le stock.

4. **Vente à perte au comptoir** : le garde-fou existant (`BLOCK` / `CONFIRM`)
   s'applique-t-il ? Il est rejoué côté serveur, donc **oui par défaut** — il
   faut juste prévoir l'écran de motif dans la caisse, sinon la vente échouera
   sans explication.

---

## 5. Découpage proposé

### Phase 1 — La caisse qui vend (le cœur)
- Nouvelle page/onglet **Caisse**, plein écran.
- Scan → recherche (`resolveVariantByEAN`, à extraire dans un module partagé).
- Panier : ligne = modèle + taille + couleur + qté + prix `MAGASIN`.
- Recherche manuelle par nom/référence pour les articles sans tiki lisible.
- Total, remise ligne et remise globale.
- Bouton **Encaisser** → mode de règlement → `POST /stock-sorties` avec
  `canal = 'MAGASIN'`, puis facture selon la décision (4.1).
- Gestion de l'échec : stock insuffisant, vente sous le plancher.

### Phase 2 — Le ticket
- Ticket 80 mm : entête (logo/marque), lignes, total, TVA, mode de règlement,
  date, numéro.
- Réutiliser `printBridge` pour l'envoi direct ; garder le mode navigateur.

### Phase 3 — La journée
- Ouverture/clôture de caisse, total par mode de règlement, écart de caisse.
- Historique des tickets du jour, avec annulation (qui **remet en stock**).

### Phase 4 — Confort comptoir
- Raccourcis clavier, mise en attente d'un ticket, retour/échange.

---

## 6. Refactorisations préalables (petites, mais nécessaires)

`components/SousTraitance.tsx` dépasse largement les 14 000 lignes. La caisse
**ne doit pas** y être ajoutée. Avant de commencer :

1. Extraire le lecteur de code-barres (`traiterScan`, `resolveVariantByEAN`,
   `variantCodeFor`) dans `lib/scanner.ts` — la caisse et Stock & Ventes
   doivent partager exactement la même logique de décodage, sinon les deux
   écrans liront le même tiki différemment.
2. Extraire la résolution de prix côté client dans `lib/prixClient.ts`.
3. Créer `components/Caisse.tsx` comme page autonome.

---

## 7. Pièges identifiés (vécus dans ce module)

- **Champs numériques** : jamais de `0` pré-rempli — `number | ''` avec
  placeholder, sinon taper 40 donne 040.
- **Deux sources pour un même chiffre** : ne jamais afficher une quantité qui
  vient des commandes à côté d'une autre qui vient des mouvements de stock.
  Sur la caisse, **le stock des mouvements fait foi, toujours**.
- **Indicateurs filtrés** : un total affiché ne doit pas dépendre d'une
  recherche en cours.
- **Suppression en cascade** : toute entité qui porte des mouvements de stock
  doit les emporter ou refuser d'être supprimée (cf. `deleteSubcontractOrder`).
- **Le serveur Express ne redémarre pas seul** après édition de `server.ts`
  (`tsx` sans `watch`) : les nouvelles routes renvoient 404 tant qu'on n'a pas
  relancé.
- **Mode statique** (`IS_STATIC`) : tout ce module dépend d'Express. La caisse
  en dépendra aussi — le dire, ou prévoir un repli.

---

## 8. Ce qui reste ouvert ailleurs (hors caisse)

- ZPL jamais testé sur une imprimante réelle.
- Erreurs console `useAuth must be used within an AuthProvider` + 401,
  antérieures à cette session.
