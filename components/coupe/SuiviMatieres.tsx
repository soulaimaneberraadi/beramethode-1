/**
 * Suivi d'un ordre de coupe, matiere en face de matiere.
 *
 * Ouvert depuis « Ordres en cours », surtout au telephone, en salle de coupe.
 * Les matelas de toutes les matieres (tissu, vlieseline, foro...) sont ranges
 * en lots qui coupent les memes pieces (voir lib/equilibreMatieres.ts) :
 * on voit d'un coup d'oeil qu'un matelas de tissu est lance alors que sa
 * doublure ne l'est pas encore.
 *
 *  gris  = a faire
 *  bleu  = trace imprime / envoye au traceur
 *  vert  = coupe, confirme
 *
 * Toucher un matelas ouvre sa fiche : confirmer la coupe (avec les plis
 * reellement etales), marquer le trace imprime, corriger les plis. Chaque
 * geste est enregistre aussitot par La Coupe.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronRight, ListOrdered, Loader2, Minus, PencilLine, Plus, Printer, Scissors, Undo2, Wand2,
} from 'lucide-react';
import type { GroupeCoupe, ModelData, OrdreCoupe } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { commandeDe } from '../../lib/coupeAtelier';
import {
    equilibrerOrdre, proposerAjustement, renumeroterSelonLots, type EcartEquilibre, type EquilibreOrdre, type LotEquilibre, type MatelasEquilibre, type MatiereEquilibre,
} from '../../lib/equilibreMatieres';
import SheetModal from '../shared/SheetModal';
import { ChoixGroupe, heureLocale } from './AccueilCoupe';

export type EtatSauvegarde = 'repos' | 'encours' | 'ok' | 'erreur';

interface Props {
    modele: ModelData;
    ordre: OrdreCoupe;
    tailles: string[];
    groupes: GroupeCoupe[];
    dernierGroupe?: string;
    sauvegarde: EtatSauvegarde;
    pastille: (couleur: string) => { hex: string | null; dotClass: string };
    onRetour: () => void;
    onOuvrirOrdre: () => void;
    /** Matelas coupe : plis reellement etales ; le reste repart en matelas si demande. */
    onConfirmer: (id: string, c: { plis: number; creerReste: boolean; groupe?: string }) => void;
    onAnnulerCoupe: (id: string) => void;
    /** Trace imprime (bleu) ou pas. */
    onMarquerImprime: (id: string, imprime: boolean) => void;
    /** Plis prevus d'un matelas pas encore coupe. */
    onModifierPlis: (id: string, plis: number) => void;
    /** Plis d'un matelas deja coupe (erreur du matelassier) ; rend vrai si sa serie n'a pas pu suivre. */
    onCorrigerPlisCoupe: (id: string, plis: number) => boolean;
    /** Nouveaux numeros des matelas des autres matieres (id de ligne -> numero). */
    onRenumeroter: (changements: Record<string, string>) => void;
}

const fmtN = (n: number) => n.toLocaleString('fr-FR');
const signe = (v: number) => (v > 0 ? `+${v}` : String(v));

const CLS_ETAT: Record<MatelasEquilibre['etat'], string> = {
    a_faire: 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-700 dark:text-dk-text',
    envoye: 'bg-sky-50 dark:bg-sky-900/25 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-200',
    coupe: 'bg-emerald-50 dark:bg-emerald-900/25 border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200',
};

type Filtre = 'tous' | 'acouper' | 'retard' | 'ecart';

export default function SuiviMatieres({
    modele, ordre, tailles, groupes, dernierGroupe, sauvegarde, pastille,
    onRetour, onOuvrirOrdre, onConfirmer, onAnnulerCoupe, onMarquerImprime, onModifierPlis, onCorrigerPlisCoupe, onRenumeroter,
}: Props) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });

    const eq = useMemo(() => equilibrerOrdre(ordre, tailles), [ordre, tailles]);
    /** Les matieres qui ont des matelas : une colonne chacune. */
    const colonnes = useMemo(() => eq.matieres.filter(m => eq.parMatiere[m.id]?.nbMatelas > 0), [eq]);
    const nomMatiere = (id: string) => eq.matieres.find(m => m.id === id)?.nom || id;
    const couleursMultiples = useMemo(() => new Set((ordre.matelasLines || []).map(l => (l.couleur || '').trim()).filter(Boolean)).size > 1, [ordre.matelasLines]);

    const [filtre, setFiltre] = useState<Filtre>('tous');
    const [ouverts, setOuverts] = useState<Set<number>>(new Set());
    const [fiche, setFiche] = useState<string | null>(null);
    /** Numeros des autres matieres qui ne suivent pas l'ordre des lots. */
    const renum = useMemo(() => renumeroterSelonLots(eq), [eq]);
    const nbRenum = Object.keys(renum.changements).length;
    const [confirmerRenum, setConfirmerRenum] = useState(false);
    /**
     * Numeros portes deux fois par le tissu : deux plans dans le meme ordre (un import en
     * lettres par-dessus des matelas en nombres). Les lots melangent alors les deux.
     */
    const doublonsTissu = useMemo(() => {
        const vus = new Map<string, number>();
        for (const x of eq.ordreConseille[eq.matieres.find(m => m.principal)?.id || ''] || []) {
            const n = (x.ligne.numero || '').trim();
            if (n) vus.set(n, (vus.get(n) || 0) + 1);
        }
        return [...vus.entries()].filter(([, c]) => c > 1).map(([n]) => n).sort((a, b) => Number(a) - Number(b));
    }, [eq]);

    const compte = {
        tous: eq.lots.length,
        acouper: eq.lots.filter(l => l.etat !== 'coupe').length,
        retard: eq.lots.filter(l => l.retard.length > 0).length,
        ecart: eq.lots.filter(l => l.manque.length > 0).length,
    };
    const visibles = eq.lots.filter(l =>
        filtre === 'tous' ? true : filtre === 'acouper' ? l.etat !== 'coupe' : filtre === 'retard' ? l.retard.length > 0 : l.manque.length > 0);

    const texteEcart = (e: EcartEquilibre) => `${e.couleur && couleursMultiples ? `${e.couleur} ` : ''}${e.taille} ${signe(e.delta)}`;

    const matelasFiche = useMemo(() => {
        if (!fiche) return null;
        for (const lot of eq.lots) for (const id in lot.matelas) {
            const x = lot.matelas[id].find(m => m.id === fiche);
            if (x) return { x, lot };
        }
        for (const id in eq.enPlus) {
            const x = eq.enPlus[id].find(m => m.id === fiche);
            if (x) return { x, lot: undefined };
        }
        return null;
    }, [fiche, eq]);

    const commande = commandeDe(modele);
    const image = modele.image || modele.images?.front;
    const nom = ordre.refModele || modele.meta_data?.nom_modele || '';
    const client = (modele.ficheData?.client || '').trim();

    return (
        <div className="w-full max-w-3xl mx-auto px-3 py-3 md:p-5 space-y-3 pb-24">
            {/* En-tete : le modele, et d'ou l'on vient */}
            <div className="flex items-center gap-2">
                <button type="button" onClick={onRetour} className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-dk-elevated" aria-label={L('Retour', 'رجوع', 'Back')}>
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 dark:bg-dk-elevated shrink-0 flex items-center justify-center">
                    {image ? <img src={image} alt="" className="w-full h-full object-cover" /> : <Scissors className="w-4 h-4 text-slate-300" />}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-slate-900 dark:text-dk-text truncate">{nom}</p>
                    <p className="text-[11px] text-slate-500 dark:text-dk-muted truncate">{[client, L('Suivi de coupe', 'متابعة القص', 'Cutting follow-up')].filter(Boolean).join(' · ')}</p>
                </div>
                <PuceSauvegarde etat={sauvegarde} />
                <button type="button" onClick={onOuvrirOrdre} className="h-10 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-[12px] font-semibold text-slate-700 dark:text-dk-text-soft hover:border-indigo-300">
                    <PencilLine className="w-4 h-4" />
                    <span className="hidden sm:inline">{L('Ouvrir l’ordre', 'فتح الأمر', 'Open order')}</span>
                </button>
            </div>

            {/* Trois chiffres : commande, coupe, pret pour la production */}
            <div className="grid grid-cols-3 gap-2">
                <Chiffre label={L('Commande', 'الطلب', 'Order')} valeur={fmtN(commande || eq.vetements)} />
                <Chiffre label={L('Tissu coupé', 'الثوب المقصوص', 'Fabric cut')} valeur={fmtN(eq.vetementsCoupes)} sous={eq.vetements ? `/ ${fmtN(eq.vetements)}` : undefined} ton="text-indigo-600 dark:text-indigo-400" />
                <Chiffre
                    label={L('Prêts', 'جاهزة', 'Ready')}
                    valeur={fmtN(eq.prets)}
                    sous={colonnes.length > 1 ? L('toutes matières', 'كل المواد', 'all materials') : undefined}
                    ton="text-emerald-600 dark:text-emerald-400"
                />
            </div>

            {/* Avancement matiere par matiere */}
            <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border divide-y divide-slate-100 dark:divide-dk-border">
                {colonnes.length === 0 && (
                    <p className="px-4 py-6 text-center text-[12px] text-slate-400">{L('Aucun matelas dans cet ordre. Calculez-les depuis l’ordre.', 'لا توجد مفرشات في هذا الأمر. احسبها من صفحة الأمر.', 'No lay in this order yet.')}</p>
                )}
                {colonnes.map(m => {
                    const b = eq.parMatiere[m.id];
                    const part = b.nbMatelas ? b.nbCoupes / b.nbMatelas : 0;
                    const partBleu = b.nbMatelas ? b.nbEnvoyes / b.nbMatelas : 0;
                    const ecarts = eq.ecartsPlan.filter(e => e.matiere === m.id);
                    return (
                        <div key={m.id} className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                                <CodeMatiere m={m} />
                                <span className="text-[13px] font-semibold text-slate-800 dark:text-dk-text truncate flex-1 min-w-0">{m.nom}</span>
                                <span className="text-[12px] font-bold tabular-nums text-slate-700 dark:text-dk-text-soft shrink-0">{b.nbCoupes}/{b.nbMatelas}</span>
                            </div>
                            <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-dk-elevated overflow-hidden flex">
                                <div className="h-full bg-emerald-500" style={{ width: `${Math.round(part * 100)}%` }} />
                                <div className="h-full bg-sky-400" style={{ width: `${Math.round(partBleu * 100)}%` }} />
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-dk-muted tabular-nums">
                                <span>{fmtN(b.piecesCoupees)} / {fmtN(b.pieces)} {L('pcs', 'قطعة', 'pcs')}</span>
                                {b.nbEnvoyes > 0 && <span className="text-sky-700 dark:text-sky-300 font-semibold">{b.nbEnvoyes} {L('tracé(s) imprimé(s)', 'ملف مطبوع', 'printed')}</span>}
                            </div>
                            {ecarts.length > 0 && (
                                <EcartPlan eq={eq} m={m} ecarts={ecarts} texteEcart={texteEcart} onAppliquer={onModifierPlis} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Le tissu porte deux fois les memes numeros : l'ordre de coupe n'est plus lisible */}
            {doublonsTissu.length > 0 && (
                <div className="px-3 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 space-y-2">
                    <p className="flex items-start gap-1.5 text-[12px] font-semibold text-rose-800 dark:text-rose-200">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                        <span>
                            {L(`Le tissu porte deux fois les numéros ${doublonsTissu.slice(0, 6).join(', ')}${doublonsTissu.length > 6 ? '…' : ''} (${doublonsTissu.length}) : deux plans de matelas dans le même ordre. Les lots les mélangent. Renumérotez le tissu dans l\u2019ordre (ou retirez le plan en trop).`,
                                `الثوب يحمل الأرقام ${doublonsTissu.slice(0, 6).join('، ')}${doublonsTissu.length > 6 ? '…' : ''} مرتين (${doublonsTissu.length}): خطتا مفرشات في نفس الأمر، والدفعات تخلط بينهما. أعد ترقيم الثوب من صفحة الأمر (أو احذف الخطة الزائدة).`,
                                `The fabric carries numbers ${doublonsTissu.slice(0, 6).join(', ')} twice (${doublonsTissu.length}): two lay plans in one order. Renumber the fabric in the order page.`)}
                        </span>
                    </p>
                    <button type="button" onClick={onOuvrirOrdre} className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 dark:border-rose-700 bg-white dark:bg-dk-surface text-[12px] font-bold text-rose-700 dark:text-rose-300">
                        <PencilLine className="w-4 h-4" />{L('Ouvrir l\u2019ordre', 'فتح الأمر', 'Open order')}
                    </button>
                </div>
            )}

            {/* Numeros des autres matieres dans le desordre : couper par numero ne suivrait pas le tissu */}
            {nbRenum > 0 && (
                <div className="px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 space-y-2">
                    <p className="flex items-start gap-1.5 text-[12px] font-semibold text-amber-900 dark:text-amber-200">
                        <ListOrdered className="w-4 h-4 shrink-0 mt-px" />
                        <span>
                            {L('Les numéros de', 'أرقام', 'The numbers of')} {Object.keys(renum.parMatiere).map(nomMatiere).join(', ')} {L(
                                'ne suivent pas l\u2019ordre du tissu : un lot appelle des numéros éloignés. En salle, couper par numéro retarderait la chaîne.',
                                'لا تتبع ترتيب الثوب: الدفعة الواحدة تطلب أرقاماً متباعدة. في القاعة، القص بالترتيب الرقمي سيؤخّر السلسلة.',
                                'do not follow the fabric order: one lot calls far-apart numbers. Cutting by number would hold the line.')}
                        </span>
                    </p>
                    <button type="button" onClick={() => setConfirmerRenum(true)} className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 text-white text-[12px] font-bold hover:bg-amber-700">
                        <ListOrdered className="w-4 h-4" />{L('Numéroter dans l\u2019ordre du tissu', 'ترقيم حسب ترتيب الثوب', 'Number in fabric order')}
                    </button>
                </div>
            )}
            {confirmerRenum && (
                <SheetModal
                    onClose={() => setConfirmerRenum(false)}
                    size="sm"
                    zClass="z-[95]"
                    title={L('Numéroter dans l\u2019ordre du tissu', 'ترقيم حسب ترتيب الثوب', 'Number in fabric order')}
                    bodyClassName="flex-1 overflow-y-auto min-h-0 p-4 space-y-3"
                >
                    <p className="text-[13px] text-slate-700 dark:text-dk-text-soft">
                        {L('Chaque lot aura des numéros qui se suivent : 1, 2, 3 pour le lot 1, puis le lot 2… Couper par numéro suivra alors le tissu.',
                            'ستأخذ كل دفعة أرقاماً متتالية: 1، 2، 3 للدفعة الأولى، ثم الثانية… فيصير القص بالترتيب الرقمي تابعاً للثوب.',
                            'Each lot gets consecutive numbers: 1, 2, 3 for lot 1, then lot 2… Cutting by number then follows the fabric.')}
                    </p>
                    <ul className="space-y-1">
                        {Object.entries(renum.parMatiere).map(([id, nb]) => (
                            <li key={id} className="flex items-center justify-between gap-2 px-2.5 h-9 rounded-lg bg-slate-100 dark:bg-dk-elevated text-[12px]">
                                <span className="font-semibold text-slate-800 dark:text-dk-text">{nomMatiere(id)}</span>
                                <span className="tabular-nums text-slate-600 dark:text-dk-text-soft">{nb} {L('matelas renumérotés', 'مفرشة يتغيّر رقمها', 'lays renumbered')}</span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-[11px] text-slate-500 dark:text-dk-muted">
                        {L('Le tissu ne change pas.', 'الثوب لا يتغيّر.', 'The fabric does not change.')}{' '}
                        {renum.gardes > 0 && L(`${renum.gardes} matelas coupés ou au tracé imprimé gardent leur numéro (déjà écrit sur les pièces ou le papier).`,
                            `${renum.gardes} مفرشة مقصوصة أو ملفها مطبوع تحتفظ برقمها (مكتوب على القطع أو الورق).`,
                            `${renum.gardes} cut or printed lays keep their number.`)}
                    </p>
                    <div className="flex justify-end gap-2 pt-1">
                        <button type="button" onClick={() => setConfirmerRenum(false)} className="h-10 px-4 rounded-lg border border-slate-200 dark:border-dk-border text-[12px] font-semibold text-slate-600 dark:text-dk-text-soft">{L('Annuler', 'إلغاء', 'Cancel')}</button>
                        <button type="button" onClick={() => { onRenumeroter(renum.changements); setConfirmerRenum(false); }} className="h-10 px-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-dk-accent text-white text-[12px] font-bold">
                            <Check className="w-4 h-4" />{L('Renuméroter', 'إعادة الترقيم', 'Renumber')}
                        </button>
                    </div>
                </SheetModal>
            )}

            {/* Ce que la couture peut coudre : un vetement n'est pret que si toutes ses matieres sont coupees */}
            {colonnes.length > 1 && eq.parTaille.length > 0 && (
                <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden">
                    <div className="px-3 pt-2.5 pb-1.5">
                        <p className="text-[13px] font-bold text-slate-900 dark:text-dk-text">{L('Prêt pour la chaîne', 'جاهز للسلسلة', 'Ready for the line')}</p>
                        <p className="text-[11px] text-slate-500 dark:text-dk-muted">{L('Par taille : seulement ce qui est coupé dans toutes les matières.', 'لكل مقاس: فقط ما قُصّ في كل المواد.', 'Per size: only what is cut in every material.')}</p>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-dk-border">
                        {eq.parTaille.map(t => {
                            const part = t.prevu ? Math.min(1, t.prets / t.prevu) : 0;
                            const tissuCoupe = t.coupe[colonnes[0]?.id] ?? 0;
                            const partTissu = t.prevu ? Math.min(1, tissuCoupe / t.prevu) : 0;
                            return (
                                <div key={t.cle} className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                        <span className="min-w-10 px-1.5 h-6 inline-flex items-center justify-center gap-1 rounded-md bg-slate-100 dark:bg-dk-elevated text-[12px] font-bold uppercase text-slate-700 dark:text-dk-text-soft">
                                            {couleursMultiples && t.couleur && <Pastille couleur={t.couleur} pastille={pastille} />}
                                            {t.taille}
                                        </span>
                                        {couleursMultiples && t.couleur && <span className="text-[11px] text-slate-500 dark:text-dk-muted truncate">{t.couleur}</span>}
                                        <span className="flex-1" />
                                        <span className="text-[12px] tabular-nums shrink-0">
                                            <b className="text-emerald-600 dark:text-emerald-400">{fmtN(t.prets)}</b>
                                            <span className="text-slate-400"> / {fmtN(t.prevu)}</span>
                                        </span>
                                    </div>
                                    <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-dk-elevated overflow-hidden relative">
                                        <div className="absolute inset-y-0 left-0 bg-slate-300 dark:bg-slate-600" style={{ width: `${Math.round(partTissu * 100)}%` }} />
                                        <div className="absolute inset-y-0 left-0 bg-emerald-500" style={{ width: `${Math.round(part * 100)}%` }} />
                                    </div>
                                    {t.limite.length > 0 && (
                                        <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-start gap-1">
                                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                                            <span>
                                                {L('Retenu par', 'محجوز بسبب', 'Held by')} {t.limite.map(id => nomMatiere(id)).join(', ')}
                                                <span className="font-normal text-slate-500 dark:text-dk-muted"> · {colonnes.filter(m => t.coupe[m.id] !== undefined).map(m => `${m.code} ${fmtN(t.coupe[m.id])}`).join(' · ')}</span>
                                            </span>
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {eq.lots.length > 0 && (
                <>
                    {/* Legende et filtre */}
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-dk-muted px-1">
                        <Legende cls="bg-white border-slate-300" label={L('À faire', 'للإنجاز', 'To do')} />
                        <Legende cls="bg-sky-100 border-sky-400" label={L('Tracé imprimé', 'الملف مطبوع', 'Printed')} />
                        <Legende cls="bg-emerald-100 border-emerald-400" label={L('Coupé', 'مقصوص', 'Cut')} />
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
                        {([
                            ['tous', L('Tous', 'الكل', 'All')],
                            ['acouper', L('À couper', 'للقص', 'To cut')],
                            ['retard', L('En retard', 'متأخرة', 'Late')],
                            ['ecart', L('Écart', 'فارق', 'Gap')],
                        ] as [Filtre, string][]).map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => setFiltre(id)}
                                className={`h-9 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${filtre === id
                                    ? 'bg-slate-900 dark:bg-dk-accent border-slate-900 dark:border-dk-accent text-white'
                                    : 'bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft'}`}
                            >
                                {label}
                                <span className={`text-[10px] font-bold tabular-nums ${filtre === id ? 'text-white/70' : (id === 'retard' && compte.retard) || (id === 'ecart' && compte.ecart) ? 'text-rose-600' : 'text-slate-400'}`}>{compte[id]}</span>
                            </button>
                        ))}
                    </div>

                    {visibles.length === 0 && (
                        <p className="py-8 text-center text-[12px] text-slate-400">{L('Rien ici.', 'لا شيء هنا.', 'Nothing here.')}</p>
                    )}

                    {visibles.map(lot => (
                        <CarteLot
                            key={lot.rang}
                            lot={lot}
                            colonnes={colonnes}
                            couleursMultiples={couleursMultiples}
                            pastille={pastille}
                            replie={lot.etat === 'coupe' && lot.manque.length === 0 && !ouverts.has(lot.rang)}
                            onBasculer={() => setOuverts(prev => { const n = new Set(prev); if (n.has(lot.rang)) n.delete(lot.rang); else n.add(lot.rang); return n; })}
                            onToucher={id => setFiche(id)}
                            nomMatiere={nomMatiere}
                            texteEcart={texteEcart}
                        />
                    ))}

                    {/* Matelas d'autres matieres dont aucun tissu n'a besoin : coupes en trop si on les coupe */}
                    {Object.keys(eq.enPlus).length > 0 && (filtre === 'tous' || filtre === 'ecart') && (
                        <div className="bg-white dark:bg-dk-surface rounded-xl border border-amber-300 dark:border-amber-800 px-3 py-2.5 space-y-2">
                            <p className="text-[12px] font-semibold text-amber-800 dark:text-amber-200 flex items-start gap-1.5">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                                {L('Matelas en plus : aucun matelas de tissu n’en a besoin', 'مفرشات زائدة: لا تحتاجها أي مفرشة ثوب', 'Extra lays: no fabric lay needs them')}
                            </p>
                            {colonnes.filter(m => eq.enPlus[m.id]?.length).map(m => (
                                <div key={m.id}>
                                    <div className="flex items-center gap-1 mb-1"><CodeMatiere m={m} /><span className="text-[10px] font-semibold text-slate-400 truncate">{m.nom}</span></div>
                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                                        {eq.enPlus[m.id].map(x => <PuceMatelas key={x.id} x={x} couleursMultiples={couleursMultiples} pastille={pastille} onToucher={() => setFiche(x.id)} />)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Total, comme le bas de la feuille de l'atelier */}
                    <div className="rounded-xl border-2 border-slate-300 dark:border-dk-border px-3 py-2.5 flex items-center justify-between gap-3 text-[12px]">
                        <span className="font-bold uppercase tracking-wide text-slate-600 dark:text-dk-text-soft">{L('Total', 'المجموع', 'Total')} · {eq.lots.length} {L('lots', 'دفعات', 'lots')}</span>
                        <span className="tabular-nums text-right">
                            <b className="text-[15px] text-slate-900 dark:text-dk-text">{fmtN(eq.vetements)}</b>
                            <span className="text-slate-500"> {L('vêt.', 'قطعة', 'pcs')} · </span>
                            <b className="text-emerald-600 dark:text-emerald-400">{fmtN(eq.prets)}</b>
                            <span className="text-slate-500"> {L('prêts', 'جاهزة', 'ready')}</span>
                        </span>
                    </div>
                </>
            )}

            {matelasFiche && (
                <FicheMatelas
                    key={matelasFiche.x.id}
                    x={matelasFiche.x}
                    lot={matelasFiche.lot}
                    matiere={eq.matieres.find(m => m.id === matelasFiche.x.matiere)!}
                    tailles={tailles}
                    groupes={groupes}
                    dernierGroupe={dernierGroupe}
                    pastille={pastille}
                    nomMatiere={nomMatiere}
                    onFermer={() => setFiche(null)}
                    onConfirmer={c => { onConfirmer(matelasFiche.x.id, c); setFiche(null); }}
                    onAnnulerCoupe={() => { onAnnulerCoupe(matelasFiche.x.id); setFiche(null); }}
                    onMarquerImprime={v => { onMarquerImprime(matelasFiche.x.id, v); setFiche(null); }}
                    onModifierPlis={p => { onModifierPlis(matelasFiche.x.id, p); setFiche(null); }}
                    onCorrigerPlisCoupe={p => onCorrigerPlisCoupe(matelasFiche.x.id, p)}
                />
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Morceaux                                                             */
/* ------------------------------------------------------------------ */

function PuceSauvegarde({ etat }: { etat: EtatSauvegarde }) {
    const { lang } = useLang();
    if (etat === 'repos') return null;
    if (etat === 'encours') return <Loader2 className="w-4 h-4 text-slate-400 animate-spin shrink-0" aria-label={tx(lang, { fr: 'Enregistrement…', ar: 'جارٍ الحفظ…', en: 'Saving…' })} />;
    if (etat === 'erreur') return <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0"><title>{tx(lang, { fr: 'Non enregistré', ar: 'لم يُحفظ', en: 'Not saved' })}</title></AlertTriangle>;
    return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0"><title>{tx(lang, { fr: 'Enregistré', ar: 'محفوظ', en: 'Saved' })}</title></CheckCircle2>;
}

function Chiffre({ label, valeur, sous, ton }: { label: string; valeur: string; sous?: string; ton?: string }) {
    return (
        <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border px-2.5 py-2 min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted truncate">{label}</p>
            <p className={`text-[17px] font-bold tabular-nums leading-tight truncate ${ton || 'text-slate-900 dark:text-dk-text'}`}>{valeur}</p>
            {sous && <p className="text-[10px] text-slate-400 tabular-nums truncate">{sous}</p>}
        </div>
    );
}

function Legende({ cls, label }: { cls: string; label: string }) {
    return <span className="inline-flex items-center gap-1"><span className={`w-3 h-3 rounded border ${cls}`} />{label}</span>;
}

function CodeMatiere({ m }: { m: MatiereEquilibre }) {
    return (
        <span className={`shrink-0 px-1.5 h-5 inline-flex items-center rounded text-[10px] font-bold ${m.principal ? 'bg-slate-900 text-white dark:bg-dk-accent' : 'bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft'}`}>{m.code}</span>
    );
}

function Pastille({ couleur, pastille }: { couleur?: string; pastille: Props['pastille'] }) {
    if (!couleur) return null;
    const p = pastille(couleur);
    return <span className={`w-2 h-2 rounded-full shrink-0 ${p.dotClass}`} style={p.hex ? { backgroundColor: p.hex } : undefined} />;
}

/** Un matelas : numero, placement, plis, pieces ; sa couleur dit ou il en est. */
function PuceMatelas({ x, couleursMultiples, pastille, onToucher }: { x: MatelasEquilibre; couleursMultiples: boolean; pastille: Props['pastille']; onToucher: () => void }) {
    const { lang } = useLang();
    return (
        <button
            type="button"
            onClick={onToucher}
            className={`w-full min-h-[48px] px-2 py-1.5 rounded-lg border text-left active:scale-[0.98] transition-transform ${CLS_ETAT[x.etat]}`}
        >
            <span className="flex items-center gap-1 min-w-0">
                <b className="text-[15px] tabular-nums leading-none">{x.numero}</b>
                <span className="text-[11px] font-bold uppercase truncate">{x.nom}</span>
                <span className="flex-1" />
                {x.etat === 'coupe' ? <Check className="w-3.5 h-3.5 shrink-0" strokeWidth={3} /> : x.etat === 'envoye' ? <Printer className="w-3.5 h-3.5 shrink-0" /> : null}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-[10px] tabular-nums opacity-80">
                {couleursMultiples && <Pastille couleur={x.couleur} pastille={pastille} />}
                <span>{x.plis} {tx(lang, { fr: 'plis', ar: 'طيّة', en: 'plies' })}</span>
                <span className="ml-auto font-semibold">{fmtN(x.total)}</span>
            </span>
            {x.serie && (
                <span className="mt-0.5 block text-[10px] font-semibold tabular-nums opacity-70 truncate" title={tx(lang, { fr: 'Série : numéros des pièces de ce matelas', ar: 'السيري: أرقام قطع هذه المفرشة', en: 'Series: piece numbers of this lay' })}>
                    {tx(lang, { fr: 'Série', ar: 'سيري', en: 'Series' })} {x.serie.debut}–{x.serie.fin}
                </span>
            )}
        </button>
    );
}

/**
 * Une matiere qui ne coupe pas les memes pieces que le tissu sur l'ordre
 * entier (un matelassier a mis 80 plis au lieu de 82) : l'ecart, et le
 * changement de plis qui le rattrape quand il existe.
 */
function EcartPlan({ eq, m, ecarts, texteEcart, onAppliquer }: {
    eq: EquilibreOrdre;
    m: MatiereEquilibre;
    ecarts: EcartEquilibre[];
    texteEcart: (e: EcartEquilibre) => string;
    onAppliquer: (id: string, plis: number) => void;
}) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    const aj = proposerAjustement(eq, m.id);
    return (
        <div className="mt-1.5 px-2.5 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-[12px] text-amber-800 dark:text-amber-200">
            <p className="font-semibold flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                <span>{L('Face au tissu :', 'مقابل الثوب:', 'Vs fabric:')} {ecarts.map(texteEcart).join(' · ')}</span>
            </p>
            {aj && (
                <div className="mt-1.5 flex items-center gap-2">
                    <span className="flex-1 min-w-0">
                        {L('Proposé :', 'المقترح:', 'Suggested:')} <b>{m.code} {aj.numero}</b> {aj.nom} · <b className="tabular-nums">{aj.plisAvant} → {aj.plisApres}</b> {L('plis', 'طيّة', 'plies')}
                        {aj.reste.length > 0 && <span className="block text-[11px] opacity-80">{L('il resterait', 'سيبقى', 'would leave')} {aj.reste.map(texteEcart).join(' · ')}</span>}
                    </span>
                    <button type="button" onClick={() => onAppliquer(aj.ligneId, aj.plisApres)} className="h-10 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 text-white text-[12px] font-bold hover:bg-amber-700">
                        <Wand2 className="w-3.5 h-3.5" />{L('Appliquer', 'تطبيق', 'Apply')}
                    </button>
                </div>
            )}
        </div>
    );
}

function CarteLot({
    lot, colonnes, couleursMultiples, pastille, replie, onBasculer, onToucher, nomMatiere, texteEcart,
}: {
    lot: LotEquilibre;
    colonnes: MatiereEquilibre[];
    couleursMultiples: boolean;
    pastille: Props['pastille'];
    replie: boolean;
    onBasculer: () => void;
    onToucher: (id: string) => void;
    nomMatiere: (id: string) => string;
    texteEcart: (e: EcartEquilibre) => string;
}) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    const pill = lot.etat === 'coupe'
        ? { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', label: L('Coupé', 'مقصوص', 'Cut') }
        : lot.etat === 'en_cours'
            ? { cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300', label: L('En cours', 'جارٍ', 'In progress') }
            : { cls: 'bg-slate-100 text-slate-600 dark:bg-dk-elevated dark:text-dk-text-soft', label: L('À faire', 'للإنجاز', 'To do') };
    const alerte = lot.retard.length > 0;
    const bordure = alerte ? 'border-rose-300 dark:border-rose-800' : lot.manque.length ? 'border-amber-300 dark:border-amber-800' : 'border-slate-200 dark:border-dk-border';

    return (
        <div className={`bg-white dark:bg-dk-surface rounded-xl border ${bordure} overflow-hidden`}>
            <button type="button" onClick={onBasculer} className="w-full flex items-center gap-2 px-3 h-11 text-left">
                {replie ? <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                <span className="text-[13px] font-bold text-slate-900 dark:text-dk-text">{L('Lot', 'دفعة', 'Lot')} {lot.rang}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${pill.cls}`}>{pill.label}</span>
                {alerte && <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
                <span className="flex-1" />
                <span className="text-[12px] tabular-nums text-slate-500 dark:text-dk-muted shrink-0">
                    {colonnes.length > 1 && lot.vetements > 0 && <><b className="text-emerald-600 dark:text-emerald-400">{fmtN(lot.prets)}</b> / </>}
                    <b className="text-slate-800 dark:text-dk-text">{fmtN(lot.vetements)}</b>
                </span>
            </button>

            {!replie && (
                <div className="px-3 pb-3 space-y-2">
                    {alerte && (
                        <div className="px-2.5 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-[12px] font-semibold text-rose-700 dark:text-rose-300 flex items-start gap-1.5">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                            <span className="min-w-0">
                                {L('Tissu coupé, il manque encore :', 'الثوب مقصوص، وما زال ينقص:', 'Fabric cut, still missing:')}
                                {lot.retard.map(id => (
                                    <span key={id} className="block">
                                        {nomMatiere(id)}
                                        {lot.attente[id].numeros.length > 0 && <> · N° {lot.attente[id].numeros.join(', ')}</>}
                                        {lot.attente[id].autres.length > 0 && (
                                            <span className="font-normal"> · {L('en face d\u2019un autre lot :', 'مقابل دفعة أخرى:', 'opposite another lot:')} N° {lot.attente[id].autres.slice(0, 4).join(', ')}{lot.attente[id].autres.length > 4 ? ` +${lot.attente[id].autres.length - 4}` : ''}</span>
                                        )}
                                    </span>
                                ))}
                                <span className="block font-normal text-rose-600/80 dark:text-rose-300/80">{L('Ne lancez pas ce lot en production avant.', 'لا تُطلق هذه الدفعة للإنتاج قبل ذلك.', 'Do not release this lot before.')}</span>
                            </span>
                        </div>
                    )}

                    {/* Une colonne par matiere : ce qui se coupe ensemble, face a face */}
                    <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
                        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${colonnes.length}, minmax(${colonnes.length > 3 ? 96 : 0}px, 1fr))` }}>
                            {colonnes.map(m => (
                                <div key={m.id} className="min-w-0">
                                    <div className="flex items-center gap-1 mb-1 min-w-0">
                                        <CodeMatiere m={m} />
                                        <span className="text-[10px] font-semibold text-slate-400 dark:text-dk-muted truncate">{m.nom}</span>
                                    </div>
                                    <div className="space-y-1">
                                        {(lot.matelas[m.id] || []).length === 0 && (
                                            <p className="min-h-[48px] px-1 flex items-center justify-center text-center rounded-lg border border-dashed border-slate-200 dark:border-dk-border text-slate-400 text-[10px] leading-tight">
                                                {m.principal ? '—'
                                                    // Plus aucun matelas de cette matiere dans l'ordre : ce n'est pas couvert, ca manque.
                                                    : lot.manque.some(e => e.matiere === m.id)
                                                        ? <span className="font-semibold text-amber-700 dark:text-amber-300">{L('aucun matelas prévu : à ajouter', 'لا مفرشة مبرمجة: يجب إضافتها', 'no lay planned: add one')}</span>
                                                        : L('couvert plus haut', 'مغطّى في الأعلى', 'covered above')}
                                            </p>
                                        )}
                                        {(lot.matelas[m.id] || []).map(x => (
                                            <PuceMatelas key={x.id} x={x} couleursMultiples={couleursMultiples} pastille={pastille} onToucher={() => onToucher(x.id)} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Pieces du lot qu'aucun matelas d'une autre matiere ne couvre */}
                    {colonnes.filter(m => lot.manque.some(e => e.matiere === m.id)).map(m => (
                        <p key={m.id} className="px-2.5 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-[12px] font-semibold text-amber-800 dark:text-amber-200 flex items-start gap-1.5">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                            <span>{m.nom} {L('ne couvre pas :', 'لا تغطّي:', 'does not cover:')} {lot.manque.filter(e => e.matiere === m.id).map(texteEcart).join(' · ')}</span>
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Fiche d'un matelas                                                   */
/* ------------------------------------------------------------------ */

function FicheMatelas({
    x, lot, matiere, tailles, groupes, dernierGroupe, pastille, nomMatiere,
    onFermer, onConfirmer, onAnnulerCoupe, onMarquerImprime, onModifierPlis, onCorrigerPlisCoupe,
}: {
    x: MatelasEquilibre;
    lot?: LotEquilibre;
    matiere: MatiereEquilibre;
    tailles: string[];
    groupes: GroupeCoupe[];
    dernierGroupe?: string;
    pastille: Props['pastille'];
    nomMatiere: (id: string) => string;
    onFermer: () => void;
    onConfirmer: (c: { plis: number; creerReste: boolean; groupe?: string }) => void;
    onAnnulerCoupe: () => void;
    onMarquerImprime: (v: boolean) => void;
    onModifierPlis: (plis: number) => void;
    onCorrigerPlisCoupe: (plis: number) => boolean;
}) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    const [plis, setPlis] = useState<number | ''>(x.plis);
    const [creerReste, setCreerReste] = useState(true);
    const [groupe, setGroupe] = useState<string | undefined>(x.ligne.groupe || dernierGroupe);
    const [sur, setSur] = useState(false);
    const [conflit, setConflit] = useState(false);
    useEffect(() => { setPlis(x.plis); setConflit(false); }, [x.plis]);

    const n = typeof plis === 'number' ? plis : 0;
    const change = n > 0 && n !== x.plis;
    const coupe = x.etat === 'coupe';
    const ratioTaille = (t: string) => Math.max(0, Math.floor(Number(x.ligne.ratios?.[t]) || 0));
    const taillesLigne = [...tailles, ...Object.keys(x.ligne.ratios || {}).filter(t => !tailles.includes(t))].filter(t => ratioTaille(t) > 0);
    const autres = lot ? Object.keys(lot.matelas).filter(id => id !== x.matiere && lot.matelas[id].length > 0) : [];
    const pas = (d: number) => setPlis(p => Math.max(1, (typeof p === 'number' ? p : x.plis) + d));

    return (
        <SheetModal
            onClose={onFermer}
            size="sm"
            zClass="z-[95]"
            title={<span className="flex items-center gap-2"><CodeMatiere m={matiere} />{matiere.nom} · N° {x.numero}</span>}
            subtitle={<span className="inline-flex items-center gap-1.5"><b className="uppercase">{x.nom}</b>{x.couleur && <><Pastille couleur={x.couleur} pastille={pastille} />{x.couleur}</>}</span>}
            bodyClassName="flex-1 overflow-y-auto min-h-0 p-4 space-y-4"
        >
            {/* Les pieces, taille par taille */}
            <div className="flex flex-wrap gap-1.5">
                {taillesLigne.map(t => (
                    <span key={t} className="px-2 h-7 inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-dk-elevated text-[12px] font-bold uppercase text-slate-700 dark:text-dk-text-soft">
                        {t}<span className="font-semibold tabular-nums text-slate-500">{ratioTaille(t) * n}</span>
                    </span>
                ))}
                <span className="px-2 h-7 inline-flex items-center rounded-lg bg-slate-900 dark:bg-dk-accent text-white text-[12px] font-bold tabular-nums">
                    {fmtN(taillesLigne.reduce((s, t) => s + ratioTaille(t) * n, 0))} {L('pcs', 'قطعة', 'pcs')}
                </span>
            </div>

            {/* La serie : de quel numero a quel numero, paquet par paquet (comme la feuille SERIE) */}
            {x.serie && (
                <div className="rounded-xl border border-slate-200 dark:border-dk-border p-2.5">
                    <p className="flex items-baseline justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                        {L('Série', 'السيري', 'Series')}
                        <span className="text-[15px] normal-case tracking-normal tabular-nums text-slate-800 dark:text-dk-text">{x.serie.debut} → {x.serie.fin}</span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {x.serie.paquets.map((q, i) => (
                            <span key={i} className="px-1.5 h-6 inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-dk-elevated text-[11px] tabular-nums text-slate-600 dark:text-dk-text-soft">
                                <b className="uppercase text-slate-800 dark:text-dk-text">{q.taille}</b>{q.debut}–{q.fin}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Ou il en est */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-dk-elevated text-[11px] font-bold text-center">
                {([
                    ['a_faire', L('À faire', 'للإنجاز', 'To do'), 'bg-white text-slate-800 dark:bg-dk-surface dark:text-dk-text'],
                    ['envoye', L('Tracé imprimé', 'الملف مطبوع', 'Printed'), 'bg-sky-500 text-white'],
                    ['coupe', L('Coupé', 'مقصوص', 'Cut'), 'bg-emerald-500 text-white'],
                ] as const).map(([id, label, actif]) => (
                    <span key={id} className={`h-8 inline-flex items-center justify-center rounded-lg ${x.etat === id ? actif : 'text-slate-400'}`}>{label}</span>
                ))}
            </div>
            {coupe && (x.ligne.fin || x.ligne.groupe) && (
                <p className="text-[12px] text-emerald-700 dark:text-emerald-300 -mt-2">
                    {L('Coupé', 'قُصّ', 'Cut')}{x.ligne.fin ? ` ${L('à', 'على', 'at')} ${heureLocale(x.ligne.fin)}` : ''}{x.ligne.groupe ? ` · ${groupes.find(g => g.id === x.ligne.groupe)?.nom || ''}` : ''}
                </p>
            )}

            {/* Les plis : ce que le matelassier a vraiment etale */}
            <div>
                <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted mb-1">
                    {coupe ? L('Plis réellement coupés', 'الطيّات المقصوصة فعلاً', 'Plies actually cut') : L('Plis', 'الطيّات', 'Plies')}
                    {!coupe && <span className="normal-case font-semibold"> · {L('prévus', 'المقرّر', 'planned')} {x.plis}</span>}
                </span>
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => pas(-1)} className="h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-dk-border text-slate-600 active:bg-slate-100" aria-label="-1"><Minus className="w-5 h-5" /></button>
                    <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={plis}
                        onChange={e => setPlis(e.target.value === '' ? '' : Math.max(0, Math.round(Number(e.target.value))))}
                        placeholder={String(x.plis)}
                        className="flex-1 min-w-0 h-12 px-3 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg text-center text-[20px] font-bold tabular-nums outline-none focus:border-indigo-400"
                    />
                    <button type="button" onClick={() => pas(1)} className="h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-dk-border text-slate-600 active:bg-slate-100" aria-label="+1"><Plus className="w-5 h-5" /></button>
                </div>
                {!coupe && n > 0 && n < x.plis && (
                    <label className="mt-2 flex items-start gap-2 text-[12px] text-amber-800 dark:text-amber-300">
                        <input type="checkbox" checked={creerReste} onChange={e => setCreerReste(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-600" />
                        <span>{L(`Créer un matelas pour les ${x.plis - n} plis restants`, `إنشاء مفرشة لـ ${x.plis - n} طيّة الباقية`, `Create a lay for the ${x.plis - n} remaining plies`)}</span>
                    </label>
                )}
                {change && autres.length > 0 && (
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-dk-muted">
                        {L('Les matelas en face', 'المفرشات المقابلة', 'The lays opposite')} ({autres.map(nomMatiere).join(', ')}) {L('afficheront l’écart en haut de la page : « Appliquer » remet leurs plis au même nombre de pièces.', 'ستُظهر الفارق أعلى الصفحة: «تطبيق» يعيد طيّاتها إلى نفس عدد القطع.', 'will show the gap at the top: "Apply" brings their plies back in line.')}
                    </p>
                )}
                {conflit && (
                    <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">{L('Plis corrigés. Les étiquettes suivantes sont déjà prises : notez la différence en « pièces (+/-) » dans la série.', 'صُحّحت الطيّات. الأرقام التالية محجوزة: سجّل الفارق في خانة «القطع (+/-)» في السلسلة.', 'Plies fixed. Next labels are taken: note the difference in the series.')}</p>
                )}
            </div>

            {!coupe && groupes.length > 0 && (
                <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted mb-1">{L('Groupe qui coupe', 'الفريق الذي يقصّ', 'Cutting group')}</span>
                    <ChoixGroupe groupes={groupes} value={groupe} onChange={setGroupe} />
                </div>
            )}

            {/* Les gestes */}
            <div className="space-y-2 pt-1">
                {!coupe ? (
                    <>
                        <button
                            type="button"
                            disabled={n <= 0}
                            onClick={() => onConfirmer({ plis: n, creerReste: n < x.plis && creerReste, groupe })}
                            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white text-[14px] font-bold hover:bg-emerald-700 disabled:opacity-40"
                        >
                            <Check className="w-5 h-5" strokeWidth={3} />
                            {L(`Confirmer coupé · ${n} plis`, `تأكيد القص · ${n} طيّة`, `Confirm cut · ${n} plies`)}
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => onMarquerImprime(x.etat !== 'envoye')}
                                className={`h-11 inline-flex items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold border ${x.etat === 'envoye'
                                    ? 'border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft'
                                    : 'border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-900/25 dark:border-sky-700 dark:text-sky-200'}`}
                            >
                                <Printer className="w-4 h-4" />
                                {x.etat === 'envoye' ? L('Pas imprimé', 'غير مطبوع', 'Not printed') : L('Tracé imprimé', 'الملف مطبوع', 'Printed')}
                            </button>
                            <button
                                type="button"
                                disabled={!change}
                                onClick={() => onModifierPlis(n)}
                                className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl text-[12px] font-bold border border-slate-200 dark:border-dk-border text-slate-700 dark:text-dk-text-soft disabled:opacity-40"
                                title={L('Change les plis prévus sans confirmer la coupe', 'يغيّر الطيّات المقرّرة دون تأكيد القص', 'Change planned plies without confirming')}
                            >
                                <PencilLine className="w-4 h-4" />{L('Changer les plis', 'تغيير الطيّات', 'Change plies')}
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            disabled={!change}
                            onClick={() => { const c = onCorrigerPlisCoupe(n); setConflit(c); if (!c) onFermer(); }}
                            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-dk-accent text-white text-[14px] font-bold disabled:opacity-40"
                        >
                            <PencilLine className="w-4 h-4" />{L(`Corriger à ${n} plis`, `تصحيح إلى ${n} طيّة`, `Fix to ${n} plies`)}
                        </button>
                        {!sur ? (
                            <button type="button" onClick={() => setSur(true)} className="w-full h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 text-[12px] font-bold">
                                <Undo2 className="w-4 h-4" />{L('Annuler la coupe', 'إلغاء القص', 'Undo cut')}
                            </button>
                        ) : (
                            <button type="button" onClick={onAnnulerCoupe} className="w-full h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 text-white text-[12px] font-bold">
                                <Undo2 className="w-4 h-4" />{L('Oui, il n’est pas coupé', 'نعم، لم يُقصّ', 'Yes, not cut')}
                            </button>
                        )}
                    </>
                )}
            </div>
        </SheetModal>
    );
}
