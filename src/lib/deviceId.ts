/**
 * Identifiant d'appareil — envoyé au serveur en en-tête `x-bera-device`.
 *
 * ── Pourquoi un identifiant rangé, et pas une empreinte ──────────────────────
 * On aurait pu reconnaître un appareil à sa signature technique (navigateur,
 * écran, système). C'est séduisant parce que rien n'est stocké — et c'est
 * mauvais : cette signature change à chaque mise à jour du navigateur. Un
 * ouvrier qui laisse Chrome se mettre à jour deviendrait un inconnu, et une
 * limite d'appareils lui claquerait la porte au nez sans qu'il ait rien fait.
 *
 * Un numéro tiré au sort et rangé dans l'appareil est stable. S'il est effacé
 * (vidage du navigateur), la personne se reconnecte et en reçoit un nouveau :
 * un désagrément mineur, contre un blocage injustifié.
 *
 * ── Ce que ce n'est pas ──────────────────────────────────────────────────────
 * Ce n'est pas un secret d'authentification. Il dit « quel appareil », jamais
 * « qui » : l'identité reste portée par le cookie de session. Le connaître ne
 * donne accès à rien.
 */

const CLE = 'bera_device_id';

/** Alphabet volontairement restreint : doit passer tel quel dans un en-tête HTTP. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const tirerAuSort = (longueur = 24): string => {
  try {
    const octets = new Uint8Array(longueur);
    crypto.getRandomValues(octets);
    return Array.from(octets, o => ALPHABET[o % ALPHABET.length]).join('');
  } catch {
    // Contexte sans crypto (très vieux navigateur, contexte non sécurisé) :
    // Math.random suffit ici, l'identifiant n'a aucune valeur de secret.
    let s = '';
    for (let i = 0; i < longueur; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }
};

let enMemoire: string | null = null;

/**
 * Renvoie l'identifiant de cet appareil, en le créant au premier appel.
 *
 * Le repli en mémoire couvre le mode navigation privée et les navigateurs qui
 * refusent le stockage : l'appareil reste cohérent le temps de la session au
 * lieu de changer à chaque requête — ce qui remplirait la liste des appareils
 * de dizaines de lignes fantômes.
 */
export const idAppareil = (): string => {
  if (enMemoire) return enMemoire;
  try {
    const range = localStorage.getItem(CLE);
    if (range && /^[A-Za-z0-9_-]{8,64}$/.test(range)) {
      enMemoire = range;
      return range;
    }
    const neuf = tirerAuSort();
    localStorage.setItem(CLE, neuf);
    enMemoire = neuf;
    return neuf;
  } catch {
    enMemoire = enMemoire || tirerAuSort();
    return enMemoire;
  }
};

/**
 * Ajoute l'en-tête d'appareil à TOUTES les requêtes du programme, en
 * enveloppant `fetch` une seule fois au démarrage.
 *
 * Pourquoi ici plutôt que dans chaque appel : il y a plus d'une centaine
 * d'appels dispersés. Les modifier un par un garantit d'en oublier, et un appel
 * oublié n'échoue pas bruyamment — il rend juste l'appareil invisible, ce qui
 * est exactement le genre de trou qu'on ne remarque jamais.
 *
 * L'en-tête ne part QUE vers nos propres routes : l'ajouter à un appel sortant
 * vers un service tiers ferait fuiter un identifiant d'appareil chez lui, et
 * casserait au passage les requêtes soumises au contrôle d'origine.
 */
export const installerEnteteAppareil = (): void => {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  if ((window as any).__beraDeviceHeaderInstalled) return;
  (window as any).__beraDeviceHeaderInstalled = true;

  const fetchOriginal = window.fetch.bind(window);

  window.fetch = ((entree: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof entree === 'string' ? entree :
        entree instanceof URL ? entree.href :
        (entree as Request).url;

      // Nos routes seulement : chemin relatif commençant par /api, ou URL
      // absolue vers l'origine courante.
      const versNous =
        url.startsWith('/api') ||
        (typeof location !== 'undefined' && url.startsWith(location.origin) && url.includes('/api'));

      if (versNous) {
        const entetes = new Headers(init?.headers || (entree instanceof Request ? entree.headers : undefined));
        entetes.set('x-bera-device', idAppareil());

        // Requete deja construite : l en-tete doit etre pose SUR la requete.
        // Le maillon suivant (redirection vers un serveur distant) la rebatit a
        // partir de l objet Request seul — un en-tete passe en second argument
        // serait perdu en route, et l appareil deviendrait invisible.
        if (entree instanceof Request) {
          return fetchOriginal(new Request(entree, { headers: entetes }), init);
        }
        return fetchOriginal(entree as any, { ...init, headers: entetes });
      }
    } catch {
      // Jamais bloquant : en cas de doute on laisse passer la requête telle quelle.
    }
    return fetchOriginal(entree as any, init);
  }) as typeof window.fetch;
};
