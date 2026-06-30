import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { AppSettings, Machine, Operation } from '../../types';
import { getChainMachineIds, machineCoverageRows } from '../../utils/machineMatch';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';

export interface MachineCoverageTableProps {
    operations: Operation[];
    machines: Machine[];
    chainId: string;
    settings: AppSettings;
    /** Libellé court de la ligne (nom personnalisé ou id) */
    chainLabel?: string;
}

export default function MachineCoverageTable({
    operations,
    machines,
    chainId,
    settings,
    chainLabel,
}: MachineCoverageTableProps) {
    const { lang } = useLang();
    const ids = getChainMachineIds(chainId, settings, machines);
    const rows = machineCoverageRows(operations, machines, ids);

    if (rows.length === 0) {
        return (
            <p className="text-sm text-slate-500 dark:text-dk-muted py-2">
                {tx(lang, { fr: 'Aucune opération machine dans la gamme — rien à vérifier.', ar: 'لا توجد عمليات آلية في النطاق — لا شيء للتحقق.', en: 'No machine operations in the routing — nothing to check.', es: 'Sin operaciones de máquina en la ruta — nada que verificar.', pt: 'Nenhuma operação de máquina na rota — nada a verificar.', tr: 'Rotada makine operasyonu yok — kontrol edilecek bir şey yok.' })}
            </p>
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-[11px] text-slate-500 dark:text-dk-muted leading-snug">
                Couverture des classes machines pour{' '}
                <span className="font-bold text-slate-700 dark:text-dk-text-soft">{chainLabel || chainId}</span>
                {ids.length > 0 && (
                    <span className="text-slate-400 dark:text-dk-muted"> · {ids.length} machine(s) affectée(s) à la ligne</span>
                )}
            </p>
            <div className="rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden text-sm">
                <table className="w-full">
                    <thead>
                        <tr className="bg-slate-50 dark:bg-dk-bg text-left text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-dk-muted">
                            <th className="px-3 py-2">{tx(lang, {fr: 'Classe', ar: 'الفئة', en: 'Class', es: 'Clase', pt: 'Classe', tr: 'Sınıf'})}</th>
                            <th className="px-3 py-2 text-center">{tx(lang, {fr: 'Besoin (ops)', ar: 'الاحتياج (عمليات)', en: 'Need (ops)', es: 'Necesidad (ops)', pt: 'Necessidade (ops)', tr: 'İhtiyaç (işlem)'})}</th>
                            <th className="px-3 py-2 text-center">{tx(lang, {fr: 'Sur la ligne', ar: 'على الخط', en: 'On the line', es: 'En la línea', pt: 'Na linha', tr: 'Hatta'})}</th>
                            <th className="px-3 py-2 text-right">{tx(lang, {fr: 'Statut', ar: 'الحالة', en: 'Status', es: 'Estado', pt: 'Status', tr: 'Durum'})}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.classe} className="border-t border-slate-100 dark:border-dk-border">
                                <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-dk-text">{r.classe}</td>
                                <td className="px-3 py-2 text-center tabular-nums text-slate-700 dark:text-dk-text-soft">{r.requiredCount}</td>
                                <td className="px-3 py-2 text-center tabular-nums text-slate-700 dark:text-dk-text-soft">{r.availableCount}</td>
                                <td className="px-3 py-2 text-right">
                                    {r.ok ? (
                                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-xs">
                                            <CheckCircle2 className="w-4 h-4" /> OK
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-red-500 font-bold text-xs">
                                            <XCircle className="w-4 h-4" /> Manquant
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
