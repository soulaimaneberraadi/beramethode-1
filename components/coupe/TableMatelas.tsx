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
import { Eye, Download, Send, GripVertical, ChevronDown, AlertTriangle, CheckCircle2, Plus, Copy, ArrowUp, ArrowDown, Trash2, X, Sigma } from 'lucide-react';
import type { MatelasFichier, MatelasLine, PlacementCoupe, ReglagesNumero, TissuCoupe } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { AMORCE_PAR_PLI_M } from '../../lib/coupeAtelier';
import { nomFichierMatelas } from '../../lib/ordreCoupe';
import { analyserFichier, numeroterPlt, reglagesAvecDefaut } from '../../lib/numerotationPlt';
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
    /** Lignes choisies : supprimer (jamais une ligne deja coupee), dupliquer, deplacer. */
    onSupprimerLignes: (ids: string[]) => void;
    onDupliquerLignes: (ids: string[]) => void;
    onDeplacerLigne: (id: string, sens: -1 | 1) => void;
    /** Reglages de numerotation de l'entreprise, pour les traces qui n'en ont pas. */
    reglagesDefaut?: ReglagesNumero;
    renderEtat: (l: MatelasLine) => React.ReactNode;
    renderMatiere: (l: MatelasLine) => React.ReactNode;
    renderActions: (l: MatelasLine) => React.ReactNode;
}

/** Colonnes collees a gauche : largeurs fixes, sinon la seconde chevauche la suite en defilant. */
const COL_ETAT = 64;
const COL_NUMERO = 64;

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
function Choix({ valeur, options, onChoisir, vide, cellule }: { valeur: React.ReactNode; options: { id: string; label: React.ReactNode }[]; onChoisir: (id: string) => void; vide: string; cellule?: boolean }) {
    const [ouvert, setOuvert] = useState(false);
    return (
        <div className="relative">
            <button type="button" onClick={() => setOuvert(o => !o)} className={cellule
                ? 'w-full h-8 px-1.5 flex items-center gap-1 rounded-md border border-transparent hover:border-slate-200 dark:hover:border-dk-border hover:bg-white dark:hover:bg-dk-surface text-[12px] font-semibold text-slate-700 dark:text-dk-text group/choix'
                : 'w-full h-8 px-2 flex items-center gap-1 rounded border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg text-[11px] font-semibold text-slate-700 dark:text-dk-text hover:border-slate-300'}>
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
    onSupprimerLignes, onDupliquerLignes, onDeplacerLigne, reglagesDefaut,
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

    /* Lignes choisies, comme dans Excel : clic = une ligne, Ctrl = ajouter, Maj = une plage. */
    const [choisies, setChoisies] = useState<Set<string>>(new Set());
    const ancre = useRef<string | null>(null);
    const [menuLigne, setMenuLigne] = useState<{ x: number; y: number } | null>(null);
    const [confirmSuppr, setConfirmSuppr] = useState(false);
    const [avecCumuls, setAvecCumuls] = useState(true);
    useEffect(() => {
        // Une ligne supprimee ou partie dans une autre matiere ne reste pas choisie.
        setChoisies(prev => { const ids = new Set(lignes.map(l => l.id)); const n = new Set([...prev].filter(id => ids.has(id))); return n.size === prev.size ? prev : n; });
    }, [lignes]);
    const choisir = (id: string, e: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }) => {
        if (e.shiftKey && ancre.current) {
            const a = lignes.findIndex(l => l.id === ancre.current);
            const b = lignes.findIndex(l => l.id === id);
            if (a >= 0 && b >= 0) { setChoisies(new Set(lignes.slice(Math.min(a, b), Math.max(a, b) + 1).map(l => l.id))); return; }
        }
        if (e.ctrlKey || e.metaKey) {
            setChoisies(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
        } else {
            setChoisies(new Set([id]));
        }
        ancre.current = id;
    };
    const idsChoisis = lignes.filter(l => choisies.has(l.id)).map(l => l.id);
    const coupeesChoisies = lignes.filter(l => choisies.has(l.id) && l.fait).length;
    const actions = {
        inserer: () => { const dernier = idsChoisis[idsChoisis.length - 1]; if (dernier) onInserer(dernier); },
        dupliquer: () => { if (idsChoisis.length) onDupliquerLignes(idsChoisis); },
        monter: () => { if (idsChoisis.length === 1) onDeplacerLigne(idsChoisis[0], -1); },
        descendre: () => { if (idsChoisis.length === 1) onDeplacerLigne(idsChoisis[0], 1); },
        supprimer: () => { if (idsChoisis.length) setConfirmSuppr(true); },
    };
    /** Raccourcis d'Excel, quand on n'est pas en train d'ecrire dans une case. */
    const clavierTableau = (e: React.KeyboardEvent) => {
        const cible = e.target as HTMLElement;
        const enSaisie = cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA';
        if (!idsChoisis.length) return;
        if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) { e.preventDefault(); actions.inserer(); }
        else if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); actions.supprimer(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); actions.dupliquer(); }
        else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); actions.monter(); }
        else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); actions.descendre(); }
        else if (!enSaisie && e.key === 'Delete') { e.preventDefault(); actions.supprimer(); }
        else if (!enSaisie && e.key === 'Escape') setChoisies(new Set());
    };

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
        const octets = numeroterPlt(a, l.numero, reglagesAvecDefaut(p.numerotation, reglagesDefaut));
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
            <div onKeyDown={clavierTableau}>
                {/* Barre des lignes choisies : les gestes d'Excel, a la souris ou au clavier. */}
                <div className="flex flex-wrap items-center gap-1.5 mb-2 min-h-9">
                    {idsChoisis.length > 0 ? (
                        <>
                            <span className="h-8 px-2.5 inline-flex items-center rounded-lg bg-indigo-600 text-white text-[11px] font-bold">
                                {idsChoisis.length} {L('ligne(s)', 'سطر', 'row(s)')}
                            </span>
                            {[
                                { f: actions.inserer, i: Plus, t: L('Inserer dessous', 'إدراج تحت', 'Insert below'), k: 'Ctrl +' },
                                { f: actions.dupliquer, i: Copy, t: L('Dupliquer', 'تكرار', 'Duplicate'), k: 'Ctrl D' },
                                { f: actions.monter, i: ArrowUp, t: L('Monter', 'إلى الأعلى', 'Up'), k: 'Alt ↑', off: idsChoisis.length !== 1 },
                                { f: actions.descendre, i: ArrowDown, t: L('Descendre', 'إلى الأسفل', 'Down'), k: 'Alt ↓', off: idsChoisis.length !== 1 },
                                { f: actions.supprimer, i: Trash2, t: L('Supprimer', 'حذف', 'Delete'), k: 'Suppr', rouge: true },
                            ].map(b => (
                                <button key={b.t} type="button" disabled={b.off} onClick={b.f} title={b.k} className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-[11px] font-semibold disabled:opacity-40 ${b.rouge ? 'border-rose-200 text-rose-600 hover:bg-rose-50' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text-soft hover:border-indigo-300'}`}>
                                    <b.i className="w-3.5 h-3.5" />{b.t}<span className="hidden xl:inline text-[9px] text-slate-400 font-medium">{b.k}</span>
                                </button>
                            ))}
                            <button type="button" onClick={() => setChoisies(new Set())} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" title="Echap"><X className="w-4 h-4" /></button>
                        </>
                    ) : (
                        <span className="text-[11px] text-slate-400">{L('Cliquez une ligne pour la choisir · Ctrl ou Maj pour en prendre plusieurs · clic droit pour les actions', 'انقر سطراً لاختياره · Ctrl أو Shift لعدّة أسطر · الزر الأيمن للعمليات', 'Click a row to select · Ctrl/Shift for several · right-click for actions')}</span>
                    )}
                    <button type="button" onClick={() => setAvecCumuls(v => !v)} className={`ml-auto h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-[11px] font-semibold ${avecCumuls ? 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-300' : 'border-slate-200 text-slate-500'}`} title={L('Cumul de chaque taille, couleur par couleur', 'المتراكم لكل مقاس، لوناً بلون', 'Running total per size, per colour')}>
                        <Sigma className="w-3.5 h-3.5" />{L('Cumul par taille', 'المتراكم لكل مقاس', 'Per-size running')}
                    </button>
                </div>

                <div className="relative rounded-xl border border-slate-200 dark:border-dk-border overflow-auto max-h-[72vh] bg-white dark:bg-dk-surface">
                    <table className="w-full text-[12px] border-separate border-spacing-0">
                        <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-dk-muted">
                                {(() => {
                                    const th = 'sticky top-0 z-20 bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border py-2.5 px-1.5 font-bold whitespace-nowrap';
                                    return (
                                        <>
                                            <th className={`${th} z-30 text-center`} style={{ left: 0, width: COL_ETAT, minWidth: COL_ETAT, maxWidth: COL_ETAT }} title={L('Coupe', 'مقصوص', 'Cut')}><CheckCircle2 className="w-3.5 h-3.5 mx-auto" /></th>
                                            <th className={`${th} z-30 text-center border-r`} style={{ left: COL_ETAT, width: COL_NUMERO, minWidth: COL_NUMERO, maxWidth: COL_NUMERO }} title={L('Numero ecrit sur les pieces', 'الرقم الذي يُكتب على القطع', 'Number written on pieces')}>N°</th>
                                            <th className={`${th} text-left min-w-[104px]`}>{L('Placement', 'التركيبة', 'Placement')}</th>
                                            <th className={`${th} text-left min-w-[150px]`}>{L('Couleur', 'اللون', 'Colour')}</th>
                                            <th className={`${th} text-left min-w-[130px]`}>{L('Matiere', 'المادة', 'Material')}</th>
                                            <th className={`${th} text-right`} style={{ minWidth: 80 }}>{L('Plis', 'طيّات', 'Plies')}</th>
                                            {tailles.map(t => (
                                                <React.Fragment key={t}>
                                                    <th className={`${th} text-right min-w-[52px] text-emerald-700 dark:text-emerald-300 border-l border-slate-100 dark:border-dk-border`}>{t}</th>
                                                    {avecCumuls && <th className={`${th} text-right min-w-[58px] text-slate-400 font-semibold normal-case`} title={L(`Cumul ${t} pour la couleur de la ligne`, `متراكم ${t} للون السطر`, `${t} running total for the row colour`)}>Σ {t}</th>}
                                                </React.Fragment>
                                            ))}
                                            <th className={`${th} text-right border-l border-slate-200 dark:border-dk-border`} style={{ minWidth: 64 }}>{L('Total', 'المجموع', 'Total')}</th>
                                            <th className={`${th} text-right`} style={{ minWidth: 64 }}>{L('Cumul', 'المتراكم', 'Running')}</th>
                                            <th className={`${th} text-right`} style={{ minWidth: 72 }}>{L('Conso m', 'الاستهلاك م', 'Fabric m')}</th>
                                            <th className={`${th} text-left min-w-[220px] border-l border-slate-200 dark:border-dk-border`}>{L('Trace numerote', 'الملف المرقَّم', 'Numbered trace')}</th>
                                            <th className={th} style={{ minWidth: 96 }}></th>
                                        </>
                                    );
                                })()}
                            </tr>
                        </thead>
                        <tbody>
                            {lignes.length === 0 && (
                                <tr><td colSpan={tailles.length * (avecCumuls ? 2 : 1) + 11} className="py-8 text-center text-[12px] text-slate-400 dark:text-dk-muted">
                                    {L('Aucun matelas. « Calculer les matelas » les cree depuis vos placements et la commande.', 'لا توجد مفرشات. «حساب المفرشات» يُنشئها من التركيبات والطلب.', 'No lay yet. "Compute lays" creates them from your placements and the order.')}
                                </td></tr>
                            )}
                            {(() => {
                                // Cumul par couleur et par taille, ligne apres ligne.
                                const cumulCouleur = new Map<string, Record<string, number>>();
                                let cumulGeneral = 0;
                                return lignes.map((l, i) => {
                                    const p = placementDe(l);
                                    const pieces = piecesLigne(l);
                                    cumulGeneral += pieces;
                                    const cle = l.couleur || '';
                                    const cc = cumulCouleur.get(cle) || {};
                                    tailles.forEach(t => { cc[t] = (cc[t] || 0) + piecesTaille(l, t); });
                                    cumulCouleur.set(cle, cc);
                                    const cmdCouleur = l.couleur ? commande(l.couleur) : {};
                                    const trop = p?.maxPlis && (l.plis || 0) > p.maxPlis;
                                    const pret = !!p && !!p.fichier && !!l.numero;
                                    const bloque = !!l.fait;
                                    const choisie = choisies.has(l.id);
                                    // Fond opaque : les deux premieres colonnes restent collees a gauche en defilant.
                                    const fond = choisie ? 'bg-indigo-50 dark:bg-indigo-950' : l.fait ? 'bg-emerald-50 dark:bg-emerald-950' : i % 2 ? 'bg-slate-50/70 dark:bg-dk-bg' : 'bg-white dark:bg-dk-surface';
                                    const td = `${fond} border-b border-slate-100 dark:border-dk-border py-1 px-1.5`;
                                    const caseSaisie = 'w-full h-8 rounded-md border border-transparent hover:border-slate-200 dark:hover:border-dk-border focus:border-indigo-400 focus:bg-white dark:focus:bg-dk-surface bg-transparent outline-none tabular-nums disabled:hover:border-transparent';
                                    return (
                                        <tr
                                            key={l.id}
                                            onMouseDown={e => { const t = e.target as HTMLElement; if (e.button === 0 && !t.closest('input,button,a,[draggable="true"]')) choisir(l.id, e); }}
                                            onFocusCapture={() => { if (!choisies.has(l.id)) { setChoisies(new Set([l.id])); ancre.current = l.id; } }}
                                            onContextMenu={e => { e.preventDefault(); if (!choisies.has(l.id)) { setChoisies(new Set([l.id])); ancre.current = l.id; } setMenuLigne({ x: e.clientX, y: e.clientY }); }}
                                            className="group"
                                        >
                                            <td className={`${td} sticky z-10 text-center align-middle overflow-hidden ${choisie ? 'shadow-[inset_3px_0_0_0_rgb(79,70,229)]' : ''}`} style={{ left: 0, width: COL_ETAT, minWidth: COL_ETAT, maxWidth: COL_ETAT }}>{renderEtat(l)}</td>
                                            <td className={`${td} sticky z-10 border-r border-slate-100 dark:border-dk-border`} style={{ left: COL_ETAT, width: COL_NUMERO, minWidth: COL_NUMERO, maxWidth: COL_NUMERO }}>
                                                <input
                                                    {...cellule(i, 0)}
                                                    value={l.numero ?? ''}
                                                    disabled={bloque}
                                                    onChange={e => onModifier(l.id, { numero: e.target.value.trim() })}
                                                    placeholder={String(i + 1)}
                                                    title={doublons.has((l.numero || '').trim()) ? L('Numero en double : deux paquets porteraient le meme numero', 'رقم مكرّر: حزمتان ستحملان نفس الرقم', 'Duplicate number') : undefined}
                                                    className={`${caseSaisie} text-center text-[14px] font-bold ${doublons.has((l.numero || '').trim()) ? '!border-rose-400 !bg-rose-50 text-rose-700' : 'text-slate-900 dark:text-dk-text'}`}
                                                />
                                            </td>
                                            <td className={td}>
                                                {bloque ? (
                                                    <span className="px-1.5 text-[12px] font-bold uppercase text-indigo-700 dark:text-indigo-300">{p?.nom || '—'}</span>
                                                ) : (
                                                    <Choix
                                                        cellule
                                                        valeur={p ? <span className="font-bold uppercase text-indigo-700 dark:text-indigo-300">{p.nom}</span> : null}
                                                        vide={L('Choisir', 'اختر', 'Choose')}
                                                        options={placements.map(x => ({ id: x.id, label: <span className="font-bold uppercase text-indigo-700 dark:text-indigo-300">{x.nom}</span> }))}
                                                        onChoisir={id => { const x = placements.find(pp => pp.id === id); if (x) onModifier(l.id, { placementId: x.id, ratios: { ...x.ratios }, longTracee: x.longueurM || 0 }); }}
                                                    />
                                                )}
                                            </td>
                                            <td className={td}>
                                                {bloque ? <span className="px-1.5 text-[12px] font-semibold">{couleurCellule(l.couleur)}</span> : (
                                                    <Choix cellule valeur={couleurCellule(l.couleur)} vide={L('Couleur', 'اللون', 'Colour')} options={couleurs.map(c => ({ id: c, label: couleurCellule(c) }))} onChoisir={c => onModifier(l.id, { couleur: c })} />
                                                )}
                                            </td>
                                            <td className={td}>{renderMatiere(l)}</td>
                                            <td className={td}>
                                                <input
                                                    {...cellule(i, 1)}
                                                    type="number"
                                                    min="0"
                                                    value={l.plis || ''}
                                                    disabled={bloque}
                                                    onChange={e => onModifier(l.id, { plis: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                                                    placeholder="0"
                                                    title={trop ? L(`Plus que ${p!.maxPlis} plis, le maximum de ce placement`, `أكثر من ${p!.maxPlis} طيّة، وهو الحدّ الأقصى لهذه التركيبة`, `Over ${p!.maxPlis} plies`) : undefined}
                                                    className={`${caseSaisie} px-2 text-right text-[13px] font-bold ${trop ? '!border-rose-300 !bg-rose-50 text-rose-700' : 'text-slate-800 dark:text-dk-text'}`}
                                                />
                                            </td>
                                            {tailles.map(t => {
                                                const v = piecesTaille(l, t);
                                                const cum = cc[t] || 0;
                                                const cible = Number(cmdCouleur[t]) || 0;
                                                const clsCum = cible > 0 && cum === cible ? 'text-emerald-600 dark:text-emerald-400 font-bold' : cible > 0 && cum > cible ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-400 dark:text-dk-muted';
                                                return (
                                                    <React.Fragment key={t}>
                                                        <td className={`${td} text-right tabular-nums font-semibold border-l border-slate-100 dark:border-dk-border ${v ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-300 dark:text-dk-muted'}`}>{v || '·'}</td>
                                                        {avecCumuls && (
                                                            <td className={`${td} text-right tabular-nums text-[11px] ${clsCum}`} title={cible ? `${l.couleur} ${t} : ${cum} / ${cible}` : undefined}>{cum || '·'}</td>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                            <td className={`${td} text-right tabular-nums font-bold text-slate-900 dark:text-dk-text border-l border-slate-200 dark:border-dk-border`}>{pieces}</td>
                                            <td className={`${td} text-right tabular-nums text-slate-500 dark:text-dk-muted`}>{cumulGeneral}</td>
                                            <td className={`${td} text-right tabular-nums`}>{celluleConso(l)}</td>
                                            <td className={`${td} border-l border-slate-200 dark:border-dk-border`}>
                                                {pret ? (
                                                    <div className="flex items-center gap-0.5 min-w-0">
                                                        <span
                                                            draggable
                                                            onDragStart={e => glisser(e, l)}
                                                            className="flex-1 min-w-0 max-w-[210px] inline-flex items-center gap-1 h-7 px-1.5 rounded-md bg-indigo-50/70 dark:bg-indigo-900/20 cursor-grab active:cursor-grabbing"
                                                            title={L('Glissez ce fichier dans Optitex ou dans un dossier', 'اسحب هذا الملف إلى Optitex أو إلى مجلّد', 'Drag this file into Optitex or a folder')}
                                                        >
                                                            <GripVertical className="w-3 h-3 text-indigo-400 shrink-0" />
                                                            <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 truncate">{nomSortie(l, p!)}</span>
                                                        </span>
                                                        <button type="button" onClick={() => onApercu(l, p!)} className="p-1.5 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50" title={L('Voir le numero dans les pieces', 'معاينة الرقم في القطع', 'Preview')}><Eye className="w-3.5 h-3.5" /></button>
                                                        <button type="button" onClick={() => telecharger(l)} className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title={L('Telecharger', 'تنزيل', 'Download')}><Download className="w-3.5 h-3.5" /></button>
                                                        {deposer && (
                                                            <button type="button" disabled={envoi === l.id} onClick={() => envoyer(l)} className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-40" title={L('Envoyer au traceur', 'إرسال إلى الـ traceur', 'Send to plotter')}><Send className="w-3.5 h-3.5" /></button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] text-slate-400 dark:text-dk-muted whitespace-nowrap">
                                                        {!p ? L('Choisir un placement', 'اختر تركيبة', 'Choose a placement') : !p.fichier ? L('Placement sans trace PLT', 'تركيبة بلا ملف PLT', 'No PLT') : L('Sans numero', 'بلا رقم', 'No number')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className={`${td} text-center whitespace-nowrap`}>
                                                <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100">
                                                    <button type="button" onClick={() => onInserer(l.id)} className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title={L('Inserer un matelas en dessous', 'إدراج مفرشة تحت هذه', 'Insert below')}>
                                                        <Plus className="w-3.5 h-3.5" />
                                                    </button>
                                                    {renderActions(l)}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                });
                            })()}
                        </tbody>
                        {lignes.length > 0 && (() => {
                            const tf = 'sticky bottom-0 z-20 border-t border-slate-300 dark:border-dk-border py-1.5 px-1.5';
                            const cumulVide = avecCumuls ? <td className={`${tf} bg-inherit`}></td> : null;
                            const totalCmd = tailles.reduce((s, t) => s + bilan.cmd[t], 0);
                            return (
                                <tfoot className="text-[11px] font-bold">
                                    <tr className="bg-slate-100 dark:bg-dk-elevated">
                                        <td colSpan={5} className={`${tf} bg-slate-100 dark:bg-dk-elevated text-right uppercase tracking-wide text-slate-600 dark:text-dk-text-soft`}>{L('Total', 'المجموع', 'Total')} · {lignes.length} {L('matelas', 'مفرشة', 'lays')}</td>
                                        <td className={`${tf} bg-slate-100 dark:bg-dk-elevated text-right tabular-nums`}>{bilan.plis}</td>
                                        {tailles.map(t => (
                                            <React.Fragment key={t}>
                                                <td className={`${tf} bg-slate-100 dark:bg-dk-elevated text-right tabular-nums`}>{bilan.total[t]}</td>
                                                {avecCumuls && <td className={`${tf} bg-slate-100 dark:bg-dk-elevated`}></td>}
                                            </React.Fragment>
                                        ))}
                                        <td className={`${tf} bg-slate-100 dark:bg-dk-elevated text-right tabular-nums`}>{bilan.pieces}</td>
                                        <td className={`${tf} bg-slate-100 dark:bg-dk-elevated`}></td>
                                        <td className={`${tf} bg-slate-100 dark:bg-dk-elevated text-right tabular-nums`}>{bilan.conso.toFixed(2)}</td>
                                        <td colSpan={2} className={`${tf} bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted font-semibold`}>
                                            {tissu.recuM ? `${L('Recu', 'المستلم', 'Received')} ${tissu.recuM} m · ${L('reste', 'الباقي', 'left')} ${(tissu.recuM - bilan.conso).toFixed(2)} m` : ''}
                                        </td>
                                    </tr>
                                    <tr className="bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted">
                                        <td colSpan={6} className="py-1.5 px-1.5 text-right uppercase tracking-wide">{L('Commande', 'الطلب', 'Order')}</td>
                                        {tailles.map(t => <React.Fragment key={t}><td className="py-1.5 px-1.5 text-right tabular-nums">{bilan.cmd[t]}</td>{cumulVide && <td></td>}</React.Fragment>)}
                                        <td className="py-1.5 px-1.5 text-right tabular-nums">{totalCmd}</td>
                                        <td colSpan={4}></td>
                                    </tr>
                                    <tr className="bg-white dark:bg-dk-surface">
                                        <td colSpan={6} className="py-1.5 px-1.5 text-right uppercase tracking-wide text-slate-600 dark:text-dk-text-soft">{L('Ecart', 'الفارق', 'Gap')}</td>
                                        {tailles.map(t => { const v = bilan.total[t] - bilan.cmd[t]; return <React.Fragment key={t}><td className={`py-1.5 px-1.5 text-right tabular-nums ${ecartCls(v)}`}>{v === 0 ? '✓' : signe(v)}</td>{cumulVide && <td></td>}</React.Fragment>; })}
                                        {(() => { const v = bilan.pieces - totalCmd; return <td className={`py-1.5 px-1.5 text-right tabular-nums ${ecartCls(v)}`}>{v === 0 ? '✓' : signe(v)}</td>; })()}
                                        <td colSpan={4}></td>
                                    </tr>
                                </tfoot>
                            );
                        })()}
                    </table>
                </div>

                {/* Clic droit sur une ligne : les memes actions qu'Excel. */}
                {menuLigne && (
                    <>
                        <div className="fixed inset-0 z-[80]" onClick={() => setMenuLigne(null)} onContextMenu={e => { e.preventDefault(); setMenuLigne(null); }} />
                        <div className="fixed z-[81] w-56 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xl py-1 text-[12px]" style={{ left: Math.min(menuLigne.x, window.innerWidth - 232), top: Math.min(menuLigne.y, window.innerHeight - 250) }}>
                            <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{idsChoisis.length} {L('ligne(s) choisie(s)', 'سطر مختار', 'row(s) selected')}</p>
                            {[
                                { f: actions.inserer, i: Plus, t: L('Inserer dessous', 'إدراج تحت', 'Insert below'), k: 'Ctrl +' },
                                { f: actions.dupliquer, i: Copy, t: L('Dupliquer', 'تكرار', 'Duplicate'), k: 'Ctrl D' },
                                { f: actions.monter, i: ArrowUp, t: L('Monter', 'إلى الأعلى', 'Move up'), k: 'Alt ↑', off: idsChoisis.length !== 1 },
                                { f: actions.descendre, i: ArrowDown, t: L('Descendre', 'إلى الأسفل', 'Move down'), k: 'Alt ↓', off: idsChoisis.length !== 1 },
                                { f: actions.supprimer, i: Trash2, t: L('Supprimer', 'حذف', 'Delete'), k: 'Suppr', rouge: true },
                            ].map(b => (
                                <button key={b.t} type="button" disabled={b.off} onClick={() => { b.f(); setMenuLigne(null); }} className={`w-full flex items-center gap-2 px-3 h-9 text-left hover:bg-slate-50 dark:hover:bg-dk-elevated disabled:opacity-40 ${b.rouge ? 'text-rose-600' : 'text-slate-700 dark:text-dk-text-soft'}`}>
                                    <b.i className="w-3.5 h-3.5 shrink-0" /><span className="flex-1">{b.t}</span><span className="text-[10px] text-slate-400">{b.k}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {confirmSuppr && (
                    <div className="fixed inset-0 z-[95] bg-slate-900/40 flex items-end sm:items-center justify-center" onClick={() => setConfirmSuppr(false)}>
                        <div className="w-full sm:max-w-sm bg-white dark:bg-dk-surface rounded-t-2xl sm:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
                            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-dk-text">{L(`Supprimer ${idsChoisis.length - coupeesChoisies} matelas ?`, `حذف ${idsChoisis.length - coupeesChoisies} مفرشة؟`, `Delete ${idsChoisis.length - coupeesChoisies} lays?`)}</h3>
                            {coupeesChoisies > 0 && (
                                <p className="text-[12px] text-amber-700 dark:text-amber-400 mt-1">{L(`${coupeesChoisies} deja coupe(s) : ils restent.`, `${coupeesChoisies} مقصوصة: تبقى.`, `${coupeesChoisies} already cut: kept.`)}</p>
                            )}
                            <div className="flex justify-end gap-2 mt-5">
                                <button type="button" onClick={() => setConfirmSuppr(false)} className="h-10 px-4 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-100">{L('Annuler', 'إلغاء', 'Cancel')}</button>
                                <button type="button" onClick={() => { onSupprimerLignes(idsChoisis); setConfirmSuppr(false); setChoisies(new Set()); }} className="h-10 px-4 rounded-lg text-[12px] font-semibold bg-rose-600 text-white hover:bg-rose-700">{L('Supprimer', 'حذف', 'Delete')}</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            )}
        </div>
    );
}
