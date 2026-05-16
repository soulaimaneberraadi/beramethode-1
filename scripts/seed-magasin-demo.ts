/**
 * Insère ~10 articles démo dans le Magasin (SQLite).
 * Relancer le script remplace les lignes du même préfixe (SEED-U{ownerId}-).
 *
 * Usage:
 *   npx tsx scripts/seed-magasin-demo.ts
 *   OWNER_ID=2 npx tsx scripts/seed-magasin-demo.ts
 *   set OWNER_EMAIL=toi@mail.com && npx tsx scripts/seed-magasin-demo.ts   (Windows PowerShell: $env:OWNER_EMAIL="...")
 */
import db from '../server/db';

function resolveOwnerId(): number {
  const email = process.env.OWNER_EMAIL?.trim();
  if (email) {
    const row = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: number } | undefined;
    if (row) return row.id;
    console.warn(`OWNER_EMAIL=${email} introuvable — fallback owner_id=1.`);
  }
  const raw = process.env.OWNER_ID;
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 1;
}

const OWNER_ID = resolveOwnerId();
const PREFIX = `SEED-U${OWNER_ID}-`;

type Cat = 'tissu' | 'fil' | 'bouton' | 'fermeture' | 'etiquette' | 'emballage' | 'autre';
type Unit = 'm' | 'kg' | 'piece' | 'cone' | 'boite' | 'rouleau';

interface SeedRow {
  id: string;
  reference: string;
  designation: string;
  categorie: Cat;
  unite: Unit;
  prixUnitaire: number;
  stockAlerte: number;
  emplacement: string;
  fournisseurNom: string;
  fournisseurTel: string;
  fournisseurEmail: string;
  fournisseurAdresse: string;
  fournisseurIce: string;
  fournisseurConditionsPaiement: string;
  fournisseurDelaiLivraisonJours: number;
  fournisseurMoq: number;
  fournisseurDevise: string;
  fournisseurContact: string;
  fournisseurNotes: string;
  lotQty: number;
  lotPrix: number;
  numBain?: string;
  variante?: string;
}

const DEMO: SeedRow[] = [
  {
    id: `${PREFIX}01`, reference: 'TIS-COT-NO-001', designation: 'Tissu coton sergé noir 150cm', categorie: 'tissu', unite: 'm',
    prixUnitaire: 42, stockAlerte: 40, emplacement: 'Rayon A — Roul. 12',
    fournisseurNom: 'Textiles du Nord SARL', fournisseurTel: '+212 5 22 11 00 01', fournisseurEmail: 'contact@textilesnord.ma',
    fournisseurAdresse: 'Zone Ind. Aïn Sebaâ, Casablanca', fournisseurIce: '0012345678000111',
    fournisseurConditionsPaiement: '30j fin de mois', fournisseurDelaiLivraisonJours: 7, fournisseurMoq: 50, fournisseurDevise: 'MAD',
    fournisseurContact: 'M. Alami', fournisseurNotes: 'Réf. catalogue hiver 2026',
    lotQty: 280, lotPrix: 42, numBain: 'TEIN-2026-014', variante: 'Noir profond',
  },
  {
    id: `${PREFIX}02`, reference: 'TIS-DEN-BL-002', designation: 'Denim stretch brut 12oz', categorie: 'tissu', unite: 'm',
    prixUnitaire: 68, stockAlerte: 30, emplacement: 'Rayon A — Roul. 03',
    fournisseurNom: 'Denim House', fournisseurTel: '+212 5 23 44 55 66', fournisseurEmail: 'sales@denimhouse.ma',
    fournisseurAdresse: 'Bd Zerktouni, Casablanca', fournisseurIce: '0029876543000999',
    fournisseurConditionsPaiement: 'Comptant / virement', fournisseurDelaiLivraisonJours: 10, fournisseurMoq: 40, fournisseurDevise: 'MAD',
    fournisseurContact: 'Service ventes', fournisseurNotes: 'Lot certifié stretch',
    lotQty: 150, lotPrix: 68, numBain: 'DEN-4488', variante: 'Brut',
  },
  {
    id: `${PREFIX}03`, reference: 'FIL-PES-40-003', designation: 'Fil polyester 40/2 — cône 5000m', categorie: 'fil', unite: 'cone',
    prixUnitaire: 18.5, stockAlerte: 24, emplacement: 'Zone B — Colonne 2',
    fournisseurNom: 'Fil & Aiguille Pro', fournisseurTel: '+212 6 61 22 33 44', fournisseurEmail: 'pro@filpro.ma',
    fournisseurAdresse: 'Hay Mohammadi, Tanger', fournisseurIce: '0031112223334445',
    fournisseurConditionsPaiement: '45j', fournisseurDelaiLivraisonJours: 5, fournisseurMoq: 12, fournisseurDevise: 'MAD',
    fournisseurContact: 'Magasin', fournisseurNotes: 'Couleur noir standard',
    lotQty: 80, lotPrix: 18.5, variante: 'Noir',
  },
  {
    id: `${PREFIX}04`, reference: 'FIL-SUR-120-004', designation: 'Fil surjet 120 — cône 3000m', categorie: 'fil', unite: 'cone',
    prixUnitaire: 22, stockAlerte: 20, emplacement: 'Zone B — Colonne 2',
    fournisseurNom: 'Fil & Aiguille Pro', fournisseurTel: '+212 6 61 22 33 44', fournisseurEmail: 'pro@filpro.ma',
    fournisseurAdresse: 'Hay Mohammadi, Tanger', fournisseurIce: '0031112223334445',
    fournisseurConditionsPaiement: '45j', fournisseurDelaiLivraisonJours: 5, fournisseurMoq: 12, fournisseurDevise: 'MAD',
    fournisseurContact: 'Magasin', fournisseurNotes: '',
    lotQty: 64, lotPrix: 22, variante: 'Blanc cassé',
  },
  {
    id: `${PREFIX}05`, reference: 'BTN-NAC-18-005', designation: 'Boutons nacrés 4 trous Ø18mm', categorie: 'bouton', unite: 'piece',
    prixUnitaire: 0.35, stockAlerte: 500, emplacement: 'Tiroir T-BTN-01',
    fournisseurNom: 'Accessoires Habillement SA', fournisseurTel: '+212 5 39 77 88 99', fournisseurEmail: 'cmd@acchabillement.ma',
    fournisseurAdresse: 'Fès', fournisseurIce: '0045566778899001',
    fournisseurConditionsPaiement: 'Comptant', fournisseurDelaiLivraisonJours: 3, fournisseurMoq: 1000, fournisseurDevise: 'MAD',
    fournisseurContact: '', fournisseurNotes: 'Sachet 100 pcs',
    lotQty: 4200, lotPrix: 0.35, variante: 'Ivoire',
  },
  {
    id: `${PREFIX}06`, reference: 'ZIP-INV-20-006', designation: 'Fermeture invisible nylon 20 cm', categorie: 'fermeture', unite: 'piece',
    prixUnitaire: 3.2, stockAlerte: 200, emplacement: 'Armoire ZIP — Bac 4',
    fournisseurNom: 'Zip Industrie', fournisseurTel: '+212 5 22 99 00 11', fournisseurEmail: 'ventes@zipind.ma',
    fournisseurAdresse: 'Berrechid', fournisseurIce: '0056677889900112',
    fournisseurConditionsPaiement: '30j', fournisseurDelaiLivraisonJours: 6, fournisseurMoq: 100, fournisseurDevise: 'MAD',
    fournisseurContact: '', fournisseurNotes: 'Couleur noir',
    lotQty: 850, lotPrix: 3.2, variante: 'Noir',
  },
  {
    id: `${PREFIX}07`, reference: 'ZIP-MET-18-007', designation: 'Fermeture métal laiton 18 cm', categorie: 'fermeture', unite: 'piece',
    prixUnitaire: 5.9, stockAlerte: 120, emplacement: 'Armoire ZIP — Bac 5',
    fournisseurNom: 'Zip Industrie', fournisseurTel: '+212 5 22 99 00 11', fournisseurEmail: 'ventes@zipind.ma',
    fournisseurAdresse: 'Berrechid', fournisseurIce: '0056677889900112',
    fournisseurConditionsPaiement: '30j', fournisseurDelaiLivraisonJours: 6, fournisseurMoq: 80, fournisseurDevise: 'MAD',
    fournisseurContact: '', fournisseurNotes: '',
    lotQty: 400, lotPrix: 5.9, variante: 'Laiton vieilli',
  },
  {
    id: `${PREFIX}08`, reference: 'ETQ-LAV-008', designation: 'Étiquettes composition + entretien', categorie: 'etiquette', unite: 'piece',
    prixUnitaire: 0.12, stockAlerte: 2000, emplacement: 'Bureau étiquetage',
    fournisseurNom: 'Print Etiquettes', fournisseurTel: '+212 6 55 44 33 22', fournisseurEmail: 'hello@printetiq.ma',
    fournisseurAdresse: 'Marrakech', fournisseurIce: '0067788990011223',
    fournisseurConditionsPaiement: 'À la livraison', fournisseurDelaiLivraisonJours: 14, fournisseurMoq: 5000, fournisseurDevise: 'MAD',
    fournisseurContact: 'Studio graphique', fournisseurNotes: 'Modèle BERAMETHODE 2026',
    lotQty: 12000, lotPrix: 0.12,
  },
  {
    id: `${PREFIX}09`, reference: 'EMB-POL-30x40-009', designation: 'Sachets polypropylène 30×40 cm', categorie: 'emballage', unite: 'piece',
    prixUnitaire: 0.45, stockAlerte: 800, emplacement: 'Quai expédition',
    fournisseurNom: 'Emballages Express', fournisseurTel: '+212 5 23 12 34 56', fournisseurEmail: 'info@embexpress.ma',
    fournisseurAdresse: 'Oujda', fournisseurIce: '0078899001122334',
    fournisseurConditionsPaiement: 'Comptant', fournisseurDelaiLivraisonJours: 4, fournisseurMoq: 500, fournisseurDevise: 'MAD',
    fournisseurContact: '', fournisseurNotes: 'Épaisseur 50µ',
    lotQty: 5000, lotPrix: 0.45,
  },
  {
    id: `${PREFIX}10`, reference: 'AUT-RUB-010', designation: 'Ruban gros-grain 25mm — rouleau 25m', categorie: 'autre', unite: 'rouleau',
    prixUnitaire: 38, stockAlerte: 15, emplacement: 'Rayon C — Étagère 7',
    fournisseurNom: 'Mercerie Atlas', fournisseurTel: '+212 6 70 11 22 33', fournisseurEmail: 'stock@mercerieatlas.ma',
    fournisseurAdresse: 'Salé', fournisseurIce: '0089900112233445',
    fournisseurConditionsPaiement: '15j', fournisseurDelaiLivraisonJours: 4, fournisseurMoq: 10, fournisseurDevise: 'MAD',
    fournisseurContact: '', fournisseurNotes: 'Rouge bordeaux',
    lotQty: 48, lotPrix: 38, variante: 'Bordeaux',
  },
];

const insertProduct = db.prepare(`
  INSERT INTO magasin_products
  (id, owner_id, reference, designation, categorie, unite, photo, fournisseurNom, fournisseurTel, fournisseurEmail, chaineExclusive, emplacement, prixUnitaire, cump, stockAlerte,
   fournisseurAdresse, fournisseurIce, fournisseurRc, fournisseurConditionsPaiement, fournisseurDelaiLivraisonJours, fournisseurMoq, fournisseurDevise, fournisseurContact, fournisseurNotes, fournisseurLogo)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertLot = db.prepare(`
  INSERT INTO magasin_lots (id, productId, quantiteRestante, quantiteInitiale, prixUnitaire, dateEntree, fournisseur, numBain, dateExpiration, variante, etat, quantiteReservee)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMvt = db.prepare(`
  INSERT INTO magasin_mouvements (id, productId, type, source, destination, quantite, prixUnitaire, fournisseurId, chaineId, modeleRef, date, operateurNom, notes, lotId, bain, documentRef, pieceJointe)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const now = new Date().toISOString();

const run = db.transaction(() => {
  db.prepare(
    `DELETE FROM magasin_mouvements WHERE productId LIKE ?`
  ).run(`${PREFIX}%`);
  db.prepare(
    `DELETE FROM magasin_lots WHERE productId LIKE ?`
  ).run(`${PREFIX}%`);
  db.prepare(
    `DELETE FROM magasin_products WHERE owner_id = ? AND id LIKE ?`
  ).run(OWNER_ID, `${PREFIX}%`);

  for (let i = 0; i < DEMO.length; i++) {
    const r = DEMO[i];
    const cump = r.lotPrix;
    insertProduct.run(
      r.id,
      OWNER_ID,
      r.reference,
      r.designation,
      r.categorie,
      r.unite,
      null,
      r.fournisseurNom,
      r.fournisseurTel,
      r.fournisseurEmail,
      null,
      r.emplacement,
      r.prixUnitaire,
      cump,
      r.stockAlerte,
      r.fournisseurAdresse,
      r.fournisseurIce,
      null,
      r.fournisseurConditionsPaiement,
      r.fournisseurDelaiLivraisonJours,
      r.fournisseurMoq,
      r.fournisseurDevise,
      r.fournisseurContact || null,
      r.fournisseurNotes || null,
      null
    );

    const lotId = `${PREFIX}LOT-${String(i + 1).padStart(2, '0')}`;
    const mvtId = `${PREFIX}MVT-${String(i + 1).padStart(2, '0')}`;

    insertLot.run(
      lotId,
      r.id,
      r.lotQty,
      r.lotQty,
      r.lotPrix,
      now,
      r.fournisseurNom,
      r.numBain || null,
      null,
      r.variante || null,
      'disponible',
      0
    );

    insertMvt.run(
      mvtId,
      r.id,
      'entree',
      'fournisseur',
      'inventaire',
      r.lotQty,
      r.lotPrix,
      null,
      null,
      null,
      now,
      'Seed BERAMETHODE',
      'Arrivage initial démo (script seed-magasin-demo)',
      lotId,
      r.numBain || null,
      null,
      null
    );
  }
});

run();
console.log(`OK: ${DEMO.length} produits démo + lots + mouvements (owner_id=${OWNER_ID}, prefix=${PREFIX}).`);
