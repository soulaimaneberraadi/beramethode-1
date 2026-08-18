import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ModelData, SubcontractOrder } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { fmt } from '../../app/constants';
import {
    X, ArrowLeft, Package, Users, Layers, Edit2, ShoppingBag,
    Truck, Coins, AlertTriangle, Tag, TrendingUp, Plus, Trash2, Loader2, Save,
} from 'lucide-react';
import type { AtelierClient } from './ClientsPanel';

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
    | { kind: 'client'; clientId?: string | null; clientNom?: string | null };

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
}

const TYPE_KEYS = ['GROS', 'DETAIL', 'BOUTIQUE'];

/** Clé de PORTÉE d'un tarif : client précis, segment, ou catalogue. Deux tarifs
 *  de même portée et de même palier se disputent la même vente — le serveur les
 *  départage silencieusement (le plus récent gagne), donc l'écran doit les
 *  montrer, faute de quoi l'utilisateur ne comprendra jamais pourquoi « son »
 *  prix n'est pas celui qui sort. */
const scopeKey = (t: Tarif) =>
    t.client_id ? `c:${t.client_id}` : t.type_client ? `t:${t.type_client}` : 'catalogue';

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
        { id?: string; portee: 'CATALOGUE' | 'TYPE' | 'CLIENT'; client_id: string; type_client: string; qty_min: string; prix: string }
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
                                        <th className={`${th} text-right`}>{tx(lang, { fr: 'Palier', ar: 'العتبة', en: 'Tier', es: 'Tramo', pt: 'Escalao', tr: 'Kademe' })}</th>
                                        <th className={`${th} text-right`}>{tx(lang, { fr: 'Prix', ar: 'الثمن', en: 'Price', es: 'Precio', pt: 'Preco', tr: 'Fiyat' })}</th>
                                        {canSetPrice && <th className={`${th} text-right`}>{tx(lang, { fr: 'Actions', ar: 'إجراءات', en: 'Actions', es: 'Acciones', pt: 'Acoes', tr: 'Islemler' })}</th>}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {tarifs.map(t => {
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
                            onClick={() => setDraft({ portee: 'CATALOGUE', client_id: '', type_client: 'GROS', qty_min: '0', prix: '' })}
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
                    <EmptyLine text={tx(lang, { fr: 'Aucune pièce disponible.', ar: 'ما كاينة حتى قطعة متوفّرة.', en: 'No piece available.', es: 'Ninguna pieza disponible.', pt: 'Nenhuma peça disponível.', tr: 'Mevcut parça yok.' })} />
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
}

const ClientSheet: React.FC<ClientSheetProps> = ({
    clientId, clientNom, clients, models, sorties, currency, dateLocale, onPush, onEditClient,
}) => {
    const { lang } = useLang();

    /** Le registre `st_clients` fait foi quand il connaît ce client ; sinon la
     *  fiche reste ouvrable à partir du seul nom porté par les sorties. */
    const record = useMemo(() => {
        if (clientId) return clients.find(c => String(c.id) === String(clientId)) || null;
        const n = norm(clientNom);
        return clients.find(c => norm(c.nom) === n) || null;
    }, [clients, clientId, clientNom]);

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

    const kpis = useMemo(() => {
        let ca = 0, pieces = 0, last = '';
        clientSorties.forEach(s => {
            const q = toNum(s.quantite);
            pieces += q;
            ca += q * toNum(s.prix_unitaire);
            const d = String(s.date_sortie || '');
            if (d > last) last = d;
        });
        return { ca, pieces, count: clientSorties.length, last, panier: clientSorties.length > 0 ? ca / clientSorties.length : 0 };
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
                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-dk-accent/20 border border-indigo-100 dark:border-dk-border flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-indigo-600 dark:text-dk-accent" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-slate-900 dark:text-dk-text text-base truncate">{displayName}</h3>
                    {record ? (
                        <span className={`inline-block mt-1 px-2 py-0.5 rounded border text-[9px] font-bold ${typeChip}`}>{typeLabel}</span>
                    ) : (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded border text-[9px] font-bold bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border">
                            {tx(lang, { fr: 'Hors registre', ar: 'خارج السجلّ', en: 'Not in registry', es: 'Fuera del registro', pt: 'Fora do registo', tr: 'Kayıt dışı' })}
                        </span>
                    )}
                    <div className="mt-1.5 text-[10px] text-slate-500 dark:text-dk-muted space-y-0.5">
                        <p>{[record?.ice && `ICE : ${record.ice}`, record?.rc && `RC : ${record.rc}`].filter(Boolean).join(' · ') || '—'}</p>
                        <p>{[record?.tel, record?.email, record?.ville].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                </div>
                {record && onEditClient && (
                    <button
                        type="button"
                        onClick={() => onEditClient(record)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors shrink-0"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                        {tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' })}
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Kpi label={tx(lang, { fr: 'CA total', ar: 'رقم المعاملات', en: 'Total revenue', es: 'Facturación total', pt: 'Volume total', tr: 'Toplam ciro' })} value={`${fmt(kpis.ca)} ${currency}`} tone="accent" />
                <Kpi label={tx(lang, { fr: 'Pièces achetées', ar: 'القطع المشتراة', en: 'Pieces bought', es: 'Piezas compradas', pt: 'Peças compradas', tr: 'Alınan parça' })} value={kpis.pieces.toLocaleString(dateLocale)} />
                <Kpi label={tx(lang, { fr: 'Sorties', ar: 'الإخراجات', en: 'Exits', es: 'Salidas', pt: 'Saídas', tr: 'Çıkışlar' })} value={kpis.count.toLocaleString(dateLocale)} />
                <Kpi label={tx(lang, { fr: 'Dernier achat', ar: 'آخر شراء', en: 'Last purchase', es: 'Última compra', pt: 'Última compra', tr: 'Son alım' })} value={kpis.last ? fmtDay(kpis.last, dateLocale) : '—'} />
                <Kpi label={tx(lang, { fr: 'Panier moyen', ar: 'متوسّط السلّة', en: 'Average basket', es: 'Cesta media', pt: 'Cesto médio', tr: 'Ortalama sepet' })} value={kpis.count > 0 ? `${fmt(kpis.panier)} ${currency}` : '—'} />
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
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

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
        <div className="fixed inset-0 bg-slate-950/20 dark:bg-dk-bg/40 backdrop-blur-[2px] flex items-center justify-center z-[210] p-0 sm:p-4 overflow-y-auto">
            <div className="relative my-auto bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-none sm:rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-none sm:max-w-3xl overflow-hidden flex flex-col h-[100dvh] sm:h-auto max-h-none sm:max-h-[88vh] text-slate-700 dark:text-dk-text">
                <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface">
                    {stack.length > 1 && (
                        <button
                            type="button"
                            onClick={onBack}
                            title={tx(lang, { fr: 'Retour', ar: 'رجوع', en: 'Back', es: 'Volver', pt: 'Voltar', tr: 'Geri' })}
                            className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-slate-600 dark:hover:text-dk-text-soft transition-colors shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="min-w-0 flex-1">
                        <span className="block text-[9px] uppercase tracking-wide font-bold text-slate-400 dark:text-dk-muted">
                            {current.kind === 'model'
                                ? tx(lang, { fr: 'Fiche modèle', ar: 'بطاقة الموديل', en: 'Model sheet', es: 'Ficha de modelo', pt: 'Ficha de modelo', tr: 'Model kartı' })
                                : tx(lang, { fr: 'Fiche client', ar: 'بطاقة الزبون', en: 'Client sheet', es: 'Ficha de cliente', pt: 'Ficha de cliente', tr: 'Müşteri kartı' })}
                        </span>
                        <span className="block text-[11px] font-semibold text-slate-600 dark:text-dk-text-soft truncate">
                            {stack.map(crumb).join(' › ')}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        title={tx(lang, { fr: 'Fermer', ar: 'إغلاق', en: 'Close', es: 'Cerrar', pt: 'Fechar', tr: 'Kapat' })}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
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
                        />
                    ) : (
                        <ClientSheet
                            key={`client-${current.clientId || current.clientNom}-${stack.length}`}
                            clientId={current.clientId}
                            clientNom={current.clientNom}
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
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default EntitySheet;
