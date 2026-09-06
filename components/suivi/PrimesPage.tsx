import React, { useEffect, useMemo, useState } from 'react';
import type { AppSettings, HRWorker, ModelData, PosteSuiviData } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { deriveHourGrid } from './shared/hours';
import {
    calculerPrimes, CONFIG_PRIME_SUGGEREE, type BulletinPrime, type ConfigPrime,
} from '../../lib/primeEngine';
import { Award, Settings2, Loader2, Trophy, Save, Check } from 'lucide-react';

/**
 * Primes de rendement — la page complète.
 *
 * Trois lectures, dans cet ordre :
 *   1. le podium : qui a donné le meilleur rendement sur la période ;
 *   2. le bulletin de chacun : rendement, pièces, défauts, postes tenus, et le
 *      détail ligne par ligne de ce qu'il touche ;
 *   3. les règles : paliers, qualité, assiduité, polyvalence — modifiables ici,
 *      parce qu'une prime se règle là où on la lit.
 *
 * Le calcul vit dans `lib/primeEngine.ts` : cet écran ne fait que l'afficher.
 * Rien n'est versé par défaut — sans paliers chiffrés, la colonne prime reste
 * vide et la page ne sert qu'à lire la production.
 */

const L = {
    titre: { fr: 'Primes de rendement', ar: 'علاوات المردودية', en: 'Performance bonuses', es: 'Primas de rendimiento', pt: 'Prémios de rendimento', tr: 'Verim primleri' },
    sousTitre: { fr: 'Rendement, qualité, assiduité, polyvalence — calculés sur les relevés par poste', ar: 'المردودية، الجودة، الحضور، تعدّد المناصب — محسوبة من تسجيلات المناصب', en: 'Efficiency, quality, attendance, versatility — computed from poste entries', es: 'Rendimiento, calidad, asistencia, polivalencia — calculados sobre los registros por puesto', pt: 'Rendimento, qualidade, assiduidade, polivalencia — calculados sobre os registos por posto', tr: 'Verim, kalite, devam, cok yonluluk — istasyon kayitlarindan hesaplanir' },
    jour: { fr: 'Jour', ar: 'اليوم', en: 'Day', es: 'Dia', pt: 'Dia', tr: 'Gun' },
    semaine: { fr: 'Semaine', ar: 'الأسبوع', en: 'Week', es: 'Semana', pt: 'Semana', tr: 'Hafta' },
    mois: { fr: 'Mois', ar: 'الشهر', en: 'Month', es: 'Mes', pt: 'Mes', tr: 'Ay' },
    podium: { fr: 'Meilleurs rendements', ar: 'أحسن المردوديات', en: 'Best efficiencies', es: 'Mejores rendimientos', pt: 'Melhores rendimentos', tr: 'En iyi verimler' },
    podiumVide: { fr: 'Aucun rendement calculable : il faut un temps standard sur les postes relevés.', ar: 'ما كاينة حتى مردودية محسوبة: خاص زمن معياري على المناصب المسجّلة.', en: 'No computable efficiency: the recorded postes need a standard time.', es: 'Ningun rendimiento calculable: los puestos registrados necesitan un tiempo estandar.', pt: 'Nenhum rendimento calculavel: os postos registados precisam de um tempo padrao.', tr: 'Hesaplanabilir verim yok: kayitli istasyonlarin standart suresi gerekir.' },
    bulletins: { fr: 'Bulletins de la période', ar: 'كشوف المدّة', en: 'Period statements', es: 'Boletines del periodo', pt: 'Boletins do periodo', tr: 'Donem bordrolari' },
    ouvrier: { fr: 'Ouvrier', ar: 'العامل', en: 'Worker', es: 'Operario', pt: 'Operario', tr: 'Isci' },
    rendement: { fr: 'Rendement', ar: 'المردودية', en: 'Efficiency', es: 'Rendimiento', pt: 'Rendimento', tr: 'Verim' },
    rendementTitre: { fr: 'Temps standard produit / temps de presence releve × 100', ar: 'الزمن المعياري المُنتَج / زمن الحضور المسجّل × 100', en: 'Standard time produced / recorded presence time × 100', es: 'Tiempo estandar producido / tiempo de presencia registrado × 100', pt: 'Tempo padrao produzido / tempo de presenca registado × 100', tr: 'Uretilen standart sure / kayitli mevcudiyet suresi × 100' },
    pieces: { fr: 'Pieces', ar: 'القطع', en: 'Pieces', es: 'Piezas', pt: 'Pecas', tr: 'Parca' },
    defauts: { fr: 'Defauts', ar: 'العيوب', en: 'Defects', es: 'Defectos', pt: 'Defeitos', tr: 'Hatalar' },
    jours: { fr: 'Jours', ar: 'أيام', en: 'Days', es: 'Dias', pt: 'Dias', tr: 'Gun' },
    postes: { fr: 'Postes', ar: 'المناصب', en: 'Postes', es: 'Puestos', pt: 'Postos', tr: 'Istasyon' },
    prime: { fr: 'Prime', ar: 'العلاوة', en: 'Bonus', es: 'Prima', pt: 'Premio', tr: 'Prim' },
    detail: { fr: 'Detail', ar: 'التفصيل', en: 'Breakdown', es: 'Detalle', pt: 'Detalhe', tr: 'Dokum' },
    vide: { fr: 'Aucun releve sur cette periode.', ar: 'ما كاين حتى تسجيل فهاد المدّة.', en: 'No entry in this period.', es: 'Ningun registro en este periodo.', pt: 'Nenhum registo neste periodo.', tr: 'Bu donemde kayit yok.' },
    regles: { fr: 'Regles de prime', ar: 'قواعد العلاوة', en: 'Bonus rules', es: 'Reglas de prima', pt: 'Regras de premio', tr: 'Prim kurallari' },
    reglesAucune: { fr: 'Aucune regle chiffree : la page montre la production, sans montant. Reglez les paliers pour calculer une prime.', ar: 'ما كاينة حتى قاعدة مرقّمة: الصفحة كتبيّن الإنتاج بلا مبلغ. عمّر الپاليي باش تتحسب العلاوة.', en: 'No figures set: the page shows production without amounts. Fill the tiers to compute a bonus.', es: 'Sin cifras definidas: la pagina muestra la produccion sin importes. Rellene los tramos para calcular una prima.', pt: 'Sem valores definidos: a pagina mostra a producao sem montantes. Preencha os patamares para calcular um premio.', tr: 'Rakam girilmedi: sayfa uretimi tutarsiz gosterir. Prim icin kademeleri doldurun.' },
    paliers: { fr: 'Paliers de rendement', ar: 'مستويات المردودية', en: 'Efficiency tiers', es: 'Tramos de rendimiento', pt: 'Patamares de rendimento', tr: 'Verim kademeleri' },
    paliersAide: { fr: 'Le palier le plus haut atteint est verse. Un montant a 0 signifie « pas de prime a ce niveau ».', ar: 'أعلى مستوى موصول هو اللي كيتخلّص. مبلغ 0 معناه «بلا علاوة فهاد المستوى».', en: 'The highest tier reached is paid. A 0 amount means "no bonus at this level".', es: 'Se paga el tramo mas alto alcanzado. Un importe 0 significa «sin prima en ese nivel».', pt: 'E pago o patamar mais alto alcancado. Um montante 0 significa «sem premio neste nivel».', tr: 'Ulasilan en yuksek kademe odenir. 0 tutar "bu seviyede prim yok" demektir.' },
    seuil: { fr: 'A partir de (%)', ar: 'انطلاقاً من (%)', en: 'From (%)', es: 'Desde (%)', pt: 'A partir de (%)', tr: 'Su orandan (%)' },
    montant: { fr: 'Montant', ar: 'المبلغ', en: 'Amount', es: 'Importe', pt: 'Montante', tr: 'Tutar' },
    qualite: { fr: 'Retenue qualite', ar: 'خصم الجودة', en: 'Quality deduction', es: 'Retencion por calidad', pt: 'Retencao de qualidade', tr: 'Kalite kesintisi' },
    qualiteAide: { fr: 'Au-dela de ce taux de defauts, on retient ce pourcentage de la prime. Jamais plus que la prime.', ar: 'فوق هاد نسبة العيوب، كيتخصم هاد الپورسنطاج من العلاوة. عمرو ما كيزيد على العلاوة.', en: 'Above this defect rate, this share of the bonus is withheld. Never more than the bonus.', es: 'Por encima de esta tasa de defectos, se retiene ese porcentaje de la prima. Nunca mas que la prima.', pt: 'Acima desta taxa de defeitos, retem-se essa percentagem do premio. Nunca mais do que o premio.', tr: 'Bu hata oraninin uzerinde primin bu yuzdesi kesilir. Asla primden fazlasi degil.' },
    tauxMax: { fr: 'Defauts max (%)', ar: 'أقصى عيوب (%)', en: 'Max defects (%)', es: 'Defectos max (%)', pt: 'Defeitos max (%)', tr: 'Maks. hata (%)' },
    retenue: { fr: 'Retenue (%)', ar: 'الخصم (%)', en: 'Withheld (%)', es: 'Retencion (%)', pt: 'Retencao (%)', tr: 'Kesinti (%)' },
    assiduite: { fr: 'Assiduite', ar: 'الحضور', en: 'Attendance', es: 'Asistencia', pt: 'Assiduidade', tr: 'Devam' },
    assiduiteAide: { fr: 'Versee si l’ouvrier a ete releve sur au moins ce nombre de jours dans la periode.', ar: 'كتتخلّص إلا كان العامل مسجّل على الأقل هاد عدد الأيام فالمدّة.', en: 'Paid if the worker was recorded on at least this many days in the period.', es: 'Se paga si el operario fue registrado al menos esos dias en el periodo.', pt: 'Paga se o operario foi registado em pelo menos esse numero de dias no periodo.', tr: 'Iscinin donemde en az bu kadar gun kaydi varsa odenir.' },
    joursMin: { fr: 'Jours min', ar: 'أدنى أيام', en: 'Min days', es: 'Dias min', pt: 'Dias min', tr: 'Min gun' },
    polyvalence: { fr: 'Polyvalence', ar: 'تعدّد المناصب', en: 'Versatility', es: 'Polivalencia', pt: 'Polivalencia', tr: 'Cok yonluluk' },
    polyvalenceAide: { fr: 'Par poste tenu au-dela du premier. Un poste n’est « tenu » qu’au-dessus du rendement minimum.', ar: 'على كل منصب زائد على الأول. المنصب ما كيتحسبش «مشدود» إلا فوق أدنى مردودية.', en: 'Per poste held beyond the first. A poste counts as "held" only above the minimum efficiency.', es: 'Por puesto cubierto mas alla del primero. Un puesto solo cuenta si supera el rendimiento minimo.', pt: 'Por posto ocupado alem do primeiro. Um posto so conta acima do rendimento minimo.', tr: 'Ilkinden sonraki her istasyon icin. Bir istasyon ancak asgari verimin uzerinde "tutulmus" sayilir.' },
    parPoste: { fr: 'Par poste', ar: 'لكل منصب', en: 'Per poste', es: 'Por puesto', pt: 'Por posto', tr: 'Istasyon basina' },
    plafond: { fr: 'Plafond postes', ar: 'سقف المناصب', en: 'Poste cap', es: 'Tope de puestos', pt: 'Limite de postos', tr: 'Istasyon siniri' },
    rendementMin: { fr: 'Rendement min (%)', ar: 'أدنى مردودية (%)', en: 'Min efficiency (%)', es: 'Rendimiento min (%)', pt: 'Rendimento min (%)', tr: 'Min verim (%)' },
    enregistrer: { fr: 'Enregistrer les regles', ar: 'سجّل القواعد', en: 'Save the rules', es: 'Guardar las reglas', pt: 'Guardar as regras', tr: 'Kurallari kaydet' },
    enregistre: { fr: 'Enregistre', ar: 'تسجّل', en: 'Saved', es: 'Guardado', pt: 'Guardado', tr: 'Kaydedildi' },
    proposer: { fr: 'Partir des paliers usuels', ar: 'ابدا من المستويات المعتادة', en: 'Start from usual tiers', es: 'Partir de los tramos usuales', pt: 'Comecar pelos patamares usuais', tr: 'Alisilmis kademelerden basla' },
    totalVerse: { fr: 'Total a verser', ar: 'المجموع للصرف', en: 'Total payable', es: 'Total a pagar', pt: 'Total a pagar', tr: 'Odenecek toplam' },
    ouvriersPrimes: { fr: 'ouvriers primes', ar: 'عمّال متعلوين', en: 'workers with a bonus', es: 'operarios con prima', pt: 'operarios com premio', tr: 'prim alan isci' },
    minutes: { fr: 'min produites / presence', ar: 'دقائق منتَجة / حضور', en: 'min produced / presence', es: 'min producidos / presencia', pt: 'min produzidos / presenca', tr: 'uretilen dk / mevcudiyet' },
};

interface Props {
    settings: AppSettings;
    setSettings?: React.Dispatch<React.SetStateAction<AppSettings>>;
    models: ModelData[];
    /** Jour de référence : il donne la période (jour / semaine / mois). */
    globalDate?: string;
}

const classeRendement = (r: number | null) =>
    r === null ? 'text-slate-300 dark:text-dk-muted'
        : r >= 100 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            : r >= 80 ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';

export default function PrimesPage({ settings, setSettings, models, globalDate }: Props) {
    const { lang } = useLang();
    const date = globalDate || new Date().toISOString().split('T')[0];
    const devise = settings?.currency || '';

    const [releves, setReleves] = useState<PosteSuiviData[]>([]);
    const [workers, setWorkers] = useState<HRWorker[]>([]);
    const [chargement, setChargement] = useState(true);
    const [reglesOuvertes, setReglesOuvertes] = useState(false);
    const [enregistre, setEnregistre] = useState(false);

    useEffect(() => {
        let annule = false;
        (async () => {
            setChargement(true);
            try {
                const [rs, rw] = await Promise.all([
                    fetch('/api/poste-suivi', { credentials: 'include' }),
                    fetch('/api/hr/workers?active=1', { credentials: 'include' }),
                ]);
                const ds = rs.ok ? await rs.json() : [];
                const dw = rw.ok ? await rw.json() : [];
                if (!annule) {
                    setReleves(Array.isArray(ds) ? ds : []);
                    setWorkers(Array.isArray(dw) ? dw : []);
                }
            } catch (e) {
                console.error('PrimesPage: chargement', e);
            } finally {
                if (!annule) setChargement(false);
            }
        })();
        return () => { annule = true; };
    }, []);

    /* Brouillon des règles : on ne touche aux réglages qu'au clic sur
       « Enregistrer ». Une prime qui change pendant qu'on la règle serait une
       promesse faite par accident. */
    const [brouillon, setBrouillon] = useState<ConfigPrime | undefined>(settings?.primeConfig);
    useEffect(() => { setBrouillon(settings?.primeConfig); }, [settings?.primeConfig]);

    const periode = brouillon?.periode || settings?.primeConfig?.periode || 'semaine';

    /* Durée productive d'un créneau : la grille du jour, pauses déduites. Sans
       elle, un créneau coupé par un rabouz passerait pour une heure pleine et le
       rendement serait sous-évalué. */
    const dureeDe = React.useCallback((heureKey: string | undefined, jour: string): number => {
        const grille = deriveHourGrid(settings, jour ? new Date(jour) : undefined, { ignorerFermeture: true });
        if (!heureKey) return 60;
        const bloc = grille.blocks.find(b => b.key === heureKey);
        return bloc ? Math.max(5, bloc.duration) : 60;
    }, [settings]);

    const nomDe = React.useCallback((cle: string): string => {
        if (cle.startsWith('nom:')) return cle.slice(4);
        return workers.find(w => String(w.id) === cle)?.full_name || cle;
    }, [workers]);

    const { bulletins, debut, fin } = useMemo(
        () => calculerPrimes(releves, settings?.primeConfig, date, nomDe, dureeDe),
        [releves, settings?.primeConfig, date, nomDe, dureeDe],
    );

    const podium = useMemo(() => bulletins.filter(b => b.rendement !== null).slice(0, 3), [bulletins]);
    const totalVerse = useMemo(() => bulletins.reduce((s, b) => s + b.total, 0), [bulletins]);
    const nbPrimes = useMemo(() => bulletins.filter(b => b.total > 0).length, [bulletins]);
    const aucuneRegle = !settings?.primeConfig || (settings.primeConfig.paliers || []).every(p => !p.montant);

    const changerPeriode = (p: ConfigPrime['periode']) => {
        const base = settings?.primeConfig || CONFIG_PRIME_SUGGEREE;
        setSettings?.(prev => ({ ...prev, primeConfig: { ...base, periode: p } }));
    };

    const enregistrerRegles = () => {
        if (!brouillon) return;
        setSettings?.(prev => ({ ...prev, primeConfig: brouillon }));
        setEnregistre(true);
        setTimeout(() => setEnregistre(false), 1800);
    };

    const majPalier = (idx: number, patch: Partial<{ min: number; montant: number }>) => {
        setBrouillon(prev => {
            const base = prev || CONFIG_PRIME_SUGGEREE;
            const paliers = [...(base.paliers || [])];
            paliers[idx] = { ...paliers[idx], ...patch };
            return { ...base, paliers };
        });
    };

    const champ = (valeur: number | undefined, onChange: (n: number) => void, suffixe?: string) => (
        <span className="inline-flex items-center gap-1">
            <input
                type="text"
                inputMode="decimal"
                value={valeur === undefined || valeur === null ? '' : String(valeur)}
                onChange={e => {
                    /* Chiffres seulement : un champ de montant qui accepte « e » ou
                       « + » finit par produire une prime illisible. */
                    const propre = e.target.value.replace(/[^0-9.]/g, '');
                    onChange(propre === '' ? 0 : Number(propre));
                }}
                placeholder="—"
                className="w-16 h-8 text-center text-[12px] font-black tabular-nums rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text outline-none focus:border-indigo-600"
            />
            {suffixe && <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{suffixe}</span>}
        </span>
    );

    return (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* En-tête : le titre, la période, l'accès aux règles */}
            <div className="shrink-0 bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border/60 px-2 sm:px-6 py-1.5 sm:py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-[13px] sm:text-sm font-black text-slate-800 dark:text-dk-text truncate flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-indigo-600 dark:text-dk-accent-text shrink-0" />
                        {tx(lang, L.titre)}
                    </h2>
                    <p className="hidden sm:block text-[11px] text-slate-400 dark:text-dk-muted font-medium">{tx(lang, L.sousTitre)}</p>
                </div>

                <div className="flex items-center gap-1.5">
                    <div className="bg-slate-100 dark:bg-dk-elevated/80 p-0.5 rounded-xl border border-slate-200 dark:border-dk-border/50 flex gap-0.5">
                        {(['jour', 'semaine', 'mois'] as const).map(p => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => changerPeriode(p)}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${periode === p ? 'bg-white dark:bg-dk-surface text-indigo-900 dark:text-indigo-200 shadow-sm' : 'text-slate-500 dark:text-dk-muted'}`}
                            >
                                {tx(lang, p === 'jour' ? L.jour : p === 'semaine' ? L.semaine : L.mois)}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setReglesOuvertes(o => !o)}
                        className={`h-8 px-2.5 rounded-lg border text-[11px] font-black flex items-center gap-1.5 transition-colors ${
                            reglesOuvertes
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft'
                        }`}
                    >
                        <Settings2 className="w-3.5 h-3.5" /> {tx(lang, L.regles)}
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 sm:p-6 space-y-3">
                {chargement ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-sm font-bold text-slate-400 dark:text-dk-muted">
                        <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                ) : (
                    <>
                        {/* Bandeau période + total, pour savoir de quoi on parle */}
                        <div className="rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-black tabular-nums text-slate-600 dark:text-dk-text-soft">
                                {debut} → {fin}
                            </span>
                            <span className="text-right">
                                <span className="block text-[15px] font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                                    {totalVerse} {devise}
                                </span>
                                <span className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted">
                                    {tx(lang, L.totalVerse)} · {nbPrimes} {tx(lang, L.ouvriersPrimes)}
                                </span>
                            </span>
                        </div>

                        {aucuneRegle && (
                            <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
                                <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300">{tx(lang, L.reglesAucune)}</p>
                            </div>
                        )}

                        {/* ─── Podium : la question qu'on se pose en entrant ─── */}
                        <div className="rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface overflow-hidden">
                            <div className="px-3 py-2 border-b border-slate-100 dark:border-dk-border/50 bg-slate-50 dark:bg-dk-elevated/40 flex items-center gap-1.5">
                                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                                <p className="text-[11px] font-black text-slate-700 dark:text-dk-text">{tx(lang, L.podium)}</p>
                            </div>
                            {podium.length === 0 ? (
                                <p className="px-3 py-4 text-[11px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.podiumVide)}</p>
                            ) : (
                                <div className="p-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {podium.map((b, i) => (
                                        <div
                                            key={b.cle}
                                            className={`rounded-xl px-3 py-2.5 border ${
                                                i === 0
                                                    ? 'border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10'
                                                    : 'border-slate-200 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-black tabular-nums text-slate-400 dark:text-dk-muted">#{i + 1}</span>
                                                <span className={`rounded-md px-2 py-0.5 text-[12px] font-black tabular-nums ${classeRendement(b.rendement)}`}>
                                                    {b.rendement}%
                                                </span>
                                            </div>
                                            <p className="mt-1 text-[13px] font-black text-slate-800 dark:text-dk-text truncate">{b.nom}</p>
                                            <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                                                {b.piecesBonnes} {tx(lang, L.pieces)} · {b.postes.length} {tx(lang, L.postes)}
                                                {b.total > 0 ? ` · ${b.total} ${devise}` : ''}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ─── Bulletins ─── */}
                        <div className="rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface overflow-hidden">
                            <div className="px-3 py-2 border-b border-slate-100 dark:border-dk-border/50 bg-slate-50 dark:bg-dk-elevated/40">
                                <p className="text-[11px] font-black text-slate-700 dark:text-dk-text">{tx(lang, L.bulletins)}</p>
                            </div>
                            {bulletins.length === 0 ? (
                                <p className="px-3 py-4 text-[11px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.vide)}</p>
                            ) : (
                                <div className="overflow-x-auto scrollbar-thin">
                                    <table className="w-full text-[12px] border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-dk-elevated/60 text-slate-500 dark:text-dk-muted text-[10px] uppercase tracking-wider font-black">
                                                <th className="text-left px-3 py-2 sticky left-0 bg-slate-50 dark:bg-dk-elevated/60 z-10 min-w-[150px]">{tx(lang, L.ouvrier)}</th>
                                                <th className="px-2 py-2 text-center w-24" title={tx(lang, L.rendementTitre)}>{tx(lang, L.rendement)}</th>
                                                <th className="px-2 py-2 text-center w-20">{tx(lang, L.pieces)}</th>
                                                <th className="px-2 py-2 text-center w-24">{tx(lang, L.defauts)}</th>
                                                <th className="px-2 py-2 text-center w-16">{tx(lang, L.jours)}</th>
                                                <th className="px-2 py-2 text-center w-16">{tx(lang, L.postes)}</th>
                                                <th className="text-left px-3 py-2 min-w-[180px]">{tx(lang, L.detail)}</th>
                                                <th className="px-2 py-2 text-center w-24 bg-slate-800 text-white dark:bg-dk-elevated">{tx(lang, L.prime)}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-dk-border/40">
                                            {bulletins.map(b => (
                                                <tr key={b.cle} className="hover:bg-slate-50/60 dark:hover:bg-dk-elevated/30">
                                                    <td className="px-3 py-2 sticky left-0 bg-white dark:bg-dk-surface z-10">
                                                        <p className="font-black text-slate-800 dark:text-dk-text truncate">{b.nom}</p>
                                                        <p className="text-[9px] font-bold text-slate-400 dark:text-dk-muted tabular-nums">
                                                            {b.minutesProduites} / {b.minutesPresence} {tx(lang, L.minutes)}
                                                        </p>
                                                    </td>
                                                    <td className="px-2 py-2 text-center">
                                                        {b.rendement === null ? (
                                                            <span className="text-slate-300 dark:text-dk-muted font-bold">—</span>
                                                        ) : (
                                                            <span className={`inline-block rounded-md px-2 py-1 text-[11px] font-black tabular-nums ${classeRendement(b.rendement)}`}>
                                                                {b.rendement}%
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-2 text-center font-black tabular-nums text-slate-800 dark:text-dk-text">{b.piecesBonnes}</td>
                                                    <td className="px-2 py-2 text-center tabular-nums">
                                                        <span className={`font-bold ${b.tauxDefaut > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-dk-muted'}`}>
                                                            {b.piecesDefaut}{b.tauxDefaut > 0 ? ` · ${b.tauxDefaut}%` : ''}
                                                        </span>
                                                    </td>
                                                    <td className="px-2 py-2 text-center font-bold tabular-nums text-slate-600 dark:text-dk-text-soft">{b.joursReleves}</td>
                                                    <td className="px-2 py-2 text-center font-bold tabular-nums text-slate-600 dark:text-dk-text-soft">{b.postes.length}</td>
                                                    <td className="px-3 py-2">
                                                        {b.lignes.length === 0 ? (
                                                            <span className="text-[10px] font-bold text-slate-300 dark:text-dk-muted">—</span>
                                                        ) : (
                                                            <div className="space-y-0.5">
                                                                {b.lignes.map((l, i) => (
                                                                    <p key={i} className="text-[10px] font-bold tabular-nums">
                                                                        <span className={l.montant < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-dk-muted'}>
                                                                            {l.libelle} : {l.montant > 0 ? '+' : ''}{l.montant} {devise}
                                                                        </span>
                                                                    </p>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-2 text-center bg-slate-50 dark:bg-dk-elevated/40">
                                                        <span className={`text-[13px] font-black tabular-nums ${b.total > 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-300 dark:text-dk-muted'}`}>
                                                            {b.total > 0 ? `${b.total} ${devise}` : '—'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* ─── Règles ─── */}
                        {reglesOuvertes && (
                            <div className="rounded-2xl border border-slate-200 dark:border-dk-border/60 bg-white dark:bg-dk-surface p-3 space-y-4">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] font-black text-slate-700 dark:text-dk-text">{tx(lang, L.regles)}</p>
                                    {!brouillon && (
                                        <button
                                            type="button"
                                            onClick={() => setBrouillon(CONFIG_PRIME_SUGGEREE)}
                                            className="h-8 px-3 rounded-lg border border-slate-200 dark:border-dk-border text-[11px] font-black text-slate-600 dark:text-dk-text-soft"
                                        >
                                            {tx(lang, L.proposer)}
                                        </button>
                                    )}
                                </div>

                                {brouillon && (
                                    <>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">{tx(lang, L.paliers)}</p>
                                            <p className="mb-1.5 text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.paliersAide)}</p>
                                            <div className="space-y-1.5">
                                                {(brouillon.paliers || []).map((p, i) => (
                                                    <div key={i} className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted w-24">{tx(lang, L.seuil)}</span>
                                                        {champ(p.min, n => majPalier(i, { min: n }), '%')}
                                                        <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted w-16 text-right">{tx(lang, L.montant)}</span>
                                                        {champ(p.montant, n => majPalier(i, { montant: n }), devise)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">{tx(lang, L.qualite)}</p>
                                            <p className="mb-1.5 text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.qualiteAide)}</p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.tauxMax)}</span>
                                                {champ(brouillon.qualite?.tauxMax, n => setBrouillon(prev => ({ ...(prev || CONFIG_PRIME_SUGGEREE), qualite: { retenue: prev?.qualite?.retenue ?? 50, tauxMax: n } })), '%')}
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.retenue)}</span>
                                                {champ(brouillon.qualite?.retenue, n => setBrouillon(prev => ({ ...(prev || CONFIG_PRIME_SUGGEREE), qualite: { tauxMax: prev?.qualite?.tauxMax ?? 3, retenue: n } })), '%')}
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">{tx(lang, L.assiduite)}</p>
                                            <p className="mb-1.5 text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.assiduiteAide)}</p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.joursMin)}</span>
                                                {champ(brouillon.assiduite?.joursMin, n => setBrouillon(prev => ({ ...(prev || CONFIG_PRIME_SUGGEREE), assiduite: { montant: prev?.assiduite?.montant ?? 0, joursMin: n } })))}
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.montant)}</span>
                                                {champ(brouillon.assiduite?.montant, n => setBrouillon(prev => ({ ...(prev || CONFIG_PRIME_SUGGEREE), assiduite: { joursMin: prev?.assiduite?.joursMin ?? 5, montant: n } })), devise)}
                                            </div>
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">{tx(lang, L.polyvalence)}</p>
                                            <p className="mb-1.5 text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.polyvalenceAide)}</p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.parPoste)}</span>
                                                {champ(brouillon.polyvalence?.montantParPoste, n => setBrouillon(prev => ({ ...(prev || CONFIG_PRIME_SUGGEREE), polyvalence: { plafond: prev?.polyvalence?.plafond ?? 4, rendementMin: prev?.polyvalence?.rendementMin ?? 80, montantParPoste: n } })), devise)}
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.plafond)}</span>
                                                {champ(brouillon.polyvalence?.plafond, n => setBrouillon(prev => ({ ...(prev || CONFIG_PRIME_SUGGEREE), polyvalence: { montantParPoste: prev?.polyvalence?.montantParPoste ?? 0, rendementMin: prev?.polyvalence?.rendementMin ?? 80, plafond: n } })))}
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{tx(lang, L.rendementMin)}</span>
                                                {champ(brouillon.polyvalence?.rendementMin, n => setBrouillon(prev => ({ ...(prev || CONFIG_PRIME_SUGGEREE), polyvalence: { montantParPoste: prev?.polyvalence?.montantParPoste ?? 0, plafond: prev?.polyvalence?.plafond ?? 4, rendementMin: n } })), '%')}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={enregistrerRegles}
                                            disabled={!setSettings}
                                            className="h-9 px-4 rounded-xl bg-indigo-600 text-white text-[12px] font-black flex items-center gap-1.5 disabled:opacity-40"
                                        >
                                            {enregistre ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                                            {tx(lang, enregistre ? L.enregistre : L.enregistrer)}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
