# 📋 BERAMETHODE — Module Effectifs RH & Production

> **Version**: 1.0 — Avril 2026  
> **Auteur**: Soulaimane Berraadi (Architecture AI-Assisted)  
> **Statut**: SPECIFICATION APPROUVÉE — EN ATTENTE D'IMPLÉMENTATION  
> **Dernière mise à jour**: 2026-04-19

---

## TABLE DES MATIÈRES

1. [Vue d'Ensemble](#1-vue-densemble)
2. [Architecture Système](#2-architecture-système)
3. [Schéma Base de Données (SQLite)](#3-schéma-base-de-données-sqlite)
4. [Types TypeScript](#4-types-typescript)
5. [API Backend (Express.js)](#5-api-backend-expressjs)
6. [Frontend Effectifs.tsx](#6-frontend-effectifstsx)
7. [Logique Sage Paie Export](#7-logique-sage-paie-export)
8. [Conformité Droit du Travail Marocain](#8-conformité-droit-du-travail-marocain)
9. [Intégration Pointeuse Hardware](#9-intégration-pointeuse-hardware)
10. [BERAOUVIER — Application Ouvrier](#10-beraouvier--application-ouvrier)
11. [Arborescence Fichiers](#11-arborescence-fichiers)
12. [Checklist d'Implémentation](#12-checklist-dimplémentation)
13. [Notes Techniques & Décisions](#13-notes-techniques--décisions)

---

## 1. Vue d'Ensemble

### 1.1 Objectif

Construire un système **HR et Suivi de Production** complet, optimisé pour une usine textile marocaine. Le module couvre :

| Domaine | Fonctionnalités |
|---------|-----------------|
| **Annuaire RH** | Profils ouvriers avec CIN, CNSS, photo, contrat, urgences |
| **Pointage** | Entrée/Sortie journalière (manuelle + hardware RFID/empreinte) |
| **Production** | Compteur pièces par ouvrier, taux qualité, défauts |
| **Avances** | Prêts salariaux avec plafonnement légal marocain |
| **Sage Paie** | Export mensuel CSV compatible Sage pour intégration paie |

### 1.2 Principes d'Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PRINCIPES FONDAMENTAUX                     │
├─────────────────────────────────────────────────────────────┤
│ 1. DATABASE-FIRST : Toutes les données HR dans SQLite,      │
│    PAS dans localStorage/AppSettings                         │
│                                                              │
│ 2. API-FIRST : Chaque opération passe par /api/hr/*         │
│    pour préparer la future app BERAOUVIER                    │
│                                                              │
│ 3. DÉCOUPLAGE STRICT : BERAOUVIER ne connaît RIEN du        │
│    backend. Il consomme uniquement des payloads JSON.        │
│                                                              │
│ 4. CONFORMITÉ LÉGALE : Article 385 du Code du Travail       │
│    marocain appliqué automatiquement sur les avances.        │
│                                                              │
│ 5. SÉCURITÉ : Données financières inaccessibles depuis      │
│    BERAOUVIER. Authentification JWT obligatoire côté admin.  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture Système

### 2.1 Diagramme Global

```
                    ┌─────────────────────────┐
                    │     BERAMETHODE ERP      │
                    │   (Admin / Méthodes)     │
                    ├─────────────────────────┤
                    │  Frontend (React/Vite)   │
                    │  ┌───────────────────┐   │
                    │  │  Effectifs.tsx     │   │
                    │  │  (5 onglets)       │   │
                    │  └───────┬───────────┘   │
                    │          │ fetch()        │
                    │  ┌───────▼───────────┐   │
                    │  │  Express API       │   │
                    │  │  /api/hr/*         │──────────┐
                    │  │  /api/worker/*     │   │      │
                    │  └───────┬───────────┘   │      │
                    │          │               │      │
                    │  ┌───────▼───────────┐   │      │
                    │  │  SQLite DB         │   │      │
                    │  │  hr_workers        │   │      │
                    │  │  hr_pointage       │   │      │
                    │  │  hr_production     │   │      │
                    │  │  hr_avances        │   │      │
                    │  │  hr_sage_exports   │   │      │
                    │  └───────────────────┘   │      │
                    └─────────────────────────┘      │
                                                      │
                    ┌─────────────────────────┐      │
                    │    BERAOUVIER            │      │
                    │  (Application Ouvrier)    │      │
                    ├─────────────────────────┤      │
                    │  Frontend Léger          │      │
                    │  (React / HTML Simple)   │◄─────┘
                    │                          │  GET uniquement
                    │  LECTURE SEULE :          │  Pas de JWT admin
                    │  - Profil (Nom, CIN)     │  Token ouvrier simple
                    │  - Pointage du jour      │
                    │  - Compteur pièces        │
                    │  - PAS de données $$$     │
                    └─────────────────────────┘
```

### 2.2 Flux de Données

```
Pointeuse RFID ──webhook──▶ POST /api/hr/pointage/sync
                                    │
                                    ▼
                            hr_pointage table
                                    │
Admin saisit manuellement ──────────┘
                                    │
                                    ▼
                    Calcul automatique :
                    - heures_travaillees = sortie - entrée - pauses
                    - heures_supp = MAX(0, heures_travaillees - 8)
                    - statut = PRESENT | RETARD (si entrée > 08:15)
                                    │
                                    ▼
                    Synthèse mensuelle ──▶ Sage CSV Export
```

---

## 3. Schéma Base de Données (SQLite)

### 3.1 Table `hr_workers` — Fiche Ouvrier

```sql
CREATE TABLE IF NOT EXISTS hr_workers (
    -- ═══ IDENTITÉ ═══
    id TEXT PRIMARY KEY,                         -- UUID (ex: 'wk-a1b2c3d4')
    matricule TEXT UNIQUE NOT NULL,              -- Matricule interne (ex: 'BM-0042')
    full_name TEXT NOT NULL,                     -- Nom complet (ex: 'Amina El Idrissi')
    cin TEXT UNIQUE,                             -- CIN (ex: 'BH123456')
    cnss TEXT,                                   -- N° CNSS (ex: '123456789')
    phone TEXT,                                  -- Téléphone (ex: '06 11 22 33 44')
    date_naissance TEXT,                         -- Date de naissance (YYYY-MM-DD)
    adresse TEXT,                                -- Adresse complète
    photo TEXT,                                  -- Photo en Base64 (miniature 200x200)
    sexe TEXT DEFAULT 'M',                       -- M | F

    -- ═══ EMPLOI ═══
    role TEXT NOT NULL DEFAULT 'OPERATOR',        -- OPERATOR | SUPERVISOR | MECHANIC | ADMIN | QC | IRON | CUTTER | PACKER
    chaine_id TEXT,                               -- Ligne de production affectée (ex: 'CHAINE 1')
    poste TEXT,                                   -- Poste de travail spécifique (ex: 'Surjeteuse 3F')
    specialite TEXT,                              -- Spécialité machine (ex: 'Piqueuse plate', 'Surjeteuse')
    date_embauche TEXT NOT NULL,                  -- Date d'embauche (YYYY-MM-DD)
    type_contrat TEXT DEFAULT 'CDI',              -- CDI | CDD | ANAPEC | STAGE
    date_fin_contrat TEXT,                        -- Date fin contrat (pour CDD/ANAPEC)
    date_renouvellement TEXT,                     -- Date de renouvellement prévue
    is_active INTEGER DEFAULT 1,                  -- 1 = Actif, 0 = Désactivé/Parti

    -- ═══ CONTACT D'URGENCE ═══
    contact_urgence_nom TEXT,                     -- Nom du contact
    contact_urgence_tel TEXT,                     -- Téléphone du contact
    contact_urgence_lien TEXT,                    -- Lien de parenté (Père, Mère, Conjoint, Frère, Autre)

    -- ═══ POINTEUSE (HARDWARE MAPPING) ═══
    pointeuse_id TEXT,                            -- ID badge RFID ou template empreinte
    pointeuse_device TEXT,                        -- Nom/emplacement du device (ex: 'Entrée Principale')
    pointeuse_type TEXT DEFAULT 'RFID',           -- RFID | FINGERPRINT | FACE | MANUAL

    -- ═══ FINANCIER ═══
    salaire_base REAL DEFAULT 0,                  -- Salaire mensuel de base (MAD)
    taux_horaire REAL DEFAULT 0,                  -- Taux horaire (MAD/h) — calculé ou saisi
    taux_piece REAL DEFAULT 0,                    -- Prime à la pièce (MAD/unité)
    prime_assiduite REAL DEFAULT 0,               -- Prime d'assiduité mensuelle (MAD)
    prime_transport REAL DEFAULT 0,               -- Indemnité transport (MAD)
    mode_paiement TEXT DEFAULT 'VIREMENT',        -- VIREMENT | ESPECES | CHEQUE

    -- ═══ METADATA ═══
    notes TEXT,                                   -- Notes libres
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
);
```

### 3.2 Table `hr_pointage` — Pointage Journalier

```sql
CREATE TABLE IF NOT EXISTS hr_pointage (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    date TEXT NOT NULL,                            -- YYYY-MM-DD
    heure_entree TEXT,                             -- HH:MM (ex: '08:05')
    heure_sortie TEXT,                             -- HH:MM (ex: '17:30')
    pause_debut TEXT,                              -- HH:MM départ pause déjeuner
    pause_fin TEXT,                                -- HH:MM retour pause déjeuner
    source TEXT DEFAULT 'MANUAL',                  -- MANUAL | RFID | FINGERPRINT | FACE
    heures_travaillees REAL DEFAULT 0,             -- Heures travaillées nettes
    heures_normales REAL DEFAULT 0,                -- Heures normales (max 8h/jour, 44h/sem)
    heures_supp_25 REAL DEFAULT 0,                 -- Heures supp à 25% (de 8h à 10h)
    heures_supp_50 REAL DEFAULT 0,                 -- Heures supp à 50% (au-delà de 10h ou nuit/weekend)
    statut TEXT DEFAULT 'PRESENT',                 -- PRESENT | ABSENT | CONGE | MALADIE | RETARD | MISSION | FERIE
    motif_absence TEXT,                            -- Motif si absent/congé
    is_validated INTEGER DEFAULT 0,                -- 1 = Validé par le superviseur
    validated_by TEXT,                              -- ID du validateur
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES hr_workers (id) ON DELETE CASCADE,
    UNIQUE(worker_id, date)
);
```

### 3.3 Table `hr_production` — Compteur Production

```sql
CREATE TABLE IF NOT EXISTS hr_production (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    date TEXT NOT NULL,                             -- YYYY-MM-DD
    chaine_id TEXT,                                 -- Ligne de production
    model_ref TEXT,                                 -- Référence modèle travaillé
    operation_id TEXT,                              -- Opération spécifique (si suivi par opération)
    pieces_produites INTEGER DEFAULT 0,             -- Pièces conformes produites
    pieces_defaut INTEGER DEFAULT 0,                -- Pièces défectueuses
    pieces_retouchees INTEGER DEFAULT 0,            -- Pièces retouchées
    taux_qualite REAL,                              -- (produites - defaut) / produites * 100
    temps_operation REAL,                           -- Temps en minutes sur cette opération
    rendement REAL,                                 -- Rendement individuel (%)
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES hr_workers (id) ON DELETE CASCADE
);
```

### 3.4 Table `hr_avances` — Avances sur Salaire

```sql
CREATE TABLE IF NOT EXISTS hr_avances (
    id TEXT PRIMARY KEY,
    worker_id TEXT NOT NULL,
    date_demande TEXT NOT NULL,                     -- Date de la demande
    montant REAL NOT NULL,                          -- Montant demandé (MAD)
    montant_approuve REAL,                          -- Montant réellement approuvé
    montant_rembourse REAL DEFAULT 0,               -- Montant déjà remboursé
    solde_restant REAL,                             -- = montant_approuve - montant_rembourse
    nb_echeances INTEGER DEFAULT 1,                 -- Nombre de mensualités
    mois_debut_deduction TEXT,                       -- Premier mois de prélèvement (YYYY-MM)
    statut TEXT DEFAULT 'DEMANDE',                   -- DEMANDE | APPROUVE | EN_COURS | REMBOURSE | REFUSE | ANNULE
    approuve_par TEXT,                               -- Nom/ID de l'approbateur
    date_approbation TEXT,                           -- Date d'approbation
    motif TEXT,                                      -- Motif de l'avance
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (worker_id) REFERENCES hr_workers (id) ON DELETE CASCADE
);
```

### 3.5 Table `hr_sage_exports` — Journal des Exports Sage

```sql
CREATE TABLE IF NOT EXISTS hr_sage_exports (
    id TEXT PRIMARY KEY,
    mois TEXT NOT NULL,                              -- YYYY-MM (période exportée)
    date_export TEXT NOT NULL,                       -- Date/heure de génération
    nb_salaries INTEGER,                             -- Nombre de fiches exportées
    total_salaire_base REAL,                         -- Somme des salaires de base
    total_heures_supp REAL,                          -- Somme des heures supplémentaires
    total_primes REAL,                               -- Somme des primes
    total_avances REAL,                              -- Somme des déductions avances
    total_brut REAL,                                 -- Total brut
    total_net REAL,                                  -- Total net estimé
    fichier_nom TEXT,                                -- Nom du fichier CSV généré
    fichier_data TEXT,                                -- Contenu CSV (pour re-téléchargement)
    owner_id INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.6 Relations (ERD)

```
hr_workers (1) ──────── (N) hr_pointage
     │
     ├───────────────── (N) hr_production
     │
     └───────────────── (N) hr_avances

hr_sage_exports ── standalone (log des exports mensuels)
```

---

## 4. Types TypeScript

Ajouter dans `types.ts` :

```typescript
// ═══════════════════════════════════════════════
// HR MODULE TYPES
// ═══════════════════════════════════════════════

export type ContractType = 'CDI' | 'CDD' | 'ANAPEC' | 'STAGE';
export type WorkerRole = 'OPERATOR' | 'SUPERVISOR' | 'MECHANIC' | 'ADMIN' | 'QC' | 'IRON' | 'CUTTER' | 'PACKER';
export type PointageStatus = 'PRESENT' | 'ABSENT' | 'CONGE' | 'MALADIE' | 'RETARD' | 'MISSION' | 'FERIE';
export type PointageSource = 'MANUAL' | 'RFID' | 'FINGERPRINT' | 'FACE';
export type AvanceStatut = 'DEMANDE' | 'APPROUVE' | 'EN_COURS' | 'REMBOURSE' | 'REFUSE' | 'ANNULE';

export interface HRWorker {
    id: string;
    matricule: string;
    fullName: string;
    cin?: string;
    cnss?: string;
    phone?: string;
    dateNaissance?: string;
    adresse?: string;
    photo?: string;
    sexe?: 'M' | 'F';
    // Employment
    role: WorkerRole;
    chaineId?: string;
    poste?: string;
    specialite?: string;
    dateEmbauche: string;
    typeContrat: ContractType;
    dateFinContrat?: string;
    dateRenouvellement?: string;
    isActive: boolean;
    // Emergency
    contactUrgenceNom?: string;
    contactUrgenceTel?: string;
    contactUrgenceLien?: string;
    // Hardware
    pointeuseId?: string;
    pointeuseDevice?: string;
    pointeuseType?: 'RFID' | 'FINGERPRINT' | 'FACE' | 'MANUAL';
    // Financial
    salaireBase: number;
    tauxHoraire: number;
    tauxPiece: number;
    primeAssiduite: number;
    primeTransport: number;
    modePaiement: 'VIREMENT' | 'ESPECES' | 'CHEQUE';
    // Meta
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface HRPointage {
    id: string;
    workerId: string;
    date: string;
    heureEntree?: string;
    heureSortie?: string;
    pauseDebut?: string;
    pauseFin?: string;
    source: PointageSource;
    heuresTravaillees: number;
    heuresNormales: number;
    heuresSupp25: number;
    heuresSupp50: number;
    statut: PointageStatus;
    motifAbsence?: string;
    isValidated: boolean;
    validatedBy?: string;
    notes?: string;
}

export interface HRProduction {
    id: string;
    workerId: string;
    date: string;
    chaineId?: string;
    modelRef?: string;
    operationId?: string;
    piecesProduites: number;
    piecesDefaut: number;
    piecesRetouchees: number;
    tauxQualite: number;
    tempsOperation: number;
    rendement: number;
    notes?: string;
}

export interface HRAvance {
    id: string;
    workerId: string;
    dateDemande: string;
    montant: number;
    montantApprouve?: number;
    montantRembourse: number;
    soldeRestant: number;
    nbEcheances: number;
    moisDebutDeduction?: string;
    statut: AvanceStatut;
    approuvePar?: string;
    dateApprobation?: string;
    motif?: string;
    notes?: string;
}

export interface HRSageExport {
    id: string;
    mois: string;
    dateExport: string;
    nbSalaries: number;
    totalSalaireBase: number;
    totalHeuresSupp: number;
    totalPrimes: number;
    totalAvances: number;
    totalBrut: number;
    totalNet: number;
    fichierNom: string;
}

// Sage CSV Row (one per worker per month)
export interface SagePaieRow {
    matricule: string;
    nom: string;
    prenom: string;
    cin: string;
    cnss: string;
    nbJoursTravailles: number;
    heuresNormales: number;
    heuresSupp25: number;
    heuresSupp50: number;
    salaireBase: number;
    primePiece: number;
    primeAssiduite: number;
    primeTransport: number;
    totalBrut: number;
    deductionAvances: number;
    netAPayer: number;
}
```

---

## 5. API Backend (Express.js)

### 5.1 Endpoints Admin (JWT Required)

| Méthode | Route | Description | Body/Params |
|---------|-------|-------------|-------------|
| **Workers** | | | |
| `GET` | `/api/hr/workers` | Liste tous les ouvriers | `?search=&role=&chaine=&active=1` |
| `GET` | `/api/hr/workers/:id` | Détail ouvrier | — |
| `POST` | `/api/hr/workers` | Créer/modifier ouvrier | `HRWorker` JSON |
| `DELETE` | `/api/hr/workers/:id` | Désactiver ouvrier (soft delete) | — |
| **Pointage** | | | |
| `GET` | `/api/hr/pointage` | Pointage du jour | `?date=YYYY-MM-DD&chaine=` |
| `GET` | `/api/hr/workers/:id/pointage` | Historique pointage ouvrier | `?from=&to=` |
| `POST` | `/api/hr/pointage` | Enregistrer entrée/sortie | `{ workerId, date, heureEntree, heureSortie }` |
| `PUT` | `/api/hr/pointage/:id` | Modifier pointage | — |
| `POST` | `/api/hr/pointage/sync` | Sync hardware pointeuse | `{ deviceId, badgeId, timestamp, type: 'IN'\|'OUT' }` |
| `POST` | `/api/hr/pointage/validate` | Valider un jour | `{ date, workerIds[] }` |
| **Production** | | | |
| `GET` | `/api/hr/production` | Production du jour | `?date=&chaine=` |
| `GET` | `/api/hr/workers/:id/production` | Historique production ouvrier | `?from=&to=` |
| `POST` | `/api/hr/production` | Enregistrer production | `HRProduction` JSON |
| **Avances** | | | |
| `GET` | `/api/hr/avances` | Liste toutes les avances | `?statut=&workerId=` |
| `POST` | `/api/hr/avances` | Créer une avance | `HRAvance` JSON |
| `PUT` | `/api/hr/avances/:id` | Modifier/approuver avance | `{ statut, montantApprouve }` |
| **Sage Export** | | | |
| `GET` | `/api/hr/sage-export/:mois` | Générer CSV Sage | Response: CSV file download |
| `GET` | `/api/hr/sage-exports` | Historique exports | — |

### 5.2 Endpoints BERAOUVIER (Token Ouvrier — Read-Only)

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/worker/:cin` | Profil ouvrier (nom, poste, CIN, CNSS uniquement) |
| `GET` | `/api/worker/:cin/pointage` | Pointage du jour (entrée/sortie) |
| `GET` | `/api/worker/:cin/production` | Compteur pièces du jour |

**⚠️ SÉCURITÉ** : Les endpoints `/api/worker/*` ne retournent JAMAIS :
- `salaire_base`, `taux_piece`, `primes` (données financières)
- Données d'autres ouvriers
- Logique administrative (avances, exports)

### 5.3 Exemple Code API

```typescript
// server/hrController.ts — Extrait

// GET /api/hr/workers
export const getWorkers = (req: Request, res: Response) => {
    const { search, role, chaine, active } = req.query;
    let sql = 'SELECT * FROM hr_workers WHERE owner_id = ?';
    const params: any[] = [(req as any).userId || 1];

    if (search) {
        sql += ' AND (full_name LIKE ? OR cin LIKE ? OR matricule LIKE ?)';
        const s = `%${search}%`;
        params.push(s, s, s);
    }
    if (role) { sql += ' AND role = ?'; params.push(role); }
    if (chaine) { sql += ' AND chaine_id = ?'; params.push(chaine); }
    if (active !== undefined) { sql += ' AND is_active = ?'; params.push(active); }

    sql += ' ORDER BY full_name ASC';
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
};

// GET /api/worker/:cin — BERAOUVIER (Read-Only, no financial data)
export const getWorkerByCin = (req: Request, res: Response) => {
    const { cin } = req.params;
    const row = db.prepare(
        'SELECT id, matricule, full_name, cin, cnss, role, chaine_id, poste FROM hr_workers WHERE cin = ? AND is_active = 1'
    ).get(cin);
    if (!row) return res.status(404).json({ error: 'Ouvrier non trouvé' });
    res.json(row);
};
```

---

## 6. Frontend Effectifs.tsx

### 6.1 Structure Multi-Onglets

```
┌──────────────────────────────────────────────────────────────┐
│  HEADER (Glassmorphism)                                       │
│  "Déclaration Effectifs — RH & Production Tracking"           │
│  [Date Picker] [🔍 Recherche]                   [+ Ouvrier]  │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────┬──────────┬────────────┬──────────┬─────────────┐ │
│  │ 👥      │ 🕐       │ 📊         │ 💰       │ 📤          │ │
│  │Annuaire │ Pointage │ Production │ Avances  │ Sage Export │ │
│  └─────────┴──────────┴────────────┴──────────┴─────────────┘ │
│                                                                │
│  ┌────────────────────────────────────────────────────────────┐│
│  │                                                            ││
│  │              CONTENU DE L'ONGLET ACTIF                     ││
│  │                                                            ││
│  └────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### 6.2 Onglet 1 — Annuaire (👥)

**Layout** : Grille 4 colonnes de cartes ouvrières

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  [📷 PHOTO]       │  │  [📷 PHOTO]       │  │  [📷 PHOTO]       │
│  Amina El Idrissi │  │  Yassine Benali  │  │  Omar Jbari      │
│  CIN: BH123456   │  │  CIN: BK789012   │  │  CIN: BJ456789   │
│  CNSS: 123456789 │  │  CNSS: 987654321 │  │  CNSS: 111222333 │
│  ─────────────── │  │  ─────────────── │  │  ─────────────── │
│  🏷️ SUPERVISOR   │  │  🏷️ OPERATOR     │  │  🏷️ MECHANIC     │
│  📍 CHAINE 1     │  │  📍 CHAINE 1     │  │  📍 Maintenance  │
│  📋 CDI          │  │  📋 CDD → 06/26  │  │  📋 CDI          │
│  ─────────────── │  │  ─────────────── │  │  ─────────────── │
│  [Voir Profil ─▶]│  │  [Voir Profil ─▶]│  │  [Voir Profil ─▶]│
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Modal Profil Complet** : Informations personnelles, urgences, historique contrats, photo upload, mapping pointeuse.

### 6.3 Onglet 2 — Pointage (🕐)

**Layout** : Matrice journalière

```
┌───────────────────────────────────────────────────────────────────┐
│ Date: [2026-04-19]  |  Chaîne: [Toutes ▼]  |  [Valider Tout ✓] │
├───────────┬─────────┬─────────┬───────┬───────┬───────┬──────────┤
│ Ouvrier   │ Entrée  │ Sortie  │ Pause │ Heures│ H.Sup │ Statut   │
├───────────┼─────────┼─────────┼───────┼───────┼───────┼──────────┤
│ A. Idrissi│ 08:02   │ 17:35   │ 1h00  │ 8.55  │ 0.55  │ ✅ PRÉS  │
│ Y. Benali │ 08:18   │ 17:30   │ 1h00  │ 8.20  │ 0.20  │ ⚠️ RETRD │
│ O. Jbari  │  —      │  —      │  —    │  —    │  —    │ ❌ ABS   │
│ S. Rahm.  │ 08:00   │ 19:00   │ 1h00  │ 10.00 │ 2.00  │ ✅ PRÉS  │
└───────────┴─────────┴─────────┴───────┴───────┴───────┴──────────┘
                      TOTAL: 26.75h normales | 3.75h supp
```

**Logique Heures Supplémentaires (Maroc)** :
- Heures normales : 44h/semaine (8h/jour sur 5.5 jours)
- Heures supp 25% : de la 9ème à la 10ème heure
- Heures supp 50% : au-delà de 10h, nuit (21h-6h), weekends

### 6.4 Onglet 3 — Production (📊)

```
┌───────────────────────────────────────────────────────────────────┐
│ Date: [2026-04-19]  |  Modèle: [POLO M/C ▼]  |  Chaîne: [C1 ▼]│
├───────────┬──────────┬──────────┬──────────┬──────────┬──────────┤
│ Ouvrier   │ Pièces ✓ │ Défauts  │ Retouch. │ Qualité  │ Rdt (%) │
├───────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ A. Idrissi│ 45       │ 2        │ 1        │ 95.6%    │ 112%    │
│ Y. Benali │ 38       │ 5        │ 3        │ 86.8%    │ 95%     │
│ S. Rahm.  │ 52       │ 0        │ 0        │ 100%     │ 130%    │
└───────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
                      TOTAL: 135 pièces | Qualité moy: 94.1%
```

### 6.5 Onglet 4 — Avances (💰)

```
┌───────────────────────────────────────────────────────────────────┐
│ Filtre: [En Cours ▼]  |  Recherche: [________]  | [+ Avance]    │
├───────────┬───────┬──────────┬──────────┬───────────┬────────────┤
│ Ouvrier   │ Mont. │ Approuvé │ Remboursé│ Solde     │ Statut     │
├───────────┼───────┼──────────┼──────────┼───────────┼────────────┤
│ Y. Benali │ 2000  │ 1500     │ 500      │ 1000      │ 🟡 EN COURS│
│ O. Jbari  │ 3000  │ 2500     │ 2500     │ 0         │ ✅ REMB.   │
│ A. Idrissi│ 5000  │ —        │ —        │ —         │ 🔴 REFUSÉ  │
└───────────┴───────┴──────────┴──────────┴───────────┴────────────┘
                                                                    
    ⚠️ PLAFONNEMENT LÉGAL :                                        
    Article 385 du Code du Travail Marocain                         
    Déduction max = 1/10ème du salaire net mensuel                  
```

### 6.6 Onglet 5 — Sage Export (📤)

```
┌───────────────────────────────────────────────────────────────────┐
│  Période: [Avril 2026 ▼]                                         │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  📊 RÉSUMÉ MENSUEL                                         │   │
│  │                                                            │   │
│  │  Effectif actif     : 42 ouvriers                          │   │
│  │  Total jours ouvrés : 22 jours                             │   │
│  │  Total h. normales  : 7,392 h                              │   │
│  │  Total h. supp 25%  : 312 h                                │   │
│  │  Total h. supp 50%  : 84 h                                 │   │
│  │  Total primes       : 15,400 MAD                           │   │
│  │  Total avances déduc: 8,200 MAD                            │   │
│  │  ─────────────────────────────────────────                 │   │
│  │  MASSE SALARIALE    : 245,800 MAD                          │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  [📥 Télécharger CSV Sage]  [📋 Aperçu Données]                  │
│                                                                   │
│  Historique des exports :                                         │
│  ┌────────┬────────────┬─────┬────────────────────┐              │
│  │ Mois   │ Date Export │ Fich│ Statut             │              │
│  │ 04/26  │ 19/04/2026 │ .csv│ ✅ Généré          │              │
│  │ 03/26  │ 31/03/2026 │ .csv│ ✅ Envoyé Sage     │              │
│  └────────┴────────────┴─────┴────────────────────┘              │
└───────────────────────────────────────────────────────────────────┘
```

---

## 7. Logique Sage Paie Export

### 7.1 Format CSV

Séparateur : **point-virgule (;)**  
Encodage : **UTF-8 avec BOM** (pour Excel)  
Nom fichier : `SAGE_PAIE_BERAMETHODE_2026-04.csv`

```csv
Matricule;Nom;Prenom;CIN;CNSS;NbJours;HNormales;HSupp25;HSupp50;SalBase;PrimePiece;PrimeAssid;PrimeTransp;TotalBrut;Avances;NetAPayer
BM-0001;EL IDRISSI;Amina;BH123456;123456789;22;176.00;8.50;0.00;4500.00;675.00;200.00;150.00;5525.00;0.00;5525.00
BM-0002;BENALI;Yassine;BK789012;987654321;20;160.00;4.20;2.00;3800.00;380.00;0.00;150.00;4330.00;380.00;3950.00
```

### 7.2 Algorithme de Calcul

```
Pour chaque ouvrier actif du mois :
  1. Agréger hr_pointage du mois :
     - nb_jours = COUNT(DISTINCT date WHERE statut IN ('PRESENT','RETARD'))
     - h_normales = SUM(heures_normales)
     - h_supp_25 = SUM(heures_supp_25)
     - h_supp_50 = SUM(heures_supp_50)

  2. Calculer rémunération :
     - sal_base = worker.salaire_base * (nb_jours / 26)  // au prorata
     - prime_piece = SUM(hr_production.pieces_produites) * worker.taux_piece
     - prime_assiduite = (nb_jours >= 22) ? worker.prime_assiduite : 0
     - prime_transport = worker.prime_transport
     - h_supp_montant = (h_supp_25 * taux_horaire * 1.25) + (h_supp_50 * taux_horaire * 1.50)
     - total_brut = sal_base + prime_piece + prime_assiduite + prime_transport + h_supp_montant

  3. Calculer déductions (avances) :
     - avances_mois = SUM(hr_avances WHERE mois_debut_deduction <= mois AND statut = 'EN_COURS')
     - plafond_legal = total_brut / 10  // Article 385
     - deduction = MIN(avances_mois_part, plafond_legal)

  4. Net à payer :
     - net = total_brut - deduction
```

---

## 8. Conformité Droit du Travail Marocain

### 8.1 Heures de Travail (Dahir n° 1-03-194)

| Règle | Valeur |
|-------|--------|
| Durée légale hebdomadaire | 44 heures |
| Durée journalière max | 10 heures |
| Heures supp autorisées/an | 250 heures max (sauf dérogation) |
| Majoration 25% | Jours ouvrables, de la 45ème à la 54ème heure/sem |
| Majoration 50% | Au-delà de 54h, nuit (21h-6h), dimanche/fériés |
| Majoration 100% | Nuit + dimanche/férié combinés |

### 8.2 Avances sur Salaire (Article 385)

```
RÈGLE : La retenue ne peut excéder 1/10ème du montant du salaire échu.

Exemple :
  Salaire net = 5,000 MAD
  Avance demandée = 3,000 MAD
  Déduction max/mois = 500 MAD (1/10ème)
  → Remboursement en 6 échéances minimum
```

### 8.3 SMIG (à jour 2026)

| Type | Montant |
|------|---------|
| SMIG horaire | 17.24 MAD/h |
| SMIG mensuel (191h) | 3,292.84 MAD |
| SMAG (agricole) | 85.00 MAD/jour |

---

## 9. Intégration Pointeuse Hardware

### 9.1 Support Matériel

Le champ `pointeuse_id` supporte les marques suivantes :

| Marque | Protocole | Champ ID |
|--------|-----------|----------|
| ZKTeco | Push SDK (HTTP) | Badge RFID ou Fingerprint Template |
| Hikvision | ISAPI REST | Card Number |
| Suprema | BioStar 2 API | User ID |
| Générique | Webhook POST | Any unique badge ID |

### 9.2 Webhook Sync

```
POST /api/hr/pointage/sync
Content-Type: application/json

{
    "deviceId": "ENTREE_PRINC_01",
    "badgeId": "RFID-00042",
    "timestamp": "2026-04-19T08:05:23",
    "type": "IN"  // IN | OUT
}

Logique serveur :
  1. Trouver worker WHERE pointeuse_id = badgeId
  2. Si type=IN → UPDATE hr_pointage SET heure_entree
  3. Si type=OUT → UPDATE hr_pointage SET heure_sortie
  4. Recalculer heures_travaillees automatiquement
```

---

## 10. BERAOUVIER — Application Ouvrier

### 10.1 Principes

- **Repository séparé** : `BERAOUVIER/` (pas de sous-dossier de BERAMETHODE)
- **Lecture seule** : Aucune mutation, aucun POST
- **Aucune logique backend** : L'app ne connaît que les payloads JSON
- **Sécurité** : Authentification par CIN + PIN (pas de JWT admin)
- **Données exposées** : Nom, CIN, CNSS, Poste, Pointage, Compteur pièces
- **Données INTERDITES** : Salaire, avances, données d'autres ouvriers

### 10.2 Écran Principal

```
┌─────────────────────────────────┐
│          BERAOUVIER              │
│     Application Ouvrier          │
├─────────────────────────────────┤
│                                  │
│   👤 Amina El Idrissi            │
│   🏷️ Superviseur — CHAINE 1     │
│   🆔 CIN: BH123456              │
│   📋 CNSS: 123456789            │
│                                  │
│   ─────────────────────          │
│                                  │
│   🕐 POINTAGE DU JOUR           │
│   ┌─────────┬──────────────┐    │
│   │ Entrée  │ 08:02        │    │
│   │ Sortie  │ —            │    │
│   │ Heures  │ 6h35 (en cours)│  │
│   └─────────┴──────────────┘    │
│                                  │
│   📊 PRODUCTION DU JOUR         │
│   ┌──────────────────────────┐  │
│   │  ████████████░░░  45/50  │  │
│   │  Pièces produites        │  │
│   │  Qualité: 95.6%          │  │
│   └──────────────────────────┘  │
│                                  │
└─────────────────────────────────┘
```

---

## 11. Arborescence Fichiers

### Après implémentation dans BERAMETHODE :

```
BERAMETHODE/
├── server/
│   ├── db.ts                         # [MODIFIER] Ajouter 5 tables HR
│   ├── hrController.ts               # [NOUVEAU] CRUD HR complet + Sage
│   ├── authController.ts             # (existant)
│   ├── magasinController.ts          # (existant)
│   ├── middleware.ts                  # (existant)
│   └── settingsController.ts         # (existant)
├── components/
│   ├── Effectifs.tsx                  # [NOUVEAU] Page multi-onglets premium
│   ├── EmployeeProfile.tsx           # [MODIFIER] Utiliser HRWorker au lieu de Employee
│   ├── TasksAndHR.tsx                # (existant — gestion tâches)
│   ├── Dashboard.tsx                 # (existant)
│   └── ...
├── types.ts                          # [MODIFIER] Ajouter types HR
├── server.ts                         # [MODIFIER] Enregistrer routes /api/hr/*
├── App.tsx                           # [MODIFIER] Restaurer vue 'effectifs'
└── EFFECTIFS_MODULE_SPEC.md          # ← CE FICHIER (spécification)
```

### Structure future BERAOUVIER (repo séparé) :

```
BERAOUVIER/
├── public/
│   └── index.html
├── src/
│   ├── App.tsx
│   ├── api.ts                         # Appels vers BERAMETHODE /api/worker/*
│   ├── components/
│   │   ├── WorkerProfile.tsx
│   │   ├── PointageCard.tsx
│   │   └── ProductionCounter.tsx
│   └── types.ts                       # Types worker (sous-ensemble de HRWorker)
├── package.json
└── README.md
```

---

## 12. Checklist d'Implémentation

### Phase 1 — Fondations (Backend)
- [ ] Ajouter les 5 tables SQL dans `server/db.ts`
- [ ] Créer les types TypeScript dans `types.ts`
- [ ] Créer `server/hrController.ts` avec tous les endpoints CRUD
- [ ] Enregistrer les routes dans `server.ts`
- [ ] Tester avec `curl` : création ouvrier, pointage, production

### Phase 2 — Frontend Effectifs.tsx
- [ ] Créer le composant multi-onglets avec Framer Motion
- [ ] Onglet Annuaire : grille de cartes + modal profil complet
- [ ] Onglet Pointage : matrice journalière avec saisie rapide
- [ ] Onglet Production : compteur pièces avec calcul qualité
- [ ] Onglet Avances : ledger avec plafonnement légal
- [ ] Onglet Sage Export : aperçu + téléchargement CSV

### Phase 3 — Intégration ERP
- [ ] Restaurer la route `effectifs` dans `App.tsx`
- [ ] Connecter `EmployeeProfile.tsx` aux nouvelles données HRWorker
- [ ] Synchroniser le Dashboard avec les KPIs HR
- [ ] Tester le flux complet end-to-end

### Phase 4 — Sage Paie
- [ ] Implémenter l'algorithme de calcul mensuel
- [ ] Générer le CSV avec format Sage standard
- [ ] Tester la conformité Article 385 (plafonnement avances)
- [ ] Ajouter l'historique des exports

### Phase 5 — BERAOUVIER (Future)
- [ ] Scaffolder le repo séparé
- [ ] Implémenter l'auth par CIN + PIN
- [ ] Connecter aux endpoints `/api/worker/*`
- [ ] Tester la séparation de données (pas de fuite financière)

---

## 13. Notes Techniques & Décisions

### 13.1 Pourquoi SQLite et pas localStorage ?

| Critère | localStorage | SQLite |
|---------|-------------|--------|
| Capacité | ~5 MB | Illimitée |
| Requêtes complexes | ❌ | ✅ SQL complet |
| Multi-utilisateur | ❌ | ✅ via API |
| Backup/Restore | ❌ Manuel | ✅ Copie fichier |
| BERAOUVIER API | ❌ Impossible | ✅ Native |
| Relations (FK) | ❌ | ✅ |

### 13.2 Pourquoi pas un ORM (Prisma, TypeORM) ?

Le projet utilise déjà `better-sqlite3` en mode synchrone direct. Ajouter un ORM compliquerait l'architecture existante sans bénéfice proportionnel. On conserve le même pattern que `magasinController.ts`.

### 13.3 Gestion des Dates

Toutes les dates sont stockées en format **ISO 8601 string** (`YYYY-MM-DD` pour les dates, `HH:MM` pour les heures) pour garantir la compatibilité JSON et SQLite.

---

> **Ce document est la spécification de référence. Toute implémentation future doit s'y conformer.**  
> **En cas de doute, consulter ce fichier avant de coder.**
