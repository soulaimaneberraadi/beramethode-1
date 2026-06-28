import React from 'react';
import { motion, type Variants } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

/* ─── Types ─── */
export interface SaasPanelProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Compact mode — reduces padding for dense layouts */
  compact?: boolean;
  /** No header — renders children directly */
  flush?: boolean;
  /** Footer with actions */
  footer?: React.ReactNode;
}

/* ─── Animation ─── */
const panelVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

/* ─── Component ─── */
export default function SaasPanel({
  title,
  subtitle,
  icon: Icon,
  actions,
  children,
  className = '',
  compact = false,
  flush = false,
  footer,
}: SaasPanelProps) {
  return (
    <motion.div
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      className={`
        bg-white border border-slate-200 rounded-lg
        overflow-hidden dark:bg-dk-surface dark:border-dk-border
        ${className}
      `}
    >
      {/* Header */}
      {!flush && (
        <div
          className={`
            flex items-center justify-between
            border-b border-slate-100 dark:border-dk-border
            ${compact ? 'px-4 h-10' : 'px-5 h-12'}
          `}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <Icon
                className="w-4 h-4 text-slate-400 shrink-0 dark:text-dk-muted"
                strokeWidth={1.75}
              />
            )}
            <div className="min-w-0">
              <h3
                className={`
                  font-semibold text-slate-900 truncate dark:text-dk-text
                  ${compact ? 'text-[12px]' : 'text-[13px]'}
                `}
              >
                {title}
              </h3>
              {subtitle && (
                <p className="text-[11px] text-slate-400 truncate mt-0.5 dark:text-dk-muted">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}

      {/* Body */}
      <div className={flush ? '' : compact ? 'p-4' : 'p-5'}>{children}</div>

      {/* Footer */}
      {footer && (
        <div
          className={`
            flex items-center justify-end gap-2
            border-t border-slate-100 dark:border-dk-border
            ${compact ? 'px-4 h-10' : 'px-5 h-12'}
          `}
        >
          {footer}
        </div>
      )}
    </motion.div>
  );
}

/* ─── Sub-components ─── */

/** Empty state placeholder */
export function SaasEmpty({
  icon: Icon,
  message,
  action,
}: {
  icon?: LucideIcon;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {Icon && <Icon className="w-8 h-8 text-slate-300 mb-3 dark:text-dk-muted" strokeWidth={1.5} />}
      <p className="text-[13px] text-slate-500 mb-3 dark:text-dk-text-soft">{message}</p>
      {action}
    </div>
  );
}

/** Section divider inside a panel */
export function SaasDivider({ label }: { label?: string }) {
  if (!label) {
    return <div className="border-t border-slate-100 my-4 dark:border-dk-border" />;
  }
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="h-px flex-1 bg-slate-100 dark:bg-dk-border" />
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide shrink-0 dark:text-dk-muted">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-100 dark:bg-dk-border" />
    </div>
  );
}
