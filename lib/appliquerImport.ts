/**
 * Un ordre lu dans un classeur Excel (« REPARTOS » du client ou feuille de
 * l'atelier) devient l'ordre de coupe du modele : tailles et quantites,
 * matieres, placements avec leur code client (TE-01...), matelas numerotes.
 *
 * Rien n'est ecrase en silence : un placement deja la (meme code, meme
 * matiere) est mis a jour, les autres s'ajoutent ; « remplacer » ne retire
 * que ce qui n'est pas encore coupe. Pur et teste.
 */
import type { MatelasLine, OrdreCoupe, PlacementCoupe, TissuCoupe } from '../types';
import type { FeuilleImportee } from './importCoupeExcel';
import { TISSU_PRINCIPAL, matelasDuPlacement, numeroSuivant, tissuDe } from './ordreCoupe';
import { nomPlacement } from './planMatelas';

export interface OptionsImport {
    /** Tailles actuelles du modele (leur ordre est garde ; les nouvelles s'ajoutent a la fin). */
    tailles: string[];
    /** Couleur des matelas crees. */
    couleur?: string;
    /** Retirer d'abord les placements et matelas NON coupes des matieres importees. */
    remplacer: boolean;
    /** Plis au plus par matelas (quand le placement n'a pas le sien). */
    maxPlis: number;
}

export interface ResultatImport {
    ordre: OrdreCoupe;
    tailles: string[];
    /** Quantite commandee par taille (cles = tailles du modele). */
    quantites: Record<string, number>;
    resume: { matieres: number; placements: number; matelas: number };
    alertes: string[];
}

const sansAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/** Nom lisible d'une matiere du client. */
function nomMatiere(nom: string): string {
    const n = sansAccents(nom);
    if (/^(TELA|TEJIDO|TISSU)/.test(n)) return 'Tissu';
    if (/^FORRO|^FO$/.test(n)) return 'Doublure (foro)';
    if (/^ENTRETELA|^EN$/.test(n)) return 'Entretela';
    if (/^COMBINADO/.test(n)) return 'Combinado';
    const propre = nom.trim().toLowerCase();
    return propre.charAt(0).toUpperCase() + propre.slice(1);
}

export function appliquerImport(o: OrdreCoupe, f: FeuilleImportee, opt: OptionsImport): ResultatImport {
    const alertes = [...f.alertes];
    const cle = (t: string) => t.trim().toUpperCase();

    // Tailles : on garde celles du modele, on ajoute celles qui manquent.
    const tailles = [...opt.tailles];
    const versModele = new Map(tailles.map(t => [cle(t), t]));
    for (const t of f.tailles) {
        if (!versModele.has(cle(t))) { tailles.push(t); versModele.set(cle(t), t); }
    }
    const enTaillesModele = (r: Record<string, number> | null): Record<string, number> => {
        const out: Record<string, number> = {};
        for (const [t, v] of Object.entries(r || {})) {
            const n = Math.round(Number(v) || 0);
            if (n > 0) { const cible = versModele.get(cle(t)) || t; out[cible] = (out[cible] || 0) + n; }
        }
        return out;
    };
    const quantites: Record<string, number> = {};
    for (const [t, v] of Object.entries(f.quantites || {})) quantites[versModele.get(cle(t)) || t] = Math.max(0, Math.round(Number(v) || 0));

    let tissus: TissuCoupe[] = o.tissus?.length ? o.tissus.map(t => ({ ...t })) : [{ id: TISSU_PRINCIPAL, nom: 'Tissu', recuM: o.tissuRecu || undefined }];
    let placements: PlacementCoupe[] = [...(o.placements || [])];
    let lignes: MatelasLine[] = [...(o.matelasLines || [])];
    let nPlacements = 0, nMatelas = 0, compteur = 0;
    const nouvelId = (prefixe: string) => `${prefixe}-${Date.now().toString(36)}-${(compteur++).toString(36)}`;
    const matieresTouchees = new Set<string>();

    for (const m of f.matieres) {
        // La matiere de l'ordre qui recoit celle du classeur.
        let t: TissuCoupe | undefined;
        if (m.principal) t = tissus.find(x => x.id === TISSU_PRINCIPAL);
        if (!t && m.code) t = tissus.find(x => x.id !== TISSU_PRINCIPAL && (x.code || '').toUpperCase() === m.code!.toUpperCase());
        if (!t) t = tissus.find(x => x.id !== TISSU_PRINCIPAL && sansAccents(x.nom) === sansAccents(nomMatiere(m.nom)) && !x.code);
        if (!t) {
            t = { id: nouvelId('TIS'), nom: nomMatiere(m.nom), code: m.code };
            tissus = [...tissus, t];
        } else if (!t.code && m.code) {
            const id = t.id;
            tissus = tissus.map(x => (x.id === id ? { ...x, code: m.code } : x));
        }
        const tid = t.id;

        if (opt.remplacer && !matieresTouchees.has(tid)) {
            const gardes = new Set(lignes.filter(l => tissuDe(l) === tid && l.fait).map(l => l.placementId));
            placements = placements.filter(p => p.tissu !== tid || gardes.has(p.id));
            lignes = lignes.filter(l => tissuDe(l) !== tid || l.fait);
        }
        matieresTouchees.add(tid);

        if (f.format === 'repartos') {
            for (const pi of m.placements) {
                const ratios = enTaillesModele(pi.ratios);
                const lisible = Object.keys(ratios).length > 0;
                if (pi.aVerifier) alertes.push(`${pi.code} : ${pi.aVerifier}`);
                if (!lisible) alertes.push(`${pi.code} (${pi.taillesTexte} ${pi.ratiosTexte}) : tailles a saisir a la main.`);
                const existant = placements.find(p => p.tissu === tid && (p.code || '').toUpperCase() === pi.code.toUpperCase());
                let p: PlacementCoupe;
                if (existant) {
                    p = { ...existant, ...(lisible ? { ratios, nom: nomPlacement(ratios, tailles) } : {}), longueurM: pi.longueurM ?? existant.longueurM };
                    placements = placements.map(x => (x.id === p.id ? p : x));
                } else {
                    p = {
                        id: nouvelId('PLC'),
                        tissu: tid,
                        code: pi.code,
                        nom: lisible ? nomPlacement(ratios, tailles) : pi.taillesTexte,
                        ratios,
                        longueurM: pi.longueurM,
                    };
                    placements = [...placements, p];
                    nPlacements++;
                }
                const plis = Math.max(0, Math.round(pi.plis || 0));
                if (plis > 0 && lisible) {
                    const nouveaux = matelasDuPlacement(p, opt.couleur, plis, opt.maxPlis, numeroSuivant(lignes, tid))
                        .map(l => ({ ...l, id: nouvelId('MAT'), tissu: tid === TISSU_PRINCIPAL ? undefined : tid }));
                    lignes = [...lignes, ...nouveaux];
                    nMatelas += nouveaux.length;
                }
            }
        } else {
            // Feuille de l'atelier : les matelas sont deja la, un placement par melange de tailles.
            const parMelange = new Map<string, PlacementCoupe>();
            for (const mi of m.matelas) {
                const ratios = enTaillesModele(mi.ratios);
                if (!Object.keys(ratios).length || !(mi.plis > 0)) continue;
                const nom = nomPlacement(ratios, tailles);
                const cleM = `${nom}|${mi.longueurM || 0}`;
                let p = parMelange.get(cleM) || placements.find(x => x.tissu === tid && x.nom === nom && (x.longueurM || 0) === (mi.longueurM || 0));
                if (!p) {
                    p = { id: nouvelId('PLC'), tissu: tid, nom, ratios, longueurM: mi.longueurM || undefined };
                    placements = [...placements, p];
                    nPlacements++;
                }
                parMelange.set(cleM, p);
                lignes = [...lignes, {
                    id: nouvelId('MAT'),
                    couleur: opt.couleur,
                    plis: Math.round(mi.plis),
                    longTracee: mi.longueurM || 0,
                    ratios: { ...ratios },
                    placementId: p.id,
                    tissu: tid === TISSU_PRINCIPAL ? undefined : tid,
                    numero: mi.numero ? String(mi.numero) : String(numeroSuivant(lignes, tid)),
                }];
                nMatelas++;
            }
        }
    }

    return {
        ordre: {
            ...o,
            tissus,
            placements,
            matelasLines: lignes,
            pedido: o.pedido || f.pedido,
            refModele: o.refModele || f.modele || '',
        },
        tailles,
        quantites,
        resume: { matieres: matieresTouchees.size, placements: nPlacements, matelas: nMatelas },
        alertes,
    };
}
