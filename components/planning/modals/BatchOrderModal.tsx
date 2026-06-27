import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Package, ArrowRight, Layers, ChevronDown, Search, X, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import { Select } from '../shared/Input';
import type { ModelData } from '../../../types';
import type { PlanningChain } from '../hooks/usePlanningChains';
import { getClientColor } from '../shared/clientColors';
import { todayYmd } from '../shared/dateFmt';
import { tx } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';

/* ─── helpers ────────────────────────────────────────────────── */

function addDays(ymd: string, days: number): string {
    if (!ymd || days <= 0) return ymd;
    const d = new Date(ymd);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function fmtDate(ymd: string): string {
    if (!ymd) return '—';
    const d = new Date(ymd);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function getModelThumb(m: ModelData): string | null {
    return m.images?.front || m.image || null;
}

/* ─── types ──────────────────────────────────────────────────── */

export interface BatchOrderItem {
    id: string;
    modelId: string;
    quantity: number;
    clientName: string;
    strictDeadline_DDS: string;
}

export interface BatchOrderResult extends BatchOrderItem {
    chaineId: string;
    startDate: string;
    color: string;
}

interface BatchRow extends BatchOrderItem {
    /* computed */
    startDate: string;
    endDate: string;
    daysNeeded: number;
}

interface Props {
    open: boolean;
    models: ModelData[];
    chains: PlanningChain[];
    /** Called for each order to compute the end date. */
    computeEndDate: (modelId: string, chaineId: string, startDate: string, quantity: number) => string;
    onClose: () => void;
    onSubmit: (orders: BatchOrderResult[]) => void;
}

/* ─── tiny model picker ──────────────────────────────────────── */

function ModelPicker({ models, value, onChange }: { models: ModelData[]; value: string; onChange: (id: string) => void }) {
    const { lang } = useLang();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    const selected = models.find(m => m.id === value);
    const selectedColor = selected ? getClientColor(selected.ficheData?.client) : '#94a3b8';

    const filtered = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return models;
        return models.filter(m =>
            (m.meta_data?.nom_modele || '').toLowerCase().includes(q) ||
            (m.ficheData?.client || '').toLowerCase().includes(q) ||
            (m.meta_data?.reference || '').toLowerCase().includes(q)
        );
    }, [models, search]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleSelect = (id: string) => {
        onChange(id);
        setOpen(false);
        setSearch('');
    };

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className={`w-full h-9 px-2.5 flex items-center gap-2 bg-white border rounded-lg text-left transition-all outline-none text-[12px] ${
                    open ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'
                }`}
            >
                {selected ? (
                    <>
                        {getModelThumb(selected) ? (
                            <img src={getModelThumb(selected)!} alt="" className="w-6 h-6 rounded object-cover border border-slate-200 shrink-0" />
                        ) : (
                            <div className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: selectedColor }}>
                                {(selected.ficheData?.client || '?')[0].toUpperCase()}
                            </div>
                        )}
                        <span className="flex-1 truncate text-slate-900 font-medium">
                            {selected.meta_data?.nom_modele || selected.id}
                        </span>
                    </>
                ) : (
                    <>
                        <Package className="w-4 h-4 text-slate-300 shrink-0" />
                        <span className="flex-1 text-slate-400">{tx(lang, {fr:"— Choisir un modèle —",ar:"— اختر نموذجًا —",en:"— Choose a model —",es:"— Elegir un modelo —",pt:"— Escolher um modelo —",tr:"— Bir model seçin —"})}</span>
                    </>
                )}
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-50 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-slate-100 bg-slate-50/60 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder={tx(lang, {fr:"Rechercher un modèle…",ar:"البحث عن نموذج…",en:"Search for a model…",es:"Buscar un modelo…",pt:"Procurar um modelo…",tr:"Bir model ara…"})}
                            className="w-full h-8 pl-8 pr-7 text-[12px] bg-white border border-slate-200 rounded-md outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                            autoFocus
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
                        {filtered.length === 0 ? (
                            <div className="px-4 py-8 text-center text-[12px] text-slate-400">{tx(lang, {fr:"Aucun modèle trouvé",ar:"لم يتم العثور على نموذج",en:"No model found",es:"Ningún modelo encontrado",pt:"Nenhum modelo encontrado",tr:"Model bulunamadı"})}</div>
                        ) : filtered.map(m => {
                            const thumb = getModelThumb(m);
                            const color = getClientColor(m.ficheData?.client);
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => handleSelect(m.id)}
                                    className={`w-full px-3 py-2 flex items-center gap-2.5 text-left hover:bg-slate-50 transition-colors ${m.id === value ? 'bg-indigo-50/70' : ''}`}
                                >
                                    {thumb ? (
                                        <img src={thumb} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0" />
                                    ) : (
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: color }}>
                                            {(m.ficheData?.client || '?')[0].toUpperCase()}
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-medium text-slate-900 truncate">{m.meta_data?.nom_modele || m.id}</div>
                                        <div className="text-[10px] text-slate-500 truncate">{m.ficheData?.client || '—'}{m.meta_data?.reference ? ` · ${m.meta_data.reference}` : ''}</div>
                                    </div>
                                    {m.id === value && <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─── main component ─────────────────────────────────────────── */

const newRow = (): BatchOrderItem => ({
    id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    modelId: '',
    quantity: 0,
    clientName: '',
    strictDeadline_DDS: '',
});

export default function BatchOrderModal({ open, models, chains, computeEndDate, onClose, onSubmit }: Props) {
    const { lang } = useLang();
    const [chaineId, setChaineId] = useState(chains[0]?.id || 'CHAINE 1');
    const [globalStart, setGlobalStart] = useState(todayYmd());
    const [rows, setRows] = useState<BatchOrderItem[]>([newRow(), newRow()]);

    /* reset on open */
    const wasOpen = useRef(false);
    useEffect(() => {
        if (open && !wasOpen.current) {
            wasOpen.current = true;
            setChaineId(chains[0]?.id || 'CHAINE 1');
            setGlobalStart(todayYmd());
            setRows([newRow(), newRow()]);
        }
        if (!open) wasOpen.current = false;
    }, [open, chains]);

    /* compute cascade dates */
    const batchRows = useMemo<BatchRow[]>(() => {
        let cursor = globalStart;
        return rows.map(r => {
            const start = cursor;
            let end = start;
            let days = 0;
            if (r.modelId && r.quantity > 0) {
                end = computeEndDate(r.modelId, chaineId, start, r.quantity);
                // count calendar days between start and end
                const sDate = new Date(start);
                const eDate = new Date(end);
                days = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / 86400000));
                cursor = addDays(end, 1); // next starts day after previous ends
            }
            return { ...r, startDate: start, endDate: end, daysNeeded: days };
        });
    }, [rows, chaineId, globalStart, computeEndDate]);

    /* handlers */
    const addRow = () => setRows(prev => [...prev, newRow()]);
    const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));
    const updateRow = useCallback((id: string, patch: Partial<BatchOrderItem>) => {
        setRows(prev => prev.map(r => {
            if (r.id !== id) return r;
            const next = { ...r, ...patch };
            // auto-fill client from model
            if (patch.modelId !== undefined && patch.clientName === undefined) {
                const m = models.find(m => m.id === patch.modelId);
                next.clientName = m?.ficheData?.client || '';
                // auto-fill quantity if 0
                if (r.quantity === 0 && m) {
                    const rawQty = (m as any).ficheData?.quantite || (m as any).meta_data?.quantite;
                    next.quantity = rawQty ? Number(rawQty) : 0;
                }
            }
            return next;
        }));
    }, [models]);

    const validRows = batchRows.filter(r => r.modelId && r.quantity > 0);
    const canSubmit = validRows.length > 0;

    const handleSubmit = () => {
        if (!canSubmit) return;
        const orders: BatchOrderResult[] = validRows.map(r => {
            const m = models.find(m => m.id === r.modelId);
            return {
                id: r.id,
                modelId: r.modelId,
                quantity: r.quantity,
                clientName: r.clientName || m?.ficheData?.client || '',
                strictDeadline_DDS: r.strictDeadline_DDS,
                chaineId,
                startDate: r.startDate,
                color: getClientColor(r.clientName || m?.ficheData?.client),
            };
        });
        onSubmit(orders);
    };

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={tx(lang, {fr:"Planification en lot",ar:"تخطيط دفعة",en:"Batch planning",es:"Planificación por lotes",pt:"Planejamento em lote",tr:"Toplu planlama"})}
            subtitle={tx(lang, {fr:"Planifiez plusieurs modèles en séquence sur une chaîne",ar:"تخطيط نماذج متعددة بالتسلسل على سلسلة",en:"Plan multiple models in sequence on a chain",es:"Planifique varios modelos en secuencia en una cadena",pt:"Planeje vários modelos em sequência em uma cadeia",tr:"Bir zincir üzerinde sıralı olarak birden çok model planlayın"})}
            size="lg"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>{tx(lang, {fr:"Annuler",ar:"إلغاء",en:"Cancel",es:"Cancelar",pt:"Cancelar",tr:"İptal"})}</Button>
                    <Button
                        variant="primary"
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        icon={<Sparkles className="w-3.5 h-3.5" />}
                    >
                        {tx(lang, {fr:"Planifier",ar:"تخطيط",en:"Plan",es:"Planificar",pt:"Planejar",tr:"Planla"})} {validRows.length > 0 ? `${validRows.length} ${validRows.length > 1 ? tx(lang, {fr:"ordres",ar:"أوامر",en:"orders",es:"órdenes",pt:"pedidos",tr:"siparişler"}) : tx(lang, {fr:"ordre",ar:"أمر",en:"order",es:"orden",pt:"pedido",tr:"sipariş"})}` : ''}
                    </Button>
                </>
            }
        >
            <div className="space-y-5">
                {/* ── chain + start date ── */}
                <div className="grid grid-cols-2 gap-3 p-4 bg-indigo-50/40 rounded-xl border border-indigo-100">
                    <div className="space-y-1.5">
                        <label className="block text-[11px] font-medium text-slate-600">{tx(lang, {fr:"Chaîne cible",ar:"السلسلة المستهدفة",en:"Target chain",es:"Cadena objetivo",pt:"Cadeia alvo",tr:"Hedef zincir"})}</label>
                        <select
                            value={chaineId}
                            onChange={e => setChaineId(e.target.value)}
                            className="w-full h-9 px-3 text-[13px] text-slate-900 bg-white border border-indigo-200 rounded-md focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-colors appearance-none"
                            style={{ backgroundImage: "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22><polyline points=%226 9 12 15 18 9%22/></svg>')", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.6rem center', paddingRight: '2rem' }}
                        >
                            {chains.map(c => (
                                <option key={c.id} value={c.id}>{c.name}  ·  η {Math.round(c.efficiency * 100)}%</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-[11px] font-medium text-slate-600">{tx(lang, {fr:"Date de départ",ar:"تاريخ البداية",en:"Start date",es:"Fecha de inicio",pt:"Data de início",tr:"Başlangıç tarihi"})}</label>
                        <input
                            type="date"
                            value={globalStart}
                            onChange={e => setGlobalStart(e.target.value)}
                            className="w-full h-9 px-3 text-[13px] text-slate-900 bg-white border border-indigo-200 rounded-md focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-colors"
                        />
                    </div>
                </div>

                {/* ── rows ── */}
                <div className="space-y-2.5">
                    {batchRows.map((row, idx) => {
                        const m = models.find(m => m.id === row.modelId);
                        const thumb = m ? getModelThumb(m) : null;
                        const clientColor = getClientColor(row.clientName || m?.ficheData?.client);
                        const hasData = !!row.modelId && row.quantity > 0;

                        return (
                            <div
                                key={row.id}
                                className={`relative rounded-xl border transition-all ${hasData ? 'border-slate-200 bg-white shadow-sm' : 'border-dashed border-slate-200 bg-slate-50/60'}`}
                            >
                                {/* row number badge */}
                                <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shadow-sm z-10">
                                    {idx + 1}
                                </div>

                                <div className="p-3 pl-4">
                                    <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 80px 120px auto' }}>
                                        {/* model picker */}
                                        <ModelPicker
                                            models={models}
                                            value={row.modelId}
                                            onChange={id => updateRow(row.id, { modelId: id })}
                                        />

                                        {/* quantity */}
                                        <input
                                            type="number"
                                            min={0}
                                            value={row.quantity || ''}
                                            onChange={e => updateRow(row.id, { quantity: Number(e.target.value) || 0 })}
                                            placeholder={tx(lang, {fr:"Qté",ar:"الكمية",en:"Qty",es:"Cant.",pt:"Qtd",tr:"Mik"})}
                                            className="w-full h-9 px-2 text-[13px] text-center tabular-nums text-slate-900 bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-colors"
                                        />

                                        {/* client */}
                                        <div className="relative">
                                            <span
                                                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full shrink-0"
                                                style={{ background: clientColor }}
                                            />
                                            <input
                                                type="text"
                                                value={row.clientName}
                                                onChange={e => updateRow(row.id, { clientName: e.target.value })}
                                                placeholder={tx(lang, {fr:"Client",ar:"العميل",en:"Client",es:"Cliente",pt:"Cliente",tr:"Müşteri"})}
                                                className="w-full h-9 pl-7 pr-2 text-[12px] text-slate-900 bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-colors"
                                            />
                                        </div>

                                        {/* delete */}
                                        <button
                                            type="button"
                                            onClick={() => removeRow(row.id)}
                                            disabled={rows.length <= 1}
                                            className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
                                            title={tx(lang, {fr:"Supprimer",ar:"حذف",en:"Delete",es:"Eliminar",pt:"Excluir",tr:"Sil"})}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* date preview — only if model + qty set */}
                                    {hasData && (
                                        <div className="mt-2 flex items-center gap-2">
                                            {thumb && (
                                                <img src={thumb} alt="" className="w-5 h-5 rounded object-cover border border-slate-200 shrink-0" />
                                            )}
                                            <div className="flex items-center gap-1.5 text-[11px]">
                                                <span className="font-semibold text-indigo-700">{fmtDate(row.startDate)}</span>
                                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                                <span className="font-semibold text-slate-700">{fmtDate(row.endDate)}</span>
                                                <span className="text-slate-400">· {row.daysNeeded}{tx(lang, {fr:"j",ar:"يوم",en:"d",es:"d",pt:"d",tr:"g"})}</span>
                                            </div>
                                            {row.strictDeadline_DDS && (() => {
                                                const ddsDt = new Date(row.strictDeadline_DDS);
                                                const endDt = new Date(row.endDate);
                                                const late = endDt > ddsDt;
                                                return (
                                                    <span className={`ml-auto flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${late ? 'text-red-600 bg-red-50' : 'text-emerald-700 bg-emerald-50'}`}>
                                                        {late ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                                                        DDS {fmtDate(row.strictDeadline_DDS)}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {/* optional DDS */}
                                    {hasData && (
                                        <div className="mt-2 flex items-center gap-2">
                                            <label className="text-[10px] text-slate-500 font-medium shrink-0">{tx(lang, {fr:"DDS (optionnel)",ar:"DDS (اختياري)",en:"DDS (optional)",es:"DDS (opcional)",pt:"DDS (opcional)",tr:"DDS (isteğe bağlı)"})}</label>
                                            <input
                                                type="date"
                                                value={row.strictDeadline_DDS}
                                                onChange={e => updateRow(row.id, { strictDeadline_DDS: e.target.value })}
                                                className="h-7 px-2 text-[11px] text-slate-900 bg-white border border-slate-200 rounded-md focus:border-indigo-400 outline-none transition-colors"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* add row button */}
                    <button
                        type="button"
                        onClick={addRow}
                        className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-[12px] font-semibold text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50/30 transition-all flex items-center justify-center gap-1.5 group"
                    >
                        <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                        {tx(lang, {fr:"Ajouter un modèle",ar:"إضافة نموذج",en:"Add a model",es:"Añadir un modelo",pt:"Adicionar um modelo",tr:"Model ekle"})}
                    </button>
                </div>

                {/* ── summary strip ── */}
                {validRows.length > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-xl text-white">
                        <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
                        <div className="flex-1 text-[12px]">
                            <span className="font-bold text-white">{validRows.length} {validRows.length > 1 ? tx(lang, {fr:"ordres",ar:"أوامر",en:"orders",es:"órdenes",pt:"pedidos",tr:"siparişler"}) : tx(lang, {fr:"ordre",ar:"أمر",en:"order",es:"orden",pt:"pedido",tr:"sipariş"})}</span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="text-slate-300">{chaineId}</span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="text-slate-300">{fmtDate(globalStart)}</span>
                            <span className="text-slate-500 mx-1">→</span>
                            <span className="text-slate-300">{fmtDate(batchRows[batchRows.length - 1]?.endDate)}</span>
                        </div>
                        <div className="text-[13px] font-bold text-indigo-400 tabular-nums">
                            {validRows.reduce((s, r) => s + r.quantity, 0).toLocaleString()} {tx(lang, {fr:"pcs",ar:"قطعة",en:"pcs",es:"pzas",pt:"pcs",tr:"adet"})}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
