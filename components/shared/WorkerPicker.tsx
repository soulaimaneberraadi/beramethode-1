import React from 'react';
import { Loader2, RefreshCw, AlertTriangle, UserCheck, Search } from 'lucide-react';
import type { HRWorker } from '../../types';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';

export type WorkersStatus = 'loading' | 'ready' | 'error';

interface Props {
    /** Effectifs selectionnables (non affectes ailleurs), deja filtres par la recherche. */
    available: HRWorker[];
    /** Effectifs qui matchent la recherche mais sont deja affectes a un autre poste. */
    assigned: HRWorker[];
    /** Nombre total d'effectifs charges (avant recherche et avant exclusion des affectes). */
    total: number;
    /** Texte tape dans le champ "Opé" — sert au message "aucun résultat pour ...". */
    query: string;
    status: WorkersStatus;
    error?: string | null;
    onRetry: () => void;
    onPick: (worker: HRWorker) => void;
}

/**
 * Liste deroulante des effectifs sous le champ "Opé" (Chronometrage).
 *
 * POURQUOI ce composant : le menu etait duplique a l'identique dans deux
 * endroits de `Chronometrage.tsx` et n'avait qu'un seul etat visible — une
 * liste vide s'affichait indefiniment comme "Chargement des effectifs...",
 * meme quand l'appel avait echoue (403 sans droit Gestion RH, hors ligne) ou
 * quand tous les ouvriers etaient deja affectes ailleurs. Ici chaque cas a son
 * propre rendu (chargement / erreur avec bouton Reessayer / aucun effectif /
 * aucun resultat de recherche), et les ouvriers deja affectes restent VISIBLES
 * (grises, non selectionnables) pour que la liste ne paraisse plus incomplete.
 */
export default function WorkerPicker({ available, assigned, total, query, status, error, onRetry, onPick }: Props) {
    const { lang } = useLang();

    const rowBase = 'w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 transition-colors';

    const renderBody = () => {
        if (status === 'loading') {
            return (
                <div className="px-4 py-6 flex flex-col items-center gap-2 text-slate-400 dark:text-dk-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-[11px] font-bold">
                        {tx(lang, { fr: 'Chargement des effectifs…', ar: 'جارٍ تحميل العمال…', en: 'Loading staff…', es: 'Cargando personal…', pt: 'Carregando efetivos…', tr: 'Personel yükleniyor…' })}
                    </span>
                </div>
            );
        }

        if (status === 'error') {
            return (
                <div className="px-4 py-5 flex flex-col items-center gap-2 text-center">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-[11px] font-bold text-slate-600 dark:text-dk-text-soft">
                        {error || tx(lang, { fr: 'Effectifs indisponibles', ar: 'قائمة العمال غير متاحة', en: 'Staff unavailable', es: 'Personal no disponible', pt: 'Efetivos indisponíveis', tr: 'Personel kullanılamıyor' })}
                    </span>
                    <button
                        type="button"
                        onMouseDown={e => e.preventDefault()}
                        onClick={onRetry}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-dk-accent/20 text-indigo-700 dark:text-dk-accent-text text-[11px] font-black hover:bg-indigo-100 dark:hover:bg-dk-accent/30 transition-colors"
                    >
                        <RefreshCw className="w-3 h-3" />
                        {tx(lang, { fr: 'Réessayer', ar: 'إعادة المحاولة', en: 'Retry', es: 'Reintentar', pt: 'Tentar de novo', tr: 'Yeniden dene' })}
                    </button>
                </div>
            );
        }

        if (total === 0) {
            return (
                <div className="px-4 py-5 text-center">
                    <span className="block text-[11px] font-bold text-slate-600 dark:text-dk-text-soft">
                        {tx(lang, { fr: 'Aucun effectif enregistré', ar: 'لا يوجد عامل مسجّل', en: 'No staff registered', es: 'Ningún personal registrado', pt: 'Nenhum efetivo registado', tr: 'Kayıtlı personel yok' })}
                    </span>
                    <span className="block mt-1 text-[10px] font-semibold text-slate-400 dark:text-dk-muted">
                        {tx(lang, { fr: 'Ajoutez-les dans Gestion RH.', ar: 'أضِفهم في تدبير الموارد البشرية.', en: 'Add them in HR management.', es: 'Añádalos en Gestión RRHH.', pt: 'Adicione-os na Gestão RH.', tr: 'İK yönetiminden ekleyin.' })}
                    </span>
                </div>
            );
        }

        if (available.length === 0 && assigned.length === 0) {
            return (
                <div className="px-4 py-5 flex flex-col items-center gap-1.5 text-center">
                    <Search className="w-4 h-4 text-slate-300 dark:text-dk-muted" />
                    <span className="text-[11px] font-bold text-slate-600 dark:text-dk-text-soft">
                        {tx(lang, { fr: 'Aucun résultat', ar: 'لا نتيجة', en: 'No result', es: 'Sin resultados', pt: 'Sem resultados', tr: 'Sonuç yok' })}
                        {query ? ` : « ${query} »` : ''}
                    </span>
                </div>
            );
        }

        return (
            <>
                {available.map(w => (
                    <button
                        key={w.id}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                        onClick={() => onPick(w)}
                        className={`${rowBase} hover:bg-indigo-50/70 dark:hover:bg-dk-elevated/60 active:bg-indigo-100/70`}
                    >
                        <span className="flex flex-col min-w-0">
                            <span className="text-[13px] font-bold text-slate-800 dark:text-dk-text truncate">{w.full_name}</span>
                            <span className="text-[10px] font-semibold text-slate-400 dark:text-dk-muted truncate">
                                {w.matricule || '—'}
                            </span>
                        </span>
                        {w.role && (
                            <span className="text-[9px] font-bold text-indigo-700 dark:text-dk-accent-text bg-indigo-50 dark:bg-dk-accent/20 px-1.5 py-0.5 rounded-md shrink-0 uppercase tracking-wide">
                                {w.role}
                            </span>
                        )}
                    </button>
                ))}

                {assigned.length > 0 && (
                    <>
                        {/* Deja affectes ailleurs : montres pour que la liste soit complete,
                            mais non selectionnables (sinon le meme ouvrier tiendrait deux postes). */}
                        <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-dk-bg/60 text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-dk-muted">
                            {tx(lang, { fr: 'Déjà affectés', ar: 'مُعيَّنون مسبقاً', en: 'Already assigned', es: 'Ya asignados', pt: 'Já atribuídos', tr: 'Zaten atanmış' })}
                        </div>
                        {assigned.map(w => (
                            <div
                                key={w.id}
                                className={`${rowBase} opacity-60 cursor-not-allowed`}
                                title={tx(lang, { fr: 'Déjà affecté à un autre poste', ar: 'مُعيَّن في منصب آخر', en: 'Already assigned to another station', es: 'Ya asignado a otro puesto', pt: 'Já atribuído a outro posto', tr: 'Başka bir istasyona atanmış' })}
                            >
                                <span className="flex flex-col min-w-0">
                                    <span className="text-[13px] font-bold text-slate-600 dark:text-dk-text-soft truncate line-through decoration-slate-300">{w.full_name}</span>
                                    <span className="text-[10px] font-semibold text-slate-400 dark:text-dk-muted truncate">{w.matricule || '—'}</span>
                                </span>
                                <UserCheck className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0" />
                            </div>
                        ))}
                    </>
                )}
            </>
        );
    };

    return (
        <div
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
            /* Ancre a droite sur telephone (le champ "Opé" est colle au bord droit de la
               carte : ancre a gauche, le menu debordait hors de l'ecran). */
            className="absolute z-[200] top-full mt-1.5 right-0 sm:right-auto sm:left-0 w-[min(17.5rem,calc(100vw-2.5rem))] sm:w-72 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border/90 rounded-xl shadow-xl dark:shadow-dk-elevated overflow-hidden"
        >
            <div className="px-3 py-2 bg-slate-50 dark:bg-dk-bg/80 border-b border-slate-100 dark:border-dk-border flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-dk-muted truncate">
                    {tx(lang, { fr: 'Effectifs', ar: 'العمّال', en: 'Staff', es: 'Personal', pt: 'Efetivos', tr: 'Personel' })}
                </span>
                <span className="text-[10px] font-black tabular-nums text-slate-500 dark:text-dk-muted bg-slate-200/70 dark:bg-dk-elevated px-1.5 py-0.5 rounded-md shrink-0">
                    {status === 'ready' ? `${available.length}/${total}` : '—'}
                </span>
            </div>
            <div className="max-h-[45vh] sm:max-h-72 overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-dk-border">
                {renderBody()}
            </div>
        </div>
    );
}
