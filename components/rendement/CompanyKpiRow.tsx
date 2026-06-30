import React from 'react';
import { useLang } from '../../src/context/LanguageContext';
import { tx } from '../../lib/i18n';
import EfficiencyBadge from './EfficiencyBadge';

interface KpiNode {
  rPercent: number;
  trs: number;
  availability: number;
  quality: number;
  produced: number;
  target: number;
}

interface CompanyKpiRowProps {
  societeNode: KpiNode;
  prevRPercent?: number;
  prevTrs?: number;
}

export const CompanyKpiRow: React.FC<CompanyKpiRowProps> = ({ societeNode, prevRPercent, prevTrs }) => {
  const { lang } = useLang();
  const formatPct = (v: number) => `${v.toFixed(1)}%`;
  const pct = societeNode.target > 0 ? Math.min(100, Math.round((societeNode.produced / societeNode.target) * 100)) : 0;

  const Delta = ({ current, previous }: { current: number; previous?: number }) => {
    if (previous === undefined || previous === 0) return null;
    const diff = current - previous;
    const isUp = diff >= 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold mt-0.5 ${isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
        {isUp ? '↑' : '↓'} {Math.abs(diff).toFixed(1)}%
      </span>
    );
  };

  const cardClass = 'bg-white rounded-2xl border border-slate-200 p-4 dark:bg-dk-surface dark:border-dk-border';
  const labelClass = 'text-[10px] uppercase font-bold text-slate-400 mb-1 dark:text-dk-muted';
  const valueClass = 'text-2xl font-black text-slate-900 dark:text-dk-text tabular-nums';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <div className={cardClass}>
        <p className={labelClass}>{tx(lang, { fr: 'R%', ar: 'نسبة الإنتاج', en: 'R%', es: 'R%', pt: 'R%', tr: 'R%' })}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={valueClass}>{formatPct(societeNode.rPercent)}</span>
          <EfficiencyBadge value={societeNode.rPercent} />
        </div>
        <Delta current={societeNode.rPercent} previous={prevRPercent} />
      </div>

      <div className={cardClass}>
        <p className={labelClass}>{tx(lang, { fr: 'TRS', ar: 'الكفاءة الكلية', en: 'OEE', es: 'OEE', pt: 'OEE', tr: 'OEE' })}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={valueClass}>{formatPct(societeNode.trs)}</span>
          <EfficiencyBadge value={societeNode.trs} />
        </div>
        <Delta current={societeNode.trs} previous={prevTrs} />
      </div>

      <div className={cardClass}>
        <p className={labelClass}>{tx(lang, { fr: 'Disponibilité', ar: 'التوفر', en: 'Availability', es: 'Disponibilidad', pt: 'Disponibilidade', tr: 'Kullanılabilirlik' })}</p>
        <span className={valueClass}>{formatPct(societeNode.availability)}</span>
      </div>

      <div className={cardClass}>
        <p className={labelClass}>{tx(lang, { fr: 'Qualité', ar: 'الجودة', en: 'Quality', es: 'Calidad', pt: 'Qualidade', tr: 'Kalite' })}</p>
        <span className={valueClass}>{formatPct(societeNode.quality)}</span>
      </div>

      <div className={cardClass}>
        <p className={labelClass}>{tx(lang, { fr: 'Production', ar: 'الإنتاج', en: 'Production', es: 'Producción', pt: 'Produção', tr: 'Üretim' })}</p>
        <span className={valueClass}>
          {societeNode.produced.toLocaleString()}
          <span className="text-sm font-normal text-slate-400 dark:text-dk-muted"> / {societeNode.target.toLocaleString()}</span>
        </span>
        <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden dark:bg-dk-bg">
          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: pct >= 85 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#f43f5e' }} />
        </div>
      </div>
    </div>
  );
};

export default CompanyKpiRow;
