import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { AppSettings, Machine, Operation } from '../../types';
import { getChainMachineIds, machineCoverageRows } from '../../utils/machineMatch';

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
    const ids = getChainMachineIds(chainId, settings, machines);
    const rows = machineCoverageRows(operations, machines, ids);

    if (rows.length === 0) {
        return (
            <p className="text-sm text-slate-500 py-2">
                Aucune opération machine dans la gamme — rien à vérifier.
            </p>
        );
    }

    return (
        <div className="space-y-3">
            <p className="text-[11px] text-slate-500 leading-snug">
                Couverture des classes machines pour{' '}
                <span className="font-bold text-slate-700">{chainLabel || chainId}</span>
                {ids.length > 0 && (
                    <span className="text-slate-400"> · {ids.length} machine(s) affectée(s) à la ligne</span>
                )}
            </p>
            <div className="rounded-xl border border-slate-200 overflow-hidden text-sm">
                <table className="w-full">
                    <thead>
                        <tr className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wider text-slate-500">
                            <th className="px-3 py-2">Classe</th>
                            <th className="px-3 py-2 text-center">Besoin (ops)</th>
                            <th className="px-3 py-2 text-center">Sur la ligne</th>
                            <th className="px-3 py-2 text-right">Statut</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.classe} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-mono font-bold text-slate-800">{r.classe}</td>
                                <td className="px-3 py-2 text-center tabular-nums text-slate-700">{r.requiredCount}</td>
                                <td className="px-3 py-2 text-center tabular-nums text-slate-700">{r.availableCount}</td>
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
