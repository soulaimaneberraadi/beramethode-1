import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { Input, Select } from '../shared/Input';
import type { ModelData } from '../../../types';
import { todayYmd } from '../shared/dateFmt';
import type { ScheduleSuggestion } from '../hooks/useAutoSchedule';

interface Props {
    open: boolean;
    models: ModelData[];
    onClose: () => void;
    suggest: (input: { modelId: string; quantity: number; deadlineDDS?: string }) => ScheduleSuggestion | null;
    onAccept: (data: { modelId: string; chaineId: string; startDate: string; quantity: number; deadlineDDS?: string }) => void;
}

export default function AutoScheduleSuggestion({ open, models, onClose, suggest, onAccept }: Props) {
    const [modelId, setModelId] = useState('');
    const [quantity, setQuantity] = useState(0);
    const [deadlineDDS, setDeadlineDDS] = useState('');

    useEffect(() => {
        if (!open) {
            setModelId(''); setQuantity(0); setDeadlineDDS('');
        }
    }, [open]);

    const suggestion = useMemo<ScheduleSuggestion | null>(() => {
        if (!modelId || quantity <= 0) return null;
        return suggest({ modelId, quantity, deadlineDDS: deadlineDDS || undefined });
    }, [modelId, quantity, deadlineDDS, suggest]);

    const accept = () => {
        if (!suggestion) return;
        onAccept({
            modelId, quantity,
            chaineId: suggestion.chaineId,
            startDate: suggestion.startDate,
            deadlineDDS: deadlineDDS || undefined,
        });
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Planification automatique"
            subtitle="L'algorithme choisit la meilleure chaîne disponible"
            size="md"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>Annuler</Button>
                    <Button variant="primary" onClick={accept} disabled={!suggestion || suggestion.score < 0}>
                        Appliquer la suggestion
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                <Select label="Modèle" value={modelId} onChange={(e) => setModelId(e.target.value)}>
                    <option value="">— Choisir —</option>
                    {models.map(m => (
                        <option key={m.id} value={m.id}>{m.meta_data?.nom_modele || m.id}</option>
                    ))}
                </Select>

                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label="Quantité"
                        type="number"
                        value={quantity || ''}
                        onChange={(e) => setQuantity(Number(e.target.value) || 0)}
                        placeholder="0"
                        min={0}
                    />
                    <Input
                        label="DDS (deadline)"
                        type="date"
                        value={deadlineDDS}
                        onChange={(e) => setDeadlineDDS(e.target.value)}
                        min={todayYmd()}
                    />
                </div>

                {/* Suggestion */}
                {suggestion && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-slate-600" strokeWidth={1.75} />
                                <span className="text-[12px] font-semibold text-slate-900">Suggestion</span>
                            </div>
                            <span className="text-[11px] text-slate-500 tabular-nums">
                                Score <span className="font-semibold text-slate-900">{suggestion.score}</span>
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Chaîne</div>
                                <div className="text-[13px] font-semibold text-slate-900">{suggestion.chainName}</div>
                            </div>
                            <div>
                                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Début</div>
                                <div className="text-[13px] font-medium text-slate-900 tabular-nums">{suggestion.startDate}</div>
                            </div>
                            <div>
                                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Fin</div>
                                <div className="text-[13px] font-medium text-slate-900 tabular-nums">{suggestion.endDate}</div>
                            </div>
                        </div>

                        <ul className="pt-3 border-t border-slate-200/60 space-y-1">
                            {suggestion.reasoning.map((r, i) => (
                                <li key={i} className="text-[11px] text-slate-600 leading-snug">{r}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {!modelId && (
                    <p className="text-[12px] text-slate-400 text-center py-4">
                        Sélectionnez un modèle et une quantité.
                    </p>
                )}
            </div>
        </Modal>
    );
}
