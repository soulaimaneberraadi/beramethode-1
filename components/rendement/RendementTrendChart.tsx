import React from 'react';
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { ResponsiveChart } from '../ui/ResponsiveChart';
import { useLang } from '../../src/context/LanguageContext';
import { useIsDark } from '../../src/context/ThemeContext';
import { chartColors } from '../../lib/themeColors';
import { tx } from '../../lib/i18n';
import { TrendingUp } from 'lucide-react';

interface Props {
  data: { date: string; rPercent: number; trs: number }[];
}

export default function RendementTrendChart({ data }: Props) {
  const { lang } = useLang();
  const isDark = useIsDark();
  const cc = chartColors(isDark);

  return (
    <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-slate-50/70 dark:bg-dk-bg/40 border-b border-slate-100 dark:border-dk-border flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-dk-accent/20 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-dk-accent-text" />
        </div>
        <h2 className="font-bold text-slate-800 dark:text-dk-text text-sm">
          {tx(lang, { fr: 'Tendance R% / TRS', ar: 'اتجاه العائد / TRS' })}
        </h2>
      </div>
      <div className="p-4">
        <div className="h-72 w-full">
          <ResponsiveChart>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="trsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={cc.grid} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: cc.axis, fontSize: 10, fontWeight: 600 }}
                dy={10}
              />
              <YAxis
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fill: cc.axis, fontSize: 10, fontWeight: 600 }}
                dx={-5}
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
                formatter={(value: number, name: string) => [`${value}%`, name]}
              />
              <ReferenceLine
                y={85}
                stroke="#e11d48"
                strokeWidth={2}
                strokeDasharray="6 4"
                label={{
                  value: tx(lang, { fr: 'Cible 85%', ar: 'الهدف 85%' }),
                  fill: '#e11d48',
                  fontSize: 10,
                  fontWeight: 700,
                  position: 'right',
                }}
              />
              <Area
                type="monotone"
                dataKey="rPercent"
                name={tx(lang, { fr: 'R%', ar: 'العائد%' })}
                stroke="#6366f1"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#rGrad)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="trs"
                name="TRS"
                stroke="#f59e0b"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#trsGrad)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveChart>
        </div>
      </div>
    </div>
  );
}
