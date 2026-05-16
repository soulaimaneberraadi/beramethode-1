import React, { useMemo, useState, useEffect } from 'react';
import type { Lot, ModelData, AppSettings } from '../../types';
import DateTimePicker from '../ui/DateTimePicker';
import { newLotId, splitLotsFromModelGrid, totalLotsQty } from '../../utils/lots';

export interface LotsEditorProps {
    lots: Lot[];
    onChange: (lots: Lot[]) => void;
    settings: AppSettings;
    defaultDeadline: string;
    model?: ModelData;
    orderQty: number;
}

export default function LotsEditor({ lots, onChange, settings, defaultDeadline, model, orderQty }: LotsEditorProps) {
    const [local, setLocal] = useState<Lot[]>(() => (lots.length ? lots.map(l => ({ ...l })) : []));

    useEffect(() => {
        setLocal(lots.length ? lots.map(l => ({ ...l })) : []);
    }, [lots]);

    const sum = useMemo(() => totalLotsQty(local), [local]);

    const sync = (next: Lot[]) => {
        setLocal(next);
        onChange(next);
    };

    const proposeFromGrid = () => {
        const ddl = (defaultDeadline || '').split('T')[0] || new Date().toISOString().slice(0, 10);
        sync(splitLotsFromModelGrid(model, orderQty, ddl));
    };

    const addRow = () => {
        const ddl = (defaultDeadline || '').split('T')[0] || new Date().toISOString().slice(0, 10);
        sync([...local, { id: newLotId(), taille: '—', couleur: '-', quantite: 0, deadline: ddl, status: 'PENDING' }]);
    };

    const update = (id: string, patch: Partial<Lot>) => {
        sync(local.map(l => (l.id === id ? { ...l, ...patch } : l)));
    };

    const remove = (id: string) => {
        sync(local.filter(l => l.id !== id));
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-600">
                    Σ lots : <span className="text-[#2149C1]">{sum}</span> / objectif {orderQty}
                </span>
                <div className="flex gap-2">
                    <button type="button" onClick={proposeFromGrid} className="rounded-lg border border-slate-200 px-2 py-1 font-bold text-slate-700 hover:bg-slate-50">
                        Grille modèle
                    </button>
                    <button type="button" onClick={addRow} className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-800 hover:bg-slate-200">
                        + Lot
                    </button>
                </div>
            </div>
            <div className="max-h-52 overflow-y-auto space-y-2 rounded-xl border border-slate-200 p-2">
                {local.length === 0 ? (
                    <p className="text-center text-xs text-slate-500 py-4">Aucun lot — utilisez « Grille modèle » ou « + Lot ».</p>
                ) : (
                    local.map(l => (
                        <div key={l.id} className="grid grid-cols-[1fr_1fr_72px_auto] gap-2 items-end text-[11px]">
                            <div>
                                <label className="text-[9px] font-black uppercase text-slate-400">Taille</label>
                                <input className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 font-semibold" value={l.taille} onChange={e => update(l.id, { taille: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-[9px] font-black uppercase text-slate-400">Qté</label>
                                <input
                                    type="number"
                                    min={0}
                                    className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 font-semibold"
                                    value={l.quantite}
                                    onChange={e => update(l.id, { quantite: parseInt(e.target.value, 10) || 0 })}
                                />
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <DateTimePicker
                                    value={l.deadline}
                                    onChange={iso => update(l.id, { deadline: iso.split('T')[0] })}
                                    mode="date"
                                    settings={settings}
                                    label="DDS lot"
                                    inputClassName="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-left text-[11px] font-semibold"
                                />
                            </div>
                            <button type="button" onClick={() => remove(l.id)} className="rounded-lg border border-red-100 px-2 py-1 text-red-500 hover:bg-red-50">
                                ×
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
