import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, X } from 'lucide-react';

/* ─── Types ─── */
export interface SaasColumn<T = any> {
  key: string;
  label: string;
  /** Custom render function */
  render?: (value: any, row: T, index: number) => React.ReactNode;
  /** Sort comparator — enables sorting */
  sortable?: boolean;
  /** Right-align numbers */
  align?: 'left' | 'center' | 'right';
  /** Column width */
  width?: string;
  /** Truncate long text */
  truncate?: boolean;
  /** Tabular numbers for financial/data columns */
  tabular?: boolean;
}

export interface SaasTableProps<T = any> {
  columns: SaasColumn<T>[];
  data: T[];
  /** Unique key accessor */
  rowKey: string | ((row: T) => string);
  /** Show search filter */
  searchable?: boolean;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Searchable fields (defaults to all string columns) */
  searchFields?: string[];
  /** Compact rows */
  compact?: boolean;
  /** Striped rows */
  striped?: boolean;
  /** Row click handler */
  onRowClick?: (row: T, index: number) => void;
  /** Selected rows */
  selectedRows?: string[];
  /** Selection change handler */
  onSelectionChange?: (keys: string[]) => void;
  /** Enable row selection */
  selectable?: boolean;
  /** Empty state */
  emptyMessage?: string;
  /** Footer */
  footer?: React.ReactNode;
  /** Max height with scroll */
  maxHeight?: string;
  /** Show row numbers */
  showRowNumbers?: boolean;
}

/* ─── Component ─── */
export default function SaasTable<T extends Record<string, any>>({
  columns,
  data,
  rowKey,
  searchable = false,
  searchPlaceholder = 'Rechercher...',
  searchFields,
  compact = false,
  striped = false,
  onRowClick,
  selectedRows = [],
  onSelectionChange,
  selectable = false,
  emptyMessage = 'Aucune donnée',
  footer,
  maxHeight,
  showRowNumbers = false,
}: SaasTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');

  /* ── Get row key ── */
  const getKey = (row: T): string =>
    typeof rowKey === 'function' ? rowKey(row) : String(row[rowKey]);

  /* ── Search ── */
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    const fields =
      searchFields ||
      columns.filter((c) => !c.render).map((c) => c.key);
    return data.filter((row) =>
      fields.some((f) => String(row[f] ?? '').toLowerCase().includes(q))
    );
  }, [data, search, searchFields, columns]);

  /* ── Sort ── */
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va;
      }
      const cmp = String(va).localeCompare(String(vb), 'fr');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  /* ── Sort toggle ── */
  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  /* ── Selection ── */
  const allKeys = sorted.map(getKey);
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selectedRows.includes(k));

  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? [] : allKeys);
  };

  const toggleRow = (key: string) => {
    if (!onSelectionChange) return;
    onSelectionChange(
      selectedRows.includes(key)
        ? selectedRows.filter((k) => k !== key)
        : [...selectedRows, key]
    );
  };

  /* ── Alignment ── */
  const alignClass = (a?: string) => {
    if (a === 'right') return 'text-right';
    if (a === 'center') return 'text-center';
    return 'text-left';
  };

  return (
    <div className="w-full">
      {/* Search bar */}
      {searchable && (
        <div className="mb-3">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="
                w-full h-8 pl-8 pr-8 text-[12px] text-slate-700 dark:text-dk-text-soft
                bg-slate-50/60 border border-slate-200 rounded-md dark:bg-dk-bg/60 dark:border-dk-border
                placeholder:text-slate-400 dark:placeholder:text-dk-muted
                focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 focus:outline-none dark:focus:bg-dk-surface dark:focus:border-dk-border dark:focus:ring-white/10
                transition-all duration-150
              "
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-dk-muted dark:hover:text-dk-text-soft"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div
        className={`
          w-full border border-slate-200 rounded-lg overflow-hidden dark:border-dk-border
          ${maxHeight ? 'overflow-y-auto' : ''}
        `}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <table className="w-full border-collapse">
          {/* Header */}
          <thead className="bg-slate-50/60 sticky top-0 z-10 dark:bg-dk-bg/60">
            <tr className="border-b border-slate-100 dark:border-dk-border">
              {selectable && (
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                          className="w-3.5 h-3.5 rounded border-slate-300 accent-slate-900 dark:border-dk-border"
                  />
                </th>
              )}
              {showRowNumbers && (
                <th className="w-10 px-3 py-2.5 text-[10px] font-medium text-slate-400 uppercase tracking-wide text-center dark:text-dk-muted">
                  #
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`
                    px-4 py-2.5 text-[11px] font-medium text-slate-500 uppercase tracking-wide dark:text-dk-muted
                    border-b border-slate-100 dark:border-dk-border
                    ${alignClass(col.align)}
                    ${col.sortable ? 'cursor-pointer hover:text-slate-700 select-none' : ''}
                  `}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <span className="text-slate-300 dark:text-dk-muted">
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-3 h-3" />
                        )}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
            {sorted.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    columns.length + (selectable ? 1 : 0) + (showRowNumbers ? 1 : 0)
                  }
                  className="px-4 py-12 text-center text-[13px] text-slate-400 dark:text-dk-muted"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sorted.map((row, idx) => {
                const key = getKey(row);
                const isSelected = selectedRows.includes(key);

                return (
                  <tr
                    key={key}
                    className={`
                      ${striped && idx % 2 === 1 ? 'bg-slate-50/30 dark:bg-dk-bg/30' : ''}
                      ${onRowClick ? 'cursor-pointer hover:bg-slate-50/50 dark:hover:bg-dk-elevated/30' : ''}
                      ${isSelected ? 'bg-slate-50 dark:bg-dk-elevated/40' : ''}
                      transition-colors duration-100
                    `}
                    onClick={() => onRowClick?.(row, idx)}
                  >
                    {selectable && (
                      <td className="w-10 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(key)}
                          onClick={(e) => e.stopPropagation()}
                className="w-3.5 h-3.5 rounded border-slate-300 accent-slate-900 dark:border-dk-border"
                        />
                      </td>
                    )}
                    {showRowNumbers && (
                      <td className="w-10 px-3 py-2.5 text-[11px] text-slate-400 text-center tabular-nums dark:text-dk-muted">
                        {idx + 1}
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`
                          ${compact ? 'px-3 py-2' : 'px-4 py-2.5'}
                          text-[12px] text-slate-700 dark:text-dk-text-soft
                          ${alignClass(col.align)}
                          ${col.tabular ? 'tabular-nums' : ''}
                          ${col.truncate ? 'truncate max-w-[200px]' : ''}
                        `}
                      >
                        {col.render
                          ? col.render(row[col.key], row, idx)
                          : (row[col.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {footer && (
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-dk-text-soft">
          {footer}
        </div>
      )}
    </div>
  );
}
