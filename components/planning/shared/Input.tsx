import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    hint?: string;
    error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ label, hint, error, className = '', ...rest }, ref) => (
        <div className="space-y-1.5">
            {label && (
                <label className="block text-[11px] font-medium text-slate-600 dark:text-dk-muted">
                    {label}
                </label>
            )}
            <input
                ref={ref}
                {...rest}
                className={`w-full h-9 px-3 text-[13px] text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md focus:border-slate-400 dark:focus:border-dk-accent focus:ring-2 focus:ring-slate-100 dark:focus:ring-dk-accent/20 outline-none transition-colors ${className}`}
            />
            {hint && !error && <p className="text-[11px] text-slate-500 dark:text-dk-muted">{hint}</p>}
            {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
        </div>
    )
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    children: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, children, className = '', ...rest }, ref) => (
        <div className="space-y-1.5">
            {label && (
                <label className="block text-[11px] font-medium text-slate-600 dark:text-dk-muted">
                    {label}
                </label>
            )}
            <select
                ref={ref}
                {...rest}
                className={`w-full h-9 px-3 text-[13px] text-slate-900 dark:text-dk-text bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md focus:border-slate-400 dark:focus:border-dk-accent focus:ring-2 focus:ring-slate-100 dark:focus:ring-dk-accent/20 outline-none transition-colors appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22><polyline points=%226 9 12 15 18 9%22/></svg>')] dark:bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239DB5AB%22 stroke-width=%222%22><polyline points=%226 9 12 15 18 9%22/></svg>')] bg-no-repeat bg-[right_0.6rem_center] pr-8 ${className}`}
            >
                {children}
            </select>
        </div>
    )
);
