---
name: skils
description: >-
  Canonical French operator/machine-skill labels (pastilles, datalists, postes)
  for BERAMETHODE textile workflows. Use when the user invokes /SKILS, mentions
  « saisie ou pastille », operator skills dropdowns, effectifs postes, or
  aligning UI copy with confection vocabulary (piqueuse, surjeteuse, etc.).
---

# /SKILS — vocabulaire postes / familles machine

## Déclenchement

- L’utilisateur écrit **`/SKILS`** ou parle de la **liste déroulante** des compétences machine (comme sur le champ « Saisie ou pastille »).
- Travail sur **Effectifs**, **RH**, **fiches machine**, **datalists**, **tags** ou **poste** liés à la confection.

## Liste canonique (libellés FR — ordre d’affichage UI)

Utiliser **exactement** ces libellés (casse et ponctuation incluses) pour rester cohérent avec l’application et les données existantes :

1. **Brideuse**
2. **Colleteuse**
3. **Manuel**
4. **Piqueuse**
5. **Point invisible**
6. **Pose bouton / Boutonnière**
7. **Repassage**
8. **Surjeteuse**
9. **ZigZag**

## Référence code (source de vérité côté préréglages)

Les mêmes neuf entrées sont définies dans le projet sous :

- `lib/machineTypePresets.ts` → `BASE_MACHINE_TYPE_PRESETS`

Lors d’une implémentation ou d’un tri de liste : si l’UI doit reproduire l’ordre ci-dessus, **ordonner explicitement** selon cette liste ; le tableau TypeScript peut être dans un autre ordre, mais les **chaînes** doivent rester identiques pour éviter les doublons en base.

## Comportement attendu de l’agent

1. **Répondre** avec la liste ci-dessus quand l’utilisateur demande `/SKILS` ou « quelles sont les skills / pastilles ? ».
2. **Proposer ou valider** des options d’interface (select, combobox, tags) en réutilisant ces libellés, pas des synonymes ad hoc (ex. éviter « Pose bouton » seul si le produit attend « Pose bouton / Boutonnière »).
3. **Traduire pour le code** si besoin : clés internes en `snake_case` ou `id` stables, mais **libellé utilisateur** = ligne ci-dessus.
4. **Ne pas étendre** la liste sans demande explicite du produit ; pour les cas non couverts, préférer un champ libre séparé documenté plutôt qu’un dixième préréglage implicite.

## Glossaire rapide (pour commentaires / doc technique, pas pour remplacer les libellés UI)

| Libellé UI | Sens court |
|------------|--------------|
| Brideuse | pose de barrettes / attaches |
| Colleteuse | colletage, bandes, ourlets type T-shirt |
| Manuel | travail à la main, hors machine listée |
| Piqueuse | couture droite / plate (famille) |
| Point invisible | ourlet ou couture invisible |
| Pose bouton / Boutonnière | boutons et boutonnières |
| Repassage | repassage / finition à fer |
| Surjeteuse | surfilage / surjet |
| ZigZag | point zigzag |
