/**
 * Ce que fait l'application quand la mémoire du navigateur dit non.
 *
 * Sur téléphone, le stockage local plafonne autour de 5 Mo, et les photos des
 * modèles y tiennent en clair : une poignée de modèles suffit à le remplir.
 * Passé la limite, `setItem` LÈVE une erreur — et cette erreur était partout
 * avalée. L'écran annonçait « Modèle sauvegardé avec succès », la bibliothèque
 * revenait vide au redémarrage, et un ordre de fabrication se plaignait d'un
 * modèle introuvable. Trois symptômes, une seule cause muette.
 *
 * Deux règles, ici :
 *  1. Un refus d'écriture se dit — l'événement `beramethode:storage-full`
 *     remonte à l'interface, qui peut enfin prévenir.
 *  2. Un modèle sans sa photo reste un modèle. Sa gamme, ses opérations et ses
 *     prix tiennent dans quelques kilo-octets ; la photo en pèse plusieurs
 *     centaines. Quand tout ne rentre pas, on garde le travail et on écarte les
 *     images — en notant lesquelles, pour que la synchro les rende depuis le
 *     cloud au lieu de les effacer chez les autres.
 */

import { lsSet, lsRemove, lsGet } from './storageKeys';

/**
 * Modèles dont la photo a dû être écartée du stockage LOCAL, faute de place.
 * Clé propre à l'appareil : elle n'est pas dans `SYNC_KEYS` et ne part donc
 * jamais au cloud — elle ne décrit pas les données, mais l'étroitesse de CE
 * téléphone.
 */
export const PHOTOS_ELAGUEES_KEY = 'beramethode_photos_elaguees';

/** Prévient l'interface qu'une écriture a été refusée. Ne lève jamais. */
export const signalerStockagePlein = (cle: string, e: unknown): void => {
  const nom = (e as { name?: string } | null)?.name || '';
  const message = String((e as { message?: string } | null)?.message || '');
  const plein =
    nom === 'QuotaExceededError' ||
    nom === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    /quota|storage/i.test(message);
  console.error(`[stockage] écriture locale refusée (${cle})`, e);
  if (!plein) return;
  try {
    window.dispatchEvent(new CustomEvent('beramethode:storage-full', { detail: { key: cle } }));
  } catch { /* ignore */ }
};

export const lirePhotosElaguees = (): Set<string> => {
  try {
    const raw = lsGet(PHOTOS_ELAGUEES_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch {
    return new Set();
  }
};

export const ecrirePhotosElaguees = (ids: Set<string>): void => {
  try {
    if (ids.size === 0) lsRemove(PHOTOS_ELAGUEES_KEY);
    else lsSet(PHOTOS_ELAGUEES_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
};

export const estDataUrl = (v: unknown): v is string =>
  typeof v === 'string' && v.startsWith('data:');

/** Le modèle porte-t-il une image en clair (base64) ? Les URL, légères, ne comptent pas. */
export const aPhotoEnClair = (m: any): boolean =>
  estDataUrl(m?.image) || estDataUrl(m?.images?.front) ||
  estDataUrl(m?.images?.back) || estDataUrl(m?.meta_data?.photo_url);

/** La même liste, privée de ses images en clair — les URL sont conservées. */
export const sansPhotos = (models: any[]): { modeles: any[]; elagues: string[] } => {
  const elagues: string[] = [];
  const modeles = models.map((m: any) => {
    if (!m || typeof m !== 'object' || !aPhotoEnClair(m)) return m;
    elagues.push(String(m.id));
    const copie: any = { ...m };
    if (estDataUrl(copie.image)) copie.image = null;
    if (copie.images && typeof copie.images === 'object') {
      copie.images = { ...copie.images };
      if (estDataUrl(copie.images.front)) copie.images.front = null;
      if (estDataUrl(copie.images.back)) copie.images.back = null;
    }
    if (copie.meta_data && estDataUrl(copie.meta_data.photo_url)) {
      copie.meta_data = { ...copie.meta_data, photo_url: null };
    }
    return copie;
  });
  return { modeles, elagues };
};

export type ResultatEcriture = 'complet' | 'sans-photos' | 'echec';

/**
 * Enregistre une liste de modèles en cédant le moins possible.
 *
 * `complet`     : tout est passé, photos comprises.
 * `sans-photos` : la place manquait ; le travail est enregistré, les images
 *                 sont écartées et notées pour que le push les rende.
 * `echec`       : même sans images, ça ne rentre pas — rien n'a été écrit,
 *                 et l'appelant doit le dire à l'utilisateur.
 */
export const ecrireModelesAuMieux = (cle: string, models: any[]): ResultatEcriture => {
  try {
    lsSet(cle, JSON.stringify(models));
    ecrirePhotosElaguees(new Set());     // plus rien à rendre
    return 'complet';
  } catch (e) {
    const { modeles, elagues } = sansPhotos(models);
    if (elagues.length === 0) {
      // Aucune image à écarter : réécrire la même chose ne changerait rien.
      signalerStockagePlein(cle, e);
      return 'echec';
    }
    try {
      lsSet(cle, JSON.stringify(modeles));
      // On CUMULE : un modèle élagué lors d'une écriture précédente attend
      // toujours sa photo, même s'il ne fait pas partie de celle-ci.
      const marques = lirePhotosElaguees();
      for (const id of elagues) marques.add(id);
      ecrirePhotosElaguees(marques);
      signalerStockagePlein(cle, e);
      return 'sans-photos';
    } catch (e2) {
      signalerStockagePlein(cle, e2);
      return 'echec';
    }
  }
};

/**
 * Clé de la bibliothèque. Doit rester alignée sur `LIBRARY_KEY`
 * (`app/constants.ts`) et sur `SYNC_KEYS` (`cloudSync.ts`) — on la répète ici
 * plutôt que d'importer `app/constants`, qui embarque toutes les traductions.
 */
const CLE_BIBLIOTHEQUE = 'beramethode_library';

/**
 * Fait de la place, en dernier recours, pour une écriture vitale.
 *
 * Les photos des modèles sont, de loin, ce qui occupe le plus de place — et ce
 * dont on peut se passer le plus longtemps : elles sont dans le cloud, et le
 * push les y rendra (cf. `PHOTOS_ELAGUEES_KEY`). Un jeton de session, lui, pèse
 * quelques kilo-octets et vaut infiniment plus : sans lui, l'utilisateur
 * retrouve l'écran de connexion à chaque ouverture.
 *
 * @returns true si de la place a effectivement été libérée.
 */
export const libererDeLaPlace = (): boolean => {
  try {
    const raw = lsGet(CLE_BIBLIOTHEQUE);
    if (!raw) return false;
    const models = JSON.parse(raw);
    if (!Array.isArray(models)) return false;
    const { modeles, elagues } = sansPhotos(models);
    if (elagues.length === 0) return false;      // rien à sacrifier
    lsSet(CLE_BIBLIOTHEQUE, JSON.stringify(modeles));
    const marques = lirePhotosElaguees();
    for (const id of elagues) marques.add(id);
    ecrirePhotosElaguees(marques);
    return true;
  } catch {
    return false;
  }
};
