/**
 * 100 ouvriers fictifs, profils cohérents (confection / chaînes de production).
 * Répartition sur 4 chaînes (par défaut) : 27 + 23 + 30 + 20 = 100.
 *
 * Usage:
 *   npx tsx scripts/seed-hr-100-test.ts
 *   npx tsx scripts/seed-hr-100-test.ts 100 2
 *   $env:OWNER_EMAIL="soulaimaneberraadi@gmail.com"; npx tsx scripts/seed-hr-100-test.ts
 */
import { randomUUID } from 'crypto';
import db from '../server/db';

function resolveOwnerId(): number {
  const email = process.env.OWNER_EMAIL?.trim();
  if (email) {
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
    if (row) return row.id;
    console.warn(`OWNER_EMAIL=${email} introuvable — repli owner_id.`);
  }
  const a = process.argv[3];
  if (a) {
    const n = parseInt(a, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  const raw = process.env.OWNER_ID;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 1;
}

/** 4 chaînes : nombres d’ouvriers (total = 100) */
const SPLIT = [27, 23, 30, 20] as const;
const CHAIN_IDS = ['CHAINE-1', 'CHAINE-2', 'CHAINE-3', 'CHAINE-4'] as const;

const PRENOMS = [
  'Yassine', 'Omar', 'Mehdi', 'Anas', 'Hicham', 'Rachid', 'Hamza', 'Bilal', 'Amine', 'Sofiane',
  'Houda', 'Sanae', 'Fatima', 'Khadija', 'Salma', 'Nadia', 'Imane', 'Aicha', 'Yasmine', 'Lamiae',
  'Driss', 'Khalid', 'Samir', 'Nabil', 'Tarik', 'Zineb', 'Ilham', 'Soukaina', 'Othmane', 'Meryem',
  'Adil', 'Jawad', 'Reda', 'Fouad', 'Loubna', 'Hajar', 'Abdel', 'Younes', 'Simo', 'Kaoutar',
  'Ayoub', 'Issam', 'Marouane', 'Nouhaila', 'Chaimae', 'El Mehdi', 'Brahim', 'Laila', 'Hakim', 'Zakaria',
  'Ibtissam', 'Siham', 'Mouna', 'Rida', 'Badre', 'Mustapha', 'Amina', 'Hamid', 'Faical', 'Samira',
];
const NOMS = [
  'Alami', 'Benali', 'Idrissi', 'Fassi', 'Tazi', 'Cherkaoui', 'Bennani', 'Lahlou', 'Mouradi', 'Zerouali',
  'Bensaid', 'Amrani', 'Kettani', 'Rahmouni', 'Sebti', 'Nasri', 'Filali', 'Berrada', 'Senhaji', 'Haouari',
  'Jabri', 'Ouazzani', 'Tahiri', 'El Mansouri', 'Chraibi', 'Bouazza', 'Slaoui', 'Dahbi', 'Rguibi', 'El Harti',
];

const VILLES = ['Casablanca', 'Mohammedia', 'Témara', 'Ain Harrouda', 'Berrechid', 'Médiouna'];

const POSTE_PAR_CHAINE: Record<(typeof CHAIN_IDS)[number], string[]> = {
  'CHAINE-1': [
    'Piqueur', 'Piqueuse plate', 'Surjeteuse 5 fils', 'Surgé', 'Boutonnière', 'Trouseuse', 'Recouvreuse', 'Finition bord', 'Piqueur retouche',
  ],
  'CHAINE-2': [
    'Surjeteuse 4 fils', 'Piqueur', 'Colleteuse', 'Brideuse', 'Surfileur', 'Point de chaînette', 'Piqueur double', 'Assembleur manches',
  ],
  'CHAINE-3': [
    'Piqueur', 'Double aiguille', 'Élastiqueur', 'Brètes / passant', 'Surfileur', 'Piqueur ceinture', 'Ourlet', 'Pose étiquette interne',
  ],
  'CHAINE-4': [
    'Contrôle visuel AQL', 'Repassage / presse', 'Emballage', 'Mise en carton', 'Palette & étiquetage', 'Piqueur dernière retouche', 'QC finition', 'Operateur sachet',
  ],
};

const SPECS = ['Jupe', 'Robe', 'Pantalon', 'Veste', 'Short', 'Ensemble', 'Chemise', 'Manteau', 'Gilet', 'Manteau long'];

function fullName(i: number): string {
  return `${PRENOMS[i % PRENOMS.length]} ${NOMS[(i * 7) % NOMS.length]}`;
}

function phone(i: number): string {
  const p = 600000000 + (i * 137) % 90000000;
  return `0${p.toString().slice(0, 9)}`;
}

function dateNaissance(i: number): string {
  const y = 1978 + (i % 22);
  const m = String(1 + (i % 12)).padStart(2, '0');
  const d = String(1 + (i % 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function roleForPosition(chain: (typeof CHAIN_IDS)[number], indexInChain: number, totalInChain: number): string {
  if (indexInChain === 1) return 'SUPERVISOR';
  if (indexInChain === 2) return 'MECHANIC';
  if (indexInChain % 8 === 0) return 'QC';
  if (chain === 'CHAINE-3' && (indexInChain === 4 || indexInChain === 15)) return 'IRON';
  if (chain === 'CHAINE-4' && (indexInChain % 5 === 0 || indexInChain % 5 === 2)) return 'PACKER';
  if (indexInChain % 11 === 0) return 'QC';
  return 'OPERATOR';
}

function posteFor(chain: (typeof CHAIN_IDS)[number], indexInChain: number, role: string): string {
  if (role === 'SUPERVISOR') return 'Chef de chaîne';
  if (role === 'MECHANIC') return 'Technicien réglage & maintenance';
  if (role === 'QC') return 'Contrôle qualité chaîne';
  if (role === 'IRON') return 'Repassage / presse';
  if (role === 'PACKER') return 'Emballage & palette';
  const pool = POSTE_PAR_CHAINE[chain];
  return pool[(indexInChain - 1) % pool.length];
}

function chainForGlobalIndex(i: number): { chain: (typeof CHAIN_IDS)[number]; indexInChain: number; chainNo: number } {
  let start = 1;
  for (let c = 0; c < SPLIT.length; c++) {
    const n = SPLIT[c];
    if (i >= start && i < start + n) {
      return { chain: CHAIN_IDS[c], indexInChain: i - start + 1, chainNo: c + 1 };
    }
    start += n;
  }
  return { chain: 'CHAINE-4', indexInChain: i - (100 - SPLIT[3]), chainNo: 4 };
}

const COUNT = SPLIT.reduce((a, b) => a + b, 0);
const OWNER_ID = resolveOwnerId();
const M_PREFIX = `SEEDU${OWNER_ID}-B100-`;
const emb = '2018-04-10';

/** Supprime tout seed `SEEDU…-B100-…` (peu importe l’id user dans le préfixe après déménagement de compte) */
const del = db.prepare(`DELETE FROM hr_workers WHERE owner_id = ? AND matricule GLOB 'SEEDU*-B100-*'`);
const removed = del.run(OWNER_ID).changes;

const ins = db.prepare(`
  INSERT INTO hr_workers (
    id, matricule, full_name, cin, phone, sexe, date_naissance, adresse, date_embauche,
    role, type_contrat, owner_id, chaine_id, poste, specialite,
    is_active, salaire_base, taux_horaire, taux_piece, prime_assiduite, prime_transport, mode_paiement,
    pointeuse_id, pointeuse_type, contact_urgence_nom, contact_urgence_tel, notes
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?,
    ?, 'CDI', ?, ?, ?, ?,
    1, ?, ?, ?, ?, ?, 'VIREMENT',
    ?, 'MANUAL', ?, ?, ?
  )
`);

const rows: {
  id: string;
  mat: string;
  name: string;
  cin: string;
  phone: string;
  sexe: string;
  dn: string;
  addr: string;
  role: string;
  chain: string;
  poste: string;
  spec: string;
  sal: number;
  th: number;
  tp: number;
  pa: number;
  pt: number;
  pointeuse: string;
  urgence: string;
  urgenceTel: string;
  note: string;
}[] = [];

for (let i = 1; i <= COUNT; i++) {
  const { chain, indexInChain, chainNo } = chainForGlobalIndex(i);
  const n = i.toString().padStart(3, '0');
  const cin = `C${OWNER_ID.toString().padStart(2, '0')}${(10000 + i).toString()}`;
  const role = roleForPosition(chain, indexInChain, SPLIT[chainNo - 1]);
  const poste = posteFor(chain, indexInChain, role);
  const spec = SPECS[i % SPECS.length];
  const sal = 3200 + (i % 40) * 28;
  const th = 16 + (i % 5) * 0.5;
  const tp = 0.15 + (i % 7) * 0.01;
  const pa = 150 + (i % 8) * 20;
  const pt = 200 + (i % 5) * 15;
  const pair = Math.floor((indexInChain - 1) / 2) + 1;
  const pointeuse = `C${chainNo}-BIN${String(pair).padStart(2, '0')}`;
  const note = `Binôme poste n°${pair} sur ${chain} — machine partagée (2 opérateurs) / consigne qualité appliquée.`;
  const sexe = i % 2 === 0 ? 'F' : 'M';
  const urgence = i % 2 === 0 ? 'Conjoint' : 'Frère / sœur';
  const urgenceTel = `0${(650000000 + (i * 11) % 80000000).toString().slice(0, 8)}`;

  rows.push({
    id: `hr-${randomUUID()}`,
    mat: `${M_PREFIX}${n}`,
    name: fullName(i + 11),
    cin,
    phone: phone(i),
    sexe,
    dn: dateNaissance(i),
    addr: `${VILLES[i % VILLES.length]} — Secteur ${(i % 6) + 1}`,
    role,
    chain,
    poste,
    spec,
    sal,
    th,
    tp,
    pa,
    pt,
    pointeuse,
    urgence,
    urgenceTel,
    note,
  });
}

const t = db.transaction((list: typeof rows) => {
  for (const x of list) {
    ins.run(
      x.id, x.mat, x.name, x.cin, x.phone, x.sexe, x.dn, x.addr, emb,
      x.role, OWNER_ID, x.chain, x.poste, x.spec,
      x.sal, x.th, x.tp, x.pa, x.pt,
      x.pointeuse, x.urgence, x.urgenceTel, x.note
    );
  }
});
t(rows);

console.log(`[seed-hr-100-test] owner_id=${OWNER_ID}  supprimé(ancien seed): ${removed}  inséré: ${COUNT}`);
console.log('Répartition:', CHAIN_IDS.map((c, j) => `${c}: ${SPLIT[j]}`).join(' | '));
console.log(`Matricules: ${M_PREFIX}001 … ${M_PREFIX}${COUNT.toString().padStart(3, '0')}`);
