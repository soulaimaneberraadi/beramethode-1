import { Request, Response } from 'express';
import db from './db';

// Get suivi data
export const getSuiviData = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const planningId = req.query.planningId as string;
    
    try {
        const query = planningId 
          ? 'SELECT * FROM suivi_data WHERE owner_id = ? AND planningId = ? ORDER BY date DESC'
          : 'SELECT * FROM suivi_data WHERE owner_id = ? ORDER BY date DESC';
          
        const stmt = db.prepare(query);
        const rows = planningId ? stmt.all(companyId, planningId) : stmt.all(companyId);
        
        const suivis = (rows as any[]).map(r => JSON.parse(r.raw_data));
        res.json(suivis);
    } catch (error) {
        console.error('Get suivi data error:', error);
        res.status(500).json({ message: 'Error fetching suivi data' });
    }
};

// Batch upsert.
//
// Le corps attend :
//   { suivis: SuiviData[], full?: boolean }
//
// `full: true` signifie « ce tableau est l'etat COMPLET du compte ». Le serveur
// supprime alors les lignes qui n'y figurent plus : sans cela un releve efface
// dans l'interface restait en base et revenait au rechargement suivant.
export const saveSuiviData = (req: Request, res: Response) => {
    const companyId = (req as any).companyId;
    const { suivis, full } = req.body;

    if (!Array.isArray(suivis)) {
        return res.status(400).json({ message: 'suivis array is required' });
    }

    try {
        let deleted = 0;
        const transaction = db.transaction(() => {
            const stmt = db.prepare(`
                INSERT INTO suivi_data 
                (id, owner_id, planningId, modelId, chaineId, date, entrer, totalHeure, pJournaliere, totalWorkers, trs, raw_data, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                planningId=excluded.planningId, modelId=excluded.modelId, chaineId=excluded.chaineId,
                date=excluded.date, entrer=excluded.entrer,
                totalHeure=excluded.totalHeure, pJournaliere=excluded.pJournaliere, totalWorkers=excluded.totalWorkers, trs=excluded.trs,
                raw_data=excluded.raw_data, updated_at=CURRENT_TIMESTAMP
                WHERE suivi_data.owner_id = excluded.owner_id
            `);

            const keptIds: string[] = [];
            const touchedPlannings = new Set<string>();

            for (const s of suivis) {
                if (!s.id || !s.planningId || !s.date) continue;
                keptIds.push(String(s.id));
                touchedPlannings.add(String(s.planningId));
                // On the frontend, totalHeure represents the sum of hourly outputs (pieces produced).
                // We save it to pJournaliere and totalHeure columns so database queries work correctly.
                const actualProd = s.totalHeure || s.pJournaliere || 0;
                stmt.run(
                    s.id, companyId, s.planningId, s.modelId || null, s.chaineId || null, s.date, s.entrer || 0,
                    actualProd, actualProd, s.totalWorkers || 0, s.trs || 0,
                    JSON.stringify(s)
                );
            }

            // Reconciliation des suppressions. Deux gardes :
            //   - `full` explicite (l'appelant confirme envoyer tout l'etat) ;
            //   - tableau non vide : un POST vide (etat pas encore hydrate,
            //     GET en echec) ne doit JAMAIS vider la base.
            if (full === true && keptIds.length > 0) {
                const orphans = db.prepare(`SELECT id FROM suivi_data WHERE owner_id = ?`).all(companyId) as { id: string }[];
                const kept = new Set(keptIds);
                const toDelete = orphans.filter(o => !kept.has(String(o.id)));
                if (toDelete.length > 0) {
                    const del = db.prepare(`DELETE FROM suivi_data WHERE id = ? AND owner_id = ?`);
                    for (const o of toDelete) {
                        // Le plan de l'OF concerne doit voir son avancement recalcule.
                        const row = db.prepare(`SELECT planningId FROM suivi_data WHERE id = ? AND owner_id = ?`).get(o.id, companyId) as { planningId?: string } | undefined;
                        if (row?.planningId) touchedPlannings.add(String(row.planningId));
                        del.run(o.id, companyId);
                        deleted++;
                    }
                }
            }

            // Auto-sync progress to Plan Master (planning_events) — TOUT scope owner :
            // un planningId forge dans le body ne doit ni lire ni ecrire l'OF d'un autre tenant.
            // Recalcule UNE fois par OF touche (et non a chaque ligne du lot).
            for (const planningId of touchedPlannings) {
                const rows = db.prepare(`SELECT raw_data FROM suivi_data WHERE planningId = ? AND owner_id = ?`).all(planningId, companyId);
                let totalProduced = 0;
                for (const r of rows) {
                    try {
                        const parsed = JSON.parse((r as any).raw_data);
                        totalProduced += parsed.totalHeure || parsed.pJournaliere || 0;
                    } catch (e) { }
                }

                const planRow = db.prepare(`SELECT status, qteTotal, raw_data FROM planning_events WHERE id = ? AND owner_id = ?`).get(planningId, companyId) as { status: string, qteTotal: number, raw_data: string } | undefined;
                if (!planRow) continue;
                const status = totalProduced >= planRow.qteTotal ? 'DONE' : (totalProduced > 0 ? 'IN_PROGRESS' : planRow.status);

                try {
                    const rawData = JSON.parse(planRow.raw_data);
                    rawData.qteProduite = totalProduced;
                    rawData.status = status;
                    db.prepare(`UPDATE planning_events SET qteProduite = ?, status = ?, raw_data = ? WHERE id = ? AND owner_id = ?`)
                        .run(totalProduced, status, JSON.stringify(rawData), planningId, companyId);
                } catch (e) {
                    db.prepare(`UPDATE planning_events SET qteProduite = ?, status = ? WHERE id = ? AND owner_id = ?`)
                        .run(totalProduced, status, planningId, companyId);
                }
            }
        });

        transaction();
        res.json({ message: 'Suivis saved successfully', saved: suivis.length, deleted });
    } catch (error) {
        console.error('Save suivi data error:', error);
        res.status(500).json({ message: 'Error saving suivi data' });
    }
};

// Simple Stats 

