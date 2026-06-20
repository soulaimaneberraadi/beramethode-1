import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import db from './db';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './jwtConfig';
import { ensurePersonLinkAfterWorkerUpsert } from './hrIdentityController';
import { calculerHeures, type HeuresResult } from '../lib/calculerHeuresPointage';
import { getSageTimesForHeuresCalc } from '../lib/sageTimeRules';
import { getSageRulesForUser } from './sageConfig';
import { monthYMBounds, sagePayRowForOwnerAndPointage, type SageMoisPointageRow } from './sageMonthPay';
export type { HeuresResult } from '../lib/calculerHeuresPointage';

const newHrId = () => `hr-${randomUUID()}`;
const uuidv4 = newHrId;

/** Ne jamais exposer `pin_hash` au client. */
function sanitizeHrWorkerRow(row: Record<string, unknown>): Record<string, unknown> {
    const o = { ...row };
    delete o.pin_hash;
    return o;
}

// ==========================================
// WORKERS CRUD
// ==========================================

export const getHRWorkers = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const companyId = (req as any).companyId;
    try {
        const { search, role, chaine, active } = req.query as Record<string, string>;
        console.log('[getHRWorkers] Called by user:', userId, 'company:', companyId, 'query:', req.query);
        let q =
            'SELECT w.*, l.person_id AS person_id, t.nom AS transport_ligne_nom, t.quartier AS transport_ligne_quartier FROM hr_workers w LEFT JOIN hr_worker_person l ON l.hr_worker_id = w.id LEFT JOIN hr_transport_lignes t ON t.id = w.transport_ligne_id WHERE w.owner_id = ?';
        const params: any[] = [companyId];
        if (active === '1') { q += ' AND w.is_active = 1'; }
        if (role) { q += ' AND w.role = ?'; params.push(role); }
        if (chaine) { q += ' AND w.chaine_id = ?'; params.push(chaine); }
        if (search) {
            q += ' AND (w.full_name LIKE ? OR w.matricule LIKE ? OR w.cin LIKE ?)';
            const like = `%${search}%`;
            params.push(like, like, like);
        }
        q += ' ORDER BY w.full_name ASC';
        const rows = db.prepare(q).all(...params) as Record<string, unknown>[];
        console.log('[getHRWorkers] Returning', rows.length, 'workers.');
        res.json(rows.map(sanitizeHrWorkerRow));
    } catch (error) {
        console.error('[getHRWorkers] Error:', error);
        res.status(500).json({ message: 'Erreur' });
    }
};

export const getHRWorkerById = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    try {
        const worker = db
            .prepare(
                `SELECT w.*, l.person_id AS person_id,
            CASE WHEN w.pin_hash IS NOT NULL AND length(trim(w.pin_hash)) > 0 THEN 1 ELSE 0 END AS has_pin
         FROM hr_workers w
         LEFT JOIN hr_worker_person l ON l.hr_worker_id = w.id
         WHERE w.id = ? AND w.owner_id = ?`
            )
            .get(req.params.id, companyId) as Record<string, unknown> | undefined;
        res.json(worker ? sanitizeHrWorkerRow(worker) : null);
    } catch(e) {
        res.status(500).json({message: 'Erreur'});
    }
};

export const saveHRWorker = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const companyId = (req as any).companyId;
    const data = req.body;

    // Seat licensing validation
    const isEnforced = process.env.VITE_LICENSE_ENFORCE === 'true';
    if (isEnforced) {
        let maxWorkers = 0;
        try {
            const row = db.prepare("SELECT value FROM app_settings WHERE owner_id = ? AND key = 'bera_license'").get(companyId) as { value: string } | undefined;
            if (row?.value) {
                const license = JSON.parse(row.value);
                maxWorkers = typeof license.max_workers === 'number' ? license.max_workers : 0;
            }
        } catch (e) {}

        if (maxWorkers > 0) {
            const isActivating = data.is_active !== false && data.is_active !== 0;
            const existing = db.prepare('SELECT is_active FROM hr_workers WHERE id = ? AND owner_id = ?').get(data.id || '', companyId) as { is_active: number } | undefined;
            const wasActive = existing ? !!existing.is_active : false;

            if (isActivating && !wasActive) {
                const activeCountRow = db.prepare('SELECT COUNT(*) as c FROM hr_workers WHERE owner_id = ? AND is_active = 1').get(companyId) as { c: number };
                if (activeCountRow.c >= maxWorkers) {
                    return res.status(403).json({ message: `Limite de licence atteinte : maximum ${maxWorkers} ouvriers actifs.` });
                }
            }
        }
    }

    try {
        const workerId = data.id || uuidv4();
        db.prepare(`
            INSERT INTO hr_workers (
                id, matricule, full_name, cin, cnss, phone, date_naissance, adresse, photo,
                sexe, role, chaine_id, poste, specialite, equipe, transport_ligne_id, date_embauche, type_contrat, date_fin_contrat,
                date_renouvellement, is_active, contact_urgence_nom, contact_urgence_tel, contact_urgence_lien,
                salaire_base, taux_horaire, taux_piece, prime_assiduite, prime_transport, mode_paiement, owner_id,
                created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                matricule = excluded.matricule, full_name = excluded.full_name, cin = excluded.cin, cnss = excluded.cnss,
                phone = excluded.phone, date_naissance = excluded.date_naissance, adresse = excluded.adresse, photo = excluded.photo,
                sexe = excluded.sexe, role = excluded.role, chaine_id = excluded.chaine_id, poste = excluded.poste, specialite = excluded.specialite,
                equipe = excluded.equipe,
                transport_ligne_id = excluded.transport_ligne_id,
                date_embauche = excluded.date_embauche, type_contrat = excluded.type_contrat, date_fin_contrat = excluded.date_fin_contrat,
                date_renouvellement = excluded.date_renouvellement, is_active = excluded.is_active,
                contact_urgence_nom = excluded.contact_urgence_nom, contact_urgence_tel = excluded.contact_urgence_tel, contact_urgence_lien = excluded.contact_urgence_lien,
                salaire_base = excluded.salaire_base, taux_horaire = excluded.taux_horaire, taux_piece = excluded.taux_piece,
                prime_assiduite = excluded.prime_assiduite, prime_transport = excluded.prime_transport, mode_paiement = excluded.mode_paiement,
                updated_by = excluded.updated_by
        `).run(
            workerId, data.matricule, data.full_name, data.cin || null, data.cnss || null, data.phone || null,
            data.date_naissance || null, data.adresse || null, data.photo || null, data.sexe || 'M', data.role || 'OPERATOR',
            data.chaine_id || null, data.poste || null, data.specialite || null, data.equipe || null, data.transport_ligne_id || null, data.date_embauche || new Date().toISOString(), data.type_contrat || 'CDI',
            data.date_fin_contrat || null, data.date_renouvellement || null, data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
            data.contact_urgence_nom || null, data.contact_urgence_tel || null, data.contact_urgence_lien || null,
            data.salaire_base || 0, data.taux_horaire || 0, data.taux_piece || 0, data.prime_assiduite || 0, data.prime_transport || 0,
            data.mode_paiement || 'VIREMENT', companyId, userId, userId
        );
        let person_id: string;
        try {
            ({ person_id } = ensurePersonLinkAfterWorkerUpsert(db, workerId, companyId, data.link_person_id ?? null));
        } catch (e: any) {
            if (e?.message === 'INVALID_PERSON_ID') {
                return res.status(400).json({ message: 'link_person_id inconnu (platform_person)' });
            }
            throw e;
        }
        res.json({ message: 'Enregistré', id: workerId, person_id });
    } catch (e: any) {
        if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE' && data.cin) {
            const dup = db
                .prepare('SELECT id, full_name, matricule, owner_id FROM hr_workers WHERE cin = ?')
                .get(String(data.cin).trim()) as
                | { id: string; full_name: string; matricule: string; owner_id: number }
                | undefined;
            return res.status(409).json({
                code: 'CIN_DUPLICATE',
                message:
                    'Ce CIN existe déjà. Aucune fusion automatique (Section 23) — utiliser link_person_id ou résoudre le doublon manuellement.',
                existing: dup || null,
            });
        }
        if (e?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({
                code: 'UNIQUE_VIOLATION',
                message: 'Matricule ou autre contrainte unique violée',
            });
        }
        console.error('saveHRWorker', e);
        res.status(500).json({ message: 'Erreur' });
    }
};

/** Définit ou remplace le PIN ouvrier (BERAOUVIER) — chiffres 4–8, hash bcrypt. */
export const postHRWorkerPin = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const companyId = (req as any).companyId;
    const { id } = req.params;
    const pin = String((req.body as { pin?: string })?.pin ?? '').trim();
    if (!/^\d{4,8}$/.test(pin)) {
        return res.status(400).json({ message: 'PIN : 4 à 8 chiffres uniquement' });
    }
    try {
        const ok = db.prepare('SELECT id FROM hr_workers WHERE id = ? AND owner_id = ?').get(id, companyId);
        if (!ok) {
            return res.status(404).json({ message: 'Ouvrier introuvable' });
        }
        const pin_hash = bcrypt.hashSync(pin, 10);
        db.prepare('UPDATE hr_workers SET pin_hash = ?, updated_by = ?, updated_at = datetime("now") WHERE id = ? AND owner_id = ?').run(
            pin_hash,
            userId,
            id,
            companyId
        );
        res.json({ message: 'PIN enregistré' });
    } catch (e) {
        console.error('postHRWorkerPin', e);
        res.status(500).json({ message: 'Erreur' });
    }
};

/** BERAOUVIER : vérification CIN + PIN (avec production de token JWT). */
export const postWorkerPinVerify = (req: Request, res: Response) => {
    const cin = String(req.params.cin ?? '').trim().toUpperCase();
    const pin = String((req.body as { pin?: string })?.pin ?? '').trim();
    if (!cin || !pin) {
        return res.status(400).json({ message: 'CIN et pin requis' });
    }
    try {
        const row = db
            .prepare(
                `SELECT w.pin_hash, l.person_id FROM hr_workers w
          LEFT JOIN hr_worker_person l ON l.hr_worker_id = w.id
          WHERE w.cin = ? AND w.is_active = 1`
            )
            .get(cin) as { pin_hash: string | null; person_id: string | null } | undefined;
        if (!row?.pin_hash) {
            return res.status(401).json({ ok: false, message: 'PIN non configuré ou CIN inconnu' });
        }
        const ok = bcrypt.compareSync(pin, row.pin_hash);
        if (!ok) {
            return res.status(401).json({ ok: false, message: 'PIN incorrect' });
        }
        const token = jwt.sign({ cin, role: 'worker' }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ ok: true, token, person_id: row.person_id || null });
    } catch (e) {
        res.status(500).json({ message: 'Erreur' });
    }
};

export const deleteHRWorker = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    try {
        db.prepare('DELETE FROM hr_workers WHERE id = ? AND owner_id = ?').run(req.params.id, companyId);
        res.json({ message: 'Supprimé' });
    } catch (e) {
        res.status(500).json({ message: 'Erreur' });
    }
};

function firstLastDayOfMonth(ym: string): { from: string; to: string } | null {
    const p = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!p) return null;
    const Y = parseInt(p[1], 10);
    const M = parseInt(p[2], 10);
    const from = `${ym}-01`;
    const lastD = new Date(Y, M, 0).getDate();
    const to = `${ym}-${String(lastD).padStart(2, '0')}`;
    return { from, to };
}

/**
 * Dossier unique worker : fiche, pointage & prod sur période, avances, aperçu Sage (mois), compétences (legacy `workers` via matricule).
 * Query: pointage_mois=YYYY-MM (défaut: mois courant), from=, to= (optionnel, remplace le mois)
 */
export const getHRWorkerDossier = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const companyId = (req as any).companyId;
    const { id } = req.params;
    const qf = (req.query.from as string) || '';
    const qt = (req.query.to as string) || '';
    const moisQ = (req.query.pointage_mois as string) || new Date().toISOString().slice(0, 7);
    let dateFrom: string;
    let dateTo: string;
    if (qf && qt && /^\d{4}-\d{2}-\d{2}$/.test(qf) && /^\d{4}-\d{2}-\d{2}$/.test(qt)) {
        dateFrom = qf;
        dateTo = qt;
    } else {
        const fl = firstLastDayOfMonth(moisQ);
        if (!fl) {
            return res.status(400).json({ message: 'pointage_mois invalide (attendu YYYY-MM)' });
        }
        dateFrom = fl.from;
        dateTo = fl.to;
    }

    try {
        const worker = db
            .prepare(
                `SELECT w.*, l.person_id AS person_id, t.nom AS transport_ligne_nom, t.quartier AS transport_ligne_quartier,
            CASE WHEN w.pin_hash IS NOT NULL AND length(trim(w.pin_hash)) > 0 THEN 1 ELSE 0 END AS has_pin
         FROM hr_workers w
         LEFT JOIN hr_worker_person l ON l.hr_worker_id = w.id
         LEFT JOIN hr_transport_lignes t ON t.id = w.transport_ligne_id
         WHERE w.id = ? AND w.owner_id = ?`
            )
            .get(id, companyId) as Record<string, unknown> | undefined;
        if (!worker) {
            return res.status(404).json({ message: 'Ouvrier introuvable' });
        }
        const wid = id;

        const pointage = db
            .prepare(
                `SELECT * FROM hr_pointage WHERE worker_id = ? AND date >= ? AND date <= ? ORDER BY date DESC, id DESC`
            )
            .all(wid, dateFrom, dateTo);

        const production = db
            .prepare(
                `SELECT * FROM hr_production WHERE worker_id = ? AND date >= ? AND date <= ? ORDER BY date DESC, id DESC`
            )
            .all(wid, dateFrom, dateTo);

        const avances = db
            .prepare(
                `SELECT a.*, w.full_name, w.salaire_base, w.matricule 
         FROM hr_avances a 
         JOIN hr_workers w ON a.worker_id = w.id 
         WHERE a.worker_id = ? AND w.owner_id = ? 
         ORDER BY a.date_demande DESC`
            )
            .all(wid, companyId);

        const moisSage = (req.query.pointage_mois as string) || new Date().toISOString().slice(0, 7);
        const w = worker as {
            taux_horaire: number;
            prime_assiduite: number;
            prime_transport: number;
            matricule: string;
            full_name: string;
            cin: string | null;
        };
        const bSage = monthYMBounds(moisSage);
        const pa = Number(w.prime_assiduite) || 0;
        const ptr = Number(w.prime_transport) || 0;
        const primesSeules = pa + ptr;
        let sage_preview: {
            mois: string;
            matricule: string;
            nom: string;
            cin: string | null;
            nb_jours: number;
            total_brut: number;
            net_a_payer: number;
        };
        if (bSage) {
            const ptRows = db
                .prepare(
                    `SELECT heure_entree, heure_sortie, pause_debut, pause_fin, date, statut,
    heures_normales, heures_supp_25, heures_supp_50, heures_travaillees
    FROM hr_pointage
    WHERE worker_id = ? AND date >= ? AND date <= ? AND statut = 'PRESENT'
    ORDER BY date ASC, id ASC`,
                )
                .all(wid, bSage.from, bSage.to) as SageMoisPointageRow[];
            const r = sagePayRowForOwnerAndPointage(companyId, { id: String(wid), ...w }, ptRows);
            sage_preview = {
                mois: moisSage,
                matricule: r.matricule,
                nom: r.nom,
                cin: r.cin,
                nb_jours: r.nb_jours,
                total_brut: r.total_brut,
                net_a_payer: r.net_a_payer,
            };
        } else {
            sage_preview = {
                mois: moisSage,
                matricule: w.matricule,
                nom: w.full_name,
                cin: w.cin,
                nb_jours: 0,
                total_brut: primesSeules,
                net_a_payer: primesSeules,
            };
        }

        const mat = String((worker as { matricule: string }).matricule || '');
        const legacy = db
            .prepare('SELECT id FROM workers WHERE owner_id = ? AND matricule = ?')
            .get(companyId, mat) as { id: string } | undefined;
        let skills: any[] = [];
        let skills_matched = false;
        if (legacy) {
            skills = db
                .prepare(
                    'SELECT * FROM worker_skills WHERE owner_id = ? AND worker_id = ? ORDER BY level DESC, poste_keyword ASC'
                )
                .all(companyId, legacy.id);
            skills_matched = true;
        }

        const safeWorker = sanitizeHrWorkerRow(worker as Record<string, unknown>);
        res.json({
            worker: safeWorker,
            pointage,
            production,
            avances,
            sage_preview,
            skills,
            skills_matched,
            skills_note: skills_matched
                ? 'Compétences (module effectifs classique, même matricule).'
                : 'Aucun homonyme matricule dans l’ancien effectifs — compétences vides. Utilisez l’effectif classique ou un futur module RH compétences.',
            meta: {
                pointage_mois: moisQ,
                date_from: dateFrom,
                date_to: dateTo,
            },
        });
    } catch (e) {
        console.error('getHRWorkerDossier', e);
        res.status(500).json({ message: 'Erreur' });
    }
};

// ==========================================
// POINTAGE
// ==========================================

export const getHRPointage = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    try {
        const records = db.prepare(`
            SELECT p.*, w.full_name, w.matricule, w.role 
            FROM hr_pointage p JOIN hr_workers w ON p.worker_id = w.id
            WHERE w.owner_id = ? ${req.query.date ? 'AND p.date = ?' : ''}
        `).all(req.query.date ? [companyId, req.query.date] : [companyId]);
        res.json(records);
    } catch (e) { res.status(500).json({message: 'Erreur'}); }
};

export { calculerHeures };

/**
 * Pointage : `heure_*` / `pause_*` en base = saisie brute (affichage / vérité terrain).
 * Les colonnes `heures_*` lorsque `hr_auto_overtime` est actif viennent de `calculerHeures`
 * appliqué aux heures **ajustées SAGE** (`getSageTimesForHeuresCalc` + `getSageRulesForUser`).
 */
export const saveHRPointage = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const companyId = (req as any).companyId;
    const records = Array.isArray(req.body) ? req.body : [req.body];
    
    let autoOvertime = true; // Actif par défaut
    try {
        const setting = db.prepare("SELECT value FROM app_settings WHERE key = 'hr_auto_overtime' AND owner_id = ?").get(companyId) as any;
        if (setting && setting.value === 'false') {
            autoOvertime = false;
        }
    } catch (e) {
        // Assume default if table/column missing or not configured
    }

    try {
        const sageRules = getSageRulesForUser(companyId);
        const transaction = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO hr_pointage (
                    id, worker_id, date, heure_entree, heure_sortie, pause_debut, pause_fin, 
                    heures_travaillees, heures_normales, heures_supp_25, heures_supp_50, statut, motif_absence, grille_presence
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(worker_id, date) DO UPDATE SET 
                    heure_entree=excluded.heure_entree, 
                    heure_sortie=excluded.heure_sortie, 
                    pause_debut=excluded.pause_debut,
                    pause_fin=excluded.pause_fin,
                    heures_travaillees=excluded.heures_travaillees, 
                    heures_normales=excluded.heures_normales,
                    heures_supp_25=excluded.heures_supp_25,
                    heures_supp_50=excluded.heures_supp_50,
                    statut=excluded.statut,
                    motif_absence=excluded.motif_absence,
                    grille_presence=excluded.grille_presence
            `);

            // Batch fetch valid worker IDs to avoid N+1 queries
            const workerIds = [...new Set(records.map((r: any) => r.worker_id).filter(Boolean))];
            const validWorkerIds = new Set<string>();
            if (workerIds.length > 0) {
                const placeholders = workerIds.map(() => '?').join(',');
                const validRows = db.prepare(`SELECT id FROM hr_workers WHERE id IN (${placeholders}) AND owner_id = ?`)
                    .all(...workerIds, companyId) as { id: string }[];
                for (const row of validRows) validWorkerIds.add(row.id);
            }

            for (const r of records) {
                if (!validWorkerIds.has(r.worker_id)) continue;
                const hasGrilleKey = Object.prototype.hasOwnProperty.call(r, 'grille_presence');
                let grillePresence: string | null;
                if (hasGrilleKey) {
                    grillePresence = (r as { grille_presence?: string | null }).grille_presence ?? null;
                } else {
                    const ex = db
                        .prepare('SELECT grille_presence FROM hr_pointage WHERE worker_id = ? AND date = ?')
                        .get(r.worker_id, r.date) as { grille_presence?: string | null } | undefined;
                    grillePresence = ex?.grille_presence ?? null;
                }

                const hEntree = r.heureEntree || r.heure_entree || null;
                const hSortie = r.heureSortie || r.heure_sortie || null;
                const pDebut = r.pauseDebut || r.pause_debut || null;
                const pFin = r.pauseFin || r.pause_fin || null;

                let travail = Number(r.heuresTravaillees || r.heures_travaillees || 0);
                let norm = Number(r.heuresNormales || r.heures_normales || 0);
                let s25 = Number(r.heuresSupp25 || r.heures_supp_25 || 0);
                let s50 = Number(r.heuresSupp50 || r.heures_supp_50 || 0);

                const tSage = getSageTimesForHeuresCalc(hEntree, hSortie, pDebut, pFin, sageRules);
                const calc = calculerHeures(tSage.entree, tSage.sortie, tSage.pauseDebut, tSage.pauseFin, r.date);

                if (autoOvertime) {
                    travail = calc.travaillees;
                    norm = calc.normales;
                    s25 = calc.supp25;
                    s50 = calc.supp50;
                } else {
                    // Si désactivé, on recalcule quand même le "travail" si l'utilisateur ne l'a pas fourni, 
                    // mais on respecte input client pour les heures normales et sup
                    if (!travail && (hEntree && hSortie)) {
                        travail = calc.travaillees;
                        norm = travail; // par defaut tout en normal
                    }
                }

                stmt.run(
                    r.id || uuidv4(), 
                    r.worker_id, 
                    r.date, 
                    hEntree, 
                    hSortie, 
                    pDebut,
                    pFin,
                    travail, 
                    norm, 
                    s25, 
                    s50, 
                    r.statut, 
                    r.motif_absence || null,
                    grillePresence
                );
            }
        });
        transaction();
        res.json({message: 'Sauvegardé'});
    } catch (e) { 
        console.error('saveHRPointage Error:', e);
        res.status(500).json({message: 'Erreur'}); 
    }
};

export const validateHRPointage = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    try {
        db.prepare(`UPDATE hr_pointage SET is_validated = 1 WHERE worker_id IN (SELECT id FROM hr_workers WHERE owner_id = ?) AND date = ?`).run(companyId, req.body.date);
        res.json({message: 'Validé'});
    } catch(e) { res.status(500).json({message: 'Erreur'}); }
};

// ==========================================
// PRODUCTION
// ==========================================

export const getHRProduction = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    try {
        const date = req.query.date as string | undefined;
        if (date) {
            res.json(db.prepare(`SELECT prod.*, w.full_name FROM hr_production prod JOIN hr_workers w ON prod.worker_id = w.id WHERE w.owner_id=? AND prod.date = ?`).all(companyId, date));
        } else {
            res.json(db.prepare(`SELECT prod.*, w.full_name FROM hr_production prod JOIN hr_workers w ON prod.worker_id = w.id WHERE w.owner_id=?`).all(companyId));
        }
    } catch(e) { res.status(500).json({message:'Erreur'}); }
};

export const saveHRProduction = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const p = req.body;
    try {
        const w = db.prepare('SELECT id FROM hr_workers WHERE id = ? AND owner_id = ?').get(p.worker_id, companyId);
        if(!w) return res.status(403).json({});
        db.prepare(`INSERT INTO hr_production (id, worker_id, date, pieces_produites) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET pieces_produites=excluded.pieces_produites`).run(p.id||uuidv4(), p.worker_id, p.date, p.pieces_produites);
        res.json({message: 'Saved'});
    } catch(e) { res.status(500).json({}); }
};

// ==========================================
// AVANCES
// ==========================================

export const getHRAvances = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    res.json(db.prepare(`SELECT a.*, w.full_name, w.salaire_base FROM hr_avances a JOIN hr_workers w ON a.worker_id = w.id WHERE w.owner_id = ?`).all(companyId));
};
export const saveHRAvance = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const a = req.body;
    try {
        const worker = db.prepare('SELECT id, salaire_base FROM hr_workers WHERE id = ? AND owner_id = ?').get(a.worker_id, companyId) as { id: string, salaire_base: number } | undefined;
        if (!worker) {
            return res.status(403).json({ message: 'Interdit' });
        }

        // Article 385: Plafond de déduction = 10% du salaire. 
        // Ici on valide que l'avance demandée est raisonnable ou on prépare le terrain pour le calcul de paie.
        const plafondMensuel = (worker.salaire_base || 0) * 0.1;
        if (a.montant > worker.salaire_base * 3) {
             return res.status(400).json({ message: `Le montant de l'avance (${a.montant} MAD) dépasse la limite autorisée (max 3x salaire de base).` });
        }

        db.prepare(
            `INSERT INTO hr_avances (id, worker_id, date_demande, montant, solde_restant, statut) 
             VALUES (?,?,?,?,?,?) 
             ON CONFLICT(id) DO UPDATE SET montant=excluded.montant, solde_restant=excluded.solde_restant`
        ).run(a.id || uuidv4(), a.worker_id, a.date_demande, a.montant, a.montant, 'DEMANDE');
        res.json({ message: 'Avance enregistrée (Soumise à validation)' });
    } catch (e) {
        res.status(500).json({ message: 'Erreur' });
    }
};
export const updateHRAvanceStatut = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    try {
        const result = db
            .prepare(
                `UPDATE hr_avances SET statut = ? WHERE id = ? AND worker_id IN (SELECT id FROM hr_workers WHERE owner_id = ?)`
            )
            .run(req.body.statut, req.params.id, companyId);
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Non trouvé' });
        }
        res.json({ message: 'Updated' });
    } catch (e) {
        res.status(500).json({ message: 'Erreur' });
    }
};

// ==========================================
// WORKERS APP (READ-ONLY)
// ==========================================

/** Compte local invité (db.ts) — fiches importées/test souvent rattachées à user id 1 */
const LEGACY_GUEST_OWNER_ID = 1;

/** Aperçu: ouvriers du compte courant vs fiches restées sur l’invité (id 1) */
export const getHRClaimPreview = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const companyId = (req as any).companyId;
    try {
        const my = db.prepare('SELECT COUNT(*) as c FROM hr_workers WHERE owner_id = ?').get(companyId) as { c: number };
        const guest = db
            .prepare('SELECT COUNT(*) as c FROM hr_workers WHERE owner_id = ?')
            .get(LEGACY_GUEST_OWNER_ID) as { c: number };
        const canClaim =
            companyId !== LEGACY_GUEST_OWNER_ID && my.c === 0 && guest.c > 0;
        res.json({ myCount: my.c, guestCount: companyId === LEGACY_GUEST_OWNER_ID ? 0 : guest.c, canClaim });
    } catch (e) {
        res.status(500).json({ message: 'Erreur' });
    }
};

/**
 * Rattache toutes les fiches de l’invité (id 1) au compte connecté.
 * Uniquement si l’utilisateur n’a encore aucun ouvrier (évite les écrasements en multi-compte).
 */
export const postHRClaimFromGuest = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const companyId = (req as any).companyId;
    if (companyId === LEGACY_GUEST_OWNER_ID) {
        return res.status(400).json({ message: 'Déjà connecté en invité' });
    }
    try {
        const my = db.prepare('SELECT COUNT(*) as c FROM hr_workers WHERE owner_id = ?').get(companyId) as { c: number };
        if (my.c > 0) {
            return res.status(400).json({ message: 'Vous avez déjà des fiches. Le rattachement n’est possible qu’avec un compte sans ouvrier.' });
        }
        const guest = db
            .prepare('SELECT COUNT(*) as c FROM hr_workers WHERE owner_id = ?')
            .get(LEGACY_GUEST_OWNER_ID) as { c: number };
        if (guest.c === 0) {
            return res.status(400).json({ message: 'Aucune fiche à rattacher (compte invité vide).' });
        }
        const r = db.prepare('UPDATE hr_workers SET owner_id = ?, updated_by = ?, updated_at = datetime("now") WHERE owner_id = ?').run(companyId, userId, LEGACY_GUEST_OWNER_ID);
        res.json({ ok: true, migrated: r.changes });
    } catch (e) {
        res.status(500).json({ message: 'Erreur' });
    }
};

export const getWorkerByCin = (req: Request, res: Response) => {
    const cin = String(req.params.cin ?? '').trim().toUpperCase();
    try {
        const worker = db
            .prepare(
                `SELECT w.id, w.full_name, w.role, w.chaine_id, l.person_id AS person_id, w.pin_hash,
            CASE WHEN w.pin_hash IS NOT NULL AND length(trim(w.pin_hash)) > 0 THEN 1 ELSE 0 END AS has_pin
         FROM hr_workers w
         LEFT JOIN hr_worker_person l ON l.hr_worker_id = w.id
         WHERE w.cin = ?`
            )
            .get(cin) as any;
        if (!worker) {
            return res.status(404).json(null);
        }
        // FAIL CLOSED : aucune fiche personnelle n'est exposée sans authentification.
        // Si le PIN n'est pas configuré, on renvoie la même réponse 401 que pour une
        // fiche protégée (has_pin: 1) afin de ne pas créer d'oracle révélant
        // l'existence du CIN ou l'absence de PIN. L'enrôlement du PIN se fait côté
        // admin (postHRWorkerPin), donc cette voie reste fonctionnelle.
        if (!worker.pin_hash) {
            return res.status(401).json({ message: 'Code PIN requis pour accéder à cette fiche.', has_pin: 1 });
        }
        {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token as string);
            if (!token) {
                return res.status(401).json({ message: 'Code PIN requis pour accéder à cette fiche.', has_pin: 1 });
            }
            try {
                const decoded = jwt.verify(token, JWT_SECRET) as { cin: string };
                if (String(decoded.cin).toUpperCase() !== cin) {
                    return res.status(403).json({ message: 'Accès interdit.' });
                }
            } catch (err) {
                return res.status(401).json({ message: 'Session expirée ou invalide.' });
            }
        }
        const sanitized = sanitizeHrWorkerRow(worker);
        res.json(sanitized);
    } catch (e) {
        res.status(500).json({});
    }
};

/** BERAOUVIER: champs minimaux uniquement */
const PUBLIC_POINTAGE_COLS = `date, statut, heure_entree, heure_sortie, heures_travaillees`;

export const getWorkerPointageToday = (req: Request, res: Response) => {
    const cin = String(req.params.cin ?? '').trim().toUpperCase();
    try {
        const worker = db.prepare('SELECT pin_hash FROM hr_workers WHERE cin = ?').get(cin) as { pin_hash: string | null } | undefined;
        if (!worker) {
            return res.status(404).json({ message: 'Ouvrier introuvable' });
        }
        // FAIL CLOSED : pas de lecture de pointage sans PIN configuré + token valide.
        if (!worker.pin_hash) {
            return res.status(401).json({ message: 'Code PIN requis.', has_pin: 1 });
        }
        {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token as string);
            if (!token) {
                return res.status(401).json({ message: 'Auth requis' });
            }
            try {
                const decoded = jwt.verify(token, JWT_SECRET) as { cin: string };
                if (String(decoded.cin).toUpperCase() !== cin) {
                    return res.status(403).json({ message: 'Accès interdit' });
                }
            } catch (err) {
                return res.status(401).json({ message: 'Jeton invalide' });
            }
        }
        res.json(
            db
                .prepare(
                    `SELECT ${PUBLIC_POINTAGE_COLS} FROM hr_pointage WHERE worker_id = (SELECT id FROM hr_workers WHERE cin = ?) AND date = date('now')`
                )
                .get(cin) || null
        );
    } catch (e) {
        res.status(500).json({ message: 'Erreur' });
    }
};

export const getWorkerProductionToday = (req: Request, res: Response) => {
    const cin = String(req.params.cin ?? '').trim().toUpperCase();
    try {
        const worker = db.prepare('SELECT pin_hash FROM hr_workers WHERE cin = ?').get(cin) as { pin_hash: string | null } | undefined;
        if (!worker) {
            return res.status(404).json({ message: 'Ouvrier introuvable' });
        }
        // FAIL CLOSED : pas de lecture de production sans PIN configuré + token valide.
        if (!worker.pin_hash) {
            return res.status(401).json({ message: 'Code PIN requis.', has_pin: 1 });
        }
        {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.query.token as string);
            if (!token) {
                return res.status(401).json({ message: 'Auth requis' });
            }
            try {
                const decoded = jwt.verify(token, JWT_SECRET) as { cin: string };
                if (String(decoded.cin).toUpperCase() !== cin) {
                    return res.status(403).json({ message: 'Accès interdit' });
                }
            } catch (err) {
                return res.status(401).json({ message: 'Jeton invalide' });
            }
        }
        res.json(db.prepare('SELECT sum(pieces_produites) as total FROM hr_production WHERE worker_id = (SELECT id FROM hr_workers WHERE cin = ?) AND date = date("now")').get(cin) || null);
    } catch (e) {
        res.status(500).json({ message: 'Erreur' });
    }
};

// ==========================================
// TRANSPORT LINES CRUD
// ==========================================

export const getHRTransportLignes = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    try {
        const rows = db.prepare('SELECT * FROM hr_transport_lignes WHERE owner_id = ? ORDER BY nom ASC').all(companyId);
        res.json(rows);
    } catch (error) {
        console.error('[getHRTransportLignes] Error:', error);
        res.status(500).json({ message: 'Erreur' });
    }
};

export const saveHRTransportLigne = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const data = req.body;
    try {
        const id = data.id || `tr-${randomUUID()}`;
        db.prepare(`
            INSERT INTO hr_transport_lignes (
                id, nom, code_ligne, quartier, chauffeur_nom, chauffeur_tel, matricule_vehicule, capacite, notes, owner_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                nom = excluded.nom,
                code_ligne = excluded.code_ligne,
                quartier = excluded.quartier,
                chauffeur_nom = excluded.chauffeur_nom,
                chauffeur_tel = excluded.chauffeur_tel,
                matricule_vehicule = excluded.matricule_vehicule,
                capacite = excluded.capacite,
                notes = excluded.notes
        `).run(
            id,
            data.nom,
            data.code_ligne || null,
            data.quartier || null,
            data.chauffeur_nom || null,
            data.chauffeur_tel || null,
            data.matricule_vehicule || null,
            data.capacite || 0,
            data.notes || null,
            companyId
        );
        res.json({ message: 'Enregistré', id });
    } catch (error) {
        console.error('[saveHRTransportLigne] Error:', error);
        res.status(500).json({ message: 'Erreur' });
    }
};

export const deleteHRTransportLigne = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const companyId = (req as any).companyId;
    try {
        // Enlever la référence dans les fiches ouvriers
        db.prepare('UPDATE hr_workers SET transport_ligne_id = NULL, updated_by = ? WHERE transport_ligne_id = ? AND owner_id = ?').run(userId, req.params.id, companyId);
        db.prepare('DELETE FROM hr_transport_lignes WHERE id = ? AND owner_id = ?').run(req.params.id, companyId);
        res.json({ message: 'Supprimé' });
    } catch (error) {
        console.error('[deleteHRTransportLigne] Error:', error);
        res.status(500).json({ message: 'Erreur' });
    }
};
