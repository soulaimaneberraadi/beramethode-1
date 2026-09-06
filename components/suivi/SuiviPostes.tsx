import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AppSettings, ModelData, PlanningEvent, PosteSuiviData, HRWorker, Operation } from '../../types';
import { deriveHourGrid } from './shared/hours';
import { pauseOverlapMinutes, horairesDuJour } from '../../lib/horaires';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { useIsMobile } from '../planning/shared/useIsMobile';
import { Clock, User, Play, Pause, Square, Save, CheckCircle2, Loader2, ChevronDown } from 'lucide-react';
import AjoutPosteRapide from './AjoutPosteRapide';
import { signalerMesureTemps } from '../../lib/mesuresTemps';

interface Props {
    models: ModelData[];
    planningEvents: PlanningEvent[];
    settings: AppSettings;
    chainsList: string[];
    selectedChaineId: string;
    setSelectedChaineId: (id: string) => void;
    globalDate?: string;
    setGlobalDate?: (d: string) => void;
    /** Ouvre l'atelier des methodes sur l'etape Gamme du modele donne. */
    onOpenGamme?: (modelId: string) => void;
    /** Ajoute une operation a la gamme du modele et la persiste. */
    onAddPoste?: (modelId: string, op: Operation) => Promise<void>;
}

const L = {
    title: { fr: 'Suivi par poste / ouvrier', ar: 'التتبع حسب المحطة والعامل', en: 'Poste / worker tracking', es: 'Seguimiento por puesto/operario', pt: 'Acompanhamento por posto/operário', tr: 'İstasyon/işçi takibi' },
    subtitle: { fr: "Un releve par poste, par ouvrier, range automatiquement dans l'heure en cours", ar: 'تسجيل لكل محطة ولكل عامل، يُصنَّف تلقائياً في الساعة الجارية', en: 'One entry per poste, per worker, auto-filed to the current hour', es: 'Un registro por puesto y operario, clasificado automáticamente en la hora actual', pt: 'Um registo por posto e operário, arquivado automaticamente na hora atual', tr: 'İstasyon ve işçi başına bir kayıt, otomatik olarak geçerli saate yazılır' },
    noModel: { fr: 'Aucun modèle planifié sur cette chaîne pour cette date', ar: 'لا يوجد نموذج مخطط لهذه السلسلة في هذا التاريخ', en: 'No model planned on this line for this date', es: 'Ningún modelo planificado en esta línea para esta fecha', pt: 'Nenhum modelo planeado nesta linha para esta data', tr: 'Bu tarihte bu hatta planlanmış model yok' },
    noModelIntrouvable: { fr: "L'OF selectionne pointe vers un modele introuvable (il a ete supprime ou renomme). Ouvrez le Planning et rattachez l'OF a un modele.", ar: 'الـ OF المحدَّد يشير إلى موديل غير موجود (حُذف أو غُيّر). افتح Planning وأعد ربط الـ OF بموديل.', en: 'The selected OF points to a missing model (deleted or renamed). Open Planning and re-attach the OF to a model.', es: 'La OF seleccionada apunta a un modelo inexistente (eliminado o renombrado). Abra Planning y vuelva a vincular la OF.', pt: 'A OF selecionada aponta para um modelo inexistente (eliminado ou renomeado). Abra o Planning e volte a associar a OF.', tr: 'Secili OF eksik bir modele isaret ediyor (silinmis veya yeniden adlandirilmis). Planning ekranindan OF u bir modele yeniden baglayin.' },
    noGamme: { fr: "Ce modele n'a pas encore de gamme operatoire : il n'y a donc aucun poste a relever. Ingenierie › Gamme operatoire.", ar: 'هذا الموديل ما عندوش گام عملياتي بعد: ما كاين حتى منصب باش نسجّلو. Ingénierie › Gamme opératoire.', en: 'This model has no operation sheet yet, so there is no poste to record. Engineering › Gamme.', es: 'Este modelo aun no tiene gama operativa: no hay ningun puesto que registrar. Ingenieria › Gama.', pt: 'Este modelo ainda nao tem gama operatoria: nao ha nenhum posto a registar. Engenharia › Gama.', tr: 'Bu modelin henuz operasyon listesi yok, bu yuzden kaydedilecek istasyon da yok. Muhendislik › Gamme.' },
    ouvrirGamme: { fr: 'Remplir la gamme de ce modele', ar: 'عمّر الگام ديال هاد الموديل', en: 'Fill this model’s gamme', es: 'Completar la gama de este modelo', pt: 'Preencher a gama deste modelo', tr: 'Bu modelin gamme’ini doldur' },
    poste: { fr: 'Poste', ar: 'المحطة', en: 'Poste', es: 'Puesto', pt: 'Posto', tr: 'İstasyon' },
    worker: { fr: 'Ouvrier', ar: 'العامل', en: 'Worker', es: 'Operario', pt: 'Operário', tr: 'İşçi' },
    chooseWorker: { fr: 'Choisir un ouvrier…', ar: 'اختر عاملاً…', en: 'Choose a worker…', es: 'Elegir un operario…', pt: 'Escolher um operário…', tr: 'İşçi seçin…' },
    hourNow: { fr: 'Créneau', ar: 'الفترة', en: 'Slot', es: 'Franja', pt: 'Faixa', tr: 'Zaman dilimi' },
    chrono: { fr: 'Chronométrer', ar: 'حساب الزمن', en: 'Time it', es: 'Cronometrar', pt: 'Cronometrar', tr: 'Kronometre' },
    start: { fr: 'Démarrer', ar: 'ابدأ', en: 'Start', es: 'Iniciar', pt: 'Iniciar', tr: 'Başlat' },
    stop: { fr: 'Arrêter', ar: 'إيقاف', en: 'Stop', es: 'Detener', pt: 'Parar', tr: 'Durdur' },
    reset: { fr: 'Réinitialiser', ar: 'إعادة تعيين', en: 'Reset', es: 'Reiniciar', pt: 'Repor', tr: 'Sıfırla' },
    timePerPiece: { fr: 'Temps / pièce', ar: 'الزمن / قطعة', en: 'Time / piece', es: 'Tiempo / pieza', pt: 'Tempo / peça', tr: 'Parça başı süre' },
    loading: { fr: 'Chargement…', ar: 'جار التحميل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yükleniyor…' },
    score: { fr: 'Score', ar: 'النتيجة', en: 'Score', es: 'Puntuación', pt: 'Pontuação', tr: 'Puan' },
    progression: { fr: 'Progression des ouvriers', ar: 'تقدّم العمّال', en: 'Worker progression', es: 'Progresión de operarios', pt: 'Progressão dos operários', tr: 'İşçi gelişimi' },
    progressionVide: { fr: "Pas encore de relevé chronométré : le score apparaît dès qu'un temps est mesuré.", ar: 'لا يوجد تسجيل مُوقَّت بعد: النتيجة تظهر بمجرّد قياس زمن.', en: 'No timed entry yet: the score appears as soon as a time is measured.', es: 'Aún no hay registro cronometrado: la puntuación aparece en cuanto se mide un tiempo.', pt: 'Ainda sem registo cronometrado: a pontuação aparece assim que um tempo for medido.', tr: 'Henüz süre ölçümü yok: bir süre ölçülür ölçülmez puan görünür.' },
    scoreEstime: { fr: 'Score estime depuis la quantite (pas de chronometrage)', ar: 'نتيجة مُقدَّرة من الكمية (بلا كرونومتراج)', en: 'Score estimated from quantity (no timing)', es: 'Puntuacion estimada por la cantidad (sin cronometraje)', pt: 'Pontuacao estimada pela quantidade (sem cronometragem)', tr: 'Miktardan tahmin edilen puan (olcum yok)' },
    postesTenus: { fr: 'postes tenus', ar: 'مناصب مشغولة', en: 'stations held', es: 'puestos cubiertos', pt: 'postos ocupados', tr: 'tutulan istasyon' },
    modeleActif: { fr: 'Modèle actif', ar: 'الموديل النشط', en: 'Active model', es: 'Modelo activo', pt: 'Modelo ativo', tr: 'Aktif model' },
    total: { fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam' },
    cadence: { fr: 'Cadence', ar: 'الوتيرة', en: 'Rate', es: 'Cadencia', pt: 'Cadência', tr: 'Tempo' },
    cadenceMesuree: { fr: 'Cadence mesurée au chronomètre', ar: 'وتيرة مقيسة بالكرونومتر', en: 'Rate measured with the stopwatch', es: 'Cadencia medida con cronómetro', pt: 'Cadência medida com cronómetro', tr: 'Kronometreyle ölçülen tempo' },
    cadenceGamme: { fr: 'Cadence prévue par la gamme (pas encore chronométrée)', ar: 'الوتيرة المتوقّعة من الگام (مازال بلا كرونومتراج)', en: 'Rate expected from the gamme (not timed yet)', es: 'Cadencia prevista por la gama (aún sin cronometrar)', pt: 'Cadência prevista pela gama (ainda sem cronometragem)', tr: 'Gamme’ın öngördüğü tempo (henüz ölçülmedi)' },
    tendanceTitre: { fr: 'Dernier creneau compare au precedent', ar: 'آخر فترة مقارنة باللي قبلها', en: 'Last slot compared with the previous one', es: 'Ultima franja comparada con la anterior', pt: 'Ultima faixa comparada com a anterior', tr: 'Son dilimin bir oncekiyle karsilastirmasi' },
    pauseTag: { fr: 'pause', ar: 'استراحة', en: 'break', es: 'pausa', pt: 'pausa', tr: 'mola' },
    piecesJour: { fr: 'pcs aujourd’hui', ar: 'قطعة اليوم', en: 'pcs today', es: 'pzs hoy', pt: 'pcs hoje', tr: 'bugun adet' },
    releves: { fr: 'Releves du jour', ar: 'تسجيلات اليوم', en: 'Day entries', es: 'Registros del dia', pt: 'Registos do dia', tr: 'Gun kayitlari' },
    relevesHint: { fr: 'Une ligne par poste. Chaque case est ce que le poste a sorti dans ce creneau — elle se corrige.', ar: 'سطر لكل منصب. كل خانة هي اللي خرّج المنصب فديك الفترة — وكتّصحّح.', en: 'One row per poste. Each cell is what the poste produced in that slot — it can be corrected.', es: 'Una fila por puesto. Cada casilla es lo que el puesto produjo en ese tramo — se puede corregir.', pt: 'Uma linha por posto. Cada celula e o que o posto produziu nessa faixa — pode ser corrigida.', tr: 'Istasyon basina bir satir. Her hucre, istasyonun o dilimde urettigidir — duzeltilebilir.' },
    tsPrevu: { fr: 'TS (s)', ar: 'TS (ث)', en: 'TS (s)', es: 'TS (s)', pt: 'TS (s)', tr: 'TS (sn)' },
    tsPrevuTitre: { fr: 'Temps standard par piece, de la gamme', ar: 'الزمن المعياري للقطعة، من الگام', en: 'Standard time per piece, from the gamme', es: 'Tiempo estandar por pieza, de la gama', pt: 'Tempo padrao por peca, da gama', tr: 'Gamme’dan parca basi standart sure' },
    totalGeneral: { fr: 'Total general', ar: 'المجموع العام', en: 'Grand total', es: 'Total general', pt: 'Total geral', tr: 'Genel toplam' },
    defCourt: { fr: 'Def.', ar: 'عيوب', en: 'Def.', es: 'Def.', pt: 'Def.', tr: 'Hata' },
    defTitre: { fr: 'Defauts du creneau en cours', ar: 'عيوب الفترة الجارية', en: 'Defects of the current slot', es: 'Defectos de la franja actual', pt: 'Defeitos da faixa atual', tr: 'Gecerli dilimin hatalari' },
    chronoTitre: { fr: 'Chronometrer ce poste', ar: 'قيس زمن هاد المنصب', en: 'Time this poste', es: 'Cronometrar este puesto', pt: 'Cronometrar este posto', tr: 'Bu istasyonu olc' },
    chronoSansPieces: { fr: 'Notez d’abord des pieces dans le creneau en cours : le temps mesure s’y rattache.', ar: 'سجّل الأول القطع فالفترة الجارية: الزمن المقيس كيتربط بيها.', en: 'Record pieces in the current slot first: the measured time attaches to it.', es: 'Registre primero piezas en la franja actual: el tiempo medido se asocia a ella.', pt: 'Registe primeiro pecas na faixa atual: o tempo medido associa-se a ela.', tr: 'Once gecerli dilime parca girin: olculen sure ona baglanir.' },
    primeJour: { fr: 'Jour', ar: 'اليوم', en: 'Day', es: 'Día', pt: 'Dia', tr: 'Gün' },
    primeSemaine: { fr: 'Semaine', ar: 'الأسبوع', en: 'Week', es: 'Semana', pt: 'Semana', tr: 'Hafta' },
    prime: { fr: 'Prime', ar: 'العلاوة', en: 'Bonus', es: 'Prima', pt: 'Prémio', tr: 'Prim' },
    primeAucuneRegle: { fr: "Aucune règle de prime réglée — Admin › Paramètres entreprise.", ar: 'ما كايناش قاعدة ديال العلاوة — Admin › إعدادات الشركة.', en: 'No bonus rule set — Admin › Company settings.', es: 'Sin regla de prima definida — Admin › Ajustes de empresa.', pt: 'Sem regra de prémio definida — Admin › Definições da empresa.', tr: 'Prim kuralı ayarlanmadı — Admin › Şirket ayarları.' },
    postesMaitrises: { fr: 'Postes tenus (meilleur score en tête)', ar: 'المناصب اللي كيتقنها (الأحسن أولاً)', en: 'Postes held (best score first)', es: 'Puestos cubiertos (mejor puntuación primero)', pt: 'Postos ocupados (melhor pontuação primeiro)', tr: 'Tutulan istasyonlar (en iyi puan önce)' },
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

export default function SuiviPostes({ models, planningEvents, settings, chainsList, selectedChaineId, setSelectedChaineId, globalDate, setGlobalDate, onOpenGamme, onAddPoste }: Props) {
    const { lang } = useLang();
    /* Le releve se fait au pied de la chaine, telephone en main : un tableau
       de douze colonnes n'y tient pas. Sur petit ecran, les creneaux se lisent
       donc en liste sous chaque poste — la forme du Suivi. */
    const isMobile = useIsMobile();
    const date = globalDate || todayStr();

    const [posteSuivis, setPosteSuivis] = useState<PosteSuiviData[]>([]);
    const [workers, setWorkers] = useState<HRWorker[]>([]);
    const [loading, setLoading] = useState(true);
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

    /* TOUS les OF de la chaine qui couvrent la date, et on en choisit un — comme
       sur la grille horaire. Avant, le premier trouve gagnait en silence : deux OF
       sur la meme chaine et le second etait tout simplement introuvable ici. Un OF
       marque `Terminé` ne se propose plus : il n'a plus rien a relever. */
    const planningsChaine = useMemo(() => planningEvents.filter(p => {
        if (p.chaineId !== selectedChaineId) return false;
        if (p.status === 'DONE') return false;
        const start = (p.startDate || p.dateLancement || '').split('T')[0];
        const end = (p.estimatedEndDate || p.dateExport || p.dateFin || start).split('T')[0];
        return start <= date && end >= date;
    }), [planningEvents, selectedChaineId, date]);

    const [selectedPlanningId, setSelectedPlanningId] = useState<string>('');
    useEffect(() => {
        if (planningsChaine.length === 0) { setSelectedPlanningId(''); return; }
        if (!planningsChaine.some(p => p.id === selectedPlanningId)) setSelectedPlanningId(planningsChaine[0].id);
    }, [planningsChaine, selectedPlanningId]);

    const activePlanning = useMemo(
        () => planningsChaine.find(p => p.id === selectedPlanningId) || planningsChaine[0] || null,
        [planningsChaine, selectedPlanningId],
    );

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

    /* ─── Grille du jour : un poste par ligne, les creneaux du jour en colonnes ───
       Le releve rapide ci-dessous ne remplit que le creneau EN COURS : on ne
       pouvait donc pas rattraper une heure passee, ni relire la journee poste par
       poste. La grille, elle, montre et accepte les heures du jour entier, avec
       exactement les creneaux de CE jour (donc l'exception du vendredi comprise). */
    const idCellule = (posteId: string, hourKey: string) => `${activePlanning?.id}-${posteId}-${date}-${hourKey}`;

    const celluleDe = (posteId: string, hourKey: string): PosteSuiviData | undefined =>
        posteSuivis.find(s => s.id === idCellule(posteId, hourKey));

    /* L'ouvrier tenu sur un poste vaut pour la journee : on prend celui du premier
       releve du jour, sinon celui choisi dans la saisie rapide. */
    const ouvrierDuPoste = (posteId: string): string => {
        const rows = suivisByPoste.get(posteId) || [];
        const avecOuvrier = rows.find(r => r.workerId);
        return String(avecOuvrier?.workerId || getDraft(posteId).workerId || '');
    };

    /* Ajout d'un poste depuis cette page. L'operation part dans la gamme du
       modele (source unique), et l'ouvrier choisi a la creation prend la main
       tout de suite sur la saisie du poste — sinon il faudrait le re-choisir. */
    const ajouterPoste = async (op: Operation, workerId: string) => {
        if (!activeModel || !onAddPoste) return;
        await onAddPoste(activeModel.id, op);
        if (workerId) setDraft(op.id, { workerId });
    };

    /** Nom de l'ouvrier qui tient le poste aujourd'hui, vide s'il n'y en a pas. */
    const nomOuvrier = (posteId: string): string => {
        const id = ouvrierDuPoste(posteId);
        if (!id) return '';
        return workers.find(w => String(w.id) === String(id))?.full_name || '';
    };

    /**
     * Tendance du poste : le dernier creneau rempli compare au precedent.
     *
     * C'est la lecture du carnet — « 150 pieces, +25 % » — et la seule qui se
     * fasse d'un coup d'oeil au pied de la chaine : le poste accelere ou ralentit.
     * Sans DEUX creneaux remplis il n'y a rien a comparer, et on n'affiche rien
     * plutot qu'un pourcentage invente.
     */
    const tendancePoste = (poste: Operation): { sens: 'hausse' | 'baisse'; pct: number } | null => {
        const remplis = hourGrid.blocks
            .map(b => celluleDe(poste.id, b.key)?.pieces_sorties || 0)
            .filter(v => v > 0);
        if (remplis.length < 2) return null;
        const dernier = remplis[remplis.length - 1];
        const avant = remplis[remplis.length - 2];
        if (avant <= 0) return null;
        const pct = Math.round(((dernier - avant) / avant) * 100);
        if (pct === 0) return null;
        return { sens: pct > 0 ? 'hausse' : 'baisse', pct: Math.abs(pct) };
    };

    /** Ce qu'il faut savoir d'un poste pour la journee, sous les deux mises en page. */
    const bilanPoste = (poste: Operation) => {
        const rows = suivisByPoste.get(poste.id) || [];
        const total = rows.reduce((somme, r) => somme + (r.pieces_sorties || 0), 0);
        const scores = rows.map(scoreReleve).filter((x): x is number => x !== null);
        const score = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        return { rows, total, score, mesure: rows.some(scoreChronometre) };
    };

    const [cellSavingId, setCellSavingId] = useState<string | null>(null);

    const persisterCellules = async (payloads: PosteSuiviData[]) => {
        if (payloads.length === 0) return;
        try {
            const res = await fetch('/api/poste-suivi', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ suivis: payloads }),
            });
            if (!res.ok) console.error('SuiviPostes: enregistrement refuse', res.status);
        } catch (e) {
            console.error('SuiviPostes: save cellule error', e);
        }
    };

    /* Une case de la grille porte une valeur ABSOLUE (ce que le poste a sorti
       dans ce creneau), pas un cumul : c'est une correction.

       `ecrireCellule` est le seul chemin d'ecriture d'un creneau — pieces,
       defauts ou temps mesure passent par lui. Avoir deux chemins, c'etait deux
       facons de rater le meme champ. */
    const ecrireCellule = async (poste: Operation, hourKey: string, patch: Partial<PosteSuiviData>) => {
        if (!activePlanning || !activeModel) return;
        const rowId = idCellule(poste.id, hourKey);
        const existing = celluleDe(poste.id, hourKey);
        const workerId = ouvrierDuPoste(poste.id);

        const pieces = patch.pieces_sorties ?? existing?.pieces_sorties ?? 0;
        const defauts = patch.pieces_defaut ?? existing?.pieces_defaut ?? 0;
        const temps = patch.temps_reel_par_piece ?? existing?.temps_reel_par_piece;
        /* Rien a garder : ni pieces, ni defauts, ni mesure. On n'ecrit pas une
           ligne vide qui ferait croire a un releve fait a zero piece. */
        if (!existing && pieces === 0 && defauts === 0 && !temps) return;

        const payload: PosteSuiviData = {
            ...(existing || {} as PosteSuiviData),
            id: rowId,
            planningId: activePlanning.id,
            modelId: activeModel.id,
            posteId: poste.id,
            workerId: workerId || existing?.workerId,
            date,
            heure_debut: hourKey,
            heure_fin: existing?.heure_fin,
            pieces_entrees: pieces,
            pieces_sorties: pieces,
            pieces_defaut: defauts,
            temps_reel_par_piece: temps,
            temps_prevu_par_piece: poste.time,
            notes: existing?.notes,
            problemes: existing?.problemes || [],
        };

        setCellSavingId(rowId);
        setPosteSuivis(prev => [...prev.filter(s => s.id !== rowId), payload]);
        await persisterCellules([payload]);
        setCellSavingId(cur => (cur === rowId ? null : cur));
    };

    const saveCellule = (poste: Operation, hourKey: string, valeur: number | null) =>
        ecrireCellule(poste, hourKey, { pieces_sorties: valeur ?? 0, pieces_entrees: valeur ?? 0 });

    /* Le chrono mesure des millisecondes pour un lot de pieces ; la gamme et le
       score comptent en MINUTES par piece. La conversion se fait ici, une seule
       fois : une seconde prise pour une minute fausserait le score d'un facteur 60.
       Sans pieces notees dans le creneau, la mesure n'a pas de diviseur — on ne
       l'invente pas. */
    const appliquerChrono = async (poste: Operation, ms: number) => {
        const cellule = celluleDe(poste.id, nowBlock.key);
        const pieces = cellule?.pieces_sorties || 0;
        if (pieces <= 0) return;
        const tpp = Number(((ms / 60000) / pieces).toFixed(4));
        await ecrireCellule(poste, nowBlock.key, { temps_reel_par_piece: tpp });
    };

    /* Changer l'ouvrier d'un poste rejaillit sur TOUS ses releves du jour :
       sinon la moitie de la journee resterait creditee a la personne precedente. */
    const changerOuvrierPoste = async (poste: Operation, workerId: string) => {
        setDraft(poste.id, { workerId });
        const rows = (suivisByPoste.get(poste.id) || []).filter(r => String(r.workerId || '') !== workerId);
        if (rows.length === 0) return;
        const majs = rows.map(r => ({ ...r, workerId: workerId || undefined }));
        setPosteSuivis(prev => prev.map(s => majs.find(m => m.id === s.id) || s));
        await persisterCellules(majs);
    };

    /* Cadence visee d'un poste, en pieces/heure : le temps mesure au chrono s'il
       existe (c'est la realite du poste), sinon le temps prevu par la gamme. */
    const cadencePoste = (poste: Operation): { valeur: number | null; mesuree: boolean } => {
        const rows = suivisByPoste.get(poste.id) || [];
        const mesure = rows.find(r => r.temps_reel_par_piece && r.temps_reel_par_piece > 0)?.temps_reel_par_piece;
        const tpp = mesure || poste.time;
        if (!tpp || tpp <= 0) return { valeur: null, mesuree: false };
        return { valeur: Math.round(60 / tpp), mesuree: !!mesure };
    };

    /* Minutes reellement travaillables dans un creneau : une heure pleine, moins
       ce que la pause lui prend. Sans cela l'objectif d'un creneau coupe par la
       pause serait surevalue et l'ouvrier note trop bas. */
    const minutesCreneau = (heureKey?: string): number => {
        if (!heureKey) return 60;
        /* La grille du jour donne deja la duree REELLE du creneau : elle est
           coupee a la pause (ex. 13:30/14:00 = 30 min), donc pas de soustraction
           a refaire ici. */
        const bloc = hourGrid.blocks.find(b => b.key === heureKey);
        if (bloc) return Math.max(5, bloc.duration);
        // Releve d'une ancienne grille : on retombe sur l'heure pleine moins la pause.
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
        type Acc = {
            somme: number; n: number; pieces: number;
            postes: Map<string, { somme: number; n: number }>;
            jour: { somme: number; n: number };
            semaine: { somme: number; n: number };
        };
        /* Bornes de la semaine du jour affiche (lundi → dimanche), pour la prime
           hebdomadaire : sans elles on melangerait des semaines entieres. */
        const ref = new Date(date);
        const dow = ref.getDay() === 0 ? 7 : ref.getDay();
        const lundi = new Date(ref); lundi.setDate(ref.getDate() - (dow - 1));
        const dimanche = new Date(lundi); dimanche.setDate(lundi.getDate() + 6);
        const debutSemaine = lundi.toISOString().split('T')[0];
        const finSemaine = dimanche.toISOString().split('T')[0];

        const parOuvrier = new Map<string, Acc>();
        posteSuivis.forEach(r => {
            if (!r.workerId) return;
            const id = String(r.workerId);
            const acc = parOuvrier.get(id) || {
                somme: 0, n: 0, pieces: 0,
                postes: new Map<string, { somme: number; n: number }>(),
                jour: { somme: 0, n: 0 },
                semaine: { somme: 0, n: 0 },
            };
            const sc = scoreReleve(r);
            if (sc !== null) {
                acc.somme += sc; acc.n += 1;
                /* Le score par poste est ce qui dit quel poste l'ouvrier TIENT
                   vraiment : c'est lui qu'on regarde pour l'affecter la fois
                   suivante, pas sa moyenne generale tous postes confondus. */
                const p = acc.postes.get(r.posteId) || { somme: 0, n: 0 };
                p.somme += sc; p.n += 1;
                acc.postes.set(r.posteId, p);
                if (r.date === date) { acc.jour.somme += sc; acc.jour.n += 1; }
                if (r.date >= debutSemaine && r.date <= finSemaine) { acc.semaine.somme += sc; acc.semaine.n += 1; }
            }
            acc.pieces += r.pieces_sorties || 0;
            if (!acc.postes.has(r.posteId)) acc.postes.set(r.posteId, { somme: 0, n: 0 });
            parOuvrier.set(id, acc);
        });

        const nomPoste = (posteId: string) => {
            for (const m of models) {
                const op = (m.gamme_operatoire || []).find(o => o.id === posteId);
                if (op) return op.description || posteId;
            }
            return posteId;
        };

        const regles = settings?.primeRules;
        return Array.from(parOuvrier.entries())
            .map(([id, a]) => {
                const scoreJour = a.jour.n > 0 ? Math.round(a.jour.somme / a.jour.n) : null;
                const scoreSemaine = a.semaine.n > 0 ? Math.round(a.semaine.somme / a.semaine.n) : null;
                /* Prime : on n'en calcule une que si une regle a ete decidee ET que
                   la periode a vraiment ete mesuree. Pas de regle, pas de prime —
                   on n'invente pas un montant que personne n'a fixe. */
                let prime = 0;
                const detailPrime: string[] = [];
                if (regles?.jour && scoreJour !== null && scoreJour >= regles.jour.seuil) {
                    prime += regles.jour.montant;
                    detailPrime.push(`${tx(lang, L.primeJour)} ${scoreJour}% ≥ ${regles.jour.seuil}%`);
                }
                if (regles?.semaine && scoreSemaine !== null && scoreSemaine >= regles.semaine.seuil) {
                    prime += regles.semaine.montant;
                    detailPrime.push(`${tx(lang, L.primeSemaine)} ${scoreSemaine}% ≥ ${regles.semaine.seuil}%`);
                }
                return {
                    id,
                    nom: workers.find(w => String(w.id) === String(id))?.full_name || id,
                    moyenne: a.n > 0 ? Math.round(a.somme / a.n) : null,
                    pieces: a.pieces,
                    postes: a.postes.size,
                    scoreJour,
                    scoreSemaine,
                    prime,
                    detailPrime,
                    /* Postes maitrises : les mieux tenus d'abord, c'est la reponse a
                       « qui je mets sur ce poste demain ». */
                    postesMaitrises: Array.from(a.postes.entries())
                        .filter(([, v]) => v.n > 0)
                        .map(([pid, v]) => ({ id: pid, nom: nomPoste(pid), score: Math.round(v.somme / v.n) }))
                        .sort((x, y) => y.score - x.score)
                        .slice(0, 4),
                };
            })
            .sort((a, b) => (b.moyenne ?? -1) - (a.moyenne ?? -1));
    }, [posteSuivis, workers, models, date, settings?.primeRules, lang]);

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

            {/* Modele actif : on CHOISIT l'OF de la chaine, comme sur la grille horaire.
                Sans ce choix, deux OF sur la meme chaine et le second etait invisible. */}
            {planningsChaine.length > 0 && (
                <div className="shrink-0 px-3 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-100 dark:border-dk-border/40 bg-white dark:bg-dk-surface">
                    <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-dk-muted">
                        {tx(lang, L.modeleActif)}
                    </span>
                    {planningsChaine.map(p => {
                        const m = models.find(x => x.id === p.modelId);
                        const ref = m?.meta_data?.reference || p.modelName || p.id.slice(0, 8);
                        const actif = activePlanning?.id === p.id;
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => setSelectedPlanningId(p.id)}
                                className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-black transition-all min-h-[36px] ${
                                    actif
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-slate-50 dark:bg-dk-bg text-slate-600 dark:text-dk-text-soft border border-slate-200 dark:border-dk-border'
                                }`}
                            >
                                {ref}
                                {p.qteTotal ? <span className={`ml-1.5 font-bold ${actif ? 'text-indigo-100' : 'text-slate-400 dark:text-dk-muted'}`}>{p.qteTotal} pcs</span> : null}
                            </button>
                        );
                    })}
                </div>
            )}

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
                    /* Trois causes distinctes se cachaient derriere le meme message
                       « Aucun modele planifie » : pas d'OF, un OF dont le modele a
                       disparu, ou un modele sans gamme. On dit laquelle, et ou aller
                       la corriger — sinon la page semble cassee alors que l'OF est
                       bien la, affiche juste au-dessus. */
                    <div className="flex flex-col items-center justify-center py-16 gap-4 px-6 max-w-2xl mx-auto">
                        <p className="text-slate-400 dark:text-dk-muted text-sm font-bold text-center">
                            {tx(lang, !activePlanning ? L.noModel : (!activeModel ? L.noModelIntrouvable : L.noGamme))}
                        </p>
                        {/* Sans gamme, on n'envoie plus l'utilisateur la construire
                            ailleurs : le poste se cree ICI, au pied de la chaine, en
                            tapant son libelle. Il rejoint la gamme du modele — donc le
                            catalogue des temps et le score des ouvriers. L'atelier des
                            methodes reste offert pour le travail de fond. */}
                        {activeModel && postes.length === 0 && onAddPoste && (
                            <AjoutPosteRapide
                                models={models}
                                activeModel={activeModel}
                                workers={workersSorted}
                                onAjouter={ajouterPoste}
                            />
                        )}
                        {activeModel && postes.length === 0 && onOpenGamme && (
                            <button
                                type="button"
                                onClick={() => onOpenGamme(activeModel.id)}
                                className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 underline underline-offset-4"
                            >
                                {tx(lang, L.ouvrirGamme)}
                            </button>
                        )}
                    </div>
                ) : (
                  <>
                    {/* Un poste peut manquer a une gamme par ailleurs complete : on
                        l'ajoute d'ici, sans quitter le releve en cours. */}
                    {activeModel && onAddPoste && (
                        <div className="mb-3">
                            <AjoutPosteRapide
                                models={models}
                                activeModel={activeModel}
                                workers={workersSorted}
                                onAjouter={ajouterPoste}
                            />
                        </div>
                    )}
                    {/* ─── LE TABLEAU DU JOUR ────────────────────────────
                        Meme langue visuelle que « Releves Terrain » au
                        chronometrage : une ligne par poste, des colonnes
                        chiffrees, une ligne de total en pied. Les cartes
                        precedentes demandaient de derouler la page entiere pour
                        lire deux chiffres ; ici la journee tient d'un regard.

                        Sur telephone le tableau defile lateralement, la colonne
                        du poste restant collee a gauche — sans elle, on ne sait
                        plus quelle ligne on remplit. */}
                    {isMobile ? (
                    /* ─── TELEPHONE : la journee en liste ──────────────────
                       Un bloc par poste, l'ouvrier sous son nom, puis les
                       creneaux les uns sous les autres. C'est la forme du Suivi
                       et celle du carnet : on descend la liste et on ecrit. */
                    <div className="space-y-2.5">
                        {postes.map((poste, rang) => {
                            const { rows, total, score, mesure } = bilanPoste(poste);
                            const celluleCourante = celluleDe(poste.id, nowBlock.key);
                            const chronoOuvert = chronoOpenFor === poste.id;
                            const cad = cadencePoste(poste);
                            return (
                                <div key={poste.id} className="rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface overflow-hidden">
                                    <div className="px-3 py-2.5 bg-slate-50 dark:bg-dk-elevated/40 border-b border-slate-100 dark:border-dk-border/50">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-start gap-2 min-w-0">
                                                <span className="shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-white dark:bg-dk-bg text-[10px] font-black tabular-nums text-slate-400 dark:text-dk-muted">{rang + 1}</span>
                                                <div className="min-w-0">
                                                    <p className="font-black text-[13px] text-slate-800 dark:text-dk-text truncate">{poste.description || poste.id}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted truncate">
                                                        {poste.machineName ? `${poste.machineName} · ` : ''}
                                                        {poste.time > 0 ? `TS ${(poste.time * 60).toFixed(1)}s` : ''}
                                                        {cad.valeur !== null ? ` · ${cad.mesuree ? '' : '~'}${cad.valeur} p/h` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="text-[14px] font-black tabular-nums text-slate-800 dark:text-dk-text">{total || '—'}</p>
                                                <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.piecesJour)}</p>
                                                {(() => {
                                                    const t = tendancePoste(poste);
                                                    if (!t) return null;
                                                    return (
                                                        <p
                                                            className={`text-[10px] font-black tabular-nums ${t.sens === 'hausse' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
                                                            title={tx(lang, L.tendanceTitre)}
                                                        >
                                                            {t.sens === 'hausse' ? '↑' : '↓'} {t.pct}%
                                                        </p>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        <div className="mt-2 flex items-center gap-2">
                                            <div className="relative flex-1 min-w-0">
                                                <select
                                                    value={ouvrierDuPoste(poste.id)}
                                                    onChange={(e) => void changerOuvrierPoste(poste, e.target.value)}
                                                    className="w-full min-h-[40px] appearance-none text-[12px] font-bold text-slate-700 dark:text-dk-text bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl pl-3 pr-8 outline-none"
                                                >
                                                    <option value="">{tx(lang, L.chooseWorker)}</option>
                                                    {workersSorted.map(w => (
                                                        <option key={w.id} value={String(w.id)}>{w.full_name}{w.chaine_id === selectedChaineId ? '' : ` (${w.chaine_id || '-'})`}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                            </div>
                                            {score !== null && (
                                                <span
                                                    className={`shrink-0 rounded-md px-2 py-1.5 text-[11px] font-black tabular-nums ${classeScore(score)}`}
                                                    title={mesure ? undefined : tx(lang, L.scoreEstime)}
                                                >
                                                    {mesure ? '' : '~'}{score}%
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setChronoOpenFor(cur => (cur === poste.id ? null : poste.id))}
                                                title={tx(lang, L.chronoTitre)}
                                                aria-label={tx(lang, L.chronoTitre)}
                                                className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center border transition-colors ${
                                                    chronoOuvert
                                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                                        : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted'
                                                }`}
                                            >
                                                <Clock className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-3 space-y-1.5">
                                        {hourGrid.blocks.map(b => {
                                            const cellule = celluleDe(poste.id, b.key);
                                            const val = cellule?.pieces_sorties;
                                            const futur = new Date(date).setHours(0, b.endMin, 0, 0) > Date.now();
                                            const courant = b.key === nowBlock.key;
                                            const enregistre = cellSavingId === idCellule(poste.id, b.key);
                                            return (
                                                <div key={b.key} className="flex items-center gap-2">
                                                    <span className={`w-[92px] shrink-0 text-[11px] font-bold tabular-nums ${courant ? 'text-indigo-600 dark:text-dk-accent-text' : 'text-slate-500 dark:text-dk-muted'}`}>
                                                        {b.label}
                                                        {b.duration < 60 ? (
                                                            <span className="block text-[9px] font-bold text-indigo-500 dark:text-dk-accent-text">{b.duration} min</span>
                                                        ) : b.pauseMin > 0 ? (
                                                            <span className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted">+{b.pauseMin} min {tx(lang, L.pauseTag)}</span>
                                                        ) : null}
                                                    </span>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        pattern="[0-9]*"
                                                        disabled={futur}
                                                        value={val === undefined || val === null || val === 0 ? '' : String(val)}
                                                        onChange={(e) => {
                                                            const chiffres = e.target.value.replace(/[^0-9]/g, '');
                                                            void saveCellule(poste, b.key, chiffres === '' ? null : parseInt(chiffres, 10));
                                                        }}
                                                        placeholder="—"
                                                        className={`flex-1 min-w-0 h-11 text-center text-[14px] font-black tabular-nums rounded-xl border outline-none transition-all ${
                                                            futur
                                                                ? 'bg-slate-50 dark:bg-dk-bg/50 border-slate-100 dark:border-dk-border/50 text-slate-300 dark:text-dk-muted'
                                                                : courant
                                                                    ? 'bg-white dark:bg-dk-surface border-indigo-300 dark:border-dk-accent text-slate-800 dark:text-dk-text focus:border-indigo-600'
                                                                    : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text focus:border-indigo-600'
                                                        } ${enregistre ? 'opacity-60' : ''}`}
                                                    />
                                                </div>
                                            );
                                        })}

                                        <div className="flex items-center gap-2 pt-1">
                                            <span className="w-[92px] shrink-0 text-[11px] font-bold text-slate-500 dark:text-dk-muted" title={tx(lang, L.defTitre)}>
                                                {tx(lang, L.defCourt)}
                                                <span className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted">{nowBlock.label}</span>
                                            </span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                value={(celluleCourante?.pieces_defaut || 0) === 0 ? '' : String(celluleCourante?.pieces_defaut)}
                                                onChange={(e) => {
                                                    const chiffres = e.target.value.replace(/[^0-9]/g, '');
                                                    void ecrireCellule(poste, nowBlock.key, { pieces_defaut: chiffres === '' ? 0 : parseInt(chiffres, 10) });
                                                }}
                                                placeholder="—"
                                                className="flex-1 min-w-0 h-11 text-center text-[14px] font-bold tabular-nums rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft outline-none focus:border-indigo-600"
                                            />
                                        </div>

                                        {chronoOuvert && (
                                            <div className="pt-2">
                                                <MiniChrono
                                                    open
                                                    onToggle={() => setChronoOpenFor(null)}
                                                    onFinish={(ms) => { setDraft(poste.id, { tempsMs: ms }); void appliquerChrono(poste, ms); }}
                                                    lang={lang}
                                                    tempsMs={getDraft(poste.id).tempsMs}
                                                />
                                                {(celluleCourante?.pieces_sorties || 0) === 0 && (
                                                    <p className="mt-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                                        {tx(lang, L.chronoSansPieces)}
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Le total de la chaine ferme la liste, comme le pied du tableau. */}
                        <div className="rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-elevated/40 px-3 py-2.5 flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted">{tx(lang, L.totalGeneral)}</span>
                            <span className="text-[15px] font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                                {postes.reduce((acc, poste) => acc + bilanPoste(poste).total, 0) || '—'}
                            </span>
                        </div>
                    </div>
                    ) : (
                    <div className="rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface overflow-hidden">
                        <div className="px-3 sm:px-4 py-2.5 border-b border-slate-100 dark:border-dk-border/50 bg-slate-50 dark:bg-dk-elevated/40">
                            <p className="text-[12px] font-black text-slate-700 dark:text-dk-text">{tx(lang, L.releves)}</p>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.relevesHint)}</p>
                        </div>

                        <div className="overflow-x-auto scrollbar-thin">
                            <table className="w-full text-[12px] border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-dk-elevated/60 text-slate-500 dark:text-dk-muted text-[10px] uppercase tracking-wider font-black">
                                        <th className="w-8 px-2 py-2.5 text-center">#</th>
                                        <th className="text-left px-3 py-2.5 sticky left-0 bg-slate-50 dark:bg-dk-elevated/60 z-10 min-w-[160px]">{tx(lang, L.poste)}</th>
                                        <th className="text-left px-3 py-2.5 min-w-[150px]">{tx(lang, L.worker)}</th>
                                        <th className="px-2 py-2.5 text-center w-16 bg-amber-50/70 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300" title={tx(lang, L.tsPrevuTitre)}>{tx(lang, L.tsPrevu)}</th>
                                        <th className="px-2 py-2.5 text-center w-20">{tx(lang, L.cadence)}</th>
                                        {hourGrid.blocks.map(b => (
                                            <th
                                                key={b.key}
                                                className={`text-center px-1 py-2.5 w-[86px] border-l border-slate-100 dark:border-dk-border/40 ${b.key === nowBlock.key ? 'bg-indigo-50 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text' : ''}`}
                                                title={`${b.label} — ${b.duration} min`}
                                            >
                                                {/* La plage entiere, comme au Suivi : « 06:30/07:30 » dit
                                                    ce que « 06:30 » laissait deviner, surtout quand une
                                                    pause raccourcit le creneau. */}
                                                {b.label}
                                                {b.duration < 60 ? (
                                                    <span className="block text-[8px] normal-case tracking-normal text-indigo-500 dark:text-dk-accent-text">{b.duration} min</span>
                                                ) : b.pauseMin > 0 ? (
                                                    <span className="block text-[8px] normal-case tracking-normal text-slate-400 dark:text-dk-muted">+{b.pauseMin} min {tx(lang, L.pauseTag)}</span>
                                                ) : null}
                                            </th>
                                        ))}
                                        <th className="px-2 py-2.5 text-center w-16 border-l border-slate-200 dark:border-dk-border/60" title={tx(lang, L.defTitre)}>{tx(lang, L.defCourt)}</th>
                                        <th className="px-2 py-2.5 text-center w-16 bg-emerald-50/70 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300">{tx(lang, L.total)}</th>
                                        <th className="px-2 py-2.5 text-center w-16 bg-slate-800 text-white dark:bg-dk-elevated">{tx(lang, L.score)}</th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-slate-100 dark:divide-dk-border/40">
                                    {postes.map((poste, rang) => {
                                        const d = getDraft(poste.id);
                                        const cad = cadencePoste(poste);
                                        const rowsToday = suivisByPoste.get(poste.id) || [];
                                        const totalJour = rowsToday.reduce((somme, r) => somme + (r.pieces_sorties || 0), 0);
                                        const scoresJour = rowsToday.map(scoreReleve).filter((x): x is number => x !== null);
                                        const scoreMesure = rowsToday.some(scoreChronometre);
                                        const scorePoste = scoresJour.length > 0
                                            ? Math.round(scoresJour.reduce((a, b) => a + b, 0) / scoresJour.length)
                                            : null;
                                        const celluleCourante = celluleDe(poste.id, nowBlock.key);
                                        const defautsCourants = celluleCourante?.pieces_defaut ?? 0;
                                        const chronoOuvert = chronoOpenFor === poste.id;
                                        return (
                                            <React.Fragment key={poste.id}>
                                                <tr className="hover:bg-slate-50/60 dark:hover:bg-dk-elevated/30">
                                                    <td className="px-2 py-2 text-center text-[10px] font-black tabular-nums text-slate-400 dark:text-dk-muted">{rang + 1}</td>

                                                    <td className="px-3 py-2 sticky left-0 bg-white dark:bg-dk-surface z-10">
                                                        <div className="flex items-center gap-2">
                                                            <div className="min-w-0">
                                                                <p className="font-black text-slate-800 dark:text-dk-text truncate">{poste.description || poste.id}</p>
                                                                {/* L'ouvrier qui tient le poste, sous son nom : quand le
                                                                    tableau defile, la colonne collee a gauche est la
                                                                    seule visible — elle doit dire QUI produit ces
                                                                    chiffres, pas seulement OU. */}
                                                                {nomOuvrier(poste.id) && (
                                                                    <p className="text-[10px] font-bold text-indigo-600 dark:text-dk-accent-text truncate">{nomOuvrier(poste.id)}</p>
                                                                )}
                                                                {poste.machineName && (
                                                                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-dk-bg text-[9px] font-black text-slate-500 dark:text-dk-muted truncate max-w-[140px]">
                                                                        {poste.machineName}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setChronoOpenFor(cur => (cur === poste.id ? null : poste.id))}
                                                                title={tx(lang, L.chronoTitre)}
                                                                aria-label={tx(lang, L.chronoTitre)}
                                                                className={`ml-auto shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${
                                                                    chronoOuvert
                                                                        ? 'bg-indigo-600 border-indigo-600 text-white'
                                                                        : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted hover:border-indigo-400'
                                                                }`}
                                                            >
                                                                <Clock className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>

                                                    <td className="px-3 py-2">
                                                        <div className="relative">
                                                            <select
                                                                value={ouvrierDuPoste(poste.id)}
                                                                onChange={(e) => void changerOuvrierPoste(poste, e.target.value)}
                                                                className="w-full min-h-[36px] appearance-none text-[11px] font-bold text-slate-700 dark:text-dk-text bg-slate-50 dark:bg-dk-elevated/60 border border-slate-200 dark:border-dk-border rounded-lg pl-2.5 pr-7 outline-none"
                                                            >
                                                                <option value="">{tx(lang, L.chooseWorker)}</option>
                                                                {workersSorted.map(w => (
                                                                    <option key={w.id} value={String(w.id)}>{w.full_name}{w.chaine_id === selectedChaineId ? '' : ` (${w.chaine_id || '-'})`}</option>
                                                                ))}
                                                            </select>
                                                            <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                        </div>
                                                    </td>

                                                    <td className="px-2 py-2 text-center bg-amber-50/40 dark:bg-amber-900/5 font-black tabular-nums text-amber-700 dark:text-amber-300">
                                                        {poste.time > 0 ? (poste.time * 60).toFixed(1) : '—'}
                                                    </td>

                                                    <td className="px-2 py-2 text-center">
                                                        {cad.valeur === null ? (
                                                            <span className="text-slate-300 dark:text-dk-muted font-bold">—</span>
                                                        ) : (
                                                            <span
                                                                className={`inline-block px-2 py-1 rounded-lg text-[11px] font-black tabular-nums ${cad.mesuree ? 'bg-indigo-50 text-indigo-700 dark:bg-dk-accent/20 dark:text-dk-accent-text' : 'bg-slate-100 text-slate-500 dark:bg-dk-bg dark:text-dk-muted'}`}
                                                                title={tx(lang, cad.mesuree ? L.cadenceMesuree : L.cadenceGamme)}
                                                            >
                                                                {cad.mesuree ? '' : '~'}{cad.valeur}
                                                            </span>
                                                        )}
                                                    </td>

                                                    {hourGrid.blocks.map(b => {
                                                        const cellule = celluleDe(poste.id, b.key);
                                                        const val = cellule?.pieces_sorties;
                                                        /* Un creneau qui n'est pas encore fini ne se saisit pas :
                                                           on ne releve pas une heure qui n'a pas eu lieu. */
                                                        const futur = new Date(date).setHours(0, b.endMin, 0, 0) > Date.now();
                                                        const courant = b.key === nowBlock.key;
                                                        const enregistre = cellSavingId === idCellule(poste.id, b.key);
                                                        return (
                                                            <td key={b.key} className={`p-1 border-l border-slate-100 dark:border-dk-border/40 ${courant ? 'bg-indigo-50/40 dark:bg-dk-accent/10' : ''}`}>
                                                                <input
                                                                    type="text"
                                                                    inputMode="numeric"
                                                                    pattern="[0-9]*"
                                                                    disabled={futur}
                                                                    value={val === undefined || val === null || val === 0 ? '' : String(val)}
                                                                    onChange={(e) => {
                                                                        const chiffres = e.target.value.replace(/[^0-9]/g, '');
                                                                        void saveCellule(poste, b.key, chiffres === '' ? null : parseInt(chiffres, 10));
                                                                    }}
                                                                    placeholder="—"
                                                                    className={`w-full h-10 text-center text-[12px] font-black tabular-nums rounded-lg border outline-none transition-all ${
                                                                        futur
                                                                            ? 'bg-slate-50 dark:bg-dk-bg/50 border-slate-100 dark:border-dk-border/50 text-slate-300 dark:text-dk-muted'
                                                                            : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600'
                                                                    } ${enregistre ? 'opacity-60' : ''}`}
                                                                />
                                                            </td>
                                                        );
                                                    })}

                                                    <td className="p-1 border-l border-slate-200 dark:border-dk-border/60">
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            pattern="[0-9]*"
                                                            value={defautsCourants === 0 ? '' : String(defautsCourants)}
                                                            onChange={(e) => {
                                                                const chiffres = e.target.value.replace(/[^0-9]/g, '');
                                                                void ecrireCellule(poste, nowBlock.key, { pieces_defaut: chiffres === '' ? 0 : parseInt(chiffres, 10) });
                                                            }}
                                                            placeholder="—"
                                                            title={tx(lang, L.defTitre)}
                                                            className="w-full h-10 text-center text-[12px] font-bold tabular-nums rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft outline-none focus:border-indigo-600"
                                                        />
                                                    </td>

                                                    <td className="px-2 py-2 text-center bg-emerald-50/40 dark:bg-emerald-900/5 font-black tabular-nums text-slate-800 dark:text-dk-text">
                                                        {totalJour || '—'}
                                                        {(() => {
                                                            const t = tendancePoste(poste);
                                                            if (!t) return null;
                                                            return (
                                                                <span
                                                                    className={`block text-[9px] font-black ${t.sens === 'hausse' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
                                                                    title={tx(lang, L.tendanceTitre)}
                                                                >
                                                                    {t.sens === 'hausse' ? '↑' : '↓'} {t.pct}%
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>

                                                    <td className="px-2 py-2 text-center">
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
                                                </tr>

                                                {/* Le chrono s'ouvre SOUS sa ligne : on garde le poste sous
                                                    les yeux pendant la mesure. Le temps mesure se rattache au
                                                    creneau en cours, divise par les pieces qui y sont notees. */}
                                                {chronoOuvert && (
                                                    <tr className="bg-slate-50/70 dark:bg-dk-elevated/30">
                                                        <td colSpan={6 + hourGrid.blocks.length + 3} className="px-3 py-2.5">
                                                            <MiniChrono
                                                                open
                                                                onToggle={() => setChronoOpenFor(null)}
                                                                onFinish={(ms) => { setDraft(poste.id, { tempsMs: ms }); void appliquerChrono(poste, ms); }}
                                                                lang={lang}
                                                                tempsMs={d.tempsMs}
                                                            />
                                                            {(celluleCourante?.pieces_sorties || 0) === 0 && (
                                                                <p className="mt-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                                                                    {tx(lang, L.chronoSansPieces)}
                                                                </p>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>

                                {/* TOTAL GENERAL : la journee de la chaine, creneau par creneau. */}
                                <tfoot>
                                    <tr className="bg-slate-50 dark:bg-dk-elevated/60 border-t-2 border-slate-200 dark:border-dk-border">
                                        <td />
                                        <td className="px-3 py-2.5 sticky left-0 bg-slate-50 dark:bg-dk-elevated/60 z-10 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted">
                                            {tx(lang, L.totalGeneral)}
                                        </td>
                                        <td />
                                        <td />
                                        <td />
                                        {hourGrid.blocks.map(b => {
                                            const somme = postes.reduce((acc, poste) => acc + (celluleDe(poste.id, b.key)?.pieces_sorties || 0), 0);
                                            return (
                                                <td key={b.key} className="px-1 py-2.5 text-center font-black tabular-nums text-slate-700 dark:text-dk-text border-l border-slate-100 dark:border-dk-border/40">
                                                    {somme || '—'}
                                                </td>
                                            );
                                        })}
                                        <td className="px-2 py-2.5 text-center font-bold tabular-nums text-slate-500 dark:text-dk-muted border-l border-slate-200 dark:border-dk-border/60">
                                            {postes.reduce((acc, poste) => acc + (celluleDe(poste.id, nowBlock.key)?.pieces_defaut || 0), 0) || '—'}
                                        </td>
                                        <td className="px-2 py-2.5 text-center font-black tabular-nums text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-900/10">
                                            {postes.reduce((acc, poste) => acc + (suivisByPoste.get(poste.id) || []).reduce((s2, r) => s2 + (r.pieces_sorties || 0), 0), 0) || '—'}
                                        </td>
                                        <td className="px-2 py-2.5 text-center bg-slate-800 dark:bg-dk-elevated">
                                            {(() => {
                                                const tous = postes.flatMap(poste => (suivisByPoste.get(poste.id) || []).map(scoreReleve)).filter((x): x is number => x !== null);
                                                if (tous.length === 0) return <span className="text-slate-500 font-bold">—</span>;
                                                const moyenne = Math.round(tous.reduce((a, b) => a + b, 0) / tous.length);
                                                return <span className="text-white font-black tabular-nums text-[11px]">{moyenne}%</span>;
                                            })()}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                    )}

                  </>
                )}

                {/* Progression : ce que les releves accumules finissent par dire de
                    chaque ouvrier — sa moyenne, ses pieces, ses postes tenus. */}
                {!loading && (
                    <div className="mt-3 sm:mt-4 rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface p-3 sm:p-4">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">
                            <User className="w-3.5 h-3.5" /> {tx(lang, L.progression)}
                        </div>
                        {/* Sans regle decidee, aucune prime ne s'affiche : on le dit
                            plutot que de laisser croire qu'il n'y a jamais de prime. */}
                        {!settings?.primeRules?.jour && !settings?.primeRules?.semaine && (
                            <p className="mb-2 text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.primeAucuneRegle)}</p>
                        )}
                        {progression.length === 0 ? (
                            <p className="text-[11px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.progressionVide)}</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                {progression.map(p => (
                                    <div key={p.id} className="rounded-xl bg-slate-50 dark:bg-dk-bg px-3 py-2 space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
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

                                        {/* Scores de periode : ce sur quoi la prime se decide. */}
                                        <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-black tabular-nums">
                                            <span className="px-1.5 py-0.5 rounded bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted">
                                                {tx(lang, L.primeJour)} {p.scoreJour === null ? '—' : `${p.scoreJour}%`}
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted">
                                                {tx(lang, L.primeSemaine)} {p.scoreSemaine === null ? '—' : `${p.scoreSemaine}%`}
                                            </span>
                                            {p.prime > 0 && (
                                                <span
                                                    className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                                                    title={p.detailPrime.join(' · ')}
                                                >
                                                    {tx(lang, L.prime)} {p.prime} {settings?.currency || ''}
                                                </span>
                                            )}
                                        </div>

                                        {/* Postes tenus, les mieux notes d'abord : c'est la reponse a
                                            « qui je mets sur ce poste la prochaine fois ». */}
                                        {p.postesMaitrises.length > 0 && (
                                            <div className="flex flex-wrap gap-1" title={tx(lang, L.postesMaitrises)}>
                                                {p.postesMaitrises.map(pm => (
                                                    <span key={pm.id} className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${classeScore(pm.score)}`}>
                                                        {pm.nom} {pm.score}%
                                                    </span>
                                                ))}
                                            </div>
                                        )}
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
