import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowLeftRight, Store, Warehouse, Plus, Pencil, Trash2, Check, X, Loader2, History,
    Undo2, AlertTriangle, Search, Info,
} from 'lucide-react';
import { tx } from '../../lib/i18n';
import type { Lang } from '../../app/constants';
import type { ModelData } from '../../types';
import { variantAxes } from '../../lib/scanner';
import { CHOIX_PRINCIPAL, type Emplacement } from '../../lib/stockEmplacements';
import SheetModal, { useSheetFullscreen } from '../shared/SheetModal';

/**
 * TRANSFERTS de stock entre emplacements (dépôts, boutiques) + gestion des
 * emplacements eux-mêmes.
 *
 * Un transfert déplace des pièces d'un lieu à un autre SANS changer le stock
 * total : le serveur écrit deux entrées par case (−q au départ, +q à
 * l'arrivée), jamais une sortie — le chiffre d'affaires ne bouge donc pas. Les
 * plafonds de la grille sont ceux du lieu de DÉPART : on ne déplace pas ce qui
 * n'y est pas (le serveur le revérifie, l'écran n'est que le confort).
 *
 * Le « Dépôt principal » n'est pas un emplacement créé par l'utilisateur : c'est
 * le stock historique, toujours présent, désigné ici par `CHOIX_PRINCIPAL`.
 */

export interface TransfertItem {
    model: ModelData;
}

interface TransfertsProps {
    onClose: () => void;
    lang: Lang;
    dateLocale: string;
    /** Modèles ET articles achetés qui ont (ou ont eu) du stock. */
    items: TransfertItem[];
    emplacements: Emplacement[];
    /** Stock d'un emplacement (null = Dépôt principal) : modelId → (couleur|taille → quantité). */
    matriceDe: (emplacementId: string | null) => Map<string, Map<string, number>>;
    /** La liste des emplacements a changé : le parent la relit. */
    onEmplacementsChanged: () => void | Promise<void>;
    /** Un transfert vient d'être écrit ou annulé : le parent relit ses mouvements. */
    onTransferred: () => void | Promise<void>;
}

interface TransfertRow {
    id: string;
    de: string | null;
    vers: string | null;
    note: string | null;
    nbPieces: number;
    createdAt: string;
    derniere: boolean;
    lignes: Array<{ modelId: string; couleur: string | null; taille: string | null; quantite: number }>;
}

type Grilles = Record<string, Record<string, number | ''>>;

const versApi = (choix: string): string | null => (choix === CHOIX_PRINCIPAL ? null : choix);

const fmtDateHeure = (iso: string, dateLocale: string): string => {
    try {
        // SQLite renvoie « YYYY-MM-DD HH:MM:SS » en UTC, sans fuseau.
        const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
        return d.toLocaleString(dateLocale, { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return iso;
    }
};

const messageErreur = async (res: Response, repli: string): Promise<string> => {
    const d = await res.json().catch(() => ({}));
    return d?.message || repli;
};

const Transferts: React.FC<TransfertsProps> = ({ onClose, lang, dateLocale, items, emplacements, matriceDe, onEmplacementsChanged, onTransferred }) => {
    const [fullscreen, toggleFullscreen] = useSheetFullscreen();
    const actifs = useMemo(() => emplacements.filter(e => e.actif), [emplacements]);

    // Sans aucun lieu, il n'y a rien à transférer : on ouvre directement sur la
    // création du premier.
    const [tab, setTab] = useState<'transferer' | 'emplacements' | 'historique'>(emplacements.length === 0 ? 'emplacements' : 'transferer');

    // ── Transférer ─────────────────────────────────────────────────────────
    const [de, setDe] = useState<string>(CHOIX_PRINCIPAL);
    const [vers, setVers] = useState<string>(() => actifs[0]?.id ?? CHOIX_PRINCIPAL);
    const [modelId, setModelId] = useState<string | null>(null);
    const [grilles, setGrilles] = useState<Grilles>({});
    const [note, setNote] = useState('');
    const [recherche, setRecherche] = useState('');
    const [confirmer, setConfirmer] = useState(false);
    const [envoi, setEnvoi] = useState(false);
    const [erreur, setErreur] = useState<string | null>(null);
    const [succes, setSucces] = useState<string | null>(null);

    // Le stock du lieu de DÉPART fixe tous les plafonds de la grille.
    const matriceDepart = useMemo(() => matriceDe(versApi(de)), [matriceDe, de]);

    // Modèles qui ont au moins une pièce à déplacer au départ.
    const modelesDispo = useMemo(() => {
        const q = recherche.trim().toLowerCase();
        return items
            .map(it => {
                let total = 0;
                matriceDepart.get(it.model.id)?.forEach(v => { if (v > 0) total += v; });
                return { it, total };
            })
            .filter(x => x.total > 0)
            .filter(x => !q
                || (x.it.model.meta_data?.nom_modele || '').toLowerCase().includes(q)
                || (x.it.model.meta_data?.reference || '').toLowerCase().includes(q));
    }, [items, matriceDepart, recherche]);

    const modeleOuvert = useMemo(() => items.find(i => i.model.id === modelId)?.model ?? null, [items, modelId]);

    const nomDe = useCallback((id: string | null): string => {
        if (!id || id === CHOIX_PRINCIPAL) return tx(lang, { fr: 'Dépôt principal', ar: 'المخزن الرئيسي', en: 'Main depot', es: 'Depósito principal', pt: 'Depósito principal', tr: 'Ana depo' });
        return emplacements.find(e => e.id === id)?.nom || id;
    }, [emplacements, lang]);

    const nomModele = useCallback((id: string): string => {
        const m = items.find(i => i.model.id === id)?.model;
        return m?.meta_data?.nom_modele || id.slice(0, 8);
    }, [items]);

    // Changer le départ change les plafonds : les quantités déjà saisies ne
    // voudraient plus rien dire, on repart d'une grille vide.
    const changerDepart = (v: string) => {
        setDe(v);
        setGrilles({});
        setModelId(null);
        setConfirmer(false);
        setErreur(null);
        setSucces(null);
        if (v === vers) setVers(v === CHOIX_PRINCIPAL ? (actifs[0]?.id ?? CHOIX_PRINCIPAL) : CHOIX_PRINCIPAL);
    };

    const lignes = useMemo(() => {
        const out: Array<{ modelId: string; couleur: string | null; taille: string | null; quantite: number }> = [];
        for (const [mid, cells] of Object.entries(grilles)) {
            for (const [k, v] of Object.entries(cells)) {
                const q = Math.floor(Number(v) || 0);
                if (q <= 0) continue;
                const i = k.indexOf('|');
                const couleur = k.slice(0, i);
                const taille = k.slice(i + 1);
                out.push({ modelId: mid, couleur: couleur || null, taille: taille || null, quantite: q });
            }
        }
        return out;
    }, [grilles]);
    const totalPieces = lignes.reduce((a, l) => a + l.quantite, 0);
    const nbModeles = new Set(lignes.map(l => l.modelId)).size;

    const modifierCase = (mid: string, cle: string, val: number | '') =>
        setGrilles(prev => ({ ...prev, [mid]: { ...(prev[mid] || {}), [cle]: val } }));

    const valider = async () => {
        if (lignes.length === 0 || envoi) return;
        setEnvoi(true);
        setErreur(null);
        setSucces(null);
        try {
            const res = await fetch('/api/subcontract/transferts', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ de: versApi(de), vers: versApi(vers), note: note.trim() || undefined, lignes }),
            });
            if (!res.ok) throw new Error(await messageErreur(res, tx(lang, { fr: 'Le transfert a échoué.', ar: 'فشل التحويل.', en: 'The transfer failed.', es: 'La transferencia falló.', pt: 'A transferência falhou.', tr: 'Transfer başarısız oldu.' })));
            setSucces(`${tx(lang, { fr: 'Transfert enregistré', ar: 'تسجّل التحويل', en: 'Transfer recorded', es: 'Transferencia registrada', pt: 'Transferência registada', tr: 'Transfer kaydedildi' })} : ${totalPieces} ${tx(lang, { fr: 'pièce(s)', ar: 'قطعة', en: 'piece(s)', es: 'pieza(s)', pt: 'peça(s)', tr: 'parça' })}`);
            setGrilles({});
            setModelId(null);
            setNote('');
            setConfirmer(false);
            await onTransferred();
            void chargerHistorique();
        } catch (e: any) {
            setErreur(e?.message || '');
            setConfirmer(false);
        } finally {
            setEnvoi(false);
        }
    };

    // ── Emplacements ───────────────────────────────────────────────────────
    const [nouveauNom, setNouveauNom] = useState('');
    const [nouveauType, setNouveauType] = useState<'DEPOT' | 'BOUTIQUE'>('BOUTIQUE');
    const [renommage, setRenommage] = useState<{ id: string; nom: string } | null>(null);
    const [travail, setTravail] = useState<string | null>(null);
    const [erreurLieu, setErreurLieu] = useState<string | null>(null);

    const appelLieu = async (cle: string, req: () => Promise<Response>, repli: string) => {
        setTravail(cle);
        setErreurLieu(null);
        try {
            const res = await req();
            if (!res.ok) throw new Error(await messageErreur(res, repli));
            await onEmplacementsChanged();
            return true;
        } catch (e: any) {
            setErreurLieu(e?.message || repli);
            return false;
        } finally {
            setTravail(null);
        }
    };

    const postLieu = (corps: Record<string, unknown>) => fetch('/api/subcontract/emplacements', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
    });

    const creerLieu = async () => {
        const nom = nouveauNom.trim();
        if (!nom) return;
        const ok = await appelLieu('new', () => postLieu({ nom, type: nouveauType }),
            tx(lang, { fr: "La création de l'emplacement a échoué.", ar: 'فشل إنشاء المكان.', en: 'Creating the location failed.', es: 'Error al crear la ubicación.', pt: 'Falha ao criar a localização.', tr: 'Konum oluşturulamadı.' }));
        if (ok) setNouveauNom('');
    };

    // ── Historique ─────────────────────────────────────────────────────────
    const [historique, setHistorique] = useState<TransfertRow[]>([]);
    const [histCharge, setHistCharge] = useState(false);
    const [annulation, setAnnulation] = useState<string | null>(null);
    const [erreurHist, setErreurHist] = useState<string | null>(null);

    const chargerHistorique = useCallback(async () => {
        setHistCharge(true);
        try {
            const res = await fetch('/api/subcontract/transferts', { credentials: 'include' });
            const data = res.ok ? await res.json() : [];
            setHistorique(Array.isArray(data) ? data : []);
        } catch {
            setHistorique([]);
        } finally {
            setHistCharge(false);
        }
    }, []);

    useEffect(() => { void chargerHistorique(); }, [chargerHistorique]);

    const annuler = async (id: string) => {
        setAnnulation(id);
        setErreurHist(null);
        try {
            const res = await fetch(`/api/subcontract/transferts/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
            if (!res.ok) throw new Error(await messageErreur(res, tx(lang, { fr: "L'annulation a échoué.", ar: 'فشل الإلغاء.', en: 'Cancellation failed.', es: 'Error al cancelar.', pt: 'Falha ao cancelar.', tr: 'İptal başarısız.' })));
            await chargerHistorique();
            await onTransferred();
        } catch (e: any) {
            setErreurHist(e?.message || '');
        } finally {
            setAnnulation(null);
        }
    };

    const champ = 'w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent';
    const etiquette = 'block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1';

    const onglets = [
        { id: 'transferer' as const, label: tx(lang, { fr: 'Transférer', ar: 'تحويل', en: 'Transfer', es: 'Transferir', pt: 'Transferir', tr: 'Transfer' }), icon: ArrowLeftRight },
        { id: 'emplacements' as const, label: tx(lang, { fr: 'Emplacements', ar: 'الأماكن', en: 'Locations', es: 'Ubicaciones', pt: 'Localizações', tr: 'Konumlar' }), icon: Store },
        { id: 'historique' as const, label: tx(lang, { fr: 'Historique', ar: 'السجل', en: 'History', es: 'Historial', pt: 'Histórico', tr: 'Geçmiş' }), icon: History },
    ];

    return (
        <SheetModal
            onClose={onClose}
            title={tx(lang, { fr: 'Transferts de stock', ar: 'تحويلات المخزون', en: 'Stock transfers', es: 'Transferencias de stock', pt: 'Transferências de stock', tr: 'Stok transferleri' })}
            subtitle={tx(lang, { fr: 'Dépôts, boutiques et mouvements entre eux', ar: 'المخازن والمحلات والتحويل بيناتهم', en: 'Depots, shops and moves between them', es: 'Depósitos, tiendas y movimientos entre ellos', pt: 'Depósitos, lojas e movimentos entre eles', tr: 'Depolar, mağazalar ve aralarındaki hareketler' })}
            icon={<ArrowLeftRight className="w-4 h-4 text-indigo-600 dark:text-dk-accent shrink-0" />}
            size="2xl"
            zClass="z-[220]"
            closeOnBackdrop
            fullscreen={fullscreen}
            onToggleFullscreen={toggleFullscreen}
            bare
        >
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-100 dark:border-dk-border shrink-0 overflow-x-auto">
                    {onglets.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => setTab(t.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 text-[11px] font-bold border-b-2 -mb-px transition-colors whitespace-nowrap ${
                                tab === t.id
                                    ? 'border-indigo-600 dark:border-dk-accent text-indigo-600 dark:text-dk-accent'
                                    : 'border-transparent text-slate-500 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text-soft'
                            }`}
                        >
                            <t.icon className="w-3.5 h-3.5" />
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ───────────────────────── TRANSFÉRER ───────────────────────── */}
                {tab === 'transferer' && (
                    emplacements.length === 0 ? (
                        <div className="flex-1 overflow-y-auto p-6 text-center space-y-3">
                            <Info className="w-6 h-6 mx-auto text-slate-300 dark:text-dk-muted" />
                            <p className="text-[12px] text-slate-500 dark:text-dk-muted">
                                {tx(lang, { fr: "Créez d'abord une boutique ou un second dépôt : sans autre emplacement que le Dépôt principal, il n'y a rien à transférer.", ar: 'صاوب أولاً محل ولا مخزن ثاني: بلا مكان آخر غير المخزن الرئيسي ما كاين والو تحوّل.', en: 'Create a shop or a second depot first: with only the main depot there is nothing to transfer.', es: 'Cree primero una tienda o un segundo depósito: con solo el depósito principal no hay nada que transferir.', pt: 'Crie primeiro uma loja ou um segundo depósito: só com o depósito principal não há nada a transferir.', tr: 'Önce bir mağaza veya ikinci depo oluşturun: yalnızca ana depo varken aktarılacak bir şey yok.' })}
                            </p>
                            <button type="button" onClick={() => setTab('emplacements')} className="px-4 py-2 rounded-xl text-[12px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-dk-accent dark:hover:bg-dk-accent/90">
                                {tx(lang, { fr: 'Créer un emplacement', ar: 'صاوب مكان', en: 'Create a location', es: 'Crear una ubicación', pt: 'Criar uma localização', tr: 'Konum oluştur' })}
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                            <div className="px-4 py-3 border-b border-slate-100 dark:border-dk-border shrink-0 space-y-2.5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <div>
                                        <label className={etiquette}>{tx(lang, { fr: 'De', ar: 'من', en: 'From', es: 'Desde', pt: 'De', tr: 'Nereden' })}</label>
                                        <select value={de} onChange={e => changerDepart(e.target.value)} className={champ}>
                                            <option value={CHOIX_PRINCIPAL}>{nomDe(null)}</option>
                                            {emplacements.map(e => (
                                                <option key={e.id} value={e.id}>{e.nom}{e.actif ? '' : ` (${tx(lang, { fr: 'désactivé', ar: 'معطّل', en: 'disabled', es: 'desactivado', pt: 'desativado', tr: 'devre dışı' })})`}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={etiquette}>{tx(lang, { fr: 'Vers', ar: 'إلى', en: 'To', es: 'Hacia', pt: 'Para', tr: 'Nereye' })}</label>
                                        <select value={vers} onChange={e => { setVers(e.target.value); setConfirmer(false); setSucces(null); }} className={champ}>
                                            {de !== CHOIX_PRINCIPAL && <option value={CHOIX_PRINCIPAL}>{nomDe(null)}</option>}
                                            {actifs.filter(e => e.id !== de).map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder={tx(lang, { fr: 'Note (facultatif)…', ar: 'ملاحظة (اختياري)…', en: 'Note (optional)…', es: 'Nota (opcional)…', pt: 'Nota (opcional)…', tr: 'Not (isteğe bağlı)…' })}
                                    className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg px-3 py-1.5 text-[11px] text-slate-700 dark:text-dk-text-soft outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {/* Choix du modèle : seuls ceux qui ont du stock AU DÉPART. */}
                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-dk-muted pointer-events-none" />
                                    <input
                                        type="text"
                                        value={recherche}
                                        onChange={e => setRecherche(e.target.value)}
                                        placeholder={tx(lang, { fr: 'Chercher un modèle à transférer…', ar: 'قلّب على موديل باش تحوّلو…', en: 'Search a model to transfer…', es: 'Buscar un modelo a transferir…', pt: 'Procurar um modelo a transferir…', tr: 'Aktarılacak model ara…' })}
                                        className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl pl-9 pr-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent"
                                    />
                                </div>
                                {modelesDispo.length === 0 ? (
                                    <p className="text-[12px] text-slate-400 dark:text-dk-muted text-center py-6">
                                        {tx(lang, { fr: 'Aucune pièce en stock à cet emplacement.', ar: 'ما كاين حتى قطعة فهاد المكان.', en: 'No piece in stock at this location.', es: 'Ninguna pieza en stock en esta ubicación.', pt: 'Nenhuma peça em stock neste local.', tr: 'Bu konumda stokta parça yok.' })}
                                    </p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {modelesDispo.map(({ it, total }) => {
                                            const saisi = Object.values(grilles[it.model.id] || {}).some(v => Number(v) > 0);
                                            const actif = modelId === it.model.id;
                                            return (
                                                <button
                                                    key={it.model.id}
                                                    type="button"
                                                    onClick={() => { setModelId(actif ? null : it.model.id); setConfirmer(false); }}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors max-w-full ${
                                                        actif
                                                            ? 'bg-slate-800 dark:bg-dk-accent text-white border-slate-800 dark:border-dk-accent'
                                                            : 'bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated'
                                                    }`}
                                                >
                                                    <span className="truncate">{it.model.meta_data?.nom_modele || it.model.id.slice(0, 8)}</span>
                                                    <span className={actif ? 'text-white/70' : 'text-slate-400 dark:text-dk-muted'}>{total}</span>
                                                    {saisi && <Check className="w-3 h-3 shrink-0 text-emerald-500" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Grille couleur × taille du modèle ouvert, plafonnée au stock du départ. */}
                                {modeleOuvert && (() => {
                                    const cellules = matriceDepart.get(modeleOuvert.id) || new Map<string, number>();
                                    const axes = variantAxes(modeleOuvert, cellules.keys());
                                    const couleurs = axes.colors.length > 0 ? axes.colors : [''];
                                    const tailles = axes.sizes.length > 0 ? axes.sizes : [''];
                                    const dispo = (c: string, t: string) => Math.max(0, cellules.get(`${c}|${t}`) || 0);
                                    const saisie = grilles[modeleOuvert.id] || {};
                                    return (
                                        <div className="border border-slate-200 dark:border-dk-border rounded-2xl overflow-hidden bg-white dark:bg-dk-surface">
                                            <div className="px-3.5 py-2 border-b border-slate-100 dark:border-dk-border flex items-center justify-between gap-2">
                                                <span className="font-bold text-slate-800 dark:text-dk-text text-[12.5px] truncate">{modeleOuvert.meta_data?.nom_modele || modeleOuvert.id.slice(0, 8)}</span>
                                                <span className="text-[10px] text-slate-400 dark:text-dk-muted shrink-0">{nomDe(de)}</span>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-[11px]">
                                                    <thead className="bg-slate-50 dark:bg-dk-bg/60 text-slate-400 dark:text-dk-muted uppercase text-[9px]">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left font-medium">{tx(lang, { fr: 'Couleur', ar: 'اللون', en: 'Color', es: 'Color', pt: 'Cor', tr: 'Renk' })}</th>
                                                            {tailles.map(t => <th key={t || '_'} className="px-2 py-2 text-center font-medium">{t || '—'}</th>)}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                                                        {couleurs.map(c => (
                                                            <tr key={c || '_'}>
                                                                <td className="px-3 py-1.5 font-bold text-slate-700 dark:text-dk-text-soft whitespace-nowrap">{c || '—'}</td>
                                                                {tailles.map(t => {
                                                                    const k = `${c}|${t}`;
                                                                    const d = dispo(c, t);
                                                                    return (
                                                                        <td key={t || '_'} className="px-1 py-1.5 text-center">
                                                                            <input
                                                                                type="number"
                                                                                min={0}
                                                                                max={d}
                                                                                disabled={d <= 0}
                                                                                placeholder={d > 0 ? String(d) : '—'}
                                                                                value={saisie[k] ?? ''}
                                                                                onChange={e => { setConfirmer(false); modifierCase(modeleOuvert.id, k, e.target.value === '' ? '' : Math.min(d, Math.max(0, parseInt(e.target.value) || 0))); }}
                                                                                title={`${tx(lang, { fr: 'Disponible', ar: 'المتوفّر', en: 'Available', es: 'Disponible', pt: 'Disponível', tr: 'Mevcut' })} : ${d}`}
                                                                                className={`w-14 text-center rounded-lg px-1 py-1 text-[11px] outline-none border ${
                                                                                    d <= 0
                                                                                        ? 'bg-slate-50 dark:bg-dk-bg/40 border-transparent text-slate-300 dark:text-dk-muted'
                                                                                        : 'bg-slate-50 dark:bg-dk-bg border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text focus:border-indigo-500 dark:focus:border-dk-accent'
                                                                                }`}
                                                                            />
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            <div className="px-4 py-2 border-t border-slate-100 dark:border-dk-border text-[10px] text-slate-500 dark:text-dk-muted">
                                                {tx(lang, { fr: 'Le gris dans chaque case indique le stock disponible au départ.', ar: 'الرقم الرمادي ف كل خانة كيبيّن المخزون المتوفّر فالمكان لي غادي تحوّل منو.', en: 'The grey number in each cell shows the stock available at the source.', es: 'El número gris de cada celda indica el stock disponible en el origen.', pt: 'O número cinzento em cada célula mostra o stock disponível na origem.', tr: 'Her hücredeki gri sayı çıkış noktasındaki mevcut stoğu gösterir.' })}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="px-4 py-3 border-t border-slate-100 dark:border-dk-border shrink-0 space-y-2">
                                {succes && <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />{succes}</p>}
                                {erreur && <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{erreur}</p>}
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="text-[11px] text-slate-500 dark:text-dk-muted">
                                        <span className="font-bold text-slate-700 dark:text-dk-text-soft">{totalPieces}</span> {tx(lang, { fr: 'pièce(s)', ar: 'قطعة', en: 'piece(s)', es: 'pieza(s)', pt: 'peça(s)', tr: 'parça' })}
                                        {' · '}
                                        <span className="font-bold text-slate-700 dark:text-dk-text-soft">{nbModeles}</span> {tx(lang, { fr: 'modèle(s)', ar: 'موديل', en: 'model(s)', es: 'modelo(s)', pt: 'modelo(s)', tr: 'model' })}
                                        {' · '}
                                        {nomDe(de)} → {nomDe(vers)}
                                    </div>
                                    {!confirmer ? (
                                        <button
                                            type="button"
                                            disabled={totalPieces === 0 || de === vers}
                                            onClick={() => { setConfirmer(true); setErreur(null); setSucces(null); }}
                                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-dk-accent dark:hover:bg-dk-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            <ArrowLeftRight className="w-3.5 h-3.5" />
                                            {tx(lang, { fr: 'Transférer', ar: 'حوّل', en: 'Transfer', es: 'Transferir', pt: 'Transferir', tr: 'Aktar' })}
                                        </button>
                                    ) : (
                                        <div className="inline-flex items-center gap-2">
                                            <span className="text-[11px] text-slate-600 dark:text-dk-text-soft font-semibold">{tx(lang, { fr: 'Confirmer ?', ar: 'تأكيد؟', en: 'Confirm?', es: '¿Confirmar?', pt: 'Confirmar?', tr: 'Onaylansın mı?' })}</span>
                                            <button type="button" onClick={() => setConfirmer(false)} className="px-3 py-2 rounded-xl text-[11px] font-bold text-slate-500 dark:text-dk-muted border border-slate-200 dark:border-dk-border">
                                                {tx(lang, { fr: 'Non', ar: 'لا', en: 'No', es: 'No', pt: 'Não', tr: 'Hayır' })}
                                            </button>
                                            <button type="button" disabled={envoi} onClick={valider} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
                                                {envoi && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                {tx(lang, { fr: 'Oui, transférer', ar: 'إيه، حوّل', en: 'Yes, transfer', es: 'Sí, transferir', pt: 'Sim, transferir', tr: 'Evet, aktar' })}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                )}

                {/* ──────────────────────── EMPLACEMENTS ──────────────────────── */}
                {tab === 'emplacements' && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        <p className="text-[11px] text-slate-500 dark:text-dk-muted leading-snug">
                            {tx(lang, { fr: "Le Dépôt principal est toujours là : c'est votre stock actuel. Ajoutez ici une boutique ou un second dépôt pour y répartir des pièces.", ar: 'المخزن الرئيسي ديما كاين: هو السطوك الحالي ديالك. زيد هنا محل ولا مخزن ثاني باش توزّع فيه القطع.', en: 'The main depot is always there: it is your current stock. Add a shop or a second depot here to spread pieces across.', es: 'El depósito principal siempre existe: es su stock actual. Añada aquí una tienda o un segundo depósito para repartir piezas.', pt: 'O depósito principal está sempre lá: é o seu stock atual. Adicione aqui uma loja ou um segundo depósito para repartir peças.', tr: 'Ana depo her zaman vardır: mevcut stoğunuzdur. Parçaları dağıtmak için buraya bir mağaza veya ikinci depo ekleyin.' })}
                        </p>

                        <div className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl p-3 space-y-2">
                            <span className={etiquette}>{tx(lang, { fr: 'Nouvel emplacement', ar: 'مكان جديد', en: 'New location', es: 'Nueva ubicación', pt: 'Nova localização', tr: 'Yeni konum' })}</span>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                    type="text"
                                    value={nouveauNom}
                                    onChange={e => setNouveauNom(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void creerLieu(); } }}
                                    placeholder={tx(lang, { fr: 'Nom (ex. Boutique Casa Centre)', ar: 'السمية (مثلاً: محل كازا سنتر)', en: 'Name (e.g. Downtown shop)', es: 'Nombre (p. ej. Tienda Centro)', pt: 'Nome (ex. Loja Centro)', tr: 'Ad (ör. Merkez mağaza)' })}
                                    className={champ}
                                />
                                <select value={nouveauType} onChange={e => setNouveauType(e.target.value as 'DEPOT' | 'BOUTIQUE')} className={`${champ} sm:w-40 shrink-0`}>
                                    <option value="BOUTIQUE">{tx(lang, { fr: 'Boutique', ar: 'محل', en: 'Shop', es: 'Tienda', pt: 'Loja', tr: 'Mağaza' })}</option>
                                    <option value="DEPOT">{tx(lang, { fr: 'Dépôt', ar: 'مخزن', en: 'Depot', es: 'Depósito', pt: 'Depósito', tr: 'Depo' })}</option>
                                </select>
                                <button
                                    type="button"
                                    disabled={!nouveauNom.trim() || travail === 'new'}
                                    onClick={() => void creerLieu()}
                                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-dk-accent dark:hover:bg-dk-accent/90 disabled:opacity-40 shrink-0"
                                >
                                    {travail === 'new' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                    {tx(lang, { fr: 'Ajouter', ar: 'زيد', en: 'Add', es: 'Añadir', pt: 'Adicionar', tr: 'Ekle' })}
                                </button>
                            </div>
                        </div>

                        {erreurLieu && <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{erreurLieu}</p>}

                        <div className="space-y-1.5">
                            <div className="bg-slate-50 dark:bg-dk-bg/60 border border-slate-200 dark:border-dk-border rounded-xl px-3.5 py-2.5 flex items-center gap-2.5">
                                <Warehouse className="w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0" />
                                <span className="font-bold text-slate-700 dark:text-dk-text-soft text-[12.5px]">{nomDe(null)}</span>
                                <span className="text-[10px] text-slate-400 dark:text-dk-muted">{tx(lang, { fr: 'stock historique', ar: 'السطوك القديم', en: 'historical stock', es: 'stock histórico', pt: 'stock histórico', tr: 'mevcut stok' })}</span>
                            </div>
                            {emplacements.map(e => {
                                const enRenommage = renommage?.id === e.id;
                                return (
                                    <div key={e.id} className={`bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-3.5 py-2.5 space-y-2 ${e.actif ? '' : 'opacity-70'}`}>
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            {e.type === 'DEPOT'
                                                ? <Warehouse className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                                                : <Store className="w-4 h-4 text-indigo-600 dark:text-dk-accent shrink-0" />}
                                            {enRenommage ? (
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    value={renommage.nom}
                                                    onChange={ev => setRenommage({ id: e.id, nom: ev.target.value })}
                                                    onKeyDown={async ev => {
                                                        if (ev.key === 'Escape') setRenommage(null);
                                                        if (ev.key === 'Enter') {
                                                            ev.preventDefault();
                                                            const ok = await appelLieu(e.id, () => postLieu({ id: e.id, nom: renommage.nom }), tx(lang, { fr: 'Le renommage a échoué.', ar: 'فشل تغيير السمية.', en: 'Renaming failed.', es: 'Error al renombrar.', pt: 'Falha ao renomear.', tr: 'Yeniden adlandırma başarısız.' }));
                                                            if (ok) setRenommage(null);
                                                        }
                                                    }}
                                                    className={`${champ} py-1`}
                                                />
                                            ) : (
                                                <span className="font-bold text-slate-800 dark:text-dk-text text-[12.5px] truncate">{e.nom}</span>
                                            )}
                                            {!e.actif && <span className="shrink-0 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted">{tx(lang, { fr: 'désactivé', ar: 'معطّل', en: 'disabled', es: 'desactivado', pt: 'desativado', tr: 'devre dışı' })}</span>}
                                            <span className="ml-auto shrink-0 text-[10px] text-slate-400 dark:text-dk-muted">{e.pieces ?? 0} {tx(lang, { fr: 'pièce(s)', ar: 'قطعة', en: 'piece(s)', es: 'pieza(s)', pt: 'peça(s)', tr: 'parça' })}</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {enRenommage ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        disabled={travail === e.id || !renommage.nom.trim()}
                                                        onClick={async () => {
                                                            const ok = await appelLieu(e.id, () => postLieu({ id: e.id, nom: renommage.nom }), tx(lang, { fr: 'Le renommage a échoué.', ar: 'فشل تغيير السمية.', en: 'Renaming failed.', es: 'Error al renombrar.', pt: 'Falha ao renomear.', tr: 'Yeniden adlandırma başarısız.' }));
                                                            if (ok) setRenommage(null);
                                                        }}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                                                    >
                                                        <Check className="w-3 h-3" />{tx(lang, { fr: 'Enregistrer', ar: 'سجّل', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}
                                                    </button>
                                                    <button type="button" onClick={() => setRenommage(null)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 dark:text-dk-muted border border-slate-200 dark:border-dk-border">
                                                        <X className="w-3 h-3" />{tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}
                                                    </button>
                                                </>
                                            ) : (
                                                <button type="button" onClick={() => { setRenommage({ id: e.id, nom: e.nom }); setErreurLieu(null); }} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-600 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated">
                                                    <Pencil className="w-3 h-3" />{tx(lang, { fr: 'Renommer', ar: 'بدّل السمية', en: 'Rename', es: 'Renombrar', pt: 'Renomear', tr: 'Yeniden adlandır' })}
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                disabled={travail === e.id}
                                                onClick={() => void appelLieu(e.id, () => postLieu({ id: e.id, actif: !e.actif }), tx(lang, { fr: 'Le changement a échoué.', ar: 'فشل التغيير.', en: 'The change failed.', es: 'El cambio falló.', pt: 'A alteração falhou.', tr: 'Değişiklik başarısız.' }))}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-600 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-elevated disabled:opacity-50"
                                            >
                                                {travail === e.id && <Loader2 className="w-3 h-3 animate-spin" />}
                                                {e.actif
                                                    ? tx(lang, { fr: 'Désactiver', ar: 'عطّل', en: 'Disable', es: 'Desactivar', pt: 'Desativar', tr: 'Devre dışı bırak' })
                                                    : tx(lang, { fr: 'Réactiver', ar: 'فعّل', en: 'Enable', es: 'Reactivar', pt: 'Reativar', tr: 'Etkinleştir' })}
                                            </button>
                                            {/* Suppression : seulement un lieu SANS mouvement (créé par erreur).
                                                Dès qu'il a une histoire, on ne fait que le désactiver. */}
                                            {(e.nbMouvements ?? 0) === 0 && (
                                                <button
                                                    type="button"
                                                    disabled={travail === e.id}
                                                    onClick={() => void appelLieu(e.id, () => fetch(`/api/subcontract/emplacements/${encodeURIComponent(e.id)}`, { method: 'DELETE', credentials: 'include' }), tx(lang, { fr: 'La suppression a échoué.', ar: 'فشل الحذف.', en: 'Deletion failed.', es: 'Error al eliminar.', pt: 'Falha ao eliminar.', tr: 'Silme başarısız.' }))}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
                                                >
                                                    <Trash2 className="w-3 h-3" />{tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Eliminar', tr: 'Sil' })}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ───────────────────────── HISTORIQUE ───────────────────────── */}
                {tab === 'historique' && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {histCharge && (
                            <div className="flex items-center justify-center py-10 text-slate-400 dark:text-dk-muted"><Loader2 className="w-5 h-5 animate-spin" /></div>
                        )}
                        {!histCharge && historique.length === 0 && (
                            <p className="text-[12px] text-slate-400 dark:text-dk-muted text-center py-10">
                                {tx(lang, { fr: 'Aucun transfert enregistré.', ar: 'ما كاين حتى تحويل مسجّل.', en: 'No transfer recorded.', es: 'Ninguna transferencia registrada.', pt: 'Nenhuma transferência registada.', tr: 'Kayıtlı transfer yok.' })}
                            </p>
                        )}
                        {erreurHist && <p className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{erreurHist}</p>}
                        {historique.map(h => (
                            <div key={h.id} className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 space-y-2">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <span className="block font-bold text-slate-800 dark:text-dk-text text-[12.5px]">{nomDe(h.de)} → {nomDe(h.vers)}</span>
                                        <span className="block text-[10px] text-slate-400 dark:text-dk-muted mt-0.5">
                                            {fmtDateHeure(h.createdAt, dateLocale)}{h.note ? ` · ${h.note}` : ''}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="font-extrabold text-[13px] text-slate-700 dark:text-dk-text-soft">{h.nbPieces} {tx(lang, { fr: 'pièce(s)', ar: 'قطعة', en: 'piece(s)', es: 'pieza(s)', pt: 'peça(s)', tr: 'parça' })}</span>
                                        {h.derniere && (
                                            <button
                                                type="button"
                                                disabled={annulation === h.id}
                                                onClick={() => void annuler(h.id)}
                                                title={tx(lang, { fr: 'Annuler ce dernier transfert (les pièces repartent au lieu de départ)', ar: 'إلغاء آخر تحويل (القطع كترجع للمكان لي خرجات منو)', en: 'Cancel this last transfer (pieces go back to the source)', es: 'Anular este último traspaso (las piezas vuelven al origen)', pt: 'Anular esta última transferência (as peças voltam à origem)', tr: 'Bu son transferi iptal et (parçalar çıkış noktasına döner)' })}
                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
                                            >
                                                {annulation === h.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                                                {tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Anular', pt: 'Anular', tr: 'İptal' })}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {h.lignes.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {h.lignes.map((l, i) => (
                                            <span key={i} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-50 dark:bg-dk-bg/60 border border-slate-100 dark:border-dk-border text-slate-600 dark:text-dk-text-soft">
                                                {nomModele(l.modelId)}{l.couleur || l.taille ? ` · ${l.couleur || '—'} / ${l.taille || '—'}` : ''} × {l.quantite}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </SheetModal>
    );
};

export default Transferts;
