/**
 * Faire pointer l'application publiee vers un serveur distant.
 *
 * Le site sur Vercel n'a pas de serveur : les ventes, le stock et les clients
 * vivent dans la base locale. Plutot que de reecrire les quelque cent appels
 * `fetch('/api/...')` dispersés dans le code, on detourne `fetch` une fois,
 * au demarrage : toute adresse commencant par `/api/` part vers l'origine
 * configuree, avec les cookies.
 *
 * `VITE_API_ORIGIN` vide (le cas normal en local) = rien n'est detourne.
 *
 * Cote serveur il faut, en face :
 *   BERA_CORS_ORIGINS=https://mon-site.vercel.app
 *   CROSS_SITE=true      (cookie SameSite=None, donc HTTPS obligatoire)
 */
const ORIGINE = String(import.meta.env.VITE_API_ORIGIN || '').replace(/\/+$/, '');

export const apiOrigine = ORIGINE;

export const installerRedirectionApi = () => {
    if (!ORIGINE || typeof window === 'undefined') return;

    const fetchOriginal = window.fetch.bind(window);

    window.fetch = ((entree: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof entree === 'string' ? entree
            : entree instanceof URL ? entree.toString()
                : entree.url;

        // Uniquement les chemins relatifs vers l'API : une URL absolue vise
        // deja son serveur (Supabase, Cloudflare...), on n'y touche pas.
        if (!url.startsWith('/api/')) return fetchOriginal(entree as any, init);

        // Les cookies traversent les domaines seulement si on le demande.
        const options: RequestInit = { ...init, credentials: 'include' };

        if (typeof entree === 'string' || entree instanceof URL) {
            return fetchOriginal(ORIGINE + url, options);
        }
        // Requete deja construite : on la rebatit sur la nouvelle adresse,
        // sans quoi son `url` en lecture seule resterait relative.
        return fetchOriginal(new Request(ORIGINE + url, entree), options);
    }) as typeof window.fetch;

    console.log(`%cAPI distante : ${ORIGINE}`, 'color:#0ea5e9;font-weight:bold');
};
