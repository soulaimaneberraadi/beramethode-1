# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BERAMETHODE** is an ERP system for Moroccan textile manufacturing facilities. It manages methods/operations costing, production planning, warehouse inventory, HR operations, invoicing, and labor tracking.

- **Tech Stack**: React 19 + TypeScript + Vite (frontend) | Express.js (backend) | SQLite with better-sqlite3 | Google Gemini AI
- **Target Users**: Method engineers, production managers, HR directors in textile factories
- **Languages**: French (primary) + Darija/Arabic (secondary)
- **Development Port**: 8000
- **Node Version**: ≥20.0.0

## Development Commands

**Setup & Running:**
```bash
npm install                    # Install dependencies
npm run dev                    # Start Vite dev server (frontend HMR)
npm run dev:app              # Start Express server (runs on port 8000)
npm run type-check           # Run TypeScript type checking
npm run build                # Build for production
npm run preview              # Preview production build locally
npm run start                # Start production server
```

**Note**: When developing, you typically need both the Vite server (for frontend hot reload) and the Express server running. The Vite dev server proxies API requests to the Express server.

## Architecture

### Frontend (`/components`, App.tsx)
The React app is organized by business domain. Major modules include:

- **BERAMETHODE Core** (`CostCalculator.tsx`, `FicheTechnique.tsx`): Cost calculation engine for manufacturing operations
- **Planning Module** (`Planning.tsx`, `AgendaModal.tsx`): Production scheduling and calendar management
- **Warehouse/Magasin** (`Magasin.tsx`): Inventory tracking, movements, requests, waste management
- **HR Module** (`GESTION-RH.tsx`, `HRWorkerProfilePanel.tsx`): Worker profiles, pointage (attendance), production tracking, salary advances
- **Manufacturing** (`Gamme.tsx`, `Atelier.tsx`, `Chronometrage.tsx`): Process templates, workshop operations, timing analysis
- **Invoicing** (`Facturation.tsx`): Invoice and delivery note management with payment tracking
- **Dashboard** (`Dashboard.tsx`): KPI visualization and reporting
- **Configuration** (`Configuration.tsx`, `ExcelInput.tsx`): System settings and bulk imports

**State Management**: React Context + local state. No Redux/Zustand (keep simple).

**Styling**: Tailwind CSS with inline classes. Some components use Framer Motion for animations.

### Backend (`/server`)
Express.js API organized by domain:

**Controllers** (request handlers):
- `authController.ts` - JWT authentication, login/logout, password reset
- `hrController.ts` - Worker data, pointage, production, salary advances, wage generation
- `hrIdentityController.ts` - Worker invitations and identity verification
- `magasinController.ts` - Inventory CRUD and movements
- `planningController.ts` - Calendar events and scheduling
- `facturationController.ts` - Invoices, delivery notes, payments
- `effectifsController.ts` - Staff management (if exists)
- `posteSuiviController.ts` - Position tracking (workstations)
- `suiviController.ts` - Production tracking data
- `geminiController.ts` - AI text analysis endpoints
- `dashboardController.ts` - KPI aggregation
- `workerSkillsController.ts` - Worker capability mapping
- `workerPointageController.ts` - Attendance logging
- Plus domain-specific: modelController, demandesApproController, productionController, etc.

**Core Services**:
- `db.ts` - SQLite database initialization and connection pool
- `jwtConfig.ts` - JWT configuration and Helmet/CORS setup
- `middleware.ts` - Authentication middleware (verifyToken)
- `geminiAi.ts` - Google Gemini API client wrapper
- `sageHeuresService.ts`, `sageMonthPay.ts` - Sage ERP integration helpers
- `sageConfig.ts` - Sage configuration

**Database**: SQLite (better-sqlite3) with a single file `database.sqlite`. Uses WAL mode for concurrent access. Schema is initialized/migrated by `db.ts` on startup.

### Key Design Patterns

1. **Controller-based routing**: Each domain has a controller that exports CRUD functions called from `server.ts` endpoints
2. **Middleware auth**: Routes that need authentication use `authenticateToken` middleware
3. **Error handling**: Controllers return JSON with status codes; frontend handles errors in async calls
4. **Multilingual UI**: All UI strings live in `constants.ts` under `translations` object (keyed by language code `dr`, `fr`, etc.)
5. **Cost calculation**: Core formula engine in BERAMETHODE components (time-based + material-based + margins)
6. **AI integration**: Gemini used for textile vocabulary suggestions, operation analysis, and text classification

## Data & Database

**SQLite Single File**: `database.sqlite`
- Better-sqlite3 for synchronous operations (simpler debugging)
- WAL mode enables concurrent reads while writes are serialized
- Initialization and schema in `server/db.ts`

**Key Tables** (inferred from controllers):
- `users` - System users with roles
- `workers` - Employee master data (CIN, name, position, hire date)
- `pointage` - Attendance/time clock records
- `production` - Worker output per task per day
- `worker_skills` - Capability matrix
- `planning_events` - Calendar entries
- `magasin_products` - Inventory items
- `magasin_mouvements` - Stock in/out transactions
- `magasin_lots` - Batch tracking
- `facturation_factures` - Invoices
- `facturation_bons` - Delivery notes
- `facturation_paiements` - Payment records
- `hr_workers` - Enhanced worker profiles (separate from users table)
- `hr_pointage` - HR-managed attendance
- `hr_production` - HR-tracked output
- `hr_avances` - Salary advances
- `models` - Product/style templates (for BERAMETHODE costing)

## Environment & Configuration

**`.env` Variables** (from `.env.example`):
- `JWT_SECRET` - **Required**. Generate with: `openssl rand -base64 32`
- `GEMINI_API_KEY` - Google Gemini API key (required for AI features)
- `NODE_ENV` - "development" or "production"
- `PORT` - Server port (default 8000)
- `SMTP_HOST/PORT/USER/PASS/SECURE` - Email config for password resets
- `HR_SAGE_ROUNDING`, `HR_SAGE_WORKDAY_START`, `HR_SAGE_APPLY` - Sage payroll adjustments (optional)
- `COOKIE_SECURE=true` - Force secure cookies (HTTPS only)
- `HELMET=true` - Enable Helmet headers in dev
- `BERAMETHODE_NO_HMR=1` - Disable Vite HMR if page keeps reloading
- `ALLOW_RESET_DEV_CODE=true` - Return reset codes in JSON response (dev only)

**Helmet/Security**: 
- Helmet CSP enabled in production (controlled by `jwtConfig.ts`)
- CORS and rate limiting configured on Express app
- JWT in httpOnly cookies

## Common Development Tasks

**Adding a New Endpoint**:
1. Create or update controller in `/server` (e.g., `newDomainController.ts`)
2. Export GET/POST/PUT/DELETE functions
3. Import in `server.ts` and add route: `app.post('/api/newdomain/action', authenticateToken, handler)`
4. Add corresponding React hook/fetch in frontend component
5. Update `constants.ts` UI labels if needed

**Adding a UI Module**:
1. Create component in `/components/{ModuleName}.tsx`
2. Add route/menu entry in `App.tsx`
3. Add translations to `constants.ts`
4. Create backend API endpoints and controller
5. Use React hooks (useState, useEffect) for state management

**Schema Changes**:
1. Update SQL in `server/db.ts` (in the initialization section)
2. Add migration/ALTER statements if database already exists
3. Update relevant controller queries
4. Test schema changes locally before commit

**Database Debugging**:
- SQLite is file-based; inspect with `sqlite3 database.sqlite` or GUI tools
- WAL file (`database.sqlite-wal`) is temporary; don't commit
- Always export/backup before major schema changes

## Testing & Verification

- **Type checking**: `npm run type-check` catches TypeScript errors
- **Manual testing**: Start dev server with `npm run dev` + `npm run dev:app`, use browser at `http://localhost:8000`
- **No unit test suite currently** (add if adding complex business logic)
- **Integration testing**: Test end-to-end workflows (create plan → assign workers → verify payroll)

## Key Files & Imports

- **App.tsx** - Main routing and component mounting
- **constants.ts** - All translations, utilities (fmt function for number formatting)
- **server.ts** - Express app setup, routes, middleware
- **server/db.ts** - Database connection and initialization
- **types.ts** (if exists) - TypeScript interfaces

## Important Notes

- **Textile Domain**: Understanding French textile terminology and Moroccan labor practices helps with naming/logic
- **Cost Calculation**: BERAMETHODE's core is the "Prix de Revient" (cost price) formula: Materials + Labor + Factory Margin + Tax + Shop Margin
- **Multilingual**: Always add UI strings to `constants.ts` under the language key, not hardcoded
- **SQLite Concurrency**: WAL mode is enabled; reads don't block writes and vice versa
- **Gemini Integration**: Async calls; wrap in try-catch and handle rate limits
- **Production Mode**: Set `NODE_ENV=production` to enable Helmet, rate limiting, and optimized builds
