import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { Input, Select } from '../shared/Input';
import type { ModelData, PlanningEvent } from '../../../types';
import type { PlanningChain } from '../hooks/usePlanningChains';
import { evClientName, evQty, evStartYmd } from '../shared/eventAccessors';
import type { Issue } from '../hooks/usePlanningValidation';
import { todayYmd } from '../shared/dateFmt';
import { getClientColor } from '../shared/clientColors';

interface Props {
    open: boolean;
    mode: 'create' | 'edit';
    initial?: PlanningEvent | null;
    models: ModelData[];
    chains: PlanningChain[];
    onClose: () => void;
    onSubmit: (data: {
        modelId: string;
        chaineId: string;
        startDate: string;
        quantity: number;
        clientName: string;
        strictDeadline_DDS: string;
        fournisseurDate: string;
        color: string;
        isSubcontracted?: boolean;
        subcontractorName?: string;
        subcontractStatus?: 'PENDING' | 'SENT' | 'COMPLETED';
    }) => void;
    checkDraft?: (draft: {
        modelId: string; chaineId: string; startDate: string; quantity: number; strictDeadline_DDS?: string;
    }) => Issue[];
}

export default function EventEditor({ open, mode, initial, models, chains, onClose, onSubmit, checkDraft }: Props) {
    const [modelId, setModelId] = useState('');
    const [chaineId, setChaineId] = useState(chains[0]?.id || 'CHAINE 1');
    const [startDate, setStartDate] = useState(todayYmd());
    const [quantity, setQuantity] = useState(0);
    const [clientName, setClientName] = useState('');
    const [strictDeadline, setStrictDeadline] = useState('');
    const [fournisseurDate, setFournisseurDate] = useState('');
    const [isSubcontracted, setIsSubcontracted] = useState(false);
    const [subcontractorName, setSubcontractorName] = useState('');
    const [subcontractStatus, setSubcontractStatus] = useState<'PENDING' | 'SENT' | 'COMPLETED'>('PENDING');

    useEffect(() => {
        if (!open) return;
        if (mode === 'edit' && initial) {
            setModelId(initial.modelId);
            setChaineId(initial.chaineId);
            setStartDate(evStartYmd(initial) || todayYmd());
            setQuantity(evQty(initial));
            setClientName(evClientName(initial, models));
            setStrictDeadline((initial.strictDeadline_DDS || '').split('T')[0]);
            setFournisseurDate((initial.fournisseurDate || '').split('T')[0]);
            setIsSubcontracted(!!initial.isSubcontracted);
            setSubcontractorName(initial.subcontractorName || '');
            setSubcontractStatus(initial.subcontractStatus || 'PENDING');
        } else {
            setModelId('');
            setChaineId(chains[0]?.id || 'CHAINE 1');
            setStartDate(todayYmd());
            setQuantity(0);
            setClientName('');
            setStrictDeadline('');
            setFournisseurDate('');
            setIsSubcontracted(false);
            setSubcontractorName('');
            setSubcontractStatus('PENDING');
        }
    }, [open, mode, initial, chains, models]);

    const selectedModel = models.find(m => m.id === modelId);

    useEffect(() => {
        if (mode === 'create' && selectedModel && !clientName) {
            setClientName(selectedModel.ficheData?.client || '');
        }
    }, [modelId, selectedModel, mode]); // eslint-disable-line react-hooks/exhaustive-deps

    const draftIssues = useMemo<Issue[]>(() => {
        if (!checkDraft || !modelId || quantity <= 0) return [];
        return checkDraft({ modelId, chaineId, startDate, quantity, strictDeadline_DDS: strictDeadline });
    }, [checkDraft, modelId, chaineId, startDate, quantity, strictDeadline]);

    const color = getClientColor(clientName);

    const submit = () => {
        if (!modelId || quantity <= 0) return;
        onSubmit({
            modelId, chaineId, startDate, quantity,
            clientName, strictDeadline_DDS: strictDeadline,
            fournisseurDate, color,
            isSubcontracted,
            subcontractorName: isSubcontracted ? subcontractorName : undefined,
            subcontractStatus: isSubcontracted ? subcontractStatus : undefined,
        });
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={mode === 'create' ? 'Nouvel ordre' : 'Modifier l\'ordre'}
            subtitle={mode === 'create' ? 'Configurez les paramètres principaux' : initial?.modelName}
            size="md"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>Annuler</Button>
                    <Button variant="primary" onClick={submit} disabled={!modelId || quantity <= 0}>
                        {mode === 'create' ? 'Créer l\'ordre' : 'Enregistrer'}
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                {/* Modèle — full width */}
                <Select label="Modèle" value={modelId} onChange={(e) => setModelId(e.target.value)}>
                    <option value="">— Choisir —</option>
                    {models.map(m => (
                        <option key={m.id} value={m.id}>
                            {m.meta_data?.nom_modele || m.id}
                        </option>
                    ))}
                </Select>

                {/* Grid 2 cols */}
                <div className="grid grid-cols-2 gap-3">
                    <Input
                        label="Quantité"
                        type="number"
                        value={quantity || ''}
                        onChange={(e) => setQuantity(Number(e.target.value) || 0)}
                        placeholder="0"
                        min={0}
                    />
                    <Select label="Chaîne" value={chaineId} onChange={(e) => setChaineId(e.target.value)}>
                        {chains.map(c => (
                            <option key={c.id} value={c.id}>
                                {c.name}  ·  η {Math.round(c.efficiency * 100)}%
                            </option>
                        ))}
                    </Select>

                    <Input
                        label="Date de lancement"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                    <Input
                        label="DDS (deadline)"
                        type="date"
                        value={strictDeadline}
                        onChange={(e) => setStrictDeadline(e.target.value)}
                    />

                    <div className="space-y-1.5">
                        <label className="block text-[11px] font-medium text-slate-600">Client</label>
                        <div className="relative">
                            <span
                                className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
                                style={{ background: color }}
                            />
                            <input
                                type="text"
                                className="w-full h-9 pl-8 pr-3 text-[13px] text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md focus:border-slate-400 focus:ring-2 focus:ring-slate-100 outline-none transition-colors"
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="Nom du client"
                            />
                        </div>
                    </div>

                    <Input
                        label="Matières (optionnel)"
                        type="date"
                        value={fournisseurDate}
                        onChange={(e) => setFournisseurDate(e.target.value)}
                    />
                </div>

                {/* Subcontracting toggle and inputs */}
                <div className="border-t border-slate-100 pt-3 mt-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={isSubcontracted}
                            onChange={(e) => setIsSubcontracted(e.target.checked)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-[12px] font-medium text-slate-700">En sous-traitance (المناولة)</span>
                    </label>
                    
                    {isSubcontracted && (
                        <div className="grid grid-cols-2 gap-3 mt-3 animate-[planning-slide-in-right_150ms_ease-out]">
                            <Input
                                label="Nom du sous-traitant (اسم المناول)"
                                type="text"
                                value={subcontractorName}
                                onChange={(e) => setSubcontractorName(e.target.value)}
                                placeholder="Ex: Atelier X"
                            />
                            <Select
                                label="Statut (الحالة)"
                                value={subcontractStatus}
                                onChange={(e) => setSubcontractStatus(e.target.value as any)}
                            >
                                <option value="PENDING">En attente (في الانتظار)</option>
                                <option value="SENT">Envoyé (تم الإرسال)</option>
                                <option value="COMPLETED">Complété (مكتمل)</option>
                            </Select>
                        </div>
                    )}
                </div>

                {/* Live validation hints */}
                {draftIssues.length > 0 && (
                    <div className="rounded-lg bg-amber-50/40 border border-amber-100 p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800">
                            <AlertTriangle className="w-3 h-3" strokeWidth={2} />
                            {draftIssues.length} point{draftIssues.length > 1 ? 's' : ''} d'attention
                        </div>
                        {draftIssues.map(i => (
                            <div key={i.id} className="text-[11px] text-amber-900 leading-snug">
                                <span className="font-medium">{i.title}</span> — {i.detail}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
