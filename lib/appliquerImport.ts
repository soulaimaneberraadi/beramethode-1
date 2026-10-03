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
import { notationListe, tailleDansNotation, trouverTaille, type NotationTailles, type PaireTaille } from './correspondanceTailles';

export interface OptionsImport {
    /** Tailles actuelles du modele (leur ordre est garde ; les nouvelles s'ajoutent a la fin). */
    tailles: string[];
    /** Couleur des matelas crees. */
    couleur?: string;
    /** Retirer d'abord les placements et matelas NON coupes des matieres importees. */
    remplacer: boolean;
    /** Plis au plus par matelas (quand le placement n'a pas le sien). */
    maxPlis: number;
    /** Correspondance lettres <-> nombres de l'usine (celle d'usage si absente). */
    table?: PaireTaille[];
    /**
     * Notation du modele : une taille du classeur qu'il n'a pas encore s'y ajoute
     * ecrite ainsi (« XS » devient « 34 » dans un modele en nombres). Absent : celle
     * des tailles du modele ; un modele sans taille prend celle du classeur.
     */
    notation?: NotationTailles;
}

export interface ResultatImport {
    ordre: OrdreCoupe;
    tailles: string[];
    /** Quantite commandee par taille (cles = tailles du modele). */
    quantites: Record<string, number>;
    resume: { matieres: number; placements: number; matelas: number };
    alertes: string[];
    /** Tailles du classeur rangees dans une autre ecriture du modele (« XS » -> « 34 ») : a montrer a l'atelier. */
    conversions: { de: string; vers: string }[];
}

/**
 * Compteur du module, pas de l'appel : plusieurs feuilles d'un meme classeur
 * s'importent a la suite dans la meme milliseconde, et un compteur local
 * redonnait « TIS-xxx-0 » a la matiere de chaque feuille (la doublure et
 * l'entretoile se confondaient en une seule).
 */
let sequenceIds = 0;

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

    // Tailles : on garde celles du modele, on y range celles du classeur — meme ecriture d'abord, puis
    // l'equivalent de la table (« XS » dans un modele en « 34 ») — et on ajoute seulement celles qui manquent,
    // ecrites comme le modele (jamais deux jeux de tailles dans une meme commande).
    const tailles = [...opt.tailles];
    const notation = opt.notation ?? notationListe(tailles).notation ?? notationListe(f.tailles).notation;
    const versModele = new Map<string, string>();
    const conversions: { de: string; vers: string }[] = [];
    for (const t of f.tailles) {
        let cible = trouverTaille(t, tailles, opt.table);
        if (cible === undefined) {
            cible = tailleDansNotation(t, notation, opt.table);
            // La colonne existe peut-etre deja sous cette ecriture (deux tailles du classeur qui se rejoignent).
            cible = trouverTaille(cible, tailles, opt.table) ?? cible;
            if (!tailles.includes(cible)) tailles.push(cible);
        }
        versModele.set(t, cible);
        if (cible.trim().toUpperCase() !== t.trim().toUpperCase()) conversions.push({ de: t, vers: cible });
    }
    const versTaille = (t: string): string => versModele.get(t) ?? trouverTaille(t, tailles, opt.table) ?? t;
    const enTaillesModele = (r: Record<string, number> | null): Record<string, number> => {
        const out: Record<string, number> = {};
        for (const [t, v] of Object.entries(r || {})) {
            const n = Math.round(Number(v) || 0);
            if (n > 0) { const cible = versTaille(t); out[cible] = (out[cible] || 0) + n; }
        }
        return out;
    };
    const quantites: Record<string, number> = {};
    for (const [t, v] of Object.entries(f.quantites || {})) {
        const cible = versTaille(t);
        quantites[cible] = (quantites[cible] || 0) + Math.max(0, Math.round(Number(v) || 0));
    }
    if (conversions.length) alertes.push(`Tailles du classeur rangees selon la correspondance lettres/nombres : ${conversions.map(c => `${c.de} → ${c.vers}`).join(', ')}.`);

    let tissus: TissuCoupe[] = o.tissus?.length ? o.tissus.map(t => ({ ...t })) : [{ id: TISSU_PRINCIPAL, nom: 'Tissu', recuM: o.tissuRecu || undefined }];
    let placements: PlacementCoupe[] = [...(o.placements || [])];
    let lignes: MatelasLine[] = [...(o.matelasLines || [])];
    let nPlacements = 0, nMatelas = 0;
    const nouvelId = (prefixe: string) => `${prefixe}-${Date.now().toString(36)}-${(sequenceIds++).toString(36)}`;
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
        conversions,
    };
}
