import { Request, Response } from 'express';
import { randomUUID, randomInt } from 'crypto';
import db from './db';
import { loadUserContext } from './permissionsController';

/**
 * Journee de caisse — le compagnon de l'ecran de vente au comptoir.
 *
 * Trois gestes :
 *   1. LIRE la journee : quels tickets sont passes, et combien a-t-on encaisse
 *      dans chaque mode de reglement. C'est la question qu'on se pose le soir,
 *      la caisse dans les mains.
 *   2. ANNULER un ticket : les pieces reviennent au stock, la facture qui le
 *      couvrait est annulee. Une erreur au comptoir se corrige au comptoir.
 *   3. REGLER autrement qu'en un seul mode : avoir (credit de retour), vente a
 *      credit avec acompte. Voir `st_caisse_reglements` et `st_avoirs`.
 *
 * Un ticket reste un ensemble de sorties de stock qui partagent une
 * `ticket_ref`. Le stock vendable reste « entrees acceptees moins sorties »,
 * donc supprimer les sorties d'un ticket SUFFIT a rendre la marchandise — il
 * n'y a pas de second compteur a remettre d'aplomb, et donc pas de second
 * compteur qui puisse mentir. Seul le REGLEMENT (qui a paye quoi, avec quel
 * moyen) vit dans ses propres tables, parce qu'un ticket n'a qu'un seul
 * `mode_paiement` et qu'un achat peut maintenant etre paye de trois facons.
 */

/** Un ticket sans reference (ventes anterieures a la colonne `ticket_ref`)
 *  retombe sur son lot : c'etait alors la meilleure cle disponible. */
const CLE_TICKET = "COALESCE(s.ticket_ref, s.batch_id, s.id)";

const jourValide = (v: unknown): string => {
    const d = String(v ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date().toISOString().slice(0, 10);
};

const arrondi2 = (n: number) => Math.round(n * 100) / 100;

/** Moyens de reglement qu'un ticket peut porter. AVOIR et CREDIT ne sont PAS de
 *  l'argent dans le tiroir : la journee les range a part. */
const MODES_REGLEMENT = new Set(['ESPECES', 'CARTE', 'CHEQUE', 'VIREMENT', 'AVOIR', 'CREDIT']);
const MODES_HORS_TIROIR = new Set(['AVOIR', 'CREDIT']);

/** Erreur « metier » : on la renvoie telle quelle au comptoir (avec son code),
 *  au lieu de la noyer dans un 500 generique. Levee DANS une transaction, elle
 *  l'annule entierement. */
class Refus extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

/** Un code d'avoir se tape ou se dicte : on le normalise (majuscules, sans
 *  espaces) pour qu'« av-k7m2qp » et « AV-K7M2QP » designent le meme avoir. */
const normaliserCode = (v: unknown): string => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');

/** Alphabet sans 0/O ni 1/I/L : un code lu a voix haute ou sur un ticket
 *  thermique ne doit jamais se confondre avec un autre. */
const ALPHABET_CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genererCodeAvoir = (): string => {
    let s = '';
    for (let i = 0; i < 6; i++) s += ALPHABET_CODE[randomInt(ALPHABET_CODE.length)];
    return `AV-${s}`;
};

/** Code libre pour CETTE entreprise (unique par entreprise). Quelques essais
 *  suffisent : 31^6 combinaisons, et l'index UNIQUE reste le dernier filet. */
const codeAvoirLibre = (companyId: number | string): string => {
    for (let i = 0; i < 12; i++) {
        const code = genererCodeAvoir();
        const pris = db.prepare('SELECT 1 FROM st_avoirs WHERE owner_id = ? AND code = ?').get(companyId, code);
        if (!pris) return code;
    }
    throw new Refus(500, "Impossible de generer un code d'avoir unique, reessayez.");
};

/**
 * Encours d'un client : la MEME formule que `getVentesEncoursClient`
 * (factures VENTE non annulees, TTC moins paye, plancher a 0). Dupliquee ici
 * plutot qu'importee : c'est une requete d'une ligne, et le plafond de credit
 * doit se verifier DANS la transaction du reglement, pas via un second appel.
 */
const encoursDuClient = (companyId: number | string, clientId: string): number => {
    const row = db.prepare(`
        SELECT COALESCE(SUM(MAX(0, total_ttc - COALESCE(montant_paye, 0))), 0) AS encours
        FROM factures
        WHERE owner_id = ? AND type = 'VENTE' AND statut != 'ANNULEE' AND source_id = ?
    `).get(companyId, clientId) as { encours: number } | undefined;
    return arrondi2(Number(row?.encours) || 0);
};

/**
 * Tickets d'une journee, du plus recent au plus ancien, avec leurs lignes.
 *
 * Les totaux par mode de reglement sont calcules ici, sur la MEME lecture que
 * les lignes affichees : un total de cloture qui viendrait d'un second calcul
 * pourrait diverger de la liste sous les yeux du gerant, et c'est de l'argent.
 *
 * `?emplacementId=` borne la journee a UN lieu de vente : vide = Depot
 * principal, `ALL` = tous les lieux, un identifiant = cette boutique. Absent
 * (ancien appelant) = tous, comme avant l'arrivee des emplacements.
 */
export const getCaisseJournal = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const date = jourValide((req.query as any).date);
    // Filtre facultatif par caissier : la cloture de journee se fait souvent
    // caissier par caissier quand le comptoir est tenu a plusieurs.
    const vendeurFiltre = String((req.query as any).vendeurId ?? '').trim();
    // Lieu : `undefined` ≠ chaine vide. Absent = tous (comportement historique),
    // present-vide = Depot principal (ses sorties ont `emplacement_id` NULL).
    const lieuBrut = (req.query as any).emplacementId;
    const lieuTexte = lieuBrut === undefined ? 'ALL' : String(lieuBrut).trim();
    const tousLieux = lieuTexte === 'ALL';
    const lieu = lieuTexte === 'PRINCIPAL' ? '' : lieuTexte;
    try {
        const lignes = db.prepare(`
            SELECT ${CLE_TICKET} AS ticket,
                   s.id, s.modelId, s.couleur, s.taille, s.quantite, s.prix_unitaire,
                   s.client_id, s.client_nom, s.mode_paiement, s.type_vente, s.note,
                   s.facture_id, s.date_sortie, s.created_at, s.retour_de,
                   s.vendeur_id, s.vendeur_nom,
                   COALESCE(json_extract(m.data, '$.meta_data.nom_modele'), json_extract(m.data, '$.filename')) AS model_nom,
                   f.numero AS facture_numero, f.statut AS facture_statut
            FROM st_stock_sorties s
            LEFT JOIN models m ON m.id = s.modelId AND m.user_id = s.owner_id
            LEFT JOIN factures f ON f.id = s.facture_id AND f.owner_id = s.owner_id
            WHERE s.owner_id = ? AND s.canal = 'MAGASIN' AND s.date_sortie = ?
              AND (? = 1 OR COALESCE(s.emplacement_id, '') = ?)
            ORDER BY s.created_at DESC, s.id DESC
        `).all(companyId, date, tousLieux ? 1 : 0, tousLieux ? '' : lieu) as any[];

        // La ventilation des reglements du jour, lue UNE fois : elle dit, ticket
        // par ticket, avec quels moyens la vente a ete payee (avoir, acompte,
        // credit…). Filtree par `date_jour` : un retour d'un autre jour sur le
        // meme ticket ne vient pas gonfler cette journee-ci.
        const reglementsParTicket = new Map<string, Array<{ mode: string; montant: number }>>();
        for (const r of db.prepare(
            'SELECT ticket_ref, mode, montant FROM st_caisse_reglements WHERE owner_id = ? AND date_jour = ?'
        ).all(companyId, date) as any[]) {
            const cle = String(r.ticket_ref);
            const liste = reglementsParTicket.get(cle) || [];
            liste.push({ mode: String(r.mode), montant: Number(r.montant) || 0 });
            reglementsParTicket.set(cle, liste);
        }

        const parTicket = new Map<string, any>();
        for (const l of lignes) {
            const cle = String(l.ticket);
            let t = parTicket.get(cle);
            if (!t) {
                t = {
                    ticket: cle,
                    heure: l.created_at,
                    clientId: l.client_id ?? null,
                    clientNom: l.client_nom ?? null,
                    modePaiement: l.mode_paiement ?? null,
                    typeVente: l.type_vente ?? null,
                    factureId: l.facture_id ?? null,
                    factureNumero: l.facture_numero ?? null,
                    factureStatut: l.facture_statut ?? null,
                    vendeurId: l.vendeur_id != null ? String(l.vendeur_id) : null,
                    vendeurNom: l.vendeur_nom ?? null,
                    // Un ticket qui ne porte QUE des lignes de retour (retour
                    // rejoue un autre jour que la vente d'origine) reste un
                    // ticket a part entiere dans la journee ou il tombe.
                    aDesRetours: false,
                    pieces: 0,
                    total: 0,
                    lignes: [] as any[],
                };
                parTicket.set(cle, t);
            }
            const qte = Number(l.quantite) || 0;
            const pu = Number(l.prix_unitaire) || 0;
            t.pieces += qte;
            t.total += qte * pu;
            if (l.retour_de) t.aDesRetours = true;
            // La facture peut n'etre portee que par une partie des lignes :
            // des qu'une ligne en a une, le ticket est facture.
            if (!t.factureId && l.facture_id) {
                t.factureId = l.facture_id;
                t.factureNumero = l.facture_numero ?? null;
                t.factureStatut = l.facture_statut ?? null;
            }
            // On prend la premiere valeur NON VIDE plutot que celle de la
            // premiere ligne : une vente anterieure a ces colonnes les a
            // nulles, et une seule ligne renseignee suffit a qualifier le
            // ticket.
            if (!t.modePaiement && l.mode_paiement) t.modePaiement = l.mode_paiement;
            if (!t.typeVente && l.type_vente) t.typeVente = l.type_vente;
            if (!t.clientNom && l.client_nom) t.clientNom = l.client_nom;
            if (!t.vendeurNom && l.vendeur_nom) { t.vendeurNom = l.vendeur_nom; t.vendeurId = l.vendeur_id != null ? String(l.vendeur_id) : null; }
            t.lignes.push({
                id: l.id,
                modelId: l.modelId,
                modelNom: l.model_nom || l.modelId,
                couleur: l.couleur,
                taille: l.taille,
                quantite: qte,
                prixUnitaire: pu,
                retour: !!l.retour_de,
            });
        }

        let tickets = [...parTicket.values()].map(t => ({ ...t, total: Number(t.total.toFixed(2)) }));
        if (vendeurFiltre) tickets = tickets.filter(t => (t.vendeurId || 'NON_ATTRIBUE') === vendeurFiltre);

        type Agg = { pieces: number; total: number; tickets: number };
        const parMode: Record<string, Agg> = {};
        // Par caissier, puis par mode DANS le caissier : c'est exactement la
        // question de la cloture a plusieurs postes — « qui a encaisse quoi,
        // et dans quel moyen de paiement ? ». Le total « tous modes » du
        // caissier vient s'ajouter a cote, pour l'annonce rapide.
        const parVendeur: Record<string, { nom: string; pieces: number; total: number; encaisse: number; tickets: number; parMode: Record<string, Agg> }> = {};
        const ajouter = (acc: Record<string, Agg>, mode: string, montant: number, pieces: number, compterTicket: boolean) => {
            const a = acc[mode] || (acc[mode] = { pieces: 0, total: 0, tickets: 0 });
            a.pieces += pieces;
            a.total = Number((a.total + montant).toFixed(2));
            if (compterTicket) a.tickets += 1;
        };

        const ticketsAvecReglements = tickets.map(t => {
            // Les reglements ENREGISTRES, regroupes par mode…
            const regroupes = new Map<string, number>();
            for (const r of reglementsParTicket.get(t.ticket) || []) {
                regroupes.set(r.mode, arrondi2((regroupes.get(r.mode) || 0) + r.montant));
            }
            const somme = [...regroupes.values()].reduce((a, n) => a + n, 0);
            // … et le RESTE non detaille retombe sur le mode du ticket, comme avant
            // cette table : une vente d'avant la ventilation, ou un simple
            // paiement en un seul mode (qui n'ecrit aucune ligne), est comptee
            // en entier sous son mode. Une vente d'avant la colonne
            // `mode_paiement` n'en porte aucun : elle est comptee a part plutot
            // que rangee d'office en especes, ce qui ferait un fond de caisse faux.
            const reste = arrondi2(t.total - somme);
            if (Math.abs(reste) > 0.005) {
                const modeReste = t.modePaiement || 'AUTRE';
                regroupes.set(modeReste, arrondi2((regroupes.get(modeReste) || 0) + reste));
            }
            const reglements = [...regroupes.entries()]
                .filter(([, m]) => Math.abs(m) > 0.005)
                .map(([mode, montant]) => ({ mode, montant }));
            const resteDu = reglements.find(r => r.mode === 'CREDIT')?.montant ?? 0;
            return { ...t, reglements, resteDu: resteDu > 0 ? resteDu : 0 };
        });

        for (const t of ticketsAvecReglements) {
            // Vente anterieure a la colonne `vendeur_id`, ou canal jamais
            // attribue : rangee a part, jamais devinee sur un caissier.
            const vKey = t.vendeurId || 'NON_ATTRIBUE';
            const vAcc = parVendeur[vKey] || (parVendeur[vKey] = { nom: t.vendeurNom || 'Non attribué', pieces: 0, total: 0, encaisse: 0, tickets: 0, parMode: {} });
            vAcc.pieces += t.pieces;
            vAcc.total = Number((vAcc.total + t.total).toFixed(2));
            vAcc.tickets += 1;

            // Les pieces sont portees par le mode principal du ticket (le plus
            // gros montant) : les repartir au prorata n'aurait aucun sens, une
            // piece ne se coupe pas en deux modes de paiement.
            const principal = [...t.reglements].sort((a, b) => Math.abs(b.montant) - Math.abs(a.montant))[0]?.mode
                ?? (t.modePaiement || 'AUTRE');
            const modes = t.reglements.length > 0 ? t.reglements : [{ mode: principal, montant: 0 }];
            for (const r of modes) {
                const piecesIci = r.mode === principal ? t.pieces : 0;
                ajouter(parMode, r.mode, r.montant, piecesIci, true);
                ajouter(vAcc.parMode, r.mode, r.montant, piecesIci, true);
                // « Encaisse » du caissier = de l'argent recu, pas un credit accorde.
                if (!MODES_HORS_TIROIR.has(r.mode)) vAcc.encaisse = Number((vAcc.encaisse + r.montant).toFixed(2));
            }
        }

        const encaisse = Object.entries(parMode)
            .filter(([mode]) => !MODES_HORS_TIROIR.has(mode))
            .reduce((a, [, agg]) => a + agg.total, 0);

        res.json({
            date,
            emplacement: tousLieux ? 'ALL' : lieu,
            tickets: ticketsAvecReglements,
            parMode,
            parVendeur,
            totaux: {
                tickets: tickets.length,
                pieces: tickets.reduce((a, t) => a + t.pieces, 0),
                // Valeur des ventes du jour (credit et avoir compris)…
                total: Number(tickets.reduce((a, t) => a + t.total, 0).toFixed(2)),
                // … dont l'argent REELLEMENT recu (especes, carte, cheque, virement),
                // ce que le gerant compare a son tiroir et a sa banque…
                encaisse: Number(encaisse.toFixed(2)),
                // … ce qui est reste du par les clients, et ce qui a ete regle en
                // avoir (net : utilise moins emis ce jour-la).
                aCredit: Number((parMode.CREDIT?.total ?? 0).toFixed(2)),
                avoirs: Number((parMode.AVOIR?.total ?? 0).toFixed(2)),
            },
        });
    } catch (error) {
        console.error('Get caisse journal error:', error);
        res.status(500).json({ message: 'Error fetching cash journal' });
    }
};

/**
 * Rend ce qu'un ticket a consomme et efface sa ventilation de reglement.
 * A appeler DANS une transaction : un avoir restitue sans que la ventilation
 * disparaisse (ou l'inverse) fausserait le solde de l'avoir.
 *
 * Seules les lignes AVOIR a montant POSITIF sont des consommations a rendre ;
 * les montants negatifs sont des avoirs EMIS par un retour, geres a part par
 * l'appelant (on ne les « rend » pas : on les annule).
 */
const rendreReglementsDuTicket = (companyId: number | string, ticket: string) => {
    const lignes = db.prepare(
        'SELECT avoir_id, montant FROM st_caisse_reglements WHERE owner_id = ? AND ticket_ref = ? AND avoir_id IS NOT NULL AND montant > 0'
    ).all(companyId, ticket) as any[];
    const rendre = db.prepare(`
        UPDATE st_avoirs
        SET montant_utilise = MAX(0, montant_utilise - ?),
            statut = CASE WHEN statut = 'SOLDE' AND MAX(0, montant_utilise - ?) < montant - 0.005 THEN 'OUVERT' ELSE statut END
        WHERE id = ? AND owner_id = ? AND statut != 'ANNULE'
    `);
    for (const l of lignes) rendre.run(l.montant, l.montant, l.avoir_id, companyId);
    db.prepare('DELETE FROM st_caisse_reglements WHERE owner_id = ? AND ticket_ref = ?').run(companyId, ticket);
};

/**
 * Annule un ticket entier : les pieces reviennent au stock disponible et la
 * facture qui le couvrait passe en ANNULEE.
 *
 * Refus si un reglement a deja ete enregistre sur cette facture : effacer la
 * vente laisserait un encaissement orphelin, c'est-a-dire de l'argent recu
 * sans contrepartie. Dans ce cas on passe par un avoir, pas par une
 * suppression silencieuse. Exception : les reglements NES AU COMPTOIR avec ce
 * ticket (reference `CAISSE:…`) font partie de la vente annulee, ils partent
 * avec elle — sinon aucune vente facturee ne serait jamais annulable.
 *
 * Un avoir consomme par ce ticket est rendu a son proprietaire ; un avoir
 * EMIS par un retour de ce ticket est annule, sauf s'il a deja servi (on ne
 * peut pas reprendre un credit deja depense).
 */
export const annulerTicketCaisse = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const ticket = String(req.params.ticket || '').trim();
    if (!ticket) return res.status(400).json({ message: 'Ticket manquant' });

    try {
        const lignes = db.prepare(`
            SELECT s.id, s.facture_id FROM st_stock_sorties s
            WHERE s.owner_id = ? AND s.canal = 'MAGASIN' AND ${CLE_TICKET} = ?
        `).all(companyId, ticket) as any[];

        if (lignes.length === 0) return res.status(404).json({ message: 'Ticket introuvable' });

        const factureIds = [...new Set(lignes.map(l => l.facture_id).filter(Boolean))] as string[];
        for (const fid of factureIds) {
            const paye = db.prepare("SELECT COALESCE(SUM(montant), 0) AS total FROM paiements WHERE owner_id = ? AND facture_id = ? AND COALESCE(reference, '') NOT LIKE 'CAISSE:%'")
                .get(companyId, fid) as any;
            if ((Number(paye?.total) || 0) > 0) {
                return res.status(400).json({
                    message: "Ce ticket porte une facture deja reglee : annulez le reglement, ou etablissez un avoir.",
                    code: 'FACTURE_REGLEE',
                });
            }
        }

        // Un avoir emis par un retour de ce ticket et deja entame ne peut plus
        // etre repris : le client en a depense une partie.
        const avoirsEmis = db.prepare("SELECT id, code, montant_utilise FROM st_avoirs WHERE owner_id = ? AND ticket_ref = ? AND statut != 'ANNULE'")
            .all(companyId, ticket) as any[];
        const entame = avoirsEmis.find(a => (Number(a.montant_utilise) || 0) > 0.005);
        if (entame) {
            return res.status(400).json({
                message: `L'avoir ${entame.code} emis sur ce ticket a deja ete utilise : le ticket ne peut plus etre annule.`,
                code: 'AVOIR_UTILISE',
            });
        }

        // Transaction : rendre la moitie des pieces et laisser la facture
        // debout serait pire que ne rien annuler du tout.
        db.transaction(() => {
            for (const fid of factureIds) {
                db.prepare("DELETE FROM paiements WHERE owner_id = ? AND facture_id = ? AND COALESCE(reference, '') LIKE 'CAISSE:%'")
                    .run(companyId, fid);
                db.prepare("UPDATE factures SET statut = 'ANNULEE', montant_paye = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
                    .run(fid, companyId);
            }
            for (const a of avoirsEmis) {
                db.prepare("UPDATE st_avoirs SET statut = 'ANNULE' WHERE id = ? AND owner_id = ?").run(a.id, companyId);
            }
            rendreReglementsDuTicket(companyId, ticket);
            db.prepare("DELETE FROM st_stock_sorties WHERE owner_id = ? AND canal = 'MAGASIN' AND COALESCE(ticket_ref, batch_id, id) = ?")
                .run(companyId, ticket);
        })();

        res.json({ message: 'Ticket annule', lignes: lignes.length, facturesAnnulees: factureIds.length });
    } catch (error) {
        console.error('Cancel caisse ticket error:', error);
        res.status(500).json({ message: 'Error cancelling ticket' });
    }
};

/**
 * Un ticket, quel que soit le jour ou il est tombe — contrairement au
 * journal (borne a une journee), c'est ce qu'il faut pour retrouver une
 * vente de la semaine derniere au moment ou le client revient avec sa pièce.
 *
 * Chaque ligne d'origine (retour_de IS NULL) porte le « restant » encore
 * retournable : la quantite vendue moins tout ce qui a deja ete retourne
 * dessus. C'est ce chiffre, calcule ICI et nulle part cote client, qui
 * empeche de retourner deux fois la meme piece.
 */
export const getCaisseTicket = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const ticket = String(req.params.ticket || '').trim();
    if (!ticket) return res.status(400).json({ message: 'Ticket manquant' });

    try {
        const lignes = db.prepare(`
            SELECT s.id, s.modelId, s.couleur, s.taille, s.quantite, s.prix_unitaire,
                   s.client_id, s.client_nom, s.mode_paiement, s.type_vente, s.retour_de,
                   s.vendeur_nom, s.date_sortie, s.created_at,
                   COALESCE(json_extract(m.data, '$.meta_data.nom_modele'), json_extract(m.data, '$.filename')) AS model_nom
            FROM st_stock_sorties s
            LEFT JOIN models m ON m.id = s.modelId AND m.user_id = s.owner_id
            WHERE s.owner_id = ? AND s.canal = 'MAGASIN' AND ${CLE_TICKET} = ?
            ORDER BY s.created_at ASC, s.id ASC
        `).all(companyId, ticket) as any[];

        if (lignes.length === 0) return res.status(404).json({ message: 'Ticket introuvable' });

        // Deja retourne, par ligne d'origine : la somme (negative) des retours
        // qui la pointent.
        const dejaRetourne = new Map<string, number>();
        for (const l of lignes) {
            if (!l.retour_de) continue;
            const cle = String(l.retour_de);
            dejaRetourne.set(cle, (dejaRetourne.get(cle) || 0) + (Number(l.quantite) || 0));
        }

        const origines = lignes.filter(l => !l.retour_de && Number(l.quantite) > 0);
        const premiere = lignes[0];

        res.json({
            ticket,
            clientId: premiere.client_id ?? null,
            clientNom: premiere.client_nom ?? null,
            modePaiement: premiere.mode_paiement ?? null,
            typeVente: premiere.type_vente ?? null,
            vendeurNom: premiere.vendeur_nom ?? null,
            dateSortie: premiere.date_sortie ?? null,
            // Un ticket paye (meme en partie) a credit ou par avoir ne se rembourse
            // pas en especes : le tiroir n'a pas recu cet argent. L'ecran s'en sert
            // pour ne proposer que l'avoir ; le serveur le REFUSE de toute facon.
            avoirObligatoire: ticketSansEspecesRemboursables(companyId, ticket),
            lignes: origines.map(l => {
                const qte = Number(l.quantite) || 0;
                const retourne = Math.abs(dejaRetourne.get(String(l.id)) || 0);
                return {
                    sortieId: String(l.id),
                    modelId: l.modelId,
                    modelNom: l.model_nom || l.modelId,
                    couleur: l.couleur,
                    taille: l.taille,
                    quantite: qte,
                    prixUnitaire: Number(l.prix_unitaire) || 0,
                    dejaRetourne: retourne,
                    restant: Math.max(0, qte - retourne),
                };
            }),
        });
    } catch (error) {
        console.error('Get caisse ticket error:', error);
        res.status(500).json({ message: 'Error fetching ticket' });
    }
};

/** Vrai si une partie de ce ticket a ete reglee a credit ou par avoir. */
const ticketSansEspecesRemboursables = (companyId: number | string, ticket: string): boolean => {
    const row = db.prepare(
        "SELECT 1 AS x FROM st_caisse_reglements WHERE owner_id = ? AND ticket_ref = ? AND mode IN ('CREDIT','AVOIR') AND montant > 0 LIMIT 1"
    ).get(companyId, ticket);
    return !!row;
};

/**
 * Retour (partiel ou total) d'un ticket : le client rapporte une ou
 * plusieurs pieces, et une piece rapportee doit redevenir vendable SANS
 * jamais toucher a la vente d'origine — c'est elle qui reste la preuve de ce
 * qui a ete vendu, a qui, et a quel prix.
 *
 * Chaque ligne de retour est une sortie a quantite NEGATIVE, copiee de la
 * ligne d'origine (modele, couleur, taille, prix, segment, client), avec
 * `retour_de` pointant vers elle. La matrice de stock (entrees - sorties)
 * la remet donc en stock automatiquement, et le chiffre d'affaires du jour
 * en tient compte des qu'elle est ecrite — aucun second calcul a maintenir.
 *
 * `remboursement` : 'ESPECES' (defaut, comportement historique : le tiroir
 * rend l'argent) ou 'AVOIR' (le client garde un credit, code imprime sur le
 * ticket de retour). L'avoir est cree dans la MEME transaction que les lignes
 * de retour : jamais une piece rendue sans credit, ni un credit sans piece.
 */
export const retournerTicketCaisse = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const body = req.body || {};
    const ticket = String(body.ticket_ref || '').trim();
    const demandes: Array<{ sortieId: string; quantite: number }> = (Array.isArray(body.lignes) ? body.lignes : [])
        .map((l: any) => ({ sortieId: String(l.sortie_id || l.sortieId || ''), quantite: Math.floor(Number(l.quantite) || 0) }))
        .filter((l: any) => l.sortieId && l.quantite > 0);

    if (!ticket) return res.status(400).json({ message: 'Ticket manquant' });
    if (demandes.length === 0) return res.status(400).json({ message: 'Aucune quantité à retourner' });

    const motif = String(body.motif || '').trim() || null;
    const vendeurId = (req as any).user?.id ?? null;
    const vendeurNom = (req as any).user?.name ?? null;
    const enAvoir = String(body.remboursement ?? '').trim().toUpperCase() === 'AVOIR';

    try {
        // Un ticket paye a credit ou par avoir ne se rembourse pas en especes :
        // le tiroir n'a jamais recu cet argent, rendre des especes le viderait.
        if (!enAvoir && ticketSansEspecesRemboursables(companyId, ticket)) {
            return res.status(400).json({
                message: "Ce ticket a ete regle a credit ou par avoir : le retour se fait par avoir, pas en especes.",
                code: 'AVOIR_OBLIGATOIRE',
            });
        }

        // Chaque ligne d'origine visee, avec ce qu'elle a deja rendu — la
        // MEME requete que la lecture du ticket, pour ne jamais autoriser un
        // retour que l'ecran de lecture n'aurait pas laisse voir.
        const ids = demandes.map(d => d.sortieId);
        const placeholders = ids.map(() => '?').join(',');
        const origines = db.prepare(`
            SELECT s.* FROM st_stock_sorties s
            WHERE s.owner_id = ? AND s.canal = 'MAGASIN' AND s.retour_de IS NULL
              AND ${CLE_TICKET} = ? AND s.id IN (${placeholders})
        `).all(companyId, ticket, ...ids) as any[];

        const parId = new Map(origines.map(o => [String(o.id), o]));
        for (const d of demandes) {
            const o = parId.get(d.sortieId);
            if (!o) return res.status(404).json({ message: `Ligne ${d.sortieId} introuvable sur ce ticket` });
        }

        const dejaParId = new Map<string, number>();
        if (ids.length > 0) {
            const rows = db.prepare(`
                SELECT retour_de, COALESCE(SUM(quantite), 0) AS total FROM st_stock_sorties
                WHERE owner_id = ? AND retour_de IN (${placeholders}) GROUP BY retour_de
            `).all(companyId, ...ids) as any[];
            for (const r of rows) dejaParId.set(String(r.retour_de), Math.abs(Number(r.total) || 0));
        }

        for (const d of demandes) {
            const o = parId.get(d.sortieId)!;
            const restant = (Number(o.quantite) || 0) - (dejaParId.get(d.sortieId) || 0);
            if (d.quantite > restant) {
                return res.status(400).json({
                    message: `${o.couleur || '—'} / ${o.taille || '—'} : ${restant} pièce(s) encore retournable(s), ${d.quantite} demandée(s)`,
                });
            }
        }

        const date = new Date().toISOString().split('T')[0];
        const insert = db.prepare(`
            INSERT INTO st_stock_sorties (
                id, owner_id, modelId, client_id, client_nom, couleur, taille, quantite, prix_unitaire,
                batch_id, note, date_sortie, canal, mode_paiement, type_vente, ticket_ref, retour_de,
                vendeur_id, vendeur_nom, emplacement_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const batchId = randomUUID();
        let montant = 0;
        const lignesRetournees: any[] = [];
        let avoir: { id: string; code: string; montant: number } | null = null;
        db.transaction(() => {
            for (const d of demandes) {
                const o = parId.get(d.sortieId)!;
                const pu = Number(o.prix_unitaire) || 0;
                const qteNeg = -Math.abs(d.quantite);
                const id = randomUUID();
                insert.run(
                    id, companyId, o.modelId, o.client_id || null, o.client_nom || null,
                    o.couleur, o.taille, qteNeg, pu, batchId,
                    motif ? `RETOUR ${ticket} : ${motif}` : `RETOUR ${ticket}`,
                    date, 'MAGASIN', o.mode_paiement || null, o.type_vente || null, ticket, d.sortieId,
                    vendeurId, vendeurNom,
                    // La pièce revient là d'où elle est partie : l'emplacement de
                    // la vente d'origine (NULL = Dépôt principal, comme avant).
                    o.emplacement_id || null,
                );
                montant += Math.abs(d.quantite) * pu;
                lignesRetournees.push({
                    id, sortieId: d.sortieId, modelId: o.modelId, couleur: o.couleur, taille: o.taille,
                    quantite: qteNeg, prixUnitaire: pu,
                });
            }

            if (enAvoir && montant > 0.004) {
                const montantAvoir = arrondi2(montant);
                const avoirId = randomUUID();
                const code = codeAvoirLibre(companyId);
                db.prepare(`
                    INSERT INTO st_avoirs (id, owner_id, code, client_id, ticket_ref, montant, montant_utilise, statut, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, 0, 'OUVERT', ?)
                `).run(avoirId, companyId, code, origines[0]?.client_id || null, ticket, montantAvoir, vendeurId != null ? String(vendeurId) : null);
                // Montant NEGATIF : ce retour a ete « rembourse » en credit. La
                // journee y lit un avoir EMIS, et non de l'argent sorti du tiroir.
                db.prepare(`
                    INSERT INTO st_caisse_reglements (id, owner_id, ticket_ref, date_jour, mode, montant, avoir_id)
                    VALUES (?, ?, ?, ?, 'AVOIR', ?, ?)
                `).run(randomUUID(), companyId, ticket, date, -montantAvoir, avoirId);
                avoir = { id: avoirId, code, montant: montantAvoir };
            }
        })();

        res.json({
            ticket,
            batchId,
            montant: Number(montant.toFixed(2)),
            lignes: lignesRetournees,
            remboursement: avoir ? 'AVOIR' : 'ESPECES',
            avoir,
        });
    } catch (error) {
        if (error instanceof Refus) return res.status(error.status).json({ message: error.message, code: error.code });
        console.error('Caisse retour error:', error);
        res.status(500).json({ message: 'Error recording return' });
    }
};

/* ────────────────────────────────────────────────────────────────────────────
 *  AVOIRS ET VENTILATION DES REGLEMENTS
 * ──────────────────────────────────────────────────────────────────────────── */

const avoirVersJson = (a: any) => {
    const montant = Number(a.montant) || 0;
    const utilise = Number(a.montant_utilise) || 0;
    return {
        id: String(a.id),
        code: String(a.code),
        clientId: a.client_id ?? null,
        clientNom: a.client_nom ?? null,
        ticketRef: a.ticket_ref ?? null,
        montant: arrondi2(montant),
        montantUtilise: arrondi2(utilise),
        // Un avoir annule ou solde n'a plus rien a donner, quel que soit l'ecart
        // d'arrondi entre `montant` et `montant_utilise`.
        restant: a.statut === 'OUVERT' ? Math.max(0, arrondi2(montant - utilise)) : 0,
        statut: String(a.statut),
        createdAt: a.created_at ?? null,
    };
};

/** Lit UN avoir par son code — c'est ce que le comptoir appelle pour afficher
 *  « il reste X » avant de l'appliquer. Ne consomme rien. */
export const getAvoirCaisse = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const code = normaliserCode(req.params.code);
    if (!code) return res.status(400).json({ message: 'Code avoir manquant' });
    try {
        const a = db.prepare(`
            SELECT a.*, c.nom AS client_nom
            FROM st_avoirs a
            LEFT JOIN st_clients c ON c.id = a.client_id AND c.owner_id = a.owner_id
            WHERE a.owner_id = ? AND a.code = ?
        `).get(companyId, code) as any;
        if (!a) return res.status(404).json({ message: 'Avoir introuvable' });
        res.json(avoirVersJson(a));
    } catch (error) {
        console.error('Get avoir error:', error);
        res.status(500).json({ message: 'Error fetching credit note' });
    }
};

/** Les avoirs encore OUVERTS : ce que le magasin doit encore a ses clients.
 *  Affiche dans la Journee, parce que c'est une dette au meme titre que le
 *  credit consenti. */
export const listAvoirsCaisse = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    try {
        const rows = db.prepare(`
            SELECT a.*, c.nom AS client_nom
            FROM st_avoirs a
            LEFT JOIN st_clients c ON c.id = a.client_id AND c.owner_id = a.owner_id
            WHERE a.owner_id = ? AND a.statut = 'OUVERT'
            ORDER BY a.created_at DESC, a.code ASC
            LIMIT 300
        `).all(companyId) as any[];
        const avoirs = rows.map(avoirVersJson).filter(a => a.restant > 0.004);
        res.json({
            avoirs,
            total: Number(avoirs.reduce((s, a) => s + a.restant, 0).toFixed(2)),
        });
    } catch (error) {
        console.error('List avoirs error:', error);
        res.status(500).json({ message: 'Error listing credit notes' });
    }
};

/**
 * Enregistre COMMENT un ticket va etre regle, moyen par moyen, et CONSOMME les
 * avoirs utilises — le tout dans une seule transaction.
 *
 * Appelee AVANT les sorties de stock : si l'avoir est insuffisant ou deja
 * depense, rien n'est vendu. Le contrôle et la decrementation de l'avoir sont
 * UNE seule instruction SQL conditionnelle (`... WHERE reste >= montant`) : deux
 * caisses qui utilisent le meme code au meme instant ne peuvent pas toutes les
 * deux reussir, quel que soit l'ordre des requetes.
 *
 * Pour la part A CREDIT, le plafond du client est rejoue ICI (l'ecran est
 * contournable) : un vendeur est bloque ; un proprietaire/admin ne depasse que
 * s'il l'a confirme explicitement (`depasser_plafond`).
 */
export const enregistrerReglementsCaisse = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const body = req.body || {};
    const ticket = String(body.ticket_ref || '').trim().slice(0, 40);
    if (!ticket) return res.status(400).json({ message: 'Ticket manquant' });
    const jour = jourValide(body.date_jour);

    const lignes: Array<{ mode: string; montant: number; code: string | null }> = [];
    for (const r of Array.isArray(body.reglements) ? body.reglements : []) {
        const mode = String(r?.mode ?? '').trim().toUpperCase();
        const montant = arrondi2(Number(r?.montant));
        if (!MODES_REGLEMENT.has(mode) || !Number.isFinite(montant) || montant <= 0) {
            return res.status(400).json({ message: 'Reglement invalide : mode inconnu ou montant non positif.' });
        }
        lignes.push({ mode, montant, code: mode === 'AVOIR' ? normaliserCode(r?.avoir_code) : null });
    }
    if (lignes.length === 0) return res.status(400).json({ message: 'Aucun reglement a enregistrer.' });
    if (lignes.filter(l => l.mode === 'CREDIT').length > 1) {
        return res.status(400).json({ message: 'Une seule part a credit par ticket.' });
    }
    if (lignes.some(l => l.mode === 'AVOIR' && !l.code)) {
        return res.status(400).json({ message: "Code d'avoir manquant." });
    }
    // La ventilation doit couvrir EXACTEMENT le total annonce : un ecart serait
    // de l'argent qui n'est range dans aucune colonne de la journee.
    const somme = arrondi2(lignes.reduce((a, l) => a + l.montant, 0));
    if (body.total !== undefined && Math.abs(somme - arrondi2(Number(body.total) || 0)) > 0.011) {
        return res.status(400).json({ message: `Les reglements (${somme.toFixed(2)}) ne couvrent pas le total (${arrondi2(Number(body.total) || 0).toFixed(2)}).` });
    }
    const clientId = String(body.client_id ?? '').trim() || null;
    const depasser = body.depasser_plafond === true;

    try {
        const avoirsUtilises: Array<{ code: string; restant: number }> = [];

        db.transaction(() => {
            // Rejeu d'un meme ticket : on refuse plutot que de consommer deux fois.
            const deja = db.prepare('SELECT 1 FROM st_caisse_reglements WHERE owner_id = ? AND ticket_ref = ? LIMIT 1').get(companyId, ticket);
            if (deja) throw new Refus(409, 'Ce ticket a deja un reglement enregistre.', 'REGLEMENT_EXISTANT');

            const credit = lignes.find(l => l.mode === 'CREDIT');
            if (credit) {
                if (!clientId) throw new Refus(400, 'Une vente a credit exige un client.', 'CLIENT_REQUIS');
                const client = db.prepare('SELECT id, nom, plafond_credit FROM st_clients WHERE id = ? AND owner_id = ?').get(clientId, companyId) as any;
                if (!client) throw new Refus(400, 'Client introuvable.', 'CLIENT_REQUIS');
                const plafond = client.plafond_credit != null ? Number(client.plafond_credit) : null;
                if (plafond != null) {
                    const encours = encoursDuClient(companyId, clientId);
                    if (encours + credit.montant > plafond + 0.005) {
                        const detail = `encours ${encours.toFixed(2)} + ce credit ${credit.montant.toFixed(2)} > plafond ${plafond.toFixed(2)}`;
                        const meta = loadUserContext((req as any).user?.id, (req as any).user?.role);
                        // Propriétaire / admin : seul à pouvoir dépasser — et seulement
                        // après confirmation explicite. Un vendeur est bloqué, point.
                        if (!meta.isSuper) {
                            throw new Refus(400, `Plafond de credit depasse (${detail}). Demandez a un responsable.`, 'PLAFOND_DEPASSE');
                        }
                        if (!depasser) {
                            throw new Refus(400, `Plafond de credit depasse (${detail}) : confirmez le depassement.`, 'PLAFOND_DEPASSE');
                        }
                    }
                }
            }

            const consommer = db.prepare(`
                UPDATE st_avoirs
                SET montant_utilise = montant_utilise + ?,
                    statut = CASE WHEN montant_utilise + ? >= montant - 0.005 THEN 'SOLDE' ELSE statut END
                WHERE id = ? AND owner_id = ? AND statut = 'OUVERT' AND (montant - montant_utilise) >= ? - 0.005
            `);
            const insReglement = db.prepare(`
                INSERT INTO st_caisse_reglements (id, owner_id, ticket_ref, date_jour, mode, montant, avoir_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            for (const l of lignes) {
                let avoirId: string | null = null;
                if (l.mode === 'AVOIR') {
                    const a = db.prepare('SELECT * FROM st_avoirs WHERE owner_id = ? AND code = ?').get(companyId, l.code) as any;
                    if (!a) throw new Refus(404, `Avoir ${l.code} introuvable.`, 'AVOIR_INTROUVABLE');
                    if (a.statut !== 'OUVERT') throw new Refus(400, `Avoir ${l.code} deja ${a.statut === 'SOLDE' ? 'entierement utilise' : 'annule'}.`, 'AVOIR_INDISPONIBLE');
                    const info = consommer.run(l.montant, l.montant, a.id, companyId, l.montant);
                    if (info.changes !== 1) {
                        const reste = Math.max(0, arrondi2((Number(a.montant) || 0) - (Number(a.montant_utilise) || 0)));
                        throw new Refus(400, `Avoir ${l.code} insuffisant : il reste ${reste.toFixed(2)}.`, 'AVOIR_INSUFFISANT');
                    }
                    avoirId = String(a.id);
                    avoirsUtilises.push({ code: String(l.code), restant: Math.max(0, arrondi2((Number(a.montant) || 0) - (Number(a.montant_utilise) || 0) - l.montant)) });
                }
                insReglement.run(randomUUID(), companyId, ticket, jour, l.mode, l.montant, avoirId);
            }
        }).immediate();

        res.json({
            ticket,
            reglements: lignes.map(l => ({ mode: l.mode, montant: l.montant })),
            avoirs: avoirsUtilises,
        });
    } catch (error) {
        if (error instanceof Refus) return res.status(error.status).json({ message: error.message, code: error.code });
        console.error('Enregistrer reglements caisse error:', error);
        res.status(500).json({ message: 'Error recording payment split' });
    }
};

/**
 * Defait la ventilation d'un ticket qui N'A PAS ETE vendu (les sorties ont
 * echoue juste apres la consommation d'un avoir) : l'avoir est rendu. Refuse
 * si le ticket existe — une vente enregistree s'annule par la Journee, qui sait
 * aussi rendre la facture et le stock.
 */
export const annulerReglementsCaisse = (req: Request, res: Response) => {
    const companyId = (req as any).companyId ?? (req as any).user.id;
    const ticket = String(req.params.ticket || '').trim();
    if (!ticket) return res.status(400).json({ message: 'Ticket manquant' });
    try {
        const vendu = db.prepare("SELECT 1 FROM st_stock_sorties WHERE owner_id = ? AND canal = 'MAGASIN' AND ticket_ref = ? LIMIT 1").get(companyId, ticket);
        if (vendu) {
            return res.status(409).json({ message: 'Ce ticket existe : annulez-le depuis la journee.', code: 'TICKET_EXISTANT' });
        }
        db.transaction(() => rendreReglementsDuTicket(companyId, ticket)).immediate();
        res.json({ message: 'Reglements annules' });
    } catch (error) {
        console.error('Annuler reglements caisse error:', error);
        res.status(500).json({ message: 'Error cancelling payment split' });
    }
};
