/**
 * Atelier de demo complet et relie (compte guest@local, owner 1), comme une vraie
 * usine de Tanger : 6 chaines de 30 a 50 operateurs, cadences 140 ou 70 pcs/h,
 * 14 modeles (commandes de 3 000, 10 000 ou 20 000 pieces) avec photos reelles,
 * fiche, gamme calee sur la cadence, implantation, chrono, ordres de coupe et
 * traces PLT, planning enchaine, suivi horaire avec pannes, ruptures, defauts et
 * absences, magasin, RH, pointage, parc machines, salle de coupe.
 * Les dates et statuts se calculent depuis le jour du lancement : relancer avant de filmer.
 *
 * Relancer remplace toutes les donnees de l'owner 1.
 * Usage : npx tsx scripts/seed-demo-atelier.ts
 */
import fs from 'fs';
import path from 'path';
import db from '../server/db';

const OWNER = 1;
// Aujourd'hui = le jour ou l'on lance le script : relancer avant de filmer.
const MAINTENANT = new Date();
const AUJOURDHUI = `${MAINTENANT.getFullYear()}-${String(MAINTENANT.getMonth() + 1).padStart(2, '0')}-${String(MAINTENANT.getDate()).padStart(2, '0')}`;
const PHOTOS = path.join(process.cwd(), 'assets', 'demo-modeles');

/* ---------------- Machines (parc de l'owner 1) ---------------- */
const MACHINES: Record<string, { name: string; classe: string; speed: number; cofs: number }> = {
    '1': { name: 'Surjeteuse 5 Fils', classe: '516', speed: 5500, cofs: 1.19 },
    '2': { name: 'Surjeteuse 4 Fils', classe: '514', speed: 6000, cofs: 1.17 },
    '3': { name: 'Surjeteuse 3 Fils', classe: '504', speed: 6000, cofs: 1.15 },
    '4': { name: 'Piqueuse Plate', classe: '301', speed: 4500, cofs: 1.17 },
    '5': { name: 'Piqueuse Double Aig', classe: '316', speed: 3000, cofs: 1.23 },
    '6': { name: 'Colleteuse', classe: '602', speed: 4500, cofs: 1.15 },
    '7': { name: 'Chainette 2 Aig', classe: '402', speed: 4000, cofs: 1.14 },
    '9': { name: 'Pose Bouton', classe: '107', speed: 1800, cofs: 1.17 },
    '10': { name: 'Boutonnière Droite', classe: '304', speed: 2000, cofs: 1.17 },
    '11': { name: 'Brideuse', classe: 'BR', speed: 2200, cofs: 1.18 },
    '13': { name: 'Manuel', classe: 'MAN', speed: 0, cofs: 1.12 },
    '14': { name: 'Repassage', classe: 'FER', speed: 0, cofs: 1.12 },
};
const COMPTEUR = new Set(['9', '10', '11']);

/** Meme formule que Gamme.tsx (point 4 mm, guide 1.1, majoration machine). */
function tempsOperation(machineId: string, L: number, manuel = 0): number {
    const m = MACHINES[machineId];
    if (machineId === '13' || machineId === '14') return manuel * m.cofs;
    let tm: number, tman: number;
    if (COMPTEUR.has(machineId)) { tm = L * 0.0667 * 1.01 * 1.1; tman = 0.18; }
    else { tm = (L * 2.5 / m.speed) * 1.01 * 1.1 + 0.02; tman = Math.max(0.15, L * 0.005); }
    return (tm + tman) * m.cofs;
}

/* ---------------- Patronnage simplifie pour les traces ---------------- */
type Pt = [number, number];
interface Piece { nom: string; n: number; poly: (k: number) => Pt[] }
// Pieces dessinees en cm, taille de base ; le droit-fil suit la longueur (x).
const corps = (lg: number, la: number, emman = 0.22, encol = 0.14): ((k: number) => Pt[]) => k => {
    const L = lg * k, W = la * k, e = W * emman, c = W * encol;
    return [[0, 0], [L, 0], [L, W - c], [L - c * 0.6, W - c * 0.3], [L - c * 1.2, W], [L - c * 1.6, W], [L - c * 1.7, W - e * 0.3], [L - c * 1.7 - e, W - e], [0, W - e]];
};
const manche = (lg: number, haut: number, bas: number): ((k: number) => Pt[]) => k => {
    const L = lg * k, H = haut * k, B = bas * k, m = (H - B) / 2;
    return [[0, m], [L * 0.78, 0], [L * 0.9, H * 0.12], [L, H * 0.5], [L * 0.9, H * 0.88], [L * 0.78, H], [0, m + B]];
};
const rect = (lg: number, la: number): ((k: number) => Pt[]) => k => [[0, 0], [lg * k, 0], [lg * k, la * k], [0, la * k]];
const trap = (lg: number, a: number, b: number): ((k: number) => Pt[]) => k => {
    const A = a * k, B = b * k, L = lg * k;
    return [[0, (A - B) / 2 > 0 ? 0 : (B - A) / 2], [L, A > B ? (A - B) / 2 : 0], [L, A > B ? (A + B) / 2 : B], [0, A > B ? A : (B + A) / 2]];
};
const jambe = (lg: number, haut: number, bas: number, fourche: number): ((k: number) => Pt[]) => k => {
    const L = lg * k, H = haut * k, B = bas * k, F = fourche * k;
    return [[0, (H - B) / 2], [L * 0.72, 0], [L - F, 0], [L, F * 0.4], [L, H], [0, (H + B) / 2]];
};

const PATRONS: Record<string, Piece[]> = {
    chemise: [
        { nom: 'DEVANT', n: 2, poly: corps(76, 32) }, { nom: 'DOS', n: 1, poly: corps(78, 58, 0.2, 0.1) },
        { nom: 'MANCHE', n: 2, poly: manche(62, 46, 26) }, { nom: 'EMPIECEMENT', n: 2, poly: trap(54, 18, 14) },
        { nom: 'COL', n: 2, poly: trap(44, 8, 6) }, { nom: 'PIED COL', n: 2, poly: rect(42, 4) }, { nom: 'POIGNET', n: 2, poly: rect(25, 12) },
    ],
    tshirt: [
        { nom: 'DEVANT', n: 1, poly: corps(70, 52, 0.18, 0.16) }, { nom: 'DOS', n: 1, poly: corps(72, 52, 0.18, 0.08) },
        { nom: 'MANCHE', n: 2, poly: manche(22, 42, 34) },
    ],
    jean: [
        { nom: 'DEVANT', n: 2, poly: jambe(106, 34, 21, 9) }, { nom: 'DOS', n: 2, poly: jambe(108, 39, 23, 13) },
        { nom: 'EMPIECEMENT', n: 2, poly: trap(24, 10, 6) }, { nom: 'CEINTURE', n: 2, poly: rect(50, 8) },
        { nom: 'POCHE AR', n: 2, poly: trap(16, 15, 13) }, { nom: 'GARNITURE', n: 2, poly: rect(20, 16) },
    ],
    sweat: [
        { nom: 'DEVANT', n: 1, poly: corps(64, 58, 0.22, 0.14) }, { nom: 'DOS', n: 1, poly: corps(66, 58, 0.22, 0.08) },
        { nom: 'MANCHE', n: 2, poly: manche(64, 48, 24) }, { nom: 'CAPUCHE', n: 2, poly: trap(38, 34, 26) },
        { nom: 'POCHE', n: 1, poly: trap(24, 38, 30) },
    ],
    robe: [
        { nom: 'DEVANT', n: 1, poly: trap(96, 60, 34) }, { nom: 'DOS', n: 1, poly: trap(98, 60, 34) },
        { nom: 'PAREMENTURE', n: 2, poly: trap(16, 30, 26) },
    ],
    veste: [
        { nom: 'DEVANT', n: 2, poly: corps(74, 34) }, { nom: 'DOS', n: 1, poly: corps(76, 60, 0.2, 0.1) },
        { nom: 'MANCHE', n: 2, poly: manche(64, 48, 28) }, { nom: 'COL', n: 2, poly: trap(46, 9, 7) },
        { nom: 'POCHE', n: 2, poly: rect(18, 16) }, { nom: 'PATTE', n: 2, poly: rect(70, 5) },
    ],
};

const aire = (p: Pt[]) => Math.abs(p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0)) / 2;

/**
 * Trace HPGL d'un placement : pieces de chaque taille rangees en colonnes sur la
 * laize, en-tete Optitex hors matiere. Renvoie aussi longueur et efficience reelles.
 */
function genererTrace(ref: string, patron: string, ratios: Record<string, number>, tailles: string[], laizeCm: number) {
    const mid = (tailles.length - 1) / 2;
    const items: { taille: string; nom: string; poly: Pt[]; w: number; h: number }[] = [];
    for (const [t, r] of Object.entries(ratios)) {
        const k = 1 + 0.03 * (tailles.indexOf(t) - mid);
        for (let rep = 0; rep < r; rep++) for (const p of PATRONS[patron]) for (let i = 0; i < p.n; i++) {
            const poly = p.poly(k);
            items.push({ taille: t, nom: p.nom, poly, w: Math.max(...poly.map(q => q[0])), h: Math.max(...poly.map(q => q[1])) });
        }
    }
    items.sort((a, b) => aire(b.poly) - aire(a.poly));
    // Placement bas-gauche sur une grille de 1 cm : les pieces s'emboitent par leur
    // forme (pas par leur cadre), droites, retournees ou tournees de 180°.
    const H = Math.floor(laizeCm) - 1, Lmax = 4000;
    const occ = new Uint8Array(Lmax * H);
    const raster = (poly: Pt[]) => {
        const w = Math.ceil(Math.max(...poly.map(q => q[0]))) + 1, h = Math.ceil(Math.max(...poly.map(q => q[1]))) + 1;
        const cells: number[] = [];
        for (let cy = 0; cy < h; cy++) {
            const yc = cy + 0.5, xs: number[] = [];
            for (let i = 0; i < poly.length; i++) {
                const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
                if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + (yc - y1) / (y2 - y1) * (x2 - x1));
            }
            xs.sort((a, b) => a - b);
            for (let k = 0; k + 1 < xs.length; k += 2) for (let cx = Math.floor(xs[k] - 0.3); cx <= Math.ceil(xs[k + 1] + 0.3); cx++) if (cx >= 0 && cx < w) cells.push(cx * 1000 + cy);
        }
        return { cells, w, h };
    };
    const places: { it: typeof items[0]; poly: Pt[]; x: number; y: number }[] = [];
    let xFin = 0;
    for (const it of items) {
        const w0 = it.w, h0 = it.h;
        const variantes = [it.poly, it.poly.map(([x, y]) => [x, h0 - y] as Pt), it.poly.map(([x, y]) => [w0 - x, h0 - y] as Pt), it.poly.map(([x, y]) => [w0 - x, y] as Pt)];
        let meilleur: { poly: Pt[]; x: number; y: number; cells: number[] } | null = null;
        for (const poly of variantes) {
            const r = raster(poly);
            trouve: for (let x = 0; x < Lmax - r.w; x++) {
                if (meilleur && x >= meilleur.x) break;
                for (let y = 0; y + r.h <= H; y++) {
                    let libre = true;
                    for (const c of r.cells) { if (occ[(x + Math.floor(c / 1000)) * H + y + (c % 1000)]) { libre = false; break; } }
                    if (libre) { meilleur = { poly, x, y, cells: r.cells }; break trouve; }
                }
            }
        }
        const m = meilleur!;
        for (const c of m.cells) occ[(m.x + Math.floor(c / 1000)) * H + m.y + (c % 1000)] = 1;
        places.push({ it, poly: m.poly, x: m.x, y: m.y + 0.5 });
        xFin = Math.max(xFin, m.x + w0);
    }
    const longueurCm = Math.ceil((xFin + 0.5) * 10) / 10;
    const surface = items.reduce((s, it) => s + aire(it.poly), 0);
    const efficience = Math.round(surface / (longueurCm * laizeCm) * 10000) / 100;
    const U = 400; // unites par cm (40 / mm)
    const e = (v: number) => Math.round(v * U);
    const ETX = '\x03';
    const qte = Object.entries(ratios).map(([t, r]) => `${ref}:${t}/${r}`).join(',');
    const lo = `${Math.floor(longueurCm / 100)}M ${(longueurCm % 100).toFixed(2)}CM`;
    let s = `IN;SP1;DI1,0;SI0.25,0.35;`;
    s += `PU0,${e(-3)};LBMODELE:TAIL/QTE:${qte};${ETX}`;
    s += `PU0,${e(-6)};LBLA=${laizeCm.toFixed(2)}CM LO=${lo} E=${efficience.toFixed(2)}%${ETX}`;
    s += `PU0,0;PD${e(longueurCm)},0,${e(longueurCm)},${e(laizeCm)},0,${e(laizeCm)},0,0;`;
    for (const { it, poly, x, y } of places) {
        const pts = poly.map(([px, py]) => [e(x + px), e(y + py)]);
        s += `PU${pts[0][0]},${pts[0][1]};PD${pts.slice(1).concat([pts[0]]).map(p => p.join(',')).join(',')};`;
        s += `PU${e(x + it.w * 0.3)},${e(y + it.h * 0.45)};LB${it.taille} ${it.nom}${ETX}`;
    }
    s += 'PU0,0;SP0;';
    return { plt: s, longueurM: longueurCm / 100, efficience };
}

PATRONS.polo = [
    { nom: 'DEVANT', n: 1, poly: corps(72, 54, 0.18, 0.16) }, { nom: 'DOS', n: 1, poly: corps(74, 54, 0.18, 0.08) },
    { nom: 'MANCHE', n: 2, poly: manche(24, 44, 36) }, { nom: 'PATTE', n: 2, poly: rect(16, 5) },
];
PATRONS.chino = PATRONS.jean;
PATRONS.blazer = [
    ...PATRONS.veste,
    { nom: 'PAREMENTURE', n: 2, poly: trap(72, 12, 8) }, { nom: 'DESSOUS COL', n: 1, poly: trap(44, 8, 6) },
];
PATRONS.robeDoublee = [...PATRONS.robe, { nom: 'CEINTURE', n: 2, poly: rect(40, 6) }];

/* ---------------- Gammes ---------------- */
type Op = [string, string, number, number?];
const OPS_CHEMISE: Op[] = [
    ['Thermocollage col + poignets', '14', 0, 0.35], ['Surfilage devants', '3', 140], ['Pose patte de boutonnage', '4', 150],
    ['Assemblage empiècement dos', '4', 60], ['Assemblage épaules', '1', 30], ['Surpiqûre épaules', '4', 30],
    ['Piqûre et retournement col', '4', 90], ['Montage pied de col', '4', 45], ['Montage col', '4', 45],
    ['Montage manches', '1', 120], ['Surpiqûre emmanchures', '4', 100], ['Fermeture côtés et manches', '1', 200],
    ['Pose poignets', '4', 50], ['Ourlet bas', '4', 110], ['Boutonnières', '10', 9], ['Pose boutons', '9', 9],
    ['Contrôle et coupe fils', '13', 0, 0.9], ['Repassage final', '14', 0, 1.4], ['Pliage et ensachage', '13', 0, 0.8],
];
const OPS_POLO: Op[] = [
    ['Assemblage épaules', '2', 30], ['Pose patte polo', '4', 40], ['Surpiqûre patte', '4', 30], ['Montage col tricot', '2', 50],
    ['Recouvrement col', '7', 50], ['Montage manches', '2', 90], ['Fermeture côtés', '2', 140], ['Pose bord-côte manches', '2', 60],
    ['Fentes côtés', '4', 30], ['Ourlet bas', '7', 100], ['Boutonnières patte', '10', 2], ['Pose boutons', '9', 2], ['Pose étiquette', '4', 6],
    ['Contrôle et coupe fils', '13', 0, 0.6], ['Repassage', '14', 0, 0.7], ['Pliage et ensachage', '13', 0, 0.5],
];
const OPS_JEAN: Op[] = [
    ['Surfilage devants et dos', '3', 220], ['Pose poches arrière', '5', 70], ['Assemblage empiècement dos', '5', 50],
    ['Montage poches devant', '4', 60], ['Pose braguette fermeture', '4', 40], ['Surpiqûre braguette', '4', 25],
    ['Assemblage fourche dos', '5', 35], ['Fermeture entrejambe', '1', 150], ['Fermeture côtés', '1', 220],
    ['Montage ceinture', '7', 100], ['Pose passants', '11', 7], ['Ourlet bas', '4', 80], ['Brides poches', '11', 6],
    ['Boutonnière ceinture', '10', 1], ['Pose rivets et bouton', '13', 0, 0.6], ['Contrôle et coupe fils', '13', 0, 1.1],
    ['Repassage', '14', 0, 1.2], ['Étiquetage et pliage', '13', 0, 0.7],
];
const OPS_CHINO: Op[] = OPS_JEAN.filter(o => !o[0].startsWith('Pose rivets')).map(o => (o[0] === 'Pose poches arrière' ? ['Poches arrière passepoilées', '4', 90] : o) as Op)
    .concat([['Pose bouton ceinture', '9', 1]]);
const OPS_SWEAT: Op[] = [
    ['Assemblage capuche', '2', 40], ['Pose poche kangourou', '4', 90], ['Assemblage épaules', '2', 30],
    ['Montage capuche', '2', 60], ['Recouvrement capuche', '7', 60], ['Montage manches', '2', 110],
    ['Fermeture côtés et manches', '2', 200], ['Pose bord-côte poignets', '2', 40], ['Pose bord-côte bas', '2', 100],
    ['Œillets cordon', '9', 2], ['Passage cordon', '13', 0, 0.4], ['Contrôle et coupe fils', '13', 0, 0.8], ['Pliage et ensachage', '13', 0, 0.6],
];
const OPS_VESTE: Op[] = [
    ['Thermocollage devants et col', '14', 0, 0.6], ['Surfilage pièces', '3', 320], ['Pose poches poitrine', '5', 70],
    ['Assemblage épaules', '1', 32], ['Surpiqûre épaules', '5', 32], ['Montage col', '4', 50], ['Pose pattes devant', '4', 150],
    ['Montage manches', '1', 125], ['Surpiqûre emmanchures', '5', 100], ['Fermeture côtés', '1', 210], ['Ourlet manches', '4', 60],
    ['Ourlet bas', '4', 120], ['Boutonnières', '10', 7], ['Pose boutons', '9', 7], ['Contrôle et coupe fils', '13', 0, 1],
    ['Repassage final', '14', 0, 1.8], ['Pliage et ensachage', '13', 0, 0.8],
];
const OPS_BLAZER: Op[] = [
    ['Thermocollage devants, col et parementures', '14', 0, 1.2], ['Pinces devant', '4', 60], ['Poches passepoilées (x2)', '4', 120],
    ['Poche poitrine', '4', 50], ['Assemblage dos milieu', '4', 75], ['Assemblage épaules', '4', 32], ['Montage dessous de col', '4', 45],
    ['Montage col tailleur', '4', 90], ['Pose parementures', '4', 160], ['Assemblage manches (coude)', '4', 120],
    ['Fente manches', '4', 40], ['Montage manches', '4', 110], ['Pose épaulettes', '13', 0, 1.4], ['Montage doublure corps', '4', 260],
    ['Montage doublure manches', '4', 130], ['Assemblage doublure / vêtement', '4', 220], ['Ourlet manches', '8', 60], ['Ourlet bas', '8', 120],
    ['Boutonnières', '10', 6], ['Pose boutons', '9', 6], ['Contrôle et coupe fils', '13', 0, 2.2], ['Repassage sous presse', '14', 0, 4.5],
    ['Mise sur cintre et housse', '13', 0, 1.2],
];
const OPS_ROBE_DOUBLEE: Op[] = [
    ['Surfilage pièces', '3', 300], ['Pinces devant et dos', '4', 80], ['Assemblage épaules', '4', 25], ['Fermeture côtés', '4', 190],
    ['Pose fermeture invisible', '4', 55], ['Montage doublure', '4', 380], ['Assemblage doublure / robe encolure', '4', 90],
    ['Assemblage doublure emmanchures', '4', 90], ['Montage ceinture', '4', 80], ['Ourlet robe', '8', 140], ['Ourlet doublure', '4', 130],
    ['Contrôle et coupe fils', '13', 0, 1], ['Repassage final', '14', 0, 2], ['Mise sur cintre', '13', 0, 0.5],
];

/** Ajuste longueurs et temps manuels pour que la gamme fasse le temps cible (cadence de la chaine). */
function ajusterGamme(ops: Op[], cible: number): Op[] {
    const total = (o: Op[]) => o.reduce((s, [, m, L, man]) => s + tempsOperation(m, L, man ?? 0), 0);
    let k = 1, out = ops;
    for (let i = 0; i < 8; i++) {
        k *= cible / total(out);
        out = ops.map(([d, m, L, man]) => [d, m, COMPTEUR.has(m) ? Math.max(1, Math.round(L * k)) : Math.round(L * k), man !== undefined ? Math.round(man * k * 100) / 100 : undefined] as Op);
    }
    return out;
}

/* ---------------- Atelier : 6 chaines ---------------- */
// Cadence en pieces par heure ; le temps des gammes en decoule (operateurs x 60 x 85 % / cadence).
const CHAINES = [
    { id: 'CHAINE 1', effectif: 45, cadence: 140 }, { id: 'CHAINE 2', effectif: 38, cadence: 140 }, { id: 'CHAINE 3', effectif: 32, cadence: 140 },
    { id: 'CHAINE 4', effectif: 50, cadence: 70 }, { id: 'CHAINE 5', effectif: 30, cadence: 70 }, { id: 'CHAINE 6', effectif: 42, cadence: 140 },
];
const samChaine = (c: string) => { const x = CHAINES.find(y => y.id === c)!; return x.effectif * 60 * 0.85 / x.cadence; };

interface Def {
    id: string; ref: string; nom: string; categorie: string; client: string; marche: 'Export' | 'Local'; patron: string;
    tissu: string; laize: number; prixTissu: number; tailles: string[]; ratios: number[]; couleurs: [string, string, number][];
    qte: number; maxPlis: number; ops: Op[]; fournitures: [string, number, number, string][]; chaine: string;
    pedido: string; observations: string; prixFacon: number;
    lancement?: string; dds?: string; coef?: number; pannes?: number; absence?: number; defauts?: number;
    ruptures?: string[]; tissuRecuPart?: number; fournRecuPart?: number; bloque?: string;
}
const S4 = ['S', 'M', 'L', 'XL'], R4 = [1, 2, 2, 1];
const S5 = ['36', '38', '40', '42', '44'], R5 = [1, 2, 2, 2, 1];
const F_CHEMISE: [string, number, number, string][] = [['Thermocollant col', 12, 0.2, 'm'], ['Bouton nacre 11 mm', 0.35, 9, 'pc'], ['Fil polyester 120', 18, 0.03, 'cone'], ['Étiquette tissée', 0.6, 1, 'pc']];
const F_JEAN: [string, number, number, string][] = [['Fermeture métal 18 cm', 1.8, 1, 'pc'], ['Bouton jean 17 mm', 0.9, 1, 'pc'], ['Rivets cuivre', 0.15, 6, 'pc'], ['Toile de poche', 14, 0.25, 'm'], ['Fil polyester 40 ocre', 22, 0.05, 'cone']];

const DEFS: Def[] = [
    // CHAINE 1 — jeans, 45 operateurs, 140 pcs/h
    { id: '1792481201101', ref: 'JN-118', nom: 'JN-118 Jean slim stretch', categorie: 'Pantalon', client: 'Zara', marche: 'Export', patron: 'jean',
        tissu: 'Denim stretch 10 oz', laize: 150, prixTissu: 44, tailles: S5, ratios: R5, couleurs: [['#1e3a8a', 'Indigo', 0.6], ['#111827', 'Noir délavé', 0.4]],
        qte: 20000, maxPlis: 60, ops: OPS_JEAN, fournitures: F_JEAN, chaine: 'CHAINE 1', pedido: 'PO-ZR-4581207', observations: 'Lavage stone, surpiqûres ton sur ton.', prixFacon: 34, lancement: '2026-10-01' },
    { id: '1792481200101', ref: 'JN-305', nom: 'JN-305 Jean 5 poches regular', categorie: 'Pantalon', client: 'Bershka', marche: 'Export', patron: 'jean',
        tissu: 'Denim stretch 11 oz', laize: 150, prixTissu: 46, tailles: S5, ratios: R5, couleurs: [['#1e3a8a', 'Indigo brut', 0.6], ['#60a5fa', 'Bleu délavé', 0.4]],
        qte: 10000, maxPlis: 60, ops: OPS_JEAN, fournitures: F_JEAN, chaine: 'CHAINE 1', pedido: 'PO-BSK-7730194', observations: 'Surpiqûres fil ocre double, lavage au retour.', prixFacon: 33 },
    { id: '1792481201102', ref: 'JN-422', nom: 'JN-422 Jean droit brut', categorie: 'Pantalon', client: 'Zintura', marche: 'Export', patron: 'jean',
        tissu: 'Denim rigide 13 oz', laize: 152, prixTissu: 49, tailles: S5, ratios: R5, couleurs: [['#172554', 'Brut', 1]],
        qte: 3000, maxPlis: 50, ops: OPS_JEAN, fournitures: F_JEAN, chaine: 'CHAINE 1', pedido: 'ZT-26-0388', observations: 'Lisière visible, rivets cuivre.', prixFacon: 36,
        bloque: 'Tissu non reçu : retard fournisseur (arrivée annoncée le 10/11)' },
    // CHAINE 2 — chemises, 38 operateurs, 140 pcs/h
    { id: '1792390644677', ref: 'CH-204', nom: 'CH-204 Chemise Oxford', categorie: 'Chemise', client: 'Zara', marche: 'Export', patron: 'chemise',
        tissu: 'Oxford coton gris chiné', laize: 148, prixTissu: 34, tailles: S4, ratios: R4, couleurs: [['#9ca3af', 'Gris chiné', 0.6], ['#bfdbfe', 'Bleu ciel', 0.4]],
        qte: 10000, maxPlis: 70, ops: OPS_CHEMISE, fournitures: F_CHEMISE, chaine: 'CHAINE 2', pedido: 'PO-ZR-4579931', observations: 'Col boutonné, 9 boutons nacre 11 mm.', prixFacon: 21, lancement: '2026-10-13' },
    { id: '1792481200404', ref: 'CL-140', nom: 'CL-140 Chemise lin col mao', categorie: 'Chemise', client: 'Stradivarius', marche: 'Export', patron: 'chemise',
        tissu: 'Lin lavé 160 g', laize: 140, prixTissu: 58, tailles: S4, ratios: R4, couleurs: [['#f5f0e6', 'Écru', 0.55], ['#d6c7a1', 'Sable', 0.45]],
        qte: 20000, maxPlis: 70, ops: OPS_CHEMISE.filter(o => !o[0].startsWith('Piqûre et retournement col')), fournitures: [['Thermocollant pied de col', 12, 0.1, 'm'], ['Bouton coco 10 mm', 0.5, 7, 'pc'], ['Fil polyester 120', 18, 0.03, 'cone'], ['Étiquette tissée', 0.6, 1, 'pc']],
        chaine: 'CHAINE 2', pedido: 'PO-STR-2264018', observations: 'Col mao, patte cachée. Lin : coupe au fil, laize irrégulière.', prixFacon: 23,
        ruptures: ['2026-10-30', '2026-10-31'], tissuRecuPart: 0.62 },
    { id: '1792481200707', ref: 'CM-220', nom: 'CM-220 Chemisette imprimée', categorie: 'Chemise', client: 'Zintura', marche: 'Export', patron: 'chemise',
        tissu: 'Popeline imprimée 120 g', laize: 145, prixTissu: 31, tailles: S4, ratios: R4, couleurs: [['#9ca3af', 'Gris fleuri', 0.5], ['#5eead4', 'Menthe fleurie', 0.5]],
        qte: 3000, maxPlis: 80, ops: OPS_CHEMISE.filter(o => !o[0].startsWith('Pose poignets')), fournitures: [['Thermocollant col', 12, 0.18, 'm'], ['Bouton résine 11 mm', 0.25, 7, 'pc'], ['Fil polyester 120', 18, 0.03, 'cone'], ['Étiquette tissée', 0.6, 1, 'pc']],
        chaine: 'CHAINE 2', pedido: 'ZT-26-0402', observations: 'Manches courtes, col cubain.', prixFacon: 18 },
    // CHAINE 3 — polos, 32 operateurs, 140 pcs/h
    { id: '1792481201301', ref: 'PL-220', nom: 'PL-220 Polo piqué', categorie: 'Polo', client: 'Pull&Bear', marche: 'Export', patron: 'polo',
        tissu: 'Piqué coton 200 g', laize: 180, prixTissu: 36, tailles: S4, ratios: R4, couleurs: [['#7f1d1d', 'Bordeaux', 0.35], ['#14532d', 'Vert bouteille', 0.35], ['#78716c', 'Taupe', 0.3]],
        qte: 10000, maxPlis: 90, ops: OPS_POLO, fournitures: [['Col tricot polo', 2.4, 1, 'pc'], ['Bouton résine 11 mm', 0.25, 3, 'pc'], ['Fil polyester 120', 18, 0.02, 'cone'], ['Étiquette tissée', 0.6, 1, 'pc']],
        chaine: 'CHAINE 3', pedido: 'PO-PB-5520771', observations: 'Patte 3 boutons, fentes côtés.', prixFacon: 14, lancement: '2026-10-14' },
    { id: '1792481201302', ref: 'PL-310', nom: 'PL-310 Polo manches longues', categorie: 'Polo', client: 'Zara', marche: 'Export', patron: 'polo',
        tissu: 'Piqué coton 220 g', laize: 180, prixTissu: 39, tailles: S4, ratios: R4, couleurs: [['#1e3a8a', 'Marine', 0.6], ['#f8fafc', 'Blanc', 0.4]],
        qte: 20000, maxPlis: 90, ops: OPS_POLO, fournitures: [['Col tricot polo', 2.4, 1, 'pc'], ['Bouton résine 11 mm', 0.25, 3, 'pc'], ['Fil polyester 120', 18, 0.02, 'cone'], ['Étiquette tissée', 0.6, 1, 'pc']],
        chaine: 'CHAINE 3', pedido: 'PO-ZR-4590412', observations: 'Bord-côte poignets, col tricot rayé.', prixFacon: 16,
        dds: '2026-11-14', coef: 0.8, pannes: 0.05, defauts: 0.04 },
    // CHAINE 4 — vestes, 50 operateurs, 70 pcs/h
    { id: '1792481200606', ref: 'VS-150', nom: 'VS-150 Surchemise sergé coton', categorie: 'Veste', client: 'Zintura', marche: 'Export', patron: 'veste',
        tissu: 'Sergé coton 280 g', laize: 150, prixTissu: 49, tailles: S4, ratios: R4, couleurs: [['#c8b18b', 'Beige', 1]],
        qte: 3000, maxPlis: 60, ops: OPS_VESTE, fournitures: [['Thermocollant devant', 14, 0.45, 'm'], ['Bouton corozo 18 mm', 0.8, 7, 'pc'], ['Fil polyester 40', 22, 0.04, 'cone']],
        chaine: 'CHAINE 4', pedido: 'ZT-26-0351', observations: 'Deux poches poitrine à rabat.', prixFacon: 38, lancement: '2026-10-12' },
    { id: '1792481201401', ref: 'BL-510', nom: 'BL-510 Blazer doublé', categorie: 'Veste', client: 'Zara', marche: 'Export', patron: 'blazer',
        tissu: 'Toile laine mélangée 260 g', laize: 150, prixTissu: 78, tailles: ['36', '38', '40', '42'], ratios: R4, couleurs: [['#a3b18a', 'Vert sauge', 0.5], ['#1f2937', 'Anthracite', 0.5]],
        qte: 20000, maxPlis: 50, ops: OPS_BLAZER, fournitures: [['Doublure viscose', 26, 1.1, 'm'], ['Thermocollant devant', 14, 0.6, 'm'], ['Épaulettes', 1.6, 2, 'pc'], ['Bouton corozo 18 mm', 0.8, 5, 'pc'], ['Fil polyester 120', 18, 0.05, 'cone']],
        chaine: 'CHAINE 4', pedido: 'PO-ZR-4586650', observations: 'Col tailleur, 2 poches passepoilées, doublure complète.', prixFacon: 85,
        fournRecuPart: 0.3 },
    // CHAINE 5 — robes doublees, 30 operateurs, 70 pcs/h
    { id: '1792481200505', ref: 'RB-412', nom: "RB-412 Robe d'été voile coton", categorie: 'Robe', client: 'Bershka', marche: 'Export', patron: 'robeDoublee',
        tissu: 'Voile de coton 90 g', laize: 145, prixTissu: 38, tailles: ['34', '36', '38', '40', '42'], ratios: R5, couleurs: [['#ffffff', 'Blanc', 1]],
        qte: 10000, maxPlis: 80, ops: OPS_ROBE_DOUBLEE, fournitures: [['Doublure coton', 18, 1.0, 'm'], ['Fermeture invisible 50 cm', 2.2, 1, 'pc'], ['Fil polyester 120', 18, 0.03, 'cone']],
        chaine: 'CHAINE 5', pedido: 'PO-BSK-7712250', observations: 'Doublée, ourlet 3 cm, ceinture à nouer.', prixFacon: 44, lancement: '2026-10-05', dds: '2026-10-24', coef: 0.88 },
    { id: '1792481201501', ref: 'RB-560', nom: 'RB-560 Robe midi doublée', categorie: 'Robe', client: 'Stradivarius', marche: 'Export', patron: 'robeDoublee',
        tissu: 'Crêpe viscose 140 g', laize: 145, prixTissu: 42, tailles: ['34', '36', '38', '40', '42'], ratios: R5, couleurs: [['#111827', 'Noir', 1]],
        qte: 3000, maxPlis: 80, ops: OPS_ROBE_DOUBLEE, fournitures: [['Doublure viscose', 26, 1.0, 'm'], ['Fermeture invisible 50 cm', 2.2, 1, 'pc'], ['Fil polyester 120', 18, 0.03, 'cone']],
        chaine: 'CHAINE 5', pedido: 'PO-STR-2271134', observations: 'Manches chauve-souris, taille élastiquée.', prixFacon: 46, absence: 0.1 },
    // CHAINE 6 — chinos, 42 operateurs, 140 pcs/h
    { id: '1792481201601', ref: 'PT-118', nom: 'PT-118 Chino coton stretch', categorie: 'Pantalon', client: 'Pull&Bear', marche: 'Export', patron: 'chino',
        tissu: 'Gabardine coton stretch 240 g', laize: 148, prixTissu: 41, tailles: S5, ratios: R5, couleurs: [['#7c2d12', 'Brique', 0.35], ['#a16207', 'Camel', 0.35], ['#e7e5e4', 'Pierre', 0.3]],
        qte: 20000, maxPlis: 60, ops: OPS_CHINO, fournitures: [['Fermeture métal 18 cm', 1.8, 1, 'pc'], ['Bouton résine 11 mm', 0.25, 1, 'pc'], ['Toile de poche', 14, 0.25, 'm'], ['Fil polyester 120', 18, 0.04, 'cone']],
        chaine: 'CHAINE 6', pedido: 'PO-PB-5514090', observations: 'Poches arrière passepoilées, ourlet 4 cm.', prixFacon: 30,
        lancement: '2026-10-05', dds: '2026-10-30', coef: 0.76, pannes: 0.03 },
    { id: '1792481200303', ref: 'SW-310', nom: 'SW-310 Sweat capuche molleton', categorie: 'Sweat', client: 'Zintura', marche: 'Export', patron: 'sweat',
        tissu: 'Molleton gratté 300 g', laize: 180, prixTissu: 52, tailles: S4, ratios: R4, couleurs: [['#b08968', 'Camel', 0.6], ['#ede0d4', 'Écru', 0.4]],
        qte: 3000, maxPlis: 60, ops: OPS_SWEAT, fournitures: [['Bord-côte 2x2', 34, 0.12, 'm'], ['Cordon coton', 1.2, 1, 'pc'], ['Œillets métal', 0.2, 2, 'pc'], ['Fil polyester 120', 18, 0.03, 'cone']],
        chaine: 'CHAINE 6', pedido: 'ZT-26-0415', observations: 'Capuche doublée même tissu, poche kangourou.', prixFacon: 24 },
];

/* ---------------- Outils ---------------- */
let graine = 20261102;
const alea = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
const autour = (v: number, pct: number) => v * (1 + (alea() * 2 - 1) * pct);
const r2 = (v: number) => Math.round(v * 100) / 100;
const jour = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ouvrable = (iso: string) => { const j = new Date(iso + 'T12:00:00Z').getUTCDay(); return j >= 1 && j <= 5; };
const ouvrableSuivant = (iso: string) => { let x = jour(iso, 1); while (!ouvrable(x)) x = jour(x, 1); return x; };
const ajouterOuvrables = (depart: string, n: number) => { let x = depart; while (n > 0) { x = jour(x, 1); if (ouvrable(x)) n--; } return x; };
const HEURES = ['h0800', 'h0900', 'h1000', 'h1100', 'h1300', 'h1400', 'h1500', 'h1600', 'h1700'];
const COULEURS_POSTES = ['indigo', 'orange', 'emerald', 'rose', 'cyan', 'amber', 'violet', 'sky'];
const photo = (ref: string) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(PHOTOS, ref + '.jpg')).toString('base64');
/** Photo reelle de la matiere (assets/demo-matieres, Pexels) d'apres sa designation. */
const photoMatiere = (des: string): string | null => {
    const n = des.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const regles: [RegExp, string][] = [[/denim/, 'denim'], [/jersey|pique/, 'jersey'], [/molleton/, 'molleton'], [/lin lave/, 'lin'], [/oxford/, 'oxford'], [/voile|crepe/, 'voile'],
        [/serge|gabardine|laine/, 'serge'], [/imprime/, 'imprime'], [/doublure/, 'voile'], [/bouton jean/, 'bouton-jean'], [/bouton (coco|corozo)/, 'bouton-bois'], [/bouton/, 'boutons'], [/rivet/, 'rivets'],
        [/fermeture invisible/, 'fermeture-invisible'], [/fermeture/, 'fermeture'], [/fil .*(40|ocre)/, 'fil-ocre'], [/^fil/, 'fil'], [/etiquette/, 'etiquette'],
        [/bord-cote 2x2|col tricot/, 'bord-cote-2x2'], [/bord-cote/, 'bord-cote'], [/cordon/, 'cordon'], [/oeillet|œillet|epaulette/, 'oeillets'], [/biais/, 'biais'],
        [/thermocollant/, 'thermocollant'], [/toile de poche/, 'toile-poche']];
    const r = regles.find(([re]) => re.test(n));
    if (!r) return null;
    const f = path.join(process.cwd(), 'assets', 'demo-matieres', r[1] + '.jpg');
    return fs.existsSync(f) ? 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64') : null;
};
const POSTE_CLASSE: Record<string, string> = { '301': 'Piqueuse plate', '316': 'Double aiguille', '516': 'Surjeteuse 5 fils', '514': 'Surjeteuse 4 fils', '504': 'Surjeteuse 3 fils',
    '402': 'Point de chaînette', '602': 'Colleteuse', '101': 'Point invisible', '107': 'Pose bouton', '304': 'Boutonnière', BR: 'Brideuse', MAN: 'Finition main', FER: 'Repassage' };
MACHINES['8'] = { name: 'Point Invisible', classe: '101', speed: 2500, cofs: 1.19 };

/* ---------------- Salle de coupe ---------------- */
const OUVRIERS_COUPE = ['Abdelilah Sbai', 'Mustapha Ouazzani', 'Rachid Lamrani', 'Youssef Haddou', 'Said Bouziane', 'Karim Fassi',
    'Hassan Aloui', 'Jamal Tazi', 'Noureddine Kabbaj', 'Adil Moussaoui', 'Brahim Chentouf', 'Ayoub Raissouni', 'Hamza Bekkali', 'Anouar Temsamani',
    'Zakaria Akhrif', 'Mohcine Lahlou'].map((nom, i) => ({ id: `oc-${i + 1}`, nom }));
const GROUPES_COUPE = [
    { id: 'gc-a', nom: 'Groupe A — Matelassage', membres: ['oc-1', 'oc-2', 'oc-3', 'oc-4', 'oc-13'] },
    { id: 'gc-b', nom: 'Groupe B — Coupe', membres: ['oc-5', 'oc-6', 'oc-7', 'oc-8', 'oc-14'] },
    { id: 'gc-c', nom: 'Groupe C — Numérotage', membres: ['oc-9', 'oc-10', 'oc-11', 'oc-12', 'oc-15', 'oc-16'] },
];

/* ---------------- Ouvriers (RH) ---------------- */
const PRENOMS_F = ['Fatima', 'Khadija', 'Salma', 'Nadia', 'Imane', 'Aicha', 'Yasmine', 'Lamiae', 'Zineb', 'Ilham', 'Soukaina', 'Meryem', 'Loubna', 'Hajar',
    'Kaoutar', 'Nouhaila', 'Chaimae', 'Laila', 'Ibtissam', 'Siham', 'Mouna', 'Amina', 'Samira', 'Houda', 'Sanae', 'Hanane', 'Wafae', 'Rajae', 'Naima', 'Asmae', 'Ikram', 'Btissam'];
const PRENOMS_H = ['Yassine', 'Omar', 'Mehdi', 'Anas', 'Hicham', 'Rachid', 'Hamza', 'Bilal', 'Amine', 'Sofiane', 'Driss', 'Khalid', 'Samir', 'Nabil', 'Tarik',
    'Othmane', 'Adil', 'Jawad', 'Reda', 'Younes', 'Ayoub', 'Issam', 'Marouane', 'Brahim', 'Hakim', 'Zakaria', 'Mustapha', 'Hamid'];
const NOMS = ['Alami', 'Benali', 'Idrissi', 'Fassi', 'Tazi', 'Cherkaoui', 'Bennani', 'Lahlou', 'Mouradi', 'Zerouali', 'Bensaid', 'Amrani', 'Kettani', 'Rahmouni',
    'Sebti', 'Nasri', 'Filali', 'Berrada', 'Senhaji', 'Haouari', 'Jabri', 'Ouazzani', 'Tahiri', 'El Mansouri', 'Chraibi', 'Bouazza', 'Slaoui', 'Dahbi', 'Temsamani',
    'Akhrif', 'Bekkali', 'Ziani', 'El Khayati', 'Aouad', 'Riffi', 'Boukhriss', 'Ghailan', 'Achahbar', 'Bouhaddou', 'Ouahabi'];
const QUARTIERS = ['Bni Makada', 'Mesnana', 'Branes', 'Boukhalef', 'Charf', 'Dradeb', 'Mghogha', 'Aouama', 'Souani', 'Beni Said'];
const LIGNES = [['L1', 'Bni Makada', 'Abdelkader Amrani', '0661 48 22 17', '35721-A-40', 22], ['L2', 'Mesnana', 'Hamid Ziani', '0662 91 05 63', '40218-B-40', 20],
    ['L3', 'Branes', 'Mohamed Aouad', '0670 33 18 92', '28954-A-40', 18], ['L4', 'Boukhalef', 'Lahcen Idrissi', '0655 72 40 11', '51307-D-40', 22],
    ['L5', 'Charf', 'Driss Benali', '0668 15 87 30', '19846-B-40', 18], ['L6', 'Mghogha', 'Said El Khayati', '0663 20 74 58', '33610-A-40', 22]] as const;

/* ---------------- Simulation ---------------- */
interface Sim {
    d: Def; quantite: number; grid: Record<string, number>; sommeRatio: number; ratios: Record<string, number>;
    gamme: any[]; totalTemps: number; postes: any[]; assignments: Record<string, string[]>;
    lancement: string; finJour: string; statut: 'DONE' | 'IN_PROGRESS' | 'READY'; produit: number;
    jours: { date: string; sorties: Record<string, number>; downtimes: Record<string, string>; defauts: any[]; absent: number; total: number }[];
}
const sims: Sim[] = [];
for (const c of CHAINES) {
    let prochain: string | null = null;
    for (const d of DEFS.filter(x => x.chaine === c.id)) {
        const sommeRatio = d.ratios.reduce((a, b) => a + b, 0);
        const ratios = Object.fromEntries(d.tailles.map((t, i) => [t, d.ratios[i]]));
        const plis = d.couleurs.map(([, , part]) => Math.round(d.qte * part / sommeRatio));
        d.couleurs.forEach((col, i) => { col[2] = plis[i]; });
        const quantite = plis.reduce((s, p) => s + p * sommeRatio, 0);
        const grid: Record<string, number> = {};
        d.couleurs.forEach(([hex, , p]) => d.tailles.forEach((t, i) => { grid[`${hex}_${i}`] = p * d.ratios[i]; }));

        const ops = ajusterGamme(d.ops, samChaine(c.id));
        const gamme = ops.map(([desc, mid, L, man], i) => ({
            id: `${d.id}${String(i + 1).padStart(2, '0')}`, order: i + 1, description: desc, machineId: mid, machineName: MACHINES[mid].classe,
            length: L, manualTime: man ?? 0, time: tempsOperation(mid, L, man ?? 0), guideFactor: 1.1,
        }));
        const totalTemps = r2(gamme.reduce((s, o) => s + o.time, 0));
        // Implantation : un poste par operateur, reparti selon la charge de chaque operation.
        const cycle = totalTemps / c.effectif;
        const nb = gamme.map(op => Math.max(1, Math.floor(op.time / cycle)));
        while (nb.reduce((a, b) => a + b, 0) < c.effectif) {
            let i = 0;
            gamme.forEach((op, j) => { if (op.time / nb[j] > gamme[i].time / nb[i]) i = j; });
            nb[i]++;
        }
        const postes: any[] = [], assignments: Record<string, string[]> = {};
        let np = 0;
        for (const [io, op] of gamme.entries()) {
            const ids: string[] = [];
            for (let k = 0; k < nb[io]; k++) {
                np++;
                postes.push({ id: `P${np}`, name: nb[io] > 1 ? `P${op.order}.${k + 1}` : `P${op.order}`, machine: op.machineName, colorName: COULEURS_POSTES[op.order % COULEURS_POSTES.length], originalId: `OP${op.order}` });
                ids.push(`P${np}`);
            }
            assignments[op.id] = ids;
        }

        const lancement = d.lancement ?? prochain!;
        const jours: Sim['jours'] = [];
        let produit = 0, jn = 0;
        // Courbe d'apprentissage : courte quand la chaine garde la meme famille de vetement.
        const memeFamille = sims.some(x => x.d.chaine === c.id && x.d.patron === d.patron);
        const rampe = memeFamille ? [0.72, 0.86, 0.92] : [0.5, 0.7, 0.84, 0.9];
        if (!d.bloque) for (let date = lancement; date <= AUJOURDHUI && produit < quantite; date = jour(date, 1)) {
            if (!ouvrable(date)) continue;
            const lundi = new Date(date + 'T12:00:00Z').getUTCDay() === 1;
            const absent = Math.round(c.effectif * (d.absence ?? 0.03) * (lundi ? 1.6 : 1) * autour(1, 0.5));
            const presents = c.effectif - absent;
            const coef = Math.min(rampe[jn] ?? 1, d.coef ?? 0.95) * autour(1, 0.04);
            const heures = date === AUJOURDHUI ? HEURES.filter(h => Number(h.slice(1, 3)) < MAINTENANT.getHours()) : HEURES;
            const sorties: Record<string, number> = {}, downtimes: Record<string, string> = {}, defauts: any[] = [];
            let total = 0;
            for (const h of heures) {
                if ((d.ruptures || []).includes(date) && h >= 'h1300') { sorties[h] = 0; downtimes[h] = 'S'; continue; }
                if (alea() < (d.pannes ?? 0.012)) { sorties[h] = 0; downtimes[h] = 'M'; continue; }
                let v = Math.round(c.cadence * coef * presents / c.effectif * (h === 'h0800' ? 0.85 : h === 'h1700' ? 0.9 : 1) * autour(1, 0.07));
                v = Math.max(0, Math.min(v, quantite - produit - total));
                sorties[h] = v;
                total += v;
                const taux = d.defauts ?? 0.012;
                if (v > 0 && alea() < 0.45) {
                    const q = Math.max(1, Math.round(v * taux * autour(1, 0.6)));
                    defauts.push({ id: `df_${h}_${date}`, hour: h, type: ['Couture', 'Point sauté', 'Tension fil', 'Tache', 'Mesure hors tolérance'][Math.floor(alea() * 5)], quantity: q, notes: '' });
                }
                if (produit + total >= quantite) break;
            }
            if (!heures.length) break;
            produit += total;
            jours.push({ date, sorties, downtimes, defauts, absent, total });
            jn++;
        }
        let statut: Sim['statut'], finJour: string;
        const rythme = jours.slice(-4, -1).reduce((a, j) => a + j.total, 0) / Math.max(1, jours.slice(-4, -1).length);
        if (produit >= quantite) { statut = 'DONE'; finJour = jours[jours.length - 1].date; }
        else if (jours.length) { statut = 'IN_PROGRESS'; finJour = ajouterOuvrables(AUJOURDHUI, Math.ceil((quantite - produit) / Math.max(rythme, c.cadence * 9 * (d.coef ?? 0.95) * 0.93))); }
        else { statut = 'READY'; finJour = ajouterOuvrables(lancement, Math.ceil(quantite / (c.cadence * 9 * 0.85)) + 1); }
        prochain = ouvrableSuivant(finJour);
        sims.push({ d, quantite, grid, sommeRatio, ratios, gamme, totalTemps, postes, assignments, lancement, finJour, statut, produit, jours });
    }
}

/* ---------------- Ecriture ---------------- */
const tx = db.transaction(() => {
    db.prepare('DELETE FROM suivi_data WHERE owner_id = ?').run(OWNER);
    db.prepare('DELETE FROM poste_suivi WHERE owner_id = ?').run(OWNER);
    db.prepare('DELETE FROM planning_events WHERE owner_id = ?').run(OWNER);
    db.prepare('DELETE FROM models WHERE owner_id = ?').run(OWNER);
    db.prepare('DELETE FROM magasin_mouvements WHERE productId IN (SELECT id FROM magasin_products WHERE owner_id = ?)').run(OWNER);
    db.prepare('DELETE FROM magasin_lots WHERE productId IN (SELECT id FROM magasin_products WHERE owner_id = ?)').run(OWNER);
    db.prepare('DELETE FROM magasin_products WHERE owner_id = ?').run(OWNER);
    db.prepare('DELETE FROM hr_pointage WHERE worker_id IN (SELECT id FROM hr_workers WHERE owner_id = ?)').run(OWNER);
    db.prepare('DELETE FROM hr_workers WHERE owner_id = ?').run(OWNER);
    db.prepare('DELETE FROM hr_transport_lignes WHERE owner_id = ?').run(OWNER);

    const insModel = db.prepare('INSERT INTO models (id, user_id, owner_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    const insPlan = db.prepare(`INSERT INTO planning_events (id, owner_id, modelId, chaineId, dateLancement, dateExport, qteTotal, qteProduite, status, blockedReason,
        strictDeadline_DDS, clientName, estimatedEndDate, modelName, raw_data, cr_value, cr_status, accumulated_deficit) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insSuivi = db.prepare(`INSERT INTO suivi_data (id, owner_id, planningId, modelId, chaineId, date, entrer, sorties_json, totalHeure, pJournaliere,
        enCour, resteEntrer, resteSortie, totalWorkers, absent, source, raw_data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insProd = db.prepare(`INSERT INTO magasin_products (id, owner_id, reference, designation, categorie, unite, fournisseurNom, fournisseurTel,
        emplacement, prixUnitaire, cump, stockAlerte, fournisseurDelaiLivraisonJours, fournisseurDevise, photo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insLot = db.prepare(`INSERT INTO magasin_lots (id, productId, quantiteRestante, quantiteInitiale, prixUnitaire, dateEntree, fournisseur, numBain, variante, etat)
        VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const insMvt = db.prepare(`INSERT INTO magasin_mouvements (id, productId, type, source, destination, quantite, prixUnitaire, chaineId, modeleRef, date,
        operateurNom, notes, lotId, bain, documentRef) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const FOURN_TISSU = ['Tissages du Détroit SARL', 'Denim Mills Iberia', 'Filatures Atlas', 'Textiles Rif Import'];
    const FOURN_ACC = 'Fournitures Boughaz';
    let iFourn = 0;
    const bilan: string[] = [];

    for (const s of sims) {
        const { d, quantite, sommeRatio, ratios } = s;
        const c = CHAINES.find(x => x.id === d.chaine)!;

        // Chrono : releves pour les modeles deja passes en chaine
        const chronoData: Record<string, any> = {};
        if (s.statut !== 'READY') for (const op of s.gamme) {
            const base = op.time * 60 / 1.15;
            const tr = Array.from({ length: 5 }, () => r2(autour(base, 0.06)));
            const tm = r2(tr.reduce((a, b) => a + b, 0) / 5);
            const tempMajore = r2(tm * 1.15 / 60);
            const pMax = Math.round(480 / Math.max(tempMajore, 0.01));
            chronoData[op.id] = { operationId: op.id, tr1: tr[0], tr2: tr[1], tr3: tr[2], tr4: tr[3], tr5: tr[4], tm, tmManual: false, majoration: 1.15, tempMajore, pMax, p85: Math.round(pMax * 0.85) };
        }

        // Coupe : trace principal + matelas par couleur ; la coupe avance devant la chaine.
        const trace = genererTrace(d.ref, d.patron, ratios, d.tailles, d.laize);
        const plcId = `PLC-${d.ref}-01`;
        const fichier = { id: `FIC-${d.ref}-01`, nom: `${d.ref}-${d.tailles[0]}-${d.tailles[d.tailles.length - 1]}-TE-01.plt`, format: 'PLT', data: 'data:application/octet-stream;base64,' + Buffer.from(trace.plt, 'latin1').toString('base64'), size: trace.plt.length };
        const placement = { id: plcId, tissu: 'principal', nom: `${d.tailles[0]}-${d.tailles[d.tailles.length - 1]}`, code: 'TE-01', ratios, fichier,
            longueurM: trace.longueurM, laizeCm: d.laize, efficience: trace.efficience, maxPlis: d.maxPlis, taillesTrace: ratios, taillesFichier: ratios };
        const besoinTissu = d.couleurs.reduce((sum, col) => sum + col[2] * (trace.longueurM + 0.03), 0);
        const recu = Math.round(besoinTissu * (d.tissuRecuPart ?? (d.bloque ? 0 : 1.025)));
        const partCoupe = s.statut === 'DONE' ? 1 : d.bloque ? 0 : Math.min((d.tissuRecuPart ?? 1) * 0.98, s.statut === 'READY' ? 0.3 : s.produit / quantite + 0.28);
        const totalMatelas = d.couleurs.reduce((sum, col) => sum + Math.ceil(col[2] / d.maxPlis), 0);
        const nbCoupes = Math.round(totalMatelas * partCoupe);
        const debutCoupe = (() => { let x = s.lancement; for (let k = 0; k < 3; k++) { x = jour(x, -1); while (!ouvrable(x)) x = jour(x, -1); } return x; })();
        const finCoupe = s.statut === 'DONE' ? s.finJour : AUJOURDHUI;
        const joursCoupe: string[] = [];
        for (let x = debutCoupe; x <= finCoupe; x = jour(x, 1)) if (ouvrable(x)) joursCoupe.push(x);
        const matelasLines: any[] = [];
        let numero = 1, metresCoupes = 0;
        for (const [, nomC, plisTot] of d.couleurs) {
            let reste = plisTot;
            while (reste > 0) {
                const plis = Math.min(d.maxPlis, reste);
                reste -= plis;
                const rang = numero - 1;
                const fait = rang < nbCoupes;
                const envoye = fait || (!d.bloque && rang < nbCoupes + 2);
                const metres = r2(plis * (trace.longueurM + 0.03) * autour(1.006, 0.004));
                const dj = joursCoupe[Math.min(joursCoupe.length - 1, Math.floor(rang / Math.max(1, nbCoupes) * joursCoupe.length))] || AUJOURDHUI;
                const h = 8 + (numero % 3) * 3;
                matelasLines.push({
                    id: `MAT-${d.ref}-${numero}`, plis, tissu: 'principal', numero: String(numero), ratios, couleur: nomC, longTracee: trace.longueurM, placementId: plcId,
                    ...(fait ? { fait: true, groupe: GROUPES_COUPE[numero % 2].id, metresReels: metres, debut: `${dj}T${String(h).padStart(2, '0')}:00:00.000Z`, fin: `${dj}T${String(h + 2).padStart(2, '0')}:15:00.000Z` } : {}),
                    ...(envoye ? { envoyeLe: `${dj}T${String(h - 1).padStart(2, '0')}:40:00.000Z` } : {}),
                });
                if (fait) metresCoupes += metres;
                numero++;
            }
        }
        const statutCoupe = s.statut === 'DONE' ? 'VALIDE' : nbCoupes > 0 ? 'EN_COURS' : 'EN_PREPARATION';
        const ordreCoupe = {
            refModele: d.ref, longueurMatelas: trace.longueurM, consommation: r2(trace.longueurM / sommeRatio), nbrFeuilles: d.couleurs.reduce((sum, col) => sum + col[2], 0),
            nbrMatelas: matelasLines.length, qteTotale: quantite, status: statutCoupe, faisceaux: [], tissuRecu: recu,
            tissus: [{ id: 'principal', nom: d.tissu, recuM: recu, rouleauM: 100, laizeCm: d.laize, code: 'TE' }],
            placements: [placement], matelasLines, pedido: d.pedido, refFournisseur: `${d.ref}-${d.pedido.slice(-3)}`, serie: { depart: 1 },
            majLe: `${s.statut === 'DONE' ? s.finJour : AUJOURDHUI}T09:12:00.000Z`,
        };

        // Fiche + modele
        const consoPiece = r2((trace.longueurM + 0.03) / sommeRatio * 1.01);
        const materials = [
            { id: 1, name: d.tissu, unitPrice: d.prixTissu, qty: consoPiece, unit: 'm', threadMeters: 0, threadCapacity: 0 },
            ...d.fournitures.map(([n, p, q, u], i) => ({ id: i + 2, name: n, unitPrice: p, qty: q, unit: u, threadMeters: 0, threadCapacity: 0 })),
        ];
        const etat = s.statut === 'DONE' ? { hala: 'TERMINE', kisba: 'COUPE', statut: 'Terminé', wf: 'EXPORT' }
            : s.statut === 'IN_PROGRESS' ? { hala: 'EN_COURS', kisba: 'EN_COURS', statut: 'En Cours', wf: 'COUPE' }
                : { hala: d.bloque ? 'BLOQUE' : 'EN_ATTENTE', kisba: nbCoupes ? 'EN_COURS' : 'NON_LANCE', statut: 'En Attente', wf: 'COUPE' };
        const creation = jour(s.lancement, -20);
        const colors = d.couleurs.map(([hex, n]) => ({ id: hex, name: n }));
        const ficheData = {
            date: creation, launchTime: '08:00', client: d.client, category: d.categorie, designation: d.tissu, color: '', quantity: quantite,
            chaine: d.chaine, targetEfficiency: 85, unitCost: r2(s.totalTemps * 0.85), clientPrice: d.prixFacon, observations: d.observations, costMinute: 0.85,
            sizes: d.tailles, colors, gridQuantities: s.grid, materials, todm: '', kisba: etat.kisba, hala: etat.hala, facteurPlanning: 60, bufferLancement: 120,
            statutProduction: etat.statut, typeMarche: d.marche,
        };
        const img = photo(d.ref);
        const model = {
            id: d.id, filename: `${d.nom}.json`, image: img, images: { front: img, back: null }, updatedAt: new Date().toISOString(),
            workflowStatus: etat.wf, isPublishedToLibrary: true, ficheData, ordreCoupe,
            meta_data: { nom_modele: d.nom, reference: d.ref, photo_url: img, category: d.categorie, date_creation: `${creation}T09:00:00.000Z`, date_lancement: s.lancement,
                heure_lancement: '08:00', total_temps: s.totalTemps, effectif: s.postes.length, sizes: d.tailles, colors, quantity: quantite, todm: '', kisba: etat.kisba, hala: etat.hala },
            gamme_operatoire: s.gamme,
            implantation: { postes: s.postes, assignments: s.assignments, layoutMemory: { zigzag: s.postes.map(p => ({ id: p.id })) }, activeLayout: 'zigzag' },
            chronoData, chronoCustomStations: [], chronoLayoutSide: 'both',
        };
        insModel.run(d.id, OWNER, OWNER, JSON.stringify(model), `${creation} 09:00:00`, `${AUJOURDHUI} 07:30:00`);

        // Planning : fin au rythme reel, DDS avec marge transport (sauf DDS impose par le client)
        const planId = `plan_${d.id}_1`;
        const rythme = Math.max(s.jours.slice(-4, -1).reduce((a, j) => a + j.total, 0) / Math.max(1, s.jours.slice(-4, -1).length), c.cadence * 9 * (d.coef ?? 0.95) * 0.93);
        const dds = d.dds ?? jour(s.finJour, d.marche === 'Export' ? 7 : 3);
        let joursRestants = 0; for (let x = jour(AUJOURDHUI, 1); x <= dds; x = jour(x, 1)) if (ouvrable(x)) joursRestants++;
        const crValue = s.statut === 'IN_PROGRESS' ? r2(joursRestants / Math.max(0.1, (quantite - s.produit) / Math.max(1, rythme))) : s.statut === 'DONE' ? 1 : 0;
        const deficit = s.statut === 'IN_PROGRESS' ? Math.max(0, Math.round((quantite - s.produit) - rythme * joursRestants)) : 0;
        const statutPlan = d.bloque ? 'BLOCKED_STOCK' : s.statut;
        const rawPlan = {
            id: planId, modelId: d.id, chaineId: d.chaine, dateLancement: s.lancement, startDate: s.lancement, dateExport: `${dds}T12:00:00.000Z`,
            estimatedEndDate: `${s.finJour}T16:00:00.000Z`, strictDeadline_DDS: dds, qteTotal: quantite, totalQuantity: quantite, qteProduite: s.produit, producedQuantity: s.produit,
            status: statutPlan, blockedReason: d.bloque, modelName: d.nom, clientName: d.client,
            color: ['#ffffff', '#f8fafc', '#f5f0e6', '#ede0d4', '#e7e5e4'].includes(d.couleurs[0][0]) ? '#0ea5e9' : d.couleurs[0][0],
            sectionSplitEnabled: false, typeMarche: d.marche, facteurPlanning: 60, bufferLancement: 120, lastSyncedFromSuivi: `${AUJOURDHUI}T10:05:00.000Z`,
            ...(d.bloque ? { materialShortages: [{ name: d.tissu, missing: Math.round(besoinTissu), unit: 'm' }] } : {}),
        };
        insPlan.run(planId, OWNER, d.id, d.chaine, s.lancement, rawPlan.dateExport, quantite, s.produit, statutPlan, d.bloque ?? null, dds, d.client, rawPlan.estimatedEndDate, d.nom,
            JSON.stringify(rawPlan), crValue, s.statut === 'IN_PROGRESS' ? (crValue >= 1 ? 'OK' : crValue >= 0.85 ? 'WARNING' : 'CRITICAL') : s.statut === 'DONE' ? 'OK' : null, deficit);

        // Suivi horaire + effectifs par role
        const parClasse = (cls: string[]) => s.postes.filter(p => cls.includes(p.machine)).length;
        let cumul = 0;
        for (const j of s.jours) {
            cumul += j.total;
            const entrer = Math.min(quantite, Math.round(j.total * autour(1.05, 0.03)));
            const enCour = Math.round(autour(c.cadence * 0.6, 0.3));
            const raw = {
                id: `suivi_${d.id}_${j.date}`, date: j.date, modelId: d.id, chaineId: d.chaine, planningId: planId, sorties: j.sorties, entrer, enCour, totalHeure: j.total,
                pJournaliere: c.cadence * 9, totalWorkers: c.effectif, absent: j.absent, resteEntrer: Math.max(0, quantite - cumul - enCour), resteSortie: quantite - cumul,
                defauts: j.defauts, downtimes: j.downtimes, customEffectifs: {},
                recta: Math.max(0, parClasse(['301', '316', '402', '602', '101']) - Math.ceil(j.absent / 2)), sujet: Math.max(0, parClasse(['516', '514', '504']) - Math.floor(j.absent / 2)),
                sp: parClasse(['107', '304', 'BR']), man: parClasse(['MAN', 'FER']), transpMat: 1, chaf: 1, methodes: 1, qualite: 1, mecanicien: 1, controle: 2, transp: 2,
            };
            insSuivi.run(raw.id, OWNER, planId, d.id, d.chaine, j.date, entrer, JSON.stringify(j.sorties), j.total, raw.pJournaliere, enCour, raw.resteEntrer, raw.resteSortie,
                c.effectif, j.absent, 'PLANNING', JSON.stringify(raw));
        }

        // Magasin : tissu + fournitures (receptions, sorties par matelas et par jour de chaine)
        const lignes: [string, string, string, number, number, string, number][] = [
            [`${d.ref}-TE`, d.tissu, 'tissu', d.prixTissu, recu, 'm', 0],
            ...d.fournitures.map(([n, p, q, u], i) => [`${d.ref}-F${i + 1}`, n, n.startsWith('Fil') ? 'fil' : n.startsWith('Bouton') ? 'bouton' : n.startsWith('Fermeture') ? 'fermeture' : n.startsWith('Étiquette') ? 'etiquette' : 'autre',
                p, d.bloque ? 0 : Math.ceil(q * quantite * (i === 0 && d.fournRecuPart ? d.fournRecuPart : 1.03)), u === 'pc' ? 'piece' : u, q] as [string, string, string, number, number, string, number]),
        ];
        for (const [ref, des, cat, prix, qteIn, unite, parPiece] of lignes) {
            const pid = `demo-${ref.toLowerCase()}`;
            const estTissu = cat === 'tissu';
            const fournisseur = estTissu ? FOURN_TISSU[iFourn++ % FOURN_TISSU.length] : FOURN_ACC;
            insProd.run(pid, OWNER, ref, des, cat, unite, fournisseur, estTissu ? '+212 539 3' + String(10000 + iFourn * 731).slice(-5) : '+212 539 340 112',
                estTissu ? `Rayon T${(iFourn % 4) + 1}` : 'Armoire A2', prix, prix, estTissu ? 50 : Math.round(parPiece * quantite * 0.02), estTissu ? 21 : 7, 'MAD', photoMatiere(des));
            if (qteIn <= 0) continue;
            let entree = jour(s.lancement, -7);
            if (entree >= AUJOURDHUI) entree = jour(AUJOURDHUI, -2);
            const lotId = `${pid}-lot1`;
            const bain = estTissu ? `B${d.ref.slice(-3)}-${(iFourn % 7) + 2}` : null;
            const consomme = estTissu ? metresCoupes : Math.min(qteIn, Math.round(parPiece * s.produit));
            const reste = r2(Math.max(0, qteIn - consomme));
            insLot.run(lotId, pid, reste, qteIn, prix, entree, fournisseur, bain, null, reste > 0 ? 'disponible' : 'epuise');
            insMvt.run(`${pid}-in`, pid, 'entree', fournisseur, 'Magasin', qteIn, prix, null, d.ref, entree, 'Magasinier', `Réception commande ${d.pedido}`, lotId, bain, `BL-${d.pedido.slice(-4)}`);
            const sorties: [string, number][] = estTissu
                ? matelasLines.filter(m => m.fait).map(m => [m.debut.slice(0, 10), m.metresReels])
                : s.jours.map(j => [j.date, r2(consomme * j.total / Math.max(1, s.produit))]);
            sorties.forEach(([date, q], k) => { if (q > 0) insMvt.run(`${pid}-out${k + 1}`, pid, 'sortie', 'Magasin', estTissu ? 'Coupe' : d.chaine, q, prix, d.chaine, d.ref,
                date, estTissu ? 'Chef coupe' : 'Magasinier', estTissu ? `Matelas n° ${k + 1}` : 'Livraison chaîne', lotId, bain, null); });
        }
        bilan.push(`${d.chaine} ${d.ref.padEnd(7)} ${d.client.padEnd(12)} ${String(quantite).padStart(5)} pcs  ${s.totalTemps.toFixed(1)} min  ${s.postes.length} postes  eff ${trace.efficience}%  ${s.lancement}→${s.finJour}  DDS ${dds}  produit ${s.produit}  ${statutPlan}${s.statut === 'IN_PROGRESS' ? ` CR ${crValue}` : ''}`);
    }

    /* Facturation : facon vendue aux clients (BL + facture + paiements), achats tissu aux fournisseurs */
    db.prepare('DELETE FROM paiements WHERE owner_id = ?').run(OWNER);
    db.prepare('DELETE FROM bons_livraison WHERE owner_id = ?').run(OWNER);
    db.prepare('DELETE FROM factures WHERE owner_id = ?').run(OWNER);
    const insFac = db.prepare(`INSERT INTO factures (id, owner_id, numero, type, tiers_nom, tiers_ice, tiers_adresse, tiers_tel, tiers_email, date_facture, date_echeance,
        total_ht, taux_tva, total_tva, total_ttc, montant_paye, planning_id, source_module, source_id, statut, notes, lignes, tiers_type, tiers_ville, conditions_paiement)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insBL = db.prepare('INSERT INTO bons_livraison (id, owner_id, numero, facture_id, tiers_nom, date_livraison, adresse_livraison, transporteur, lignes, statut, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const insPai = db.prepare('INSERT INTO paiements (id, owner_id, facture_id, date_paiement, montant, mode, reference, notes) VALUES (?,?,?,?,?,?,?,?)');
    const CLIENTS: Record<string, { ice: string; adresse: string; ville: string; tel: string; email: string }> = {
        Zara: { ice: 'ES-DEMO-0001', adresse: 'Avda. de la Diputación, Arteixo', ville: 'A Coruña', tel: '+34 981 18 54 00', email: 'proveedores@demo-zara.test' },
        Bershka: { ice: 'ES-DEMO-0002', adresse: 'Polígono Industrial de Tordera', ville: 'Barcelona', tel: '+34 937 64 00 00', email: 'supply@demo-bershka.test' },
        Stradivarius: { ice: 'ES-DEMO-0003', adresse: 'Polígono Industrial Can Sant Joan', ville: 'Barcelona', tel: '+34 935 87 20 00', email: 'supply@demo-stradivarius.test' },
        'Pull&Bear': { ice: 'ES-DEMO-0004', adresse: 'Polígono Industrial de Sabón', ville: 'Narón', tel: '+34 981 18 80 00', email: 'supply@demo-pullbear.test' },
        Zintura: { ice: '000000000000999', adresse: 'Zone franche Gzenaya, lot 112', ville: 'Tanger', tel: '+212 539 39 41 20', email: 'achats@demo-zintura.test' },
    };
    let nFac = 0, nBL = 0, nAch = 0;
    const expeditions: { modelId: string; qte: number; date: string; bl: string; fac: string; client: string }[] = [];
    const factureVente = (s: Sim, qte: number, date: string, partiel: boolean) => {
        const d = s.d, cl = CLIENTS[d.client];
        const ht = r2(qte * d.prixFacon);
        nFac++; nBL++;
        const fid = `FAC-DEMO-V${String(nFac).padStart(3, '0')}`;
        const echeance = jour(date, 60);
        // Client local a 30 jours, export a 60 jours avec acompte de 30 % une semaine apres livraison.
        const paye = d.marche === 'Local' || d.client === 'Zintura' ? (jour(date, 30) <= AUJOURDHUI ? ht : 0) : echeance <= AUJOURDHUI ? ht : jour(date, 7) <= AUJOURDHUI ? r2(ht * 0.3) : 0;
        const statut = paye >= ht ? 'PAYEE' : paye > 0 ? 'PARTIELLEMENT' : 'ENVOYEE';
        insFac.run(fid, OWNER, `FV-2026-${String(140 + nFac).padStart(4, '0')}`, 'VENTE', d.client, cl.ice, cl.adresse, cl.tel, cl.email, date, echeance, ht, 0, 0, ht, paye,
            `plan_${d.id}_1`, 'PLANNING', `plan_${d.id}_1`, statut, `Façon ${d.ref} — commande ${d.pedido}${partiel ? ' (livraison partielle)' : ''}. Export : sans TVA.`,
            JSON.stringify([{ product_id: d.id, designation: `Façon — ${d.nom}`, quantite: qte, prix_unitaire: d.prixFacon, total: ht }]), 'CLIENT', cl.ville, 'Virement à 60 jours');
        insBL.run(`BL-DEMO-${String(nBL).padStart(3, '0')}`, OWNER, `BL-2026-${String(310 + nBL).padStart(4, '0')}`, fid, d.client, date, `${cl.adresse}, ${cl.ville}`,
            'Transports Boughaz Logistique', JSON.stringify(d.couleurs.map(([, nom, p]) => ({ designation: `${d.ref} ${nom}`, quantite: Math.round(qte * p * s.sommeRatio / s.quantite), cartons: Math.ceil(qte * p * s.sommeRatio / s.quantite / 40) }))),
            'LIVRE', `${Math.ceil(qte / 40)} cartons — camion TIR via port Tanger Med`);
        expeditions.push({ modelId: d.id, qte, date, bl: `BL-2026-${String(310 + nBL).padStart(4, '0')}`, fac: `FV-2026-${String(140 + nFac).padStart(4, '0')}`, client: d.client });
        if (paye > 0) insPai.run(`PAI-DEMO-${nFac}`, OWNER, fid, paye >= ht ? (d.client === 'Zintura' ? jour(date, 30) : echeance) : jour(date, 7), paye, 'VIREMENT', `VIR-${d.pedido.slice(-6)}`, paye >= ht ? 'Règlement' : 'Acompte 30 %');
    };
    // Historique : commandes de l'ete deja livrees et reglees (avant les modeles en cours).
    const HISTO: [string, string, string, number, number, string][] = [
        ['Zara', 'JN-090 Jean mom fit', 'PO-ZR-4551870', 15000, 32, '2026-08-21'], ['Bershka', 'CH-180 Chemise popeline', 'PO-BSK-7688411', 10000, 20, '2026-08-28'],
        ['Pull&Bear', 'PL-150 Polo jersey', 'PO-PB-5498302', 12000, 13, '2026-09-04'], ['Zara', 'BL-430 Blazer lin', 'PO-ZR-4560025', 6000, 82, '2026-09-11'],
        ['Stradivarius', 'RB-330 Robe chemise', 'PO-STR-2240918', 8000, 40, '2026-09-18'], ['Zintura', 'SW-200 Sweat col rond', 'ZT-26-0297', 3000, 22, '2026-09-25'],
        ['Pull&Bear', 'PT-080 Pantalon cargo', 'PO-PB-5503377', 10000, 31, '2026-09-30'],
    ];
    for (const [client, des, po, qte, prix, date] of HISTO) {
        const cl = CLIENTS[client], ht = qte * prix;
        nFac++; nBL++;
        const fid = `FAC-DEMO-V${String(nFac).padStart(3, '0')}`;
        const regle = client === 'Zintura' ? jour(date, 30) : jour(date, 60);
        const paye = regle <= AUJOURDHUI ? ht : r2(ht * 0.3);
        insFac.run(fid, OWNER, `FV-2026-${String(140 + nFac).padStart(4, '0')}`, 'VENTE', client, cl.ice, cl.adresse, cl.tel, cl.email, date, regle, ht, 0, 0, ht, paye,
            null, 'PLANNING', null, paye >= ht ? 'PAYEE' : 'PARTIELLEMENT', `Façon ${des.split(' ')[0]} — commande ${po}. Export : sans TVA.`,
            JSON.stringify([{ designation: `Façon — ${des}`, quantite: qte, prix_unitaire: prix, total: ht }]), 'CLIENT', cl.ville, client === 'Zintura' ? 'Virement à 30 jours' : 'Virement à 60 jours');
        insBL.run(`BL-DEMO-${String(nBL).padStart(3, '0')}`, OWNER, `BL-2026-${String(310 + nBL).padStart(4, '0')}`, fid, client, date, `${cl.adresse}, ${cl.ville}`, 'Transports Boughaz Logistique',
            JSON.stringify([{ designation: des, quantite: qte, cartons: Math.ceil(qte / 40) }]), 'LIVRE', `${Math.ceil(qte / 40)} cartons — camion TIR via port Tanger Med`);
        insPai.run(`PAI-DEMO-H${nFac}`, OWNER, fid, paye >= ht ? regle : jour(date, 7), paye, 'VIREMENT', `VIR-${po.slice(-6)}`, paye >= ht ? 'Règlement' : 'Acompte 30 %');
    }
    for (const s of sims) {
        if (s.statut === 'DONE') factureVente(s, s.quantite, ouvrableSuivant(s.finJour), false);
        else if (s.statut === 'IN_PROGRESS' && s.produit >= 3000) factureVente(s, Math.floor(s.produit * 0.8 / 500) * 500, jour(AUJOURDHUI, -2), true);
        // Achat du tissu au fournisseur, a la reception
        const lot = db.prepare('SELECT quantiteInitiale q, prixUnitaire p, dateEntree d, fournisseur f FROM magasin_lots WHERE id = ?').get(`demo-${s.d.ref.toLowerCase()}-te-lot1`) as any;
        if (lot) {
            nAch++;
            const ht = r2(lot.q * lot.p), tva = r2(ht * 0.2);
            // Fournisseur : 50 % a la commande, solde a 45 jours.
            const paye = jour(lot.d, 45) <= AUJOURDHUI ? r2(ht + tva) : r2((ht + tva) * 0.5);
            const aid = `FAC-DEMO-A${String(nAch).padStart(3, '0')}`;
            insFac.run(aid, OWNER, `FA-DEMO-2026-${String(80 + nAch).padStart(4, '0')}`, 'ACHAT', lot.f, '00178' + String(4500000000 + nAch * 7919).slice(0, 10), 'Zone industrielle Gzenaya', '+212 539 39 00 00', null,
                lot.d, jour(lot.d, 45), ht, 20, tva, r2(ht + tva), paye, null, 'MAGASIN', `demo-${s.d.ref.toLowerCase()}-te`, paye >= r2(ht + tva) ? 'PAYEE' : 'PARTIELLEMENT', `Tissu ${s.d.tissu} pour ${s.d.ref}`,
                JSON.stringify([{ designation: s.d.tissu, quantite: lot.q, prix_unitaire: lot.p, total: ht }]), 'FOURNISSEUR', 'Tanger', 'Chèque à 45 jours');
            insPai.run(`PAI-DEMO-A${nAch}`, OWNER, aid, paye >= r2(ht + tva) ? jour(lot.d, 45) : jour(lot.d, -5), paye, 'CHEQUE', `CHQ ${7100000 + nAch * 37}`, paye >= r2(ht + tva) ? 'Solde' : 'Avance 50 % à la commande');
        }
    }
    bilan.push(`facturation : ${nFac} factures de façon, ${nAch} factures d'achat`);

    /* Produit fini (export) : entree chaque jour depuis la chaine, expedition a chaque BL */
    db.prepare('DELETE FROM finished_goods_movements WHERE owner_id = ?').run(OWNER);
    db.prepare('DELETE FROM finished_goods_stock WHERE owner_id = ?').run(OWNER);
    const insFG = db.prepare(`INSERT INTO finished_goods_stock (id, owner_id, modelId, planningId, reference, designation, clientName, chaineId, quantiteProduite, quantiteDefaut,
        quantiteExpediee, quantiteRestante, statut, dateProduction, dateExportPrevue, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insFGM = db.prepare('INSERT INTO finished_goods_movements (id, owner_id, fgId, type, quantite, date, clientNom, bonLivraisonRef, factureRef, notes) VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const s of sims.filter(x => x.produit > 0)) {
        const fgId = `fg-${s.d.id}`;
        const defaut = s.jours.reduce((a, j) => a + j.defauts.reduce((b: number, x: any) => b + x.quantity, 0), 0);
        const exp = expeditions.filter(e => e.modelId === s.d.id);
        const expedie = exp.reduce((a, e) => a + e.qte, 0);
        const reste = Math.max(0, s.produit - expedie);
        const dds = db.prepare('SELECT strictDeadline_DDS d FROM planning_events WHERE id = ?').get(`plan_${s.d.id}_1`) as { d: string } | undefined;
        insFG.run(fgId, OWNER, s.d.id, `plan_${s.d.id}_1`, s.d.ref, s.d.nom, s.d.client, s.d.chaine, s.produit, defaut, expedie, reste,
            reste === 0 ? 'expediee' : expedie > 0 ? 'partielle' : 'disponible', s.jours[0].date, dds?.d ?? null, `${Math.ceil(reste / 40)} cartons en zone d'expédition`);
        s.jours.forEach((j, k) => { if (j.total) insFGM.run(`${fgId}-e${k}`, OWNER, fgId, 'entree', j.total, j.date, null, null, null, `Sortie chaîne ${s.d.chaine}`); });
        exp.forEach((e, k) => insFGM.run(`${fgId}-x${k}`, OWNER, fgId, 'expedition', e.qte, e.date, e.client, e.bl, e.fac, 'Camion TIR — port Tanger Med'));
    }

    /* Magasin : bons de commande fournisseurs, demandes de la chaine, receptions par commande */
    db.prepare('DELETE FROM magasin_commandes WHERE owner_id = ?').run(OWNER);
    db.prepare('DELETE FROM magasin_demandes WHERE owner_id = ?').run(OWNER);
    db.prepare('DELETE FROM demandes_appro WHERE owner_id = ?').run(OWNER);
    db.prepare('DELETE FROM material_receipts WHERE owner_id = ?').run(OWNER);
    const insBC = db.prepare(`INSERT INTO magasin_commandes (id, owner_id, numero, fournisseurNom, dateCreation, dateLivraisonPrevue, total, statut, lignes, notes, tvaTaux, conditionsPaiement, adresseLivraison)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insRec = db.prepare('INSERT INTO material_receipts (id, owner_id, pedidoId, modelId, materialName, qtyReceived, dateReceived, owner, supplierName) VALUES (?,?,?,?,?,?,?,?,?)');
    let nBC = 0;
    for (const s of sims) {
        const prods = db.prepare(`SELECT p.id, p.reference, p.designation, p.unite, p.prixUnitaire, p.fournisseurNom, l.quantiteInitiale q, l.dateEntree d
            FROM magasin_products p LEFT JOIN magasin_lots l ON l.productId = p.id WHERE p.owner_id = ? AND p.reference LIKE ?`).all(OWNER, `${s.d.ref}-%`) as any[];
        const parFourn = new Map<string, any[]>();
        for (const p of prods) { if (!parFourn.has(p.fournisseurNom)) parFourn.set(p.fournisseurNom, []); parFourn.get(p.fournisseurNom)!.push(p); }
        for (const [fourn, lignes] of parFourn) {
            nBC++;
            const tissu = lignes.some(l => l.reference.endsWith('-TE'));
            // Quantite commandee = besoin de la commande ; la reception peut etre partielle.
            const commande = (l: any) => l.reference.endsWith('-TE')
                ? Math.round(s.quantite * (s.d.couleurs.reduce((a, c) => a + c[2], 0) ? 1 : 1) * 1.25)
                : Math.ceil(s.quantite * 1.03 * (s.d.fournitures.find(f => l.designation === f[0])?.[2] ?? 1));
            const lg = lignes.map((l, i) => {
                const q = l.reference.endsWith('-TE') && l.q && !s.d.tissuRecuPart ? l.q : commande(l);
                return { id: `l${i}`, productId: l.id, productNom: l.designation, quantite: q, prixUnitaire: l.prixUnitaire, reference: l.reference, unite: l.unite, quantiteRecue: l.q || 0 };
            });
            const recuTout = lg.every(l => l.quantiteRecue >= l.quantite * 0.98);
            const statut = s.d.bloque ? 'envoye' : recuTout ? 'livre' : lg.some(l => l.quantiteRecue > 0) ? 'recu_partiel' : 'valide';
            const cree = jour(s.lancement, -24);
            insBC.run(`bc-${nBC}`, OWNER, `BC-2026-${String(200 + nBC).padStart(4, '0')}`, fourn, cree, jour(cree, tissu ? 21 : 7), r2(lg.reduce((a, l) => a + l.quantite * l.prixUnitaire, 0)), statut, JSON.stringify(lg),
                `${s.d.ref} — ${s.d.client} ${s.d.pedido}${statut === 'recu_partiel' ? ' — reliquat en attente' : statut === 'envoye' ? ' — fournisseur en retard, relance faite' : ''}`,
                20, tissu ? 'Chèque à 45 jours' : 'Comptant', 'BERA-TEX, Zone industrielle Gzenaya, Tanger');
            for (const l of lignes) if (l.q) insRec.run(`rc-${l.id}`, OWNER, s.d.pedido, s.d.id, l.designation, l.q, l.d, 'ATELIER', fourn);
        }
    }
    // Demandes de la chaine au magasin (fil, boutons, fermetures qui manquent en cours de journee)
    const insDem = db.prepare('INSERT INTO magasin_demandes (id, owner_id, modelId, chaineId, produitDesignation, quantiteDemandee, notes, dateDemande, demandeur, statut) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const insAppro = db.prepare('INSERT INTO demandes_appro (id, owner_id, dateDemande, modelId, chaineId, produitDesignation, quantiteDemandee, demandeur, notes, statut) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const actifs = sims.filter(x => x.statut === 'IN_PROGRESS');
    for (let k = 0; k < 24; k++) {
        const sm = actifs[k % actifs.length];
        const f = sm.d.fournitures[Math.floor(alea() * sm.d.fournitures.length)];
        const date = jour(AUJOURDHUI, -Math.floor(k / 4));
        const statut = k < 4 ? 'attente' : k < 7 ? 'preparee' : k === 9 ? 'rejetee' : 'livree';
        const q = f[3] === 'cone' ? 6 + Math.floor(alea() * 10) : f[3] === 'm' ? 50 + Math.floor(alea() * 150) : 500 + Math.floor(alea() * 1500);
        const note = statut === 'rejetee' ? 'Déjà livré le matin, vérifier le bac de la chaîne' : statut === 'attente' ? 'Urgent — la chaîne tourne' : null;
        const chef = `Chef ${sm.d.chaine.replace('CHAINE', 'chaîne')}`;
        insDem.run(`dm-${k}`, OWNER, sm.d.id, sm.d.chaine, f[0], q, note, date, chef, statut);
        insAppro.run(`da-${k}`, OWNER, `${date}T${String(8 + (k % 9)).padStart(2, '0')}:${String((k * 13) % 60).padStart(2, '0')}:00`, sm.d.id, sm.d.chaine, f[0], q, chef, note, statut);
    }
    bilan.push(`export : ${sims.filter(x => x.produit > 0).length} stocks produit fini, ${expeditions.length} expéditions ; magasin : ${nBC} bons de commande, 24 demandes chaîne`);


    /* RH : ouvriers de chaque chaine (operateurs + encadrement), transport, pointage */
    const insLigne = db.prepare('INSERT INTO hr_transport_lignes (id, nom, chauffeur_nom, chauffeur_tel, matricule_vehicule, capacite, owner_id, code_ligne, quartier) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const [code, q, ch, tel, plaque, cap] of LIGNES) insLigne.run(`tl-${code}`, `Ligne ${code} — ${q}`, ch, tel, plaque, cap * 2, OWNER, code, q);
    const insW = db.prepare(`INSERT INTO hr_workers (id, matricule, full_name, cin, cnss, phone, sexe, date_naissance, adresse, date_embauche, role, type_contrat, owner_id,
        chaine_id, poste, equipe, is_active, salaire_base, taux_horaire, prime_assiduite, prime_transport, mode_paiement, pointeuse_type, contact_urgence_nom, contact_urgence_tel, transport_ligne_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,'VIREMENT','POINTEUSE',?,?,?)`);
    const ouvriers: string[] = [];
    const operateurs: { id: string; chaine: string; op: string; parOp: number }[] = [];
    const cins = new Set<string>();
    let mat = 0;
    const tel = () => (alea() < 0.6 ? '06' : '07') + String(Math.floor(alea() * 1e8)).padStart(8, '0');
    for (const c of CHAINES) {
        const enCours = sims.find(x => x.d.chaine === c.id && x.statut === 'IN_PROGRESS') || sims.find(x => x.d.chaine === c.id)!;
        const encadrement: [string, string][] = [['SUPERVISOR', 'Chef de chaîne'], ['MECHANIC', 'Technicien réglage & maintenance'], ['QC', 'Contrôle qualité chaîne'], ['QC', 'Contrôle final AQL']];
        const membres: [string, string, string?][] = [...encadrement, ...enCours.postes.map(p => ['OPERATOR', POSTE_CLASSE[p.machine] || p.machine, p.originalId] as [string, string, string])];
        for (const [role, poste, opPoste] of membres) {
            mat++;
            const femme = role === 'MECHANIC' ? false : alea() < 0.78;
            const nom = `${(femme ? PRENOMS_F : PRENOMS_H)[Math.floor(alea() * (femme ? PRENOMS_F.length : PRENOMS_H.length))]} ${NOMS[Math.floor(alea() * NOMS.length)]}`;
            let cin: string;
            do cin = ['K', 'KB', 'L', 'LB'][Math.floor(alea() * 4)] + String(100000 + Math.floor(alea() * 899999)); while (cins.has(cin));
            cins.add(cin);
            const q = QUARTIERS[Math.floor(alea() * QUARTIERS.length)];
            const ligne = LIGNES.find(l => l[1] === q);
            const base = role === 'SUPERVISOR' ? 5600 : role === 'MECHANIC' ? 5000 : role === 'QC' ? 4100 : 3200 + Math.round(alea() * 8) * 100;
            const id = `w-${String(mat).padStart(4, '0')}`;
            const embauche = `${2014 + Math.floor(alea() * 12)}-${String(1 + Math.floor(alea() * 12)).padStart(2, '0')}-${String(1 + Math.floor(alea() * 27)).padStart(2, '0')}`;
            const naissance = `${1974 + Math.floor(alea() * 30)}-${String(1 + Math.floor(alea() * 12)).padStart(2, '0')}-${String(1 + Math.floor(alea() * 27)).padStart(2, '0')}`;
            insW.run(id, `BT-${String(mat).padStart(4, '0')}`, nom, cin, String(1e8 + Math.floor(alea() * 8.9e8)), tel(), femme ? 'F' : 'M', naissance, `${q}, Tanger`,
                embauche > AUJOURDHUI ? '2024-03-04' : embauche, role, alea() < 0.85 ? 'CDI' : 'CDD', OWNER, c.id, poste, alea() < 0.5 ? 'Équipe A' : 'Équipe B',
                base, Math.round(base / 191 * 100) / 100, 200, ligne ? 250 : 0, ['Conjoint', 'Mère', 'Père', 'Frère / sœur'][Math.floor(alea() * 4)], tel(), ligne ? `tl-${ligne[0]}` : null);
            ouvriers.push(id);
            if (opPoste) operateurs.push({ id, chaine: c.id, op: opPoste, parOp: enCours.postes.filter(p => p.originalId === opPoste).length });
        }
    }
    const insPointage = db.prepare(`INSERT INTO hr_pointage (id, worker_id, date, heure_entree, heure_sortie, pause_debut, pause_fin, source,
        heures_travaillees, heures_normales, statut, motif_absence, is_validated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const finJournee = MAINTENANT.getHours() >= 18;
    for (let date = '2026-10-01'; date <= AUJOURDHUI; date = jour(date, 1)) {
        if (!ouvrable(date)) continue;
        const enCours = date === AUJOURDHUI && !finJournee;
        const lundi = new Date(date + 'T12:00:00Z').getUTCDay() === 1;
        for (const o of ouvriers) {
            const t = alea();
            const statut = t < (lundi ? 0.05 : 0.03) ? 'ABSENT' : t < 0.08 ? 'RETARD' : 'PRESENT';
            const entree = statut === 'RETARD' ? `08:${String(10 + Math.floor(alea() * 35)).padStart(2, '0')}` : `07:${String(48 + Math.floor(alea() * 12)).padStart(2, '0')}`;
            const heures = statut === 'ABSENT' ? 0 : statut === 'RETARD' ? 8.5 : 9;
            insPointage.run(`pt_${o}_${date}`, o, date, statut === 'ABSENT' ? null : entree, statut === 'ABSENT' || enCours ? null : '18:00',
                statut === 'ABSENT' ? null : '12:00', statut === 'ABSENT' ? null : '13:00', 'POINTEUSE', enCours ? 0 : heures, enCours ? 0 : Math.min(8, heures),
                statut, statut === 'ABSENT' ? (alea() < 0.5 ? 'Maladie' : 'Absence justifiée') : null, enCours ? 0 : 1);
        }
    }
    // Production individuelle (10 derniers jours ouvres) : chaque piece passe par chaque operation, partagee entre ses postes.
    const insProdW = db.prepare(`INSERT INTO hr_production (id, worker_id, date, chaine_id, model_ref, pieces_produites, pieces_defaut, pieces_retouchees, taux_qualite, rendement)
        VALUES (?,?,?,?,?,?,?,?,?,?)`);
    let nProd = 0;
    for (const o of operateurs) {
        const sm = sims.find(x => x.d.chaine === o.chaine && x.statut === 'IN_PROGRESS') || sims.find(x => x.d.chaine === o.chaine && x.statut === 'DONE');
        if (!sm) continue;
        for (const j of sm.jours.slice(-10)) {
            const pieces = Math.round(j.total / o.parOp * autour(1, 0.12));
            const defaut = Math.round(pieces * (sm.d.defauts ?? 0.012) * autour(1, 0.8));
            insProdW.run(`hp-${o.id}-${j.date}`, o.id, j.date, o.chaine, sm.d.ref, pieces, defaut, Math.round(defaut * 0.8), r2(100 - defaut / Math.max(1, pieces) * 100), r2(autour(86, 0.14)));
            nProd++;
        }
    }
    // Avances sur salaire : demandes en attente, approuvees, en cours de remboursement.
    const insAv = db.prepare(`INSERT INTO hr_avances (id, worker_id, date_demande, montant, montant_approuve, montant_rembourse, solde_restant, nb_echeances, mois_debut_deduction,
        statut, approuve_par, date_approbation, motif) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const MOTIFS = ['Frais médicaux', 'Rentrée scolaire', 'Loyer', 'Mariage dans la famille', 'Réparation logement', 'Décès dans la famille'];
    for (let k = 0; k < 18; k++) {
        const w = ouvriers[Math.floor(alea() * ouvriers.length)];
        const montant = [500, 800, 1000, 1500, 2000][Math.floor(alea() * 5)];
        const statut = k < 4 ? 'DEMANDE' : k < 9 ? 'APPROUVE' : 'EN_COURS';
        const date = jour(AUJOURDHUI, -Math.floor(alea() * 40));
        const ech = montant >= 1500 ? 3 : montant >= 1000 ? 2 : 1;
        const rembourse = statut === 'EN_COURS' ? Math.round(montant / ech) : 0;
        insAv.run(`av-${k}`, w, date, montant, statut === 'DEMANDE' ? null : montant, rembourse, montant - rembourse, ech, AUJOURDHUI.slice(0, 7), statut,
            statut === 'DEMANDE' ? null : 'Responsable RH', statut === 'DEMANDE' ? null : jour(date, 1), MOTIFS[Math.floor(alea() * MOTIFS.length)]);
    }
    bilan.push(`RH : ${ouvriers.length} ouvriers sur ${CHAINES.length} chaînes, ${nProd} relevés de production, 18 avances`);

    /* Suivi par poste / ouvrier : 5 derniers jours des modeles en cours, chaque operation de la gamme, heure par heure */
    const insPS = db.prepare(`INSERT INTO poste_suivi (id, owner_id, planningId, modelId, posteId, workerId, worker_name, date, heure_debut, pieces_entrees, pieces_sorties,
        pieces_defaut, temps_reel_par_piece, temps_prevu_par_piece, problemes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    let nPS = 0;
    const nomOuvrier = new Map((db.prepare('SELECT id, full_name n FROM hr_workers WHERE owner_id = ?').all(OWNER) as any[]).map(w => [w.id, w.n]));
    for (const sm of sims.filter(x => x.statut === 'IN_PROGRESS')) {
        const planId = `plan_${sm.d.id}_1`;
        const ops = operateurs.filter(o => o.chaine === sm.d.chaine);
        for (const j of sm.jours.slice(-5)) for (const [h, v] of Object.entries(j.sorties)) for (const op of sm.gamme) {
            const w = ops.find(o => o.op === `OP${op.order}`);
            const sortie = j.downtimes[h] ? 0 : Math.round(v * autour(1, 0.06));
            insPS.run(`${planId}-${op.id}-${j.date}-${h}`, OWNER, planId, sm.d.id, op.id, w?.id ?? null, w ? nomOuvrier.get(w.id) : null, j.date, h, sortie + Math.round(autour(4, 0.5)), sortie,
                j.defauts.some((x: any) => x.hour === h) && alea() < 0.15 ? 1 + Math.floor(alea() * 3) : 0, r2(op.time * autour(1.08, 0.12)), r2(op.time),
                j.downtimes[h] === 'M' && alea() < 0.2 ? JSON.stringify(['Panne machine']) : '[]');
            nPS++;
        }
    }
    bilan.push(`suivi par poste : ${nPS} relevés`);


    /* Reglages : chaines, capacite, parc machines, salle de coupe */
    const g = db.prepare("SELECT value FROM app_settings WHERE owner_id = ? AND key = 'global_settings'").get(OWNER) as { value: string } | undefined;
    const reglages = g ? JSON.parse(g.value) : {};
    reglages.chainsCount = CHAINES.length;
    delete reglages.chainCapacityPerDay;
    reglages.capacityMode = 'DYNAMIC';
    reglages.chainOperators = Object.fromEntries(CHAINES.map(c => [c.id, c.effectif]));
    reglages.companyProfile = { ...(reglages.companyProfile || {}), companyName: 'bera-tex', legalName: 'BERA-TEX SARL' };
    const MARQUES: Record<string, string[]> = { '516': ['Juki MO-6816', 'Pegasus M952'], '514': ['Juki MO-6814', 'Siruba 747K'], '504': ['Juki MO-6804', 'Siruba 737K'],
        '301': ['Juki DDL-9000', 'Brother S-7300A'], '316': ['Juki LH-3528', 'Brother T-8420'], '602': ['Kansai DFB-1404', 'Yamato VC2700'], '402': ['Kansai DVK-1702', 'Juki MS-1261'],
        '101': ['Strobel 45-23', 'Maier 221'], '107': ['Juki LK-1903B-BB', 'Brother BE-438'], '304': ['Juki LBH-1790', 'Brother HE-800'], BR: ['Juki LK-1900B', 'Brother KE-430'],
        MAN: ['Table de finition'], FER: ['Table aspirante + fer vapeur'] };
    const parc: any[] = [];
    const chainMachines: Record<string, string[]> = {};
    let num = 0;
    const ajouter = (base: string, chaine: string | null, statut = 'OK') => {
        const b = MACHINES[base];
        num++;
        const marques = MARQUES[b.classe] || [b.name];
        const id = `MC-${String(num).padStart(3, '0')}`;
        parc.push({ id, name: b.name, classe: b.classe, speed: b.speed, speedMajor: 1.01, cofs: b.cofs, active: true, status: statut,
            matricule: `BT-M${String(num).padStart(3, '0')}`, brand: marques[num % marques.length], machineCategory: b.name,
            purchaseDate: `${2016 + (num % 9)}-${String(1 + (num % 12)).padStart(2, '0')}-${String(1 + (num % 27)).padStart(2, '0')}`, purchaseCondition: num % 5 === 0 ? 'USED' : 'NEW' });
        if (chaine) (chainMachines[chaine] ||= []).push(id);
    };
    for (const c of CHAINES) {
        const besoin = new Map<string, number>();
        for (const s of sims.filter(x => x.d.chaine === c.id)) {
            const n = new Map<string, number>();
            for (const op of s.gamme) n.set(op.machineId, (n.get(op.machineId) || 0) + 1);
            n.forEach((v, k) => besoin.set(k, Math.max(besoin.get(k) || 0, v)));
        }
        besoin.forEach((v, mid) => { for (let k = 0; k < v + (['13', '14'].includes(mid) ? 0 : 1); k++) ajouter(mid, c.id); });
    }
    ajouter('4', null, 'PANNE'); ajouter('2', null, 'PANNE'); ajouter('1', null, 'MAINT'); ajouter('10', null, 'OK'); ajouter('4', null, 'OK');
    for (const id of Object.keys(MACHINES)) if (!parc.some(m => m.id === id)) {
        const b = MACHINES[id];
        parc.push({ id, name: b.name, classe: b.classe, speed: b.speed, speedMajor: 1.01, cofs: b.cofs, active: true, status: 'OK', matricule: `BT-REF-${id}`, brand: (MARQUES[b.classe] || [b.name])[0], machineCategory: b.name });
    }
    reglages.chainMachines = chainMachines;
    reglages.ouvriersCoupe = OUVRIERS_COUPE;
    reglages.groupesCoupe = GROUPES_COUPE;
    const pointageCoupe: Record<string, Record<string, { statut: string; entree?: string }>> = {};
    for (let date = '2026-10-01'; date <= AUJOURDHUI; date = jour(date, 1)) {
        if (!ouvrable(date)) continue;
        pointageCoupe[date] = Object.fromEntries(OUVRIERS_COUPE.map(o => {
            const t = alea();
            return [o.id, t < 0.03 ? { statut: 'ABSENT' } : t < 0.08 ? { statut: 'RETARD', entree: `08:${String(10 + Math.floor(alea() * 30)).padStart(2, '0')}` } : { statut: 'PRESENT', entree: `07:${String(45 + Math.floor(alea() * 14)).padStart(2, '0')}` }];
        }));
    }
    reglages.pointageCoupe = pointageCoupe;
    db.prepare("INSERT INTO app_settings (owner_id, key, value) VALUES (?, 'machines_fleet', ?) ON CONFLICT(owner_id, key) DO UPDATE SET value = excluded.value").run(OWNER, JSON.stringify(parc));
    db.prepare("INSERT INTO app_settings (owner_id, key, value) VALUES (?, 'global_settings', ?) ON CONFLICT(owner_id, key) DO UPDATE SET value = excluded.value").run(OWNER, JSON.stringify(reglages));
    bilan.push(`parc : ${parc.length} machines`);
    return bilan;
});

console.log(tx().join('\n'));
// db.ts cree une « personne plateforme » par ouvrier ; celles des ouvriers supprimes ci-dessus restent orphelines.
db.prepare("DELETE FROM platform_person WHERE created_at >= '2026-11-02' AND id NOT IN (SELECT person_id FROM hr_worker_person)").run();
