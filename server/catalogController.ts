import { Request, Response } from 'express';
import db from './db';
import { randomUUID } from 'crypto';
import {
  operationMatchScore,
  groupOperationsBySimilarity,
  mergeOperationGroup,
  type OperationLike,
} from '../lib/suggestionTempsCatalogue';
import {
  classifyGarment,
  classifyOperation,
} from '../lib/catalogClassify';

const norm = (s: string) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');

const machineNorm = (raw: string) =>
    norm(raw)
        .replace(/\s*·\s*/g, '·')
        .replace(/\s*[-–—]\s*/g, '-')
        .replace(/\s{2,}/g, ' ');

function machineOf(op: any): string {
    return (op.machineName || op.machineClass || op.machineId || 'Machine').toString().trim();
}

function buildNormKey(description: string, machine: string): string {
    return `${norm(description)}|${machineNorm(machine)}`;
}

export const getCatalogEntries = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const rows = db.prepare(`
            SELECT * FROM time_catalog_entries 
            WHERE owner_id = ? 
            ORDER BY pinned DESC, count DESC, avg_time ASC
        `).all(userId);
        
        const entries = rows.map((r: any) => ({
            ...r,
            categories: JSON.parse(r.categories || '[]'),
            sources: JSON.parse(r.sources || '[]'),
            worker_names: JSON.parse(r.worker_names || '[]'),
        }));
        
        res.json(entries);
    } catch (error) {
        console.error('Get catalog entries error:', error);
        res.status(500).json({ message: 'Error fetching catalog entries' });
    }
};

export const syncCatalog = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    
    try {
        const models = db.prepare('SELECT id, data FROM models WHERE user_id = ?').all(userId);
        
        // Phase 1: Collect all operations from all models
        const allOps: OperationLike[] = [];
        
        for (const row of models) {
            let model: any;
            try { model = JSON.parse(row.data); } catch { continue; }
            
            const ops = model.gamme_operatoire || [];
            if (!ops.length) continue;
            
            const modelName = model.meta_data?.nom_modele || model.filename || 'Modèle';
            const reference = model.meta_data?.reference || '';
            const category = model.ficheData?.category || model.meta_data?.category || '';
            const gammeLength = ops.length;
            const gammeTotalTime = ops.reduce((sum: number, op: any) => sum + (Number(op.time) || 0), 0);
            
            // Read chrono data from model
            const chronoData: Record<string, any> = model.chronoData || {};
            const customStations: Array<{ id: string; operatorName?: string; linkedOperationId?: string }> = model.chronoCustomStations || [];
            
            // Build map: operationId → worker name from customStations
            const opWorkerMap = new Map<string, string>();
            for (const station of customStations) {
                if (station.operatorName && station.linkedOperationId) {
                    opWorkerMap.set(station.linkedOperationId, station.operatorName);
                }
                // Also map by station id prefix (compound keys like "st123__op456")
                if (station.operatorName) {
                    opWorkerMap.set(station.id, station.operatorName);
                }
            }
            
            // Also try to get worker from implantation assignments
            const assignments: Record<string, string[]> = model.implantation?.assignments || {};
            
            for (const op of ops) {
                const gammeTime = Number(op.time) || 0;
                if (!op.description) continue;
                
                const machine = machineOf(op);
                const garmentType = classifyGarment(category);
                const opType = classifyOperation(op.description, op.machineClass, op.machineName);
                
                // Check for chrono data for this operation
                let chronoTime: number | null = null;
                let workerName = '';
                let fromChrono = false;
                
                // Try direct match: chronoData[op.id]
                const chronoEntry = chronoData[op.id];
                if (chronoEntry && chronoEntry.tempMajore && chronoEntry.tempMajore > 0) {
                    chronoTime = chronoEntry.tempMajore;
                    fromChrono = true;
                }
                
                // Try compound match: chronoData["stationId__opId"]
                if (!chronoTime) {
                    for (const [key, entry] of Object.entries(chronoData)) {
                        if (key.includes('__') && key.endsWith(op.id)) {
                            const e = entry as any;
                            if (e.tempMajore && e.tempMajore > 0) {
                                chronoTime = e.tempMajore;
                                fromChrono = true;
                                break;
                            }
                        }
                    }
                }
                
                // Get worker name from customStations
                workerName = opWorkerMap.get(op.id) || '';
                if (!workerName) {
                    // Try compound key lookup
                    for (const [key, name] of opWorkerMap.entries()) {
                        if (key.includes('__') && key.endsWith(op.id)) {
                            workerName = name;
                            break;
                        }
                    }
                }
                
                // Use chrono time if available, otherwise fallback to gamme time
                const time = chronoTime || gammeTime;
                if (time <= 0) continue;
                
                allOps.push({
                    description: op.description.trim(),
                    machine,
                    machineClass: op.machineClass,
                    section: op.section,
                    time,
                    modelId: model.id,
                    modelName,
                    garmentType,
                    gammeLength,
                    gammeTotalTime,
                    workerName,
                    reference,
                    fromChrono,
                });
            }
        }
        
        // Phase 2: Group similar operations using fuzzy matching
        const groups = groupOperationsBySimilarity(allOps, 0.65);
        
        // Phase 3: Merge groups into catalogue entries
        const entriesToUpsert = groups.map(group => {
            const merged = mergeOperationGroup(group);
            const normKey = buildNormKey(merged.description, merged.machine);
            
            // Build sources from group
            const sources = group.map(op => ({
                modelId: op.modelId || '',
                modelName: op.modelName || 'Modèle',
                category: op.garmentType || '',
                time: op.time,
                workerName: op.workerName || '',
                reference: op.reference || '',
                fromChrono: op.fromChrono || false,
            }));
            
            // Collect unique worker names
            const workerNames = [...new Set(group.map(op => op.workerName).filter(Boolean))];
            
            // Collect unique categories
            const categories = [...new Set(group.map(op => op.garmentType).filter(Boolean))];
            
            // Classification
            const garmentType = categories[0] || 'AUTRE';
            const operationType = classifyOperation(merged.description, group[0].machineClass, merged.machine);
            
            return {
                id: `tc-${Date.now()}-${randomUUID().slice(0, 8)}`,
                owner_id: userId,
                norm_key: normKey,
                description: merged.description,
                machine: merged.machine,
                section: merged.section || null,
                avg_time: merged.avg,
                min_time: merged.min,
                max_time: merged.max,
                count: merged.count,
                confidence: merged.confidence,
                garment_type: garmentType,
                operation_type: operationType,
                categories: JSON.stringify(categories),
                sources: JSON.stringify(sources),
                worker_names: JSON.stringify(workerNames),
                pinned: 0,
                confirmed: 0,
                custom_notes: null,
            };
        });
        
        const upsertStmt = db.prepare(`
            INSERT INTO time_catalog_entries (
                id, owner_id, norm_key, description, machine, section,
                avg_time, min_time, max_time, count, confidence,
                garment_type, operation_type, categories, sources, worker_names,
                pinned, confirmed, custom_notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL)
            ON CONFLICT(owner_id, norm_key) DO UPDATE SET
                description = excluded.description,
                machine = excluded.machine,
                section = excluded.section,
                avg_time = excluded.avg_time,
                min_time = excluded.min_time,
                max_time = excluded.max_time,
                count = excluded.count,
                confidence = excluded.confidence,
                garment_type = excluded.garment_type,
                operation_type = excluded.operation_type,
                categories = excluded.categories,
                sources = excluded.sources,
                worker_names = excluded.worker_names,
                updated_at = CURRENT_TIMESTAMP
        `);
        
        const transaction = db.transaction((entries: any[]) => {
            for (const entry of entries) {
                upsertStmt.run(
                    entry.id, entry.owner_id, entry.norm_key, entry.description,
                    entry.machine, entry.section, entry.avg_time, entry.min_time,
                    entry.max_time, entry.count, entry.confidence,
                    entry.garment_type, entry.operation_type,
                    entry.categories, entry.sources, entry.worker_names
                );
            }
        });
        
        transaction(entriesToUpsert);
        
        res.json({ success: true, scanned: models.length, entries: entriesToUpsert.length });
    } catch (error) {
        console.error('Sync catalog error:', error);
        res.status(500).json({ message: 'Error syncing catalog' });
    }
};

export const updateCatalogEntry = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { avg_time, min_time, max_time, custom_notes, garment_type, operation_type } = req.body;
    
    try {
        const sets: string[] = [];
        const values: any[] = [];
        
        if (avg_time != null) { sets.push('avg_time = ?'); values.push(avg_time); }
        if (min_time != null) { sets.push('min_time = ?'); values.push(min_time); }
        if (max_time != null) { sets.push('max_time = ?'); values.push(max_time); }
        if (custom_notes != null) { sets.push('custom_notes = ?'); values.push(custom_notes); }
        if (garment_type != null) { sets.push('garment_type = ?'); values.push(garment_type); }
        if (operation_type != null) { sets.push('operation_type = ?'); values.push(operation_type); }
        
        if (sets.length === 0) {
            return res.status(400).json({ message: 'No fields to update' });
        }
        
        sets.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id, userId);
        
        const result = db.prepare(`
            UPDATE time_catalog_entries 
            SET ${sets.join(', ')}
            WHERE id = ? AND owner_id = ?
        `).run(...values);
        
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Entry not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Update catalog entry error:', error);
        res.status(500).json({ message: 'Error updating entry' });
    }
};

export const confirmCatalogEntry = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    
    try {
        const result = db.prepare(`
            UPDATE time_catalog_entries 
            SET confirmed = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND owner_id = ?
        `).run(id, userId);
        
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Entry not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Confirm catalog entry error:', error);
        res.status(500).json({ message: 'Error confirming entry' });
    }
};

export const pinCatalogEntry = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    const { pinned } = req.body;
    
    try {
        const result = db.prepare(`
            UPDATE time_catalog_entries 
            SET pinned = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND owner_id = ?
        `).run(pinned ? 1 : 0, id, userId);
        
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Entry not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Pin catalog entry error:', error);
        res.status(500).json({ message: 'Error updating entry' });
    }
};

export const deleteCatalogEntry = (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    
    try {
        const result = db.prepare('DELETE FROM time_catalog_entries WHERE id = ? AND owner_id = ?').run(id, userId);
        
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Entry not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete catalog entry error:', error);
        res.status(500).json({ message: 'Error deleting entry' });
    }
};
