import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { ModelData, SubcontractOrder } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { fmt } from '../../app/constants';
import {
    ArrowLeft, Package, Users, Layers, Edit2, ShoppingBag,
    Truck, Coins, AlertTriangle, Tag, TrendingUp, Plus, Trash2, Loader2, Save, Receipt,
} from 'lucide-react';
import type { AtelierClient } from './ClientsPanel';
import { ModelStoreSection } from './StoreSync';
import SheetModal, { useSheetFullscreen } from '../shared/SheetModal';

/**
 * Fiches d'entité de la sous-traitance (modèle et client).
 *
 * Le module affichait jusqu'ici des noms morts : on lisait « POLO » ou
 * « BAZAR SALAM » sans jamais pouvoir demander « et alors, il s'est vendu
 * combien, à qui, à quel prix ? ». Chaque entité a désormais une fiche, et
 * chaque mention d'une entité est un lien vers cette fiche.
 *
 * Rien n'est chargé ici : tout est agrégé à partir des mouvements de stock et
 * des commandes déjà présents dans le composant parent. Une fiche ne doit
 * jamais dépendre du réseau — sinon elle devient un écran d'attente.
 */

/** Cible de navigation. Un client peut n'exister que sous forme de nom libre
 *  dans une ancienne sortie : la fiche doit rester ouvrable dans ce cas. */
export type SheetTarget =
    | { kind: 'model'; modelId: string }
    | { kind: 'client'; clientId?: string | null; clientNom?: string | null; autoInvoice?: boolean };

/** Ligne de `modelStockStats` du parent — reprise telle quelle, jamais recalculée
 *  (les formules de coût sont la propriété du parent et n'ont pas à bouger). */
export interface ModelStockStat {
    model: ModelData;
    producedQty: number;
    soldQty: number;
    exitedQty: number;
    invoicedQty: number;
    remainingStock: number;
    isVentile: boolean;
    stockSource: 'DETAIL' | 'FALLBACK';
    price: number | null;
    salePrice: number | null;
    startDate: string;
    status: string;
}

interface EntitySheetProps {
    /** Pile de navigation : le dernier élément est la fiche affichée. La pile
     *  est ce qui supprime le cul-de-sac — on peut toujours revenir d'où on vient. */
    stack: SheetTarget[];
    onPush: (target: SheetTarget) => void;
    onBack: () => void;
    onClose: () => void;
    models: ModelData[];
    orders: SubcontractOrder[];
    clients: AtelierClient[];
    /** Sorties brutes de `st_stock_sorties` (client_id, client_nom, quantite…). */
    sorties: any[];
    stats: ModelStockStat[];
    /** Stock disponible par modèle, clé « couleur|taille ». */
    stockMatrix: Map<string, Map<string, number>>;
    currency: string;
    dateLocale: string;
    /** Renvoie vers le formulaire client existant (ClientsPanel) : on ne
     *  duplique pas la saisie, on la réutilise. */
    onEditClient?: (client: AtelierClient) => void;
    /** Rechargement des sorties après émission d'une facture de vente : sans
     *  lui, le badge « Payé / Impayé » resterait figé sur l'ancien état. */
    onInvoiced?: () => void;
    /** Impression de la facture de vente juste émise — le parent seul connaît
     *  l'identité de l'entreprise et la charte graphique des documents imprimés. */
    onPrintInvoice?: (facture: any, client: AtelierClient | null, grid: { couleurs: string[]; tailles: string[]; byCell: Map<string, number> }) => void;
    /** `AppSettings.prixParClientEnabled` : sans lui, la grille tarifaire ne
     *  s'affiche pas — un petit atelier vend au même prix à tout le monde et
     *  n'a pas à subir un écran de plus. */
    prixParClientEnabled?: boolean;
    /** `canSeeCost` / `canSetPrice` de `app/accessControl.ts`, résolus par le
     *  parent (qui seul connaît l'utilisateur courant). Défaut `true` :
     *  comportement historique inchangé pour les installations existantes. */
    canSeeCost?: boolean;
    canSetPrice?: boolean;
    /** Vocabulaire local des types de clients (`AppSettings.clientTypeLabels`). */
    clientTypeLabels?: Record<string, string>;
    /** Écriture du drapeau « publié dans la boutique en ligne » dans le modèle.
     *  Le parent seul sait écrire un modèle sans écraser le travail de
     *  l'ingénierie (même mécanisme que le prix de vente). */
    onSetModelStorePublished?: (modelId: string, published: boolean) => Promise<boolean>;
}

/** Mode statique (Vercel, sans Express) : aucune route `/api/prix` n'existe.
 *  Les sections tarifaires s'effacent alors au lieu d'afficher une erreur. */
const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

/* ------------------------------------------------------------------ */
/* Helpers purs — aucun hook ici, ils sont appelés hors corps React.    */
/* ------------------------------------------------------------------ */

const norm = (s: any) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');

/** Identité d'un acheteur. L'`id` fait foi quand il existe ; sinon on retombe
 *  sur le nom normalisé, faute de quoi les ventes saisies au clavier avant le
 *  registre des clients seraient perdues pour l'agrégation. */
const clientKeyOf = (clientId?: any, clientNom?: any): string =>
    clientId ? `id:${String(clientId)}` : `nom:${norm(clientNom)}`;

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL'];
const sizeRank = (t: string) => {
    const i = SIZE_ORDER.indexOf(t.toUpperCase());
    return i === -1 ? 999 : i;
};

const toNum = (v: any) => Number(v) || 0;

const fmtDay = (raw: any, locale: string) => {
    if (!raw) return '—';
    const d = new Date(raw);
    return isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString(locale);
};

/* ------------------------------------------------------------------ */
/* Briques visuelles partagées                                         */
/* ------------------------------------------------------------------ */

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/40 flex items-center gap-2">
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-dk-muted">{title}</span>
        </div>
        <div className="p-4">{children}</div>
    </div>
);

const Kpi: React.FC<{ label: string; value: string; tone?: 'neutral' | 'good' | 'bad' | 'accent' }> = ({ label, value, tone = 'neutral' }) => (
    <div className="bg-slate-50 dark:bg-dk-bg/60 border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2.5">
        <span className="block text-[9px] uppercase tracking-wide text-slate-400 dark:text-dk-muted font-semibold">{label}</span>
        <span className={
            tone === 'good' ? 'block mt-1 font-bold text-sm text-emerald-600 dark:text-emerald-400'
                : tone === 'bad' ? 'block mt-1 font-bold text-sm text-rose-600 dark:text-rose-400'
                    : tone === 'accent' ? 'block mt-1 font-bold text-sm text-indigo-600 dark:text-dk-accent'
                        : 'block mt-1 font-bold text-sm text-slate-800 dark:text-dk-text'
        }>{value}</span>
    </div>
);

/** Lien vers une autre fiche. Visuellement identique partout : l'utilisateur
 *  doit apprendre UNE fois que « souligné à l'indigo = ça s'ouvre ». */
const EntityLink: React.FC<{ label: string; onClick: () => void; title?: string }> = ({ label, onClick, title }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        className="text-left font-semibold text-indigo-600 dark:text-dk-accent hover:underline underline-offset-2 transition-colors"
    >
        {label}
    </button>
);

const EmptyLine: React.FC<{ text: string }> = ({ text }) => (
    <p className="text-[11px] text-slate-400 dark:text-dk-muted font-semibold py-2">{text}</p>
);

/** État de paiement d'une sortie, déduit du statut de SA facture (jointe côté
 *  serveur). Une sortie sans facture_id n'est pas « impayée » : elle n'a
 *  simplement jamais été facturée — les deux ne doivent pas se confondre. */
const PaymentBadge: React.FC<{ s: any; dateLocale: string; lang: string }> = ({ s, dateLocale, lang }) => {
    if (!s.facture_id) {
        return <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang as any, { fr: 'Non facturé', ar: 'غير مفوتر', en: 'Not invoiced', es: 'Sin facturar', pt: 'Não faturado', tr: 'Faturasız' })}</span>;
    }
    const statut = String(s.facture_statut || '');
    if (statut === 'PAYEE') {
        return <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">{tx(lang as any, { fr: 'Payé', ar: 'مؤدّى', en: 'Paid', es: 'Pagado', pt: 'Pago', tr: 'Ödendi' })}</span>;
    }
    if (statut === 'PARTIELLEMENT') {
        return <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">{tx(lang as any, { fr: 'Partiel', ar: 'جزئي', en: 'Partial', es: 'Parcial', pt: 'Parcial', tr: 'Kısmi' })}</span>;
    }
    if (statut === 'ANNULEE') {
        return <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang as any, { fr: 'Annulée', ar: 'ملغاة', en: 'Cancelled', es: 'Anulada', pt: 'Anulada', tr: 'İptal' })}</span>;
    }
    // BROUILLON / ENVOYEE : impayée. L'échéance, si connue, dit si elle est en
    // retard — un « impayé » sans date ne dit rien de l'urgence.
    const echeance = s.facture_echeance ? new Date(s.facture_echeance) : null;
    const enRetard = echeance && !isNaN(echeance.getTime()) && echeance.getTime() < Date.now();
    return (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
            enRetard
                ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/50'
                : 'bg-slate-50 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border'
        }`}>
            {tx(lang as any, { fr: 'Impayé', ar: 'غير مؤدّى', en: 'Unpaid', es: 'Impagado', pt: 'Não pago', tr: 'Ödenmedi' })}
            {echeance && !isNaN(echeance.getTime()) && ` · ${fmtDay(s.facture_echeance, dateLocale)}`}
        </span>
    );
};

/* ------------------------------------------------------------------ */
/* TARIFS du modèle (grille tarifaire)                                 */
/* ------------------------------------------------------------------ */

interface Tarif {
    id: string;
    modelId: string;
    client_id: string | null;
    type_client: string | null;
    qty_min: number;
    prix: number;
    devise: string | null;
    valid_from: string | null;
    note: string | null;
    /** Canal de vente. `null` = valable partout — c'est le comportement
     *  historique de tous les tarifs déjà saisis, il ne change pas.
     *  Le prix diffère selon l'endroit où la pièce part : le gros à l'atelier,
     *  le détail au magasin, et en ligne où s'ajoutent la livraison, les
     *  retours et la concurrence. */
    canal?: CanalVente | null;
}

/** `null` = tous canaux. Les trois valeurs correspondent à la colonne `canal`
 *  de la table des tarifs. */
type CanalVente = 'ATELIER' | 'MAGASIN' | 'ONLINE';

const CANAL_KEYS: CanalVente[] = ['ATELIER', 'MAGASIN', 'ONLINE'];

/** Ordre d'affichage : les tarifs « tous canaux » en premier (ce sont les
 *  règles générales), puis chaque canal, du plus proche au plus lointain. */
const canalRank = (c: CanalVente | null | undefined): number =>
    c == null ? 0 : CANAL_KEYS.indexOf(c) + 1;

const TYPE_KEYS = ['GROS', 'DETAIL', 'BOUTIQUE'];

/** Clé de PORTÉE d'un tarif : client précis, segment, ou catalogue. Deux tarifs
 *  de même portée et de même palier se disputent la même vente — le serveur les
 *  départage silencieusement (le plus récent gagne), donc l'écran doit les
 *  montrer, faute de quoi l'utilisateur ne comprendra jamais pourquoi « son »
 *  prix n'est pas celui qui sort. */
const scopeKey = (t: Tarif) => {
    const portee = t.client_id ? `c:${t.client_id}` : t.type_client ? `t:${t.type_client}` : 'catalogue';
    // Le canal fait partie de la portée : le même client peut légitimement avoir
    // un prix atelier ET un prix en ligne pour le même palier, ce n'est pas un
    // doublon. Deux prix pour le MÊME canal, en revanche, en est un.
    return `${portee}|${t.canal || 'ALL'}`;
};

const TarifsSection: React.FC<{
    modelId: string;
    clients: AtelierClient[];
    currency: string;
    canSetPrice: boolean;
    clientTypeLabels: Record<string, string>;
}> = ({ modelId, clients, currency, canSetPrice, clientTypeLabels }) => {
    const { lang } = useLang();
    const [tarifs, setTarifs] = useState<Tarif[]>([]);
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    /** Brouillon de création/modification. `null` = aucun formulaire ouvert. */
    const [draft, setDraft] = useState<
        {
            id?: string;
            portee: 'CATALOGUE' | 'TYPE' | 'CLIENT';
            client_id: string;
            type_client: string;
            qty_min: string;
            prix: string;
            /** `''` = tous canaux (valeur `NULL` en base). */
            canal: '' | CanalVente;
        }
        | null
    >(null);

    const charger = useCallback(() => {
        if (IS_STATIC) { setLoading(false); return; }
        setLoading(true);
        fetch(`/api/prix?modelId=${encodeURIComponent(modelId)}`, { credentials: 'include' })
            .then(r => (r.ok ? r.json() : Promise.reject(new Error('load'))))
            .then((d: any) => setTarifs(Array.isArray(d) ? d : []))
            .catch(() => setErreur(tx(lang, { fr: 'Tarifs indisponibles.', ar: 'التعريفات غير متوفّرة.', en: 'Tariffs unavailable.', es: 'Tarifas no disponibles.', pt: 'Tarifarios indisponiveis.', tr: 'Tarifeler kullanilamiyor.' })))
            .finally(() => setLoading(false));
    }, [modelId, lang]);

    useEffect(() => { charger(); }, [charger]);

    /** Portées + paliers en double. Signalés, jamais corrigés d'office : c'est
     *  l'utilisateur qui sait lequel des deux tarifs il voulait garder. */
    const doublons = useMemo(() => {
        const compte = new Map<string, number>();
        tarifs.forEach(t => {
            const k = `${scopeKey(t)}|${Number(t.qty_min) || 0}`;
            compte.set(k, (compte.get(k) || 0) + 1);
        });
        return new Set(Array.from(compte.entries()).filter(([, n]) => n > 1).map(([k]) => k));
    }, [tarifs]);

    /** Tarifs regroupés par canal : « tous canaux » d'abord, puis atelier,
     *  magasin, en ligne. Sans ce regroupement, trois prix pour un même modèle
     *  se lisent comme trois doublons alors qu'ils répondent à trois endroits
     *  de vente différents. */
    const tarifsTries = useMemo(
        () => tarifs.slice().sort((a, b) =>
            canalRank(a.canal) - canalRank(b.canal)
            || (Number(a.qty_min) || 0) - (Number(b.qty_min) || 0)
            || Number(a.prix) - Number(b.prix)),
        [tarifs]
    );

    const libelleCanal = (c: CanalVente | null | undefined): string => {
        if (c === 'ATELIER') return tx(lang, { fr: 'Atelier (gros)', ar: 'الورشة (الݣروس)', en: 'Workshop (wholesale)', es: 'Taller (mayoreo)', pt: 'Oficina (grosso)', tr: 'Atölye (toptan)' });
        if (c === 'MAGASIN') return tx(lang, { fr: 'Magasin (détail)', ar: 'المحلّ (التقسيط)', en: 'Store (retail)', es: 'Tienda (detalle)', pt: 'Loja (retalho)', tr: 'Mağaza (perakende)' });
        if (c === 'ONLINE') return tx(lang, { fr: 'En ligne', ar: 'أونلاين', en: 'Online', es: 'En línea', pt: 'Online', tr: 'Çevrimiçi' });
        return tx(lang, { fr: 'Tous canaux', ar: 'جميع القنوات', en: 'All channels', es: 'Todos los canales', pt: 'Todos os canais', tr: 'Tüm kanallar' });
    };

    const libellePortee = (t: Tarif): string => {
        if (t.client_id) {
            const c = clients.find(x => String(x.id) === String(t.client_id));
            return c ? c.nom : tx(lang, { fr: 'Client supprimé', ar: 'زبون محذوف', en: 'Deleted client', es: 'Cliente eliminado', pt: 'Cliente eliminado', tr: 'Silinmis musteri' });
        }
        if (t.type_client) return clientTypeLabels[t.type_client] || t.type_client;
        return tx(lang, { fr: 'Catalogue', ar: 'الكاطالوݣ', en: 'Catalogue', es: 'Catálogo', pt: 'Catalogo', tr: 'Katalog' });
    };

    const enregistrer = () => {
        if (!draft) return;
        const prix = Number(draft.prix);
        if (!Number.isFinite(prix) || prix < 0) {
            setErreur(tx(lang, { fr: 'Prix invalide.', ar: 'الثمن غير صالح.', en: 'Invalid price.', es: 'Precio no válido.', pt: 'Preco invalido.', tr: 'Gecersiz fiyat.' }));
            return;
        }
        setBusyId(draft.id || 'new');
        setErreur(null);
        fetch('/api/prix', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: draft.id,
                modelId,
                client_id: draft.portee === 'CLIENT' ? draft.client_id || null : null,
                type_client: draft.portee === 'TYPE' ? draft.type_client || null : null,
                qty_min: Math.max(0, Math.floor(Number(draft.qty_min) || 0)),
                prix,
                devise: currency,
                // `null` = valable partout : c'est le comportement historique,
                // conservé tel quel pour tous les tarifs déjà en base.
                canal: draft.canal || null,
            }),
        })
            .then(r => (r.ok ? r.json() : r.json().then((b: any) => Promise.reject(new Error(b?.message || 'save')))))
            .then(() => { setDraft(null); charger(); })
            .catch((e: Error) => setErreur(e.message))
            .finally(() => setBusyId(null));
    };

    const supprimer = (id: string) => {
        setBusyId(id);
        fetch(`/api/prix/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
            .then(r => (r.ok ? r.json() : Promise.reject(new Error('delete'))))
            .then(() => charger())
            .catch(() => setErreur(tx(lang, { fr: 'Suppression impossible.', ar: 'الحذف مستحيل.', en: 'Deletion failed.', es: 'Eliminacion imposible.', pt: 'Eliminacao impossivel.', tr: 'Silme basarisiz.' })))
            .finally(() => setBusyId(null));
    };

    const th = 'px-3 py-2 text-left font-semibold uppercase tracking-wide text-[9px] text-slate-500 dark:text-dk-muted whitespace-nowrap';
    const td = 'px-3 py-2 whitespace-nowrap text-slate-700 dark:text-dk-text-soft';
    const champ = 'w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg px-2 py-1.5 text-[11px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent';

    return (
        <Section
            title={tx(lang, { fr: 'Tarifs', ar: 'التعريفات', en: 'Tariffs', es: 'Tarifas', pt: 'Tarifarios', tr: 'Tarifeler' })}
            icon={<Tag className="w-3.5 h-3.5 text-indigo-600 dark:text-dk-accent" />}
        >
            {loading ? (
                <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-dk-muted py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {tx(lang, { fr: 'Chargement…', ar: 'كيتحمّل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yukleniyor…' })}
                </div>
            ) : (
                <div className="space-y-2.5">
                    {erreur && <p className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">{erreur}</p>}

                    {tarifs.length === 0 ? (
                        <EmptyLine text={tx(lang, { fr: 'Aucun tarif : le prix sera saisi à la main à chaque sortie.', ar: 'ما كاينة حتى تعريفة: الثمن غادي يتدخّل باليد ف كل إخراج.', en: 'No tariff: the price will be entered by hand on each exit.', es: 'Ninguna tarifa: el precio se introducira a mano en cada salida.', pt: 'Sem tarifario: o preco sera introduzido a mao em cada saida.', tr: 'Tarife yok: fiyat her cikista elle girilecek.' })} />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr>
                                        <th className={th}>{tx(lang, { fr: 'Portée', ar: 'النطاق', en: 'Scope', es: 'Alcance', pt: 'Ambito', tr: 'Kapsam' })}</th>
                                        <th className={th}>{tx(lang, { fr: 'Canal', ar: 'القناة', en: 'Channel', es: 'Canal', pt: 'Canal', tr: 'Kanal' })}</th>
                                        <th className={`${th} text-right`}>{tx(lang, { fr: 'Palier', ar: 'العتبة', en: 'Tier', es: 'Tramo', pt: 'Escalao', tr: 'Kademe' })}</th>
                                        <th className={`${th} text-right`}>{tx(lang, { fr: 'Prix', ar: 'الثمن', en: 'Price', es: 'Precio', pt: 'Preco', tr: 'Fiyat' })}</th>
                                        {canSetPrice && <th className={`${th} text-right`}>{tx(lang, { fr: 'Actions', ar: 'إجراءات', en: 'Actions', es: 'Acciones', pt: 'Acoes', tr: 'Islemler' })}</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {tarifsTries.map(t => {
                                        const enDouble = doublons.has(`${scopeKey(t)}|${Number(t.qty_min) || 0}`);
                                        return (
                                            <tr key={t.id} className={enDouble ? 'bg-amber-50 dark:bg-amber-950/20' : ''}>
                                                <td className={`${td} font-semibold text-slate-800 dark:text-dk-text`}>
                                                    {libellePortee(t)}
                                                    {enDouble && (
                                                        <span className="ml-2 inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                                                            <AlertTriangle className="w-2.5 h-2.5" />
                                                            {tx(lang, { fr: 'doublon', ar: 'مكرّر', en: 'duplicate', es: 'duplicado', pt: 'duplicado', tr: 'yinelenen' })}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className={td}>
                                                    <span className={
                                                        t.canal === 'ONLINE'
                                                            ? 'inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/50'
                                                            : t.canal === 'MAGASIN'
                                                                ? 'inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800/50'
                                                                : t.canal === 'ATELIER'
                                                                    ? 'inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'
                                                                    : 'inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted border border-slate-200 dark:border-dk-border'
                                                    }>
                                                        {libelleCanal(t.canal)}
                                                    </span>
                                                </td>
                                                <td className={`${td} text-right`}>{Number(t.qty_min) > 0 ? `≥ ${Number(t.qty_min)}` : '—'}</td>
                                                <td className={`${td} text-right font-bold text-indigo-600 dark:text-dk-accent`}>{fmt(Number(t.prix))} {t.devise || currency}</td>
                                                {canSetPrice && (
                                                    <td className={`${td} text-right`}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setDraft({
                                                                id: t.id,
                                                                portee: t.client_id ? 'CLIENT' : t.type_client ? 'TYPE' : 'CATALOGUE',
                                                                client_id: t.client_id ? String(t.client_id) : '',
                                                                type_client: t.type_client || 'GROS',
                                                                qty_min: String(Number(t.qty_min) || 0),
                                                                prix: String(Number(t.prix)),
                                                                canal: t.canal || '',
                                                            })}
                                                            className="p-1 rounded-lg text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors"
                                                            title={tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Modificar', pt: 'Alterar', tr: 'Duzenle' })}
                                                        >
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={busyId === t.id}
                                                            onClick={() => supprimer(t.id)}
                                                            className="p-1 rounded-lg text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-40"
                                                            title={tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Eliminar', tr: 'Sil' })}
                                                        >
                                                            {busyId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {doublons.size > 0 && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">
                            {tx(lang, { fr: 'Des tarifs se recouvrent (même portée, même palier) : le plus récent l\u2019emporte. Supprimez celui que vous ne voulez plus.', ar: 'كاينين تعريفات كيتقاطعو (نفس النطاق ونفس العتبة): الأخير هو اللي كيربح. حيّد اللي ما بقيتيش باغيه.', en: 'Some tariffs overlap (same scope, same tier): the most recent one wins. Delete the one you no longer want.', es: 'Algunas tarifas se solapan (mismo alcance, mismo tramo): gana la mas reciente. Elimine la que ya no quiera.', pt: 'Alguns tarifarios sobrepoem-se (mesmo ambito, mesmo escalao): o mais recente vence. Elimine o que ja nao quer.', tr: 'Bazi tarifeler cakisiyor (ayni kapsam, ayni kademe): en yenisi kazanir. Istemediginizi silin.' })}
                        </p>
                    )}

                    {tarifs.some(t => !!t.canal) && (
                        <p className="text-[10px] text-slate-400 dark:text-dk-muted leading-snug">
                            {tx(lang, {
                                fr: 'Un tarif « tous canaux » s’applique partout. Un tarif rattaché à un canal ne vaut que là : atelier pour le gros, magasin pour le détail, en ligne pour la boutique.',
                                ar: 'التعريفة «جميع القنوات» كتطبّق فكل بلاصة. التعريفة المربوطة بقناة كتصلح غير تما: الورشة للݣروس، المحلّ للتقسيط، أونلاين للمتجر.',
                                en: 'An “all channels” tariff applies everywhere. A tariff tied to a channel applies only there: workshop for wholesale, store for retail, online for the shop.',
                                es: 'Una tarifa «todos los canales» se aplica en todas partes. Una tarifa ligada a un canal solo vale allí: taller para mayoreo, tienda para detalle, en línea para la boutique.',
                                pt: 'Um tarifario «todos os canais» aplica-se em todo o lado. Um tarifario ligado a um canal so vale ai: oficina para grosso, loja para retalho, online para a boutique.',
                                tr: '«Tüm kanallar» tarifesi her yerde gecerlidir. Bir kanala bagli tarife yalnizca orada gecerlidir: toptan icin atolye, perakende icin magaza, butik icin cevrimici.',
                            })}
                        </p>
                    )}

                    {/* Formulaire d'ajout / de modification — réservé à qui peut fixer les prix. */}
                    {canSetPrice && (draft ? (
                        <div className="border border-slate-200 dark:border-dk-border rounded-xl p-3 space-y-2 bg-slate-50 dark:bg-dk-bg/40">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[9px] uppercase font-bold text-slate-400 dark:text-dk-muted mb-1">
                                        {tx(lang, { fr: 'Portée', ar: 'النطاق', en: 'Scope', es: 'Alcance', pt: 'Ambito', tr: 'Kapsam' })}
                                    </label>
                                    <select
                                        value={draft.portee}
                                        onChange={e => setDraft({ ...draft, portee: e.target.value as 'CATALOGUE' | 'TYPE' | 'CLIENT' })}
                                        className={champ}
                                    >
                                        <option value="CATALOGUE">{tx(lang, { fr: 'Catalogue (tout le monde)', ar: 'الكاطالوݣ (الجميع)', en: 'Catalogue (everyone)', es: 'Catálogo (todos)', pt: 'Catalogo (todos)', tr: 'Katalog (herkes)' })}</option>
                                        <option value="TYPE">{tx(lang, { fr: 'Type de client', ar: 'نوع الزبون', en: 'Client type', es: 'Tipo de cliente', pt: 'Tipo de cliente', tr: 'Musteri turu' })}</option>
                                        <option value="CLIENT">{tx(lang, { fr: 'Client précis', ar: 'زبون محدّد', en: 'Specific client', es: 'Cliente concreto', pt: 'Cliente especifico', tr: 'Belirli musteri' })}</option>
                                    </select>
                                </div>
                                {draft.portee === 'TYPE' && (
                                    <div>
                                        <label className="block text-[9px] uppercase font-bold text-slate-400 dark:text-dk-muted mb-1">
                                            {tx(lang, { fr: 'Type', ar: 'النوع', en: 'Type', es: 'Tipo', pt: 'Tipo', tr: 'Tur' })}
                                        </label>
                                        <select value={draft.type_client} onChange={e => setDraft({ ...draft, type_client: e.target.value })} className={champ}>
                                            {TYPE_KEYS.map(k => <option key={k} value={k}>{clientTypeLabels[k] || k}</option>)}
                                        </select>
                                    </div>
                                )}
                                {draft.portee === 'CLIENT' && (
                                    <div>
                                        <label className="block text-[9px] uppercase font-bold text-slate-400 dark:text-dk-muted mb-1">
                                            {tx(lang, { fr: 'Client', ar: 'الزبون', en: 'Client', es: 'Cliente', pt: 'Cliente', tr: 'Musteri' })}
                                        </label>
                                        <select value={draft.client_id} onChange={e => setDraft({ ...draft, client_id: e.target.value })} className={champ}>
                                            <option value="">{tx(lang, { fr: '— Choisir —', ar: '— اختر —', en: '— Choose —', es: '— Elegir —', pt: '— Escolher —', tr: '— Sec —' })}</option>
                                            {clients.map(c => <option key={c.id} value={String(c.id)}>{c.nom}</option>)}
                                        </select>
                                    </div>
                                )}
                                {/* Canal de vente — le prix n'est pas le même selon
                                    l'endroit où la pièce part. Laissé sur « tous
                                    canaux », le tarif garde son comportement actuel. */}
                                <div>
                                    <label className="block text-[9px] uppercase font-bold text-slate-400 dark:text-dk-muted mb-1">
                                        {tx(lang, { fr: 'Canal de vente', ar: 'قناة البيع', en: 'Sales channel', es: 'Canal de venta', pt: 'Canal de venda', tr: 'Satış kanalı' })}
                                    </label>
                                    <select value={draft.canal} onChange={e => setDraft({ ...draft, canal: e.target.value as '' | CanalVente })} className={champ}>
                                        <option value="">{libelleCanal(null)}</option>
                                        {CANAL_KEYS.map(k => <option key={k} value={k}>{libelleCanal(k)}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[9px] uppercase font-bold text-slate-400 dark:text-dk-muted mb-1">
                                        {tx(lang, { fr: 'À partir de (quantité)', ar: 'ابتداءً من (الكمية)', en: 'From (quantity)', es: 'A partir de (cantidad)', pt: 'A partir de (quantidade)', tr: 'Su miktardan (adet)' })}
                                    </label>
                                    <input type="number" min={0} value={draft.qty_min} onChange={e => setDraft({ ...draft, qty_min: e.target.value })} className={champ} />
                                </div>
                                <div>
                                    <label className="block text-[9px] uppercase font-bold text-slate-400 dark:text-dk-muted mb-1">
                                        {tx(lang, { fr: 'Prix', ar: 'الثمن', en: 'Price', es: 'Precio', pt: 'Preco', tr: 'Fiyat' })} ({currency})
                                    </label>
                                    <input type="number" min={0} step="any" value={draft.prix} onChange={e => setDraft({ ...draft, prix: e.target.value })} className={champ} />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setDraft(null); setErreur(null); }}
                                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors"
                                >
                                    {tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'Iptal' })}
                                </button>
                                <button
                                    type="button"
                                    disabled={busyId != null}
                                    onClick={enregistrer}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 dark:bg-dk-accent text-white font-bold text-[11px] hover:bg-indigo-700 transition-colors disabled:opacity-40"
                                >
                                    {busyId != null ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    {tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setDraft({ portee: 'CATALOGUE', client_id: '', type_client: 'GROS', qty_min: '0', prix: '', canal: '' })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-dk-accent/50 text-indigo-600 dark:text-dk-accent font-bold text-[11px] hover:bg-indigo-50 dark:hover:bg-dk-elevated transition-colors"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            {tx(lang, { fr: 'Ajouter un tarif', ar: 'زيد تعريفة', en: 'Add a tariff', es: 'Anadir una tarifa', pt: 'Adicionar um tarifario', tr: 'Tarife ekle' })}
                        </button>
                    ))}

                    {!canSetPrice && (
                        <p className="text-[10px] text-slate-400 dark:text-dk-muted font-semibold">
                            {tx(lang, { fr: 'Lecture seule : vous n\u2019avez pas le droit de fixer les prix.', ar: 'قراءة فقط: ما عندكش الحق تحدّد الأثمنة.', en: 'Read only: you are not allowed to set prices.', es: 'Solo lectura: no tiene derecho a fijar los precios.', pt: 'Apenas leitura: nao tem direito de definir precos.', tr: 'Salt okunur: fiyat belirleme yetkiniz yok.' })}
                        </p>
                    )}
                </div>
            )}
        </Section>
    );
};

/* ------------------------------------------------------------------ */
/* INTELLIGENCE PRIX (historique de vente propre à l'atelier)          */
/* ------------------------------------------------------------------ */

interface PrixStats {
    prixMoyenPondere: number | null;
    prixMin: number | null;
    prixMax: number | null;
    dernierPrix: number | null;
    dernierClient: string | null;
    dernierClientId: string | null;
    derniereDate: string | null;
    qteVendue: number;
    qteValorisee: number;
    caTotal: number;
    parClient: Array<{ client_id: string | null; client_nom: string; qte: number; prixMoyen: number | null; caTotal: number }>;
    historique: Array<{ date: string | null; prix_unitaire: number; quantite: number; client_nom: string }>;
}

/** Courbe du prix dans le temps. SVG inline volontairement : ajouter Recharts
 *  ici chargerait une librairie de graphes pour trente points. */
const Sparkline: React.FC<{ points: number[] }> = ({ points }) => {
    if (points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const W = 240, H = 40;
    const d = points
        .map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i / (points.length - 1)) * W} ${H - ((v - min) / span) * H}`)
        .join(' ');
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10 overflow-visible" preserveAspectRatio="none" aria-hidden="true">
            <path d={d} fill="none" strokeWidth={1.5} className="stroke-indigo-500 dark:stroke-dk-accent" vectorEffect="non-scaling-stroke" />
        </svg>
    );
};

const PrixIntelligenceSection: React.FC<{
    modelId: string;
    currency: string;
    dateLocale: string;
    onPush: (t: SheetTarget) => void;
}> = ({ modelId, currency, dateLocale, onPush }) => {
    const { lang } = useLang();
    const [stats, setStats] = useState<PrixStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (IS_STATIC) { setLoading(false); return; }
        let vivant = true;
        setLoading(true);
        fetch(`/api/prix/stats?modelId=${encodeURIComponent(modelId)}`, { credentials: 'include' })
            .then(r => (r.ok ? r.json() : null))
            .then((d: any) => { if (vivant) setStats(d || null); })
            .catch(() => { if (vivant) setStats(null); })
            .finally(() => { if (vivant) setLoading(false); });
        return () => { vivant = false; };
    }, [modelId]);

    if (loading) return null;
    if (!stats || stats.qteValorisee <= 0) return null;

    const courbe = stats.historique.map(h => Number(h.prix_unitaire) || 0);

    return (
        <Section
            title={tx(lang, { fr: 'Vos prix pratiqués (historique de vente)', ar: 'الأثمنة اللي طبّقتي (تاريخ البيع)', en: 'Your practised prices (sales history)', es: 'Sus precios aplicados (historial de venta)', pt: 'Os seus precos praticados (historico de venda)', tr: 'Uyguladiginiz fiyatlar (satis gecmisi)' })}
            icon={<TrendingUp className="w-3.5 h-3.5 text-indigo-600 dark:text-dk-accent" />}
        >
            <p className="text-[10px] text-slate-400 dark:text-dk-muted mb-3">
                {tx(lang, { fr: 'Ces chiffres viennent de VOS ventes enregistrées — ce n\u2019est pas un prix de marché.', ar: 'هاد الأرقام جايين من البيوعات ديالك المسجّلة — ماشي ثمن السوق.', en: 'These figures come from YOUR recorded sales — this is not a market price.', es: 'Estas cifras vienen de SUS ventas registradas — no es un precio de mercado.', pt: 'Estes numeros vem das SUAS vendas registadas — nao e um preco de mercado.', tr: 'Bu rakamlar SIZIN kayitli satislarinizdan gelir — piyasa fiyati degildir.' })}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Kpi
                    label={tx(lang, { fr: 'Dernier prix', ar: 'آخر ثمن', en: 'Last price', es: 'Ultimo precio', pt: 'Ultimo preco', tr: 'Son fiyat' })}
                    value={stats.dernierPrix == null ? '—' : `${fmt(stats.dernierPrix)} ${currency}`}
                    tone="accent"
                />
                <Kpi
                    label={tx(lang, { fr: 'Moyenne pondérée', ar: 'المعدّل المرجّح', en: 'Weighted average', es: 'Media ponderada', pt: 'Media ponderada', tr: 'Agirlikli ortalama' })}
                    value={stats.prixMoyenPondere == null ? '—' : `${fmt(stats.prixMoyenPondere)} ${currency}`}
                />
                <Kpi
                    label={tx(lang, { fr: 'Min / Max', ar: 'الأدنى / الأقصى', en: 'Min / Max', es: 'Min / Max', pt: 'Min / Max', tr: 'Min / Maks' })}
                    value={stats.prixMin == null ? '—' : `${fmt(stats.prixMin)} / ${fmt(stats.prixMax || 0)}`}
                />
                <Kpi
                    label={tx(lang, { fr: 'CA du modèle', ar: 'رقم معاملات الموديل', en: 'Model revenue', es: 'Facturacion del modelo', pt: 'Volume de negocios do modelo', tr: 'Model cirosu' })}
                    value={`${fmt(stats.caTotal)} ${currency}`}
                    tone="good"
                />
            </div>

            {stats.dernierPrix != null && (
                <p className="text-[11px] text-slate-600 dark:text-dk-text-soft mt-3">
                    {tx(lang, { fr: 'Dernière vente', ar: 'آخر بيعة', en: 'Last sale', es: 'Ultima venta', pt: 'Ultima venda', tr: 'Son satis' })} :{' '}
                    <b>{fmt(stats.dernierPrix)} {currency}</b>
                    {stats.dernierClient && (
                        <>
                            {' · '}
                            <EntityLink
                                label={stats.dernierClient}
                                onClick={() => onPush({ kind: 'client', clientId: stats.dernierClientId, clientNom: stats.dernierClient })}
                            />
                        </>
                    )}
                    {stats.derniereDate && <> · {fmtDay(stats.derniereDate, dateLocale)}</>}
                </p>
            )}

            {courbe.length >= 2 && (
                <div className="mt-3">
                    <Sparkline points={courbe} />
                    <p className="text-[9px] text-slate-400 dark:text-dk-muted mt-1">
                        {tx(lang, { fr: 'Prix unitaire des 30 dernières ventes valorisées, du plus ancien au plus récent.', ar: 'ثمن الوحدة ديال آخر 30 بيعة مثمّنة، من الأقدم للأحدث.', en: 'Unit price of the last 30 valued sales, oldest to most recent.', es: 'Precio unitario de las ultimas 30 ventas valoradas, de la mas antigua a la mas reciente.', pt: 'Preco unitario das ultimas 30 vendas valorizadas, da mais antiga a mais recente.', tr: 'Son 30 degerlenmis satisin birim fiyati, eskiden yeniye.' })}
                    </p>
                </div>
            )}
        </Section>
    );
};

/* ------------------------------------------------------------------ */
/* Fiche MODÈLE                                                        */
/* ------------------------------------------------------------------ */

interface ModelSheetProps extends Omit<EntitySheetProps, 'stack' | 'onBack' | 'onClose' | 'onEditClient'> {
    modelId: string;
}

const ModelSheet: React.FC<ModelSheetProps> = ({
    modelId, models, orders, clients, sorties, stats, stockMatrix, currency, dateLocale, onPush,
    prixParClientEnabled = false, canSeeCost = true, canSetPrice = true, clientTypeLabels = {},
    onSetModelStorePublished,
}) => {
    const { lang } = useLang();

    const model = useMemo(() => models.find(m => m.id === modelId) || null, [models, modelId]);
    const stat = useMemo(() => stats.find(s => s.model.id === modelId) || null, [stats, modelId]);

    /** Sorties de CE modèle, la plus récente en tête : une fiche se lit du
     *  dernier mouvement vers l'histoire ancienne, pas l'inverse. */
    const modelSorties = useMemo(
        () => sorties
            .filter(s => s.modelId === modelId)
            .slice()
            .sort((a, b) => String(b.date_sortie || '').localeCompare(String(a.date_sortie || ''))),
        [sorties, modelId]
    );

    /** Qui a acheté ce modèle. Trié par chiffre d'affaires : c'est le client qui
     *  rapporte, pas celui qui prend le plus de pièces, qui doit être en tête. */
    const buyers = useMemo(() => {
        const map = new Map<string, { key: string; clientId: string | null; nom: string; qty: number; ca: number }>();
        modelSorties.forEach(s => {
            const key = clientKeyOf(s.client_id, s.client_nom);
            const row = map.get(key) || {
                key,
                clientId: s.client_id ? String(s.client_id) : null,
                nom: String(s.client_nom || '').trim() || tx(lang, { fr: 'Client non renseigné', ar: 'زبون غير محدّد', en: 'Unnamed client', es: 'Cliente sin nombre', pt: 'Cliente sem nome', tr: 'Adsız müşteri' }),
                qty: 0, ca: 0,
            };
            const q = toNum(s.quantite);
            row.qty += q;
            row.ca += q * toNum(s.prix_unitaire);
            map.set(key, row);
        });
        return Array.from(map.values()).sort((a, b) => b.ca - a.ca);
    }, [modelSorties, lang]);

    const modelOrders = useMemo(
        () => orders
            .filter(o => o.modelId === modelId)
            .slice()
            .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))),
        [orders, modelId]
    );

    /** Grille couleur × taille du stock DISPONIBLE. On ne montre que les lignes
     *  et colonnes réellement peuplées : une grille pleine de zéros ne dit rien. */
    const grid = useMemo(() => {
        const cells = stockMatrix.get(modelId) || new Map<string, number>();
        const couleurs: string[] = [];
        const tailles: string[] = [];
        const byCell = new Map<string, number>();
        cells.forEach((qty, key) => {
            if (!qty) return;
            const [c, t] = key.split('|');
            if (!couleurs.includes(c)) couleurs.push(c);
            if (!tailles.includes(t)) tailles.push(t);
            byCell.set(key, qty);
        });
        couleurs.sort((a, b) => a.localeCompare(b));
        tailles.sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b));
        return { couleurs, tailles, byCell };
    }, [stockMatrix, modelId]);

    if (!model) {
        return <EmptyLine text={tx(lang, { fr: 'Modèle introuvable.', ar: 'الموديل غير موجود.', en: 'Model not found.', es: 'Modelo no encontrado.', pt: 'Modelo não encontrado.', tr: 'Model bulunamadı.' })} />;
    }

    const nom = model.meta_data?.nom_modele || '—';
    const clientOrigine = String((model.ficheData as any)?.client || '').trim();
    const price = stat?.price ?? null;
    const salePrice = stat?.salePrice ?? null;

    /** Le modèle a-t-il une déclinaison couleur × taille ? On accepte aussi bien
     *  la déclaration de la fiche de coût que ce qui existe réellement en stock :
     *  un modèle lancé avant l'ajout des grilles a des pièces sans avoir de
     *  `sizes`/`colors` renseignés. Sans déclinaison, publier n'a aucun sens —
     *  la boutique ne saurait pas quoi proposer à l'acheteur. */
    const hasGrilleBoutique =
        (((model.ficheData as any)?.colors?.length || 0) > 0 || grid.couleurs.length > 0) &&
        (((model.ficheData as any)?.sizes?.length || 0) > 0 || grid.tailles.length > 0);
    const marge = (price != null && salePrice != null) ? salePrice - price : null;
    const margePct = (marge != null && salePrice != null && salePrice > 0) ? (marge / salePrice) * 100 : null;

    const statusLabel = stat?.status === 'FINISHED'
        ? tx(lang, { fr: 'Terminé', ar: 'منتهٍ', en: 'Finished', es: 'Terminado', pt: 'Terminado', tr: 'Bitti' })
        : stat?.status === 'IN_PRODUCTION'
            ? tx(lang, { fr: 'En production', ar: 'قيد الإنتاج', en: 'In production', es: 'En producción', pt: 'Em produção', tr: 'Üretimde' })
            : tx(lang, { fr: 'Inactif', ar: 'غير نشط', en: 'Inactive', es: 'Inativo', pt: 'Inativo', tr: 'Pasif' });

    const statusChip = stat?.status === 'FINISHED'
        ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50'
        : stat?.status === 'IN_PRODUCTION'
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50'
            : 'bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border';

    const th = 'px-3 py-2 text-left font-semibold uppercase tracking-wide text-[9px] text-slate-500 dark:text-dk-muted whitespace-nowrap';
    const td = 'px-3 py-2 whitespace-nowrap text-slate-700 dark:text-dk-text-soft';

    return (
        <div className="space-y-4">
            {/* En-tête : image, nom, client d'origine, statut de production. */}
            <div className="flex items-start gap-3">
                <div className="w-16 h-16 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                    {model.image ? (
                        <img src={model.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <Package className="w-6 h-6 text-slate-400 dark:text-dk-muted" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-dk-text text-base truncate">{nom}</h3>
                    <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-0.5">
                        {tx(lang, { fr: "Client d'origine", ar: 'الزبون الأصلي', en: 'Origin client', es: 'Cliente de origen', pt: 'Cliente de origem', tr: 'Kaynak müşteri' })} :{' '}
                        {clientOrigine ? (
                            <EntityLink label={clientOrigine} onClick={() => onPush({ kind: 'client', clientNom: clientOrigine })} />
                        ) : '—'}
                    </p>
                    <span className={`inline-block mt-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${statusChip}`}>{statusLabel}</span>
                </div>
            </div>

            {/* Les trois chiffres économiques. La marge est exprimée sur le prix
                de VENTE (taux de marge commerciale), pas sur le revient. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Coût et marge disparaissent en bloc quand le cloisonnement
                    commercial est actif : une marge se recalcule dès qu'un seul
                    des trois chiffres fuite. Le prix de VENTE, lui, reste. */}
                {canSeeCost && (
                    <Kpi label={tx(lang, { fr: 'Prix de revient', ar: 'ثمن التكلفة', en: 'Cost price', es: 'Precio de coste', pt: 'Preço de custo', tr: 'Maliyet fiyatı' })} value={price == null ? '—' : `${fmt(price)} ${currency}`} />
                )}
                <Kpi label={tx(lang, { fr: 'Prix de vente', ar: 'ثمن البيع', en: 'Sale price', es: 'Precio de venta', pt: 'Preço de venda', tr: 'Satış fiyatı' })} value={salePrice == null ? '—' : `${fmt(salePrice)} ${currency}`} tone="accent" />
                {canSeeCost && (
                    <Kpi
                        label={tx(lang, { fr: 'Marge unitaire', ar: 'الهامش للوحدة', en: 'Unit margin', es: 'Margen unitario', pt: 'Margem unitária', tr: 'Birim marj' })}
                        value={marge == null ? '—' : `${fmt(marge)} ${currency}`}
                        tone={marge == null ? 'neutral' : marge >= 0 ? 'good' : 'bad'}
                    />
                )}
                {canSeeCost && (
                    <Kpi
                        label={tx(lang, { fr: 'Marge (sur PV)', ar: 'الهامش (على ثمن البيع)', en: 'Margin (on sale price)', es: 'Margen (sobre PV)', pt: 'Margem (sobre PV)', tr: 'Marj (satış fiyatı üzerinden)' })}
                        value={margePct == null ? '—' : `${margePct.toFixed(1)} %`}
                        tone={margePct == null ? 'neutral' : margePct >= 0 ? 'good' : 'bad'}
                    />
                )}
            </div>

            {/* Intelligence prix : ce qui s'est réellement vendu, et à qui. */}
            <PrixIntelligenceSection modelId={modelId} currency={currency} dateLocale={dateLocale} onPush={onPush} />

            {/* Grille tarifaire — uniquement si l'atelier a activé la
                tarification par client, sinon un simple renvoi vers le réglage. */}
            {prixParClientEnabled ? (
                <TarifsSection
                    modelId={modelId}
                    clients={clients}
                    currency={currency}
                    canSetPrice={canSetPrice}
                    clientTypeLabels={clientTypeLabels}
                />
            ) : (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface">
                    <Tag className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0 mt-0.5" />
                    <p className="text-[10px] text-slate-500 dark:text-dk-muted leading-snug">
                        {tx(lang, { fr: 'Tarification par client désactivée. Activez-la dans Réglages › Commercial pour définir des prix par client, par segment ou par palier de quantité.', ar: 'التسعير حسب الزبون مطفّي. فعّلو ف الإعدادات › التجاري باش تحدّد أثمنة حسب الزبون أو الفئة أو عتبة الكمية.', en: 'Per-client pricing is disabled. Enable it in Settings › Commercial to set prices per client, per segment or per quantity tier.', es: 'La tarificacion por cliente esta desactivada. Activela en Ajustes › Comercial para definir precios por cliente, segmento o tramo de cantidad.', pt: 'A tarifacao por cliente esta desativada. Ative-a em Definicoes › Comercial para definir precos por cliente, segmento ou escalao de quantidade.', tr: 'Musteri bazli fiyatlandirma kapali. Musteri, segment veya miktar kademesine gore fiyat belirlemek icin Ayarlar › Ticari bolumunden acin.' })}
                    </p>
                </div>
            )}

            {/* Boutique en ligne : codes article, publication volontaire, écarts
                de quantité. C'est le seul écran qui révèle une dérive entre le
                stock réel et ce que la boutique propose encore à la vente. */}
            <ModelStoreSection
                modelId={modelId}
                hasGrille={hasGrilleBoutique}
                hasImage={!!model.image}
                published={!!(model.ficheData as any)?.storePublished}
                onTogglePublished={onSetModelStorePublished}
                prixVente={salePrice}
                currency={currency}
                dateLocale={dateLocale}
                lang={lang}
            />

            {stat && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Kpi label={tx(lang, { fr: 'Produit', ar: 'المنتَج', en: 'Produced', es: 'Producido', pt: 'Produzido', tr: 'Üretilen' })} value={stat.producedQty.toLocaleString(dateLocale)} />
                    <Kpi label={tx(lang, { fr: 'Sorti', ar: 'مخرَج', en: 'Exited', es: 'Salido', pt: 'Saído', tr: 'Çıkan' })} value={stat.exitedQty.toLocaleString(dateLocale)} />
                    <Kpi label={tx(lang, { fr: 'Facturé', ar: 'مفوتر', en: 'Invoiced', es: 'Facturado', pt: 'Faturado', tr: 'Faturalı' })} value={stat.invoicedQty.toLocaleString(dateLocale)} tone={stat.exitedQty !== stat.invoicedQty ? 'bad' : 'neutral'} />
                    <Kpi label={tx(lang, { fr: 'Stock restant', ar: 'المخزون المتبقّي', en: 'Remaining stock', es: 'Stock restante', pt: 'Stock restante', tr: 'Kalan stok' })} value={stat.remainingStock.toLocaleString(dateLocale)} tone="good" />
                </div>
            )}

            {/* Stock disponible ventilé couleur × taille. */}
            <Section
                title={tx(lang, { fr: 'Stock disponible (couleur × taille)', ar: 'المخزون المتوفّر (لون × مقاس)', en: 'Available stock (color × size)', es: 'Stock disponible (color × talla)', pt: 'Stock disponível (cor × tamanho)', tr: 'Mevcut stok (renk × beden)' })}
                icon={<Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-dk-accent" />}
            >
                {stat?.stockSource === 'FALLBACK' ? (
                    <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="font-semibold">
                            {tx(lang, { fr: "Stock non ventilé : les pièces ont été comptabilisées globalement, aucune grille n'existe.", ar: 'المخزون غير مفصّل: القطع تسجّلات بشكل إجمالي، ما كايناش شبكة.', en: 'Stock not itemised: pieces were counted globally, no grid exists.', es: 'Stock sin desglose: las piezas se contabilizaron globalmente, no hay cuadrícula.', pt: 'Stock sem desdobramento: as peças foram contabilizadas globalmente, não existe grelha.', tr: 'Stok ayrıntılandırılmamış: parçalar toplu sayıldı, ızgara yok.' })}
                        </span>
                    </div>
                ) : grid.couleurs.length === 0 ? (
                    /* « Rien » ne veut pas dire la même chose selon d'où l'on
                       vient : tout vendu, ou rien jamais réceptionné. Le dire
                       évite de chercher une erreur là où il n'y en a pas. */
                    <EmptyLine text={(stat?.producedQty ?? 0) > 0
                        ? tx(lang, { fr: 'Aucune pièce disponible : tout a été sorti.', ar: 'ما كاينة حتى قطعة متوفّرة: كلشي خرج.', en: 'No piece available: everything has been shipped out.', es: 'Ninguna pieza disponible: todo ha salido.', pt: 'Nenhuma peça disponível: tudo saiu.', tr: 'Mevcut parça yok: hepsi çıktı.' })
                        : tx(lang, { fr: "Aucune pièce disponible : aucune réception n'a encore été saisie pour ce modèle.", ar: 'ما كاينة حتى قطعة متوفّرة: مازال ما تسجّل حتى استلام لهاد الموديل.', en: 'No piece available: no reception has been recorded for this model yet.', es: 'Ninguna pieza disponible: aún no se ha registrado ninguna recepción para este modelo.', pt: 'Nenhuma peça disponível: ainda não foi registada nenhuma receção para este modelo.', tr: 'Mevcut parça yok: bu model için henüz kabul girilmedi.' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px] border-collapse">
                            <thead>
                                <tr>
                                    <th className={th}>{tx(lang, { fr: 'Couleur', ar: 'اللون', en: 'Color', es: 'Color', pt: 'Cor', tr: 'Renk' })}</th>
                                    {grid.tailles.map(t => <th key={t} className={`${th} text-center`}>{t || '—'}</th>)}
                                    <th className={`${th} text-center`}>{tx(lang, { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                {grid.couleurs.map(c => {
                                    const total = grid.tailles.reduce((a, t) => a + (grid.byCell.get(`${c}|${t}`) || 0), 0);
                                    return (
                                        <tr key={c}>
                                            <td className={`${td} font-semibold text-slate-800 dark:text-dk-text`}>{c || '—'}</td>
                                            {grid.tailles.map(t => {
                                                const q = grid.byCell.get(`${c}|${t}`) || 0;
                                                return (
                                                    <td key={t} className={
                                                        q > 0
                                                            ? 'px-3 py-2 text-center font-bold text-emerald-600 dark:text-emerald-400'
                                                            : 'px-3 py-2 text-center text-slate-300 dark:text-dk-muted'
                                                    }>{q > 0 ? q.toLocaleString(dateLocale) : '·'}</td>
                                                );
                                            })}
                                            <td className="px-3 py-2 text-center font-bold text-slate-800 dark:text-dk-text">{total.toLocaleString(dateLocale)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            {/* Qui a acheté ce modèle — l'agrégat avant le détail, pour pouvoir
                répondre « qui est mon client principal » d'un coup d'œil. */}
            <Section
                title={tx(lang, { fr: 'Acheteurs de ce modèle', ar: 'مشترو هذا الموديل', en: 'Buyers of this model', es: 'Compradores de este modelo', pt: 'Compradores deste modelo', tr: 'Bu modelin alıcıları' })}
                icon={<Users className="w-3.5 h-3.5 text-indigo-600 dark:text-dk-accent" />}
            >
                {buyers.length === 0 ? (
                    <EmptyLine text={tx(lang, { fr: 'Aucune vente enregistrée.', ar: 'ما كاينة حتى مبيعة مسجّلة.', en: 'No sale recorded.', es: 'Ninguna venta registrada.', pt: 'Nenhuma venda registada.', tr: 'Kayıtlı satış yok.' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr>
                                    <th className={th}>{tx(lang, { fr: 'Client', ar: 'الزبون', en: 'Client', es: 'Cliente', pt: 'Cliente', tr: 'Müşteri' })}</th>
                                    <th className={`${th} text-right`}>{tx(lang, { fr: 'Pièces', ar: 'القطع', en: 'Pieces', es: 'Piezas', pt: 'Peças', tr: 'Parça' })}</th>
                                    <th className={`${th} text-right`}>CA</th>
                                    <th className={`${th} text-right`}>{tx(lang, { fr: 'PU moyen', ar: 'متوسّط ثمن الوحدة', en: 'Avg. unit price', es: 'PU medio', pt: 'PU médio', tr: 'Ort. birim fiyat' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                {buyers.map(b => (
                                    <tr key={b.key}>
                                        <td className={td}>
                                            <EntityLink label={b.nom} onClick={() => onPush({ kind: 'client', clientId: b.clientId, clientNom: b.nom })} />
                                        </td>
                                        <td className={`${td} text-right font-semibold`}>{b.qty.toLocaleString(dateLocale)}</td>
                                        <td className={`${td} text-right font-bold text-slate-800 dark:text-dk-text`}>{fmt(b.ca)} {currency}</td>
                                        <td className={`${td} text-right`}>{b.qty > 0 ? `${fmt(b.ca / b.qty)} ${currency}` : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            {/* Historique des sorties de stock de ce modèle. */}
            <Section
                title={tx(lang, { fr: 'Historique des sorties', ar: 'سجلّ الإخراجات', en: 'Exit history', es: 'Historial de salidas', pt: 'Histórico de saídas', tr: 'Çıkış geçmişi' })}
                icon={<ShoppingBag className="w-3.5 h-3.5 text-indigo-600 dark:text-dk-accent" />}
            >
                {modelSorties.length === 0 ? (
                    <EmptyLine text={tx(lang, { fr: 'Aucune sortie de stock.', ar: 'ما كاين حتى إخراج من المخزون.', en: 'No stock exit.', es: 'Ninguna salida de stock.', pt: 'Nenhuma saída de stock.', tr: 'Stok çıkışı yok.' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr>
                                    <th className={th}>{tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' })}</th>
                                    <th className={th}>{tx(lang, { fr: 'Client', ar: 'الزبون', en: 'Client', es: 'Cliente', pt: 'Cliente', tr: 'Müşteri' })}</th>
                                    <th className={th}>{tx(lang, { fr: 'Couleur / Taille', ar: 'اللون / المقاس', en: 'Color / Size', es: 'Color / Talla', pt: 'Cor / Tamanho', tr: 'Renk / Beden' })}</th>
                                    <th className={`${th} text-right`}>{tx(lang, { fr: 'Qté', ar: 'الكمية', en: 'Qty', es: 'Cant.', pt: 'Qtd', tr: 'Adet' })}</th>
                                    <th className={`${th} text-right`}>PU</th>
                                    <th className={`${th} text-right`}>{tx(lang, { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                {modelSorties.map((s, i) => {
                                    const q = toNum(s.quantite);
                                    const pu = toNum(s.prix_unitaire);
                                    const label = String(s.client_nom || '').trim();
                                    return (
                                        <tr key={s.id || `${i}-${s.date_sortie}`}>
                                            <td className={td}>{fmtDay(s.date_sortie, dateLocale)}</td>
                                            <td className={td}>
                                                {label
                                                    ? <EntityLink label={label} onClick={() => onPush({ kind: 'client', clientId: s.client_id ? String(s.client_id) : null, clientNom: label })} />
                                                    : '—'}
                                            </td>
                                            <td className={td}>{[s.couleur, s.taille].filter(Boolean).join(' / ') || '—'}</td>
                                            <td className={`${td} text-right font-semibold`}>{q.toLocaleString(dateLocale)}</td>
                                            <td className={`${td} text-right`}>{pu > 0 ? `${fmt(pu)} ${currency}` : '—'}</td>
                                            <td className={`${td} text-right font-bold text-slate-800 dark:text-dk-text`}>{fmt(q * pu)} {currency}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            {/* Commandes de sous-traitance liées : d'où viennent physiquement les pièces. */}
            <Section
                title={tx(lang, { fr: 'Commandes de sous-traitance', ar: 'طلبيات المقاولة من الباطن', en: 'Subcontract orders', es: 'Pedidos de subcontratación', pt: 'Encomendas de subcontratação', tr: 'Taşeron siparişleri' })}
                icon={<Truck className="w-3.5 h-3.5 text-indigo-600 dark:text-dk-accent" />}
            >
                {modelOrders.length === 0 ? (
                    <EmptyLine text={tx(lang, { fr: 'Aucune commande liée.', ar: 'ما كاينة حتى طلبية مرتبطة.', en: 'No linked order.', es: 'Ningún pedido vinculado.', pt: 'Nenhuma encomenda ligada.', tr: 'Bağlı sipariş yok.' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr>
                                    <th className={th}>{tx(lang, { fr: 'Sous-traitant', ar: 'المقاول من الباطن', en: 'Subcontractor', es: 'Subcontratista', pt: 'Subcontratado', tr: 'Fasoncu' })}</th>
                                    <th className={th}>{tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Estado', tr: 'Durum' })}</th>
                                    <th className={`${th} text-right`}>{tx(lang, { fr: 'Qté', ar: 'الكمية', en: 'Qty', es: 'Cant.', pt: 'Qtd', tr: 'Adet' })}</th>
                                    <th className={`${th} text-right`}>{tx(lang, { fr: 'Acceptées', ar: 'مقبولة', en: 'Accepted', es: 'Aceptadas', pt: 'Aceites', tr: 'Kabul' })}</th>
                                    <th className={th}>{tx(lang, { fr: 'Livraison', ar: 'التسليم', en: 'Delivery', es: 'Entrega', pt: 'Entrega', tr: 'Teslimat' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                {modelOrders.map(o => (
                                    <tr key={o.id}>
                                        <td className={`${td} font-semibold text-slate-800 dark:text-dk-text`}>{o.subcontractorName || '—'}</td>
                                        <td className={td}>{o.status || '—'}</td>
                                        <td className={`${td} text-right`}>{(o.totalQuantity || 0).toLocaleString(dateLocale)}</td>
                                        <td className={`${td} text-right font-semibold text-emerald-600 dark:text-emerald-400`}>{(o.qtyAccepted || 0).toLocaleString(dateLocale)}</td>
                                        <td className={td}>{fmtDay(o.deliveryDate, dateLocale)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Fiche CLIENT                                                        */
/* ------------------------------------------------------------------ */

interface ClientSheetProps extends Omit<EntitySheetProps, 'stack' | 'onBack' | 'onClose'> {
    clientId?: string | null;
    clientNom?: string | null;
    /** Ouvre directement la facturation des sorties non facturées au montage de
     *  la fiche — après une sortie de stock, l'utilisateur a dit « oui, facturer ». */
    autoOpenInvoice?: boolean;
}

const ClientSheet: React.FC<ClientSheetProps> = ({
    clientId, clientNom, autoOpenInvoice, clients, models, sorties, currency, dateLocale, onPush, onEditClient, onInvoiced, onPrintInvoice,
}) => {
    const { lang } = useLang();
    const [denseFullscreen, toggleDenseFullscreen] = useSheetFullscreen();
    const [invoiceModal, setInvoiceModal] = useState(false);
    const [invoiceSelected, setInvoiceSelected] = useState<Set<string>>(new Set());
    const [invoiceTva, setInvoiceTva] = useState('20');
    const [invoiceStatut, setInvoiceStatut] = useState<'BROUILLON' | 'ENVOYEE' | 'PAYEE'>('ENVOYEE');
    const [invoiceSaving, setInvoiceSaving] = useState(false);
    const [invoiceError, setInvoiceError] = useState<string | null>(null);
    /** Conditions & montants — même logique que la facture de sous-traitance
     *  (achat) : dates, remise, acompte et exonération, visibles avant
     *  d'émettre plutôt que découvertes après coup sur le document imprimé. */
    const [invoiceDateFacture, setInvoiceDateFacture] = useState('');
    const [invoiceDateEcheance, setInvoiceDateEcheance] = useState('');
    const [invoiceDiscount, setInvoiceDiscount] = useState<number | ''>('');
    const [invoiceDiscountMode, setInvoiceDiscountMode] = useState<'PCT' | 'AMOUNT'>('PCT');
    const [invoiceAcompte, setInvoiceAcompte] = useState<number | ''>('');
    const [invoiceExo, setInvoiceExo] = useState(false);
    /** Factures de VENTE déjà émises pour ce client — pour pouvoir en annuler
     *  une et rendre ses sorties de nouveau facturables (un « retour »). */
    const [clientFactures, setClientFactures] = useState<any[]>([]);
    const [clientFacturesLoading, setClientFacturesLoading] = useState(false);
    const [cancellingFactureId, setCancellingFactureId] = useState<string | null>(null);
    const [pendingCancelFacture, setPendingCancelFacture] = useState<any | null>(null);

    /** Volet FOURNISSEUR — ce que CE tiers nous facture, et ce qu'on lui doit
     *  encore. Deux sources s'additionnent côté serveur : les frais rattachés à
     *  ses commandes (transport, patronage…) et les factures d'ACHAT à son nom.
     *  N'est chargé que pour un tiers qui nous vend : interroger le serveur pour
     *  un client pur ferait une requête à vide à chaque ouverture de fiche. */
    const [fournisseurAccount, setFournisseurAccount] = useState<{
        frais: any[];
        facturesAchat: any[];
        achatsMarchandise: any[];
        totalFacture: number;
        totalPaye: number;
        resteDu: number;
        derniereFacture: string | null;
    } | null>(null);
    const [fournisseurLoading, setFournisseurLoading] = useState(false);

    /** Le registre `st_clients` fait foi quand il connaît ce client ; sinon la
     *  fiche reste ouvrable à partir du seul nom porté par les sorties. */
    const record = useMemo(() => {
        if (clientId) return clients.find(c => String(c.id) === String(clientId)) || null;
        const n = norm(clientNom);
        return clients.find(c => norm(c.nom) === n) || null;
    }, [clients, clientId, clientNom]);

    const loadClientFactures = useCallback(() => {
        if (!record?.id) { setClientFactures([]); return; }
        setClientFacturesLoading(true);
        fetch(`/api/facturation/factures?source_module=SOUSTRAITANCE_VENTE&source_id=${encodeURIComponent(record.id)}`, { credentials: 'include' })
            .then(r => (r.ok ? r.json() : []))
            .then(d => setClientFactures(Array.isArray(d) ? d : []))
            .catch(() => setClientFactures([]))
            .finally(() => setClientFacturesLoading(false));
    }, [record?.id]);

    useEffect(() => { loadClientFactures(); }, [loadClientFactures]);

    const cancelInvoice = async (facture: any) => {
        setCancellingFactureId(facture.id);
        try {
            const res = await fetch(`/api/subcontract/clients/facturer/${encodeURIComponent(facture.id)}/annuler`, { method: 'POST', credentials: 'include' });
            if (!res.ok) throw new Error();
            setPendingCancelFacture(null);
            loadClientFactures();
            onInvoiced?.();
        } catch {
            setInvoiceError(tx(lang, { fr: "L'annulation a échoué.", ar: 'فشل الإلغاء.', en: 'Cancellation failed.', es: 'La anulación falló.', pt: 'A anulação falhou.', tr: 'İptal başarısız.' }));
        } finally {
            setCancellingFactureId(null);
        }
    };

    const displayName = record?.nom || String(clientNom || '').trim()
        || tx(lang, { fr: 'Client non renseigné', ar: 'زبون غير محدّد', en: 'Unnamed client', es: 'Cliente sin nombre', pt: 'Cliente sem nome', tr: 'Adsız müşteri' });

    /** Rattachement des sorties : par id quand il existe, sinon par nom
     *  normalisé — les ventes antérieures au registre restent visibles. */
    const clientSorties = useMemo(() => {
        const targetId = record?.id ? String(record.id) : (clientId ? String(clientId) : null);
        const targetNom = norm(record?.nom || clientNom);
        return sorties
            .filter(s => {
                if (targetId && s.client_id && String(s.client_id) === targetId) return true;
                if (!s.client_id && targetNom && norm(s.client_nom) === targetNom) return true;
                if (!targetId && targetNom && norm(s.client_nom) === targetNom) return true;
                return false;
            })
            .slice()
            .sort((a, b) => String(b.date_sortie || '').localeCompare(String(a.date_sortie || '')));
    }, [sorties, record, clientId, clientNom]);

    /** Ouverture automatique de la facturation quand la fiche est montée avec
     *  `autoOpenInvoice` — une seule fois, pour ne pas rouvrir la modale si les
     *  sorties se rafraîchissent pendant qu'elle est affichée. Placé APRÈS le
     *  calcul de `clientSorties` : la liste de dépendances l'évalue à chaque
     *  rendu, un usage plus tôt déclencherait une référence avant initialisation. */
    const autoOpenedInvoiceRef = useRef(false);
    useEffect(() => {
        if (!autoOpenInvoice || autoOpenedInvoiceRef.current) return;
        const ids = clientSorties.filter(s => !s.facture_id).map(s => String(s.id));
        if (ids.length === 0) return;
        autoOpenedInvoiceRef.current = true;
        setInvoiceSelected(new Set(ids));
        setInvoiceTva('20');
        setInvoiceStatut('ENVOYEE');
        setInvoiceError(null);
        setInvoiceDateFacture(new Date().toISOString().split('T')[0]);
        setInvoiceDateEcheance('');
        setInvoiceDiscount('');
        setInvoiceDiscountMode('PCT');
        setInvoiceAcompte('');
        setInvoiceExo(false);
        setInvoiceModal(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoOpenInvoice, clientSorties]);

    const kpis = useMemo(() => {
        let ca = 0, pieces = 0, last = '', first = '';
        const modelIds = new Set<string>();
        clientSorties.forEach(s => {
            const q = toNum(s.quantite);
            pieces += q;
            ca += q * toNum(s.prix_unitaire);
            const d = String(s.date_sortie || '');
            if (d > last) last = d;
            if (d && (!first || d < first)) first = d;
            if (s.modelId) modelIds.add(String(s.modelId));
        });
        return {
            ca, pieces, count: clientSorties.length, last, first,
            panier: clientSorties.length > 0 ? ca / clientSorties.length : 0,
            modeles: modelIds.size,
        };
    }, [clientSorties]);

    /** Répartition par modèle : sur quoi ce client dépense-t-il réellement. */
    const byModel = useMemo(() => {
        const map = new Map<string, { modelId: string; nom: string; qty: number; ca: number }>();
        clientSorties.forEach(s => {
            const id = String(s.modelId || '');
            const found = models.find(m => m.id === id);
            const row = map.get(id) || {
                modelId: id,
                nom: found?.meta_data?.nom_modele || String(s.modele_nom || s.designation || '').trim() || '—',
                qty: 0, ca: 0,
            };
            const q = toNum(s.quantite);
            row.qty += q;
            row.ca += q * toNum(s.prix_unitaire);
            map.set(id, row);
        });
        return Array.from(map.values()).sort((a, b) => b.ca - a.ca);
    }, [clientSorties, models]);

    /** Sorties de ce client qui n'appartiennent encore à aucune facture — la
     *  matière première du bouton « Facturer ». */
    const unbilled = useMemo(() => clientSorties.filter(s => !s.facture_id), [clientSorties]);

    const openInvoiceModal = () => {
        setInvoiceSelected(new Set(unbilled.map(s => String(s.id))));
        setInvoiceTva('20');
        setInvoiceStatut('ENVOYEE');
        setInvoiceError(null);
        setInvoiceDateFacture(new Date().toISOString().split('T')[0]);
        setInvoiceDateEcheance('');
        setInvoiceDiscount('');
        setInvoiceDiscountMode('PCT');
        setInvoiceAcompte('');
        setInvoiceExo(false);
        setInvoiceModal(true);
    };

    const invoiceTotals = useMemo(() => {
        const lignes = unbilled.filter(s => invoiceSelected.has(String(s.id)));
        const brut = lignes.reduce((a, s) => a + toNum(s.quantite) * toNum(s.prix_unitaire), 0);
        const discount = invoiceDiscountMode === 'PCT'
            ? brut * ((Number(invoiceDiscount) || 0) / 100)
            : Math.min(brut, Number(invoiceDiscount) || 0);
        const ht = Math.max(0, brut - discount);
        const tva = invoiceExo ? 0 : ht * ((Number(invoiceTva) || 0) / 100);
        const ttc = ht + tva;
        const acompte = Math.min(ttc, Number(invoiceAcompte) || 0);
        return { count: lignes.length, brut, discount, ht, tva, ttc, acompte, reste: ttc - acompte };
    }, [unbilled, invoiceSelected, invoiceTva, invoiceDiscount, invoiceDiscountMode, invoiceExo, invoiceAcompte]);

    /** Récap couleur × taille des lignes cochées : avant d'émettre, l'utilisateur
     *  doit pouvoir vérifier d'un coup d'œil QUOI part chez ce client, pas
     *  seulement combien ça coûte — deux chiffres identiques peuvent recouvrir
     *  des pièces complètement différentes. */
    const invoiceGrid = useMemo(() => {
        const lignes = unbilled.filter(s => invoiceSelected.has(String(s.id)));
        const couleurs: string[] = [];
        const tailles: string[] = [];
        const byCell = new Map<string, number>();
        lignes.forEach(s => {
            const c = String(s.couleur || '—');
            const t = String(s.taille || '—');
            if (!couleurs.includes(c)) couleurs.push(c);
            if (!tailles.includes(t)) tailles.push(t);
            const key = `${c}|${t}`;
            byCell.set(key, (byCell.get(key) || 0) + toNum(s.quantite));
        });
        couleurs.sort((a, b) => a.localeCompare(b));
        tailles.sort((a, b) => sizeRank(a) - sizeRank(b) || a.localeCompare(b));
        return { couleurs, tailles, byCell };
    }, [unbilled, invoiceSelected]);

    const submitInvoice = async () => {
        if (invoiceTotals.count === 0) return;
        setInvoiceSaving(true);
        setInvoiceError(null);
        try {
            const res = await fetch('/api/subcontract/clients/facturer', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clientId: record?.id || null,
                    sortieIds: Array.from(invoiceSelected),
                    taux_tva: invoiceExo ? 0 : (Number(invoiceTva) || 0),
                    statut: invoiceStatut,
                    date_facture: invoiceDateFacture || undefined,
                    date_echeance: invoiceDateEcheance || null,
                    discount: invoiceTotals.discount,
                    montant_paye: invoiceTotals.acompte,
                    exonere: invoiceExo,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.message || 'save');
            }
            const savedFacture = await res.json();
            setInvoiceModal(false);
            onInvoiced?.();
            loadClientFactures();
            onPrintInvoice?.(savedFacture, record, invoiceGrid);
        } catch {
            setInvoiceError(tx(lang, { fr: "L'émission de la facture a échoué.", ar: 'فشل إصدار الفاتورة.', en: 'Invoice issuing failed.', es: 'Error al emitir la factura.', pt: 'Falha ao emitir a fatura.', tr: 'Fatura kesme başarısız.' }));
        } finally {
            setInvoiceSaving(false);
        }
    };

    const roleValue: string = (record as any)?.role || 'CLIENT';
    const sellsToUs = roleValue === 'FOURNISSEUR' || roleValue === 'LES_DEUX';
    const buysFromUs = roleValue !== 'FOURNISSEUR';

    useEffect(() => {
        if (!clientId || !sellsToUs) { setFournisseurAccount(null); return; }
        let alive = true;
        setFournisseurLoading(true);
        fetch(`/api/clients/${encodeURIComponent(String(clientId))}/dossier`, { credentials: 'include' })
            .then(r => (r.ok ? r.json() : null))
            .then((d: any) => { if (alive) setFournisseurAccount(d?.fournisseur ?? null); })
            .catch(() => { if (alive) setFournisseurAccount(null); })
            .finally(() => { if (alive) setFournisseurLoading(false); });
        return () => { alive = false; };
    }, [clientId, sellsToUs]);

    const typeLabel = record?.type === 'GROS'
        ? tx(lang, { fr: 'Gros', ar: 'الجملة', en: 'Wholesale', es: 'Mayorista', pt: 'Grosso', tr: 'Toptan' })
        : record?.type === 'BOUTIQUE'
            ? tx(lang, { fr: 'Boutique', ar: 'محلّ', en: 'Store', es: 'Tienda', pt: 'Loja', tr: 'Mağaza' })
            : tx(lang, { fr: 'Détail', ar: 'التقسيط', en: 'Retail', es: 'Detalle', pt: 'Retalho', tr: 'Perakende' });

    const typeChip = record?.type === 'GROS'
        ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50'
        : record?.type === 'BOUTIQUE'
            ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'
            : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50';

    const th = 'px-3 py-2 text-left font-semibold uppercase tracking-wide text-[9px] text-slate-500 dark:text-dk-muted whitespace-nowrap';
    const td = 'px-3 py-2 whitespace-nowrap text-slate-700 dark:text-dk-text-soft';

    return (
        <div className="space-y-4">
            {/* En-tête identitaire — mêmes champs que la fiche du registre. */}
            <div className="flex items-start gap-3">
                {record?.photo ? (
                    <img src={record.photo} alt="" className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-dk-border shrink-0" />
                ) : (
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-dk-accent/20 border border-indigo-100 dark:border-dk-border flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5 text-indigo-600 dark:text-dk-accent" />
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-dk-text text-base truncate">{displayName}</h3>
                    {record ? (
                        <span className="inline-flex flex-wrap items-center gap-1 mt-1">
                            {/* Le SENS de la relation prime : savoir si on lui vend
                                ou s'il nous vend change tout ce qu'on lit ensuite. */}
                            {sellsToUs && (
                                <span className={`inline-block px-2 py-0.5 rounded border text-[9px] font-bold ${roleValue === 'LES_DEUX' ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800/50' : 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800/50'}`}>
                                    {roleValue === 'LES_DEUX'
                                        ? tx(lang, { fr: 'Client et fournisseur', ar: 'زبون ومورّد', en: 'Client and supplier', es: 'Cliente y proveedor', pt: 'Cliente e fornecedor', tr: 'Müşteri ve tedarikçi' })
                                        : tx(lang, { fr: 'Fournisseur', ar: 'مورّد', en: 'Supplier', es: 'Proveedor', pt: 'Fornecedor', tr: 'Tedarikçi' })}
                                </span>
                            )}
                            {buysFromUs && (
                                <span className={`inline-block px-2 py-0.5 rounded border text-[9px] font-bold ${typeChip}`}>{typeLabel}</span>
                            )}
                        </span>
                    ) : (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded border text-[9px] font-bold bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border">
                            {tx(lang, { fr: 'Hors registre', ar: 'خارج السجلّ', en: 'Not in registry', es: 'Fuera del registro', pt: 'Fora do registo', tr: 'Kayıt dışı' })}
                        </span>
                    )}
                    <div className="mt-1.5 text-[10px] text-slate-500 dark:text-dk-muted space-y-0.5">
                        <p>{[record?.ice && `ICE : ${record.ice}`, record?.rc && `RC : ${record.rc}`].filter(Boolean).join(' · ') || '—'}</p>
                        <p>{[record?.tel, record?.email, record?.ville].filter(Boolean).join(' · ') || '—'}</p>
                        {record?.adresse && <p>{record.adresse}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {unbilled.length > 0 && (
                        <button
                            type="button"
                            onClick={openInvoiceModal}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 dark:bg-dk-accent text-white font-bold text-[11px] hover:bg-indigo-700 transition-colors"
                            title={tx(lang, { fr: `${unbilled.length} sortie(s) non facturée(s)`, ar: `${unbilled.length} إخراج غير مفوتر`, en: `${unbilled.length} unbilled exit(s)`, es: `${unbilled.length} salida(s) sin facturar`, pt: `${unbilled.length} saída(s) não faturada(s)`, tr: `${unbilled.length} faturasız çıkış` })}
                        >
                            <Receipt className="w-3.5 h-3.5" />
                            {tx(lang, { fr: 'Facturer', ar: 'فوترة', en: 'Invoice', es: 'Facturar', pt: 'Faturar', tr: 'Faturala' })}
                            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-white/20 text-[9px]">{unbilled.length}</span>
                        </button>
                    )}
                    {record && onEditClient && (
                        <button
                            type="button"
                            onClick={() => onEditClient(record)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors"
                        >
                            <Edit2 className="w-3.5 h-3.5" />
                            {tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' })}
                        </button>
                    )}
                </div>
            </div>

            {/* Compte fournisseur : facturé, payé, reste dû — plus le détail
                des lignes. Sans ce bloc, « où en est-on avec eux ? » se
                répondait en fouillant les commandes une par une. */}
            {sellsToUs && (
                <div className="rounded-2xl border border-sky-200 dark:border-sky-800/50 bg-sky-50/60 dark:bg-sky-950/20 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-black uppercase tracking-widest text-[9px] text-sky-700 dark:text-sky-400">
                            {tx(lang, { fr: 'Compte fournisseur', ar: 'حساب المورّد', en: 'Supplier account', es: 'Cuenta de proveedor', pt: 'Conta de fornecedor', tr: 'Tedarikçi hesabı' })}
                        </span>
                        {fournisseurLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600 dark:text-sky-400" />}
                    </div>

                    {!fournisseurLoading && !fournisseurAccount ? (
                        <p className="text-[11px] text-slate-500 dark:text-dk-muted">
                            {tx(lang, { fr: 'Rien à son nom pour le moment.', ar: 'ما كاين والو باسمو دابا.', en: 'Nothing under their name yet.', es: 'Nada a su nombre por ahora.', pt: 'Nada em seu nome por agora.', tr: 'Henüz adına bir şey yok.' })}
                        </p>
                    ) : fournisseurAccount ? (
                        <>
                            <div className="grid grid-cols-3 gap-2">
                                {([
                                    { k: tx(lang, { fr: 'Facturé', ar: 'المفوتر', en: 'Billed', es: 'Facturado', pt: 'Faturado', tr: 'Faturalanan' }), v: fournisseurAccount.totalFacture, cls: 'text-slate-800 dark:text-dk-text' },
                                    { k: tx(lang, { fr: 'Payé', ar: 'المخلَّص', en: 'Paid', es: 'Pagado', pt: 'Pago', tr: 'Ödenen' }), v: fournisseurAccount.totalPaye, cls: 'text-emerald-600 dark:text-emerald-400' },
                                    { k: tx(lang, { fr: 'Reste dû', ar: 'الباقي', en: 'Outstanding', es: 'Pendiente', pt: 'Em dívida', tr: 'Kalan' }), v: fournisseurAccount.resteDu, cls: fournisseurAccount.resteDu > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-dk-muted' },
                                ]).map(c => (
                                    <div key={c.k} className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2">
                                        <span className="block text-[9px] uppercase tracking-wide text-slate-400 dark:text-dk-muted font-semibold whitespace-nowrap">{c.k}</span>
                                        <span className={`block mt-0.5 font-bold text-sm ${c.cls}`}>{fmt(c.v)} {currency}</span>
                                    </div>
                                ))}
                            </div>

                            {fournisseurAccount.frais.length > 0 && (
                                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface">
                                    <table className="w-full text-[11px] border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-dk-bg/60">
                                                <th className={th}>{tx(lang, { fr: 'Frais', ar: 'المصروف', en: 'Expense', es: 'Gasto', pt: 'Despesa', tr: 'Masraf' })}</th>
                                                <th className={th}>{tx(lang, { fr: 'Commande', ar: 'الطلبية', en: 'Order', es: 'Pedido', pt: 'Encomenda', tr: 'Sipariş' })}</th>
                                                <th className={th}>{tx(lang, { fr: 'Facture', ar: 'الفاتورة', en: 'Invoice', es: 'Factura', pt: 'Fatura', tr: 'Fatura' })}</th>
                                                <th className={`${th} text-right`}>{tx(lang, { fr: 'Montant', ar: 'المبلغ', en: 'Amount', es: 'Importe', pt: 'Montante', tr: 'Tutar' })}</th>
                                                <th className={`${th} text-right`}>{tx(lang, { fr: 'Reste', ar: 'الباقي', en: 'Left', es: 'Resta', pt: 'Resta', tr: 'Kalan' })}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {fournisseurAccount.frais.map((f: any) => {
                                                const reste = Math.max(0, (Number(f.amount) || 0) - (Number(f.montantPaye) || 0));
                                                return (
                                                    <tr key={f.id} className="border-t border-slate-100 dark:border-dk-border">
                                                        <td className={`${td} font-semibold text-slate-800 dark:text-dk-text`}>{f.label}</td>
                                                        <td className={td}>{f.modelName || '—'}</td>
                                                        <td className={td}>{f.factureRef || '—'}</td>
                                                        <td className={`${td} text-right font-bold`}>{fmt(Number(f.amount) || 0)}</td>
                                                        <td className={`${td} text-right font-bold ${reste > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                            {reste > 0 ? fmt(reste) : '✓'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {fournisseurAccount.facturesAchat.length > 0 && (
                                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface">
                                    <table className="w-full text-[11px] border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-dk-bg/60">
                                                <th className={th}>{tx(lang, { fr: 'Facture d\'achat', ar: 'فاتورة شراء', en: 'Purchase invoice', es: 'Factura de compra', pt: 'Fatura de compra', tr: 'Alış faturası' })}</th>
                                                <th className={th}>{tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' })}</th>
                                                <th className={`${th} text-right`}>{tx(lang, { fr: 'TTC', ar: 'مع الضريبة', en: 'Incl. tax', es: 'Con IVA', pt: 'Com IVA', tr: 'KDV dahil' })}</th>
                                                <th className={`${th} text-right`}>{tx(lang, { fr: 'Reste', ar: 'الباقي', en: 'Left', es: 'Resta', pt: 'Resta', tr: 'Kalan' })}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {fournisseurAccount.facturesAchat.map((f: any) => {
                                                const reste = Math.max(0, (Number(f.total_ttc) || 0) - (Number(f.montant_paye) || 0));
                                                return (
                                                    <tr key={f.id} className="border-t border-slate-100 dark:border-dk-border">
                                                        <td className={`${td} font-semibold text-slate-800 dark:text-dk-text`}>{f.numero}</td>
                                                        <td className={td}>{f.date_facture ? new Date(f.date_facture).toLocaleDateString(dateLocale) : '—'}</td>
                                                        <td className={`${td} text-right font-bold`}>{fmt(Number(f.total_ttc) || 0)}</td>
                                                        <td className={`${td} text-right font-bold ${reste > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                            {reste > 0 ? fmt(reste) : '✓'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Achats de marchandise finie : rattachement par IDENTIFIANT
                                (choisi à la saisie), pas par nom — pas d'ambiguïté possible
                                ici, contrairement aux factures d'achat. Le montant dû suit
                                les pièces RÉELLEMENT entrées en stock pour cet achat. */}
                            {fournisseurAccount.achatsMarchandise.length > 0 && (
                                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface">
                                    <table className="w-full text-[11px] border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-dk-bg/60">
                                                <th className={th}>{tx(lang, { fr: 'Article acheté', ar: 'السلعة المشراة', en: 'Purchased article', es: 'Artículo comprado', pt: 'Artigo comprado', tr: 'Satın alınan ürün' })}</th>
                                                <th className={th}>{tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' })}</th>
                                                <th className={`${th} text-right`}>{tx(lang, { fr: 'Montant', ar: 'المبلغ', en: 'Amount', es: 'Importe', pt: 'Montante', tr: 'Tutar' })}</th>
                                                <th className={`${th} text-right`}>{tx(lang, { fr: 'Reste', ar: 'الباقي', en: 'Left', es: 'Resta', pt: 'Resta', tr: 'Kalan' })}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {fournisseurAccount.achatsMarchandise.map((m: any) => {
                                                const montant = (Number(m.quantite) || 0) * (Number(m.prixAchat) || 0);
                                                const reste = Math.max(0, montant - (Number(m.montantPaye) || 0));
                                                return (
                                                    <tr key={m.id} className="border-t border-slate-100 dark:border-dk-border">
                                                        <td className={`${td} font-semibold text-slate-800 dark:text-dk-text`}>
                                                            {m.articleNom || '—'}
                                                            {m.factureRef && <span className="block text-[9px] text-slate-400 dark:text-dk-muted font-normal">{m.factureRef}</span>}
                                                        </td>
                                                        <td className={td}>{m.dateAchat ? new Date(m.dateAchat).toLocaleDateString(dateLocale) : '—'}</td>
                                                        <td className={`${td} text-right font-bold`}>{fmt(montant)}</td>
                                                        <td className={`${td} text-right font-bold ${reste > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                            {reste > 0 ? fmt(reste) : '✓'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Le rapprochement des factures d'achat se fait sur le NOM :
                                elles ont ete saisies avant l'existence du registre. Le
                                dire evite de croire a un oubli quand le nom differe. Les
                                achats de marchandise, eux, se rattachent par identifiant. */}
                            {fournisseurAccount.facturesAchat.length === 0 && fournisseurAccount.frais.length === 0 && fournisseurAccount.achatsMarchandise.length === 0 && (
                                <p className="text-[10px] text-slate-400 dark:text-dk-muted leading-snug">
                                    {tx(lang, { fr: 'Aucun frais ni facture d\'achat à son nom. Les factures d\'achat sont rapprochées sur le nom exact du tiers.', ar: 'ما كاين لا مصاريف لا فواتير شراء باسمو. فواتير الشراء كتّربط بالاسم المضبوط ديال الطرف.', en: 'No expenses or purchase invoices under their name. Purchase invoices are matched on the exact name.', es: 'Ningún gasto ni factura de compra a su nombre. Las facturas de compra se cotejan por el nombre exacto.', pt: 'Nenhuma despesa ou fatura de compra em seu nome. As faturas de compra são associadas pelo nome exato.', tr: 'Adına masraf veya alış faturası yok. Alış faturaları tam ada göre eşleştirilir.' })}
                                </p>
                            )}
                        </>
                    ) : null}
                </div>
            )}

            {invoiceModal && (
                <SheetModal
                    onClose={() => { if (!invoiceSaving) setInvoiceModal(false); }}
                    title={tx(lang, { fr: 'Facturer les sorties non facturées', ar: 'فوترة الإخراجات غير المفوترة', en: 'Invoice unbilled exits', es: 'Facturar salidas sin facturar', pt: 'Faturar saídas não faturadas', tr: 'Faturasız çıkışları faturala' })}
                    icon={<Receipt className="w-4 h-4 text-indigo-600 dark:text-dk-accent shrink-0" />}
                    size="lg"
                    zClass="z-[260]"
                    fullscreen={denseFullscreen}
                    onToggleFullscreen={toggleDenseFullscreen}
                    closeOnBackdrop
                    bare
                >
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <div className="p-5 space-y-3">
                            {invoiceError && (
                                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    <span className="text-[10px] font-semibold">{invoiceError}</span>
                                </div>
                            )}

                            {invoiceGrid.couleurs.length > 1 || invoiceGrid.tailles.length > 1 ? (
                                <div className="border border-slate-200 dark:border-dk-border rounded-xl overflow-hidden">
                                    <div className="px-3 py-1.5 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/40 flex items-center gap-1.5">
                                        <Layers className="w-3 h-3 text-indigo-600 dark:text-dk-accent" />
                                        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-dk-muted">
                                            {tx(lang, { fr: 'Répartition Couleur / Taille', ar: 'التوزيع لون / مقاس', en: 'Color / Size Breakdown', es: 'Reparto Color / Talla', pt: 'Repartição Cor / Tamanho', tr: 'Renk / Beden Dağılımı' })}
                                        </span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-[10px]">
                                            <thead>
                                                <tr>
                                                    <th className="px-2.5 py-1.5 text-left font-semibold uppercase text-[9px] text-slate-500 dark:text-dk-muted whitespace-nowrap">{tx(lang, { fr: 'Couleur', ar: 'اللون', en: 'Color', es: 'Color', pt: 'Cor', tr: 'Renk' })}</th>
                                                    {invoiceGrid.tailles.map(t => <th key={t} className="px-2.5 py-1.5 text-center font-semibold uppercase text-[9px] text-slate-500 dark:text-dk-muted whitespace-nowrap">{t}</th>)}
                                                    <th className="px-2.5 py-1.5 text-center font-semibold uppercase text-[9px] text-slate-500 dark:text-dk-muted whitespace-nowrap">{tx(lang, { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' })}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                                {invoiceGrid.couleurs.map(c => {
                                                    const total = invoiceGrid.tailles.reduce((a, t) => a + (invoiceGrid.byCell.get(`${c}|${t}`) || 0), 0);
                                                    return (
                                                        <tr key={c}>
                                                            <td className="px-2.5 py-1.5 font-semibold text-slate-800 dark:text-dk-text whitespace-nowrap">{c}</td>
                                                            {invoiceGrid.tailles.map(t => {
                                                                const q = invoiceGrid.byCell.get(`${c}|${t}`) || 0;
                                                                return <td key={t} className={q > 0 ? 'px-2.5 py-1.5 text-center font-bold text-emerald-600 dark:text-emerald-400' : 'px-2.5 py-1.5 text-center text-slate-300 dark:text-dk-muted'}>{q > 0 ? q : '·'}</td>;
                                                            })}
                                                            <td className="px-2.5 py-1.5 text-center font-bold text-slate-800 dark:text-dk-text">{total}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : null}

                            <div className="space-y-1.5 max-h-64 overflow-y-auto border border-slate-200 dark:border-dk-border rounded-xl divide-y divide-slate-100 dark:divide-dk-border">
                                {unbilled.map(s => {
                                    const id = String(s.id);
                                    const checked = invoiceSelected.has(id);
                                    const found = models.find(m => m.id === String(s.modelId || ''));
                                    const label = found?.meta_data?.nom_modele || String(s.modele_nom || s.designation || '').trim() || '—';
                                    const total = toNum(s.quantite) * toNum(s.prix_unitaire);
                                    return (
                                        <label key={id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => setInvoiceSelected(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(id)) next.delete(id); else next.add(id);
                                                    return next;
                                                })}
                                                className="shrink-0"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[11px] font-semibold text-slate-800 dark:text-dk-text truncate">{label}</p>
                                                <p className="text-[9px] text-slate-400 dark:text-dk-muted">
                                                    {fmtDay(s.date_sortie, dateLocale)} · {[s.couleur, s.taille].filter(Boolean).join(' / ') || '—'} · {toNum(s.quantite)} pcs
                                                </p>
                                            </div>
                                            <span className="text-[11px] font-bold text-slate-800 dark:text-dk-text shrink-0">{fmt(total)} {currency}</span>
                                        </label>
                                    );
                                })}
                            </div>

                            {/* Conditions & montants — mêmes leviers que la facture d'achat
                                (sous-traitance) : dates, remise, acompte, exonération. Tout
                                visible AVANT d'émettre, faute de quoi une correction devient
                                un avoir. */}
                            <div className="border border-slate-200 dark:border-dk-border rounded-xl overflow-hidden">
                                <div className="px-3 py-1.5 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/40">
                                    <h4 className="text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-dk-muted">
                                        {tx(lang, { fr: 'Conditions & montants', ar: 'الشروط والمبالغ', en: 'Terms & amounts', es: 'Condiciones e importes', pt: 'Condições e montantes', tr: 'Koşullar ve tutarlar' })}
                                    </h4>
                                </div>
                                <div className="p-3 grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1">
                                            {tx(lang, { fr: 'Date de facture', ar: 'تاريخ الفاتورة', en: 'Invoice date', es: 'Fecha de factura', pt: 'Data da fatura', tr: 'Fatura tarihi' })}
                                        </label>
                                        <input type="date" value={invoiceDateFacture} onChange={e => setInvoiceDateFacture(e.target.value)} className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent" />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1">
                                            {tx(lang, { fr: "Date d'échéance", ar: 'تاريخ الاستحقاق', en: 'Due date', es: 'Fecha de vencimiento', pt: 'Data de vencimento', tr: 'Vade tarihi' })}
                                        </label>
                                        <input type="date" value={invoiceDateEcheance} onChange={e => setInvoiceDateEcheance(e.target.value)} className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent" />
                                    </div>

                                    <div>
                                        <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1">
                                            {tx(lang, { fr: 'TVA (%)', ar: 'الضريبة (%)', en: 'VAT (%)', es: 'IVA (%)', pt: 'IVA (%)', tr: 'KDV (%)' })}
                                        </label>
                                        <input type="number" min={0} step="any" disabled={invoiceExo} value={invoiceTva} onChange={e => setInvoiceTva(e.target.value)} className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent disabled:opacity-40" />
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1">
                                            {tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Estado', tr: 'Durum' })}
                                        </label>
                                        <select value={invoiceStatut} onChange={e => setInvoiceStatut(e.target.value as any)} className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent">
                                            <option value="BROUILLON">{tx(lang, { fr: 'Brouillon', ar: 'مسوّدة', en: 'Draft', es: 'Borrador', pt: 'Rascunho', tr: 'Taslak' })}</option>
                                            <option value="ENVOYEE">{tx(lang, { fr: 'Envoyée (impayée)', ar: 'مرسلة (غير مؤدّاة)', en: 'Sent (unpaid)', es: 'Enviada (impagada)', pt: 'Enviada (não paga)', tr: 'Gönderildi (ödenmedi)' })}</option>
                                            <option value="PAYEE">{tx(lang, { fr: 'Payée', ar: 'مؤدّاة', en: 'Paid', es: 'Pagada', pt: 'Paga', tr: 'Ödendi' })}</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1">
                                            {tx(lang, { fr: 'Remise', ar: 'التخفيض', en: 'Discount', es: 'Descuento', pt: 'Desconto', tr: 'İndirim' })}
                                        </label>
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="number" min={0} value={invoiceDiscount}
                                                onChange={e => setInvoiceDiscount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                                                className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                                            />
                                            <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-dk-border shrink-0">
                                                {(['PCT', 'AMOUNT'] as const).map(mode => (
                                                    <button key={mode} type="button" onClick={() => setInvoiceDiscountMode(mode)}
                                                        className={`px-2 py-2 text-[10px] font-bold transition-colors ${invoiceDiscountMode === mode ? 'bg-indigo-600 dark:bg-dk-accent text-white' : 'bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted'}`}>
                                                        {mode === 'PCT' ? '%' : currency}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1">
                                            {tx(lang, { fr: 'Acompte déjà versé', ar: 'تسبيق مؤدى', en: 'Advance already paid', es: 'Anticipo ya pagado', pt: 'Adiantamento já pago', tr: 'Ödenmiş avans' })}
                                        </label>
                                        <input
                                            type="number" min={0} value={invoiceAcompte}
                                            onChange={e => setInvoiceAcompte(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                                            className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                                        />
                                    </div>

                                    <label className="col-span-2 flex items-start gap-2 cursor-pointer">
                                        <input type="checkbox" checked={invoiceExo} onChange={e => setInvoiceExo(e.target.checked)} className="w-3.5 h-3.5 accent-indigo-600 mt-0.5" />
                                        <span className="text-[10px] font-bold text-slate-600 dark:text-dk-text-soft">
                                            {tx(lang, { fr: 'Exonéré de TVA (marché export — art. 92 CGI)', ar: 'معفى من الضريبة على القيمة المضافة (سوق التصدير — المادة 92)', en: 'VAT exempt (export market — art. 92)', es: 'Exento de IVA (mercado de exportación — art. 92)', pt: 'Isento de IVA (mercado de exportação — art. 92)', tr: 'KDV muaf (ihracat pazarı — madde 92)' })}
                                        </span>
                                    </label>
                                </div>

                                {/* Récapitulatif — brut → remise → net → TVA → TTC → acompte → reste. */}
                                <div className="border-t border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/60 p-3 space-y-1 text-[11px]">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-500 dark:text-dk-muted font-semibold">{tx(lang, { fr: 'Total HT brut', ar: 'المجموع الخام دون الضريبة', en: 'Gross total excl. tax', es: 'Total bruto sin IVA', pt: 'Total bruto sem IVA', tr: 'Brüt KDV hariç toplam' })}</span>
                                        <span className="font-bold text-slate-700 dark:text-dk-text-soft">{fmt(invoiceTotals.brut)} {currency}</span>
                                    </div>
                                    {invoiceTotals.discount > 0 && (
                                        <>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500 dark:text-dk-muted font-semibold">{tx(lang, { fr: 'Remise', ar: 'التخفيض', en: 'Discount', es: 'Descuento', pt: 'Desconto', tr: 'İndirim' })}</span>
                                                <span className="font-bold text-amber-700 dark:text-amber-400">- {fmt(invoiceTotals.discount)} {currency}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500 dark:text-dk-muted font-semibold">{tx(lang, { fr: 'Net HT', ar: 'الصافي دون الضريبة', en: 'Net excl. tax', es: 'Neto sin IVA', pt: 'Líquido sem IVA', tr: 'Net KDV hariç' })}</span>
                                                <span className="font-bold text-slate-700 dark:text-dk-text-soft">{fmt(invoiceTotals.ht)} {currency}</span>
                                            </div>
                                        </>
                                    )}
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-500 dark:text-dk-muted font-semibold">{tx(lang, { fr: 'TVA', ar: 'الضريبة', en: 'VAT', es: 'IVA', pt: 'IVA', tr: 'KDV' })} {invoiceExo ? '(0%)' : `${invoiceTva}%`}</span>
                                        <span className="font-bold text-slate-700 dark:text-dk-text-soft">{fmt(invoiceTotals.tva)} {currency}</span>
                                    </div>
                                    <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-dk-border">
                                        <span className="font-black uppercase tracking-wide text-[10px] text-slate-600 dark:text-dk-text-soft">{tx(lang, { fr: 'Total TTC', ar: 'المجموع مع الضريبة', en: 'Total incl. tax', es: 'Total con IVA', pt: 'Total com IVA', tr: 'Toplam (KDV dahil)' })}</span>
                                        <span className="font-extrabold text-indigo-600 dark:text-dk-accent text-sm">{fmt(invoiceTotals.ttc)} {currency}</span>
                                    </div>
                                    {invoiceTotals.acompte > 0 && (
                                        <>
                                            <div className="flex items-center justify-between">
                                                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{tx(lang, { fr: 'Déjà payé', ar: 'المؤدى سابقاً', en: 'Already paid', es: 'Ya pagado', pt: 'Já pago', tr: 'Ödenmiş' })}</span>
                                                <span className="font-bold text-emerald-700 dark:text-emerald-400">- {fmt(invoiceTotals.acompte)} {currency}</span>
                                            </div>
                                            <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-dk-border">
                                                <span className="font-black uppercase tracking-wide text-[10px] text-slate-600 dark:text-dk-text-soft">{tx(lang, { fr: 'Reste à payer', ar: 'الباقي للأداء', en: 'Balance due', es: 'Resto a pagar', pt: 'Restante a pagar', tr: 'Kalan borç' })}</span>
                                                <span className="font-extrabold text-indigo-600 dark:text-dk-accent text-sm">{fmt(invoiceTotals.reste)} {currency}</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <p className="text-[10px] font-semibold text-slate-500 dark:text-dk-muted">
                                {tx(lang, { fr: `${invoiceTotals.count} ligne(s) sélectionnée(s)`, ar: `${invoiceTotals.count} سطر مختار`, en: `${invoiceTotals.count} line(s) selected`, es: `${invoiceTotals.count} línea(s) seleccionada(s)`, pt: `${invoiceTotals.count} linha(s) selecionada(s)`, tr: `${invoiceTotals.count} satır seçildi` })}
                            </p>
                        </div>
                    </div>

                        <div className="shrink-0 px-5 py-3 border-t border-slate-100 dark:border-dk-border flex flex-wrap justify-end gap-2 bg-white dark:bg-dk-surface">
                            <button onClick={() => setInvoiceModal(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors">
                                {tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}
                            </button>
                            <button
                                onClick={submitInvoice}
                                disabled={invoiceSaving || invoiceTotals.count === 0}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 dark:bg-dk-accent text-white font-bold text-[11px] hover:bg-indigo-700 transition-colors disabled:opacity-40"
                            >
                                {invoiceSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
                                {tx(lang, { fr: 'Émettre la facture', ar: 'إصدار الفاتورة', en: 'Issue invoice', es: 'Emitir factura', pt: 'Emitir fatura', tr: 'Fatura kes' })}
                            </button>
                        </div>
                </SheetModal>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Kpi label={tx(lang, { fr: 'CA total', ar: 'رقم المعاملات', en: 'Total revenue', es: 'Facturación total', pt: 'Volume total', tr: 'Toplam ciro' })} value={`${fmt(kpis.ca)} ${currency}`} tone="accent" />
                <Kpi label={tx(lang, { fr: 'Pièces achetées', ar: 'القطع المشتراة', en: 'Pieces bought', es: 'Piezas compradas', pt: 'Peças compradas', tr: 'Alınan parça' })} value={kpis.pieces.toLocaleString(dateLocale)} />
                <Kpi label={tx(lang, { fr: 'Sorties', ar: 'الإخراجات', en: 'Exits', es: 'Salidas', pt: 'Saídas', tr: 'Çıkışlar' })} value={kpis.count.toLocaleString(dateLocale)} />
                <Kpi label={tx(lang, { fr: 'Panier moyen', ar: 'متوسّط السلّة', en: 'Average basket', es: 'Cesta media', pt: 'Cesto médio', tr: 'Ortalama sepet' })} value={kpis.count > 0 ? `${fmt(kpis.panier)} ${currency}` : '—'} />
            </div>
            <div className="grid grid-cols-3 gap-2">
                <Kpi label={tx(lang, { fr: 'Client depuis', ar: 'زبون منذ', en: 'Client since', es: 'Cliente desde', pt: 'Cliente desde', tr: 'Müşteri tarihi' })} value={kpis.first ? fmtDay(kpis.first, dateLocale) : '—'} />
                <Kpi label={tx(lang, { fr: 'Dernier achat', ar: 'آخر شراء', en: 'Last purchase', es: 'Última compra', pt: 'Última compra', tr: 'Son alım' })} value={kpis.last ? fmtDay(kpis.last, dateLocale) : '—'} />
                <Kpi label={tx(lang, { fr: 'Modèles achetés', ar: 'الموديلات المشتراة', en: 'Models bought', es: 'Modelos comprados', pt: 'Modelos comprados', tr: 'Alınan model' })} value={kpis.modeles.toLocaleString(dateLocale)} />
            </div>

            <Section
                title={tx(lang, { fr: 'Répartition par modèle', ar: 'التوزيع حسب الموديل', en: 'Breakdown by model', es: 'Reparto por modelo', pt: 'Repartição por modelo', tr: 'Modele göre dağılım' })}
                icon={<Layers className="w-3.5 h-3.5 text-indigo-600 dark:text-dk-accent" />}
            >
                {byModel.length === 0 ? (
                    <EmptyLine text={tx(lang, { fr: 'Aucun achat enregistré.', ar: 'ما كاين حتى شراء مسجّل.', en: 'No purchase recorded.', es: 'Ninguna compra registrada.', pt: 'Nenhuma compra registada.', tr: 'Kayıtlı alım yok.' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr>
                                    <th className={th}>{tx(lang, { fr: 'Modèle', ar: 'الموديل', en: 'Model', es: 'Modelo', pt: 'Modelo', tr: 'Model' })}</th>
                                    <th className={`${th} text-right`}>{tx(lang, { fr: 'Pièces', ar: 'القطع', en: 'Pieces', es: 'Piezas', pt: 'Peças', tr: 'Parça' })}</th>
                                    <th className={`${th} text-right`}>{tx(lang, { fr: 'PU moyen', ar: 'متوسّط ثمن الوحدة', en: 'Avg. unit price', es: 'PU medio', pt: 'PU médio', tr: 'Ort. birim fiyat' })}</th>
                                    <th className={`${th} text-right`}>CA</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                {byModel.map(m => (
                                    <tr key={m.modelId || m.nom}>
                                        <td className={td}>
                                            {models.some(x => x.id === m.modelId)
                                                ? <EntityLink label={m.nom} onClick={() => onPush({ kind: 'model', modelId: m.modelId })} />
                                                : <span className="font-semibold text-slate-700 dark:text-dk-text-soft">{m.nom}</span>}
                                        </td>
                                        <td className={`${td} text-right font-semibold`}>{m.qty.toLocaleString(dateLocale)}</td>
                                        <td className={`${td} text-right`}>{m.qty > 0 ? `${fmt(m.ca / m.qty)} ${currency}` : '—'}</td>
                                        <td className={`${td} text-right font-bold text-slate-800 dark:text-dk-text`}>{fmt(m.ca)} {currency}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            <Section
                title={tx(lang, { fr: 'Historique des achats', ar: 'سجلّ المشتريات', en: 'Purchase history', es: 'Historial de compras', pt: 'Histórico de compras', tr: 'Alım geçmişi' })}
                icon={<ShoppingBag className="w-3.5 h-3.5 text-indigo-600 dark:text-dk-accent" />}
            >
                {clientSorties.length === 0 ? (
                    <EmptyLine text={tx(lang, { fr: 'Aucune sortie à son nom.', ar: 'ما كاين حتى إخراج باسمو.', en: 'No exit under this name.', es: 'Ninguna salida a su nombre.', pt: 'Nenhuma saída em seu nome.', tr: 'Bu ada kayıtlı çıkış yok.' })} />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr>
                                    <th className={th}>{tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' })}</th>
                                    <th className={th}>{tx(lang, { fr: 'Modèle', ar: 'الموديل', en: 'Model', es: 'Modelo', pt: 'Modelo', tr: 'Model' })}</th>
                                    <th className={th}>{tx(lang, { fr: 'Couleur / Taille', ar: 'اللون / المقاس', en: 'Color / Size', es: 'Color / Talla', pt: 'Cor / Tamanho', tr: 'Renk / Beden' })}</th>
                                    <th className={`${th} text-right`}>{tx(lang, { fr: 'Qté', ar: 'الكمية', en: 'Qty', es: 'Cant.', pt: 'Qtd', tr: 'Adet' })}</th>
                                    <th className={`${th} text-right`}>PU</th>
                                    <th className={`${th} text-right`}>{tx(lang, { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' })}</th>
                                    <th className={th}>{tx(lang, { fr: 'Paiement', ar: 'الأداء', en: 'Payment', es: 'Pago', pt: 'Pagamento', tr: 'Ödeme' })}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                {clientSorties.map((s, i) => {
                                    const q = toNum(s.quantite);
                                    const pu = toNum(s.prix_unitaire);
                                    const found = models.find(m => m.id === String(s.modelId || ''));
                                    const label = found?.meta_data?.nom_modele || String(s.modele_nom || s.designation || '').trim() || '—';
                                    return (
                                        <tr key={s.id || `${i}-${s.date_sortie}`}>
                                            <td className={td}>{fmtDay(s.date_sortie, dateLocale)}</td>
                                            <td className={td}>
                                                {found
                                                    ? <EntityLink label={label} onClick={() => onPush({ kind: 'model', modelId: found.id })} />
                                                    : label}
                                            </td>
                                            <td className={td}>{[s.couleur, s.taille].filter(Boolean).join(' / ') || '—'}</td>
                                            <td className={`${td} text-right font-semibold`}>{q.toLocaleString(dateLocale)}</td>
                                            <td className={`${td} text-right`}>{pu > 0 ? `${fmt(pu)} ${currency}` : '—'}</td>
                                            <td className={`${td} text-right font-bold text-slate-800 dark:text-dk-text`}>{fmt(q * pu)} {currency}</td>
                                            <td className={td}><PaymentBadge s={s} dateLocale={dateLocale} lang={lang} /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            {record?.id && (clientFacturesLoading || clientFactures.length > 0) && (
                <Section
                    title={tx(lang, { fr: 'Factures liées', ar: 'الفواتير المرتبطة', en: 'Linked invoices', es: 'Facturas vinculadas', pt: 'Faturas ligadas', tr: 'Bağlı faturalar' })}
                    icon={<Receipt className="w-3.5 h-3.5 text-indigo-600 dark:text-dk-accent" />}
                >
                    {clientFacturesLoading ? (
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-dk-muted py-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {tx(lang, { fr: 'Chargement…', ar: 'كيتحمّل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yükleniyor…' })}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr>
                                        <th className={th}>N°</th>
                                        <th className={th}>{tx(lang, { fr: 'Date', ar: 'التاريخ', en: 'Date', es: 'Fecha', pt: 'Data', tr: 'Tarih' })}</th>
                                        <th className={`${th} text-right`}>{tx(lang, { fr: 'Montant TTC', ar: 'المبلغ مع الضريبة', en: 'Total incl. tax', es: 'Importe con IVA', pt: 'Montante com IVA', tr: 'Toplam (KDV dahil)' })}</th>
                                        <th className={th}>{tx(lang, { fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Estado', tr: 'Durum' })}</th>
                                        <th className={`${th} text-right`}></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {clientFactures.map(f => {
                                        const statutChip = f.statut === 'PAYEE'
                                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
                                            : f.statut === 'PARTIELLEMENT'
                                                ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'
                                                : f.statut === 'ANNULEE'
                                                    ? 'bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border'
                                                    : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/50';
                                        const statutLabel = f.statut === 'PAYEE'
                                            ? tx(lang, { fr: 'Payée', ar: 'مؤدّاة', en: 'Paid', es: 'Pagada', pt: 'Paga', tr: 'Ödendi' })
                                            : f.statut === 'PARTIELLEMENT'
                                                ? tx(lang, { fr: 'Partiel', ar: 'جزئي', en: 'Partial', es: 'Parcial', pt: 'Parcial', tr: 'Kısmi' })
                                                : f.statut === 'ANNULEE'
                                                    ? tx(lang, { fr: 'Annulée', ar: 'ملغاة', en: 'Cancelled', es: 'Anulada', pt: 'Anulada', tr: 'İptal' })
                                                    : tx(lang, { fr: 'Impayée', ar: 'غير مؤدّاة', en: 'Unpaid', es: 'Impagada', pt: 'Não paga', tr: 'Ödenmedi' });
                                        return (
                                            <tr key={f.id}>
                                                <td className={`${td} font-semibold text-slate-800 dark:text-dk-text`}>{f.numero}</td>
                                                <td className={td}>{fmtDay(f.date_facture, dateLocale)}</td>
                                                <td className={`${td} text-right font-bold text-slate-800 dark:text-dk-text`}>{fmt(f.total_ttc)} {currency}</td>
                                                <td className={td}>
                                                    <span className={`inline-block px-2 py-0.5 rounded border text-[9px] font-bold ${statutChip}`}>{statutLabel}</span>
                                                </td>
                                                <td className={`${td} text-right`}>
                                                    {f.statut !== 'ANNULEE' && (
                                                        <button
                                                            type="button"
                                                            disabled={cancellingFactureId === f.id}
                                                            onClick={() => setPendingCancelFacture(f)}
                                                            className="p-1 rounded-lg text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors disabled:opacity-40"
                                                            title={tx(lang, { fr: 'Annuler la facture', ar: 'إلغاء الفاتورة', en: 'Cancel invoice', es: 'Anular factura', pt: 'Anular fatura', tr: 'Faturayı iptal et' })}
                                                        >
                                                            {cancellingFactureId === f.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Section>
            )}

            {pendingCancelFacture && (
                <SheetModal
                    onClose={() => setPendingCancelFacture(null)}
                    size="sm"
                    zClass="z-[260]"
                    closeOnBackdrop
                    bodyClassName="flex-1 overflow-y-auto min-h-0 p-5 space-y-4"
                >
                        <div className="flex items-start gap-2.5">
                            <AlertTriangle className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-[13px] font-bold text-slate-800 dark:text-dk-text">
                                    {tx(lang, { fr: `Annuler la facture ${pendingCancelFacture.numero} ?`, ar: `إلغاء الفاتورة ${pendingCancelFacture.numero}؟`, en: `Cancel invoice ${pendingCancelFacture.numero}?`, es: `¿Anular la factura ${pendingCancelFacture.numero}?`, pt: `Anular a fatura ${pendingCancelFacture.numero}?`, tr: `${pendingCancelFacture.numero} faturası iptal edilsin mi?` })}
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-1">
                                    {tx(lang, { fr: 'Ses sorties redeviennent non facturées : elles pourront être reprises dans une nouvelle facture.', ar: 'الإخراجات ديالها كترجع غير مفوترة: يمكن تتفوتر من جديد.', en: 'Its exits become unbilled again: they can be picked up in a new invoice.', es: 'Sus salidas vuelven a no estar facturadas: podrán incluirse en una nueva factura.', pt: 'As suas saídas voltam a não faturadas: poderão ser retomadas numa nova fatura.', tr: 'Çıkışları yeniden faturasız hale gelir: yeni bir faturaya alınabilir.' })}
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setPendingCancelFacture(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors">
                                {tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}
                            </button>
                            <button onClick={() => cancelInvoice(pendingCancelFacture)} disabled={cancellingFactureId != null} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-[11px] hover:bg-rose-700 transition-colors disabled:opacity-40">
                                {tx(lang, { fr: 'Confirmer', ar: 'تأكيد', en: 'Confirm', es: 'Confirmar', pt: 'Confirmar', tr: 'Onayla' })}
                            </button>
                        </div>
                </SheetModal>
            )}

            {record?.notes && (
                <Section
                    title={tx(lang, { fr: 'Notes', ar: 'ملاحظات', en: 'Notes', es: 'Notas', pt: 'Notas', tr: 'Notlar' })}
                    icon={<Coins className="w-3.5 h-3.5 text-indigo-600 dark:text-dk-accent" />}
                >
                    <p className="text-[11px] text-slate-600 dark:text-dk-text-soft italic whitespace-pre-wrap">{record.notes}</p>
                </Section>
            )}
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Coque de la fiche : pile de navigation + fil d'Ariane               */
/* ------------------------------------------------------------------ */

const EntitySheet: React.FC<EntitySheetProps> = (props) => {
    const { stack, onBack, onClose, models, clients } = props;
    const { lang } = useLang();
    /* Appele AVANT le retour anticipe ci-dessous : un hook conditionnel casserait le rendu. */
    const [denseFullscreen, toggleDenseFullscreen] = useSheetFullscreen();

    const current = stack.length > 0 ? stack[stack.length - 1] : null;
    if (!current) return null;

    /** Fil d'Ariane : le chemin parcouru, pour que l'utilisateur sache d'où il
     *  vient avant même de chercher le bouton retour. */
    const crumb = (t: SheetTarget): string => {
        if (t.kind === 'model') {
            return models.find(m => m.id === t.modelId)?.meta_data?.nom_modele || '—';
        }
        if (t.clientId) {
            const c = clients.find(x => String(x.id) === String(t.clientId));
            if (c) return c.nom;
        }
        return String(t.clientNom || '').trim() || '—';
    };

    return (
        /* Fiche dense (tableaux de ventes, factures, mouvements) : le plein
           écran est utile ici, et le réglage est partagé avec le reste du module. */
        <SheetModal
            onClose={onClose}
            title={current.kind === 'model'
                ? tx(lang, { fr: 'Fiche modèle', ar: 'بطاقة الموديل', en: 'Model sheet', es: 'Ficha de modelo', pt: 'Ficha de modelo', tr: 'Model kartı' })
                : tx(lang, { fr: 'Fiche client', ar: 'بطاقة الزبون', en: 'Client sheet', es: 'Ficha de cliente', pt: 'Ficha de cliente', tr: 'Müşteri kartı' })}
            subtitle={stack.map(crumb).join(' › ')}
            icon={stack.length > 1 ? (
                <button
                    type="button"
                    onClick={onBack}
                    title={tx(lang, { fr: 'Retour', ar: 'رجوع', en: 'Back', es: 'Volver', pt: 'Voltar', tr: 'Geri' })}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-slate-600 dark:hover:text-dk-text-soft transition-colors shrink-0"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
            ) : undefined}
            size="xl"
            zClass="z-[210]"
            fullscreen={denseFullscreen}
            onToggleFullscreen={toggleDenseFullscreen}
            closeOnBackdrop={false}
            bare
        >
                <div className="flex-1 overflow-y-auto min-h-0 p-4 sm:p-6 bg-slate-50 dark:bg-dk-bg">
                    {current.kind === 'model' ? (
                        <ModelSheet
                            key={`model-${current.modelId}-${stack.length}`}
                            modelId={current.modelId}
                            models={props.models}
                            orders={props.orders}
                            clients={props.clients}
                            sorties={props.sorties}
                            stats={props.stats}
                            stockMatrix={props.stockMatrix}
                            currency={props.currency}
                            dateLocale={props.dateLocale}
                            onPush={props.onPush}
                            prixParClientEnabled={props.prixParClientEnabled}
                            canSeeCost={props.canSeeCost}
                            canSetPrice={props.canSetPrice}
                            clientTypeLabels={props.clientTypeLabels}
                            onSetModelStorePublished={props.onSetModelStorePublished}
                        />
                    ) : (
                        <ClientSheet
                            key={`client-${current.clientId || current.clientNom}-${stack.length}`}
                            clientId={current.clientId}
                            clientNom={current.clientNom}
                            autoOpenInvoice={current.autoInvoice}
                            models={props.models}
                            orders={props.orders}
                            clients={props.clients}
                            sorties={props.sorties}
                            stats={props.stats}
                            stockMatrix={props.stockMatrix}
                            currency={props.currency}
                            dateLocale={props.dateLocale}
                            onPush={props.onPush}
                            onEditClient={props.onEditClient}
                            onInvoiced={props.onInvoiced}
                            onPrintInvoice={props.onPrintInvoice}
                        />
                    )}
                </div>
        </SheetModal>
    );
};

export default EntitySheet;
