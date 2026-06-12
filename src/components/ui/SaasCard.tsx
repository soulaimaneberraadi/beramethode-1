import React from 'react';
import { motion, type Variants } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

/* ─── Types ─── */
export type CardVariant = 'default' | 'interactive' | 'highlighted' | 'flat';
export type CardSize = 'sm' | 'md' | 'lg';

export interface SaasCardProps {
  children: React.ReactNode;
  className?: string;
  variant?: CardVariant;
  size?: CardSize;
  icon?: LucideIcon;
  title?: string;
  subtitle?: string;
  badge?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
}

/* ─── Variants ─── */
const variantClasses: Record<CardVariant, string> = {
  default: 'bg-white border border-slate-200',
  interactive:
    'bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 cursor-pointer transition-all duration-150',
  highlighted:
    'bg-white border border-slate-200 ring-1 ring-slate-900/5',
  flat: 'bg-slate-50/60 border border-transparent',
};

const sizeClasses: Record<CardSize, string> = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

/* ─── Animation ─── */
const cardVariants: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};

/* ─── Component ─── */
export default function SaasCard({
  children,
  className = '',
  variant = 'default',
  size = 'md',
  icon: Icon,
  title,
  subtitle,
  badge,
  onClick,
  selected = false,
  disabled = false,
}: SaasCardProps) {
  const Component = onClick ? motion.button : motion.div;

  return (
    <Component
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={variant === 'interactive' && !disabled ? { scale: 1.01 } : undefined}
      whileTap={variant === 'interactive' && !disabled ? { scale: 0.99 } : undefined}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        rounded-lg text-left w-full
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${selected ? 'ring-2 ring-[#2149C1] border-[#2149C1]' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      {/* Header with icon + title + badge */}
      {(Icon || title || badge) && (
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className="w-8 h-8 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-slate-500" strokeWidth={1.75} />
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h4 className="text-[13px] font-semibold text-slate-900 truncate">
                  {title}
                </h4>
              )}
              {subtitle && (
                <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>
              )}
            </div>
          </div>
          {badge && <div className="shrink-0">{badge}</div>}
        </div>
      )}

      {children}
    </Component>
  );
}

/* ─── Sub-components ─── */

/** Card grid — responsive, auto-fills */
export function SaasCardGrid({
  children,
  cols = 3,
  gap = 'gap-3',
  className = '',
}: {
  children: React.ReactNode;
  cols?: 1 | 2 | 3 | 4;
  gap?: string;
  className?: string;
}) {
  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={`grid ${gridCols[cols]} ${gap} ${className}`}>
      {children}
    </div>
  );
}

/** Compact value display inside a card */
export function CardValue({
  label,
  value,
  unit,
  trend,
  trendValue,
}: {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}) {
  const trendColors = {
    up: 'text-emerald-600',
    down: 'text-red-500',
    neutral: 'text-slate-400',
  };

  return (
    <div className="flex items-baseline justify-between">
      <div className="min-w-0">
        <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
        <p className="text-[15px] font-semibold text-slate-900 tabular-nums">
          {value}
          {unit && (
            <span className="text-[10px] font-normal text-slate-400 ml-1">
              {unit}
            </span>
          )}
        </p>
      </div>
      {trend && trendValue && (
        <span className={`text-[11px] font-medium tabular-nums ${trendColors[trend]}`}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '—'} {trendValue}
        </span>
      )}
    </div>
  );
}
