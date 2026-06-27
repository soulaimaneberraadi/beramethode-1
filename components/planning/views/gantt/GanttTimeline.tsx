import React from 'react';
import { planningLocalDateKey, isPlanningWorkingDay } from '../../../../utils/planning';
import type { AppSettings } from '../../../../types';
import { tx } from '../../../../lib/i18n';
import type { TxMap } from '../../../../lib/i18n';
import { useLang } from '../../../../src/context/LanguageContext';

interface Props {
    dates: Date[];
    dayWidth: number;
    settings: AppSettings;
}

const DAYS_TX: TxMap[] = [
    { fr:'Lu', ar:'إث', en:'Mo', es:'Lu', pt:'Se', tr:'Pt' },
    { fr:'Ma', ar:'ثل', en:'Tu', es:'Ma', pt:'Te', tr:'Sa' },
    { fr:'Me', ar:'أرب', en:'We', es:'Mi', pt:'Qu', tr:'Ça' },
    { fr:'Je', ar:'خم', en:'Th', es:'Ju', pt:'Qu', tr:'Pe' },
    { fr:'Ve', ar:'جم', en:'Fr', es:'Vi', pt:'Se', tr:'Cu' },
    { fr:'Sa', ar:'سب', en:'Sa', es:'Sá', pt:'Sá', tr:'Cu' },
    { fr:'Di', ar:'أحد', en:'Su', es:'Do', pt:'Do', tr:'Pa' },
];
const MONTHS_LONG_TX: TxMap[] = [
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
const MONTHS_SHORT_TX: TxMap[] = [
    { fr:'Jan', ar:'ينا', en:'Jan', es:'Ene', pt:'Jan', tr:'Oca' },
    { fr:'Fév', ar:'فبر', en:'Feb', es:'Feb', pt:'Fev', tr:'Şub' },
    { fr:'Mar', ar:'مار', en:'Mar', es:'Mar', pt:'Mar', tr:'Mar' },
    { fr:'Avr', ar:'أبر', en:'Apr', es:'Abr', pt:'Abr', tr:'Nis' },
    { fr:'Mai', ar:'ماي', en:'May', es:'May', pt:'Mai', tr:'May' },
    { fr:'Juin', ar:'يون', en:'Jun', es:'Jun', pt:'Jun', tr:'Haz' },
    { fr:'Juil', ar:'يول', en:'Jul', es:'Jul', pt:'Jul', tr:'Tem' },
    { fr:'Août', ar:'غشت', en:'Aug', es:'Ago', pt:'Ago', tr:'Ağu' },
    { fr:'Sep', ar:'شتن', en:'Sep', es:'Sep', pt:'Set', tr:'Eyl' },
    { fr:'Oct', ar:'أكت', en:'Oct', es:'Oct', pt:'Out', tr:'Eki' },
    { fr:'Nov', ar:'نون', en:'Nov', es:'Nov', pt:'Nov', tr:'Kas' },
    { fr:'Déc', ar:'دجن', en:'Dec', es:'Dic', pt:'Dez', tr:'Ara' },
];

export default function GanttTimeline({ dates, dayWidth, settings }: Props) {
    const { lang } = useLang();
    const todayKey = planningLocalDateKey(new Date());

    // Régimes selon le zoom (largeur de jour en pixels)
    const showHours = dayWidth >= 400;         // chaque jour assez large pour afficher les heures
    const showDays = dayWidth >= 18;           // jour individuel visible
    const showMonths = true;                   // toujours
    const showYears = dayWidth < 20;           // année en bande supérieure quand on dézoome

    // Regrouper par mois pour la bande supérieure
    const months: { label: string; span: number; year: number; month: number }[] = [];
    for (const d of dates) {
        const useShort = dayWidth < 80;
        const label = `${useShort ? tx(lang, MONTHS_SHORT_TX[d.getMonth()]) : tx(lang, MONTHS_LONG_TX[d.getMonth()])} ${d.getFullYear()}`;
        const last = months[months.length - 1];
        if (last && last.label === label) last.span++;
        else months.push({ label, span: 1, year: d.getFullYear(), month: d.getMonth() });
    }

    // Regrouper par année pour zoom très éloigné
    const years: { label: string; span: number }[] = [];
    for (const d of dates) {
        const label = String(d.getFullYear());
        const last = years[years.length - 1];
        if (last && last.label === label) last.span++;
        else years.push({ label, span: 1 });
    }

    return (
        <div className="sticky top-0 z-[29] bg-white dark:bg-slate-900">
            {/* Bande année (uniquement si très dézoomé) */}
            {showYears && (
                <div className="flex h-5 border-b border-slate-100 dark:border-slate-800">
                    {years.map((y, i) => (
                        <div
                            key={i}
                            className="flex items-center px-2 text-[10px] font-semibold text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800 last:border-r-0"
                            style={{ width: y.span * dayWidth }}
                        >
                            {y.label}
                        </div>
                    ))}
                </div>
            )}

            {/* Bande mois */}
            {showMonths && (
                <div className="flex h-7 border-b border-slate-100 dark:border-slate-800">
                    {months.map((m, i) => (
                        <div
                            key={i}
                            className="flex items-center px-3 text-[11px] font-medium text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800 last:border-r-0"
                            style={{ width: m.span * dayWidth }}
                        >
                            <span className="capitalize truncate">{m.label}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Bande jours (uniquement si zoom suffisant) */}
            {showDays && (
                <div className="flex h-9 border-b border-slate-100 dark:border-slate-800">
                    {dates.map((d, i) => {
                        const key = planningLocalDateKey(d);
                        const isToday = key === todayKey;
                        const isWeekend = !isPlanningWorkingDay(d, settings);
                        const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
                        const isFirstOfWeek = dow === 0;
                        // Densité adaptative : à zoom moyen, on n'affiche que les lundis ou jours pairs
                        const compact = dayWidth < 35;
                        if (compact && !isFirstOfWeek && !isToday) {
                            return (
                                <div
                                    key={i}
                                    className={`border-r border-slate-50 last:border-r-0 ${isWeekend ? 'bg-slate-50/40' : ''}`}
                                    style={{ width: dayWidth, minWidth: dayWidth }}
                                />
                            );
                        }
                        return (
                            <div
                                key={i}
                                className={`relative flex flex-col items-center justify-center border-r border-slate-50 last:border-r-0 transition-colors ${
                                    isWeekend ? 'bg-slate-50/40' : ''
                                }`}
                                style={{ width: dayWidth, minWidth: dayWidth }}
                            >
                                {dayWidth >= 50 && (
                                    <span className={`text-[9px] uppercase tracking-wider font-medium ${
                                        isToday ? 'text-slate-900' : 'text-slate-400'
                                    }`}>
                                        {tx(lang, DAYS_TX[dow])}
                                    </span>
                                )}
                                <span className={`text-[12px] tabular-nums font-medium ${
                                    isToday ? 'text-slate-900 font-bold' : isWeekend ? 'text-slate-400' : 'text-slate-700'
                                }`}>
                                    {d.getDate()}
                                </span>
                                {isToday && (
                                    <span className="absolute -bottom-px left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500" />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Bande heures (uniquement si très zoomé) */}
            {showHours && (
                <div className="flex h-5 border-b border-slate-100 dark:border-slate-800">
                    {dates.map((d, i) => {
                        const isToday = planningLocalDateKey(d) === todayKey;
                        return (
                            <div
                                key={i}
                                className="flex items-center border-r border-slate-50 last:border-r-0"
                                style={{ width: dayWidth, minWidth: dayWidth }}
                            >
                                {/* 4 graduations 8h / 12h / 14h / 18h */}
                                {['8h', '12h', '14h', '18h'].map((h, k) => (
                                    <span
                                        key={k}
                                        className={`flex-1 text-center text-[9px] font-medium tabular-nums ${
                                            isToday ? 'text-slate-700' : 'text-slate-400'
                                        }`}
                                    >
                                        {h}
                                    </span>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
