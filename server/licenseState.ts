/**
 * État d'une licence : actif · délai de grâce · verrouillé.
 *
 * ── Le modèle ────────────────────────────────────────────────────────────────
 *
 *   abonnement terminé
 *          │
 *          ├─ client fidèle (6 mois cumulés payés) ─→ 15 jours de GRÂCE
 *          │                                          il voit tout, il n'écrit plus
 *          └─ client récent ───────────────────────→ pas de grâce
 *          │
 *          ▼
 *      VERROUILLÉ : il n'entre plus. Ses données restent intactes,
 *                   et il peut toujours les EXPORTER.
 *
 * ── Pourquoi la grâce se mérite ──────────────────────────────────────────────
 * Sans condition d'ancienneté, il suffirait de payer un mois pour récolter
 * 15 jours gratuits, indéfiniment. La lier à la durée déjà payée récompense
 * celui qui reste et ferme la porte à celui qui tourne.
 *
 * ── Pourquoi l'export reste ouvert même verrouillé ───────────────────────────
 * Ce programme contient la paie, les factures et la comptabilité. Une
 * entreprise en retard de paiement qui reçoit un contrôle du travail ou des
 * impôts doit pouvoir sortir ses registres. Lui couper l'accès à ses propres
 * écritures légales, c'est devenir une partie de son problème — et cela se
 * raconte vite. Couper l'outil met la même pression ; retenir les données en
 * otage n'ajoute qu'un risque, juridique et de réputation.
 *
 * ── Pourquoi on ne fait pas confiance à l'horloge ────────────────────────────
 * Reculer la date de Windows est à la portée de tout le monde, et suffirait à
 * rendre le délai éternel. On retient la date la plus avancée jamais observée :
 * si l'horloge recule, c'est elle qui fait foi.
 */

import db from './db';

export type EtatLicence = 'actif' | 'grace' | 'verrouille' | 'inconnu';

/** Durée du délai de grâce, en jours. */
export const JOURS_GRACE = 15;
/** Ancienneté payée exigée pour y avoir droit, en jours. */
export const JOURS_FIDELITE = 182; // ≈ 6 mois

export interface LicencePayload {
  source?: string;
  status?: string;
  expired?: boolean;
  expires_at?: string | null;
  /** Première émission — sert à mesurer l'ancienneté. Fourni par BERA MASTER. */
  first_issued_at?: string | null;
  /** Jours payés cumulés, si BERA MASTER sait les compter (prioritaire). */
  total_paid_days?: number | null;
}

export interface ResultatLicence {
  etat: EtatLicence;
  /** Écritures autorisées ? */
  inscriptible: boolean;
  /** Le programme est-il totalement fermé (hors export et réactivation) ? */
  verrouille: boolean;
  /** Jours restants avant le prochain palier (fin d'abonnement, puis fin de grâce). */
  joursRestants: number | null;
  /** A-t-il droit au délai de grâce ? */
  graceAccordee: boolean;
  finGrace: string | null;
}

const JOUR_MS = 24 * 60 * 60 * 1000;

const jourDe = (d: Date) => Math.floor(d.getTime() / JOUR_MS);

/**
 * « Maintenant », protégé contre un recul de l'horloge.
 *
 * On mémorise la date la plus avancée jamais vue pour cette entreprise. Une
 * horloge qui recule est soit un réglage manuel, soit une pile morte : dans les
 * deux cas la date mémorisée est plus digne de confiance que celle affichée.
 */
export const maintenantFiable = (ownerId: number): Date => {
  const systeme = new Date();
  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE owner_id = ? AND key = 'bera_horloge_max'")
      .get(ownerId) as { value: string } | undefined;

    const memorise = row?.value ? new Date(row.value) : null;
    const valide = memorise && !Number.isNaN(memorise.getTime()) ? memorise : null;

    if (valide && valide.getTime() > systeme.getTime()) return valide;

    // L'horloge avance normalement : on note la nouvelle borne. Écriture au
    // plus une fois par jour, pour ne pas taper la base à chaque requête.
    if (!valide || jourDe(systeme) > jourDe(valide)) {
      db.prepare(
        `INSERT INTO app_settings (owner_id, key, value) VALUES (?, 'bera_horloge_max', ?)
         ON CONFLICT (owner_id, key) DO UPDATE SET value = excluded.value`,
      ).run(ownerId, systeme.toISOString());
    }
    return systeme;
  } catch {
    return systeme;
  }
};

/**
 * A-t-il assez d'ancienneté pour mériter le délai ?
 *
 * En l'absence d'information (licence ancienne, champ pas encore fourni par
 * BERA MASTER), on ACCORDE la grâce. Se tromper en accordant coûte 15 jours ;
 * se tromper en refusant, c'est verrouiller sans préavis un client qui payait
 * depuis deux ans. Les deux erreurs ne pèsent pas le même poids.
 */
export const meriteGrace = (lic: LicencePayload, reference: Date): boolean => {
  if (typeof lic.total_paid_days === 'number') return lic.total_paid_days >= JOURS_FIDELITE;

  if (lic.first_issued_at) {
    const debut = new Date(lic.first_issued_at);
    if (!Number.isNaN(debut.getTime())) {
      return (reference.getTime() - debut.getTime()) / JOUR_MS >= JOURS_FIDELITE;
    }
  }
  return true; // information absente : on accorde
};

/**
 * Calcule l'état complet d'une licence.
 *
 * Volontairement permissif quand l'information manque : une licence illisible
 * ou jamais activée laisse le programme pleinement utilisable. Un bug de
 * lecture ne doit pas arrêter une usine.
 */
export const evaluerLicence = (lic: LicencePayload | null, reference: Date): ResultatLicence => {
  const ouvert: ResultatLicence = {
    etat: 'inconnu', inscriptible: true, verrouille: false,
    joursRestants: null, graceAccordee: false, finGrace: null,
  };

  if (!lic || lic.source === 'none') return ouvert;

  // Suspendue ou révoquée par le propriétaire : effet immédiat, pas de délai.
  // Ce n'est pas un oubli de paiement, c'est une décision — un compte volé ou
  // un litige n'attend pas quinze jours.
  if (lic.status === 'suspended' || lic.status === 'revoked') {
    return { ...ouvert, etat: 'verrouille', inscriptible: false, verrouille: true };
  }

  if (!lic.expires_at) {
    // Pas de date de fin : licence perpétuelle, ou information manquante.
    // `expired` reste le repli.
    return lic.expired === true
      ? { ...ouvert, etat: 'grace', inscriptible: false }
      : { ...ouvert, etat: 'actif' };
  }

  const fin = new Date(lic.expires_at);
  if (Number.isNaN(fin.getTime())) return ouvert;

  const joursAvantFin = Math.ceil((fin.getTime() - reference.getTime()) / JOUR_MS);
  if (joursAvantFin > 0) {
    return { ...ouvert, etat: 'actif', joursRestants: joursAvantFin };
  }

  // Abonnement terminé.
  const graceAccordee = meriteGrace(lic, reference);
  if (!graceAccordee) {
    return { ...ouvert, etat: 'verrouille', inscriptible: false, verrouille: true, graceAccordee: false };
  }

  const finGrace = new Date(fin.getTime() + JOURS_GRACE * JOUR_MS);
  const joursAvantVerrou = Math.ceil((finGrace.getTime() - reference.getTime()) / JOUR_MS);

  if (joursAvantVerrou > 0) {
    return {
      etat: 'grace', inscriptible: false, verrouille: false,
      joursRestants: joursAvantVerrou, graceAccordee: true,
      finGrace: finGrace.toISOString(),
    };
  }

  return {
    etat: 'verrouille', inscriptible: false, verrouille: true,
    joursRestants: 0, graceAccordee: true, finGrace: finGrace.toISOString(),
  };
};

/** Lit la licence enregistrée pour une entreprise. */
export const lireLicence = (ownerId: number): LicencePayload | null => {
  try {
    const row = db
      .prepare("SELECT value FROM app_settings WHERE owner_id = ? AND key = 'bera_license'")
      .get(ownerId) as { value: string } | undefined;
    return row?.value ? (JSON.parse(row.value) as LicencePayload) : null;
  } catch {
    return null;
  }
};

/** État courant, horloge protégée comprise. */
export const etatLicence = (ownerId: number | null | undefined): ResultatLicence => {
  const ouvert: ResultatLicence = {
    etat: 'inconnu', inscriptible: true, verrouille: false,
    joursRestants: null, graceAccordee: false, finGrace: null,
  };
  if (process.env.VITE_LICENSE_ENFORCE !== 'true') return ouvert;
  if (ownerId == null) return ouvert;
  try {
    return evaluerLicence(lireLicence(ownerId), maintenantFiable(ownerId));
  } catch {
    return ouvert;
  }
};
