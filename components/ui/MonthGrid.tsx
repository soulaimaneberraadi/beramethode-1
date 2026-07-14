import React from 'react';
import type { AppSettings } from '../../types';
import { isPlanningWorkingDay, planningLocalDateKey } from '../../utils/planning';
import { tx } from '../../lib/i18n';
import type { TxMap } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';

export interface MonthGridProps {
    monthAnchor: Date;
    selectedDateStr: string;
    onSelectDate: (yyyyMmDd: string) => void;
    settings: AppSettings;
    minDate?: string;
    maxDate?: string;
    /** S’ajoute aux jours non ouvrés (ex. lot deadline). */
    extraDisabled?: (d: Date) => boolean;
    markersByDate?: Record<string, { tone?: 'indigo' | 'emerald' | 'amber' | 'blue' | 'slate'; label: string }[]>;
    onPrevMonth: () => void;
    onNextMonth: () => void;
}

const MONTHS_TX: TxMap[] = [
    { fr:'Janvier', ar:'يناير', en:'January', es:'Enero', pt:'Janeiro', tr:'Ocak' },
    { fr:'Février', ar:'فبراير', en:'February', es:'Febrero', pt:'Fevereiro', tr:'Şubat' },
    { fr:'Mars', ar:'مارس', en:'March', es:'Marzo', pt:'Março', tr:'Mart' },
    { fr:'Avril', ar:'أبريل', en:'April', es:'Abril', pt:'Abril', tr:'Nisan' },
    { fr:'Mai', ar:'ماي', en:'May', es:'Mayo', pt:'Maio', tr:'Mayıs' },
    { fr:'Juin', ar:'يونيو', en:'June', es:'Junio', pt:'Junho', tr:'Haziran' },
    { fr:'Juillet', ar:'يوليوز', en:'July', es:'Julio', pt:'Julho', tr:'Temmuz' },
    { fr:'Août', ar:'غشت', en:'August', es:'Agosto', pt:'Agosto', tr:'Ağustos' },
    { fr:'Septembre', ar:'شتنبر', en:'September', es:'Septiembre', pt:'Setembro', tr:'Eylül' },
    { fr:'Octobre', ar:'أكتوبر', en:'October', es:'Octubre', pt:'Outubro', tr:'Ekim' },
    { fr:'Novembre', ar:'نونبر', en:'November', es:'Noviembre', pt:'Novembro', tr:'Kasım' },
    { fr:'Décembre', ar:'دجنبر', en:'December', es:'Diciembre', pt:'Dezembro', tr:'Aralık' },
];
const DOW_TX: TxMap[] = [
    { fr:'Dim', ar:'أحد', en:'Sun', es:'Dom', pt:'Dom', tr:'Paz' },
    { fr:'Lun', ar:'إثن', en:'Mon', es:'Lun', pt:'Seg', tr:'Pzt' },
    { fr:'Mar', ar:'ثلاث', en:'Tue', es:'Mar', pt:'Ter', tr:'Sal' },
    { fr:'Mer', ar:'أرب', en:'Wed', es:'Mié', pt:'Qua', tr:'Çar' },
    { fr:'Jeu', ar:'خميس', en:'Thu', es:'Jue', pt:'Qui', tr:'Per' },
    { fr:'Ven', ar:'جمعة', en:'Fri', es:'Vie', pt:'Sex', tr:'Cum' },
    { fr:'Sam', ar:'سبت', en:'Sat', es:'Sáb', pt:'Sáb', tr:'Cmt' },
];

function parseYmd(s: string): number | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s || '').split('T')[0]);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0).getTime();
}

export default function MonthGrid({
    monthAnchor,
    selectedDateStr,
    onSelectDate,
    settings,
    minDate,
    maxDate,
    extraDisabled,
    markersByDate,
    onPrevMonth,
    onNextMonth,
}: MonthGridProps) {
    const { lang } = useLang();
    const y = monthAnchor.getFullYear();
    const mo = monthAnchor.getMonth();
    const first = new Date(y, mo, 1, 12, 0, 0, 0);
    const startPad = first.getDay(); // 0 Sun
    const daysInMonth = new Date(y, mo + 1, 0, 12, 0, 0, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push(new Date(y, mo, d, 12, 0, 0, 0));
    }
    while (cells.length % 7 !== 0) cells.push(null);

    const selKey = (selectedDateStr || '').split('T')[0];
    const todayKey = planningLocalDateKey(new Date());
    const minT = minDate ? parseYmd(minDate) : null;
    const maxT = maxDate ? parseYmd(maxDate) : null;

    const isDisabled = (d: Date) => {
        const t = d.getTime();
        if (minT != null && t < minT) return true;
        if (maxT != null && t > maxT) return true;
        if (!isPlanningWorkingDay(d, settings)) return true;
        if (extraDisabled?.(d)) return true;
        return false;
    };

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
                <button
                    type="button"
                    onClick={onPrevMonth}
                    className="rounded-lg p-1.5 text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-slate-800 dark:hover:text-dk-text"
                    aria-label={tx(lang,{fr:'Mois précédent',ar:'الشهر السابق',en:'Previous month',es:'Mes anterior',pt:'Mês anterior',tr:'Önceki ay'})}
                >
                    ‹
                </button>
                <div className="text-sm font-black text-slate-800 dark:text-dk-text">
                    {tx(lang, MONTHS_TX[mo])} {y}
                </div>
                <button
                    type="button"
                    onClick={onNextMonth}
                    className="rounded-lg p-1.5 text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-slate-800 dark:hover:text-dk-text"
                    aria-label={tx(lang,{fr:'Mois suivant',ar:'الشهر التالي',en:'Next month',es:'Mes siguiente',pt:'Próximo mês',tr:'Sonraki ay'})}
                >
                    ›
                </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-dk-muted">
                {DOW_TX.map((m, i) => (
                    <div key={i} className="py-1">
                        {tx(lang, m)}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
                {cells.map((d, idx) => {
                    if (!d) return <div key={`e-${idx}`} className="h-8 sm:h-9" />;
                    const key = planningLocalDateKey(d);
                    const selected = key === selKey;
                    const isToday = key === todayKey;
                    const dis = isDisabled(d);
                    const markers = markersByDate?.[key] || [];
                    return (
                        <button
                            key={key}
                            type="button"
                            disabled={dis}
                            onClick={() => !dis && onSelectDate(key)}
                            title={markers.map(m => m.label).join(' | ') || undefined}
                            className={[
                                'relative h-8 rounded-lg text-xs font-bold transition-colors sm:h-9',
                                dis ? 'cursor-not-allowed bg-slate-100 dark:bg-dk-elevated text-slate-300 dark:text-dk-muted' : 'text-slate-800 dark:text-dk-text hover:bg-slate-50 dark:hover:bg-dk-elevated/60',
                                selected && !dis ? 'bg-emerald-700 text-white hover:bg-emerald-800' : '',
                                !selected && !dis && isToday ? 'ring-2 ring-emerald-700 ring-offset-1' : '',
                            ].filter(Boolean).join(' ')}
                        >
                            <span className="relative z-10">{d.getDate()}</span>
                            {markers.length > 0 && (
                                <span className="absolute inset-x-1 bottom-1 flex items-center justify-center gap-0.5">
                                    {markers.slice(0, 4).map((m, i) => {
                                        const tone =
                                            m.tone === 'emerald' ? 'bg-emerald-500' :
                                            m.tone === 'amber' ? 'bg-amber-500' :
                                            m.tone === 'blue' ? 'bg-blue-500' :
                                            m.tone === 'slate' ? 'bg-slate-400' :
                                            'bg-indigo-500';
                                        return <span key={`${key}-${i}`} className={`h-1 w-1 rounded-full ${selected && !dis ? 'bg-white' : tone}`} />;
                                    })}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
