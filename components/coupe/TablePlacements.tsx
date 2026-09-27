/**
 * Premier tableau d'une matiere : ses placements.
 *
 * Une ligne = un melange de tailles par pli (« XS-M », « XS a M », « XS×2 »),
 * le trace PLT retravaille dans Optitex, sa longueur et le nombre de plis
 * maximum pour ce placement. Deposer le PLT remplit seul les tailles, la
 * laize, la longueur et l'efficience ecrites par Optitex dans l'en-tete.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Eye, FileText, Plus, Trash2, Upload, X, AlertTriangle, RotateCcw, Files } from 'lucide-react';
import type { LaizeCoupe, MatelasFichier, PlacementCoupe } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { nomPlacement } from '../../lib/planMatelas';
import { associerTailles, lireEntete, lireNotation } from '../../lib/ordreCoupe';
import { analyserFichier, analyserTexte } from '../../lib/numerotationPlt';
import { decoderOctets } from '../../lib/hpgl';
import { grilleClavier } from './grilleClavier';
import { AMORCE_PAR_PLI_M } from '../../lib/coupeAtelier';

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
    /** Laizes du tissu recues pour cet ordre (une seule tant qu'elle n'a pas change) et celle en cours. */
    laizes?: LaizeCoupe[];
    laizeActive?: string;
    /** Le tissu change de laize : l'appelant demande confirmation avant de basculer. */
    onChoisirLaize?: (laizeId: string) => void;
    /** « + » : le tissu arrive a une nouvelle laize (cm). */
    onCreerLaize?: (cm: number) => void;
    /** Matelas deja coupes, par placement, sur la laize en cours : leur trace ne se remplace pas par un autre de laize differente. */
    nbCoupes?: Record<string, number>;
    /** Traces deja faits pour ce modele dans d'autres ordres, avec le meme melange de tailles. */
    suggestions?: (p: PlacementCoupe) => { source: string; placement: PlacementCoupe }[];
    onAjouter: () => void;
    /** Code de la matiere (TE, FO...) : les codes de ses traces commencent par lui. */
    prefixeCode?: string;
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

/** « L1,M1,S1|L1 » : les tailles du fichier et celles de la ligne, pour retenir un ecart voulu. */
const cleTailles = (r: Record<string, number>) => Object.entries(r).filter(([, v]) => Number(v) > 0).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}${v}`).join(',');
const signatureEcart = (trace: Record<string, number>, ratios: Record<string, number>) => `${cleTailles(trace)}|${cleTailles(ratios)}`;

/**
 * Tailles ecrites dans l'en-tete du trace. Lues aussi pour les fichiers
 * deposes avant ce controle : un vieux fichier n'echappe pas a la verification.
 */
const lectureTrace = (p: PlacementCoupe, tailles: string[]): { ratios: Record<string, number>; inconnues: string[]; brut: Record<string, number> } | null => {
    let brut = p.taillesFichier && Object.keys(p.taillesFichier).length ? p.taillesFichier : null;
    if (!brut && p.taillesTrace && Object.keys(p.taillesTrace).length) return { ratios: p.taillesTrace, inconnues: [], brut: p.taillesTrace };
    if (!brut && p.fichier?.data) {
        try {
            const a = analyserFichier(p.fichier);
            const e = a ? lireEntete(a.entete) : null;
            if (e?.tailles && Object.keys(e.tailles).length) brut = e.tailles;
        } catch { /* illisible : rien a comparer */ }
    }
    if (!brut) return null;
    const { ratios, inconnues } = associerTailles(brut, tailles);
    return { ratios, inconnues, brut };
};

/** Tailles du trace rapprochees de la commande (null si le fichier n'en dit rien ou si aucune n'y figure). */
const taillesDuTrace = (p: PlacementCoupe, tailles: string[]): Record<string, number> | null => {
    const l = lectureTrace(p, tailles);
    return l && Object.keys(l.ratios).length ? l.ratios : null;
};

/** « XS×2 » tel que le fichier l'ecrit, meme pour une taille que la commande n'a pas. */
const nomBrut = (brut: Record<string, number>) => nomPlacement(brut, Object.keys(brut));

/**
 * Ce qui cloche entre le trace PLT et sa ligne, en une phrase — ou null.
 * Sert aussi au tableau des matelas : un trace faux ne doit pas partir au
 * traceur sous un nom de matelas propre, sans que rien ne le signale.
 */
export function problemeTrace(p: PlacementCoupe, tailles: string[]): string | null {
    if (!p.fichier) return null;
    const lu = lectureTrace(p, tailles);
    if (!lu) return null;
    if (lu.inconnues.length) return `Trace ${nomBrut(lu.brut).toUpperCase()} : ${lu.inconnues.join(', ')} absente(s) de la commande`;
    const trace = Object.keys(lu.ratios).length ? lu.ratios : null;
    if (!trace || memesRatios(p.ratios || {}, trace)) return null;
    if (p.ecartAccepte === signatureEcart(trace, p.ratios || {})) return null;
    return `Trace ${nomPlacement(trace, tailles).toUpperCase()} different de la ligne ${(p.nom || nomPlacement(p.ratios || {}, tailles)).toUpperCase()}`;
}

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

export default function TablePlacements({ placements, tailles, nbMatelas, consoTotale, maxPlisDefaut, rouleauM, laizeTissuCm, laizes = [], laizeActive, onChoisirLaize, onCreerLaize, nbCoupes, suggestions, onAjouter, onAjouterAvec, prefixeCode = 'TE', onModifier, onSupprimer, onApercu, onMessage }: Props) {
    const { lang } = useLang();
    const inputRef = useRef<HTMLInputElement>(null);
    const cibleFichier = useRef<string | null>(null);
    const [survol, setSurvol] = useState<string | null>(null);
    // Saisie du nom en cours : on n'ecrase pas ce que l'operateur tape tant que ce n'est pas lisible.
    const [brouillons, setBrouillons] = useState<Record<string, string>>({});
    /*
     * Modele ecrit dans l'en-tete de chaque trace (« 1384--------GG--------L » -> 1384,
     * « 4-57PHR » -> 4-57PHR). Un trace d'un autre modele glisse parmi les autres
     * coupe les pieces d'un autre vetement : on le signale face a la majorite.
     */
    const autreModele = useMemo(() => {
        const racine: Record<string, string> = {};
        for (const p of placements) {
            if (!p.fichier?.data) continue;
            try {
                const a = analyserFichier(p.fichier);
                const m = a ? lireEntete(a.entete).modele : undefined;
                const r = m ? m.split(/-{2,}/)[0].trim().toUpperCase() : '';
                if (r) racine[p.id] = r;
            } catch { /* illisible : rien a comparer */ }
        }
        const compte: Record<string, number> = {};
        for (const r of Object.values(racine)) compte[r] = (compte[r] || 0) + 1;
        const [majorite, n] = Object.entries(compte).sort((a, b) => b[1] - a[1])[0] || ['', 0];
        const out: Record<string, { lui: string; autres: string }> = {};
        if (n < 2) return out;
        for (const [id, r] of Object.entries(racine)) if (r !== majorite) out[id] = { lui: r, autres: majorite };
        return out;
    }, [placements]);

    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });

    const memeLaize = (a?: number, b?: number) => !(a && b) || Math.abs(a - b) <= 0.5;
    const [nouvelleLaize, setNouvelleLaize] = useState<number | '' | null>(null);
    /**
     * Un placement dont des matelas sont deja coupes sur la laize en cours ne
     * prend pas un trace d'une autre laize : ce serait refaire en silence le trace
     * de ces matelas. Il faut d'abord creer la nouvelle laize (« + »).
     */
    const refusLaize = (p: PlacementCoupe, laizeFichier?: number): string | null => {
        if (!((nbCoupes?.[p.id] || 0) > 0) || !p.fichier || memeLaize(p.laizeCm, laizeFichier)) return null;
        return `${p.code || p.nom} : ${L('trace en', 'الملف بعرض', 'marker at')} ${laizeFichier} cm, ${L('le tissu en cours est a', 'والثوب الحالي', 'current fabric is')} ${p.laizeCm} cm ${L(`et ${nbCoupes?.[p.id]} matelas sont deja coupes avec l'ancien trace. Creez la laize ${laizeFichier} cm avec « + », puis deposez-le.`, `و${nbCoupes?.[p.id]} مفرشة قُصّت بالملف القديم. أنشئ العرض ${laizeFichier} سم بـ «+» ثم ضعه.`, `and lays were already cut with the old one. Create the ${laizeFichier} cm width with "+" first.`)}`;
    };

    /** Rend les tailles du fichier absentes de la commande ; `silencieux` : l'appelant fait un seul message pour tout un lot. */
    const adopterFichier = async (id: string, f: File, connu?: PlacementCoupe, silencieux = false): Promise<string[]> => {
        const p = connu || placements.find(x => x.id === id);
        if (!p) return [];
        const dire: typeof onMessage = (t, type) => { if (!silencieux || type === 'error') onMessage(t, type); };
        if (!/\.(plt|hpgl|hgl|prn)$/i.test(f.name)) {
            dire(L('Seuls les traces .plt sont acceptes ici.', 'تُقبل هنا ملفات plt فقط.', 'Only .plt traces here.'), 'error');
            return [];
        }
        if (f.size > 15 * 1024 * 1024) {
            dire(L('Trace trop volumineux (15 Mo au plus).', 'الملف كبير جداً (15 ميغابايت كحدّ أقصى).', 'Trace too large (max 15 MB).'), 'error');
            return [];
        }
        try {
            const [data, octets] = await Promise.all([lireDataUrl(f), lireOctets(f)]);
            const analyse = analyserTexte(decoderOctets(octets));
            const entete = lireEntete(analyse.entete);
            const refus = refusLaize(p, entete.laizeCm);
            if (refus) { onMessage(refus, 'error'); return []; }
            const fichier: MatelasFichier = { id: `FIL-${Date.now()}-${Math.floor(Math.random() * 1000)}`, nom: f.name, format: 'PLT', data, size: f.size };
            const patch: Partial<PlacementCoupe> = {
                fichier,
                // Nouveau fichier : les retouches de numeros visaient les pieces de l'ancien.
                numerotation: p.numerotation ? { ...p.numerotation, exclus: [], ajustements: {} } : undefined,
            };
            if (entete.longueurM) patch.longueurM = Number(entete.longueurM.toFixed(4));
            if (entete.laizeCm) patch.laizeCm = entete.laizeCm;
            if (entete.efficience) patch.efficience = entete.efficience;
            let absentes: string[] = [];
            if (entete.tailles) {
                const { ratios, inconnues } = associerTailles(entete.tailles, tailles);
                absentes = inconnues;
                patch.taillesTrace = ratios;
                patch.taillesFichier = { ...entete.tailles };
                const actuel = p.ratios || {};
                const vide = !Object.values(actuel).some(v => (Number(v) || 0) > 0);
                if (Object.keys(ratios).length && vide && !inconnues.length) {
                    // Placement encore vide : le trace dit ce qu'il contient.
                    patch.ratios = ratios;
                    patch.nom = nomPlacement(ratios, tailles);
                } else if (vide && inconnues.length) {
                    // Taille que la commande n'a pas : le nom dit ce que contient le fichier, les quantites attendent.
                    patch.nom = nomBrut(entete.tailles);
                } else if (Object.keys(ratios).length && !memesRatios(actuel, ratios)) {
                    // Placement deja defini : un fichier different ne change jamais ses matelas en silence.
                    dire(`${L('Attention : ce trace contient', 'انتبه: هذا الملف يحتوي', 'Warning: this trace holds')} ${nomPlacement(ratios, tailles)} ${L('mais le placement est', 'لكن التركيبة هي', 'but the placement is')} ${nomPlacement(actuel, tailles)}. ${L('Tailles gardees : verifiez le fichier.', 'أُبقيت المقاسات: تحقّق من الملف.', 'Sizes kept: check the file.')}`, 'error');
                }
            }
            onModifier(id, patch);
            if (absentes.length) {
                if (!silencieux) onMessage(`${f.name} : ${L('taille(s)', 'مقاس(ات)', 'size(s)')} ${absentes.join(', ')} ${L('absente(s) de la commande. Ajoutez-la aux tailles du modele.', 'غير موجودة في الطلب. أضفها إلى مقاسات الموديل.', 'not in the order. Add it to the model sizes.')}`, 'error');
            } else if (entete.longueurM || entete.tailles) {
                dire(L('Trace lu : tailles, longueur et laize remplies depuis le fichier.', 'قُرئ الملف: المقاسات والطول والعرض مُلئت منه.', 'Trace read: sizes, length and width filled in.'), 'success');
            }
            return absentes;
        } catch {
            dire(L('Trace illisible.', 'تعذّرت قراءة الملف.', 'Unreadable trace.'), 'error');
            return [];
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
        const refuses: string[] = [];
        let relies = 0, crees = 0;
        const absentes = new Map<string, string[]>();
        for (const f of plts) {
            let ratios: Record<string, number> = {};
            let brut: Record<string, number> = {};
            let laizeFichier: number | undefined;
            try {
                const e = lireEntete(analyserTexte(decoderOctets(await lireOctets(f))).entete);
                if (e.tailles) { brut = e.tailles; ratios = associerTailles(e.tailles, tailles).ratios; }
                laizeFichier = e.laizeCm;
            } catch { /* illisible : adopterFichier le dira */ }
            const code = codeDuNomFichier(f.name);
            const cible = (code && placements.find(p => !pris.has(p.id) && (p.code || '').toUpperCase() === code))
                || (Object.keys(ratios).length ? placements.find(p => !pris.has(p.id) && !p.fichier && memesRatios(p.ratios || {}, ratios)) : undefined);
            let manque: string[] = [];
            if (cible && refusLaize(cible, laizeFichier)) {
                pris.add(cible.id);
                refuses.push(cible.code || cible.nom);
            } else if (cible) {
                pris.add(cible.id);
                manque = await adopterFichier(cible.id, f, cible, true);
                relies++;
            } else if (onAjouterAvec) {
                const nom = Object.keys(ratios).length ? nomPlacement(ratios, tailles) : Object.keys(brut).length ? nomBrut(brut) : (code || '');
                const init: Partial<PlacementCoupe> = { code, ratios, nom };
                const id = onAjouterAvec(init);
                pris.add(id);
                manque = await adopterFichier(id, f, { id, tissu: '', nom, ratios, code }, true);
                crees++;
            }
            manque.forEach(t => absentes.set(t, [...(absentes.get(t) || []), f.name]));
        }
        const bilan = `${plts.length} ${L('trace(s) :', 'ملف:', 'trace(s):')} ${relies} ${L('relie(s) a leur placement', 'رُبط بتركيبته', 'linked')}${crees ? `, ${crees} ${L('nouveau(x) placement(s)', 'تركيبة جديدة', 'new placement(s)')}` : ''}.${refuses.length ? ` ${refuses.length} ${L('refuse(s)', 'مرفوض', 'refused')} (${refuses.join(', ')}) : ${L('laize differente de celle du tissu en cours, alors que des matelas sont deja coupes. Creez la nouvelle laize avec « + ».', 'عرض مختلف عن الثوب الحالي وقد قُصّت مفرشات. أنشئ العرض الجديد بـ «+».', 'other width while lays are already cut. Create the new width with "+".')}` : ''}`;
        if (absentes.size || refuses.length) {
            onMessage(`${bilan} ${L('Taille(s) absente(s) de la commande :', 'مقاسات غير موجودة في الطلب:', 'Sizes not in the order:')} ${[...absentes.keys()].join(', ')} — ${L('ajoutez-la aux tailles du modele, leurs placements restent sans quantite en attendant.', 'أضفها إلى مقاسات الموديل، وتبقى تركيباتها بلا كمية حتى ذلك.', 'add it to the model sizes; those placements stay empty meanwhile.')}`, 'error');
        } else {
            onMessage(bilan, 'success');
        }
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
            {/* Laize du tissu : une seule tant qu'elle ne change pas ; « + » quand le tissu arrive a une autre largeur. */}
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mr-0.5">{L('Laize du tissu', 'عرض الثوب', 'Fabric width')}</span>
                {laizes.length === 0 && (
                    <span className="h-8 px-2.5 inline-flex items-center rounded-md border border-dashed border-slate-300 text-[11px] text-slate-400">{L('non saisie', 'غير مُدخل', 'not set')}</span>
                )}
                {laizes.map(z => {
                    const actif = z.id === laizeActive;
                    return (
                        <button
                            key={z.id}
                            type="button"
                            onClick={() => { if (!actif) onChoisirLaize?.(z.id); }}
                            disabled={actif || !onChoisirLaize}
                            className={`h-8 px-3 inline-flex items-center gap-1 rounded-md border text-[12px] font-bold transition-colors ${actif ? 'bg-sky-600 border-sky-600 text-white cursor-default' : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft hover:border-sky-400'}`}
                            title={actif
                                ? L('Laize du tissu en cours : ses traces servent au calcul et au suivi', 'عرض الثوب الحالي: ملفاته تُستعمل في الحساب والمتابعة', 'Current fabric width')
                                : L('Revenir a cette laize (a confirmer)', 'الرجوع إلى هذا العرض (بعد التأكيد)', 'Switch to this width (to confirm)')}
                        >
                            {z.cm} cm
                        </button>
                    );
                })}
                {onCreerLaize && (nouvelleLaize === null ? (
                    <button
                        type="button"
                        onClick={() => setNouvelleLaize('')}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-dashed border-slate-300 dark:border-dk-border text-slate-500 hover:border-sky-400 hover:text-sky-600"
                        title={L('Le tissu arrive a une autre laize : creer la nouvelle', 'وصل الثوب بعرض آخر: أنشئ العرض الجديد', 'Fabric arrives at another width')}
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                ) : (
                    <span className="inline-flex items-center gap-1">
                        <input
                            autoFocus
                            type="number"
                            inputMode="decimal"
                            value={nouvelleLaize}
                            onChange={e => setNouvelleLaize(e.target.value === '' ? '' : Number(e.target.value))}
                            onKeyDown={e => {
                                if (e.key === 'Escape') setNouvelleLaize(null);
                                if (e.key === 'Enter' && typeof nouvelleLaize === 'number' && nouvelleLaize > 0) { onCreerLaize(nouvelleLaize); setNouvelleLaize(null); }
                            }}
                            placeholder="cm"
                            className="w-20 h-8 px-2 rounded-md border border-sky-300 bg-white dark:bg-dk-bg text-[12px] font-bold outline-none focus:border-sky-500"
                        />
                        <button
                            type="button"
                            disabled={!(typeof nouvelleLaize === 'number' && nouvelleLaize > 0)}
                            onClick={() => { if (typeof nouvelleLaize === 'number' && nouvelleLaize > 0) { onCreerLaize(nouvelleLaize); setNouvelleLaize(null); } }}
                            className="h-8 px-2.5 rounded-md bg-sky-600 text-white text-[11px] font-semibold disabled:opacity-40"
                        >
                            {L('Creer', 'إنشاء', 'Create')}
                        </button>
                        <button type="button" onClick={() => setNouvelleLaize(null)} className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100"><X className="w-3.5 h-3.5" /></button>
                    </span>
                ))}
            </div>
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
                            <th className="py-2 px-2 text-center w-16" title={L('Plis au plus dans un matelas de ce placement (hauteur de la table, lame) : au-dela, le calcul fait un matelas de plus', 'أقصى عدد طيّات في مفرشة واحدة من هذه التركيبة؛ ما زاد يصير مفرشة أخرى', 'Most plies in one lay of this placement; beyond that, another lay')}>{L('Plis max', 'أقصى طيّات', 'Max plies')}</th>
                            <th className="py-2 px-2 text-center w-24" title={L('Nombre de matelas de ce placement, et le tissu qu’ils consomment ensemble (plis × (longueur + 3 cm d’amorce))', 'عدد مفرشات هذه التركيبة، والثوب الذي تستهلكه كلها (الطيّات × (الطول + 3 سم))', 'Number of lays of this placement, and the fabric they use together')}>{L('Matelas · m', 'مفرشات · م', 'Lays · m')}</th>
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
                                            placeholder={`${prefixeCode}-${String(i + 1).padStart(2, '0')}`}
                                            className="w-full min-w-[64px] h-8 px-2 rounded border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg text-[11px] font-bold uppercase text-slate-700 dark:text-dk-text outline-none focus:border-indigo-400 focus:bg-white"
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
                                                    {rouleauM && p.longueurM ? <span className="px-1 rounded bg-slate-100 dark:bg-dk-elevated" title={L('Plis qu\u2019un rouleau donne', 'طيّات يعطيها الرولو', 'Plies per roll')}>{Math.floor(rouleauM / (p.longueurM + AMORCE_PAR_PLI_M))} {L('plis/rouleau', 'طيّة/رولو', 'plies/roll')}</span> : null}
                                                </div>
                                                {autreModele[p.id] && (
                                                    <div className="flex items-start gap-1 mt-0.5 px-1.5 py-1 rounded bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-[10px] font-semibold text-rose-700 dark:text-rose-300 leading-tight">
                                                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                                                        <span>{L('Trace du modele', 'ملف الموديل', 'Marker of model')} <b>{autreModele[p.id].lui}</b> — {L('les autres traces sont', 'باقي الملفات من', 'the others are')} <b>{autreModele[p.id].autres}</b></span>
                                                    </div>
                                                )}
                                                {(() => {
                                                    // Le meme trace sur deux lignes : le calcul les voit comme deux placements
                                                    // et partage les plis entre eux sans raison.
                                                    const nom = p.fichier!.nom.trim().toUpperCase();
                                                    // Meme nom mais autre laize : c'est le trace refait pour un autre tissu, pas un doublon.
                                                    const autre = placements.find(x => x.id !== p.id && x.fichier && x.fichier.nom.trim().toUpperCase() === nom && memeLaize(x.laizeCm, p.laizeCm));
                                                    if (!autre) return null;
                                                    const nomAutre = autre.code || nomPlacement(autre.ratios || {}, tailles);
                                                    return (
                                                        <div className="flex items-center gap-1 mt-0.5 px-1.5 py-1 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-[10px] font-semibold text-amber-700 dark:text-amber-300" title={L('Deux lignes avec le meme fichier : gardez-en une, sinon ses matelas se repartissent sur les deux.', 'سطران بنفس الملف: احتفظ بواحد، وإلا توزّعت مفرشاته على الاثنين.', 'Two rows with the same file: keep one.')}>
                                                            <AlertTriangle className="w-3 h-3 shrink-0" />
                                                            {L('Meme fichier que', 'نفس ملف', 'Same file as')} {nomAutre}
                                                        </div>
                                                    );
                                                })()}
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
                                                    const lu = lectureTrace(p, tailles);
                                                    if (!lu || !lu.inconnues.length) return null;
                                                    return (
                                                        <div className="flex items-start gap-1 mt-0.5 px-1.5 py-1 rounded bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-[10px] font-semibold text-rose-700 dark:text-rose-300 leading-tight">
                                                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                                                            <span>
                                                                {L('Le fichier contient', 'الملف فيه', 'The file holds')} <b className="uppercase">{nomBrut(lu.brut)}</b> : {L('taille', 'المقاس', 'size')} <b>{lu.inconnues.join(', ')}</b> {L('absente de la commande. Ajoutez-la aux tailles du modele.', 'غير موجود في الطلب. أضفه إلى مقاسات الموديل.', 'not in the order. Add it to the model sizes.')}
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
                                                {(() => {
                                                    const trace = taillesDuTrace(p, tailles);
                                                    if (!trace || memesRatios(p.ratios || {}, trace)) return null;
                                                    const pcsTrace = Object.values(trace).reduce((a, v) => a + (Number(v) || 0), 0);
                                                    const signature = signatureEcart(trace, p.ratios || {});
                                                    // Ecart declare voulu : une mention discrete, annulable, au lieu de l'alerte.
                                                    if (p.ecartAccepte === signature) return (
                                                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-400">
                                                            <span>{L('Fichier', 'الملف', 'File')} <b className="uppercase">{nomPlacement(trace, tailles)}</b> · {L('ecart voulu', 'فرق مقصود', 'intended')}</span>
                                                            <button type="button" onClick={() => onModifier(p.id, { ecartAccepte: undefined })} className="underline hover:text-slate-600" title={L('Remettre l\u2019alerte', 'إرجاع التنبيه', 'Restore the warning')}>{L('annuler', 'إلغاء', 'undo')}</button>
                                                        </div>
                                                    );
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
                                                                <div className="flex items-center gap-1 shrink-0">
                                                                    <button type="button" onClick={() => onModifier(p.id, { ecartAccepte: signature })} className="h-6 px-2 rounded border border-amber-300 bg-white dark:bg-dk-surface text-amber-800 dark:text-amber-300 text-[10px] font-bold hover:bg-amber-100" title={L('La ligne est juste telle quelle : garder ses tailles et ne plus alerter', 'السطر صحيح كما هو: تبقى مقاساته ولا يعود التنبيه', 'The row is right as is')}>
                                                                        {L('C\u2019est voulu', 'مقصود', 'Intended')}
                                                                    </button>
                                                                    <button type="button" onClick={() => onModifier(p.id, { ratios: { ...trace }, nom: nomPlacement(trace, tailles), taillesTrace: trace })} className="h-6 px-2 rounded bg-amber-600 text-white text-[10px] font-bold hover:bg-amber-700">
                                                                        {L('Prendre les tailles du fichier', 'اعتماد مقاسات الملف', 'Use the file sizes')}
                                                                    </button>
                                                                </div>
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
                                        {!(nbMatelas[p.id] > 0) ? (
                                            <span className="text-slate-300 dark:text-dk-muted" title={L('Aucun matelas ne vient de ce placement', 'لا توجد مفرشة من هذه التركيبة', 'No lay uses this placement')}>—</span>
                                        ) : (
                                            <span className="inline-flex flex-col items-center leading-tight">
                                                <span className="font-bold text-slate-700 dark:text-dk-text-soft">{nbMatelas[p.id]} <span className="font-medium text-slate-400">{L('mat.', 'مفرشة', 'lays')}</span></span>
                                                {(p.longueurM || 0) > 0
                                                    ? <span className="font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{(consoTotale[p.id] || 0).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m</span>
                                                    : <span className="font-bold text-amber-600" title={L('Sans longueur, le tissu de ces matelas ne peut pas etre calcule.', 'بلا طول لا يمكن حساب قماش هذه المفرشات.', 'Without a length the fabric of these lays cannot be computed.')}>? m</span>}
                                            </span>
                                        )}
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
