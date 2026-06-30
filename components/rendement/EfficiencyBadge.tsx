import React from 'react';
import { useLang } from '../../src/context/LanguageContext';
import { tx } from '../../lib/i18n';

interface EfficiencyBadgeProps {
  value: number;
  suffix?: string;
}

export const EfficiencyBadge: React.FC<EfficiencyBadgeProps> = ({ value, suffix = '%' }) => {
  const lang = useLang().lang;

  const colorClass =
    value >= 85
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
      : value >= 70
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';

  return (
    <span
      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${colorClass}`}
    >
      {value.toFixed(1)}
      <span className="text-[10px] opacity-80">{suffix}</span>
    </span>
  );
};

export default EfficiencyBadge;
