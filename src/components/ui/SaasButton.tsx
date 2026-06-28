import React from 'react';

/* ─── Types ─── */
export interface SaasButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

/* ─── Styles ─── */
const variantClasses: Record<string, string> = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-900 shadow-sm dark:bg-dk-accent dark:text-dk-text',
  secondary:
    'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 active:bg-slate-100 dark:bg-dk-surface dark:text-dk-text-soft dark:border-dk-border dark:hover:bg-dk-elevated/60',
  ghost:
    'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200 dark:text-dk-text-soft dark:hover:bg-dk-elevated/60',
  danger:
    'bg-red-600 text-white hover:bg-red-500 active:bg-red-700 shadow-sm dark:bg-red-700',
};

const sizeClasses: Record<string, string> = {
  sm: 'h-7 px-2.5 text-[11px] gap-1.5 rounded-md',
  md: 'h-8 px-3 text-[12px] gap-2 rounded-md',
  lg: 'h-9 px-4 text-[13px] gap-2 rounded-lg',
};

/* ─── Component ─── */
export default function SaasButton({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...props
}: SaasButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center font-medium
        transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children && <span>{children}</span>}
      {iconRight && <span className="shrink-0">{iconRight}</span>}
    </button>
  );
}

/* ─── Button Group ─── */
export function SaasButtonGroup({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>{children}</div>
  );
}

/* ─── Icon Button ─── */
export function SaasIconButton({
  variant = 'ghost',
  size = 'md',
  icon,
  tooltip,
  active,
  ...props
}: {
  icon: React.ReactNode;
  tooltip?: string;
  active?: boolean;
} & Omit<SaasButtonProps, 'icon' | 'iconRight' | 'children' | 'fullWidth'>) {
  const sizeMap = { sm: 'w-7 h-7', md: 'w-8 h-8', lg: 'w-9 h-9' };

  return (
    <button
      title={tooltip}
      className={`
        inline-flex items-center justify-center rounded-md
        transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantClasses[variant]}
        ${sizeMap[size]}
        ${active ? 'bg-slate-100 text-slate-900 dark:bg-dk-elevated dark:text-dk-text' : ''}
        ${props.className || ''}
      `}
      {...props}
    >
      {icon}
    </button>
  );
}
