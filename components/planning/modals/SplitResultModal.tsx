import React from 'react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import type { PlanningEvent, ModelData } from '../../../types';
import { evClientName, evModelName, evQty, evStartYmd, evEndYmd, evDeadlineYmd, evModelThumb } from '../shared/eventAccessors';
import { getClientColor } from '../shared/clientColors';
import { ArrowRight, CheckCircle2, Package, Calendar, Hash, Split } from 'lucide-react';

interface Props {
    open: boolean;
    originalEvent: PlanningEvent | null;
    newEvents: PlanningEvent[];
    models: ModelData[];
    onClose: () => void;
}

export default function SplitResultModal({ open, originalEvent, newEvents, models, onClose }: Props) {
    if (!originalEvent || newEvents.length === 0) return null;

    const client = evClientName(originalEvent, models);
    const modelName = evModelName(originalEvent, models);
    const thumb = evModelThumb(originalEvent, models);
    const color = getClientColor(client);

    const originalQty = evQty(originalEvent);
    const startYmd = evStartYmd(originalEvent);
    const endYmd = evEndYmd(originalEvent);
    const ddsYmd = evDeadlineYmd(originalEvent);

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Résultat du fractionnement"
            subtitle={`${client} · ${modelName}`}
            size="lg"
            footer={
                <Button variant="primary" onClick={onClose}>
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Compris
                </Button>
            }
        >
            <div className="space-y-5">
                {/* Success banner */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                        <div className="text-[13px] font-bold text-emerald-800">Fractionnement réussi</div>
                        <div className="text-[11px] text-emerald-600">
                            L'ordre a été divisé en {newEvents.length + 1} ordres
                        </div>
                    </div>
                </div>

                {/* Visual split diagram */}
                <div className="flex items-center justify-center gap-3 py-2">
                    {/* Original */}
                    <div className="flex-1 bg-slate-100 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Avant</div>
                        <div className="text-[20px] font-black text-slate-900 tabular-nums">{originalQty}</div>
                        <div className="text-[10px] text-slate-500">pcs</div>
                    </div>

                    {/* Arrow */}
                    <div className="flex flex-col items-center gap-1">
                        <Split className="w-5 h-5 text-indigo-500" />
                        <div className="text-[9px] font-bold text-indigo-600">SPLIT</div>
                    </div>

                    {/* After */}
                    <div className="flex-1 bg-indigo-50 rounded-xl p-3 text-center border border-indigo-200">
                        <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1">Après</div>
                        <div className="text-[20px] font-black text-indigo-900 tabular-nums">{originalQty}</div>
                        <div className="text-[10px] text-indigo-600">pcs total</div>
                    </div>
                </div>

                {/* Original order (updated) */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: color }}>
                            1
                        </div>
                        <div className="text-[12px] font-bold text-slate-900">Ordre original (mis à jour)</div>
                        <div className="ml-auto px-2 py-0.5 bg-slate-200 rounded-full text-[10px] font-bold text-slate-600">
                            ORIGINAL
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                            <Hash className="w-3.5 h-3.5 text-slate-400" />
                            <div>
                                <div className="text-[9px] font-bold text-slate-500 uppercase">Quantité</div>
                                <div className="text-[14px] font-black text-slate-900 tabular-nums">{originalQty} pcs</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <div>
                                <div className="text-[9px] font-bold text-slate-500 uppercase">Fin estimée</div>
                                <div className="text-[12px] font-semibold text-slate-900">{endYmd || '—'}</div>
                            </div>
                        </div>
                    </div>

                    {ddsYmd && (
                        <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-slate-500">DDS:</span>
                            <span className="font-semibold text-slate-900">{ddsYmd}</span>
                        </div>
                    )}
                </div>

                {/* New orders */}
                {newEvents.map((newEv, idx) => {
                    const newQty = evQty(newEv);
                    const newEnd = evEndYmd(newEv);
                    const newDds = evDeadlineYmd(newEv);

                    return (
                        <div key={newEv.id} className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-indigo-500">
                                    {idx + 2}
                                </div>
                                <div className="text-[12px] font-bold text-indigo-900">Nouvel ordre</div>
                                <div className="ml-auto px-2 py-0.5 bg-indigo-200 rounded-full text-[10px] font-bold text-indigo-700">
                                    NOUVEAU
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex items-center gap-2">
                                    <Hash className="w-3.5 h-3.5 text-indigo-400" />
                                    <div>
                                        <div className="text-[9px] font-bold text-indigo-500 uppercase">Quantité</div>
                                        <div className="text-[14px] font-black text-indigo-900 tabular-nums">{newQty} pcs</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                                    <div>
                                        <div className="text-[9px] font-bold text-indigo-500 uppercase">Fin estimée</div>
                                        <div className="text-[12px] font-semibold text-indigo-900">{newEnd || '—'}</div>
                                    </div>
                                </div>
                            </div>

                            {newDds && (
                                <div className="flex items-center gap-2 text-[11px]">
                                    <span className="text-indigo-500">DDS:</span>
                                    <span className="font-semibold text-indigo-900">{newDds}</span>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Visual bar showing distribution */}
                <div className="space-y-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Répartition</div>
                    <div className="flex h-3 rounded-full overflow-hidden bg-slate-200">
                        <div
                            className="bg-slate-600 transition-all"
                            style={{ width: `${(originalQty / originalQty) * 100}%` }}
                            title={`Original: ${originalQty} pcs`}
                        />
                    </div>
                    <div className="flex gap-4 text-[11px]">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded bg-slate-600" />
                            <span className="text-slate-600">Original: <span className="font-bold">{originalQty} pcs</span></span>
                        </div>
                        {newEvents.map((newEv, idx) => (
                            <div key={newEv.id} className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded bg-indigo-500" />
                                <span className="text-indigo-600">Nouveau {idx + 1}: <span className="font-bold">{evQty(newEv)} pcs</span></span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
