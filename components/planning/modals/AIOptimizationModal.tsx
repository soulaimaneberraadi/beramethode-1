import React, { useEffect, useState } from 'react';
import { Brain, Loader2, CheckCircle2, AlertTriangle, ArrowRightCircle, Sparkles } from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import type { PlanningEvent, Machine } from '../../../types';

interface Props {
    open: boolean;
    onClose: () => void;
    events: PlanningEvent[];
    machines: Machine[];
    settings: any;
    onApply: (actions: any[]) => void;
}

export default function AIOptimizationModal({
    open,
    onClose,
    events,
    machines,
    settings,
    onApply,
}: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<{
        analysis: string;
        suggestions: any[];
        actions: any[];
    } | null>(null);
    const [loadingStep, setLoadingStep] = useState<number>(0);

    // Dynamic loading status messages for user entertainment and feedback
    const loadingSteps = [
        "Consultation de Gemini AI pour analyser le planning...",
        "Calcul des surcharges de capacités sur chaque chaîne de production...",
        "Vérification des correspondances de machines et de pannes critiques...",
        "Recherche de solutions de rééquilibrage intelligentes...",
        "Optimisation finale des dates de livraison..."
    ];

    useEffect(() => {
        if (!open) {
            setData(null);
            setError(null);
            return;
        }

        const runOptimization = async () => {
            setLoading(true);
            setError(null);
            setLoadingStep(0);

            // Cycle through loading steps to show progress
            const interval = setInterval(() => {
                setLoadingStep((prev) => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
            }, 1800);

            try {
                const response = await fetch('/api/ai/optimize-planning', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ events, machines, settings }),
                });

                if (!response.ok) {
                    const errBody = await response.json().catch(() => ({}));
                    throw new Error(errBody.message || `Erreur serveur (${response.status})`);
                }

                const result = await response.json();
                setData({
                    analysis: result.analysis || '',
                    suggestions: result.suggestions || [],
                    actions: result.actions || [],
                });
            } catch (err: any) {
                console.error("AI Optimization failed:", err);
                setError(err.message || "Une erreur inconnue s'est produite lors de l'optimisation.");
            } finally {
                clearInterval(interval);
                setLoading(false);
            }
        };

        runOptimization();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const handleApply = () => {
        if (data && data.actions && data.actions.length > 0) {
            onApply(data.actions);
            onClose();
        }
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Optimisation du planning par IA"
            subtitle="Analyse et suggestions de rééquilibrage automatisées via Google Gemini"
            size="lg"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={loading}>
                        Fermer
                    </Button>
                    {data?.actions?.length > 0 && (
                        <Button
                            variant="primary"
                            icon={<Sparkles className="w-3.5 h-3.5" />}
                            onClick={handleApply}
                        >
                            Appliquer les optimisations ({data.actions?.length ?? 0})
                        </Button>
                    )}
                </>
            }
        >
            {loading && (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-4">
                    <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
                    <div className="space-y-1.5 max-w-sm">
                        <p className="text-[13px] font-semibold text-slate-900">
                            {loadingSteps[loadingStep]}
                        </p>
                        <p className="text-[11px] text-slate-400">
                            Cette opération peut prendre jusqu'à 10 secondes.
                        </p>
                    </div>
                </div>
            )}

            {error && (
                <div className="rounded-lg border border-red-100 bg-red-50/50 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-red-700">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="text-[12px] font-semibold">Une erreur est survenue</span>
                    </div>
                    <p className="text-[12px] text-red-600 leading-relaxed">{error}</p>
                </div>
            )}

            {!loading && !error && data && (
                <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
                    {/* General Analysis */}
                    <div className="rounded-lg bg-slate-50 border border-slate-200/60 p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Brain className="w-4 h-4 text-purple-600" />
                            <h4 className="text-[12px] font-bold text-slate-700 uppercase tracking-wider">
                                Diagnostic de l'IA
                            </h4>
                        </div>
                        <p className="text-[12px] text-slate-600 whitespace-pre-line leading-relaxed font-medium">
                            {data.analysis}
                        </p>
                    </div>

                    {/* Suggestions Section */}
                    <div className="space-y-3">
                        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                            Pistes de correction suggérées ({data.suggestions?.length ?? 0})
                        </h4>

                        {(!data.suggestions || data.suggestions.length === 0) ? (
                            <div className="flex flex-col items-center justify-center py-6 text-slate-400 border border-dashed border-slate-200 rounded-lg">
                                <CheckCircle2 className="w-6 h-6 text-emerald-500 mb-1.5" />
                                <p className="text-[12px] font-medium text-slate-500">Aucun ajustement recommandé</p>
                                <p className="text-[11px] text-slate-400">Le planning est déjà optimisé.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {data.suggestions.map((s, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-100 bg-white shadow-sm ring-1 ring-slate-100/50"
                                    >
                                        <div className="mt-0.5 shrink-0">
                                            {s.type === 'MOVE_EVENT' ? (
                                                <ArrowRightCircle className="w-4 h-4 text-purple-500" />
                                            ) : (
                                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="text-[11px] font-bold text-slate-900">
                                                    {s.modelName}
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-500 font-medium">
                                                    Chaîne {s.chaineId}
                                                </span>
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                    s.type === 'MOVE_EVENT' 
                                                        ? 'bg-purple-50 text-purple-600' 
                                                        : 'bg-amber-50 text-amber-600'
                                                }`}>
                                                    {s.type === 'MOVE_EVENT' ? 'Réallocation' : 'Division de lot'}
                                                </span>
                                            </div>
                                            <p className="text-[12px] text-slate-600 leading-relaxed">
                                                {s.message}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    );
}
