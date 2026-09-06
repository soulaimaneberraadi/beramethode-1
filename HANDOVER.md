# Agent Handover Context

---

## Session du 4 au 6 septembre 2026 — hors ligne, synchronisation, diagnostic

**Tout est déployé** sur `master` (`d02ebcd`) et en ligne sur
`https://beramethode-1.vercel.app`. Détail technique complet : `MODE_HORS_LIGNE.md`.

### Ce qui a été fait

| Sujet | Résultat |
|---|---|
| **Saisies hors ligne** | Les écritures `/api/` qui ne peuvent pas partir sont gardées dans IndexedDB (`src/lib/filaHorsLigne.ts`) et repartent seules, **dans l'ordre**, au retour du réseau |
| **Pas de doublon au rattrapage** | `server/idempotence.ts` : chaque renvoi porte une clé ; le serveur rend la réponse d'origine au lieu de créer une 2ᵉ facture |
| **Écran noir hors ligne** | Cause mesurée : **11 fichiers JS sur 57** étaient gardés. La construction écrit maintenant la liste complète (`dist/assets/sw-precache.json`) et le worker la précharge |
| **`lazyWithRetry`** | Ne recharge plus la page quand il n'y a pas de réseau — c'était la page noire |
| **Flux SSE** | Ne sont plus mis en cache (un flux ne se termine jamais : le `cache.put` ne pouvait pas aboutir) |
| **Vercel** | La liste de préchargement est sous `/assets/`, sinon la réécriture de `vercel.json` la renvoie en HTML et le correctif est muet |
| **Bandeau hors ligne** | Devenu une pastille du header : il barrait le contenu |
| **« Retour Planning »** | Sorti du contenu vers le header, flèche de retour, libellé traduit (il était en français en dur) |
| **Envoi de dernière chance** | Il ne portait **pas** le jeton du compte : la table n'accepte que le propriétaire, le serveur le rejetait **en silence** depuis toujours |
| **Diagnostic de synchro** | Dans l'application : **Profil → « Lancer le diagnostic »** (`components/DiagnosticSync.tsx`) |
| **Histoire locale** | 50 commits n'existant que dans un conteneur ont été sauvés sur la branche `sauvegarde/master-local-2026-09-03` |

### Ce qui reste à faire

1. **Le problème des deux téléphones n'est PAS diagnostiqué.** Il faut lancer le
   diagnostic **dans l'application** sur *chacun* des deux téléphones et comparer
   l'**identifiant du compte** : s'il diffère, les deux téléphones sont sur deux
   comptes distincts et rien ne passera jamais entre eux. Une adresse e-mail
   identique ne prouve rien.
2. **Autoriser le serveur MCP Supabase** (`/mcp` dans une session interactive).
   Sans lui, aucun agent ne peut lire `user_data` ni `support_tickets`.
3. **Chaîne support → correctif (proposée, non commencée).** Les trois quarts
   existent déjà : `crashRelay.ts`, `support_tickets`, `creerTicketAutomatique`.
   Manque le réveil d'une session. Étape 1 retenue : regrouper les tickets par
   signature d'erreur, puis ouvrir une **Pull Request** — jamais un déploiement
   direct. Le texte d'un ticket est écrit par un utilisateur externe : un agent
   qui le lirait comme une instruction tout en pouvant pousser en production
   serait une porte d'entrée vers toutes les usines clientes.

### Pour reprendre en local — À LIRE AVANT DE TIRER

Le `master` de cette machine peut porter l'**autre histoire** (celle sauvegardée
sur `sauvegarde/master-local-2026-09-03`), sans aucun ancêtre commun avec
`origin/master` : un `git pull` échouera ou fera un désordre.

```bash
git fetch origin
git stash                      # s'il reste du travail non commité
git checkout master
git reset --hard origin/master # l'ancienne histoire est sauvegardée sur GitHub
npm install
npm run dev      # Vite  : 5173
npm run dev:app  # Express : 7000
```

**Fins de ligne.** Cette machine écrit en CRLF, le dépôt est en LF : le prochain
commit fera apparaître des fichiers entiers comme réécrits. Un `.gitattributes`
avec `* text=auto eol=lf` réglerait la question une fois pour toutes — non fait,
car cela retouche tous les fichiers et méritait votre accord.

---

This file serves as a context handover between AI coding agents (Antigravity and Claude Code) in this repository.

## 1. Latest Discussion Summary
The user asked about a Chrome extension called **CapsuleHub** (by Tilantra) which captures AI conversation contexts and transfers them between web interfaces (ChatGPT, Claude, Gemini, DeepSeek).
We discussed:
- How it works (Chrome extension, 5-step installation, context capsules, versioning, file drag-and-drop).
- Desktop app integration: How to run web apps like Claude or ChatGPT as standalone windows (PWA) using Chrome shortcuts to still use Chrome extensions.
- How to transfer contexts between local coding agents (like Antigravity and Claude Code) by reading this handover file or using the conversation transcript log at:
  `C:\Users\HP\.gemini\antigravity\brain\18ef9df3-3792-4d71-97e1-0de7b0266673\.system_generated\logs\transcript.jsonl`

## 2. Project Context: BERAMETHODE
- **Type**: ERP system for the textile industry in Morocco.
- **Backend**: Express.js (Port 8000), SQLite (better-sqlite3, WAL mode), Google Gemini API integration, Supabase cloud sync.
- **Frontend (Web)**: React 19 + TypeScript + Vite 8. Local port: 7000 (Vite port is 5173 but proxy/dev-app port is 7000).
- **Target Mobile Migration**: There is an approved `implementation_plan.md` in the root of the project to create a React Native (Expo) mobile app `beramethode-mobile/` that communicates with the Express backend.

## 3. Current Task / Next Steps
The active roadmap is to start implementing the **React Native / Expo Mobile App** under `beramethode-mobile/` (as described in `implementation_plan.md`):
- Phase 1: Initialize the Expo project (`npx -y create-expo-app@latest beramethode-mobile --template tabs`).
- Resolve the `ANDROID_HOME` configuration issue if running the Android emulator locally.
- Implement the screens: Login, Dashboard, Planning, Pointage, Magasin.

---
*Generated by Antigravity on 2026-06-19.*
