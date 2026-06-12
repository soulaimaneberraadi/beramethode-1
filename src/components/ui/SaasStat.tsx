import React from 'react';
import { motion, type Variants } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

/* ─── Types ─── */
export type StatVariant = 'default' | 'success' | 'danger' | 'warning' | 'info';
export type StatSize = 'sm' | 'md' | 'lg';

export interface SaasStatProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  variant?: StatVariant;
  size?: StatSize;
  unit?: string;
  trend?: { direction: 'up' | 'down'; value: string };
  className?: string;
  /** Show as a compact inline stat */
  inline?: boolean;
}

/* ─── Variant Colors ─── */
const variantConfig: Record<
  StatVariant,
  { dot: string; icon: string; value: string }
> = {
  default: {
    dot: 'bg-slate-400',
    icon: 'text-slate-400',
    value: 'text-slate-900',
  },
  success: {
    dot: 'bg-emerald-500',
    icon: 'text-emerald-600',
    value: 'text-emerald-700',
  },
  danger: {
    dot: 'bg-red-500',
    icon: 'text-red-500',
    value: 'text-red-600',
  },
  warning: {
    dot: 'bg-amber-500',
    icon: 'text-amber-500',
    value: 'text-amber-600',
  },
  info: {
    dot: 'bg-[#2149C1]',
    icon: 'text-[#2149C1]',
    value: 'text-slate-900',
  },
};

/* ─── Sizes ─── */
const sizeConfig: Record<StatSize, { value: string; label: string; gap: string }> = {
  sm: { value: 'text-[14px]', label: 'text-[10px]', gap: 'gap-1.5' },
  md: { value: 'text-[16px]', label: 'text-[11px]', gap: 'gap-2' },
  lg: { value: 'text-[20px]', label: 'text-[12px]', gap: 'gap-2.5' },
};

/* ─── Animation ─── */
const statVariants: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};

/* ─── Component ─── */
export default function SaasStat({
  label,
  value,
  icon: Icon,
  variant = 'default',
  size = 'md',
  unit,
  trend,
  className = '',
  inline = false,
}: SaasStatProps) {
  const colors = variantConfig[variant];
  const sizes = sizeConfig[size];

  if (inline) {
    return (
      <motion.div
        variants={statVariants}
        initial="hidden"
        animate="visible"
        className={`flex items-center gap-2 ${className}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot} shrink-0`} />
        <span className={`${sizes.label} text-slate-500`}>{label}</span>
        <span className={`${sizes.value} font-semibold ${colors.value} tabular-nums`}>
          {value}
          {unit && (
            <span className="text-[10px] font-normal text-slate-400 ml-0.5">
              {unit}
            </span>
          )}
        </span>
        {trend && (
          <span
            className={`text-[10px] font-medium tabular-nums ${
              trend.direction === 'up' ? 'text-emerald-600' : 'text-red-500'
            }`}
          >
            {trend.direction === 'up' ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={statVariants}
      initial="hidden"
      animate="visible"
      className={`flex items-center ${sizes.gap} ${className}`}
    >
      {/* Icon / Dot */}
      {Icon ? (
        <div
          className={`
            w-8 h-8 rounded-md flex items-center justify-center shrink-0
            bg-slate-50 border border-slate-100
          `}
        >
          <Icon className={`w-4 h-4 ${colors.icon}`} strokeWidth={1.75} />
        </div>
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot} shrink-0`} />
      )}

      {/* Value + Label */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`
              font-semibold tabular-nums ${colors.value} ${sizes.value}
            `}
          >
            {value}
          </span>
          {unit && (
            <span className="text-[10px] font-normal text-slate-400">{unit}</span>
          )}
          {trend && (
            <span
              className={`text-[10px] font-medium tabular-nums ${
                trend.direction === 'up' ? 'text-emerald-600' : 'text-red-500'
              }`}
            >
              {trend.direction === 'up' ? '↑' : '↓'} {trend.value}
            </span>
          )}
        </div>
        <p className={`${sizes.label} text-slate-500`}>{label}</p>
      </div>
    </motion.div>
  );
}

/* ─── Stat Grid ─── */
export function SaasStatGrid({
  children,
  cols = 4,
  className = '',
}: {
  children: React.ReactNode;
  cols?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-2 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
  };

  return (
    <div
      className={`
        grid ${gridCols[cols]} gap-4
        p-4 bg-slate-50/60 rounded-lg border border-slate-100
        ${className}
      `}
    >
      {children}
    </div>
  );
}
