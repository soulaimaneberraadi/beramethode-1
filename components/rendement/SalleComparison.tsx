import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { ResponsiveChart } from '../ui/ResponsiveChart';
import { useLang } from '../../src/context/LanguageContext';
import { useIsDark } from '../../src/context/ThemeContext';
import { chartColors } from '../../lib/themeColors';
import { tx } from '../../lib/i18n';
import { Factory } from 'lucide-react';

interface Props {
  salles: { id: string; label: string; rPercent: number }[];
  onSalleClick?: (id: string) => void;
}

const barColor = (val: number) => {
  if (val >= 85) return '#10b981';
  if (val >= 70) return '#f59e0b';
  return '#e11d48';
};

export default function SalleComparison({ salles, onSalleClick }: Props) {
  const { lang } = useLang();
  const isDark = useIsDark();
  const cc = chartColors(isDark);

  const sorted = useMemo(
    () => [...salles].sort((a, b) => b.rPercent - a.rPercent),
    [salles]
  );

  return (
    <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-slate-50/70 dark:bg-dk-bg/40 border-b border-slate-100 dark:border-dk-border flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-dk-accent/20 flex items-center justify-center">
          <Factory className="w-4 h-4 text-indigo-600 dark:text-dk-accent-text" />
        </div>
        <h2 className="font-bold text-slate-800 dark:text-dk-text text-sm">
          {tx(lang, { fr: 'Comparaison des Salles', ar: 'مقارنة الصالات' })}
        </h2>
      </div>
      <div className="p-4">
        <div className="h-72 w-full">
          <ResponsiveChart>
            <BarChart
              data={sorted}
              layout="vertical"
              margin={{ top: 5, right: 40, left: 0, bottom: 5 }}
              onClick={(e: any) => {
                if (e?.activePayload?.[0] && onSalleClick) {
                  onSalleClick(e.activePayload[0].payload.id);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={cc.grid} />
              <XAxis
                type="number"
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: cc.axis, fontSize: 10, fontWeight: 600 }}
                tickFormatter={(v: number) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: cc.axis, fontSize: 11, fontWeight: 700 }}
                width={90}
              />
              <Tooltip
                cursor={{ fill: isDark ? '#1D2E28' : '#f8fafc' }}
                contentStyle={{
                  backgroundColor: cc.tooltipBg,
                  color: cc.tooltipText,
                  borderRadius: '10px',
                  border: `1px solid ${cc.tooltipBorder}`,
                  boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
                  fontSize: '11px',
                }}
                formatter={(value: number) => [`${value}%`, tx(lang, { fr: 'Rendement', ar: 'المردودية' })]}
              />
              <Bar
                dataKey="rPercent"
                radius={[0, 4, 4, 0]}
                cursor={onSalleClick ? 'pointer' : 'default'}
                minPointSize={4}
              >
                {sorted.map((entry, idx) => (
                  <Cell key={entry.id ?? idx} fill={barColor(entry.rPercent)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveChart>
        </div>
      </div>
    </div>
  );
}
