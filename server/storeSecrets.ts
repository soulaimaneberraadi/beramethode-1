/**
 * CHIFFREMENT AU REPOS DU JETON DE BOUTIQUE (`st_store_config.token`).
 *
 * Le jeton d'une boutique en ligne (`shpat_…`, Bearer d'un site maison) ne sort
 * jamais du serveur : le controller ne renvoie qu'une version masquée. Mais il
 * était écrit EN CLAIR dans `database.sqlite` — un fichier qui se copie sur une
 * clé USB, part dans une sauvegarde, ou se retrouve dans un dossier partagé de
 * l'atelier. Quiconque ouvre ce fichier obtient un accès en écriture au stock et
 * aux commandes de la boutique.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHOIX 1 — la clé dérive de `JWT_SECRET`, pas d'une nouvelle variable.
 * ═══════════════════════════════════════════════════════════════════════════
 * `JWT_SECRET` est DÉJÀ obligatoire dans ce projet (`jwtConfig.ts` refuse de
 * démarrer sans lui, 32 caractères minimum). Imposer une variable de plus
 * garantirait qu'elle ne soit configurée nulle part : les installations
 * existantes tourneraient alors sans chiffrement, c'est-à-dire exactement le
 * problème que ce fichier corrige. La clé AES est dérivée par `scrypt` avec un
 * SEL FIXE et documenté ci-dessous — fixe parce qu'il doit être reproductible à
 * chaque démarrage pour relire les jetons déjà en base.
 *
 * ⚠️ CONSÉQUENCE À CONNAÎTRE : changer `JWT_SECRET` rend les jetons illisibles.
 * Ce n'est pas une perte de données grave — il suffit de re-saisir le jeton de
 * la boutique — mais la synchronisation s'arrête d'ici là, avec une erreur
 * explicite plutôt qu'un silence.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CHOIX 2 — migration silencieuse par MARQUEUR, jamais par migration de masse.
 * ═══════════════════════════════════════════════════════════════════════════
 * Les valeurs chiffrées portent le préfixe `encv1:`. À la lecture, une valeur
 * SANS marqueur est traitée comme du clair hérité et renvoyée telle quelle ;
 * elle sera re-chiffrée à la prochaine écriture de la configuration. Aucune
 * installation existante ne se retrouve donc avec une boutique qui ne se
 * connecte plus, et aucune migration de masse ne peut corrompre la colonne.
 *
 * Le marqueur porte un numéro de version : le jour où l'algorithme change,
 * `encv2:` cohabitera avec `encv1:` au lieu de casser l'existant.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/** Préfixe des valeurs chiffrées. Son ABSENCE signifie « clair hérité ». */
const MARQUEUR = 'encv1:';

/** Sel de dérivation. Fixe et public par nature : la sécurité vient de
 *  `JWT_SECRET`, pas du sel. Un sel aléatoire imposerait de le stocker à côté
 *  du jeton, sans rien apporter face à un attaquant qui a déjà le fichier. */
const SEL = 'beramethode.store.token.v1';

const ALGO = 'aes-256-gcm';
const IV_OCTETS = 12;   // taille recommandée pour GCM
const TAG_OCTETS = 16;

let cleCache: Buffer | null = null;
let avertissementDonne = false;

/**
 * Clé AES dérivée de `JWT_SECRET`, ou `null` si le secret est absent.
 *
 * ⚠️ On lit `process.env` directement au lieu d'importer `jwtConfig` : ce module
 * LÈVE au chargement quand le secret manque. Ici on ne veut rien casser — un
 * serveur sans `JWT_SECRET` (script d'outillage, test) doit continuer à lire et
 * écrire ses jetons en clair, avec un avertissement.
 */
const cle = (): Buffer | null => {
    if (cleCache) return cleCache;
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
        if (!avertissementDonne) {
            avertissementDonne = true;
            console.warn('[storeSecrets] JWT_SECRET absent : les jetons de boutique restent EN CLAIR en base. Définissez JWT_SECRET pour activer le chiffrement au repos.');
        }
        return null;
    }
    cleCache = scryptSync(secret, SEL, 32);
    return cleCache;
};

/** `true` si la valeur stockée porte le marqueur de chiffrement. */
export const estChiffre = (valeur: unknown): boolean =>
    typeof valeur === 'string' && valeur.startsWith(MARQUEUR);

/**
 * Chiffre un jeton en clair. Idempotent : une valeur déjà chiffrée est renvoyée
 * telle quelle — sinon un double appel produirait un chiffrement en couches que
 * la lecture ne saurait pas défaire.
 */
export const chiffrerToken = (clair: string | null | undefined): string | null => {
    const t = clair == null ? '' : String(clair);
    if (!t) return null;
    if (estChiffre(t)) return t;

    const k = cle();
    if (!k) return t; // pas de secret : on conserve le comportement historique

    const iv = randomBytes(IV_OCTETS);
    const chiffreur = createCipheriv(ALGO, k, iv);
    const corps = Buffer.concat([chiffreur.update(t, 'utf8'), chiffreur.final()]);
    // iv | tag | chiffré — un seul champ à stocker, donc une seule colonne à migrer.
    return MARQUEUR + Buffer.concat([iv, chiffreur.getAuthTag(), corps]).toString('base64');
};

/**
 * Déchiffre une valeur lue en base.
 *
 * • valeur sans marqueur → clair hérité, renvoyée telle quelle (rétrocompatibilité) ;
 * • valeur chiffrée illisible (secret changé, base copiée d'une autre machine)
 *   → `null` + journal. Renvoyer le texte chiffré tel quel serait pire : il
 *   partirait comme jeton d'authentification et la boutique répondrait 401 sans
 *   qu'on comprenne pourquoi.
 */
export const dechiffrerToken = (stocke: string | null | undefined): string | null => {
    const v = stocke == null ? '' : String(stocke);
    if (!v) return null;
    if (!estChiffre(v)) return v;

    const k = cle();
    if (!k) {
        console.warn('[storeSecrets] jeton chiffré illisible : JWT_SECRET absent.');
        return null;
    }
    try {
        const brut = Buffer.from(v.slice(MARQUEUR.length), 'base64');
        const iv = brut.subarray(0, IV_OCTETS);
        const tag = brut.subarray(IV_OCTETS, IV_OCTETS + TAG_OCTETS);
        const corps = brut.subarray(IV_OCTETS + TAG_OCTETS);
        const dechiffreur = createDecipheriv(ALGO, k, iv);
        dechiffreur.setAuthTag(tag);
        return Buffer.concat([dechiffreur.update(corps), dechiffreur.final()]).toString('utf8');
    } catch {
        console.error('[storeSecrets] déchiffrement du jeton impossible — JWT_SECRET a-t-il changé ? Re-saisissez le jeton de la boutique.');
        return null;
    }
};

/**
 * Rend une ligne `st_store_config` utilisable par un adaptateur : jeton en clair
 * en mémoire, jamais réécrit en base sous cette forme.
 *
 * ⚠️ Point de passage OBLIGATOIRE. Toute lecture de `st_store_config` destinée à
 * appeler la plateforme doit passer par ici, sinon l'adaptateur enverrait la
 * chaîne `encv1:…` comme jeton d'authentification.
 */
export const dechiffrerConfig = <T extends { token: string | null }>(row: T | null | undefined): T | null => {
    if (!row) return null;
    return { ...row, token: dechiffrerToken(row.token) };
};
