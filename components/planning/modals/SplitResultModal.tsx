import React from 'react';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import type { PlanningEvent, ModelData } from '../../../types';
import { evClientName, evModelName, evQty, evStartYmd, evEndYmd, evDeadlineYmd, evModelThumb } from '../shared/eventAccessors';
import { getClientColor } from '../shared/clientColors';
import { ArrowRight, CheckCircle2, Package, Calendar, Hash, Split } from 'lucide-react';
import { tx } from '../../../lib/i18n';
import { useLang } from '../../../src/context/LanguageContext';

interface Props {
    open: boolean;
    originalEvent: PlanningEvent | null;
    newEvents: PlanningEvent[];
    models: ModelData[];
    onClose: () => void;
}

export default function SplitResultModal({ open, originalEvent, newEvents, models, onClose }: Props) {
    const { lang } = useLang();
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
            title={tx(lang,{fr:'Résultat du fractionnement',ar:'نتيجة التقسيم',en:'Split Result',es:'Resultado de la división',pt:'Resultado da divisão',tr:'Bölme Sonucu'})}
            subtitle={`${client} · ${modelName}`}
            size="lg"
            footer={
                <Button variant="primary" onClick={onClose}>
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    {tx(lang,{fr:'Compris',ar:'تم الفهم',en:'Got it',es:'Entendido',pt:'Entendido',tr:'Anlaşıldı'})}
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
                        <div className="text-[13px] font-bold text-emerald-800">{tx(lang,{fr:'Fractionnement réussi',ar:'تم التقسيم بنجاح',en:'Split successful',es:'División exitosa',pt:'Divisão bem-sucedida',tr:'Bölme başarılı'})}</div>
                        <div className="text-[11px] text-emerald-600">
                            {tx(lang,{fr:`L'ordre a été divisé en ${newEvents.length + 1} ordres`,ar:`تم تقسيم الطلب إلى ${newEvents.length + 1} طلبات`,en:`Order split into ${newEvents.length + 1} orders`,es:`Pedido dividido en ${newEvents.length + 1} pedidos`,pt:`Pedido dividido em ${newEvents.length + 1} pedidos`,tr:`Sipariş ${newEvents.length + 1} siparişe bölündü`})}
                        </div>
                    </div>
                </div>

                {/* Visual split diagram */}
                <div className="flex items-center justify-center gap-3 py-2">
                    {/* Original */}
                    <div className="flex-1 bg-slate-100 rounded-xl p-3 text-center">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{tx(lang,{fr:'Avant',ar:'قبل',en:'Before',es:'Antes',pt:'Antes',tr:'Önce'})}</div>
                        <div className="text-[20px] font-black text-slate-900 tabular-nums">{originalQty}</div>
                        <div className="text-[10px] text-slate-500">pcs</div>
                    </div>

                    {/* Arrow */}
                    <div className="flex flex-col items-center gap-1">
                        <Split className="w-5 h-5 text-indigo-500" />
                        <div className="text-[9px] font-bold text-indigo-600">{tx(lang,{fr:'SPLIT',ar:'تقسيم',en:'SPLIT',es:'DIVIDIR',pt:'DIVIDIR',tr:'BÖL'})}</div>
                    </div>

                    {/* After */}
                    <div className="flex-1 bg-indigo-50 rounded-xl p-3 text-center border border-indigo-200">
                        <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1">{tx(lang,{fr:'Après',ar:'بعد',en:'After',es:'Después',pt:'Depois',tr:'Sonra'})}</div>
                        <div className="text-[20px] font-black text-indigo-900 tabular-nums">{originalQty}</div>
                        <div className="text-[10px] text-indigo-600">{tx(lang,{fr:'pcs total',ar:'إجمالي القطع',en:'pcs total',es:'pcs total',pt:'pcs total',tr:'toplam adet'})}</div>
                    </div>
                </div>

                {/* Original order (updated) */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: color }}>
                            1
                        </div>
                        <div className="text-[12px] font-bold text-slate-900">{tx(lang,{fr:'Ordre original (mis à jour)',ar:'الطلب الأصلي (مُحدّث)',en:'Original order (updated)',es:'Pedido original (actualizado)',pt:'Pedido original (atualizado)',tr:'Orijinal sipariş (güncellendi)'})}</div>
                        <div className="ml-auto px-2 py-0.5 bg-slate-200 rounded-full text-[10px] font-bold text-slate-600">
                            {tx(lang,{fr:'ORIGINAL',ar:'أصلي',en:'ORIGINAL',es:'ORIGINAL',pt:'ORIGINAL',tr:'ORİJİNAL'})}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                            <Hash className="w-3.5 h-3.5 text-slate-400" />
                            <div>
                                <div className="text-[9px] font-bold text-slate-500 uppercase">{tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})}</div>
                                <div className="text-[14px] font-black text-slate-900 tabular-nums">{originalQty} pcs</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <div>
                                <div className="text-[9px] font-bold text-slate-500 uppercase">{tx(lang,{fr:'Fin estimée',ar:'النهاية المتوقعة',en:'Estimated end',es:'Fin estimado',pt:'Fim estimado',tr:'Tahmini bitiş'})}</div>
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
                                <div className="text-[12px] font-bold text-indigo-900">{tx(lang,{fr:'Nouvel ordre',ar:'طلب جديد',en:'New order',es:'Nuevo pedido',pt:'Novo pedido',tr:'Yeni sipariş'})}</div>
                                <div className="ml-auto px-2 py-0.5 bg-indigo-200 rounded-full text-[10px] font-bold text-indigo-700">
                                    {tx(lang,{fr:'NOUVEAU',ar:'جديد',en:'NEW',es:'NUEVO',pt:'NOVO',tr:'YENİ'})}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex items-center gap-2">
                                    <Hash className="w-3.5 h-3.5 text-indigo-400" />
                                    <div>
                                        <div className="text-[9px] font-bold text-indigo-500 uppercase">{tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})}</div>
                                        <div className="text-[14px] font-black text-indigo-900 tabular-nums">{newQty} pcs</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                                    <div>
                                        <div className="text-[9px] font-bold text-indigo-500 uppercase">{tx(lang,{fr:'Fin estimée',ar:'النهاية المتوقعة',en:'Estimated end',es:'Fin estimado',pt:'Fim estimado',tr:'Tahmini bitiş'})}</div>
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
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{tx(lang,{fr:'Répartition',ar:'التوزيع',en:'Distribution',es:'Distribución',pt:'Distribuição',tr:'Dağılım'})}</div>
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
                            <span className="text-slate-600">{tx(lang,{fr:'Original:',ar:'الأصلي:',en:'Original:',es:'Original:',pt:'Original:',tr:'Orijinal:'})} <span className="font-bold">{originalQty} pcs</span></span>
                        </div>
                        {newEvents.map((newEv, idx) => (
                            <div key={newEv.id} className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded bg-indigo-500" />
                                <span className="text-indigo-600">{tx(lang,{fr:'Nouveau',ar:'جديد',en:'New',es:'Nuevo',pt:'Novo',tr:'Yeni'})} {idx + 1}: <span className="font-bold">{evQty(newEv)} pcs</span></span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
