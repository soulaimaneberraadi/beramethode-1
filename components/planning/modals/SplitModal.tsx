import React, { useEffect, useState } from 'react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import type { PlanningEvent, ModelData } from '../../../types';
import { evClientName, evModelName, evQty } from '../shared/eventAccessors';

interface Props {
    open: boolean;
    event: PlanningEvent | null;
    models: ModelData[];
    onClose: () => void;
    onSubmit: (qty: number) => void;
}

export default function SplitModal({ open, event, models, onClose, onSubmit }: Props) {
    const [qty, setQty] = useState(0);

    useEffect(() => {
        if (open && event) {
            setQty(Math.floor(evQty(event) / 2));
        }
    }, [open, event]);

    if (!event) return null;
    const total = evQty(event);
    const remain = Math.max(0, total - qty);
    const valid = qty > 0 && qty < total;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Fractionner l'ordre"
            subtitle={`${evClientName(event, models)} · ${evModelName(event, models)}`}
            size="sm"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>Annuler</Button>
                    <Button variant="primary" onClick={() => valid && onSubmit(qty)} disabled={!valid}>
                        Fractionner
                    </Button>
                </>
            }
        >
            <div className="space-y-5">
                <div className="text-[13px] text-slate-600 leading-relaxed">
                    Quantité actuelle : <span className="font-semibold text-slate-900 tabular-nums">{total} pcs</span>.
                    Combien transférer vers un nouvel ordre ?
                </div>

                <div className="space-y-2">
                    <input
                        type="range"
                        min={1}
                        max={total - 1}
                        value={qty}
                        onChange={(e) => setQty(Number(e.target.value))}
                        className="w-full accent-slate-900"
                    />
                    <div className="flex items-center justify-between">
                        <input
                            type="number"
                            value={qty || ''}
                            onChange={(e) => setQty(Number(e.target.value) || 0)}
                            className="w-24 h-8 px-2 text-[13px] tabular-nums text-slate-900 bg-white border border-slate-200 rounded-md focus:border-slate-400 outline-none"
                            min={1}
                            max={total - 1}
                        />
                        <span className="text-[12px] text-slate-500 tabular-nums">sur {total}</span>
                    </div>
                </div>

                {/* Bandeau visuel */}
                <div className="space-y-2">
                    <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100">
                        <div
                            className="bg-slate-700 transition-all"
                            style={{ width: `${(remain / total) * 100}%` }}
                        />
                        <div
                            className="bg-emerald-500 transition-all"
                            style={{ width: `${(qty / total) * 100}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[11px]">
                        <span className="text-slate-700">Original : <span className="font-semibold tabular-nums">{remain} pcs</span></span>
                        <span className="text-emerald-700">Nouveau : <span className="font-semibold tabular-nums">{qty} pcs</span></span>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
