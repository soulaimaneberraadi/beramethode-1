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
                <label className="block text-[11px] font-medium text-slate-600">
                    {label}
                </label>
            )}
            <input
                ref={ref}
                {...rest}
                className={`w-full h-9 px-3 text-[13px] text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition-colors ${className}`}
            />
            {hint && !error && <p className="text-[11px] text-slate-500">{hint}</p>}
            {error && <p className="text-[11px] text-red-600">{error}</p>}
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
                <label className="block text-[11px] font-medium text-slate-600">
                    {label}
                </label>
            )}
            <select
                ref={ref}
                {...rest}
                className={`w-full h-9 px-3 text-[13px] text-slate-900 bg-white border border-slate-200 rounded-md focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition-colors appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22><polyline points=%226 9 12 15 18 9%22/></svg>')] bg-no-repeat bg-[right_0.6rem_center] pr-8 ${className}`}
            >
                {children}
            </select>
        </div>
    )
);
