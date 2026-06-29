import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange } from 'lucide-react';
import type { ModelData, PlanningEvent, SuiviData } from '../types';
import { resolveSuiviContext } from '../lib/suiviContextResolver';
import { useLang } from '../src/context/LanguageContext';
import { tx, type Lang } from '../lib/i18n';

function getFrenchWeekday(dateStr: string, lang?: Lang): string {
  const days: Record<string, string[]> = {
    fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
    ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    pt: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
    tr: ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
  };
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return (days[lang || 'fr'] || days.fr)[d.getDay()] || '—';
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
  if (!mid) return '—';
  const m = models.find(x => x.id === mid);
  return (m?.meta_data?.nom_modele || m?.filename || mid).trim() || '—';
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
              <th className="px-2 py-2 text-center font-black border-r border-slate-600/50 w-[88px]">{tx(lang, {fr:'DATE', ar:'التاريخ', en:'DATE', es:'FECHA', pt:'DATA', tr:'TARİH'})}</th>
              <th className="px-2 py-2 text-center font-black border-r border-slate-600/50 w-[72px]">{tx(lang, {fr:'JOUR', ar:'اليوم', en:'DAY', es:'DÍA', pt:'DIA', tr:'GÜN'})}</th>
              {showModelColumn ? (
                <th className="px-2 py-2 text-left font-black border-r border-slate-600/50 min-w-[100px] max-w-[160px]">
                  {tx(lang, {fr:'MODÈLE', ar:'النموذج', en:'MODEL', es:'MODELO', pt:'MODELO', tr:'MODEL'})}
                </th>
              ) : null}
              {hours.map(h => (
                <th key={h} className="px-1 py-2 text-center font-black border-r border-slate-600/50 whitespace-nowrap">
                  {h}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-black border-r border-slate-600/50 bg-emerald-900/40">{tx(lang, {fr:'P. JOURN.', ar:'إ. الي.', en:'P. DAY', es:'P. DÍA', pt:'P. DIA', tr:'G. T.'})}</th>
              <th className="px-2 py-2 text-center font-black bg-amber-900/30">{tx(lang, {fr:'CRÉN.', ar:'فترات', en:'SLOTS', es:'RAN.', pt:'SLOT', tr:'ARAL.'})}</th>
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
                        ? tx(lang, {fr:'Autre OF sur cette chaîne a aussi de la production sur ce créneau — vérifiez le planning.', ar:'أمر تصنيع آخر على هذا الخط لديه إنتاج في هذه الفترة — تحقق من التخطيط.', en:'Another WO on this line also has production on this slot — check the schedule.', es:'Otra OF en esta línea también tiene producción en este horario — verifique la planificación.', pt:'Outra OF nesta linha também tem produção neste horário — verifique o planejamento.', tr:'Bu hattaki başka bir İE\'nin de bu aralıkta üretimi var — planlamayı kontrol edin.'})
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
                                placeholder="—"
                                aria-label={`${tx(lang, {fr:'Pièces', ar:'قطع', en:'Pieces', es:'Piezas', pt:'Peças', tr:'Parçalar'})} ${k} ${formatDateDdMmYyyy(s.date)}`}
                              />
                              {conflict ? <AlertTriangle className="w-3 h-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden /> : null}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center gap-0.5">
                              {show ? v : '—'}
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
                  {tx(lang, {fr:'Total', ar:'المجموع', en:'Total', es:'Total', pt:'Total', tr:'Toplam'})}
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
      ? `${tx(lang, {fr:'Période affichée', ar:'الفترة المعروضة', en:'Displayed period', es:'Período mostrado', pt:'Período exibido', tr:'Görüntülenen dönem'})} : ${formatDateDdMmYyyy(dataMin)} → ${formatDateDdMmYyyy(dataMax)} ${tx(lang, {fr:'(toutes les lignes)', ar:'(جميع الأسطر)', en:'(all rows)', es:'(todas las filas)', pt:'(todas as linhas)', tr:'(tüm satırlar)'})}.`
      : `${tx(lang, {fr:'Période affichée', ar:'الفترة المعروضة', en:'Displayed period', es:'Período mostrado', pt:'Período exibido', tr:'Görüntülenen dönem'})} : ${formatDateDdMmYyyy(activeBounds.min)} → ${formatDateDdMmYyyy(activeBounds.max)}.`;

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
        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted">{tx(lang, {fr:'Journalier — vue liée', ar:'يومي — عرض مرتبط', en:'Daily — linked view', es:'Diario — vista vinculada', pt:'Diário — vista vinculada', tr:'Günlük — bağlı görünüm'})}</h3>
        <p className="text-xs font-bold text-slate-800 dark:text-dk-text mt-0.5">
          {modelLabel}
          <span className="text-slate-400 dark:text-dk-muted font-semibold mx-1">·</span>
          <span className="text-indigo-700 dark:text-dk-accent-text">{chainLabel}</span>
        </p>
        <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-1 max-w-prose leading-snug">
          {tx(lang, {fr:'Les', ar:'تم', en:'The', es:'Los', pt:'Os', tr:''})}{' '}
          <strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang, {fr:'deux tableaux', ar:'الجدولان', en:'two tables', es:'dos tablas', pt:'duas tabelas', tr:'iki tablo'})}</strong>{' '}
          {tx(lang, {fr:'sont affichés ensemble : suivi', ar:'معروضان معاً: متابعة', en:'are displayed together: tracking', es:'se muestran juntos: seguimiento', pt:'são exibidos juntos: acompanhamento', tr:'birlikte görüntülenir: takip'})}{' '}
          <strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang, {fr:'de cet OF', ar:'لهذا الأمر', en:'of this WO', es:'de esta OF', pt:'desta OF', tr:'bu İE\'nin'})}</strong>{' '}
          {tx(lang, {fr:', puis suivi', ar:'، ثم متابعة', en:', then tracking', es:', luego seguimiento', pt:', depois acompanhamento', tr:', ardından takip'})}{' '}
          <strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang, {fr:'de toute la chaîne', ar:'للخط بأكمله', en:'of the entire line', es:'de toda la línea', pt:'de toda a linha', tr:'tüm hattın'})}</strong>{' '}
          {tx(lang, {fr:'sur la même période (dates des lignes journalières de l\'OF). Même logique Excel (P. jour. = somme des créneaux ≥ 0 ; Créneaux = nombre de créneaux saisis).', ar:'على نفس الفترة (تواريخ الأسطر اليومية لأمر التصنيع). نفس منطق Excel (إ. الي. = مجموع الفترات ≥ 0 ; الفترات = عدد الفترات المدخلة).', en:'over the same period (daily row dates of the WO). Same Excel logic (P. day = sum of slots ≥ 0 ; Slots = number of entered slots).', es:'en el mismo período (fechas de las líneas diarias de la OF). Misma lógica de Excel (P. día = suma de ranuras ≥ 0 ; Ranuras = número de ranuras ingresadas).', pt:'no mesmo período (datas das linhas diárias da OF). Mesma lógica Excel (P. dia = soma dos slots ≥ 0 ; Slots = número de slots inseridos).', tr:'aynı dönemde (İE\'nin günlük satır tarihleri). Aynı Excel mantığı (G. T. = aralık toplamı ≥ 0 ; Aralıklar = girilen aralık sayısı).'})}{' '}
          <strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang, {fr:'Filtre', ar:'التصفية', en:'Filter', es:'Filtro', pt:'Filtro', tr:'Filtre'})}</strong>{' '}
          {tx(lang, {fr:': jour, semaine (lundi–dimanche), mois calendaire, ou plage libre — appliqué aux', ar:': يوم، أسبوع (الاثنين–الأحد)، شهر تقويمي، أو نطاق حر — يُطبق على', en:': day, week (Mon–Sun), calendar month, or free range — applied to', es:': día, semana (lun–dom), mes calendario, o rango libre — aplicado a', pt:': dia, semana (seg–dom), mês calendário, ou intervalo livre — aplicado às', tr:': gün, hafta (Pzt–Paz), takvim ayı veya serbest aralık — uygulanan'})}{' '}
          <strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang, {fr:'deux', ar:'الجدولين', en:'both', es:'ambas', pt:'ambas', tr:'her iki'})}</strong>{' '}
          {tx(lang, {fr:'tableaux.', ar:'الجدولين.', en:'tables.', es:'tablas.', pt:'tabelas.', tr:'tabloya.'})}
          {onUpdateHourly ? (
            <>
              {' '}
              <strong className="text-slate-700 dark:text-dk-text-soft">{tx(lang, {fr:'Saisie', ar:'الإدخال', en:'Entry', es:'Ingreso', pt:'Entrada', tr:'Giriş'})}</strong>{' '}
              {tx(lang, {fr:': les créneaux sont modifiables ici (même enregistrement que la matrice ci‑dessous).', ar:': الفترات قابلة للتعديل هنا (نفس حفظ مصفوفة الإدخال أدناه).', en:': slots can be edited here (same saving as the input matrix below).', es:': los horarios se pueden modificar aquí (mismo guardado que la matriz de abajo).', pt:': os slots podem ser editados aqui (mesmo salvamento da matriz abaixo).', tr:': aralıklar burada düzenlenebilir (aşağıdaki giriş matrisi ile aynı kaydetme).'})}
            </>
          ) : null}
        </p>
      </div>

      <div className="px-4 py-3 border-b border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <CalendarRange className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted shrink-0" aria-hidden />
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted">{tx(lang, {fr:'Filtrer les tableaux', ar:'تصفية الجداول', en:'Filter tables', es:'Filtrar tablas', pt:'Filtrar tabelas', tr:'Tabloları filtrele'})}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {presetBtn('all', tx(lang, {fr:'Tout', ar:'الكل', en:'All', es:'Todo', pt:'Tudo', tr:'Tümü'}))}
          {presetBtn('day', tx(lang, {fr:'Jour', ar:'يوم', en:'Day', es:'Día', pt:'Dia', tr:'Gün'}))}
          {presetBtn('week', tx(lang, {fr:'Semaine', ar:'أسبوع', en:'Week', es:'Semana', pt:'Semana', tr:'Hafta'}))}
          {presetBtn('month', tx(lang, {fr:'Mois', ar:'شهر', en:'Month', es:'Mes', pt:'Mês', tr:'Ay'}))}
          {presetBtn('range', tx(lang, {fr:'Période', ar:'فترة', en:'Period', es:'Período', pt:'Período', tr:'Dönem'}))}
        </div>
        {dataMin && dataMax ? (
          <div className="flex flex-col gap-2.5">
            {preset === 'day' ? (
              <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-dk-text-soft">
                <span className="text-slate-500 dark:text-dk-muted font-semibold shrink-0">{tx(lang, {fr:'Date :', ar:'التاريخ :', en:'Date:', es:'Fecha:', pt:'Data:', tr:'Tarih:'})}</span>
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
                <span className="text-slate-500 dark:text-dk-muted font-semibold shrink-0">{tx(lang, {fr:'Semaine :', ar:'الأسبوع :', en:'Week:', es:'Semana:', pt:'Semana:', tr:'Hafta:'})}</span>
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
                          {formatDateDdMmYyyy(ws)} → {formatDateDdMmYyyy(we)}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-dk-muted">—</span>
                )}
              </label>
            ) : null}
            {preset === 'month' ? (
              <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-dk-text-soft">
                <span className="text-slate-500 dark:text-dk-muted font-semibold shrink-0">{tx(lang, {fr:'Mois :', ar:'الشهر :', en:'Month:', es:'Mes:', pt:'Mês:', tr:'Ay:'})}</span>
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
                  <span className="text-xs text-slate-400 dark:text-dk-muted">—</span>
                )}
              </label>
            ) : null}
            {preset === 'range' ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-[10px] font-bold text-slate-500 dark:text-dk-muted">
                  {tx(lang, {fr:'Début', ar:'البداية', en:'Start', es:'Inicio', pt:'Início', tr:'Başlangıç'})}
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
                  {tx(lang, {fr:'Fin', ar:'النهاية', en:'End', es:'Fin', pt:'Fim', tr:'Bitiş'})}
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
          <p className="text-[10px] font-semibold text-slate-400 dark:text-dk-muted">{tx(lang, {fr:'Aucune date — filtres indisponibles.', ar:'لا توجد تواريخ — التصفية غير متاحة.', en:'No dates — filters unavailable.', es:'Sin fechas — filtros no disponibles.', pt:'Nenhuma data — filtros indisponíveis.', tr:'Tarih yok — filtreler kullanılamıyor.'})}</p>
        )}
      </div>

      <JournalierTableBlock
        eyebrow={tx(lang, {fr:'Tableau 1 — suivi modèle / OF', ar:'الجدول 1 — متابعة النموذج / أمر التصنيع', en:'Table 1 — model / WO tracking', es:'Tabla 1 — seguimiento modelo / OF', pt:'Tabela 1 — acompanhamento modelo / OF', tr:'Tablo 1 — model / İE takibi'})}
        title={tx(lang, {fr:'Cet OF (lignes journalières complètes)', ar:'هذا الأمر (الأسطر اليومية الكاملة)', en:'This WO (complete daily rows)', es:'Esta OF (líneas diarias completas)', pt:'Esta OF (linhas diárias completas)', tr:'Bu İE (tam günlük satırlar)'})}
        hint={tx(lang, {fr:'Uniquement les enregistrements suivi rattachés à l\'ordre de fabrication ouvert.', ar:'فقط سجلات المتابعة المرتبطة بأمر التصنيع المفتوح.', en:'Only the tracking records attached to the open manufacturing order.', es:'Solo los registros de seguimiento vinculados a la orden de fabricación abierta.', pt:'Apenas os registos de acompanhamento vinculados à ordem de fabrico aberta.', tr:'Yalnızca açık üretim emrine bağlı takip kayıtları.'})}
        rows={ofRowsFiltered}
        showModelColumn={false}
        hours={hours}
        hourKeys={hourKeys}
        suivis={suivis}
        planningEvents={planningEvents}
        chaineId={chaineId}
        models={models}
        emptyText={tx(lang, {fr:'Aucune ligne journalière pour cet OF — utilisez la matrice de saisie ci‑dessous pour créer des jours.', ar:'لا يوجد سطر يومي لهذا الأمر — استخدم مصفوفة الإدخال أدناه لإنشاء الأيام.', en:'No daily row for this WO — use the input matrix below to create days.', es:'Ninguna línea diaria para esta OF — use la matriz de ingreso a continuación para crear días.', pt:'Nenhuma linha diária para esta OF — use a matriz de entrada abaixo para criar dias.', tr:'Bu İE için günlük satır yok — gün oluşturmak için aşağıdaki giriş matrisini kullanın.'})}
        onUpdateHourly={onUpdateHourly}
      />

      <JournalierTableBlock
        eyebrow={tx(lang, {fr:'Tableau 2 — chaîne liée', ar:'الجدول 2 — الخط المرتبط', en:'Table 2 — linked line', es:'Tabla 2 — línea vinculada', pt:'Tabela 2 — linha vinculada', tr:'Tablo 2 — bağlı hat'})}
        title={`${chainLabel} — ${tx(lang, {fr:'tous les OF (même période)', ar:'جميع أوامر التصنيع (نفس الفترة)', en:'all WOs (same period)', es:'todas las OF (mismo período)', pt:'todas as OF (mesmo período)', tr:'tüm İE\'ler (aynı dönem)'})}`}
        hint={tx(lang, {fr:'Même plage de dates que ci‑dessus ; inclut les autres modèles planifiés sur cette chaîne. Colonne MODÈLE pour distinguer les OF.', ar:'نفس نطاق التواريخ أعلاه؛ يشمل النماذج الأخرى المخطط لها على هذا الخط. عمود النموذج لتمييز أوامر التصنيع.', en:'Same date range as above; includes other models scheduled on this line. MODEL column to distinguish WOs.', es:'Mismo rango de fechas que arriba; incluye otros modelos planificados en esta línea. Columna MODELO para distinguir las OF.', pt:'Mesmo intervalo de datas acima; inclui outros modelos planeados nesta linha. Coluna MODELO para distinguir as OF.', tr:'Yukarıdakiyle aynı tarih aralığı; bu hatta planlanan diğer modelleri içerir. İE\'leri ayırt etmek için MODEL sütunu.'})}
        rows={chainRowsFiltered}
        showModelColumn
        hours={hours}
        hourKeys={hourKeys}
        suivis={suivis}
        planningEvents={planningEvents}
        chaineId={chaineId}
        models={models}
        emptyText={tx(lang, {fr:'Aucune saisie suivi sur cette chaîne pour cette période (ou la chaîne n\'a pas d\'autres OF saisis).', ar:'لا توجد إدخالات متابعة على هذا الخط لهذه الفترة (أو الخط ليس لديه أوامر تصنيع أخرى مدخلة).', en:'No tracking entries on this line for this period (or the line has no other WOs entered).', es:'Ninguna entrada de seguimiento en esta línea para este período (o la línea no tiene otras OF ingresadas).', pt:'Nenhuma entrada de acompanhamento nesta linha para este período (ou a linha não tem outras OF inseridas).', tr:'Bu dönem için bu hatta takip girişi yok (veya hatta girilmiş başka İE yok).'})}
        onUpdateHourly={onUpdateHourly}
      />
    </div>
  );
}
