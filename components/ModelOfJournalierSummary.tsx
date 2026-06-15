import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange } from 'lucide-react';
import type { ModelData, PlanningEvent, SuiviData } from '../types';
import { resolveSuiviContext } from '../lib/suiviContextResolver';

function getFrenchWeekday(dateStr: string): string {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return days[d.getDay()] || '—';
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

/** Lundi = début de semaine (usage atelier FR). */
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
  /** Si défini : saisie des pièces par créneau (même logique que la matrice principale). */
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
  const conflictMap = useMemo(
    () => buildConflictMap(rows, hourKeys, suivis, planningEvents, chaineId),
    [rows, hourKeys, suivis, planningEvents, chaineId],
  );
  const footer = useMemo(() => buildFooter(rows, hourKeys), [rows, hourKeys]);
  const footerColSpan = showModelColumn ? 3 : 2;

  return (
    <div className="border-t border-slate-200 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 bg-slate-100/70 border-b border-slate-200/80">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{eyebrow}</p>
          <h4 className="text-xs font-black text-slate-900 tracking-tight">{title}</h4>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{hint}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="px-2 py-2 text-center font-black border-r border-slate-600/50 w-[88px]">DATE</th>
              <th className="px-2 py-2 text-center font-black border-r border-slate-600/50 w-[72px]">JOUR</th>
              {showModelColumn ? (
                <th className="px-2 py-2 text-left font-black border-r border-slate-600/50 min-w-[100px] max-w-[160px]">
                  MODÈLE
                </th>
              ) : null}
              {hours.map(h => (
                <th key={h} className="px-1 py-2 text-center font-black border-r border-slate-600/50 whitespace-nowrap">
                  {h}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-black border-r border-slate-600/50 bg-emerald-900/40">P. JOURN.</th>
              <th className="px-2 py-2 text-center font-black bg-amber-900/30">CRÉN.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={footerColSpan + hourKeys.length + 2}
                  className="px-4 py-6 text-center text-xs font-bold text-slate-500 bg-slate-50/50"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map(s => {
                const p = sumSortiesRow(s, hourKeys);
                const c = countActiveSlots(s, hourKeys);
                return (
                  <tr key={s.id} className="bg-white hover:bg-slate-50/80">
                    <td className="px-2 py-1.5 text-center font-mono font-bold text-slate-700 border-r border-slate-100">
                      {formatDateDdMmYyyy(s.date)}
                    </td>
                    <td className="px-2 py-1.5 text-center font-bold text-slate-600 border-r border-slate-100">
                      {getFrenchWeekday(s.date).slice(0, 3)}
                    </td>
                    {showModelColumn ? (
                      <td
                        className="px-2 py-1.5 text-left font-bold text-slate-800 border-r border-slate-100 truncate max-w-[160px]"
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
                        ? 'Autre OF sur cette chaîne a aussi de la production sur ce créneau — vérifiez le planning.'
                        : undefined;
                      const inputCls =
                        'w-full min-w-[2.25rem] max-w-[3.25rem] h-7 mx-auto px-0.5 text-center text-[11px] font-bold rounded border border-slate-200 bg-white text-slate-800 outline-none focus:ring-2 focus:ring-indigo-400/40 focus:border-indigo-400 tabular-nums';
                      return (
                        <td
                          key={k}
                          className={`px-0.5 py-1 text-center font-bold border-r border-slate-100 tabular-nums align-middle ${
                            conflict ? 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-300' : 'text-slate-800'
                          }`}
                          title={cellTitle}
                        >
                          {onUpdateHourly ? (
                            <span className="inline-flex items-center justify-center gap-0.5 w-full">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                className={`${inputCls} ${conflict ? 'border-amber-300 bg-amber-50/80' : ''}`}
                                value={show ? String(v) : ''}
                                onChange={e => onUpdateHourly(s.id, k, e.target.value)}
                                placeholder="—"
                                aria-label={`Pièces ${k} ${formatDateDdMmYyyy(s.date)}`}
                              />
                              {conflict ? <AlertTriangle className="w-3 h-3 shrink-0 text-amber-600" aria-hidden /> : null}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center gap-0.5">
                              {show ? v : '—'}
                              {conflict ? <AlertTriangle className="w-3 h-3 shrink-0 text-amber-600" aria-hidden /> : null}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center font-black text-emerald-800 bg-emerald-50/50 border-r border-slate-100 tabular-nums">
                      {p}
                    </td>
                    <td className="px-2 py-1.5 text-center font-black text-amber-800 bg-amber-50/40 tabular-nums">{c}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300">
                <td
                  colSpan={footerColSpan}
                  className="px-2 py-2 text-right font-black text-slate-600 uppercase text-[10px] border-r border-slate-200"
                >
                  Total
                </td>
                {footer.hourSums.map((sum, i) => (
                  <td key={hourKeys[i]} className="px-1 py-2 text-center font-black text-slate-800 border-r border-slate-200 tabular-nums">
                    {sum > 0 ? sum : ''}
                  </td>
                ))}
                <td className="px-2 py-2 text-center font-black text-emerald-900 bg-emerald-100/60 border-r border-slate-200 tabular-nums">
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

/**
 * Vue **fusionnée** : deux tableaux complets l’un sous l’autre, liés au même contexte
 * (modèle / OF courant + chaîne d’affectation sur la même fenêtre de dates que l’OF).
 */
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
      ? `Période affichée : ${formatDateDdMmYyyy(dataMin)} → ${formatDateDdMmYyyy(dataMax)} (toutes les lignes).`
      : `Période affichée : ${formatDateDdMmYyyy(activeBounds.min)} → ${formatDateDdMmYyyy(activeBounds.max)}.`;

  const presetBtn = (id: PeriodPreset, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setPreset(id)}
      className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-colors ${
        preset === id
          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
        <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500">Journalier — vue liée</h3>
        <p className="text-xs font-bold text-slate-800 mt-0.5">
          {modelLabel}
          <span className="text-slate-400 font-semibold mx-1">·</span>
          <span className="text-indigo-700">{chainLabel}</span>
        </p>
        <p className="text-[10px] text-slate-500 mt-1 max-w-prose leading-snug">
          Les <strong className="text-slate-700">deux tableaux</strong> sont affichés ensemble : suivi <strong className="text-slate-700">de cet OF</strong>, puis suivi{' '}
          <strong className="text-slate-700">de toute la chaîne</strong> sur la même période (dates des lignes journalières de l’OF). Même logique Excel (P. jour. = somme des créneaux ≥ 0 ; Créneaux = nombre de créneaux saisis).{' '}
          <strong className="text-slate-700">Filtre</strong> : jour, semaine (lundi–dimanche), mois calendaire, ou plage libre — appliqué aux <strong className="text-slate-700">deux</strong> tableaux.
          {onUpdateHourly ? (
            <>
              {' '}
              <strong className="text-slate-700">Saisie</strong> : les créneaux sont modifiables ici (même enregistrement que la matrice ci‑dessous).
            </>
          ) : null}
        </p>
      </div>

      <div className="px-4 py-3 border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <CalendarRange className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden />
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Filtrer les tableaux</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {presetBtn('all', 'Tout')}
          {presetBtn('day', 'Jour')}
          {presetBtn('week', 'Semaine')}
          {presetBtn('month', 'Mois')}
          {presetBtn('range', 'Période')}
        </div>
        {dataMin && dataMax ? (
          <div className="flex flex-col gap-2.5">
            {preset === 'day' ? (
              <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-700">
                <span className="text-slate-500 font-semibold shrink-0">Date :</span>
                <select
                  value={dayPick || dataMin}
                  onChange={e => setDayPick(e.target.value)}
                  className="min-w-[140px] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-800"
                >
                  {unionDates.map(d => (
                    <option key={d} value={d}>
                      {formatDateDdMmYyyy(d)} ({getFrenchWeekday(d).slice(0, 3)})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {preset === 'week' ? (
              <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-700">
                <span className="text-slate-500 font-semibold shrink-0">Semaine :</span>
                {weekOptions.length > 0 ? (
                  <select
                    value={weekStartMonday || weekOptions[0] || ''}
                    onChange={e => setWeekStartMonday(e.target.value)}
                    className="min-w-[220px] max-w-full flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-800"
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
                  <span className="text-xs text-slate-400">—</span>
                )}
              </label>
            ) : null}
            {preset === 'month' ? (
              <label className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-700">
                <span className="text-slate-500 font-semibold shrink-0">Mois :</span>
                {monthOptions.length > 0 ? (
                  <select
                    value={monthYm || monthOptions[0] || ''}
                    onChange={e => setMonthYm(e.target.value)}
                    className="min-w-[120px] rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-bold text-slate-800"
                  >
                    {monthOptions.map(ym => (
                      <option key={ym} value={ym}>
                        {ym}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </label>
            ) : null}
            {preset === 'range' ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-[10px] font-bold text-slate-500">
                  Début
                  <input
                    type="date"
                    value={rangeStart || dataMin}
                    min={dataMin}
                    max={dataMax}
                    onChange={e => setRangeStart(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-800"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px] font-bold text-slate-500">
                  Fin
                  <input
                    type="date"
                    value={rangeEnd || dataMax}
                    min={dataMin}
                    max={dataMax}
                    onChange={e => setRangeEnd(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-800"
                  />
                </label>
              </div>
            ) : null}
            <p className="text-[10px] font-semibold text-slate-500 leading-snug">{periodSummary}</p>
          </div>
        ) : (
          <p className="text-[10px] font-semibold text-slate-400">Aucune date — filtres indisponibles.</p>
        )}
      </div>

      <JournalierTableBlock
        eyebrow="Tableau 1 — suivi modèle / OF"
        title="Cet OF (lignes journalières complètes)"
        hint="Uniquement les enregistrements suivi rattachés à l’ordre de fabrication ouvert."
        rows={ofRowsFiltered}
        showModelColumn={false}
        hours={hours}
        hourKeys={hourKeys}
        suivis={suivis}
        planningEvents={planningEvents}
        chaineId={chaineId}
        models={models}
        emptyText="Aucune ligne journalière pour cet OF — utilisez la matrice de saisie ci‑dessous pour créer des jours."
        onUpdateHourly={onUpdateHourly}
      />

      <JournalierTableBlock
        eyebrow="Tableau 2 — chaîne liée"
        title={`${chainLabel} — tous les OF (même période)`}
        hint="Même plage de dates que ci‑dessus ; inclut les autres modèles planifiés sur cette chaîne. Colonne MODÈLE pour distinguer les OF."
        rows={chainRowsFiltered}
        showModelColumn
        hours={hours}
        hourKeys={hourKeys}
        suivis={suivis}
        planningEvents={planningEvents}
        chaineId={chaineId}
        models={models}
        emptyText="Aucune saisie suivi sur cette chaîne pour cette période (ou la chaîne n’a pas d’autres OF saisis)."
        onUpdateHourly={onUpdateHourly}
      />
    </div>
  );
}
