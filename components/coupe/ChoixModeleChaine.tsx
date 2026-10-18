/**
 * Donner un modele a une chaine, depuis La Coupe.
 *
 * Une feuille (plein ecran sur telephone, fenetre centree au-dessus) en deux temps :
 *  1. les modeles qui ont un ordre de coupe ouvert, un pedido par ligne ;
 *  2. un petit formulaire : chaine, debut sur la chaine, date d'export (et quantite pour
 *     une nouvelle commande).
 *
 * L'enregistrement ECRIT AU PLANNING (chaine + dates du pedido, date figee) par le
 * `setPlanningEvents` de App.tsx, qui le persiste en local (SQLite) comme sur Vercel
 * (localStorage + cloudSync). La liste manuelle `reglage.modeles` n'est plus ecrite ici.
 *
 * Les calculs vivent dans `lib/coupeChoixModele.ts` (testes) ; ici, l'affichage.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, Factory, Info, Lock, Pause, Play, Plus, Scissors, Search } from 'lucide-react';
import type { AppSettings, ModelData, PlanningEvent, ReglageChaineCoupe } from '../../types';
import SheetModal from '../shared/SheetModal';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { aujourdhui, estOuvert, resumerOrdre } from '../../lib/coupeAtelier';
import type { ChaineCoupe } from '../../lib/coupeChaines';
import { fmtN, localeDe } from '../../lib/coupeFormat';
import {
    affecterPedido, basculerPause, chaineDuPlanning, codeLotDe, commencerCoupeLe, creerPedido, erreurAffectation, pedidosDuModele,
    quantitePlanifiee, resteAPlanifier, trouverChaine, type CategorieStatut, type IdentiteChaine, type PedidoPlanning,
} from '../../lib/coupeChoixModele';

interface Props {
    /** Les modeles de la coupe ; seuls ceux dont l'ordre est ouvert sont proposes. */
    models: ModelData[];
    /** Pedidos (OF) du Planning. */
    evenements: PlanningEvent[];
    /** Chaines de la page Chaines, avec les modeles qu'elles portent deja. */
    chaines: ChaineCoupe[];
    reglages: ReglageChaineCoupe[];
    /** Chaine (id de la page Chaines) d'ou le choix est ouvert : preselectionnee. */
    chaineDepart: string;
    settings?: AppSettings;
    /** Jours de couture d'avance que la coupe garde a la chaine (reglage « Avance voulue »). */
    joursAvance: number;
    /** L'etat du Planning (App.tsx). Absent : la feuille se lit mais n'ecrit rien. */
    setEvenements?: React.Dispatch<React.SetStateAction<PlanningEvent[]>>;
    onFermer: () => void;
    /** Confirmation affichee a l'ecran (toast de La Coupe). */
    onFait?: (message: string) => void;
}

const BADGE_STATUT: Record<CategorieStatut, { fr: string; ar: string; en: string; cls: string }> = {
    pause: { fr: 'En pause', ar: 'إيقاف مؤقت', en: 'Paused', cls: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/25 dark:text-amber-300 dark:border-amber-800' },
    termine: { fr: 'Terminé', ar: 'منتهي', en: 'Done', cls: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-dk-elevated dark:text-dk-muted dark:border-dk-border' },
    en_cours: { fr: 'En cours', ar: 'جارٍ', en: 'In progress', cls: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/25 dark:text-sky-300 dark:border-sky-800' },
    externe: { fr: 'Externe', ar: 'خارجي', en: 'External', cls: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-dk-elevated dark:text-dk-text-soft dark:border-dk-border' },
    pret: { fr: 'Prêt', ar: 'جاهز', en: 'Ready', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/25 dark:text-emerald-300 dark:border-emerald-800' },
};

const ORANGE_DOUX = 'bg-orange-50 text-orange-800 border border-orange-200 dark:bg-orange-900/25 dark:text-orange-200 dark:border-orange-800';
const CHAMP = 'h-10 px-2.5 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-bg text-[13px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-400 dark:[color-scheme:dark]';
const ETIQUETTE = 'block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1';

/** Le formulaire : un pedido (eventId) ou une nouvelle commande (null) d'un modele. */
interface Cible { modelId: string; eventId: string | null }

export default function ChoixModeleChaine({ models, evenements, chaines, reglages, chaineDepart, settings, joursAvance, setEvenements, onFermer, onFait }: Props) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    const locale = localeDe(lang);
    const jour = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: 'short' }) : '—');

    const [q, setQ] = useState('');
    const [ouvert, setOuvert] = useState<string | null>(null);
    const [cible, setCible] = useState<Cible | null>(null);
    // Le formulaire.
    const [chaineChoisie, setChaineChoisie] = useState(chaineDepart);
    const [debut, setDebut] = useState('');
    const [exportLe, setExportLe] = useState('');
    const [quantite, setQuantite] = useState<number | ''>('');
    const [absent, setAbsent] = useState(false);

    /** Les chaines avec leurs autres noms : pour lire la chaine d'un pedido et pour ecrire la bonne. */
    const identites: IdentiteChaine[] = useMemo(
        () => chaines.map(c => ({ id: c.id, nom: c.nom, alias: reglages.find(r => r.id === c.id)?.alias })),
        [chaines, reglages],
    );
    const nomChaine = (brut: string) => trouverChaine(brut, identites)?.nom || settings?.chainNames?.[brut] || brut || '—';
    const chaineDeDepart = identites.find(c => c.id === chaineDepart);

    /** Les modeles a ordre ouvert, avec ce qu'on veut en dire. */
    const lignes = useMemo(() => models.filter(m => m.ordreCoupe && estOuvert(m)).map(m => ({ m, r: resumerOrdre(m) })), [models]);
    /** Ou chaque modele est deja (chaines de la page, serie et reglage manuel compris). */
    const surChaines = useMemo(() => {
        const t = new Map<string, ChaineCoupe[]>();
        for (const c of chaines) for (const x of c.modeles) {
            const l = t.get(x.modelId) || [];
            if (!l.includes(c)) l.push(c);
            t.set(x.modelId, l);
        }
        return t;
    }, [chaines]);

    const visibles = lignes
        .filter(({ r, m }) => !q.trim() || `${r.nom} ${r.client} ${m.meta_data?.nom_modele || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => {
            // D'abord ceux que la chaine n'a pas encore, puis l'ordre alphabetique.
            const ia = (surChaines.get(a.m.id) || []).some(c => c.id === chaineDepart) ? 1 : 0;
            const ib = (surChaines.get(b.m.id) || []).some(c => c.id === chaineDepart) ? 1 : 0;
            return ia - ib || a.r.nom.localeCompare(b.r.nom, undefined, { numeric: true });
        });

    const ligneCible = cible ? lignes.find(x => x.m.id === cible.modelId) : undefined;
    const pedidosCible = cible ? pedidosDuModele(evenements, cible.modelId) : [];
    const pedidoCible = cible?.eventId ? pedidosCible.find(p => p.eventId === cible.eventId) : undefined;
    const nouvelle = !!cible && cible.eventId === null;
    const reste = ligneCible ? resteAPlanifier(ligneCible.m, evenements) : 0;

    const ouvrirFormulaire = (modelId: string, p: PedidoPlanning | null) => {
        const ligne = lignes.find(x => x.m.id === modelId);
        if (!ligne) return;
        const restant = resteAPlanifier(ligne.m, evenements);
        setCible({ modelId, eventId: p ? p.eventId : null });
        setChaineChoisie(identites.some(c => c.id === chaineDepart) ? chaineDepart : identites[0]?.id || '');
        setDebut(p?.debut || aujourdhui());
        setExportLe(p?.export || '');
        setQuantite(!p && restant > 0 ? restant : '');
        setAbsent(false);
    };

    const chaineForm = identites.find(c => c.id === chaineChoisie);
    const ecriture = chaineForm ? chaineDuPlanning(chaineForm, settings, reglages) : null;
    // Une chaine que le Planning ne connait pas n'a pas de ligne au Gantt : l'OF y disparaitrait, on refuse.
    const saisie = { chaineId: ecriture?.id || '', debut, export: exportLe, quantite, chaineConnue: ecriture?.connue };
    const erreur = cible ? erreurAffectation(saisie, nouvelle) : null;
    const conseil = commencerCoupeLe(debut, joursAvance);
    const quantiteNum = quantite === '' ? 0 : quantite;

    const enregistrer = () => {
        if (!setEvenements || !cible || !ligneCible || !chaineForm || !ecriture || erreur) return;
        const { m } = ligneCible;
        const maintenant = Date.now();
        let code = '';
        if (nouvelle) {
            // Code de lot et identifiant se decident sur le Planning tel qu'il est au moment de l'ecriture
            // (un autre poste ou une fusion cloud a pu ajouter un lot entre l'affichage et le clic) ;
            // un identifiant deja pris avance d'une milliseconde plutot que de perdre la commande.
            const construire = (prev: PlanningEvent[]): PlanningEvent => {
                let t = maintenant;
                let ev = creerPedido(m, { ...saisie, quantite: quantiteNum }, pedidosDuModele(prev, m.id), settings, t);
                while (prev.some(e => e.id === ev.id)) ev = creerPedido(m, { ...saisie, quantite: quantiteNum }, pedidosDuModele(prev, m.id), settings, ++t);
                return ev;
            };
            code = codeLotDe(construire(evenements).modelName);
            setEvenements(prev => [...prev, construire(prev)]);
        } else {
            const id = cible.eventId;
            // Le pedido a pu disparaitre du Planning pendant que la feuille etait ouverte.
            if (!id || !evenements.some(e => e.id === id)) { setAbsent(true); return; }
            code = pedidoCible?.code || '';
            setEvenements(prev => prev.map(e => (e.id === id ? affecterPedido(e, saisie, m, settings, maintenant) : e)));
        }
        const quoi = [ligneCible.r.nom, code].filter(Boolean).join(' ');
        const dates = `${L('début', 'البداية', 'start')} ${jour(debut)}${exportLe ? `, export ${jour(exportLe)}` : ''}`;
        onFait?.(nouvelle
            ? L(`${quoi} : commande de ${fmtN(quantiteNum)} pcs créée au Planning sur ${chaineForm.nom} (${dates}). Date verrouillée.`, `${quoi}: أُنشئ طلب ${fmtN(quantiteNum)} قطعة في التخطيط على ${chaineForm.nom} (${dates}). التاريخ مثبّت.`, `${quoi}: order of ${fmtN(quantiteNum)} pcs created in Planning on ${chaineForm.nom} (${dates}). Date locked.`)
            : L(`${quoi} : affecté à ${chaineForm.nom} au Planning (${dates}). Date verrouillée.`, `${quoi}: عُيّن على ${chaineForm.nom} في التخطيط (${dates}). التاريخ مثبّت.`, `${quoi}: assigned to ${chaineForm.nom} in Planning (${dates}). Date locked.`));
        onFermer();
    };

    const basculer = (nomModele: string, p: PedidoPlanning) => {
        if (!setEvenements) return;
        const enPause = p.statut === 'pause';
        setEvenements(prev => prev.map(e => (e.id === p.eventId ? basculerPause(e) : e)));
        const quoi = [nomModele, p.code].filter(Boolean).join(' ');
        onFait?.(enPause
            ? L(`${quoi} : repris au Planning.`, `${quoi}: استُؤنف في التخطيط.`, `${quoi}: resumed in Planning.`)
            : L(`${quoi} : en pause au Planning, la coupe ne le demande plus.`, `${quoi}: أُوقف مؤقتاً في التخطيط، ولم يعد القص مطلوباً له.`, `${quoi}: paused in Planning, cutting no longer needs it.`));
    };

    /* ------------------------------------------------------------------ */
    /* 2. Le formulaire                                                    */
    /* ------------------------------------------------------------------ */
    if (cible && ligneCible) {
        const { m, r } = ligneCible;
        const avant = pedidoCible && pedidoCible.chaineId ? nomChaine(pedidoCible.chaineId) : '';
        const depasse = nouvelle && quantiteNum > reste;
        const dejaPasse = conseil !== null && conseil < aujourdhui();
        return (
            <SheetModal
                onClose={onFermer}
                size="md"
                fixedHeight
                zClass="z-[120]"
                closeOnBackdrop={false}
                title={nouvelle ? L('Nouvelle commande', 'طلب جديد', 'New order') : L('Affecter le pedido', 'تعيين الطلب', 'Assign the pedido')}
                subtitle={`${r.nom}${pedidoCible?.code ? ` · ${pedidoCible.code}` : ''}`}
                headerActions={(
                    <button type="button" onClick={() => setCible(null)} aria-label={L('Retour aux modèles', 'الرجوع إلى الموديلات', 'Back to models')} title={L('Retour aux modèles', 'الرجوع إلى الموديلات', 'Back to models')} className="p-1.5 hover:bg-slate-100 dark:hover:bg-dk-elevated rounded-full text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text-soft">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                )}
                bodyClassName="flex-1 overflow-y-auto min-h-0 p-4 space-y-4"
                footer={(
                    <>
                        <button type="button" onClick={() => setCible(null)} className="h-10 px-4 rounded-lg border border-slate-200 dark:border-dk-border text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft">{L('Annuler', 'إلغاء', 'Cancel')}</button>
                        <button type="button" onClick={enregistrer} disabled={!setEvenements || !!erreur} className="h-10 px-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-dk-accent text-white text-[12px] font-bold disabled:opacity-40 disabled:cursor-not-allowed">
                            <Check className="w-4 h-4" />{nouvelle ? L('Créer et affecter', 'إنشاء وتعيين', 'Create and assign') : L('Affecter', 'تعيين', 'Assign')}{chaineForm ? ` · ${chaineForm.nom}` : ''}
                        </button>
                    </>
                )}
            >
                <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 dark:bg-dk-bg px-3 py-2">
                    <Vignette m={m} />
                    <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-slate-800 dark:text-dk-text truncate">{r.nom}</p>
                        <p className="text-[11px] text-slate-500 dark:text-dk-muted truncate">
                            {nouvelle
                                ? `${L('Commande', 'الطلب', 'Order')} ${fmtN(r.qte)} ${L('pcs', 'قطعة', 'pcs')} · ${L('déjà planifié', 'مبرمج مسبقاً', 'already planned')} ${fmtN(quantitePlanifiee(evenements, m.id))}`
                                : `${pedidoCible?.code || L('Pedido', 'طلب', 'Pedido')} · ${fmtN(pedidoCible?.quantite || 0)} ${L('pcs', 'قطعة', 'pcs')}${avant ? ` · ${avant}` : ''}`}
                        </p>
                    </div>
                </div>

                <div>
                    <span className={ETIQUETTE}>{L('Chaîne', 'السلسلة', 'Line')}</span>
                    <div className="flex flex-wrap gap-1.5">
                        {identites.map(c => (
                            <button
                                key={c.id}
                                type="button"
                                aria-pressed={c.id === chaineChoisie}
                                onClick={() => setChaineChoisie(c.id)}
                                className={`h-10 px-3 inline-flex items-center gap-1.5 rounded-lg border text-[12px] font-semibold ${c.id === chaineChoisie ? 'border-slate-900 bg-slate-900 text-white dark:bg-dk-accent dark:border-dk-accent' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft'}`}
                            >
                                <Factory className="w-3.5 h-3.5 opacity-70" />{c.nom}
                            </button>
                        ))}
                    </div>
                    {ecriture && !ecriture.connue && chaineForm && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                            {L(
                                `« ${chaineForm.nom} » n’existe pas au Planning : le pedido n’apparaîtrait pas au Gantt. Ajoutez « CHAINE n » (n = numéro de la chaîne du Planning) comme alias de cette chaîne dans Régler les chaînes.`,
                                `«${chaineForm.nom}» غير موجودة في التخطيط: لن يظهر الطلب في مخطط جانت. أضف «CHAINE n» (رقم سلسلة التخطيط) كاسم بديل لهذه السلسلة في ضبط السلاسل.`,
                                `"${chaineForm.nom}" is not in Planning: the pedido would not show in the Gantt. Add "CHAINE n" (n = the Planning line number) as an alias of this line in Set lines.`,
                            )}
                        </p>
                    )}
                    {erreur === 'chaine' && !(ecriture && !ecriture.connue) && (
                        <p className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">{L('Choisissez une chaîne.', 'اختر سلسلة.', 'Choose a line.')}</p>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block min-w-0">
                        <span className={ETIQUETTE}>{L('Début sur la chaîne', 'البداية على السلسلة', 'Start on the line')}</span>
                        <input type="date" value={debut} onChange={e => setDebut(e.target.value)} className={`${CHAMP} w-full`} />
                    </label>
                    <label className="block min-w-0">
                        <span className={ETIQUETTE}>{L('Date d’export', 'تاريخ التصدير', 'Export date')}</span>
                        <input type="date" value={exportLe} min={debut || undefined} onChange={e => setExportLe(e.target.value)} className={`${CHAMP} w-full`} />
                        {!nouvelle && pedidoCible?.export && (
                            <span className="mt-1 block text-[11px] text-slate-500 dark:text-dk-muted">
                                {L(`Laisser vide : la date du Planning (${jour(pedidoCible.export)}) est conservée.`, `إن تُرك فارغاً: يبقى تاريخ التخطيط (${jour(pedidoCible.export)}).`, `Leave empty: the Planning date (${jour(pedidoCible.export)}) is kept.`)}
                            </span>
                        )}
                    </label>
                </div>
                {erreur === 'debut' && (
                    <p className="-mt-2 text-[11px] text-rose-600 dark:text-rose-400">{L('Indiquez la date de début sur la chaîne.', 'حدّد تاريخ البداية على السلسلة.', 'Enter the start date on the line.')}</p>
                )}
                {erreur === 'export' && (
                    <p className="-mt-2 text-[11px] text-rose-600 dark:text-rose-400">{L('La date d’export ne peut pas précéder le début.', 'تاريخ التصدير لا يسبق البداية.', 'The export date cannot be before the start.')}</p>
                )}

                {nouvelle && (
                    <label className="block">
                        <span className={ETIQUETTE}>{L('Quantité (pcs)', 'الكمية (قطع)', 'Quantity (pcs)')}</span>
                        <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step="1"
                            value={quantite}
                            onChange={e => setQuantite(e.target.value === '' ? '' : Math.max(0, Math.floor(Number(e.target.value))))}
                            placeholder={L('ex. 500', 'مثال: 500', 'e.g. 500')}
                            className={`${CHAMP} w-full tabular-nums`}
                        />
                        <span className="mt-1 block text-[11px] text-slate-500 dark:text-dk-muted">
                            {reste > 0
                                ? L(`Reste à planifier : ${fmtN(reste)} pcs (commande ${fmtN(r.qte)} − déjà planifié ${fmtN(quantitePlanifiee(evenements, m.id))}).`, `المتبقي للبرمجة: ${fmtN(reste)} قطعة (الطلب ${fmtN(r.qte)} − مبرمج ${fmtN(quantitePlanifiee(evenements, m.id))}).`, `Left to plan: ${fmtN(reste)} pcs (order ${fmtN(r.qte)} − planned ${fmtN(quantitePlanifiee(evenements, m.id))}).`)
                                : L('Toute la commande est déjà planifiée.', 'كل الطلب مبرمج مسبقاً.', 'The whole order is already planned.')}
                        </span>
                        {erreur === 'quantite' && (
                            <span className="mt-1 block text-[11px] text-rose-600 dark:text-rose-400">{L('Indiquez une quantité entière supérieure à 0.', 'أدخل كمية صحيحة أكبر من 0.', 'Enter a whole quantity above 0.')}</span>
                        )}
                        {depasse && (
                            <span className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                                {L(`Dépasse la commande de ${fmtN(quantiteNum - reste)} pcs.`, `يتجاوز الطلب بـ ${fmtN(quantiteNum - reste)} قطعة.`, `Exceeds the order by ${fmtN(quantiteNum - reste)} pcs.`)}
                            </span>
                        )}
                    </label>
                )}

                {conseil && (
                    <div className={`rounded-xl px-3 py-2 text-[12px] flex items-start gap-2 ${ORANGE_DOUX}`}>
                        <Scissors className="w-4 h-4 shrink-0 mt-px" />
                        <p>
                            {L('Commencer la coupe le', 'ابدأ القص يوم', 'Start cutting on')} <b className="tabular-nums">{jour(conseil)}</b>
                            <span className="opacity-80"> — {joursAvance} {L(joursAvance === 1 ? 'jour' : 'jours', joursAvance === 1 ? 'يوم' : 'أيام', joursAvance === 1 ? 'day' : 'days')} {L('d’avance avant le début sur la chaîne', 'تقدّم قبل بداية السلسلة', 'ahead of the line start')}.</span>
                            {dejaPasse && <b> {L('C’est déjà passé : coupez dès maintenant.', 'فات هذا اليوم: ابدأ القص الآن.', 'That day has passed: cut now.')}</b>}
                        </p>
                    </div>
                )}

                {avant && chaineForm && pedidoCible && trouverChaine(pedidoCible.chaineId, identites)?.id !== chaineForm.id && (
                    <p className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-dk-muted">
                        <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                        {L(`Ce pedido quitte ${avant}.`, `سيغادر هذا الطلب ${avant}.`, `This pedido leaves ${avant}.`)}
                    </p>
                )}
                <p className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-dk-muted">
                    <Lock className="w-3.5 h-3.5 shrink-0 mt-px" />
                    {L('Écrit au Planning, date verrouillée : le recalcul automatique ne la déplace plus.', 'يُكتب في التخطيط والتاريخ مثبّت: لن تحرّكه الحسابات التلقائية.', 'Written to Planning with the date locked: automatic rescheduling will not move it.')}
                </p>
                {absent && (
                    <p className="flex items-start gap-1.5 text-[12px] font-semibold text-rose-600 dark:text-rose-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                        {L('Ce pedido n’existe plus au Planning. Revenez à la liste.', 'هذا الطلب لم يعد موجوداً في التخطيط. ارجع إلى القائمة.', 'This pedido no longer exists in Planning. Go back to the list.')}
                    </p>
                )}
            </SheetModal>
        );
    }

    /* ------------------------------------------------------------------ */
    /* 1. Les modeles                                                      */
    /* ------------------------------------------------------------------ */
    return (
        <SheetModal
            onClose={onFermer}
            size="md"
            fixedHeight
            zClass="z-[120]"
            bare
            title={L('Ajouter un modèle', 'إضافة موديل', 'Add a model')}
            subtitle={chaineDeDepart ? `${L('pour', 'إلى', 'for')} ${chaineDeDepart.nom}` : undefined}
        >
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="shrink-0 p-3 space-y-2 border-b border-slate-100 dark:border-dk-border">
                    <label className="flex items-center gap-2 h-10 px-3 rounded-lg bg-white dark:bg-dk-bg border border-slate-200 dark:border-dk-border">
                        <Search className="w-4 h-4 text-slate-400 shrink-0" />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder={L('Modèle, client…', 'موديل، زبون…', 'Model, client…')} className="flex-1 min-w-0 bg-transparent text-[13px] text-slate-800 dark:text-dk-text outline-none" />
                    </label>
                    {!setEvenements && (
                        <p className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-dk-muted">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                            {L('Lecture seule : l’affectation s’écrit au Planning. Ouvrez le Planning pour placer un pedido.', 'للقراءة فقط: التعيين يُكتب في التخطيط. افتح التخطيط لوضع الطلب.', 'Read only: assignment is written to Planning. Open Planning to place a pedido.')}
                        </p>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2 overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                    {visibles.length === 0 && (
                        <p className="text-center text-[12px] text-slate-400 py-10">
                            {lignes.length === 0 ? L('Aucun ordre de coupe ouvert.', 'لا يوجد أمر قص مفتوح.', 'No open cutting order.') : L('Aucun modèle ne correspond.', 'لا موديل مطابق.', 'No model matches.')}
                        </p>
                    )}
                    {visibles.map(({ m, r }) => {
                        const ici = surChaines.get(m.id) || [];
                        const ailleurs = ici.filter(c => c.id !== chaineDepart);
                        const surCelle = ici.some(c => c.id === chaineDepart);
                        const pedidos = pedidosDuModele(evenements, m.id);
                        const restant = resteAPlanifier(m, evenements);
                        const deplie = ouvert === m.id;
                        return (
                            <div key={m.id} className="rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface overflow-hidden">
                                <button type="button" aria-expanded={deplie} onClick={() => setOuvert(deplie ? null : m.id)} className="w-full flex items-center gap-2.5 p-2.5 text-left hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                    <Vignette m={m} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-semibold text-slate-800 dark:text-dk-text truncate">{r.nom}</p>
                                        <p className="text-[11px] text-slate-500 dark:text-dk-muted truncate tabular-nums">
                                            {[r.client, `${fmtN(r.qte)} ${L('pcs', 'قطعة', 'pcs')}`, `${Math.round(r.avancement * 100)} % ${L('coupé', 'مقصوص', 'cut')}`].filter(Boolean).join(' · ')}
                                        </p>
                                        {(surCelle || ailleurs.length > 0) && (
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {surCelle && <span className="px-1.5 h-5 inline-flex items-center rounded border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-300 text-[10px] font-bold">{L('Sur cette chaîne', 'على هذه السلسلة', 'On this line')}</span>}
                                                {ailleurs.map(c => <span key={c.id} className="px-1.5 h-5 inline-flex items-center rounded border border-slate-200 bg-slate-50 text-slate-600 dark:border-dk-border dark:bg-dk-elevated dark:text-dk-text-soft text-[10px] font-bold">{L('Déjà sur', 'موجود على', 'Already on')} {c.nom}</span>)}
                                            </div>
                                        )}
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${deplie ? 'rotate-180' : ''}`} />
                                </button>

                                {deplie && (
                                    <div className="border-t border-slate-100 dark:border-dk-border divide-y divide-slate-100 dark:divide-dk-border">
                                        {pedidos.length === 0 && (
                                            <p className="px-3 py-2.5 text-[12px] text-slate-400">{L('Aucun pedido au Planning pour ce modèle.', 'لا طلب في التخطيط لهذا الموديل.', 'No pedido in Planning for this model.')}</p>
                                        )}
                                        {pedidos.map(p => {
                                            const st = BADGE_STATUT[p.statut];
                                            const choisissable = !!setEvenements && p.statut !== 'termine';
                                            return (
                                                <div key={p.eventId} className="flex items-center gap-1.5 px-2 py-1.5">
                                                    <button type="button" disabled={!choisissable} onClick={() => ouvrirFormulaire(m.id, p)} className="flex-1 min-w-0 text-left rounded-lg px-1.5 py-1.5 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 disabled:hover:bg-transparent disabled:cursor-default">
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <span className="px-1.5 h-5 inline-flex items-center rounded bg-slate-900 dark:bg-dk-accent text-white text-[10px] font-bold">{p.code || '—'}</span>
                                                            <span className="text-[13px] font-bold tabular-nums text-slate-800 dark:text-dk-text">{fmtN(p.quantite)} <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-muted">{L('pcs', 'قطعة', 'pcs')}</span></span>
                                                            <span className={`px-1.5 h-5 inline-flex items-center rounded border text-[10px] font-bold ${st.cls}`}>{tx(lang, st)}</span>
                                                            {p.verrouille && <Lock className="w-3 h-3 text-slate-400" aria-label={L('Date verrouillée', 'التاريخ مثبّت', 'Date locked')} />}
                                                        </div>
                                                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-dk-muted tabular-nums">
                                                            {nomChaine(p.chaineId)} · {L('début', 'البداية', 'start')} {jour(p.debut)} · {L('export', 'التصدير', 'export')} {jour(p.export)}
                                                        </p>
                                                    </button>
                                                    {setEvenements && p.statut !== 'termine' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => basculer(r.nom, p)}
                                                            aria-label={p.statut === 'pause' ? L('Reprendre ce pedido', 'استئناف هذا الطلب', 'Resume this pedido') : L('Mettre ce pedido en pause', 'إيقاف هذا الطلب مؤقتاً', 'Pause this pedido')}
                                                            title={p.statut === 'pause' ? L('Reprendre', 'استئناف', 'Resume') : L('Mettre en pause', 'إيقاف مؤقت', 'Pause')}
                                                            className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-text-soft hover:border-indigo-300"
                                                        >
                                                            {p.statut === 'pause' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        <div className="p-2">
                                            <button type="button" disabled={!setEvenements} onClick={() => ouvrirFormulaire(m.id, null)} className="w-full min-h-10 px-3 py-1.5 inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-dk-border text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft hover:border-indigo-300 disabled:opacity-50 disabled:cursor-default">
                                                <Plus className="w-4 h-4 shrink-0" />
                                                {L('Nouvelle commande', 'طلب جديد', 'New order')}
                                                <span className="font-normal text-slate-400 tabular-nums">· {restant > 0 ? L(`reste ${fmtN(restant)} pcs`, `المتبقي ${fmtN(restant)} قطعة`, `${fmtN(restant)} pcs left`) : L('tout est planifié', 'كل شيء مبرمج', 'all planned')}</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </SheetModal>
    );
}

/** La photo du modele (ou des ciseaux), comme les cartes des ordres. */
function Vignette({ m }: { m: ModelData }) {
    const src = m.image || m.images?.front || '';
    return (
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-dk-elevated shrink-0 flex items-center justify-center">
            {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : <Scissors className="w-4 h-4 text-slate-300" />}
        </div>
    );
}
