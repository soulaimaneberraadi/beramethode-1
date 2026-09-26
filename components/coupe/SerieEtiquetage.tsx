/**
 * Serie d'etiquetage, comme la feuille « SERIE » de l'atelier : un paquet par
 * taille de chaque matelas, sa plage de numeros (1-82, 83-164...), puis ce que
 * la salle note : date, pieces en plus ou en moins, lot, entree et sortie de
 * chaine, et la chaine qui le coud.
 *
 * Les plages se recalculent des matelas : un pli change, les etiquettes
 * suivent. La chaine proposee est celle que le Planning a donnee au modele.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Tag, ChevronDown, CalendarCheck, LogIn, LogOut, X, Factory } from 'lucide-react';
import type { MatelasLine, SaisiePaquet, SerieEtiquetage as Serie } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { paquetsSerie, piecesParChaine, saisieDe } from '../../lib/serieEtiquetage';

interface Props {
    lignes: MatelasLine[];
    tailles: string[];
    serie?: Serie;
    onChange: (s: Serie) => void;
    chaines: { id: string; name: string }[];
    /** Chaine du modele au Planning, proposee d'office. */
    chainePlanifiee?: string;
}

const aujourdhui = () => new Date().toLocaleDateString('fr-FR');

export default function SerieEtiquetage({ lignes, tailles, serie, onChange, chaines, chainePlanifiee }: Props) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    const depart = serie?.depart && serie.depart > 0 ? serie.depart : 1;
    const paquets = useMemo(() => paquetsSerie(lignes, tailles, depart), [lignes, tailles, depart]);
    const nomChaine = (id?: string) => chaines.find(c => c.id === id)?.name || id || '';
    const parChaine = useMemo(() => piecesParChaine(paquets, serie), [paquets, serie]);

    const [choisis, setChoisis] = useState<Set<string>>(new Set());
    const ancre = useRef<number | null>(null);
    const glisse = useRef<number | null>(null);
    const [menuChaine, setMenuChaine] = useState<string | 'lot' | null>(null);
    useEffect(() => {
        const fin = () => { glisse.current = null; };
        window.addEventListener('mouseup', fin);
        return () => window.removeEventListener('mouseup', fin);
    }, []);

    const saisir = (cles: string[], patch: Partial<SaisiePaquet>) => {
        const saisies = { ...(serie?.saisies || {}) };
        for (const c of cles) {
            const n: SaisiePaquet = { ...(saisies[c] || {}), ...patch };
            (Object.keys(n) as (keyof SaisiePaquet)[]).forEach(k => { if (n[k] === '' || n[k] === undefined) delete n[k]; });
            if (Object.keys(n).length) saisies[c] = n; else delete saisies[c];
        }
        onChange({ ...(serie || {}), saisies });
    };
    const cible = () => (choisis.size ? paquets.filter(p => choisis.has(p.cle)).map(p => p.cle) : []);

    const choisir = (i: number, e: React.MouseEvent) => {
        const cle = paquets[i].cle;
        if (e.shiftKey && ancre.current !== null) {
            const a = Math.min(ancre.current, i), b = Math.max(ancre.current, i);
            setChoisis(new Set(paquets.slice(a, b + 1).map(p => p.cle)));
            return;
        }
        if (e.ctrlKey || e.metaKey) setChoisis(prev => { const n = new Set(prev); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
        else setChoisis(new Set([cle]));
        ancre.current = i;
        glisse.current = i;
    };

    const ChoixChaine = ({ valeur, onChoisir, id }: { valeur?: string; onChoisir: (c: string | undefined) => void; id: string }) => (
        <div className="relative">
            <button type="button" onClick={() => setMenuChaine(m => (m === id ? null : id))} className="w-full h-7 px-1.5 flex items-center gap-1 rounded-md border border-transparent hover:border-slate-200 dark:hover:border-dk-border text-[11px] font-semibold">
                <span className={`flex-1 min-w-0 truncate text-left ${valeur ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-300'}`}>{valeur ? nomChaine(valeur) : (chainePlanifiee ? nomChaine(chainePlanifiee) : '—')}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>
            {menuChaine === id && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setMenuChaine(null)} />
                    <div className="absolute z-40 right-0 top-full mt-1 w-44 max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xl py-1">
                        {chaines.map(c => (
                            <button key={c.id} type="button" onClick={() => { onChoisir(c.id); setMenuChaine(null); }} className="w-full h-8 px-3 text-left text-[12px] font-semibold hover:bg-slate-50 dark:hover:bg-dk-elevated">
                                {c.name}{c.id === chainePlanifiee ? <span className="ml-1 text-[10px] text-emerald-600">· {L('planning', 'التخطيط', 'planning')}</span> : null}
                            </button>
                        ))}
                        <button type="button" onClick={() => { onChoisir(undefined); setMenuChaine(null); }} className="w-full h-8 px-3 text-left text-[12px] text-slate-400 hover:bg-slate-50">{L('Aucune', 'لا شيء', 'None')}</button>
                    </div>
                </>
            )}
        </div>
    );

    if (paquets.length === 0) {
        return <p className="py-4 text-[12px] text-slate-400">{L('La serie se calcule des matelas du tissu principal : ajoutez-en d’abord.', 'تُحسب السلسلة من مفرشات الثوب الرئيسي: أضفها أولاً.', 'The series comes from main-fabric lays.')}</p>;
    }

    const champ = 'w-full h-7 px-1.5 rounded-md border border-transparent hover:border-slate-200 dark:hover:border-dk-border focus:border-indigo-400 focus:bg-white dark:focus:bg-dk-surface bg-transparent outline-none text-[11px] tabular-nums';
    const dernier = paquets[paquets.length - 1];

    return (
        <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{L('Premier numero', 'أول رقم', 'First number')}</span>
                    <input
                        type="number"
                        min="1"
                        value={serie?.depart || ''}
                        onChange={e => onChange({ ...(serie || {}), depart: e.target.value === '' ? undefined : Math.max(1, Math.round(Number(e.target.value))) })}
                        placeholder="1"
                        className="h-9 w-24 px-2.5 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-[13px] font-bold outline-none focus:border-indigo-400"
                    />
                </label>
                <p className="text-[12px] text-slate-600 dark:text-dk-text-soft pb-2">
                    <b>{paquets.length}</b> {L('paquets', 'حزمة', 'bundles')} · {L('serie', 'السلسلة', 'series')} <b className="tabular-nums">{paquets[0].debut} → {dernier.fin}</b>
                </p>
                <div className="flex flex-wrap gap-1.5 pb-1.5 ml-auto">
                    {Object.entries(parChaine).map(([c, n]) => (
                        <span key={c} className="h-7 px-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                            <Factory className="w-3 h-3" />{nomChaine(c)} · {n} pcs
                        </span>
                    ))}
                    {chainePlanifiee && paquets.some(p => !saisieDe(serie, p.cle).chaine) && (
                        <button type="button" onClick={() => saisir(paquets.filter(p => !saisieDe(serie, p.cle).chaine).map(p => p.cle), { chaine: chainePlanifiee })} className="h-7 px-2.5 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100">
                            {L('Paquets sans chaine', 'حزم بلا سلسلة', 'Bundles without line')} → {nomChaine(chainePlanifiee)}
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 min-h-9">
                {choisis.size > 0 ? (
                    <>
                        <span className="h-8 px-2.5 inline-flex items-center rounded-lg bg-indigo-600 text-white text-[11px] font-bold">{choisis.size} {L('paquet(s)', 'حزمة', 'bundle(s)')}</span>
                        <div className="relative">
                            <button type="button" onClick={() => setMenuChaine(m => (m === 'lot' ? null : 'lot'))} className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-semibold">
                                <Factory className="w-3.5 h-3.5" />{L('Chaine', 'السلسلة', 'Line')}<ChevronDown className="w-3 h-3" />
                            </button>
                            {menuChaine === 'lot' && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setMenuChaine(null)} />
                                    <div className="absolute z-40 left-0 top-full mt-1 w-44 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xl py-1">
                                        {chaines.map(c => (
                                            <button key={c.id} type="button" onClick={() => { saisir(cible(), { chaine: c.id }); setMenuChaine(null); }} className="w-full h-8 px-3 text-left text-[12px] font-semibold hover:bg-slate-50 dark:hover:bg-dk-elevated">{c.name}</button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                        <button type="button" onClick={() => saisir(cible(), { date: aujourdhui() })} className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-[11px] font-semibold hover:border-indigo-300"><CalendarCheck className="w-3.5 h-3.5" />{L('Date aujourd’hui', 'تاريخ اليوم', 'Date today')}</button>
                        <button type="button" onClick={() => saisir(cible(), { entree: aujourdhui() })} className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-[11px] font-semibold hover:border-indigo-300"><LogIn className="w-3.5 h-3.5" />{L('Entree aujourd’hui', 'دخول اليوم', 'In today')}</button>
                        <button type="button" onClick={() => saisir(cible(), { sortie: aujourdhui() })} className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-[11px] font-semibold hover:border-indigo-300"><LogOut className="w-3.5 h-3.5" />{L('Sortie aujourd’hui', 'خروج اليوم', 'Out today')}</button>
                        <button type="button" onClick={() => setChoisis(new Set())} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
                    </>
                ) : (
                    <span className="text-[11px] text-slate-400">{L('Appuyez sur un paquet et descendez pour en prendre plusieurs, puis donnez-leur une chaine ou une date.', 'اضغط على حزمة واسحب للأسفل لأخذ عدّة حزم، ثم أعطها سلسلة أو تاريخاً.', 'Press and drag to select bundles, then set a line or a date.')}</span>
                )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-dk-border overflow-auto max-h-[65vh] bg-white dark:bg-dk-surface">
                <table className="w-max min-w-[880px] text-[12px] border-separate border-spacing-0 select-none">
                    <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-dk-muted">
                            {[
                                [L('Date', 'التاريخ', 'Date'), 'min-w-[96px] text-left'],
                                [L('N° paq', 'رقم الحزمة', 'Bundle'), 'text-center'],
                                [L('Pli', 'طيّة', 'Ply'), 'text-right'],
                                [L('Serie', 'من', 'From'), 'text-right'],
                                [L('Serie 2', 'إلى', 'To'), 'text-right'],
                                [L('Taille', 'المقاس', 'Size'), 'text-center'],
                                [L('Pieces (-/+)', 'قطع (-/+)', 'Pcs (-/+)'), 'min-w-[84px] text-right'],
                                ['N', 'min-w-[52px] text-center'],
                                [L('Entree', 'دخول', 'In'), 'min-w-[96px] text-left'],
                                [L('Lot', 'الدفعة', 'Lot'), 'min-w-[84px] text-left'],
                                [L('Sortie', 'خروج', 'Out'), 'min-w-[96px] text-left'],
                                [L('Chaine', 'السلسلة', 'Line'), 'min-w-[150px] text-left'],
                            ].map(([t, c]) => (
                                <th key={t} className={`sticky top-0 z-10 bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border py-2 px-1.5 font-bold whitespace-nowrap ${c}`}>{t}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paquets.map((p, i) => {
                            const s = saisieDe(serie, p.cle);
                            const choisi = choisis.has(p.cle);
                            const nouveauPaquet = i > 0 && paquets[i - 1].matelasId !== p.matelasId;
                            const fond = choisi ? 'bg-indigo-50 dark:bg-indigo-950' : p.fait ? 'bg-emerald-50/60 dark:bg-emerald-950/40' : '';
                            const td = `${fond} ${nouveauPaquet ? 'border-t-2 border-t-slate-200 dark:border-t-dk-border' : 'border-t border-t-slate-50 dark:border-t-dk-border'} py-0.5 px-1.5`;
                            return (
                                <tr
                                    key={p.cle}
                                    onMouseDown={e => { if (e.button === 0 && !(e.target as HTMLElement).closest('input,button')) choisir(i, e); }}
                                    onMouseEnter={e => {
                                        if (glisse.current === null || e.buttons !== 1) return;
                                        const a = Math.min(glisse.current, i), b = Math.max(glisse.current, i);
                                        setChoisis(new Set(paquets.slice(a, b + 1).map(x => x.cle)));
                                    }}
                                >
                                    <td className={td}><input value={s.date || ''} onChange={e => saisir([p.cle], { date: e.target.value })} placeholder="jj/mm" className={champ} /></td>
                                    <td className={`${td} text-center font-bold text-slate-900 dark:text-dk-text`}>{p.paquet}</td>
                                    <td className={`${td} text-right tabular-nums`}>{p.plis}</td>
                                    <td className={`${td} text-right tabular-nums font-bold text-indigo-700 dark:text-indigo-300`}>{p.debut}</td>
                                    <td className={`${td} text-right tabular-nums font-bold text-indigo-700 dark:text-indigo-300`}>{p.fin}</td>
                                    <td className={`${td} text-center font-bold uppercase text-emerald-700 dark:text-emerald-300`}>{p.taille}</td>
                                    <td className={td}>
                                        <input
                                            type="number"
                                            value={s.pieces ?? ''}
                                            onChange={e => saisir([p.cle], { pieces: e.target.value === '' ? undefined : Math.round(Number(e.target.value)) })}
                                            placeholder="·"
                                            className={`${champ} text-right ${s.pieces ? (s.pieces < 0 ? 'text-rose-600 font-bold' : 'text-amber-600 font-bold') : ''}`}
                                        />
                                    </td>
                                    <td className={td}><input value={s.n || ''} onChange={e => saisir([p.cle], { n: e.target.value })} className={`${champ} text-center`} /></td>
                                    <td className={td}><input value={s.entree || ''} onChange={e => saisir([p.cle], { entree: e.target.value })} placeholder="jj/mm" className={champ} /></td>
                                    <td className={td}><input value={s.lote || ''} onChange={e => saisir([p.cle], { lote: e.target.value })} className={champ} /></td>
                                    <td className={td}><input value={s.sortie || ''} onChange={e => saisir([p.cle], { sortie: e.target.value })} placeholder="jj/mm" className={champ} /></td>
                                    <td className={td}><ChoixChaine id={p.cle} valeur={s.chaine} onChoisir={c => saisir([p.cle], { chaine: c })} /></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <p className="flex items-center gap-1.5 text-[10px] text-slate-400"><Tag className="w-3 h-3" />{L('Les numeros se recalculent a chaque changement de matelas : les etiquettes suivent toujours les plis reels.', 'الأرقام تُعاد حسابها مع كل تغيير في المفرشات: الإتيكيتات تتبع دائماً الطيّات الحقيقية.', 'Numbers recompute on every lay change.')}</p>
        </div>
    );
}
