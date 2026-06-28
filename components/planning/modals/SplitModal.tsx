import React, { useEffect, useState, useMemo } from 'react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import type { PlanningEvent, ModelData, Lot as TypeLot } from '../../../types';
import { evClientName, evModelName, evQty, evModelThumb } from '../shared/eventAccessors';
import { getClientColor } from '../shared/clientColors';
import { Package, Plus, Minus, Scissors, Grid3X3, ChevronDown, ChevronUp } from 'lucide-react';
import { tx } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';

interface Lot {
    id: string;
    label: string;
    quantity: number;
    client: string;
    deliveryDate: string;
    status: 'PENDING' | 'READY' | 'DELIVERED';
    sizeColorDistribution?: Record<string, Record<string, number>>;
}

interface Props {
    open: boolean;
    event: PlanningEvent | null;
    models: ModelData[];
    onClose: () => void;
    onSubmit: (qty: number, lots?: Lot[]) => void;
}

export default function SplitModal({ open, event, models, onClose, onSubmit }: Props) {
    const { lang } = useLang();
    const [mode, setMode] = useState<'simple' | 'lots'>('simple');
    const [qty, setQty] = useState(0);
    const [lots, setLots] = useState<Lot[]>([]);
    const [expandedLotId, setExpandedLotId] = useState<string | null>(null);

    const selectedModel = models.find(m => m?.id === event?.modelId);
    const colors = selectedModel?.meta_data?.colors || [];
    const sizes = selectedModel?.meta_data?.sizes || [];
    const hasGrid = colors.length > 0 && sizes.length > 0;

    // Original event's size/color distribution, scaled from model grid if missing
    const eventDistribution = useMemo(() => {
        if (!event) return {};
        if (event.sizeColorDistribution) return event.sizeColorDistribution;
        
        // Fallback: build and scale from model's gridQuantities
        const grid = selectedModel?.ficheData?.gridQuantities || {};
        const dist: Record<string, Record<string, number>> = {};
        
        const gridTotal = Object.values(grid).reduce((s, q) => s + q, 0);
        const eventQty = evQty(event);
        const scaleFactor = gridTotal > 0 ? eventQty / gridTotal : 0;
        
        let scaledSum = 0;
        const flatList: { colorId: string; size: string; qty: number }[] = [];
        
        colors.forEach(c => {
            dist[c.id] = {};
            sizes.forEach((s, sIdx) => {
                const q = grid[`${c.id}_${sIdx}`] || 0;
                const sq = scaleFactor > 0 ? Math.round(q * scaleFactor) : 0;
                dist[c.id][s] = sq;
                scaledSum += sq;
                flatList.push({ colorId: c.id, size: s, qty: q });
            });
        });
        
        // Discrepancy adjustment loop
        let diff = eventQty - scaledSum;
        if (diff !== 0 && flatList.length > 0) {
            flatList.sort((a, b) => b.qty - a.qty);
            let idx = 0;
            while (diff !== 0) {
                const item = flatList[idx % flatList.length];
                const currentVal = dist[item.colorId][item.size];
                if (diff > 0) {
                    dist[item.colorId][item.size]++;
                    diff--;
                } else {
                    if (currentVal > 0) {
                        dist[item.colorId][item.size]--;
                        diff++;
                    }
                }
                idx++;
            }
        }
        
        return dist;
    }, [event, selectedModel, colors, sizes]);

    useEffect(() => {
        if (open && event) {
            const total = evQty(event);
            setQty(Math.floor(total / 2));
            setMode('simple');
            setLots([]);
            setExpandedLotId(null);
        }
    }, [open, event]);

    // Compute remaining to allocate per size/color
    const remainingDistribution = useMemo(() => {
        if (!hasGrid) return {};
        const remaining: Record<string, Record<string, number>> = JSON.parse(JSON.stringify(eventDistribution));

        lots.forEach(lot => {
            if (!lot.sizeColorDistribution) return;
            Object.keys(lot.sizeColorDistribution).forEach(colorId => {
                if (!remaining[colorId]) return;
                Object.keys(lot.sizeColorDistribution[colorId]).forEach(size => {
                    const qtyVal = lot.sizeColorDistribution![colorId][size] || 0;
                    remaining[colorId][size] = (remaining[colorId][size] || 0) - qtyVal;
                });
            });
        });

        return remaining;
    }, [eventDistribution, lots, hasGrid]);

    // Check if any color/size combination is over-allocated
    const hasOverAllocation = useMemo(() => {
        if (!hasGrid) return false;
        let over = false;
        Object.values(remainingDistribution).forEach(colorMap => {
            Object.values(colorMap).forEach(q => {
                if (q < 0) over = true;
            });
        });
        return over;
    }, [remainingDistribution, hasGrid]);

    if (!event) return null;
    const total = evQty(event);
    const client = evClientName(event, models);
    const modelName = evModelName(event, models);
    const thumb = evModelThumb(event, models);
    const color = getClientColor(client);
    const remain = Math.max(0, total - qty);
    const valid = qty > 0 && qty < total;

    const lotsTotal = lots.reduce((s, l) => s + l.quantity, 0);
    const lotsRemain = Math.max(0, total - lotsTotal);

    const lotsValid = lots.length > 0 &&
                      lotsTotal <= total &&
                      lots.every(l => l.quantity > 0) &&
                      (!hasGrid || !hasOverAllocation);

    const addLot = () => {
        const defaultDist: Record<string, Record<string, number>> = {};
        if (hasGrid) {
            colors.forEach(c => {
                defaultDist[c.id] = {};
                sizes.forEach(s => {
                    defaultDist[c.id][s] = 0;
                });
            });
        }

        const newLot: Lot = {
            id: `lot-${Date.now()}`,
            label: `Lot ${lots.length + 1}`,
            quantity: hasGrid ? 0 : Math.floor(total / (lots.length + 2)),
            client,
            deliveryDate: '',
            status: 'PENDING',
            sizeColorDistribution: hasGrid ? defaultDist : undefined,
        };
        setLots([...lots, newLot]);
        setExpandedLotId(newLot.id);
    };

    const removeLot = (id: string) => {
        setLots(lots.filter(l => l.id !== id));
        if (expandedLotId === id) {
            setExpandedLotId(null);
        }
    };

    const updateLot = (id: string, field: keyof Lot, value: any) => {
        setLots(lots.map(l => l.id === id ? { ...l, [field]: value } : l));
    };

    const updateLotDistribution = (lotId: string, colorId: string, size: string, value: number) => {
        setLots(prevLots => prevLots.map(l => {
            if (l.id !== lotId) return l;
            
            const newDist = {
                ...l.sizeColorDistribution,
                [colorId]: {
                    ...l.sizeColorDistribution?.[colorId],
                    [size]: value
                }
            };
            
            let newQty = 0;
            Object.values(newDist).forEach(colorMap => {
                Object.values(colorMap).forEach(q => {
                    newQty += q;
                });
            });
            
            return {
                ...l,
                quantity: newQty,
                sizeColorDistribution: newDist
            };
        }));
    };

    const handleSimpleSubmit = () => {
        if (valid) onSubmit(qty);
    };

    const handleLotsSubmit = () => {
        if (lotsValid) onSubmit(0, lots);
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={tx(lang,{fr:"Fractionner l'ordre",ar:'تقسيم الطلب',en:'Split Order',es:'Dividir pedido',pt:'Dividir pedido',tr:'Siparişi Böl'})}
            subtitle={`${client} · ${modelName}`}
            size="lg"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>{tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}</Button>
                    {mode === 'simple' ? (
                        <Button variant="primary" onClick={handleSimpleSubmit} disabled={!valid}>
                            {tx(lang,{fr:'Fractionner',ar:'تقسيم',en:'Split',es:'Dividir',pt:'Dividir',tr:'Böl'})}
                        </Button>
                    ) : (
                        <Button variant="primary" onClick={handleLotsSubmit} disabled={!lotsValid}>
                            {tx(lang,{fr:'Créer les lots',ar:'إنشاء الدفعات',en:'Create lots',es:'Crear lotes',pt:'Criar lotes',tr:'Partiler oluştur'})}
                        </Button>
                    )}
                </>
            }
        >
            <div className="space-y-4">
                {/* Model preview */}
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-dk-bg rounded-xl p-3">
                    <div className="w-12 h-12 rounded-lg flex items-center justify-center text-lg font-black text-white shadow-sm" style={{ background: color }}>
                        {client[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1">
                        <div className="text-[13px] font-semibold text-slate-900 dark:text-dk-text">{modelName}</div>
                        <div className="text-[11px] text-slate-500 dark:text-dk-muted">{client}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-[18px] font-black text-slate-900 dark:text-dk-text tabular-nums">{total}</div>
                        <div className="text-[10px] text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'pcs total',ar:'إجمالي القطع',en:'pcs total',es:'pcs total',pt:'pcs total',tr:'toplam adet'})}</div>
                    </div>
                </div>

                {/* Mode switcher */}
                <div className="flex bg-slate-100 dark:bg-dk-elevated p-1 rounded-xl">
                    <button
                        type="button"
                        onClick={() => setMode('simple')}
                        className={`flex-1 py-2 text-[12px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                            mode === 'simple' ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm' : 'text-slate-500 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text'
                        }`}
                    >
                        <Scissors className="w-3.5 h-3.5" />
                        {tx(lang,{fr:'Simple',ar:'بسيط',en:'Simple',es:'Simple',pt:'Simples',tr:'Basit'})}
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('lots')}
                        className={`flex-1 py-2 text-[12px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                            mode === 'lots' ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-sm' : 'text-slate-500 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text'
                        }`}
                    >
                        <Package className="w-3.5 h-3.5" />
                        {tx(lang,{fr:'Par lots / Livraisons',ar:'دفعات / تسليمات',en:'By lots / Deliveries',es:'Por lotes / Entregas',pt:'Por lotes / Entregas',tr:'Partiler / Teslimatlar'})}
                    </button>
                </div>

                {mode === 'simple' ? (
                    <>
                        {/* Simple split */}
                        <div className="text-[13px] text-slate-600 dark:text-dk-text-soft">
                            {tx(lang,{fr:'Quantité à transférer vers un nouvel ordre :',ar:'الكمية المراد نقلها إلى طلب جديد:',en:'Quantity to transfer to a new order:',es:'Cantidad a transferir a un nuevo pedido:',pt:'Quantidade a transferir para um novo pedido:',tr:'Yeni siparişe aktarılacak miktar:'})}
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
                                    className="w-24 h-8 px-2 text-[13px] tabular-nums text-slate-900 dark:text-dk-text bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md focus:border-slate-400 outline-none"
                                    min={1}
                                    max={total - 1}
                                />
                                <span className="text-[12px] text-slate-500 dark:text-dk-muted tabular-nums">{tx(lang,{fr:'sur',ar:'من',en:'of',es:'de',pt:'de',tr:'/ toplam'})} {total}</span>
                            </div>
                        </div>

                        {/* Visual bar */}
                        <div className="space-y-2">
                            <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-dk-border">
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
                                <span className="text-slate-700 dark:text-dk-text-soft">Original : <span className="font-semibold tabular-nums">{remain} pcs</span></span>
                                <span className="text-emerald-700 dark:text-emerald-400">Nouveau : <span className="font-semibold tabular-nums">{qty} pcs</span></span>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        {/* Lots mode */}
                        <div className="text-[13px] text-slate-600 dark:text-dk-text-soft">
                            Divisez la commande en lots selon les livraisons client :
                        </div>

                        {/* Remaining grid to allocate */}
                        {hasGrid && lots.length > 0 && (
                            <div className="bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-3 space-y-2">
                                <div className="text-[11px] font-bold text-slate-700 dark:text-dk-text-soft uppercase tracking-wider flex items-center gap-1.5">
                                    <Grid3X3 className="w-3.5 h-3.5 text-indigo-500" />
                                    Reste à attribuer par taille/couleur
                                </div>
                                <div className="overflow-x-auto border border-slate-150 rounded-lg">
                                    <table className="w-full text-[11px] bg-white dark:bg-dk-surface">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-dk-bg border-b border-slate-150">
                                                <th className="px-2 py-1.5 text-left text-slate-500 dark:text-dk-muted font-semibold sticky left-0 bg-slate-50 dark:bg-dk-bg">Couleur</th>
                                                {sizes.map(s => (
                                                    <th key={s} className="px-2 py-1.5 text-center text-slate-500 dark:text-dk-muted font-semibold min-w-[50px]">{s}</th>
                                                ))}
                                                <th className="px-2 py-1.5 text-center font-bold text-slate-700 dark:text-dk-text-soft bg-slate-100 dark:bg-dk-elevated">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {colors.map((color, cIdx) => {
                                                const rowRemaining = Object.values(remainingDistribution[color.id] || {}).reduce((s, q) => s + q, 0);
                                                return (
                                                    <tr key={`${color.id}-${cIdx}`} className="hover:bg-slate-50/50">
                                                        <td className="px-2 py-1.5 sticky left-0 bg-white dark:bg-dk-surface border-r border-slate-100 dark:border-dk-border flex items-center gap-1.5">
                                                            <div className="w-2.5 h-2.5 rounded-full border border-slate-300" style={{ background: color.id }} />
                                                            <span className="truncate max-w-[80px] text-slate-750 dark:text-dk-text-soft font-medium">{color.name}</span>
                                                        </td>
                                                        {sizes.map(size => {
                                                            const qtyVal = remainingDistribution[color.id]?.[size] ?? 0;
                                                            return (
                                                                <td key={size} className={`px-2 py-1.5 text-center font-mono tabular-nums ${qtyVal < 0 ? 'text-red-655 bg-red-50 font-bold' : qtyVal === 0 ? 'text-slate-300 dark:text-dk-muted' : 'text-slate-650 font-semibold'}`}>
                                                                    {qtyVal}
                                                                </td>
                                                            );
                                                        })}
                                                        <td className={`px-2 py-1.5 text-center font-bold font-mono ${rowRemaining < 0 ? 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30' : rowRemaining === 0 ? 'text-slate-400 dark:text-dk-muted' : 'text-indigo-650 dark:text-dk-accent-text'}`}>
                                                            {rowRemaining}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Lots list */}
                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                            {lots.map((lot, idx) => (
                                <div key={lot.id} className="bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-3 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm" style={{ background: color }}>
                                                {idx + 1}
                                            </div>
                                            <input
                                                type="text"
                                                value={lot.label}
                                                onChange={(e) => updateLot(lot.id, 'label', e.target.value)}
                                                className="text-[12px] font-bold text-slate-900 dark:text-dk-text bg-transparent outline-none w-32 border-b border-transparent focus:border-slate-350"
                                                placeholder="Nom du lot"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removeLot(lot.id)}
                                            className="p-1 text-slate-400 dark:text-dk-muted hover:text-red-500 transition-colors"
                                        >
                                            <Minus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider">Quantité</label>
                                            <input
                                                type="number"
                                                value={lot.quantity || ''}
                                                onChange={(e) => updateLot(lot.id, 'quantity', Number(e.target.value) || 0)}
                                                className={`w-full h-8 px-2 text-[12px] font-mono tabular-nums bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md outline-none ${
                                                    hasGrid ? 'opacity-75 cursor-not-allowed bg-slate-100 dark:bg-dk-elevated font-bold text-indigo-700 dark:text-dk-accent-text' : ''
                                                }`}
                                                min={0}
                                                readOnly={hasGrid}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider">Livraison</label>
                                            <input
                                                type="date"
                                                value={lot.deliveryDate}
                                                onChange={(e) => updateLot(lot.id, 'deliveryDate', e.target.value)}
                                                className="w-full h-8 px-2 text-[11px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md outline-none"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[9px] font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wider">Statut</label>
                                            <select
                                                value={lot.status}
                                                onChange={(e) => updateLot(lot.id, 'status', e.target.value)}
                                                className="w-full h-8 px-2 text-[11px] bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-md outline-none"
                                            >
                                                <option value="PENDING">En attente</option>
                                                <option value="READY">Prêt</option>
                                                <option value="DELIVERED">Livré</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Size/color grid accordion inside the lot */}
                                    {hasGrid && (
                                        <div className="space-y-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedLotId(expandedLotId === lot.id ? null : lot.id)}
                                                className="w-full flex items-center justify-between py-1.5 px-2.5 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 hover:text-slate-900 transition-all shadow-sm"
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <Grid3X3 className="w-3.5 h-3.5 text-indigo-500" />
                                                    Répartition Tailles / Couleurs
                                                </span>
                                                {expandedLotId === lot.id ? (
                                                    <ChevronUp className="w-3.5 h-3.5 text-slate-500 dark:text-dk-muted" />
                                                ) : (
                                                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-dk-muted" />
                                                )}
                                            </button>

                                            {expandedLotId === lot.id && (
                                                <div className="border border-slate-150 rounded-lg overflow-hidden bg-white dark:bg-dk-surface mt-1.5 p-1.5 animate-[planning-slide-in-right_150ms_ease-out]">
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-[10px]">
                                                            <thead>
                                                                <tr className="bg-slate-50 dark:bg-dk-bg border-b border-slate-200 dark:border-dk-border">
                                                                    <th className="px-2 py-1 text-left text-slate-500 dark:text-dk-muted font-semibold sticky left-0 bg-slate-50 dark:bg-dk-bg">Couleur</th>
                                                                    {sizes.map(s => (
                                                                        <th key={s} className="px-1 py-1 text-center text-slate-500 dark:text-dk-muted font-semibold min-w-[45px]">{s}</th>
                                                                    ))}
                                                                    <th className="px-2 py-1 text-center font-bold text-slate-700 dark:text-dk-text-soft bg-slate-100 dark:bg-dk-elevated">Total</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {colors.map((color, cIdx) => {
                                                                    const colorMap = lot.sizeColorDistribution?.[color.id] || {};
                                                                    const colorTotal = Object.values(colorMap).reduce((s, q) => s + q, 0);
                                                                    return (
                                                                        <tr key={`${color.id}-${cIdx}`} className="hover:bg-slate-50/30">
                                                                            <td className="px-2 py-1 sticky left-0 bg-white dark:bg-dk-surface border-r border-slate-100 dark:border-dk-border flex items-center gap-1">
                                                                                <div className="w-2.5 h-2.5 rounded-full border border-slate-350" style={{ background: color.id }} />
                                                                                <span className="truncate max-w-[60px] text-slate-750 font-medium">{color.name}</span>
                                                                            </td>
                                                                            {sizes.map(size => {
                                                                                const val = colorMap[size] || 0;
                                                                                return (
                                                                                    <td key={size} className="px-0.5 py-0.5">
                                                                                        <input
                                                                                            type="number"
                                                                                            min={0}
                                                                                            value={val || ''}
                                                                                            onChange={(e) => updateLotDistribution(lot.id, color.id, size, Number(e.target.value) || 0)}
                                                                                            placeholder="0"
                                                                                            className="w-full h-6 px-1 text-center text-[10px] font-mono tabular-nums bg-slate-50 border border-slate-200 dark:border-dk-border rounded outline-none focus:border-indigo-400 focus:bg-white transition-all"
                                                                                        />
                                                                                    </td>
                                                                                );
                                                                            })}
                                                                            <td className="px-2 py-1 text-center font-bold font-mono text-indigo-650 dark:text-dk-accent-text bg-indigo-50 dark:bg-dk-accent/20/20">
                                                                                {colorTotal}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Add lot button */}
                        <button
                            type="button"
                            onClick={addLot}
                            className="w-full py-2 border-2 border-dashed border-slate-300 dark:border-dk-border rounded-xl text-[12px] font-semibold text-slate-500 dark:text-dk-muted hover:border-indigo-400 hover:text-indigo-650 dark:text-dk-accent-text hover:bg-slate-50/30 dark:hover:bg-dk-elevated/30 transition-all flex items-center justify-center gap-1.5"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Ajouter un lot
                        </button>

                        {/* Summary */}
                        <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-3 space-y-2">
                            <div className="flex justify-between text-[11px]">
                                <span className="text-slate-600 dark:text-dk-muted font-medium">Total lots</span>
                                <span className="font-bold tabular-nums text-slate-900 dark:text-dk-text">{lotsTotal} / {total} pcs</span>
                            </div>
                            <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-200 dark:bg-dk-border">
                                <div
                                    className="bg-indigo-500 transition-all"
                                    style={{ width: `${Math.min(100, (lotsTotal / total) * 100)}%` }}
                                />
                            </div>
                            {lotsTotal > total && (
                                <div className="text-[10px] text-red-600 font-semibold flex items-center gap-1 animate-pulse">
                                    <span>⚠</span> Excédent de {lotsTotal - total} pcs
                                </div>
                            )}
                            {hasGrid && hasOverAllocation && (
                                <div className="text-[10px] text-red-650 font-bold flex items-center gap-1 animate-pulse">
                                    <span>⚠</span> Certaines tailles/couleurs sont sur-allouées (vérifier les valeurs négatives du reste à attribuer)
                                </div>
                            )}
                            {lotsRemain > 0 && lots.length > 0 && (
                                <div className="text-[10px] text-slate-550 font-medium">
                                    Reste à attribuer : {lotsRemain} pcs
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
