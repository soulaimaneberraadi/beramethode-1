import { Request, Response } from 'express';
import db from './db';

/**
 * La fiche d'UNE valeur de vente : le magasin, le gros, les especes, la
 * taille 42, le vert emeraude, un modele.
 *
 * Le tableau de bord repond « MAGASIN = 100 % ». La question suivante est
 * toujours la meme : *qu'est-ce qui se vend au magasin, quand, a qui, et
 * est-ce que ca monte ?* Elle se posait jusqu'ici en exportant vers un
 * tableur. Un seul point d'entree la traite pour tous les axes, parce que la
 * reponse est la meme partout : la meme periode, la meme filtration, les
 * memes agregats — seule la colonne du GROUP BY change.
 *
 * Rien n'est recalcule a partir d'un tarif affiche : tout vient des sorties
 * de stock reellement enregistrees, comme le tableau de bord dont cette page
 * est le prolongement. Un chiffre lu ici doit etre le meme qu'en haut.
 */

/** Les axes ouvrables, et la colonne qui les porte. La liste est FERMEE :
 *  elle est interpolee dans le SQL, un nom libre y serait une injection. */
const COLONNE_AXE: Record<string, string> = {
    canal: 's.canal',
    segment: 's.type_vente',
    paiement: 's.mode_paiement',
    taille: 's.taille',
    couleur: 's.couleur',
    modele: 's.modelId',
    client: 's.client_id',
};

const jourLocalISO = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const dateOuNull = (v: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
const num = (v: any) => Number((Number(v) || 0).toFixed(2));

/** La periode precedente de MEME duree, juste avant : sans elle, « 12 400 »
 *  ne dit ni progression ni chute. */
const fenetrePrecedente = (du: string, au: string) => {
    const d = new Date(du + 'T00:00:00').getTime();
    const f = new Date(au + 'T00:00:00').getTime();
    const duree = Math.max(86400000, f - d + 86400000);
    return {
        du: jourLocalISO(new Date(d - duree)),
        au: jourLocalISO(new Date(d - 86400000)),
    };
};

export const getVentesAxe = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const q: any = req.query || {};

    const axe = String(q.axe || '');
    const colonne = COLONNE_AXE[axe];
    if (!colonne) return res.status(400).json({ message: 'Axe inconnu.' });

    // La valeur ouverte. « NON_PRECISE » n'est pas une valeur en base : c'est
    // l'absence de saisie, et elle se cherche avec IS NULL, pas avec '='.
    const valeur = String(q.valeur ?? '');
    const nonRenseigne = valeur === 'NON_PRECISE' || valeur === '—' || valeur === '';

    const au = dateOuNull(q.au) || jourLocalISO(new Date());
    const du = dateOuNull(q.du) || jourLocalISO(new Date(Date.now() - 30 * 86400000));

    // Les filtres de la page restent actifs : ouvrir « ESPECES » depuis une
    // page filtree sur le mois de septembre doit rester le mois de septembre,
    // sinon le detail contredit le total d'ou l'on vient.
    const clauses = ['s.owner_id = ?', 's.date_sortie >= ?', 's.date_sortie <= ?'];
    const params: any[] = [companyId, du, au];
    if (nonRenseigne) {
        clauses.push(`(${colonne} IS NULL OR TRIM(${colonne}) = '' ${axe === 'canal' ? "OR " + colonne + " = 'NON_PRECISE'" : ''})`);
    } else {
        clauses.push(`${colonne} = ?`);
        params.push(valeur);
    }
    for (const [cle, col] of [['canal', 's.canal'], ['segment', 's.type_vente'], ['clientId', 's.client_id']] as const) {
        const v = q[cle] ? String(q[cle]) : '';
        if (v && cle !== axe) { clauses.push(`${col} = ?`); params.push(v); }
    }
    const where = clauses.join(' AND ');

    try {
        const totaux = db.prepare(`
            SELECT SUM(s.quantite) AS pieces,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(s.ticket_ref, s.batch_id, s.id)) AS tickets,
                   COUNT(DISTINCT s.client_id) AS clients,
                   MIN(s.date_sortie) AS premiere,
                   MAX(s.date_sortie) AS derniere,
                   SUM(CASE WHEN COALESCE(s.prix_unitaire, 0) <= 0 THEN s.quantite ELSE 0 END) AS piecesSansPrix
            FROM st_stock_sorties s WHERE ${where}
        `).get(...params) as any;

        // Le total de la PERIODE ENTIERE, tous axes confondus : c'est lui qui
        // donne le « part du total », le seul chiffre qui situe la valeur.
        const clausesTotal = ['s.owner_id = ?', 's.date_sortie >= ?', 's.date_sortie <= ?'];
        const paramsTotal: any[] = [companyId, du, au];
        const global = db.prepare(`
            SELECT SUM(s.quantite) AS pieces,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(s.ticket_ref, s.batch_id, s.id)) AS tickets
            FROM st_stock_sorties s WHERE ${clausesTotal.join(' AND ')}
        `).get(...paramsTotal) as any;

        const p = fenetrePrecedente(du, au);
        const paramsAvant = params.map((v, i) => (i === 1 ? p.du : i === 2 ? p.au : v));
        const avant = db.prepare(`
            SELECT SUM(s.quantite) AS pieces,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(s.ticket_ref, s.batch_id, s.id)) AS tickets
            FROM st_stock_sorties s WHERE ${where}
        `).get(...paramsAvant) as any;

        const serie = db.prepare(`
            SELECT s.date_sortie AS jour,
                   SUM(s.quantite) AS pieces,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(s.ticket_ref, s.batch_id, s.id)) AS tickets
            FROM st_stock_sorties s WHERE ${where}
            GROUP BY s.date_sortie ORDER BY s.date_sortie
        `).all(...params) as any[];

        /** Les autres axes, VUS DEPUIS cette valeur : ce que le magasin vend,
         *  comment il est paye, en quelles tailles. C'est la que se lit une
         *  difference entre deux points de vente. */
        const repartition = (col: string, alias: string) => db.prepare(`
            SELECT COALESCE(NULLIF(TRIM(${col}), ''), 'NON_PRECISE') AS cle,
                   SUM(s.quantite) AS pieces,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(s.ticket_ref, s.batch_id, s.id)) AS tickets
            FROM st_stock_sorties s WHERE ${where}
            GROUP BY COALESCE(NULLIF(TRIM(${col}), ''), 'NON_PRECISE')
            ORDER BY ca DESC LIMIT 40
        `).all(...params).map((r: any) => ({ cle: String(r.cle), alias, pieces: Number(r.pieces) || 0, ca: num(r.ca), tickets: Number(r.tickets) || 0 })) as any[];

        const modeles = db.prepare(`
            SELECT s.modelId AS cle,
                   COALESCE(json_extract(m.data, '$.meta_data.nom_modele'), json_extract(m.data, '$.filename'), s.modelId) AS nom,
                   json_extract(m.data, '$.image') AS image,
                   SUM(s.quantite) AS pieces,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(s.ticket_ref, s.batch_id, s.id)) AS tickets
            FROM st_stock_sorties s
            LEFT JOIN models m ON m.id = s.modelId AND m.owner_id = s.owner_id
            WHERE ${where}
            GROUP BY s.modelId ORDER BY ca DESC LIMIT 40
        `).all(...params) as any[];

        const clients = db.prepare(`
            SELECT COALESCE(NULLIF(TRIM(s.client_nom), ''), c.nom, 'NON_PRECISE') AS nom,
                   s.client_id AS id,
                   SUM(s.quantite) AS pieces,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   COUNT(DISTINCT COALESCE(s.ticket_ref, s.batch_id, s.id)) AS tickets
            FROM st_stock_sorties s
            LEFT JOIN st_clients c ON c.id = s.client_id AND c.owner_id = s.owner_id
            WHERE ${where}
            GROUP BY COALESCE(s.client_id, s.client_nom) ORDER BY ca DESC LIMIT 25
        `).all(...params) as any[];

        // Le rythme de la semaine POUR cette valeur : une boutique qui ne vend
        // que le samedi ne s'organise pas comme une vente en ligne continue.
        const parJourSemaine = db.prepare(`
            SELECT CAST(strftime('%w', s.date_sortie) AS INTEGER) AS jour,
                   SUM(s.quantite * s.prix_unitaire) AS ca,
                   SUM(s.quantite) AS pieces
            FROM st_stock_sorties s WHERE ${where}
            GROUP BY CAST(strftime('%w', s.date_sortie) AS INTEGER)
        `).all(...params) as any[];

        const ca = num(totaux?.ca);
        const pieces = Number(totaux?.pieces) || 0;
        const tickets = Number(totaux?.tickets) || 0;
        const caGlobal = num(global?.ca);

        res.json({
            axe,
            valeur: nonRenseigne ? 'NON_PRECISE' : valeur,
            periode: { du, au },
            kpis: {
                ca,
                pieces,
                tickets,
                panierMoyen: tickets > 0 ? num(ca / tickets) : 0,
                piecesParVente: tickets > 0 ? num(pieces / tickets) : 0,
                prixMoyenPiece: pieces > 0 ? num(ca / pieces) : 0,
                clients: Number(totaux?.clients) || 0,
                piecesSansPrix: Number(totaux?.piecesSansPrix) || 0,
                premiere: totaux?.premiere || null,
                derniere: totaux?.derniere || null,
            },
            part: {
                ca: caGlobal > 0 ? num((ca / caGlobal) * 100) : 0,
                pieces: Number(global?.pieces) > 0 ? num((pieces / Number(global.pieces)) * 100) : 0,
                tickets: Number(global?.tickets) > 0 ? num((tickets / Number(global.tickets)) * 100) : 0,
                caTotal: caGlobal,
            },
            precedent: { du: p.du, au: p.au, ca: num(avant?.ca), pieces: Number(avant?.pieces) || 0, tickets: Number(avant?.tickets) || 0 },
            serie: serie.map(j => ({ jour: String(j.jour), ca: num(j.ca), pieces: Number(j.pieces) || 0, tickets: Number(j.tickets) || 0 })),
            parJourSemaine: parJourSemaine.map(j => ({ jour: Number(j.jour), ca: num(j.ca), pieces: Number(j.pieces) || 0 })),
            axes: {
                canal: axe === 'canal' ? [] : repartition('s.canal', 'canal'),
                segment: axe === 'segment' ? [] : repartition('s.type_vente', 'segment'),
                paiement: axe === 'paiement' ? [] : repartition('s.mode_paiement', 'paiement'),
                taille: axe === 'taille' ? [] : repartition('s.taille', 'taille'),
                couleur: axe === 'couleur' ? [] : repartition('s.couleur', 'couleur'),
            },
            modeles: axe === 'modele' ? [] : modeles.map(m => ({
                cle: String(m.cle), nom: String(m.nom || m.cle), image: m.image || null,
                pieces: Number(m.pieces) || 0, ca: num(m.ca), tickets: Number(m.tickets) || 0,
            })),
            clients: clients.map(c => ({
                id: c.id || null, nom: String(c.nom || 'NON_PRECISE'),
                pieces: Number(c.pieces) || 0, ca: num(c.ca), tickets: Number(c.tickets) || 0,
            })),
        });
    } catch (e: any) {
        res.status(500).json({ message: e?.message || 'Erreur serveur.' });
    }
};
