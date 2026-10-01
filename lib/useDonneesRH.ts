/**
 * Donnees RH lues une fois par page : ouvriers (chaine, nom), pointage,
 * competences. Elles donnent l'effectif d'une chaine quand la page Effectifs
 * n'a rien pour le jour (voir effectifChaine.ts), les noms proposes pour le
 * responsable de ligne et la verification des competences de la gamme.
 *
 * Un compte sans acces a la Gestion RH recoit des refus : on rend alors null
 * et les pages fonctionnent sans ces donnees (et le disent).
 */
import { useEffect, useState } from 'react';
import type { DonneesRH } from './effectifChaine';

export type DonneesRHCompletes = DonneesRH & { workers: any[]; skills: any[] | null };

const lire = async (url: string): Promise<any[] | null> => {
    try {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) return null;
        const d = await r.json();
        return Array.isArray(d) ? d : null;
    } catch {
        return null;
    }
};

export function useDonneesRH(avecCompetences = false): DonneesRHCompletes | null {
    const [rh, setRh] = useState<DonneesRHCompletes | null>(null);
    useEffect(() => {
        let annule = false;
        (async () => {
            const [workers, pointages, skills] = await Promise.all([
                lire('/api/hr/workers'),
                lire('/api/hr/pointage'),
                avecCompetences ? lire('/api/worker-skills') : Promise.resolve(null),
            ]);
            if (annule || !workers) return;
            setRh({ workers, pointages: pointages || [], skills });
        })();
        return () => { annule = true; };
    }, [avecCompetences]);
    return rh;
}
