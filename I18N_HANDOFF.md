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
- **Vague 1** ✅ — 7 fichiers à ternaires `lang === …` inline : Pedido, Configuration, Magasin, ModelWorkflow, RepartitionMatrix, AgendaModal, LicenseActivation. (type-check ✅)
- **Vague 2** ✅ (~272 chaînes, type-check global clean) : Profil(12), RendementBoard(24), VueGenerale(28), Atelier(45), AnalyseTechnologique(30), Dashboard(38), Library(45), CatalogueTemps(50).
- **Correctifs post-vague 2** ✅ : Dashboard garde `TRS` (pas `OEE`) ; CatalogueTemps ne contient plus `l'5dam`.
- **Vague 3** ✅ (commits 15cd66d + suivant) : agents Sonnet sur SousTraitance(318 tx) et SuiviProduction(59 tx). Les deux fichiers sont i18n à 100% (toutes chaînes FR → 6 langues).

## 5. À FAIRE — fichiers FR restants (par taille décroissante, lancer par vagues)
| Fichier | Lignes | Note |
|---|---|---|
| Chronometrage.tsx | 4279 | géant → vague dédiée (1 agent/fichier) |
| Implantation.tsx | 4263 | géant → vague dédiée |
| GESTION-RH.tsx | 3129 | ⚠️ FINANCIER (salaires, Art. 385) — prudence max |
| Gamme.tsx | 3120 | géant |
| ~~SousTraitance.tsx~~ | 2879 | ✅ i18n complète (318 tx) |
| ~~SuiviProduction.tsx~~ | 2548 | ✅ i18n complète (59 tx) |
| LaCoupe.tsx | 2524 | |
| Effectifs.tsx | 1885 | |
| Balancing.tsx | 1830 | |
| PageMachine.tsx | 1716 | |
| StockExport.tsx | 1423 | |
| CostCalculator.tsx | 1402 | ⚠️ calcul prix de revient |
| Machin.tsx | 1178 | |
| Planning.tsx | 1078 | |
| FicheTechnique.tsx | 845 | |
| + autres | — | modals/panels/Setup/Login/Signup non encore couverts |

Stratégie : vagues de ~4 agents Sonnet sur fichiers moyens ; pour les **géants** (Chronometrage, Implantation, GESTION-RH, Gamme) → **1 agent par fichier**, et pour GESTION-RH/CostCalculator insister sur « ne pas toucher aux chiffres/formules ».

## 6. Termes financiers/textile à ARBITRER (signalés par les agents — décision de Soulaimane)
- **CUMP** vs WAC/PMP : gardé « CUMP » partout (le `en` existant utilisait « WAC »). À uniformiser.
- **BC / BL / BR / DDS / OF** : abréviations gardées identiques. Confirmer si versions localisées voulues.
- **Bain vs Lot** (teinture) : FR distingue, EN existant fusionne en « Lot ». À arbitrer.

## 7. APRÈS l'i18n : DARK MODE
- Infra OK (`ThemeContext` + bascule dans Configuration) mais **les composants n'ont pas de classes `dark:`** → la bascule ne change pas les couleurs.
- Gros chantier séparé : ajouter `dark:` partout. **Touche les MÊMES fichiers que l'i18n → à faire APRÈS l'i18n** (éviter conflits d'agents). Même méthode (vagues d'agents).
