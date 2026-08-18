/**
 * Identité légale de l'entreprise utilisatrice — source UNIQUE pour tous les
 * documents imprimés (factures, bons, fiches, tickets, étiquettes).
 *
 * POURQUOI ce module :
 *  - Chaque écran qui imprimait un document refaisait son propre `fetch` et sa
 *    propre normalisation des clés de `profileMeta`. Résultat : une facture
 *    pouvait afficher un ICE et un bon de commande un autre (ou aucun), selon
 *    l'écran d'où on l'imprimait. Un seul chargeur = un seul ICE.
 *  - Les documents partent chez des CLIENTS et des FOURNISSEURS : ils doivent
 *    porter le nom de L'ENTREPRISE, jamais celui du logiciel. Centraliser le
 *    chargement permet aussi de supprimer les « BERAMETHODE » codés en dur.
 *
 * Source canonique : `GET /api/permissions/company` (édition réservée au
 * super-admin dans Admin > Entreprise). Ce module ne fait que LIRE.
 */

import { useEffect, useState } from 'react';

export interface CompanyIdentity {
  /** Raison sociale (profileMeta.raisonSociale, sinon le nom du workspace). */
  nom: string;
  ice: string;
  rc: string;
  /** Identifiant fiscal (`if` dans profileMeta — mot réservé en JS d'où `if_`). */
  if_: string;
  cnss: string;
  patente: string;
  /** Adresse et ville déjà assemblées en une ligne prête à imprimer. */
  adresse: string;
  ville: string;
  tel: string;
  email: string;
  siteWeb: string;
  banque: string;
  rib: string;
  /** Logo (data-URL) tel qu'enregistré dans Admin > Entreprise. */
  logo: string;
}

export const EMPTY_COMPANY_IDENTITY: CompanyIdentity = {
  nom: '', ice: '', rc: '', if_: '', cnss: '', patente: '',
  adresse: '', ville: '', tel: '', email: '', siteWeb: '',
  banque: '', rib: '', logo: '',
};

const str = (v: unknown): string => String(v ?? '').trim();

/** Convertit la réponse brute de l'API en identité normalisée. */
export function parseCompanyIdentity(data: any): CompanyIdentity {
  const meta = (data?.profileMeta && typeof data.profileMeta === 'object') ? data.profileMeta : {};
  const adresse = str(meta.adresse);
  const ville = str(meta.ville);
  return {
    nom: str(meta.raisonSociale) || str(data?.name),
    ice: str(meta.ice),
    rc: str(meta.rc),
    if_: str(meta.if) || str(meta.identifiantFiscal),
    cnss: str(meta.cnss),
    patente: str(meta.patente),
    // Une seule ligne « adresse, ville » : c'est ce que tous les en-têtes veulent.
    adresse: [adresse, ville].filter(Boolean).join(', '),
    ville,
    tel: str(meta.companyPhone) || str(meta.adminPhone),
    email: str(meta.companyEmail) || str(meta.adminEmail),
    siteWeb: str(meta.siteWeb),
    banque: str(meta.banque),
    rib: str(meta.rib),
    logo: typeof data?.logo === 'string' ? data.logo : '',
  };
}

/**
 * Cache mémoire : un document s'imprime souvent en rafale (10 bons de coupe
 * d'affilée) et l'identité ne change qu'en passant par Admin > Entreprise.
 * On évite ainsi 10 allers-retours réseau et un en-tête qui « clignote ».
 */
let cache: CompanyIdentity | null = null;
let inflight: Promise<CompanyIdentity> | null = null;

/** Vide le cache — à appeler après une modification dans Admin > Entreprise. */
export function invalidateCompanyIdentity(): void {
  cache = null;
  inflight = null;
}

/**
 * Charge l'identité. Ne rejette JAMAIS : un profil incomplet ou une panne
 * réseau ne doit pas empêcher d'imprimer un document — l'en-tête est
 * simplement moins complet.
 */
export function loadCompanyIdentity(force = false): Promise<CompanyIdentity> {
  if (!force && cache) return Promise.resolve(cache);
  if (!force && inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/permissions/company', { credentials: 'include' });
      if (!res.ok) return EMPTY_COMPANY_IDENTITY;
      const identity = parseCompanyIdentity(await res.json());
      cache = identity;
      return identity;
    } catch (err) {
      console.error('[companyIdentity] chargement impossible', err);
      return EMPTY_COMPANY_IDENTITY;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Hook React : identité de l'entreprise pour les documents rendus en JSX.
 * Part du cache s'il existe (aucun clignotement d'en-tête entre deux ouvertures
 * de la même fiche) puis se met à jour dès la réponse du serveur.
 */
export function useCompanyIdentity(): CompanyIdentity {
  const [identity, setIdentity] = useState<CompanyIdentity>(() => cache || EMPTY_COMPANY_IDENTITY);
  useEffect(() => {
    let alive = true;
    loadCompanyIdentity().then(c => { if (alive) setIdentity(c); });
    return () => { alive = false; };
  }, []);
  return identity;
}

/** Identité déjà en cache (pour un premier rendu sans attendre le réseau). */
export function getCachedCompanyIdentity(): CompanyIdentity | null {
  return cache;
}

/**
 * Ligne d'identifiants légaux prête à imprimer : « ICE: … · RC: … · IF: … ».
 * Les champs vides sont omis (on n'imprime pas « ICE: » suivi de rien).
 */
export function legalLine(c: CompanyIdentity): string {
  return [
    c.ice && `ICE: ${c.ice}`,
    c.rc && `RC: ${c.rc}`,
    c.if_ && `IF: ${c.if_}`,
  ].filter(Boolean).join(' · ');
}

/** Ligne de contact : « Tél: … · email · site ». */
export function contactLine(c: CompanyIdentity): string {
  return [c.tel && `Tél: ${c.tel}`, c.email, c.siteWeb].filter(Boolean).join(' · ');
}

/** Échappement HTML — les documents construits en chaîne injectent des données saisies. */
export function escHtml(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string));
}

/**
 * En-tête HTML commun aux documents générés en chaîne de caractères
 * (fenêtres d'impression de Magasin, LaCoupe, Facturation…). Styles inline :
 * ces fenêtres n'ont pas accès aux feuilles de style de l'application.
 */
export function companyHeaderHtml(c: CompanyIdentity, opts: { logo?: boolean } = {}): string {
  const showLogo = opts.logo !== false && !!c.logo;
  const lines = [c.adresse, contactLine(c), legalLine(c)].filter(Boolean);
  if (!c.nom && lines.length === 0) return '';
  return `<div style="display:flex;gap:10px;align-items:flex-start;">
  ${showLogo ? `<img src="${escHtml(c.logo)}" alt="" style="height:42px;max-width:120px;object-fit:contain;" />` : ''}
  <div style="line-height:1.35;">
    <div style="font-weight:800;font-size:13px;text-transform:uppercase;color:#0f172a;">${escHtml(c.nom)}</div>
    ${lines.map(l => `<div style="font-size:9px;color:#64748b;">${escHtml(l)}</div>`).join('')}
  </div>
</div>`;
}
