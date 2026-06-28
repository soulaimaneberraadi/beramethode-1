import React, { useState, useEffect } from 'react';
import {
    Package, ChevronDown, ChevronUp, Palette, ShoppingCart,
    Banknote, Clock, TrendingUp, CheckCircle2, AlertTriangle,
    X, Percent, BoxSelect, Layers, Tag, Truck
} from 'lucide-react';
import { Material, PurchasingData, AppSettings, FicheData } from '../types';
import { fmt } from '../constants';
import SensitiveValue from './ui/SensitiveValue';

// ─── Toast Notification ──────────────────────────────────────────────────────

interface ToastData {
    id: number;
    type: 'success' | 'error' | 'info';
    message: string;
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: number) => void }) {
    return (
        <div className="fixed top-4 left-4 z-[9999] flex flex-col gap-2" style={{ direction: 'rtl' }}>
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    className={`flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl border backdrop-blur-sm text-sm font-bold
                        animate-[slideInRight_0.4s_ease-out]
                        ${toast.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/30/95 border-emerald-200 text-emerald-800' : ''}
                        ${toast.type === 'error' ? 'bg-red-50 dark:bg-red-900/30/95 border-red-200 text-red-800' : ''}
                        ${toast.type === 'info' ? 'bg-blue-50 dark:bg-blue-900/30/95 border-blue-200 text-blue-800' : ''}
                    `}
                >
                    {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />}
                    {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />}
                    {toast.type === 'info' && <Package className="w-5 h-5 text-blue-500 shrink-0" />}
                    <span>{toast.message}</span>
                    <button onClick={() => onDismiss(toast.id)} className="mr-2 opacity-50 hover:opacity-100 transition">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
        </div>
    );
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface OrderModelPageProps {
    productName: string;
    productImage: string | null;
    displayDate: string;
    currency: string;
    // Materials
    materials: Material[];
    addMaterial: () => void;
    updateMaterial: (id: number, field: string, value: string | number) => void;
    deleteMaterial: (id: number) => void;
    totalMaterials: number;
    // Order Simulation
    wasteRate: number;
    setWasteRate: (v: number) => void;
    purchasingData: (PurchasingData & { name: string; unit: string; fournisseur?: string })[];
    totalPurchasingMatCost: number;
    laborCost: number;
    // Pricing
    costPrice: number;
    sellPriceHT: number;
    sellPriceTTC: number;
    boutiquePrice: number;
    totalTime: number;
    baseTime: number;
    settings: AppSettings;
    // FicheData
    ficheData: FicheData;
    setFicheData: React.Dispatch<React.SetStateAction<FicheData>>;
    // Deduct stock
    deductStock: () => void;
}

// ─── Color palette for badges ────────────────────────────────────────────────
const BADGE_COLORS = [
    { bg: 'bg-rose-100', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' },
    { bg: 'bg-sky-100', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-500' },
    { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
    { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-500' },
    { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
    { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200', dot: 'bg-cyan-500' },
    { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200', dot: 'bg-pink-500' },
];

// ─── Main Component ──────────────────────────────────────────────────────────

const OrderModelPage: React.FC<OrderModelPageProps> = ({
    productName, productImage, displayDate, currency,
    materials, addMaterial, updateMaterial, deleteMaterial, totalMaterials,
    wasteRate, setWasteRate,
    purchasingData, totalPurchasingMatCost, laborCost,
    costPrice, sellPriceHT, sellPriceTTC, boutiquePrice,
    totalTime, baseTime, settings,
    ficheData, setFicheData,
    deductStock
}) => {
    // State
    const [commoditiesOpen, setCommoditiesOpen] = useState(true);
    const [toasts, setToasts] = useState<ToastData[]>([]);
    const [confirmLoading, setConfirmLoading] = useState(false);

    // Get order quantity from ficheData or default to 1
    const orderQty = ficheData.quantity > 0 ? ficheData.quantity : 1;

    const isExport = ficheData.typeMarche === 'Export';
    const totalProjectCost = isExport ? (laborCost * orderQty) : totalPurchasingMatCost + (laborCost * orderQty);
    const costPerPiece = orderQty > 0 ? totalProjectCost / orderQty : 0;

    const sizes = ficheData.sizes || [];
    const colors = ficheData.colors || [];
    const gridQuantities = ficheData.gridQuantities || {};

    const matrixStats = React.useMemo(() => {
        let grandTotal = 0;
        const rowTotals: Record<string, number> = {};
        const colTotals: number[] = new Array(sizes.length).fill(0);

        colors.forEach(c => {
            let rowSum = 0;
            sizes.forEach((_, sIdx) => {
                const q = gridQuantities[`${c.id}_${sIdx}`] || 0;
                rowSum += q;
                colTotals[sIdx] += q;
                grandTotal += q;
            });
            rowTotals[c.id] = rowSum;
        });
        return { grandTotal, rowTotals, colTotals };
    }, [sizes, colors, gridQuantities]);

    const updateQuantity = (colorId: string, sizeIndex: number, value: string) => {
        const numValue = value === '' ? 0 : parseInt(value);
        if (isNaN(numValue)) return;
        setFicheData(prev => {
            const newQs = { ...(prev.gridQuantities || {}), [`${colorId}_${sizeIndex}`]: numValue };
            let newTotal = 0;
            Object.values(newQs).forEach(v => newTotal += Number(v));
            return { ...prev, gridQuantities: newQs, quantity: newTotal > 0 ? newTotal : 1 };
        });
    };

    // Toast helpers
    const showToast = (type: ToastData['type'], message: string) => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };
    const dismissToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

    // Confirm order handler
    const handleConfirm = () => {
        if (materials.length === 0) {
            showToast('error', 'لا توجد مواد لتأكيد الطلبية');
            return;
        }
        if (orderQty <= 0) {
            showToast('error', 'يرجى تحديد كمية الطلبية');
            return;
        }

        setConfirmLoading(true);
        // Small delay for UX
        setTimeout(() => {
            try {
                const magasinStr = localStorage.getItem('beramethode_magasin');
                if (!magasinStr) {
                    showToast('info', 'لم يتم العثور على بيانات المخزن. تم حفظ الطلبية فقط');
                    setConfirmLoading(false);
                    return;
                }

                let magasinData = JSON.parse(magasinStr);
                let updated = false;

                purchasingData.forEach(mat => {
                    const magItem = magasinData.find((m: any) => m.nom === mat.name || m.designation === mat.name);
                    if (magItem) {
                        magItem.stockActuel = Math.max(0, (magItem.stockActuel || 0) - mat.qtyToBuy);
                        updated = true;
                    }
                });

                if (updated) {
                    localStorage.setItem('beramethode_magasin', JSON.stringify(magasinData));
                    showToast('success', `✅ تم تأكيد الطلبية وخصم المخزون بنجاح — ${orderQty} قطعة`);
                } else {
                    showToast('info', 'لم يتم العثور على مواد مطابقة في المخزن للخصم');
                }
            } catch (e) {
                console.error(e);
                showToast('error', 'حدث خطأ أثناء خصم المخزون');
            }
            setConfirmLoading(false);
        }, 600);
    };

    return (
        <div dir="rtl" style={{ fontFamily: "'Inter', sans-serif" }} className="min-h-screen bg-gray-50 dark:bg-dk-bg p-4 pb-24">
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />

            {/* ═══════════════════════════════════════════════════════════════════
                ORDER HEADER — Model Info with gradient accent
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="bg-gradient-to-l from-indigo-600 via-indigo-700 to-violet-800 rounded-2xl p-6 mb-6 shadow-xl shadow-indigo-200/40 relative overflow-hidden">
                {/* Decorative */}
                <div className="absolute top-0 left-0 w-40 h-40 bg-white dark:bg-dk-surface/5 rounded-full -translate-x-16 -translate-y-16" />
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-white dark:bg-dk-surface/5 rounded-full translate-x-12 translate-y-12" />

                <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-5">
                    {/* Image */}
                    {productImage ? (
                        <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg shrink-0 bg-white dark:bg-dk-surface/10">
                            <img src={productImage} alt={productName} className="w-full h-full object-cover" />
                        </div>
                    ) : (
                        <div className="w-20 h-20 rounded-xl border-2 border-white/20 bg-white dark:bg-dk-surface/10 flex items-center justify-center shrink-0">
                            <BoxSelect className="w-8 h-8 text-white/40" />
                        </div>
                    )}

                    {/* Info */}
                    <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">أمر الإنتاج</p>
                            {ficheData.typeMarche === 'Export' && (
                                <span className="bg-amber-500/20 text-amber-200 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider mb-1 animate-pulse">
                                    تصدير - يد عاملة فقط (Export)
                                </span>
                            )}
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                            {productName || 'بدون اسم'}
                        </h1>
                        <div className="flex flex-wrap items-center gap-4 mt-2 text-indigo-100 text-xs font-medium">
                            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {displayDate}</span>
                            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> الوقت: {fmt(totalTime)} دقيقة</span>
                            <span className="flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5" /> تكلفة الدقيقة: {fmt(settings.costMinute)} {currency}</span>
                        </div>
                    </div>

                    {/* Quick Stats Badges */}
                    <div className="flex gap-3 shrink-0 flex-wrap">
                        <div className="bg-white dark:bg-dk-surface/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10">
                            <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider">سعر التكلفة</p>
                            <p className="text-xl font-black text-white"><SensitiveValue field="model.prix_revient">{fmt(costPrice)} <span className="text-xs text-indigo-200">{currency}</span></SensitiveValue></p>
                        </div>
                        <div className="bg-white dark:bg-dk-surface/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center border border-white/10">
                            <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider">سعر البيع</p>
                            <p className="text-xl font-black text-white">{fmt(sellPriceHT)} <span className="text-xs text-indigo-200">{currency}</span></p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                ORDER CONTROLS — Quantity & Waste
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm mb-6 p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-100 p-2.5 rounded-xl">
                            <ShoppingCart className="w-5 h-5 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" />
                        </div>
                        <div>
                            <h2 className="font-black text-slate-800 dark:text-dk-text text-lg">معلومات الطلبية</h2>
                            <p className="text-xs text-slate-500 dark:text-dk-muted font-medium">تحديد الكمية ونسبة الهالك</p>
                        </div>
                    </div>

                    <div className="flex gap-3 flex-wrap">
                        {/* Order Qty (Read-Only when using Matrix) */}
                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-dk-bg rounded-xl px-4 py-2.5 border border-slate-200 dark:border-dk-border opacity-90 cursor-not-allowed">
                            <span className="text-xs font-bold text-slate-500 dark:text-dk-muted whitespace-nowrap">الكمية الإجمالية</span>
                            <div className="w-px h-5 bg-slate-200" />
                            <input
                                type="number" min="1" value={orderQty} readOnly
                                title="يتم حساب الكمية الإجمالية من جدول التوزيع أدناه"
                                className="w-20 text-center font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text bg-transparent outline-none text-lg cursor-not-allowed"
                            />
                            <ShoppingCart className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                        </div>

                        {/* Waste Rate */}
                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-dk-bg rounded-xl px-4 py-2.5 border border-slate-200 dark:border-dk-border focus-within:ring-2 focus-within:ring-amber-400 focus-within:border-amber-400 transition-all">
                            <span className="text-xs font-bold text-slate-500 dark:text-dk-muted whitespace-nowrap">نسبة الهالك</span>
                            <div className="w-px h-5 bg-slate-200" />
                            <input
                                type="number" min="0" value={wasteRate}
                                onChange={e => setWasteRate(Math.max(0, parseFloat(e.target.value) || 0))}
                                className="w-14 text-center font-black text-amber-600 dark:text-amber-400 bg-transparent outline-none text-lg"
                            />
                            <Percent className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                COMMODITIES / MATERIALS — Expandable Section
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm mb-6 overflow-hidden">
                {/* Header — Toggle */}
                <button
                    onClick={() => setCommoditiesOpen(!commoditiesOpen)}
                    className="w-full px-5 py-4 flex items-center justify-between bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border hover:bg-slate-100 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-emerald-100 p-2 rounded-lg">
                            <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="text-right">
                            <h3 className="font-black text-slate-800 dark:text-dk-text text-base">المواد الأولية</h3>
                            <p className="text-xs text-slate-500 dark:text-dk-muted">{materials.length} مادة — الإجمالي: {fmt(totalMaterials)} {currency}</p>
                        </div>
                    </div>
                    {commoditiesOpen ? <ChevronUp className="w-5 h-5 text-slate-400 dark:text-dk-muted" /> : <ChevronDown className="w-5 h-5 text-slate-400 dark:text-dk-muted" />}
                </button>

                {/* Materials Table */}
                {commoditiesOpen && (
                    <div className="p-4">
                        <div className="rounded-xl border border-slate-200 dark:border-dk-border md:overflow-x-auto">
                            <table className="w-full block md:table text-sm">
                                <thead className="hidden md:table-header-group">
                                    <tr className="bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted text-xs font-bold uppercase tracking-wider">
                                        <th className="px-4 py-3 text-right">المادة</th>
                                        <th className="px-4 py-3 text-center">المورد</th>
                                        <th className="px-4 py-3 text-center">السعر</th>
                                        <th className="px-4 py-3 text-center">الكمية / الوحدة</th>
                                        <th className="px-4 py-3 text-center">الاحتياج (+{wasteRate}%)</th>
                                        <th className="px-4 py-3 text-center font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text">للشراء</th>
                                        <th className="px-4 py-3 text-center">الإجمالي</th>
                                    </tr>
                                </thead>
                                <tbody className="block md:table-row-group md:divide-y md:divide-slate-100">
                                    {purchasingData.length === 0 ? (
                                        <tr className="block md:table-row">
                                            <td colSpan={7} className="block md:table-cell px-4 py-8 text-center text-slate-400 dark:text-dk-muted text-sm">
                                                لا توجد مواد مضافة بعد
                                            </td>
                                        </tr>
                                    ) : (
                                        purchasingData.map(m => (
                                            <tr key={m.id} className="block md:table-row border border-slate-200 dark:border-dk-border rounded-xl mb-3 p-2 md:p-0 md:mb-0 md:border-0 md:rounded-none hover:bg-indigo-50 dark:bg-dk-accent/20/30 transition-colors group">
                                                <td className="block md:table-cell px-4 py-2 md:py-3 font-semibold text-slate-800 dark:text-dk-text">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                                                        {m.name || '—'}
                                                        {m.unit === 'bobine' && (
                                                            <span className="text-[10px] text-slate-400 dark:text-dk-muted font-normal">({m.threadMeters}م / بكرة)</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center text-xs text-slate-500 dark:text-dk-muted">
                                                    <span className="md:hidden text-[10px] font-bold text-slate-400 dark:text-dk-muted">المورد</span>
                                                    <span>{m.fournisseur || '—'}</span>
                                                </td>
                                                <td className="flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center text-xs font-medium text-slate-600 dark:text-dk-text-soft">
                                                    <span className="md:hidden text-[10px] font-bold text-slate-400 dark:text-dk-muted">السعر</span>
                                                    <span>{isExport ? '0 (Fourni)' : `${m.unitPrice} ${currency}`}</span>
                                                </td>
                                                <td className="flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center text-xs text-slate-500 dark:text-dk-muted">
                                                    <span className="md:hidden text-[10px] font-bold text-slate-400 dark:text-dk-muted">الكمية / الوحدة</span>
                                                    <span>{fmt(m.qty)} {m.unit}</span>
                                                </td>
                                                <td className="flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center text-xs text-slate-500 dark:text-dk-muted">
                                                    <span className="md:hidden text-[10px] font-bold text-slate-400 dark:text-dk-muted">الاحتياج (+{wasteRate}%)</span>
                                                    <span>{fmt(m.totalWithWaste)} {m.unit}</span>
                                                </td>
                                                <td className="flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 md:text-center">
                                                    <span className="md:hidden text-[10px] font-bold text-slate-400 dark:text-dk-muted">للشراء</span>
                                                    <span className="inline-block px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-100 text-indigo-700 dark:text-dk-accent-text border border-indigo-200">
                                                        {fmt(m.qtyToBuy)} {m.unit}
                                                    </span>
                                                </td>
                                                <td className="flex md:table-cell items-center justify-between px-4 py-1.5 md:py-3 mt-1 pt-2 md:mt-0 md:pt-3 border-t md:border-t-0 border-slate-100 dark:border-dk-border md:text-center font-bold text-slate-800 dark:text-dk-text">
                                                    <span className="md:hidden text-[10px] font-bold text-slate-400 dark:text-dk-muted">الإجمالي</span>
                                                    <span>{isExport ? 0 : fmt(m.lineCost)} {currency}</span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                                {purchasingData.length > 0 && (
                                    <tfoot className="block md:table-footer-group">
                                        <tr className="flex md:table-row items-center justify-between bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 border-t-2 border-indigo-200 rounded-xl md:rounded-none mt-2 md:mt-0 px-2 md:px-0">
                                            <td colSpan={6} className="block md:table-cell px-4 py-3 text-right md:text-left font-black text-indigo-700 dark:text-dk-accent-text text-sm">
                                                إجمالي تكلفة المواد
                                            </td>
                                            <td className="block md:table-cell px-4 py-3 text-center font-black text-indigo-700 dark:text-dk-accent-text text-base md:text-lg">
                                                {fmt(totalPurchasingMatCost)} {currency}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                MATRIX BREAKDOWN — Per-Color & Size Grid with Costs
            ═══════════════════════════════════════════════════════════════════ */}
            {colors.length > 0 && (
                <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm mb-6 overflow-hidden">
                    <div className="px-5 py-4 bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-violet-100 p-2 rounded-lg">
                                <Palette className="w-5 h-5 text-violet-600" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-800 dark:text-dk-text text-base">جدول التوزيع وتكلفة القياسات</h3>
                                <p className="text-xs text-slate-500 dark:text-dk-muted">توزيع الكميات والتكاليف المحسوبة (تتحدث تلقائياً مع الفيش تكنيك)</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 overflow-x-auto">
                        <table className="w-full text-sm border-collapse rounded-xl overflow-hidden border border-slate-200 dark:border-dk-border">
                            <thead>
                                <tr className="bg-slate-100 dark:bg-dk-elevated text-slate-600 dark:text-dk-text-soft border-b border-slate-200 dark:border-dk-border text-xs uppercase tracking-wider">
                                    <th className="py-4 px-4 text-right font-black border-l border-slate-200 dark:border-dk-border min-w-[140px]">اللون \ القياس</th>
                                    {sizes.length === 0 && (
                                        <th className="py-4 px-4 text-center font-normal italic text-slate-400 dark:text-dk-muted border-l border-slate-200 dark:border-dk-border">
                                            لم يتم تحديد قياسات
                                        </th>
                                    )}
                                    {sizes.map((s, i) => (
                                        <th key={i} className="py-4 px-3 text-center font-black border-l border-slate-200 dark:border-dk-border text-indigo-700 dark:text-dk-accent-text min-w-[90px]">
                                            {s}
                                        </th>
                                    ))}
                                    <th className="py-4 px-4 text-center font-black bg-slate-200 text-slate-800 dark:text-dk-text w-24">المجموع</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {colors.map((c, cIdx) => {
                                    const rowTotalCost = matrixStats.rowTotals[c.id] * costPerPiece;
                                    const cHex = c.id && c.id.startsWith('#') ? c.id : null;
                                    const palette = BADGE_COLORS[cIdx % BADGE_COLORS.length];
                                    return (
                                        <tr key={`${c.id}-${cIdx}`} className="hover:bg-indigo-50 dark:bg-dk-accent/20/20 group">
                                            <td className="py-3 px-4 border-l border-slate-200 dark:border-dk-border font-bold text-slate-800 dark:text-dk-text">
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className={`w-3 h-3 rounded-full shadow-sm ${cHex ? '' : palette.dot}`}
                                                        style={cHex ? { backgroundColor: cHex } : undefined}
                                                    />
                                                    <span className="truncate max-w-[120px]">{c.name}</span>
                                                </div>
                                            </td>
                                            {sizes.length === 0 && (
                                                <td className="py-3 px-4 border-l border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/50 text-center text-slate-400 dark:text-dk-muted text-xl font-light">-</td>
                                            )}
                                            {sizes.map((s, sIdx) => {
                                                const key = `${c.id}_${sIdx}`;
                                                // eslint-disable-next-line
                                                const val = gridQuantities[key] || '';
                                                const qty = Number(val) || 0;
                                                const cost = qty * costPerPiece;
                                                return (
                                                    <td key={sIdx} className="p-0 border-l border-slate-100 dark:border-dk-border bg-white hover:bg-indigo-50 dark:bg-dk-accent/20/50 transition-colors relative">
                                                        <input
                                                            type="number" min="0"
                                                            className="w-full text-center py-3 bg-transparent outline-none focus:text-indigo-700 dark:text-dk-accent-text font-bold text-base placeholder:text-slate-200"
                                                            placeholder="0"
                                                            value={val}
                                                            onChange={(e) => updateQuantity(c.id, sIdx, e.target.value)}
                                                        />
                                                        {qty > 0 && (
                                                            <div className="absolute bottom-1 left-0 right-0 text-center pointer-events-none">
                                                                <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted bg-white dark:bg-dk-surface/80 px-1 rounded-sm">
                                                                    {fmt(cost)} {currency}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td className="py-3 px-4 text-center border-l border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg relative group-hover:bg-slate-100 transition-colors">
                                                <div className="font-black text-slate-800 dark:text-dk-text text-lg">{matrixStats.rowTotals[c.id]}</div>
                                                {matrixStats.rowTotals[c.id] > 0 && (
                                                    <div className="text-[10px] font-bold text-indigo-500 mt-0.5">
                                                        {fmt(rowTotalCost)} {currency}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg">
                                <tr>
                                    <td className="py-4 px-4 text-left font-black text-slate-600 dark:text-dk-text-soft border-l border-slate-200 dark:border-dk-border">
                                        الإجمالي
                                    </td>
                                    {sizes.length === 0 && (
                                        <td className="py-3 px-4 text-center text-slate-400 dark:text-dk-muted border-l border-slate-200 dark:border-dk-border">-</td>
                                    )}
                                    {sizes.map((_, sIdx) => {
                                        const colTotal = matrixStats.colTotals[sIdx] || 0;
                                        const colCost = colTotal * costPerPiece;
                                        return (
                                            <td key={sIdx} className="py-3 px-3 text-center border-l border-slate-200 dark:border-dk-border">
                                                <div className="font-black text-slate-700 dark:text-dk-text-soft">{colTotal}</div>
                                                {colTotal > 0 && (
                                                    <div className="text-[9px] font-bold text-slate-500 dark:text-dk-muted">{fmt(colCost)} {currency}</div>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="py-3 px-4 text-center bg-indigo-600 dark:bg-dk-accent text-white shadow-inner relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-full h-full bg-indigo-500/30 transform -skew-x-12 translate-x-4"></div>
                                        <div className="relative z-10 font-black text-xl">{matrixStats.grandTotal}</div>
                                        <div className="relative z-10 text-[10px] text-indigo-200 font-bold tracking-wider uppercase mt-1">القطع</div>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════
                SUMMARY DASHBOARD — 4 Cards
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* Card 1: Material Budget */}
                <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border p-5 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider mb-1">ميزانية المواد</p>
                            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{fmt(totalPurchasingMatCost)} <span className="text-xs text-slate-400 dark:text-dk-muted">{currency}</span></p>
                        </div>
                        <div className="bg-emerald-100 p-2 rounded-lg group-hover:scale-110 transition-transform">
                            <Banknote className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400 dark:text-dk-muted pt-3 border-t border-slate-100 dark:border-dk-border">
                        <span>{purchasingData.length} مادة</span>
                        <span>محسوب على الشراء الفعلي</span>
                    </div>
                </div>

                {/* Card 2: Labor Cost */}
                <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider mb-1">تكلفة العمالة</p>
                            <p className="text-2xl font-black text-blue-600 dark:text-blue-400">{fmt(laborCost * orderQty)} <span className="text-xs text-slate-400 dark:text-dk-muted">{currency}</span></p>
                        </div>
                        <div className="bg-blue-100 p-2 rounded-lg group-hover:scale-110 transition-transform">
                            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400 dark:text-dk-muted pt-3 border-t border-slate-100 dark:border-dk-border">
                        <span>{orderQty} قطعة × {fmt(laborCost)}/قطعة</span>
                        <span>تكلفة اليد العاملة</span>
                    </div>
                </div>

                {/* Card 3: Cost Per Piece */}
                <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border p-5 shadow-sm hover:shadow-md hover:border-amber-200 transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider mb-1">تكلفة القطعة</p>
                            <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{fmt(costPerPiece)} <span className="text-xs text-slate-400 dark:text-dk-muted">{currency}</span></p>
                        </div>
                        <div className="bg-amber-100 p-2 rounded-lg group-hover:scale-110 transition-transform">
                            <Tag className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        </div>
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400 dark:text-dk-muted pt-3 border-t border-slate-100 dark:border-dk-border">
                        <span>مواد + عمالة</span>
                        <span>لكل قطعة واحدة</span>
                    </div>
                </div>

                {/* Card 4: Grand Total — Gradient */}
                <div className="bg-gradient-to-bl from-indigo-600 to-violet-700 rounded-2xl p-5 shadow-lg shadow-indigo-200/50 text-white relative overflow-hidden group">
                    <div className="absolute top-0 left-0 p-4 opacity-10">
                        <Package className="w-20 h-20 transform -rotate-12" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider mb-1">الميزانية الإجمالية</p>
                        <p className="text-3xl font-black tracking-tight">{fmt(totalProjectCost)} <span className="text-sm text-indigo-200">{currency}</span></p>
                    </div>
                    <div className="relative z-10 flex justify-between items-center text-[11px] text-indigo-100 pt-3 mt-4 border-t border-indigo-500/30">
                        <span>الكمية: {orderQty} قطعة</span>
                        <span className="bg-white dark:bg-dk-surface/20 px-2 py-0.5 rounded font-bold">{fmt(costPerPiece)} {currency}/قطعة</span>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                PRICING LADDER — Quick View
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm mb-6 overflow-hidden">
                <div className="px-5 py-4 bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border flex items-center gap-3">
                    <div className="bg-indigo-100 p-2 rounded-lg">
                        <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text" />
                    </div>
                    <h3 className="font-black text-slate-800 dark:text-dk-text text-base">سلم الأسعار</h3>
                </div>
                <div className="p-5">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {[
                            { label: 'سعر التكلفة (PR)', value: costPrice, color: 'text-slate-800 dark:text-dk-text', field: 'model.prix_revient' },
                            { label: `سعر البيع HT (+${settings.marginAtelier}%)`, value: sellPriceHT, color: 'text-blue-700', field: null },
                            { label: `سعر البيع TTC (+${settings.tva}%)`, value: sellPriceTTC, color: 'text-indigo-700 dark:text-dk-accent-text', field: null },
                            { label: `سعر المحل (+${settings.marginBoutique}%)`, value: boutiquePrice, color: 'text-violet-700', field: null },
                            { label: 'ربح المصنع / قطعة', value: sellPriceHT - costPrice, color: 'text-emerald-700', field: null },
                        ].map((item, i) => (
                            <div key={i} className="text-center p-3 rounded-xl bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border hover:bg-white hover:border-slate-200 hover:shadow-sm transition-all">
                                <p className="text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider mb-2">{item.label}</p>
                                <p className={`text-xl font-black ${item.color}`}>
                                  {item.field ? (
                                    <SensitiveValue field={item.field}>{fmt(item.value)} <span className="text-[10px] text-slate-400 dark:text-dk-muted">{currency}</span></SensitiveValue>
                                  ) : (
                                    <>{fmt(item.value)} <span className="text-[10px] text-slate-400 dark:text-dk-muted">{currency}</span></>
                                  )}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                CONFIRM BUTTON
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="flex justify-center pt-2 pb-8">
                <button
                    onClick={handleConfirm}
                    disabled={confirmLoading}
                    className={`
                        flex items-center gap-3 px-10 py-4 rounded-2xl font-black text-lg shadow-xl
                        transition-all active:scale-95
                        ${confirmLoading
                            ? 'bg-slate-300 text-slate-500 dark:text-dk-muted cursor-wait shadow-none'
                            : 'bg-gradient-to-l from-emerald-600 to-emerald-500 text-white hover:from-emerald-700 hover:to-emerald-600 shadow-emerald-200/50 hover:shadow-emerald-300/50'
                        }
                    `}
                >
                    {confirmLoading ? (
                        <>
                            <div className="w-5 h-5 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                            جارٍ التأكيد...
                        </>
                    ) : (
                        <>
                            <CheckCircle2 className="w-6 h-6" />
                            تأكيد الطلبية وخصم المخزون
                        </>
                    )}
                </button>
            </div>

            {/* CSS Animation for toasts */}
            <style>{`
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(-30px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    );
};

export default OrderModelPage;
