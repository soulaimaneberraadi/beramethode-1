# BERAMETHODE — Complete Program Blueprint

> Paste this entire document into any AI conversation to give it full context
> about the project. The AI can then advise on features, market positioning,
> bugs, or architecture without needing to read source code.

---

## 1. What it is

**BERAMETHODE** is a full-featured **ERP (Enterprise Resource Planning)** system
purpose-built for **Moroccan textile manufacturing facilities** (clothing,
kiswa, garments).

It replaces the patchwork of Excel sheets + paper that most Moroccan textile
factories still use, by centralizing:

- Method engineering (operations costing, "Prix de Revient")
- Production planning (Gantt + calendar)
- Warehouse / stock management
- Human Resources (workers, attendance, payroll prep)
- Invoicing & delivery notes
- Subcontracting

**Languages of the UI**: French (primary) + Darija (Moroccan Arabic) accents
where helpful. All strings live in `constants.ts` so adding a language = adding
a key.

---

## 2. Who it's for

- **Method engineers / "Bureau d'études"** — build costing files (fiches
  techniques), define operations, gammes opératoires, time studies.
- **Production managers / Chefs de production** — plan OFs (Ordres de
  Fabrication), assign workers to chains, track daily output.
- **HR directors** — manage 50–500 workers per factory, track pointage
  (clocking in/out), production output per worker, prepare wages, manage
  advances.
- **Magasiniers** — track stock in/out, batches, suppliers.
- **Owners / Patrons** — see real-time KPIs on a dashboard.

Target market: 200+ textile factories in Morocco (Casablanca, Tanger, Fès,
Salé). Many also export to EU brands.

---

## 3. Tech stack (current)

### Frontend
| Layer | Choice | Notes |
|---|---|---|
| Framework | **React 19** | Latest, fully Hooks-based |
| Language | **TypeScript** | Strict mode enabled |
| Build | **Vite 8** | HMR in dev, tree-shaken prod build |
| Styling | **Tailwind CSS** (inline classes) | No CSS modules |
| Animation | **Framer Motion** + **anime.js** | Used on Planning + dashboards |
| Charts | **Recharts** | Production curves, KPIs |
| Icons | **lucide-react** | |
| Excel | **xlsx** + **exceljs** | Import / export bulk data |
| QR codes | **react-qr-code** | Used for machine tickets |
| Code obfuscation | `vite-plugin-javascript-obfuscator` | Prod-mode only, for IP protection |

### Backend
| Layer | Choice | Notes |
|---|---|---|
| Server | **Express.js** | Single-file `server.ts` + per-domain controllers |
| Language | **TypeScript** | Run with `tsx` (no compile step in dev) |
| Database | **SQLite** (via `better-sqlite3`) | Single file `database.sqlite`, WAL mode for concurrent reads |
| Auth | **JWT** in httpOnly cookies | + bcryptjs for passwords |
| Security | **Helmet** + CORS + rate limit | Configured in `jwtConfig.ts` |
| Email | **nodemailer** (SMTP) | Password resets, invitations |
| AI | **Google Gemini** (`@google/genai`) | Textile vocabulary, operation suggestions, AI Planning Optimizer |

### Cloud / Sync
| Layer | Choice | Notes |
|---|---|---|
| Auth + DB | **Supabase** | Static deploy (Vercel) reads from Supabase |
| Real-time | **Supabase Realtime** | PC server subscribes for instant Vercel→PC sync |
| Hosting (static) | **Vercel** | `beramethode-1.vercel.app` |
| Repo | **GitHub** | `soulaimaneberraadi/beramethode-1` |

### Dev environment
- Node.js **≥20**
- Development port: **8000**
- Two processes typically run together: Vite (`npm run dev`) for HMR and Express
  (`npm run dev:app`) for the API. The frontend uses the same port (Vite proxies
  `/api/*` to Express).

---

## 4. Architecture

### High level
```
┌──────────────────────────────────────────────────────────────────┐
│                          BERAMETHODE                              │
│                                                                   │
│  ┌──────────────────┐         ┌──────────────────┐               │
│  │   PC (Express)   │◄───────►│    Supabase      │               │
│  │   SQLite local   │ realtime│  user_data table │               │
│  └──────────────────┘         │  (1 JSONB / user)│               │
│           ▲                   └──────────────────┘               │
│           │ /api/*                      ▲                         │
│           │                              │ pull on login          │
│  ┌──────────────────┐                   │ + realtime              │
│  │  React app (PC)  │                   ▼                         │
│  │  Vite dev / HMR  │         ┌──────────────────┐               │
│  └──────────────────┘         │  Vercel static   │               │
│                               │  beramethode-1   │               │
│                               │  apiShim → LS    │               │
│                               └──────────────────┘               │
└──────────────────────────────────────────────────────────────────┘
```

### Three runtimes
1. **PC dev runtime**: Vite + Express + SQLite. Full read/write, AI features.
2. **PC prod runtime** (npm run start): Bundled, served by Express. Same as
   dev but optimized.
3. **Vercel static runtime**: No backend. `apiShim` intercepts `/api/*` calls
   and reads/writes localStorage; cloudSync mirrors localStorage to Supabase.

### Data sync model (current, after May 23 refactor)
- **PC → Supabase**: After every successful API write, a debounced (2s) push
  serializes the entire SQLite snapshot to the `user_data` JSONB row.
  Base64 images are stripped to keep the snapshot under Supabase's
  statement-timeout limit.
- **Supabase → PC**: The Express server subscribes to Postgres realtime
  changes on `user_data` filtered by `user_id`. When a remote update arrives,
  it merges per-table (upsert by `id`) into SQLite, with an echo-loop guard
  so the server's own pushes don't bounce back.
- **Vercel → Supabase**: The frontend `cloudSync` intercepts `localStorage.setItem`
  on synced keys (`beramethode_library`, `beramethode_planning`, etc.) and
  debounces an `upsert` to Supabase. `apiShim` translates `/api/*` writes
  into localStorage mutations so the same mechanism applies.
- **Soft delete**: `DELETE /api/<entity>/:id` creates a tombstone
  `{type, id, deleted_at}` in `beramethode_tombstones`. Reads filter out
  tombstoned items. After 1 hour, the PC realtime listener hard-deletes
  the corresponding row from SQLite. `window.beraCorbeille` exposes
  `list/restore/hardDelete` for a future Corbeille UI.

---

## 5. All modules (frontend)

Each is a React component under `components/`. Grouped by domain.

### Core costing engine — "BERAMETHODE"
| Module | File | Role |
|---|---|---|
| **CostCalculator** | `CostCalculator.tsx` | The heart: computes Prix de Revient from operations × time × materials × margins |
| **FicheTechnique** | `FicheTechnique.tsx` | Technical sheet for a model: dimensions, fabric, accessories |
| **CostPartials** | `CostPartials.tsx` | Sub-calculations / partial cost rows |
| **OrderModelPage** | `OrderModelPage.tsx` | Per-model order view |
| **OrderSimulation** | `OrderSimulation.tsx` | Simulate cost for a hypothetical order |
| **MaterialsList** | `MaterialsList.tsx` | Materials needed for a model |
| **ModelInfo** / **ModelWorkflow** | | Model metadata + state machine |

### Library / Bibliothèque
| Module | File | Role |
|---|---|---|
| **Library** | `Library.tsx` | List of saved models; backup / restore; CRUD |
| **ExcelInput** | `ExcelInput.tsx` | Bulk import models from Excel |

### Engineering — "Ingénierie"
| Module | File | Role |
|---|---|---|
| **Gamme** | `Gamme.tsx` | Operation sequence ("gamme opératoire") with timing |
| **Atelier** | `Atelier.tsx` | Workshop view: machines × operations × workers |
| **Chronometrage** | `Chronometrage.tsx` | Time study: measure actual time per operation |
| **Implantation** | `Implantation.tsx` | Physical layout of postes/machines on a chain |
| **Balancing** | `Balancing.tsx` | Line balancing — even out workstation cycle times |
| **AnalyseTechnologique** | `AnalyseTechnologique.tsx` | Technological analysis of operations |
| **Machin** / **PageMachine** / **MachineEditorModal** | | Machine inventory + editor |
| **MachineQrTicket** / **MachineQuickScanModal** | | QR codes to label machines |

### Planning
The biggest module, recently refactored from a 2900-line monolith.
| Folder | Role |
|---|---|
| `components/Planning.tsx` | Top-level container (orchestrator) |
| `components/planning/header/` | Date navigator, view switcher, zoom, quick filters/stats |
| `components/planning/views/` | CalendarView, CardsView, GanttView + sub-parts (EventBar, GanttRow, MiniMap, DragPreview, TodayLine) |
| `components/planning/hooks/` | usePlanningEvents, useAutoSchedule, useDelayIndicator, usePlanningChains, usePlanningFilters, usePlanningPrint, usePlanningStock, usePlanningValidation |
| `components/planning/modals/` | EventEditor, SplitModal, CommandPalette, AIOptimizationModal, AutoScheduleSuggestion |
| `components/planning/panels/` | EventDetailPanel, IssuesPanel, ContextMenu |
| `components/planning/shared/` | Buttons, Modal, ProgressBar, animations, color tokens, status configs |
| `components/planning/MaterialArrivalTimeline.tsx` | Visualize when materials arrive vs OF needs |

### Warehouse / Magasin
| Module | File | Role |
|---|---|---|
| **Magasin** | `Magasin.tsx` | Products, lots, mouvements (in/out), suppliers, alerts |
| **ProductDetailPanel** | `ProductDetailPanel.tsx` | Drill-down per product |
| **StockExport** | `StockExport.tsx` | Excel/PDF export of stock state |

### Human Resources
| Module | File | Role |
|---|---|---|
| **GESTION-RH** | `GESTION-RH.tsx` | Master HR dashboard |
| **HRWorkerProfilePanel** | `HRWorkerProfilePanel.tsx` | Per-worker profile: CIN, CNSS, photo, salary, attendance |
| **Effectifs** | `Effectifs.tsx` | Headcount per chain, per role |
| **EmployeeProfile** | `EmployeeProfile.tsx` | Worker profile (alt view) |
| **TasksAndHR** | `TasksAndHR.tsx` | Daily tasks + HR overlap |
| **SuiviEffectifsModal** | | Track attendance |
| **SuiviProduction** | `SuiviProduction.tsx` | Per-worker production tracking |
| **RendementBoard** | `RendementBoard.tsx` | Performance / yield board |

### Manufacturing operations
| Module | File | Role |
|---|---|---|
| **LaCoupe** | `LaCoupe.tsx` | "The cut" — fabric cutting room operations |
| **SousTraitance** | `SousTraitance.tsx` | Subcontracting (new module): assign OFs to external workshops |

### Dashboards
| Module | File | Role |
|---|---|---|
| **Dashboard** | `Dashboard.tsx` | Main KPI dashboard: OFs in progress, effectif présent, TRS, valeur stock, avances |
| **VueGenerale** | `VueGenerale.tsx` | Global multi-factor view |

### Invoicing
| Module | File | Role |
|---|---|---|
| **Facturation** | `Facturation.tsx` | Invoices + delivery notes (BL) + payment tracking |

### Settings / Misc
| Module | File | Role |
|---|---|---|
| **Configuration** | `Configuration.tsx` | System settings, partitions, chains, currencies |
| **SettingsPanel** / **Paramitre** / **PdfSettingsModal** | | Sub-settings |
| **Profil** | `Profil.tsx` | User profile |
| **Info** | `Info.tsx` | About / help |
| **LicenseScreen** | `LicenseScreen.tsx` | License gate (commercial product) |
| **GlobalLoader** / **ErrorBoundary** | | UX shells |
| **A4DocumentView** | | A4 PDF preview rendering |
| **TicketView** / **MachineExitModal** | | Generated tickets |
| **AgendaModal** | | Calendar agenda modal |
| **ModelOfJournalierSummary** | | Daily summary card |

---

## 6. All modules (backend / `server/`)

| File | Purpose |
|---|---|
| `server.ts` (root) | Express setup, route table, middleware mounting |
| `db.ts` | SQLite init, WAL pragmas, table creation, migrations |
| `middleware.ts` | `authenticateToken` JWT middleware |
| `jwtConfig.ts` | Helmet/CORS/CSP/rate-limit config |
| `authController.ts` | Login, logout, password reset, signup |
| `userController.ts` | User CRUD (admins) |
| `modelController.ts` | Models CRUD (BERAMETHODE library) |
| `planningController.ts` | Planning events CRUD, auto-scheduling |
| `schedulingController.ts` | Scheduling algorithm helpers |
| `magasinController.ts` | Stock products, lots, mouvements |
| `demandesApproController.ts` | Procurement requests |
| `hrController.ts` | HR workers + pointage + production + avances + wage prep |
| `hrIdentityController.ts` | Worker invitations + ID verification |
| `hrSageController.ts` | Sage payroll integration |
| `sageConfig.ts` / `sageHeuresService.ts` / `sageMonthPay.ts` | Sage adapter |
| `workersController.ts` | Generic workers table (legacy) |
| `workerPointageController.ts` | Clock in/out logs |
| `workerSkillsController.ts` | Worker capability matrix |
| `posteSuiviController.ts` | Workstation tracking |
| `suiviController.ts` | Production tracking data |
| `productionController.ts` | Production output |
| `subcontractController.ts` | Sous-traitance (new) |
| `facturationController.ts` | Invoices, delivery notes, payments |
| `dashboardController.ts` | Aggregate KPIs |
| `settingsController.ts` | App settings persistence |
| `geminiAi.ts` | Google Gemini API wrapper |
| `geminiController.ts` | AI endpoints: textile vocabulary, operation suggestions, planning optimizer |
| `supabaseSync.ts` | PC → Supabase JSONB snapshot push (debounced, image-stripped) |
| `supabaseRealtime.ts` | Supabase → PC realtime listener + SQLite merge + tombstone purge |

---

## 7. Frontend "lib" helpers

| File | Purpose |
|---|---|
| `src/lib/supabaseClient.ts` | createClient with anon key, persisted session |
| `src/lib/cloudSync.ts` | localStorage ↔ Supabase JSONB sync; intercepts `setItem`; subscribes to realtime; tombstone-aware push guard |
| `src/lib/apiShim.ts` | Intercepts `fetch('/api/*')` in static mode: GET reads localStorage; POST/PUT upserts; DELETE creates tombstone; auto-purges expired tombstones |
| `src/lib/dataVersion.ts` | Schema version + migrations between versions |
| `src/context/AuthContext.tsx` | Supabase auth wrapper; pull-then-sync ordering to prevent data wipe race condition |
| `src/context/DataOwnerContext.tsx` | Per-account data scoping |

---

## 8. Data model (SQLite tables, simplified)

```
users(id, email, password, name, role, created_at)
models(id TEXT PK, user_id, data JSON, created_at, updated_at)
planning_events(id TEXT PK, owner_id, modelId, chaineId, dateLancement,
                dateExport, qteTotal, qteProduite, status, ...30+ columns)
suivi_data(...)               -- production tracking rows
poste_suivi(...)              -- per-workstation tracking
workers(...)                  -- legacy workers
worker_skills(...)            -- capability matrix
worker_pointage(...)          -- attendance log
hr_workers(id TEXT PK, matricule, full_name, cin, cnss, phone,
           date_naissance, photo, role, chaine_id, poste, salaire_base,
           taux_horaire, taux_piece, prime_assiduite, prime_transport, ...)
hr_pointage(...)              -- HR attendance log
hr_production(...)            -- per-worker output per day
hr_avances(...)               -- salary advances
magasin_products(id TEXT PK, reference, designation, categorie, unite,
                 photo, fournisseurNom, prixUnitaire, cump, stockAlerte, ...)
magasin_lots(...)             -- batch tracking
magasin_mouvements(...)       -- in/out movements
magasin_commandes(...)        -- orders
magasin_demandes(...)         -- internal requests
demandes_appro(...)           -- procurement requests
facturation_factures(...)     -- invoices
facturation_bons(...)         -- delivery notes
facturation_paiements(...)    -- payments
app_settings(...)             -- per-user settings
```

All tables use WAL mode (concurrent reads while writes serialize).

---

## 9. Environment variables

`.env` keys (gitignored):
```
JWT_SECRET=                     # required, generated with `openssl rand -base64 32`
GEMINI_API_KEY=                 # required for AI features
NODE_ENV=development|production
PORT=8000
SMTP_HOST=, SMTP_PORT=, SMTP_USER=, SMTP_PASS=, SMTP_SECURE=true|false
COOKIE_SECURE=true              # force HTTPS-only cookies
HELMET=true                     # enable in dev
SUPABASE_URL=                   # https://<ref>.supabase.co
SUPABASE_ANON_KEY=              # legacy anon JWT
SUPABASE_OWNER_EMAIL=           # PC → cloud push identity
SUPABASE_OWNER_PASSWORD=        # ↑
SUPABASE_SYNC_DEBOUNCE_MS=2000
HR_SAGE_ROUNDING=, HR_SAGE_WORKDAY_START=, HR_SAGE_APPLY=
ALLOW_RESET_DEV_CODE=true       # dev-only password reset
```

Frontend (Vite) env (committed in `.env.static`):
```
VITE_STATIC_MODE=true
VITE_SUPABASE_URL=
VITE_SUPABASE_KEY=
```

---

## 10. Build / run commands

```bash
npm install
npm run dev          # Vite dev server (HMR for frontend)
npm run dev:app      # Express server with SQLite (port 8000)
npm run type-check   # TypeScript validation
npm run build        # Production bundle (Vite)
npm run preview      # Preview production build
npm run start        # Express serving the built bundle
```

For full local dev, run **both** `npm run dev` and `npm run dev:app`.

---

## 11. Deploy targets

### Production server (target: customer's factory)
- Node ≥20 on a local PC inside the factory
- `npm run build` then `npm run start`
- Reverse proxy (nginx / Caddy) for HTTPS in front
- SQLite file at `database.sqlite` is the source of truth

### Static cloud (sales demo + mobile access)
- Vercel deploys from GitHub `master` automatically
- Built with `VITE_STATIC_MODE=true`
- Reads from Supabase via cloudSync
- Url: https://beramethode-1.vercel.app
- Same data as the PC for whoever logs in with the same Supabase account

---

## 12. AI features (Google Gemini)

| Endpoint | Use |
|---|---|
| `POST /api/gemini/analyze-textile` | Analyze a free-text description of a garment; extract structured fields |
| `POST /api/gemini/suggest-vocabulary` | Suggest textile-specific vocabulary (French + Darija) given context |
| `POST /api/gemini/generate-operations` | Generate a gamme opératoire from a textual brief |
| `POST /api/gemini/optimize-planning` | Suggest a re-arranged planning (drag-free auto-schedule) |

Configured via `GEMINI_API_KEY` env. Implemented in `server/geminiAi.ts` +
`server/geminiController.ts`.

---

## 13. Today's recent changes (May 23, 2026)

The bidirectional cloud sync was built/repaired in one long session:

1. **Sous-traitance module** added (component + backend controller).
2. **Planning refactor**: 2900-line monolith split into header/views/hooks/
   modals/panels/shared modules.
3. **PC → Supabase push** (`supabaseSync.ts`):
   - Debounced 2s
   - Base64 image stripping (was 7.2 MB, now 2.8 MB — fits Supabase
     statement-timeout)
   - Echo-loop guard via `markLocalPushing()`
4. **Vercel → Supabase**:
   - AuthContext race fix (pull-then-sync, not pull-and-sync parallel)
   - Push guard rejects empty snapshots to prevent data wipe
   - cloudSync reload-on-change detection
5. **Supabase → PC** (`supabaseRealtime.ts`):
   - `@supabase/supabase-js` realtime channel filtered by user_id
   - Per-table upsert merge (no cascading delete)
   - Tombstone purge after 1h
6. **apiShim** (`src/lib/apiShim.ts`):
   - Previously dropped all writes silently
   - Now: POST/PUT/PATCH upsert into localStorage; DELETE creates tombstone
   - GET filters out tombstoned items
   - `window.beraCorbeille` API for restore/hardDelete
7. **Tombstones**: 1h recovery window, mirrored in `beramethode_tombstones`
   sync key.

Pending follow-ups:
- Corbeille UI page (component) — backend API ready
- pg_cron job in Supabase to purge expired tombstones from the cloud row
  (today only the PC purges, which is fine while one PC is the source of
  truth)

---

## 14. Business positioning / market considerations

### Strengths to highlight
- **Vertical specialization**: built for textile, not generic ERP. Knows
  about gammes opératoires, chaînes, postes, kiswa, etc.
- **Bilingual UI**: French + Darija
- **Offline-first**: works without internet on the factory PC; syncs when
  online
- **Cross-device**: live sync between PC, manager's phone, sales demo
- **AI-assisted**: Gemini helps non-technical users describe operations
- **No SaaS lock-in**: the factory owns the SQLite file
- **Affordable target**: built for SMB Moroccan textile, not enterprise

### Competitors (positioning)
- **Sage / SAP B1** — enterprise, expensive, generic, French only
- **Excel patchwork** — what most factories actually use today
- **Méthodes Textile** software from France — expensive, no Darija
- **Custom internal tools** — fragile

### Pricing model options
- Per-factory annual license + setup fee
- Or per-worker SaaS (e.g. 5 dh/worker/month with cloud sync as a paid tier)

### Market size (rough)
- ~1500 textile units in Morocco; ~200 mid-sized employers (50–500 workers)
- Total addressable: ~200 × 10–30k dh/yr ≈ 2–6 M dh/year if 50% conversion

---

## 15. Where to read what

When asked specific questions, look here:

| Topic | File |
|---|---|
| Cost formula | `components/CostCalculator.tsx` |
| Planning logic | `components/planning/hooks/usePlanningEvents.ts` |
| Auto-schedule algorithm | `components/planning/hooks/useAutoSchedule.ts` |
| AI prompts | `server/geminiAi.ts` |
| HR wage prep | `server/hrController.ts` (search "wage" / "salaire") |
| Stock mouvements | `server/magasinController.ts` |
| Sync mechanics | `server/supabaseSync.ts` + `server/supabaseRealtime.ts` + `src/lib/cloudSync.ts` + `src/lib/apiShim.ts` |

---

## 16. Development tooling — how the project is built

This isn't a hand-coded-from-scratch project. The owner is a **non-coder
domain expert** (textile industry) who builds it with **AI pair-programming
tools**. Worth knowing because:
- The code style mixes patterns from multiple AI assistants
- New features are often described in natural language (French/Darija) and
  the assistant generates code
- The project moves fast but with occasional inconsistencies — refactors
  happen when an assistant cleans up

### AI assistants used to build BERAMETHODE
| Tool | Role |
|---|---|
| **Claude Code** (Anthropic CLI) | Primary IDE assistant. Edits files, runs commands, manages git, debugs. Currently active assistant. |
| **Google Antigravity** | Used in earlier sessions (visible in `.agents/` and historical commits) |
| **Google AI Studio / Gemini** | Quick prototyping + the runtime AI features (`@google/genai`) |
| **Cursor / VS Code Copilot** | Occasional |
| **Stitch (Google)** | Design system exploration (visible in `design-md` skill references) |

### Claude Code skills installed
This repo ships with a `.claude/skills/` directory containing reusable
"skills" the assistant can invoke. Notable ones:

| Skill | What it does |
|---|---|
| **supabase** | Authoritative Supabase guidance — RLS, auth, CLI, MCP server. Used today to design the bidirectional sync. |
| **supabase-postgres-best-practices** | Postgres performance + index advice |
| **shadcn** | Component library scaffolding (Radix UI primitives) |
| **tailwind-design-system** / **tailwind-patterns** | Design tokens + Tailwind v4 patterns |
| **typescript-expert** | Type-level programming, migrations |
| **architect-review** / **architecture-patterns** | Clean Architecture, Hexagonal, DDD reviews |
| **backend-dev-guidelines** | Senior backend standards |
| **cc-skill-backend-patterns** | Backend patterns for Node.js + Express |
| **react-ui-patterns** | Loading/error/data-fetching patterns |
| **radix-ui-design-system** | Headless component customization |
| **api-patterns** | REST vs GraphQL vs tRPC selection |
| **accessibility-compliance** | WCAG audits |
| **uxui-principles** | 168 research-backed UX/UI principles |
| **ui-ux-pro-max** / **ui-ux-designer** | Comprehensive design guidance |
| **design-md** | Synthesizes Stitch projects into DESIGN.md |
| **prompt-engineering** | Prompt patterns + debugging |
| **agent-memory-systems** | Long-term context for agents |
| **vibe-code-auditor** | Audits AI-generated code for fragility |

Plus Anthropic-provided skills: `docx`, `pdf`, `xlsx`, `pptx`,
`canvas-design`, `algorithmic-art`, `skill-creator`.

### MCP (Model Context Protocol) servers connected
| Server | Use |
|---|---|
| **Supabase MCP** | Direct DB queries (`execute_sql`), advisors (`get_advisors`), table/RLS inspection |
| **Claude in Chrome** | Browser automation for verification |
| **Claude Preview** | In-IDE app preview |
| **computer-use** | Native desktop automation when needed |

### Memory / Context files
- `CLAUDE.md` (repo root) — repo-specific instructions for any Claude session
- `~/.claude/projects/.../memory/MEMORY.md` — user-level persistent memory
  (creator profile, project context, working preferences)
- `OPENCODE.md` — agent coordination notes
- `PERFORMANCE_ANALYSIS.md` — perf snapshots
- `.claude/worktrees/` — isolated worktrees for parallel agent runs

### Dev workflow ergonomics
- Owner communicates in **Darija (franco-arabic)** — assistants reply in
  same style for clarity
- Changes go: idea → AI implements → manual test on `localhost:8000` →
  `git push` → Vercel auto-deploys → cross-device verification
- No CI tests yet; safety relies on AI review + manual smoke tests
- Backups: `.sqlite.bak-YYYYMMDD-HHMMSS` files when schemas change

### Why this matters for an external AI
If you're an AI being asked to advise on this project:
- Code may have multiple authoring styles — don't assume any single
  convention
- The owner can't always read code fluently — explain trade-offs in
  business terms, not just engineering
- Suggestions should be **incremental and reversible** — big rewrites
  break things faster than they fix them when the owner can't review
  every line
- Architecture choices are pragmatic, not academic — the goal is shipping
  to Moroccan textile factories, not winning awards

---

## 17. Quick facts for AI to know

- Created by: **Soulaimane Berraadi**
- Repository: `github.com/soulaimaneberraadi/beramethode-1`
- Live demo: `beramethode-1.vercel.app`
- Source of truth: SQLite on the factory's local PC
- Cross-device sync: Supabase (one JSONB row per Supabase user)
- Account binding: per-email Supabase user → RLS isolates rows
- License: commercial; gated by `LicenseScreen.tsx`
- Currency: MAD (Moroccan Dirham)
- Date convention: `YYYY-MM-DD` (ISO) internally, French format in UI
- Number format: French (1 234,56) via `fmt()` helper in `constants.ts`

---

*End of blueprint. AI: feel free to ask the user clarifying questions before
giving recommendations on business strategy, code architecture, new features,
or competitive positioning.*
