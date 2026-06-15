import type { AppSettings, Machine, Operation } from '../types';

export function machineIdToClasse(machineId: string, machines: Machine[]): string | undefined {
    return machines.find(m => m.id === machineId)?.classe;
}

/** Machine utilisable pour la couverture planning (active + pas panne / maintenance). */
export function isMachineOperational(m: Machine): boolean {
    if (!m.active) return false;
    const s = m.status;
    if (s === 'PANNE' || s === 'MAINT') return false;
    return true;
}

/** Classe requise pour une opération de gamme : `machineClass` si défini, sinon résolution via `machineId`. */
export function operationRequiredClasse(
    op: Operation,
    machines: Machine[],
    /** Index optionnel (évite un `find` par opération sur grosses listes). */
    machineById?: Map<string, Machine>,
): string | undefined {
    const raw = (op.machineClass || '').trim();
    if (raw) return raw;
    const m = machineById?.get(op.machineId) ?? machines.find(x => x.id === op.machineId);
    return m?.classe;
}

/** IDs machines pour une ligne : affectation explicite, sinon toutes les machines actives et opérationnelles (parc atelier). */
export function getChainMachineIds(chainId: string, settings: AppSettings, allMachines: Machine[]): string[] {
    const assigned = settings.chainMachines?.[chainId];
    if (assigned && assigned.length > 0) return assigned;
    return allMachines.filter(m => isMachineOperational(m)).map(m => m.id);
}

export type MachineCoverageRow = {
    classe: string;
    /** Nombre de postes machines opérationnels sur la ligne pour cette classe */
    availableCount: number;
    /** Nombre d’opérations gamme qui exigent cette classe (chaque op. = 1 poste) */
    requiredCount: number;
    ok: boolean;
};

/** Une ligne par classe requise par la gamme : effectifs sur la chaîne vs nombre d’opérations. */
export function machineCoverageRows(
    operations: Operation[],
    machines: Machine[],
    chainMachineIds: string[]
): MachineCoverageRow[] {
    const byId = new Map(machines.map(m => [m.id, m]));
    const chainList = chainMachineIds
        .map(id => {
            const m = byId.get(id);
            return m && isMachineOperational(m) ? m : undefined;
        })
        .filter((m): m is Machine => m !== undefined);
    const countByClasse = new Map<string, number>();
    for (const m of chainList) {
        countByClasse.set(m.classe, (countByClasse.get(m.classe) || 0) + 1);
    }
    const requiredByClasse = new Map<string, number>();
    for (const op of operations) {
        const cls = operationRequiredClasse(op, machines, byId);
        if (!cls) continue;
        requiredByClasse.set(cls, (requiredByClasse.get(cls) || 0) + 1);
    }
    return [...requiredByClasse.keys()]
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map(classe => {
            const availableCount = countByClasse.get(classe) || 0;
            const requiredCount = requiredByClasse.get(classe) || 0;
            return { classe, availableCount, requiredCount, ok: availableCount >= requiredCount };
        });
}

/** Vérifie que chaque classe requise par la gamme est couverte en quantité suffisante sur la chaîne. */
export function validateMachineCoverage(
    operations: Operation[],
    machines: Machine[],
    chainMachineIds: string[]
): { ok: boolean; missingClasses: string[] } {
    const rows = machineCoverageRows(operations, machines, chainMachineIds);
    const missing = rows.filter(r => !r.ok).map(r => r.classe);
    return { ok: missing.length === 0, missingClasses: missing };
}
