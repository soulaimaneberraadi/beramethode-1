/**
 * Dossier local choisi par l'utilisateur (File System Access API) : le
 * classeur Excel de coupe s'y reecrit a chaque sauvegarde, sans export manuel.
 *
 * Support : Chrome/Edge desktop uniquement (secure context). Ailleurs (Firefox,
 * Safari, mobile), chaque fonction rend un statut — jamais une exception —
 * pour que l'appelant degrade proprement (ex. proposer le telechargement
 * classique du fichier).
 *
 * Lancer : node --import tsx lib/dossierLocal.test.ts (verifie juste estSupporte()
 * hors navigateur ; le reste ne peut se tester qu'en vrai Chrome/Edge).
 */

// lib.dom.d.ts connait deja FileSystemDirectoryHandle/FileSystemFileHandle/
// FileSystemHandle/FileSystemWritableFileStream, mais pas encore les
// permissions ni showDirectoryPicker : on complete par fusion de declarations.
declare global {
    interface FileSystemHandlePermissionDescriptor {
        mode?: 'read' | 'readwrite';
    }
    interface FileSystemHandle {
        queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
        requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    }
    interface DirectoryPickerOptions {
        mode?: 'read' | 'readwrite';
        id?: string;
        startIn?: FileSystemHandle | string;
    }
    interface Window {
        showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
    }
}

const DB_NAME = 'bera_dossiers';
const STORE_NAME = 'handles';
const DB_VERSION = 1;

/** true seulement si l'API File System Access + IndexedDB sont disponibles. */
export function estSupporte(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.showDirectoryPicker === 'function' &&
        typeof indexedDB !== 'undefined'
    );
}

function ouvrirDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE_NAME)) {
                req.result.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function lireHandle(cle: string): Promise<FileSystemDirectoryHandle | null> {
    try {
        const db = await ouvrirDb();
        return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(cle);
            req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return null;
    }
}

async function ecrireHandleDb(cle: string, handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await ouvrirDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, cle);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

async function supprimerHandleDb(cle: string): Promise<void> {
    const db = await ouvrirDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(cle);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Ouvre le selecteur de dossier (mode readwrite) et memorise le choix. Null si annule ou non supporte. */
export async function choisirDossier(cle: string): Promise<{ nom: string } | null> {
    if (!estSupporte()) return null;
    try {
        const handle = await window.showDirectoryPicker!({ mode: 'readwrite' });
        await ecrireHandleDb(cle, handle);
        return { nom: handle.name };
    } catch {
        // AbortError (annulation) ou refus du selecteur : pas une erreur a remonter.
        return null;
    }
}

/** Dossier deja memorise, avec sa permission actuelle — sans la demander (voir autoriserDossier). */
export async function dossierMemorise(
    cle: string,
): Promise<{ nom: string; permission: 'granted' | 'prompt' | 'denied' } | null> {
    if (!estSupporte()) return null;
    const handle = await lireHandle(cle);
    if (!handle) return null;
    try {
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        return { nom: handle.name, permission };
    } catch {
        return { nom: handle.name, permission: 'prompt' };
    }
}

/**
 * Demande la permission readwrite sur le dossier memorise.
 * A appeler depuis un geste utilisateur direct (clic) : hors interaction,
 * le navigateur rejette requestPermission() sans afficher de dialogue.
 */
export async function autoriserDossier(cle: string): Promise<boolean> {
    if (!estSupporte()) return false;
    const handle = await lireHandle(cle);
    if (!handle) return false;
    try {
        const permission = await handle.requestPermission({ mode: 'readwrite' });
        return permission === 'granted';
    } catch {
        return false;
    }
}

export async function oublierDossier(cle: string): Promise<void> {
    try {
        await supprimerHandleDb(cle);
    } catch {
        // rien a oublier
    }
}

// Separateurs de chemin + caracteres interdits sous Windows, plus les
// caracteres de controle. Le point (extension) n'en fait pas partie.
const CARACTERES_INTERDITS = /[<>:"/\\|?*\x00-\x1f]/g;

/** Enleve separateurs de chemin et caracteres interdits ; garde l'extension telle quelle. */
function assainirNomFichier(nomFichier: string): string {
    const nettoye = nomFichier.replace(CARACTERES_INTERDITS, '_').trim();
    return nettoye || 'fichier.xlsx';
}

export type ResultatEcriture = 'ok' | 'aucun-dossier' | 'permission' | 'verrouille' | 'non-supporte' | 'erreur';

/** Excel garde le fichier ouvert sous Windows : ces erreurs signalent juste ca, pas une vraie panne. */
function estVerrouille(e: unknown): boolean {
    const name = (e as { name?: string } | null)?.name || '';
    const message = ((e as { message?: string } | null)?.message || '').toLowerCase();
    if (name === 'NoModificationAllowedError' || name === 'InvalidStateError') return true;
    return /lock|in use|locked|verrouil|utilis/.test(message);
}

/**
 * Ecrit (ou remplace) un fichier dans le dossier memorise.
 * Ne demande jamais la permission elle-meme : si elle n'est pas 'granted',
 * rend 'permission' pour que l'appelant la redemande via autoriserDossier()
 * (donc depuis un geste utilisateur).
 */
export async function ecrireDansDossier(
    cle: string,
    nomFichier: string,
    contenu: Blob,
): Promise<ResultatEcriture> {
    if (!estSupporte()) return 'non-supporte';

    const handle = await lireHandle(cle);
    if (!handle) return 'aucun-dossier';

    let permission: PermissionState;
    try {
        permission = await handle.queryPermission({ mode: 'readwrite' });
    } catch {
        return 'erreur';
    }
    if (permission !== 'granted') return 'permission';

    const nom = assainirNomFichier(nomFichier);
    try {
        const fileHandle = await handle.getFileHandle(nom, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(contenu);
        await writable.close();
        return 'ok';
    } catch (e) {
        return estVerrouille(e) ? 'verrouille' : 'erreur';
    }
}

/**
 * Depose un fichier sans jamais remplacer celui qui attend deja : un meme
 * trace renvoye au traceur doit repartir en impression (« nom-2.plt »), pas
 * ecraser celui que le logiciel du traceur est peut-etre en train de lire.
 * Chrome ecrit d'abord a cote puis renomme a la fermeture : le logiciel qui
 * surveille le dossier ne voit jamais un fichier a moitie ecrit.
 */
export async function deposerSansEcraser(
    cle: string,
    nomFichier: string,
    contenu: Blob,
): Promise<{ resultat: ResultatEcriture; nom: string }> {
    if (!estSupporte()) return { resultat: 'non-supporte', nom: nomFichier };
    const handle = await lireHandle(cle);
    if (!handle) return { resultat: 'aucun-dossier', nom: nomFichier };
    try {
        if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return { resultat: 'permission', nom: nomFichier };
    } catch {
        return { resultat: 'erreur', nom: nomFichier };
    }
    const propre = assainirNomFichier(nomFichier);
    const point = propre.lastIndexOf('.');
    const racine = point > 0 ? propre.slice(0, point) : propre;
    const ext = point > 0 ? propre.slice(point) : '';
    for (let i = 1; i < 1000; i++) {
        const nom = i === 1 ? propre : `${racine}-${i}${ext}`;
        try {
            await handle.getFileHandle(nom);
            continue; // deja la : on prend le suivant
        } catch {
            // absent : c'est ce nom-la
        }
        try {
            const fh = await handle.getFileHandle(nom, { create: true });
            const w = await fh.createWritable();
            await w.write(contenu);
            await w.close();
            return { resultat: 'ok', nom };
        } catch (e) {
            return { resultat: estVerrouille(e) ? 'verrouille' : 'erreur', nom };
        }
    }
    return { resultat: 'erreur', nom: propre };
}
