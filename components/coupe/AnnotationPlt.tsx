/**
 * Numerotation des traces de coupe.
 *
 * Le client livre un trace fini ou chaque piece porte deja son nom et sa
 * taille, mais rien qui dise a quel ordre elle appartient. L'atelier ecrivait
 * donc le numero a la main, piece par piece, toute la journee.
 *
 * Cette fenetre montre ou le traceur ecrira le numero dans chaque piece et
 * permet de le reprendre piece par piece : clic droit sur une piece, ou glisser
 * le numero a la souris. Les reglages sont gardes par placement : tous les
 * matelas qui etalent ce trace sortent avec les memes retouches.
 *
 * Deux regles tiennent tout le reste :
 *   — le trace d'origine n'est jamais redessine (voir `injecterEtiquettes`) ;
 *   — le numero ne sort pas de sa piece (voir `placerNumero`), sauf pose a la
 *     main, et alors l'alerte le dit.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileText, Download, AlertTriangle, Layers, X, Move, Send, Plus, Minus, EyeOff, RotateCcw } from 'lucide-react';
import SheetModal from '../shared/SheetModal';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import type { ReglagesNumero } from '../../types';
import { pointDansContour, type StatutPlacement } from '../../lib/placementNumero';
import {
    REGLAGES_NUMERO_DEFAUT, alertesPoses, analyserOctets, enBase64, numeroterPlt, octetsDepuisDataUrl, posesNumero,
    type AnalysePlt,
} from '../../lib/numerotationPlt';

interface Props {
    /** Numero a ecrire : celui du matelas, pas le nom du modele. */
    numeroInitial?: string;
    /** Fichier deja attache au placement, charge sans re-selection. */
    fichierInitial?: { nom: string; data: string } | null;
    /** Reglages deja enregistres pour ce placement. */
    reglagesInitiaux?: ReglagesNumero;
    /** Appele a chaque retouche : le placement les garde pour tous ses matelas. */
    onReglages?: (r: ReglagesNumero) => void;
    /** Nom du fichier sortant, quand l'ordre de coupe l'impose. */
    nomSortieImpose?: string;
    /** Depot chez le traceur (dossier relie ou serveur) ; sinon le serveur local. */
    deposer?: (nom: string, octets: Uint8Array<ArrayBuffer>) => Promise<{ ok: boolean; message: string }>;
    onClose: () => void;
}

/** Sans serveur (Vercel), personne ne peut ecrire dans le dossier du traceur. */
const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

/** Au-dela, le rendu SVG coute plus qu'il n'apporte : on allege le trait. */
const POINTS_MAX = 60000;

const COULEUR_STATUT: Record<StatutPlacement, string> = {
    ok: 'text-emerald-600 dark:text-emerald-400',
    deplace: 'text-blue-600 dark:text-blue-400',
    reduit: 'text-amber-600 dark:text-amber-400',
    force: 'text-rose-600 dark:text-rose-400',
};

type Ajustement = NonNullable<ReglagesNumero['ajustements']>[string];

export default function AnnotationPlt({ numeroInitial = '', fichierInitial = null, reglagesInitiaux, onReglages, nomSortieImpose, deposer, onClose }: Props) {
    const { lang } = useLang();
    const inputRef = useRef<HTMLInputElement>(null);
    const svgRef = useRef<SVGSVGElement>(null);

    const [nomFichier, setNomFichier] = useState('');
    const [analyse, setAnalyse] = useState<AnalysePlt | null>(null);
    const [erreur, setErreur] = useState('');
    const [survol, setSurvol] = useState(false);

    const init = reglagesInitiaux || REGLAGES_NUMERO_DEFAUT;
    const [numero, setNumero] = useState(numeroInitial);
    const [hauteurCm, setHauteurCm] = useState<number | ''>(init.hauteurCm);
    const [largeurCm, setLargeurCm] = useState<number | ''>(init.largeurCm);
    const [ecartMm, setEcartMm] = useState<number | ''>(init.ecartMm);
    const [repetitions, setRepetitions] = useState<number | ''>(init.repetitions);
    const [opacite, setOpacite] = useState(100);
    const [exclus, setExclus] = useState<Set<number>>(() => new Set(init.exclus || []));
    const [ajustements, setAjustements] = useState<Record<string, Ajustement>>(() => ({ ...(init.ajustements || {}) }));
    const [selection, setSelection] = useState<number | null>(null);
    const [menu, setMenu] = useState<{ index: number; x: number; y: number } | null>(null);
    const glisse = useRef<{ index: number; depart: { x: number; y: number }; base: { x: number; y: number } } | null>(null);

    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en, es: fr, pt: fr, tr: en });
    const nb = (v: number | '') => (typeof v === 'number' ? v : 0);

    const reglages: ReglagesNumero = useMemo(() => ({
        hauteurCm: nb(hauteurCm),
        largeurCm: nb(largeurCm),
        ecartMm: nb(ecartMm),
        repetitions: nb(repetitions) || 1,
        exclus: [...exclus].sort((a, b) => a - b),
        ajustements,
    }), [hauteurCm, largeurCm, ecartMm, repetitions, exclus, ajustements]);

    // Chaque retouche est gardee par le placement ; pas au premier rendu.
    const premier = useRef(true);
    useEffect(() => {
        if (premier.current) { premier.current = false; return; }
        if (reglages.hauteurCm > 0 && reglages.largeurCm > 0) onReglages?.(reglages);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reglages]);

    const adopter = useCallback((nom: string, buffer: ArrayBuffer, garderRetouches: boolean) => {
        try {
            const a = analyserOctets(buffer);
            if (a.lecture.etiquettes.length === 0) {
                setErreur(L(
                    "Aucun texte dans ce trace : rien ou accrocher le numero.",
                    'لا نصّ في هذا الملف، فلا موضع يُعلَّق عليه الرقم.',
                    'No text in this trace: nothing to anchor the number to.',
                ));
            }
            setNomFichier(nom);
            setAnalyse(a);
            // Un autre fichier : les index de pieces ne veulent plus rien dire.
            if (!garderRetouches) { setExclus(new Set()); setAjustements({}); }
            setSelection(null);
        } catch {
            setErreur(L('Fichier illisible.', 'تعذّرت قراءة الملف.', 'Unreadable file.'));
        }
    }, [lang]);

    const charger = useCallback((fichier: File) => {
        setErreur('');
        const reader = new FileReader();
        reader.onload = () => adopter(fichier.name, reader.result as ArrayBuffer, false);
        reader.readAsArrayBuffer(fichier);
    }, [adopter]);

    /* Le trace est deja attache au placement : on l'ouvre directement, avec
       les retouches deja faites dessus. */
    // Compare par valeur : la fenetre parente se redessine a chaque retouche enregistree.
    useEffect(() => {
        if (!fichierInitial) return;
        const buffer = octetsDepuisDataUrl(fichierInitial.data);
        if (buffer) adopter(fichierInitial.nom, buffer, true);
        else setErreur(L('Fichier attache illisible.', 'الملف المرفق غير قابل للقراءة.', 'Attached file unreadable.'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fichierInitial?.nom, fichierInitial?.data, adopter]);

    const lecture = analyse?.lecture ?? null;
    const candidats = analyse?.candidats ?? [];
    const horsMatiere = (lecture?.etiquettes.length ?? 0) - candidats.length;

    const poses = useMemo(
        () => (analyse ? posesNumero(analyse, numero, reglages) : []),
        [analyse, numero, reglages],
    );
    const alertes = useMemo(() => alertesPoses(poses), [poses]);

    const apercu = useMemo(() => {
        if (!lecture) return null;
        const { minX, minY, maxX, maxY } = lecture.cadre;
        const largeur = Math.max(1, maxX - minX);
        const hauteurVue = Math.max(1, maxY - minY);
        const marge = Math.max(largeur, hauteurVue) * 0.02;

        let total = 0;
        const traits: string[] = [];
        for (const poly of lecture.polylignes) {
            total += poly.points.length;
            if (total > POINTS_MAX) break;
            traits.push(poly.points.map(([px, py]) => `${px},${(maxY + minY) - py}`).join(' '));
        }

        return {
            viewBox: `${minX - marge} ${minY - marge} ${largeur + marge * 2} ${hauteurVue + marge * 2}`,
            traits,
            epaisseur: Math.max(largeur, hauteurVue) / 700,
            versSvgY: (y: number) => (maxY + minY) - y,
            depuisSvgY: (sy: number) => (maxY + minY) - sy,
            tronque: total > POINTS_MAX,
            largeurCmVue: largeur / lecture.unitesParMm / 10,
            longueurCmVue: hauteurVue / lecture.unitesParMm / 10,
        };
    }, [lecture]);

    /** Point de l'ecran -> coordonnees du trace. */
    const versTrace = (clientX: number, clientY: number): { x: number; y: number } | null => {
        const svg = svgRef.current;
        const m = svg?.getScreenCTM();
        if (!svg || !m || !apercu) return null;
        const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
        return { x: p.x, y: apercu.depuisSvgY(p.y) };
    };

    /** La piece sous le curseur : celle dont le contour contient le point, sinon le numero le plus proche. */
    const pieceSous = (x: number, y: number): number | null => {
        if (!analyse) return null;
        const dansPiece = candidats.find(c => {
            const contour = analyse.contours.find(k => pointDansContour(k, c.etiquette.x, c.etiquette.y) && pointDansContour(k, x, y));
            return !!contour;
        });
        if (dansPiece) return dansPiece.index;
        let mieux: { index: number; d: number } | null = null;
        for (const p of poses) {
            const d = Math.hypot(p.placement.x - x, p.placement.y - y);
            if (!mieux || d < mieux.d) mieux = { index: p.index, d };
        }
        return mieux ? mieux.index : null;
    };

    const retoucher = (index: number, maj: (a: Ajustement) => Ajustement | null) => {
        setAjustements(prev => {
            const n = { ...prev };
            const r = maj(prev[String(index)] ?? { x: 0, y: 0 });
            if (r === null) delete n[String(index)]; else n[String(index)] = r;
            return n;
        });
    };

    const bouger = (index: number, dx: number, dy: number) => retoucher(index, a => ({ ...a, x: a.x + dx, y: a.y + dy }));
    const redimensionner = (index: number, facteur: number) => {
        const actuelle = poses.find(p => p.index === index)?.placement.hauteurCm ?? nb(hauteurCm);
        retoucher(index, a => ({ ...a, hauteurCm: Math.max(0.3, Number((actuelle * facteur).toFixed(2))) }));
    };
    const basculerExclu = (index: number) => setExclus(prev => {
        const s = new Set(prev);
        if (s.has(index)) s.delete(index); else s.add(index);
        return s;
    });

    /* Glisser un numero : il devient « pose a la main » et reste ou on le lache. */
    const debutGlisse = (e: React.PointerEvent, index: number) => {
        if (e.button !== 0 || !lecture) return;
        const pt = versTrace(e.clientX, e.clientY);
        const pose = poses.find(p => p.index === index);
        const etiquette = candidats.find(c => c.index === index)?.etiquette;
        if (!pt || !pose || !etiquette) return;
        e.preventDefault();
        (e.target as Element).setPointerCapture?.(e.pointerId);
        const u = lecture.unitesParMm;
        glisse.current = {
            index,
            depart: pt,
            // Point de depart : la ou le numero est vraiment, pour qu'il ne saute pas.
            base: { x: (pose.placement.x - etiquette.x) / u, y: (pose.placement.y - etiquette.y) / u },
        };
        setSelection(index);
        setMenu(null);
    };
    const mouvementGlisse = (e: React.PointerEvent) => {
        const g = glisse.current;
        if (!g || !lecture) return;
        const pt = versTrace(e.clientX, e.clientY);
        if (!pt) return;
        const u = lecture.unitesParMm;
        const x = Number((g.base.x + (pt.x - g.depart.x) / u).toFixed(1));
        const y = Number((g.base.y + (pt.y - g.depart.y) / u).toFixed(1));
        retoucher(g.index, a => ({ ...a, x, y, libre: true }));
    };
    const finGlisse = () => { glisse.current = null; };

    const nomSortie = () => nomSortieImpose || `${nomFichier.replace(/\.(plt|hpgl|hgl|prn)$/i, '')}-N${numero.trim()}.plt`;

    const construireSortie = (): Uint8Array<ArrayBuffer> | null => (analyse ? numeroterPlt(analyse, numero, reglages) : null);

    const exporter = () => {
        const octets = construireSortie();
        if (!octets) return;
        const url = URL.createObjectURL(new Blob([octets], { type: 'application/octet-stream' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = nomSortie();
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    };

    const [envoi, setEnvoi] = useState<{ etat: 'envoi' | 'ok' | 'erreur'; message?: string } | null>(null);

    /** Depot dans le dossier que surveille le logiciel du traceur (serveur local). */
    const envoyerAuTraceur = async () => {
        const octets = construireSortie();
        if (!octets) return;
        setEnvoi({ etat: 'envoi' });
        if (deposer) {
            const r = await deposer(nomSortie(), octets);
            setEnvoi({ etat: r.ok ? 'ok' : 'erreur', message: r.message });
            return;
        }
        try {
            const res = await fetch('/api/traceur/deposer', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nom: nomSortie(), donnees: enBase64(octets) }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
            setEnvoi({ etat: 'ok', message: data.chemin });
        } catch (e: any) {
            setEnvoi({ etat: 'erreur', message: e?.message || String(e) });
        }
    };

    const pret = !!lecture && !!numero.trim() && poses.length > 0;

    const champ = (
        label: string,
        valeur: number | '',
        set: (v: number | '') => void,
        pas: string,
        min?: string,
    ) => (
        <label className="block">
            <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1 uppercase tracking-wide">{label}</span>
            <input
                type="number"
                step={pas}
                min={min}
                value={valeur}
                onChange={e => set(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-2 text-[13px] font-semibold text-slate-800 dark:text-dk-text outline-none focus:bg-white focus:border-emerald-400"
            />
        </label>
    );

    const nomPiece = (index: number) => lecture?.etiquettes[index]?.texte || `#${index}`;

    return (
        <SheetModal
            onClose={onClose}
            title={L('Numeroter le trace de coupe', 'ترقيم ملف القص', 'Number the cutting trace')}
            subtitle={nomSortieImpose || nomFichier || undefined}
            icon={<Layers className="w-4 h-4" />}
            size="2xl"
            bodyClassName="flex-1 overflow-y-auto min-h-0 p-4 md:p-5"
            footer={(
                <div className="w-full flex flex-col gap-2">
                {envoi && (
                    <p className={`text-[11px] font-semibold break-all ${
                        envoi.etat === 'ok' ? 'text-emerald-700 dark:text-emerald-400'
                        : envoi.etat === 'erreur' ? 'text-rose-700 dark:text-rose-400'
                        : 'text-slate-500 dark:text-dk-muted'
                    }`}>
                        {envoi.etat === 'envoi' && L('Envoi au traceur...', 'جارٍ الإرسال إلى الـ traceur...', 'Sending to plotter...')}
                        {envoi.etat === 'ok' && `${L('Depose pour le traceur :', 'وُضع للـ traceur في:', 'Queued for the plotter:')} ${envoi.message}`}
                        {envoi.etat === 'erreur' && `${L('Envoi impossible :', 'تعذّر الإرسال:', 'Sending failed:')} ${envoi.message}`}
                    </p>
                )}
                <div className="w-full grid grid-cols-2 gap-2 sm:flex sm:gap-3 sm:justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 px-4 rounded-lg text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 dark:hover:bg-dk-elevated transition-colors"
                    >
                        {L('Fermer', 'إغلاق', 'Close')}
                    </button>
                    <button
                        type="button"
                        onClick={exporter}
                        disabled={!pret}
                        className="col-span-2 sm:col-auto h-9 px-4 rounded-lg text-[12px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1.5"
                    >
                        <Download className="w-4 h-4" strokeWidth={2} />
                        {L('Telecharger le trace numerote', 'تنزيل الملف المرقَّم', 'Download numbered trace')}
                    </button>
                    {(deposer || !IS_STATIC) && (
                        <button
                            type="button"
                            onClick={envoyerAuTraceur}
                            disabled={!pret || envoi?.etat === 'envoi'}
                            className="col-span-2 sm:col-auto h-9 px-4 rounded-lg text-[12px] font-semibold bg-slate-900 dark:bg-dk-elevated text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1.5"
                        >
                            <Send className="w-4 h-4" strokeWidth={2} />
                            {L('Envoyer au traceur', 'إرسال إلى الـ traceur', 'Send to plotter')}
                        </button>
                    )}
                </div>
                </div>
            )}
        >
            <input
                ref={inputRef}
                type="file"
                accept=".plt,.hpgl,.hgl,.prn"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) charger(f); }}
            />

            {!lecture ? (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setSurvol(true); }}
                    onDragLeave={() => setSurvol(false)}
                    onDrop={e => { e.preventDefault(); setSurvol(false); const f = e.dataTransfer.files?.[0]; if (f) charger(f); }}
                    className={`w-full rounded-xl border-2 border-dashed px-6 py-12 flex flex-col items-center gap-3 transition-colors ${
                        survol ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                               : 'border-slate-300 dark:border-dk-border bg-slate-50 dark:bg-dk-bg hover:border-emerald-300'
                    }`}
                >
                    <Upload className="w-7 h-7 text-slate-400 dark:text-dk-muted" strokeWidth={1.75} />
                    <span className="text-[13px] font-semibold text-slate-700 dark:text-dk-text">
                        {L('Glissez le fichier .plt ici', 'اسحب ملف plt إلى هنا', 'Drop the .plt file here')}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-dk-muted">
                        {L("Le trace d'origine n'est pas modifie.", 'الملف الأصلي لا يُمَسّ.', 'The original trace is left untouched.')}
                    </span>
                </button>
            ) : (
                <div className="space-y-4">
                    {erreur && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">{erreur}</p>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 dark:bg-dk-elevated text-[11px] font-semibold text-slate-600 dark:text-dk-text-soft">
                            <FileText className="w-3.5 h-3.5" />{nomFichier}
                        </span>
                        <span className="px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/25 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                            {candidats.length} {L('pieces', 'قطعة', 'pieces')}
                        </span>
                        {horsMatiere > 0 && (
                            <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-dk-elevated text-[11px] font-medium text-slate-500 dark:text-dk-muted">
                                {horsMatiere} {L('en-tete ignoree', 'ترويسة مُستثناة', 'header skipped')}
                            </span>
                        )}
                        {apercu && (
                            <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-dk-elevated text-[11px] font-medium text-slate-500 dark:text-dk-muted">
                                {apercu.largeurCmVue.toFixed(0)} × {apercu.longueurCmVue.toFixed(0)} cm
                            </span>
                        )}
                        {!fichierInitial && (
                            <button
                                type="button"
                                onClick={() => { setAnalyse(null); setNomFichier(''); setErreur(''); }}
                                className="ml-auto h-7 px-2 rounded-md text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 inline-flex items-center gap-1 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />{L('Changer', 'تغيير', 'Change')}
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                        <label className="block col-span-2 sm:col-span-1">
                            <span className="block text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1 uppercase tracking-wide">
                                {L('Numero', 'الرقم', 'Number')}
                            </span>
                            <input
                                type="text"
                                value={numero}
                                onChange={e => setNumero(e.target.value)}
                                placeholder="66"
                                className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-lg px-2.5 py-2 text-[15px] font-bold text-slate-800 dark:text-dk-text outline-none focus:bg-white focus:border-emerald-400"
                            />
                        </label>
                        {champ(L('Hauteur cm', 'الارتفاع سم', 'Height cm'), hauteurCm, setHauteurCm, '0.1', '0.2')}
                        {champ(L('Largeur cm', 'العرض سم', 'Width cm'), largeurCm, setLargeurCm, '0.1', '0.1')}
                        {champ(L('Ecart mm', 'الفاصل مم', 'Gap mm'), ecartMm, setEcartMm, '1', '0')}
                        {champ(L('Repetitions', 'التكرار', 'Repeats'), repetitions, setRepetitions, '1', '1')}
                    </div>

                    {(alertes.reduit > 0 || alertes.force > 0) && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                            {alertes.reduit > 0 && (
                                <span className="px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300">
                                    {alertes.reduit} {L('piece(s) trop petite(s) : numero reduit', 'قطعة صغيرة: صُغِّر الرقم', 'piece(s) too small: number shrunk')}
                                </span>
                            )}
                            {alertes.force > 0 && (
                                <span className="px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-900/25 text-rose-700 dark:text-rose-300">
                                    {alertes.force} {L('piece(s) sans place sure — a verifier', 'قطعة بلا مكان آمن — تحقّق منها', 'piece(s) with no safe spot — check')}
                                </span>
                            )}
                        </div>
                    )}

                    {apercu && (
                        <div className="rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface overflow-hidden">
                            <div className="px-3 py-2 border-b border-slate-100 dark:border-dk-border flex items-center gap-3 flex-wrap">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider">
                                    {L('Apercu', 'المعاينة', 'Preview')}
                                </span>
                                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    {poses.length} {L('numeros', 'رقماً', 'numbers')}
                                </span>
                                <span className="text-[10px] text-slate-400 dark:text-dk-muted">
                                    {L('Clic droit sur une piece pour la reprendre · glissez un numero pour le deplacer', 'انقر بالزر الأيمن على قطعة لتعديلها · اسحب الرقم لتحريكه', 'Right-click a piece to adjust it · drag a number to move it')}
                                </span>
                                <label className="ml-auto flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase">
                                        {L('Transparence', 'الشفافية', 'Opacity')}
                                    </span>
                                    <input
                                        type="range" min="20" max="100" value={opacite}
                                        onChange={e => setOpacite(Number(e.target.value))}
                                        className="w-24 accent-emerald-600"
                                    />
                                </label>
                            </div>
                            <div className="bg-slate-50 dark:bg-dk-bg p-2 overflow-auto relative">
                                <svg
                                    ref={svgRef}
                                    viewBox={apercu.viewBox}
                                    className="w-full h-auto max-h-[55vh] touch-none"
                                    preserveAspectRatio="xMidYMid meet"
                                    onPointerMove={mouvementGlisse}
                                    onPointerUp={finGlisse}
                                    onPointerCancel={finGlisse}
                                    onContextMenu={e => {
                                        e.preventDefault();
                                        const pt = versTrace(e.clientX, e.clientY);
                                        const index = pt ? pieceSous(pt.x, pt.y) : null;
                                        if (index === null) return;
                                        setSelection(index);
                                        setMenu({ index, x: e.clientX, y: e.clientY });
                                    }}
                                >
                                    {apercu.traits.map((pts, i) => (
                                        <polyline
                                            key={i} points={pts} fill="none" stroke="currentColor"
                                            className="text-slate-400 dark:text-dk-muted"
                                            strokeWidth={apercu.epaisseur}
                                        />
                                    ))}
                                    {poses.map(({ index, rang, etiquette, placement }) => {
                                        const sy = apercu.versSvgY(placement.y);
                                        const retourne = etiquette.directionX < 0;
                                        const actif = selection === index;
                                        const hauteur = placement.hauteurCm * 10 * lecture!.unitesParMm;
                                        return (
                                            <text
                                                key={`${index}-${rang}`}
                                                x={placement.x}
                                                y={sy}
                                                fontSize={hauteur}
                                                // Le traceur ecrit en LO5 : centre sur le point.
                                                textAnchor="middle"
                                                dominantBaseline="central"
                                                transform={retourne ? `rotate(180 ${placement.x} ${sy})` : undefined}
                                                opacity={opacite / 100}
                                                onPointerDown={e => debutGlisse(e, index)}
                                                onClick={() => setSelection(actif ? null : index)}
                                                className={`${actif ? 'fill-indigo-600 dark:fill-indigo-400' : COULEUR_STATUT[placement.statut].replace('text-', 'fill-')} cursor-move select-none`}
                                                fontWeight={700}
                                            >
                                                {numero.trim() || '—'}
                                            </text>
                                        );
                                    })}
                                </svg>
                            </div>
                            {apercu.tronque && (
                                <p className="px-3 py-1.5 text-[10px] text-slate-400 dark:text-dk-muted border-t border-slate-100 dark:border-dk-border">
                                    {L('Apercu allege : le fichier exporte reste complet.', 'المعاينة مبسّطة، والملف المُصدَّر كامل.', 'Preview simplified; the exported file stays complete.')}
                                </p>
                            )}
                        </div>
                    )}

                    {menu && (
                        <>
                            <div className="fixed inset-0 z-[120]" onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null); }} />
                            <div
                                className="fixed z-[121] w-56 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xl py-1 text-[12px]"
                                style={{ left: Math.min(menu.x, window.innerWidth - 232), top: Math.min(menu.y, window.innerHeight - 230) }}
                            >
                                <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 truncate">{nomPiece(menu.index)}</p>
                                {[
                                    { icone: Move, texte: L('Deplacer : glissez le numero', 'تحريك: اسحب الرقم', 'Move: drag the number'), action: () => setSelection(menu.index) },
                                    { icone: Plus, texte: L('Plus grand', 'أكبر', 'Bigger'), action: () => redimensionner(menu.index, 1.2) },
                                    { icone: Minus, texte: L('Plus petit', 'أصغر', 'Smaller'), action: () => redimensionner(menu.index, 1 / 1.2) },
                                    { icone: EyeOff, texte: exclus.has(menu.index) ? L('Numeroter cette piece', 'ترقيم هذه القطعة', 'Number this piece') : L('Ne pas numeroter cette piece', 'عدم ترقيم هذه القطعة', 'Skip this piece'), action: () => basculerExclu(menu.index) },
                                    { icone: RotateCcw, texte: L('Remettre en automatique', 'إرجاعها للوضع التلقائي', 'Back to automatic'), action: () => retoucher(menu.index, () => null) },
                                ].map(({ icone: Icone, texte, action }) => (
                                    <button key={texte} type="button" onClick={() => { action(); setMenu(null); }} className="w-full flex items-center gap-2 px-3 h-9 text-left text-slate-700 dark:text-dk-text-soft hover:bg-slate-50 dark:hover:bg-dk-elevated">
                                        <Icone className="w-3.5 h-3.5 text-slate-400 shrink-0" />{texte}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {selection !== null && (
                        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-900/20 p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Move className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300 truncate">
                                    {nomPiece(selection)}
                                </span>
                                {ajustements[String(selection)]?.libre && (
                                    <span className="text-[9px] font-bold uppercase text-indigo-500">{L('pose a la main', 'موضع يدوي', 'manual')}</span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => retoucher(selection, () => null)}
                                    className="ml-auto text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                    {L('Remettre au centre', 'إعادة للوسط', 'Reset')}
                                </button>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                {[
                                    { t: '← 5mm', dx: -5, dy: 0 },
                                    { t: '→ 5mm', dx: 5, dy: 0 },
                                    { t: '↑ 5mm', dx: 0, dy: 5 },
                                    { t: '↓ 5mm', dx: 0, dy: -5 },
                                ].map(b => (
                                    <button
                                        key={b.t}
                                        type="button"
                                        onClick={() => bouger(selection, b.dx, b.dy)}
                                        className="h-9 rounded-lg bg-white dark:bg-dk-surface border border-indigo-200 dark:border-indigo-800 text-[12px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
                                    >
                                        {b.t}
                                    </button>
                                ))}
                                <button type="button" onClick={() => redimensionner(selection, 1.2)} className="h-9 rounded-lg bg-white dark:bg-dk-surface border border-indigo-200 dark:border-indigo-800 text-[12px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 inline-flex items-center justify-center gap-1"><Plus className="w-3.5 h-3.5" />{L('Taille', 'الحجم', 'Size')}</button>
                                <button type="button" onClick={() => redimensionner(selection, 1 / 1.2)} className="h-9 rounded-lg bg-white dark:bg-dk-surface border border-indigo-200 dark:border-indigo-800 text-[12px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 inline-flex items-center justify-center gap-1"><Minus className="w-3.5 h-3.5" />{L('Taille', 'الحجم', 'Size')}</button>
                            </div>
                        </div>
                    )}

                    <details className="rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface">
                        <summary className="px-3 py-2 text-[11px] font-bold text-slate-600 dark:text-dk-text-soft cursor-pointer select-none">
                            {L('Choisir les pieces', 'اختيار القطع', 'Choose pieces')}
                        </summary>
                        <div className="max-h-56 overflow-y-auto border-t border-slate-100 dark:border-dk-border divide-y divide-slate-50 dark:divide-dk-border">
                            {candidats.map(({ index, etiquette }) => {
                                const pose = poses.find(p => p.index === index);
                                return (
                                    <div key={index} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-dk-elevated">
                                        <input
                                            type="checkbox"
                                            checked={!exclus.has(index)}
                                            onChange={() => basculerExclu(index)}
                                            className="w-3.5 h-3.5 accent-emerald-600"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setSelection(selection === index ? null : index)}
                                            className="flex-1 text-left text-[11px] font-medium text-slate-700 dark:text-dk-text-soft truncate"
                                        >
                                            {etiquette.texte}
                                        </button>
                                        {pose && (
                                            <span className={`text-[10px] font-bold shrink-0 ${COULEUR_STATUT[pose.placement.statut]}`}>
                                                {pose.placement.hauteurCm.toFixed(1)} cm
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </details>
                </div>
            )}
        </SheetModal>
    );
}
