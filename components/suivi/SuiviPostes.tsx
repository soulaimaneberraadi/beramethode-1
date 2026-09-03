import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, ModelData, PlanningEvent, PosteSuiviData, HRWorker, Operation } from '../../types';
import { deriveHourGrid } from './shared/hours';
import { pauseOverlapMinutes, horairesDuJour } from '../../lib/horaires';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { useIsMobile } from '../planning/shared/useIsMobile';
import { Clock, User, Play, Pause, Square, Save, CheckCircle2, Loader2, ChevronDown } from 'lucide-react';

interface Props {
    models: ModelData[];
    planningEvents: PlanningEvent[];
    settings: AppSettings;
    chainsList: string[];
    selectedChaineId: string;
    setSelectedChaineId: (id: string) => void;
    globalDate?: string;
    setGlobalDate?: (d: string) => void;
}

const L = {
    title: { fr: 'Suivi par poste / ouvrier', ar: 'التتبع حسب المحطة والعامل', en: 'Poste / worker tracking', es: 'Seguimiento por puesto/operario', pt: 'Acompanhamento por posto/operário', tr: 'İstasyon/işçi takibi' },
    subtitle: { fr: "Un releve par poste, par ouvrier, range automatiquement dans l'heure en cours", ar: 'تسجيل لكل محطة ولكل عامل، يُصنَّف تلقائياً في الساعة الجارية', en: 'One entry per poste, per worker, auto-filed to the current hour', es: 'Un registro por puesto y operario, clasificado automáticamente en la hora actual', pt: 'Um registo por posto e operário, arquivado automaticamente na hora atual', tr: 'İstasyon ve işçi başına bir kayıt, otomatik olarak geçerli saate yazılır' },
    noModel: { fr: 'Aucun modèle planifié sur cette chaîne pour cette date', ar: 'لا يوجد نموذج مخطط لهذه السلسلة في هذا التاريخ', en: 'No model planned on this line for this date', es: 'Ningún modelo planificado en esta línea para esta fecha', pt: 'Nenhum modelo planeado nesta linha para esta data', tr: 'Bu tarihte bu hatta planlanmış model yok' },
    poste: { fr: 'Poste', ar: 'المحطة', en: 'Poste', es: 'Puesto', pt: 'Posto', tr: 'İstasyon' },
    machine: { fr: 'Machine', ar: 'الآلة', en: 'Machine', es: 'Máquina', pt: 'Máquina', tr: 'Makine' },
    worker: { fr: 'Ouvrier', ar: 'العامل', en: 'Worker', es: 'Operario', pt: 'Operário', tr: 'İşçi' },
    chooseWorker: { fr: 'Choisir un ouvrier…', ar: 'اختر عاملاً…', en: 'Choose a worker…', es: 'Elegir un operario…', pt: 'Escolher um operário…', tr: 'İşçi seçin…' },
    qty: { fr: 'Qté produite', ar: 'الكمية المنتجة', en: 'Produced qty', es: 'Cant. producida', pt: 'Qtd. produzida', tr: 'Üretilen miktar' },
    defects: { fr: 'Défauts', ar: 'العيوب', en: 'Defects', es: 'Defectos', pt: 'Defeitos', tr: 'Hatalar' },
    hourNow: { fr: 'Créneau', ar: 'الفترة', en: 'Slot', es: 'Franja', pt: 'Faixa', tr: 'Zaman dilimi' },
    saveRow: { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' },
    saved: { fr: 'Enregistré', ar: 'تم الحفظ', en: 'Saved', es: 'Guardado', pt: 'Guardado', tr: 'Kaydedildi' },
    chrono: { fr: 'Chronométrer', ar: 'حساب الزمن', en: 'Time it', es: 'Cronometrar', pt: 'Cronometrar', tr: 'Kronometre' },
    start: { fr: 'Démarrer', ar: 'ابدأ', en: 'Start', es: 'Iniciar', pt: 'Iniciar', tr: 'Başlat' },
    stop: { fr: 'Arrêter', ar: 'إيقاف', en: 'Stop', es: 'Detener', pt: 'Parar', tr: 'Durdur' },
    reset: { fr: 'Réinitialiser', ar: 'إعادة تعيين', en: 'Reset', es: 'Reiniciar', pt: 'Repor', tr: 'Sıfırla' },
    timePerPiece: { fr: 'Temps / pièce', ar: 'الزمن / قطعة', en: 'Time / piece', es: 'Tiempo / pieza', pt: 'Tempo / peça', tr: 'Parça başı süre' },
    today: { fr: "Total aujourd'hui", ar: 'إجمالي اليوم', en: "Today's total", en2: '', es: 'Total de hoy', pt: 'Total de hoje', tr: 'Bugünkü toplam' },
    loading: { fr: 'Chargement…', ar: 'جار التحميل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yükleniyor…' },
    entriesToday: { fr: 'relevés aujourd\'hui', ar: 'تسجيلات اليوم', en: 'entries today', es: 'registros hoy', pt: 'registos hoje', tr: 'bugünkü kayıtlar' },
    score: { fr: 'Score', ar: 'النتيجة', en: 'Score', es: 'Puntuación', pt: 'Pontuação', tr: 'Puan' },
    progression: { fr: 'Progression des ouvriers', ar: 'تقدّم العمّال', en: 'Worker progression', es: 'Progresión de operarios', pt: 'Progressão dos operários', tr: 'İşçi gelişimi' },
    progressionVide: { fr: "Pas encore de relevé chronométré : le score apparaît dès qu'un temps est mesuré.", ar: 'لا يوجد تسجيل مُوقَّت بعد: النتيجة تظهر بمجرّد قياس زمن.', en: 'No timed entry yet: the score appears as soon as a time is measured.', es: 'Aún no hay registro cronometrado: la puntuación aparece en cuanto se mide un tiempo.', pt: 'Ainda sem registo cronometrado: a pontuação aparece assim que um tempo for medido.', tr: 'Henüz süre ölçümü yok: bir süre ölçülür ölçülmez puan görünür.' },
    scoreEstime: { fr: 'Score estime depuis la quantite (pas de chronometrage)', ar: 'نتيجة مُقدَّرة من الكمية (بلا كرونومتراج)', en: 'Score estimated from quantity (no timing)', es: 'Puntuacion estimada por la cantidad (sin cronometraje)', pt: 'Pontuacao estimada pela quantidade (sem cronometragem)', tr: 'Miktardan tahmin edilen puan (olcum yok)' },
    postesTenus: { fr: 'postes tenus', ar: 'مناصب مشغولة', en: 'stations held', es: 'puestos cubiertos', pt: 'postos ocupados', tr: 'tutulan istasyon' },
};

// Retourne le bloc horaire (cle+label) qui contient l'heure courante, ou le dernier bloc passe.
function currentHourBlock(hours: string[], keys: string[]): { key: string; label: string } {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let idx = 0;
    for (let i = 0; i < hours.length; i++) {
        const [h, m] = hours[i].split(':').map(Number);
        const startMin = (h || 0) * 60 + (m || 0);
        if (startMin <= nowMin) idx = i; else break;
    }
    return { key: keys[idx] || keys[0] || 'h0800', label: hours[idx] || hours[0] || '08:00' };
}

function todayStr(): string {
    return new Date().toISOString().split('T')[0];
}

export default function SuiviPostes({ models, planningEvents, settings, chainsList, selectedChaineId, setSelectedChaineId, globalDate, setGlobalDate }: Props) {
    const { lang } = useLang();
    /* Le releve se fait au pied de la chaine, telephone en main : sur petit
       ecran chaque poste devient une carte, un tableau de sept colonnes n'y
       tient pas. */
    const isMobile = useIsMobile();
    const date = globalDate || todayStr();

    const [posteSuivis, setPosteSuivis] = useState<PosteSuiviData[]>([]);
    const [workers, setWorkers] = useState<HRWorker[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [chronoOpenFor, setChronoOpenFor] = useState<string | null>(null);

    // Chargement initial : releves poste_suivi + liste des ouvriers actifs (Gestion RH)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const [rSuivi, rWorkers] = await Promise.all([
                    fetch('/api/poste-suivi', { credentials: 'include' }),
                    fetch('/api/hr/workers?active=1', { credentials: 'include' }),
                ]);
                const dataSuivi = rSuivi.ok ? await rSuivi.json() : [];
                const dataWorkers = rWorkers.ok ? await rWorkers.json() : [];
                if (!cancelled) {
                    setPosteSuivis(Array.isArray(dataSuivi) ? dataSuivi : []);
                    setWorkers(Array.isArray(dataWorkers) ? dataWorkers : []);
                }
            } catch (e) {
                console.error('SuiviPostes: chargement error', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    /* Les creneaux sont ceux du jour saisi : sinon un vendredi personnalise
       proposerait les heures des autres jours, et l'objectif du creneau (donc le
       score de l'ouvrier) serait calcule sur une duree qui n'existe pas. */
    const hourGrid = useMemo(() => deriveHourGrid(settings, date ? new Date(date) : undefined), [settings, date]);
    const nowBlock = useMemo(() => currentHourBlock(hourGrid.hours, hourGrid.keys), [hourGrid]);

    // Le planning actif de la chaine selectionnee, a la date choisie (meme logique que la grille horaire).
    const activePlanning = useMemo(() => {
        return planningEvents.find(p => {
            if (p.chaineId !== selectedChaineId) return false;
            const start = (p.startDate || p.dateLancement || '').split('T')[0];
            const end = (p.estimatedEndDate || p.dateExport || p.dateFin || start).split('T')[0];
            return start <= date && end >= date;
        }) || null;
    }, [planningEvents, selectedChaineId, date]);

    const activeModel = useMemo(() => {
        if (!activePlanning) return null;
        return models.find(m => m.id === activePlanning.modelId) || null;
    }, [models, activePlanning]);

    const postes: Operation[] = activeModel?.gamme_operatoire || [];

    // Ouvriers proposes : ceux de la chaine en priorite, puis les autres, tries par nom.
    const workersSorted = useMemo(() => {
        const list = [...workers];
        list.sort((a, b) => {
            const aChain = a.chaine_id === selectedChaineId ? 0 : 1;
            const bChain = b.chaine_id === selectedChaineId ? 0 : 1;
            if (aChain !== bChain) return aChain - bChain;
            return (a.full_name || '').localeCompare(b.full_name || '');
        });
        return list;
    }, [workers, selectedChaineId]);

    // Releves du jour pour la chaine active, regroupes par poste.
    const suivisByPoste = useMemo(() => {
        const map = new Map<string, PosteSuiviData[]>();
        posteSuivis.forEach(s => {
            if (s.date !== date || !activePlanning || s.planningId !== activePlanning.id) return;
            const arr = map.get(s.posteId) || [];
            arr.push(s);
            map.set(s.posteId, arr);
        });
        return map;
    }, [posteSuivis, date, activePlanning]);

    // Etat de saisie courant par poste : ouvrier choisi, quantite, defauts, temps chrono.
    const [draftByPoste, setDraftByPoste] = useState<Record<string, { workerId: string; qty: number | ''; defauts: number | ''; tempsMs: number | null }>>({});

    const getDraft = (posteId: string) => draftByPoste[posteId] || { workerId: '', qty: '', defauts: '', tempsMs: null };
    const setDraft = (posteId: string, patch: Partial<{ workerId: string; qty: number | ''; defauts: number | ''; tempsMs: number | null }>) => {
        setDraftByPoste(prev => ({ ...prev, [posteId]: { ...getDraft(posteId), ...patch } }));
    };

    const saveRow = async (poste: Operation) => {
        if (!activePlanning || !activeModel) return;
        const d = getDraft(poste.id);
        if (d.qty === '' || d.qty === undefined) return; // rien a enregistrer sans quantite
        const rowId = `${activePlanning.id}-${poste.id}-${date}-${nowBlock.key}`;
        const existing = posteSuivis.find(s => s.id === rowId);
        /* Le chrono mesure des millisecondes, mais toute la gamme (poste.time,
           SAM, temps prevu) est en MINUTES. On convertit ici, sinon le score
           comparerait des secondes a des minutes et serait faux d'un facteur 60. */
        const tempsParPiece = d.tempsMs && Number(d.qty) > 0
            ? Number(((d.tempsMs / 60000) / Number(d.qty)).toFixed(4))
            : undefined;
        const payload: PosteSuiviData = {
            id: rowId,
            planningId: activePlanning.id,
            modelId: activeModel.id,
            posteId: poste.id,
            workerId: d.workerId || undefined,
            date,
            heure_debut: nowBlock.key,
            heure_fin: `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`,
            /* Plusieurs relevés peuvent tomber dans le meme creneau (l'ouvrier
               annonce 20 pieces a 09h10 puis 15 a 09h40). Le creneau porte le
               meme identifiant : on CUMULE au lieu d'ecraser, sinon la deuxieme
               saisie effacerait la premiere. */
            pieces_entrees: (existing?.pieces_entrees || 0) + (Number(d.qty) || 0),
            pieces_sorties: (existing?.pieces_sorties || 0) + (Number(d.qty) || 0),
            pieces_defaut: (existing?.pieces_defaut || 0) + (d.defauts === '' ? 0 : Number(d.defauts) || 0),
            temps_reel_par_piece: tempsParPiece ?? existing?.temps_reel_par_piece,
            temps_prevu_par_piece: poste.time,
            notes: undefined,
            problemes: existing?.problemes || [],
        };
        setSavingId(poste.id);
        try {
            const res = await fetch('/api/poste-suivi', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suivis: [payload] }),
            });
            if (res.ok) {
                setPosteSuivis(prev => {
                    const others = prev.filter(s => s.id !== rowId);
                    return [...others, payload];
                });
                setSavedId(poste.id);
                setTimeout(() => setSavedId(cur => (cur === poste.id ? null : cur)), 1800);
                // On garde l'ouvrier choisi (saisie repetee dans l'heure), on vide qte/defauts/chrono.
                setDraft(poste.id, { qty: '', defauts: '', tempsMs: null });
            }
        } catch (e) {
            console.error('SuiviPostes: save error', e);
        } finally {
            setSavingId(null);
        }
    };

    /* Minutes reellement travaillables dans un creneau : une heure pleine, moins
       ce que la pause lui prend. Sans cela l'objectif d'un creneau coupe par la
       pause serait surevalue et l'ouvrier note trop bas. */
    const minutesCreneau = (heureKey?: string): number => {
        if (!heureKey) return 60;
        const hh = Number(heureKey.replace('h', '').slice(0, 2));
        const mm = Number(heureKey.replace('h', '').slice(2, 4));
        if (!Number.isFinite(hh)) return 60;
        const debut = hh * 60 + (Number.isFinite(mm) ? mm : 0);
        const fin = debut + 60;
        // Source unique des pauses (lib/horaires.ts) : évite de dupliquer ici
        // la logique de chevauchement pause/créneau.
        /* Les pauses du JOUR saisi, pas celles du reglage general : un vendredi
           avec une coupure plus longue reduit d'autant l'objectif du creneau. */
        const pause = pauseOverlapMinutes(horairesDuJour(settings, date ? new Date(date) : undefined).pauses, debut, fin);
        return Math.max(5, 60 - pause);
    };

    /* Score d'un releve, par ordre de fiabilite :
       1. Chronometre : temps prevu / temps mesure — c'est la mesure la plus juste.
       2. A defaut, la quantite : ce que le poste a sorti face a ce que la gamme
          permettait de sortir dans le creneau (minutes disponibles / temps prevu).
       Sans temps prevu dans la gamme il n'y a pas de reference, donc pas de note :
       on n'invente jamais un score. */
    const scoreReleve = (r: PosteSuiviData): number | null => {
        if (!r.temps_prevu_par_piece || r.temps_prevu_par_piece <= 0) return null;
        if (r.temps_reel_par_piece && r.temps_reel_par_piece > 0) {
            return Math.round((r.temps_prevu_par_piece / r.temps_reel_par_piece) * 100);
        }
        const pieces = r.pieces_sorties || 0;
        if (pieces <= 0) return null;
        const objectif = minutesCreneau(r.heure_debut) / r.temps_prevu_par_piece;
        if (objectif <= 0) return null;
        return Math.round((pieces / objectif) * 100);
    };

    /* Vrai quand la note vient d'un chronometrage : l'utilisateur doit savoir si
       la note est mesuree ou seulement deduite de la quantite. */
    const scoreChronometre = (r: PosteSuiviData): boolean =>
        !!(r.temps_reel_par_piece && r.temps_reel_par_piece > 0);

    const classeScore = (sc: number) =>
        sc >= 100 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : sc >= 80 ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';

    /* Progression : moyenne des scores de chaque ouvrier sur TOUT l'historique
       charge, pas seulement la journee — c'est la raison d'etre du releve. */
    const progression = useMemo(() => {
        const parOuvrier = new Map<string, { somme: number; n: number; pieces: number; postes: Set<string> }>();
        posteSuivis.forEach(r => {
            if (!r.workerId) return;
            const acc = parOuvrier.get(r.workerId) || { somme: 0, n: 0, pieces: 0, postes: new Set<string>() };
            const sc = scoreReleve(r);
            if (sc !== null) { acc.somme += sc; acc.n += 1; }
            acc.pieces += r.pieces_sorties || 0;
            acc.postes.add(r.posteId);
            parOuvrier.set(r.workerId, acc);
        });
        return Array.from(parOuvrier.entries())
            .map(([id, a]) => ({
                id,
                nom: workers.find(w => String(w.id) === String(id))?.full_name || id,
                moyenne: a.n > 0 ? Math.round(a.somme / a.n) : null,
                pieces: a.pieces,
                postes: a.postes.size,
            }))
            .sort((a, b) => (b.moyenne ?? -1) - (a.moyenne ?? -1));
    }, [posteSuivis, workers]);

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Barre d'entete : chaines + date, dans le meme esprit que la grille horaire */}
            <div className="shrink-0 bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border/60 px-3 py-2.5 sm:px-6 sm:py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-[13px] sm:text-sm font-black text-slate-800 dark:text-dk-text truncate">{tx(lang, L.title)}</h2>
                    <p className="hidden sm:block text-[11px] text-slate-400 dark:text-dk-muted font-medium">{tx(lang, L.subtitle)}</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="bg-slate-100 dark:bg-dk-elevated/80 p-0.5 rounded-xl border border-slate-200 dark:border-dk-border/50 flex gap-0.5 overflow-x-auto max-w-[240px] sm:max-w-[400px] no-scrollbar">
                        {chainsList.map(cId => (
                            <button
                                key={cId}
                                type="button"
                                onClick={() => setSelectedChaineId(cId)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all shrink-0 min-h-[40px] sm:min-h-0 ${selectedChaineId === cId ? 'bg-white dark:bg-dk-surface text-indigo-900 dark:text-indigo-200 shadow-sm border border-indigo-100 dark:border-indigo-800/50' : 'text-slate-500 dark:text-dk-muted'}`}
                            >
                                {cId}
                            </button>
                        ))}
                    </div>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setGlobalDate && setGlobalDate(e.target.value)}
                        className="h-10 sm:h-9 text-[12px] font-bold text-slate-700 dark:text-dk-text bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl px-2 outline-none"
                    />
                </div>
            </div>

            {/* Creneau horaire courant (auto), rappel pour l'utilisateur */}
            <div className="shrink-0 px-3 sm:px-6 py-2 flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-dk-muted bg-[#fafbfe] dark:bg-dk-bg border-b border-slate-100 dark:border-dk-border/40">
                <Clock className="w-3.5 h-3.5" />
                {tx(lang, L.hourNow)} : <span className="text-slate-800 dark:text-dk-text">{nowBlock.label}</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400 dark:text-dk-muted gap-2 text-sm font-bold">
                        <Loader2 className="w-4 h-4 animate-spin" /> {tx(lang, L.loading)}
                    </div>
                ) : !activeModel || postes.length === 0 ? (
                    <div className="flex items-center justify-center py-16 text-slate-400 dark:text-dk-muted text-sm font-bold text-center px-6">
                        {tx(lang, L.noModel)}
                    </div>
                ) : isMobile ? (
                    <div className="space-y-2.5">
                        {postes.map(poste => {
                            const d = getDraft(poste.id);
                            const rowsToday = suivisByPoste.get(poste.id) || [];
                            const totalQtyToday = rowsToday.reduce((sum, r) => sum + (r.pieces_sorties || 0), 0);
                            const scoresJour = rowsToday.map(scoreReleve).filter((x): x is number => x !== null);
                            const scoreMesure = rowsToday.some(scoreChronometre);
                            const scorePoste = scoresJour.length > 0
                                ? Math.round(scoresJour.reduce((a, b) => a + b, 0) / scoresJour.length)
                                : null;
                            const isSaving = savingId === poste.id;
                            const isSaved = savedId === poste.id;
                            return (
                                <div key={poste.id} className="rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface p-3 space-y-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <p className="font-black text-[13px] text-slate-800 dark:text-dk-text">{poste.description || poste.id}</p>
                                            {poste.machineName && <p className="text-[10px] text-slate-400 dark:text-dk-muted font-bold">{poste.machineName}</p>}
                                        </div>
                                        {scorePoste !== null && (
                                            <span
                                                className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-black tabular-nums ${classeScore(scorePoste)}`}
                                                title={scoreMesure ? undefined : tx(lang, L.scoreEstime)}
                                            >
                                                {scoreMesure ? '' : '~'}{scorePoste}%
                                            </span>
                                        )}
                                    </div>

                                    <div className="relative">
                                        <select
                                            value={d.workerId}
                                            onChange={(e) => setDraft(poste.id, { workerId: e.target.value })}
                                            className="w-full min-h-[44px] appearance-none text-[13px] font-bold text-slate-700 dark:text-dk-text bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-xl pl-3 pr-8 outline-none"
                                        >
                                            <option value="">{tx(lang, L.chooseWorker)}</option>
                                            {workersSorted.map(w => (
                                                <option key={w.id} value={w.id}>{w.full_name}{w.chaine_id === selectedChaineId ? '' : ` (${w.chaine_id || '-'})`}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <label className="block">
                                            <span className="block mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">{tx(lang, L.qty)}</span>
                                            <input
                                                type="number"
                                                min={0}
                                                placeholder="0"
                                                value={d.qty}
                                                onChange={(e) => setDraft(poste.id, { qty: e.target.value === '' ? '' : Number(e.target.value) })}
                                                className="w-full min-h-[44px] text-[14px] font-black text-slate-800 dark:text-dk-text bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-xl px-3 outline-none"
                                            />
                                        </label>
                                        <label className="block">
                                            <span className="block mb-1 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">{tx(lang, L.defects)}</span>
                                            <input
                                                type="number"
                                                min={0}
                                                placeholder="0"
                                                value={d.defauts}
                                                onChange={(e) => setDraft(poste.id, { defauts: e.target.value === '' ? '' : Number(e.target.value) })}
                                                className="w-full min-h-[44px] text-[14px] font-bold text-slate-600 dark:text-dk-text-soft bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-xl px-3 outline-none"
                                            />
                                        </label>
                                    </div>

                                    <MiniChrono
                                        open={chronoOpenFor === poste.id}
                                        onToggle={() => setChronoOpenFor(cur => (cur === poste.id ? null : poste.id))}
                                        onFinish={(ms) => setDraft(poste.id, { tempsMs: ms })}
                                        lang={lang}
                                        tempsMs={d.tempsMs}
                                    />

                                    <div className="flex items-center justify-between gap-2 pt-0.5">
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">
                                            {totalQtyToday} pcs · {rowsToday.length} {tx(lang, L.entriesToday)}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={d.qty === '' || isSaving}
                                            onClick={() => saveRow(poste)}
                                            className={`min-h-[44px] px-4 flex items-center justify-center gap-1.5 rounded-xl text-[12px] font-black transition-colors ${
                                                d.qty === '' ? 'bg-slate-100 dark:bg-dk-elevated/60 text-slate-300 dark:text-dk-muted cursor-not-allowed' :
                                                isSaved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                            }`}
                                        >
                                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : isSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                                            {isSaved ? tx(lang, L.saved) : tx(lang, L.saveRow)}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface">
                        <table className="w-full min-w-[760px] text-[12px]">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-dk-elevated/60 text-slate-500 dark:text-dk-muted text-[10px] uppercase tracking-wider font-black">
                                    <th className="text-left px-3 py-2.5">{tx(lang, L.poste)}</th>
                                    <th className="text-left px-3 py-2.5">{tx(lang, L.worker)}</th>
                                    <th className="text-left px-3 py-2.5 w-28">{tx(lang, L.qty)}</th>
                                    <th className="text-left px-3 py-2.5 w-24">{tx(lang, L.defects)}</th>
                                    <th className="text-left px-3 py-2.5 w-40">{tx(lang, L.chrono)}</th>
                                    <th className="text-left px-3 py-2.5 w-20">{tx(lang, L.score)}</th>
                                    <th className="text-left px-3 py-2.5 w-32">{tx(lang, L.today)}</th>
                                    <th className="w-24" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dk-border/40">
                                {postes.map(poste => {
                                    const d = getDraft(poste.id);
                                    const rowsToday = suivisByPoste.get(poste.id) || [];
                                    const totalQtyToday = rowsToday.reduce((s, r) => s + (r.pieces_sorties || 0), 0);
                                    const scoresJour = rowsToday.map(scoreReleve).filter((x): x is number => x !== null);
                                    const scoreMesure = rowsToday.some(scoreChronometre);
                                    const scorePoste = scoresJour.length > 0
                                        ? Math.round(scoresJour.reduce((a, b) => a + b, 0) / scoresJour.length)
                                        : null;
                                    const isSaving = savingId === poste.id;
                                    const isSaved = savedId === poste.id;
                                    return (
                                        <React.Fragment key={poste.id}>
                                            <tr className="hover:bg-slate-50/60 dark:hover:bg-dk-elevated/30">
                                                <td className="px-3 py-2.5 align-top">
                                                    <p className="font-black text-slate-800 dark:text-dk-text">{poste.description || poste.id}</p>
                                                    {poste.machineName && <p className="text-[10px] text-slate-400 dark:text-dk-muted font-bold">{poste.machineName}</p>}
                                                </td>
                                                <td className="px-3 py-2.5 align-top">
                                                    <div className="relative">
                                                        <select
                                                            value={d.workerId}
                                                            onChange={(e) => setDraft(poste.id, { workerId: e.target.value })}
                                                            className="w-full min-h-[40px] appearance-none text-[12px] font-bold text-slate-700 dark:text-dk-text bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-lg pl-2.5 pr-7 outline-none"
                                                        >
                                                            <option value="">{tx(lang, L.chooseWorker)}</option>
                                                            {workersSorted.map(w => (
                                                                <option key={w.id} value={w.id}>{w.full_name}{w.chaine_id === selectedChaineId ? '' : ` (${w.chaine_id || '-'})`}</option>
                                                            ))}
                                                        </select>
                                                        <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2.5 align-top">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        placeholder="0"
                                                        value={d.qty}
                                                        onChange={(e) => setDraft(poste.id, { qty: e.target.value === '' ? '' : Number(e.target.value) })}
                                                        className="w-20 min-h-[40px] text-[12px] font-black text-slate-800 dark:text-dk-text bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-lg px-2 outline-none"
                                                    />
                                                </td>
                                                <td className="px-3 py-2.5 align-top">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        placeholder="0"
                                                        value={d.defauts}
                                                        onChange={(e) => setDraft(poste.id, { defauts: e.target.value === '' ? '' : Number(e.target.value) })}
                                                        className="w-16 min-h-[40px] text-[12px] font-bold text-slate-600 dark:text-dk-text-soft bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-lg px-2 outline-none"
                                                    />
                                                </td>
                                                <td className="px-3 py-2.5 align-top">
                                                    <MiniChrono
                                                        open={chronoOpenFor === poste.id}
                                                        onToggle={() => setChronoOpenFor(cur => (cur === poste.id ? null : poste.id))}
                                                        onFinish={(ms) => setDraft(poste.id, { tempsMs: ms })}
                                                        lang={lang}
                                                        tempsMs={d.tempsMs}
                                                    />
                                                </td>
                                                <td className="px-3 py-2.5 align-top">
                                                    {scorePoste === null ? (
                                                        <span className="text-slate-300 dark:text-dk-muted font-bold">—</span>
                                                    ) : (
                                                        <span
                                                            className={`inline-block rounded-md px-2 py-1 text-[11px] font-black tabular-nums ${classeScore(scorePoste)}`}
                                                            title={scoreMesure ? undefined : tx(lang, L.scoreEstime)}
                                                        >
                                                            {scoreMesure ? '' : '~'}{scorePoste}%
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 align-top">
                                                    <p className="font-black text-slate-800 dark:text-dk-text">{totalQtyToday}</p>
                                                    <p className="text-[10px] text-slate-400 dark:text-dk-muted font-bold">{rowsToday.length} {tx(lang, L.entriesToday)}</p>
                                                </td>
                                                <td className="px-3 py-2.5 align-top">
                                                    <button
                                                        type="button"
                                                        disabled={d.qty === '' || isSaving}
                                                        onClick={() => saveRow(poste)}
                                                        className={`w-full min-h-[40px] flex items-center justify-center gap-1.5 rounded-lg text-[11px] font-black transition-colors ${
                                                            d.qty === '' ? 'bg-slate-100 dark:bg-dk-elevated/60 text-slate-300 dark:text-dk-muted cursor-not-allowed' :
                                                            isSaved ? 'bg-emerald-500 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                                        }`}
                                                    >
                                                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isSaved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                                                        {isSaved ? tx(lang, L.saved) : tx(lang, L.saveRow)}
                                                    </button>
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Progression : ce que les releves accumules finissent par dire de
                    chaque ouvrier — sa moyenne, ses pieces, ses postes tenus. */}
                {!loading && (
                    <div className="mt-3 sm:mt-4 rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface p-3 sm:p-4">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">
                            <User className="w-3.5 h-3.5" /> {tx(lang, L.progression)}
                        </div>
                        {progression.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.progressionVide)}</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {progression.map(p => (
                                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-dk-bg px-3 py-2">
                                        <span className="min-w-0 truncate text-[12px] font-bold text-slate-700 dark:text-dk-text">{p.nom}</span>
                                        <span className="shrink-0 text-right">
                                            <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-black tabular-nums ${p.moyenne === null ? 'text-slate-300 dark:text-dk-muted' : classeScore(p.moyenne)}`}>
                                                {p.moyenne === null ? '—' : `${p.moyenne}%`}
                                            </span>
                                            <span className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                                                {p.pieces} pcs · {p.postes} {tx(lang, L.postesTenus)}
                                            </span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// Chronometre minimal : demarrer/arreter, le temps ecoule (ms) remonte au parent
// qui le divise par la quantite saisie pour obtenir le temps reel par piece.
function MiniChrono({ open, onToggle, onFinish, lang, tempsMs }: { open: boolean; onToggle: () => void; onFinish: (ms: number) => void; lang: string; tempsMs: number | null }) {
    const [running, setRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const startRef = useRef(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

    const start = () => {
        startRef.current = Date.now() - elapsed;
        intervalRef.current = setInterval(() => setElapsed(Date.now() - startRef.current), 100);
        setRunning(true);
    };
    const stop = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setRunning(false);
        onFinish(elapsed);
    };
    const reset = () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setRunning(false);
        setElapsed(0);
        onFinish(0);
    };

    const fmt = (ms: number) => {
        const totalSec = Math.floor(ms / 1000);
        const mn = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const sc = (totalSec % 60).toString().padStart(2, '0');
        return `${mn}:${sc}`;
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={onToggle}
                className="min-h-[40px] px-2.5 flex items-center gap-1.5 rounded-lg text-[11px] font-bold text-slate-500 dark:text-dk-muted bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border"
            >
                <Clock className="w-3.5 h-3.5" />
                {tempsMs ? fmt(tempsMs) : tx(lang, L.chrono)}
            </button>
        );
    }

    return (
        <div className="flex items-center gap-1.5">
            <span className="tabular-nums font-black text-slate-800 dark:text-dk-text text-[12px] w-12">{fmt(elapsed)}</span>
            {!running ? (
                <button type="button" onClick={start} className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-emerald-500 text-white"><Play className="w-3.5 h-3.5" /></button>
            ) : (
                <button type="button" onClick={stop} className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-rose-500 text-white"><Square className="w-3.5 h-3.5" /></button>
            )}
            <button type="button" onClick={reset} className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-slate-100 dark:bg-dk-elevated/60 text-slate-500 dark:text-dk-muted"><Pause className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={onToggle} className="text-[10px] font-bold text-slate-400 underline">×</button>
        </div>
    );
}
