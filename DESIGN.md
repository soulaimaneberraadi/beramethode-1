# Design System: BERAMETHODE — « Unité Planning »

**Source de vérité :** `components/planning/` (module de référence) + `components/planning/planningDesignTokens.ts`
**Police globale :** Cairo (chargée dans `index.html`)
**Plateforme :** Application web React (desktop-first, responsive)

> Ce document est la référence visuelle pour TOUTE nouvelle page ou refonte.
> Toute interface doit « ressembler au Planning » : sobre, dense, professionnelle.
> Le défaut à corriger partout : interfaces « bruyantes » (dégradés, `font-black`,
> `text-3xl`, ombres lourdes, `rounded-2xl`, boîtes d'icônes colorées).

---

## 1. Visual Theme & Atmosphere

Atmosphère **calme, dense et utilitaire** — un outil de travail, pas une vitrine.
L'esthétique est « blanc clinique » : surfaces blanches, séparateurs très fins,
typographie petite et nette, et **une seule** couleur d'accent. La hiérarchie se
crée par le **poids du texte et l'espacement**, jamais par des aplats de couleur
ou des ombres. Mots-clés : *Sobre, Compact, Précis, Sans-friction, Discret.*

Principe directeur : **« quiet UI »** — l'information prime, la décoration disparaît.

---

## 2. Color Palette & Roles

### Accent (unique)
- **Bleu Roi BERAMETHODE (`#2149C1`)** — couleur de marque unique. Réservée aux
  points d'état actifs, indicateurs de sélection, barres de progression et focus
  signifiants. À utiliser avec parcimonie ; ce n'est pas une couleur de remplissage.

### Surfaces
- **Blanc Pur (`#FFFFFF`)** — fond des cartes, en-têtes, lignes de tableau.
- **Brume Ardoise (`#F8FAFC`, slate-50)** — fond de page et remplissages subtils
  (souvent à `60%` d'opacité : `bg-slate-50/60`) pour champs et pieds de tableau.

### Traits & Séparateurs
- **Fil Ardoise Clair (`#F1F5F9`, slate-100)** — séparateurs internes (sous les
  en-têtes, entre lignes). Le trait par défaut, presque invisible.
- **Contour Ardoise (`#E2E8F0`, slate-200)** — contour extérieur des cartes et
  des champs de saisie.

### Texte
- **Encre Ardoise (`#0F172A`, slate-900)** — titres et valeurs chiffrées importantes.
- **Gris Lecture (`#334155`, slate-700)** — texte de contenu / saisies.
- **Gris Secondaire (`#64748B`, slate-500)** — libellés de champs, légendes.
- **Gris Discret (`#94A3B8`, slate-400)** — sous-titres, icônes, texte tertiaire.

### Couleur d'action principale
- **Noir Ardoise (`#0F172A`, slate-900)** — fond des boutons primaires et de la
  carte « total » mise en avant. (Le slate-900 remplace tout dégradé indigo/violet.)

### Statuts (sémantiques — uniquement pour signifier un état)
- **Vert Validé (`#047857`, emerald-700)** — terminé / prêt / en stock / actif.
- **Rouge Bloqué (`#EF4444`, red-500)** — bloqué / manque / erreur.
- **Ambre Risque (`#F59E0B`, amber-500)** — en retard / à risque / avertissement.
- **Orange Externe (`#F97316`, orange-500)** — sous-traitance / source externe.

> Règle : les couleurs de statut ne servent JAMAIS de décoration — seulement à
> communiquer un état réel (ex. « Manque » en rouge, « En stock » en vert).

---

## 3. Typography Rules

- **Famille :** **Cairo** partout (poids chargés : 300 / 400 / 500 / 700 / 900).
  Aucune autre police ne doit être imposée en `style` inline.
- **Échelle compacte** (en px explicites, pas la grande échelle Tailwind) :
  - Titre de page / section : `text-[15px]`
  - Titre de carte : `text-[13px]`
  - Corps / saisies : `text-[12px]`–`text-[13px]`
  - Libellés & légendes : `text-[11px]`
  - Méta / micro-texte : `text-[10px]`
- **Poids :** `font-semibold` (titres, valeurs) et `font-medium` (libellés, boutons).
  **Bannir `font-black` et `font-bold`** comme style par défaut.
- **Chiffres :** toujours `tabular-nums` (alignement des montants, temps, quantités).
- **Casse :** libellés en casse normale, légère ; éviter les `uppercase tracking-wider`
  agressifs. Un `uppercase` discret (`tracking-wide`, `font-medium`, slate-500) est
  toléré pour les en-têtes de colonnes de tableau.

---

## 4. Component Stylings

### Boutons
- **Primaire :** fond **Noir Ardoise (`#0F172A`)**, texte blanc, `h-8 px-3`,
  `rounded-md`, `text-[12px] font-medium`, icône `w-3.5` à gauche. Survol :
  `slate-800`. Pas d'ombre, pas de `scale` au clic.
- **Secondaire :** fond blanc ou `slate-50`, contour `slate-200`, texte `slate-700`,
  mêmes dimensions. Survol : fond `slate-50`/`slate-100`.
- **Bouton-icône :** carré `w-8 h-8`, `rounded-md`, icône `slate-500`,
  survol `bg-slate-100 text-slate-900`. État actif : `bg-slate-100`.
- **Segmented control :** conteneur `bg-slate-100/60 rounded-md p-0.5` ; segment
  actif `bg-white text-slate-900` avec **ombre fil** `shadow-[0_1px_2px_rgba(15,23,42,0.06)]` ;
  inactif `text-slate-500`.

### Cartes / Conteneurs
- Coins **subtilement arrondis** : `rounded-lg` (≈ 8px). **Jamais `rounded-2xl`.**
- Fond **Blanc Pur**, contour `border border-slate-200`. **Pas d'ombre portée**
  (l'élévation vient du trait, pas de l'ombre).
- En-tête de carte : barre `px-5 h-12`, `border-b border-slate-100`, contenant une
  petite icône monochrome (`w-4 text-slate-400`), un titre `text-[13px] font-semibold`
  et un sous-titre `text-[11px] text-slate-400`. **Pas de boîte d'icône en dégradé.**

### Champs / Formulaires
- Fond `bg-slate-50/60`, contour `border-slate-200`, `rounded-md`, `h-8`–`h-9`.
- Focus : fond `bg-white`, contour `slate-300`, anneau doux `ring-2 ring-slate-100`
  (anneau neutre, pas coloré).
- Libellé au-dessus : `text-[11px] font-medium text-slate-500 mb-1.5`.
- Icône interne : `w-3.5 text-slate-400 strokeWidth=1.75`.

### Tableaux
- En-tête : `bg-slate-50/60`, texte `slate-500`, `text-[11px] uppercase tracking-wide
  font-medium`, `border-b border-slate-100`.
- Lignes : séparateur `border-slate-100`/`divide-slate-100`, survol `hover:bg-slate-50/50`.
- Cellules : `text-[13px] text-slate-700`, padding compact (`px-4 py-2.5`).
- Totaux : valeur `text-[13px]–[14px] font-semibold text-slate-900 tabular-nums`,
  devise en `text-[10px] font-normal text-slate-400`. **Pas de pastille colorée.**

### Indicateurs d'état (Stats)
- Format **point + libellé + valeur** : pastille `w-1.5 h-1.5 rounded-full`
  (slate-400 neutre, ou `#2149C1` / statut si signifiant) + libellé `text-[12px]
  text-slate-500` + valeur `text-[12px] font-semibold text-slate-900 tabular-nums`.

### Icônes
- Bibliothèque **lucide-react**, taille `w-3.5`–`w-4`, **`strokeWidth={1.75}`**,
  couleur `text-slate-400` par défaut. Monochromes, jamais dans une boîte colorée.

---

## 5. Layout Principles

- **Densité maîtrisée :** hauteurs de rangée standardisées — en-tête principal `h-14`,
  barre secondaire `h-10`, contrôles `h-8`. Padding horizontal de section `px-5`/`px-6`.
- **Espacement vertical :** `space-y-5`/`space-y-6` entre cartes ; `gap-3`/`gap-4`
  dans les grilles. Éviter les `space-y-8`/`gap-8` trop aérés.
- **Séparateurs plutôt que cadres :** structurer par fines lignes `slate-100`
  (`border-t`, `w-px h-4 bg-slate-200` comme séparateur vertical) plutôt que par des
  boîtes imbriquées.
- **Alignement :** grilles régulières (`grid grid-cols-2/3`), chiffres alignés à
  droite et en `tabular-nums`, libellés à gauche.
- **Élévation :** interface quasi plate. La seule ombre admise est l'ombre-fil du
  segment actif (`0 1px 2px rgba(15,23,42,0.06)`).
- **Direction :** texte/termes métier en français (`dir="ltr"`) ; l'arabe reste
  possible ponctuellement (ex. « أمر الإنتاج ») sans casser la grille.

---

## Anti-patterns (à proscrire)

- ❌ Dégradés (`bg-gradient-to-*`) comme remplissage de carte/bouton/en-tête.
- ❌ `font-black` / `text-2xl`+ pour des valeurs courantes.
- ❌ `rounded-2xl`, ombres `shadow-lg`/`shadow-md` sur les cartes.
- ❌ Boîtes d'icônes colorées (`bg-indigo-100 p-2 rounded-lg`).
- ❌ Pastilles/badges colorés pour de simples montants.
- ❌ Imposer une police en `style` inline (doit rester **Cairo**).
