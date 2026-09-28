/**
 * Export de la liste des ordres de coupe : un vrai classeur Excel, relu dans
 * les matelas (voir coupeVues.ts), en trois feuilles :
 *
 *   Ordres          une ligne par ordre : commande, coupe, reste, matelas, metres...
 *   Couleur x Taille ce qu'il reste a couper, case par case
 *   Matelas         chaque matelas du tissu principal et des autres matieres
 *
 * L'ancien CSV lisait des champs que plus rien ne remplit : longueur,
 * consommation, feuilles et matelas sortaient a 0, et la « quantite » etait
 * parfois celle des pieces planifiees.
 */
import type ExcelJS from 'exceljs';
import type { ModelData, PlanningEvent } from '../types';
import { metresLigne, piecesLigne } from './coupeAtelier';
import { bilanOrdre, detailCouleurTaille } from './coupeVues';

const STATUTS: Record<string, string> = {
    EN_PREPARATION: 'Préparation', EN_COURS: 'En cours', SOUS_TRAITANCE: 'Extériorisé', VALIDE: 'Validé', REJETE: 'Rejeté',
};
const jourFr = (iso: string | null | undefined) => {
    if (!iso) return '';
    const t = Date.parse(iso.length === 10 ? iso + 'T00:00:00' : iso);
    if (!Number.isFinite(t)) return '';
    const d = new Date(t);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const heure = (iso?: string) => {
    if (!iso) return '';
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return '';
    const d = new Date(t);
    return `${jourFr(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const arrondi = (n: number | null, k = 2) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10 ** k) / 10 ** k);

function feuille(wb: ExcelJS.Workbook, nom: string, colonnes: { titre: string; largeur: number; format?: string }[]) {
    const ws = wb.addWorksheet(nom, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = colonnes.map(c => ({ header: c.titre, width: c.largeur, style: c.format ? { numFmt: c.format } : {} }));
    const tete = ws.getRow(1);
    tete.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    tete.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    tete.alignment = { vertical: 'middle', wrapText: true };
    tete.height = 30;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colonnes.length } };
    return ws;
}

export async function classeurOrdresCoupe(models: ModelData[], evenements: PlanningEvent[] = [], entreprise?: string): Promise<ArrayBuffer> {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = entreprise || 'BERAMETHODE';
    wb.created = new Date();

    const ENTIER = '#,##0';
    const METRE = '#,##0.00';
    const bilans = models.map(m => ({ m, b: bilanOrdre(m, evenements) }));

    // --- Ordres
    const wo = feuille(wb, 'Ordres', [
        { titre: 'Modèle', largeur: 22 }, { titre: 'Référence', largeur: 16 }, { titre: 'Client', largeur: 16 }, { titre: 'Type', largeur: 12 },
        { titre: 'Statut', largeur: 12 }, { titre: 'Créé le', largeur: 11 }, { titre: 'Lancement couture', largeur: 12 }, { titre: 'Livraison (DDS)', largeur: 12 },
        { titre: 'Commandé (pcs)', largeur: 11, format: ENTIER }, { titre: 'Planifié (pcs)', largeur: 11, format: ENTIER },
        { titre: 'Coupé (pcs)', largeur: 11, format: ENTIER }, { titre: 'Reste à couper', largeur: 11, format: ENTIER },
        { titre: 'Sans matelas (pcs)', largeur: 11, format: ENTIER }, { titre: 'Avancement', largeur: 11, format: '0%' },
        { titre: 'Matelas', largeur: 9, format: ENTIER }, { titre: 'Matelas coupés', largeur: 9, format: ENTIER },
        { titre: 'Tissu prévu (m)', largeur: 12, format: METRE }, { titre: 'Tissu consommé (m)', largeur: 12, format: METRE },
        { titre: 'Tissu reçu (m)', largeur: 12, format: METRE }, { titre: 'Manque (m)', largeur: 11, format: METRE },
        { titre: 'm / pièce', largeur: 9, format: '0.000' }, { titre: 'Efficience tracé', largeur: 10, format: '0.0"%"' },
        { titre: 'Dernière coupe', largeur: 16 }, { titre: 'À vérifier', largeur: 34 },
    ]);
    for (const { b } of bilans) {
        const alertes: string[] = [];
        if (b.enRetard) alertes.push('lancement dépassé');
        if (b.nonPlanifie > 0) alertes.push(`${b.nonPlanifie} pcs sans matelas`);
        if (b.nbSansLongueur > 0) alertes.push(`${b.nbSansLongueur} matelas sans longueur`);
        if (b.manqueM > 0) alertes.push(`manque ${arrondi(b.manqueM, 1)} m de tissu`);
        const r = wo.addRow([
            b.nom, b.reference, b.client, b.type, STATUTS[b.statut] || b.statut, jourFr(b.creeLe), jourFr(b.lancement), jourFr(b.dds),
            b.commande, b.planifie, b.coupe, b.reste, b.nonPlanifie, b.avancement,
            b.nbMatelas, b.nbFaits, arrondi(b.prevuM), arrondi(b.consommeM), b.recuM === null ? null : arrondi(b.recuM), b.manqueM > 0 ? arrondi(b.manqueM) : null,
            arrondi(b.mParPiece, 3), arrondi(b.efficience, 1), heure(b.derniereCoupe || undefined), alertes.join(' · '),
        ]);
        if (b.enRetard) r.getCell(7).font = { bold: true, color: { argb: 'FFDC2626' } };
        if (b.manqueM > 0) r.getCell(20).font = { bold: true, color: { argb: 'FFDC2626' } };
    }
    const n = bilans.length;
    if (n) {
        const tot = wo.addRow([`Total (${n} ordres)`]);
        tot.font = { bold: true };
        const somme = (col: string) => ({ formula: `SUM(${col}2:${col}${n + 1})` });
        for (const col of ['I', 'J', 'K', 'L', 'M', 'O', 'P', 'Q', 'R', 'S', 'T']) tot.getCell(col).value = somme(col) as any;
        tot.getCell('N').value = { formula: `IF(I${n + 2}>0,K${n + 2}/I${n + 2},0)` } as any;
        tot.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    }

    // --- Couleur x Taille
    const wc = feuille(wb, 'Couleur x Taille', [
        { titre: 'Modèle', largeur: 22 }, { titre: 'Client', largeur: 16 }, { titre: 'Statut', largeur: 12 }, { titre: 'Couleur', largeur: 16 },
        { titre: 'Taille', largeur: 9 }, { titre: 'Commandé', largeur: 11, format: ENTIER }, { titre: 'Planifié', largeur: 11, format: ENTIER },
        { titre: 'Coupé', largeur: 11, format: ENTIER }, { titre: 'Reste', largeur: 11, format: ENTIER },
    ]);
    for (const { m, b } of bilans) {
        for (const d of detailCouleurTaille(m)) {
            const r = wc.addRow([b.nom, b.client, STATUTS[b.statut] || b.statut, d.couleur || '—', d.taille, d.commande, d.planifie, d.coupe, d.reste]);
            if (d.planifie < d.commande) r.getCell(7).font = { color: { argb: 'FFD97706' } };
        }
    }

    // --- Matelas
    const wm = feuille(wb, 'Matelas', [
        { titre: 'Modèle', largeur: 22 }, { titre: 'Matière', largeur: 14 }, { titre: 'N°', largeur: 6 }, { titre: 'Tracé', largeur: 10 },
        { titre: 'Tailles', largeur: 18 }, { titre: 'Couleur', largeur: 14 }, { titre: 'Plis', largeur: 7, format: ENTIER },
        { titre: 'Long. tracé (m)', largeur: 10, format: METRE }, { titre: 'Mètres', largeur: 10, format: METRE },
        { titre: 'Mètres réels', largeur: 10, format: METRE }, { titre: 'Pièces', largeur: 9, format: ENTIER },
        { titre: 'État', largeur: 10 }, { titre: 'Début', largeur: 16 }, { titre: 'Fin', largeur: 16 },
    ]);
    for (const { m, b } of bilans) {
        const o = m.ordreCoupe;
        const tissus = new Map((o?.tissus || []).map(t => [t.id, t.nom]));
        const placements = new Map((o?.placements || []).map(p => [p.id, p]));
        (o?.matelasLines || []).forEach((l, i) => {
            const p = l.placementId ? placements.get(l.placementId) : undefined;
            const tailles = Object.entries(l.ratios || {}).filter(([, v]) => Number(v) > 0).map(([t, v]) => (Number(v) > 1 ? `${v}${t}` : t)).join(' ');
            const etat = l.fait ? 'Coupé' : l.envoyeLe ? 'Envoyé' : 'À couper';
            wm.addRow([
                b.nom, l.tissu ? tissus.get(l.tissu) || l.tissu : tissus.get('principal') || 'Tissu', l.numero || String(i + 1), p?.code || '',
                tailles, l.couleur || '', l.plis || 0, l.longTracee || null, arrondi(metresLigne(l)),
                l.metresReels && l.metresReels > 0 ? l.metresReels : null, l.tissu ? null : piecesLigne(l), etat, heure(l.debut), heure(l.fin),
            ]);
        });
    }

    return await wb.xlsx.writeBuffer() as ArrayBuffer;
}
