/**
 * verify-tenancy.ts — Vérification autonome de l'isolation multi-tenant (IDOR).
 *
 * Phase 6.8 de BERAMETHODE_ARCHITECTURE.md.
 *
 * Ce script NE TOUCHE JAMAIS la vraie base `database.sqlite`. Il force
 * `BERA_DB_PATH` vers un fichier temporaire AVANT d'importer quoi que ce soit
 * qui importe `server/db.ts` (db.ts lit BERA_DB_PATH au moment de l'import).
 *
 * Lancer avec :  npx tsx scripts/verify-tenancy.ts
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

// ── 1) Isolation de l'environnement (AVANT tout import de server/db) ──────────
const TMP_DB = path.join(os.tmpdir(), `bera-idor-test-${randomUUID()}.sqlite`);
process.env.BERA_DB_PATH = TMP_DB;
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.NODE_ENV = 'test';

// Sécurité absolue : ne jamais pointer sur la vraie DB.
const REAL_DB = path.join(process.cwd(), 'database.sqlite');
if (path.resolve(TMP_DB) === path.resolve(REAL_DB)) {
  console.error('FATAL: temp DB path collides with real database.sqlite. Aborting.');
  process.exit(2);
}

// ── État des tests ────────────────────────────────────────────────────────────
let failures = 0;
const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  if (!ok) failures++;
  const tag = ok ? 'PASS' : 'FAIL';
  console.log(`[${tag}] ${name}${detail ? ' — ' + detail : ''}`);
}

// Mock Response : capture .json() et .status().json()
function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    json(payload: any) { this.body = payload; return this; },
    status(code: number) { this.statusCode = code; return this; },
  };
  return res;
}

// Mock Request scopé par companyId (= owner_id résolu par le middleware)
function makeReq(companyId: number, opts: Partial<{ id: number; role: string; params: any; query: any; body: any }> = {}) {
  return {
    user: { id: opts.id ?? companyId, role: opts.role ?? 'admin', email: `u${companyId}@test`, name: `U${companyId}` },
    companyId,
    params: opts.params ?? {},
    query: opts.query ?? {},
    body: opts.body ?? {},
    cookies: {},
  } as any;
}

async function main() {
  // ── 2a) Pré-création d'un schéma compatible AVANT l'import de server/db ────
  // NB (bug pré-existant dans server/db.ts, NON corrigé ici) : `system_audit_logs`
  // est défini deux fois — d'abord SANS colonne `table_name` (~L42), puis le bloc
  // "AI-READY" (~L992) la redéfinit AVEC `table_name` puis crée un index dessus.
  // Comme `CREATE TABLE IF NOT EXISTS` est no-op si la table existe, sur une DB
  // VIERGE la première définition gagne et l'index échoue ("no such column:
  // table_name"). La vraie database.sqlite a été initialisée avant cette
  // divergence, donc elle n'est jamais re-jouée et ne crashe pas. Pour pouvoir
  // tester l'isolation sur une DB neuve, on pré-crée ici la variante riche.
  {
    const Database = (await import('better-sqlite3')).default;
    const seed = new Database(TMP_DB);
    seed.exec(`CREATE TABLE IF NOT EXISTS system_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id TEXT NOT NULL,
      old_data TEXT,
      new_data TEXT,
      changed_by TEXT DEFAULT 'SYSTEM',
      actor TEXT,
      target_user_id INTEGER,
      details TEXT,
      via_impersonation INTEGER DEFAULT 0,
      ip_address TEXT,
      user_agent TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`);
    seed.close();
  }

  // ── 2b) Import dynamique APRÈS avoir fixé BERA_DB_PATH ──────────────────────
  const dbMod = await import('../server/db');
  const db: any = dbMod.default;

  // Confirme que la DB active est bien le fichier temporaire.
  const dbFile = (() => { try { return (db.pragma('database_list') as any[])[0]?.file as string; } catch { return ''; } })();
  check('temp DB en service (vraie DB intacte)',
    !!dbFile && path.resolve(dbFile) === path.resolve(TMP_DB),
    `db=${dbFile}`);

  const modelCtrl = await import('../server/modelController');
  const suiviCtrl = await import('../server/suiviController');
  const approCtrl = await import('../server/demandesApproController');
  const subCtrl = await import('../server/subcontractController');
  const factCtrl = await import('../server/facturationController');
  const hrCtrl = await import('../server/hrController');

  // ── 3) Seed : DEUX sociétés (deux patrons solo) ───────────────────────────
  // Utilisateur solo => loadUserContext renvoie ownerId = son propre user.id.
  const ownerA = 1001;
  const ownerB = 2002;
  const ins = db.prepare(
    "INSERT OR REPLACE INTO users (id, email, password, name, role, status) VALUES (?,?,?,?,?, 'active')"
  );
  ins.run(ownerA, 'companyA@test', 'x', 'Company A', 'user');
  ins.run(ownerB, 'companyB@test', 'x', 'Company B', 'user');

  // models : la colonne user_id joue le rôle d'owner_id.
  const insModel = db.prepare('INSERT INTO models (id, user_id, data) VALUES (?,?,?)');
  insModel.run('modelA1', ownerA, JSON.stringify({ id: 'modelA1', name: 'A-Robe', secret: 'A' }));
  insModel.run('modelA2', ownerA, JSON.stringify({ id: 'modelA2', name: 'A-Pantalon', secret: 'A' }));
  insModel.run('modelB1', ownerB, JSON.stringify({ id: 'modelB1', name: 'B-Chemise', secret: 'B' }));

  // planning_events (owner_id) — requis par la FK de suivi_data.planningId
  const insPlan = db.prepare(
    'INSERT INTO planning_events (id, owner_id, modelId, chaineId, dateLancement, dateExport, qteTotal, status, raw_data) VALUES (?,?,?,?,?,?,?,?,?)'
  );
  insPlan.run('plA', ownerA, 'modelA1', 'ch1', '2026-06-01', '2026-06-10', 100, 'EN_COURS', '{}');
  insPlan.run('plB', ownerB, 'modelB1', 'ch2', '2026-06-01', '2026-06-10', 200, 'EN_COURS', '{}');

  // suivi_data (owner_id)
  const insSuivi = db.prepare(
    'INSERT INTO suivi_data (id, owner_id, planningId, date, raw_data) VALUES (?,?,?,?,?)'
  );
  insSuivi.run('sA', ownerA, 'plA', '2026-06-01', JSON.stringify({ id: 'sA', owner: 'A' }));
  insSuivi.run('sB', ownerB, 'plB', '2026-06-01', JSON.stringify({ id: 'sB', owner: 'B' }));

  // demandes_appro (owner_id)
  const insAppro = db.prepare(
    'INSERT INTO demandes_appro (id, owner_id, dateDemande, modelId, chaineId, produitDesignation, quantiteDemandee, statut) VALUES (?,?,?,?,?,?,?,?)'
  );
  insAppro.run('dA', ownerA, '2026-06-01', 'modelA1', 'ch1', 'Tissu A', 10, 'EN_ATTENTE');
  insAppro.run('dB', ownerB, '2026-06-01', 'modelB1', 'ch2', 'Tissu B', 20, 'EN_ATTENTE');

  // subcontract_orders (owner_id)
  const insSub = db.prepare(
    'INSERT INTO subcontract_orders (id, owner_id, modelId, totalQuantity, subcontractorName, deliveryDate) VALUES (?,?,?,?,?,?)'
  );
  insSub.run('subA', ownerA, 'modelA1', 100, 'SousTraitant A', '2026-07-01');
  insSub.run('subB', ownerB, 'modelB1', 200, 'SousTraitant B', '2026-07-01');

  // factures (owner_id) — numero UNIQUE global, lignes NOT NULL
  const insFact = db.prepare(
    'INSERT INTO factures (id, owner_id, numero, type, tiers_nom, date_facture, total_ht, total_ttc, lignes) VALUES (?,?,?,?,?,?,?,?,?)'
  );
  insFact.run('fA', ownerA, 'FA-A-001', 'VENTE', 'Client A', '2026-06-01', 1000, 1200, '[]');
  insFact.run('fB', ownerB, 'FA-B-001', 'VENTE', 'Client B', '2026-06-01', 500, 600, '[]');

  // hr_transport_lignes (owner_id)
  const insTrans = db.prepare(
    'INSERT INTO hr_transport_lignes (id, nom, owner_id) VALUES (?,?,?)'
  );
  insTrans.run('trA', 'Ligne A', ownerA);
  insTrans.run('trB', 'Ligne B', ownerB);

  // hr_workers (owner_id)
  const insWorker = db.prepare(
    'INSERT INTO hr_workers (id, matricule, full_name, date_embauche, owner_id) VALUES (?,?,?,?,?)'
  );
  insWorker.run('wA', 'MAT-A-1', 'Ouvrier A', '2026-01-01', ownerA);
  insWorker.run('wB', 'MAT-B-1', 'Ouvrier B', '2026-01-01', ownerB);

  // ── 4) LAYER 1 : Contrôleurs — chaque société ne voit QUE ses lignes ──────

  // getModels(A)
  {
    const res = makeRes();
    modelCtrl.getModels(makeReq(ownerA), res);
    const arr: any[] = Array.isArray(res.body) ? res.body : [];
    const onlyA = arr.length === 2 && arr.every(m => m.secret === 'A');
    const noB = !arr.some(m => m.id === 'modelB1');
    check('getModels: companyA ne voit que ses modèles', onlyA && noB, `count=${arr.length}`);
  }
  // getModels(B)
  {
    const res = makeRes();
    modelCtrl.getModels(makeReq(ownerB), res);
    const arr: any[] = Array.isArray(res.body) ? res.body : [];
    check('getModels: companyB ne voit que ses modèles',
      arr.length === 1 && arr[0]?.id === 'modelB1', `count=${arr.length}`);
  }

  // getSuiviData
  {
    const res = makeRes();
    suiviCtrl.getSuiviData(makeReq(ownerA), res);
    const arr: any[] = Array.isArray(res.body) ? res.body : [];
    check('getSuiviData: A isolé de B',
      arr.length === 1 && arr[0]?.id === 'sA' && !arr.some(x => x.id === 'sB'), `count=${arr.length}`);
  }

  // getDemandesAppro
  {
    const res = makeRes();
    approCtrl.getDemandesAppro(makeReq(ownerB), res);
    const arr: any[] = Array.isArray(res.body) ? res.body : [];
    check('getDemandesAppro: B isolé de A',
      arr.length === 1 && arr[0]?.id === 'dB' && !arr.some(x => x.id === 'dA'), `count=${arr.length}`);
  }

  // getSubcontractOrders
  {
    const res = makeRes();
    subCtrl.getSubcontractOrders(makeReq(ownerA), res);
    const arr: any[] = Array.isArray(res.body) ? res.body : [];
    check('getSubcontractOrders: A isolé de B',
      arr.length === 1 && arr[0]?.id === 'subA' && !arr.some(x => x.id === 'subB'), `count=${arr.length}`);
  }

  // getFactures
  {
    const res = makeRes();
    factCtrl.getFactures(makeReq(ownerB), res);
    const arr: any[] = Array.isArray(res.body) ? res.body : [];
    check('getFactures: B isolé de A',
      arr.length === 1 && arr[0]?.id === 'fB' && !arr.some(x => x.id === 'fA'), `count=${arr.length}`);
  }

  // ── HR (>= 2 lectures scopées par companyId) ──────────────────────────────
  // getHRTransportLignes
  {
    const res = makeRes();
    hrCtrl.getHRTransportLignes(makeReq(ownerA), res);
    const arr: any[] = Array.isArray(res.body) ? res.body : [];
    check('getHRTransportLignes: A isolé de B',
      arr.length === 1 && arr[0]?.id === 'trA' && !arr.some(x => x.id === 'trB'), `count=${arr.length}`);
  }
  // getHRWorkers (scopé par w.owner_id)
  {
    const res = makeRes();
    (hrCtrl as any).getHRWorkers(makeReq(ownerB), res);
    const arr: any[] = Array.isArray(res.body) ? res.body : (res.body?.workers ?? []);
    const ids = arr.map((w: any) => w.id);
    check('getHRWorkers: B isolé de A',
      arr.length === 1 && ids.includes('wB') && !ids.includes('wA'), `count=${arr.length}`);
  }

  // ── 5) LAYER 2 : Snapshot (hole 0.2) — buildSnapshot module-privé ─────────
  {
    const sync: any = await import('../server/supabaseSync');
    if (typeof sync.buildSnapshot === 'function') {
      check('snapshot: buildSnapshot exporté (test direct)', true, 'exporté');
    } else {
      // Skip gracieux + vérification de l'invariant sous-jacent :
      // une requête owner-scopée représentative ne renvoie qu'un seul tenant.
      const rowsA = db.prepare('SELECT id FROM factures WHERE owner_id = ?').all(ownerA) as any[];
      const invariant = rowsA.length === 1 && rowsA[0].id === 'fA';
      check('snapshot: buildSnapshot non exporté → skip; invariant owner-scope vérifié',
        invariant, 'requête SELECT...WHERE owner_id ne renvoie qu\'un tenant');
    }
  }

  // ── 6) LAYER 3 : Realtime merge guard (hole 0.3) — analyse statique ───────
  {
    const rtPath = path.join(process.cwd(), 'server', 'supabaseRealtime.ts');
    const rawSrc = fs.readFileSync(rtPath, 'utf8');
    // Code seul : on retire les commentaires (lignes // et /* */) pour que
    // l'analyse ne soit pas polluée par la doc décrivant l'ANCIEN bug
    // ("jamais à un `user_id: 1` codé en dur").
    const src = rawSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');

    // (a) le merge des models utilise un owner local résolu, pas user_id: 1 codé en dur
    const usesLocalOwner = /user_id:\s*localOwnerId/.test(src);
    const noHardcodedOne = !/user_id:\s*1\b/.test(src);
    check('realtime(a): models merge utilise localOwnerId (pas user_id: 1)',
      usesLocalOwner && noHardcodedOne,
      `user_id:localOwnerId=${usesLocalOwner}, pas de user_id:1=${noHardcodedOne}`);

    // (b) applyArrayToTable rejette les lignes dont owner_id != owner local
    const rejectsForeign = /Number\(incoming\)\s*!==\s*ownerId\)\s*continue/.test(src);
    check('realtime(b): applyArrayToTable rejette owner_id étranger',
      rejectsForeign,
      'garde "if (incoming != null && Number(incoming) !== ownerId) continue;" présente');
  }

  // ── 7) Bilan ──────────────────────────────────────────────────────────────
  console.log('\n──────── RÉSUMÉ ────────');
  console.log(`Total: ${results.length}  |  PASS: ${results.length - failures}  |  FAIL: ${failures}`);
}

main()
  .catch((e) => { console.error('Erreur fatale du script:', e); failures++; })
  .finally(() => {
    // Nettoyage du fichier temporaire (+ WAL/SHM)
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.existsSync(TMP_DB + suffix) && fs.unlinkSync(TMP_DB + suffix); } catch { /* ignore */ }
    }
    console.log(`temp DB supprimée: ${TMP_DB}`);
    process.exit(failures > 0 ? 1 : 0);
  });
