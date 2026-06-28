import React from 'react';
import { Calendar, AlertTriangle } from 'lucide-react';
import { fmtShort } from '../../shared/dateFmt';
import { tx } from '../../../../lib/i18n';
import { useLang } from '../../../../src/context/LanguageContext';

interface Props {
    visible: boolean;
    x: number;
    y: number;
    startDate: string;
    endDate: string;
    chainName: string;
    overload?: number; // > 1 = surcharge
    machinesMissing?: string[];
    stockShortage?: boolean;
}

/** Petit tooltip qui suit le curseur durant le drag — montre où l'OF va atterrir. */
export default function DragPreview({
    visible, x, y, startDate, endDate, chainName, overload, machinesMissing, stockShortage,
}: Props) {
    const { lang } = useLang();
    if (!visible) return null;
    const warnings = [];
    if (overload && overload > 1) warnings.push(`${tx(lang, { fr: 'Surcharge', ar: 'حمل زائد', en: 'Overload', es: 'Sobrecarga', pt: 'Sobrecarga', tr: 'Aşırı yük' })} ${Math.round(overload * 100)}%`);
    if (machinesMissing?.length) warnings.push(`${tx(lang, { fr: 'Manque', ar: 'نقص', en: 'Missing', es: 'Faltan', pt: 'Faltam', tr: 'Eksik' })} ${machinesMissing.length} ${tx(lang, { fr: 'classe(s)', ar: 'فئة/فئات', en: 'class(es)', es: 'clase(s)', pt: 'classe(s)', tr: 'sınıf(lar)' })}`);
    if (stockShortage) warnings.push(tx(lang, { fr: 'Stock insuffisant', ar: 'مخزون غير كافٍ', en: 'Insufficient stock', es: 'Stock insuficiente', pt: 'Stock insuficiente', tr: 'Yetersiz stok' }));

    return (
        <div
            className="fixed z-[80] pointer-events-none"
            style={{ left: x + 16, top: y + 16, animation: 'planning-fade-in 80ms ease-out' }}
        >
            <div className="bg-slate-900 text-white rounded-md shadow-[0_4px_16px_rgba(0,0,0,0.2)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.5)] px-3 py-2 min-w-[180px]">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-dk-muted mb-1">{chainName}</div>
                <div className="flex items-center gap-1.5 text-[11px] mb-1">
                    <Calendar className="w-3 h-3 text-slate-300 dark:text-dk-muted" strokeWidth={1.75} />
                    <span className="tabular-nums">{fmtShort(startDate)}</span>
                    <span className="text-slate-500 dark:text-dk-muted">→</span>
                    <span className="tabular-nums">{fmtShort(endDate)}</span>
                </div>
                {warnings.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-700 space-y-0.5">
                        {warnings.map((w, i) => (
                            <div key={i} className="flex items-center gap-1 text-[10px] text-amber-300">
                                <AlertTriangle className="w-2.5 h-2.5" strokeWidth={2} />
                                {w}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
