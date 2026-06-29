import React from 'react';

/* ─── Types ─── */
export interface SaasInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: React.ReactNode;
  /** Right-side action (e.g., clear button) */
  suffix?: React.ReactNode;
}

export interface SaasSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export interface SaasTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

/* ─── Input ─── */
export function SaasInput({
  label,
  hint,
  error,
  icon,
  suffix,
  className = '',
  ...props
}: SaasInputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-[11px] font-medium text-slate-500 dark:text-dk-muted block">
          {label}
        </label>
      )}
      <div className="relative group">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="text-slate-400 group-focus-within:text-slate-600 transition-colors dark:text-dk-muted dark:group-focus-within:text-dk-text-soft">
              {icon}
            </span>
          </div>
        )}
        <input
          className={`
            w-full h-8 px-3 text-[12px] text-slate-700 dark:text-dk-text-soft
            bg-slate-50 dark:bg-dk-bg/60 border border-slate-200 rounded-md dark:bg-dk-bg/60 dark:border-dk-border
            placeholder:text-slate-400 dark:placeholder:text-dk-muted
            focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 focus:outline-none dark:focus:bg-dk-surface dark:focus:border-dk-border dark:focus:ring-white/10
            transition-all duration-150
            disabled:opacity-50 disabled:cursor-not-allowed
            ${icon ? 'pl-9' : ''}
            ${suffix ? 'pr-9' : ''}
            ${error ? 'border-red-300 focus:border-red-400 focus:ring-red-50 dark:border-red-700 dark:focus:border-red-500' : ''}
            ${className}
          `}
          {...props}
        />
        {suffix && (
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
            {suffix}
          </div>
        )}
      </div>
      {hint && !error && (
        <p className="text-[10px] text-slate-400 dark:text-dk-muted">{hint}</p>
      )}
      {error && <p className="text-[10px] text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}

/* ─── Textarea ─── */
export function SaasTextarea({
  label,
  hint,
  error,
  className = '',
  ...props
}: SaasTextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-[11px] font-medium text-slate-500 block dark:text-dk-muted">
          {label}
        </label>
      )}
      <textarea
        className={`
          w-full px-3 py-2 text-[12px] text-slate-700 dark:text-dk-text-soft
          bg-slate-50 dark:bg-dk-bg/60 border border-slate-200 rounded-md dark:bg-dk-bg/60 dark:border-dk-border
          placeholder:text-slate-400 dark:placeholder:text-dk-muted
          focus:bg-white focus:border-slate-300 focus:ring-2 focus:ring-slate-100 focus:outline-none dark:focus:bg-dk-surface dark:focus:border-dk-border dark:focus:ring-white/10
          transition-all duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          resize-none
          ${error ? 'border-red-300 focus:border-red-400 focus:ring-red-50 dark:border-red-700 dark:focus:border-red-500' : ''}
          ${className}
        `}
        {...props}
      />
      {hint && !error && (
        <p className="text-[10px] text-slate-400 dark:text-dk-muted">{hint}</p>
      )}
      {error && <p className="text-[10px] text-red-500 dark:text-red-400">{error}</p>}
    </div>
  );
}

/* ─── Toggle Switch ─── */
export function SaasToggle({
  label,
  checked,
  onChange,
  disabled = false,
  className = '',
}: {
  label?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`
        flex items-center gap-2.5 cursor-pointer select-none
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`
          relative w-8 h-[18px] rounded-full transition-colors duration-200
          ${checked ? 'bg-slate-900 dark:bg-dk-accent' : 'bg-slate-200 dark:bg-dk-border'}
        `}
      >
        <span
          className={`
            absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm dark:shadow-dk-sm
            transition-transform duration-200
            ${checked ? 'translate-x-[16px]' : 'translate-x-[2px]'}
          `}
        />
      </button>
      {label && (
        <span className="text-[12px] text-slate-700 dark:text-dk-text-soft">{label}</span>
      )}
    </label>
  );
}
