/**
 * Données de test liées : pointage (mois + aujourd’hui), production, avances, utile à Sage / onglets RH.
 * Cible les ouvriers « seed » (matricule SEEDU*-B100-*) de l’utilisateur.
 *
 * Usage:
 *   npx tsx scripts/seed-hr-relations-test.ts
 *   $env:OWNER_EMAIL="soulaimaneberraadi@gmail.com"; npx tsx scripts/seed-hr-relations-test.ts
 *   $env:SEED_MOIS="2026-04"; npx tsx scripts/seed-hr-relations-test.ts
 */
import { randomUUID } from 'crypto';
import db from '../server/db';

function resolveOwnerId(): number {
  const email = process.env.OWNER_EMAIL?.trim();
  if (email) {
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
    if (row) return row.id;
    console.warn(`OWNER_EMAIL introuvable — repli.`);
  }
  const n = parseInt(process.env.OWNER_ID || '2', 10);
  return Number.isNaN(n) || n < 1 ? 2 : n;
}

const OWNER_ID = resolveOwnerId();
const SEED_MOIS = (process.env.SEED_MOIS || new Date().toISOString().slice(0, 7)).trim();
const [Y, M] = SEED_MOIS.split('-').map(Number);
if (!Y || !M) {
  console.error('SEED_MOIS invalide, utiliser YYYY-MM');
  process.exit(1);
}

const workers = db
  .prepare(
    `SELECT id, matricule, chaine_id FROM hr_workers WHERE owner_id = ? AND matricule GLOB 'SEEDU*-B100-*' ORDER BY matricule`
  )
  .all(OWNER_ID) as { id: string; matricule: string; chaine_id: string | null }[];

if (workers.length === 0) {
  console.error('Aucun ouvrier seed (SEEDU*-B100-*). Lancez d’abord: npx tsx scripts/seed-hr-100-test.ts');
  process.exit(1);
}

function weekdaysInMonth(y: number, m: number): string[] {
  const out: string[] = [];
  const last = new Date(y, m, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const dt = new Date(y, m - 1, d);
    const w = dt.getDay();
    if (w === 0 || w === 6) continue;
    const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    out.push(s);
  }
  return out;
}

const today = new Date().toISOString().slice(0, 10);
const dates = [...new Set([...weekdaysInMonth(Y, M), today])].sort();

const widList = workers.map((w) => w.id);
const inList = widList.map(() => '?').join(',');

const delPt = db.prepare(
  `DELETE FROM hr_pointage WHERE worker_id IN (${inList})`
);
delPt.run(...widList);

const delPr = db.prepare(
  `DELETE FROM hr_production WHERE worker_id IN (${inList})`
);
delPr.run(...widList);

const delAv = db.prepare(
  `DELETE FROM hr_avances WHERE worker_id IN (${inList}) AND (notes = 'SEED_DEMO' OR id LIKE 'seed-av-%')`
);
delAv.run(...widList);

const insPt = db.prepare(`
  INSERT INTO hr_pointage (
    id, worker_id, date, heure_entree, heure_sortie, pause_debut, pause_fin,
    heures_travaillees, heures_normales, heures_supp_25, heures_supp_50, statut, motif_absence, is_validated, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insPr = db.prepare(`
  INSERT INTO hr_production (
    id, worker_id, date, chaine_id, model_ref, pieces_produites, pieces_defaut, pieces_retouchees, taux_qualite, rendement, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insAv = db.prepare(`
  INSERT INTO hr_avances (
    id, worker_id, date_demande, montant, montant_approuve, solde_restant, nb_echeances, statut, motif, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SEED_DEMO')
`);

const t = db.transaction(() => {
  let nPt = 0;
  let nPr = 0;
  for (const date of dates) {
    const dayIdx = parseInt(date.slice(8, 10), 10);
    let wk = 0;
    for (const w of workers) {
      wk++;
      const h = 8;
      const norm = 8;
      const s25 = 0;
      const s50 = 0;
      const late = wk % 19 === 0 && date === today;
      const statut = late ? 'RETARD' : 'PRESENT';
      const he = late ? '08:12' : '08:00';
      const note = 'SEED_DEMO_RH_REL';
      insPt.run(
        `p-${randomUUID()}`,
        w.id,
        date,
        he,
        '17:00',
        '12:00',
        '13:00',
        h,
        norm,
        s25,
        s50,
        statut,
        null,
        0,
        note
      );
      nPt++;

      const pieces = 80 + ((dayIdx * 3 + wk * 7) % 120);
      const def = (wk + dayIdx) % 7 === 0 ? 2 : 0;
      const ret = (wk + dayIdx) % 11 === 0 ? 1 : 0;
      const tq = 92 + (wk % 7);
      const rd = 78 + (wk % 20);
      insPr.run(
        `pr-${randomUUID()}`,
        w.id,
        date,
        w.chaine_id || 'CHAINE-1',
        `MOD-${(wk % 5) + 1}`,
        pieces,
        def,
        ret,
        tq,
        rd,
        'SEED_DEMO_RH_REL'
      );
      nPr++;
    }
  }

  let nAv = 0;
  const avWorkers = workers.filter((_, i) => i % 5 === 0).slice(0, 25);
  const statuts: string[] = ['DEMANDE', 'APPROUVE', 'EN_COURS', 'APPROUVE', 'DEMANDE'];
  for (let i = 0; i < avWorkers.length; i++) {
    const w = avWorkers[i];
    const m = 800 + (i * 137) % 4000;
    const st = statuts[i % statuts.length];
    const app = st === 'APPROUVE' || st === 'EN_COURS' ? m * 0.9 : null;
    const solde = st === 'EN_COURS' ? (app || 0) * 0.6 : 0;
    const day = String((i % 27) + 1).padStart(2, '0');
    const dateDemande = `${SEED_MOIS}-${day}`;
    insAv.run(
      `seed-av-${randomUUID()}`,
      w.id,
      dateDemande,
      m,
      app,
      solde,
      st === 'EN_COURS' ? 3 : 1,
      st,
      'Avance test démo',
    );
    nAv++;
  }
  return { nPt, nPr, nAv };
});

const r = t();
console.log(`[seed-hr-relations-test] owner_id=${OWNER_ID}  workers=${workers.length}`);
console.log(`  mois: ${SEED_MOIS}  jours (ouvrés + aujourd’hui si besoin): ${dates.length}  => pointage lignes: ${r.nPt}, production: ${r.nPr}, avances: ${r.nAv}`);
console.log('  Onglets Pointage / Statistiques / Production / Avances / Sage (prévisu mois) alimentés.');
