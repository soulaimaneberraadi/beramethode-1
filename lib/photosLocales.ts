/**
 * Où vivent les photos des modèles.
 *
 * ── Pourquoi ne plus les garder dans localStorage ────────────────────────────
 * `localStorage` plafonne autour de 5 Mo, et une photo de modèle compressée en
 * base64 en pèse plusieurs centaines de kilo-octets. Quatre modèles avec leurs
 * faces avant et arrière suffisaient à saturer un téléphone : la bibliothèque
 * ne s'écrivait plus, l'écran affichait « Aucun modèle trouvé », La Coupe
 * n'avait plus d'ordre, le Planning se plaignait d'un modèle introuvable, et le
 * jeton de session lui-même ne trouvait plus de place — d'où la reconnexion à
 * chaque ouverture. Une seule cause, quatre symptômes.
 *
 * IndexedDB, lui, se compte en centaines de mégaoctets. Les photos y vont ;
 * `localStorage` ne garde plus qu'une RÉFÉRENCE de quelques dizaines d'octets
 * (`idb:<clé>`). La bibliothèque passe ainsi de plusieurs mégaoctets à quelques
 * kilo-octets, et cesse de disputer sa place au reste.
 *
 * ── Ce qui ne change pas ─────────────────────────────────────────────────────
 * Le cloud continue de recevoir les photos en clair : l'instantané est
 * réhydraté avant l'envoi et déshydraté à la réception. Un appareil qui n'a
 * jamais vu cette version lit donc exactement ce qu'il lisait avant — aucune
 * migration, aucune donnée piégée dans un format que les autres ignorent.
 *
 * ── Si IndexedDB manque ──────────────────────────────────────────────────────
 * Navigation privée, navigateur ancien, stockage refusé : la déshydratation ne
 * fait alors RIEN et les photos restent en clair, comme avant. On ne perd
 * jamais une image parce qu'un magasin est indisponible.
 */

import { getCurrentEmail, lsGet } from './storageKeys';

/** Préfixe d'une référence. Tout ce qui commence ainsi vit dans IndexedDB. */
export const PREFIXE_REF = 'idb:';

/** Doit rester alignée sur `LIBRARY_KEY` (`app/constants.ts`). */
const CLE_BIBLIOTHEQUE = 'beramethode_library';

export const estReference = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith(PREFIXE_REF);

const estDataUrl = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith('data:');

/** Les quatre endroits où un modèle range une image. */
const CHAMPS: { lire: (m: any) => any; poser: (m: any, v: any) => void; nom: string }[] = [
  { nom: 'image', lire: m => m.image, poser: (m, v) => { m.image = v; } },
  { nom: 'front', lire: m => m.images?.front, poser: (m, v) => { m.images = { ...(m.images || {}), front: v }; } },
  { nom: 'back',  lire: m => m.images?.back,  poser: (m, v) => { m.images = { ...(m.images || {}), back: v }; } },
  { nom: 'meta',  lire: m => m.meta_data?.photo_url, poser: (m, v) => { m.meta_data = { ...(m.meta_data || {}), photo_url: v }; } },
];

/**
 * Le magasin de photos, réduit à ce dont on a besoin.
 * Une interface plutôt qu'un appel direct à IndexedDB : la logique
 * d'hydratation se teste alors sans navigateur.
 */
export interface MagasinPhotos {
  lire(cles: string[]): Promise<Map<string, string>>;
  ecrire(entrees: Map<string, string>): Promise<void>;
  /**
   * Ramasse-miettes, borné à un préfixe : supprime les clés commençant par
   * `prefixe` qui ne sont PAS dans `clesVivantes`. Le préfixe porte le compte —
   * sans lui, nettoyer la bibliothèque d'un compte effacerait les photos de
   * l'autre compte du même appareil.
   */
  garderSeulement(clesVivantes: Set<string>, prefixe: string): Promise<void>;
}

// ─── Magasin IndexedDB ───────────────────────────────────────────────────────

const NOM_BASE = 'beramethode_photos';
const NOM_STORE = 'photos';

let basePromise: Promise<IDBDatabase | null> | null = null;

const ouvrirBase = (): Promise<IDBDatabase | null> => {
  if (basePromise) return basePromise;
  basePromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(NOM_BASE, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(NOM_STORE)) db.createObjectStore(NOM_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      // Une base bloquée par un autre onglet ne doit pas figer l'application.
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return basePromise;
};

const transaction = async (mode: IDBTransactionMode): Promise<IDBObjectStore | null> => {
  const db = await ouvrirBase();
  if (!db) return null;
  try {
    return db.transaction(NOM_STORE, mode).objectStore(NOM_STORE);
  } catch {
    return null;
  }
};

const attendre = <T>(req: IDBRequest<T>): Promise<T | null> =>
  new Promise(resolve => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });

export const magasinIndexedDB: MagasinPhotos = {
  async lire(cles) {
    const out = new Map<string, string>();
    if (cles.length === 0) return out;
    const store = await transaction('readonly');
    if (!store) return out;
    await Promise.all(cles.map(async cle => {
      const v = await attendre(store.get(cle));
      if (typeof v === 'string') out.set(cle, v);
    }));
    return out;
  },

  async ecrire(entrees) {
    if (entrees.size === 0) return;
    const store = await transaction('readwrite');
    if (!store) throw new Error('IndexedDB indisponible');
    await Promise.all([...entrees].map(([cle, valeur]) => attendre(store.put(valeur, cle))));
  },

  async garderSeulement(clesVivantes, prefixe) {
    const store = await transaction('readwrite');
    if (!store) return;
    const toutes = await attendre(store.getAllKeys());
    if (!Array.isArray(toutes)) return;
    await Promise.all(
      toutes
        .filter(c => typeof c === 'string' && c.startsWith(prefixe) && !clesVivantes.has(c))
        .map(c => attendre(store.delete(c as string))),
    );
  },
};

// ─── Déshydratation / réhydratation ──────────────────────────────────────────

const prefixeCompte = (): string => `${getCurrentEmail() || 'sans-compte'}/`;

/**
 * Empreinte du CONTENU (djb2 + longueur), pas de l'emplacement.
 *
 * La clé nomme l'image elle-même, jamais « la photo avant du modèle m1 ». La
 * différence est tout sauf cosmétique : avec une clé fondée sur l'emplacement,
 * ranger la copie du cloud écrasait la photo locale du même modèle AVANT que la
 * fusion ait décidé laquelle des deux gagne — la version la plus récente était
 * perdue sans que personne ne l'ait choisie. Une clé de contenu ne peut pas
 * mentir : deux images différentes ont deux clés, et deux images identiques
 * n'occupent qu'une place.
 */
const empreinte = (image: string): string => {
  let h = 5381;
  for (let i = 0; i < image.length; i++) h = ((h << 5) + h + image.charCodeAt(i)) | 0;
  return `${image.length}-${(h >>> 0).toString(36)}`;
};

const cleDe = (image: string): string => `${prefixeCompte()}p/${empreinte(image)}`;

/**
 * Sort les photos des modèles et les range dans le magasin.
 *
 * Les images identiques ne sont stockées qu'une fois — `image` reprend presque
 * toujours `images.front` — puisque la clé est celle du contenu.
 *
 * @returns les modèles où chaque photo est remplacée par sa référence. En cas
 * d'échec du magasin, les modèles sont renvoyés INCHANGÉS — jamais amputés.
 */
export const deshydraterModeles = async (
  models: any[],
  magasin: MagasinPhotos = magasinIndexedDB,
): Promise<any[]> => {
  if (!Array.isArray(models) || models.length === 0) return models;

  const aEcrire = new Map<string, string>();
  const clesVivantes = new Set<string>();
  const refParImage = new Map<string, string>();   // même image → même référence
  let quelqueChoseADeplacer = false;

  const sortis = models.map((m: any) => {
    if (!m || typeof m !== 'object') return m;
    const copie: any = { ...m };
    for (const champ of CHAMPS) {
      const valeur = champ.lire(m);
      if (estReference(valeur)) { clesVivantes.add(valeur.slice(PREFIXE_REF.length)); continue; }
      if (!estDataUrl(valeur)) continue;
      let ref = refParImage.get(valeur);
      if (!ref) {
        const cle = cleDe(valeur);
        aEcrire.set(cle, valeur);
        ref = PREFIXE_REF + cle;
        refParImage.set(valeur, ref);   // évite de ré-empreindre la même image
      }
      clesVivantes.add(ref.slice(PREFIXE_REF.length));
      champ.poser(copie, ref);
      quelqueChoseADeplacer = true;
    }
    return copie;
  });

  if (quelqueChoseADeplacer) {
    try {
      await magasin.ecrire(aEcrire);
    } catch {
      // Magasin indisponible : on garde les photos en clair. Mieux vaut une
      // bibliothèque lourde qu'une bibliothèque dont les images pointent vers
      // un magasin qui n'existe pas.
      return models;
    }
  }

  return quelqueChoseADeplacer ? sortis : models;
};

/**
 * Supprime les photos que plus aucun modèle ne réclame.
 *
 * Le ménage se fait d'après la bibliothèque TELLE QU'ELLE EST ENREGISTRÉE, et
 * jamais d'après la liste affichée à l'écran. La nuance décide de la survie des
 * photos : si une lecture du magasin échoue un instant, les modèles s'affichent
 * sans image — et nettoyer d'après cet écran-là effacerait toutes les photos de
 * l'atelier pour de bon. Le stockage, lui, garde les références même quand la
 * lecture des images a échoué : c'est la seule source qui ne ment pas.
 *
 * Par prudence, on s'abstient aussi quand aucune référence n'est trouvée :
 * une bibliothèque illisible ou vide n'est pas une autorisation de tout jeter.
 */
export const nettoyerPhotosOrphelines = async (
  magasin: MagasinPhotos = magasinIndexedDB,
): Promise<void> => {
  try {
    const brut = lsGet(CLE_BIBLIOTHEQUE);
    if (!brut) return;
    const models = JSON.parse(brut);
    if (!Array.isArray(models) || models.length === 0) return;
    const vivantes = new Set<string>();
    for (const m of models) {
      if (!m || typeof m !== 'object') continue;
      for (const champ of CHAMPS) {
        const v = champ.lire(m);
        if (estReference(v)) vivantes.add(v.slice(PREFIXE_REF.length));
      }
    }
    if (vivantes.size === 0) return;
    await magasin.garderSeulement(vivantes, prefixeCompte());
  } catch { /* le ménage n'est jamais urgent */ }
};

/**
 * Rend aux modèles leurs photos, pour l'affichage et pour l'envoi au cloud.
 * Une référence dont la photo a disparu du magasin devient `null` : le modèle
 * s'affiche sans aperçu, ce que l'interface sait déjà montrer.
 */
export const rehydraterModeles = async (
  models: any[],
  magasin: MagasinPhotos = magasinIndexedDB,
): Promise<any[]> => {
  if (!Array.isArray(models) || models.length === 0) return models;

  const cles = new Set<string>();
  for (const m of models) {
    if (!m || typeof m !== 'object') continue;
    for (const champ of CHAMPS) {
      const v = champ.lire(m);
      if (estReference(v)) cles.add(v.slice(PREFIXE_REF.length));
    }
  }
  if (cles.size === 0) return models;

  let photos: Map<string, string>;
  try {
    photos = await magasin.lire([...cles]);
  } catch {
    return models;
  }

  return models.map((m: any) => {
    if (!m || typeof m !== 'object') return m;
    const copie: any = { ...m };
    let touche = false;
    for (const champ of CHAMPS) {
      const v = champ.lire(m);
      if (!estReference(v)) continue;
      champ.poser(copie, photos.get(v.slice(PREFIXE_REF.length)) ?? null);
      touche = true;
    }
    return touche ? copie : m;
  });
};

/** Y a-t-il au moins une référence dans cette liste ? */
export const contientDesReferences = (models: any[]): boolean =>
  Array.isArray(models) && models.some(
    (m: any) => m && typeof m === 'object' && CHAMPS.some(c => estReference(c.lire(m))),
  );
