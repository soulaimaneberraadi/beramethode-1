/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONTACT_EMAIL?: string;
}

/** Date de fabrication du bundle, injectee par Vite (`define`). Le panneau de
 *  diagnostic l'affiche : c'est ce qui distingue « le defaut persiste » de
 *  « l'appareil tourne encore sur l'ancienne version ». */
declare const __BERA_BUILD__: string;
