/**
 * Premier tableau d'une matiere : ses placements.
 *
 * Une ligne = un melange de tailles par pli (« XS-M », « XS a M », « XS×2 »),
 * le trace PLT retravaille dans Optitex, sa longueur et le nombre de plis
 * maximum pour ce placement. Deposer le PLT remplit seul les tailles, la
 * laize, la longueur et l'efficience ecrites par Optitex dans l'en-tete.
 */
import React, { useRef, useState } from 'react';
import { Eye, FileText, Plus, Trash2, Upload, X, AlertTriangle, RotateCcw, Files } from 'lucide-react';
import type { MatelasFichier, PlacementCoupe } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { nomPlacement } from '../../lib/planMatelas';
import { associerTailles, lireEntete, lireNotation } from '../../lib/ordreCoupe';
import { analyserFichier, analyserTexte } from '../../lib/numerotationPlt';
import { decoderOctets } from '../../lib/hpgl';
import { grilleClavier } from './grilleClavier';

interface Props {
    placements: PlacementCoupe[];
    tailles: string[];
    /** Matelas deja poses sur chaque placement (id -> nombre). */
    nbMatelas: Record<string, number>;
    /** Tissu de tous les matelas de chaque placement, en metres (id -> m). */
    consoTotale: Record<string, number>;
    maxPlisDefaut: number;
    /** Longueur d'un rouleau de cette matiere, pour afficher les plis par rouleau. */
    rouleauM?: number;
    /** Laize reelle du tissu (cm), pour verifier que chaque trace tient et ce qu'il perd en largeur. */
    laizeTissuCm?: number;
    /** Traces deja faits pour ce modele dans d'autres ordres, avec le meme melange de tailles. */
    suggestions?: (p: PlacementCoupe) => { source: string; placement: PlacementCoupe }[];
    onAjouter: () => void;
    /** Nouveau placement deja rempli (depot de plusieurs traces) : rend son id. */
    onAjouterAvec?: (init: Partial<PlacementCoupe>) => string;
    onModifier: (id: string, patch: Partial<PlacementCoupe>) => void;
    onSupprimer: (p: PlacementCoupe) => void;
    onApercu: (p: PlacementCoupe) => void;
    onMessage: (texte: string, type: 'success' | 'error' | 'info') => void;
}

const memesRatios = (a: Record<string, number>, b: Record<string, number>) => {
    const cles = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of cles) if ((Number(a[k]) || 0) !== (Number(b[k]) || 0)) return false;
    return true;
};

/**
 * Tailles ecrites dans l'en-tete du trace. Lues aussi pour les fichiers
 * deposes avant ce controle : un vieux fichier n'echappe pas a la verification.
 */
const taillesDuTrace = (p: PlacementCoupe, tailles: string[]): Record<string, number> | null => {
    if (p.taillesTrace && Object.keys(p.taillesTrace).length) return p.taillesTrace;
    if (!p.fichier?.data) return null;
    try {
        const a = analyserFichier(p.fichier);
        const e = a ? lireEntete(a.entete) : null;
        if (!e?.tailles) return null;
        const { ratios } = associerTailles(e.tailles, tailles);
        return Object.keys(ratios).length ? ratios : null;
    } catch {
        return null;
    }
};

const lireDataUrl = (f: File) => new Promise<string>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result || ''));
    r.onerror = () => ko(r.error);
    r.readAsDataURL(f);
});
const lireOctets = (f: File) => new Promise<ArrayBuffer>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as ArrayBuffer);
    r.onerror = () => ko(r.error);
    r.readAsArrayBuffer(f);
});

/**
 * Code du trace dans le nom du fichier du client :
 * « 4-57PHR-9008-3868-800-139-TE-00.PLT » -> TE-00, « ...-148-EN-01----24V... » -> EN-01,
 * « ...-TE-VIVOS.PLT » -> TE-VIVOS, « ...-AFINADOS.PLT » -> AFINADOS.
 */
export function codeDuNomFichier(nom: string): string | undefined {
    const base = nom.replace(/\.(plt|hpgl|hgl|prn)$/i, '').toUpperCase().replace(/-{2,}/g, '-');
    const numero = [...base.matchAll(/(?:^|-)([A-Z][A-Z0-9]?-\d{1,3})(?=-|$)/g)].pop();
    if (numero) return numero[1];
    const mot = /-([A-Z]{2}-[A-Z]{3,}|[A-Z]{4,})$/.exec(base);
    return mot ? mot[1] : undefined;
}

export default function TablePlacements({ placements, tailles, nbMatelas, consoTotale, maxPlisDefaut, rouleauM, laizeTissuCm, suggestions, onAjouter, onAjouterAvec, onModifier, onSupprimer, onApercu, onMessage }: Props) {
    const { lang } = useLang();
    const inputRef = useRef<HTMLInputElement>(null);
    const cibleFichier = useRef<string | null>(null);
    const [survol, setSurvol] = useState<string | null>(null);
    // Saisie du nom en cours : on n'ecrase pas ce que l'operateur tape tant que ce n'est pas lisible.
    const [brouillons, setBrouillons] = useState<Record<string, string>>({});

    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });

    const adopterFichier = async (id: string, f: File, connu?: PlacementCoupe) => {
        const p = connu || placements.find(x => x.id === id);
        if (!p) return;
        if (!/\.(plt|hpgl|hgl|prn)$/i.test(f.name)) {
            onMessage(L('Seuls les traces .plt sont acceptes ici.', 'تُقبل هنا ملفات plt فقط.', 'Only .plt traces here.'), 'error');
            return;
        }
        if (f.size > 15 * 1024 * 1024) {
            onMessage(L('Trace trop volumineux (15 Mo au plus).', 'الملف كبير جداً (15 ميغابايت كحدّ أقصى).', 'Trace too large (max 15 MB).'), 'error');
            return;
        }
        try {
            const [data, octets] = await Promise.all([lireDataUrl(f), lireOctets(f)]);
            const analyse = analyserTexte(decoderOctets(octets));
            const entete = lireEntete(analyse.entete);
            const fichier: MatelasFichier = { id: `FIL-${Date.now()}-${Math.floor(Math.random() * 1000)}`, nom: f.name, format: 'PLT', data, size: f.size };
            const patch: Partial<PlacementCoupe> = {
                fichier,
                // Nouveau fichier : les retouches de numeros visaient les pieces de l'ancien.
                numerotation: p.numerotation ? { ...p.numerotation, exclus: [], ajustements: {} } : undefined,
            };
            if (entete.longueurM) patch.longueurM = Number(entete.longueurM.toFixed(4));
            if (entete.laizeCm) patch.laizeCm = entete.laizeCm;
            if (entete.efficience) patch.efficience = entete.efficience;
            if (entete.tailles) {
                const { ratios, inconnues } = associerTailles(entete.tailles, tailles);
                patch.taillesTrace = ratios;
                const actuel = p.ratios || {};
                const vide = !Object.values(actuel).some(v => (Number(v) || 0) > 0);
                if (Object.keys(ratios).length && vide) {
                    // Placement encore vide : le trace dit ce qu'il contient.
                    patch.ratios = ratios;
                    patch.nom = nomPlacement(ratios, tailles);
                } else if (Object.keys(ratios).length && !memesRatios(actuel, ratios)) {
                    // Placement deja defini : un fichier different ne change jamais ses matelas en silence.
                    onMessage(`${L('Attention : ce trace contient', 'انتبه: هذا الملف يحتوي', 'Warning: this trace holds')} ${nomPlacement(ratios, tailles)} ${L('mais le placement est', 'لكن التركيبة هي', 'but the placement is')} ${nomPlacement(actuel, tailles)}. ${L('Tailles gardees : verifiez le fichier.', 'أُبقيت المقاسات: تحقّق من الملف.', 'Sizes kept: check the file.')}`, 'error');
                }
                if (inconnues.length) {
                    onMessage(`${L('Tailles du trace absentes de la commande :', 'مقاسات في الملف غير موجودة في الطلب:', 'Trace sizes not in the order:')} ${inconnues.join(', ')}`, 'error');
                }
            }
            onModifier(id, patch);
            if (entete.longueurM || entete.tailles) {
                onMessage(L('Trace lu : tailles, longueur et laize remplies depuis le fichier.', 'قُرئ الملف: المقاسات والطول والعرض مُلئت منه.', 'Trace read: sizes, length and width filled in.'), 'success');
            }
        } catch {
            onMessage(L('Trace illisible.', 'تعذّرت قراءة الملف.', 'Unreadable trace.'), 'error');
        }
    };

    /*
     * Plusieurs traces deposes d'un coup (le dossier envoye par le client) :
     * chaque fichier va au placement qui porte son code (TE-00), sinon a un
     * placement vide avec les memes tailles, sinon il en cree un.
     */
    const multiRef = useRef<HTMLInputElement>(null);
    const [survolTable, setSurvolTable] = useState(false);
    const deposerPlusieurs = async (fichiers: File[]) => {
        const plts = fichiers.filter(f => /\.(plt|hpgl|hgl|prn)$/i.test(f.name));
        if (!plts.length) { onMessage(L('Aucun fichier .plt.', 'لا يوجد ملف plt.', 'No .plt file.'), 'error'); return; }
        const pris = new Set<string>();
        let relies = 0, crees = 0;
        for (const f of plts) {
            let ratios: Record<string, number> = {};
            try {
                const e = lireEntete(analyserTexte(decoderOctets(await lireOctets(f))).entete);
                if (e.tailles) ratios = associerTailles(e.tailles, tailles).ratios;
            } catch { /* illisible : adopterFichier le dira */ }
            const code = codeDuNomFichier(f.name);
            const cible = (code && placements.find(p => !pris.has(p.id) && (p.code || '').toUpperCase() === code))
                || (Object.keys(ratios).length ? placements.find(p => !pris.has(p.id) && !p.fichier && memesRatios(p.ratios || {}, ratios)) : undefined);
            if (cible) {
                pris.add(cible.id);
                await adopterFichier(cible.id, f, cible);
                relies++;
            } else if (onAjouterAvec) {
                const init: Partial<PlacementCoupe> = { code, ratios, nom: Object.keys(ratios).length ? nomPlacement(ratios, tailles) : (code || '') };
                const id = onAjouterAvec(init);
                pris.add(id);
                await adopterFichier(id, f, { id, tissu: '', nom: init.nom || '', ratios, code });
                crees++;
            }
        }
        onMessage(`${plts.length} ${L('trace(s) :', 'ملف:', 'trace(s):')} ${relies} ${L('relie(s) a leur placement', 'رُبط بتركيبته', 'linked')}${crees ? `, ${crees} ${L('nouveau(x) placement(s)', 'تركيبة جديدة', 'new placement(s)')}` : ''}.`, 'success');
    };

    const champNombre = 'w-full text-center h-8 px-1 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded text-[12px] font-semibold text-slate-800 dark:text-dk-text outline-none focus:bg-white dark:focus:bg-dk-surface focus:border-indigo-400';

    // Colonnes saisissables : 0 nom, 1..n tailles, n+1 longueur, n+2 plis max.
    const cellule = grilleClavier('placements', (l, c, bloc) => {
        bloc.forEach((rangee, i) => {
            const p = placements[l + i];
            if (!p) return;
            const ratios = { ...p.ratios };
            const patch: Partial<PlacementCoupe> = {};
            rangee.forEach((v, j) => {
                const col = c + j;
                const n = Number(String(v).replace(',', '.').trim());
                if (col >= 1 && col <= tailles.length && Number.isFinite(n)) ratios[tailles[col - 1]] = Math.max(0, Math.round(n));
                else if (col === tailles.length + 1 && Number.isFinite(n)) patch.longueurM = n;
                else if (col === tailles.length + 2 && Number.isFinite(n)) patch.maxPlis = Math.max(0, Math.round(n));
            });
            if (JSON.stringify(ratios) !== JSON.stringify(p.ratios)) { patch.ratios = ratios; patch.nom = nomPlacement(ratios, tailles); }
            if (Object.keys(patch).length) onModifier(p.id, patch);
        });
        return true;
    });

    return (
        <div>
            <input
                ref={inputRef}
                type="file"
                accept=".plt,.hpgl,.hgl,.prn"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f && cibleFichier.current) adopterFichier(cibleFichier.current, f); }}
            />
            <input ref={multiRef} type="file" multiple accept=".plt,.hpgl,.hgl,.prn" className="hidden" onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) deposerPlusieurs(fs); }} />
            <div
                className={`overflow-x-auto rounded-lg ${survolTable ? 'ring-2 ring-indigo-300' : ''}`}
                onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setSurvolTable(true); } }}
                onDragLeave={e => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setSurvolTable(false); }}
                onDrop={e => { e.preventDefault(); setSurvolTable(false); const fs = Array.from(e.dataTransfer.files || []); if (fs.length) deposerPlusieurs(fs); }}
            >
                <table className="w-full text-[12px] border-collapse border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface min-w-[860px]">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-dk-bg text-slate-600 dark:text-dk-text-soft border-b border-slate-200 dark:border-dk-border text-[10px] uppercase tracking-wider">
                            <th className="py-2 px-2 text-left w-24" title={L('Code du trace chez le client (TE-01) : la fin du nom de son fichier', 'رمز التفصيلة عند الزبون (TE-01)', 'Client marker code (TE-01)')}>{L('Code', 'الرمز', 'Code')}</th>
                            <th className="py-2 px-2 text-left w-36">{L('Placement', 'التركيبة', 'Placement')}</th>
                            {tailles.map(t => <th key={t} className="py-2 px-1 text-center text-emerald-700 dark:text-emerald-300 min-w-[44px]">{t}</th>)}
                            <th className="py-2 px-2 text-center w-14" title={L('Pieces par pli', 'قطع في الطيّة', 'Pieces per ply')}>{L('Pcs/pli', 'قطعة/طيّة', 'Pcs/ply')}</th>
                            <th className="py-2 px-2 text-left min-w-[200px]">{L('Trace PLT', 'ملف PLT', 'PLT marker')}</th>
                            <th className="py-2 px-2 text-center w-20" title={L('Longueur du trace = consommation d’un pli', 'طول التفصيلة = استهلاك الطيّة', 'Marker length = one ply')}>{L('Long. (m)', 'الطول (م)', 'Length (m)')}</th>
                            <th className="py-2 px-2 text-center w-20" title={L('Tissu d’une piece : longueur du trace / pieces par pli', 'ثوب القطعة الواحدة: طول التفصيلة ÷ قطع الطيّة', 'Fabric per piece: marker length / pieces per ply')}>{L('Conso/pc', 'استهلاك/قطعة', 'Use/pc')}</th>
                            <th className="py-2 px-2 text-center w-16">{L('Plis max', 'أقصى طيّات', 'Max plies')}</th>
                            <th className="py-2 px-2 text-center w-24" title={L('Tissu de tous les matelas de ce placement', 'ثوب كل مفرشات هذه التركيبة', 'Fabric of all lays of this placement')}>{L('Matelas · m', 'مفرشات · م', 'Lays · m')}</th>
                            <th className="py-2 px-2 text-center w-20"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                        {placements.length === 0 && (
                            <tr>
                                <td colSpan={tailles.length + 9} className="py-6 text-center text-[12px] text-slate-400 dark:text-dk-muted">
                                    {L('Aucun placement. Ajoutez « XS-M », « XS a M » ou « XS×2 », puis deposez son trace PLT.', 'لا توجد تركيبات. أضف «XS-M» أو «XS a M» أو «XS×2» ثم ضع ملف PLT الخاص بها.', 'No placement yet. Add "XS-M", "XS a M" or "XS×2", then drop its PLT.')}
                                </td>
                            </tr>
                        )}
                        {placements.map((p, i) => {
                            const pcs = Object.values(p.ratios || {}).reduce((s, v) => s + (Number(v) || 0), 0);
                            const brouillon = brouillons[p.id];
                            const nomInvalide = brouillon !== undefined && brouillon.trim() !== '' && !lireNotation(brouillon, tailles);
                            return (
                                <tr key={p.id} className="align-top hover:bg-slate-50 dark:hover:bg-dk-elevated/40">
                                    <td className="py-1 px-2">
                                        <input
                                            value={p.code || ''}
                                            onChange={e => onModifier(p.id, { code: e.target.value.toUpperCase().replace(/\s+/g, '') || undefined })}
                                            placeholder="TE-01"
                                            className="w-full h-8 px-2 rounded border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg text-[11px] font-bold uppercase text-slate-700 dark:text-dk-text outline-none focus:border-indigo-400 focus:bg-white"
                                        />
                                    </td>
                                    <td className="py-1 px-2">
                                        <input
                                            {...cellule(i, 0)}
                                            value={brouillon ?? p.nom}
                                            onChange={e => {
                                                const v = e.target.value;
                                                setBrouillons(b => ({ ...b, [p.id]: v }));
                                                const ratios = lireNotation(v, tailles);
                                                onModifier(p.id, ratios ? { nom: v.trim(), ratios } : { nom: v });
                                            }}
                                            onBlur={() => setBrouillons(b => { const n = { ...b }; delete n[p.id]; return n; })}
                                            placeholder="XS-M"
                                            className={`w-full h-8 px-2 rounded border text-[12px] font-bold uppercase outline-none ${nomInvalide ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg text-indigo-700 dark:text-indigo-300 focus:border-indigo-400 focus:bg-white'}`}
                                            title={L('« XS-M » = XS et M · « XS a M » = de XS a M · « XS×2 » = deux XS', '«XS-M» = XS وM فقط · «XS a M» = من XS إلى M · «XS×2» = قطعتان XS', '"XS-M" = XS and M · "XS a M" = XS to M · "XS×2" = two XS')}
                                        />
                                    </td>
                                    {tailles.map((t, ti) => (
                                        <td key={t} className="py-1 px-1">
                                            <input
                                                {...cellule(i, ti + 1)}
                                                type="number"
                                                min="0"
                                                value={p.ratios?.[t] || ''}
                                                onChange={e => {
                                                    const ratios = { ...p.ratios, [t]: Math.max(0, Math.round(Number(e.target.value) || 0)) };
                                                    if (!ratios[t]) delete ratios[t];
                                                    onModifier(p.id, { ratios, nom: nomPlacement(ratios, tailles) });
                                                }}
                                                placeholder="·"
                                                className={`${champNombre} ${p.ratios?.[t] ? 'bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300' : ''}`}
                                            />
                                        </td>
                                    ))}
                                    <td className="py-1 px-2 text-center font-bold tabular-nums text-slate-700 dark:text-dk-text-soft">{pcs || '—'}</td>
                                    <td
                                        className={`py-1 px-2 ${survol === p.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                                        onDragOver={e => { e.preventDefault(); setSurvol(p.id); }}
                                        onDragLeave={() => setSurvol(null)}
                                        onDrop={e => { e.preventDefault(); e.stopPropagation(); setSurvol(null); setSurvolTable(false); const f = e.dataTransfer.files?.[0]; if (f) adopterFichier(p.id, f); }}
                                    >
                                        {p.fichier ? (
                                            <div className="flex flex-col gap-0.5">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <FileText className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                                    <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 truncate" title={p.fichier.nom}>{p.fichier.nom}</span>
                                                    <button type="button" onClick={() => { cibleFichier.current = p.id; inputRef.current?.click(); }} className="ml-auto shrink-0 p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" title={L('Remplacer le trace', 'استبدال الملف', 'Replace trace')}>
                                                        <Upload className="w-3 h-3" />
                                                    </button>
                                                    <button type="button" onClick={() => onModifier(p.id, { fichier: undefined })} className="shrink-0 p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50" title={L('Retirer le trace', 'إزالة الملف', 'Remove trace')}>
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <div className="flex flex-wrap gap-1 text-[9px] font-semibold text-slate-500 dark:text-dk-muted">
                                                    {p.laizeCm ? <span className="px-1 rounded bg-slate-100 dark:bg-dk-elevated">LA {p.laizeCm} cm</span> : null}
                                                    {p.efficience ? <span className="px-1 rounded bg-slate-100 dark:bg-dk-elevated">E {p.efficience}%</span> : null}
                                                    {rouleauM && p.longueurM ? <span className="px-1 rounded bg-slate-100 dark:bg-dk-elevated" title={L('Plis qu\u2019un rouleau donne', 'طيّات يعطيها الرولو', 'Plies per roll')}>{Math.floor(rouleauM / (p.longueurM + 0.03))} {L('plis/rouleau', 'طيّة/رولو', 'plies/roll')}</span> : null}
                                                </div>
                                                {laizeTissuCm && p.laizeCm && p.laizeCm > laizeTissuCm + 0.5 ? (
                                                    <div className="flex items-center gap-1 mt-0.5 px-1.5 py-1 rounded bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-[10px] font-semibold text-rose-700 dark:text-rose-300">
                                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                                        {L(`Trace ${p.laizeCm} cm plus large que le tissu (${laizeTissuCm} cm)`, `التفصيلة ${p.laizeCm} سم أعرض من الثوب (${laizeTissuCm} سم)`, `Marker ${p.laizeCm} cm wider than fabric (${laizeTissuCm} cm)`)}
                                                    </div>
                                                ) : laizeTissuCm && p.laizeCm && laizeTissuCm - p.laizeCm >= 2 ? (
                                                    <div className="mt-0.5 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 text-[10px] font-semibold text-amber-700 dark:text-amber-300" title={L('Bande de tissu non utilisee a chaque pli', 'شريط من الثوب لا يُستعمل في كل طيّة', 'Unused fabric strip on every ply')}>
                                                        {L('Perte en largeur', 'ضياع في العرض', 'Width loss')} {(laizeTissuCm - p.laizeCm).toFixed(1)} cm ({(((laizeTissuCm - p.laizeCm) / laizeTissuCm) * 100).toFixed(1)}%)
                                                    </div>
                                                ) : null}
                                                {(() => {
                                                    const trace = taillesDuTrace(p, tailles);
                                                    if (!trace || memesRatios(p.ratios || {}, trace)) return null;
                                                    const pcsTrace = Object.values(trace).reduce((a, v) => a + (Number(v) || 0), 0);
                                                    return (
                                                        <div className="mt-0.5 px-1.5 py-1 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                                            <div className="flex items-start gap-1">
                                                                <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0 mt-0.5" />
                                                                <span className="text-[10px] font-semibold text-amber-800 dark:text-amber-300 leading-tight">
                                                                    {L('Le fichier contient', 'الملف فيه', 'The file holds')} <b className="uppercase">{nomPlacement(trace, tailles)}</b> ({pcsTrace} {L('pc/pli', 'قطعة/طيّة', 'pc/ply')}), {L('la ligne dit', 'والسطر يقول', 'the row says')} <b className="uppercase">{nomPlacement(p.ratios || {}, tailles) || '—'}</b> ({pcs} {L('pc/pli', 'قطعة/طيّة', 'pc/ply')}).
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-2 mt-1">
                                                                <span className="text-[9px] text-amber-700 dark:text-amber-400">{L('Mauvais fichier ? Remplacez-le.', 'ملف خاطئ؟ استبدله.', 'Wrong file? Replace it.')}</span>
                                                                <button type="button" onClick={() => onModifier(p.id, { ratios: { ...trace }, nom: nomPlacement(trace, tailles), taillesTrace: trace })} className="shrink-0 h-6 px-2 rounded bg-amber-600 text-white text-[10px] font-bold hover:bg-amber-700">
                                                                    {L('Prendre les tailles du fichier', 'اعتماد مقاسات الملف', 'Use the file sizes')}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => { cibleFichier.current = p.id; inputRef.current?.click(); }}
                                                    className="w-full h-8 flex items-center justify-center gap-1.5 rounded border border-dashed border-slate-300 dark:border-dk-border text-[11px] font-semibold text-slate-500 hover:text-indigo-600 hover:border-indigo-300"
                                                >
                                                    <Upload className="w-3.5 h-3.5" /> {L('Deposer le .plt', 'ضع ملف plt', 'Drop the .plt')}
                                                </button>
                                                {(suggestions?.(p) || []).slice(0, 2).map(sg => (
                                                    <button
                                                        key={sg.placement.id}
                                                        type="button"
                                                        onClick={() => onModifier(p.id, {
                                                            fichier: sg.placement.fichier,
                                                            longueurM: sg.placement.longueurM,
                                                            laizeCm: sg.placement.laizeCm,
                                                            efficience: sg.placement.efficience,
                                                            taillesTrace: sg.placement.taillesTrace,
                                                            numerotation: sg.placement.numerotation,
                                                            maxPlis: p.maxPlis ?? sg.placement.maxPlis,
                                                        })}
                                                        className="w-full min-h-7 px-1.5 py-1 flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 text-left"
                                                        title={sg.placement.fichier?.nom}
                                                    >
                                                        <RotateCcw className="w-3 h-3 shrink-0" />
                                                        <span className="truncate">{L('Reprendre le trace de', 'استعمال ملف', 'Reuse trace from')} {sg.source}{sg.placement.efficience ? ` · E ${sg.placement.efficience}%` : ''}{sg.placement.longueurM ? ` · ${sg.placement.longueurM.toFixed(2)} m` : ''}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-1 px-1">
                                        <input
                                            {...cellule(i, tailles.length + 1)}
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={p.longueurM || ''}
                                            onChange={e => onModifier(p.id, { longueurM: Number(e.target.value) || 0 })}
                                            placeholder="0.00"
                                            className={champNombre}
                                        />
                                    </td>
                                    <td className="py-1 px-1 text-center tabular-nums text-[11px] font-semibold text-slate-600 dark:text-dk-text-soft">
                                        {p.longueurM && pcs ? `${((p.longueurM / pcs) * 100).toFixed(1)} cm` : '—'}
                                    </td>
                                    <td className="py-1 px-1">
                                        <input
                                            {...cellule(i, tailles.length + 2)}
                                            type="number"
                                            min="1"
                                            value={p.maxPlis || ''}
                                            onChange={e => onModifier(p.id, { maxPlis: Math.max(0, Math.round(Number(e.target.value) || 0)) || undefined })}
                                            placeholder={String(maxPlisDefaut)}
                                            className={champNombre}
                                        />
                                    </td>
                                    <td className="py-1 px-1 text-center tabular-nums text-[11px]">
                                        <span className="font-bold text-slate-700 dark:text-dk-text-soft">{nbMatelas[p.id] || 0}</span>
                                        <span className="text-slate-400"> · </span>
                                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">{(consoTotale[p.id] || 0).toFixed(1)}</span>
                                    </td>
                                    <td className="py-1 px-1 text-center whitespace-nowrap">
                                        <button
                                            type="button"
                                            disabled={!p.fichier}
                                            onClick={() => onApercu(p)}
                                            className="p-1.5 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-30"
                                            title={L('Voir ou le numero sera ecrit dans chaque piece', 'معاينة موضع الرقم في كل قطعة', 'See where the number goes in each piece')}
                                        >
                                            <Eye className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onSupprimer(p)}
                                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"
                                            title={nbMatelas[p.id] ? L(`Supprimer (${nbMatelas[p.id]} matelas l'utilisent)`, `حذف (${nbMatelas[p.id]} مفرشة تستعملها)`, `Delete (${nbMatelas[p.id]} lays use it)`) : L('Supprimer', 'حذف', 'Delete')}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
                <button type="button" onClick={onAjouter} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-dk-border text-[11px] font-semibold text-slate-600 dark:text-dk-text-soft hover:border-indigo-300 hover:text-indigo-600">
                    <Plus className="w-3.5 h-3.5" /> {L('Ajouter un placement', 'إضافة تركيبة', 'Add placement')}
                </button>
                {onAjouterAvec && (
                    <button type="button" onClick={() => multiRef.current?.click()} className="h-8 px-3 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100" title={L('Tous les PLT du client d\u2019un coup : chacun rejoint son placement par son code (TE-00) ou ses tailles. On peut aussi les glisser sur le tableau.', 'كل ملفات PLT دفعة واحدة: كل ملف يلتحق بتركيبته برمزه أو مقاساته. يمكن أيضاً سحبها فوق الجدول.', 'All client PLTs at once')}>
                        <Files className="w-3.5 h-3.5" /> {L('Deposer plusieurs traces', 'إضافة عدّة ملفات', 'Drop several traces')}
                    </button>
                )}
                {placements.some(p => !p.fichier) && placements.length > 0 && (() => {
                    const sans = placements.filter(p => !p.fichier).map(p => (p.nom || '—').toUpperCase());
                    return (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            {sans.length === placements.length
                                ? L('Aucun placement n\u2019a encore son trace PLT : deposez-les pour numeroter les matelas.', 'لا توجد أي تركيبة بملف PLT بعد: ضعها لترقيم المفرشات.', 'No placement has its PLT yet.')
                                : `${L('Sans trace PLT (pas de numerotation) :', 'بلا ملف PLT (لا ترقيم):', 'No PLT (no numbering):')} ${sans.join(', ')}`}
                        </span>
                    );
                })()}
            </div>
        </div>
    );
}
