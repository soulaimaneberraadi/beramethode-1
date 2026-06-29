import React, { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { ResponsiveChart } from '../ui/ResponsiveChart';
import { useLang } from '../../src/context/LanguageContext';
import { useIsDark } from '../../src/context/ThemeContext';
import { chartColors } from '../../lib/themeColors';
import { tx } from '../../lib/i18n';
import { Clock } from 'lucide-react';

interface Props {
  downtimeByCode: { code: string; minutes: number }[];
}

export default function DowntimePareto({ downtimeByCode }: Props) {
  const { lang } = useLang();
  const isDark = useIsDark();
  const cc = chartColors(isDark);

  const chartData = useMemo(() => {
    const sorted = [...downtimeByCode].sort((a, b) => b.minutes - a.minutes);
    const total = sorted.reduce((s, d) => s + d.minutes, 0);
    let cumul = 0;
    return sorted.map((d) => {
      cumul += d.minutes;
      return {
        code: d.code,
        minutes: d.minutes,
        cumulative: total > 0 ? Math.round((cumul / total) * 100) : 0,
      };
    });
  }, [downtimeByCode]);

  return (
    <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-slate-50/70 dark:bg-dk-bg/40 border-b border-slate-100 dark:border-dk-border flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
          <Clock className="w-4 h-4 text-rose-600 dark:text-rose-400" />
        </div>
        <h2 className="font-bold text-slate-800 dark:text-dk-text text-sm">
          {tx(lang, { fr: 'Pareto des arrêts', ar: 'Pareto أسباب التوقّف' })}
        </h2>
      </div>
      <div className="p-4">
        <div className="h-72 w-full">
          <ResponsiveChart>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cc.grid} />
              <XAxis
                dataKey="code"
                axisLine={false}
                tickLine={false}
                tick={{ fill: cc.axis, fontSize: 9, fontWeight: 600 }}
                dy={10}
              />
              <YAxis
                yAxisId="left"
                axisLine={false}
                tickLine={false}
                tick={{ fill: cc.axis, fontSize: 10, fontWeight: 600 }}
                dx={-5}
                width={35}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: cc.axis, fontSize: 10, fontWeight: 600 }}
                dx={5}
                width={30}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: cc.tooltipBg,
                  color: cc.tooltipText,
                  borderRadius: '10px',
                  border: `1px solid ${cc.tooltipBorder}`,
                  boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
                  fontSize: '11px',
                }}
                itemStyle={{ fontWeight: 'bold' }}
                labelStyle={{ color: cc.tooltipText, fontWeight: 'bold', marginBottom: '4px' }}
              />
              <Bar
                yAxisId="left"
                dataKey="minutes"
                name={tx(lang, { fr: 'Minutes', ar: 'دقائق' })}
                fill="#fecdd3"
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulative"
                name={tx(lang, { fr: 'Cumul %', ar: 'النسبة المتراكمة' })}
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveChart>
        </div>
      </div>
    </div>
  );
}
