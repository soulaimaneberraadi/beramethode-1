/**
 * Depot des traces numerotes dans le dossier surveille par le logiciel du traceur.
 *
 * L'outil de trace d'Optitex (et la plupart des spoolers de table de coupe)
 * surveille un dossier : tout .plt qui y tombe part dans sa file d'impression.
 * Le navigateur n'a pas acces au disque ; ce relais ecrit a sa place.
 *
 * Le dossier est fixe cote serveur (TRACEUR_DOSSIER), jamais choisi par le
 * client : sinon n'importe quelle page pourrait ecrire n'importe ou sur la
 * machine de l'atelier.
 */
import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';

const DOSSIER_DEFAUT = 'C:\\BERA_TO_PLOT';
const TAILLE_MAX = 20 * 1024 * 1024;

export const dossierTraceur = (): string => process.env.TRACEUR_DOSSIER?.trim() || DOSSIER_DEFAUT;

/** Nom de fichier nu, sans chemin ni caractere exotique, toujours en .plt. */
export const nomDeTraceSur = (brut: unknown): string => {
    const base = path.basename(String(brut ?? ''))
        .replace(/[^A-Za-z0-9._ -]/g, '_')
        .replace(/^[.\s]+/, '')
        .slice(0, 120);
    const sansExtension = base.replace(/\.(plt|hpgl|hgl|prn)$/i, '').trim();
    return `${sansExtension || 'trace'}.plt`;
};

/**
 * Un meme trace renvoye doit repartir en impression, pas remplacer celui qui
 * attend encore dans la file (ou que le spooler est en train de lire).
 */
const cheminLibre = async (dossier: string, nom: string): Promise<string> => {
    const ext = path.extname(nom);
    const racine = nom.slice(0, -ext.length);
    for (let i = 1; i < 1000; i++) {
        const candidat = path.join(dossier, i === 1 ? nom : `${racine}-${i}${ext}`);
        try {
            await fs.promises.access(candidat);
        } catch {
            return candidat;
        }
    }
    return path.join(dossier, `${racine}-${Date.now()}${ext}`);
};

export const lireDossierTraceur = (_req: Request, res: Response) => {
    res.json({ dossier: dossierTraceur() });
};

export const deposerTrace = async (req: Request, res: Response) => {
    const { nom, donnees } = (req.body || {}) as { nom?: unknown; donnees?: unknown };
    if (typeof donnees !== 'string' || donnees.length === 0) {
        return res.status(400).json({ message: 'Trace vide.' });
    }

    const octets = Buffer.from(donnees, 'base64');
    if (octets.length === 0) return res.status(400).json({ message: 'Trace illisible.' });
    if (octets.length > TAILLE_MAX) return res.status(413).json({ message: 'Trace trop volumineux.' });

    const dossier = dossierTraceur();
    try {
        await fs.promises.mkdir(dossier, { recursive: true });
        const chemin = await cheminLibre(dossier, nomDeTraceSur(nom));
        // Ecrire sous un autre nom puis renommer : le spooler surveille les .plt
        // et saisirait sinon un fichier encore a moitie ecrit.
        const provisoire = `${chemin}.part`;
        await fs.promises.writeFile(provisoire, octets);
        await fs.promises.rename(provisoire, chemin);
        return res.json({ chemin, octets: octets.length });
    } catch (e: any) {
        return res.status(500).json({ message: `Ecriture impossible dans ${dossier} : ${e?.message || e}` });
    }
};
