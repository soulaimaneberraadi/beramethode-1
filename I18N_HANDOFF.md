# BERAMETHODE — i18n : état & plan de continuation (handoff)

> But : traduire **tout** le programme en **6 langues** (fr, ar, en, es, pt, tr).
> Priorité langues : **fr (base) → ar → es → en → pt → tr**.
> ⚠️ Règle PRO absolue : les **termes techniques/financiers ne se traduisent JAMAIS** (identiques partout) : TVA, ICE, RC, CNSS, SAM, CPM, CUMP, OF, BL, BR, BC, MAD/EUR/USD/د.م., API, JWT, FIFO, Ctrl+Z, unités (cm, m, min, kg, %, h, pcs), noms propres, abréviations métier.
> ⚠️ « La précision = le gagne-pain » : revue humaine de Soulaimane pour les termes financiers douteux.

## 1. Architecture (FONDATION — FAITE ✅)
- `lib/i18n.ts` : `tx(lang, { fr, ar?, en?, es?, pt?, tr? })` → chaîne de la langue courante, **repli `fr`**. Et `pickT(table, lang)` pour les tables `{fr:{…}, ar:{…}, …}`.
- `src/context/LanguageContext.tsx` : hook **`useLang()`** → `{ lang, setLang }`. Provider auto-géré (persiste `localStorage['bera_lang']`, applique `dir=rtl` pour l'arabe). Monté dans `index.tsx`. `App.tsx` consomme via `useLang()`.
- Sélecteur de langue **LIVE** (6 boutons) + thème dans `Configuration.tsx`. Shell (`app/constants.ts` TRANSLATIONS) traduit en 6.

## 2. Méthode de travail (orchestration d'agents)
- Découper par page : **1 agent par lot de fichiers** (subagent `general-purpose`, **`model: 'sonnet'`**, `run_in_background: true`). Fichiers DISJOINTS entre agents → zéro conflit.
- Les agents N'ÉDITENT PAS `App.tsx`/`index.tsx`/fondation (ils utilisent `useLang()`).
- Après chaque vague (coordinateur) : `npm run type-check` global → intégration → vérif.

## 3. Template de prompt agent (réutiliser tel quel, adapter `<FICHIERS>` + `<GREP>`)
```
Projet : BERAMETHODE (ERP textile, React+TS, racine "C:\Users\HP\3D Objects\BERAMETHODE 1"). i18n : traduire l'interface FR codée en dur vers 6 langues : fr, ar, en, es, pt, tr.
OUTILS EN PLACE : `import { tx } from '../lib/i18n';` (tx(lang,{fr,ar,en,es,pt,tr}) repli fr) ; `import { useLang } from '../src/context/LanguageContext';` (const { lang } = useLang()).
FICHIERS ASSIGNÉS (les SEULS) : <FICHIERS>
TÂCHE par composant : 1) si `lang` déjà en portée l'utiliser, sinon `const { lang } = useLang();`. 2) Envelopper CHAQUE texte d'interface FR (titres, labels, boutons, placeholders, messages, tooltips, options, en-têtes, états vides, confirmations) dans `tx(lang, {fr,ar,en,es,pt,tr})`, traduit fidèlement. 3) RÈGLE PRO : termes techniques/financiers JAMAIS traduits (TVA, ICE, SAM, CPM, CUMP, OF, BL, BR, BC, MAD/EUR/USD, API, JWT, Ctrl+Z, unités, noms propres, abréviations). 4) NE PAS toucher : logique, variables, clés d'objets, classes CSS, console.*, commentaires, ids, regex, valeurs numériques, JSX ; garder les ${...} intacts.
VÉRIF : `npx tsc --noEmit 2>&1 | grep -E "<GREP>"` → corriger SEULEMENT tes fichiers.
RAPPORTER : par fichier, nb de chaînes traduites + chaînes financières douteuses.
```

## 4. État d'avancement
- **Vague 0** (fondation) ✅
- **Vague 1** ✅ — 7 fichiers.
- **Vague 2** ✅ — Profil, RendementBoard, VueGenerale, Atelier, AnalyseTechnologique, Dashboard, Library, CatalogueTemps.
- **Vague 3** ✅ — SousTraitance(318) + SuiviProduction(59).
- **Vague 4** ✅ — Effectifs(117) + PageMachine(110) + StockExport(92).
- **Vague 4b** ✅ — LaCoupe(183) + Machin(130) + Login(28) + Signup(19)
- **Vague 5** ✅ — GESTION-RH(189 tx + type-check fix)
- **Vague 5b** ✅ — Facturation(24) + A4DocumentView(31) + AdminDashboard(22)
- **Total** : ~1500 chaînes traduites en 6 langues sur ~30 composants majeurs + fondation.
- **type-check global** : ✅ clean (0 erreurs).

## 5. À FAIRE — fichiers FR restants (par taille décroissante, lancer par vagues)
| Fichier | Lignes | Note |
|---|---|---|
| ~~Chronometrage.tsx~~ | 4184 | ✅ déjà i18n (commit initial) |
| ~~Implantation.tsx~~ | 3901 | ✅ déjà i18n (commit initial) |
| ~~GESTION-RH.tsx~~ | 3129 | ⚠️ FINANCIER — ✅ i18n avec tx() sur ROLE_LABELS/STATUS_CONFIG |
| ~~Gamme.tsx~~ | 2900 | ✅ déjà i18n (commit initial) |
| ~~SousTraitance.tsx~~ | 2879 | ✅ i18n complète (318 tx) |
| ~~SuiviProduction.tsx~~ | 2548 | ✅ i18n complète (59 tx) |
| ~~LaCoupe.tsx~~ | 2524 | ✅ i18n complète (183 tx) |
| ~~Effectifs.tsx~~ | 1885 | ✅ i18n complète (117 tx) |
| ~~Balancing.tsx~~ | 1677 | ✅ déjà i18n (commit initial) |
| ~~StockExport.tsx~~ | 1423 | ✅ i18n complète (92 tx) |
| ~~CostCalculator.tsx~~ | 1321 | ⚠️ déjà i18n (commit initial) |
| ~~Machin.tsx~~ | 1178 | ✅ i18n complète (130 tx) |
| ~~Planning.tsx~~ | 1078 | ✅ déjà i18n (commit initial) |
| ~~Setup.tsx~~ | 1027 | ✅ déjà i18n (commit initial) |
| ~~MachineEditorModal.tsx~~ | 957 | déjà i18n (commit initial) |
| ~~FicheTechnique.tsx~~ | 845 | ✅ déjà i18n (commit initial) |
| ~~MaterialsList.tsx~~ | 742 | ✅ déjà i18n (commit initial) |
| ~~Login.tsx~~ | 702 | ✅ i18n complète (28 tx) |
| ~~EventEditor.tsx~~ | 1123 | déjà i18n (commit initial) |

**Fichiers restants (~100 petits fichiers)** : planning sub-components, UI atoms, modals, panels. Beaucoup sont des .ts (hooks/config) sans UI, ou des composants < 200 lignes.

Stratégie : vagues de ~4 agents Sonnet sur fichiers moyens ; pour les **géants** (Chronometrage, Implantation, GESTION-RH, Gamme) → **1 agent par fichier**, et pour GESTION-RH/CostCalculator insister sur « ne pas toucher aux chiffres/formules ».

## 6. Termes financiers/textile à ARBITRER (signalés par les agents — décision de Soulaimane)
- **CUMP** vs WAC/PMP : gardé « CUMP » partout (le `en` existant utilisait « WAC »). À uniformiser.
- **BC / BL / BR / DDS / OF** : abréviations gardées identiques. Confirmer si versions localisées voulues.
- **Bain vs Lot** (teinture) : FR distingue, EN existant fusionne en « Lot ». À arbitrer.

## 7. APRÈS l'i18n : DARK MODE
- Infra OK (`ThemeContext` + bascule dans Configuration) mais **les composants n'ont pas de classes `dark:`** → la bascule ne change pas les couleurs.
- Gros chantier séparé : ajouter `dark:` partout. **Touche les MÊMES fichiers que l'i18n → à faire APRÈS l'i18n** (éviter conflits d'agents). Même méthode (vagues d'agents).
