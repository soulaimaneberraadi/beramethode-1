import React from 'react';
import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { tx } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';

interface Props {
    active: number;
    blocked: number;
    late: number;
    onClickActive?: () => void;
    onClickBlocked?: () => void;
    onClickLate?: () => void;
}

export default function QuickStats({ active, blocked, late, onClickActive, onClickBlocked, onClickLate }: Props) {
    const { lang } = useLang();
    const items = [
        {
            label: tx(lang,{fr:"Actifs",ar:"نشط",en:"Active",es:"Activos",pt:"Ativos",tr:"Aktif"}),
            value: active,
            Icon: Activity,
            color: 'text-[#2149C1]',
            bg: 'bg-blue-50 dark:bg-blue-900/30/70',
            hover: 'hover:bg-blue-50',
            onClick: onClickActive,
        },
        {
            label: tx(lang,{fr:"Bloqués",ar:"محظور",en:"Blocked",es:"Bloqueados",pt:"Bloqueados",tr:"Engellendi"}),
            value: blocked,
            Icon: AlertTriangle,
            color: 'text-red-600 dark:text-red-400',
            bg: 'bg-red-50 dark:bg-red-900/30/70',
            hover: 'hover:bg-red-50',
            onClick: onClickBlocked,
        },
        {
            label: tx(lang,{fr:"En retard",ar:"متأخر",en:"Late",es:"Retrasos",pt:"Atrasados",tr:"Gecikmiş"}),
            value: late,
            Icon: AlertTriangle,
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-50 dark:bg-amber-900/30/70',
            hover: 'hover:bg-amber-50',
            onClick: onClickLate,
        },
    ];
    return (
        <div className="inline-flex items-center gap-1">
            {items.map(({ label, value, Icon, color, bg, hover, onClick }) => (
                <button
                    key={label}
                    type="button"
                    onClick={onClick}
                    className={`group inline-flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors ${bg} ${hover}`}
                    title={`${label} : ${value}`}
                >
                    <Icon className={`w-3 h-3 ${color}`} strokeWidth={2.25} />
                    <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">{label}</span>
                    <span className={`text-[11px] font-bold tabular-nums ${color}`}>{value}</span>
                </button>
            ))}
        </div>
    );
}
