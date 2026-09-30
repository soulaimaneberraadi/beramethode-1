/**
 * Paquet d'export d'un ou plusieurs modeles AVEC tout ce qui leur est lie
 * dans le programme (Planning, Suivi, Sous-traitance, ...).
 *
 * Un modele, c'est d'abord sa fiche : Fiche technique, Gamme, Chrono,
 * Equilibrage, Implantation, Couts, Pedido et l'ordre de coupe vivent tous
 * dans `ModelData`. Mais d'autres pages gardent leurs propres lignes qui
 * pointent vers lui (`modelId`). Un export qui n'emporterait que la fiche
 * rendrait, a l'import, un modele sans ses OF, sans son suivi, sans sa
 * commande de sous-traitance.
 *
 * Ce fichier est PUR (pas de React, pas de reseau) : lecture d'un fichier et
 * renumerotation des identifiants a l'import.
 */
import type { ModelData } from '../types';

/** Ce qui est rattache a un modele ailleurs que dans sa fiche. */
export interface LinkedSummary {
    /** OF / lots du Planning */
    planning: number;
    /** Suivis de production */
    suivis: number;
    /** Demandes d'approvisionnement */
    demandes: number;
    /** Commandes de sous-traitance */
    sousTraitance: number;
    /** Releves du Suivi par poste */
    postesSuivi: number;
    /** Liens manuels de l'Implantation */
    liensImplantation: number;
    total: number;
}

export type DeleteScope = 'model' | 'all';

export const TYPE_PAQUET = 'BERAMETHODE_MODELES';

export interface LiensModele {
    planning: any[];
    suivis: any[];
    demandes: any[];
    sousTraitance: any[];
    postesSuivi: any[];
    liensImplantation: any[];
}

export interface EntreePaquet {
    modele: ModelData;
    liens: LiensModele;
}

export interface PaquetModeles {
    type: typeof TYPE_PAQUET;
    version: 1;
    exportedAt: string;
    app: 'BERAMETHODE';
    modeles: EntreePaquet[];
}

export const liensVides = (): LiensModele => ({
    planning: [], suivis: [], demandes: [], sousTraitance: [], postesSuivi: [], liensImplantation: [],
});

const tableau = (v: unknown): any[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);
const estModele = (v: any): v is ModelData => !!v && typeof v === 'object' && !!v.meta_data;

export const resumerLiens = (liste: LiensModele[]): LinkedSummary => {
    const s: LinkedSummary = { planning: 0, suivis: 0, demandes: 0, sousTraitance: 0, postesSuivi: 0, liensImplantation: 0, total: 0 };
    for (const l of liste) {
        s.planning += l.planning.length;
        s.suivis += l.suivis.length;
        s.demandes += l.demandes.length;
        s.sousTraitance += l.sousTraitance.length;
        s.postesSuivi += l.postesSuivi.length;
        s.liensImplantation += l.liensImplantation.length;
    }
    s.total = s.planning + s.suivis + s.demandes + s.sousTraitance + s.postesSuivi + s.liensImplantation;
    return s;
};

/**
 * Tout ce qu'un fichier peut contenir, ramene a une liste d'entrees :
 *  - un paquet BERAMETHODE_MODELES (un ou plusieurs modeles + leurs liens) ;
 *  - un modele seul (ancien « Exporter (JSON) ») ;
 *  - un tableau de modeles ;
 *  - une sauvegarde complete (on n'en prend que les modeles).
 * Un fichier qui n'est rien de tout cela rend une liste vide.
 */
export function lirePaquet(json: any): EntreePaquet[] {
    if (!json || typeof json !== 'object') return [];
    if (json.type === TYPE_PAQUET && Array.isArray(json.modeles)) {
        return json.modeles
            .filter((e: any) => estModele(e?.modele))
            .map((e: any) => ({
                modele: e.modele,
                liens: {
                    planning: tableau(e.liens?.planning),
                    suivis: tableau(e.liens?.suivis),
                    demandes: tableau(e.liens?.demandes),
                    sousTraitance: tableau(e.liens?.sousTraitance),
                    postesSuivi: tableau(e.liens?.postesSuivi),
                    liensImplantation: tableau(e.liens?.liensImplantation),
                },
            }));
    }
    if (json.type === 'BERAMETHODE_FULL_BACKUP' && Array.isArray(json.data?.library)) {
        return json.data.library.filter(estModele).map((m: ModelData) => ({ modele: m, liens: liensVides() }));
    }
    if (Array.isArray(json)) return json.filter(estModele).map((m: ModelData) => ({ modele: m, liens: liensVides() }));
    if (estModele(json)) return [{ modele: json, liens: liensVides() }];
    return [];
}

export const nouvelId = (prefixe: string) => `${prefixe}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Identifiants deja occupes ici (ou marques supprimes), par nature de ligne. */
export interface IdsOccupes {
    modeles: Set<string>;
    planning: Set<string>;
    suivis: Set<string>;
    demandes: Set<string>;
}

export interface ImportPrepare {
    modele: ModelData;
    planning: any[];
    suivis: any[];
    demandes: any[];
    /** Commandes a creer ; `ancienId` sert a recabler la fiche du modele. */
    sousTraitance: { ancienId: string; commande: any }[];
    postesSuivi: any[];
    liensImplantation: any[];
}

/**
 * Prepare une entree pour l'import : chaque ligne garde son identifiant s'il
 * est libre, sinon elle en recoit un neuf — et TOUTES les references suivent
 * (le suivi pointe vers le bon OF, l'OF vers le bon modele).
 *
 * Un identifiant deja pris ferait REMPLACER une ligne existante ; celui d'une
 * ligne supprimee serait aussitot re-efface par sa pierre tombale a la
 * synchro suivante. Dans les deux cas on renumerote. `occupes` est mis a jour
 * au fil de l'eau : deux modeles du meme fichier ne peuvent pas se marcher
 * dessus.
 */
export function preparerImport(entree: EntreePaquet, occupes: IdsOccupes): ImportPrepare {
    const garder = (id: unknown, pris: Set<string>, prefixe: string) => {
        const s = id == null ? '' : String(id);
        const final = !s || pris.has(s) ? nouvelId(prefixe) : s;
        pris.add(final);
        return final;
    };

    // Toutes les lignes de l'entree appartiennent a CE modele : elles suivent son identifiant.
    const modeleId = garder(entree.modele.id, occupes.modeles, 'imp');

    const cartePlanning = new Map<string, string>();
    const planning = entree.liens.planning.map(ev => {
        const id = garder(ev.id, occupes.planning, 'of');
        if (ev.id != null) cartePlanning.set(String(ev.id), id);
        return { ...ev, id, modelId: modeleId };
    });
    const versOF = (v: unknown) => (v != null && cartePlanning.has(String(v)) ? cartePlanning.get(String(v))! : v);

    const suivis = entree.liens.suivis.map(s => ({
        ...s,
        id: garder(s.id, occupes.suivis, 'suivi'),
        modelId: modeleId,
        planningId: versOF(s.planningId),
    }));

    const demandes = entree.liens.demandes.map(d => ({
        ...d,
        id: garder(d.id, occupes.demandes, 'DA'),
        modelId: modeleId,
    }));

    // Les releves par poste et les commandes ne sont references par personne
    // d'autre que la fiche : identifiant neuf, toujours.
    const postesSuivi = entree.liens.postesSuivi.map(p => ({
        ...p,
        id: nouvelId('ps'),
        modelId: modeleId,
        planningId: versOF(p.planningId),
    }));
    const sousTraitance = entree.liens.sousTraitance.map(o => ({
        ancienId: String(o.id ?? ''),
        commande: { ...o, id: nouvelId('st'), modelId: modeleId },
    }));

    const modele: ModelData = {
        ...entree.modele,
        id: modeleId,
        updatedAt: new Date().toISOString(),
        meta_data: { ...entree.modele.meta_data },
    };

    return { modele, planning, suivis, demandes, sousTraitance, postesSuivi, liensImplantation: entree.liens.liensImplantation };
}

/** Nom de fichier lisible et sans caracteres interdits par Windows. */
export const nomFichierPaquet = (modeles: ModelData[]): string => {
    const date = new Date();
    const jour = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (modeles.length === 1) {
        const nom = (modeles[0].meta_data?.nom_modele || 'modele').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'modele';
        return `${nom}.json`;
    }
    return `beramethode_${modeles.length}_modeles_${jour}.json`;
};
