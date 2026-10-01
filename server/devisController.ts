import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import db from './db';
import { verifierVenteSousCout } from './commercialPolicy';

/**
 * Devis → vente, en UNE transaction.
 *
 * Avant : l'écran postait une sortie de stock par modèle (`/stock-sorties`) puis
 * ré-enregistrait le devis en ACCEPTE. Une coupure réseau entre les deux laissait
 * le stock sorti ET le devis encore transformable — la deuxième tentative sortait
 * le stock une seconde fois. Ici, le contrôle de stock, les sorties et le passage
 * du devis en ACCEPTE sont validés ensemble ou pas du tout, et un devis déjà
 * ACCEPTE est refusé (409) au lieu d'être rejoué.
 */

/** Refus métier levé DANS la transaction : il l'annule (rien n'est écrit) et
 *  porte le statut HTTP + le corps JSON à renvoyer. */
class DevisRefus extends Error {
    status: number;
    body: Record<string, unknown>;
    constructor(status: number, body: Record<string, unknown>) {
        super(String(body.message ?? 'Refus'));
        this.status = status;
        this.body = body;
    }
}

/** Identifiants de lots écrits dans les notes à la conversion
 *  (« Transformé en vente (lot <uuid>, <uuid>) »). Les relire permet de
 *  répondre à un deuxième clic sans jamais refaire de sortie. */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const lotsDepuisNotes = (notes: unknown): string[] => {
    const txt = String(notes ?? '');
    const idx = txt.lastIndexOf('(lot ');
    const segment = idx === -1 ? txt : txt.slice(idx);
    return [...new Set(segment.match(UUID_RE) || [])];
};

/** Nom lisible d'un modèle pour la liste des manques — meilleur effort : un
 *  modèle supprimé ou illisible retombe sur son identifiant. */
const nomModele = (companyId: number | string, modelId: string): string => {
    try {
        const row = db.prepare('SELECT data FROM models WHERE id = ? AND user_id = ?')
            .get(modelId, companyId) as { data?: string } | undefined;
        const nom = row?.data ? JSON.parse(row.data)?.meta_data?.nom_modele : null;
        return nom ? String(nom) : modelId;
    } catch {
        return modelId;
    }
};

interface LigneDevis {
    modelId: string;
    couleur: string | null;
    taille: string | null;
    quantite: number;
    prix_unitaire: number;
}

export const convertirDevis = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const factureId = String(req.params.factureId || '');
    if (!factureId) return res.status(400).json({ message: 'Identifiant du devis manquant' });

    // Même identité de vendeur que `createStockSortie` : celle du COMPTE connecté,
    // jamais une valeur fournie par l'écran.
    const vendeurId = (req as any).user?.id ?? null;
    const vendeurNom = (req as any).user?.name ?? null;

    try {
        const resultat = db.transaction(() => {
            // 1. Le devis : propriété de CETTE entreprise, et de type DEVIS.
            //    Un id d'une autre entreprise répond « introuvable », comme s'il
            //    n'existait pas — on ne révèle pas son existence.
            const devis = db.prepare('SELECT * FROM factures WHERE id = ? AND owner_id = ?')
                .get(factureId, companyId) as any;
            if (!devis || devis.type !== 'DEVIS') {
                throw new DevisRefus(404, { message: 'Devis introuvable' });
            }

            // 2. Statut : ACCEPTE = déjà transformé. On répond 409 AVEC les lots
            //    existants (idempotent), sans rien sortir une deuxième fois.
            if (devis.statut === 'ACCEPTE') {
                throw new DevisRefus(409, {
                    message: 'Ce devis est déjà transformé en vente.',
                    code: 'DEJA_CONVERTI',
                    batch_ids: lotsDepuisNotes(devis.notes),
                });
            }
            if (devis.statut === 'REFUSE' || devis.statut === 'ANNULEE') {
                throw new DevisRefus(409, {
                    message: devis.statut === 'REFUSE'
                        ? 'Ce devis a été refusé : il ne peut plus être transformé en vente.'
                        : 'Ce devis est annulé : il ne peut plus être transformé en vente.',
                    code: 'STATUT_INTERDIT',
                });
            }

            // 3. Les lignes. Chaque ligne porte modelId/couleur/taille/quantite/
            //    prix_unitaire (voir `submitDevis` d'EntitySheet). Une ligne sans
            //    modèle ne peut pas sortir du stock : on refuse plutôt que de
            //    l'ignorer en silence (le devis serait « accepté » avec un manque).
            let brutes: any[];
            try {
                const parsed = JSON.parse(devis.lignes || '[]');
                brutes = Array.isArray(parsed) ? parsed : [];
            } catch {
                throw new DevisRefus(422, { message: 'Les lignes du devis sont illisibles.' });
            }
            const lignes: LigneDevis[] = [];
            for (const l of brutes) {
                const quantite = Math.floor(Number(l?.quantite) || 0);
                if (quantite <= 0) continue;
                const modelId = String(l?.modelId ?? '').trim();
                if (!modelId) {
                    throw new DevisRefus(422, { message: `Une ligne du devis n'est rattachée à aucun modèle (${String(l?.designation ?? 'sans désignation')}).` });
                }
                lignes.push({
                    modelId,
                    couleur: l.couleur || null,
                    taille: l.taille || null,
                    quantite,
                    prix_unitaire: Number(l.prix_unitaire) || 0,
                });
            }
            if (lignes.length === 0) {
                throw new DevisRefus(400, { message: 'Aucune quantité dans ce devis.' });
            }

            // 3 bis. La remise du devis n'est portee que par ses totaux : les
            //    lignes gardent le prix AVANT remise. Les reprendre telles quelles
            //    gonflait le chiffre d'affaires de la vente (et le prix servant a
            //    un retour). On repartit donc le total HT du devis sur les lignes,
            //    au prorata, au centime pres (plus grand reste), et une ligne dont
            //    le montant ne se divise pas par sa quantite part en deux prix
            //    voisins : la somme des sorties = le HT du devis, exactement.
            const cibleHt = Number(devis.total_ht);
            if (Number.isFinite(cibleHt) && cibleHt >= 0) {
                const bruts = lignes.map(l => l.quantite * l.prix_unitaire);
                const sommeBruts = bruts.reduce((a, b) => a + b, 0);
                const cible = Math.round(cibleHt * 100);
                if (sommeBruts > 0 && cible !== Math.round(sommeBruts * 100)) {
                    const parts = bruts.map(b => (b / sommeBruts) * cible);
                    const centimes = parts.map(Math.floor);
                    let reste = cible - centimes.reduce((a, c) => a + c, 0);
                    parts.map((p, i) => ({ i, f: p - Math.floor(p) }))
                        .sort((x, y) => y.f - x.f)
                        .forEach(({ i }) => { if (reste > 0) { centimes[i] += 1; reste -= 1; } });
                    const reparties: LigneDevis[] = [];
                    lignes.forEach((l, i) => {
                        const base = Math.floor(centimes[i] / l.quantite);
                        const enPlus = centimes[i] - base * l.quantite;
                        if (l.quantite - enPlus > 0) reparties.push({ ...l, quantite: l.quantite - enPlus, prix_unitaire: base / 100 });
                        if (enPlus > 0) reparties.push({ ...l, quantite: enPlus, prix_unitaire: (base + 1) / 100 });
                    });
                    lignes.splice(0, lignes.length, ...reparties);
                }
            }

            // Lignes regroupées par modèle : un lot (batch) par modèle, comme
            // `submitSortie` — c'est ce qui garde la suppression par lot cohérente.
            const parModele = new Map<string, LigneDevis[]>();
            lignes.forEach(l => {
                const arr = parModele.get(l.modelId) || [];
                arr.push(l);
                parModele.set(l.modelId, arr);
            });

            // 4. Garde-fou « vente à perte », rejoué modèle par modèle — même
            //    fonction que `createStockSortie`, donc mêmes réglages et même
            //    formule de coût. La note du devis ne porte pas de motif : en
            //    politique CONFIRM, une ligne sous le plancher est refusée avec
            //    le message habituel (le devis reste ouvert).
            const note = `Devis ${devis.numero}`;
            for (const [modelId, lignesModele] of parModele) {
                const verdict = verifierVenteSousCout(companyId, modelId, lignesModele, note);
                if (verdict.refuse) {
                    throw new DevisRefus(400, { message: verdict.message, code: 'VENTE_SOUS_COUT', policy: verdict.policy });
                }
            }

            // 5. Stock disponible AU DÉPÔT PRINCIPAL, cellule par cellule. Même
            //    règle que `createStockSortie` : entrées ACCEPTED − sorties, les
            //    deux filtrées sur emplacement vide (NULL = Dépôt principal).
            //    Lecture DANS la transaction : aucune vente concurrente ne peut
            //    s'intercaler entre ce contrôle et l'écriture des sorties.
            const entrees = db.prepare(
                "SELECT modelId, couleur, taille, COALESCE(SUM(quantite),0) AS q FROM st_stock_entries WHERE owner_id = ? AND qualite = 'ACCEPTED' AND COALESCE(emplacement_id,'') = '' GROUP BY modelId, couleur, taille"
            ).all(companyId) as any[];
            const sorties = db.prepare(
                "SELECT modelId, couleur, taille, COALESCE(SUM(quantite),0) AS q FROM st_stock_sorties WHERE owner_id = ? AND COALESCE(emplacement_id,'') = '' GROUP BY modelId, couleur, taille"
            ).all(companyId) as any[];
            const key = (m: any, c: any, t: any) => `${String(m ?? '')}|${String(c ?? '')}|${String(t ?? '')}`;
            const dispo = new Map<string, number>();
            entrees.forEach(r => dispo.set(key(r.modelId, r.couleur, r.taille), (dispo.get(key(r.modelId, r.couleur, r.taille)) || 0) + Number(r.q)));
            sorties.forEach(r => dispo.set(key(r.modelId, r.couleur, r.taille), (dispo.get(key(r.modelId, r.couleur, r.taille)) || 0) - Number(r.q)));

            // Une même case peut apparaître sur plusieurs lignes du devis : le
            // contrôle porte sur la SOMME demandée par case, pas ligne par ligne.
            const demande = new Map<string, LigneDevis>();
            lignes.forEach(l => {
                const k = key(l.modelId, l.couleur, l.taille);
                const d = demande.get(k) || { ...l, quantite: 0 };
                d.quantite += l.quantite;
                demande.set(k, d);
            });
            const manques: Array<{ modelId: string; modelNom: string; couleur: string; taille: string; dispo: number; demande: number; manque: number }> = [];
            for (const [k, d] of demande) {
                const disponible = Math.max(0, dispo.get(k) || 0);
                if (disponible < d.quantite) {
                    manques.push({
                        modelId: d.modelId,
                        modelNom: nomModele(companyId, d.modelId),
                        couleur: d.couleur || '—',
                        taille: d.taille || '—',
                        dispo: disponible,
                        demande: d.quantite,
                        manque: d.quantite - disponible,
                    });
                }
            }
            if (manques.length > 0) {
                throw new DevisRefus(400, {
                    message: `Stock insuffisant pour ${manques.length} cellule(s) du devis : ${manques.map(m => `${m.modelNom} ${m.couleur}/${m.taille} (${m.dispo} dispo, ${m.demande} demandé)`).join(' ; ')}`,
                    code: 'STOCK_INSUFFISANT',
                    cells: manques,
                });
            }

            // 6. Client : la fiche du registre si le devis y renvoie (source_id) et
            //    qu'elle appartient bien à CETTE entreprise ; sinon seulement le
            //    nom figé sur le devis. Un id étranger n'est jamais recopié.
            let clientId: string | null = null;
            let clientNom: string | null = devis.tiers_nom || null;
            if (devis.source_id) {
                const fiche = db.prepare('SELECT id, nom FROM st_clients WHERE id = ? AND owner_id = ?')
                    .get(String(devis.source_id), companyId) as { id: string; nom: string } | undefined;
                if (fiche) {
                    clientId = fiche.id;
                    clientNom = fiche.nom || clientNom;
                }
            }

            // 7. Écriture des sorties : un lot par modèle, type GROS, canal NULL
            //    (vente d'atelier, comme `submitSortie`), prix de chaque ligne.
            const date = new Date().toISOString().split('T')[0];
            const insert = db.prepare(`
                INSERT INTO st_stock_sorties (id, owner_id, modelId, client_id, client_nom, couleur, taille, quantite, prix_unitaire, batch_id, facture_id, note, date_sortie, canal, mode_paiement, type_vente, ticket_ref, vendeur_id, vendeur_nom, emplacement_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const batchIds: string[] = [];
            let count = 0;
            for (const [modelId, lignesModele] of parModele) {
                const batchId = randomUUID();
                batchIds.push(batchId);
                for (const l of lignesModele) {
                    insert.run(randomUUID(), companyId, modelId, clientId, clientNom, l.couleur, l.taille, l.quantite, l.prix_unitaire,
                        batchId, null, note, date, null, null, 'GROS', null, vendeurId, vendeurNom, null);
                    count += 1;
                }
            }

            // 8. Le devis passe en ACCEPTE dans la MÊME transaction. La clause
            //    `statut = ?` rejoue le contrôle du point 2 au moment d'écrire :
            //    si une autre écriture a changé le statut entre-temps, aucune
            //    ligne n'est modifiée et tout est annulé.
            const notesFinales = `${devis.notes ? devis.notes + ' — ' : ''}Transformé en vente (lot ${batchIds.join(', ')})`;
            const maj = db.prepare("UPDATE factures SET statut = 'ACCEPTE', notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ? AND statut IS ?")
                .run(notesFinales, factureId, companyId, devis.statut ?? null);
            if (maj.changes !== 1) {
                throw new DevisRefus(409, { message: 'Le devis a été modifié entre-temps : réessayez.', code: 'CONFLIT' });
            }

            return { batch_ids: batchIds, count, devis_id: factureId, numero: devis.numero as string, statut: 'ACCEPTE', notes: notesFinales };
        }).immediate();

        res.json(resultat);
    } catch (error) {
        if (error instanceof DevisRefus) return res.status(error.status).json(error.body);
        console.error('Convertir devis error:', error);
        res.status(500).json({ message: 'Erreur lors de la transformation du devis en vente' });
    }
};
