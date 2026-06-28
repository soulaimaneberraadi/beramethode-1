import React, { useEffect, useState } from 'react';
import { Brain, Loader2, CheckCircle2, AlertTriangle, ArrowRightCircle, Sparkles } from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import type { PlanningEvent, Machine } from '../../../types';
import { tx } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';

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
    const { lang } = useLang();
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
        tx(lang,{fr:'Consultation de Gemini AI pour analyser le planning...',ar:'استشارة Gemini AI لتحليل الجدولة...',en:'Consulting Gemini AI to analyze the schedule...',es:'Consultando Gemini AI para analizar el planning...',pt:'Consultando Gemini AI para analisar o planejamento...',tr:'Planı analiz etmek için Gemini AI danışılıyor...'}),
        tx(lang,{fr:'Calcul des surcharges de capacités sur chaque chaîne de production...',ar:'حساب أحمال القدرة الزائدة على كل سلسلة إنتاج...',en:'Calculating capacity overloads on each production chain...',es:'Calculando sobrecargas de capacidad en cada cadena de producción...',pt:'Calculando sobrecargas de capacidade em cada cadeia de produção...',tr:'Her üretim zincirinde kapasite aşımı hesaplanıyor...'}),
        tx(lang,{fr:'Vérification des correspondances de machines et de pannes critiques...',ar:'التحقق من تطابق الماكينات والأعطال الحرجة...',en:'Checking machine matches and critical breakdowns...',es:'Verificando correspondencias de máquinas y averías críticas...',pt:'Verificando correspondências de máquinas e falhas críticas...',tr:'Makine eşleşmeleri ve kritik arızalar kontrol ediliyor...'}),
        tx(lang,{fr:'Recherche de solutions de rééquilibrage intelligentes...',ar:'البحث عن حلول ذكية لإعادة التوازن...',en:'Searching for smart rebalancing solutions...',es:'Buscando soluciones inteligentes de reequilibrio...',pt:'Buscando soluções inteligentes de reequilíbrio...',tr:'Akıllı yeniden dengeleme çözümleri aranıyor...'}),
        tx(lang,{fr:'Optimisation finale des dates de livraison...',ar:'التحسين النهائي لتواريخ التسليم...',en:'Final optimization of delivery dates...',es:'Optimización final de las fechas de entrega...',pt:'Otimização final das datas de entrega...',tr:'Teslim tarihlerinin son optimizasyonu...'})
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
            title={tx(lang,{fr:'Optimisation du planning par IA',ar:'تحسين الجدولة بالذكاء الاصطناعي',en:'AI Planning Optimization',es:'Optimización del planning por IA',pt:'Otimização do planejamento por IA',tr:'YZ ile Plan Optimizasyonu'})}
            subtitle={tx(lang,{fr:"Analyse et suggestions de rééquilibrage automatisées via Google Gemini",ar:'تحليل واقتراحات إعادة التوازن الآلية عبر Google Gemini',en:'Automated rebalancing analysis and suggestions via Google Gemini',es:'Análisis y sugerencias de reequilibrio automatizadas vía Google Gemini',pt:'Análise e sugestões de reequilíbrio automatizadas via Google Gemini',tr:'Google Gemini ile otomatik yeniden dengeleme analizi ve önerileri'})}
            size="lg"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose} disabled={loading}>
                        {tx(lang,{fr:'Fermer',ar:'إغلاق',en:'Close',es:'Cerrar',pt:'Fechar',tr:'Kapat'})}
                    </Button>
                    {data?.actions?.length > 0 && (
                        <Button
                            variant="primary"
                            icon={<Sparkles className="w-3.5 h-3.5" />}
                            onClick={handleApply}
                        >
                            {tx(lang,{fr:`Appliquer les optimisations (${data.actions?.length ?? 0})`,ar:`تطبيق التحسينات (${data.actions?.length ?? 0})`,en:`Apply optimizations (${data.actions?.length ?? 0})`,es:`Aplicar optimizaciones (${data.actions?.length ?? 0})`,pt:`Aplicar otimizações (${data.actions?.length ?? 0})`,tr:`Optimizasyonları uygula (${data.actions?.length ?? 0})`})}
                        </Button>
                    )}
                </>
            }
        >
            {loading && (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center space-y-4">
                    <Loader2 className="w-8 h-8 text-purple-600 dark:text-purple-400 animate-spin" />
                    <div className="space-y-1.5 max-w-sm">
                        <p className="text-[13px] font-semibold text-slate-900 dark:text-dk-text">
                            {loadingSteps[loadingStep]}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-dk-muted">
                            {tx(lang,{fr:"Cette opération peut prendre jusqu'à 10 secondes.",ar:'قد تستغرق هذه العملية حتى 10 ثوانٍ.',en:'This operation may take up to 10 seconds.',es:'Esta operación puede tardar hasta 10 segundos.',pt:'Esta operação pode levar até 10 segundos.',tr:'Bu işlem 10 saniye kadar sürebilir.'})}
                        </p>
                    </div>
                </div>
            )}

            {error && (
                <div className="rounded-lg border border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/30/50 dark:bg-red-900/10 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="text-[12px] font-semibold">{tx(lang,{fr:'Une erreur est survenue',ar:'حدث خطأ',en:'An error occurred',es:'Ocurrió un error',pt:'Ocorreu um erro',tr:'Bir hata oluştu'})}</span>
                    </div>
                    <p className="text-[12px] text-red-600 dark:text-red-400 dark:text-red-300 leading-relaxed">{error}</p>
                </div>
            )}

            {!loading && !error && data && (
                <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
                    {/* General Analysis */}
                    <div className="rounded-lg bg-slate-50 dark:bg-dk-bg border border-slate-200/60 dark:border-dk-border p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Brain className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            <h4 className="text-[12px] font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wider">
                                {tx(lang,{fr:"Diagnostic de l'IA",ar:'تشخيص الذكاء الاصطناعي',en:'AI Diagnosis',es:'Diagnóstico de la IA',pt:'Diagnóstico da IA',tr:'YZ Teşhisi'})}
                            </h4>
                        </div>
                        <p className="text-[12px] text-slate-600 dark:text-dk-text-soft whitespace-pre-line leading-relaxed font-medium">
                            {data.analysis}
                        </p>
                    </div>

                    {/* Suggestions Section */}
                    <div className="space-y-3">
                        <h4 className="text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-wider">
                            {tx(lang,{fr:`Pistes de correction suggérées (${data.suggestions?.length ?? 0})`,ar:`مسارات التصحيح المقترحة (${data.suggestions?.length ?? 0})`,en:`Suggested corrections (${data.suggestions?.length ?? 0})`,es:`Pistas de corrección sugeridas (${data.suggestions?.length ?? 0})`,pt:`Sugestões de correção (${data.suggestions?.length ?? 0})`,tr:`Önerilen düzeltmeler (${data.suggestions?.length ?? 0})`})}
                        </h4>

                        {(!data.suggestions || data.suggestions.length === 0) ? (
                            <div className="flex flex-col items-center justify-center py-6 text-slate-400 dark:text-dk-muted border border-dashed border-slate-200 dark:border-dk-border rounded-lg">
                                <CheckCircle2 className="w-6 h-6 text-emerald-500 mb-1.5" />
                                <p className="text-[12px] font-medium text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'Aucun ajustement recommandé',ar:'لا توجد تعديلات موصى بها',en:'No adjustments recommended',es:'Ningún ajuste recomendado',pt:'Nenhum ajuste recomendado',tr:'Önerilen ayarlama yok'})}</p>
                                <p className="text-[11px] text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Le planning est déjà optimisé.',ar:'الجداولة مُحسَّنة بالفعل.',en:'The schedule is already optimized.',es:'El planning ya está optimizado.',pt:'O planejamento já está otimizado.',tr:'Plan zaten optimize edilmiş.'})}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {data.suggestions.map((s, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-100 dark:border-dk-border bg-white dark:bg-dk-surface shadow-sm dark:shadow-dk-sm ring-1 ring-slate-100/50 dark:ring-dk-border/50"
                                    >
                                        <div className="mt-0.5 shrink-0">
                                            {s.type === 'MOVE_EVENT' ? (
                                                <ArrowRightCircle className="w-4 h-4 text-purple-500 dark:text-purple-400" />
                                            ) : (
                                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <span className="text-[11px] font-bold text-slate-900 dark:text-dk-text">
                                                    {s.modelName}
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-dk-elevated/60 text-[10px] text-slate-500 dark:text-dk-muted font-medium">
                                                    {tx(lang,{fr:'Chaîne',ar:'سلسلة',en:'Chain',es:'Cadena',pt:'Cadeia',tr:'Zincir'})} {s.chaineId}
                                                </span>
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                    s.type === 'MOVE_EVENT' 
                                                        ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400' 
                                                        : 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                                                }`}>
                                                    {s.type === 'MOVE_EVENT' ? tx(lang,{fr:'Réallocation',ar:'إعادة تخصيص',en:'Reallocation',es:'Reasignación',pt:'Realocação',tr:'Yeniden tahsis'}) : tx(lang,{fr:'Division de lot',ar:'تقسيم الدفعة',en:'Lot split',es:'División de lote',pt:'Divisão de lote',tr:'Parti bölme'})}
                                                </span>
                                            </div>
                                            <p className="text-[12px] text-slate-600 dark:text-dk-text-soft leading-relaxed">
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
