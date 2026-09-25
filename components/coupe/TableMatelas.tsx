/**
 * Lignes de matelas d'une matiere, comme la feuille de l'atelier :
 * un matelas = un numero d'ordre (« 77 »), un placement, une couleur, des plis.
 *
 * Les pieces par taille se deduisent (plis × melange du placement) ; en bas,
 * comme dans Excel, le total de chaque colonne face a la commande, et l'ecart.
 * A cote de chaque matelas, son trace numerote : le voir, le telecharger,
 * l'envoyer au traceur, ou le glisser a la souris dans Optitex.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Download, Send, GripVertical, ChevronDown, AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import type { MatelasFichier, MatelasLine, PlacementCoupe, TissuCoupe } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { AMORCE_PAR_PLI_M } from '../../lib/coupeAtelier';
import { nomFichierMatelas } from '../../lib/ordreCoupe';
import { REGLAGES_NUMERO_DEFAUT, analyserFichier, numeroterPlt } from '../../lib/numerotationPlt';
import { grilleClavier } from './grilleClavier';

interface Props {
    lignes: MatelasLine[];
    placements: PlacementCoupe[];
    tissu: TissuCoupe;
    tailles: string[];
    couleurs: string[];
    /** Commande d'une couleur, par taille. */
    commande: (couleur: string) => Record<string, number>;
    pastille: (couleur: string) => { hex: string | null; dotClass: string };
    /** Fichier complet d'un placement (octets retrouves s'il est pose par reference). */
    fichierDe: (p: PlacementCoupe) => MatelasFichier | undefined;
    onModifier: (id: string, patch: Partial<MatelasLine>) => void;
    /** Ajoute un matelas juste sous celui-ci (meme placement, meme couleur). */
    onInserer: (apresId: string) => void;
    onApercu: (ligne: MatelasLine, p: PlacementCoupe) => void;
    onMessage: (texte: string, type: 'success' | 'error' | 'info') => void;
    /** Depot chez le traceur (dossier relie ou serveur) ; absent = pas de bouton. */
    deposer?: (nom: string, octets: Uint8Array<ArrayBuffer>) => Promise<{ ok: boolean; message: string }>;
    renderEtat: (l: MatelasLine) => React.ReactNode;
    renderMatiere: (l: MatelasLine) => React.ReactNode;
    renderActions: (l: MatelasLine) => React.ReactNode;
}

function useEstTelephone() {
    const q = '(max-width: 767px)';
    const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
    useEffect(() => {
        const mq = window.matchMedia(q);
        const f = () => setV(mq.matches);
        mq.addEventListener('change', f);
        return () => mq.removeEventListener('change', f);
    }, []);
    return v;
}

/** Petite liste de choix : pas de <select> du systeme, illisible au telephone. */
function Choix({ valeur, options, onChoisir, vide }: { valeur: React.ReactNode; options: { id: string; label: React.ReactNode }[]; onChoisir: (id: string) => void; vide: string }) {
    const [ouvert, setOuvert] = useState(false);
    return (
        <div className="relative">
            <button type="button" onClick={() => setOuvert(o => !o)} className="w-full h-8 px-2 flex items-center gap-1 rounded border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg text-[11px] font-semibold text-slate-700 dark:text-dk-text hover:border-slate-300">
                <span className="flex-1 min-w-0 truncate text-left">{valeur || <span className="text-slate-400">{vide}</span>}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>
            {ouvert && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setOuvert(false)} />
                    <div className="absolute z-40 top-full left-0 mt-1 min-w-full w-48 max-h-60 overflow-y-auto bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg shadow-xl py-1">
                        {options.length === 0 && <p className="px-3 py-2 text-[11px] text-slate-400">{vide}</p>}
                        {options.map(o => (
                            <button key={o.id} type="button" onClick={() => { onChoisir(o.id); setOuvert(false); }} className="w-full h-9 px-3 flex items-center gap-2 text-left text-[12px] font-semibold text-slate-700 dark:text-dk-text hover:bg-slate-50 dark:hover:bg-dk-elevated">
                                {o.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default function TableMatelas({
    lignes, placements, tissu, tailles, couleurs, commande, pastille, fichierDe,
    onModifier, onInserer, onApercu, onMessage, deposer, renderEtat, renderMatiere, renderActions,
}: Props) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    const [envoi, setEnvoi] = useState<string | null>(null);
    const telephone = useEstTelephone();

    /* Un numero en double ecrirait le meme numero sur deux paquets differents. */
    const doublons = useMemo(() => {
        const vus = new Map<string, number>();
        lignes.forEach(l => { const n = (l.numero || '').trim(); if (n) vus.set(n, (vus.get(n) || 0) + 1); });
        return new Set([...vus].filter(([, c]) => c > 1).map(([n]) => n));
    }, [lignes]);
    const urls = useRef<string[]>([]);

    const placementDe = (l: MatelasLine) => placements.find(p => p.id === l.placementId);
    const piecesTaille = (l: MatelasLine, t: string) => (l.plis || 0) * (Number(l.ratios?.[t]) || 0);
    const piecesLigne = (l: MatelasLine) => tailles.reduce((s, t) => s + piecesTaille(l, t), 0);
    const consoTheorique = (l: MatelasLine) => (piecesLigne(l) > 0 ? (l.plis || 0) * ((l.longTracee || 0) + AMORCE_PAR_PLI_M) : 0);
    /** Mesure au rouleau si elle a ete notee, sinon le calcul. */
    const consoLigne = (l: MatelasLine) => (l.metresReels && l.metresReels > 0 ? l.metresReels : consoTheorique(l));
    const celluleConso = (l: MatelasLine) => {
        const t = consoTheorique(l);
        if (!(l.metresReels && l.metresReels > 0)) return <span>{t.toFixed(2)}</span>;
        const e = l.metresReels - t;
        return (
            <span title={`${L('Mesure', 'مقيس', 'Measured')} ${l.metresReels.toFixed(2)} m · ${L('calcule', 'محسوب', 'computed')} ${t.toFixed(2)} m`}>
                <b>{l.metresReels.toFixed(2)}</b>
                <span className={`block text-[9px] font-bold ${Math.abs(e) < 0.01 ? 'text-emerald-600' : e > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{e > 0 ? '+' : ''}{e.toFixed(2)}</span>
            </span>
        );
    };

    /* Totaux « comme Excel » et ecart a la commande, pour la matiere entiere et couleur par couleur. */
    const bilan = useMemo(() => {
        const total: Record<string, number> = {};
        const cmd: Record<string, number> = {};
        tailles.forEach(t => { total[t] = 0; cmd[t] = 0; });
        let plis = 0, pieces = 0, conso = 0;
        for (const l of lignes) {
            tailles.forEach(t => { total[t] += piecesTaille(l, t); });
            plis += l.plis || 0;
            pieces += piecesLigne(l);
            conso += consoLigne(l);
        }
        const parCouleur = couleurs.map(c => {
            const cc = commande(c);
            const ecart: Record<string, number> = {};
            tailles.forEach(t => {
                cmd[t] += Number(cc[t]) || 0;
                ecart[t] = lignes.filter(l => l.couleur === c).reduce((s, l) => s + piecesTaille(l, t), 0) - (Number(cc[t]) || 0);
            });
            return { couleur: c, ecart, exact: tailles.every(t => ecart[t] === 0) };
        }).filter(x => tailles.some(t => (Number(commande(x.couleur)[t]) || 0) > 0) || lignes.some(l => l.couleur === x.couleur));
        return { total, cmd, plis, pieces, conso, parCouleur };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lignes, tailles, couleurs, commande]);

    /* Le trace numerote d'un matelas : celui du placement + le numero de la ligne. */
    const nomSortie = (l: MatelasLine, p: PlacementCoupe) => nomFichierMatelas(p, tissu.nom, l.numero || '0');
    const generer = (l: MatelasLine): { octets: Uint8Array<ArrayBuffer>; nom: string } | null => {
        const p = placementDe(l);
        const f = p ? fichierDe(p) : undefined;
        if (!p || !f || !l.numero) return null;
        const a = analyserFichier(f);
        if (!a) return null;
        const octets = numeroterPlt(a, l.numero, p.numerotation || REGLAGES_NUMERO_DEFAUT);
        return octets ? { octets, nom: nomSortie(l, p) } : null;
    };

    const telecharger = (l: MatelasLine) => {
        const g = generer(l);
        if (!g) { onMessage(L('Rien a numeroter : placement sans trace PLT ou matelas sans numero.', 'لا شيء للترقيم: تركيبة بلا ملف PLT أو مفرشة بلا رقم.', 'Nothing to number: no PLT or no number.'), 'error'); return; }
        const url = URL.createObjectURL(new Blob([g.octets], { type: 'application/octet-stream' }));
        const a = document.createElement('a');
        a.href = url; a.download = g.nom;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    const envoyer = async (l: MatelasLine) => {
        const g = generer(l);
        if (!g) { onMessage(L('Rien a numeroter : placement sans trace PLT ou matelas sans numero.', 'لا شيء للترقيم: تركيبة بلا ملف PLT أو مفرشة بلا رقم.', 'Nothing to number.'), 'error'); return; }
        if (!deposer) return;
        setEnvoi(l.id);
        try {
            const r = await deposer(g.nom, g.octets);
            onMessage(r.ok
                ? `${L('Envoye au traceur :', 'أُرسل إلى الـ traceur:', 'Sent to plotter:')} ${r.message}`
                : `${L('Envoi impossible :', 'تعذّر الإرسال:', 'Sending failed:')} ${r.message}`, r.ok ? 'success' : 'error');
        } finally {
            setEnvoi(null);
        }
    };

    /**
     * Glisser le fichier hors du navigateur (bureau, dossier, Optitex) :
     * Chrome et Edge creent le fichier a l'endroit ou on le lache.
     */
    const glisser = (e: React.DragEvent, l: MatelasLine) => {
        const g = generer(l);
        if (!g) { e.preventDefault(); return; }
        const url = URL.createObjectURL(new Blob([g.octets], { type: 'application/octet-stream' }));
        urls.current.push(url);
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('DownloadURL', `application/octet-stream:${g.nom}:${url}`);
        e.dataTransfer.setData('text/plain', g.nom);
        setTimeout(() => { URL.revokeObjectURL(url); urls.current = urls.current.filter(u => u !== url); }, 120000);
    };

    // Colonnes saisissables : 0 numero, 1 plis.
    const cellule = grilleClavier(`matelas-${tissu.id}`, (ligne, colonne, bloc) => {
        bloc.forEach((rangee, i) => {
            const l = lignes[ligne + i];
            if (!l || l.fait) return;
            const patch: Partial<MatelasLine> = {};
            rangee.forEach((v, j) => {
                const col = colonne + j;
                if (col === 0 && v.trim()) patch.numero = v.trim();
                if (col === 1) { const n = Math.round(Number(v.replace(',', '.'))); if (Number.isFinite(n) && n >= 0) patch.plis = n; }
            });
            if (Object.keys(patch).length) onModifier(l.id, patch);
        });
        return true;
    });

    const couleurCellule = (c?: string) => {
        if (!c) return null;
        const p = pastille(c);
        return (
            <span className="inline-flex items-center gap-1.5 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.hex ? '' : p.dotClass}`} style={p.hex ? { backgroundColor: p.hex } : undefined} />
                <span className="truncate">{c}</span>
            </span>
        );
    };

    const ecartCls = (v: number) => v === 0 ? 'text-emerald-600 dark:text-emerald-400' : v < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400';
    const signe = (v: number) => (v > 0 ? `+${v}` : String(v));

    let cumul = 0;
    return (
        <div>
            {/* Ecart couleur par couleur : l'exact d'une couleur ne doit pas cacher le manque d'une autre. */}
            {bilan.parCouleur.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {bilan.parCouleur.map(x => (
                        <span key={x.couleur} className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-full text-[11px] font-semibold border ${x.exact ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300'}`}>
                            {couleurCellule(x.couleur)}
                            {x.exact
                                ? <><CheckCircle2 className="w-3 h-3" />{L('exact', 'مطابق', 'exact')}</>
                                : <><AlertTriangle className="w-3 h-3" />{tailles.filter(t => x.ecart[t] !== 0).map(t => `${t} ${signe(x.ecart[t])}`).join(' · ')}</>}
                        </span>
                    ))}
                </div>
            )}

            {doublons.size > 0 && (
                <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-[12px] font-semibold text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {L('Numeros en double :', 'أرقام مكرّرة:', 'Duplicate numbers:')} {[...doublons].join(', ')} — {L('deux paquets porteraient le meme numero.', 'حزمتان ستحملان نفس الرقم.', 'two bundles would carry the same number.')}
                </div>
            )}

            {telephone ? (
                <div className="space-y-2">
                    {lignes.length === 0 && (
                        <p className="py-6 text-center text-[12px] text-slate-400">{L('Aucun matelas.', 'لا توجد مفرشات.', 'No lay yet.')}</p>
                    )}
                    {lignes.map((l, i) => {
                        const p = placementDe(l);
                        const bloque = !!l.fait;
                        const pret = !!p && !!p.fichier && !!l.numero;
                        return (
                            <div key={l.id} className={`rounded-xl border p-3 ${l.fait ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-900/10 dark:border-emerald-800' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface'}`}>
                                <div className="flex items-start gap-3">
                                    <div className="shrink-0 pt-1">{renderEtat(l)}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <input
                                                value={l.numero ?? ''}
                                                disabled={bloque}
                                                onChange={e => onModifier(l.id, { numero: e.target.value.trim() })}
                                                placeholder={String(i + 1)}
                                                inputMode="numeric"
                                                className={`w-16 h-10 text-center rounded-lg border text-[18px] font-bold outline-none focus:border-indigo-400 disabled:bg-transparent disabled:border-transparent ${doublons.has((l.numero || '').trim()) ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-200 dark:border-dk-border'}`}
                                            />
                                            <div className="flex-1 min-w-0 grid grid-cols-2 gap-1.5">
                                                {bloque ? (
                                                    <span className="text-[12px] font-bold uppercase text-indigo-700 dark:text-indigo-300 truncate">{p?.nom || '—'}</span>
                                                ) : (
                                                    <Choix
                                                        valeur={p ? <span className="font-bold uppercase text-indigo-700 dark:text-indigo-300">{p.nom}</span> : null}
                                                        vide={L('Placement', 'التركيبة', 'Placement')}
                                                        options={placements.map(x => ({ id: x.id, label: <span className="font-bold uppercase text-indigo-700 dark:text-indigo-300">{x.nom}</span> }))}
                                                        onChoisir={id => { const x = placements.find(pp => pp.id === id); if (x) onModifier(l.id, { placementId: x.id, ratios: { ...x.ratios }, longTracee: x.longueurM || 0 }); }}
                                                    />
                                                )}
                                                {bloque ? <span className="text-[12px] font-semibold truncate">{couleurCellule(l.couleur)}</span> : (
                                                    <Choix valeur={couleurCellule(l.couleur)} vide={L('Couleur', 'اللون', 'Colour')} options={couleurs.map(c => ({ id: c, label: couleurCellule(c) }))} onChoisir={c => onModifier(l.id, { couleur: c })} />
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <label className="flex items-center gap-1.5">
                                                <span className="text-[10px] font-bold uppercase text-slate-400">{L('Plis', 'طيّات', 'Plies')}</span>
                                                <input
                                                    type="number"
                                                    inputMode="numeric"
                                                    min="0"
                                                    value={l.plis || ''}
                                                    disabled={bloque}
                                                    onChange={e => onModifier(l.id, { plis: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                                                    className="w-20 h-10 text-center rounded-lg border border-slate-200 dark:border-dk-border text-[15px] font-bold outline-none focus:border-indigo-400 disabled:bg-transparent disabled:border-transparent"
                                                />
                                            </label>
                                            <div className="flex-1 flex flex-wrap gap-1 justify-end">
                                                {tailles.filter(t => piecesTaille(l, t) > 0).map(t => (
                                                    <span key={t} className="px-1.5 h-6 inline-flex items-center rounded bg-emerald-50 dark:bg-emerald-900/25 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">{t} {piecesTaille(l, t)}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-dk-muted">
                                            <span><b className="text-slate-800 dark:text-dk-text">{piecesLigne(l)}</b> pcs · {consoLigne(l).toFixed(2)} m</span>
                                            <div className="flex items-center gap-0.5">
                                                {pret && <button type="button" onClick={() => onApercu(l, p!)} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"><Eye className="w-4 h-4" /></button>}
                                                {pret && <button type="button" onClick={() => telecharger(l)} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Download className="w-4 h-4" /></button>}
                                                {pret && deposer && <button type="button" disabled={envoi === l.id} onClick={() => envoyer(l)} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40"><Send className="w-4 h-4" /></button>}
                                                <button type="button" onClick={() => onInserer(l.id)} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><Plus className="w-4 h-4" /></button>
                                                {renderActions(l)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {lignes.length > 0 && (
                        <div className="rounded-xl border-2 border-slate-300 dark:border-dk-border p-3 text-[12px]">
                            <p className="font-bold text-slate-700 dark:text-dk-text-soft">{L('Total', 'المجموع', 'Total')} · {lignes.length} {L('matelas', 'مفرشة', 'lays')} · {bilan.plis} {L('plis', 'طيّة', 'plies')} · {bilan.conso.toFixed(1)} m</p>
                            <div className="mt-2 grid grid-cols-3 gap-1.5">
                                {tailles.map(t => {
                                    const v = bilan.total[t] - bilan.cmd[t];
                                    return (
                                        <div key={t} className="rounded-lg bg-slate-50 dark:bg-dk-bg px-2 py-1.5 text-center">
                                            <p className="text-[10px] font-bold uppercase text-slate-400">{t}</p>
                                            <p className="text-[13px] font-bold tabular-nums">{bilan.total[t]}<span className="text-slate-400 font-medium">/{bilan.cmd[t]}</span></p>
                                            <p className={`text-[10px] font-bold ${ecartCls(v)}`}>{v === 0 ? '✓' : signe(v)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
            <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface min-w-[980px]">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-dk-bg text-slate-600 dark:text-dk-text-soft border-b border-slate-200 dark:border-dk-border text-[10px] uppercase tracking-wider">
                            <th className="py-2 px-1 text-center w-16" title={L('Coupe', 'مقصوص', 'Cut')}><CheckCircle2 className="w-3.5 h-3.5 mx-auto" /></th>
                            <th className="py-2 px-1 text-center w-16" title={L('Numero ecrit sur les pieces', 'الرقم الذي يُكتب على القطع', 'Number written on pieces')}>{L('N° ordre', 'رقم الأمر', 'Order no.')}</th>
                            <th className="py-2 px-1 text-center w-28">{L('Placement', 'التركيبة', 'Placement')}</th>
                            <th className="py-2 px-1 text-center w-32">{L('Couleur', 'اللون', 'Colour')}</th>
                            <th className="py-2 px-1 text-center w-32">{L('Matiere', 'المادة', 'Material')}</th>
                            <th className="py-2 px-1 text-center w-16">{L('Plis', 'طيّات', 'Plies')}</th>
                            {tailles.map(t => <th key={t} className="py-2 px-1 text-center text-emerald-700 dark:text-emerald-300 min-w-[48px]">{t}</th>)}
                            <th className="py-2 px-1 text-center w-16">{L('Total', 'المجموع', 'Total')}</th>
                            <th className="py-2 px-1 text-center w-16">{L('Cumul', 'المتراكم', 'Running')}</th>
                            <th className="py-2 px-1 text-center w-16">{L('Cons. m', 'الاستهلاك م', 'Cons. m')}</th>
                            <th className="py-2 px-2 text-left min-w-[190px]">{L('Trace numerote', 'الملف المرقَّم', 'Numbered trace')}</th>
                            <th className="py-2 px-1 w-24"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                        {lignes.length === 0 && (
                            <tr><td colSpan={tailles.length + 11} className="py-6 text-center text-[12px] text-slate-400 dark:text-dk-muted">
                                {L('Aucun matelas. « Calculer les matelas » les cree depuis vos placements et la commande.', 'لا توجد مفرشات. «حساب المفرشات» يُنشئها من التركيبات والطلب.', 'No lay yet. "Compute lays" creates them from your placements and the order.')}
                            </td></tr>
                        )}
                        {lignes.map((l, i) => {
                            const p = placementDe(l);
                            const pieces = piecesLigne(l);
                            cumul += pieces;
                            const trop = p?.maxPlis && (l.plis || 0) > p.maxPlis;
                            const pret = !!p && !!p.fichier && !!l.numero;
                            const bloque = !!l.fait;
                            return (
                                <tr key={l.id} className={`${l.fait ? 'bg-emerald-50/40 dark:bg-emerald-900/10' : 'hover:bg-slate-50/50 dark:hover:bg-dk-elevated/40'}`}>
                                    <td className="py-1 px-1 text-center align-top">{renderEtat(l)}</td>
                                    <td className="py-1 px-1">
                                        <input
                                            {...cellule(i, 0)}
                                            value={l.numero ?? ''}
                                            disabled={bloque}
                                            onChange={e => onModifier(l.id, { numero: e.target.value.trim() })}
                                            placeholder={String(i + 1)}
                                            title={doublons.has((l.numero || '').trim()) ? L('Numero en double : deux paquets porteraient le meme numero', 'رقم مكرّر: حزمتان ستحملان نفس الرقم', 'Duplicate number') : undefined}
                                            className={`w-full h-8 text-center rounded border text-[13px] font-bold outline-none focus:border-indigo-400 disabled:bg-transparent disabled:border-transparent ${doublons.has((l.numero || '').trim()) ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text'}`}
                                        />
                                    </td>
                                    <td className="py-1 px-1">
                                        {bloque ? (
                                            <span className="block text-center text-[11px] font-bold uppercase text-indigo-700 dark:text-indigo-300">{p?.nom || '—'}</span>
                                        ) : (
                                            <Choix
                                                valeur={p ? <span className="font-bold uppercase text-indigo-700 dark:text-indigo-300">{p.nom}</span> : null}
                                                vide={L('Choisir', 'اختر', 'Choose')}
                                                options={placements.map(x => ({ id: x.id, label: <span className="font-bold uppercase text-indigo-700 dark:text-indigo-300">{x.nom}</span> }))}
                                                onChoisir={id => {
                                                    const x = placements.find(pp => pp.id === id);
                                                    if (x) onModifier(l.id, { placementId: x.id, ratios: { ...x.ratios }, longTracee: x.longueurM || 0 });
                                                }}
                                            />
                                        )}
                                    </td>
                                    <td className="py-1 px-1">
                                        {bloque ? <span className="text-[11px] font-semibold">{couleurCellule(l.couleur)}</span> : (
                                            <Choix
                                                valeur={couleurCellule(l.couleur)}
                                                vide={L('Couleur', 'اللون', 'Colour')}
                                                options={couleurs.map(c => ({ id: c, label: couleurCellule(c) }))}
                                                onChoisir={c => onModifier(l.id, { couleur: c })}
                                            />
                                        )}
                                    </td>
                                    <td className="py-1 px-1">{renderMatiere(l)}</td>
                                    <td className="py-1 px-1">
                                        <input
                                            {...cellule(i, 1)}
                                            type="number"
                                            min="0"
                                            value={l.plis || ''}
                                            disabled={bloque}
                                            onChange={e => onModifier(l.id, { plis: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                                            placeholder="0"
                                            title={trop ? L(`Plus que ${p!.maxPlis} plis, le maximum de ce placement`, `أكثر من ${p!.maxPlis} طيّة، وهو الحدّ الأقصى لهذه التركيبة`, `Over ${p!.maxPlis} plies, this placement's maximum`) : undefined}
                                            className={`w-full h-8 text-center rounded border text-[12px] font-bold outline-none focus:border-indigo-400 disabled:bg-transparent disabled:border-transparent ${trop ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text'}`}
                                        />
                                    </td>
                                    {tailles.map(t => {
                                        const v = piecesTaille(l, t);
                                        return <td key={t} className={`py-1 px-1 text-center tabular-nums font-semibold ${v ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-300 dark:text-dk-muted'}`}>{v || '·'}</td>;
                                    })}
                                    <td className="py-1 px-1 text-center font-bold tabular-nums bg-slate-50 dark:bg-dk-bg/40">{pieces}</td>
                                    <td className="py-1 px-1 text-center tabular-nums text-slate-500 dark:text-dk-muted">{cumul}</td>
                                    <td className="py-1 px-1 text-center tabular-nums">{celluleConso(l)}</td>
                                    <td className="py-1 px-2">
                                        {pret ? (
                                            <div className="flex items-center gap-1 min-w-0">
                                                <span
                                                    draggable
                                                    onDragStart={e => glisser(e, l)}
                                                    className="flex-1 min-w-0 inline-flex items-center gap-1 h-8 px-1.5 rounded border border-indigo-100 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-900/20 cursor-grab active:cursor-grabbing"
                                                    title={L('Glissez ce fichier dans Optitex ou dans un dossier', 'اسحب هذا الملف إلى Optitex أو إلى مجلّد', 'Drag this file into Optitex or a folder')}
                                                >
                                                    <GripVertical className="w-3 h-3 text-indigo-400 shrink-0" />
                                                    <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 truncate">{nomSortie(l, p!)}</span>
                                                </span>
                                                <button type="button" onClick={() => onApercu(l, p!)} className="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50" title={L('Voir le numero dans les pieces', 'معاينة الرقم في القطع', 'Preview the number')}><Eye className="w-3.5 h-3.5" /></button>
                                                <button type="button" onClick={() => telecharger(l)} className="p-1.5 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title={L('Telecharger', 'تنزيل', 'Download')}><Download className="w-3.5 h-3.5" /></button>
                                                {deposer && (
                                                    <button type="button" disabled={envoi === l.id} onClick={() => envoyer(l)} className="p-1.5 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40" title={L('Envoyer au traceur', 'إرسال إلى الـ traceur', 'Send to plotter')}><Send className="w-3.5 h-3.5" /></button>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-slate-400 dark:text-dk-muted">
                                                {!p ? L('Choisir un placement', 'اختر تركيبة', 'Choose a placement') : !p.fichier ? L('Placement sans trace PLT', 'تركيبة بلا ملف PLT', 'Placement without PLT') : L('Sans numero', 'بلا رقم', 'No number')}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-1 px-1 text-center whitespace-nowrap">
                                        <button type="button" onClick={() => onInserer(l.id)} className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30" title={L('Inserer un matelas en dessous', 'إدراج مفرشة تحت هذه', 'Insert a lay below')}>
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                        {renderActions(l)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    {lignes.length > 0 && (
                        <tfoot className="text-[11px] font-bold border-t-2 border-slate-300 dark:border-dk-border">
                            <tr className="bg-slate-100 dark:bg-dk-elevated">
                                <td colSpan={5} className="py-2 px-2 text-right uppercase tracking-wide text-slate-600 dark:text-dk-text-soft">{L('Total', 'المجموع', 'Total')} · {lignes.length} {L('matelas', 'مفرشة', 'lays')}</td>
                                <td className="py-2 px-1 text-center tabular-nums">{bilan.plis}</td>
                                {tailles.map(t => <td key={t} className="py-2 px-1 text-center tabular-nums">{bilan.total[t]}</td>)}
                                <td className="py-2 px-1 text-center tabular-nums">{bilan.pieces}</td>
                                <td></td>
                                <td className="py-2 px-1 text-center tabular-nums">{bilan.conso.toFixed(2)}</td>
                                <td colSpan={2} className="py-2 px-2 text-slate-500 dark:text-dk-muted font-semibold">
                                    {tissu.recuM ? `${L('Recu', 'المستلم', 'Received')} ${tissu.recuM} m · ${L('reste', 'الباقي', 'left')} ${(tissu.recuM - bilan.conso).toFixed(2)} m` : ''}
                                </td>
                            </tr>
                            <tr className="bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted">
                                <td colSpan={6} className="py-1.5 px-2 text-right uppercase tracking-wide">{L('Commande', 'الطلب', 'Order')}</td>
                                {tailles.map(t => <td key={t} className="py-1.5 px-1 text-center tabular-nums">{bilan.cmd[t]}</td>)}
                                <td className="py-1.5 px-1 text-center tabular-nums">{tailles.reduce((s, t) => s + bilan.cmd[t], 0)}</td>
                                <td colSpan={4}></td>
                            </tr>
                            <tr className="bg-white dark:bg-dk-surface">
                                <td colSpan={6} className="py-1.5 px-2 text-right uppercase tracking-wide text-slate-600 dark:text-dk-text-soft">{L('Ecart', 'الفارق', 'Gap')}</td>
                                {tailles.map(t => { const v = bilan.total[t] - bilan.cmd[t]; return <td key={t} className={`py-1.5 px-1 text-center tabular-nums ${ecartCls(v)}`}>{v === 0 ? '✓' : signe(v)}</td>; })}
                                {(() => { const v = bilan.pieces - tailles.reduce((s, t) => s + bilan.cmd[t], 0); return <td className={`py-1.5 px-1 text-center tabular-nums ${ecartCls(v)}`}>{v === 0 ? '✓' : signe(v)}</td>; })()}
                                <td colSpan={4}></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
            )}
        </div>
    );
}
