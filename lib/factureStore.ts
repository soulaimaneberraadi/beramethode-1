/**
 * Stockage local des factures par matière dans IndexedDB.
 *
 * Pourquoi IndexedDB : l'app tourne en mode static (apiShim intercepte /api → le
 * serveur n'est pas joignable), et les fichiers (image/PDF) sont trop lourds pour
 * localStorage / la synchro cloud. IndexedDB garde les binaires côté navigateur
 * (par appareil), sans alourdir le snapshot synchronisé. Les factures sont keyées
 * par modelId + materialName.
 */

export interface FactureRecord {
    id: string;
    modelId: string;
    materialName: string;
    fileName: string;
    mimeType: string;
    createdAt: number;
    blob: Blob;
}

export type FactureMeta = Omit<FactureRecord, 'blob'>;

const DB_NAME = 'beramethode_factures';
const STORE = 'factures';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

const norm = (s?: string) => (s || '').toLowerCase().trim();

export async function addFacture(rec: Omit<FactureRecord, 'createdAt'>): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ ...rec, createdAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function listFactures(modelId: string, materialName: string): Promise<FactureMeta[]> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).getAll();
        req.onsuccess = () => {
            const all = (req.result as FactureRecord[]) || [];
            const out = all
                .filter(r => r.modelId === modelId && norm(r.materialName) === norm(materialName))
                .sort((a, b) => b.createdAt - a.createdAt)
                .map(({ blob, ...meta }) => meta);
            resolve(out);
        };
        req.onerror = () => reject(req.error);
    });
}

export async function getFactureBlob(id: string): Promise<Blob | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => resolve(req.result ? (req.result as FactureRecord).blob : null);
        req.onerror = () => reject(req.error);
    });
}

export async function deleteFacture(id: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
