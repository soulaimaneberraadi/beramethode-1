import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Store, Loader2, RefreshCw, AlertTriangle, CheckCircle2, Clock, Save, Trash2,
    Plus, ChevronDown, Copy, Upload, Link2, ShieldCheck, ServerOff,
} from 'lucide-react';
import { tx } from '../../lib/i18n';
import type { Lang } from '../../app/constants';
import { useLang } from '../../src/context/LanguageContext';
import { fmt } from '../../app/constants';

/**
 * BOUTIQUE EN LIGNE — écrans de synchronisation.
 *
 * Le patron d'atelier n'est pas informaticien : il ne doit jamais lire « SKU »,
 * « variant », « API » ou « endpoint ». Il lit « code article », « couleur /
 * taille », « boutique », « synchroniser ». Les identifiants techniques
 * distants existent (il en faut pour dialoguer avec Shopify) mais ils vivent
 * dans un repli « dépannage » que personne n'ouvre en usage normal.
 *
 * Trois écrans vivent ici :
 *   1. `BoutiqueConfigSection`  → Réglages : brancher la boutique, la tester.
 *   2. `ModelStoreSection`      → Fiche modèle : lier, publier, synchroniser.
 *   3. `StoreSyncDot` + `useStoreSyncStates` → pastille d'état dans la liste.
 *
 * Aucun calcul de coût n'est touché : ce module ne fait que lire des prix
 * déjà calculés ailleurs et pousser des quantités.
 */

/** Mode statique (Vercel, sans Express) : les routes `/api/store/*` n'existent
 *  pas. On l'avoue au lieu de faire tourner une roue pour l'éternité. */
export const STORE_IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

export type StorePlateforme = 'SHOPIFY' | 'WOO' | 'CUSTOM';

export interface StoreConfig {
    id: string;
    plateforme: StorePlateforme;
    nom: string;
    boutique_url: string;
    /** Jeton masqué renvoyé par le serveur (jamais en clair). */
    token_masque: string | null;
    location_id: string | null;
    actif: boolean | number;
    marge_securite: number | null;
    derniere_sync: string | null;
    derniere_erreur: string | null;
}

export interface StoreMapping {
    id: string;
    modelId: string;
    couleur: string | null;
    taille: string | null;
    /** Code article généré par le programme — jamais tapé à la main. */
    sku: string | null;
    external_variant_id: string | null;
    external_inventory_item_id: string | null;
    statut: 'OK' | 'PENDING' | 'ERROR';
    derniere_erreur: string | null;
    derniere_qte_poussee: number | null;
    qte_locale: number | null;
}

export interface StoreStatus {
    actif: boolean;
    derniere_sync: string | null;
    en_attente: number;
    en_erreur: number;
    modeles_mappes: number;
}

/* ------------------------------------------------------------------ */
/* Helpers purs — aucun hook ici (un hook en portée module produit une  */
/* page blanche : « Invalid hook call »).                               */
/* ------------------------------------------------------------------ */

const jsonOrThrow = async (r: Response) => {
    if (r.ok) return r.json();
    let msg = '';
    try { msg = (await r.json())?.message || ''; } catch { /* réponse non JSON */ }
    throw new Error(msg || `HTTP ${r.status}`);
};

const fmtMoment = (raw: any, locale: string): string => {
    if (!raw) return '—';
    const d = new Date(raw);
    return isNaN(d.getTime()) ? String(raw) : `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
};

const toNum = (v: any): number => Number(v) || 0;

/** Nom lisible d'une plateforme. « Boutique personnalisée » = le développeur du
 *  client implémente le contrat REST affiché plus bas. */
const nomPlateforme = (p: StorePlateforme, lang: Lang | string): string => {
    if (p === 'SHOPIFY') return 'Shopify';
    if (p === 'WOO') return 'WooCommerce';
    return tx(lang, { fr: 'Boutique personnalisée', ar: 'متجر خاص', en: 'Custom shop', es: 'Tienda personalizada', pt: 'Loja personalizada', tr: 'Özel mağaza' });
};

/* ------------------------------------------------------------------ */
/* Briques visuelles                                                    */
/* ------------------------------------------------------------------ */

const Carte: React.FC<{ title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, right, children }) => (
    <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/40 flex items-center gap-2">
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-dk-muted flex-1">{title}</span>
            {right}
        </div>
        <div className="p-4">{children}</div>
    </div>
);

/** Encart « il faut le serveur local ». Honnête, définitif, sans roue qui
 *  tourne : en mode statique la synchronisation ne peut pas exister. */
export const StoreHorsLigne: React.FC<{ lang?: Lang | string }> = ({ lang: langProp }) => {
    const { lang: ctxLang } = useLang();
    const lang = langProp ?? ctxLang;
    return (
        <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20">
            <ServerOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-snug text-amber-800 dark:text-amber-300 font-semibold">
                {tx(lang, {
                    fr: "La synchronisation avec une boutique en ligne nécessite le serveur local de l'atelier. Cette version en ligne ne peut ni lire ni écrire dans votre boutique.",
                    ar: 'المزامنة مع متجر إلكتروني تتطلّب الخادم المحلي للورشة. هذه النسخة على الويب لا تقدر تقرا ولا تكتب فمتجرك.',
                    en: 'Syncing with an online shop requires the workshop local server. This web version can neither read nor write to your shop.',
                    es: 'La sincronización con una tienda en línea requiere el servidor local del taller. Esta versión web no puede leer ni escribir en su tienda.',
                    pt: 'A sincronização com uma loja online requer o servidor local da oficina. Esta versão web não pode ler nem escrever na sua loja.',
                    tr: 'Çevrimiçi mağaza ile eşitleme atölyenin yerel sunucusunu gerektirir. Bu web sürümü mağazanıza ne yazabilir ne okuyabilir.',
                })}
            </p>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Chargement des boutiques configurées                                 */
/* ------------------------------------------------------------------ */

export function useStoreConfigs() {
    const [configs, setConfigs] = useState<StoreConfig[]>([]);
    const [loading, setLoading] = useState(!STORE_IS_STATIC);
    /** `true` = le serveur ne répond pas (mode statique ou route absente).
     *  On préfère ne RIEN afficher plutôt qu'une erreur brute. */
    const [indisponible, setIndisponible] = useState(STORE_IS_STATIC);

    const recharger = useCallback(() => {
        if (STORE_IS_STATIC) { setLoading(false); setIndisponible(true); return; }
        setLoading(true);
        fetch('/api/store/config', { credentials: 'include' })
            .then(jsonOrThrow)
            .then((d: any) => { setConfigs(Array.isArray(d) ? d : []); setIndisponible(false); })
            .catch(() => { setConfigs([]); setIndisponible(true); })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { recharger(); }, [recharger]);

    return { configs, loading, indisponible, recharger };
}

/** Boutique de travail : celle qui est active, sinon la première déclarée. */
const boutiqueCourante = (configs: StoreConfig[]): StoreConfig | null =>
    configs.find(c => !!c.actif) || configs[0] || null;

/* ================================================================== */
/* ÉCRAN 1 — RÉGLAGES : brancher la boutique                           */
/* ================================================================== */

interface DraftBoutique {
    id?: string;
    plateforme: StorePlateforme;
    nom: string;
    boutique_url: string;
    /** Vide = « garder le jeton déjà enregistré ». On ne renvoie JAMAIS un
     *  jeton vide au serveur, sinon on effacerait l'existant. */
    token: string;
    location_id: string;
    marge_securite: string;
    actif: boolean;
    token_masque: string | null;
}

const draftDepuis = (c: StoreConfig): DraftBoutique => ({
    id: c.id,
    plateforme: c.plateforme,
    nom: c.nom || '',
    boutique_url: c.boutique_url || '',
    token: '',
    location_id: c.location_id || '',
    marge_securite: String(toNum(c.marge_securite)),
    actif: !!c.actif,
    token_masque: c.token_masque || null,
});

const draftVide = (): DraftBoutique => ({
    plateforme: 'SHOPIFY',
    nom: '',
    boutique_url: '',
    token: '',
    location_id: '',
    marge_securite: '0',
    actif: true,
    token_masque: null,
});

/** Contrat REST que le développeur d'une boutique personnalisée doit fournir.
 *  Affiché tel quel, copiable : c'est le seul endroit du produit où du
 *  vocabulaire technique est assumé — il ne s'adresse pas au patron. */
const CONTRAT_CUSTOM = `Authentification : en-tête  Authorization: Bearer <jeton>
Toute requête sans ce jeton, ou avec un jeton inconnu, doit répondre 401.

1) GET  /api/ping
        -> { "ok": true, "nom": "Ma Boutique" }
        Sert au bouton « Tester la connexion ». Ne modifie rien.

2) GET  /api/stock?sku=ABC-RGE-M
        -> { "sku": "ABC-RGE-M", "quantite": 12 }
        SKU inconnu -> 404 (et non 200 avec quantite 0 : « inconnu » et
        « épuisé » ne veulent pas dire la même chose).

3) POST /api/stock
        { "sku": "ABC-RGE-M", "quantite": 12 }
        -> { "ok": true }      erreur -> { "ok": false, "erreur": "…" }

        /!\\ REGLE ABSOLUE : "quantite" est une valeur ABSOLUE, jamais un
        écart. « quantite: 12 » veut dire « après cet appel il doit rester
        12 pièces vendables », PAS « ajoute 12 ». Le programme peut rejouer
        le même appel (coupure réseau, réponse perdue) : avec une valeur
        absolue le rejeu est sans effet, avec un écart le stock dérive.

4) GET  /api/orders?since=2026-01-04T10:12:00Z
        -> { "commandes": [ {
               "ref": "CMD-1042",
               "date": "2026-01-04T10:12:00Z",
               "client_nom": "Fatima B.",
               "client_email": "f.b@example.ma",
               "lignes": [ { "sku": "ABC-RGE-M", "quantite": 2,
                             "prix_unitaire": 180 } ]
             } ],
             "cursor": "2026-01-04T10:12:00Z" }

        "ref" doit être STABLE et unique dans le temps : c'est sur elle que
        le programme garantit de ne pas décompter deux fois la même
        commande. Une référence qui change ferait sortir du stock jamais
        vendu. "cursor" est renvoyé tel quel à l'appel suivant.`;

export const BoutiqueConfigSection: React.FC<{
    lang?: Lang | string;
    dateLocale?: string;
    /** Section repliable pilotée par la page Réglages (même mécanisme que les
     *  autres blocs : `openSec` / `toggleSec`). */
    open: boolean;
    onToggle: () => void;
}> = ({ lang: langProp, dateLocale = 'fr-FR', open, onToggle }) => {
    const { lang: ctxLang } = useLang();
    const lang = langProp ?? ctxLang;

    const { configs, loading, indisponible, recharger } = useStoreConfigs();
    const [draft, setDraft] = useState<DraftBoutique | null>(null);
    const [busy, setBusy] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);
    const [testBusy, setTestBusy] = useState(false);
    const [testResultat, setTestResultat] = useState<{ ok: boolean; nom?: string; message?: string } | null>(null);
    const [status, setStatus] = useState<StoreStatus | null>(null);
    const [retryBusy, setRetryBusy] = useState(false);
    const [copie, setCopie] = useState(false);

    /** Le brouillon suit la boutique enregistrée tant que l'utilisateur n'a
     *  rien saisi : sans cela, un rechargement laisserait un formulaire vide
     *  devant une boutique pourtant configurée. */
    useEffect(() => {
        if (draft) return;
        const c = boutiqueCourante(configs);
        if (c) setDraft(draftDepuis(c));
    }, [configs, draft]);

    const chargerStatus = useCallback(() => {
        if (STORE_IS_STATIC) return;
        fetch('/api/store/status', { credentials: 'include' })
            .then(jsonOrThrow)
            .then((d: any) => setStatus(d && typeof d === 'object' ? d as StoreStatus : null))
            .catch(() => setStatus(null));
    }, []);

    useEffect(() => { if (open) chargerStatus(); }, [open, chargerStatus]);

    const enregistrer = () => {
        if (!draft) return;
        if (!draft.nom.trim() || !draft.boutique_url.trim()) {
            setErreur(tx(lang, { fr: 'Le nom et l’adresse de la boutique sont obligatoires.', ar: 'الاسم وعنوان المتجر إجباريين.', en: 'Shop name and address are required.', es: 'El nombre y la dirección de la tienda son obligatorios.', pt: 'O nome e o endereço da loja são obrigatórios.', tr: 'Mağaza adı ve adresi zorunludur.' }));
            return;
        }
        setBusy(true);
        setErreur(null);
        const corps: Record<string, unknown> = {
            id: draft.id,
            plateforme: draft.plateforme,
            nom: draft.nom.trim(),
            boutique_url: draft.boutique_url.trim(),
            location_id: draft.location_id.trim() || null,
            marge_securite: Math.max(0, Math.floor(Number(draft.marge_securite) || 0)),
            actif: draft.actif,
        };
        // Jeton laissé vide = on conserve celui déjà enregistré côté serveur.
        if (draft.token.trim()) corps.token = draft.token.trim();

        fetch('/api/store/config', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(corps),
        })
            .then(jsonOrThrow)
            .then(() => { setDraft(null); recharger(); chargerStatus(); })
            .catch((e: Error) => setErreur(e.message))
            .finally(() => setBusy(false));
    };

    const supprimer = () => {
        if (!draft?.id) { setDraft(null); return; }
        setBusy(true);
        fetch(`/api/store/config/${encodeURIComponent(draft.id)}`, { method: 'DELETE', credentials: 'include' })
            .then(jsonOrThrow)
            .then(() => { setDraft(null); setTestResultat(null); recharger(); chargerStatus(); })
            .catch((e: Error) => setErreur(e.message))
            .finally(() => setBusy(false));
    };

    /** Un voyant vert ne prouve rien. Le NOM RÉEL de sa boutique, si. */
    const tester = () => {
        if (!draft?.id) return;
        setTestBusy(true);
        setTestResultat(null);
        fetch(`/api/store/test/${encodeURIComponent(draft.id)}`, { method: 'POST', credentials: 'include' })
            .then(jsonOrThrow)
            .then((d: any) => setTestResultat({ ok: !!d?.ok, nom: d?.nom, message: d?.message }))
            .catch((e: Error) => setTestResultat({ ok: false, message: e.message }))
            .finally(() => setTestBusy(false));
    };

    const relancerErreurs = () => {
        setRetryBusy(true);
        fetch('/api/store/outbox/retry', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        })
            .then(jsonOrThrow)
            .then(() => chargerStatus())
            .catch(() => { /* l'état affiché reste celui du dernier chargement */ })
            .finally(() => setRetryBusy(false));
    };

    const copierContrat = () => {
        try {
            navigator.clipboard?.writeText(CONTRAT_CUSTOM);
            setCopie(true);
            setTimeout(() => setCopie(false), 2000);
        } catch { /* presse-papiers refusé par le navigateur */ }
    };

    const champ = 'w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 dark:focus:border-dk-accent font-medium text-slate-700 dark:text-dk-text-soft transition-all text-sm';
    const etiquette = 'block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted';

    return (
        <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col mt-6">
            <div onClick={onToggle} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center justify-between cursor-pointer select-none ${open ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                <div className="flex items-center gap-2">
                    <Store className="w-5 h-5 text-sky-500 dark:text-sky-400" />
                    <h2 className="font-bold text-slate-800 dark:text-dk-text">
                        {tx(lang, { fr: 'Boutique en ligne', ar: 'المتجر الإلكتروني', en: 'Online shop', es: 'Tienda en línea', pt: 'Loja online', tr: 'Çevrimiçi mağaza' })}
                    </h2>
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>

            <div className={`p-6 md:p-8 space-y-6 ${open ? '' : 'hidden'}`}>
                <p className="text-sm text-slate-500 dark:text-dk-muted font-medium">
                    {tx(lang, {
                        fr: "Reliez votre boutique en ligne à l'atelier : les quantités disponibles y sont poussées automatiquement, et le magasin ne vendra jamais une pièce déjà vendue en ligne.",
                        ar: 'اربط متجرك الإلكتروني بالورشة: الكميات المتوفّرة كتمشي ليه أوتوماتيكياً، والمخزن ما غاديش يبيع قطعة تباعت ديجا فالإنترنت.',
                        en: 'Connect your online shop to the workshop: available quantities are pushed automatically, and the store will never sell a piece already sold online.',
                        es: 'Conecte su tienda en línea al taller: las cantidades disponibles se envían automáticamente y el almacén nunca venderá una pieza ya vendida en línea.',
                        pt: 'Ligue a sua loja online à oficina: as quantidades disponíveis são enviadas automaticamente e a loja nunca venderá uma peça já vendida online.',
                        tr: 'Çevrimiçi mağazanızı atölyeye bağlayın: mevcut miktarlar otomatik gönderilir ve depo, çevrimiçi satılmış bir parçayı asla satmaz.',
                    })}
                </p>

                {STORE_IS_STATIC || indisponible ? (
                    <StoreHorsLigne lang={lang} />
                ) : loading && !draft ? (
                    <div className="flex items-center gap-2 text-sm text-slate-400 dark:text-dk-muted">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {tx(lang, { fr: 'Chargement…', ar: 'كيتحمّل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yükleniyor…' })}
                    </div>
                ) : (
                    <>
                        {/* Boutiques déjà enregistrées : on bascule d'une fiche à l'autre. */}
                        {configs.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                                {configs.map(c => (
                                    <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => { setDraft(draftDepuis(c)); setTestResultat(null); setErreur(null); }}
                                        className={draft?.id === c.id
                                            ? 'px-3 py-1.5 rounded-xl text-[11px] font-bold border border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 transition-colors'
                                            : 'px-3 py-1.5 rounded-xl text-[11px] font-bold border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors'}
                                    >
                                        {c.nom || nomPlateforme(c.plateforme, lang)}
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => { setDraft(draftVide()); setTestResultat(null); setErreur(null); }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-dashed border-slate-300 dark:border-dk-border text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    {tx(lang, { fr: 'Autre boutique', ar: 'متجر آخر', en: 'Another shop', es: 'Otra tienda', pt: 'Outra loja', tr: 'Başka mağaza' })}
                                </button>
                            </div>
                        )}

                        {erreur && (
                            <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{erreur}</p>
                        )}

                        {!draft ? (
                            <button
                                type="button"
                                onClick={() => setDraft(draftVide())}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 dark:bg-dk-accent text-white font-bold text-sm hover:bg-sky-700 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                {tx(lang, { fr: 'Brancher une boutique', ar: 'اربط متجر', en: 'Connect a shop', es: 'Conectar una tienda', pt: 'Ligar uma loja', tr: 'Mağaza bağla' })}
                            </button>
                        ) : (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {/* Plateforme — le formulaire s'adapte au choix. */}
                                    <div className="space-y-2">
                                        <label className={etiquette}>
                                            {tx(lang, { fr: 'Type de boutique', ar: 'نوع المتجر', en: 'Shop type', es: 'Tipo de tienda', pt: 'Tipo de loja', tr: 'Mağaza türü' })}
                                        </label>
                                        <select
                                            value={draft.plateforme}
                                            onChange={e => setDraft({ ...draft, plateforme: e.target.value as StorePlateforme })}
                                            className={`${champ} cursor-pointer`}
                                        >
                                            <option value="SHOPIFY">Shopify</option>
                                            <option value="WOO">WooCommerce</option>
                                            <option value="CUSTOM">{nomPlateforme('CUSTOM', lang)}</option>
                                        </select>
                                    </div>

                                    <div className="space-y-2">
                                        <label className={etiquette}>
                                            {tx(lang, { fr: 'Nom de la boutique', ar: 'اسم المتجر', en: 'Shop name', es: 'Nombre de la tienda', pt: 'Nome da loja', tr: 'Mağaza adı' })}
                                        </label>
                                        <input
                                            type="text"
                                            value={draft.nom}
                                            onChange={e => setDraft({ ...draft, nom: e.target.value })}
                                            placeholder={tx(lang, { fr: 'Ma boutique', ar: 'متجري', en: 'My shop', es: 'Mi tienda', pt: 'A minha loja', tr: 'Mağazam' })}
                                            className={champ}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className={etiquette}>
                                            {tx(lang, { fr: 'Adresse de la boutique', ar: 'عنوان المتجر', en: 'Shop address', es: 'Dirección de la tienda', pt: 'Endereço da loja', tr: 'Mağaza adresi' })}
                                        </label>
                                        <input
                                            type="text"
                                            value={draft.boutique_url}
                                            onChange={e => setDraft({ ...draft, boutique_url: e.target.value })}
                                            placeholder={draft.plateforme === 'SHOPIFY' ? 'ma-boutique.myshopify.com' : 'https://ma-boutique.ma'}
                                            className={champ}
                                        />
                                        <p className="text-xs text-slate-500 dark:text-dk-muted">
                                            {draft.plateforme === 'SHOPIFY'
                                                ? tx(lang, { fr: "L'adresse que Shopify vous a donnée, celle qui finit par .myshopify.com.", ar: 'العنوان اللي عطاك Shopify، اللي كيسالي بـ .myshopify.com.', en: 'The address Shopify gave you, the one ending in .myshopify.com.', es: 'La dirección que le dio Shopify, la que termina en .myshopify.com.', pt: 'O endereço que a Shopify lhe deu, o que termina em .myshopify.com.', tr: 'Shopify tarafından verilen, .myshopify.com ile biten adres.' })
                                                : tx(lang, { fr: "L'adresse de votre site, telle que vos clients la tapent.", ar: 'عنوان موقعك، بحال ما كيكتبوه الزبناء.', en: 'Your site address, as your customers type it.', es: 'La dirección de su sitio, tal como la escriben sus clientes.', pt: 'O endereço do seu site, tal como os clientes o escrevem.', tr: 'Müşterilerinizin yazdığı şekliyle site adresiniz.' })}
                                        </p>
                                    </div>

                                    {/* Jeton d'accès — jamais renvoyé en clair par le serveur. */}
                                    <div className="space-y-2">
                                        <label className={etiquette}>
                                            {tx(lang, { fr: "Clé d'accès", ar: 'مفتاح الولوج', en: 'Access key', es: 'Clave de acceso', pt: 'Chave de acesso', tr: 'Erişim anahtarı' })}
                                        </label>
                                        <input
                                            type="password"
                                            autoComplete="off"
                                            value={draft.token}
                                            onChange={e => setDraft({ ...draft, token: e.target.value })}
                                            placeholder={draft.token_masque || '••••••••••••'}
                                            className={champ}
                                        />
                                        <p className="text-xs text-slate-500 dark:text-dk-muted">
                                            {draft.token_masque
                                                ? tx(lang, { fr: 'Une clé est déjà enregistrée. Laissez vide pour la conserver.', ar: 'كاين مفتاح مسجّل ديجا. خلّي خاوي باش تحتافظ بيه.', en: 'A key is already saved. Leave empty to keep it.', es: 'Ya hay una clave guardada. Déjelo vacío para conservarla.', pt: 'Já existe uma chave guardada. Deixe vazio para a manter.', tr: 'Kayıtlı bir anahtar var. Korumak için boş bırakın.' })
                                                : tx(lang, { fr: 'La clé que votre boutique vous a fournie. Elle ne sera jamais réaffichée.', ar: 'المفتاح اللي عطاك المتجر. عمّرو ما غادي يتعاود يتعرض.', en: 'The key your shop gave you. It will never be displayed again.', es: 'La clave que le dio su tienda. No se volverá a mostrar.', pt: 'A chave que a sua loja lhe deu. Nunca será mostrada de novo.', tr: 'Mağazanızın verdiği anahtar. Bir daha gösterilmez.' })}
                                        </p>
                                    </div>

                                    {/* Marge de sécurité — conséquence concrète expliquée. */}
                                    <div className="space-y-2">
                                        <label className={etiquette}>
                                            {tx(lang, { fr: 'Pièces gardées de côté', ar: 'القطع المحجوزة جنباً', en: 'Pieces held back', es: 'Piezas reservadas', pt: 'Peças reservadas', tr: 'Ayrılan parçalar' })}
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            step={1}
                                            value={draft.marge_securite}
                                            onChange={e => setDraft({ ...draft, marge_securite: e.target.value })}
                                            className={champ}
                                        />
                                        <p className="text-xs text-slate-500 dark:text-dk-muted">
                                            {tx(lang, {
                                                fr: "Ces pièces ne seront jamais proposées en ligne. Le magasin ne vendra jamais une pièce déjà vendue en ligne, et la boutique ne vendra jamais une pièce déjà partie du magasin.",
                                                ar: 'هاد القطع عمّرها ما غادي تتعرض فالإنترنت. المخزن ما غاديش يبيع قطعة تباعت أونلاين، والمتجر ما غاديش يبيع قطعة خرجات من المخزن.',
                                                en: 'These pieces will never be offered online. The store will never sell a piece already sold online, and the shop will never sell a piece already gone from the store.',
                                                es: 'Estas piezas nunca se ofrecerán en línea. El almacén nunca venderá una pieza ya vendida en línea, ni la tienda una pieza ya salida del almacén.',
                                                pt: 'Estas peças nunca serão oferecidas online. A loja nunca venderá uma peça já vendida online, nem o armazém uma peça já saída.',
                                                tr: 'Bu parçalar çevrimiçi sunulmaz. Depo, çevrimiçi satılmış bir parçayı; mağaza da depodan çıkmış bir parçayı asla satmaz.',
                                            })}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <label className={etiquette}>
                                            {tx(lang, { fr: 'Synchronisation', ar: 'المزامنة', en: 'Synchronisation', es: 'Sincronización', pt: 'Sincronização', tr: 'Eşitleme' })}
                                        </label>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={draft.actif}
                                            onClick={() => setDraft({ ...draft, actif: !draft.actif })}
                                            className="flex items-center gap-3 w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 text-left transition-colors hover:border-slate-300 dark:hover:border-dk-accent"
                                        >
                                            <span className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${draft.actif ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-dk-border'}`}>
                                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-dk-surface rounded-full shadow transition-transform ${draft.actif ? 'translate-x-5' : ''}`} />
                                            </span>
                                            <span className="text-sm font-bold text-slate-700 dark:text-dk-text-soft">
                                                {draft.actif
                                                    ? tx(lang, { fr: 'Activée', ar: 'مفعّلة', en: 'Enabled', es: 'Activada', pt: 'Ativada', tr: 'Etkin' })
                                                    : tx(lang, { fr: 'En pause', ar: 'موقّفة', en: 'Paused', es: 'En pausa', pt: 'Em pausa', tr: 'Duraklatıldı' })}
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                {/* Boutique personnalisée : contrat REST pour le développeur du client. */}
                                {draft.plateforme === 'CUSTOM' && (
                                    <div className="rounded-2xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/40 p-4 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-xs font-bold uppercase text-slate-500 dark:text-dk-muted">
                                                {tx(lang, { fr: 'À remettre au développeur de votre site', ar: 'عطي هادشي لمطوّر موقعك', en: 'Hand this to your website developer', es: 'Entregue esto al desarrollador de su sitio', pt: 'Entregue isto ao programador do seu site', tr: 'Site geliştiricinize verin' })}
                                            </p>
                                            <button
                                                type="button"
                                                onClick={copierContrat}
                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-dk-border text-[11px] font-bold text-slate-600 dark:text-dk-text-soft hover:bg-white dark:hover:bg-dk-elevated transition-colors"
                                            >
                                                {copie ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                {copie
                                                    ? tx(lang, { fr: 'Copié', ar: 'تنسخ', en: 'Copied', es: 'Copiado', pt: 'Copiado', tr: 'Kopyalandı' })
                                                    : tx(lang, { fr: 'Copier', ar: 'نسخ', en: 'Copy', es: 'Copiar', pt: 'Copiar', tr: 'Kopyala' })}
                                            </button>
                                        </div>
                                        <pre className="overflow-x-auto text-[10px] leading-relaxed font-mono text-slate-700 dark:text-dk-text-soft bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl p-3 whitespace-pre">{CONTRAT_CUSTOM}</pre>
                                    </div>
                                )}

                                {/* Réglages de dépannage — repliés : personne n'a à les lire. */}
                                {draft.plateforme === 'SHOPIFY' && (
                                    <details className="rounded-2xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/40 px-4 py-3">
                                        <summary className="cursor-pointer text-xs font-bold uppercase text-slate-500 dark:text-dk-muted select-none">
                                            {tx(lang, { fr: 'Réglages avancés (dépannage)', ar: 'إعدادات متقدّمة (للإصلاح)', en: 'Advanced settings (troubleshooting)', es: 'Ajustes avanzados (soporte)', pt: 'Definições avançadas (resolução)', tr: 'Gelişmiş ayarlar (sorun giderme)' })}
                                        </summary>
                                        <div className="mt-3 space-y-2">
                                            <label className={etiquette}>
                                                {tx(lang, { fr: "Identifiant de l'entrepôt", ar: 'معرّف المستودع', en: 'Warehouse identifier', es: 'Identificador del almacén', pt: 'Identificador do armazém', tr: 'Depo tanımlayıcısı' })}
                                            </label>
                                            <input
                                                type="text"
                                                value={draft.location_id}
                                                onChange={e => setDraft({ ...draft, location_id: e.target.value })}
                                                className={champ}
                                            />
                                            <p className="text-xs text-slate-500 dark:text-dk-muted">
                                                {tx(lang, { fr: "À ne remplir que si votre boutique a plusieurs entrepôts et que le stock part au mauvais endroit.", ar: 'عمّرو غير إلى كان عندك بزّاف ديال المستودعات والمخزون كيمشي لبلاصة غالطة.', en: 'Only fill this if your shop has several warehouses and stock lands in the wrong one.', es: 'Rellénelo solo si su tienda tiene varios almacenes y el stock va al equivocado.', pt: 'Preencha apenas se a sua loja tiver vários armazéns e o stock for para o errado.', tr: 'Yalnızca mağazanızda birden çok depo varsa ve stok yanlış yere düşüyorsa doldurun.' })}
                                            </p>
                                        </div>
                                    </details>
                                )}

                                {/* Actions */}
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={enregistrer}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 dark:bg-dk-accent text-white font-bold text-sm hover:bg-indigo-700 transition-colors disabled:opacity-40"
                                    >
                                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        {tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}
                                    </button>

                                    <button
                                        type="button"
                                        disabled={!draft.id || testBusy}
                                        title={!draft.id ? tx(lang, { fr: 'Enregistrez d’abord la boutique.', ar: 'سجّل المتجر لّولاً.', en: 'Save the shop first.', es: 'Guarde primero la tienda.', pt: 'Guarde primeiro a loja.', tr: 'Önce mağazayı kaydedin.' }) : undefined}
                                        onClick={tester}
                                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-sky-200 dark:border-sky-800/60 text-sky-700 dark:text-sky-300 font-bold text-sm hover:bg-sky-50 dark:hover:bg-sky-950/30 transition-colors disabled:opacity-40"
                                    >
                                        {testBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                                        {tx(lang, { fr: 'Tester la connexion', ar: 'اختبر الاتّصال', en: 'Test the connection', es: 'Probar la conexión', pt: 'Testar a ligação', tr: 'Bağlantıyı test et' })}
                                    </button>

                                    {draft.id && (
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={supprimer}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 font-bold text-sm hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-40"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            {tx(lang, { fr: 'Débrancher', ar: 'فصل', en: 'Disconnect', es: 'Desconectar', pt: 'Desligar', tr: 'Bağlantıyı kes' })}
                                        </button>
                                    )}
                                </div>

                                {/* Résultat du test : le NOM RÉEL de la boutique, pas un voyant. */}
                                {testResultat && (
                                    testResultat.ok ? (
                                        <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20">
                                            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                                            <div className="text-[12px] leading-snug">
                                                <p className="font-bold text-emerald-800 dark:text-emerald-300">
                                                    {tx(lang, { fr: 'Connecté à votre boutique', ar: 'متّصل بمتجرك', en: 'Connected to your shop', es: 'Conectado a su tienda', pt: 'Ligado à sua loja', tr: 'Mağazanıza bağlandı' })} : « {testResultat.nom || draft.nom} »
                                                </p>
                                                <p className="text-emerald-700 dark:text-emerald-400 mt-0.5">
                                                    {tx(lang, { fr: "Si ce nom est bien le vôtre, la liaison est la bonne.", ar: 'إلى كان هاد الاسم ديالك، فالربط صحيح.', en: 'If that name is yours, the link is the right one.', es: 'Si ese nombre es el suyo, el enlace es correcto.', pt: 'Se esse nome é o seu, a ligação está correta.', tr: 'Bu ad sizinse bağlantı doğrudur.' })}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20">
                                            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                                            <p className="text-[12px] leading-snug font-semibold text-rose-700 dark:text-rose-400">
                                                {tx(lang, { fr: 'La boutique ne répond pas', ar: 'المتجر ما كيجاوبش', en: 'The shop does not answer', es: 'La tienda no responde', pt: 'A loja não responde', tr: 'Mağaza yanıt vermiyor' })}
                                                {testResultat.message ? ` — ${testResultat.message}` : ''}
                                            </p>
                                        </div>
                                    )
                                )}
                            </div>
                        )}

                        {/* État de la synchronisation */}
                        {status && (
                            <div className="rounded-2xl border border-slate-200 dark:border-dk-border overflow-hidden">
                                <div className="px-4 py-2.5 bg-slate-50 dark:bg-dk-bg/40 border-b border-slate-100 dark:border-dk-border flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-dk-muted">
                                        {tx(lang, { fr: 'État de la synchronisation', ar: 'حالة المزامنة', en: 'Synchronisation status', es: 'Estado de la sincronización', pt: 'Estado da sincronização', tr: 'Eşitleme durumu' })}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={chargerStatus}
                                        className="p-1 rounded-lg text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent hover:bg-white dark:hover:bg-dk-elevated transition-colors"
                                        title={tx(lang, { fr: 'Rafraîchir', ar: 'تحديث', en: 'Refresh', es: 'Actualizar', pt: 'Atualizar', tr: 'Yenile' })}
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-slate-50 dark:bg-dk-bg/60 rounded-xl px-3 py-2.5">
                                        <span className="block text-[9px] uppercase font-bold text-slate-400 dark:text-dk-muted">
                                            {tx(lang, { fr: 'Dernier envoi', ar: 'آخر إرسال', en: 'Last push', es: 'Último envío', pt: 'Último envio', tr: 'Son gönderim' })}
                                        </span>
                                        <span className="block text-[12px] font-bold text-slate-800 dark:text-dk-text mt-0.5">{fmtMoment(status.derniere_sync, dateLocale)}</span>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-dk-bg/60 rounded-xl px-3 py-2.5">
                                        <span className="block text-[9px] uppercase font-bold text-slate-400 dark:text-dk-muted">
                                            {tx(lang, { fr: 'En attente', ar: 'فالانتظار', en: 'Pending', es: 'En espera', pt: 'Em espera', tr: 'Beklemede' })}
                                        </span>
                                        <span className="block text-[12px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">{toNum(status.en_attente).toLocaleString(dateLocale)}</span>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-dk-bg/60 rounded-xl px-3 py-2.5">
                                        <span className="block text-[9px] uppercase font-bold text-slate-400 dark:text-dk-muted">
                                            {tx(lang, { fr: 'En erreur', ar: 'فيها خطأ', en: 'In error', es: 'Con error', pt: 'Com erro', tr: 'Hatalı' })}
                                        </span>
                                        <span className={`block text-[12px] font-bold mt-0.5 ${toNum(status.en_erreur) > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-dk-text'}`}>
                                            {toNum(status.en_erreur).toLocaleString(dateLocale)}
                                        </span>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-dk-bg/60 rounded-xl px-3 py-2.5">
                                        <span className="block text-[9px] uppercase font-bold text-slate-400 dark:text-dk-muted">
                                            {tx(lang, { fr: 'Modèles liés', ar: 'الموديلات المربوطة', en: 'Linked models', es: 'Modelos vinculados', pt: 'Modelos ligados', tr: 'Bağlı modeller' })}
                                        </span>
                                        <span className="block text-[12px] font-bold text-slate-800 dark:text-dk-text mt-0.5">{toNum(status.modeles_mappes).toLocaleString(dateLocale)}</span>
                                    </div>
                                </div>
                                {toNum(status.en_erreur) > 0 && (
                                    <div className="px-4 pb-4">
                                        <button
                                            type="button"
                                            disabled={retryBusy}
                                            onClick={relancerErreurs}
                                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-600 text-white font-bold text-[12px] hover:bg-rose-700 transition-colors disabled:opacity-40"
                                        >
                                            {retryBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                            {tx(lang, { fr: 'Réessayer', ar: 'عاود المحاولة', en: 'Retry', es: 'Reintentar', pt: 'Tentar de novo', tr: 'Yeniden dene' })}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

/* ================================================================== */
/* ÉCRAN 2 — FICHE MODÈLE : lier, publier, synchroniser                */
/* ================================================================== */

/** Un tarif tel que renvoyé par `/api/prix`, réduit à ce dont cet écran a
 *  besoin : savoir s'il existe un prix valable pour le canal en ligne. */
interface TarifCanal {
    prix: number;
    canal?: 'ATELIER' | 'MAGASIN' | 'ONLINE' | null;
}

export const ModelStoreSection: React.FC<{
    modelId: string;
    /** Le modèle a-t-il des couleurs ET des tailles ? Sans grille, publier n'a
     *  aucun sens : la boutique attend des variantes. */
    hasGrille: boolean;
    hasImage: boolean;
    /** Drapeau `ficheData.storePublished` — éteint par défaut. */
    published: boolean;
    /** Écriture du drapeau via le mécanisme du parent (même chemin que le prix
     *  de vente). Renvoie `false` si l'écriture a échoué. */
    onTogglePublished?: (modelId: string, published: boolean) => Promise<boolean> | void;
    /** Prix de vente de repli quand aucun tarif « en ligne » n'est défini. */
    prixVente?: number | null;
    currency: string;
    dateLocale: string;
    lang?: Lang | string;
}> = ({ modelId, hasGrille, hasImage, published, onTogglePublished, prixVente = null, currency, dateLocale, lang: langProp }) => {
    const { lang: ctxLang } = useLang();
    const lang = langProp ?? ctxLang;

    const { configs, loading: configsLoading, indisponible } = useStoreConfigs();
    const [storeId, setStoreId] = useState<string | null>(null);
    const [lignes, setLignes] = useState<StoreMapping[]>([]);
    const [chargement, setChargement] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);
    const [action, setAction] = useState<'generate' | 'publish' | 'sync' | 'toggle' | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [ligneOuverte, setLigneOuverte] = useState<string | null>(null);
    const [tarifs, setTarifs] = useState<TarifCanal[]>([]);

    /** Boutique de travail : celle qui est active, sauf choix explicite. */
    useEffect(() => {
        if (storeId) return;
        const c = boutiqueCourante(configs);
        if (c) setStoreId(c.id);
    }, [configs, storeId]);

    const chargerMapping = useCallback(() => {
        if (STORE_IS_STATIC || !storeId) return;
        setChargement(true);
        fetch(`/api/store/mapping?modelId=${encodeURIComponent(modelId)}&storeId=${encodeURIComponent(storeId)}`, { credentials: 'include' })
            .then(jsonOrThrow)
            .then((d: any) => { setLignes(Array.isArray(d) ? d : []); setErreur(null); })
            .catch(() => setLignes([]))
            .finally(() => setChargement(false));
    }, [modelId, storeId]);

    useEffect(() => { chargerMapping(); }, [chargerMapping]);

    /** Prix du canal « en ligne ». Un tarif sans canal reste valable partout :
     *  c'est le comportement historique, on ne le casse pas. */
    useEffect(() => {
        if (STORE_IS_STATIC) { setTarifs([]); return; }
        let annule = false;
        fetch(`/api/prix?modelId=${encodeURIComponent(modelId)}`, { credentials: 'include' })
            .then(jsonOrThrow)
            .then((d: any) => { if (!annule) setTarifs(Array.isArray(d) ? d : []); })
            .catch(() => { if (!annule) setTarifs([]); });
        return () => { annule = true; };
    }, [modelId]);

    const prixEnLigne = useMemo<number | null>(() => {
        const cible = tarifs.find(t => t.canal === 'ONLINE' && toNum(t.prix) > 0);
        if (cible) return toNum(cible.prix);
        const tousCanaux = tarifs.find(t => (t.canal == null || t.canal === undefined) && toNum(t.prix) > 0);
        if (tousCanaux) return toNum(tousCanaux.prix);
        return prixVente != null && prixVente > 0 ? prixVente : null;
    }, [tarifs, prixVente]);

    /** Ce qui manque avant de pouvoir montrer ce modèle au public. */
    const manques = useMemo<string[]>(() => {
        const out: string[] = [];
        if (prixEnLigne == null) out.push(tx(lang, { fr: 'un prix pour la vente en ligne', ar: 'ثمن للبيع أونلاين', en: 'a price for online sales', es: 'un precio para la venta en línea', pt: 'um preço para a venda online', tr: 'çevrimiçi satış için bir fiyat' }));
        if (!hasImage) out.push(tx(lang, { fr: 'au moins une photo du modèle', ar: 'على الأقل تصويرة للموديل', en: 'at least one photo of the model', es: 'al menos una foto del modelo', pt: 'pelo menos uma foto do modelo', tr: 'modelin en az bir fotoğrafı' }));
        return out;
    }, [prixEnLigne, hasImage, lang]);

    const pretAPublier = manques.length === 0;

    const appeler = (
        cle: 'generate' | 'publish' | 'sync',
        url: string,
        corps: Record<string, unknown>,
        succes: string,
    ) => {
        setAction(cle);
        setErreur(null);
        setMessage(null);
        fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(corps),
        })
            .then(jsonOrThrow)
            .then((d: any) => {
                // `/api/store/mapping/generate` renvoie directement le mapping.
                if (Array.isArray(d)) setLignes(d); else chargerMapping();
                setMessage(succes);
            })
            .catch((e: Error) => setErreur(e.message))
            .finally(() => setAction(null));
    };

    const basculerPublication = async () => {
        if (!onTogglePublished) return;
        const cible = !published;
        if (cible && !pretAPublier) return;
        setAction('toggle');
        try { await onTogglePublished(modelId, cible); } finally { setAction(null); }
    };

    /** Lignes triées : les erreurs d'abord, puis les écarts, puis le reste.
     *  Un écran de synchronisation doit montrer les ennuis en haut. */
    const lignesTriees = useMemo(() => {
        const poids = (l: StoreMapping) => {
            if (l.statut === 'ERROR') return 0;
            if (toNum(l.qte_locale) !== toNum(l.derniere_qte_poussee)) return 1;
            if (l.statut === 'PENDING') return 2;
            return 3;
        };
        return lignes.slice().sort((a, b) => poids(a) - poids(b)
            || String(a.couleur || '').localeCompare(String(b.couleur || ''))
            || String(a.taille || '').localeCompare(String(b.taille || '')));
    }, [lignes]);

    const th = 'px-3 py-2 text-left font-semibold uppercase tracking-wide text-[9px] text-slate-500 dark:text-dk-muted whitespace-nowrap';
    const td = 'px-3 py-2 whitespace-nowrap text-slate-700 dark:text-dk-text-soft';

    if (STORE_IS_STATIC || indisponible) {
        return (
            <Carte
                title={tx(lang, { fr: 'Boutique en ligne', ar: 'المتجر الإلكتروني', en: 'Online shop', es: 'Tienda en línea', pt: 'Loja online', tr: 'Çevrimiçi mağaza' })}
                icon={<Store className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
            >
                <StoreHorsLigne lang={lang} />
            </Carte>
        );
    }

    if (configsLoading) {
        return (
            <Carte
                title={tx(lang, { fr: 'Boutique en ligne', ar: 'المتجر الإلكتروني', en: 'Online shop', es: 'Tienda en línea', pt: 'Loja online', tr: 'Çevrimiçi mağaza' })}
                icon={<Store className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
            >
                <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-dk-muted py-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {tx(lang, { fr: 'Chargement…', ar: 'كيتحمّل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yükleniyor…' })}
                </div>
            </Carte>
        );
    }

    /* Aucune boutique branchée : on le dit une fois, sans écran de plus. */
    if (configs.length === 0) {
        return (
            <Carte
                title={tx(lang, { fr: 'Boutique en ligne', ar: 'المتجر الإلكتروني', en: 'Online shop', es: 'Tienda en línea', pt: 'Loja online', tr: 'Çevrimiçi mağaza' })}
                icon={<Store className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
            >
                <p className="text-[11px] text-slate-500 dark:text-dk-muted leading-snug">
                    {tx(lang, {
                        fr: "Aucune boutique en ligne n'est branchée. Rendez-vous dans Réglages › Boutique en ligne pour en relier une.",
                        ar: 'ما كاين حتّى متجر إلكتروني مربوط. سير للإعدادات › المتجر الإلكتروني باش تربط واحد.',
                        en: 'No online shop is connected. Go to Settings › Online shop to connect one.',
                        es: 'No hay ninguna tienda en línea conectada. Vaya a Ajustes › Tienda en línea para conectar una.',
                        pt: 'Nenhuma loja online está ligada. Vá a Definições › Loja online para ligar uma.',
                        tr: 'Bağlı çevrimiçi mağaza yok. Ayarlar › Çevrimiçi mağaza bölümünden bir tane bağlayın.',
                    })}
                </p>
            </Carte>
        );
    }

    return (
        <Carte
            title={tx(lang, { fr: 'Boutique en ligne', ar: 'المتجر الإلكتروني', en: 'Online shop', es: 'Tienda en línea', pt: 'Loja online', tr: 'Çevrimiçi mağaza' })}
            icon={<Store className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
            right={configs.length > 1 ? (
                <select
                    value={storeId || ''}
                    onChange={e => { setStoreId(e.target.value); setLignes([]); }}
                    className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1 text-[10px] font-bold text-slate-600 dark:text-dk-text-soft outline-none"
                >
                    {configs.map(c => <option key={c.id} value={c.id}>{c.nom || nomPlateforme(c.plateforme, lang)}</option>)}
                </select>
            ) : undefined}
        >
            <div className="space-y-3">
                {/* Publication volontaire, jamais automatique : un atelier a des
                    modèles réservés au gros, des essais, des choses qu'il ne
                    veut montrer à personne. */}
                <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/40">
                    <button
                        type="button"
                        role="switch"
                        aria-checked={published}
                        disabled={!onTogglePublished || action === 'toggle' || (!published && !pretAPublier)}
                        onClick={basculerPublication}
                        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 disabled:opacity-40 ${published ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-dk-border'}`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-dk-surface rounded-full shadow transition-transform ${published ? 'translate-x-5' : ''}`} />
                    </button>
                    <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-bold text-slate-800 dark:text-dk-text">
                            {tx(lang, { fr: 'Publié dans la boutique en ligne', ar: 'منشور فالمتجر الإلكتروني', en: 'Published in the online shop', es: 'Publicado en la tienda en línea', pt: 'Publicado na loja online', tr: 'Çevrimiçi mağazada yayında' })}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-dk-muted leading-snug mt-0.5">
                            {published
                                ? tx(lang, { fr: 'Ce modèle est visible du public et ses quantités sont poussées en ligne.', ar: 'هاد الموديل باين للناس وكمياتو كتمشي أونلاين.', en: 'This model is visible to the public and its quantities are pushed online.', es: 'Este modelo es visible al público y sus cantidades se envían en línea.', pt: 'Este modelo está visível ao público e as suas quantidades são enviadas online.', tr: 'Bu model herkese açıktır ve miktarları çevrimiçi gönderilir.' })
                                : tx(lang, { fr: 'Ce modèle reste privé : rien n’est envoyé à la boutique tant que vous n’allumez pas cet interrupteur.', ar: 'هاد الموديل باقي خاص: ما كيتصيفط والو للمتجر حتّى تشعّل هاد الزرّ.', en: 'This model stays private: nothing is sent to the shop until you turn this on.', es: 'Este modelo permanece privado: no se envía nada a la tienda hasta que active esto.', pt: 'Este modelo fica privado: nada é enviado à loja até ligar isto.', tr: 'Bu model özel kalır: bunu açana kadar mağazaya hiçbir şey gönderilmez.' })}
                        </p>
                        {!published && manques.length > 0 && (
                            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 mt-1">
                                {tx(lang, { fr: 'Il manque encore', ar: 'باقي خاص', en: 'Still missing', es: 'Todavía falta', pt: 'Ainda falta', tr: 'Hâlâ eksik' })} : {manques.join(' · ')}
                            </p>
                        )}
                        {prixEnLigne != null && (
                            <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-1">
                                {tx(lang, { fr: 'Prix en ligne retenu', ar: 'الثمن المعتمد أونلاين', en: 'Online price used', es: 'Precio en línea aplicado', pt: 'Preço online aplicado', tr: 'Kullanılan çevrimiçi fiyat' })} : <span className="font-bold text-indigo-600 dark:text-dk-accent">{fmt(prixEnLigne)} {currency}</span>
                            </p>
                        )}
                    </div>
                </div>

                {/* Trois gestes, dans l'ordre du parcours réel. */}
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={!storeId || action != null || !hasGrille}
                        onClick={() => appeler('generate', '/api/store/mapping/generate', { modelId, storeId }, tx(lang, { fr: 'Codes article générés.', ar: 'تولّدو كودات المنتوج.', en: 'Item codes generated.', es: 'Códigos de artículo generados.', pt: 'Códigos de artigo gerados.', tr: 'Ürün kodları oluşturuldu.' }))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-dk-accent/50 text-indigo-600 dark:text-dk-accent font-bold text-[11px] hover:bg-indigo-50 dark:hover:bg-dk-elevated transition-colors disabled:opacity-40"
                    >
                        {action === 'generate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        {tx(lang, { fr: 'Générer les codes', ar: 'ولّد الكودات', en: 'Generate the codes', es: 'Generar los códigos', pt: 'Gerar os códigos', tr: 'Kodları oluştur' })}
                    </button>

                    {hasGrille && (
                        <button
                            type="button"
                            disabled={!storeId || action != null || !published || !pretAPublier}
                            title={!published
                                ? tx(lang, { fr: 'Allumez d’abord « Publié dans la boutique en ligne ».', ar: 'شعّل لّولاً «منشور فالمتجر الإلكتروني».', en: 'First turn on “Published in the online shop”.', es: 'Active primero «Publicado en la tienda en línea».', pt: 'Ligue primeiro «Publicado na loja online».', tr: 'Önce “Çevrimiçi mağazada yayında” seçeneğini açın.' })
                                : undefined}
                            onClick={() => appeler('publish', '/api/store/publish', { modelId, storeId }, tx(lang, { fr: 'Modèle envoyé à la boutique.', ar: 'الموديل تصيفط للمتجر.', en: 'Model sent to the shop.', es: 'Modelo enviado a la tienda.', pt: 'Modelo enviado à loja.', tr: 'Model mağazaya gönderildi.' }))}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 text-white font-bold text-[11px] hover:bg-sky-700 transition-colors disabled:opacity-40"
                        >
                            {action === 'publish' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                            {tx(lang, { fr: 'Publier dans la boutique', ar: 'انشر فالمتجر', en: 'Publish to the shop', es: 'Publicar en la tienda', pt: 'Publicar na loja', tr: 'Mağazada yayımla' })}
                        </button>
                    )}

                    <button
                        type="button"
                        disabled={!storeId || action != null}
                        onClick={() => appeler('sync', `/api/store/sync/${encodeURIComponent(storeId || '')}`, { modelId }, tx(lang, { fr: 'Synchronisation lancée.', ar: 'المزامنة تبداات.', en: 'Synchronisation started.', es: 'Sincronización iniciada.', pt: 'Sincronização iniciada.', tr: 'Eşitleme başlatıldı.' }))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors disabled:opacity-40"
                    >
                        {action === 'sync' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        {tx(lang, { fr: 'Synchroniser maintenant', ar: 'زامن دابا', en: 'Synchronise now', es: 'Sincronizar ahora', pt: 'Sincronizar agora', tr: 'Şimdi eşitle' })}
                    </button>
                </div>

                {message && <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{message}</p>}
                {erreur && <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400">{erreur}</p>}

                {!hasGrille && (
                    <p className="text-[10px] text-slate-500 dark:text-dk-muted leading-snug">
                        {tx(lang, {
                            fr: "Ce modèle n'a ni couleurs ni tailles : la boutique ne saurait pas quoi proposer. Renseignez-les dans la fiche du modèle.",
                            ar: 'هاد الموديل ما عندو لا ألوان لا مقاسات: المتجر ما غاديش يعرف شنو يعرض. عمّرهم فبطاقة الموديل.',
                            en: 'This model has neither colors nor sizes: the shop would not know what to offer. Fill them in on the model sheet.',
                            es: 'Este modelo no tiene colores ni tallas: la tienda no sabría qué ofrecer. Indíquelos en la ficha del modelo.',
                            pt: 'Este modelo não tem cores nem tamanhos: a loja não saberia o que oferecer. Preencha-os na ficha do modelo.',
                            tr: 'Bu modelin rengi ve bedeni yok: mağaza ne sunacağını bilemez. Model kartında doldurun.',
                        })}
                    </p>
                )}

                {chargement ? (
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-dk-muted py-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {tx(lang, { fr: 'Chargement…', ar: 'كيتحمّل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yükleniyor…' })}
                    </div>
                ) : lignes.length === 0 ? (
                    <p className="text-[11px] text-slate-400 dark:text-dk-muted italic">
                        {tx(lang, {
                            fr: 'Aucun code article. Cliquez sur « Générer les codes » : le programme les fabrique, vous n’avez rien à taper.',
                            ar: 'ما كاين حتّى كود منتوج. كليكي على «ولّد الكودات»: البرنامج كيصنعهم، ما عندك ما تكتب.',
                            en: 'No item code yet. Click “Generate the codes”: the program builds them, you type nothing.',
                            es: 'Ningún código de artículo. Pulse «Generar los códigos»: el programa los crea, usted no escribe nada.',
                            pt: 'Nenhum código de artigo. Clique em «Gerar os códigos»: o programa cria-os, não escreve nada.',
                            tr: 'Henüz ürün kodu yok. “Kodları oluştur”a tıklayın: program oluşturur, siz bir şey yazmazsınız.',
                        })}
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr>
                                    <th className={th}>{tx(lang, { fr: 'Couleur / Taille', ar: 'اللون / المقاس', en: 'Color / Size', es: 'Color / Talla', pt: 'Cor / Tamanho', tr: 'Renk / Beden' })}</th>
                                    <th className={th}>{tx(lang, { fr: 'Code article', ar: 'كود المنتوج', en: 'Item code', es: 'Código de artículo', pt: 'Código de artigo', tr: 'Ürün kodu' })}</th>
                                    <th className={`${th} text-right`}>{tx(lang, { fr: 'Chez vous', ar: 'عندك', en: 'With you', es: 'En su taller', pt: 'Consigo', tr: 'Sizde' })}</th>
                                    <th className={`${th} text-right`}>{tx(lang, { fr: 'En boutique', ar: 'فالمتجر', en: 'In the shop', es: 'En la tienda', pt: 'Na loja', tr: 'Mağazada' })}</th>
                                    <th className={th}>{tx(lang, { fr: 'État', ar: 'الحالة', en: 'State', es: 'Estado', pt: 'Estado', tr: 'Durum' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                {lignesTriees.map(l => {
                                    const locale = toNum(l.qte_locale);
                                    const poussee = toNum(l.derniere_qte_poussee);
                                    const ecart = locale !== poussee;
                                    return (
                                        <React.Fragment key={l.id}>
                                            <tr className={l.statut === 'ERROR' ? 'bg-rose-50 dark:bg-rose-950/20' : ecart ? 'bg-amber-50 dark:bg-amber-950/20' : ''}>
                                                <td className={`${td} font-semibold text-slate-800 dark:text-dk-text`}>
                                                    {[l.couleur, l.taille].filter(Boolean).join(' / ') || '—'}
                                                </td>
                                                <td className={`${td} font-mono text-[10px]`}>{l.sku || '—'}</td>
                                                <td className={`${td} text-right font-bold`}>{locale.toLocaleString(dateLocale)}</td>
                                                <td className={`${td} text-right font-bold ${ecart ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-dk-text-soft'}`}>
                                                    {poussee.toLocaleString(dateLocale)}
                                                    {ecart && <span className="ml-1 text-[9px] font-bold">({poussee - locale > 0 ? '+' : ''}{(poussee - locale).toLocaleString(dateLocale)})</span>}
                                                </td>
                                                <td className={td}>
                                                    {l.statut === 'ERROR' ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setLigneOuverte(ligneOuverte === l.id ? null : l.id)}
                                                            className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-200 dark:hover:bg-rose-900/60 transition-colors"
                                                        >
                                                            <AlertTriangle className="w-2.5 h-2.5" />
                                                            {tx(lang, { fr: 'erreur', ar: 'خطأ', en: 'error', es: 'error', pt: 'erro', tr: 'hata' })}
                                                        </button>
                                                    ) : l.statut === 'PENDING' ? (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                                                            <Clock className="w-2.5 h-2.5" />
                                                            {tx(lang, { fr: 'en attente', ar: 'فالانتظار', en: 'pending', es: 'en espera', pt: 'em espera', tr: 'beklemede' })}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                                                            <CheckCircle2 className="w-2.5 h-2.5" />
                                                            {tx(lang, { fr: 'synchronisé', ar: 'مزامن', en: 'synced', es: 'sincronizado', pt: 'sincronizado', tr: 'eşitlendi' })}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                            {ligneOuverte === l.id && (
                                                <tr>
                                                    <td colSpan={5} className="px-3 py-2 bg-rose-50 dark:bg-rose-950/20">
                                                        <p className="text-[10px] font-semibold text-rose-700 dark:text-rose-400 whitespace-normal">
                                                            {l.derniere_erreur || tx(lang, { fr: 'La boutique a refusé cette ligne sans donner de raison.', ar: 'المتجر رفض هاد السطر بلا ما يعطي سبب.', en: 'The shop refused this line without giving a reason.', es: 'La tienda rechazó esta línea sin dar motivo.', pt: 'A loja recusou esta linha sem dar motivo.', tr: 'Mağaza bu satırı gerekçe belirtmeden reddetti.' })}
                                                        </p>
                                                        {(l.external_variant_id || l.external_inventory_item_id) && (
                                                            <details className="mt-1">
                                                                <summary className="cursor-pointer text-[9px] uppercase font-bold text-slate-400 dark:text-dk-muted select-none">
                                                                    {tx(lang, { fr: 'Détails pour le dépannage', ar: 'تفاصيل للإصلاح', en: 'Troubleshooting details', es: 'Detalles para soporte', pt: 'Detalhes para resolução', tr: 'Sorun giderme ayrıntıları' })}
                                                                </summary>
                                                                <p className="mt-1 font-mono text-[9px] text-slate-500 dark:text-dk-muted break-all">
                                                                    {l.external_variant_id || '—'} · {l.external_inventory_item_id || '—'}
                                                                </p>
                                                            </details>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {lignes.some(l => toNum(l.qte_locale) !== toNum(l.derniere_qte_poussee)) && (
                    <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 leading-snug">
                        {tx(lang, {
                            fr: "Des quantités ne correspondent plus entre votre stock et la boutique. Tant que l'écart dure, un client peut acheter en ligne une pièce que vous n'avez plus.",
                            ar: 'كاينين كميات ما بقاتش متوافقة بين مخزونك والمتجر. ما دام الفرق باقي، شي زبون يقدر يشري أونلاين قطعة ما بقاتش عندك.',
                            en: 'Some quantities no longer match between your stock and the shop. While the gap lasts, a customer can buy online a piece you no longer have.',
                            es: 'Algunas cantidades ya no coinciden entre su stock y la tienda. Mientras dure la diferencia, un cliente puede comprar en línea una pieza que ya no tiene.',
                            pt: 'Algumas quantidades já não coincidem entre o seu stock e a loja. Enquanto durar a diferença, um cliente pode comprar online uma peça que já não tem.',
                            tr: 'Bazı miktarlar stokunuz ile mağaza arasında artık uyuşmuyor. Fark sürdükçe bir müşteri artık elinizde olmayan bir parçayı çevrimiçi satın alabilir.',
                        })}
                    </p>
                )}
            </div>
        </Carte>
    );
};

/* ================================================================== */
/* ÉCRAN 3 — PASTILLE D'ÉTAT dans la liste Stock & Ventes             */
/* ================================================================== */

export type EtatSyncModele = 'OK' | 'PENDING' | 'ERROR' | 'NONE';

/**
 * États de synchronisation par modèle, agrégés depuis le mapping complet de la
 * boutique active. Une seule requête pour toute la liste : une par ligne
 * transformerait l'onglet en pluie d'appels.
 */
export function useStoreSyncStates() {
    const { configs, indisponible } = useStoreConfigs();
    const [etats, setEtats] = useState<Map<string, EtatSyncModele>>(new Map());
    const [boutiqueOk, setBoutiqueOk] = useState(false);

    const store = useMemo(() => boutiqueCourante(configs), [configs]);

    useEffect(() => {
        if (STORE_IS_STATIC || indisponible || !store) {
            setEtats(new Map());
            setBoutiqueOk(false);
            return;
        }
        let annule = false;
        fetch(`/api/store/mapping?storeId=${encodeURIComponent(store.id)}`, { credentials: 'include' })
            .then(jsonOrThrow)
            .then((d: any) => {
                if (annule) return;
                const rows: StoreMapping[] = Array.isArray(d) ? d : [];
                const map = new Map<string, EtatSyncModele>();
                rows.forEach(l => {
                    const actuel = map.get(l.modelId);
                    // Une erreur prime sur tout : c'est elle qui coûte un client.
                    let etat: EtatSyncModele = 'OK';
                    if (l.statut === 'ERROR') etat = 'ERROR';
                    else if (l.statut === 'PENDING' || toNum(l.qte_locale) !== toNum(l.derniere_qte_poussee)) etat = 'PENDING';
                    if (actuel === 'ERROR') return;
                    if (actuel === 'PENDING' && etat === 'OK') return;
                    map.set(l.modelId, etat);
                });
                setEtats(map);
                setBoutiqueOk(true);
            })
            .catch(() => { if (!annule) { setEtats(new Map()); setBoutiqueOk(false); } });
        return () => { annule = true; };
    }, [store, indisponible]);

    return { etats, boutiqueOk };
}

/** Pastille discrète à côté du nom du modèle. Pas de colonne : une colonne
 *  vide pose plus de questions qu'elle n'en résout. */
export const StoreSyncDot: React.FC<{
    etat: EtatSyncModele;
    onClick?: () => void;
    lang?: Lang | string;
}> = ({ etat, onClick, lang: langProp }) => {
    const { lang: ctxLang } = useLang();
    const lang = langProp ?? ctxLang;

    const libelle = etat === 'ERROR'
        ? tx(lang, { fr: 'Boutique en ligne : erreur', ar: 'المتجر الإلكتروني: خطأ', en: 'Online shop: error', es: 'Tienda en línea: error', pt: 'Loja online: erro', tr: 'Çevrimiçi mağaza: hata' })
        : etat === 'PENDING'
            ? tx(lang, { fr: 'Boutique en ligne : en attente d’envoi', ar: 'المتجر الإلكتروني: فانتظار الإرسال', en: 'Online shop: waiting to be sent', es: 'Tienda en línea: pendiente de envío', pt: 'Loja online: a aguardar envio', tr: 'Çevrimiçi mağaza: gönderim bekliyor' })
            : etat === 'OK'
                ? tx(lang, { fr: 'Boutique en ligne : synchronisé', ar: 'المتجر الإلكتروني: مزامن', en: 'Online shop: synced', es: 'Tienda en línea: sincronizado', pt: 'Loja online: sincronizado', tr: 'Çevrimiçi mağaza: eşitlendi' })
                : tx(lang, { fr: 'Boutique en ligne : non publié', ar: 'المتجر الإلكتروني: غير منشور', en: 'Online shop: not published', es: 'Tienda en línea: no publicado', pt: 'Loja online: não publicado', tr: 'Çevrimiçi mağaza: yayında değil' });

    const couleur = etat === 'ERROR'
        ? 'bg-rose-500'
        : etat === 'PENDING'
            ? 'bg-amber-500'
            : etat === 'OK'
                ? 'bg-emerald-500'
                : 'bg-slate-300 dark:bg-dk-border';

    return (
        <button
            type="button"
            onClick={onClick}
            title={libelle}
            aria-label={libelle}
            className="inline-flex items-center justify-center w-4 h-4 rounded-full hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors shrink-0"
        >
            <span className={`w-2 h-2 rounded-full ${couleur}`} />
        </button>
    );
};
