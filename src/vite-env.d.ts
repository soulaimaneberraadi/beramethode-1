/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTACT_EMAIL?: string;
  /** 'coupe' → build BERACOUPE (édition salle de coupe). Absent/autre → BERAMETHODE. Voir lib/edition.ts. */
  readonly VITE_EDITION?: string;
}
