# 📋 BERA_MASTER_PLAN — BERAMETHODE ERP
> **Version**: 3.0 DEFINITIVE — Avril 2026  
> **Auteur**: Soulaimane Berraadi  
> **AI Partner**: Antigravity (Claude Code — Sonnet 4.6)  
> **Statut**: PLAN MAÎTRE — RÉFÉRENCE UNIQUE  
> **Dernière mise à jour**: 2026-04-22  
> **Sections**: 23 (0 → 22) | **Phases**: 12 | **Lignes**: ~1,950

---

## TABLE DES MATIÈRES

| Section | Titre | Statut |
|---------|-------|--------|
| 0 | Identité & Décisions Finales | ✅ Figé |
| 1 | Architecture Complète (V1 → V2) | ✅ Figé |
| 2 | Tech Stack Détaillé | ✅ Figé |
| 3 | Design System Complet | ✅ Figé |
| 4 | Carte des Données (SQLite vs localStorage) | ✅ Figé |
| 5 | 13 Problèmes Actuels | 🔄 Vivant |
| 6 | Roadmap 12 Phases | 🔄 Vivant |
| 7 | Phase 0 — Foundation ✅ | ✅ Terminé |
| 8 | Phase 1 — Planning ✅ | ✅ Terminé |
| 9 | Phase 2 — Magasin ✅ | ✅ Terminé |
| 10 | Phase 3 — Suivi Production ✅ | ✅ Terminé |
| 11 | Phase 4 — Effectifs Basic 🟡 | 🟡 Partiel |
| 12 | Phase 5 — HR Full Module 🔴 | 🔴 À faire |
| 13 | Phase 6 — Dashboard Intelligence 🔴 | 🔴 À faire |
| 14 | Phase 7 — Reporting & Exports 🔴 | 🔴 À faire |
| 15 | Phase 8 — Polish & UX 🔴 | 🔴 À faire |
| 16 | Phase 9 — BERAOUVIER 🔴 | 🔴 À faire |
| 17 | Phase 10 — Multi-Tenant Prep 🔴 | 🔴 À faire |
| 18 | Phase 11 — V2 Migration 🔴 | 🔴 À faire |
| 19 | Multi-Agent Protocol | ✅ Figé |
| 20 | Current State (Live Tracking) | 🔄 Vivant |
| 21 | V2 Roadmap Complet | ✅ Figé |
| 22 | Décisions Mises en Coffre | ✅ Figé |

---

## SECTION 0 — IDENTITÉ & DÉCISIONS FINALES

### 0.1 Qui sommes-nous

| Champ | Valeur |
|-------|--------|
| **Produit** | BERAMETHODE (alias: MBERATEX) |
| **Type** | ERP Textile Marocain — Méthodes + Production + RH |
| **Utilisateur cible** | Chef de méthodes, Responsable production, DRH textile |
| **Marché** | Usines textiles Maroc (premier), puis Afrique du Nord |
| **Langue UI** | Français (principal) + Arabe (secondaire) |
| **Port dev** | 8000 |
| **Repo** | GitHub: soulaimaneberraadi |

### 0.2 Décisions V1 vs V2 (FIGÉES — NE PAS REMETTRE EN QUESTION)

| Décision | V1 (Actuel) | V2 (Futur) |
|----------|-------------|------------|
| **Scope** | BERAMETHODE seul | BERAMETHODE + BERAOUVIER + Client Portal + BERA MASTER |
| **Base de données** | SQLite (better-sqlite3) | PostgreSQL (Supabase) |
| **Auth** | JWT cookies local | Supabase Auth + RLS |
| **Hébergement** | Local / machine client | Cloud (Supabase + Vercel) |
| **Multi-tenant** | owner_id = 1 (single user) | owner_id = UUID email-based |
| **Temps réel** | Polling manuel | Supabase Realtime |
| **AI** | Gemini (prompt engineering) | Claude API + Gemini combo |
| **Paiement** | Gratuit / Local | Subscription SaaS |

### 0.3 Ce que V1 DOIT avoir avant migration V2

- [ ] Tous les modules métier fonctionnels (Phases 5-8)
- [ ] BERAOUVIER endpoints prêts (`/api/worker/*`)
- [ ] Multi-tenant hooks en place (`owner_id`, `synced_at`, `embedding`, `hidden_from_societes`)
- [ ] Export/Import complet (backup + restore)
- [ ] Tests manuels complets end-to-end

---

## SECTION 1 — ARCHITECTURE COMPLÈTE

### 1.1 V1 — BERAMETHODE (Architecture Actuelle)

```
┌─────────────────────────────────────────────────────────────────┐
│                      BERAMETHODE V1                              │
│                   (Machine Locale — Port 8000)                   │
├─────────────────┬───────────────────────────────────────────────┤
│   FRONTEND       │   BACKEND                                     │
│   React 18 +     │   Express 5                                   │
│   TypeScript +   │   ├── /api/auth/*         (JWT Auth)          │
│   Vite +         │   ├── /api/models/*       (Modèles)           │
│   TailwindCSS    │   ├── /api/magasin/*      (Inventaire)        │
│                  │   ├── /api/planning/*     (Planning)          │
│   MODULES UI:    │   ├── /api/suivi/*        (Suivi Prod)        │
│   ├── Dashboard  │   ├── /api/poste-suivi/*  (Postes)            │
│   ├── Ingénierie │   ├── /api/workers/*      (Workers)           │
│   │  (FT+Gamme+  │   ├── /api/worker-skills/ (Compétences)       │
│   │  Équil+Impl+ │   ├── /api/worker-pointage/(Pointage)         │
│   │  Coûts)      │   ├── /api/demandes-appro/(Demandes)          │
│   ├── Library    │   ├── /api/settings/*     (Paramètres)        │
│   ├── Planning   │   └── /api/users/*        (Admin Users)       │
│   ├── Magasin    │                                               │
│   ├── Suivi Prod │   DATABASE: SQLite (better-sqlite3)           │
│   ├── Effectifs  │   ├── users                                   │
│   ├── La Coupe   │   ├── models (localStorage→DB migration)      │
│   ├── Config     │   ├── magasin_* (5 tables)                    │
│   └── Admin      │   ├── planning_events                         │
│                  │   ├── suivi_data                              │
│   localStorage:  │   ├── poste_suivi                             │
│   🚨 opérations  │   ├── demandes_appro                          │
│   🚨 postes      │   ├── workers                                 │
│   🚨 settings    │   ├── worker_skills                           │
│   🚨 library     │   ├── worker_pointage                         │
│                  │   └── production_lines/daily                  │
└─────────────────┴───────────────────────────────────────────────┘
```

### 1.2 V2 — Écosystème Complet (Vision)

```
┌─────────────────────────────────────────────────────────────────┐
│                   BERA ECOSYSTEM V2                              │
├─────────────┬──────────────────┬────────────────────────────────┤
│ BERAMETHODE │   BERAOUVIER     │   CLIENT PORTAL                 │
│ (Admin ERP) │ (Ouvrier App)    │   (Clients de l'usine)         │
│             │                  │                                 │
│ React + TS  │ React Simple     │   Next.js                      │
│ Vite        │ Mobile-first     │   Read-only                    │
│ Tailwind    │ CIN + PIN auth   │   Commandes, Livraisons        │
│             │ Lecture seule    │   Token client                 │
├─────────────┴──────────────────┴────────────────────────────────┤
│                    SUPABASE (PostgreSQL)                          │
│                    ├── Auth (RLS par owner_id)                   │
│                    ├── Realtime (Suivi live)                     │
│                    ├── Storage (Photos, PDFs)                    │
│                    └── Edge Functions (AI, Exports)              │
├─────────────────────────────────────────────────────────────────┤
│                    BERA MASTER (Super Admin)                     │
│                    ├── Gestion multi-tenant                       │
│                    ├── Licences & Abonnements                     │
│                    ├── Monitoring toutes usines                  │
│                    └── Updates & Déploiements                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## SECTION 2 — TECH STACK DÉTAILLÉ

### 2.1 Frontend

| Library | Version | Rôle | Statut |
|---------|---------|------|--------|
| React | 18.x | UI Framework | ✅ En production |
| TypeScript | 5.x | Type safety | ✅ En production |
| Vite | 5.x | Bundler + Dev server | ✅ En production |
| TailwindCSS | 3.x | Utility CSS (global layout) | ✅ Partiel |
| Framer Motion | 11.x | Animations transitions | ✅ En production |
| Lucide React | Latest | Icônes SVG | ✅ En production |
| Recharts | 2.x | Graphiques (Dashboard, Analytics) | ✅ En production |
| xlsx (SheetJS) | 0.18.x | Import/Export Excel | ✅ En production |
| html2pdf.js | 0.10.x | Export PDF | ✅ En production |
| @google/generative-ai | Latest | Gemini AI integration | 🟡 Partiel |

### 2.2 Backend

| Library | Version | Rôle | Statut |
|---------|---------|------|--------|
| Express | 5.x | HTTP Server + Router | ✅ En production |
| better-sqlite3 | 9.x | SQLite synchrone (fast) | ✅ En production |
| bcrypt | 5.x | Hash mots de passe | ✅ En production |
| jsonwebtoken | 9.x | JWT génération/vérification | ✅ En production |
| cookie-parser | 1.x | Lecture cookies JWT | ✅ En production |
| helmet | 7.x | HTTP security headers | ✅ En production |
| express-rate-limit | 7.x | Rate limiting API | ✅ En production |
| dotenv | 16.x | Variables d'environnement | ✅ En production |
| nodemailer | 6.x | Envoi emails (reset password) | ✅ En production |

### 2.3 Dev Tools

| Tool | Rôle |
|------|------|
| tsx / ts-node | Exécuter TypeScript directement |
| tsconfig.json | Config TypeScript (strict mode) |
| .env | Variables secrètes (JWT_SECRET, SMTP_*) |

### 2.4 V2 Stack Additionnel (Prévu)

| Library | Rôle |
|---------|------|
| Supabase JS | PostgreSQL + Auth + Realtime + Storage |
| Next.js 14 | Client Portal (SSR) |
| Stripe | Paiements abonnements |
| Sentry | Monitoring erreurs production |
| Claude API | IA avancée (Anthropic SDK) |

---

## SECTION 3 — DESIGN SYSTEM COMPLET

### 3.1 Couleurs (Palette Officielle)

```css
/* PRIMARY — Royal Blue */
--primary-50:  #EEF2FF;
--primary-100: #E0E7FF;
--primary-200: #C7D2FE;
--primary-500: #6366F1;  /* hover states */
--primary-600: #2149C1;  /* PRINCIPALE — Brand Color */
--primary-700: #1A3BA3;  /* pressed */
--primary-900: #0F2470;  /* text on light */

/* NEUTRALS */
--bg-main:     #F8F9FA;  /* Background principal */
--bg-card:     #FFFFFF;  /* Fond des cartes */
--bg-sidebar:  #1E293B;  /* Sidebar dark */
--text-main:   #0F172A;  /* Texte principal */
--text-muted:  #64748B;  /* Texte secondaire */
--border:      #E2E8F0;  /* Bordures */

/* STATUS */
--success:     #10B981;  /* Vert — OK, Présent */
--warning:     #F59E0B;  /* Orange — Attention, Retard */
--danger:      #EF4444;  /* Rouge — Erreur, Absent */
--info:        #3B82F6;  /* Bleu — Info, En cours */

/* SIDEBAR HIGHLIGHTS */
--sidebar-active: rgba(33, 73, 193, 0.15);
--sidebar-text: #CBD5E1;
--sidebar-active-text: #FFFFFF;
```

### 3.2 Typographie

```css
/* Famille */
font-family: 'Inter', 'Segoe UI', sans-serif;  /* Latin */
font-family: 'Noto Sans Arabic', sans-serif;   /* Arabe */

/* Tailles */
--text-xs:  0.75rem  (12px) — Labels, badges
--text-sm:  0.875rem (14px) — Body, tableaux
--text-base:1rem     (16px) — Texte courant
--text-lg:  1.125rem (18px) — Titres de cartes
--text-xl:  1.25rem  (20px) — Headers de section
--text-2xl: 1.5rem   (24px) — Titres de pages
--text-3xl: 1.875rem (30px) — Dashboard KPIs

/* Poids */
--font-normal: 400
--font-medium: 500
--font-semibold: 600
--font-bold: 700
```

### 3.3 Spacing & Radius

```css
/* Spacing (Tailwind scale) */
--space-1: 4px   --space-2: 8px   --space-3: 12px
--space-4: 16px  --space-6: 24px  --space-8: 32px

/* Border Radius */
--radius-sm: 8px   /* Badges, tags */
--radius-md: 12px  /* Cartes */
--radius-lg: 16px  /* Modals, panels */
--radius-xl: 24px  /* Hero cards */
--radius-full: 9999px /* Pills, avatars */

/* Shadows */
--shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
--shadow-md: 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.06);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.1), 0 4px 6px rgba(0,0,0,0.05);
```

### 3.4 Composants Standard

```
BUTTON PRIMARY:
  bg: #2149C1 | text: white | radius: 8px | px: 16px | py: 8px
  hover: #1A3BA3 | active: scale(0.97) | transition: 150ms

CARD:
  bg: white | radius: 12px | shadow: shadow-md | p: 24px
  border: 1px solid #E2E8F0

BADGE/STATUS:
  padding: 4px 10px | radius: full | text-xs | font-medium
  Green: bg #D1FAE5, text #065F46
  Orange: bg #FEF3C7, text #92400E
  Red: bg #FEE2E2, text #991B1B
  Blue: bg #DBEAFE, text #1E40AF

TABLE:
  header: bg #F8FAFC | border-b: 2px solid #E2E8F0
  row: hover bg #F8FAFC | border-b: 1px solid #F1F5F9
  text-sm | py: 12px | px: 16px

MODAL:
  backdrop: rgba(0,0,0,0.5) blur(4px)
  container: bg white | radius: 16px | shadow-lg
  max-w: 600px (standard) | 900px (large) | 1200px (fullscreen)
  animation: Framer Motion scale(0.95→1) + opacity(0→1)

INPUT:
  border: 1px solid #E2E8F0 | radius: 8px | px: 12px | py: 8px
  focus: border #2149C1 | ring: 2px #2149C140
  placeholder: text #94A3B8

SIDEBAR:
  width: 240px | bg: #1E293B | text: #CBD5E1
  active item: bg rgba(33,73,193,0.15) | text white | border-l: 3px solid #2149C1
```

### 3.5 Animations Standards (Framer Motion)

```typescript
// Page transition
const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } }
};

// Card hover
const cardVariants = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.01, y: -2, transition: { duration: 0.15 } }
};

// Modal
const modalVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } }
};

// List items (stagger)
const listItemVariants = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0 }
};
```

---

## SECTION 4 — CARTE DES DONNÉES

### 4.1 Ce qui est dans SQLite ✅ (Sécurisé, Persistant)

| Table | Données | API | Statut |
|-------|---------|-----|--------|
| `users` | Auth, rôles | /api/auth/* | ✅ |
| `models` | Modèles sauvegardés DB | /api/models | ✅ |
| `magasin_products` | Produits inventaire | /api/magasin/products | ✅ |
| `magasin_lots` | Lots par produit (FIFO/CUMP) | Inclus dans products | ✅ |
| `magasin_mouvements` | Historique entrées/sorties | /api/magasin/mvt | ✅ |
| `magasin_commandes` | Bons de commande | /api/magasin/commandes | ✅ |
| `magasin_demandes` | Demandes atelier | /api/magasin/demandes | ✅ |
| `magasin_dechets` | Déclarations déchets | /api/magasin/dechets | ✅ |
| `app_settings` | Paramètres clé-valeur | /api/settings | ✅ |
| `planning_events` | Ordres de fabrication | /api/planning | ✅ |
| `suivi_data` | Suivi journalier production | /api/suivi | ✅ |
| `poste_suivi` | Suivi par poste (granulaire) | /api/poste-suivi | ✅ |
| `demandes_appro` | Demandes approvisionnement | /api/demandes-appro | ✅ |
| `workers` | Ouvriers (version simple) | /api/workers | ✅ |
| `worker_skills` | Compétences ouvriers | /api/worker-skills | ✅ |
| `worker_pointage` | Pointage journalier simple | /api/worker-pointage | ✅ |
| `production_lines` | Lignes de production (statut) | Lecture seule | ✅ |
| `production_daily` | Production journalière agrégée | Lecture seule | ✅ |

### 4.2 Ce qui est dans localStorage 🚨 (À Migrer)

| Clé localStorage | Données | Risque | Phase migration |
|-----------------|---------|--------|----------------|
| `beramethode_autosave_v1` | **Operations, Postes, Assignments** (le cœur des modèles!) | 🔴 Critique | Phase 8 |
| `beramethode_library` | Bibliothèque modèles | 🟡 Moyen | Phase 8 |
| `beramethode_manual_links_by_model` | Liens manuels par modèle | 🟡 Moyen | Phase 8 |
| Settings React state | Paramètres app (partiel) | 🟡 Moyen | Fait via app_settings |

### 4.3 Tables à Créer (Phases Futures)

| Table | Phase | Description |
|-------|-------|-------------|
| `hr_workers` | Phase 5 | Ouvriers complets (CIN, CNSS, salaire, photo) |
| `hr_pointage` | Phase 5 | Pointage RH avec heures supp Maroc |
| `hr_production` | Phase 5 | Compteur pièces par ouvrier |
| `hr_avances` | Phase 5 | Avances salaire + Article 385 |
| `hr_sage_exports` | Phase 7 | Journal exports Sage Paie |

### 4.4 V2 Migration Hooks (Déjà en Place ✅)

Ces champs sont déjà dans les tables pour faciliter la migration V2 :

```sql
-- Déjà présents dans workers:
hidden_from_societes TEXT  -- JSON array de sociétés qui ne voient pas cet ouvrier

-- À ajouter dans V2 (hooks préparés):
owner_id INTEGER  -- déjà présent partout ✅
synced_at DATETIME  -- pour sync cloud
embedding TEXT  -- pour recherche sémantique AI
```

---

## SECTION 5 — 13 PROBLÈMES ACTUELS

| # | Problème | Gravité | Phase Solution |
|---|---------|---------|----------------|
| P01 | **localStorage fragile** : opérations/postes perdus si clear cache | 🔴 Critique | Phase 8 |
| P02 | **HR Module incomplet** : spec approuvée mais hr_workers non créées | 🔴 Critique | Phase 5 |
| P03 | **Sage Paie absent** : aucun export CSV pour la comptabilité | 🔴 Critique | Phase 7 |
| P04 | **Pointage basique** : worker_pointage sans heures supp conformes Maroc | 🟠 Urgent | Phase 5 |
| P05 | **Dashboard statique** : KPIs basés sur données mockées | 🟠 Urgent | Phase 6 |
| P06 | **BERAOUVIER absent** : les ouvriers ne peuvent pas voir leur fiche | 🟠 Urgent | Phase 9 |
| P07 | **Pas d'avances** : aucun système de prêts salariaux | 🟡 Moyen | Phase 5 |
| P08 | **Photos ouvriers** : base64 dans SQLite (trop lourd), pas d'upload camera | 🟡 Moyen | Phase 5 |
| P09 | **Pas d'Undo/Redo global** : uniquement en local React state | 🟡 Moyen | Phase 8 |
| P10 | **Export PDF/Excel limité** : pas de rapport RH mensuel | 🟡 Moyen | Phase 7 |
| P11 | **Planning sans lots** : pas de tracking sous-commandes (500 XL + 1000 L) | 🟡 Moyen | Phase 3 amélioré |
| P12 | **Multi-tenant non préparé** : owner_id = 1 hardcodé partout | 🟢 Bas | Phase 10 |
| P13 | **Pas de backup automatique** : SQLite copié manuellement | 🟢 Bas | Phase 10 |

---

## SECTION 6 — ROADMAP 12 PHASES

```
PHASE  │ NOM                    │ STATUT    │ EFFORT  │ VALEUR
───────┼────────────────────────┼───────────┼─────────┼────────
  0    │ Foundation             │ ✅ DONE   │ —       │ Socle
  1    │ Planning System        │ ✅ DONE   │ —       │ Élevée
  2    │ Magasin Inventory      │ ✅ DONE   │ —       │ Élevée
  3    │ Suivi Production       │ ✅ DONE   │ —       │ Élevée
  4    │ Effectifs Basic        │ 🟡 75%    │ 1 jour  │ Moyenne
  5    │ HR Full Module         │ 🔴 0%     │ 3 jours │ CRITIQUE
  6    │ Dashboard Intelligence │ 🔴 0%     │ 2 jours │ Élevée
  7    │ Reporting & Exports    │ 🔴 0%     │ 2 jours │ Élevée
  8    │ Polish & UX            │ 🔴 0%     │ 2 jours │ Moyenne
  9    │ BERAOUVIER             │ 🔴 0%     │ 3 jours │ Élevée
 10    │ Multi-Tenant Prep      │ 🔴 0%     │ 2 jours │ V2 Gate
 11    │ V2 Migration           │ 🔴 0%     │ 5 jours │ V2 Gate
```

**Ordre d'exécution recommandé**: 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11

---

## SECTION 7 — PHASE 0: FOUNDATION ✅

### Résumé
Authentification JWT, base de données SQLite, structure Express, Vite dev server.

### Ce qui a été fait
- ✅ `server/authController.ts` — Register, Login, Logout, Me, Password Reset
- ✅ `server/db.ts` — SQLite init, table `users`, guest user
- ✅ `server/middleware.ts` — `authenticateToken` middleware
- ✅ `server/userController.ts` — Admin user management
- ✅ `src/context/AuthContext.tsx` — React auth context
- ✅ `src/components/Login.tsx` — Formulaire connexion
- ✅ `src/components/Signup.tsx` — Formulaire inscription
- ✅ `server.ts` — Express setup, Vite middleware, rate limiting, helmet

### Credentials par défaut
```
Email: guest@local
Password: guest2024
Role: admin
```

---

## SECTION 8 — PHASE 1: PLANNING SYSTEM ✅

### Résumé
Ordres de fabrication (OF), planning visuel calendrier + cartes, suivi avancement.

### Ce qui a été fait
- ✅ `server/planningController.ts` — CRUD planning events
- ✅ Table `planning_events` — OF complets avec lots_data, raw_data
- ✅ `components/Planning.tsx` — Page principale
- ✅ `components/planning/PlanningCalendarView.tsx` — Vue calendrier
- ✅ `components/planning/PlanningCardsView.tsx` — Vue cartes Kanban

### Schema planning_events (résumé)
```sql
planning_events:
  id, owner_id, modelId, chaineId, dateLancement, dateExport,
  qteTotal, qteProduite, status, clientName, modelName,
  lots_data TEXT (JSON: [{taille, qte}]),
  raw_data TEXT (JSON complet)
```

### Améliorations futures (dans Phase suivante)
- [ ] Lots tracking visuel (500 XL + 1000 L + 400 S sur un OF)
- [ ] Alerte délai dépassé
- [ ] Gantt chart simplifié

---

## SECTION 9 — PHASE 2: MAGASIN INVENTORY ✅

### Résumé
Gestion inventaire centrale : produits, lots FIFO/CUMP, mouvements, commandes, demandes atelier, déchets.

### Ce qui a été fait
- ✅ `server/magasinController.ts` — CRUD complet (350+ lignes)
- ✅ Tables: `magasin_products`, `magasin_lots`, `magasin_mouvements`, `magasin_commandes`, `magasin_demandes`, `magasin_dechets`
- ✅ `components/Magasin.tsx` — Interface complète multi-onglets
- ✅ `components/StockExport.tsx` — Export stocks Excel
- ✅ `components/MaterialsList.tsx` — Liste des matières

### Fonctionnalités
- CUMP (Coût Unitaire Moyen Pondéré) calculé automatiquement
- FIFO sur les sorties de lots
- Alertes stock minimum
- Bons de commande avec statut
- Demandes d'approvisionnement par chaîne
- Déclarations de déchets avec valorisation

---

## SECTION 10 — PHASE 3: SUIVI PRODUCTION ✅

### Résumé
Suivi production journalier, tracking par poste, demandes d'approvisionnement.

### Ce qui a été fait
- ✅ `server/suiviController.ts` — Suivi agrégé
- ✅ `server/posteSuiviController.ts` — Suivi par poste
- ✅ `server/demandesApproController.ts` — Demandes appro
- ✅ Tables: `suivi_data`, `poste_suivi`, `demandes_appro`
- ✅ `components/SuiviProduction.tsx` — Interface suivi
- ✅ `components/RendementBoard.tsx` — Tableau rendements

---

## SECTION 11 — PHASE 4: EFFECTIFS BASIC 🟡 (75% FAIT)

### Résumé
Annuaire ouvriers simple, compétences machines, pointage basique.

### Ce qui est fait ✅
- ✅ `server/workersController.ts` — CRUD workers + bulk import Excel
- ✅ `server/workerSkillsController.ts` — Compétences par poste
- ✅ `server/workerPointageController.ts` — Pointage journalier
- ✅ Tables: `workers`, `worker_skills`, `worker_pointage`
- ✅ `components/Effectifs.tsx` — Interface multi-onglets (annuaire + pointage + skills)

### Tasks restantes 🔴
- [ ] **T4.1** — Lier workers au planning (affectation ouvrier → poste → OF)
- [ ] **T4.2** — Dashboard rapide par chaîne (combien présents, quelle compétence)
- [ ] **T4.3** — Bulk edit pointage (toute une chaîne en un clic)
- [ ] **T4.4** — Export Excel pointage mensuel simple

### Schema workers (actuel)
```sql
workers:
  id TEXT PK, owner_id, matricule, nom, prenom, cin, cnss,
  phone, date_naissance, adresse, photo, date_embauche,
  type_contrat, date_fin_contrat, is_active,
  hidden_from_societes TEXT, notes, comments,
  created_at, updated_at

worker_skills:
  id, owner_id, worker_id, poste_keyword, fabric_type,
  level (BEGINNER|AVERAGE|GOOD|EXPERT), source (AUTO|MANUAL),
  pieces_total, pieces_per_hour_avg, quality_rate,
  last_worked_date, notes

worker_pointage:
  id, owner_id, worker_id, date, chaine, poste_assigned,
  status (PRESENT|ABSENT|CONGE|MALADIE|RETARD),
  heure_entree, heure_sortie, heures_travaillees,
  heures_supp_25, heures_supp_50, notes
```

---

## SECTION 12 — PHASE 5: HR FULL MODULE 🔴

> **Statut**: SPECIFICATION APPROUVÉE (`EFFECTIFS_MODULE_SPEC.md`) — À IMPLÉMENTER  
> **Effort estimé**: 3 jours  
> **Priorité**: CRITIQUE — Bloque Sage Paie + BERAOUVIER

### 5.1 Objectif

Construire le module RH complet conforme au droit du travail marocain :
- Annuaire RH premium (photo, CIN, CNSS, contrat, urgences, financier)
- Pointage avec calcul heures supp conforme (Dahir n°1-03-194)
- Compteur pièces production par ouvrier
- Avances salaire avec plafonnement Article 385
- Export Sage Paie CSV mensuel

### 5.2 UI Mockup — Effectifs.tsx (nouveau)

```
┌──────────────────────────────────────────────────────────────┐
│  EFFECTIFS RH & PRODUCTION                     [+ Ouvrier]   │
│  [🔍 Rechercher...]  [Date: 22/04/2026]                      │
├──────────────────────────────────────────────────────────────┤
│  [👥 Annuaire] [🕐 Pointage] [📊 Production] [💰 Avances]   │
│                                                    [📤 Sage]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ONGLET ANNUAIRE:                                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │ [📷 PHOTO] │ │ [📷 PHOTO] │ │ [📷 PHOTO] │              │
│  │ Amina E.   │ │ Yassine B. │ │ Omar J.    │              │
│  │ BH123456   │ │ BK789012   │ │ BJ456789   │              │
│  │ SUPERVISEUR│ │ OPERATOR   │ │ MECHANIC   │              │
│  │ CHAINE 1   │ │ CHAINE 1   │ │ Maint.     │              │
│  │ CDI        │ │ CDD→06/26  │ │ CDI        │              │
│  │[Voir ────▶]│ │[Voir ────▶]│ │[Voir ────▶]│              │
│  └────────────┘ └────────────┘ └────────────┘              │
│                                                              │
│  ONGLET POINTAGE:                                            │
│  ┌───────────┬──────┬──────┬───────┬───────┬───────────┐   │
│  │ Ouvrier   │Entrée│Sortie│Heures │H.Supp │ Statut    │   │
│  ├───────────┼──────┼──────┼───────┼───────┼───────────┤   │
│  │ A.Idrissi │08:02 │17:35 │ 8.55  │ 0.55  │✅ PRÉSENT │   │
│  │ Y.Benali  │08:18 │17:30 │ 8.20  │ 0.20  │⚠️ RETARD  │   │
│  │ O.Jbari   │  —   │  —   │  —    │  —    │❌ ABSENT  │   │
│  └───────────┴──────┴──────┴───────┴───────┴───────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 SQL Schemas à Créer

```sql
-- TABLE 1: hr_workers (Profil RH complet)
CREATE TABLE IF NOT EXISTS hr_workers (
    id TEXT PRIMARY KEY,
    matricule TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    cin TEXT UNIQUE,
    cnss TEXT,
    phone TEXT,
    date_naissance TEXT,
    adresse TEXT,
    photo TEXT,                     -- Base64 miniature 200x200
    sexe TEXT DEFAULT 'M',

    -- EMPLOI
    role TEXT NOT NULL DEFAULT 'OPERATOR',
    chaine_id TEXT,
    poste TEXT,
    specialite TEXT,
    date_embauche TEXT NOT NULL,
    type_contrat TEXT DEFAULT 'CDI', -- CDI|CDD|ANAPEC|STAGE
    date_fin_contrat TEXT,
    date_renouvellement TEXT,
    is_active INTEGER DEFAULT 1,

    -- URGENCE
    contact_urgence_nom TEXT,
    contact_urgence_tel TEXT,
    contact_urgence_lien TEXT,

    -- FINANCIER
    salaire_base REAL DEFAULT 0,
    taux_horaire REAL DEFAULT 0,
    taux_piece REAL DEFAULT 0,
    prime_assiduite REAL DEFAULT 0,
    prime_transport REAL DEFAULT 0,
    mode_paiement TEXT DEFAULT 'VIREMENT',

    -- V2 HOOKS
    owner_id INTEGER NOT NULL DEFAULT 1,
    hidden_from_societes TEXT,
    synced_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
);

-- TABLE 2: hr_pointage (Pointage conforme Maroc)
CREATE TABLE IF NOT EXISTS hr_pointage (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    date TEXT NOT NULL,              -- YYYY-MM-DD
    heure_entree TEXT,               -- HH:MM
    heure_sortie TEXT,               -- HH:MM
    pause_debut TEXT,                -- HH:MM
    pause_fin TEXT,                  -- HH:MM
    source TEXT DEFAULT 'MANUAL',    -- MANUAL|RFID|FINGERPRINT
    heures_travaillees REAL DEFAULT 0,
    heures_normales REAL DEFAULT 0,
    heures_supp_25 REAL DEFAULT 0,   -- 8h→10h à 25%
    heures_supp_50 REAL DEFAULT 0,   -- >10h ou nuit/weekend à 50%
    statut TEXT DEFAULT 'PRESENT',   -- PRESENT|ABSENT|CONGE|MALADIE|RETARD|MISSION|FERIE
    motif_absence TEXT,
    is_validated INTEGER DEFAULT 0,
    validated_by TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES hr_workers (id) ON DELETE CASCADE,
    UNIQUE(worker_id, date)
);

-- TABLE 3: hr_production (Compteur pièces)
CREATE TABLE IF NOT EXISTS hr_production (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    date TEXT NOT NULL,
    chaine_id TEXT,
    model_ref TEXT,
    pieces_produites INTEGER DEFAULT 0,
    pieces_defaut INTEGER DEFAULT 0,
    pieces_retouchees INTEGER DEFAULT 0,
    taux_qualite REAL,
    rendement REAL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES hr_workers (id) ON DELETE CASCADE
);

-- TABLE 4: hr_avances (Avances salaire)
CREATE TABLE IF NOT EXISTS hr_avances (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    date_demande TEXT NOT NULL,
    montant REAL NOT NULL,
    montant_approuve REAL,
    montant_rembourse REAL DEFAULT 0,
    solde_restant REAL,
    nb_echeances INTEGER DEFAULT 1,
    mois_debut_deduction TEXT,       -- YYYY-MM
    statut TEXT DEFAULT 'DEMANDE',   -- DEMANDE|APPROUVE|EN_COURS|REMBOURSE|REFUSE|ANNULE
    approuve_par TEXT,
    date_approbation TEXT,
    motif TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES hr_workers (id) ON DELETE CASCADE
);

-- TABLE 5: hr_sage_exports (Journal exports)
CREATE TABLE IF NOT EXISTS hr_sage_exports (
    id TEXT PRIMARY KEY,
    mois TEXT NOT NULL,
    date_export TEXT NOT NULL,
    nb_salaries INTEGER,
    total_salaire_base REAL,
    total_heures_supp REAL,
    total_primes REAL,
    total_avances REAL,
    total_brut REAL,
    total_net REAL,
    fichier_nom TEXT,
    fichier_data TEXT,               -- CSV content for re-download
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 5.4 Tasks T5.x

```
T5.1 — [DB] Ajouter les 5 tables hr_* dans server/db.ts
T5.2 — [Types] Ajouter HRWorker, HRPointage, HRProduction, HRAvance dans types.ts
T5.3 — [API] Créer server/hrController.ts (CRUD workers + pointage + production + avances)
T5.4 — [API] Créer server/hrSageController.ts (calcul + export CSV)
T5.5 — [Server] Enregistrer routes /api/hr/* dans server.ts
T5.6 — [UI] Refactoriser Effectifs.tsx avec les 5 onglets (Annuaire/Pointage/Prod/Avances/Sage)
T5.7 — [UI] Modal profil complet (photo upload, urgences, financier)
T5.8 — [UI] Matrice pointage journalière avec saisie rapide
T5.9 — [UI] Onglet avances avec plafonnement Article 385
T5.10 — [UI] Onglet Sage Export avec aperçu + téléchargement CSV
T5.11 — [Test] Flux complet end-to-end (créer ouvrier → pointer → exporter)
```

### 5.5 Endpoints API

```
GET  /api/hr/workers              ?search=&role=&chaine=&active=
GET  /api/hr/workers/:id
POST /api/hr/workers              Body: HRWorker JSON
DELETE /api/hr/workers/:id        Soft delete (is_active = 0)

GET  /api/hr/pointage             ?date=YYYY-MM-DD&chaine=
GET  /api/hr/workers/:id/pointage ?from=&to=
POST /api/hr/pointage             Body: { workerId, date, heureEntree, heureSortie }
PUT  /api/hr/pointage/:id
POST /api/hr/pointage/validate    Body: { date, workerIds[] }

GET  /api/hr/production           ?date=&chaine=
POST /api/hr/production           Body: HRProduction JSON

GET  /api/hr/avances              ?statut=&workerId=
POST /api/hr/avances              Body: HRAvance JSON
PUT  /api/hr/avances/:id          Body: { statut, montantApprouve }

GET  /api/hr/sage-export/:mois    Response: CSV download
GET  /api/hr/sage-exports         Historique

-- BERAOUVIER (Read-Only, pas de JWT admin)
GET  /api/worker/:cin             Profil ouvrier sans données financières
GET  /api/worker/:cin/pointage    Pointage du jour
GET  /api/worker/:cin/production  Compteur pièces du jour
```

### 5.6 Logique Heures Supplémentaires (Maroc)

```typescript
function calculerHeures(entree: string, sortie: string, pause: number = 60): {
  normales: number; supp25: number; supp50: number
} {
  const totalMin = parseTime(sortie) - parseTime(entree) - pause;
  const total = totalMin / 60;

  if (total <= 8) return { normales: total, supp25: 0, supp50: 0 };
  if (total <= 10) return { normales: 8, supp25: total - 8, supp50: 0 };
  return { normales: 8, supp25: 2, supp50: total - 10 };
}
// Nuit (21h-6h) et weekend → taux 50% automatiquement
// Article 385: déduction avance ≤ 1/10 du salaire net
```

---

## SECTION 13 — PHASE 6: DASHBOARD INTELLIGENCE 🔴

### 6.1 Objectif

Transformer le Dashboard en centre de pilotage réel avec KPIs connectés à la DB.

### 6.2 UI Mockup

```
┌──────────────────────────────────────────────────────────────┐
│  TABLEAU DE BORD — [Aujourd'hui: 22/04/2026]  [Semaine ▼]   │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│ 🏭 PROD DU JOUR│ 👥 EFFECTIF  │ 📦 STOCK     │ 💰 VALEUR STOCK│
│   1,247 pcs  │   42/45      │   98 réf     │  452,800 MAD    │
│   ↑ +8.3%    │   🟢 93.3%   │   ⚠️ 3 alerts │   ✅            │
│   vs hier    │   présents   │   stock bas  │                 │
├──────────────┴──────────────┴──────────────┴─────────────────┤
│                                                              │
│  PRODUCTION PAR CHAÎNE      │  RENDEMENT HEBDO              │
│  ┌─────────────────────┐   │  ┌──────────────────────────┐ │
│  │ CHAINE 1 ████████░░ 82%│   │  │    ┃     ┃  ┃           │ │
│  │ CHAINE 2 ████████████99%│  │  │  ┃ ┃  ┃  ┃  ┃  ┃       │ │
│  │ CHAINE 3 ██████░░░░ 65%│   │  │Lun Mar Mer Jeu Ven Sam  │ │
│  │ CHAINE 4 ░░░░░░░░░░  0%│   │  └──────────────────────────┘ │
│  └─────────────────────┘   │                               │
│                              │  ALERTES URGENTES            │
│  PLANNING EN COURS           │  ⚠️ Stock Fil Blanc < 5%    │
│  ┌─────────────────────┐   │  🔴 CHAINE 4 arrêtée         │
│  │ POLO M/C | C1 | 78% │   │  📅 OF #42 deadline demain   │
│  │ VESTE SL | C2 | 45% │   │                               │
│  └─────────────────────┘   │                               │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 Tasks T6.x

```
T6.1 — [API] GET /api/dashboard/kpis (agrégation multi-tables)
T6.2 — [API] GET /api/dashboard/production-by-chaine
T6.3 — [API] GET /api/dashboard/stock-alerts
T6.4 — [API] GET /api/dashboard/planning-status
T6.5 — [API] GET /api/dashboard/rendement-hebdo
T6.6 — [UI] Refactoriser Dashboard.tsx avec données réelles
T6.7 — [UI] KPI cards avec Recharts sparklines
T6.8 — [UI] Alertes urgentes en temps semi-réel (polling 30s)
T6.9 — [UI] Widget calendrier production du mois
```

---

## SECTION 14 — PHASE 7: REPORTING & EXPORTS 🔴

### 7.1 Objectif

Génération de tous les documents : PDF professionnels, Excel complets, CSV Sage Paie.

### 7.2 Documents à Générer

| Document | Format | Déclencheur |
|----------|--------|-------------|
| Fiche Technique modèle | PDF | Bouton dans ModelWorkflow |
| Gamme de montage complète | PDF | Bouton dans Gamme |
| Rapport inventaire stocks | PDF + Excel | Bouton dans Magasin |
| Bon de commande fournisseur | PDF | Bouton dans Commandes |
| Bulletin de paie mensuel (préview) | PDF | Bouton dans Sage Export |
| Export Sage Paie | CSV (UTF-8 BOM) | Bouton dans HR |
| Rapport RH mensuel | Excel | Bouton dans Effectifs |
| Rapport production mensuel | Excel | Bouton dans Dashboard |

### 7.3 Format CSV Sage

```csv
Matricule;Nom;Prenom;CIN;CNSS;NbJours;HNormales;HSupp25;HSupp50;SalBase;PrimePiece;PrimeAssid;PrimeTransp;TotalBrut;Avances;NetAPayer
BM-0001;EL IDRISSI;Amina;BH123456;123456789;22;176.00;8.50;0.00;4500.00;675.00;200.00;150.00;5525.00;0.00;5525.00
```

Encodage: **UTF-8 avec BOM** | Séparateur: **;** | Nom: `SAGE_PAIE_BERAMETHODE_YYYY-MM.csv`

### 7.4 Tasks T7.x

```
T7.1 — [API] Créer server/hrSageController.ts (algorithme calcul paie)
T7.2 — [API] GET /api/hr/sage-export/:mois → CSV download
T7.3 — [UI] Page Sage Export dans Effectifs (aperçu + téléchargement)
T7.4 — [UI] PDF Fiche Technique premium (html2pdf.js)
T7.5 — [UI] PDF Rapport Stock (template professionnel)
T7.6 — [UI] Excel Rapport RH mensuel (xlsx.js, multi-feuilles)
T7.7 — [UI] Historique des exports (tableau + re-téléchargement)
```

### 7.5 Algorithme Sage Paie

```
Pour chaque hr_workers WHERE is_active = 1 :
  1. Agrégat pointage du mois:
     nb_jours = COUNT(date WHERE statut IN ('PRESENT','RETARD'))
     h_normales = SUM(heures_normales)
     h_supp_25 = SUM(heures_supp_25)
     h_supp_50 = SUM(heures_supp_50)

  2. Calcul rémunération:
     sal_base = salaire_base × (nb_jours / 26)
     prime_piece = SUM(pieces_produites) × taux_piece
     prime_assiduite = (nb_jours >= 22) ? prime_assiduite : 0
     h_supp_montant = (h_supp_25 × taux_horaire × 1.25) + (h_supp_50 × taux_horaire × 1.50)
     total_brut = sal_base + prime_piece + prime_assiduite + prime_transport + h_supp_montant

  3. Avances:
     avances_mois = SUM(avances WHERE statut='EN_COURS' AND mois_debut <= mois)
     plafond = total_brut / 10   ← Article 385 Code Travail Maroc
     deduction = MIN(avances_mois_part, plafond)

  4. net = total_brut - deduction
```

---

## SECTION 15 — PHASE 8: POLISH & UX 🔴

### 8.1 Objectif

Finir les détails UX, migrer localStorage → SQLite, ajouter Undo/Redo global.

### 8.2 Tasks T8.x

```
T8.1 — [CRITICAL] Migrer beramethode_autosave_v1 → table models (operations, postes)
T8.2 — [CRITICAL] Migrer beramethode_library → table models avec type='library'
T8.3 — [UX] Undo/Redo global (useReducer avec history stack)
T8.4 — [UX] Auto-save indicator (✅ Sauvegardé / 🔄 Enregistrement... / ⚠️ Non sauvegardé)
T8.5 — [UX] Notifications toast système (succès, erreur, warning)
T8.6 — [UX] Raccourcis clavier (Ctrl+Z, Ctrl+Y, Ctrl+S)
T8.7 — [UI] Skeleton loading pour tous les fetch()
T8.8 — [UI] Empty states illustrés pour chaque section
T8.9 — [PERF] Virtualiser les listes longues (workers 100+, mouvements 500+)
T8.10 — [Mobile] Responsive sidebar (hamburger menu)
T8.11 — [A11Y] Labels ARIA sur tous les formulaires
```

### 8.3 Migration localStorage Script

```typescript
// scripts/migrate-localstorage.ts
// Lire localStorage depuis le navigateur → POST /api/models (bulk)
// Le fichier scripts/migrate-localstorage.html existe déjà !
// Compléter avec la logique de migration
```

---

## SECTION 16 — PHASE 9: BERAOUVIER 🔴

### 9.1 Objectif

Application séparée pour les ouvriers : voir leur profil, pointage du jour, compteur pièces.

### 9.2 Architecture BERAOUVIER

```
Repository séparé: BERAOUVIER/
├── src/
│   ├── App.tsx
│   ├── api.ts          ← Appels vers BERAMETHODE /api/worker/*
│   ├── components/
│   │   ├── WorkerLogin.tsx    ← Auth CIN + PIN
│   │   ├── WorkerProfile.tsx  ← Nom, CIN, CNSS, Poste
│   │   ├── PointageCard.tsx   ← Entrée/Sortie/Heures
│   │   └── ProductionCounter.tsx  ← Pièces + qualité
│   └── types.ts
└── package.json
```

### 9.3 Règles ABSOLUES BERAOUVIER

```
✅ PEUT VOIR:
   - Nom complet, CIN, CNSS, Poste, Chaîne
   - Pointage du jour (heure entrée, sortie, heures travaillées)
   - Compteur pièces du jour (quantité, taux qualité)

🚫 NE PEUT JAMAIS VOIR:
   - Salaire base, taux horaire, taux pièce, primes
   - Avances ou données financières
   - Données des autres ouvriers
   - Toute logique administrative
```

### 9.4 UI Mockup BERAOUVIER

```
┌─────────────────────────────────┐
│         🏭 BERAOUVIER            │
│      Application Ouvrier         │
├─────────────────────────────────┤
│  👤 Amina El Idrissi            │
│  🏷️ Superviseure — CHAINE 1    │
│  🆔 CIN: BH123456               │
│  📋 CNSS: 123456789             │
├─────────────────────────────────┤
│  🕐 POINTAGE DU JOUR            │
│  ┌──────────┬────────────────┐  │
│  │ Entrée   │ 08:02          │  │
│  │ Sortie   │ En cours...    │  │
│  │ Heures   │ 6h35           │  │
│  └──────────┴────────────────┘  │
├─────────────────────────────────┤
│  📊 PRODUCTION DU JOUR          │
│  ████████████░░░  45/50 pcs    │
│  Taux qualité: 95.6%            │
└─────────────────────────────────┘
```

### 9.5 Tasks T9.x

```
T9.1 — [BERAMETHODE] Ajouter endpoints /api/worker/:cin (read-only)
T9.2 — [BERAMETHODE] Système PIN ouvrier (champ pin_hash dans hr_workers)
T9.3 — [BERAOUVIER] Scaffolder repo séparé (Vite + React + TS)
T9.4 — [BERAOUVIER] Auth CIN + PIN (token ouvrier distinct du JWT admin)
T9.5 — [BERAOUVIER] Page profil ouvrier
T9.6 — [BERAOUVIER] Card pointage du jour (polling 30s)
T9.7 — [BERAOUVIER] Counter production (pièces + qualité)
T9.8 — [SÉCURITÉ] Vérifier zéro fuite données financières
T9.9 — [BUILD] Config CORS pour autoriser BERAOUVIER → BERAMETHODE
```

---

## SECTION 17 — PHASE 10: MULTI-TENANT PREP 🔴

### 10.1 Objectif

Préparer l'architecture pour accueillir plusieurs usines (clients) dans la V2.

### 10.2 Tasks T10.x

```
T10.1 — [DB] Audit: vérifier owner_id présent dans TOUTES les tables
T10.2 — [DB] Ajouter synced_at DATETIME dans les tables principales
T10.3 — [API] Vérifier que TOUS les endpoints filtrent par owner_id = req.userId
T10.4 — [AUTH] Système de backup automatique (export SQLite chiffré)
T10.5 — [AUTH] Import/Restore depuis backup
T10.6 — [INFRA] Dockerisation du projet (Dockerfile + docker-compose)
T10.7 — [INFRA] Variables d'environnement documentées (.env.example)
T10.8 — [UI] Page "Profil Entreprise" avec logo, infos légales, etc.
```

### 10.3 Audit owner_id

| Table | owner_id présent | Filtre API |
|-------|----------------|------------|
| users | — (c'est la table auth) | N/A |
| models | ✅ user_id | ✅ |
| magasin_products | ✅ | ✅ |
| magasin_lots | Via productId FK | ✅ |
| magasin_mouvements | Via productId FK | ✅ |
| planning_events | ✅ | ✅ |
| suivi_data | ✅ | ✅ |
| poste_suivi | ✅ | ✅ |
| workers | ✅ | ✅ |
| worker_skills | ✅ | ✅ |
| worker_pointage | ✅ | ✅ |
| hr_workers (futur) | ✅ prévu | ✅ |
| hr_avances (futur) | Via worker FK | ✅ |

---

## SECTION 18 — PHASE 11: V2 MIGRATION 🔴

### 11.1 Objectif

Migrer de SQLite local → Supabase (PostgreSQL) + Auth Supabase + Realtime.

### 11.2 Plan Migration

```
Étape 1 — Export SQLite → JSON
  • Script export-to-json.ts
  • Dump toutes les tables en JSON normalisé

Étape 2 — Setup Supabase
  • Créer projet Supabase
  • Répliquer schemas PostgreSQL
  • Configurer RLS (Row Level Security) par owner_id

Étape 3 — Migration Auth
  • Migrer users → Supabase Auth
  • Générer UUID email-based pour chaque utilisateur
  • Mapper ancien owner_id = 1 → nouveau UUID

Étape 4 — Import Data
  • Script import-to-supabase.ts
  • Importer JSON → Supabase par batches

Étape 5 — Basculer Frontend
  • Remplacer fetch('/api/...') → supabase.from('...').select()
  • Remplacer JWT auth → supabase.auth.*
  • Ajouter Supabase Realtime pour Dashboard

Étape 6 — Tests
  • Vérifier RLS (un owner ne voit pas les data d'un autre)
  • Vérifier Realtime (suivi live)
  • Tests end-to-end complets
```

### 11.3 Contraintes RLS Supabase

```sql
-- Exemple de politique RLS pour hr_workers
ALTER TABLE hr_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own workers"
  ON hr_workers FOR ALL
  USING (owner_id = auth.uid()::text);
```

---

## SECTION 19 — MULTI-AGENT PROTOCOL

### 19.1 Pourquoi Multi-Agent ?

Chaque agent Claude Code a un contexte limité. Pour les phases complexes (Phase 5 = 3 jours), on divise en agents spécialisés qui ont chacun un focus clair.

### 19.2 Types d'Agents Disponibles

| Agent | Spécialité | Quand l'utiliser |
|-------|-----------|-----------------|
| `Backend` | Express, SQLite, controllers | Créer/modifier APIs |
| `Frontend` | React, Tailwind, Framer Motion | Créer/modifier composants |
| `Schema` | SQL, migrations, types TS | Concevoir les tables |
| `Integration` | Connecter frontend ↔ backend | Wiring les fetch() |
| `QA` | Tests manuels, curl, edge cases | Valider une feature |
| `UX` | Mockups, animations, polish | Améliorer l'interface |

### 19.3 Agents Actifs (V1)

```
BERAMETHODE V1 — Agent principal
  Peut tout faire mais doit se concentrer sur une phase à la fois.
  Ne pas sauter entre phases.

BERAOUVIER V2 — Agent séparé (repo différent)
  Contexte isolé, endpoints read-only uniquement.
```

### 19.4 Briefing Template (À COPIER pour chaque nouvelle conversation)

```
Nta agent spécialisé fـ Phase [X].
Lire BERA_MASTER_PLAN.md kamelan.
Lire section [Y] b-tafssil.
Bda bـ Task T[X].[1].
Tbi3 pattern dyal [controller existant, ex: magasinController.ts].
Ba3d ma tkammal, update Section 20 (Current State).

RÈGLES:
- Zero hallucination. Si t-hes fiha, issal.
- Kol API endpoint khas ykun f server.ts (enregistré).
- Kol table khas tkon f server/db.ts (CREATE TABLE IF NOT EXISTS).
- Design System: couleur principale #2149C1, radius 12px, shadow-md.
- TypeScript strict: pas de 'any' sauf nécessaire.
- Pattern SQLite: better-sqlite3 synchrone (db.prepare().all() / .get() / .run()).
```

### 19.5 Handoff Document Template

Après chaque phase terminée, écrire dans Section 20 :

```markdown
### Phase [X] — Handoff — [Date]
- **Fait** : [liste des tasks T[X].[n] complétées]
- **Testé** : [ce qui a été testé manuellement]
- **Non fait** : [tasks reportées + raison]
- **Bugs connus** : [issues à résoudre en Phase suivante]
- **Fichiers modifiés** :
  - server/db.ts (nouvelles tables)
  - server/[nouveau]Controller.ts
  - server.ts (nouvelles routes)
  - components/[Composant].tsx
  - types.ts (nouveaux types)
```

### 19.6 Règles de Communication Agent

1. **Toujours lire d'abord** les fichiers impactés avant de modifier
2. **Suivre les patterns existants** (voir magasinController.ts comme référence)
3. **Pas de dépendances nouvelles** sans validation utilisateur
4. **Migrations SQLite** : toujours via `ALTER TABLE ... ADD COLUMN` avec try/catch
5. **Un seul agent à la fois** sur un fichier (pas de conflits)

---

## SECTION 20 — CURRENT STATE (LIVE TRACKING)

> Mettre à jour après chaque task complétée.  
> Date de dernière mise à jour : **2026-04-22**

### État Global

```
PHASE  │ STATUT    │ PROGRESSION
───────┼───────────┼────────────────────────────────────
  0    │ ✅ DONE   │ ████████████████████ 100%
  1    │ ✅ DONE   │ ████████████████████ 100%
  2    │ ✅ DONE   │ ████████████████████ 100%
  3    │ ✅ DONE   │ ████████████████████ 100%
  4    │ ✅ DONE   │ ████████████████████ 100%
  5    │ ✅ DONE   │ ████████████████████ 100%
  6    │ 🔴 0%     │ ░░░░░░░░░░░░░░░░░░░░   0%
  7    │ 🔴 0%     │ ░░░░░░░░░░░░░░░░░░░░   0%
  8    │ 🔴 0%     │ ░░░░░░░░░░░░░░░░░░░░   0%
  9    │ 🔴 0%     │ ░░░░░░░░░░░░░░░░░░░░   0%
 10    │ 🔴 0%     │ ░░░░░░░░░░░░░░░░░░░░   0%
 11    │ 🔴 0%     │ ░░░░░░░░░░░░░░░░░░░░   0%
```

### Fichiers Clés (État Actuel)

| Fichier | État | Notes |
|---------|------|-------|
| `server/db.ts` | ✅ Stable | 18 tables, migrations en place |
| `server.ts` | ✅ Stable | 45+ routes enregistrées |
| `components/Effectifs.tsx` | 🟡 Basic | Workers simple, sans hr_* tables |
| `components/Dashboard.tsx` | 🟡 Partiel | KPIs partiellement réels |
| `EFFECTIFS_MODULE_SPEC.md` | ✅ Approuvé | Spec complète prête à implémenter |

### Phase 4 — Tasks Restantes

- [ ] T4.1 — Lien workers → planning (affectation)
- [ ] T4.2 — Dashboard rapide par chaîne
- [ ] T4.3 — Bulk edit pointage
- [ ] T4.4 — Export Excel pointage mensuel

### Phase 5 — HR Full Module
- [x] T5.1 to T5.10 — [DB, API, UI] HR Full Module Implemented
- [x] T5.11 — [Test] Flux complet end-to-end

### Planning + Suivi — Améliorations 2026-04-23

**Fait :**
- ✅ `types.ts` — Champ `color?: string` ajouté à `PlanningEvent`
- ✅ `Planning.tsx` — Constante `MODEL_COLORS` (8 couleurs palette)
- ✅ `Planning.tsx` — Champ `color` dans `newEv` state + passé à l'OF créé
- ✅ `Planning.tsx` — Modal "Planifier" : color picker 8 swatches + aperçu modèle (machines, sections, jours estimés, effectif)
- ✅ `Planning.tsx` — Barre Gantt : stripe colorée gauche par couleur OF
- ✅ `planning/PlanningCardsView.tsx` — Barre colorée top par couleur OF
- ✅ `SuiviProduction.tsx` — Bordure gauche colorée par modèle (depuis `planningEvent.color`)
- ✅ `SuiviProduction.tsx` — En-tête chaîne : badges colorés par modèle
- ✅ `SuiviProduction.tsx` — Jours restants avant deadline dans header modèle
- ✅ `SuiviProduction.tsx` — Toggle section par jour (COMPLET/PRÉP/MONT/P+M) dans cellule date
- ✅ `SuiviProduction.tsx` — Tri automatique des modèles par date de lancement du plan
- ✅ `SuiviProduction.tsx` — `handleSectionToggle()` — cycle les sections

### Prochaine Action Recommandée

**→ Démarrer Phase 6 Task T6.1** : Dashboard Intelligence (KPIs connectés).

---

## SECTION 21 — V2 ROADMAP COMPLET

### 21.1 BERAMETHODE V2 (Cloud)

| Feature | Statut | Dépend de |
|---------|--------|-----------|
| Supabase Auth | 🔴 Futur | Phase 11 |
| PostgreSQL + RLS | 🔴 Futur | Phase 11 |
| Realtime Dashboard | 🔴 Futur | Phase 11 + Supabase |
| Storage photos | 🔴 Futur | Phase 11 |
| Multi-tenant | 🔴 Futur | Phase 10 + 11 |
| Mobile App | 🔴 Très futur | React Native |

### 21.2 BERAOUVIER (Ouvrier App)

| Feature | Statut | Dépend de |
|---------|--------|-----------|
| Profil ouvrier (CIN+PIN) | 🔴 Phase 9 | Phase 5 endpoints |
| Pointage lecture | 🔴 Phase 9 | Phase 5 |
| Compteur pièces | 🔴 Phase 9 | Phase 5 |
| Notifications push | 🔴 V2 | BERAOUVIER V2 |
| PWA (installable) | 🔴 V2 | — |

### 21.3 Client Portal

| Feature | Statut | Description |
|---------|--------|-------------|
| Tableau commandes client | 🔴 Très futur | Client voit ses OF en cours |
| Suivi livraisons | 🔴 Très futur | Dates, quantités livrées |
| Rapports qualité | 🔴 Très futur | Taux défauts par commande |
| Auth client | 🔴 Très futur | Token dédié par client |

### 21.4 BERA MASTER (Super Admin)

| Feature | Statut | Description |
|---------|--------|-------------|
| Dashboard multi-usines | 🔴 Très futur | Vue globale toutes les usines |
| Gestion licences | 🔴 Très futur | Activer/désactiver abonnements |
| Monitoring | 🔴 Très futur | Sentry, performances |
| Updates push | 🔴 Très futur | Déployer updates à tous |

### 21.5 AI Features (Claude API)

| Feature | Phase | Description |
|---------|-------|-------------|
| Analyse gamme (Gemini) | 🟡 Partiel | Déjà en place partiellement |
| Recommandations planning | 🔴 V2 | Optimisation OF par chaîne |
| Prédiction rupture stock | 🔴 V2 | Alertes proactives |
| Analyse rendement workers | 🔴 V2 | Identifier points faibles |
| Assistant méthodes | 🔴 V2 | Suggérer temps alloués |

---

## SECTION 22 — DÉCISIONS MISES EN COFFRE

> Ces décisions sont **définitives**. Ne pas les remettre en question sans raison majeure.

### D01 — SQLite (V1) → PostgreSQL (V2)
**Décision**: Rester sur SQLite (better-sqlite3) pour toute la V1. Migration Supabase uniquement en Phase 11.  
**Pourquoi**: SQLite synchrone = simple, rapide, zéro config pour local. Pas besoin de connexion cloud.

### D02 — Pattern Controllers
**Décision**: Chaque module a son controller `server/[module]Controller.ts`. Zéro logique dans `server.ts`.  
**Pourquoi**: `magasinController.ts` = référence absolue. Tous les nouveaux controllers suivent ce pattern.

### D03 — Auth: JWT + Cookies HttpOnly
**Décision**: JWT dans des cookies HttpOnly (pas localStorage).  
**Pourquoi**: Sécurité XSS. Déjà en place et fonctionnel.

### D04 — better-sqlite3 synchrone
**Décision**: Toutes les queries SQLite sont synchrones (`db.prepare().all()`).  
**Pourquoi**: Pas de callback hell. Express gère la charge avec le thread pool.  
**Pas** de async/await sur les queries SQLite.

### D05 — Pas d'ORM
**Décision**: SQL pur, pas de Prisma, TypeORM, Drizzle.  
**Pourquoi**: Overhead inutile pour SQLite local. On connaît notre schéma.

### D06 — TailwindCSS pour layout, CSS custom pour précision
**Décision**: Tailwind pour grilles et espacements. CSS inline/custom pour les animations et détails précis.  
**Pourquoi**: Tailwind accélère, CSS custom donne le contrôle.

### D07 — Couleur principale: #2149C1
**Décision**: Royal Blue #2149C1 pour tous les éléments actifs/primaires.  
**Pourquoi**: Identité visuelle inspirée agenz.ma. Figée en Design System.

### D08 — Framer Motion pour toutes les animations
**Décision**: Framer Motion exclusivement pour les transitions (pas CSS transitions custom).  
**Pourquoi**: Déjà installé, API React-friendly, spring physics.

### D09 — hr_workers SÉPARÉ de workers
**Décision**: Les tables `hr_workers`, `hr_pointage`, etc. sont distinctes des tables `workers`, `worker_pointage`.  
**Pourquoi**: `workers` = annuaire simple (skills, affectation). `hr_workers` = module RH complet (paie, avances, Sage). Les deux co-existent.

### D10 — BERAOUVIER = Repo Séparé
**Décision**: BERAOUVIER dans un repo GitHub séparé, jamais un sous-dossier de BERAMETHODE.  
**Pourquoi**: Déploiements indépendants, équipes séparées possibles, sécurité isolation.

### D11 — Sage Paie CSV avec BOM UTF-8
**Décision**: Le CSV Sage est toujours encodé UTF-8 avec BOM (pour Excel Windows).  
**Pourquoi**: Sage et Excel Windows lisent UTF-8 BOM correctement. Sans BOM = caractères arabes/accentués corrompus.

### D12 — Article 385 appliqué automatiquement
**Décision**: Le plafonnement des avances (1/10ème du salaire net) est calculé **automatiquement** côté serveur. L'admin ne peut pas dépasser ce plafond via l'UI.  
**Pourquoi**: Conformité légale Maroc obligatoire. Responsabilité de l'app.

---

*Fin du BERA_MASTER_PLAN.md — Version 3.0 DEFINITIVE*  
*La prochaine mise à jour est dans Section 20 après chaque task complétée.*
