/**
 * Numerotation des traces de coupe.
 *
 * Le client livre un trace fini ou chaque piece porte deja son nom et sa
 * taille, mais rien qui dise a quel ordre elle appartient. L'atelier ecrivait
 * donc le numero a la main, piece par piece, toute la journee.
 *
 * Cette fenetre ajoute ce numero pour que le traceur l'ecrive lui-meme au
 * milieu de chaque piece. Deux regles tiennent tout le reste :
 *   — le trace d'origine n'est jamais redessine (voir `injecterEtiquettes`) ;
 *   — le numero ne sort jamais de sa piece (voir `placerNumero`).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, FileText, Download, AlertTriangle, Layers, X, Move, Send } from 'lucide-react';
import SheetModal from '../shared/SheetModal';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import {
    lireHpgl, injecterEtiquettes, decoderOctets, encoderOctets,
    type LectureHpgl, type EtiquetteHpgl,
} from '../../lib/hpgl';
import {
    contoursDePieces, contourContenant, placerNumeros,
    type Placement, type StatutPlacement,
} from '../../lib/placementNumero';

interface Props {
    /** Numero a ecrire : celui du matelas, pas le nom du modele. */
    numeroInitial?: string;
    /** Fichier deja attache a la ligne de matelas, charge sans re-selection. */
    fichierInitial?: { nom: string; data: string } | null;
    onClose: () => void;
}

/** Les fichiers attaches sont stockes en dataURL base64 : on revient aux octets. */
function octetsDepuisDataUrl(data: string): ArrayBuffer | null {
    const virgule = data.indexOf(',');
    if (virgule < 0 || !data.slice(0, virgule).includes(';base64')) return null;
    try {
        const binaire = atob(data.slice(virgule + 1));
        const octets = new Uint8Array(binaire.length);
        for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
        return octets.buffer;
    } catch {
        return null;
    }
}

/** Sans serveur (Vercel), personne ne peut ecrire dans le dossier du traceur. */
const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

const enBase64 = (octets: Uint8Array): string => {
    let binaire = '';
    const PAS = 0x8000;
    for (let i = 0; i < octets.length; i += PAS) binaire += String.fromCharCode(...octets.subarray(i, i + PAS));
    return btoa(binaire);
};

/** Au-dela, le rendu SVG coute plus qu'il n'apporte : on allege le trait. */
const POINTS_MAX = 60000;

const COULEUR_STATUT: Record<StatutPlacement, string> = {
    ok: 'text-emerald-600 dark:text-emerald-400',
    deplace: 'text-blue-600 dark:text-blue-400',
    reduit: 'text-amber-600 dark:text-amber-400',
    force: 'text-rose-600 dark:text-rose-400',
};

export default function AnnotationPlt({ numeroInitial = '', fichierInitial = null, onClose }: Props) {
    const { lang } = useLang();
    const inputRef = useRef<HTMLInputElement>(null);

    const [nomFichier, setNomFichier] = useState('');
    const [source, setSource] = useState('');
    const [lecture, setLecture] = useState<LectureHpgl | null>(null);
    const [erreur, setErreur] = useState('');
    const [survol, setSurvol] = useState(false);

    const [numero, setNumero] = useState(numeroInitial);
    const [hauteurCm, setHauteurCm] = useState<number | ''>(3);
    const [largeurCm, setLargeurCm] = useState<number | ''>(2);
    const [ecartMm, setEcartMm] = useState<number | ''>(10);
    const [repetitions, setRepetitions] = useState<number | ''>(1);
    const [opacite, setOpacite] = useState(100);
    const [exclus, setExclus] = useState<Set<number>>(new Set());
    const [ajustements, setAjustements] = useState<Record<number, { x: number; y: number }>>({});
    const [selection, setSelection] = useState<number | null>(null);

    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en, es: fr, pt: fr, tr: en });

    const adopter = useCallback((nom: string, buffer: ArrayBuffer) => {
        try {
            const texte = decoderOctets(buffer);
            const lu = lireHpgl(texte);
            if (lu.etiquettes.length === 0) {
                setErreur(L(
                    "Aucun texte dans ce trace : rien ou accrocher le numero.",
                    'لا نصّ في هذا الملف، فلا موضع يُعلَّق عليه الرقم.',
                    'No text in this trace: nothing to anchor the number to.',
                ));
            }
            setNomFichier(nom);
            setSource(texte);
            setLecture(lu);
            setExclus(new Set());
            setAjustements({});
            setSelection(null);
        } catch {
            setErreur(L('Fichier illisible.', 'تعذّرت قراءة الملف.', 'Unreadable file.'));
        }
    }, [lang]);

    const charger = useCallback((fichier: File) => {
        setErreur('');
        const reader = new FileReader();
        reader.onload = () => adopter(fichier.name, reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(fichier);
    }, [adopter]);

    /* Le trace est deja attache a la ligne de matelas : on l'ouvre directement,
       sans redemander a l'operateur d'aller le rechercher sur le disque. */
    useEffect(() => {
        if (!fichierInitial) return;
        const buffer = octetsDepuisDataUrl(fichierInitial.data);
        if (buffer) adopter(fichierInitial.nom, buffer);
        else setErreur(L('Fichier attache illisible.', 'الملف المرفق غير قابل للقراءة.', 'Attached file unreadable.'));
    }, [fichierInitial, adopter]);

    const contours = useMemo(
        () => (lecture ? contoursDePieces(lecture.polylignes) : []),
        [lecture],
    );

    /**
     * Les lignes d'en-tete du placement (modele, laize, efficience) sont
     * ecrites hors matiere : seules les etiquettes posees dans le tissu sont
     * des pieces a numeroter.
     */
    const candidats = useMemo(() => {
        if (!lecture) return [] as Array<{ index: number; etiquette: EtiquetteHpgl }>;
        const { minX, minY, maxX, maxY } = lecture.cadre;
        return lecture.etiquettes
            .map((etiquette, index) => ({ index, etiquette }))
            .filter(({ etiquette: e }) => e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY);
    }, [lecture]);

    const horsMatiere = (lecture?.etiquettes.length ?? 0) - candidats.length;

    const nb = (v: number | '') => (typeof v === 'number' ? v : 0);

    const poses = useMemo(() => {
        if (!lecture || nb(hauteurCm) <= 0 || nb(largeurCm) <= 0) return [];
        return candidats
            .filter(c => !exclus.has(c.index))
            .flatMap(({ index, etiquette }) => {
                const aj = ajustements[index];
                const placements = placerNumeros({
                    etiquette,
                    contour: contourContenant(contours, etiquette.x, etiquette.y),
                    texte: numero.trim() || '0',
                    hauteurCm: nb(hauteurCm),
                    largeurCm: nb(largeurCm),
                    decalageMm: nb(ecartMm),
                    unitesParMm: lecture.unitesParMm,
                    ajustementXmm: aj?.x ?? 0,
                    ajustementYmm: aj?.y ?? 0,
                }, nb(repetitions) || 1);
                return placements.map((p, rang) => ({ index, rang, etiquette, placement: p }));
            });
    }, [lecture, candidats, exclus, contours, numero, hauteurCm, largeurCm, ecartMm, repetitions, ajustements]);

    const alertes = useMemo(() => {
        const parPiece = new Map<number, Placement>();
        for (const p of poses) if (!parPiece.has(p.index)) parPiece.set(p.index, p.placement);
        let reduit = 0, force = 0;
        for (const p of parPiece.values()) {
            if (p.statut === 'reduit') reduit++;
            if (p.statut === 'force') force++;
        }
        return { reduit, force };
    }, [poses]);

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
            tronque: total > POINTS_MAX,
            largeurCmVue: largeur / lecture.unitesParMm / 10,
            longueurCmVue: hauteurVue / lecture.unitesParMm / 10,
        };
    }, [lecture]);

    const bouger = (index: number, dx: number, dy: number) => {
        setAjustements(prev => {
            const a = prev[index] ?? { x: 0, y: 0 };
            return { ...prev, [index]: { x: a.x + dx, y: a.y + dy } };
        });
    };

    /** Le trace d'origine plus le bloc de numeros — la seule sortie possible. */
    const construireSortie = (): Uint8Array<ArrayBuffer> | null => {
        if (!lecture || !numero.trim() || poses.length === 0) return null;
        const sortie = injecterEtiquettes(
            source,
            poses.map(({ etiquette, placement }) => ({
                x: placement.x,
                y: placement.y,
                texte: numero.trim(),
                hauteurCm: placement.hauteurCm,
                largeurCm: placement.largeurCm,
                directionX: etiquette.directionX,
                directionY: etiquette.directionY,
                plume: etiquette.plume,
            })),
        );
        return encoderOctets(sortie);
    };

    const nomSortie = () => `${nomFichier.replace(/\.(plt|hpgl|hgl|prn)$/i, '')}-N${numero.trim()}.plt`;

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

    return (
        <SheetModal
            onClose={onClose}
            title={L('Numeroter le trace de coupe', 'ترقيم ملف القص', 'Number the cutting trace')}
            subtitle={nomFichier || undefined}
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
                    {!IS_STATIC && (
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
                        <button
                            type="button"
                            onClick={() => { setLecture(null); setSource(''); setNomFichier(''); setErreur(''); }}
                            className="ml-auto h-7 px-2 rounded-md text-[11px] font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 inline-flex items-center gap-1 transition-colors"
                        >
                            <X className="w-3.5 h-3.5" />{L('Changer', 'تغيير', 'Change')}
                        </button>
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
                            <div className="bg-slate-50 dark:bg-dk-bg p-2 overflow-auto">
                                <svg viewBox={apercu.viewBox} className="w-full h-auto max-h-[50vh]" preserveAspectRatio="xMidYMid meet">
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
                                        return (
                                            <text
                                                key={`${index}-${rang}`}
                                                x={placement.x}
                                                y={sy}
                                                fontSize={placement.hauteurCm * 10 * lecture.unitesParMm}
                                                textAnchor={retourne ? 'end' : 'start'}
                                                dominantBaseline={retourne ? 'auto' : 'hanging'}
                                                transform={retourne ? `rotate(180 ${placement.x} ${sy})` : undefined}
                                                opacity={opacite / 100}
                                                onClick={() => setSelection(actif ? null : index)}
                                                className={`${actif ? 'fill-indigo-600 dark:fill-indigo-400' : COULEUR_STATUT[placement.statut].replace('text-', 'fill-')} cursor-pointer`}
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

                    {selection !== null && (
                        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-900/20 p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <Move className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                                <span className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300 truncate">
                                    {lecture.etiquettes[selection]?.texte}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => { setAjustements(p => { const n = { ...p }; delete n[selection]; return n; }); }}
                                    className="ml-auto text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                    {L('Remettre au centre', 'إعادة للوسط', 'Reset')}
                                </button>
                            </div>
                            <div className="grid grid-cols-4 gap-2">
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
                                            onChange={() => setExclus(prev => {
                                                const s = new Set(prev);
                                                if (s.has(index)) s.delete(index); else s.add(index);
                                                return s;
                                            })}
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
