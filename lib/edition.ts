/**
 * BERACOUPE — édition « salle de coupe » du même code, construite avec
 * `vite build --mode coupe` (VITE_EDITION=coupe), livrée en .exe Windows.
 *
 * Règle absolue : toute différence de comportement entre BERAMETHODE et
 * BERACOUPE passe par `IS_COUPE`. Quand `VITE_EDITION` n'est pas 'coupe'
 * (web Vercel, build local par défaut), rien ne change — EDITION vaut
 * 'methode' et tous les branchements ci-dessous sont des no-op.
 */

export const EDITION: 'coupe' | 'methode' = import.meta.env.VITE_EDITION === 'coupe' ? 'coupe' : 'methode';

export const IS_COUPE = EDITION === 'coupe';

export const NOM_PRODUIT = IS_COUPE ? 'BERACOUPE' : 'BERAMETHODE';

/**
 * Étiquette courte de l'appareil pour la présence réseau local
 * (Configuration → Appareils connectés / `POST /api/edition/presence`).
 * Ex. « PC · Chrome », « Téléphone Android · Chrome », « iPhone ».
 */
export function deviceLabel(): string {
    if (typeof navigator === 'undefined') return 'Appareil';
    const ua = navigator.userAgent || '';

    const browser = /Edg\//.test(ua) ? 'Edge'
        : /OPR\//.test(ua) ? 'Opera'
        : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome'
        : /Firefox\//.test(ua) ? 'Firefox'
        : /Safari\//.test(ua) && !/Chrome\//.test(ua) ? 'Safari'
        : 'Navigateur';

    const isIPhone = /iPhone/i.test(ua);
    const isIPad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    const isMobile = !isIPad && (/Mobi/i.test(ua) || isAndroid || isIPhone);

    if (isIPhone) return 'iPhone';
    if (isIPad) return `iPad · ${browser}`;
    if (isAndroid) return `Téléphone Android · ${browser}`;
    if (isMobile) return `Mobile · ${browser}`;

    const isMac = /Macintosh|Mac OS X/i.test(ua);
    const platform = isMac ? 'Mac' : /Windows/i.test(ua) ? 'PC' : /Linux/i.test(ua) ? 'Linux' : 'Ordinateur';
    return `${platform} · ${browser}`;
}

/**
 * Applique la marque au runtime (titre du document + favicon). Appelée une
 * seule fois au tout début de `index.tsx`, avant le montage React — la
 * balise `<title>` et l'icône statiques de `index.html` restent
 * BERAMETHODE pour l'édition web, cette fonction les corrige uniquement
 * quand `IS_COUPE` est vrai.
 */
export function applyEditionBranding(): void {
    if (typeof document === 'undefined') return;
    try {
        document.title = NOM_PRODUIT;
    } catch { /* non bloquant */ }
    if (!IS_COUPE) return;
    try {
        let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.type = 'image/svg+xml';
        link.href = '/beracoupe-icon.svg';
    } catch { /* icône par défaut conservée */ }
}
