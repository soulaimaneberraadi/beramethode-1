import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange } from 'lucide-react';
import type { ModelData, PlanningEvent, SuiviData } from '../types';
import { resolveSuiviContext } from '../lib/suiviContextResolver';
import { useLang } from '../src/context/LanguageContext';
import { tx, type Lang } from '../lib/i18n';

function getFrenchWeekday(dateStr: string, lang?: Lang): string {
  const days: Record<string, string[]> = {
    fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    ar: ['Ø§Ù„Ø£Ø­Ø¯', 'Ø§Ù„Ø¥Ø«Ù†ÙŠÙ†', 'Ø§Ù„Ø«Ù„Ø§Ø«Ø§Ø¡', 'Ø§Ù„Ø£Ø±Ø¨Ø¹Ø§Ø¡', 'Ø§Ù„Ø®Ù…ÙŠØ³', 'Ø§Ù„Ø¬Ù…Ø¹Ø©', 'Ø§Ù„Ø³Ø¨Øª'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    es: ['Domingo', 'Lunes', 'Martes', 'MiÃ©rcoles', 'Jueves', 'Viernes', 'SÃ¡bado'],
    pt: ['Domingo', 'Segunda', 'TerÃ§a', 'Quarta', 'Quinta', 'Sexta', 'SÃ¡bado'],
    tr: ['Pazar', 'Pazartesi', 'SalÄ±', 'Ã‡arÅŸamba', 'PerÅŸembe', 'Cuma', 'Cumartesi'],
  };
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return 'â€”';
  return (days[lang || 'fr'] || days.fr)[d.getDay()] || 'â€”';
}

function formatDateDdMmYyyy(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return isoDate;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function sumSortiesRow(s: SuiviData, hourKeys: string[]): number {
  return hourKeys.reduce((acc, k) => {
    const v = s.sorties[k];
    if (v === undefined || v === null || Number.isNaN(Number(v)) || Number(v) < 0) return acc;
    return acc + Number(v);
  }, 0);
}

function countActiveSlots(s: SuiviData, hourKeys: string[]): number {
  return hourKeys.filter(k => (s.sorties[k] ?? -1) >= 0).length;
}

function parseISODateLocal(iso: string): Date {
  const t = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(NaN);
  return new Date(`${t}T12:00:00`);
}

function isoDateFrom(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(iso: string): string {
  const d = parseISODateLocal(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return isoDateFrom(d);
}

function addDaysIso(iso: string, n: number): string {
  const d = parseISODateLocal(iso);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + n);
  return isoDateFrom(d);
}

function monthKeyFromDate(iso: string): string {
  return iso.slice(0, 7);
}

type PeriodPreset = 'all' | 'day' | 'week' | 'month' | 'range';

type DateBounds = { min: string; max: string };

function clampBoundsToData(b: DateBounds, dataMin: string, dataMax: string): DateBounds | null {
  if (!dataMin || !dataMax || dataMin > dataMax) return null;
  const min = b.min < dataMin ? dataMin : b.min;
  const max = b.max > dataMax ? dataMax : b.max;
  if (min > max) return null;
  return { min, max };
}

function getFilterBounds(
  preset: PeriodPreset,
  dataMin: string,
  dataMax: string,
  dayPick: string,
  weekStartMonday: string,
  monthYm: string,
  rangeStart: string,
  rangeEnd: string,
): DateBounds | null {
  if (preset === 'all') return null;
  if (!dataMin || !dataMax) return null;

  if (preset === 'day') {
    const d = dayPick || dataMin;
    return clampBoundsToData({ min: d, max: d }, dataMin, dataMax);
  }

  if (preset === 'week') {
    const w0 = startOfWeekMonday(weekStartMonday || dataMin);
    const w1 = addDaysIso(w0, 6);
    return clampBoundsToData({ min: w0, max: w1 }, dataMin, dataMax);
  }

  if (preset === 'month') {
    const ym = monthYm || monthKeyFromDate(dataMin);
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return clampBoundsToData({ min: dataMin, max: dataMax }, dataMin, dataMax);
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const start = `${ym}-01`;
    const last = new Date(y, mo, 0);
    const end = `${ym}-${String(last.getDate()).padStart(2, '0')}`;
    return clampBoundsToData({ min: start, max: end }, dataMin, dataMax);
  }

  if (preset === 'range') {
    let a = (rangeStart || dataMin).trim();
    let b = (rangeEnd || dataMax).trim();
    if (a > b) [a, b] = [b, a];
    return clampBoundsToData({ min: a, max: b }, dataMin, dataMax);
  }

  return null;
}

function filterRowsByBounds(rows: SuiviData[], bounds: DateBounds | null): SuiviData[] {
  if (!bounds) return rows;
  return rows.filter(r => r.date >= bounds.min && r.date <= bounds.max);
}

function enumerateWeekStarts(minIso: string, maxIso: string): string[] {
  if (!minIso || !maxIso || minIso > maxIso) return [];
  const out: string[] = [];
  let cur = startOfWeekMonday(minIso);
  if (!cur) return [];
  const end = maxIso;
  const seen = new Set<string>();
  let guard = 0;
  while (cur <= end && guard < 520) {
    if (!seen.has(cur)) {
      seen.add(cur);
      out.push(cur);
    }
    cur = addDaysIso(cur, 7);
    guard += 1;
  }
  return out;
}

export type ModelOfJournalierSummaryProps = {
  chaineId: string;
  chainLabel: string;
  modelLabel: string;
  events: SuiviData[];
  hours: string[];
  hourKeys: string[];
  suivis: SuiviData[];
  planningEvents: PlanningEvent[];
  models: ModelData[];
  onUpdateHourly?: (suiviId: string, hourKey: string, value: string) => void;
};

function modelLabelForPlanning(
  planningId: string,
  planningEvents: PlanningEvent[],
  models: ModelData[],
): string {
  const p = planningEvents.find(pe => pe.id === planningId);
  const mid = p?.modelId;
  if (!mid) return 'â€”';
  const m = models.find(x => x.id === mid);
  return (m?.meta_data?.nom_modele || m?.filename || mid).trim() || 'â€”';
}

function buildConflictMap(
  rows: SuiviData[],
  hourKeys: string[],
  suivis: SuiviData[],
  planningEvents: PlanningEvent[],
  chaineId: string,
): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const s of rows) {
    const pid = s.planningId;
    for (const k of hourKeys) {
      const v = s.sorties[k];
      if (v === undefined || v === null || Number(v) < 0) continue;
      const ctx = resolveSuiviContext({
        contextDate: s.date,
        hourKey: k,
        suivis,
        planningEvents,
        filterChaine: chaineId,
        filterModele: 'ALL',
      });
      const key = `${s.date}\t${k}\t${pid}`;
      const other = ctx.conflict && ctx.suggestedPlanningIds.some(id => id !== pid);
      map.set(key, other);
    }
  }
  return map;
}

function buildFooter(rows: SuiviData[], hourKeys: string[]) {
  let pSum = 0;
  let cSum = 0;
  const hourSums: number[] = hourKeys.map(() => 0);
  for (const s of rows) {
    pSum += sumSortiesRow(s, hourKeys);
    cSum += countActiveSlots(s, hourKeys);
    hourKeys.forEach((k, i) => {
      const v = s.sorties[k];
      if (v !== undefined && v !== null && !Number.isNaN(Number(v)) && Number(v) >= 0) {
        hourSums[i] += Number(v);
      }
    });
  }
  return { pSum, cSum, hourSums };
}

type JournalierTableBlockProps = {
  eyebrow: string;
  title: string;
  hint: string;
  rows: SuiviData[];
  showModelColumn: boolean;
  hours: string[];
  hourKeys: string[];
  suivis: SuiviData[];
  planningEvents: PlanningEvent[];
  chaineId: string;
  models: ModelData[];
  emptyText: string;
  onUpdateHourly?: (suiviId: string, hourKey: string, value: string) => void;
};

function JournalierTableBlock({
  eyebrow,
  title,
  hint,
  rows,
  showModelColumn,
  hours,
  hourKeys,
  suivis,
  planningEvents,
  chaineId,
  models,
  emptyText,
  onUpdateHourly,
}: JournalierTableBlockProps) {
  const { lang } = useLang();
  const conflictMap = useMemo(
    () => buildConflictMap(rows, hourKeys, suivis, planningEvents, chaineId),
    [rows, hourKeys, suivis, planningEvents, chaineId],
  );
  const footer = useMemo(() => buildFooter(rows, hourKeys), [rows, hourKeys]);
  const footerColSpan = showModelColumn ? 3 : 2;

  return (
    <div className="border-t border-slate-200 dark:border-dk-border first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 bg-slate-100/70 border-b border-slate-200 dark:border-dk-border/80">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted">{eyebrow}</p>
          <h4 className="text-xs font-black text-slate-900 dark:text-dk-text tracking-tight">{title}</h4>
          <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-0.5 leading-snug">{hint}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="px-2 py-2 text-center font-black border-r border-slate-600/50 w-[88px]">{tx(lang, {fr:'DATE', ar:'Ø§Ù„ØªØ§Ø±ÙŠØ®', en:'DATE', es:'FECHA', pt:'DATA', tr:'TARÄ°H'})}</th>
              <th className="px-2 py-2 text-center font-black border-r border-slate-600/50 w-[72px]">{tx(lang, {fr:'JOUR', ar:'Ø§Ù„ÙŠÙˆÙ…', en:'DAY', es:'DÃA', pt:'DIA', tr:'GÃœN'})}</th>
              {showModelColumn ? (
                <th className="px-2 py-2 text-left font-black border-r border-slate-600/50 min-w-[100px] max-w-[160px]">
                  {tx(lang, {fr:'MODÃˆLE', ar:'Ø§Ù„Ù†Ù…ÙˆØ°Ø¬', en:'MODEL', es:'MODELO', pt:'MODELO', tr:'MODEL'})}
                </th>
              ) : null}
              {hours.map(h => (
                <th key={h} className="px-1 py-2 text-center font-black border-r border-slate-600/50 whitespace-nowrap">
                  {h}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-black border-r border-slate-600/50 bg-emerald-900/40">{tx(lang, {fr:'P. JOURN.', ar:'Ø¥. Ø§Ù„ÙŠ.', en:'P. DAY', es:'P. DÃA', pt:'P. DIA', tr:'G. T.'})}</th>
              <th className="px-2 py-2 text-center font-black bg-amber-900/30">{tx(lang, {fr:'CRÃ‰N.', ar:'ÙØªØ±Ø§Øª', en:'SLOTS', es:'RAN.', pt:'SLOT', tr:'ARAL.'})}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={footerColSpan + hourKeys.length + 2}
                  className="px-4 py-6 text-center text-xs font-bold text-slate-500 dark:text-dk-muted bg-slate-50 dark:bg-dk-bg/50"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map(s => {
                const p = sumSortiesRow(s, hourKeys);
                const c = countActiveSlots(s, hourKeys);
                return (
                  <tr key={s.id} className="bg-white dark:bg-dk-surface hover:bg-slate-50/80">
                    <td className="px-2 py-1.5 text-center font-mono font-bold text-slate-700 dark:text-dk-text-soft border-r border-slate-100 dark:border-dk-border">
                      {formatDateDdMmYyyy(s.date)}
                    </td>
                    <td className="px-2 py-1.5 text-center font-bold text-slate-600 dark:text-dk-text-soft border-r border-slate-100 dark:border-dk-border">
                      {getFrenchWeekday(s.date, lang).slice(0, 3)}
                    </td>
                    {showModelColumn ? (
                      <td
                        className="px-2 py-1.5 text-left font-bold text-slate-800 dark:text-dk-text border-r border-slate-100 dark:border-dk-border truncate max-w-[160px]"
                        title={modelLabelForPlanning(s.planningId, planningEvents, models)}
                      >
                        {modelLabelForPlanning(s.planningId, planningEvents, models)}
                      </td>
                    ) : null}
                    {hourKeys.map(k => {
                      const v = s.sorties[k];
                      const show = v !== undefined && v !== null && Number(v) >= 0;
                      const conflict = show && conflictMap.get(`${s.date}\t${k}\t${s.planningId}`);
                      const cellTitle = conflict
                        ? tx(lang, {fr:'Autre OF sur cette chaÃ®ne a aussi de la production sur ce crÃ©neau â€” vÃ©rifiez le planning.', ar:'Ø£Ù…Ø± ØªØµÙ†ÙŠØ¹ Ø¢Ø®Ø± Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø®Ø· Ù„Ø¯ÙŠÙ‡ Ø¥Ù†ØªØ§Ø¬ ÙÙŠ Ù‡Ø°Ù‡ Ø§Ù„ÙØªØ±Ø© â€” ØªØ­Ù‚Ù‚ Ù…Ù† Ø§Ù„ØªØ®Ø·ÙŠØ·.', en:'Another WO on this line also has production on this slot â€” check the schedule.', es:'Otra OF en esta lÃ­nea tambiÃ©n tiene producciÃ³n en este horario â€” verifique la planificaciÃ³n.', pt:'Outra OF nesta linha tambÃ©m tem produÃ§Ã£o neste horÃ¡rio â€” verifique o planejamento.', tr:'Bu hattaki baÅŸka bir Ä°E\'nin de bu aralÄ±kta Ã¼retimi var â€” planlamayÄ± kontrol edin.'})
                        : undefined;
                      const inputCls =
                        'w-full min-w-[2.25rem] max-w-[3.25rem] h-7 mx-auto px-0.5 text-center text-[11px] font-bold rounded border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400 tabular-nums';
                      return (
                        <td
                          key={k}
                          className={`px-0.5 py-1 text-center font-bold border-r border-slate-100 dark:border-dk-border tabular-nums align-middle ${
                            conflict ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-900 ring-1 ring-inset ring-amber-300' : 'text-slate-800 dark:text-dk-text'
                          }`}
                          title={cellTitle}
                        >
                          {onUpdateHourly ? (
                            <span className="inline-flex items-center justify-center gap-0.5 w-full">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                className={`${inputCls} ${conflict ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/30/80' : ''}`}
                                value={show ? String(v) : ''}
                                onChange={e => onUpdateHourly(s.id, k, e.target.value)}
                                placeholder="â€”"
                                aria-label={`${tx(lang, {fr:'PiÃ¨ces', ar:'Ù‚Ø·Ø¹', en:'Pieces', es:'Piezas', pt:'PeÃ§as', tr:'ParÃ§alar'})} ${k} ${formatDateDdMmYyyy(s.date)}`}
                              />
                              {conflict ? <AlertTriangle className="w-3 h-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden /> : null}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center gap-0.5">
                              {show ? v : 'â€”'}
                              {conflict ? <AlertTriangle className="w-3 h-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden /> : null}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center font-black text-emerald-800 bg-emerald-50 dark:bg-emerald-900/30/50 border-r border-slate-100 dark:border-dk-border tabular-nums">
                      {p}
                    </td>
                    <td className="px-2 py-1.5 text-center font-black text-amber-800 bg-amber-50 dark:bg-amber-900/30/40 tabular-nums">{c}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="bg-slate-100 dark:bg-dk-elevated border-t-2 border-slate-300">
                <td
                  colSpan={footerColSpan}
                  className="px-2 py-2 text-right font-black text-slate-600 dark:text-dk-text-soft uppercase text-[10px] border-r border-slate-200 dark:border-dk-border"
                >
                  {tx(lang, {fr:'Total', ar:'Ø§Ù„Ù…Ø¬Ù…ÙˆØ¹', en:'Total', es:'Total', pt:'Total', tr:'Toplam'})}
                </td>
                {footer.hourSums.map((sum, i) => (
                  <td key={hourKeys[i]} className="px-1 py-2 text-center font-black text-slate-800 dark:text-dk-text border-r border-slate-200 dark:border-dk-border tabular-nums">
                    {sum > 0 ? sum : ''}
                  </td>
                ))}
                <td className="px-2 py-2 text-center font-black text-emerald-900 bg-emerald-100/60 border-r border-slate-200 dark:border-dk-border tabular-nums">
                  {footer.pSum}
                </td>
                <td className="px-2 py-2 text-center font-black text-amber-900 bg-amber-100/50 tabular-nums">{footer.cSum}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

export default function ModelOfJournalierSummary({
  chaineId,
  chainLabel,
  modelLabel,
  events,
  hours,
  hourKeys,
  suivis,
  planningEvents,
  models,
  onUpdateHourly,
}: ModelOfJournalierSummaryProps) {
  const { lang } = useLang();
  const ofRows = useMemo(
    () => [...events].sort((a, b) => a.date.localeCompare(b.date)),
    [events],
  );

  const chainRows = useMemo(() => {
    let list = suivis.filter(s => {
      const p = planningEvents.find(pe => pe.id === s.planningId);
      return p && p.chaineId === chaineId;
    });
    const dates = events.map(e => e.date).filter(Boolean).sort();
    if (dates.length >= 1) {
      const dMin = dates[0];
      const dMax = dates[dates.length - 1];
      list = list.filter(s => s.date >= dMin && s.date <= dMax);
    }
    return list.sort((a, b) => {
      const c = a.date.localeCompare(b.date);
      if (c !== 0) return c;
      return a.planningId.localeCompare(b.planningId);
    });
  }, [suivis, planningEvents, chaineId, events]);

  const unionDates = useMemo(() => {
    const s = new Set<string>();
    for (const r of ofRows) if (r.date) s.add(r.date);
    for (const r of chainRows) if (r.date) s.add(r.date);
    return [...s].sort();
  }, [ofRows, chainRows]);

  const dataMin = unionDates[0] ?? '';
  const dataMax = unionDates[unionDates.length - 1] ?? '';

  const monthOptions = useMemo(() => {
    const s = new Set<string>();
    for (const d of unionDates) s.add(monthKeyFromDate(d));
    return [...s].sort();
  }, [unionDates]);

  const weekOptions = useMemo(() => enumerateWeekStarts(dataMin, dataMax), [dataMin, dataMax]);

  const datesKey = useMemo(() => unionDates.join('|'), [unionDates]);

  const [preset, setPreset] = useState<PeriodPreset>('all');
  const [dayPick, setDayPick] = useState('');
  const [weekStartMonday, setWeekStartMonday] = useState('');
  const [monthYm, setMonthYm] = useState('');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  useEffect(() => {
    if (!dataMin || !dataMax) return;
    const u = datesKey ? datesKey.split('|') : [];
    const weeks = enumerateWeekStarts(dataMin, dataMax);
    const monthsList = [...new Set(u.map(monthKeyFromDate))].sort();

    setDayPick(prev => (prev && u.includes(prev) ? prev : dataMin));
    setWeekStartMonday(prev => (weeks.length > 0 && weeks.includes(prev) ? prev : weeks[0] || startOfWeekMonday(dataMin)));
    setMonthYm(prev =>
      monthsList.length > 0 && monthsList.includes(prev) ? prev : monthsList[0] || monthKeyFromDate(dataMin),
    );
    setRangeStart(dataMin);
    setRangeEnd(dataMax);
  }, [dataMin, dataMax, datesKey]);

  const activeBounds = useMemo(
    () => getFilterBounds(preset, dataMin, dataMax, dayPick, weekStartMonday, monthYm, rangeStart, rangeEnd),
    [preset, dataMin, dataMax, dayPick, weekStartMonday, monthYm, rangeStart, rangeEnd],
  );

  const ofRowsFiltered = useMemo(() => filterRowsByBounds(ofRows, activeBounds), [ofRows, activeBounds]);
  const chainRowsFiltered = useMemo(() => filterRowsByBounds(chainRows, activeBounds), [chainRows, activeBounds]);

  const periodSummary =
    preset === 'all' || !activeBounds
      ? `${tx(lang, {fr:'PÃ©riode affichÃ©e', ar:'Ø§Ù„ÙØªØ±Ø© Ø§Ù„Ù…Ø¹Ø±ÙˆØ¶Ø©', en:'Displayed period', es:'PerÃ­odo mostrado', pt:'PerÃ­odo exibido', tr:'GÃ¶rÃ¼ntÃ¼lenen dÃ¶nem'})} : ${formatDateDdMmYyyy(dataMin)} â†’ ${formatDateDdMmYyyy(dataMax)} ${tx(lang, {fr:'(toutes les lignes)', ar:'(Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø£Ø³Ø·Ø±)', en:'(all rows)', es:'(todas las filas)', pt:'(todas as linhas)', tr:'(tÃ¼m satÄ±rlar)'})}.`
      : `${tx(lang, {fr:'PÃ©riode affichÃ©e', ar:'Ø§Ù„ÙØªØ±Ø© Ø§Ù„Ù…Ø¹Ø±ÙˆØ¶Ø©', en:'Displayed period', es:'PerÃ­odo mostrado', pt:'PerÃ­odo exibido', tr:'GÃ¶rÃ¼ntÃ¼lenen dÃ¶nem'})} : ${formatDateDdMmYyyy(activeBounds.min)} â†’ ${formatDateDdMmYyyy(activeBounds.max)}.`;

  const presetBtn = (id: PeriodPreset, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setPreset(id)}
      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-colors ${
        preset === id
          ? 'bg-indigo-600 dark:bg-dk-accent text-white border-indigo-600 shadow-sm dark:shadow-dk-sm'
          : 'bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-dk-elevated/60'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-sm dark:shadow-dk-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/80">
        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted">{tx(lang, {fr:'Journalier â€” vue liÃ©e', ar:'ÙŠÙˆÙ…ÙŠ â€” Ø¹Ø±Ø¶ Ù…Ø±ØªØ¨Ø·', en:'Daily â€” linked view', es:'Diario â€” vista vinculada', pt:'DiÃ¡rio â€” vista vinculada', tr:'GÃ¼nlÃ¼k â€” baÄŸlÄ± gÃ¶rÃ¼nÃ¼m'})}</h3>
        <p className="text-xs font-bold text-slate-800 dark:text-dk-text mt-0.5">
          {modelLabel}
          <span className="text-slate-400 dark:text-dk-muted font-semibold mx-1">Â·</span>
          <span className="text-indigo-700 dark:text-dk-accent-text">{chainLabel}</span>
        </p>
        <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-1 max-w-prose leading-snug">
          {tx(lang, {fr:'Les', ar:'ØªÙ…', en:'The', es:'Los', pt:'Os', tr:''})}{' '}
          <strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang, {fr:'deux tableaux', ar:'Ø§Ù„Ø¬Ø¯ÙˆÙ„Ø§Ù†', en:'two tables', es:'dos tablas', pt:'duas tabelas', tr:'iki tablo'})}</strong>{' '}
          {tx(lang, {fr:'sont affichÃ©s ensemble : suivi', ar:'Ù…Ø¹Ø±ÙˆØ¶Ø§Ù† Ù…Ø¹Ø§Ù‹: Ù…ØªØ§Ø¨Ø¹Ø©', en:'are displayed together: tracking', es:'se muestran juntos: seguimiento', pt:'sÃ£o exibidos juntos: acompanhamento', tr:'birlikte gÃ¶rÃ¼ntÃ¼lenir: takip'})}{' '}
          <strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang, {fr:'de cet OF', ar:'Ù„Ù‡Ø°Ø§ Ø§Ù„Ø£Ù…Ø±', en:'of this WO', es:'de esta OF', pt:'desta OF', tr:'bu Ä°E\'nin'})}</strong>{' '}
          {tx(lang, {fr:', puis suivi', ar:'ØŒ Ø«Ù… Ù…ØªØ§Ø¨Ø¹Ø©', en:', then tracking', es:', luego seguimiento', pt:', depois acompanhamento', tr:', ardÄ±ndan takip'})}{' '}
          <strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang, {fr:'de toute la chaÃ®ne', ar:'Ù„Ù„Ø®Ø· Ø¨Ø£ÙƒÙ…Ù„Ù‡', en:'of the entire line', es:'de toda la lÃ­nea', pt:'de toda a linha', tr:'tÃ¼m hattÄ±n'})}</strong>{' '}
          {tx(lang, {fr:'sur la mÃªme pÃ©riode (dates des lignes journaliÃ¨res de l\'OF). MÃªme logique Excel (P. jour. = somme des crÃ©neaux â‰¥ 0 ; CrÃ©neaux = nombre de crÃ©neaux saisis).', ar:'Ø¹Ù„Ù‰ Ù†ÙØ³ Ø§Ù„ÙØªØ±Ø© (ØªÙˆØ§Ø±ÙŠØ® Ø§Ù„Ø£Ø³Ø·Ø± Ø§Ù„ÙŠÙˆÙ…ÙŠØ© Ù„Ø£Ù…Ø± Ø§Ù„ØªØµÙ†ÙŠØ¹). Ù†ÙØ³ Ù…Ù†Ø·Ù‚ Excel (Ø¥. Ø§Ù„ÙŠ. = Ù…Ø¬Ù…ÙˆØ¹ Ø§Ù„ÙØªØ±Ø§Øª â‰¥ 0 ; Ø§Ù„ÙØªØ±Ø§Øª = Ø¹Ø¯Ø¯ Ø§Ù„ÙØªØ±Ø§Øª Ø§Ù„Ù…Ø¯Ø®Ù„Ø©).', en:'over the same period (daily row dates of the WO). Same Excel logic (P. day = sum of slots â‰¥ 0 ; Slots = number of entered slots).', es:'en el mismo perÃ­odo (fechas de las lÃ­neas diarias de la OF). Misma lÃ³gica de Excel (P. dÃ­a = suma de ranuras â‰¥ 0 ; Ranuras = nÃºmero de ranuras ingresadas).', pt:'no mesmo perÃ­odo (datas das linhas diÃ¡rias da OF). Mesma lÃ³gica Excel (P. dia = soma dos slots â‰¥ 0 ; Slots = nÃºmero de slots inseridos).', tr:'aynÄ± dÃ¶nemde (Ä°E\'nin gÃ¼nlÃ¼k satÄ±r tarihleri). AynÄ± Excel mantÄ±ÄŸÄ± (G. T. = aralÄ±k toplamÄ± â‰¥ 0 ; AralÄ±klar = girilen aralÄ±k sayÄ±sÄ±).'})}{' '}
          <strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang, {fr:'Filtre', ar:'Ø§Ù„ØªØµÙÙŠØ©', en:'Filter', es:'Filtro', pt:'Filtro', tr:'Filtre'})}</strong>{' '}
          {tx(lang, {fr:': jour, semaine (lundiâ€“dimanche), mois calendaire, ou plage libre â€” appliquÃ© aux', ar:': ÙŠÙˆÙ…ØŒ Ø£Ø³Ø¨ÙˆØ¹ (Ø§Ù„Ø§Ø«Ù†ÙŠÙ†â€“Ø§Ù„Ø£Ø­Ø¯)ØŒ Ø´Ù‡Ø± ØªÙ‚ÙˆÙŠÙ…ÙŠØŒ Ø£Ùˆ Ù†Ø·Ø§Ù‚ Ø­Ø± â€” ÙŠÙØ·Ø¨Ù‚ Ø¹Ù„Ù‰', en:': day, week (Monâ€“Sun), calendar month, or free range â€” applied to', es:': dÃ­a, semana (lunâ€“dom), mes calendario, o rango libre â€” aplicado a', pt:': dia, semana (segâ€“dom), mÃªs calendÃ¡rio, ou intervalo livre â€” aplicado Ã s', tr:': gÃ¼n, hafta (Pztâ€“Paz), takvim ayÄ± veya serbest aralÄ±k â€” uygulanan'})}{' '}
          <strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang, {fr:'deux', ar:'Ø§Ù„Ø¬Ø¯ÙˆÙ„ÙŠÙ†', en:'both', es:'ambas', pt:'ambas', tr:'her iki'})}</strong>{' '}
          {tx(lang, {fr:'tableaux.', ar:'Ø§Ù„Ø¬Ø¯ÙˆÙ„ÙŠÙ†.', en:'tables.', es:'tablas.', pt:'tabelas.', tr:'tabloya.'})}
          {onUpdateHourly ? (
            <>
              {' '}
              <strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang, {fr:'Saisie', ar:'Ø§Ù„Ø¥Ø¯Ø®Ø§Ù„', en:'Entry', es:'Ingreso', pt:'Entrada', tr:'GiriÅŸ'})}</strong>{' '}
              {tx(lang, {fr:': les crÃ©neaux sont modifiables ici (mÃªme enregistrement que la matrice ciâ€‘dessous).', ar:': Ø§Ù„ÙØªØ±Ø§Øª Ù‚Ø§Ø¨Ù„Ø© Ù„Ù„ØªØ¹Ø¯ÙŠÙ„ Ù‡Ù†Ø§ (Ù†ÙØ³ Ø­ÙØ¸ Ù…ØµÙÙˆÙØ© Ø§Ù„Ø¥Ø¯Ø®Ø§Ù„ Ø£Ø¯Ù†Ø§Ù‡).', en:': slots can be edited here (same saving as the input matrix below).', es:': los horarios se pueden modificar aquÃ­ (mismo guardado que la matriz de abajo).', pt:': os slots podem ser editados aqui (mesmo salvamento da matriz abaixo).', tr:': aralÄ±klar burada dÃ¼zenlenebilir (aÅŸaÄŸÄ±daki giriÅŸ matrisi ile aynÄ± kaydetme).'})}
            </>
          ) : null}
        </p>
      </div>

      <div className="px-4 py-3 border-b border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <CalendarRange className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0" aria-hidden />
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted">{tx(lang, {fr:'Filtrer les tableaux', ar:'ØªØµÙÙŠØ© Ø§Ù„Ø¬Ø¯Ø§ÙˆÙ„', en:'Filter tables', es:'Filtrar tablas', pt:'Filtrar tabelas', tr:'TablolarÄ± filtrele'})}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {presetBtn('all', tx(lang, {fr:'Tout', ar:'Ø§Ù„ÙƒÙ„', en:'All', es:'Todo', pt:'Tudo', tr:'TÃ¼mÃ¼'}))}
          {presetBtn('day', tx(lang, {fr:'Jour', ar:'ÙŠÙˆÙ…', en:'Day', es:'DÃ­a', pt:'Dia', tr:'GÃ¼n'}))}
          {presetBtn('week', tx(lang, {fr:'Semaine', ar:'Ø£Ø³Ø¨ÙˆØ¹', en:'Week', es:'Semana', pt:'Semana', tr:'Hafta'}))}
          {presetBtn('month', tx(lang, {fr:'Mois', ar:'Ø´Ù‡Ø±', en:'Month', es:'Mes', pt:'MÃªs', tr:'Ay'}))}
          {presetBtn('range', tx(lang, {fr:'PÃ©riode', ar:'ÙØªØ±Ø©', en:'Period', es:'PerÃ­odo', pt:'PerÃ­odo', tr:'DÃ¶nem'}))}
        </div>
        {dataMin && dataMax ? (
          <div className="flex flex-col gap-2.5">
            {preset === 'day' ? (
              <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-dk-text-soft">
                <span className="text-slate-500 dark:text-dk-muted font-semibold shrink-0">{tx(lang, {fr:'Date :', ar:'Ø§Ù„ØªØ§Ø±ÙŠØ® :', en:'Date:', es:'Fecha:', pt:'Data:', tr:'Tarih:'})}</span>
                <select
                  value={dayPick || dataMin}
                  onChange={e => setDayPick(e.target.value)}
                  className="min-w-[140px] rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-2 py-1.5 text-xs font-bold text-slate-800 dark:text-dk-text"
                >
                  {unionDates.map(d => (
                    <option key={d} value={d}>
                      {formatDateDdMmYyyy(d)} ({getFrenchWeekday(d, lang).slice(0, 3)})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {preset === 'week' ? (
              <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-dk-text-soft">
                <span className="text-slate-500 dark:text-dk-muted font-semibold shrink-0">{tx(lang, {fr:'Semaine :', ar:'Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ :', en:'Week:', es:'Semana:', pt:'Semana:', tr:'Hafta:'})}</span>
                {weekOptions.length > 0 ? (
                  <select
                    value={weekStartMonday || weekOptions[0] || ''}
                    onChange={e => setWeekStartMonday(e.target.value)}
                    className="min-w-[220px] max-w-full flex-1 rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-2 py-1.5 text-xs font-bold text-slate-800 dark:text-dk-text"
                  >
                    {weekOptions.map(ws => {
                      const we = addDaysIso(ws, 6);
                      return (
                        <option key={ws} value={ws}>
                          {formatDateDdMmYyyy(ws)} â†’ {formatDateDdMmYyyy(we)}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-dk-muted">â€”</span>
                )}
              </label>
            ) : null}
            {preset === 'month' ? (
              <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-dk-text-soft">
                <span className="text-slate-500 dark:text-dk-muted font-semibold shrink-0">{tx(lang, {fr:'Mois :', ar:'Ø§Ù„Ø´Ù‡Ø± :', en:'Month:', es:'Mes:', pt:'MÃªs:', tr:'Ay:'})}</span>
                {monthOptions.length > 0 ? (
                  <select
                    value={monthYm || monthOptions[0] || ''}
                    onChange={e => setMonthYm(e.target.value)}
                    className="min-w-[120px] rounded-lg border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg px-2 py-1.5 text-xs font-bold text-slate-800 dark:text-dk-text"
                  >
                    {monthOptions.map(ym => (
                      <option key={ym} value={ym}>
                        {ym}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-dk-muted">â€”</span>
                )}
              </label>
            ) : null}
            {preset === 'range' ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-[10px] font-bold text-slate-500 dark:text-dk-muted">
                  {tx(lang, {fr:'DÃ©but', ar:'Ø§Ù„Ø¨Ø¯Ø§ÙŠØ©', en:'Start', es:'Inicio', pt:'InÃ­cio', tr:'BaÅŸlangÄ±Ã§'})}
                  <input
                    type="date"
                    value={rangeStart || dataMin}
                    min={dataMin}
                    max={dataMax}
                    onChange={e => setRangeStart(e.target.value)}
                    className="rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-2 py-1.5 text-xs font-bold text-slate-800 dark:text-dk-text"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px] font-bold text-slate-500 dark:text-dk-muted">
                  {tx(lang, {fr:'Fin', ar:'Ø§Ù„Ù†Ù‡Ø§ÙŠØ©', en:'End', es:'Fin', pt:'Fim', tr:'BitiÅŸ'})}
                  <input
                    type="date"
                    value={rangeEnd || dataMax}
                    min={dataMin}
                    max={dataMax}
                    onChange={e => setRangeEnd(e.target.value)}
                    className="rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-2 py-1.5 text-xs font-bold text-slate-800 dark:text-dk-text"
                  />
                </label>
              </div>
            ) : null}
            <p className="text-[10px] font-semibold text-slate-500 dark:text-dk-muted leading-snug">{periodSummary}</p>
          </div>
        ) : (
          <p className="text-[10px] font-semibold text-slate-400 dark:text-dk-muted">{tx(lang, {fr:'Aucune date â€” filtres indisponibles.', ar:'Ù„Ø§ ØªÙˆØ¬Ø¯ ØªÙˆØ§Ø±ÙŠØ® â€” Ø§Ù„ØªØµÙÙŠØ© ØºÙŠØ± Ù…ØªØ§Ø­Ø©.', en:'No dates â€” filters unavailable.', es:'Sin fechas â€” filtros no disponibles.', pt:'Nenhuma data â€” filtros indisponÃ­veis.', tr:'Tarih yok â€” filtreler kullanÄ±lamÄ±yor.'})}</p>
        )}
      </div>

      <JournalierTableBlock
        eyebrow={tx(lang, {fr:'Tableau 1 â€” suivi modÃ¨le / OF', ar:'Ø§Ù„Ø¬Ø¯ÙˆÙ„ 1 â€” Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ / Ø£Ù…Ø± Ø§Ù„ØªØµÙ†ÙŠØ¹', en:'Table 1 â€” model / WO tracking', es:'Tabla 1 â€” seguimiento modelo / OF', pt:'Tabela 1 â€” acompanhamento modelo / OF', tr:'Tablo 1 â€” model / Ä°E takibi'})}
        title={tx(lang, {fr:'Cet OF (lignes journaliÃ¨res complÃ¨tes)', ar:'Ù‡Ø°Ø§ Ø§Ù„Ø£Ù…Ø± (Ø§Ù„Ø£Ø³Ø·Ø± Ø§Ù„ÙŠÙˆÙ…ÙŠØ© Ø§Ù„ÙƒØ§Ù…Ù„Ø©)', en:'This WO (complete daily rows)', es:'Esta OF (lÃ­neas diarias completas)', pt:'Esta OF (linhas diÃ¡rias completas)', tr:'Bu Ä°E (tam gÃ¼nlÃ¼k satÄ±rlar)'})}
        hint={tx(lang, {fr:'Uniquement les enregistrements suivi rattachÃ©s Ã  l\'ordre de fabrication ouvert.', ar:'ÙÙ‚Ø· Ø³Ø¬Ù„Ø§Øª Ø§Ù„Ù…ØªØ§Ø¨Ø¹Ø© Ø§Ù„Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ø£Ù…Ø± Ø§Ù„ØªØµÙ†ÙŠØ¹ Ø§Ù„Ù…ÙØªÙˆØ­.', en:'Only the tracking records attached to the open manufacturing order.', es:'Solo los registros de seguimiento vinculados a la orden de fabricaciÃ³n abierta.', pt:'Apenas os registos de acompanhamento vinculados Ã  ordem de fabrico aberta.', tr:'YalnÄ±zca aÃ§Ä±k Ã¼retim emrine baÄŸlÄ± takip kayÄ±tlarÄ±.'})}
        rows={ofRowsFiltered}
        showModelColumn={false}
        hours={hours}
        hourKeys={hourKeys}
        suivis={suivis}
        planningEvents={planningEvents}
        chaineId={chaineId}
        models={models}
        emptyText={tx(lang, {fr:'Aucune ligne journaliÃ¨re pour cet OF â€” utilisez la matrice de saisie ciâ€‘dessous pour crÃ©er des jours.', ar:'Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ø³Ø·Ø± ÙŠÙˆÙ…ÙŠ Ù„Ù‡Ø°Ø§ Ø§Ù„Ø£Ù…Ø± â€” Ø§Ø³ØªØ®Ø¯Ù… Ù…ØµÙÙˆÙØ© Ø§Ù„Ø¥Ø¯Ø®Ø§Ù„ Ø£Ø¯Ù†Ø§Ù‡ Ù„Ø¥Ù†Ø´Ø§Ø¡ Ø§Ù„Ø£ÙŠØ§Ù….', en:'No daily row for this WO â€” use the input matrix below to create days.', es:'Ninguna lÃ­nea diaria para esta OF â€” use la matriz de ingreso a continuaciÃ³n para crear dÃ­as.', pt:'Nenhuma linha diÃ¡ria para esta OF â€” use a matriz de entrada abaixo para criar dias.', tr:'Bu Ä°E iÃ§in gÃ¼nlÃ¼k satÄ±r yok â€” gÃ¼n oluÅŸturmak iÃ§in aÅŸaÄŸÄ±daki giriÅŸ matrisini kullanÄ±n.'})}
        onUpdateHourly={onUpdateHourly}
      />

      <JournalierTableBlock
        eyebrow={tx(lang, {fr:'Tableau 2 â€” chaÃ®ne liÃ©e', ar:'Ø§Ù„Ø¬Ø¯ÙˆÙ„ 2 â€” Ø§Ù„Ø®Ø· Ø§Ù„Ù…Ø±ØªØ¨Ø·', en:'Table 2 â€” linked line', es:'Tabla 2 â€” lÃ­nea vinculada', pt:'Tabela 2 â€” linha vinculada', tr:'Tablo 2 â€” baÄŸlÄ± hat'})}
        title={`${chainLabel} â€” ${tx(lang, {fr:'tous les OF (mÃªme pÃ©riode)', ar:'Ø¬Ù…ÙŠØ¹ Ø£ÙˆØ§Ù…Ø± Ø§Ù„ØªØµÙ†ÙŠØ¹ (Ù†ÙØ³ Ø§Ù„ÙØªØ±Ø©)', en:'all WOs (same period)', es:'todas las OF (mismo perÃ­odo)', pt:'todas as OF (mesmo perÃ­odo)', tr:'tÃ¼m Ä°E\'ler (aynÄ± dÃ¶nem)'})}`}
        hint={tx(lang, {fr:'MÃªme plage de dates que ciâ€‘dessus ; inclut les autres modÃ¨les planifiÃ©s sur cette chaÃ®ne. Colonne MODÃˆLE pour distinguer les OF.', ar:'Ù†ÙØ³ Ù†Ø·Ø§Ù‚ Ø§Ù„ØªÙˆØ§Ø±ÙŠØ® Ø£Ø¹Ù„Ø§Ù‡Ø› ÙŠØ´Ù…Ù„ Ø§Ù„Ù†Ù…Ø§Ø°Ø¬ Ø§Ù„Ø£Ø®Ø±Ù‰ Ø§Ù„Ù…Ø®Ø·Ø· Ù„Ù‡Ø§ Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø®Ø·. Ø¹Ù…ÙˆØ¯ Ø§Ù„Ù†Ù…ÙˆØ°Ø¬ Ù„ØªÙ…ÙŠÙŠØ² Ø£ÙˆØ§Ù…Ø± Ø§Ù„ØªØµÙ†ÙŠØ¹.', en:'Same date range as above; includes other models scheduled on this line. MODEL column to distinguish WOs.', es:'Mismo rango de fechas que arriba; incluye otros modelos planificados en esta lÃ­nea. Columna MODELO para distinguir las OF.', pt:'Mesmo intervalo de datas acima; inclui outros modelos planeados nesta linha. Coluna MODELO para distinguir as OF.', tr:'YukarÄ±dakiyle aynÄ± tarih aralÄ±ÄŸÄ±; bu hatta planlanan diÄŸer modelleri iÃ§erir. Ä°E\'leri ayÄ±rt etmek iÃ§in MODEL sÃ¼tunu.'})}
        rows={chainRowsFiltered}
        showModelColumn
        hours={hours}
        hourKeys={hourKeys}
        suivis={suivis}
        planningEvents={planningEvents}
        chaineId={chaineId}
        models={models}
        emptyText={tx(lang, {fr:'Aucune saisie suivi sur cette chaÃ®ne pour cette pÃ©riode (ou la chaÃ®ne n\'a pas d\'autres OF saisis).', ar:'Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¥Ø¯Ø®Ø§Ù„Ø§Øª Ù…ØªØ§Ø¨Ø¹Ø© Ø¹Ù„Ù‰ Ù‡Ø°Ø§ Ø§Ù„Ø®Ø· Ù„Ù‡Ø°Ù‡ Ø§Ù„ÙØªØ±Ø© (Ø£Ùˆ Ø§Ù„Ø®Ø· Ù„ÙŠØ³ Ù„Ø¯ÙŠÙ‡ Ø£ÙˆØ§Ù…Ø± ØªØµÙ†ÙŠØ¹ Ø£Ø®Ø±Ù‰ Ù…Ø¯Ø®Ù„Ø©).', en:'No tracking entries on this line for this period (or the line has no other WOs entered).', es:'Ninguna entrada de seguimiento en esta lÃ­nea para este perÃ­odo (o la lÃ­nea no tiene otras OF ingresadas).', pt:'Nenhuma entrada de acompanhamento nesta linha para este perÃ­odo (ou a linha nÃ£o tem outras OF inseridas).', tr:'Bu dÃ¶nem iÃ§in bu hatta takip giriÅŸi yok (veya hatta girilmiÅŸ baÅŸka Ä°E yok).'})}
        onUpdateHourly={onUpdateHourly}
      />
    </div>
  );
}
