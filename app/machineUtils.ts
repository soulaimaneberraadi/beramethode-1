import { Machine, MachineFleetHistoryEntry, ManualLink } from '../types';
import {
    DEFAULT_MACHINES,
    MACHINES_STORAGE_KEY,
    MACHINE_INSTANCES_KEY,
    MACHINE_FLEET_HISTORY_KEY,
    MANUAL_LINKS_BY_MODEL_KEY,
} from './constants';
import { lsGet, lsSet, lsRemove } from '../lib/storageKeys';

const LEGACY_BUNDLED_MACHINE_ROW: Record<string, { name: string; classe: string }> = {
    '1': { name: 'Surjeteuse 5 Fils', classe: '516' },
    '2': { name: 'Surjeteuse 4 Fils', classe: '514' },
    '3': { name: 'Surjeteuse 3 Fils', classe: '504' },
    '4': { name: 'Piqueuse Plate', classe: '301' },
    '5': { name: 'Piqueuse Double Aig', classe: '316' },
    '6': { name: 'Colleteuse', classe: '602' },
    '7': { name: 'Chainette 2 Aig', classe: '402' },
    '8': { name: 'Point Invisible', classe: '101' },
    '9': { name: 'Pose Bouton', classe: '107' },
    '10': { name: 'Boutonnière Droite', classe: '304' },
    '11': { name: 'Brideuse', classe: 'BR' },
    '12': { name: 'ZigZag', classe: 'ZIGZAG' },
    '13': { name: 'Manuel', classe: 'MAN' },
    '14': { name: 'Repassage', classe: 'FER' },
};

export function isLegacyBundledMachineFleet(rows: Machine[]): boolean {
    if (!rows.length || rows.length > 14) return false;
    const sorted = [...rows].sort((a, b) => Number(String(a.id)) - Number(String(b.id)));
    for (let i = 0; i < sorted.length; i++) {
        const key = String(i + 1);
        const exp = LEGACY_BUNDLED_MACHINE_ROW[key];
        if (!exp) return false;
        const m = sorted[i];
        if (String(m.id) !== key) return false;
        if ((m.name || '').trim() !== exp.name || String(m.classe || '').trim() !== exp.classe) return false;
    }
    return true;
}

/** Parc généré par l'ancien lot démo (fichier JSON / script) — supprimé au chargement pour repartir propre. */
export function looksLikeGeneratedDemoFleet(rows: Machine[]): boolean {
    if (rows.length < 20) return false;
    const demoNamed = rows.filter(m => /^Machine démo\s*\d+/i.test((m.name || '').trim()));
    return demoNamed.length >= rows.length * 0.85;
}

export function isDemoMachineName(name: string | undefined): boolean {
    return /^Machine démo\s*\d+/i.test((name || '').trim());
}

/** Évite qu'une réponse GET lente écrase une machine ajoutée en local avant le POST `machines_fleet`. */
export function mergeServerFleetWithPendingLocal(server: Machine[], local: Machine[]): Machine[] {
    const serverIds = new Set(server.map(m => m.id));
    const pending = local.filter(m => !serverIds.has(m.id));
    return pending.length ? [...server, ...pending] : server;
}

export const loadMachinesFromStorage = (): Machine[] => {
    try {
        const raw = lsGet(MACHINES_STORAGE_KEY) ?? localStorage.getItem(MACHINES_STORAGE_KEY);
        if (!raw) return DEFAULT_MACHINES;
        const parsed = JSON.parse(raw) as Machine[];
        if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_MACHINES;
        if (isLegacyBundledMachineFleet(parsed)) return DEFAULT_MACHINES;
        if (looksLikeGeneratedDemoFleet(parsed)) {
            const kept = parsed.filter(m => !isDemoMachineName(m.name));
            try {
                if (kept.length === 0) {
                    lsRemove(MACHINES_STORAGE_KEY);
                    lsRemove(MACHINE_INSTANCES_KEY);
                } else {
                    lsSet(MACHINES_STORAGE_KEY, JSON.stringify(kept));
                }
            } catch {
                /* ignore */
            }
            return kept.length > 0 ? kept : DEFAULT_MACHINES;
        }
        return parsed;
    } catch {
        return DEFAULT_MACHINES;
    }
};

export const loadMachineFleetHistoryFromStorage = (): MachineFleetHistoryEntry[] => {
    try {
        const raw = lsGet(MACHINE_FLEET_HISTORY_KEY) ?? localStorage.getItem(MACHINE_FLEET_HISTORY_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as MachineFleetHistoryEntry[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const normalizeLoadedLayout = (layout: unknown): 'zigzag' | 'free' | 'line' | 'double-zigzag' => {
    if (layout === 'free' || layout === 'line' || layout === 'double-zigzag') return layout;
    if (layout === 'zigzag' || layout === 'snake' || layout === 'grid' || layout === 'wheat') return 'double-zigzag';
    return 'double-zigzag';
};

export const loadManualLinksByModel = (modelId: string): ManualLink[] => {
    try {
        const raw = localStorage.getItem(MANUAL_LINKS_BY_MODEL_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as Record<string, ManualLink[]>;
        return parsed[modelId] || [];
    } catch {
        return [];
    }
};

export const saveManualLinksByModel = (modelId: string, links: ManualLink[]) => {
    try {
        const raw = localStorage.getItem(MANUAL_LINKS_BY_MODEL_KEY);
        const parsed = raw ? (JSON.parse(raw) as Record<string, ManualLink[]>) : {};
        parsed[modelId] = links;
        localStorage.setItem(MANUAL_LINKS_BY_MODEL_KEY, JSON.stringify(parsed));
    } catch {
        // Silent fail
    }
};

export const deleteManualLinksByModel = (modelId: string) => {
    try {
        const raw = localStorage.getItem(MANUAL_LINKS_BY_MODEL_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Record<string, ManualLink[]>;
        delete parsed[modelId];
        localStorage.setItem(MANUAL_LINKS_BY_MODEL_KEY, JSON.stringify(parsed));
    } catch {
        // Silent fail
    }
};
