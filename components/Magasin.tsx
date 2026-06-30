import React, { useState, useEffect, useRef } from 'react';
import {
    Package, Plus, Trash2, Search, Edit2, Save, X, ArrowDownCircle, ArrowUpCircle,
    AlertTriangle, Phone, Mail, Building2, LinkIcon, Layers, History, Barcode,
    Download, Filter, Activity, TrendingUp, TrendingDown, AlignLeft, Scale, RefreshCw, CheckCircle, MapPin, Sparkles, Power, FileText, Send, Printer, Recycle, ArrowLeft, Paperclip, Settings, ChevronDown, Eye, EyeOff, Image, Briefcase, Hash, Type, Table, FileSignature, Stamp, LayoutGrid
} from 'lucide-react';
import { ModelData, PlanningEvent, DemandeAppro, MouvementStock, AppSettings, MaterialReceipt } from '../types';
import DateTimePicker from './ui/DateTimePicker';
import { DEFAULT_CALENDAR_APP_SETTINGS } from '../lib/defaultCalendarSettings';
import ProductDetailPanel from './ProductDetailPanel';
import { tx, pickT } from '../lib/i18n';
import type { Lang } from '../app/constants';
import { useLang } from '../src/context/LanguageContext';

export interface MagasinProps {
    models?: ModelData[];
    demandes?: DemandeAppro[];
    setDemandes?: React.Dispatch<React.SetStateAction<DemandeAppro[]>>;
    planningEvents?: PlanningEvent[];
    lang?: Lang;
    /** Phase 0 — calendrier unifié (bons de commande, etc.) */
    settings?: AppSettings;
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface MagasinProduct {
    id: string;
    reference: string;
    designation: string;
    categorie: 'tissu' | 'fil' | 'bouton' | 'fermeture' | 'etiquette' | 'emballage' | 'autre';
    unite: 'm' | 'kg' | 'piece' | 'cone' | 'boite' | 'rouleau';
    photo?: string;
    fournisseurNom?: string;
    fournisseurTel?: string;
    fournisseurEmail?: string;
    /** Infos fournisseur supplémentaires (optionnel) */
    fournisseurAdresse?: string;
    fournisseurIce?: string;
    fournisseurRc?: string;
    fournisseurConditionsPaiement?: string;
    fournisseurDelaiLivraisonJours?: number;
    fournisseurMoq?: number;
    fournisseurDevise?: string;
    fournisseurContact?: string;
    fournisseurNotes?: string;
    fournisseurLogo?: string;
    chaineExclusive?: string;
    emplacement?: string; // e.g. Rayon A, Étagère 3
    prixUnitaire: number;
    cump?: number; // Coût Unitaire Moyen Pondéré
    stockAlerte: number;
}

export interface LotStock {
    id: string;
    productId: string;
    quantiteRestante: number;
    quantiteInitiale: number;
    prixUnitaire: number;
    dateEntree: string;
    fournisseur?: string;
    numBain?: string; // Dye lot / Batch number
    dateExpiration?: string; // FEFO
    variante?: string; // Couleur/Taille
    etat?: 'disponible' | 'quarantaine';
    quantiteReservee?: number;
}

// Removed MouvementStock and DemandeAppro as they are now in types.ts

export interface BonCommandeLigne {
    id: string;
    productId: string;
    productNom: string;
    quantite: number;
    prixUnitaire?: number;
}

export interface BonCommande {
    id: string;
    numero: string;
    fournisseurNom: string;
    dateCreation: string;
    dateLivraisonPrevue?: string;
    lignes: BonCommandeLigne[];
    statut: 'brouillon' | 'envoye' | 'valide' | 'livre';
    total?: number;
    notes?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CATS = ['tissu', 'fil', 'bouton', 'fermeture', 'etiquette', 'emballage', 'autre'] as const;
const UNITS = ['m', 'kg', 'piece', 'cone', 'boite', 'rouleau'] as const;
const CAT_CLR: Record<string, string> = {
    tissu: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300', fil: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700',
    bouton: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', fermeture: 'bg-slate-100 dark:bg-dk-elevated/60 text-slate-600 dark:text-dk-text-soft',
    etiquette: 'bg-green-100 dark:bg-green-900/40 text-green-700', emballage: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    autre: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
};
const inp = "w-full border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 dark:ring-indigo-800 focus:border-indigo-400 transition-all shadow-sm";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function ld<T>(k: string, fb: T): T { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : fb; } catch { return fb; } }
function sv(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }

function stockQty(lots: LotStock[], pid: string) { return lots.filter(l => l.productId === pid).reduce((s, l) => s + l.quantiteRestante, 0); }
function availableQty(lots: LotStock[], pid: string) { return lots.filter(l => l.productId === pid).reduce((s, l) => s + (l.quantiteRestante - (l.quantiteReservee || 0)), 0); }

function deductLots(lots: LotStock[], productId: string, qty: number, method: 'FIFO' | 'LIFO', isReservation = false, consumeReservation = false): LotStock[] {
    let rem = qty;
    const avail = lots.filter(l => l.productId === productId && (isReservation ? (l.quantiteRestante - (l.quantiteReservee || 0)) > 0 : l.quantiteRestante > 0));
    const sorted = method === 'FIFO'
        ? [...avail].sort((a, b) => a.dateEntree.localeCompare(b.dateEntree))
        : [...avail].sort((a, b) => b.dateEntree.localeCompare(a.dateEntree));
    const updated = lots.map(l => ({ ...l }));
    for (const lot of sorted) {
        if (rem <= 0) break;
        const idx = updated.findIndex(x => x.id === lot.id);
        const lUpdate = updated[idx];
        
        if (isReservation) {
            const availInLot = lUpdate.quantiteRestante - (lUpdate.quantiteReservee || 0);
            const take = Math.min(availInLot, rem);
            lUpdate.quantiteReservee = (lUpdate.quantiteReservee || 0) + take;
            rem -= take;
        } else {
            const take = Math.min(lUpdate.quantiteRestante, rem);
            lUpdate.quantiteRestante -= take;
            if (consumeReservation && (lUpdate.quantiteReservee || 0) > 0) {
                lUpdate.quantiteReservee = Math.max(0, (lUpdate.quantiteReservee || 0) - take);
            }
            rem -= take;
        }
    }
    return updated;
}

const Lbl = ({ t }: { t: string }) => <label className="block text-xs font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide mb-1 flex items-center gap-1">{t}</label>;

function StockBadge({ stock, seuil }: { stock: number; seuil: number }) {
    const { lang } = useLang();
    if (stock === 0) return <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 text-[10px] font-black uppercase">{tx(lang,{fr:'Rupture',ar:'نفاد',en:'Out of Stock',es:'Agotado',pt:'Esgotado',tr:'Stok Yok'})}</span>;
    if (stock <= seuil) return <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase">{tx(lang,{fr:'Faible',ar:'منخفض',en:'Low',es:'Bajo',pt:'Baixo',tr:'Düşük'})}</span>;
    return <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-black uppercase">{tx(lang,{fr:'En Stock',ar:'متوفر',en:'In Stock',es:'En Stock',pt:'Em Estoque',tr:'Stokta'})}</span>;
}

// ══════════════════════════════════════════════════════════════════════════════
//  PRODUCT MODAL
// ══════════════════════════════════════════════════════════════════════════════
function ProductModal({ item, onSave, onClose }: { item?: MagasinProduct; onSave: (p: MagasinProduct) => void; onClose: () => void; }) {
    const { lang } = useLang();
    const [f, setF] = useState<MagasinProduct>(item || {
        id: uid(), reference: `REF-${Math.floor(Math.random() * 9000) + 1000}`, designation: '', categorie: 'tissu', unite: 'm', prixUnitaire: 0, stockAlerte: 10, emplacement: ''
    });
    const fileRef = useRef<HTMLInputElement>(null);
    const [hasAlerte, setHasAlerte] = useState(f.stockAlerte > 0);
    const [showFrsExtra, setShowFrsExtra] = useState(() =>
        !!(item?.fournisseurEmail || item?.fournisseurAdresse || item?.fournisseurIce || item?.fournisseurRc ||
            item?.fournisseurConditionsPaiement || item?.fournisseurDelaiLivraisonJours || item?.fournisseurMoq ||
            item?.fournisseurDevise || item?.fournisseurContact || item?.fournisseurNotes));
    const set = (k: keyof MagasinProduct, v: unknown) => setF(p => ({ ...p, [k]: v }));

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg/50">
                    <h2 className="font-black text-slate-800 dark:text-dk-text text-lg flex items-center gap-2">{item ? <Edit2 className="w-5 h-5 text-indigo-500 dark:text-indigo-300" /> : <Plus className="w-5 h-5 text-emerald-500 dark:text-emerald-300" />}{item ? tx(lang,{fr:'Modifier Article',ar:'تعديل المادة',en:'Edit Item',es:'Editar Artículo',pt:'Editar Item',tr:'Ürünü Düzenle'}) : tx(lang,{fr:'Nouvel Article',ar:'مادة جديدة',en:'New Item',es:'Nuevo Artículo',pt:'Novo Item',tr:'Yeni Ürün'})}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-rose-50 dark:bg-rose-900/30 rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-rose-500 dark:text-rose-300"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                    <div className="flex gap-5">
                        <div onClick={() => fileRef.current?.click()} className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 dark:border-dk-border hover:border-indigo-400 bg-slate-50 dark:bg-dk-bg flex items-center justify-center cursor-pointer overflow-hidden shrink-0">
                            {f.photo ? <img src={f.photo} className="w-full h-full object-cover" alt="" /> : <span className="text-xs font-bold text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Photo',ar:'الصورة',en:'Photo',es:'Foto',pt:'Foto',tr:'Fotoğraf'})}</span>}
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => {
                            const file = e.target.files?.[0]; if (!file) return;
                            const r = new FileReader(); r.onload = ev => set('photo', ev.target?.result as string); r.readAsDataURL(file);
                        }} />
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div><Lbl t={tx(lang,{fr:'Référence (Code-barres)',ar:'المرجع (الباركود)',en:'Reference (Barcode)',es:'Referencia (Código de barras)',pt:'Referência (Código de barras)',tr:'Referans (Barkod)'})} /><input className={inp} value={f.reference} onChange={e => set('reference', e.target.value)} /></div>
                            <div><Lbl t={tx(lang,{fr:'Désignation *',ar:'التسمية *',en:'Designation *',es:'Designación *',pt:'Designação *',tr:'Tanım *'})} /><input className={inp} placeholder={tx(lang,{fr:'Ex: Fil Coton Noir...',ar:'مثال: خيط قطني أسود...',en:'E.g.: Black Cotton Thread...',es:'Ej: Hilo de Algodón Negro...',pt:'Ex: Linha de Algodão Preto...',tr:'Örn: Siyah Pamuk İpliği...'})} value={f.designation} onChange={e => set('designation', e.target.value)} autoFocus /></div>
                            <div><Lbl t={tx(lang,{fr:'Catégorie',ar:'الفئة',en:'Category',es:'Categoría',pt:'Categoria',tr:'Kategori'})} /><select className={inp} value={f.categorie} onChange={e => set('categorie', e.target.value)}>{CATS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}</select></div>
                            <div><Lbl t={tx(lang,{fr:'Unité',ar:'الوحدة',en:'Unit',es:'Unidad',pt:'Unidade',tr:'Birim'})} /><select className={inp} value={f.unite} onChange={e => set('unite', e.target.value)}>{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div><Lbl t={tx(lang,{fr:'Prix u. par défaut',ar:'السعر الافتراضي للوحدة',en:'Default unit price',es:'Precio unitario por defecto',pt:'Preço unitário padrão',tr:'Varsayılan birim fiyatı'})} /><input className={inp} type="number" min="0" step="0.01" value={f.prixUnitaire || ''} onChange={e => set('prixUnitaire', Math.max(0, +e.target.value.replace(/-/g, '') || 0))} /></div>
                        <div>
                            <div className="flex items-center gap-2 mb-1 cursor-pointer" onClick={() => { setHasAlerte(!hasAlerte); if (hasAlerte) set('stockAlerte', 0); }}>
                                <input type="checkbox" className="w-4 h-4 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300 rounded cursor-pointer" checked={hasAlerte} readOnly />
                                <label className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide cursor-pointer">{tx(lang,{fr:'Seuil de réappro.',ar:'حد إعادة التموين',en:'Reorder threshold',es:'Umbral de reaprovisionamiento',pt:'Limite de reabastecimento',tr:'Yeniden sipariş eşiği'})}</label>
                            </div>
                            <input className={`${inp} ${!hasAlerte ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-dk-elevated/60' : ''}`} type="number" min="0" disabled={!hasAlerte} value={f.stockAlerte || ''} onChange={e => set('stockAlerte', Math.max(0, +e.target.value.replace(/-/g, '') || 0))} />
                        </div>
                        <div><Lbl t={tx(lang,{fr:'Emplacement physique',ar:'الموقع الفعلي',en:'Physical location',es:'Ubicación física',pt:'Localização física',tr:'Fiziksel konum'})} /><input className={inp} placeholder={tx(lang,{fr:'Rayon A, Étagère 3...',ar:'جناح A، رف 3...',en:'Aisle A, Shelf 3...',es:'Pasillo A, Estante 3...',pt:'Corredor A, Prateleira 3...',tr:'A Koridoru, Raf 3...'})} value={f.emplacement || ''} onChange={e => set('emplacement', e.target.value)} /></div>
                    </div>

                    <div className="border border-slate-100 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg rounded-2xl p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div><Lbl t={tx(lang,{fr:'Fournisseur Privilégié',ar:'المورد المفضل',en:'Preferred Supplier',es:'Proveedor Preferido',pt:'Fornecedor Preferido',tr:'Tercih Edilen Tedarikçi'})} /><input className={inp} placeholder={tx(lang,{fr:'Entreprise...',ar:'شركة...',en:'Company...',es:'Empresa...',pt:'Empresa...',tr:'Şirket...'})} value={f.fournisseurNom || ''} onChange={e => set('fournisseurNom', e.target.value)} /></div>
                            <div><Lbl t={tx(lang,{fr:'Téléphone Frs.',ar:'هاتف المورد',en:'Supplier Phone',es:'Teléfono Prov.',pt:'Telefone Forn.',tr:'Tedarikçi Telefon'})} /><input className={inp} placeholder="+212..." value={f.fournisseurTel || ''} onChange={e => set('fournisseurTel', e.target.value)} /></div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowFrsExtra(v => !v)}
                            className="w-full flex items-center justify-between gap-2 py-2 px-3 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-left text-sm font-bold text-slate-700 dark:text-dk-text hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors"
                        >
                            <span>{tx(lang,{fr:'Informations fournisseur (optionnel)',ar:'معلومات المورد (اختياري)',en:'Supplier Information (optional)',es:'Información del proveedor (opcional)',pt:'Informações do fornecedor (opcional)',tr:'Tedarikçi Bilgileri (isteğe bağlı)'})}</span>
                            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showFrsExtra ? 'rotate-180' : ''}`} />
                        </button>
                        {showFrsExtra && (
                            <div className="space-y-4 pt-1 border-t border-slate-200 dark:border-dk-border">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><Lbl t={tx(lang,{fr:'E-mail Frs.',ar:'البريد الإلكتروني للمورد',en:'Supplier Email',es:'Correo Prov.',pt:'E-mail Forn.',tr:'Tedarikçi E-posta'})} /><input className={inp} type="email" placeholder="contact@..." value={f.fournisseurEmail || ''} onChange={e => set('fournisseurEmail', e.target.value)} /></div>
                                    <div><Lbl t={tx(lang,{fr:'Contact (personne)',ar:'جهة الاتصال (شخص)',en:'Contact (person)',es:'Contacto (persona)',pt:'Contato (pessoa)',tr:'İletişim (kişi)'})} /><input className={inp} placeholder={tx(lang,{fr:'Nom du contact',ar:'اسم جهة الاتصال',en:'Contact name',es:'Nombre del contacto',pt:'Nome do contato',tr:'İletişim adı'})} value={f.fournisseurContact || ''} onChange={e => set('fournisseurContact', e.target.value)} /></div>
                                </div>
                                <div><Lbl t={tx(lang,{fr:'Adresse',ar:'العنوان',en:'Address',es:'Dirección',pt:'Endereço',tr:'Adres'})} /><input className={inp} placeholder={tx(lang,{fr:'Ville, rue, n°...',ar:'المدينة، الشارع، رقم...',en:'City, street, no...',es:'Ciudad, calle, n°...',pt:'Cidade, rua, n°...',tr:'Şehir, cadde, no...'})} value={f.fournisseurAdresse || ''} onChange={e => set('fournisseurAdresse', e.target.value)} /></div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><Lbl t={tx(lang,{fr:'ICE',ar:'الرقم الضريبي',en:'Tax ID',es:'ICE',pt:'NIF',tr:'Vergi No'})} /><input className={inp} placeholder="..." value={f.fournisseurIce || ''} onChange={e => set('fournisseurIce', e.target.value)} /></div>
                                    <div><Lbl t={tx(lang,{fr:'RC',ar:'السجل التجاري',en:'Commercial Register',es:'RC',pt:'RC',tr:'Ticaret Sicil'})} /><input className={inp} placeholder="..." value={f.fournisseurRc || ''} onChange={e => set('fournisseurRc', e.target.value)} /></div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><Lbl t={tx(lang,{fr:'Conditions de paiement',ar:'شروط الدفع',en:'Payment Terms',es:'Condiciones de pago',pt:'Condições de pagamento',tr:'Ödeme Koşulları'})} /><input className={inp} placeholder="Ex: 30j fin de mois" value={f.fournisseurConditionsPaiement || ''} onChange={e => set('fournisseurConditionsPaiement', e.target.value)} /></div>
                                    <div><Lbl t={tx(lang,{fr:'Devise achat',ar:'عملة الشراء',en:'Purchase Currency',es:'Moneda de compra',pt:'Moeda de compra',tr:'Satın Alma Para Birimi'})} />
                                        <select className={inp} value={f.fournisseurDevise ?? ''} onChange={e => set('fournisseurDevise', e.target.value || undefined)}>
                                            <option value="">—</option>
                                            <option value="MAD">MAD</option>
                                            <option value="EUR">EUR</option>
                                            <option value="USD">USD</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><Lbl t={tx(lang,{fr:'Délai livraison (jours)',ar:'مهلة التسليم (أيام)',en:'Delivery Time (days)',es:'Plazo de entrega (días)',pt:'Prazo de entrega (dias)',tr:'Teslimat Süresi (gün)'})} /><input className={inp} type="number" min="0" step="1" placeholder="—" value={f.fournisseurDelaiLivraisonJours ?? ''} onChange={e => set('fournisseurDelaiLivraisonJours', e.target.value === '' ? undefined : +e.target.value)} /></div>
                                    <div><Lbl t={tx(lang,{fr:'MOQ (min. commande)',ar:'الحد الأدنى للطلب',en:'MOQ (min. order)',es:'MOQ (pedido mín.)',pt:'MOQ (pedido mín.)',tr:'MOQ (min. sipariş)'})} /><input className={inp} type="number" min="0" step="0.01" placeholder="—" value={f.fournisseurMoq ?? ''} onChange={e => set('fournisseurMoq', e.target.value === '' ? undefined : +e.target.value)} /></div>
                                </div>
                                <div><Lbl t={tx(lang,{fr:'Notes fournisseur',ar:'ملاحظات المورد',en:'Supplier Notes',es:'Notas del proveedor',pt:'Notas do fornecedor',tr:'Tedarikçi Notları'})} /><textarea className={`${inp} min-h-[72px] resize-y`} placeholder={tx(lang,{fr:'Qualité, horaires, remarques...',ar:'الجودة، المواعيد، ملاحظات...',en:'Quality, schedules, remarks...',es:'Calidad, horarios, observaciones...',pt:'Qualidade, horários, observações...',tr:'Kalite, program, notlar...'})} value={f.fournisseurNotes || ''} onChange={e => set('fournisseurNotes', e.target.value)} /></div>
                                <div><Lbl t={tx(lang,{fr:'Logo fournisseur',ar:'شعار المورد',en:'Supplier Logo',es:'Logotipo del proveedor',pt:'Logotipo do fornecedor',tr:'Tedarikçi Logosu'})} /><div onClick={() => { const el = document.createElement('input'); el.type = 'file'; el.accept = 'image/*'; el.onchange = (e: any) => { const file = e.target.files?.[0]; if (file) { const r = new FileReader(); r.onload = ev => set('fournisseurLogo', ev.target?.result as string); r.readAsDataURL(file); } }; el.click(); }} className="w-full border-2 border-dashed border-slate-200 dark:border-dk-border hover:border-indigo-400 bg-slate-50 dark:bg-dk-bg rounded-2xl p-4 cursor-pointer flex items-center justify-center">{f.fournisseurLogo ? <img src={f.fournisseurLogo} alt="Logo" className="w-24 h-24 object-contain" /> : <span className="text-xs font-bold text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Cliquez pour ajouter logo',ar:'انقر لإضافة شعار',en:'Click to add logo',es:'Haga clic para agregar logotipo',pt:'Clique para adicionar logotipo',tr:'Logo eklemek için tıklayın'})}</span>}</div></div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg">
                    <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-slate-600 dark:text-dk-text-soft hover:bg-slate-200 dark:bg-dk-border rounded-xl transition-colors">{tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}</button>
                    <button onClick={() => { if (!f.designation.trim()) { alert(tx(lang, {fr: 'Désignation obligatoire', ar: 'الاسم إجباري', en: 'Designation required', es: 'Designación obligatoria', pt: 'Designação obrigatória', tr: 'Tanım zorunlu'})); return; } onSave(f); }} className="px-6 py-2 text-sm font-black bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white rounded-xl hover:bg-indigo-700 dark:hover:bg-dk-accent-hover flex items-center gap-2"><Save className="w-4 h-4" /> {tx(lang, {fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Salvar', tr: 'Kaydet'})}</button>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
//  BON DE COMMANDE MODAL
// ══════════════════════════════════════════════════════════════════════════════
function BonCommandeModal({
    bc: initial,
    products,
    settings,
    onSave,
    onClose,
}: {
    bc: BonCommande;
    products: MagasinProduct[];
    settings: AppSettings;
    onSave: (bc: BonCommande) => void;
    onClose: () => void;
}) {
    const { lang } = useLang();
    const [bc, setBc] = useState<BonCommande>({ ...initial });
    const [addPid, setAddPid] = useState('');
    const [addQty, setAddQty] = useState('');

    const calcTotal = (lignes: BonCommandeLigne[]) => lignes.reduce((s, l) => s + (l.quantite * (l.prixUnitaire || 0)), 0);

    const handleAdd = () => {
        if (!addPid || !addQty) return alert(tx(lang, {fr: 'Sélectionner un produit et une quantité', ar: 'اختر منتجًا وكمية', en: 'Select a product and a quantity', es: 'Seleccione un producto y una cantidad', pt: 'Selecione um produto e uma quantidade', tr: 'Bir ürün ve miktar seçin'}));
        const p = products.find(x => x.id === addPid);
        if (!p) return;
        const nl = [...bc.lignes, { id: uid(), productId: p.id, productNom: p.designation, quantite: parseFloat(addQty), prixUnitaire: p.cump || p.prixUnitaire }];
        setBc({ ...bc, lignes: nl, total: calcTotal(nl) });
        setAddPid(''); setAddQty('');
    };

    const rmLine = (id: string) => {
        const nl = bc.lignes.filter(x => x.id !== id);
        setBc({ ...bc, lignes: nl, total: calcTotal(nl) });
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg/50 shrink-0">
                    <h2 className="font-black text-slate-800 dark:text-dk-text text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-500 dark:text-indigo-300" /> {tx(lang,{fr:'Éditer Bon de Commande',ar:'تحرير أمر الشراء',en:'Edit Purchase Order',es:'Editar Orden de Compra',pt:'Editar Pedido de Compra',tr:'Satın Alma Siparişini Düzenle'})} - {bc.numero}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-rose-50 dark:bg-rose-900/30 rounded-full transition-colors text-slate-400 dark:text-dk-muted hover:text-rose-500 dark:text-rose-300"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50 dark:bg-dk-bg/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-dk-surface p-4 border rounded-2xl shadow-sm dark:shadow-dk-sm">
                        <div><Lbl t={tx(lang,{fr:'Fournisseur',ar:'المورد',en:'Supplier',es:'Proveedor',pt:'Fornecedor',tr:'Tedarikçi'})} /><input className={inp} value={bc.fournisseurNom} onChange={e => setBc({ ...bc, fournisseurNom: e.target.value })} /></div>
                        <div>
                            <Lbl t={tx(lang,{fr:'Date Prévue',ar:'التاريخ المتوقع',en:'Expected Date',es:'Fecha Prevista',pt:'Data Prevista',tr:'Beklenen Tarih'})} />
                            <DateTimePicker
                                value={bc.dateLivraisonPrevue || ''}
                                onChange={(iso) => setBc({ ...bc, dateLivraisonPrevue: iso.split('T')[0] })}
                                mode="date"
                                settings={settings}
                                inputClassName={inp}
                            />
                        </div>
                        <div><Lbl t={tx(lang,{fr:'Statut',ar:'الحالة',en:'Status',es:'Estado',pt:'Status',tr:'Durum'})} /><select className={inp} value={bc.statut} onChange={e => setBc({ ...bc, statut: e.target.value as any })}><option value="brouillon">{tx(lang,{fr:'Brouillon',ar:'مسودة',en:'Draft',es:'Borrador',pt:'Rascunho',tr:'Taslak'})}</option><option value="envoye">{tx(lang,{fr:'Envoyé',ar:'مرسل',en:'Sent',es:'Enviado',pt:'Enviado',tr:'Gönderildi'})}</option><option value="valide">{tx(lang,{fr:'Validé/Approuvé',ar:'مُعتمد',en:'Approved',es:'Aprobado',pt:'Aprovado',tr:'Onaylandı'})}</option><option value="livre">{tx(lang,{fr:'Livré totalement',ar:'تم التسليم كلياً',en:'Fully Delivered',es:'Entregado totalmente',pt:'Totalmente Entregue',tr:'Tam Teslim Edildi'})}</option></select></div>
                    </div>

                    <div className="bg-white dark:bg-dk-surface border rounded-2xl shadow-sm dark:shadow-dk-sm overflow-hidden flex flex-col">
                        <div className="p-4 bg-slate-50 dark:bg-dk-bg border-b flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[200px]"><Lbl t={tx(lang,{fr:'Ajouter un Produit',ar:'إضافة منتج',en:'Add a Product',es:'Agregar un Producto',pt:'Adicionar um Produto',tr:'Ürün Ekle'})} /><select className={inp} value={addPid} onChange={e => setAddPid(e.target.value)}><option value="">{tx(lang, {fr: '-- Sélectionner --', ar: '-- اختر --', en: '-- Select --', es: '-- Seleccionar --', pt: '-- Selecionar --', tr: '-- Seçin --'})}</option>{products.map(p => <option key={p.id} value={p.id}>{p.reference} - {p.designation} (Frs: {p.fournisseurNom || '?'})</option>)}</select></div>
                            <div className="w-32"><Lbl t={tx(lang,{fr:'Quantité',ar:'الكمية',en:'Quantity',es:'Cantidad',pt:'Quantidade',tr:'Miktar'})} /><input type="number" min="0" className={inp} value={addQty} onChange={e => setAddQty(e.target.value.replace(/-/g, ''))} /></div>
                            <button onClick={handleAdd} className="bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white px-4 py-2 h-[38px] rounded-xl font-bold text-sm hover:bg-indigo-700 dark:hover:bg-dk-accent-hover">{tx(lang, {fr: 'Ajouter', ar: 'إضافة', en: 'Add', es: 'Agregar', pt: 'Adicionar', tr: 'Ekle'})}</button>
                        </div>

                        <div className="p-0 overflow-x-auto max-h-[300px]">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50 dark:bg-dk-bg sticky top-0 border-b"><tr className="text-slate-500 dark:text-dk-muted"><th className="p-3 font-bold">{tx(lang,{fr:'Produit',ar:'المنتج',en:'Product',es:'Producto',pt:'Produto',tr:'Ürün'})}</th><th className="p-3 font-bold text-right">{tx(lang,{fr:'Qté',ar:'الكمية',en:'Qty',es:'Cant.',pt:'Qtd',tr:'Miktar'})}</th><th className="p-3 font-bold text-right">{tx(lang,{fr:'Prix Unitaire',ar:'السعر للوحدة',en:'Unit Price',es:'Precio Unitario',pt:'Preço Unitário',tr:'Birim Fiyat'})}</th><th className="p-3 font-bold text-right">{tx(lang,{fr:'Sous-total',ar:'المجموع الجزئي',en:'Subtotal',es:'Subtotal',pt:'Subtotal',tr:'Ara Toplam'})}</th><th className="p-3 pr-4"></th></tr></thead>
                                <tbody>
                                    {bc.lignes.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-400 dark:text-dk-muted font-bold bg-white dark:bg-dk-surface">{tx(lang,{fr:'Aucun produit dans cette commande.',ar:'لا توجد منتجات في هذا الأمر.',en:'No products in this order.',es:'No hay productos en esta orden.',pt:'Nenhum produto neste pedido.',tr:'Bu siparişte ürün yok.'})}</td></tr> : bc.lignes.map(l => (
                                        <tr key={l.id} className="border-b border-slate-50 dark:border-dk-border/40 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 bg-white dark:bg-dk-surface">
                                            <td className="p-3 font-bold text-slate-700 dark:text-dk-text">{l.productNom}</td>
                                            <td className="p-3 text-right"><input type="number" min="0" className="w-20 border rounded px-2 py-1 text-right text-sm font-bold bg-slate-50 dark:bg-dk-bg" value={l.quantite} onChange={e => { const val = parseFloat(e.target.value.replace(/-/g, '')) || 0; const mathMaxVal = Math.max(0, val); const nl = bc.lignes.map(x => x.id === l.id ? { ...x, quantite: mathMaxVal } : x); setBc({ ...bc, lignes: nl, total: calcTotal(nl) }); }} /></td>
                                            <td className="p-3 text-right"><input type="number" min="0" className="w-24 border rounded px-2 py-1 text-right text-sm font-bold bg-slate-50 dark:bg-dk-bg" value={l.prixUnitaire || 0} onChange={e => { const val = parseFloat(e.target.value.replace(/-/g, '')) || 0; const mathMaxVal = Math.max(0, val); const nl = bc.lignes.map(x => x.id === l.id ? { ...x, prixUnitaire: mathMaxVal } : x); setBc({ ...bc, lignes: nl, total: calcTotal(nl) }); }} /> DH</td>
                                            <td className="p-3 text-right font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300">{(l.quantite * (l.prixUnitaire || 0)).toLocaleString()} DH</td>
                                            <td className="p-3 pr-4 text-right"><button onClick={() => rmLine(l.id)} className="text-slate-400 dark:text-dk-muted hover:text-rose-500 dark:text-rose-300 p-1"><Trash2 className="w-4 h-4" /></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-slate-100 dark:bg-dk-elevated/60 border-t flex justify-end items-center gap-4">
                            <span className="text-sm font-bold text-slate-500 dark:text-dk-muted uppercase">{tx(lang,{fr:'Total Estimé HT',ar:'الإجمالي التقديري غير شامل الضريبة',en:'Estimated Total (excl. tax)',es:'Total Estimado (sin IVA)',pt:'Total Estimado (s/ imposto)',tr:'Tahmini Toplam (vergisiz)'})}</span>
                            <span className="text-2xl font-black text-slate-800 dark:text-dk-text">{(bc.total || 0).toLocaleString()} <span className="text-sm">DH</span></span>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 dark:border-dk-border/60 bg-white dark:bg-dk-surface shrink-0">
                    <div className="text-xs text-slate-400 dark:text-dk-muted font-bold"><Activity className="w-3 h-3 inline mr-1" /> {tx(lang,{fr:'Sauvegarde automatique locale',ar:'حفظ تلقائي محلي',en:'Local auto-save',es:'Guardado automático local',pt:'Salvamento automático local',tr:'Otomatik yerel kaydetme'})}</div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 rounded-xl transition-colors">{tx(lang, {fr: 'Fermer', ar: 'إغلاق', en: 'Close', es: 'Cerrar', pt: 'Fechar', tr: 'Kapat'})}</button>
                        <button onClick={() => onSave(bc)} className="px-8 py-2.5 text-sm font-black bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white rounded-xl hover:bg-indigo-700 dark:hover:bg-dk-accent-hover flex items-center gap-2"><CheckCircle className="w-4 h-4" /> {tx(lang, {fr: 'Enregistrer BC', ar: 'حفظ أمر الشراء', en: 'Save PO', es: 'Guardar BC', pt: 'Salvar BC', tr: 'BC Kaydet'})}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
//  INVOICE TEMPLATE TYPE
// ══════════════════════════════════════════════════════════════════════════════
interface InvoiceTemplate {
    raisonSociale: string;
    adresse: string;
    telephone: string;
    email: string;
    ice: string;
    rc: string;
    if_number: string;
    logo: string;
    piedDePage: string;
    // Visibility toggles
    showLogo: boolean;
    showAdresse: boolean;
    showTelephone: boolean;
    showEmail: boolean;
    showICE: boolean;
    showRC: boolean;
    showIF: boolean;
    showPiedDePage: boolean;
    showSignatureZone: boolean;
    showDocumentNumber: boolean;
    showDateDocument: boolean;
    showTypeOperation: boolean;
    showReferenceColumn: boolean;
    showPrixColumn: boolean;
    showTotalColumn: boolean;
    showNotesSection: boolean;
    showPartiesSection: boolean;
    showFillerRows: boolean;
}

const DEFAULT_TEMPLATE: InvoiceTemplate = {
    raisonSociale: 'MON ENTREPRISE SARL',
    adresse: '123 Rue du Commerce, Casablanca 20000, Maroc',
    telephone: '+212 5XX-XXXXXX',
    email: 'contact@monentreprise.ma',
    ice: '000234567890001',
    rc: 'CS 12345',
    if_number: '12345678',
    logo: '',
    piedDePage: 'Règlement à 30 jours · Banque : Attijariwafa · RIB: 007 780 0000000000000000 67',
    showLogo: true,
    showAdresse: true,
    showTelephone: true,
    showEmail: true,
    showICE: true,
    showRC: true,
    showIF: true,
    showPiedDePage: true,
    showSignatureZone: true,
    showDocumentNumber: true,
    showDateDocument: true,
    showTypeOperation: true,
    showReferenceColumn: true,
    showPrixColumn: true,
    showTotalColumn: true,
    showNotesSection: true,
    showPartiesSection: true,
    showFillerRows: true,
};

// ══════════════════════════════════════════════════════════════════════════════
//  INVOICE SETTINGS MODAL — PREMIUM SPLIT-PANEL DESIGN
// ══════════════════════════════════════════════════════════════════════════════
type InvTabId = 'identity' | 'company' | 'legal' | 'footer' | 'visibility';
const INV_SETTINGS_TABS: { id: InvTabId; label: string; icon: React.FC<any> }[] = [
    { id: 'identity', label: 'Logo', icon: Image },
    { id: 'company', label: 'Société', icon: Building2 },
    { id: 'legal', label: 'Légal', icon: Stamp },
    { id: 'footer', label: 'Pied', icon: AlignLeft },
    { id: 'visibility', label: 'Contenu', icon: Eye },
];

function InvoiceSettingsModal({ template, onSave, onClose }: { template: InvoiceTemplate; onSave: (t: InvoiceTemplate) => void; onClose: () => void }) {
    const { lang } = useLang();
    const [s, setS] = useState<InvoiceTemplate>({ ...template });
    const [activeTab, setActiveTab] = useState<InvTabId>('identity');
    const [isClosing, setIsClosing] = useState(false);
    const [saveFlash, setSaveFlash] = useState(false);

    const handleClose = () => { setIsClosing(true); setTimeout(onClose, 250); };
    const handleSave = () => { setSaveFlash(true); setTimeout(() => { onSave(s); setSaveFlash(false); }, 400); };

    const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) { const r = new FileReader(); r.onload = () => setS(prev => ({ ...prev, logo: r.result as string })); r.readAsDataURL(file); }
    };

    const invInp = 'w-full bg-white dark:bg-dk-surface/90 border border-slate-200 dark:border-dk-border/80 rounded-xl px-4 py-2.5 mt-1.5 text-sm font-medium text-slate-700 dark:text-dk-text placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all duration-200 hover:border-slate-300 dark:border-dk-border';

    // Toggle component — amber/warm theme
    const Toggle = ({ k, label, icon: Ic }: { k: keyof InvoiceTemplate; label: string; icon?: React.FC<any> }) => {
        const on = !!s[k];
        return (
            <button type="button" onClick={() => setS(p => ({ ...p, [k]: !p[k] }))} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all duration-200 group ${
                on ? 'bg-white dark:bg-dk-surface border-amber-200 dark:border-amber-800/60 shadow-sm shadow-amber-100/50' : 'bg-slate-50 dark:bg-dk-bg/50 border-slate-100 dark:border-dk-border/60 hover:border-slate-200'
            }`}>
                {Ic && <Ic className={`w-3.5 h-3.5 transition-colors ${on ? 'text-amber-500 dark:text-amber-300' : 'text-slate-300 dark:text-dk-muted'}`} />}
                <span className={`flex-1 text-left text-[13px] font-semibold transition-colors ${on ? 'text-slate-700 dark:text-dk-text' : 'text-slate-400 dark:text-dk-muted'}`}>{label}</span>
                <div className={`relative w-10 h-[22px] rounded-full transition-all duration-300 shrink-0 ${on ? 'bg-gradient-to-r from-amber-400 to-orange-400 shadow-inner' : 'bg-slate-200 dark:bg-dk-border'}`}>
                    <div className={`absolute top-[3px] w-4 h-4 bg-white dark:bg-dk-surface rounded-full shadow-md dark:shadow-dk-md transition-all duration-300 ${on ? 'left-[21px] scale-105' : 'left-[3px]'}`} />
                </div>
            </button>
        );
    };

    // ─── LIVE DOCUMENT PREVIEW (always visible) ───
    const LivePreview = () => (
        <div className="bg-white dark:bg-dk-surface rounded-xl border border-slate-200 dark:border-dk-border shadow-lg dark:shadow-dk-lg overflow-hidden h-full" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* Preview header badge */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-3 py-1.5 flex items-center justify-between">
                <span className="text-[9px] font-black text-white/70 uppercase tracking-widest flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-emerald-400 dark:bg-emerald-800 rounded-full animate-pulse" /> Aperçu en direct
                </span>
                <span className="text-[8px] text-white/40 font-bold">A4</span>
            </div>
            <div className="p-3.5 space-y-2.5" style={{ fontSize: '8px', lineHeight: 1.5 }}>
                {/* Header */}
                <div className="flex justify-between items-start pb-2 border-b border-slate-100 dark:border-dk-border/60">
                    <div className="flex items-center gap-2">
                        {s.showLogo && <div className="w-7 h-7 rounded bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center overflow-hidden border border-amber-100 dark:border-amber-800/50">
                            {s.logo ? <img src={s.logo} className="w-full h-full object-contain" /> : <Building2 className="w-3.5 h-3.5 text-amber-400 dark:text-amber-300" />}
                        </div>}
                        <div>
                            <div className="font-black text-[9px] text-slate-800 dark:text-dk-text">{s.raisonSociale || 'VOTRE ENTREPRISE'}</div>
                            {s.showAdresse && s.adresse && <div className="text-slate-400 dark:text-dk-muted" style={{ fontSize: '6.5px' }}>{s.adresse}</div>}
                            <div className="flex gap-2 mt-0.5">
                                {s.showTelephone && s.telephone && <span className="text-slate-400 dark:text-dk-muted" style={{ fontSize: '5.5px' }}>📞 {s.telephone}</span>}
                                {s.showEmail && s.email && <span className="text-slate-400 dark:text-dk-muted" style={{ fontSize: '5.5px' }}>✉ {s.email}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        {s.showDocumentNumber && <div className="font-black text-amber-600 dark:text-amber-400 dark:text-amber-300" style={{ fontSize: '7px' }}>BL-2025-A1B2C3</div>}
                        {s.showDateDocument && <div className="text-slate-400 dark:text-dk-muted" style={{ fontSize: '5.5px' }}>{new Date().toLocaleDateString('fr-FR')}</div>}
                    </div>
                </div>

                {/* Legal bar */}
                {(s.showICE || s.showRC || s.showIF) && (
                    <div className="flex gap-2 text-slate-400 dark:text-dk-muted" style={{ fontSize: '5.5px' }}>
                        {s.showICE && <span>ICE: {s.ice || '...'}</span>}
                        {s.showRC && <span>RC: {s.rc || '...'}</span>}
                        {s.showIF && <span>IF: {s.if_number || '...'}</span>}
                    </div>
                )}

                {/* Type */}
                {s.showTypeOperation && <div className="text-center font-black text-[9px] text-amber-700 dark:text-amber-300 py-1 bg-amber-50 dark:bg-amber-900/30 rounded border border-amber-100 dark:border-amber-800/50">BON DE LIVRAISON</div>}

                {/* Table */}
                <div className="border border-slate-100 dark:border-dk-border/60 rounded overflow-hidden">
                    <div className="flex bg-slate-50 dark:bg-dk-bg font-black text-slate-500 dark:text-dk-muted" style={{ fontSize: '5.5px' }}>
                        <div className="flex-1 p-1">{tx(lang, {fr: 'Désignation', ar: 'التسمية', en: 'Designation', es: 'Designación', pt: 'Designação', tr: 'Tanım'})}</div>
                        {s.showReferenceColumn && <div className="w-10 p-1">Réf</div>}
                        <div className="w-7 p-1 text-center">Qté</div>
                        {s.showPrixColumn && <div className="w-10 p-1 text-right">P.U.</div>}
                        {s.showTotalColumn && <div className="w-12 p-1 text-right">{tx(lang, {fr: 'Total', ar: 'المجموع', en: 'Total', es: 'Total', pt: 'Total', tr: 'Toplam'})}</div>}
                    </div>
                    <div className="flex text-slate-600 dark:text-dk-text-soft" style={{ fontSize: '5.5px' }}>
                        <div className="flex-1 p-1">Tissu coton premium</div>
                        {s.showReferenceColumn && <div className="w-10 p-1">TSU-001</div>}
                        <div className="w-7 p-1 text-center">50</div>
                        {s.showPrixColumn && <div className="w-10 p-1 text-right">45.00</div>}
                        {s.showTotalColumn && <div className="w-12 p-1 text-right font-bold">2,250.00</div>}
                    </div>
                    <div className="flex text-slate-500 dark:text-dk-muted border-t border-slate-50 dark:border-dk-border/40" style={{ fontSize: '5.5px' }}>
                        <div className="flex-1 p-1">Boutons nacre 20mm</div>
                        {s.showReferenceColumn && <div className="w-10 p-1">BTN-042</div>}
                        <div className="w-7 p-1 text-center">200</div>
                        {s.showPrixColumn && <div className="w-10 p-1 text-right">3.50</div>}
                        {s.showTotalColumn && <div className="w-12 p-1 text-right font-bold">700.00</div>}
                    </div>
                    {s.showFillerRows && [0,1].map(i => <div key={i} className="flex border-t border-slate-50 dark:border-dk-border/40" style={{ fontSize: '5.5px' }}>
                        <div className="flex-1 p-1 text-slate-200 dark:text-dk-muted">—</div>
                    </div>)}
                </div>

                {/* Total */}
                {s.showTotalColumn && <div className="flex justify-end">
                    <div className="bg-slate-50 dark:bg-dk-bg rounded px-2 py-1 border border-slate-100 dark:border-dk-border/60">
                        <span className="text-slate-400 dark:text-dk-muted font-bold" style={{ fontSize: '5.5px' }}>Total HT: </span>
                        <span className="text-slate-700 dark:text-dk-text font-black" style={{ fontSize: '7px' }}>2,950.00 MAD</span>
                    </div>
                </div>}

                {/* Parties */}
                {s.showPartiesSection && <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-slate-50 dark:bg-dk-bg rounded p-1.5"><div className="font-black text-slate-400 dark:text-dk-muted mb-0.5" style={{ fontSize: '5.5px' }}>ÉMETTEUR</div><div className="text-slate-300 dark:text-dk-muted" style={{ fontSize: '4.5px' }}>Cachet & Signature</div></div>
                    <div className="bg-slate-50 dark:bg-dk-bg rounded p-1.5"><div className="font-black text-slate-400 dark:text-dk-muted mb-0.5" style={{ fontSize: '5.5px' }}>DESTINATAIRE</div><div className="text-slate-300 dark:text-dk-muted" style={{ fontSize: '4.5px' }}>Reçu par</div></div>
                </div>}

                {/* Notes */}
                {s.showNotesSection && <div className="bg-amber-50 dark:bg-amber-900/50 rounded p-1.5"><span className="font-bold text-amber-500 dark:text-amber-300" style={{ fontSize: '5.5px' }}>Notes:</span> <span className="text-slate-400 dark:text-dk-muted" style={{ fontSize: '4.5px' }}>Observations...</span></div>}

                {/* Signatures */}
                {s.showSignatureZone && <div className="grid grid-cols-2 gap-3 pt-1.5 border-t border-dashed border-slate-200 dark:border-dk-border">
                    <div className="text-center"><div className="w-full h-3 border-b border-slate-200 dark:border-dk-border" /><div className="text-slate-400 dark:text-dk-muted mt-0.5" style={{ fontSize: '4.5px' }}>Signature Magasinier</div></div>
                    <div className="text-center"><div className="w-full h-3 border-b border-slate-200 dark:border-dk-border" /><div className="text-slate-400 dark:text-dk-muted mt-0.5" style={{ fontSize: '4.5px' }}>Signature Récepteur</div></div>
                </div>}

                {/* Footer */}
                {s.showPiedDePage && s.piedDePage && <div className="text-center text-slate-300 dark:text-dk-muted pt-1 border-t border-slate-100 dark:border-dk-border/60" style={{ fontSize: '4.5px' }}>{s.piedDePage.substring(0, 80)}{s.piedDePage.length > 80 ? '...' : ''}</div>}
            </div>
        </div>
    );

    return (
        <>
            {/* Animated CSS */}
            <style>{`
                @keyframes invModalIn { from { opacity: 0; transform: scale(0.92) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
                @keyframes invModalOut { from { opacity: 1; transform: scale(1) translateY(0); } to { opacity: 0; transform: scale(0.92) translateY(20px); } }
                @keyframes invBgIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes invBgOut { from { opacity: 1; } to { opacity: 0; } }
                @keyframes invTabSlide { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }
                @keyframes invSaveFlash { 0% { box-shadow: 0 0 0 0 rgba(245,158,11,0.5); } 50% { box-shadow: 0 0 0 12px rgba(245,158,11,0); } 100% { box-shadow: 0 0 0 0 rgba(245,158,11,0); } }
                .inv-modal-enter { animation: invModalIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards; }
                .inv-modal-exit { animation: invModalOut 0.25s ease-in forwards; }
                .inv-bg-enter { animation: invBgIn 0.3s ease forwards; }
                .inv-bg-exit { animation: invBgOut 0.25s ease forwards; }
                .inv-tab-content { animation: invTabSlide 0.25s cubic-bezier(0.16,1,0.3,1) forwards; }
                .inv-save-flash { animation: invSaveFlash 0.4s ease; }
            `}</style>

            <div className={`fixed inset-0 z-[200] flex items-center justify-center p-4 ${isClosing ? 'inv-bg-exit' : 'inv-bg-enter'}`}>
                {/* Backdrop */}
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" onClick={handleClose} />

                {/* Modal — wider for split panel */}
                <div className={`relative bg-white dark:bg-dk-surface/95 backdrop-blur-2xl rounded-[24px] shadow-2xl dark:shadow-dk-elevated w-full max-w-[1200px] max-h-[92vh] overflow-hidden flex flex-col border border-white/40 ${isClosing ? 'inv-modal-exit' : 'inv-modal-enter'}`}
                     style={{ boxShadow: '0 32px 64px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1) inset' }}>

                    {/* ─ HEADER ─ warm amber/charcoal */}
                    <div className="relative px-7 py-4 shrink-0 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800" />
                        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 70% 50%, rgba(245,158,11,0.12) 0%, transparent 60%)' }} />
                        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-50 dark:bg-amber-900/5 rounded-full -translate-y-1/2 translate-x-1/4" />

                        <div className="relative flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 bg-amber-50 dark:bg-amber-900/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-amber-400/20 shadow-lg dark:shadow-dk-lg shadow-amber-900/10">
                                    <FileText className="w-5 h-5 text-amber-400 dark:text-amber-300" />
                                </div>
                                <div>
                                    <h2 className="font-black text-white text-lg tracking-tight">{tx(lang,{fr:'Paramètres Documents',ar:'إعدادات المستندات',en:'Document Settings',es:'Configuración de Documentos',pt:'Configuração de Documentos',tr:'Belge Ayarları'})}</h2>
                                    <p className="text-amber-200/50 text-xs font-semibold mt-0.5 tracking-wide">{tx(lang,{fr:'Personnalisez vos Factures & Bons de Livraison',ar:'تخصيص فواتيركم وإيصالات التسليم',en:'Customize your Invoices & Delivery Notes',es:'Personalice sus Facturas y Albaranes',pt:'Personalize suas Faturas e Guias de Remessa',tr:'Faturalarınızı ve Teslimat Notlarınızı Özelleştirin'})}</p>
                                </div>
                            </div>
                            <button onClick={handleClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white dark:bg-dk-surface/10 hover:bg-white text-white/60 hover:text-white transition-all duration-200 border border-white/5">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* ─ BODY: SPLIT PANEL ─ */}
                    <div className="flex-1 flex overflow-hidden min-h-0">

                        {/* ══ LEFT SIDE: Vertical Tabs + Settings ══ */}
                        <div className="flex-1 flex min-w-0">
                            {/* Vertical Tab Bar */}
                            <div className="w-[52px] shrink-0 bg-slate-50 dark:bg-dk-bg/80 border-r border-slate-100 dark:border-dk-border/80 py-3 flex flex-col items-center gap-1">
                                {INV_SETTINGS_TABS.map(tab => {
                                    const isActive = activeTab === tab.id;
                                    const Icon = tab.icon;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            title={tab.label}
                                            className={`relative w-10 h-10 flex flex-col items-center justify-center rounded-xl transition-all duration-200 group ${
                                                isActive
                                                    ? 'bg-white dark:bg-dk-surface shadow-sm border border-slate-200 dark:border-dk-border/60 text-amber-600 dark:text-amber-400 dark:text-amber-300'
                                                    : 'text-slate-400 dark:text-dk-muted hover:text-slate-600 hover:bg-white'
                                            }`}
                                        >
                                            <Icon className={`w-4 h-4 ${isActive ? 'text-amber-500 dark:text-amber-300' : ''}`} />
                                            <span className="text-[7px] font-bold mt-0.5 leading-none">{tab.label}</span>
                                            {isActive && <div className="absolute left-0 top-2 bottom-2 w-[3px] bg-gradient-to-b from-amber-400 to-orange-400 rounded-r-full" />}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Settings Content */}
                            <div className="flex-1 overflow-y-auto min-w-0">
                                <div key={activeTab} className="inv-tab-content p-5">

                                    {/* ═══ IDENTITY TAB ═══ */}
                                    {activeTab === 'identity' && (
                                        <div className="space-y-5">
                                            <div>
                                                <h3 className="font-black text-slate-800 dark:text-dk-text text-base flex items-center gap-2"><Image className="w-5 h-5 text-amber-500 dark:text-amber-300" /> {tx(lang,{fr:'Logo & Identité',ar:'الشعار والهوية',en:'Logo & Identity',es:'Logo e Identidad',pt:'Logotipo e Identidade',tr:'Logo ve Kimlik'})}</h3>
                                                <p className="text-xs text-slate-400 dark:text-dk-muted font-medium mt-0.5">{tx(lang,{fr:'Votre logo apparaîtra sur tous les documents',ar:'سيظهر شعاركم على جميع المستندات',en:'Your logo will appear on all documents',es:'Su logo aparecerá en todos los documentos',pt:'Seu logotipo aparecerá em todos os documentos',tr:'Logonuz tüm belgelerde görünecek'})}</p>
                                            </div>

                                            {/* Logo upload */}
                                            <div className="relative bg-gradient-to-br from-slate-50 to-white rounded-2xl border-2 border-dashed border-slate-200 dark:border-dk-border p-6 text-center group hover:border-amber-300 transition-all duration-300">
                                                {s.logo ? (
                                                    <div className="space-y-3">
                                                        <div className="w-24 h-24 mx-auto rounded-2xl bg-white dark:bg-dk-surface shadow-lg dark:shadow-dk-lg border border-slate-100 dark:border-dk-border/60 overflow-hidden p-2">
                                                            <img src={s.logo} className="w-full h-full object-contain" />
                                                        </div>
                                                        <div className="flex items-center justify-center gap-2">
                                                            <label className="cursor-pointer px-3 py-1.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 dark:text-amber-300 rounded-lg text-xs font-bold hover:bg-amber-100 dark:bg-amber-900/40 transition-colors">
                                                                {tx(lang,{fr:'Changer',ar:'تغيير',en:'Change',es:'Cambiar',pt:'Alterar',tr:'Değiştir'})}
                                                                <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
                                                            </label>
                                                            <button onClick={() => setS(p => ({ ...p, logo: '' }))} className="px-3 py-1.5 text-rose-500 dark:text-rose-300 hover:bg-rose-50 dark:bg-rose-900/30 rounded-lg text-xs font-bold transition-colors">
                                                                {tx(lang,{fr:'Supprimer',ar:'حذف',en:'Delete',es:'Eliminar',pt:'Excluir',tr:'Sil'})}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <label className="cursor-pointer block space-y-2">
                                                        <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 dark:bg-dk-elevated/60 group-hover:bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center transition-colors">
                                                            <Image className="w-7 h-7 text-slate-300 dark:text-dk-muted group-hover:text-amber-400 dark:text-amber-300 transition-colors" />
                                                        </div>
                                                        <p className="text-sm font-bold text-slate-500 dark:text-dk-muted">{tx(lang,{fr:'Glissez ou ',ar:'اسحب أو ',en:'Drag or ',es:'Arrastre o ',pt:'Arraste ou ',tr:'Sürükleyin veya '})}<span className="text-amber-600 dark:text-amber-400 dark:text-amber-300 underline">{tx(lang,{fr:'parcourir',ar:'تصفح',en:'browse',es:'explorar',pt:'procurar',tr:'gözat'})}</span></p>
                                                        <p className="text-[10px] text-slate-300 dark:text-dk-muted">{tx(lang,{fr:'PNG, JPG, SVG - Max 2 Mo',ar:'PNG, JPG, SVG - 2 ميغابايت كحد أقصى',en:'PNG, JPG, SVG - Max 2 MB',es:'PNG, JPG, SVG - Máx 2 MB',pt:'PNG, JPG, SVG - Máx 2 MB',tr:'PNG, JPG, SVG - Maks 2 MB'})}</p>
                                                        <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
                                                    </label>
                                                )}
                                            </div>

                                            <Toggle k="showLogo" label={tx(lang,{fr:'Afficher le logo sur les documents',ar:'إظهار الشعار على المستندات',en:'Show logo on documents',es:'Mostrar logotipo en documentos',pt:'Mostrar logotipo nos documentos',tr:'Belgelerde logoyu göster'})} icon={Eye} />
                                        </div>
                                    )}

                                    {/* ═══ COMPANY TAB ═══ */}
                                    {activeTab === 'company' && (
                                        <div className="space-y-5">
                                            <div>
                                                <h3 className="font-black text-slate-800 dark:text-dk-text text-base flex items-center gap-2"><Building2 className="w-5 h-5 text-emerald-500 dark:text-emerald-300" /> {tx(lang,{fr:'Informations Société',ar:'معلومات الشركة',en:'Company Information',es:'Información de la Empresa',pt:'Informações da Empresa',tr:'Şirket Bilgileri'})}</h3>
                                                <p className="text-xs text-slate-400 dark:text-dk-muted font-medium mt-0.5">{tx(lang,{fr:'En-tête de vos documents',ar:'رأس مستنداتكم',en:'Your document header',es:'Encabezado de sus documentos',pt:'Cabeçalho dos seus documentos',tr:'Belge başlığınız'})}</p>
                                            </div>
                                            <div className="space-y-3">
                                                 <div>
                                                    <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest flex items-center gap-1"><Briefcase className="w-3 h-3" /> {tx(lang,{fr:'Raison Sociale',ar:'الاسم التجاري',en:'Company Name',es:'Razón Social',pt:'Razão Social',tr:'Şirket Adı'})} <span className="text-rose-400 dark:text-rose-200">*</span></label>
                                                    <input className={invInp} value={s.raisonSociale} onChange={e => setS(p => ({ ...p, raisonSociale: e.target.value }))} placeholder="Ex: BERAMETHODE SARL" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest flex items-center gap-1"><MapPin className="w-3 h-3" /> {tx(lang,{fr:'Adresse',ar:'العنوان',en:'Address',es:'Dirección',pt:'Endereço',tr:'Adres'})}</label>
                                                    <input className={invInp} value={s.adresse} onChange={e => setS(p => ({ ...p, adresse: e.target.value }))} placeholder="123 Rue du Commerce, Casablanca" />
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest flex items-center gap-1"><Phone className="w-3 h-3" /> {tx(lang,{fr:'Téléphone',ar:'الهاتف',en:'Phone',es:'Teléfono',pt:'Telefone',tr:'Telefon'})}</label>
                                                        <input className={invInp} value={s.telephone} onChange={e => setS(p => ({ ...p, telephone: e.target.value }))} placeholder="+212 5XX-XXXXXX" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest flex items-center gap-1"><Mail className="w-3 h-3" /> {tx(lang,{fr:'Email',ar:'البريد الإلكتروني',en:'Email',es:'Correo',pt:'E-mail',tr:'E-posta'})}</label>
                                                        <input className={invInp} value={s.email} onChange={e => setS(p => ({ ...p, email: e.target.value }))} placeholder="contact@entreprise.ma" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="pt-4 border-t border-slate-100 dark:border-dk-border/60 space-y-1.5">
                                                <p className="text-[9px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-2">{tx(lang,{fr:'Visibilité',ar:'الظهور',en:'Visibility',es:'Visibilidad',pt:'Visibilidade',tr:'Görünürlük'})}</p>
                                                <Toggle k="showAdresse" label={tx(lang,{fr:'Adresse',ar:'العنوان',en:'Address',es:'Dirección',pt:'Endereço',tr:'Adres'})} icon={MapPin} />
                                                <Toggle k="showTelephone" label={tx(lang,{fr:'Téléphone',ar:'الهاتف',en:'Phone',es:'Teléfono',pt:'Telefone',tr:'Telefon'})} icon={Phone} />
                                                <Toggle k="showEmail" label={tx(lang,{fr:'Email',ar:'البريد الإلكتروني',en:'Email',es:'Correo',pt:'E-mail',tr:'E-posta'})} icon={Mail} />
                                            </div>
                                        </div>
                                    )}

                                    {/* ═══ LEGAL TAB ═══ */}
                                    {activeTab === 'legal' && (
                                        <div className="space-y-5">
                                            <div>
                                                <h3 className="font-black text-slate-800 dark:text-dk-text text-base flex items-center gap-2"><Stamp className="w-5 h-5 text-amber-500 dark:text-amber-300" /> {tx(lang,{fr:'Identifiants Légaux',ar:'المعرفات القانونية',en:'Legal Identifiers',es:'Identificadores Legales',pt:'Identificadores Legais',tr:'Yasal Kimlikler'})}</h3>
                                                <p className="text-xs text-slate-400 dark:text-dk-muted font-medium mt-0.5">{tx(lang,{fr:'Identifiants fiscaux obligatoires',ar:'المعرفات الضريبية الإجبارية',en:'Required tax identifiers',es:'Identificadores fiscales obligatorios',pt:'Identificadores fiscais obrigatórios',tr:'Zorunlu vergi kimlikleri'})}</p>
                                            </div>
                                            <div className="space-y-3">
                                                {[
                                                    { key: 'ice' as keyof InvoiceTemplate, label: 'ICE', ph: '000000000000001' },
                                                    { key: 'rc' as keyof InvoiceTemplate, label: 'RC', ph: 'CS 12345' },
                                                    { key: 'if_number' as keyof InvoiceTemplate, label: 'IF', ph: '12345678' },
                                                ].map(f => (
                                                    <div key={f.key} className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-3 border border-amber-100 dark:border-amber-800/40">
                                                        <label className="text-[10px] font-black text-amber-600 dark:text-amber-400 dark:text-amber-300 uppercase tracking-widest flex items-center gap-1"><Hash className="w-3 h-3" /> {f.label}</label>
                                                        <input className={invInp} value={s[f.key] as string} onChange={e => setS(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} />
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="pt-4 border-t border-slate-100 dark:border-dk-border/60 space-y-1.5">
                                                <p className="text-[9px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-2">{tx(lang,{fr:'Visibilité',ar:'الظهور',en:'Visibility',es:'Visibilidad',pt:'Visibilidade',tr:'Görünürlük'})}</p>
                                                <Toggle k="showICE" label="ICE" icon={Eye} />
                                                <Toggle k="showRC" label="RC" icon={Eye} />
                                                <Toggle k="showIF" label="IF" icon={Eye} />
                                            </div>
                                        </div>
                                    )}

                                    {/* ═══ FOOTER TAB ═══ */}
                                    {activeTab === 'footer' && (
                                        <div className="space-y-5">
                                            <div>
                                                <h3 className="font-black text-slate-800 dark:text-dk-text text-base flex items-center gap-2"><AlignLeft className="w-5 h-5 text-purple-500 dark:text-purple-300" /> {tx(lang,{fr:'Pied de Page',ar:'تذييل الصفحة',en:'Footer',es:'Pie de Página',pt:'Rodapé',tr:'Alt Bilgi'})}</h3>
                                                <p className="text-xs text-slate-400 dark:text-dk-muted font-medium mt-0.5">{tx(lang,{fr:'Mentions en bas de chaque document',ar:'البنود السفلية لكل مستند',en:'Footer notes at the bottom of each document',es:'Menciones al pie de cada documento',pt:'Notas no rodapé de cada documento',tr:'Her belgenin altındaki notlar'})}</p>
                                            </div>
                                            <div className="relative">
                                                <textarea
                                                    className="w-full bg-white dark:bg-dk-surface/90 border border-slate-200 dark:border-dk-border/80 rounded-2xl px-4 py-3 text-sm font-medium text-slate-700 dark:text-dk-text placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all duration-200 resize-none"
                                                    rows={4}
                                                    value={s.piedDePage}
                                                    onChange={e => setS(p => ({ ...p, piedDePage: e.target.value }))}
                                                    placeholder={tx(lang,{fr:"Ex: Banque Populaire • Compte N° 0000-0000\nConditions: Paiement à 30 jours",ar:"مثال: البنك الشعبي • الحساب رقم 0000-0000\nالشروط: الدفع خلال 30 يوماً",en:"E.g.: Banque Populaire • Account N° 0000-0000\nTerms: Payment within 30 days",es:"Ej: Banque Populaire • Cuenta N° 0000-0000\nCondiciones: Pago a 30 días",pt:"Ex: Banque Populaire • Conta N° 0000-0000\nCondições: Pagamento em 30 dias",tr:"Örn: Banque Populaire • Hesap No 0000-0000\nKoşullar: 30 gün içinde ödeme"})}
                                                />
                                                <div className="absolute bottom-2.5 right-3 text-[9px] font-bold text-slate-300 dark:text-dk-muted">{(s.piedDePage || '').length}/200</div>
                                            </div>
                                            <Toggle k="showPiedDePage" label={tx(lang,{fr:'Afficher le pied de page',ar:'إظهار تذييل الصفحة',en:'Show footer',es:'Mostrar pie de página',pt:'Mostrar rodapé',tr:'Alt bilgiyi göster'})} icon={Eye} />
                                        </div>
                                    )}

                                    {/* ═══ VISIBILITY TAB ═══ */}
                                    {activeTab === 'visibility' && (
                                        <div className="space-y-5">
                                            <div>
                                                <h3 className="font-black text-slate-800 dark:text-dk-text text-base flex items-center gap-2"><Eye className="w-5 h-5 text-rose-500 dark:text-rose-300" /> {tx(lang,{fr:'Contenu Document',ar:'محتوى المستند',en:'Document Content',es:'Contenido del Documento',pt:'Conteúdo do Documento',tr:'Belge İçeriği'})}</h3>
                                                <p className="text-xs text-slate-400 dark:text-dk-muted font-medium mt-0.5">{tx(lang,{fr:'Éléments visibles à l\'impression',ar:'العناصر المرئية عند الطباعة',en:'Elements visible when printing',es:'Elementos visibles al imprimir',pt:'Elementos visíveis na impressão',tr:'Yazdırmada görünen öğeler'})}</p>
                                            </div>

                                            {/* Document block */}
                                            <div className="bg-violet-50/30 rounded-xl p-3.5 border border-violet-100/40">
                                                <h4 className="text-[10px] font-black text-violet-500 dark:text-violet-300 uppercase tracking-widest mb-2.5 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> {tx(lang,{fr:'Bloc Document',ar:'كتلة المستند',en:'Document Block',es:'Bloque Documento',pt:'Bloco Documento',tr:'Belge Bloğu'})}</h4>
                                                <div className="space-y-1.5">
                                                    <Toggle k="showDocumentNumber" label={tx(lang,{fr:'N° de Document',ar:'رقم المستند',en:'Document No.',es:'N° de Documento',pt:'N° do Documento',tr:'Belge No'})} icon={Hash} />
                                                    <Toggle k="showDateDocument" label={tx(lang,{fr:'Date',ar:'التاريخ',en:'Date',es:'Fecha',pt:'Data',tr:'Tarih'})} icon={FileText} />
                                                    <Toggle k="showTypeOperation" label={tx(lang,{fr:"Type d'Opération",ar:'نوع العملية',en:'Operation Type',es:'Tipo de Operación',pt:'Tipo de Operação',tr:'İşlem Türü'})} icon={Type} />
                                                </div>
                                            </div>

                                            {/* Table columns */}
                                            <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-xl p-3.5 border border-emerald-100 dark:border-emerald-800/40">
                                                <h4 className="text-[10px] font-black text-emerald-500 dark:text-emerald-300 uppercase tracking-widest mb-2.5 flex items-center gap-1.5"><Table className="w-3.5 h-3.5" /> {tx(lang,{fr:'Tableau',ar:'الجدول',en:'Table',es:'Tabla',pt:'Tabela',tr:'Tablo'})}</h4>
                                                <div className="space-y-1.5">
                                                    <Toggle k="showReferenceColumn" label={tx(lang,{fr:'Colonne Référence',ar:'عمود المرجع',en:'Reference Column',es:'Columna Referencia',pt:'Coluna Referência',tr:'Referans Sütunu'})} icon={Hash} />
                                                    <Toggle k="showPrixColumn" label={tx(lang,{fr:'Prix Unitaire',ar:'السعر للوحدة',en:'Unit Price',es:'Precio Unitario',pt:'Preço Unitário',tr:'Birim Fiyat'})} icon={FileText} />
                                                    <Toggle k="showTotalColumn" label={tx(lang,{fr:'Total HT',ar:'المجموع غير شامل الضريبة',en:'Total (excl. tax)',es:'Total sin IVA',pt:'Total s/ imposto',tr:'Vergisiz Toplam'})} icon={FileText} />
                                                    <Toggle k="showFillerRows" label={tx(lang,{fr:'Lignes vides',ar:'أسطر فارغة',en:'Empty rows',es:'Filas vacías',pt:'Linhas vazias',tr:'Boş satırlar'})} icon={AlignLeft} />
                                                </div>
                                            </div>

                                            {/* General sections */}
                                            <div className="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-3.5 border border-amber-100 dark:border-amber-800/40">
                                                <h4 className="text-[10px] font-black text-amber-500 dark:text-amber-300 uppercase tracking-widest mb-2.5 flex items-center gap-1.5"><LayoutGrid className="w-3.5 h-3.5" /> {tx(lang,{fr:'Sections',ar:'الأقسام',en:'Sections',es:'Secciones',pt:'Seções',tr:'Bölümler'})}</h4>
                                                <div className="space-y-1.5">
                                                    <Toggle k="showPartiesSection" label={tx(lang,{fr:'Émetteur / Destinataire',ar:'المرسل / المستلم',en:'Sender / Recipient',es:'Emisor / Destinatario',pt:'Remetente / Destinatário',tr:'Gönderen / Alıcı'})} icon={Building2} />
                                                    <Toggle k="showNotesSection" label={tx(lang,{fr:'Notes / Observations',ar:'ملاحظات',en:'Notes / Remarks',es:'Notas / Observaciones',pt:'Notas / Observações',tr:'Notlar'})} icon={AlignLeft} />
                                                    <Toggle k="showSignatureZone" label={tx(lang,{fr:'Signatures',ar:'التوقيعات',en:'Signatures',es:'Firmas',pt:'Assinaturas',tr:'İmzalar'})} icon={FileSignature} />
                                                    <Toggle k="showPiedDePage" label={tx(lang,{fr:'Pied de Page',ar:'تذييل الصفحة',en:'Footer',es:'Pie de Página',pt:'Rodapé',tr:'Alt Bilgi'})} icon={AlignLeft} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ══ RIGHT SIDE: Live Preview (always visible) ══ */}
                        <div className="w-[340px] shrink-0 bg-gradient-to-b from-slate-100/80 to-slate-50 border-l border-slate-200 dark:border-dk-border/60 p-4 flex flex-col">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black text-slate-500 dark:text-dk-muted uppercase tracking-widest">{tx(lang,{fr:'Prototype',ar:'نموذج أولي',en:'Prototype',es:'Prototipo',pt:'Protótipo',tr:'Prototip'})}</span>
                                <span className="text-[9px] font-bold text-slate-300 dark:text-dk-muted bg-white dark:bg-dk-surface px-2 py-0.5 rounded-full border border-slate-100 dark:border-dk-border/60">{tx(lang,{fr:'En direct',ar:'مباشر',en:'Live',es:'En vivo',pt:'Ao vivo',tr:'Canlı'})} ✨</span>
                            </div>
                            <div className="flex-1 relative">
                                <div className="absolute inset-0 bg-gradient-to-b from-slate-200/50 to-slate-300/30 rounded-xl blur-lg scale-95" />
                                <div className="relative h-full overflow-y-auto">
                                    <LivePreview />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─ FOOTER ─ */}
                    <div className="px-7 py-3.5 bg-gradient-to-t from-slate-50/90 to-white/80 border-t border-slate-100 dark:border-dk-border/80 flex items-center justify-between shrink-0">
                        <div className="text-xs text-slate-400 dark:text-dk-muted font-medium">
                            {!s.raisonSociale ? (
                                <span className="flex items-center gap-1.5 text-amber-500 dark:text-amber-300"><AlertTriangle className="w-3.5 h-3.5" /> {tx(lang,{fr:'Raison sociale requise',ar:'الاسم التجاري مطلوب',en:'Company name required',es:'Razón social requerida',pt:'Razão social obrigatória',tr:'Şirket adı gerekli'})}</span>
                            ) : (
                                <span className="flex items-center gap-1.5 text-emerald-500 dark:text-emerald-300"><CheckCircle className="w-3.5 h-3.5" /> {tx(lang,{fr:'Modèle prêt',ar:'النموذج جاهز',en:'Template ready',es:'Plantilla lista',pt:'Modelo pronto',tr:'Şablon hazır'})}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={handleClose} className="px-5 py-2 font-bold text-slate-500 dark:text-dk-muted hover:text-slate-700 hover:bg-slate-100 rounded-xl text-sm transition-all duration-200">
                                {tx(lang,{fr:'Annuler',ar:'إلغاء',en:'Cancel',es:'Cancelar',pt:'Cancelar',tr:'İptal'})}
                            </button>
                            <button
                                onClick={handleSave}
                                className={`px-6 py-2 font-black text-white bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:via-orange-600 hover:to-amber-700 rounded-xl text-sm flex gap-2 items-center shadow-lg dark:shadow-dk-lg shadow-amber-200/40 transition-all duration-200 hover:scale-[1.02] active:scale-95 ${saveFlash ? 'inv-save-flash' : ''}`}
                            >
                                <Save className="w-4 h-4" /> {tx(lang,{fr:'Sauvegarder',ar:'حفظ',en:'Save',es:'Guardar',pt:'Salvar',tr:'Kaydet'})}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}


// ══════════════════════════════════════════════════════════════════════════════
//  INVOICE / BON DE LIVRAISON PRINTER
// ══════════════════════════════════════════════════════════════════════════════
function InvoicePrinter({ mvt, product, template, onClose, t, lang }: { mvt: MouvementStock; product?: MagasinProduct; template: InvoiceTemplate; onClose: () => void; t: (s: string) => string; lang: Lang }) {
    const isSortie = mvt.type === 'sortie' || mvt.type === 'rebut' || mvt.type === 'reservation';
    const docTitle = isSortie ? t('BON DE LIVRAISON') : t('BON DE RÉCEPTION');
    const docNum = (mvt as any).documentRef || `${isSortie ? 'BL' : 'BR'}-${new Date(mvt.date).getFullYear()}-${mvt.id.substring(0, 6).toUpperCase()}`;
    const prixU = mvt.prixUnitaire || product?.cump || product?.prixUnitaire || 0;
    const totalHT = prixU * mvt.quantite;

    // Helper for RTL alignment classes
    const alignR = lang === 'ar' ? 'text-left' : 'text-right';
    const alignL = lang === 'ar' ? 'text-right' : 'text-left';
    const flexE = lang === 'ar' ? 'justify-start' : 'justify-end';

    return (
        <div className="fixed inset-0 bg-slate-100 dark:bg-dk-elevated/60 z-[200] overflow-y-auto">
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page { size: A4; margin: 15mm 15mm 15mm 15mm; }
                    body > * { display: none !important; }
                    .bl-print-root { display: block !important; position: fixed; inset: 0; overflow: visible; background: white; }
                    .bl-no-print { display: none !important; }
                    .bl-sheet { box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
                }
            ` }} />

            {/* Toolbar */}
            <div className="bl-no-print sticky top-0 z-50 bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm">
                <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="flex items-center gap-2 px-4 py-2 text-slate-600 dark:text-dk-text-soft hover:bg-slate-100 rounded-xl font-bold text-sm transition-colors">
                            <ArrowLeft className="w-4 h-4" /> {tx(lang,{fr:'Retour',ar:'رجوع',en:'Back',es:'Volver',pt:'Voltar',tr:'Geri'})}
                        </button>
                        <div className="h-6 w-px bg-slate-200 dark:bg-dk-border" />
                        <div>
                            <h2 className="font-black text-slate-800 dark:text-dk-text text-sm">{docTitle} — {docNum}</h2>
                            <p className="text-xs text-slate-400 dark:text-dk-muted font-bold">{product?.designation} · {new Date(mvt.date).toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 hover:bg-indigo-700 dark:hover:bg-dk-accent-hover text-white font-black rounded-xl text-sm shadow-lg dark:shadow-dk-lg shadow-indigo-200 dark:shadow-indigo-900/30 transition-all active:scale-95"
                    >
                        <Printer className="w-4 h-4" /> {tx(lang,{fr:'Imprimer',ar:'طباعة',en:'Print',es:'Imprimir',pt:'Imprimir',tr:'Yazdır'})}
                    </button>
                </div>
            </div>

            {/* A4 Sheet */}
            <div className="bl-print-root py-8">
                <div className="bl-sheet bg-white dark:bg-dk-surface max-w-4xl mx-auto shadow-2xl dark:shadow-dk-elevated rounded-2xl overflow-hidden" style={{ minHeight: '297mm' }}>
                    <div className="p-12">

                        {/* === HEADER === */}
                        <div className="flex justify-between items-start pb-8 mb-8 border-b-4 border-indigo-600 dark:border-indigo-800">
                            {/* Company Info */}
                            <div className="max-w-xs">
                                {template.showLogo && template.logo && (
                                    <img src={template.logo} className="h-16 mb-4 object-contain" alt="logo" />
                                )}
                                <h1 className="text-2xl font-black text-slate-900 dark:text-dk-text tracking-tight leading-tight">{template.raisonSociale}</h1>
                                <div className="mt-3 space-y-1">
                                    {template.showAdresse   && <p className="text-xs text-slate-500 dark:text-dk-muted font-medium">{template.adresse}</p>}
                                    {template.showTelephone && template.telephone && <p className="text-xs text-slate-500 dark:text-dk-muted">📞 {template.telephone}</p>}
                                    {template.showEmail     && template.email     && <p className="text-xs text-slate-500 dark:text-dk-muted">✉ {template.email}</p>}
                                </div>
                                {(template.showICE || template.showRC || template.showIF) && (
                                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-dk-border/60 space-y-1">
                                        {template.showICE && template.ice       && <p className="text-[10px] text-slate-400 dark:text-dk-muted font-mono">ICE: {template.ice}</p>}
                                        {template.showRC  && template.rc        && <p className="text-[10px] text-slate-400 dark:text-dk-muted font-mono">RC: {template.rc}</p>}
                                        {template.showIF  && template.if_number && <p className="text-[10px] text-slate-400 dark:text-dk-muted font-mono">IF: {template.if_number}</p>}
                                    </div>
                                )}
                            </div>

                            {/* Document Title Block */}
                            <div className={lang === 'ar' ? "text-left" : "text-right"}>
                                <div className="inline-block bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white px-6 py-3 rounded-2xl mb-4">
                                    <h2 className="text-xl font-black tracking-wider">{docTitle}</h2>
                                </div>
                                <div className="space-y-2">
                                    {template.showDocumentNumber && (
                                        <div className={`flex ${flexE} gap-3 items-center`}>
                                            <span className="text-xs text-slate-400 dark:text-dk-muted font-bold uppercase">{t('N° DOCUMENT')}</span>
                                            <span className="font-black text-slate-800 dark:text-dk-text font-mono text-sm bg-slate-100 dark:bg-dk-elevated/60 px-3 py-1 rounded-lg" dir="ltr">{docNum}</span>
                                        </div>
                                    )}
                                    {template.showDateDocument && (
                                        <div className={`flex ${flexE} gap-3 items-center`}>
                                            <span className="text-xs text-slate-400 dark:text-dk-muted font-bold uppercase">{t('DATE')}</span>
                                            <span className="font-bold text-slate-700 dark:text-dk-text text-sm" dir="ltr">{new Date(mvt.date).toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                                        </div>
                                    )}
                                    {template.showTypeOperation && (
                                        <div className={`flex ${flexE} gap-3 items-center`}>
                                            <span className="text-xs text-slate-400 dark:text-dk-muted font-bold uppercase">{t('TYPE')}</span>
                                            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${isSortie ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'}`}>{t(mvt.type)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* === PARTIES === */}
                        {template.showPartiesSection && (
                            <div className="grid grid-cols-2 gap-6 mb-8 mt-4">
                                <div className="border border-slate-200 dark:border-dk-border rounded-xl p-5 bg-slate-50 dark:bg-dk-bg relative">
                                    <span className={`absolute -top-2.5 ${lang==='ar'? 'right-4' : 'left-4'} bg-slate-50 dark:bg-dk-bg px-2 text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest`}>{t('ÉMETTEUR (Magasin)')}</span>
                                    <p className="font-black text-slate-800 dark:text-dk-text">{template.raisonSociale}</p>
                                    {template.showAdresse && <p className="text-xs text-slate-500 dark:text-dk-muted mt-1">{template.adresse}</p>}
                                </div>
                                <div className="border border-slate-200 dark:border-dk-border rounded-xl p-5 bg-slate-50 dark:bg-dk-bg relative">
                                    <span className={`absolute -top-2.5 ${lang==='ar'? 'right-4' : 'left-4'} bg-slate-50 dark:bg-dk-bg px-2 text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest`}>{isSortie ? t('DESTINATAIRE') : t('FOURNISSEUR')}</span>
                                    <p className="font-black text-slate-800 dark:text-dk-text">
                                        {isSortie ? (mvt.chaineId || t('Atelier / Production')) : (mvt.fournisseurId || '—')}
                                    </p>
                                    {mvt.modeleRef    && <p className="text-xs text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300 font-bold mt-1">{t('Réf. OF :')} {mvt.modeleRef}</p>}
                                    {mvt.operateurNom && <p className="text-xs text-slate-500 dark:text-dk-muted mt-1">{t('Responsable :')} {mvt.operateurNom}</p>}
                                </div>
                            </div>
                        )}

                        {/* === TABLE === */}
                        {(() => {
                            // compute visible column count for colSpan
                            const cols = [true, true, true, true, template.showReferenceColumn, template.showPrixColumn, template.showTotalColumn].filter(Boolean).length;
                            const totalCols = 4 + (template.showReferenceColumn ? 1 : 0) + (template.showPrixColumn ? 1 : 0) + (template.showTotalColumn ? 1 : 0);
                            return (
                                <table className="w-full border-collapse mb-8" style={{ borderSpacing: 0 }}>
                                    <thead>
                                        <tr className="bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white">
                                            {template.showReferenceColumn && <th className={`p-4 ${alignL} font-black text-xs uppercase tracking-wider ${lang==='ar'?'rounded-tr-xl':'rounded-tl-xl'}`}>{t('Référence')}</th>}
                                            <th className={`p-4 ${alignL} font-black text-xs uppercase tracking-wider ${!template.showReferenceColumn ? (lang==='ar'?'rounded-tr-xl':'rounded-tl-xl') : ''}`}>{t('Désignation')}</th>
                                            <th className="p-4 text-center font-black text-xs uppercase tracking-wider">{t('Unité')}</th>
                                            <th className={`p-4 ${alignR} font-black text-xs uppercase tracking-wider`}>{t('Quantité')}</th>
                                            {template.showPrixColumn  && <th className={`p-4 ${alignR} font-black text-xs uppercase tracking-wider`}>{t('Prix Unitaire')}</th>}
                                            {template.showTotalColumn && <th className={`p-4 ${alignR} font-black text-xs uppercase tracking-wider ${lang==='ar'?'rounded-tl-xl':'rounded-tr-xl'} ${!template.showPrixColumn ? (lang==='ar'?'rounded-tl-xl':'rounded-tr-xl') : ''}`}>{t('Total HT')}</th>}
                                            {!template.showTotalColumn && !template.showPrixColumn && <th className={`p-4 ${lang==='ar'?'rounded-tl-xl':'rounded-tr-xl'}`} />}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-b-2 border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface">
                                            {template.showReferenceColumn && <td className={`p-4 font-mono text-sm font-bold text-slate-600 dark:text-dk-text-soft ${alignL}`}>{product?.reference || '—'}</td>}
                                            <td className={`p-4 ${alignL}`}>
                                                <div className="font-black text-slate-800 dark:text-dk-text">{product?.designation || t('Article')}</div>
                                                {(mvt.bain || mvt.notes) && (
                                                    <div className="text-xs text-slate-400 dark:text-dk-muted mt-1 space-y-0.5">
                                                        {mvt.bain  && <span className={`inline-block bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300 px-2 py-0.5 rounded ${lang==='ar'?'ml-2':'mr-2'} font-bold`}>{t('Bain:')} {mvt.bain}</span>}
                                                        {mvt.notes && <span className="italic">{mvt.notes}</span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 text-center text-slate-600 dark:text-dk-text-soft font-bold">{product?.unite || '—'}</td>
                                            <td className={`p-4 ${alignR} font-black text-slate-800 dark:text-dk-text text-lg`}>{mvt.quantite}</td>
                                            {template.showPrixColumn && (
                                                <td className={`p-4 ${alignR} text-slate-600 dark:text-dk-text-soft font-bold`} dir="ltr">
                                                    {prixU > 0 ? `${prixU.toFixed(2)} DH` : <span className="text-slate-300 dark:text-dk-muted text-xs">N/A</span>}
                                                </td>
                                            )}
                                            {template.showTotalColumn && (
                                                <td className={`p-4 ${alignR} font-black text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300 text-lg`} dir="ltr">
                                                    {totalHT > 0 ? `${totalHT.toFixed(2)} DH` : <span className="text-slate-300 dark:text-dk-muted text-xs">N/A</span>}
                                                </td>
                                            )}
                                        </tr>
                                        {template.showFillerRows && [1, 2].map(i => (
                                            <tr key={i} className="border-b border-slate-100 dark:border-dk-border/60">
                                                {template.showReferenceColumn && <td className="p-4 text-slate-200 dark:text-dk-muted text-xs">—</td>}
                                                <td className="p-4" /><td className="p-4" /><td className="p-4" />
                                                {template.showPrixColumn  && <td className="p-4" />}
                                                {template.showTotalColumn && <td className="p-4" />}
                                            </tr>
                                        ))}
                                    </tbody>
                                    {template.showTotalColumn && (
                                        <tfoot>
                                            <tr className="bg-slate-50 dark:bg-dk-bg">
                                                <td colSpan={totalCols - 2} className="p-4" />
                                                <td className="p-4 text-right text-xs font-black text-slate-500 dark:text-dk-muted uppercase">Total HT</td>
                                                <td className="p-4 text-right font-black text-slate-800 dark:text-dk-text text-xl border-t-2 border-indigo-600 dark:border-indigo-800">
                                                    {totalHT > 0 ? `${totalHT.toFixed(2)} DH` : '—'}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            );
                        })()}

                        {/* === NOTES === */}
                        {template.showNotesSection && mvt.notes && (
                            <div className="mb-8 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl">
                                <p className="text-xs font-black text-amber-600 dark:text-amber-400 dark:text-amber-300 uppercase tracking-wide mb-1">{tx(lang,{fr:'Notes / Observations',ar:'ملاحظات',en:'Notes / Remarks',es:'Notas / Observaciones',pt:'Notas / Observações',tr:'Notlar'})}</p>
                                <p className="text-sm text-amber-800 dark:text-amber-200 italic">{mvt.notes}</p>
                            </div>
                        )}

                        {/* === SIGNATURES === */}
                        {template.showSignatureZone && (
                            <div className="grid grid-cols-2 gap-10 mt-12">
                                <div className="border-2 border-dashed border-slate-200 dark:border-dk-border rounded-2xl p-6 h-36 relative bg-slate-50 dark:bg-dk-bg/50">
                                    <span className="absolute -top-3 left-6 bg-white dark:bg-dk-surface px-3 text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest">{tx(lang,{fr:'Signature & Cachet Magasin',ar:'التوقيع وختم المستودع',en:'Signature & Warehouse Stamp',es:'Firma y Sello Almacén',pt:'Assinatura e Carimbo do Armazém',tr:'İmza ve Depo Mührü'})}</span>
                                    <div className="text-center text-slate-300 dark:text-dk-muted text-xs mt-6 font-bold">{tx(lang,{fr:'Nom & Signature :',ar:'الاسم والتوقيع :',en:'Name & Signature :',es:'Nombre y Firma :',pt:'Nome e Assinatura :',tr:'Ad ve İmza :'})}</div>
                                </div>
                                <div className="border-2 border-dashed border-slate-200 dark:border-dk-border rounded-2xl p-6 h-36 relative bg-slate-50 dark:bg-dk-bg/50">
                                    <span className="absolute -top-3 left-6 bg-white dark:bg-dk-surface px-3 text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest">{tx(lang,{fr:'Signature',ar:'التوقيع',en:'Signature',es:'Firma',pt:'Assinatura',tr:'İmza'})} {tx(lang,isSortie ? {fr:'Réceptionnaire',ar:'المستلم',en:'Receiver',es:'Receptor',pt:'Recebedor',tr:'Alıcı'} : {fr:'Livreur',ar:'المسلم',en:'Deliverer',es:'Repartidor',pt:'Entregador',tr:'Teslim Eden'})}</span>
                                    <div className="text-center text-slate-300 dark:text-dk-muted text-xs mt-6 font-bold">{tx(lang,{fr:'Nom & Signature :',ar:'الاسم والتوقيع :',en:'Name & Signature :',es:'Nombre y Firma :',pt:'Nome e Assinatura :',tr:'Ad ve İmza :'})}</div>
                                </div>
                            </div>
                        )}

                        {/* === FOOTER === */}
                        {template.showPiedDePage && (
                            <div className="mt-10 pt-6 border-t border-slate-200 dark:border-dk-border text-center">
                                <p className="text-xs text-slate-400 dark:text-dk-muted font-medium leading-relaxed">{template.piedDePage}</p>
                                <p className="text-[9px] text-slate-300 dark:text-dk-muted mt-2 font-mono">{tx(lang,{fr:'Généré le',ar:'تم الإنشاء في',en:'Generated on',es:'Generado el',pt:'Gerado em',tr:'Oluşturulma'})} {new Date().toLocaleString('fr-MA')} · BERAMETHODE {tx(lang,{fr:'Magasin',ar:'المستودع',en:'Warehouse',es:'Almacén',pt:'Armazém',tr:'Depo'})}</p>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}

const DICT: Record<string, { ar: string, en: string, es?: string, pt?: string, tr?: string }> = {
    'Tableau de Bord': { ar: 'لوحة القيادة', en: 'Dashboard', es: 'Panel de Control', pt: 'Painel de Controle', tr: 'Gösterge Paneli' },
    'Base Produits': { ar: 'قاعدة المنتجات', en: 'Product Base', es: 'Base de Productos', pt: 'Base de Produtos', tr: 'Ürün Tabanı' },
    'Bureau Magasin': { ar: 'مكتب المستودع', en: 'Warehouse Desk', es: 'Mesa de Almacén', pt: 'Mesa de Armazém', tr: 'Depo Masası' },
    'Inventaire Tournant': { ar: 'الجرد الدوري', en: 'Cyclic Inventory', es: 'Inventario Cíclico', pt: 'Inventário Cíclico', tr: 'Döngüsel Envanter' },
    'Plan WMS': { ar: 'خريطة المستودع', en: 'WMS Map', es: 'Mapa WMS', pt: 'Mapa WMS', tr: 'WMS Haritası' },
    'Radar Fournisseurs': { ar: 'رادار الموردين', en: 'Supplier Radar', es: 'Radar de Proveedores', pt: 'Radar de Fornecedores', tr: 'Tedarikçi Radarı' },
    'Bons de Commande': { ar: 'أوامر الشراء', en: 'Purchase Orders', es: 'Órdenes de Compra', pt: 'Pedidos de Compra', tr: 'Satın Alma Siparişleri' },
    'Demandes Atelier': { ar: 'طلبات الورشة', en: 'Workshop Requests', es: 'Solicitudes de Taller', pt: 'Pedidos da Oficina', tr: 'Atölye Talepleri' },
    'Alertes & Ruptures': { ar: 'تنبيهات ونواقص', en: 'Alerts & Shortages', es: 'Alertas y Faltantes', pt: 'Alertas e Rupturas', tr: 'Uyarılar ve Eksiklikler' },
    'S. Valorisation (Déchets)': { ar: 'تثمين النفايات', en: 'Waste Valuation', es: 'Valorización (Residuos)', pt: 'Valorização (Resíduos)', tr: 'Atık Değerlendirme' },
    'Traçabilité': { ar: 'التسلسل والتتبع', en: 'Traceability', es: 'Trazabilidad', pt: 'Rastreabilidade', tr: 'İzlenebilirlik' },
    'Stock • Traçabilité • Emplacements': { ar: 'مخزون • تتبع • مواقع', en: 'Stock • Traceability • Locations', es: 'Stock • Trazabilidad • Ubicaciones', pt: 'Estoque • Rastreabilidade • Locais', tr: 'Stok • İzlenebilirlik • Konumlar' },
    'Valeur': { ar: 'القيمة', en: 'Value', es: 'Valor', pt: 'Valor', tr: 'Değer' },
    'Urgences': { ar: 'عاجل', en: 'Emergencies', es: 'Urgencias', pt: 'Urgências', tr: 'Acil Durumlar' },
    'Total Références': { ar: 'إجمالي المراجع', en: 'Total References', es: 'Total Referencias', pt: 'Total de Referências', tr: 'Toplam Referans' },
    'Valeur Globale (CUMP)': { ar: 'القيمة الإجمالية', en: 'Global Value (WAC)', es: 'Valor Global (CUMP)', pt: 'Valor Global (CUMP)', tr: 'Toplam Değer (CUMP)' },
    'Alerte Rupture': { ar: 'تنبيه النقص', en: 'Shortage Alert', es: 'Alerta de Faltante', pt: 'Alerta de Ruptura', tr: 'Eksiklik Uyarısı' },
    'Mouvements (7j)': { ar: 'حركات (7 أيام)', en: 'Movements (7d)', es: 'Movimientos (7d)', pt: 'Movimentos (7d)', tr: 'Hareketler (7g)' },
    'Stock Dormant': { ar: 'مخزون راكد', en: 'Dormant Stock', es: 'Stock Inmovilizado', pt: 'Estoque Parado', tr: 'Atıl Stok' },
    'Articles > 90 Jours': { ar: 'عناصر > 90 يوم', en: 'Items > 90 Days', es: 'Artículos > 90 Días', pt: 'Itens > 90 Dias', tr: 'Ürünler > 90 Gün' },
    'Unités immobiles': { ar: 'وحدات غير متحركة', en: 'Immobile Units', es: 'Unidades Inmóviles', pt: 'Unidades Imóveis', tr: 'Hareketsiz Birimler' },
    'Valeur Gelée': { ar: 'القيمة المجمدة', en: 'Frozen Value', es: 'Valor Congelado', pt: 'Valor Congelado', tr: 'Donmuş Değer' },
    'Anticipation Production': { ar: 'توقع الإنتاج', en: 'Production Anticipation', es: 'Anticipación de Producción', pt: 'Antecipação da Produção', tr: 'Üretim Öngörüsü' },
    'Préparation des Modèles Imminents': { ar: 'تحضير النماذج الوشيكة', en: 'Preparation of Imminent Models', es: 'Preparación de Modelos Inminentes', pt: 'Preparação de Modelos Iminentes', tr: 'Yaklaşan Modellerin Hazırlığı' },
    'Besoins / Fournitures': { ar: 'الإحتياجات / اللوازم', en: 'Needs / Supplies', es: 'Necesidades / Suministros', pt: 'Necessidades / Insumos', tr: 'İhtiyaçlar / Malzemeler' },
    'Tissu requis': { ar: 'القماش المطلوب', en: 'Required Fabric', es: 'Tela Requerida', pt: 'Tecido Necessário', tr: 'Gerekli Kumaş' },
    'Accessoires': { ar: 'الإكسسوارات', en: 'Accessories', es: 'Accesorios', pt: 'Acessórios', tr: 'Aksesuarlar' },
    'Approvisionnements en Transit': { ar: 'تزويدات قيد النقل', en: 'Supplies in Transit', es: 'Suministros en Tránsito', pt: 'Suprimentos em Trânsito', tr: 'Yoldaki Tedarikler' },
    'Derniers Mouvements': { ar: 'أحدث الحركات', en: 'Latest Movements', es: 'Últimos Movimientos', pt: 'Últimos Movimentos', tr: 'Son Hareketler' },
    'Voir tout': { ar: 'عرض الكل', en: 'See all', es: 'Ver todo', pt: 'Ver tudo', tr: 'Tümünü gör' },
    'Cliquez sur une ligne pour voir le produit, le stock et son historique complet.': { ar: 'انقر على سطر لعرض المنتج والمخزون وسجل الحركة الكامل.', en: 'Click a row to view the product, stock and full history.', es: 'Haga clic en una fila para ver el producto, el stock y su historial completo.', pt: 'Clique numa linha para ver o produto, o estoque e o histórico completo.', tr: 'Ürünü, stoğu ve tam geçmişi görmek için bir satıra tıklayın.' },
    'Photo': { ar: 'الصورة', en: 'Photo', es: 'Foto', pt: 'Foto', tr: 'Fotoğraf' },
    'Stock': { ar: 'المخزون', en: 'Stock', es: 'Stock', pt: 'Estoque', tr: 'Stok' },
    'Stock actuel': { ar: 'المخزون الحالي', en: 'Current stock', es: 'Stock actual', pt: 'Estoque atual', tr: 'Mevcut stok' },
    'Détails de l\'activité': { ar: 'تفاصيل الحركة', en: 'Activity details', es: 'Detalles de la actividad', pt: 'Detalhes da atividade', tr: 'Etkinlik ayrıntıları' },
    'Modifier la ligne et enregistrer pour ajuster le registre de mouvement.': { ar: 'عدّل السطر واحفظ لتحديث سجل الحركة.', en: 'Edit the row and save to update the movement register.', es: 'Edite la fila y guarde para ajustar el registro de movimientos.', pt: 'Edite a linha e salve para ajustar o registro de movimentos.', tr: 'Hareket kaydını güncellemek için satırı düzenleyip kaydedin.' },
    'Type de mouvement': { ar: 'نوع الحركة', en: 'Movement type', es: 'Tipo de movimiento', pt: 'Tipo de movimento', tr: 'Hareket türü' },
    'Produit lié': { ar: 'المنتج المرتبط', en: 'Linked product', es: 'Producto vinculado', pt: 'Produto vinculado', tr: 'Bağlı ürün' },
    'Date / Heure': { ar: 'التاريخ / الوقت', en: 'Date / Time', es: 'Fecha / Hora', pt: 'Data / Hora', tr: 'Tarih / Saat' },
    'Fournisseur': { ar: 'المورد', en: 'Supplier', es: 'Proveedor', pt: 'Fornecedor', tr: 'Tedarikçi' },
    'Chaîne': { ar: 'السلسلة', en: 'Chain', es: 'Cadena', pt: 'Cadeia', tr: 'Hat' },
    'Référence OF': { ar: 'مرجع أمر الإنتاج', en: 'OF reference', es: 'Referencia OF', pt: 'Referência OF', tr: 'OF referansı' },
    'Notes': { ar: 'ملاحظات', en: 'Notes', es: 'Notas', pt: 'Notas', tr: 'Notlar' },
    'Document / Pièce jointe': { ar: 'وثيقة / مرفق', en: 'Document / Attachment', es: 'Documento / Adjunto', pt: 'Documento / Anexo', tr: 'Belge / Ek' },
    'Supprimer': { ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Excluir', tr: 'Sil' },
    'Annuler': { ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' },
    'Enregistrer': { ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Salvar', tr: 'Kaydet' },
    'Voir produit': { ar: 'عرض المنتج', en: 'View product', es: 'Ver producto', pt: 'Ver produto', tr: 'Ürünü gör' },
    'Produit': { ar: 'المنتج', en: 'Product', es: 'Producto', pt: 'Produto', tr: 'Ürün' },
    'Quantité': { ar: 'الكمية', en: 'Quantity', es: 'Cantidad', pt: 'Quantidade', tr: 'Miktar' },
    'Aucune commande en cours d\'acheminement.': { ar: 'لا توجد طلبات قيد النقل.', en: 'No orders in transit.', es: 'Ningún pedido en tránsito.', pt: 'Nenhum pedido em trânsito.', tr: 'Yolda sipariş yok.' },
    'Chez': { ar: 'عند', en: 'At', es: 'En', pt: 'Em', tr: 'Şurada' },
    'Type': { ar: 'النوع', en: 'Type', es: 'Tipo', pt: 'Tipo', tr: 'Tür' },

    'articles': { ar: 'مواد', en: 'items', es: 'artículos', pt: 'itens', tr: 'ürün' },
    'Livraison prévue :': { ar: 'التسليم المتوقع :', en: 'Expected delivery :', es: 'Entrega prevista :', pt: 'Entrega prevista :', tr: 'Beklenen teslimat :' },
    'Aucun mouvement enregistré.': { ar: 'لم يتم تسجيل أي حركة.', en: 'No movement recorded.', es: 'Ningún movimiento registrado.', pt: 'Nenhum movimento registrado.', tr: 'Kayıtlı hareket yok.' },
    'Inconnu': { ar: 'غير معروف', en: 'Unknown', es: 'Desconocido', pt: 'Desconhecido', tr: 'Bilinmeyen' },
    'Demandes d\'Approvisionnement (Atelier)': { ar: 'طلبات التوريد (الورشة)', en: 'Supply Requests (Workshop)', es: 'Solicitudes de Suministro (Taller)', pt: 'Pedidos de Suprimento (Oficina)', tr: 'Tedarik Talepleri (Atölye)' },
    'Créer Demande Test': { ar: 'إنشاء طلب تجريبي', en: 'Create Test Request', es: 'Crear Solicitud de Prueba', pt: 'Criar Pedido de Teste', tr: 'Test Talebi Oluştur' },
    'Aucune demande en attente.': { ar: 'لا توجد طلبات في الانتظار.', en: 'No pending requests.', es: 'Ninguna solicitud pendiente.', pt: 'Nenhum pedido pendente.', tr: 'Bekleyen talep yok.' },
    'Demande du': { ar: 'طلب بتاريخ', en: 'Request from', es: 'Solicitud del', pt: 'Pedido de', tr: 'Talep tarihi' },
    'Produit Inconnu': { ar: 'منتج غير معروف', en: 'Unknown Product', es: 'Producto Desconocido', pt: 'Produto Desconhecido', tr: 'Bilinmeyen Ürün' },
    'Pour Ordre de Fab:': { ar: 'لأمر التصنيع:', en: 'For Mfg Order:', es: 'Para Orden de Fab:', pt: 'Para Ordem de Fab:', tr: 'Üretim Emri için:' },
    'Demandé': { ar: 'مطلوب', en: 'Requested', es: 'Solicitado', pt: 'Solicitado', tr: 'Talep edilen' },
    'En Stock': { ar: 'في المخزون', en: 'In Stock', es: 'En Stock', pt: 'Em Estoque', tr: 'Stokta' },
    'Stock insuffisant ! Veuillez approvisionner.': { ar: 'المخزون غير كافٍ! يرجى التوريد.', en: 'Insufficient stock! Please supply.', es: '¡Stock insuficiente! Por favor reabastezca.', pt: 'Estoque insuficiente! Favor abastecer.', tr: 'Yetersiz stok! Lütfen tedarik edin.' },
    'Préparer': { ar: 'تحضير', en: 'Prepare', es: 'Preparar', pt: 'Preparar', tr: 'Hazırla' },
    'Refuser': { ar: 'رفض', en: 'Reject', es: 'Rechazar', pt: 'Recusar', tr: 'Reddet' },
    'Rechercher (Nom, Réf, Emplacement)...': { ar: 'بحث (اسم، مرجع، موقع)...', en: 'Search (Name, Ref, Location)...', es: 'Buscar (Nombre, Ref, Ubicación)...', pt: 'Pesquisar (Nome, Ref, Local)...', tr: 'Ara (Ad, Ref, Konum)...' },
    'Catégories': { ar: 'الفئات', en: 'Categories', es: 'Categorías', pt: 'Categorias', tr: 'Kategoriler' },
    'CSV': { ar: 'CSV', en: 'CSV', es: 'CSV', pt: 'CSV', tr: 'CSV' },
    'Ajouter': { ar: 'إضافة', en: 'Add', es: 'Agregar', pt: 'Adicionar', tr: 'Ekle' },
    'Bains Disponibles': { ar: 'دفعات الصباغة المتاحة', en: 'Available Dye Lots', es: 'Baños Disponibles', pt: 'Banhos Disponíveis', tr: 'Mevcut Boya Partileri' },
    'Stock Réel': { ar: 'المخزون الفعلي', en: 'Actual Stock', es: 'Stock Real', pt: 'Estoque Real', tr: 'Gerçek Stok' },
    // Type terms
    'tissu': { ar: 'قماش', en: 'fabric', es: 'tela', pt: 'tecido', tr: 'kumaş' },
    'fil': { ar: 'خيط', en: 'yarn', es: 'hilo', pt: 'fio', tr: 'iplik' },
    'bouton': { ar: 'زر', en: 'button', es: 'botón', pt: 'botão', tr: 'düğme' },
    'fermeture': { ar: 'سحاب', en: 'zipper', es: 'cremallera', pt: 'zíper', tr: 'fermuar' },
    'etiquette': { ar: 'ملصق', en: 'label', es: 'etiqueta', pt: 'etiqueta', tr: 'etiket' },
    'emballage': { ar: 'تغليف', en: 'packaging', es: 'embalaje', pt: 'embalagem', tr: 'ambalaj' },
    'autre': { ar: 'أخرى', en: 'other', es: 'otro', pt: 'outro', tr: 'diğer' },
    'entree': { ar: 'إدخال', en: 'entry', es: 'entrada', pt: 'entrada', tr: 'giriş' },
    'sortie': { ar: 'إخراج', en: 'exit', es: 'salida', pt: 'saída', tr: 'çıkış' },
    'regularisation': { ar: 'تسوية', en: 'adjustment', es: 'regularización', pt: 'regularização', tr: 'düzeltme' },
    'retour_atelier': { ar: 'إرجاع للورشة', en: 'return workshop', es: 'devolución taller', pt: 'retorno oficina', tr: 'atölye iadesi' },
    'rebut': { ar: 'إتلاف', en: 'scrap', es: 'desecho', pt: 'descarte', tr: 'hurda' },
    'reservation': { ar: 'حجز', en: 'reservation', es: 'reserva', pt: 'reserva', tr: 'rezervasyon' },
    // Status terms
    'brouillon': { ar: 'مسودة', en: 'draft', es: 'borrador', pt: 'rascunho', tr: 'taslak' },
    'envoye': { ar: 'مُرسلة', en: 'sent', es: 'enviado', pt: 'enviado', tr: 'gönderildi' },
    'valide': { ar: 'مُعتمدة', en: 'validated', es: 'validado', pt: 'validado', tr: 'onaylandı' },
    'livre': { ar: 'مُسلمة', en: 'delivered', es: 'entregado', pt: 'entregue', tr: 'teslim edildi' },
    'attente': { ar: 'انتظار', en: 'wait', es: 'en espera', pt: 'em espera', tr: 'beklemede' },
    'preparee': { ar: 'مُجهزة', en: 'prepared', es: 'preparado', pt: 'preparado', tr: 'hazırlandı' },
    'rejetee': { ar: 'مرفوضة', en: 'rejected', es: 'rechazado', pt: 'recusado', tr: 'reddedildi' },
    'Entrée': { ar: 'دخول', en: 'Entry', es: 'Entrada', pt: 'Entrada', tr: 'Giriş' },
    'Sortie': { ar: 'خروج', en: 'Exit', es: 'Salida', pt: 'Saída', tr: 'Çıkış' },
    'Inventaire': { ar: 'جرد', en: 'Inventory', es: 'Inventario', pt: 'Inventário', tr: 'Envanter' },
    'Retour': { ar: 'إرجاع', en: 'Return', es: 'Devolución', pt: 'Retorno', tr: 'İade' },
    'Déchets': { ar: 'نفايات', en: 'Waste', es: 'Residuos', pt: 'Resíduos', tr: 'Atık' },
    'Réserver': { ar: 'حجز', en: 'Reserve', es: 'Reservar', pt: 'Reservar', tr: 'Rezerve et' },
    'Rechercher produit': { ar: 'البحث عن منتج', en: 'Search product', es: 'Buscar producto', pt: 'Pesquisar produto', tr: 'Ürün ara' },
    'Sélect...': { ar: 'اختر...', en: 'Select...', es: 'Selec...', pt: 'Selec...', tr: 'Seç...' },
    'En stock:': { ar: 'في المخزون:', en: 'In stock:', es: 'En stock:', pt: 'Em estoque:', tr: 'Stokta:' },
    'Flashez le code-barres...': { ar: 'امسح الرمز الشريطي...', en: 'Scan the barcode...', es: 'Escanee el código de barras...', pt: 'Escaneie o código de barras...', tr: 'Barkodu tarayın...' },
    'À prendre au :': { ar: 'يؤخذ من:', en: 'Take from:', es: 'Tomar en:', pt: 'Retirar em:', tr: 'Şuradan al:' },
    'Quantité Réelle Constatée': { ar: 'الكمية الفعلية', en: 'Actual Quantity', es: 'Cantidad Real Constatada', pt: 'Quantidade Real Constatada', tr: 'Tespit Edilen Gerçek Miktar' },
    'N° Bain/Lot (Teinture)': { ar: 'رقم الحمام/الصباغة', en: 'Dye Lot/Batch No.', es: 'N° Baño/Lote (Tintura)', pt: 'N° Banho/Lote (Tingimento)', tr: 'Boya Partisi/Lot No.' },
    'Prix Unitaire (CUMP)': { ar: 'سعر الوحدة', en: 'Unit Price', es: 'Precio Unitario (CUMP)', pt: 'Preço Unitário (CUMP)', tr: 'Birim Fiyat (CUMP)' },

    'Ordre de Fab. (OF)': { ar: 'أمر التصنيع', en: 'Mfg. Order', es: 'Orden de Fab. (OF)', pt: 'Ordem de Fab. (OF)', tr: 'Üretim Emri (OF)' },
    'FIFO (Premier entré)': { ar: 'الأول دخولاً', en: 'FIFO (First In)', es: 'FIFO (Primero en entrar)', pt: 'FIFO (Primeiro a entrar)', tr: 'FIFO (İlk Giren)' },
    'LIFO (Dernier entré)': { ar: 'الأخير دخولاً', en: 'LIFO (Last In)', es: 'LIFO (Último en entrar)', pt: 'LIFO (Último a entrar)', tr: 'LIFO (Son Giren)' },
    'Valider l\'Opération': { ar: 'تأكيد العملية', en: 'Validate Operation', es: 'Validar la Operación', pt: 'Validar a Operação', tr: 'İşlemi Onayla' },
    'Détail des Lots': { ar: 'تفاصيل الدفعات', en: 'Lot Details', es: 'Detalle de Lotes', pt: 'Detalhe dos Lotes', tr: 'Lot Detayları' },
    'Bain:': { ar: 'حمام:', en: 'Lot:', es: 'Baño:', pt: 'Banho:', tr: 'Parti:' },
    'Aucun lot disponible.': { ar: 'لا توجد دفعات متاحة.', en: 'No lots available.', es: 'Ningún lote disponible.', pt: 'Nenhum lote disponível.', tr: 'Mevcut lot yok.' },
    'Registre des Mouvements': { ar: 'سجل الحركات', en: 'Movement Register', es: 'Registro de Movimientos', pt: 'Registro de Movimentos', tr: 'Hareket Kaydı' },
    'Sélectionnez un type d\'opération': { ar: 'حدد نوع العملية', en: 'Select an operation', es: 'Seleccione un tipo de operación', pt: 'Selecione um tipo de operação', tr: 'Bir işlem türü seçin' },
    'Gérez vos réapprovisionnements fournisseurs': { ar: 'إدارة عمليات إعادة التوريد من الموردين', en: 'Manage your supplier replenishments', es: 'Gestione sus reaprovisionamientos de proveedores', pt: 'Gerencie seus reabastecimentos de fornecedores', tr: 'Tedarikçi yenilemelerinizi yönetin' },
    'Nouveau BC': { ar: 'أمر شراء جديد', en: 'New PO', es: 'Nuevo BC', pt: 'Novo BC', tr: 'Yeni BC' },
    'Aucun Bon de Commande': { ar: 'لا يوجد أوامر شراء', en: 'No Purchase Orders', es: 'Ninguna Orden de Compra', pt: 'Nenhum Pedido de Compra', tr: 'Satın Alma Siparişi Yok' },
    'Créez votre premier BC pour réapprovisionner votre stock.': { ar: 'قم بإنشاء أمر الشراء الأول لإعادة تزويد مخزونك.', en: 'Create your first PO to replenish your stock.', es: 'Cree su primer BC para reabastecer su stock.', pt: 'Crie seu primeiro BC para reabastecer seu estoque.', tr: 'Stoğunuzu yenilemek için ilk BC\'nizi oluşturun.' },
    'Date de création': { ar: 'تاريخ الإنشاء', en: 'Creation Date', es: 'Fecha de creación', pt: 'Data de criação', tr: 'Oluşturma Tarihi' },
    'Total estimé': { ar: 'الإجمالي المقدر', en: 'Estimated Total', es: 'Total estimado', pt: 'Total estimado', tr: 'Tahmini Toplam' },
    'article': { ar: 'مادة', en: 'item', es: 'artículo', pt: 'item', tr: 'ürün' },
    'dans ce bon': { ar: 'في هذا الأمر', en: 'in this PO', es: 'en este BC', pt: 'neste BC', tr: 'bu BC\'de' },
    'Éditer': { ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' },
    'Supprimer ce Bon ?': { ar: 'حذف هذا الأمر؟', en: 'Delete this PO?', es: '¿Eliminar este BC?', pt: 'Excluir este BC?', tr: 'Bu BC silinsin mi?' },
    'Vérifiez régulièrement l\'exactitude de votre stock sans bloquer l\'entrepôt en comptant une petite sélection d\'articles.': { ar: 'تحقق بانتظام من دقة مخزونك دون إيقاف المستودع عن طريق عد مجموعة صغيرة من المواد.', en: 'Regularly check your stock accuracy without blocking the warehouse by counting a small selection of items.', es: 'Verifique regularmente la exactitud de su stock sin bloquear el almacén contando una pequeña selección de artículos.', pt: 'Verifique regularmente a exatidão do seu estoque sem bloquear o armazém contando uma pequena seleção de itens.', tr: 'Az sayıda ürün sayarak depoyu durdurmadan stok doğruluğunuzu düzenli olarak kontrol edin.' },
    'Aucun produit dans la base.': { ar: 'لا يوجد منتج في القاعدة.', en: 'No product in the base.', es: 'Ningún producto en la base.', pt: 'Nenhum produto na base.', tr: 'Tabanda ürün yok.' },
    'Générer une Session (5 articles)': { ar: 'إنشاء جلسة (5 مواد)', en: 'Generate a Session (5 items)', es: 'Generar una Sesión (5 artículos)', pt: 'Gerar uma Sessão (5 itens)', tr: 'Oturum Oluştur (5 ürün)' },
    'Session d\'inventaire #': { ar: 'جلسة الجرد #', en: 'Inventory Session #', es: 'Sesión de inventario #', pt: 'Sessão de inventário #', tr: 'Envanter Oturumu #' },
    'Annuler cette session ?': { ar: 'إلغاء هذه الجلسة؟', en: 'Cancel this session?', es: '¿Cancelar esta sesión?', pt: 'Cancelar esta sessão?', tr: 'Bu oturum iptal edilsin mi?' },

    'Article Inconnu': { ar: 'مادة غير معروفة', en: 'Unknown Item', es: 'Artículo Desconocido', pt: 'Item Desconhecido', tr: 'Bilinmeyen Ürün' },
    'Emplacement:': { ar: 'الموقع:', en: 'Location:', es: 'Ubicación:', pt: 'Local:', tr: 'Konum:' },
    'Non défini': { ar: 'غير محدد', en: 'Undefined', es: 'No definido', pt: 'Não definido', tr: 'Tanımsız' },
    'Théorique': { ar: 'نظري', en: 'Theoretical', es: 'Teórico', pt: 'Teórico', tr: 'Teorik' },
    'Comptage Réel': { ar: 'العد الفعلي', en: 'Actual Count', es: 'Conteo Real', pt: 'Contagem Real', tr: 'Gerçek Sayım' },
    'articles mis à jour avec succès !': { ar: 'مواد تم تحديثها بنجاح!', en: 'items updated successfully!', es: '¡artículos actualizados con éxito!', pt: 'itens atualizados com sucesso!', tr: 'ürün başarıyla güncellendi!' },
    'Aucun écart constaté. Inventaire validé.': { ar: 'لم يلاحظ أي فرق. تم اعتماد الجرد.', en: 'No discrepancy noted. Inventory validated.', es: 'No se constató ninguna discrepancia. Inventario validado.', pt: 'Nenhuma divergência constatada. Inventário validado.', tr: 'Fark tespit edilmedi. Envanter onaylandı.' },
    'Valider l\'inventaire complet': { ar: 'تأكيد الجرد الكامل', en: 'Validate complete inventory', es: 'Validar el inventario completo', pt: 'Validar o inventário completo', tr: 'Tüm envanteri onayla' },
    'Nouveau Fournisseur': { ar: 'مورد جديد', en: 'New Supplier', es: 'Nuevo Proveedor', pt: 'Novo Fornecedor', tr: 'Yeni Tedarikçi' },
    'Stocks Critiques (Base)': { ar: 'مخزون حرج (القاعدة)', en: 'Critical Stocks (Base)', es: 'Stocks Críticos (Base)', pt: 'Estoques Críticos (Base)', tr: 'Kritik Stoklar (Taban)' },
    'Aucune rupture critique.': { ar: 'لا يوجد نقص حرج.', en: 'No critical shortage.', es: 'Ninguna ruptura crítica.', pt: 'Nenhuma ruptura crítica.', tr: 'Kritik eksiklik yok.' },
    'Tous les produits sont au/dessus de leur seuil d\'alerte.': { ar: 'جميع المنتجات فوق مستوى الإنذار الخاص بها.', en: 'All products are above their alert threshold.', es: 'Todos los productos están por encima de su umbral de alerta.', pt: 'Todos os produtos estão acima do seu limite de alerta.', tr: 'Tüm ürünler uyarı eşiklerinin üzerinde.' },
    'URGENCE ACHAT': { ar: 'شراء طارئ', en: 'URGENT PURCHASE', es: 'COMPRA URGENTE', pt: 'COMPRA URGENTE', tr: 'ACİL SATIN ALMA' },
    'Stock Actuel': { ar: 'المخزون الحالي', en: 'Current Stock', es: 'Stock Actual', pt: 'Estoque Atual', tr: 'Mevcut Stok' },
    'Seuil:': { ar: 'عتبة:', en: 'Threshold:', es: 'Umbral:', pt: 'Limite:', tr: 'Eşik:' },
    'Approvisionner': { ar: 'توريد', en: 'Supply', es: 'Reabastecer', pt: 'Abastecer', tr: 'Tedarik et' },
    'Besoins de Production (OF en cours)': { ar: 'احتياجات الإنتاج', en: 'Production Needs', es: 'Necesidades de Producción (OF en curso)', pt: 'Necessidades de Produção (OF em curso)', tr: 'Üretim İhtiyaçları (Devam eden OF)' },
    'Stock suffisant pour la production.': { ar: 'مخزون كافٍ للإنتاج.', en: 'Sufficient stock for production.', es: 'Stock suficiente para la producción.', pt: 'Estoque suficiente para a produção.', tr: 'Üretim için yeterli stok.' },
    'Aucune rupture détectée pour les modèles en lancement.': { ar: 'لم يتم رصد أي نقص للنماذج قيد الإطلاق.', en: 'No shortage detected for models being launched.', es: 'No se detectó ninguna ruptura para los modelos en lanzamiento.', pt: 'Nenhuma ruptura detectada para os modelos em lançamento.', tr: 'Başlatılan modeller için eksiklik tespit edilmedi.' },
    'Objectif:': { ar: 'الهدف:', en: 'Target:', es: 'Objetivo:', pt: 'Meta:', tr: 'Hedef:' },
    'pcs': { ar: 'قطعة', en: 'pcs', es: 'uds', pt: 'pçs', tr: 'adet' },
    'Manquant': { ar: 'مفقود', en: 'Missing', es: 'Faltante', pt: 'Faltante', tr: 'Eksik' },
    'Besoin': { ar: 'بحاجة', en: 'Need', es: 'Necesidad', pt: 'Necessidade', tr: 'İhtiyaç' },
    'En Magasin': { ar: 'في المستودع', en: 'In Warehouse', es: 'En Almacén', pt: 'No Armazém', tr: 'Depoda' },
    'Suggestion Plan B :': { ar: 'اقتراح الخطة ب:', en: 'Plan B Suggestion:', es: 'Sugerencia Plan B:', pt: 'Sugestão Plano B:', tr: 'B Planı Önerisi:' },
    'Remplacer par': { ar: 'استبدال بـ', en: 'Replace with', es: 'Reemplazar por', pt: 'Substituir por', tr: 'Şununla değiştir' },
    'Action requise :': { ar: 'الإجراء المطلوب:', en: 'Action required:', es: 'Acción requerida:', pt: 'Ação necessária:', tr: 'Gereken işlem:' },
    'Aucune alternative (Plan B) trouvée en stock. Achat nécessaire.': { ar: 'لم يتم العثور على بديل (الخطة ب) في المخزون. الشراء ضروري.', en: 'No alternative (Plan B) found in stock. Purchase necessary.', es: 'Ninguna alternativa (Plan B) encontrada en stock. Compra necesaria.', pt: 'Nenhuma alternativa (Plano B) encontrada em estoque. Compra necessária.', tr: 'Stokta alternatif (B Planı) bulunamadı. Satın alma gerekli.' },
    'Valorisation : Déchets & Revente': { ar: 'تثمين: نفايات وإعادة بيع', en: 'Valuation: Waste & Resale', es: 'Valorización: Residuos y Reventa', pt: 'Valorização: Resíduos e Revenda', tr: 'Değerlendirme: Atık ve Yeniden Satış' },
    'Fonctionnalité en cours de développement (Phase 6).': { ar: 'ميزة قيد التطوير (المرحلة 6).', en: 'Feature in development (Phase 6).', es: 'Funcionalidad en desarrollo (Fase 6).', pt: 'Funcionalidade em desenvolvimento (Fase 6).', tr: 'Geliştirme aşamasında özellik (Faz 6).' },
    'Déclarer Nouveau Surplus': { ar: 'التصريح بفائض جديد', en: 'Declare New Surplus', es: 'Declarar Nuevo Excedente', pt: 'Declarar Novo Excedente', tr: 'Yeni Fazlalık Bildir' },
    'Chutes de Coupe (Tissu)': { ar: 'بقايا القص (قماش)', en: 'Cutting Scraps (Fabric)', es: 'Retazos de Corte (Tela)', pt: 'Retalhos de Corte (Tecido)', tr: 'Kesim Artıkları (Kumaş)' },
    'Volume total de déchets accumulés ce mois.': { ar: 'إجمالي حجم النفايات المتراكمة هذا الشهر.', en: 'Total volume of waste accumulated this month.', es: 'Volumen total de residuos acumulados este mes.', pt: 'Volume total de resíduos acumulados este mês.', tr: 'Bu ay biriken toplam atık hacmi.' },
    'Opération de recyclage confirmée. Le lot a été déduit du compte de valorisation.': { ar: 'تم تأكيد عملية إعادة التدوير. تم خصم الدفعة من حساب التثمين.', en: 'Recycling operation confirmed. Lot deducted from valuation account.', es: 'Operación de reciclaje confirmada. El lote ha sido deducido de la cuenta de valorización.', pt: 'Operação de reciclagem confirmada. O lote foi deduzido da conta de valorização.', tr: 'Geri dönüşüm işlemi onaylandı. Parti, değerlendirme hesabından düşüldü.' },
    'Revendre / Recycler le lot (345 kg)': { ar: 'إعادة بيع / إعادة تدوير الدفعة (345 كجم)', en: 'Resell / Recycle lot (345 kg)', es: 'Revender / Reciclar el lote (345 kg)', pt: 'Revender / Reciclar o lote (345 kg)', tr: 'Partiyi yeniden sat / geri dönüştür (345 kg)' },
    'Surplus Fournitures (À revendre)': { ar: 'فائض اللوازم (للبيع)', en: 'Supplies Surplus (To resell)', es: 'Excedente de Suministros (Para revender)', pt: 'Excedente de Insumos (Para revender)', tr: 'Malzeme Fazlalığı (Yeniden satılacak)' },
    'Valeur estimée du surplus dormant revendable.': { ar: 'القيمة المقدرة للفائض الراكد القابل للبيع.', en: 'Estimated value of dormant resaleable surplus.', es: 'Valor estimado del excedente inmovilizado revendible.', pt: 'Valor estimado do excedente parado revendável.', tr: 'Yeniden satılabilir atıl fazlalığın tahmini değeri.' },
    'Suppression de': { ar: 'حذف', en: 'Deletion of', es: 'Eliminación de', pt: 'Exclusão de', tr: 'Silinen' },
    'des surplus.': { ar: 'من الفوائض.', en: 'from surpluses.', es: 'de los excedentes.', pt: 'dos excedentes.', tr: 'fazlalıklardan.' },
    'Traçabilité Ascendante / Descendante': { ar: 'التتبع الصاعد / النازل', en: 'Upward / Downward Traceability', es: 'Trazabilidad Ascendente / Descendente', pt: 'Rastreabilidade Ascendente / Descendente', tr: 'Yukarı / Aşağı İzlenebilirlik' },
    'Rechercher par Numéro OF, Numéro de Bain, ou Référence Article...': { ar: 'البحث برقم أمر التصنيع، رقم الحمام، أو مرجع المادة...', en: 'Search by MO Number, Dye Lot, or Item Ref...', es: 'Buscar por Número OF, Número de Baño o Referencia de Artículo...', pt: 'Pesquisar por Número OF, Número de Banho ou Referência de Item...', tr: 'OF Numarası, Boya Partisi veya Ürün Referansı ile ara...' },
    'Tapez par exemple': { ar: 'اكتب على سبيل المثال', en: 'For example, type', es: 'Escriba por ejemplo', pt: 'Digite por exemplo', tr: 'Örneğin yazın' },
    'ou': { ar: 'أو', en: 'or', es: 'o', pt: 'ou', tr: 'veya' },
    'pour voir tous les mouvements liés.': { ar: 'لرؤية جميع الحركات المرتبطة.', en: 'to see all related movements.', es: 'para ver todos los movimientos relacionados.', pt: 'para ver todos os movimentos relacionados.', tr: 'ilgili tüm hareketleri görmek için.' },
    'Résultats pour "': { ar: 'نتائج لـ "', en: 'Results for "', es: 'Resultados para "', pt: 'Resultados para "', tr: 'Sonuçlar: "' },
    'Qté:': { ar: 'الكمية:', en: 'Qty:', es: 'Cant:', pt: 'Qtd:', tr: 'Mik:' },
    'OF:': { ar: 'أمر تصنيع:', en: 'MO:', es: 'OF:', pt: 'OF:', tr: 'OF:' },
    'Chaîne:': { ar: 'سلسلة:', en: 'Chain:', es: 'Cadena:', pt: 'Cadeia:', tr: 'Hat:' },
    'Frs:': { ar: 'مورد:', en: 'Supp:', es: 'Prov:', pt: 'Forn:', tr: 'Ted:' },
    'Aucun mouvement trouvé pour cette recherche.': { ar: 'لم يتم العثور على أي حركة لهذا البحث.', en: 'No movement found for this search.', es: 'Ningún movimiento encontrado para esta búsqueda.', pt: 'Nenhum movimento encontrado para esta pesquisa.', tr: 'Bu arama için hareket bulunamadı.' },
    'Audit de Traçabilité': { ar: 'تدقيق التتبع', en: 'Traceability Audit', es: 'Auditoría de Trazabilidad', pt: 'Auditoria de Rastreabilidade', tr: 'İzlenebilirlik Denetimi' },
    'Cartographie WMS 2D': { ar: 'رسم خرائط إدارة المستودعات (WMS) ثنائي الأبعاد', en: '2D WMS Mapping', es: 'Cartografía WMS 2D', pt: 'Cartografia WMS 2D', tr: '2B WMS Haritalama' },
    'Vue de l\'entrepôt par rayon. Densité basée sur le volume de stock actic.': { ar: 'عرض المستودع حسب الجناح. تعتمد الكثافة على حجم المخزون النشط.', en: 'Warehouse view by aisle. Density based on active stock volume.', es: 'Vista del almacén por pasillo. Densidad basada en el volumen de stock activo.', pt: 'Visão do armazém por corredor. Densidade baseada no volume de estoque ativo.', tr: 'Koridora göre depo görünümü. Yoğunluk aktif stok hacmine göre.' },
    'Vide': { ar: 'فارغ', en: 'Empty', es: 'Vacío', pt: 'Vazio', tr: 'Boş' },
    'Moyen': { ar: 'متوسط', en: 'Medium', es: 'Medio', pt: 'Médio', tr: 'Orta' },
    'Dense': { ar: 'كثيف', en: 'Dense', es: 'Denso', pt: 'Denso', tr: 'Yoğun' },
    'Dock Réception': { ar: 'رصيف الاستلام', en: 'Receiving Dock', es: 'Muelle de Recepción', pt: 'Doca de Recepção', tr: 'Mal Kabul Rampası' },
    'Expédition / Atelier': { ar: 'إرسال / ورشة', en: 'Shipping / Workshop', es: 'Expedición / Taller', pt: 'Expedição / Oficina', tr: 'Sevkiyat / Atölye' },
    'Rayon': { ar: 'جناح', en: 'Aisle', es: 'Pasillo', pt: 'Corredor', tr: 'Koridor' },
    'Réf. Uniques': { ar: 'مراجع فريدة', en: 'Unique Refs', es: 'Refs. Únicas', pt: 'Refs. Únicas', tr: 'Benzersiz Ref' },
    'Stock Total': { ar: 'مخزون إجمالي', en: 'Total Stock', es: 'Stock Total', pt: 'Estoque Total', tr: 'Toplam Stok' },
    'Détails Emplacements': { ar: 'تفاصيل المواقع', en: 'Location Details', es: 'Detalles de Ubicaciones', pt: 'Detalhes de Locais', tr: 'Konum Detayları' },
    'Filtrer... (ex: ^A pour Rayon A)': { ar: 'تصفية... (مثال: ^A للجناح A)', en: 'Filter... (e.g., ^A for Aisle A)', es: 'Filtrar... (ej: ^A para Pasillo A)', pt: 'Filtrar... (ex: ^A para Corredor A)', tr: 'Filtrele... (örn: A Koridoru için ^A)' },
    'Non Défini': { ar: 'غير محدد', en: 'Undefined', es: 'No Definido', pt: 'Não Definido', tr: 'Tanımsız' },
    'Dispo:': { ar: 'متاح:', en: 'Avail:', es: 'Disp:', pt: 'Disp:', tr: 'Mevcut:' },
    'Radar Fournisseurs (Sourcing)': { ar: 'رادار الموردين (المصادر)', en: 'Suppliers Radar (Sourcing)', es: 'Radar de Proveedores (Sourcing)', pt: 'Radar de Fornecedores (Sourcing)', tr: 'Tedarikçi Radarı (Kaynak Bulma)' },
    'Évaluez la performance de vos fournisseurs, surveillez l\'évolution des prix d\'achat (CUMP) et optimisez votre sourcing stratégique.': { ar: 'قم بتقييم أداء الموردين، ومراقبة تطور أسعار الشراء، وتحسين مصادرك الاستراتيجية.', en: 'Evaluate supplier performance, monitor purchase price evolution, and optimize strategic sourcing.', es: 'Evalúe el rendimiento de sus proveedores, vigile la evolución de los precios de compra (CUMP) y optimice su sourcing estratégico.', pt: 'Avalie o desempenho dos seus fornecedores, monitore a evolução dos preços de compra (CUMP) e otimize seu sourcing estratégico.', tr: 'Tedarikçi performansını değerlendirin, satın alma fiyatı (CUMP) gelişimini izleyin ve stratejik kaynak bulmayı optimize edin.' },
    'références matérielles': { ar: 'مراجع المواد', en: 'material references', es: 'referencias de materiales', pt: 'referências de materiais', tr: 'malzeme referansları' },
    'Valeur Stock': { ar: 'قيمة المخزون', en: 'Stock Value', es: 'Valor del Stock', pt: 'Valor do Estoque', tr: 'Stok Değeri' },
    'Évolution Prix': { ar: 'تطور السعر', en: 'Price Evolution', es: 'Evolución del Precio', pt: 'Evolução do Preço', tr: 'Fiyat Değişimi' },
    'Livraisons Récentes': { ar: 'عمليات تسليم حديثة', en: 'Recent Deliveries', es: 'Entregas Recientes', pt: 'Entregas Recentes', tr: 'Son Teslimatlar' },
    'transactions': { ar: 'معاملات', en: 'transactions', es: 'transacciones', pt: 'transações', tr: 'işlem' },
    'Aucun Fournisseur': { ar: 'لا يوجد مورد', en: 'No Supplier', es: 'Ningún Proveedor', pt: 'Nenhum Fornecedor', tr: 'Tedarikçi Yok' },
    'Associez des fournisseurs à vos produits dans la base pour voir leurs statistiques ici.': { ar: 'قم بربط الموردين بمنتجاتك في القاعدة لرؤية إحصائياتهم هنا.', en: 'Associate suppliers to your products in the base to view their statistics here.', es: 'Asocie proveedores a sus productos en la base para ver sus estadísticas aquí.', pt: 'Associe fornecedores aos seus produtos na base para ver as estatísticas deles aqui.', tr: 'İstatistiklerini burada görmek için tabandaki ürünlerinize tedarikçi atayın.' },
    // Invoice / BL feature — translations
    'Enregistrez vos entrées et sorties de stock': { ar: 'سجّل دخول وخروج المخزون', en: 'Record your stock entries and exits', es: 'Registre sus entradas y salidas de stock', pt: 'Registre suas entradas e saídas de estoque', tr: 'Stok giriş ve çıkışlarınızı kaydedin' },
    'Paramètres Facture / BL': { ar: 'إعدادات الفاتورة / وثيقة التسليم', en: 'Invoice / Delivery Note Settings', es: 'Ajustes Factura / BL', pt: 'Configurações Fatura / BL', tr: 'Fatura / İrsaliye Ayarları' },
    'Configurer le modèle Facture / Bon de Livraison': { ar: 'إعداد قالب الفاتورة / وثيقة التسليم', en: 'Configure Invoice / Delivery Note template', es: 'Configurar la plantilla Factura / Albarán de Entrega', pt: 'Configurar o modelo Fatura / Nota de Entrega', tr: 'Fatura / İrsaliye şablonunu yapılandır' },
    'Configurer le modèle Facture / BL': { ar: 'إعداد قالب الفاتورة / وثيقة التسليم', en: 'Configure Invoice / BL template', es: 'Configurar la plantilla Factura / BL', pt: 'Configurar o modelo Fatura / BL', tr: 'Fatura / BL şablonunu yapılandır' },
    'Voir Document': { ar: 'عرض المستند', en: 'View Document', es: 'Ver Documento', pt: 'Ver Documento', tr: 'Belgeyi Gör' },
    'Imprimer / Aperçu de Facure / BL': { ar: 'طباعة / معاينة فاتورة / وثيقة تسليم', en: 'Print / Preview Invoice / DL', es: 'Imprimir / Previsualizar Factura / BL', pt: 'Imprimir / Pré-visualizar Fatura / BL', tr: 'Fatura / BL Yazdır / Önizle' },
    'Réf:': { ar: 'مرجع:', en: 'Ref:', es: 'Ref:', pt: 'Ref:', tr: 'Ref:' },
    'N° Bon / Facture (Optionnel)': { ar: 'رقم الوثيقة / الفاتورة (اختياري)', en: 'Doc / Invoice No. (Optional)', es: 'N° Documento / Factura (Opcional)', pt: 'N° Documento / Fatura (Opcional)', tr: 'Belge / Fatura No. (İsteğe bağlı)' },
    'Scanner / Joindre Document': { ar: 'مسح / إرفاق مستند', en: 'Scan / Attach Document', es: 'Escanear / Adjuntar Documento', pt: 'Escanear / Anexar Documento', tr: 'Belge Tara / Ekle' },
    // Gallery tab translations
    'Factures & BL': { ar: 'الفواتير ووثائق التسليم', en: 'Invoices & Delivery Notes', es: 'Facturas y Albaranes', pt: 'Faturas e Notas de Entrega', tr: 'Faturalar ve İrsaliyeler' },
    'Factures & Bons de Livraison': { ar: 'الفواتير ووثائق التسليم', en: 'Invoices & Delivery Notes', es: 'Facturas y Albaranes de Entrega', pt: 'Faturas e Notas de Entrega', tr: 'Faturalar ve İrsaliyeler' },
    'Tous les documents joints aux mouvements — cliquez pour imprimer / télécharger': { ar: 'جميع المستندات المرفقة بالحركات — انقر للطباعة / التنزيل', en: 'All documents attached to movements — click to print / download', es: 'Todos los documentos adjuntos a los movimientos — haga clic para imprimir / descargar', pt: 'Todos os documentos anexados aos movimentos — clique para imprimir / baixar', tr: 'Hareketlere ekli tüm belgeler — yazdırmak / indirmek için tıklayın' },
    'Tout Imprimer': { ar: 'طباعة الكل', en: 'Print All', es: 'Imprimir Todo', pt: 'Imprimir Tudo', tr: 'Tümünü Yazdır' },
    'Documents avec pièce jointe': { ar: 'مستندات مع مرفقات', en: 'Documents with attachments', es: 'Documentos con adjunto', pt: 'Documentos com anexo', tr: 'Ekli belgeler' },
    'Avec référence': { ar: 'مع مرجع', en: 'With reference', es: 'Con referencia', pt: 'Com referência', tr: 'Referanslı' },
    'Aucun document': { ar: 'لا يوجد مستند', en: 'No documents', es: 'Ningún documento', pt: 'Nenhum documento', tr: 'Belge yok' },
    'Joignez des pièces justificatives lors des entrées/sorties pour les voir apparaître ici.': { ar: 'أرفق المستندات التبريرية عند الدخول/الخروج لعرضها هنا.', en: 'Attach supporting documents during entries/exits to see them here.', es: 'Adjunte documentos justificativos durante las entradas/salidas para verlos aparecer aquí.', pt: 'Anexe documentos comprovativos durante as entradas/saídas para vê-los aqui.', tr: 'Burada görmek için giriş/çıkış sırasında destekleyici belgeler ekleyin.' },
    'Imprimer': { ar: 'طباعة', en: 'Print', es: 'Imprimir', pt: 'Imprimir', tr: 'Yazdır' },
    'Nom du fournisseur': { ar: 'اسم المورد', en: 'Supplier name', es: 'Nombre del proveedor', pt: 'Nome do fornecedor', tr: 'Tedarikçi adı' },
    'Destination / Atelier': { ar: 'الوجهة / الورشة', en: 'Destination / Workshop', es: 'Destino / Taller', pt: 'Destino / Oficina', tr: 'Hedef / Atölye' },
    "Fournisseur (Origine)": { ar: 'المورد (الأصل)', en: 'Supplier (Origin)', es: 'Proveedor (Origen)', pt: 'Fornecedor (Origem)', tr: 'Tedarikçi (Köken)' },
    "Vers": { ar: 'نحو', en: 'To', es: 'Hacia', pt: 'Para', tr: 'Şuraya' },
};

function ImageMagnifier({ src, onClose }: { src: string, onClose: () => void }) {
    return (
        <div 
            className="fixed inset-0 z-[101] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={onClose}
        >
            <button 
                className="absolute top-6 right-6 p-2 bg-white dark:bg-dk-surface/10 hover:bg-white rounded-full text-white transition-colors"
                onClick={onClose}
            >
                <X className="w-6 h-6" />
            </button>
            <div 
                className="relative max-w-[90vw] max-h-[90vh] bg-white dark:bg-dk-surface p-2 rounded-3xl shadow-2xl dark:shadow-dk-elevated animate-in zoom-in-95 duration-300"
                onClick={e => e.stopPropagation()}
            >
                <img 
                    src={src} 
                    alt="Product" 
                    className="max-w-full max-h-[calc(90vh-1rem)] rounded-2xl object-contain shadow-inner"
                />
            </div>
        </div>
    );
}

function ProductPhotoWithPreview({ src, t }: { src: string, t: any }) {
    const [magnify, setMagnify] = useState(false);
    const [hovering, setHovering] = useState(false);
    const timeoutRef = useRef<any>(null);

    const handleMouseEnter = () => {
        timeoutRef.current = setTimeout(() => setHovering(true), 300);
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setHovering(false);
    };

    return (
        <>
            <div className="relative inline-block">
                <img 
                    src={src} 
                    className="w-full h-full object-cover rounded cursor-zoom-in hover:ring-2 hover:ring-indigo-400 transition-all shadow-sm dark:shadow-dk-sm"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onClick={(e) => { e.stopPropagation(); setMagnify(true); }}
                />
                
                {hovering && (
                    <div className="absolute left-full ml-3 top-0 z-[100] w-48 h-48 bg-white dark:bg-dk-surface p-2 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-100 dark:border-dk-border/60 animate-in fade-in zoom-in-90 slide-in-from-left-2 duration-200 pointer-events-none">
                        <img src={src} className="w-full h-full object-cover rounded-xl shadow-inner" />
                        <div className="absolute -left-1.5 top-4 w-3 h-3 bg-white dark:bg-dk-surface border-l border-b border-slate-100 dark:border-dk-border/60 rotate-45 transform" />
                    </div>
                )}
            </div>
            {magnify && <ImageMagnifier src={src} onClose={() => setMagnify(false)} />}
        </>
    );
}

function CustomProductSelect({ value, onChange, products, lots, t }: any) {
    const [open, setOpen] = useState(false);
    const selected = products.find((p: any) => p.id === value);

    return (
        <div className="relative">
            <div 
                className={`w-full border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface rounded-xl px-4 py-2 text-sm outline-none cursor-pointer flex items-center justify-between ${open ? 'ring-2 ring-indigo-300 dark:ring-indigo-800 border-indigo-400 shadow-lg dark:shadow-dk-lg' : ''}`}
                onClick={() => setOpen(!open)}
            >
                {selected ? (
                    <div className="flex items-center gap-2">
                        {selected.photo ? (
                            <div className="w-6 h-6">
                                <ProductPhotoWithPreview src={selected.photo} t={t} />
                            </div>
                        ) : (
                            <div className="w-6 h-6 rounded bg-slate-200 dark:bg-dk-border flex items-center justify-center text-slate-400 dark:text-dk-muted"><Package className="w-3 h-3" /></div>
                        )}
                        <span className="font-bold text-slate-700 dark:text-dk-text whitespace-nowrap overflow-hidden text-ellipsis mr-2 tracking-tight">{selected.designation}</span>
                    </div>
                ) : <span className="text-slate-400 dark:text-dk-muted font-medium">{t("Sélect...")}</span>}
                
                <div className="flex items-center gap-2">
                    {selected && (
                        <span className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300 text-[10px] uppercase tracking-widest whitespace-nowrap bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md font-black">
                            {t("Stock:")} {stockQty(lots, selected.id).toFixed(1)} {selected.unite}
                        </span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-dk-muted transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                </div>
            </div>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute top-11 left-0 w-full z-50 bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border shadow-xl dark:shadow-dk-elevated rounded-xl mt-1 max-h-64 overflow-y-auto">
                        <div 
                            className="p-3 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 cursor-pointer flex items-center border-b" 
                            onClick={() => { onChange(""); setOpen(false); }}
                        >
                            <span className="text-slate-400 dark:text-dk-muted font-bold">{t("Sélect...")}</span>
                        </div>
                        {products.map((p: any) => (
                            <div 
                                key={p.id} 
                                className="p-3 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 cursor-pointer flex items-center justify-between border-b last:border-0"
                                onClick={() => { onChange(p.id); setOpen(false); }}
                            >
                                <div className="flex items-center gap-3">
                                    {p.photo ? (
                                        <div className="w-10 h-10">
                                            <ProductPhotoWithPreview src={p.photo} t={t} />
                                        </div>
                                    ) : (
                                        <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-dk-elevated/60 flex items-center justify-center border text-slate-300 dark:text-dk-muted">
                                            <Package className="w-5 h-5" />
                                        </div>
                                    )}
                                    <div>
                                        <div className="font-black text-slate-800 dark:text-dk-text leading-tight">{p.designation}</div>
                                        <div className="text-[10px] text-slate-400 dark:text-dk-muted font-bold uppercase tracking-widest">{p.reference}</div>
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <div className="text-[10px] font-bold uppercase text-slate-400 dark:text-dk-muted">{t("En stock:")}</div>
                                    <div className="font-black text-slate-700 dark:text-dk-text">{stockQty(lots, p.id).toFixed(1)} {p.unite}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function Magasin({ models = [], planningEvents = [], settings }: MagasinProps) {
    const { lang } = useLang();
    const t = (str: string) => lang === 'fr' ? str : (DICT[str]?.[lang] || str);
    const dtpSettings = settings ?? DEFAULT_CALENDAR_APP_SETTINGS;

    const [tab, setTab] = useState<'dashboard' | 'db' | 'bureau' | 'demandes' | 'commandes' | 'alertes' | 'inventaire' | 'tracabilite' | 'wms' | 'fournisseurs' | 'valorisation' | 'receptions' | 'surplus' | 'factures' | 'stockPF'>('dashboard');
    const [products, setProducts] = useState<MagasinProduct[]>([]);
    const [receptions, setReceptions] = useState<MaterialReceipt[]>(() => ld('beramethode_receptions', []));
    const [lots, setLots] = useState<LotStock[]>([]);
    const [mvts, setMvts] = useState<MouvementStock[]>([]);

    const [demandes, setDemandes] = useState<DemandeAppro[]>([]);
    const [commandes, setCommandes] = useState<BonCommande[]>([]);
    const [dechets, setDechets] = useState<any[]>([]);
    const [finishedGoods, setFinishedGoods] = useState<any[]>([]);
    const [fgMovements, setFgMovements] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [resProd, resLots, resMvts, resCmds, resDms, resDechets, resRecs, resFG, resFGM] = await Promise.all([
                    fetch('/api/magasin/products', { credentials: 'include' }),
                    fetch('/api/magasin/lots', { credentials: 'include' }),
                    fetch('/api/magasin/mouvements', { credentials: 'include' }),
                    fetch('/api/magasin/commandes', { credentials: 'include' }),
                    fetch('/api/magasin/demandes', { credentials: 'include' }),
                    fetch('/api/magasin/dechets', { credentials: 'include' }),
                    fetch('/api/material-receipts', { credentials: 'include' }),
                    fetch('/api/finished-goods', { credentials: 'include' }),
                    fetch('/api/finished-goods/mouvements', { credentials: 'include' }),
                ]);

                if (resProd.ok) setProducts(await resProd.json());
                if (resLots.ok) setLots(await resLots.json());
                if (resMvts.ok) setMvts(await resMvts.json());
                if (resCmds.ok) setCommandes(await resCmds.json());
                if (resDms.ok) setDemandes(await resDms.json());
                if (resDechets.ok) setDechets(await resDechets.json());
                if (resRecs.ok) {
                    const data = await resRecs.json();
                    setReceptions(data);
                    sv('beramethode_receptions', data);
                }
                if (resFG.ok) setFinishedGoods(await resFG.json());
                if (resFGM.ok) setFgMovements(await resFGM.json());
            } catch (err) {
                console.error("Erreur de synchronisation du magasin avec le serveur:", err);
            }
        };
        fetchData();
    }, []);

    const [search, setSearch] = useState('');
    const [catFilter, setCatFilter] = useState('all');
    const [prodModal, setProdModal] = useState<{ open: boolean; item?: MagasinProduct }>({ open: false });
    const [bcModal, setBcModal] = useState<{ open: boolean; item?: BonCommande }>({ open: false });
    const [aiEnabled, setAiEnabled] = useState(() => ld('mg_ai', false));
    const [invSession, setInvSession] = useState<{ id: string, items: { pid: string, qty: string }[] } | null>(null);

    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, pid: string } | null>(null);

    useEffect(() => {
        const handleGlobalClick = () => setContextMenu(null);
        document.addEventListener('click', handleGlobalClick);
        return () => document.removeEventListener('click', handleGlobalClick);
    }, []);
    const [traceQuery, setTraceQuery] = useState('');
    const [invoiceTemplate, setInvoiceTemplate] = useState<InvoiceTemplate>(() => ld('mg_invoice_template', DEFAULT_TEMPLATE));
    const [showInvoiceSettings, setShowInvoiceSettings] = useState(false);
    const [printerMvt, setPrinterMvt] = useState<MouvementStock | null>(null);
    const [selectedProductForDetail, setSelectedProductForDetail] = useState<MagasinProduct | null>(null);
    const [detailInitialTab, setDetailInitialTab] = useState<'overview' | 'history' | 'supplier' | 'lots'>('overview');
    const [detailStartEditing, setDetailStartEditing] = useState(false);
    const [selectedMovement, setSelectedMovement] = useState<MouvementStock | null>(null);
    const [movementEditDraft, setMovementEditDraft] = useState<MouvementStock | null>(null);

    // States for Receptions & Surplus WMS
    const [brSelectedEventId, setBrSelectedEventId] = useState('');
    const [brSelectedMaterial, setBrSelectedMaterial] = useState('');
    const [brQty, setBrQty] = useState('');
    const [brNum, setBrNum] = useState(() => `BR-${Math.floor(1000 + Math.random() * 9000)}`);
    const [brDate, setBrDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [brOwner, setBrOwner] = useState<'client' | 'atelier'>('client');
    const [brSupplier, setBrSupplier] = useState('');
    const [brAutoAddStock, setBrAutoAddStock] = useState(true);

    const [surplusModal, setSurplusModal] = useState<{ open: boolean; eventId?: string; materialName?: string; surplusQty?: number; isTemykou?: boolean } | null>(null);
    const [surplusActionType, setSurplusActionType] = useState<'transfer' | 'owner' | 'absorb' | null>(null);
    const [surplusTargetEventId, setSurplusTargetEventId] = useState('');
    const [surplusNewOwner, setSurplusNewOwner] = useState('');
    const [surplusAbsorbValuation, setSurplusAbsorbValuation] = useState('');

    const refreshProducts = async () => {
        try {
            const res = await fetch('/api/magasin/products', { credentials: 'include' });
            if (res.ok) {
                setProducts(await res.json());
            }
        } catch (error) {
            console.error('Impossible de recharger les produits:', error);
        }
    };

    useEffect(() => {
        if (selectedMovement) setMovementEditDraft({ ...selectedMovement });
        else setMovementEditDraft(null);
    }, [selectedMovement]);

    const saveInvoiceTemplate = (tpl: InvoiceTemplate) => {
        sv('mg_invoice_template', tpl);
        setInvoiceTemplate(tpl);
        setShowInvoiceSettings(false);
    };

    // Bureau State
    const [bMode, setBMode] = useState<'entree' | 'sortie' | 'regularisation' | 'retour_atelier' | 'rebut' | 'reservation' | null>(null);
    const [bPid, setBPid] = useState('');
    const [bQty, setBQty] = useState('');
    const [bPrix, setBPrix] = useState('');
    const [bChaine, setBChaine] = useState('');
    const [bModele, setBModele] = useState('');
    const [bFournisseur, setBFournisseur] = useState('');
    const [bNumBain, setBNumBain] = useState('');
    const [bNotes, setBNotes] = useState('');
    const [bDocumentRef, setBDocumentRef] = useState('');
    const [bPieceJointe, setBPieceJointe] = useState('');
    const [bMethod, setBMethod] = useState<'FIFO' | 'LIFO'>('FIFO');
    const [bSuccess, setBSuccess] = useState('');
    const [scannerMode, setScannerMode] = useState(false);
    const [conflictData, setConflictData] = useState<{pid: string, qty: number, avail: number, st: number} | null>(null);

    // Synchronisation locale (localStorage) supprimée au profit du Backend
    useEffect(() => { sv('mg_ai', aiEnabled); }, [aiEnabled]);
    useEffect(() => { sv('mg_lang', lang); }, [lang]);

    const totalStockValue = products.reduce((sum, p) => {
        const qty = lots.filter(l => l.productId === p.id).reduce((s, l) => s + l.quantiteRestante, 0);
        return sum + (qty * (p.cump || p.prixUnitaire));
    }, 0);

    const alertCount = products.filter(p => {
        const qty = lots.filter(l => l.productId === p.id).reduce((s, l) => s + l.quantiteRestante, 0);
        return qty <= p.stockAlerte;
    }).length;

    // Phase 5: Stock Health
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const dormantQty = lots.filter(l => new Date(l.dateEntree) < ninetyDaysAgo && l.quantiteRestante > 0).reduce((s, l) => s + l.quantiteRestante, 0);
    const dormantValue = lots.filter(l => new Date(l.dateEntree) < ninetyDaysAgo && l.quantiteRestante > 0).reduce((sum, l) => {
        const p = products.find(prod => prod.id === l.productId);
        return sum + (l.quantiteRestante * (p?.cump || l.prixUnitaire));
    }, 0);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentArrivalsCount = mvts.filter(m => m.type === 'entree' && new Date(m.date) > sevenDaysAgo).length;

    // Phase 5: Planning Anticipation
    const upcomingEvents = [...planningEvents]
        .filter(e => e.status !== 'DONE')
        .sort((a, b) => new Date(a.dateLancement).getTime() - new Date(b.dateLancement).getTime())
        .slice(0, 3); // Get 3 most imminent

    const saveProduct = async (p: MagasinProduct) => {
        try {
            const res = await fetch('/api/magasin/products', { credentials: 'include',  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
            if (res.ok) {
                await refreshProducts();
                setProdModal({ open: false });
            } else alert(tx(lang, {fr: 'Erreur Serveur: Impossible de sauvegarder le produit.', ar: 'خطأ في الخادم: تعذر حفظ المنتج.', en: 'Server Error: Could not save the product.', es: 'Error del Servidor: No se pudo guardar el producto.', pt: 'Erro do Servidor: Não foi possível salvar o produto.', tr: 'Sunucu Hatası: Ürün kaydedilemedi.'}));
        } catch (e) {
            console.error(e);
            alert(tx(lang, {fr: 'Erreur: Vérifiez votre connexion au serveur.', ar: 'خطأ: تحقق من اتصالك بالخادم.', en: 'Error: Check your server connection.', es: 'Error: Verifique su conexión al servidor.', pt: 'Erro: Verifique sua conexão com o servidor.', tr: 'Hata: Sunucu bağlantınızı kontrol edin.'}));
        }
    };

    const deleteProduct = async (id: string) => {
        if (confirm(tx(lang, {fr: 'Supprimer l\'article (Action irréversible sur la base de données) ?', ar: 'حذف المادة (إجراء لا رجعة فيه على قاعدة البيانات)؟', en: 'Delete item (Irreversible action on the database)?', es: '¿Eliminar el artículo (Acción irreversible en la base de datos)?', pt: 'Excluir o item (Ação irreversível no banco de dados)?', tr: 'Ürün silinsin mi (Veritabanında geri alınamaz işlem)?'}))) {
            try {
                const res = await fetch(`/api/magasin/products/${id}`, { credentials: 'include',  method: 'DELETE' });
                if (res.ok) {
                    setProducts(prev => prev.filter(p => p.id !== id));
                    setLots(prev => prev.filter(l => l.productId !== id));
                } else alert(tx(lang, {fr: 'Erreur Serveur: Suppression refusée.', ar: 'خطأ في الخادم: رفض الحذف.', en: 'Server Error: Deletion refused.', es: 'Error del Servidor: Eliminación rechazada.', pt: 'Erro do Servidor: Exclusão recusada.', tr: 'Sunucu Hatası: Silme reddedildi.'}));
            } catch (e) {
                console.error(e);
                alert(tx(lang, {fr: 'Erreur: Vérifiez votre connexion au serveur.', ar: 'خطأ: تحقق من اتصالك بالخادم.', en: 'Error: Check your server connection.', es: 'Error: Verifique su conexión al servidor.', pt: 'Erro: Verifique sua conexão com o servidor.', tr: 'Hata: Sunucu bağlantınızı kontrol edin.'}));
            }
        }
    };

    const saveCommande = async (c: BonCommande) => {
        try {
            const res = await fetch('/api/magasin/commandes', { credentials: 'include',  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
            if (res.ok) {
                setCommandes(prev => prev.find(x => x.id === c.id) ? prev.map(x => x.id === c.id ? c : x) : [c, ...prev]);
                return true;
            } else throw new Error("Erreur Serveur");
        } catch (e) { console.error(e); return false; }
    };

    const deleteCommande = async (id: string) => {
        try {
            const res = await fetch(`/api/magasin/commandes/${id}`, { credentials: 'include',  method: 'DELETE' });
            if (res.ok) setCommandes(prev => prev.filter(x => x.id !== id));
        } catch (e) { console.error(e); }
    };

    const saveDemande = async (d: DemandeAppro) => {
        try {
            const res = await fetch('/api/magasin/demandes', { credentials: 'include',  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
            if (res.ok) {
                setDemandes(prev => prev.find(x => x.id === d.id) ? prev.map(x => x.id === d.id ? d : x) : [d, ...prev]);
                return true;
            } else throw new Error("Erreur Serveur");
        } catch (e) { console.error(e); return false; }
    };

    const deleteDemande = async (id: string) => {
        try {
            const res = await fetch(`/api/magasin/demandes/${id}`, { credentials: 'include',  method: 'DELETE' });
            if (res.ok) setDemandes(prev => prev.filter(x => x.id !== id));
        } catch (e) { console.error(e); }
    };

    const saveDechet = async (d: any) => {
        try {
            const res = await fetch('/api/magasin/dechets', { credentials: 'include',  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
            if (res.ok) {
                setDechets(prev => prev.find(x => x.id === d.id) ? prev.map(x => x.id === d.id ? d : x) : [d, ...prev]);
                return true;
            } else throw new Error("Erreur Serveur");
        } catch (e) { console.error(e); return false; }
    };

    const deleteDechet = async (id: string) => {
        try {
            const res = await fetch(`/api/magasin/dechets/${id}`, { credentials: 'include',  method: 'DELETE' });
            if (res.ok) setDechets(prev => prev.filter(x => x.id !== id));
        } catch (e) { console.error(e); }
    };

    const saveMovementChanges = async (movement: MouvementStock) => {
        try {
            const res = await fetch(`/api/magasin/mouvements/${movement.id}`, { credentials: 'include', 
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(movement)
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Erreur Serveur');
            }
            setMvts(prev => prev.map(m => m.id === movement.id ? movement : m));
            setSelectedMovement(movement);
            setMovementEditDraft(movement);
            alert(tx(lang, {fr: 'Mouvement mis à jour', ar: 'تم تحديث الحركة', en: 'Movement updated', es: 'Movimiento actualizado', pt: 'Movimento atualizado', tr: 'Hareket güncellendi'}));
        } catch (error: any) {
            console.error(error);
            alert(tx(lang, {fr: 'Impossible de sauvegarder les modifications', ar: 'تعذر حفظ التعديلات', en: 'Could not save the changes', es: 'No se pudieron guardar los cambios', pt: 'Não foi possível salvar as alterações', tr: 'Değişiklikler kaydedilemedi'}) + ' : ' + (error.message || tx(lang, {fr: 'Erreur', ar: 'خطأ', en: 'Error', es: 'Error', pt: 'Erro', tr: 'Hata'})));}
    };

    const deleteMovement = async (id: string) => {
        if (!confirm('Supprimer cette activité ?')) return;
        try {
            const res = await fetch(`/api/magasin/mouvements/${id}`, { credentials: 'include',  method: 'DELETE' });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Erreur Serveur');
            }
            setMvts(prev => prev.filter(m => m.id !== id));
            setSelectedMovement(null);
            setMovementEditDraft(null);
            alert(tx(lang, {fr: 'Mouvement supprimé', ar: 'تم حذف الحركة', en: 'Movement deleted', es: 'Movimiento eliminado', pt: 'Movimento excluído', tr: 'Hareket silindi'}));
        } catch (error: any) {
            console.error(error);
            alert('Impossible de supprimer l\'activité : ' + (error.message || 'Erreur'));
        }
    };

    const bureauProduct = products.find(p => p.id === bPid);
    useEffect(() => {
        if (bureauProduct) {
            setBPrix(bureauProduct.prixUnitaire.toString());
            setBChaine(bureauProduct.chaineExclusive || '');
            setBFournisseur(bureauProduct.fournisseurNom || '');
        }
    }, [bPid]);

    const submitAction = async () => {
        const qty = parseFloat(bQty);
        if (!bPid || isNaN(qty) || qty <= 0) return alert(tx(lang, {fr: 'Sélection / Quantité invalide', ar: 'تحديد / كمية غير صالح', en: 'Invalid selection / quantity', es: 'Selección / Cantidad no válida', pt: 'Seleção / Quantidade inválida', tr: 'Geçersiz seçim / miktar'}));
        const st = stockQty(lots, bPid);
        const avail = availableQty(lots, bPid);

        if (bMode === 'reservation' && qty > avail && qty <= st) {
            setConflictData({ pid: bPid, qty, avail, st });
            return;
        }
        if (bMode === 'reservation' && qty > st) {
            return alert(`Stock total insuffisant (${st.toFixed(2)} ${bureauProduct?.unite})`);
        }
        if ((bMode === 'sortie' || bMode === 'rebut') && qty > st) {
            return alert(`Stock insuffisant (${st.toFixed(2)} ${bureauProduct?.unite})`);
        }

        let payloadMouvement: any = null;
        let payloadLotsUpdate: any[] = [];
        let payloadProductUpdate: any = { id: bPid }; // Fix: Always send id to prevent old backend from throwing TypeError

        let newMvt: MouvementStock | null = null;
        let diff = 0;

        if (bMode === 'regularisation') {
            diff = qty - st;
            if (diff === 0) return alert(tx(lang, {fr: 'Le stock scanné est identique au stock actuel', ar: 'المخزون الممسوح ضوئياً مطابق للمخزون الحالي', en: 'Scanned stock is identical to current stock', es: 'El stock escaneado es idéntico al stock actual', pt: 'O stock escaneado é idêntico ao stock atual', tr: 'Taranan stok mevcut stokla aynı'}));
            newMvt = {
                id: uid(), productId: bPid, type: 'regularisation', quantite: Math.abs(diff),
                prixUnitaire: bureauProduct!.cump || bureauProduct!.prixUnitaire, date: new Date().toISOString(), notes: `Ajustement inventaire (Théorique: ${st}, Réel: ${qty})`,
                source: 'inventaire', destination: diff > 0 ? 'chaine' : 'inventaire',
                documentRef: bDocumentRef || undefined, pieceJointe: bPieceJointe || undefined
            } as MouvementStock;
            payloadMouvement = newMvt;
            payloadLotsUpdate = diff > 0 ? [{ id: uid(), productId: bPid, quantiteInitiale: diff, quantiteRestante: diff, prixUnitaire: bureauProduct!.cump || bureauProduct!.prixUnitaire, dateEntree: newMvt.date, etat: 'disponible' }] : deductLots(lots, bPid, Math.abs(diff), 'FIFO');
        } else {
            const isEntree = bMode === 'entree' || bMode === 'retour_atelier';
            newMvt = {
                id: uid(), productId: bPid, type: bMode! as any, quantite: qty,
                prixUnitaire: isEntree ? (parseFloat(bPrix) || 0) : (bureauProduct!.cump || bureauProduct!.prixUnitaire),
                fournisseurId: (bMode === 'entree' || bMode === 'sortie' || bMode === 'retour_atelier') ? bFournisseur : undefined,
                chaineId: (bMode === 'sortie' || bMode === 'reservation') ? bChaine : undefined,
                modeleRef: bModele, bain: bNumBain,
                date: new Date().toISOString(), notes: bNotes,
                source: bMode === 'entree' ? 'fournisseur' : bMode === 'retour_atelier' ? 'retour_chaine' : 'inventaire',
                destination: bMode === 'sortie' ? 'chaine' : bMode === 'rebut' ? 'rebut' : 'inventaire',
                documentRef: bDocumentRef || undefined, pieceJointe: bPieceJointe || undefined
            } as MouvementStock;
            payloadMouvement = newMvt;

            if (isEntree) {
                payloadLotsUpdate = [{ id: uid(), productId: bPid, quantiteInitiale: qty, quantiteRestante: qty, prixUnitaire: newMvt.prixUnitaire, dateEntree: newMvt.date, fournisseur: bFournisseur, numBain: bNumBain, etat: 'disponible' }];
                if (bMode === 'entree') {
                    const currentCUMP = bureauProduct!.cump || bureauProduct!.prixUnitaire || 0;
                    const entrantPrice = newMvt.prixUnitaire || 0;
                    const newCUMP = st + qty > 0 ? ((st * currentCUMP) + (qty * entrantPrice)) / (st + qty) : entrantPrice;
                    payloadProductUpdate = { id: bPid, cump: newCUMP };
                }
            } else {
                payloadLotsUpdate = deductLots(lots, bPid, qty, bMethod, bMode === 'reservation', bMode === 'sortie');
            }
        }

        try {
            const res = await fetch('/api/magasin/mvt', { credentials: 'include', 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mouvement: payloadMouvement, lotsUpdate: payloadLotsUpdate, productUpdate: payloadProductUpdate })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || "Erreur transaction SGBD");
            }

            if (bMode === 'regularisation') {
                if (diff > 0) setLots(prev => [...prev, ...payloadLotsUpdate]);
                else setLots(prev => payloadLotsUpdate as any);
                setBSuccess(`Inventaire ajusté : Nouveau stock = ${qty} ${bureauProduct?.unite}`);
            } else {
                const isEntree = bMode === 'entree' || bMode === 'retour_atelier';
                if (isEntree) {
                    setLots(prev => [...prev, ...payloadLotsUpdate]);
                    if (payloadProductUpdate) setProducts(prev => prev.map(p => p.id === bPid ? { ...p, cump: payloadProductUpdate.cump } : p));
                } else setLots(prev => payloadLotsUpdate as any);

                const actionNames: Record<string, string> = {
                    entree: 'Arrivage', sortie: 'Sortie', retour_atelier: 'Retour Atelier', rebut: 'Mise au rebut', reservation: 'Réservation'
                };
                setBSuccess(`${actionNames[bMode!]} de ${qty} validé (Sync Database) !`);
            }
            if (newMvt) {
                setMvts(prev => [newMvt!, ...prev]);
                if (bMode === 'entree' || bMode === 'sortie') {
                    setPrinterMvt(newMvt);
                }
            }

            setBQty(''); setBModele(''); setBNumBain(''); setBNotes(''); setBDocumentRef(''); setBPieceJointe(''); setBFournisseur('');
            setTimeout(() => setBSuccess(''), 3000);

        } catch (error: any) {
            console.error(error);
            alert("Échec de l'opération: " + error.message);
        }
    };

    const downloadCSV = () => {
        try {
            const q = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
            const h = ['Reference', 'Designation', 'Cat', 'Unite', 'Emplacement', 'Stock', 'Seuil', 'Prix_Unit', 'CUMP', 'Frs', 'Frs_Email', 'Frs_Adresse', 'ICE', 'RC', 'Paiement', 'Delai_j', 'MOQ', 'Devise', 'Contact', 'Notes'];
            const r = products.map(p => [
                p.reference, q(p.designation), p.categorie, p.unite, q(p.emplacement || ''),
                stockQty(lots, p.id), p.stockAlerte, p.prixUnitaire || '', p.cump || '',
                q(p.fournisseurNom || ''),
                q(p.fournisseurEmail || ''), q(p.fournisseurAdresse || ''), q(p.fournisseurIce || ''), q(p.fournisseurRc || ''),
                q(p.fournisseurConditionsPaiement || ''),
                p.fournisseurDelaiLivraisonJours ?? '',
                p.fournisseurMoq ?? '',
                q(p.fournisseurDevise || ''), q(p.fournisseurContact || ''), q(p.fournisseurNotes || '')
            ].join(','));
            const csv = [h.join(','), ...r].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.download = `Inventaire_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export error:', error);
            alert('Erreur lors de l\'export : ' + (error instanceof Error ? error.message : 'Erreur inconnue'));
        }
    };

    const exportMouvements = () => {
        try {
            const q = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
            const h = ['Date', 'Type', 'Produit', 'Reference', 'Quantite', 'Unite', 'Prix_Unit', 'Source', 'Destination', 'Notes'];
            const r = mvts.map(m => {
                const p = products.find(pr => pr.id === m.productId);
                return [new Date(m.date).toLocaleString(), m.type, q(p?.designation || 'Inconnu'), p?.reference || '', m.quantite, p?.unite || '', m.prixUnitaire || '', m.source || '', m.destination || '', q(m.notes || '')].join(',');
            });
            const csv = [h.join(','), ...r].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.download = `Mouvements_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Mouvements export error:', error);
            alert('Erreur lors de l\'export mouvements : ' + (error instanceof Error ? error.message : 'Erreur inconnue'));
        }
    };

    const printBarcode = (ref: string, des: string) => {
        const w = window.open('', '_blank');
        w?.document.write(`<html><head><style>@page{size: auto; margin:0mm;} body{margin:0; padding:10px; font-family:sans-serif; text-align:center;} .bc{font-family:'Libre Barcode 39', monospace; font-size:48px;}</style></head><body><div style="font-size:12px;font-weight:bold;">${des}</div><div class="bc">*${ref}*</div><div style="font-size:10px;">${ref}</div><script>window.print();</script></body></html>`);
        w?.document.close();
    };

    const handleScan = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.trim();
        if (val.length > 3) {
            const p = products.find(x => x.reference.toLowerCase() === val.toLowerCase());
            if (p) { setBPid(p.id); setScannerMode(false); }
        }
    };

    const filtered = products.filter(p => {
        const q = search.toLowerCase();
        return (!q || p.designation.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q) || (p.fournisseurNom || '').toLowerCase().includes(q) || (p.emplacement || '').toLowerCase().includes(q))
            && (catFilter === 'all' || p.categorie === catFilter);
    });
    const alertes = products.filter(p => stockQty(lots, p.id) <= p.stockAlerte);

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-dk-bg overflow-hidden font-sans">
            {/* Header */}
            <div className={`bg-white dark:bg-dk-surface border-b border-slate-200 dark:border-dk-border px-6 py-4 flex flex-wrap justify-between items-center z-10 sticky top-0`}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 rounded-xl flex items-center justify-center text-white"><Activity className="w-5 h-5" /></div>
                    <div><h1 className="text-xl font-black text-slate-800 dark:text-dk-text flex items-center gap-2">Magasin ERP {aiEnabled && <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-300 animate-pulse" />}</h1><p className="text-xs text-slate-500 dark:text-dk-muted font-bold tracking-widest uppercase">{t('Stock • Traçabilité • Emplacements')}</p></div>
                </div>
                <div className="flex items-center gap-4">

                    <button onClick={() => setAiEnabled(!aiEnabled)} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-black transition-colors ${aiEnabled ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 shadow-inner' : 'bg-slate-50 dark:bg-dk-bg border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted hover:bg-slate-100'}`}>
                        {aiEnabled ? <Sparkles className="w-4 h-4" /> : <Power className="w-4 h-4" />} IA: {aiEnabled ? 'ON' : 'OFF'}
                    </button>
                    <div className="px-4 py-1.5 border rounded-xl bg-slate-50 dark:bg-dk-bg text-center flex flex-col items-end"><div className="text-[10px] font-black text-slate-400 dark:text-dk-muted uppercase">{t('Valeur')}</div><div className="font-black text-slate-700 dark:text-dk-text text-sm leading-tight">{lots.reduce((s, l) => s + (l.quantiteRestante * l.prixUnitaire), 0).toLocaleString()} DH</div></div>
                    {alertes.length > 0 && <button onClick={() => setTab('alertes')} className="px-3 py-1.5 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 text-center rounded-xl cursor-pointer hover:bg-red-100 dark:bg-red-900/40 flex flex-col items-end"><div className="text-[10px] font-black text-red-500 dark:text-red-300 uppercase flex items-center gap-1 justify-center"><AlertTriangle className="w-3 h-3" /> {t('Urgences')}</div><div className="font-black text-red-600 dark:text-red-400 dark:text-red-300 text-sm leading-tight">{alertes.length}</div></button>}
                </div>
            </div>

            {/* Tabs */}
            <div className={`bg-white dark:bg-dk-surface px-6 border-b flex gap-6 shrink-0 z-0 border-slate-200 dark:border-dk-border overflow-x-auto hide-scrollbar`}>
                {[
                    { i: 'dashboard', l: 'Tableau de Bord', ic: TrendingUp },
                    { i: 'db', l: 'Base Produits', ic: Layers },
                    { i: 'bureau', l: 'Bureau Magasin', ic: History },
                    { i: 'inventaire', l: 'Inventaire Tournant', ic: RefreshCw },
                    { i: 'wms', l: 'Plan WMS', ic: MapPin },
                    { i: 'fournisseurs', l: 'Radar Fournisseurs', ic: Building2 },
                    { i: 'commandes', l: 'Bons de Commande', ic: FileText, b: commandes.filter(c => c.statut === 'brouillon' || c.statut === 'envoye').length },
                    { i: 'demandes', l: 'Demandes Atelier', ic: Package, b: demandes.filter(d => d.statut === 'attente').length },
                    { i: 'receptions', l: 'Bons de Réception', ic: Download },
                    { i: 'surplus', l: 'Gestion des Surplus', ic: Scale },
                    { i: 'alertes', l: 'Alertes & Ruptures', ic: AlertTriangle, b: alertes.length },
                    { i: 'valorisation', l: 'S. Valorisation (Déchets)', ic: Recycle },
                    { i: 'tracabilite', l: 'Traçabilité', ic: LinkIcon },
                    { i: 'factures', l: 'Factures & BL', ic: FileText, b: mvts.filter(m => m.pieceJointe || m.documentRef).length },
                    { i: 'stockPF', l: 'Stock Produit Fini', ic: Package, b: finishedGoods.filter(fg => fg.statut === 'disponible').length }
                ].map(tObj => (
                    <button key={tObj.i} onClick={() => setTab(tObj.i as any)} className={`py-3 text-sm font-bold flex items-center gap-2 relative transition-colors whitespace-nowrap ${tab === tObj.i ? 'text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300' : 'text-slate-500 dark:text-dk-muted hover:text-slate-800'}`}>
                        <tObj.ic className="w-4 h-4" />{t(tObj.l)} {!!tObj.b && <span className="bg-red-500 dark:bg-red-700 text-white rounded-full px-1.5 py-0.5 text-[10px]">{tObj.b}</span>}
                        {tab === tObj.i && <div className="absolute bottom-0 inset-x-0 h-1 bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 rounded-t-full" />}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto w-full max-w-[1400px] mx-auto p-4 md:p-6">

                {/* ══ Dashboard ══ */}
                {tab === 'dashboard' && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        {/* TOP STATS */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                    <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500 dark:text-dk-muted">{t('Total Références')}</p>
                                    <p className="text-2xl font-black text-slate-800 dark:text-dk-text">{products.length}</p>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                                    <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400 dark:text-emerald-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500 dark:text-dk-muted">{t('Valeur Globale (CUMP)')}</p>
                                    <p className="text-xl sm:text-2xl font-black text-slate-800 dark:text-dk-text flex items-baseline gap-1">
                                        {totalStockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        <span className="text-xs font-black text-slate-400 dark:text-dk-muted">DH</span>
                                    </p>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 dark:text-rose-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500 dark:text-dk-muted">{t('Alerte Rupture')}</p>
                                    <p className="text-2xl font-black text-rose-600 dark:text-rose-400 dark:text-rose-300">{alertCount}</p>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                                    <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400 dark:text-blue-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500 dark:text-dk-muted">{t('Mouvements (7j)')}</p>
                                    <p className="text-2xl font-black text-slate-800 dark:text-dk-text">{recentArrivalsCount}</p>
                                </div>
                            </div>
                        </div>

                        {/* MIDDLE SECTION: HEALTH & ANTICIPATION */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* STOCK HEALTH */}
                            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm p-6 lg:col-span-1 flex flex-col items-center justify-center relative overflow-hidden">
                                <div className="absolute -top-10 -right-10 w-32 h-32 bg-slate-50 dark:bg-dk-bg rounded-full zoom-in-50"></div>
                                <Layers className="w-10 h-10 text-slate-300 dark:text-dk-muted mb-4" />
                                <h3 className="font-black text-slate-800 dark:text-dk-text text-lg mb-1">{t('Stock Dormant')}</h3>
                                <p className="text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-6">{t('Articles > 90 Jours')}</p>

                                <div className="text-center w-full">
                                    <p className="text-5xl font-black text-slate-800 dark:text-dk-text mb-2">{dormantQty.toLocaleString()}</p>
                                    <p className="text-sm font-bold text-slate-500 dark:text-dk-muted">{t('Unités immobiles')}</p>

                                    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-dk-border/60 flex justify-between items-center w-full">
                                        <span className="text-xs font-bold text-slate-400 dark:text-dk-muted uppercase">{t('Valeur Gelée')}</span>
                                        <span className="text-lg font-black text-rose-500 dark:text-rose-300">{dormantValue.toLocaleString()} DH</span>
                                    </div>
                                </div>
                            </div>

                            {/* PLANNING ANTICIPATION */}
                            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm p-6 lg:col-span-2 flex flex-col">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h3 className="font-black text-slate-800 dark:text-dk-text text-lg flex items-center gap-2"><Send className="w-5 h-5 text-indigo-500 dark:text-indigo-300" /> {t('Anticipation Production')}</h3>
                                        <p className="text-[11px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mt-1">{t('Préparation des Modèles Imminents')}</p>
                                    </div>
                                    <span className="bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300 text-xs font-bold px-3 py-1 rounded-full">{upcomingEvents.length} OF Prévus</span>
                                </div>

                                {upcomingEvents.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-dk-muted">
                                        <Layers className="w-10 h-10 mb-3 opacity-20" />
                                        <p className="font-bold text-sm">{tx(lang, {fr: 'Aucune production imminente planifiée.', ar: 'لا يوجد إنتاج وشيك مخطط له.', en: 'No upcoming production planned.', es: 'No hay producción inminente planificada.', pt: 'Nenhuma produção iminente planejada.', tr: 'Planlanmış yakın üretim yok.'})}</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
                                        {upcomingEvents.map(evt => {
                                            const modelInfo = models?.find(m => m.id === evt.modelId);
                                            const modelName = modelInfo?.meta_data.nom_modele || 'Modèle Inconnu';
                                            const photo = modelInfo?.meta_data.photo_url || null;

                                            // Mock needs logic: We assume 1.2m of fabric and 0.5 unit of accessories per item.
                                            // Real implementation would look at `nomenclature` if it existed.
                                            const fabricNeeded = evt.qteTotal * 1.2;
                                            const accNeeded = Math.ceil(evt.qteTotal * 0.5);

                                            // Determine if we have enough mock stock (simulated with random check for UX demonstration)
                                            // In a real scenario, this would check against actual `lots` quantities.
                                            const totalTissuStock = products.filter(p => p.categorie === 'tissu').reduce((acc, p) => acc + stockQty(lots, p.id), 0);
                                            const isTissuSuffisant = totalTissuStock >= fabricNeeded;

                                            return (
                                                <div key={evt.id} className="bg-slate-50 dark:bg-dk-bg rounded-2xl p-4 border border-slate-100 dark:border-dk-border/60 hover:border-indigo-200 dark:border-indigo-800 hover:shadow-md transition-all flex flex-col relative overflow-hidden">
                                                    {!isTissuSuffisant && <div className="absolute top-0 right-0 bg-red-500 dark:bg-red-700 text-white text-[9px] font-black px-2 py-0.5 rounded-bl-lg z-10 animate-pulse">STOCK CRITIQUE</div>}

                                                    <div className="flex gap-3 mb-3 relative z-0">
                                                        <div className="w-12 h-16 bg-slate-200 dark:bg-dk-border rounded-xl overflow-hidden shadow-sm dark:shadow-dk-sm shrink-0">
                                                            {photo ? <img src={photo} className="w-full h-full object-cover" alt="" /> : <Package className="w-6 h-6 m-3 text-slate-400 dark:text-dk-muted" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[10px] font-bold text-slate-400 dark:text-dk-muted mb-1">{new Date(evt.dateLancement).toLocaleDateString('fr-FR')} • {evt.chaineId}</div>
                                                            <h4 className="font-black text-sm text-slate-800 dark:text-dk-text leading-tight truncate" title={modelName}>{modelName}</h4>
                                                            <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300 mt-1">{evt.qteTotal.toLocaleString()} pcs</div>
                                                        </div>
                                                    </div>

                                                    <div className="mt-auto pt-3 border-t border-slate-200 dark:border-dk-border space-y-2">
                                                        <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted">{t('Besoins / Fournitures')}</p>
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="text-slate-600 dark:text-dk-text-soft font-medium">{t('Tissu requis')}</span>
                                                            <span className={`font-black ${isTissuSuffisant ? 'text-slate-800 dark:text-dk-text' : 'text-red-600 dark:text-red-400 dark:text-red-300'}`}>~{fabricNeeded.toLocaleString()} m</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="text-slate-600 dark:text-dk-text-soft font-medium">{t('Accessoires')}</span>
                                                            <span className="font-black text-slate-800 dark:text-dk-text">~{accNeeded.toLocaleString()} u</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* TRANSIT & RECENT ACTIONS */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* EN TRANSIT (Commandes) */}
                            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden flex flex-col">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-dk-border/60 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-800 dark:text-dk-text flex items-center gap-2"><ArrowDownCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-300" /> {t('Approvisionnements en Transit')}</h3>
                                    <button onClick={() => setTab('commandes')} className="text-[10px] uppercase font-black tracking-widest text-emerald-600 dark:text-emerald-400 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded hover:bg-emerald-100 dark:bg-emerald-900/40 transition-colors">{t('Gérer')}</button>
                                </div>
                                <div className="p-0 flex-1">
                                    {commandes.filter(c => c.statut === 'envoye' || c.statut === 'valide').length === 0 ? (
                                        <p className="p-8 text-center text-sm font-medium text-slate-400 dark:text-dk-muted">{t("Aucune commande en cours d'acheminement.")}</p>
                                    ) : (
                                        <ul className="divide-y divide-slate-50">
                                            {commandes.filter(c => c.statut === 'envoye' || c.statut === 'valide').map(c => (
                                                <li key={c.id} className="p-4 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                                                        <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400 dark:text-emerald-300" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-baseline mb-1">
                                                            <p className="font-black text-slate-800 dark:text-dk-text text-sm">{c.numero}</p>
                                                            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded uppercase">{t(c.statut)}</span>
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-500 dark:text-dk-muted truncate">{t('Chez')} {c.fournisseurNom} • {c.lignes.length} {t('articles')}</p>
                                                        {c.dateLivraisonPrevue && <p className="text-[10px] text-slate-400 dark:text-dk-muted mt-1">{t('Livraison prévue :')} {new Date(c.dateLivraisonPrevue).toLocaleDateString()}</p>}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>

                            {/* RECENT MOVEMENTS */}
                            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden flex flex-col">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-dk-border/60 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-dk-text flex items-center gap-2"><History className="w-4 h-4 text-indigo-500 dark:text-indigo-300" /> {t('Derniers Mouvements')}</h3>
                                        <p className="text-xs text-slate-400 dark:text-dk-muted mt-1">{t('Cliquez sur une ligne pour voir le produit, le stock et son historique complet.')}</p>
                                    </div>
                                    <button onClick={() => setTab('tracabilite')} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300 hover:text-indigo-800 dark:text-indigo-200 flex items-center gap-1">{t('Voir tout')}</button>
                                </div>
                                <div className="p-0 overflow-x-auto">
                                    {mvts.length === 0 ? <p className="p-6 text-center text-sm font-medium text-slate-400 dark:text-dk-muted">{t('Aucun mouvement enregistré.')}</p> : (
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead className="bg-slate-50 dark:bg-dk-bg"><tr className="text-slate-500 dark:text-dk-muted"><th className="p-3 pl-6 font-bold w-20">{t('Photo')}</th><th className="p-3 font-bold w-40">{t('Date')}</th><th className="p-3 font-bold w-24">{t('Type')}</th><th className="p-3 font-bold">{t('Produit')}</th><th className="p-3 font-bold text-right w-24">{t('Stock')}</th><th className="p-3 font-bold text-right pr-6 w-28">{t('Quantité')}</th></tr></thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {mvts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5).map(m => {
                                                    const prod = products.find(p => p.id === m.productId);
                                                    const prodStock = prod ? stockQty(lots, prod.id) : 0;
                                                    return (
                                                        <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60 cursor-pointer" onClick={() => setSelectedMovement(m)}>
                                                            <td className="p-3 pl-6">
                                                                <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 dark:bg-dk-elevated/60 flex items-center justify-center">
                                                                    {prod?.photo ? <img src={prod.photo} alt={prod.designation} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-slate-400 dark:text-dk-muted" />}
                                                                </div>
                                                            </td>
                                                            <td className="p-3 text-slate-500 dark:text-dk-muted font-mono text-xs">{new Date(m.date).toLocaleString()}</td>
                                                            <td className="p-3">
                                                                <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${m.type === 'entree' || m.type === 'retour_atelier' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : m.type === 'sortie' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300' : m.type === 'rebut' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' : m.type === 'regularisation' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>{t(m.type)}</span>
                                                            </td>
                                                            <td className="p-3 font-bold text-slate-700 dark:text-dk-text">{prod?.designation || t('Inconnu')}</td>
                                                            <td className="p-3 text-right text-slate-600 dark:text-dk-text-soft font-bold">{prod ? `${prodStock.toFixed(1)} ${prod.unite}` : '-'}</td>
                                                            <td className={`p-3 pr-6 text-right font-black ${m.type === 'entree' || m.type === 'retour_atelier' ? 'text-emerald-600 dark:text-emerald-400 dark:text-emerald-300' : m.type === 'sortie' || m.type === 'rebut' ? 'text-rose-600 dark:text-rose-400 dark:text-rose-300' : 'text-amber-500 dark:text-amber-300'}`}>{m.type === 'sortie' || m.type === 'rebut' ? '-' : '+'}{m.quantite}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══ Demandes ══ */}
                {tab === 'demandes' && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="flex gap-4 items-center flex-wrap">
                            <h2 className="text-xl font-black text-slate-800 dark:text-dk-text flex-1">{t('Demandes d\'Approvisionnement (Atelier)')}</h2>
                            <button onClick={() => {
                                const did = uid();
                                const newDemande = { id: did, modelId: 'OF-' + Math.floor(Math.random() * 900 + 100), chaineId: '', produitDesignation: products[0]?.designation || '', quantiteDemandee: 10, dateDemande: new Date().toISOString(), demandeur: 'Atelier Central', statut: 'attente' as any };
                                saveDemande(newDemande);
                            }} className="bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white px-4 py-2 rounded-xl font-black text-sm hover:bg-indigo-700 dark:hover:bg-dk-accent-hover flex items-center gap-2"><Plus className="w-4 h-4" /> {t('Créer Demande Test')}</button>
                        </div>

                        <div className="bg-white dark:bg-dk-surface rounded-3xl border shadow-sm dark:shadow-dk-sm overflow-hidden">
                            {demandes.length === 0 ? (
                                <div className="py-24 text-center">
                                    <Package className="w-16 h-16 text-slate-200 dark:text-dk-muted mx-auto mb-4" />
                                    <p className="text-xl font-black text-slate-400 dark:text-dk-muted">{t('Aucune demande en attente.')}</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {demandes?.map(d => {
                                        const p = products.find(x => x.designation === d.produitDesignation);
                                        const st = p ? stockQty(lots, p.id) : 0;
                                        return (
                                            <div key={d.id} className="p-4 md:p-6 flex flex-col md:flex-row gap-6 md:items-center hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${d.statut === 'attente' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' : d.statut === 'preparee' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : d.statut === 'rejetee' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' : 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'}`}>{t(d.statut)}</span>
                                                        <span className="text-xs font-bold text-slate-500 dark:text-dk-muted font-mono">{t('Demande du')} {new Date(d.dateDemande).toLocaleDateString()}</span>
                                                        <span className="text-xs bg-slate-100 dark:bg-dk-elevated/60 text-slate-600 dark:text-dk-text-soft px-2 py-0.5 rounded font-bold">{d.demandeur}</span>
                                                    </div>
                                                    <h3 className="font-black text-lg text-slate-800 dark:text-dk-text">{d.produitDesignation || t('Produit Inconnu')}</h3>
                                                    <div className="text-sm text-slate-500 dark:text-dk-muted font-bold mt-1">{t('Pour Ordre de Fab:')} <span className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300">{d.modelId}</span></div>
                                                    {d.notes && <div className="mt-2 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 p-2 rounded-lg italic">"{d.notes}"</div>}
                                                </div>

                                                <div className="flex flex-col md:flex-row items-center gap-6">
                                                    <div className="bg-slate-100 dark:bg-dk-elevated/60 rounded-2xl p-4 flex gap-6 text-center shadow-inner">
                                                        <div><div className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1">{t('Demandé')}</div><div className="font-black text-2xl text-slate-800 dark:text-dk-text">{d.quantiteDemandee} <span className="text-sm font-medium">{p?.unite}</span></div></div>
                                                        <div className="w-px bg-slate-200 dark:bg-dk-border" />
                                                        <div><div className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1">{t('En Stock')}</div><div className={`font-black text-2xl ${st >= d.quantiteDemandee ? 'text-emerald-600 dark:text-emerald-400 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-400 dark:text-rose-300'}`}>{st.toFixed(0)} <span className="text-sm font-medium">{p?.unite}</span></div></div>
                                                    </div>

                                                    {d.statut === 'attente' && (
                                                        <div className="flex gap-2 w-full md:w-auto flex-col sm:flex-row">
                                                            <button onClick={() => {
                                                                if (st < d.quantiteDemandee) return alert(t('Stock insuffisant ! Veuillez approvisionner.'));
                                                                setTab('bureau');
                                                                setBMode('sortie');
                                                                if (p) setBPid(p.id);
                                                                setBQty(d.quantiteDemandee.toString());
                                                                setBModele(d.modelId);
                                                                setBNotes(`Sortie générée pour la Demande depuis ${d.demandeur}`);
                                                                setDemandes?.(ds => ds.map(x => x.id === d.id ? { ...x, statut: 'preparee' } : x));
                                                            }} className="flex-1 md:flex-none px-6 py-3 bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white font-black text-sm rounded-xl hover:bg-indigo-700 dark:hover:bg-dk-accent-hover shadow-sm dark:shadow-dk-sm shadow-indigo-200 dark:shadow-indigo-900/30 transition-all active:scale-95">{t('Préparer')}</button>
                                                            <button onClick={() => setDemandes?.(ds => ds.map(x => x.id === d.id ? { ...x, statut: 'rejetee' } : x))} className="flex-1 md:flex-none px-4 py-3 bg-white dark:bg-dk-surface border-2 border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-black text-sm rounded-xl hover:border-rose-200 dark:border-rose-800 hover:text-rose-600 dark:text-rose-300 transition-all active:scale-95">{t('Refuser')}</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ══ Base ══ */}
                {tab === 'db' && (
                    <div className="space-y-4">
                        <div className="flex gap-2 flex-wrap items-center bg-white dark:bg-dk-surface p-2 rounded-xl border border-slate-200 dark:border-dk-border">
                            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-dk-muted" /><input className="w-full pl-9 pr-3 py-2 text-sm outline-none" placeholder={t("Rechercher (Nom, Réf, Emplacement)...")} value={search} onChange={e => setSearch(e.target.value)} /></div>
                            <select className="px-3 py-2 text-sm bg-slate-50 dark:bg-dk-bg border rounded-lg font-bold text-slate-600 dark:text-dk-text-soft" value={catFilter} onChange={e => setCatFilter(e.target.value)}><option value="all">{t('Catégories')}</option>{CATS.map(c => <option key={c} value={c}>{t(c)}</option>)}</select>
                            <button onClick={downloadCSV} className="px-3 py-2 border rounded-lg hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex gap-2 items-center text-sm font-bold text-slate-600 dark:text-dk-text-soft"><Download className="w-4 h-4" /> {t('CSV')}</button>
                            <button onClick={() => setProdModal({ open: true })} className="bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white px-4 py-2 rounded-lg font-black text-sm hover:bg-indigo-700 dark:hover:bg-dk-accent-hover flex gap-2 items-center"><Plus className="w-4 h-4" /> {t('Ajouter')}</button>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filtered.map(p => {
                                const st = stockQty(lots, p.id);
                                const frsExtra = !!(p.fournisseurEmail || p.fournisseurAdresse || p.fournisseurIce || p.fournisseurRc || p.fournisseurConditionsPaiement || p.fournisseurDelaiLivraisonJours != null || p.fournisseurMoq != null || p.fournisseurDevise || p.fournisseurContact || p.fournisseurNotes);
                                return (
                                        <div 
                                            key={p.id} 
                                            className="bg-white dark:bg-dk-surface rounded-2xl border shadow-sm dark:shadow-dk-sm p-4 hover:shadow-md transition-shadow relative overflow-hidden cursor-pointer group" 
                                            onClick={() => setSelectedProductForDetail(p)}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                setContextMenu({ x: e.clientX, y: e.clientY, pid: p.id });
                                            }}
                                        >
                                         <div className={`absolute top-0 inset-x-0 h-1 ${st === 0 ? 'bg-red-500 dark:bg-red-700' : st <= p.stockAlerte ? 'bg-amber-400 dark:bg-amber-800' : 'bg-emerald-400 dark:bg-emerald-800'}`} />
                                         <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                             <div className="bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg dark:shadow-dk-lg">
                                                 Voir détails
                                             </div>
                                         </div>
                                         <div className="flex gap-4">
                                             <div className="w-16 h-16 bg-slate-100 dark:bg-dk-elevated/60 rounded-xl overflow-hidden shrink-0" onClick={(e) => { e.stopPropagation(); setProdModal({ open: true, item: p }); }}>{p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <Package className="w-8 h-8 m-4 text-slate-300 dark:text-dk-muted" />}</div>
                                             <div className="flex-1 min-w-0">
                                                 <div className="flex justify-between items-start"><h3 className="font-black text-slate-800 dark:text-dk-text text-lg truncate pr-2">{p.designation}</h3><StockBadge stock={st} seuil={p.stockAlerte} /></div>
                                                 <div className="text-xs text-slate-500 dark:text-dk-muted font-mono mt-0.5">{p.reference}</div>
                                                 <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                     {p.emplacement && <span className="text-[10px] font-bold bg-slate-100 dark:bg-dk-elevated/60 text-slate-600 dark:text-dk-text-soft px-2 py-0.5 rounded-md flex items-center gap-1"><MapPin className="w-3 h-3" /> {p.emplacement}</span>}
                                                     {p.fournisseurNom && (
                                                         <span
                                                             onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 setSelectedProductForDetail(p);
                                                                 setDetailInitialTab('supplier');
                                                                 setDetailStartEditing(true);
                                                             }}
                                                             className="text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300 px-2 py-0.5 rounded-md flex items-center gap-1 h-6 cursor-pointer hover:bg-indigo-100 dark:bg-indigo-900/40"
                                                             title="Modifier le fournisseur"
                                                         >
                                                             <Building2 className="w-3 h-3" />
                                                             {p.fournisseurLogo && <img src={p.fournisseurLogo} alt="" className="w-4 h-4 object-contain" />}
                                                             {p.fournisseurNom}
                                                         </span>
                                                     )}
                                                     {frsExtra && <span className="text-[10px] font-bold bg-slate-100 dark:bg-dk-elevated/60 text-slate-600 dark:text-dk-text-soft px-2 py-0.5 rounded-md" title={tx(lang, {fr: 'Infos fournisseur détaillées', ar: 'معلومات المورد التفصيلية', en: 'Detailed supplier info', es: 'Información detallada del proveedor', pt: 'Informações detalhadas do fornecedor', tr: 'Detaylı tedarikçi bilgisi'})}>+ détails</span>}
                                                 </div>
                                             </div>
                                         </div>

                                         {/* Bains de teinture visuels */}
                                         {(p.categorie === 'tissu' || p.categorie === 'fil') && (() => {
                                            const activeLots = lots.filter(l => l.productId === p.id && l.quantiteRestante > 0 && l.numBain);
                                            if (activeLots.length === 0) return null;

                                            const baths = activeLots.reduce((acc, l) => {
                                                acc[l.numBain!] = (acc[l.numBain!] || 0) + l.quantiteRestante;
                                                return acc;
                                            }, {} as Record<string, number>);

                                            // Simple hash to generate consistent colors based on the bain string
                                            const colors = ['bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300 border-indigo-200 dark:border-indigo-800', 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800', 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 border-purple-200 dark:border-purple-800', 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800', 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 border-cyan-200 dark:border-cyan-800'];

                                            return (
                                                <div className="mt-4 pt-3 border-t border-dashed border-slate-200 dark:border-dk-border">
                                                    <div className="text-[10px] text-slate-400 dark:text-dk-muted font-bold uppercase mb-2">{t('Bains Disponibles')}</div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {Object.entries(baths).sort((a, b) => b[1] - a[1]).map(([bain, q], idx) => {
                                                            const colorClass = colors[bain.length % colors.length];
                                                            return (
                                                                <div key={bain} className={`text-xs font-black px-2 py-1 rounded border ${colorClass} flex items-center justify-between min-w-[100px] shadow-sm dark:shadow-dk-sm`}>
                                                                    <span>#{bain}</span>
                                                                    <span className="opacity-80 ml-2">{q.toFixed(1)} <span className="text-[10px]">{p.unite}</span></span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        <div className="mt-3 pt-2 border-t border-slate-100 dark:border-dk-border/60 flex items-center justify-between">
                                             <div><div className="text-[10px] text-slate-400 dark:text-dk-muted font-bold uppercase">{t('Stock Réel')}</div><div className="font-black text-lg">{st.toFixed(1)} <span className="text-xs font-medium">{p.unite}</span></div></div>
                                         </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {contextMenu && (
                    <div 
                        className="fixed z-[9999] bg-white dark:bg-dk-surface rounded-xl shadow-2xl dark:shadow-dk-elevated border border-slate-200 dark:border-dk-border overflow-hidden text-sm w-48 animate-in fade-in zoom-in-95 duration-100"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button onClick={() => { setTab('bureau'); setBMode('entree'); setBPid(contextMenu.pid); setContextMenu(null); }} className="w-full text-left px-4 py-3 hover:bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-bold border-b border-slate-100 dark:border-dk-border/60 flex items-center gap-2 shadow-sm dark:shadow-dk-sm"><ArrowDownCircle className="w-4 h-4" /> {t('Entrée')}</button>
                        <button onClick={() => { setTab('bureau'); setBMode('sortie'); setBPid(contextMenu.pid); setContextMenu(null); }} className="w-full text-left px-4 py-3 hover:bg-indigo-50 dark:bg-dk-accent/20 dark:bg-indigo-900/30 text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300 font-bold border-b border-slate-100 dark:border-dk-border/60 flex items-center gap-2 shadow-sm dark:shadow-dk-sm"><ArrowUpCircle className="w-4 h-4" /> {t('Sortie')}</button>
                        <button onClick={() => { setTab('bureau'); setBMode('rebut'); setBPid(contextMenu.pid); setContextMenu(null); }} className="w-full text-left px-4 py-3 hover:bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 font-bold border-b border-slate-100 dark:border-dk-border/60 flex items-center gap-2 shadow-sm dark:shadow-dk-sm"><Trash2 className="w-4 h-4" /> {t('Rebut')}</button>
                        <button onClick={() => { setTab('bureau'); setBMode('retour_atelier'); setBPid(contextMenu.pid); setContextMenu(null); }} className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold flex items-center gap-2"><RefreshCw className="w-4 h-4" /> {t('Retour')}</button>
                    </div>
                )}

                {/* ══ Bureau ══ */}
                {tab === 'bureau' && (
                    <div className="space-y-6">
                        {/* Bureau Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-black text-slate-800 dark:text-dk-text">{t('Bureau Magasin')}</h2>
                                <p className="text-sm text-slate-500 dark:text-dk-muted font-bold">{t('Enregistrez vos entrées et sorties de stock')}</p>
                            </div>
                            <button
                                onClick={() => setShowInvoiceSettings(true)}
                                className="flex items-center gap-2 px-4 py-2.5 border-2 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300 hover:bg-indigo-50 dark:bg-dk-accent/20 dark:bg-indigo-900/30 rounded-xl font-black text-sm transition-all group"
                                title={t('Configurer le modèle Facture / Bon de Livraison')}
                            >
                                <FileText className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                {t('Paramètres Facture / BL')}
                            </button>
                        </div>

                        {bSuccess && <div className="p-4 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-xl font-bold flex gap-2"><CheckCircle className="w-5 h-5" />{bSuccess}</div>}

                        <div className="grid lg:grid-cols-2 gap-6">
                            {/* Action Form */}
                            <div className="bg-white dark:bg-dk-surface rounded-2xl border shadow-sm dark:shadow-dk-sm">
                                <div className="grid grid-cols-3 divide-x divide-y border-b text-xs sm:text-sm">
                                    <button onClick={() => setBMode('entree')} className={`col-span-1 p-3 font-black flex flex-col gap-1 items-center justify-center ${bMode === 'entree' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}><ArrowDownCircle className="w-5 h-5" /> {t('Entrée')}</button>
                                    <button onClick={() => setBMode('sortie')} className={`col-span-1 p-3 font-black flex flex-col gap-1 items-center justify-center ${bMode === 'sortie' ? 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300' : 'text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}><ArrowUpCircle className="w-5 h-5" /> {t('Sortie')}</button>
                                    <button onClick={() => setBMode('regularisation')} className={`col-span-1 p-3 font-black flex flex-col gap-1 items-center justify-center border-t md:border-t-0 md:border-l ${bMode === 'regularisation' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}><Scale className="w-5 h-5" /> {t('Inventaire')}</button>
                                    <button onClick={() => setBMode('retour_atelier')} className={`col-span-1 p-3 font-black flex flex-col gap-1 items-center justify-center border-t border-slate-200 dark:border-dk-border ${bMode === 'retour_atelier' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}><RefreshCw className="w-5 h-5" /> {t('Retour')}</button>
                                    <button onClick={() => setBMode('rebut')} className={`col-span-1 p-3 font-black flex flex-col gap-1 items-center justify-center border-t border-slate-200 dark:border-dk-border ${bMode === 'rebut' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300' : 'text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}><Trash2 className="w-5 h-5" /> {t('Déchets')}</button>
                                    <button onClick={() => setBMode('reservation')} className={`col-span-1 p-3 font-black flex flex-col gap-1 items-center justify-center border-t border-slate-200 dark:border-dk-border ${bMode === 'reservation' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700' : 'text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated/60'}`}><Package className="w-5 h-5" /> {t('Réserver')}</button>
                                </div>
                                <div className="p-6 space-y-5">
                                    {!bMode ? <div className="py-20 text-center text-slate-400 dark:text-dk-muted font-bold bg-slate-50 dark:bg-dk-bg/50 rounded-xl my-2 border-2 border-dashed border-slate-100 dark:border-dk-border/60"><ArrowUpCircle className="w-12 h-12 mx-auto mb-3 opacity-20 text-indigo-400 dark:text-indigo-300" />{t("Sélectionnez un type d'opération")}</div> : (
                                        <>
                                            <div className="flex gap-2 relative">
                                                <div className="flex-1">
                                                    <Lbl t={t("Rechercher produit")} />
                                                    <CustomProductSelect 
                                                        value={bPid} 
                                                        onChange={setBPid} 
                                                        products={products} 
                                                        lots={lots} 
                                                        t={t} 
                                                    />
                                                </div>
                                                <button onClick={() => setScannerMode(!scannerMode)} className={`px-4 rounded-xl border-2 font-black transition-colors ${scannerMode ? 'bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 border-indigo-600 dark:border-indigo-800 text-white' : 'bg-white dark:bg-dk-surface text-slate-600 dark:text-dk-text-soft hover:border-slate-300 dark:border-dk-border'}`}><Barcode className="w-5 h-5" /></button>
                                            </div>
                                            {scannerMode && <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-xl animate-pulse"><input autoFocus placeholder={t("Flashez le code-barres...")} className="w-full bg-transparent text-center font-black outline-none" onChange={handleScan} /></div>}

                                            {bureauProduct && (
                                                <div className="space-y-4">
                                                    {bureauProduct.emplacement && <div className="bg-slate-100 dark:bg-dk-elevated/60 text-slate-700 dark:text-dk-text px-3 py-2 rounded-lg text-xs font-bold flex gap-2"><MapPin className="w-4 h-4" /> {t("À prendre au :")} {bureauProduct.emplacement}</div>}

                                                    <div className="flex gap-4">
                                                        <div className="flex-1"><Lbl t={bMode === 'regularisation' ? t('Quantité Réelle Constatée') : `${t('Quantité')} (${bureauProduct.unite})`} /><input className={inp + ' text-xl font-black'} type="number" min="0" value={bQty} onChange={e => setBQty(e.target.value.replace(/-/g, ''))} autoFocus />
                                                            {bMode !== 'regularisation' && <div className="flex gap-1 mt-1">{[10, 50, 100].map(q => <button key={q} onClick={() => setBQty(q.toString())} className="px-2 py-1 text-xs border rounded hover:bg-slate-50 dark:hover:bg-dk-elevated/60 font-bold">+{q}</button>)}</div>}
                                                        </div>
                                                        {bMode === 'entree' && <div className="w-1/3"><Lbl t={t("N° Bain/Lot (Teinture)")} /><input className={inp} placeholder="TEIN-..." value={bNumBain} onChange={e => setBNumBain(e.target.value)} /></div>}
                                                    </div>

                                                    {(bMode === 'entree' || bMode === 'retour_atelier') && <div className="grid grid-cols-2 gap-3"><div><Lbl t={t("Prix Unitaire (CUMP)")} /><input type="number" min="0" step="0.01" className={inp} value={bPrix} onChange={e => setBPrix(e.target.value.replace(/-/g, ''))} /></div><div><Lbl t={t("Fournisseur")} /><input className={inp} value={bFournisseur} onChange={e => setBFournisseur(e.target.value)} placeholder={t("Nom du fournisseur")} /></div></div>}
                                                    {bMode === 'sortie' && <div className="grid grid-cols-2 gap-3"><div><Lbl t={t("Destination / Atelier")} /><input className={inp} value={bChaine} onChange={e => setBChaine(e.target.value)} placeholder={t("Chaîne / Atelier")} /></div><div><Lbl t={t("Fournisseur (Origine)")} /><input className={inp} value={bFournisseur} onChange={e => setBFournisseur(e.target.value)} placeholder={t("Fournisseur d'origine")} /></div></div>}

                                                    {(bMode === 'sortie' || bMode === 'reservation' || bMode === 'rebut') && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            {bMode !== 'rebut' && <div><Lbl t={t("Chaîne")} /><input className={`${inp} ${bureauProduct.chaineExclusive ? 'bg-[#f5f3ff] dark:bg-dk-elevated' : ''}`} value={bChaine} onChange={e => setBChaine(e.target.value)} readOnly={!!bureauProduct.chaineExclusive} /></div>}
                                                            <div><Lbl t={t("Ordre de Fab. (OF)")} /><input className={inp} value={bModele} onChange={e => setBModele(e.target.value)} /></div>
                                                            <div className="col-span-2 flex border rounded-xl overflow-hidden mt-1 text-sm font-bold">
                                                                <button onClick={() => setBMethod('FIFO')} className={`flex-1 py-1.5 ${bMethod === 'FIFO' ? 'bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white' : 'bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted hover:bg-slate-100'}`}>{t('FIFO (Premier entré)')}</button>
                                                                <button onClick={() => setBMethod('LIFO')} className={`flex-1 py-1.5 ${bMethod === 'LIFO' ? 'bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white' : 'bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted hover:bg-slate-100'}`}>{t('LIFO (Dernier entré)')}</button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Pièces Justificatives (Facture / BL) */}
                                                    {(bMode === 'entree' || bMode === 'sortie' || bMode === 'retour_atelier') && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-dk-border/60">
                                                            <div>
                                                                <Lbl t={t("N° Bon / Facture (Optionnel)")} />
                                                                <input className={inp} value={bDocumentRef} onChange={e => setBDocumentRef(e.target.value)} placeholder="Ex: BL-2024-001" />
                                                            </div>
                                                            <div>
                                                                <Lbl t={t("Scanner / Joindre Document")} />
                                                                <input type="file" className="block w-full text-sm text-slate-500 dark:text-dk-muted file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 dark:bg-dk-accent/20 dark:bg-indigo-900/30 file:text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300 hover:file:bg-indigo-100 dark:bg-indigo-900/40 border border-slate-200 dark:border-dk-border rounded-xl bg-slate-50 dark:bg-dk-bg" accept="image/*,application/pdf" onChange={e => {
                                                                    const f = e.target.files?.[0];
                                                                    if (f) {
                                                                        const reader = new FileReader();
                                                                        reader.onload = () => setBPieceJointe(reader.result as string);
                                                                        reader.readAsDataURL(f);
                                                                    } else setBPieceJointe('');
                                                                }} />
                                                            </div>
                                                        </div>
                                                    )}

                                                    <button onClick={submitAction} className={`w-full py-3 rounded-xl font-black text-white text-lg ${(bMode === 'entree' || bMode === 'retour_atelier') ? 'bg-emerald-600 dark:bg-emerald-700 hover:bg-emerald-700' : bMode === 'reservation' ? 'bg-purple-600 dark:bg-purple-700 hover:bg-purple-700' : (bMode === 'sortie' || bMode === 'rebut') ? 'bg-rose-600 dark:bg-rose-700 hover:bg-rose-700' : 'bg-amber-50 dark:bg-amber-900/300 hover:bg-amber-600'}`}>{t("Valider l'Opération")}</button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Right Panel: Lots & History */}
                            <div className="space-y-6 flex flex-col h-full">
                                {bPid && (
                                    <div className="bg-white dark:bg-dk-surface rounded-2xl border shadow-sm dark:shadow-dk-sm">
                                        <div className="px-4 py-2 bg-slate-50 dark:bg-dk-bg border-b font-bold text-sm text-slate-600 dark:text-dk-text-soft flex justify-between"><span className="flex items-center gap-1"><Layers className="w-4 h-4" /> {t("Détail des Lots")}</span><span>{t("Traçabilité")}</span></div>
                                        <div className="max-h-[220px] overflow-y-auto divide-y text-sm">
                                            {lots.filter(l => l.productId === bPid && l.quantiteRestante > 0).map((l, i) => (
                                                <div key={l.id} className="p-3 flex justify-between items-center">
                                                    <div><div className="font-bold text-slate-700 dark:text-dk-text">{new Date(l.dateEntree).toLocaleDateString()}</div><div className="text-xs text-slate-400 dark:text-dk-muted">{l.fournisseur || '—'} {l.numBain && <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300 px-1 ml-1 rounded">{t("Bain:")} {l.numBain}</span>}</div></div>
                                                    <div className="text-right font-black text-emerald-600 dark:text-emerald-400 dark:text-emerald-300 text-lg">{l.quantiteRestante.toFixed(1)}</div>
                                                </div>
                                            ))}
                                            {lots.filter(l => l.productId === bPid && l.quantiteRestante > 0).length === 0 && <div className="p-4 text-center text-slate-400 dark:text-dk-muted font-bold">{t("Aucun lot disponible.")}</div>}
                                        </div>
                                    </div>
                                )}
                                <div className="bg-white dark:bg-dk-surface rounded-2xl border shadow-sm dark:shadow-dk-sm flex-1 overflow-hidden flex flex-col">
                                    <div className="px-4 py-3 border-b font-bold text-slate-800 dark:text-dk-text flex items-center justify-between">
                                        <span className="flex items-center gap-2"><History className="w-4 h-4 text-indigo-500 dark:text-indigo-300" /> {t("Registre des Mouvements")}</span>
                                        <button onClick={() => setShowInvoiceSettings(true)} className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:text-dk-accent-text dark:text-indigo-300 hover:bg-indigo-50 dark:bg-dk-accent/20 dark:bg-indigo-900/30 rounded-lg transition-colors" title={t('Configurer le modèle Facture / BL')}>
                                            <Settings className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto divide-y max-h-[300px]">
                                        {mvts.map(m => (
                                            <div key={m.id} className="p-3 flex gap-3 text-sm">
                                                <div className={`mt-0.5 w-6 h-6 rounded flex items-center justify-center shrink-0 ${m.type === 'entree' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 dark:text-emerald-300' : m.type === 'sortie' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 dark:text-rose-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 dark:text-amber-300'}`}>{m.type === 'entree' ? <TrendingDown className="w-3 h-3" /> : m.type === 'sortie' ? <TrendingUp className="w-3 h-3" /> : <Scale className="w-3 h-3" />}</div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between font-bold">
                                                        <span className="truncate pr-2">{products.find(p => p.id === m.productId)?.designation || t('Inconnu')}</span>
                                                        <div className="flex gap-2 items-center">
                                                            {m.pieceJointe && <button title={t("Voir Document")} onClick={() => { const win = window.open(); if (win) win.document.write(`<img src="${m.pieceJointe}" style="max-width:100%"/>`); }} className="hover:bg-slate-100 p-0.5 rounded text-indigo-500 dark:text-indigo-300"><Paperclip className="w-3.5 h-3.5" /></button>}
                                                            <span className={m.type === 'entree' ? 'text-emerald-600 dark:text-emerald-400 dark:text-emerald-300' : m.type === 'sortie' ? 'text-rose-600 dark:text-rose-400 dark:text-rose-300' : 'text-amber-600 dark:text-amber-400 dark:text-amber-300'}>{m.type === 'sortie' ? '-' : '+'}{m.quantite}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between mt-1 items-end">
                                                            <div className="text-xs text-slate-500 dark:text-dk-muted">
                                                             {m.type === 'entree' ? m.fournisseurId : m.type === 'sortie' ? `${m.fournisseurId ? `${m.fournisseurId} → ` : ''}Vers ${m.chaineId} (OF: ${m.modeleRef})` : m.type === 'regularisation' ? m.notes : `Vers ${m.chaineId} (OF: ${m.modeleRef})`}
                                                            {m.documentRef && <div className="text-[10px] font-bold text-indigo-500 dark:text-indigo-300 mt-0.5">{t("Réf:")} {m.documentRef}</div>}
                                                        </div>
                                                        <button onClick={() => setPrinterMvt(m)} className="p-1 hover:bg-slate-100 rounded text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:text-dk-accent-text dark:text-indigo-300 transition-colors" title={t("Imprimer / Aperçu de Facure / BL")}><Printer className="w-4 h-4" /></button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══ Commandes ══ */}
                {tab === 'commandes' && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="flex justify-between items-center bg-white dark:bg-dk-surface p-4 rounded-2xl border shadow-sm dark:shadow-dk-sm">
                            <div><h2 className="text-xl font-black text-slate-800 dark:text-dk-text flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-500 dark:text-indigo-300" /> {t('Bons de Commande')}</h2><p className="text-sm text-slate-500 dark:text-dk-muted font-bold">{t('Gérez vos réapprovisionnements fournisseurs')}</p></div>
                            <button onClick={() => {
                                const newBc: BonCommande = { id: uid(), numero: `BC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`, fournisseurNom: t('Nouveau Fournisseur'), dateCreation: new Date().toISOString(), lignes: [], statut: 'brouillon' };
                                saveCommande(newBc);
                            }} className="bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 hover:bg-indigo-700 dark:hover:bg-dk-accent-hover text-white px-5 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 transition-transform active:scale-95"><Plus className="w-5 h-5" /> {t('Nouveau BC')}</button>
                        </div>

                        {commandes.length === 0 ? (
                            <div className="text-center py-20 bg-white dark:bg-dk-surface rounded-3xl border border-dashed border-slate-300 dark:border-dk-border"><FileText className="w-16 h-16 text-slate-200 dark:text-dk-muted mx-auto mb-4" /><h3 className="text-lg font-black text-slate-800 dark:text-dk-text">{t('Aucun Bon de Commande')}</h3><p className="text-slate-500 dark:text-dk-muted font-bold text-sm">{t('Créez votre premier BC pour réapprovisionner votre stock.')}</p></div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                                {commandes.map(c => (
                                    <div key={c.id} className="bg-white dark:bg-dk-surface rounded-2xl border shadow-sm dark:shadow-dk-sm overflow-hidden flex flex-col relative group">
                                        <div className={`h-1.5 w-full ${c.statut === 'brouillon' ? 'bg-slate-300 dark:bg-dk-elevated' : c.statut === 'envoye' ? 'bg-amber-400 dark:bg-amber-800' : c.statut === 'valide' ? 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/300' : 'bg-emerald-50 dark:bg-emerald-900/300'}`} />
                                        <div className="p-5 flex-1 space-y-4">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="font-black text-slate-800 dark:text-dk-text text-lg">{c.numero}</div>
                                                    <div className="text-xs font-bold text-slate-400 dark:text-dk-muted flex items-center gap-1 mt-1"><Building2 className="w-3 h-3" /> {c.fournisseurNom}</div>
                                                </div>
                                                <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg ${c.statut === 'brouillon' ? 'bg-slate-100 dark:bg-dk-elevated/60 text-slate-600 dark:text-dk-text-soft' : c.statut === 'envoye' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' : c.statut === 'valide' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'}`}>{c.statut}</span>
                                            </div>

                                            <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-3 border border-slate-100 dark:border-dk-border/60 space-y-2">
                                                <div className="flex justify-between text-xs font-bold"><span className="text-slate-400 dark:text-dk-muted">{t('Date de création')}</span><span className="text-slate-700 dark:text-dk-text">{new Date(c.dateCreation).toLocaleDateString()}</span></div>
                                                <div className="flex justify-between text-xs font-bold"><span className="text-slate-400 dark:text-dk-muted">{t('Total estimé')}</span><span className="text-slate-800 dark:text-dk-text font-black">{(c.total || 0).toLocaleString()} DH</span></div>
                                                <div className="text-xs font-bold text-slate-500 dark:text-dk-muted pt-2 border-t border-slate-200 dark:border-dk-border">{c.lignes.length} {c.lignes.length === 1 ? t('article') : t('articles')} {t('dans ce bon')}</div>
                                            </div>
                                        </div>
                                        <div className="p-3 border-t bg-slate-50 dark:bg-dk-bg flex gap-2">
                                            <button onClick={() => setBcModal({ open: true, item: c })} className="flex-1 py-2 bg-white dark:bg-dk-surface border rounded-lg text-xs font-black text-slate-700 dark:text-dk-text hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex justify-center items-center gap-2 transition-colors"><Edit2 className="w-3 h-3" /> {t('Éditer')}</button>
                                            <button onClick={() => window.print()} className="py-2 px-3 bg-white dark:bg-dk-surface border rounded-lg text-xs font-black text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:text-dk-accent-text dark:text-indigo-300 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex justify-center items-center transition-colors"><Printer className="w-4 h-4" /></button>
                                            <button className="py-2 px-3 bg-white dark:bg-dk-surface border rounded-lg text-xs font-black text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:bg-rose-900/30 flex justify-center items-center transition-colors" onClick={() => { if (confirm(t('Supprimer ce Bon ?'))) deleteCommande(c.id); }}><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ══ Inventaire Tournant ══ */}
                {tab === 'inventaire' && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 max-w-4xl mx-auto">
                        <div className="bg-white dark:bg-dk-surface p-6 rounded-3xl border shadow-sm dark:shadow-dk-sm">
                            <div className="flex items-center justify-between gap-4 mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 dark:text-emerald-300 rounded-2xl flex items-center justify-center"><RefreshCw className="w-6 h-6" /></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-800 dark:text-dk-text">{t('Inventaire Tournant')}</h2>
                                    </div>
                                </div>
                                <button onClick={downloadCSV} className="px-3 py-2 border rounded-lg hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex gap-2 items-center text-sm font-bold text-slate-600 dark:text-dk-text-soft" title="Exporter l'inventaire en CSV"><Download className="w-4 h-4" /> CSV</button>
                            </div>
                            <p className="text-slate-500 dark:text-dk-muted font-bold mb-6 max-w-md">{t("Vérifiez régulièrement l'exactitude de votre stock sans bloquer l'entrepôt en comptant une petite sélection d'articles.")}</p>

                            {!invSession && (
                                <button onClick={() => {
                                    if (products.length === 0) return alert(t('Aucun produit dans la base.'));
                                    const shuffled = [...products].sort(() => 0.5 - Math.random());
                                    const selected = shuffled.slice(0, Math.min(5, products.length));
                                    setInvSession({ id: uid(), items: selected.map(p => ({ pid: p.id, qty: '' })) });
                                }} className="bg-emerald-600 dark:bg-emerald-700 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 mx-auto transition-transform active:scale-95"><RefreshCw className="w-5 h-5" /> {t('Générer une Session (5 articles)')}</button>
                            )}
                        </div>

                        {invSession && (
                            <div className="bg-white dark:bg-dk-surface rounded-3xl border shadow-sm dark:shadow-dk-sm overflow-hidden flex flex-col">
                                <div className="p-4 bg-slate-50 dark:bg-dk-bg border-b flex justify-between items-center">
                                    <div className="font-bold text-slate-700 dark:text-dk-text">{t("Session d'inventaire #")}{invSession.id.toUpperCase()}</div>
                                    <button onClick={() => { if (confirm(t('Annuler cette session ?'))) setInvSession(null); }} className="text-rose-500 dark:text-rose-300 hover:text-rose-600 dark:text-rose-300 font-bold text-sm bg-rose-50 dark:bg-rose-900/30 px-3 py-1 rounded-lg">{t('Annuler')}</button>
                                </div>

                                <div className="divide-y divide-slate-100 dark:divide-dk-border">
                                    {invSession.items.map((item, idx) => {
                                        const p = products.find(x => x.id === item.pid);
                                        const st = p ? stockQty(lots, p.id) : 0;
                                        return (
                                            <div key={item.pid} className="p-4 md:p-6 flex flex-col md:flex-row gap-4 md:items-center hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
                                                <div className="font-black text-slate-300 dark:text-dk-muted text-2xl w-8">{idx + 1}</div>
                                                <div className="flex-1">
                                                    <h3 className="font-black text-lg text-slate-800 dark:text-dk-text">{p?.designation || t('Article Inconnu')}</h3>
                                                    <div className="text-xs text-slate-400 dark:text-dk-muted font-mono mt-1">{p?.reference} • {t('Emplacement:')} <span className="text-slate-700 dark:text-dk-text font-bold">{p?.emplacement || t('Non défini')}</span></div>
                                                </div>
                                                <div className="bg-slate-100 dark:bg-dk-elevated/60 rounded-xl p-3 flex gap-4 text-center items-center shadow-inner">
                                                    <div>
                                                        <div className="text-[10px] font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest mb-1">{t('Théorique')}</div>
                                                        <div className="font-black text-lg text-slate-500 dark:text-dk-muted">{st.toFixed(1)} <span className="text-xs">{p?.unite}</span></div>
                                                    </div>
                                                    <div className="w-px h-8 bg-slate-200 dark:bg-dk-border" />
                                                    <div>
                                                        <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 dark:text-emerald-300 uppercase tracking-widest mb-1">{t('Comptage Réel')}</div>
                                                        <input autoFocus={idx === 0} type="number" className="w-24 border-2 border-emerald-200 dark:border-emerald-800 rounded-lg px-2 py-1 text-center font-black text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 focus:outline-none focus:border-emerald-500" placeholder="0" value={item.qty} onChange={e => {
                                                            const n = [...invSession.items];
                                                            n[idx].qty = e.target.value;
                                                            setInvSession({ ...invSession, items: n });
                                                        }} /> <span className="text-xs font-bold text-slate-400 dark:text-dk-muted">{p?.unite}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="p-4 bg-slate-50 dark:bg-dk-bg border-t">
                                    <button onClick={() => {
                                        let newMvts = [...mvts];
                                        let newLots = [...lots];
                                        let count = 0;
                                        invSession.items.forEach(item => {
                                            if (item.qty === '') return;
                                            const rq = parseFloat(item.qty);
                                            if (isNaN(rq) || rq < 0) return;
                                            const p = products.find(x => x.id === item.pid);
                                            if (!p) return;
                                            const st = stockQty(newLots, p.id);
                                            const diff = rq - st;
                                            if (diff !== 0) {
                                                const m: MouvementStock = { id: uid(), productId: p.id, type: 'regularisation', quantite: Math.abs(diff), prixUnitaire: p.cump || p.prixUnitaire, date: new Date().toISOString(), notes: `Inventaire Tournant (Théo: ${st}, Réel: ${rq})`, source: 'inventaire', destination: 'inventaire' };
                                                if (diff > 0) newLots.push({ id: uid(), productId: p.id, quantiteInitiale: diff, quantiteRestante: diff, prixUnitaire: p.cump || p.prixUnitaire, dateEntree: m.date });
                                                else newLots = deductLots(newLots, p.id, Math.abs(diff), 'FIFO');
                                                newMvts.unshift(m);
                                                count++;
                                            }
                                        });
                                        if (count > 0) { setLots(newLots); setMvts(newMvts); alert(`${count} ${t('articles mis à jour avec succès !')}`); }
                                        else alert(t('Aucun écart constaté. Inventaire validé.'));
                                        setInvSession(null);
                                    }} className="w-full py-4 bg-emerald-600 dark:bg-emerald-700 text-white font-black text-lg rounded-2xl hover:bg-emerald-700 flex items-center justify-center gap-2 shadow-lg dark:shadow-dk-lg shadow-emerald-200 dark:shadow-emerald-900/30 transition-transform active:scale-95"><CheckCircle className="w-6 h-6" /> {t("Valider l'inventaire complet")}</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ══ Alertes ══ */}
                {tab === 'alertes' && (() => {
                    // Calcul des besoins de production
                    const modelNeeds = models.filter(m => m.ficheData?.materials && m.ficheData.materials.length > 0).map(m => {
                        const targetQty = m.meta_data.quantity || 1;
                        const shortages = m.ficheData!.materials!.map((mat: any) => {
                            const rawNeeded = mat.qty * targetQty;
                            const needed = (mat.unit === 'bobine' || mat.unit === 'pc') ? Math.ceil(rawNeeded * 1.05) : parseFloat((rawNeeded * 1.05).toFixed(2));
                            const inMagasin = products.find(p => p.designation.toLowerCase() === mat.name.toLowerCase() || p.reference === mat.name);
                            const stock = inMagasin ? stockQty(lots, inMagasin.id) : 0;
                            return { ...mat, needed, stock, inMagasin, isSufficient: stock >= needed };
                        }).filter((x: any) => !x.isSufficient);
                        return { model: m, shortages };
                    }).filter(x => x.shortages.length > 0);

                    return (
                        <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
                            {/* Alertes Globales */}
                            <div>
                                <h3 className="text-lg font-black text-slate-800 dark:text-dk-text mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-rose-500 dark:text-rose-300" /> {t('Stocks Critiques (Base)')}
                                </h3>
                                {alertes.length === 0 ? (
                                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-emerald-100 dark:border-emerald-800/50 p-6 flex items-center gap-4 text-emerald-700 dark:text-emerald-300">
                                        <CheckCircle className="w-8 h-8 text-emerald-500 dark:text-emerald-300" />
                                        <div>
                                            <p className="font-black text-lg">{t('Aucune rupture critique.')}</p>
                                            <p className="text-sm font-bold opacity-80">{t("Tous les produits sont au/dessus de leur seuil d'alerte.")}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                        {alertes.map(p => {
                                            const st = stockQty(lots, p.id);
                                            return (
                                                <div key={p.id} className="bg-white dark:bg-dk-surface rounded-2xl border border-red-200 dark:border-red-800 overflow-hidden shadow-sm dark:shadow-dk-sm relative group hover:shadow-md transition-shadow">
                                                    <div className="absolute top-0 right-0 bg-red-500 dark:bg-red-700 text-white text-[10px] font-black px-2 py-0.5 rounded-bl-lg">{t('URGENCE ACHAT')}</div>
                                                    <div className="p-4 space-y-3">
                                                        <div className="font-black text-slate-800 dark:text-dk-text text-lg leading-tight mt-2 pr-4">{p.designation}</div>
                                                        <div className="text-xs text-slate-400 dark:text-dk-muted font-mono">{p.reference}</div>
                                                        <div className="bg-slate-50 dark:bg-dk-bg rounded-xl p-3 border border-slate-100 dark:border-dk-border/60"><div className="text-[10px] uppercase font-bold text-slate-400 dark:text-dk-muted">{t('Stock Actuel')}</div><div className="text-2xl font-black text-red-600 dark:text-red-400 dark:text-red-300">{st.toFixed(1)} <span className="text-sm">{p.unite}</span></div><div className="text-xs text-slate-400 dark:text-dk-muted mt-1">{t('Seuil:')} {p.stockAlerte} {p.unite}</div></div>
                                                        {p.fournisseurNom && <div className="text-xs font-bold text-slate-600 dark:text-dk-text-soft p-2 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 rounded-lg flex items-center gap-1 border border-indigo-100 dark:border-indigo-800/50"><Phone className="w-3 h-3 text-indigo-400 dark:text-indigo-300" /> {p.fournisseurNom}</div>}
                                                        <button onClick={() => { setTab('bureau'); setBPid(p.id); setBMode('entree'); }} className="w-full py-2 bg-slate-800 dark:bg-dk-elevated hover:bg-slate-700 text-white font-bold text-sm rounded-xl transition-colors">{t('Approvisionner')}</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Alertes Production (Besoins) */}
                            <div>
                                <h3 className="text-lg font-black text-slate-800 dark:text-dk-text mb-4 flex items-center gap-2">
                                    <Layers className="w-5 h-5 text-indigo-500 dark:text-indigo-300" /> {t('Besoins de Production (OF en cours)')}
                                </h3>
                                {modelNeeds.length === 0 ? (
                                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border p-6 flex flex-col items-center justify-center text-slate-400 dark:text-dk-muted min-h-[200px]">
                                        <CheckCircle className="w-12 h-12 text-slate-300 dark:text-dk-muted mb-3" />
                                        <p className="font-black text-lg text-slate-500 dark:text-dk-muted">{t('Stock suffisant pour la production.')}</p>
                                        <p className="text-sm font-bold mt-1">{t('Aucune rupture détectée pour les modèles en lancement.')}</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {modelNeeds.map((mn, i) => (
                                            <div key={i} className="bg-white dark:bg-dk-surface rounded-3xl border border-rose-200 dark:border-rose-800 shadow-sm dark:shadow-dk-sm overflow-hidden flex flex-col">
                                                <div className="bg-rose-50 dark:bg-rose-900/30 border-b border-rose-100 dark:border-rose-800/50 p-4 flex gap-4 items-center">
                                                    <div className="w-12 h-12 bg-white dark:bg-dk-surface rounded-xl shadow-sm dark:shadow-dk-sm overflow-hidden shrink-0">
                                                        {mn.model.images?.front || mn.model.image ? (
                                                            <img src={mn.model.images?.front || mn.model.image} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Package className="w-6 h-6 m-3 text-rose-300 dark:text-rose-200" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <h4 className="font-black text-slate-800 dark:text-dk-text text-lg leading-tight">{mn.model.meta_data.nom_modele}</h4>
                                                        <p className="text-xs font-bold text-slate-500 dark:text-dk-muted">{t('Objectif:')} <span className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300">{mn.model.meta_data.quantity || 0} {t('pcs')}</span></p>
                                                    </div>
                                                </div>
                                                <div className="p-4 space-y-4">
                                                    {mn.shortages.map((s: any, idx) => {
                                                        // Find a plan B (same category, different product, with enough stock)
                                                        const planB = s.inMagasin ? products.find(p => p.categorie === s.inMagasin.categorie && p.id !== s.inMagasin.id && stockQty(lots, p.id) >= s.needed) : null;

                                                        return (
                                                            <div key={idx} className="bg-slate-50 dark:bg-dk-bg border border-slate-100 dark:border-dk-border/60 rounded-2xl p-4">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <div className="font-black text-slate-800 dark:text-dk-text">{s.name}</div>
                                                                    <div className="text-[10px] font-black bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded uppercase">{t('Manquant')}</div>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                                                                    <div className="bg-white dark:bg-dk-surface rounded-lg p-2 border border-slate-100 dark:border-dk-border/60">
                                                                        <div className="text-[10px] text-slate-400 dark:text-dk-muted font-bold uppercase">{t('Besoin')}</div>
                                                                        <div className="font-black text-slate-700 dark:text-dk-text">{s.needed} {s.unit}</div>
                                                                    </div>
                                                                    <div className="bg-white dark:bg-dk-surface rounded-lg p-2 border border-slate-100 dark:border-dk-border/60">
                                                                        <div className="text-[10px] text-slate-400 dark:text-dk-muted font-bold uppercase">{t('En Magasin')}</div>
                                                                        <div className="font-black text-rose-600 dark:text-rose-400 dark:text-rose-300">{s.stock} {s.unit}</div>
                                                                    </div>
                                                                </div>

                                                                {/* Plan B Suggestion */}
                                                                <div className="mt-2 text-xs">
                                                                    {planB ? (
                                                                        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/50 text-emerald-800 p-2.5 rounded-xl flex gap-2 items-start">
                                                                            <RefreshCw className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 dark:text-emerald-300 mt-0.5" />
                                                                            <div>
                                                                                <span className="font-black block text-emerald-700 dark:text-emerald-300">{t('Suggestion Plan B :')}</span>
                                                                                {t('Remplacer par')} <strong>{planB.designation}</strong> ({t('En stock:')} {stockQty(lots, planB.id).toFixed(1)} {planB.unite})
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-100 dark:border-orange-800/50 text-orange-800 p-2.5 rounded-xl flex gap-2 items-start">
                                                                            <AlertTriangle className="w-4 h-4 shrink-0 text-orange-600 dark:text-orange-400 dark:text-orange-300 mt-0.5" />
                                                                            <div>
                                                                                <span className="font-black block text-orange-700 dark:text-orange-300">{t('Action requise :')}</span>
                                                                                {t('Aucune alternative (Plan B) trouvée en stock. Achat nécessaire.')}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* ══ Valorisation (Waste & Surplus) ══ */}
                {tab === 'valorisation' && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="flex gap-4 items-center flex-wrap">
                            <h2 className="text-xl font-black text-slate-800 dark:text-dk-text flex-1 flex items-center gap-2"><Recycle className="w-6 h-6 text-emerald-500 dark:text-emerald-300" /> {t('Valorisation : Déchets & Revente')}</h2>
                            <button onClick={() => alert(t("Fonctionnalité en cours de développement (Phase 6)."))} className="bg-emerald-600 dark:bg-emerald-700 text-white px-4 py-2 rounded-xl font-black text-sm hover:bg-emerald-700 shadow-sm dark:shadow-dk-sm flex items-center gap-2 transition-colors">
                                <Plus className="w-4 h-4" /> {t('Déclarer Nouveau Surplus')}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Chutes & Déchets */}
                            <div className="bg-white dark:bg-dk-surface rounded-3xl border shadow-sm dark:shadow-dk-sm p-6">
                                <h3 className="text-lg font-black text-slate-800 dark:text-dk-text mb-4 flex items-center gap-2"><Trash2 className="w-5 h-5 text-rose-500 dark:text-rose-300" /> {t('Chutes de Coupe (Tissu)')}</h3>
                                <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800/50 rounded-2xl p-6 text-center mb-6">
                                    <div className="text-4xl font-black text-rose-600 dark:text-rose-400 dark:text-rose-300 mb-2">345 <span className="text-lg">kg</span></div>
                                    <p className="text-sm font-bold text-rose-800 dark:text-rose-200">{t('Volume total de déchets accumulés ce mois.')}</p>
                                </div>
                                <div className="space-y-4">
                                    {[
                                        { date: 'Hier, 16:30', m: 'Tissu Jean Bleu', q: '42 kg', src: 'Atelier Coupe 1' },
                                        { date: '10 Mars, 11:00', m: 'Toile Coton Blanche', q: '15 kg', src: 'Atelier Coupe 2' },
                                        { date: '08 Mars, 09:15', m: 'Tissu Synthétique Noir', q: '28 kg', src: 'Atelier Coupe 1' }
                                    ].map((d, i) => (
                                        <div key={i} className="flex justify-between items-center p-3 hover:bg-slate-50 dark:hover:bg-dk-elevated/60 rounded-xl transition-colors border border-transparent hover:border-slate-100">
                                            <div>
                                                <p className="text-sm font-black text-slate-800 dark:text-dk-text">{d.m}</p>
                                                <p className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{d.date} • {d.src}</p>
                                            </div>
                                            <span className="font-black text-rose-600 dark:text-rose-400 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 px-2 py-1 rounded">{d.q}</span>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => alert(t("Opération de recyclage confirmée. Le lot a été déduit du compte de valorisation."))} className="w-full mt-6 py-3 border-2 border-dashed border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 dark:text-rose-300 font-bold rounded-xl hover:bg-rose-50 dark:bg-rose-900/30 transition-colors text-sm">
                                    {t('Revendre / Recycler le lot (345 kg)')}
                                </button>
                            </div>

                            {/* Surplus Fournitures */}
                            <div className="bg-white dark:bg-dk-surface rounded-3xl border shadow-sm dark:shadow-dk-sm p-6 flex flex-col">
                                <h3 className="text-lg font-black text-slate-800 dark:text-dk-text mb-4 flex items-center gap-2"><ArrowLeft className="w-5 h-5 text-blue-500 dark:text-blue-300" /> {t('Surplus Fournitures (À revendre)')}</h3>
                                <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-6 text-center mb-6">
                                    <div className="text-4xl font-black text-blue-600 dark:text-blue-400 dark:text-blue-300 mb-2">1,250 <span className="text-lg">DH</span></div>
                                    <p className="text-sm font-bold text-blue-800 dark:text-blue-200">{t('Valeur estimée du surplus dormant revendable.')}</p>
                                </div>

                                <div className="flex-1">
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        {[
                                            { p: 'Boutons Pression Métal', q: 450, u: 'pcs', val: 220 },
                                            { p: 'Fermetures Éclair 15cm', q: 120, u: 'pcs', val: 300 },
                                            { p: 'Étiquettes Cuir Brand', q: 1500, u: 'pcs', val: 750 }
                                        ].map((s, i) => (
                                            <div key={i} className="border border-slate-100 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg p-4 rounded-xl relative group">
                                                <button onClick={() => alert(`${t('Suppression de')} ${s.p} ${t('des surplus.')}`)} className="absolute top-2 right-2 text-slate-300 dark:text-dk-muted hover:text-rose-500 dark:text-rose-300 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
                                                <p className="text-xs font-black text-slate-800 dark:text-dk-text leading-tight mb-2 pr-6">{s.p}</p>
                                                <div className="flex justify-between items-end">
                                                    <div>
                                                        <p className="text-lg font-black text-blue-600 dark:text-blue-400 dark:text-blue-300">{s.q} <span className="text-[10px] text-blue-400 dark:text-blue-300">{s.u}</span></p>
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-500 dark:text-dk-muted">{s.val} DH</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ══ Traçabilité ══ */}
                {tab === 'tracabilite' && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 max-w-5xl mx-auto">
                        <div className="bg-white dark:bg-dk-surface p-6 rounded-3xl border shadow-sm dark:shadow-dk-sm">
                            <div className="flex items-center justify-between gap-4 mb-4">
                                <h2 className="text-xl font-black text-slate-800 dark:text-dk-text flex items-center gap-2"><LinkIcon className="w-5 h-5 text-indigo-500 dark:text-indigo-300" /> {t('Traçabilité Ascendante / Descendante')}</h2>
                                <button onClick={exportMouvements} className="px-3 py-2 border rounded-lg hover:bg-slate-50 dark:hover:bg-dk-elevated/60 flex gap-2 items-center text-sm font-bold text-slate-600 dark:text-dk-text-soft" title="Exporter tous les mouvements en CSV"><Download className="w-4 h-4" /> CSV</button>
                            </div>
                            <div className="relative">
                                <Search className="w-5 h-5 text-slate-400 dark:text-dk-muted absolute left-4 top-1/2 -translate-y-1/2" />
                                <input className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-2xl py-4 pl-12 pr-4 text-lg font-bold outline-none focus:border-indigo-500 dark:border-indigo-800 transition-colors" placeholder={t("Rechercher par Numéro OF, Numéro de Bain, ou Référence Article...")} value={traceQuery} onChange={e => setTraceQuery(e.target.value)} />
                            </div>
                            <p className="text-xs text-slate-400 dark:text-dk-muted font-bold mt-3 text-center">{t('Tapez par exemple')} <span className="text-indigo-500 dark:text-indigo-300">OF-105</span> {t('ou')} <span className="text-indigo-500 dark:text-indigo-300">TEIN-889</span> {t('pour voir tous les mouvements liés.')}</p>
                        </div>

                        {traceQuery.length > 2 ? (
                            <div className="bg-white dark:bg-dk-surface p-6 rounded-3xl border shadow-sm dark:shadow-dk-sm">
                                <h3 className="text-lg font-black text-slate-700 dark:text-dk-text mb-6">{t('Résultats pour "')}{traceQuery}"</h3>
                                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                                    {mvts.filter(m => {
                                        const pName = products.find(p => p.id === m.productId)?.designation || '';
                                        return (m.modeleRef?.toLowerCase().includes(traceQuery.toLowerCase())) ||
                                            (m.bain?.toLowerCase().includes(traceQuery.toLowerCase())) ||
                                            (pName.toLowerCase().includes(traceQuery.toLowerCase())) ||
                                            (m.notes?.toLowerCase().includes(traceQuery.toLowerCase()));
                                    }).map((m, i) => {
                                        const pName = products.find(p => p.id === m.productId)?.designation || 'Inconnu';
                                        return (
                                            <div
                                                key={m.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setSelectedMovement(m)}
                                                className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active cursor-pointer"
                                            >
                                                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-slate-100 dark:bg-dk-elevated/60 text-slate-500 dark:text-dk-muted shadow dark:shadow-dk-sm shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                                    {m.type === 'entree' || m.type === 'retour_atelier' ? <TrendingDown className="w-4 h-4 text-emerald-500 dark:text-emerald-300" /> : m.type === 'sortie' || m.type === 'rebut' ? <TrendingUp className="w-4 h-4 text-rose-500 dark:text-rose-300" /> : <RefreshCw className="w-4 h-4 text-amber-500 dark:text-amber-300" />}
                                                </div>
                                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white dark:bg-dk-surface p-4 rounded-2xl border shadow-sm dark:shadow-dk-sm">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${m.type === 'entree' || m.type === 'retour_atelier' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : m.type === 'sortie' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300' : m.type === 'rebut' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' : m.type === 'regularisation' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>{t(m.type)}</span>
                                                        <span className="text-xs font-bold text-slate-400 dark:text-dk-muted">{new Date(m.date).toLocaleString()}</span>
                                                    </div>
                                                    <h4 className="font-black text-slate-800 dark:text-dk-text text-base">{pName}</h4>
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        <span className="text-xs font-black text-slate-600 dark:text-dk-text-soft bg-slate-100 dark:bg-dk-elevated/60 px-2 py-1 rounded">{t('Qté:')} <span className={m.type === 'entree' || m.type === 'retour_atelier' ? 'text-emerald-600 dark:text-emerald-400 dark:text-emerald-300' : m.type === 'sortie' || m.type === 'rebut' ? 'text-rose-600 dark:text-rose-400 dark:text-rose-300' : 'text-amber-500 dark:text-amber-300'}>{m.type === 'sortie' || m.type === 'rebut' ? '-' : '+'}{m.quantite}</span></span>
                                                        {m.modeleRef && <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 px-2 py-1 rounded">{t('OF:')} {m.modeleRef}</span>}
                                                        {m.bain && <span className="text-xs font-black text-purple-600 dark:text-purple-400 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded">{t('Bain:')} {m.bain}</span>}
                                                        {m.chaineId && <span className="text-xs font-bold text-slate-500 dark:text-dk-muted bg-slate-50 dark:bg-dk-bg border px-2 py-1 rounded">{t('Chaîne:')} {m.chaineId}</span>}
                                                        {m.fournisseurId && <span className="text-xs font-bold text-slate-500 dark:text-dk-muted bg-slate-50 dark:bg-dk-bg border px-2 py-1 rounded">{t('Frs:')} {m.fournisseurId}</span>}
                                                    </div>
                                                    {m.notes && <p className="text-xs text-slate-400 dark:text-dk-muted mt-2 italic">"{m.notes}"</p>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {mvts.filter(m => {
                                        const pName = products.find(p => p.id === m.productId)?.designation || '';
                                        return (m.modeleRef?.toLowerCase().includes(traceQuery.toLowerCase())) ||
                                            (m.bain?.toLowerCase().includes(traceQuery.toLowerCase())) ||
                                            (pName.toLowerCase().includes(traceQuery.toLowerCase())) ||
                                            (m.notes?.toLowerCase().includes(traceQuery.toLowerCase()));
                                    }).length === 0 && (
                                            <div className="text-center py-12 text-slate-400 dark:text-dk-muted font-bold border-2 border-dashed border-slate-200 dark:border-dk-border rounded-2xl bg-slate-50 dark:bg-dk-bg relative z-10 mx-6 md:mx-0">
                                                {t('Aucun mouvement trouvé pour cette recherche.')}
                                            </div>
                                        )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-20 bg-white dark:bg-dk-surface rounded-3xl border border-dashed border-slate-300 dark:border-dk-border">
                                <LinkIcon className="w-16 h-16 text-slate-200 dark:text-dk-muted mx-auto mb-4" />
                                <h3 className="text-lg font-black text-slate-700 dark:text-dk-text">{t('Audit de Traçabilité')}</h3>
                                <p className="text-slate-500 dark:text-dk-muted font-bold text-sm max-w-sm mx-auto">Recherchez un terme pour afficher l'historique de vie complet et garantir la qualité.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ══ Factures & BL (Gallery) ══ */}
                {tab === 'factures' && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="bg-white dark:bg-dk-surface p-6 rounded-3xl border shadow-sm dark:shadow-dk-sm">
                            <div className="flex items-center justify-between gap-4 mb-4">
                                <div>
                                    <h2 className="text-xl font-black text-slate-800 dark:text-dk-text flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-500 dark:text-indigo-300" /> {t('Factures & Bons de Livraison')}</h2>
                                    <p className="text-sm text-slate-500 dark:text-dk-muted font-bold">{t('Tous les documents joints aux mouvements — cliquez pour imprimer / télécharger')}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { const el = document.getElementById('factures-print-all'); if (el) el.click(); }} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 hover:bg-indigo-700 dark:hover:bg-dk-accent-hover text-white rounded-xl font-black text-sm transition-all active:scale-95">
                                        <Printer className="w-4 h-4" /> {t('Tout Imprimer')}
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 dark:text-dk-muted font-bold">{t('Documents avec pièce jointe')} : {mvts.filter(m => m.pieceJointe).length} · {t('Avec référence')} : {mvts.filter(m => m.documentRef).length}</p>
                        </div>

                        {(() => {
                            const docMvts = mvts.filter(m => m.pieceJointe || m.documentRef);
                            if (docMvts.length === 0) {
                                return (
                                    <div className="text-center py-20 bg-white dark:bg-dk-surface rounded-3xl border border-dashed border-slate-300 dark:border-dk-border">
                                        <FileText className="w-16 h-16 text-slate-200 dark:text-dk-muted mx-auto mb-4" />
                                        <h3 className="text-lg font-black text-slate-700 dark:text-dk-text">{t('Aucun document')}</h3>
                                        <p className="text-slate-500 dark:text-dk-muted font-bold text-sm max-w-sm mx-auto">{t('Joignez des pièces justificatives lors des entrées/sorties pour les voir apparaître ici.')}</p>
                                    </div>
                                );
                            }

                            const groupByMonth = (items: MouvementStock[]) => {
                                const groups: Record<string, MouvementStock[]> = {};
                                items.forEach(m => {
                                    const key = new Date(m.date).toLocaleDateString('fr-MA', { year: 'numeric', month: 'long' });
                                    if (!groups[key]) groups[key] = [];
                                    groups[key].push(m);
                                });
                                return groups;
                            };

                            const grouped = groupByMonth(docMvts);

                            return (
                                <div className="space-y-8">
                                    {Object.entries(grouped).map(([month, items]) => (
                                        <div key={month}>
                                            <h3 className="text-sm font-black text-slate-500 dark:text-dk-muted uppercase tracking-wider mb-4 flex items-center gap-2">
                                                <div className="h-px flex-1 bg-slate-200 dark:bg-dk-border" />
                                                <span>{month}</span>
                                                <div className="h-px flex-1 bg-slate-200 dark:bg-dk-border" />
                                            </h3>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                {items.map(m => {
                                                    const p = products.find(x => x.id === m.productId);
                                                    const isSortie = m.type === 'sortie' || m.type === 'rebut' || m.type === 'reservation';
                                                    const docTitle = isSortie ? 'BL' : 'BR';
                                                    const docNum = m.documentRef || `${docTitle}-${new Date(m.date).getFullYear()}-${m.id.substring(0, 6).toUpperCase()}`;
                                                    return (
                                                        <div
                                                            key={m.id}
                                                            role="button"
                                                            tabIndex={0}
                                                            onClick={() => setPrinterMvt(m)}
                                                            className="group relative bg-white dark:bg-dk-surface rounded-2xl border-2 border-slate-100 dark:border-dk-border/60 hover:border-indigo-300 dark:border-indigo-800 shadow-sm dark:shadow-dk-sm hover:shadow-lg transition-all cursor-pointer overflow-hidden"
                                                        >
                                                            {/* Thumbnail */}
                                                            <div className="aspect-[3/4] bg-slate-50 dark:bg-dk-bg flex items-center justify-center overflow-hidden relative">
                                                                {m.pieceJointe ? (
                                                                    <img src={m.pieceJointe} alt={docNum} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                                ) : (
                                                                    <div className="flex flex-col items-center gap-2 text-slate-300 dark:text-dk-muted">
                                                                        <FileText className="w-12 h-12" />
                                                                        <span className="text-xs font-bold">{docTitle}</span>
                                                                    </div>
                                                                )}
                                                                {/* Overlay on hover */}
                                                                <div className="absolute inset-0 bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700/0 group-hover:bg-indigo-600 dark:hover:bg-dk-accent dark:bg-indigo-700/10 transition-colors flex items-center justify-center">
                                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-dk-surface/90 backdrop-blur rounded-xl px-3 py-2 shadow-lg dark:shadow-dk-lg flex items-center gap-2">
                                                                        <Printer className="w-4 h-4 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300" />
                                                                        <span className="text-xs font-black text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300">{t('Imprimer')}</span>
                                                                    </div>
                                                                </div>
                                                                {/* Type badge */}
                                                                <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${isSortie ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'}`}>
                                                                    {isSortie ? 'BL' : 'BR'}
                                                                </div>
                                                            </div>
                                                            {/* Info */}
                                                            <div className="p-3">
                                                                <div className="font-black text-slate-800 dark:text-dk-text text-xs truncate">{p?.designation || t('Inconnu')}</div>
                                                                <div className="text-[10px] text-slate-400 dark:text-dk-muted font-bold mt-1 font-mono">{docNum}</div>
                                                                <div className="flex justify-between items-center mt-2">
                                                                    <span className="text-[10px] text-slate-400 dark:text-dk-muted font-bold">{new Date(m.date).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })}</span>
                                                                    <span className={`text-xs font-black ${isSortie ? 'text-rose-600 dark:text-rose-400 dark:text-rose-300' : 'text-emerald-600 dark:text-emerald-400 dark:text-emerald-300'}`}>
                                                                        {isSortie ? '-' : '+'}{m.quantite}
                                                                    </span>
                                                                </div>
                                                                {m.fournisseurId && <div className="text-[10px] text-indigo-500 dark:text-indigo-300 font-bold mt-1 truncate">📦 {m.fournisseurId}</div>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                        <button id="factures-print-all" className="hidden" onClick={() => window.print()} />
                    </div>
                )}

                {/* ══ Stock Produit Fini ══ */}
                {tab === 'stockPF' && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                    <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500 dark:text-dk-muted">{t('Total Modèles')}</p>
                                    <p className="text-2xl font-black text-slate-800 dark:text-dk-text">{finishedGoods.length}</p>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                                    <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 dark:text-emerald-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500 dark:text-dk-muted">{t('Disponible')}</p>
                                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 dark:text-emerald-300">{finishedGoods.filter(fg => fg.statut === 'disponible').reduce((s, fg) => s + fg.quantiteRestante, 0).toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                                    <Send className="w-6 h-6 text-amber-600 dark:text-amber-400 dark:text-amber-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500 dark:text-dk-muted">{t('Expédié')}</p>
                                    <p className="text-2xl font-black text-amber-600 dark:text-amber-400 dark:text-amber-300">{finishedGoods.reduce((s, fg) => s + fg.quantiteExpediee, 0).toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="bg-white dark:bg-dk-surface rounded-2xl p-5 border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 dark:text-rose-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500 dark:text-dk-muted">{t('Défauts')}</p>
                                    <p className="text-2xl font-black text-rose-600 dark:text-rose-400 dark:text-rose-300">{finishedGoods.reduce((s, fg) => s + fg.quantiteDefaut, 0).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        {/* Finished Goods Table */}
                        <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 dark:border-dk-border/60 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                                <div>
                                    <h3 className="font-black text-slate-800 dark:text-dk-text text-lg flex items-center gap-2">
                                        <Package className="w-5 h-5 text-indigo-500 dark:text-indigo-300" /> {t('Stock Produit Fini')}
                                    </h3>
                                    <p className="text-xs text-slate-400 dark:text-dk-muted mt-1">{t('Pièces finies après production — suivi des quantités, défauts et expéditions.')}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder={t('Rechercher...')}
                                        className="px-3 py-1.5 border border-slate-200 dark:border-dk-border rounded-xl text-sm"
                                        onChange={e => {
                                            const q = e.target.value.toLowerCase();
                                            // Filter handled in render below
                                        }}
                                    />
                                </div>
                            </div>

                            {finishedGoods.length === 0 ? (
                                <div className="p-12 text-center">
                                    <Package className="w-12 h-12 text-slate-300 dark:text-dk-muted mx-auto mb-3" />
                                    <p className="font-bold text-slate-500 dark:text-dk-muted">{t('Aucun produit fini en stock.')}</p>
                                    <p className="text-xs text-slate-400 dark:text-dk-muted mt-1">{t('Les entrées seront créées automatiquement lors de la clôture des OFs.')}</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 dark:bg-dk-bg">
                                            <tr className="text-slate-500 dark:text-dk-muted">
                                                <th className="p-3 pl-6 font-bold">{t('Modèle')}</th>
                                                <th className="p-3 font-bold">{t('Client')}</th>
                                                <th className="p-3 font-bold">{t('Chaîne')}</th>
                                                <th className="p-3 font-bold text-center">{t('Produit')}</th>
                                                <th className="p-3 font-bold text-center">{t('Défaut')}</th>
                                                <th className="p-3 font-bold text-center">{t('Expédié')}</th>
                                                <th className="p-3 font-bold text-center">{t('Restant')}</th>
                                                <th className="p-3 font-bold">{t('Date')}</th>
                                                <th className="p-3 font-bold">{t('Statut')}</th>
                                                <th className="p-3 pr-6 font-bold text-center">{t('Actions')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {finishedGoods.map(fg => {
                                                const progress = fg.quantiteProduite > 0
                                                    ? Math.min(100, Math.round(((fg.quantiteProduite - fg.quantiteDefaut) / fg.quantiteProduite) * 100))
                                                    : 0;
                                                const isLate = fg.dateExportPrevue && new Date(fg.dateExportPrevue) < new Date() && fg.quantiteRestante > 0;
                                                return (
                                                    <tr key={fg.id} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">
                                                        <td className="p-3 pl-6">
                                                            <div className="font-black text-slate-800 dark:text-dk-text">{fg.designation || fg.reference || '-'}</div>
                                                            <div className="text-[10px] text-slate-400 dark:text-dk-muted font-bold mt-0.5">{fg.reference || ''}</div>
                                                        </td>
                                                        <td className="p-3 text-slate-600 dark:text-dk-text-soft font-medium">{fg.clientName || '-'}</td>
                                                        <td className="p-3 text-slate-600 dark:text-dk-text-soft font-medium">{fg.chaineId || '-'}</td>
                                                        <td className="p-3 text-center">
                                                            <span className="font-black text-slate-800 dark:text-dk-text">{fg.quantiteProduite}</span>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <span className={`font-black ${fg.quantiteDefaut > 0 ? 'text-rose-600 dark:text-rose-400 dark:text-rose-300' : 'text-slate-400 dark:text-dk-muted'}`}>
                                                                {fg.quantiteDefaut}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <span className="font-black text-amber-600 dark:text-amber-400 dark:text-amber-300">{fg.quantiteExpediee}</span>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className={`font-black ${fg.quantiteRestante > 0 ? 'text-emerald-600 dark:text-emerald-400 dark:text-emerald-300' : 'text-slate-400 dark:text-dk-muted'}`}>
                                                                    {fg.quantiteRestante}
                                                                </span>
                                                                <div className="w-16 h-1.5 bg-slate-100 dark:bg-dk-elevated/60 rounded-full mt-1 overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-emerald-50 dark:bg-emerald-900/300 rounded-full transition-all"
                                                                        style={{ width: `${progress}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="text-xs text-slate-500 dark:text-dk-muted">{fg.dateProduction}</div>
                                                            {isLate && (
                                                                <span className="text-[9px] font-black text-rose-500 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                                                                    EN RETARD
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-3">
                                                            <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                                                fg.statut === 'disponible' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                                                                fg.statut === 'partielle' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                                                                'bg-slate-100 dark:bg-dk-elevated/60 text-slate-600 dark:text-dk-text-soft'
                                                            }`}>
                                                                {fg.statut}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 pr-6">
                                                            <div className="flex items-center gap-1 justify-center">
                                                                <button
                                                                    onClick={async () => {
                                                                        const qte = prompt(`${t('Quantité à expédier')} (${fg.quantiteRestante} ${t('disponible(s)')}) :`);
                                                                        if (!qte || isNaN(parseInt(qte))) return;
                                                                        const qty = parseInt(qte);
                                                                        if (qty > fg.quantiteRestante) {
                                                                            alert(t('Quantité supérieure au stock disponible.'));
                                                                            return;
                                                                        }
                                                                        const client = prompt(t('Nom du client :')) || '';
                                                                        const blRef = prompt(t('Référence BL :')) || '';
                                                                        try {
                                                                            await fetch('/api/finished-goods/mouvements', {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json' },
                                                                                credentials: 'include',
                                                                                body: JSON.stringify({
                                                                                    fgId: fg.id,
                                                                                    type: 'expedition',
                                                                                    quantite: qty,
                                                                                    date: new Date().toISOString(),
                                                                                    clientNom: client,
                                                                                    bonLivraisonRef: blRef
                                                                                })
                                                                            });
                                                                            // Refresh data
                                                                            const [resFG, resFGM] = await Promise.all([
                                                                                fetch('/api/finished-goods', { credentials: 'include' }),
                                                                                fetch('/api/finished-goods/mouvements', { credentials: 'include' })
                                                                            ]);
                                                                            if (resFG.ok) setFinishedGoods(await resFG.json());
                                                                            if (resFGM.ok) setFgMovements(await resFGM.json());
                                                                        } catch (e) {
                                                                            console.error(e);
                                                                        }
                                                                    }}
                                                                    className="px-2 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300 text-[10px] font-bold hover:bg-indigo-200 dark:bg-indigo-900/50 transition-colors"
                                                                    title={t('Expédier')}
                                                                >
                                                                    <Send className="w-3 h-3" />
                                                                </button>
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!confirm(t('Supprimer cet article ?'))) return;
                                                                        try {
                                                                            await fetch(`/api/finished-goods/${fg.id}`, {
                                                                                method: 'DELETE',
                                                                                credentials: 'include'
                                                                            });
                                                                            setFinishedGoods(prev => prev.filter(f => f.id !== fg.id));
                                                                        } catch (e) {
                                                                            console.error(e);
                                                                        }
                                                                    }}
                                                                    className="px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-[10px] font-bold hover:bg-rose-200 transition-colors"
                                                                    title={t('Supprimer')}
                                                                >
                                                                    <Trash2 className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Mouvements récents */}
                        {fgMovements.length > 0 && (
                            <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-dk-border/60">
                                    <h3 className="font-bold text-slate-800 dark:text-dk-text flex items-center gap-2">
                                        <History className="w-4 h-4 text-indigo-500 dark:text-indigo-300" /> {t('Derniers Mouvements PF')}
                                    </h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 dark:bg-dk-bg">
                                            <tr className="text-slate-500 dark:text-dk-muted">
                                                <th className="p-3 pl-6 font-bold">{t('Date')}</th>
                                                <th className="p-3 font-bold">{t('Type')}</th>
                                                <th className="p-3 font-bold">{t('Modèle')}</th>
                                                <th className="p-3 font-bold text-center">{t('Quantité')}</th>
                                                <th className="p-3 font-bold">{t('Client')}</th>
                                                <th className="p-3 font-bold">{t('BL')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {fgMovements.slice(0, 10).map(m => {
                                                const fg = finishedGoods.find(f => f.id === m.fgId);
                                                return (
                                                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                                        <td className="p-3 pl-6 text-xs text-slate-500 dark:text-dk-muted font-mono">{new Date(m.date).toLocaleString()}</td>
                                                        <td className="p-3">
                                                            <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                                                                m.type === 'expedition' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' :
                                                                m.type === 'retour' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' :
                                                                'bg-slate-100 dark:bg-dk-elevated/60 text-slate-600 dark:text-dk-text-soft'
                                                            }`}>{t(m.type)}</span>
                                                        </td>
                                                        <td className="p-3 font-bold text-slate-700 dark:text-dk-text">{fg?.designation || '-'}</td>
                                                        <td className="p-3 text-center font-black text-slate-800 dark:text-dk-text">{m.quantite}</td>
                                                        <td className="p-3 text-slate-600 dark:text-dk-text-soft">{m.clientNom || '-'}</td>
                                                        <td className="p-3 text-slate-500 dark:text-dk-muted text-xs">{m.bonLivraisonRef || '-'}</td>
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

                {conflictData && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[1000] p-4">
                        <div className="bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                             <div className="p-6">
                                 <h3 className="text-xl font-black text-rose-600 dark:text-rose-400 dark:text-rose-300 flex items-center gap-2 mb-2">
                                     <AlertTriangle className="w-6 h-6" /> Conflit de Réservation
                                 </h3>
                                 <p className="text-slate-600 dark:text-dk-text-soft">
                                     Le stock total est de <b className="text-slate-800 dark:text-dk-text">{conflictData.st}</b>, mais il ne reste que <b className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300">{conflictData.avail}</b> unités disponibles (le reste est déjà réservé).
                                 </p>
                                 <div className="mt-8 flex flex-col gap-3">
                                     <button onClick={() => {
                                          setBQty(conflictData.avail.toString());
                                          setConflictData(null);
                                     }} className="w-full py-3 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 text-amber-800 dark:text-amber-200 font-bold rounded-xl flex justify-center items-center gap-2 transition-colors">
                                         <Edit2 className="w-4 h-4" /> Réserver uniquement {conflictData.avail}
                                     </button>
                                     <button onClick={() => {
                                          setTab('demandes');
                                          setConflictData(null);
                                     }} className="w-full py-3 bg-indigo-100 dark:bg-indigo-900/40 hover:bg-indigo-200 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 font-bold rounded-xl flex justify-center items-center gap-2 transition-colors">
                                         <Plus className="w-4 h-4" /> Nouvelle Demande d'Appro.
                                     </button>
                                     <button onClick={() => setConflictData(null)} className="w-full py-3 bg-slate-100 dark:bg-dk-elevated/60 hover:bg-slate-200 dark:bg-dk-border text-slate-700 dark:text-dk-text font-bold rounded-xl transition-colors">
                                         Annuler (Chercher un substitut)
                                     </button>
                                 </div>
                             </div>
                        </div>
                    </div>
                )}

                {/* ══ Smart WMS ══ */}
                {tab === 'wms' && (() => {
                    const wmsData = products.reduce((acc, p) => {
                        const rayon = p.emplacement ? p.emplacement.charAt(0).toUpperCase() : '?';
                        const st = stockQty(lots, p.id);
                        if (!acc[rayon]) acc[rayon] = { items: [], totalStock: 0 };
                        acc[rayon].items.push({ product: p, stock: st });
                        acc[rayon].totalStock += st;
                        return acc;
                    }, {} as Record<string, { items: { product: MagasinProduct, stock: number }[], totalStock: number }>);
                    const rayons = Object.keys(wmsData).sort();

                    return (
                        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                            <div className="bg-white dark:bg-dk-surface p-6 rounded-3xl border shadow-sm dark:shadow-dk-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-black text-slate-800 dark:text-dk-text flex items-center gap-2"><MapPin className="w-5 h-5 text-indigo-500 dark:text-indigo-300" /> {t('Cartographie WMS 2D')}</h2>
                                    <p className="text-sm text-slate-500 dark:text-dk-muted font-bold mt-1">{t("Vue de l'entrepôt par rayon. Densité basée sur le volume de stock actic.")}</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-dk-muted"><div className="w-3 h-3 rounded bg-slate-100 dark:bg-dk-elevated/60"></div> {t('Vide')}</div>
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-dk-muted"><div className="w-3 h-3 rounded bg-indigo-200 dark:bg-indigo-900/50"></div> {t('Moyen')}</div>
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-dk-muted"><div className="w-3 h-3 rounded bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/300"></div> {t('Dense')}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                <div className="lg:col-span-3 bg-slate-100 dark:bg-dk-elevated/60 p-8 rounded-3xl border border-slate-200 dark:border-dk-border shadow-inner grid grid-cols-2 md:grid-cols-3 gap-8 overflow-x-auto relative min-h-[500px]">
                                    {/* Mock portes / Layout */}
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-white dark:bg-dk-surface px-8 py-2 border-b-2 border-x-2 border-slate-200 dark:border-dk-border rounded-b-xl text-xs font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest shadow-sm dark:shadow-dk-sm">{t('Dock Réception')}</div>
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-white dark:bg-dk-surface px-8 py-2 border-t-2 border-x-2 border-slate-200 dark:border-dk-border rounded-t-xl text-xs font-black text-slate-400 dark:text-dk-muted uppercase tracking-widest shadow-sm dark:shadow-dk-sm">{t('Expédition / Atelier')}</div>

                                    {rayons.map(r => {
                                        const d = wmsData[r];
                                        const isDense = d.totalStock > 5000;
                                        const isMedium = d.totalStock > 1000;
                                        return (
                                            <div key={r} onClick={() => setSearch(`^${r}`)} className={`cursor-pointer transition-transform hover:scale-105 group relative mt-10 mb-10 bg-white dark:bg-dk-surface rounded-2xl border-4 ${isDense ? 'border-indigo-500 dark:border-indigo-800 shadow-lg dark:shadow-dk-lg shadow-indigo-200 dark:shadow-indigo-900/30' : isMedium ? 'border-indigo-300 dark:border-indigo-800 shadow-md dark:shadow-dk-md' : 'border-slate-300 dark:border-dk-border'} flex flex-col overflow-hidden h-64`}>
                                                <div className={`p-2 text-center text-white font-black text-lg ${isDense ? 'bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/300' : isMedium ? 'bg-indigo-400 dark:bg-indigo-800' : 'bg-slate-400 dark:bg-dk-muted'}`}>{t('Rayon')} {r}</div>
                                                <div className="p-4 flex-1 flex flex-col justify-center text-center bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
                                                    <div className="text-3xl font-black text-slate-800 dark:text-dk-text">{d.items.length} <span className="text-sm text-slate-500 dark:text-dk-muted font-bold block">{t('Réf. Uniques')}</span></div>
                                                    <div className="mt-4 text-xs font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest">{t('Stock Total')}</div>
                                                    <div className={`font-black text-xl ${isDense ? 'text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300' : 'text-slate-600 dark:text-dk-text-soft'}`}>{d.totalStock.toLocaleString()}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="bg-white dark:bg-dk-surface p-6 rounded-3xl border shadow-sm dark:shadow-dk-sm h-[500px] overflow-y-auto flex flex-col">
                                    <h3 className="text-sm font-black text-slate-800 dark:text-dk-text mb-4 flex items-center gap-2"><Search className="w-4 h-4 text-indigo-500 dark:text-indigo-300" /> {t('Détails Emplacements')}</h3>
                                    <input placeholder={t("Filtrer... (ex: ^A pour Rayon A)")} value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-4 py-2 text-sm font-bold mb-4 outline-none focus:border-indigo-500 dark:border-indigo-800" />
                                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                                        {products.filter(p => search.startsWith('^') ? (p.emplacement || '?').toUpperCase().startsWith(search.substring(1).toUpperCase()) : (p.emplacement?.toLowerCase().includes(search.toLowerCase()) || p.designation.toLowerCase().includes(search.toLowerCase()))).map(p => {
                                            const st = stockQty(lots, p.id);
                                            return (
                                                <div key={p.id} className="p-3 bg-slate-50 dark:bg-dk-bg rounded-xl border border-slate-100 dark:border-dk-border/60 hover:border-indigo-200 dark:border-indigo-800 transition-colors">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-800/50">{p.emplacement || t('Non Défini')}</span>
                                                        <span className="text-[10px] font-bold text-slate-400 dark:text-dk-muted">{p.reference}</span>
                                                    </div>
                                                    <div className="font-bold text-slate-800 dark:text-dk-text text-sm mt-1 leading-tight">{p.designation}</div>
                                                    <div className="text-xs font-black text-slate-500 dark:text-dk-muted mt-2">{t('Dispo:')} <span className={st === 0 ? 'text-red-500 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-400 dark:text-emerald-300'}>{st} {p.unite}</span></div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* ══ Radar Fournisseurs ══ */}
                {tab === 'fournisseurs' && (() => {
                    const suppliersList = Array.from(new Set(products.map(p => p.fournisseurNom).filter(Boolean))) as string[];
                    const suppliersData = suppliersList.map(name => {
                        const prods = products.filter(p => p.fournisseurNom === name);
                        const entries = mvts.filter(m => m.fournisseurId === name && m.type === 'entree');
                        const totalValue = prods.reduce((sum, p) => sum + (stockQty(lots, p.id) * (p.cump || p.prixUnitaire)), 0);
                        const avgPriceEvolution = prods.reduce((sum, p) => p.cump ? sum + ((p.cump - p.prixUnitaire) / p.prixUnitaire) * 100 : sum, 0) / (prods.length || 1);

                        // Fake scoring based on metrics
                        const delayScore = entries.length > 5 ? 90 : 70;
                        const qualScore = 100 - (mvts.filter(m => m.type === 'rebut' && prods.find(p => p.id === m.productId)).length * 5);
                        const globalScore = Math.round((delayScore + Math.max(0, qualScore) + (avgPriceEvolution < 0 ? 100 : avgPriceEvolution > 10 ? 50 : 80)) / 3);

                        return { name, prods: prods.length, entries: entries.length, value: totalValue, evolution: avgPriceEvolution, score: globalScore };
                    }).sort((a, b) => b.score - a.score);

                    return (
                        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 max-w-7xl mx-auto">
                            <div className="bg-gradient-to-r from-slate-800 to-indigo-900 p-8 rounded-3xl text-white shadow-lg dark:shadow-dk-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-10"><Building2 className="w-48 h-48" /></div>
                                <h2 className="text-3xl font-black mb-2 flex items-center gap-3"><Building2 className="w-8 h-8 text-indigo-400 dark:text-indigo-300" /> {t('Radar Fournisseurs (Sourcing)')}</h2>
                                <p className="text-indigo-100 dark:text-indigo-200 font-bold max-w-xl">{t("Évaluez la performance de vos fournisseurs, surveillez l'évolution des prix d'achat (CUMP) et optimisez votre sourcing stratégique.")}</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {suppliersData.map(s => (
                                    <div key={s.name} className="bg-white dark:bg-dk-surface p-6 rounded-3xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm hover:shadow-md hover:border-indigo-200 dark:border-indigo-800 transition-all group">
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 dark:hover:bg-dk-accent dark:bg-indigo-700 transition-colors">
                                                <Building2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300 group-hover:text-white transition-colors" />
                                            </div>
                                             <div className={`px-4 py-2 rounded-xl text-lg font-black border-2 border-dashed ${s.score >= 85 ? 'border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30' : s.score >= 70 ? 'border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30' : 'border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/30'}`}>
                                                {s.score}/100
                                            </div>
                                        </div>
                                        <h3 className="text-xl font-black text-slate-800 dark:text-dk-text mb-1">{s.name}</h3>
                                        <p className="text-sm font-bold text-slate-400 dark:text-dk-muted mb-6 flex items-center gap-2"><Layers className="w-4 h-4" /> {s.prods} {t('références matérielles')}</p>

                                        <div className="space-y-4">
                                            <div className="bg-slate-50 dark:bg-dk-bg p-4 rounded-2xl flex justify-between items-center">
                                                <span className="text-xs font-black text-slate-500 dark:text-dk-muted uppercase tracking-widest">{t('Valeur Stock')}</span>
                                                <span className="font-black text-slate-700 dark:text-dk-text">{s.value.toLocaleString()} DH</span>
                                            </div>
                                            <div className="bg-slate-50 dark:bg-dk-bg p-4 rounded-2xl flex justify-between items-center">
                                                <span className="text-xs font-black text-slate-500 dark:text-dk-muted uppercase tracking-widest">{t('Évolution Prix')}</span>
                                                <span className={`font-black flex items-center gap-1 ${s.evolution > 0 ? 'text-rose-500 dark:text-rose-300' : s.evolution < 0 ? 'text-emerald-500 dark:text-emerald-300' : 'text-slate-500 dark:text-dk-muted'}`}>
                                                    {s.evolution > 0 ? '+' : ''}{s.evolution.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 dark:bg-dk-bg p-4 rounded-2xl flex justify-between items-center">
                                                <span className="text-xs font-black text-slate-500 dark:text-dk-muted uppercase tracking-widest">{t('Livraisons Récentes')}</span>
                                                <span className="font-black text-slate-700 dark:text-dk-text">{s.entries} {t('transactions')}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {suppliersData.length === 0 && (
                                    <div className="col-span-full text-center py-20 bg-slate-50 dark:bg-dk-bg rounded-3xl border-2 border-dashed border-slate-200 dark:border-dk-border">
                                        <Building2 className="w-16 h-16 text-slate-300 dark:text-dk-muted mx-auto mb-4" />
                                        <h3 className="text-lg font-black text-slate-700 dark:text-dk-text">{t('Aucun Fournisseur')}</h3>
                                        <p className="text-slate-500 dark:text-dk-muted font-bold max-w-sm mx-auto mt-2">{t('Associez des fournisseurs à vos produits dans la base pour voir leurs statistiques ici.')}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* ══ Bons de Réception (BR) ══ */}
                {tab === 'receptions' && (() => {
                    const activeEvents = planningEvents.filter(ev => ev.status !== 'DONE');
                    const selectedEvent = activeEvents.find(ev => ev.id === brSelectedEventId);
                    const selectedModel = selectedEvent ? models.find(m => m.id === selectedEvent.modelId) : null;
                    const bomMaterials = selectedModel?.ficheData?.materials || [];

                    const handleAddReceipt = async () => {
                        if (!brNum || !brSelectedEventId || !brSelectedMaterial || !brQty) {
                            alert(tx(lang, {fr: "Veuillez remplir tous les champs obligatoires (N° BR, Commande, Fourniture, Quantité).", ar: "يرجى ملء جميع الحقول الإلزامية (رقم BR، الطلبية، التوريد، الكمية).", en: "Please fill all required fields (BR No., Order, Material, Quantity).", es: "Por favor complete todos los campos obligatorios (N° BR, Pedido, Suministro, Cantidad).", pt: "Preencha todos os campos obrigatórios (N° BR, Pedido, Fornecimento, Quantidade).", tr: "Lütfen tüm zorunlu alanları doldurun (BR No., Sipariş, Malzeme, Miktar)."}));
                            return;
                        }

                        const qty = parseFloat(brQty);
                        if (isNaN(qty) || qty <= 0) {
                            alert(tx(lang, {fr: "La quantité doit être supérieure à 0.", ar: "يجب أن تكون الكمية أكبر من 0.", en: "Quantity must be greater than 0.", es: "La cantidad debe ser superior a 0.", pt: "A quantidade deve ser superior a 0.", tr: "Miktar 0'dan büyük olmalıdır."}));
                            return;
                        }

                        const newReceipt: MaterialReceipt = {
                            id: brNum,
                            pedidoId: brSelectedEventId,
                            modelId: selectedEvent?.modelId || '',
                            materialName: brSelectedMaterial,
                            qtyReceived: qty,
                            dateReceived: brDate,
                            owner: brOwner,
                            supplierName: brSupplier || selectedEvent?.clientName || 'Client'
                        };

                        // 1. Add to receptions local state and local storage
                        const updatedReceptions = [newReceipt, ...receptions];
                        setReceptions(updatedReceptions);
                        sv('beramethode_receptions', updatedReceptions);

                        // Save to server
                        fetch('/api/material-receipts', {
                            method: 'POST',
                            credentials: 'include',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(newReceipt)
                        }).catch(e => console.error("Error saving receipt:", e));

                        // 2. Automatically register a stock movement if checked
                        if (brAutoAddStock) {
                            const matchedProduct = products.find(p => p.designation.toLowerCase() === brSelectedMaterial.toLowerCase());
                            if (matchedProduct) {
                                const newMvt: MouvementStock = {
                                    id: uid(),
                                    productId: matchedProduct.id,
                                    type: 'entree',
                                    source: 'fournisseur',
                                    destination: 'inventaire',
                                    quantite: qty,
                                    prixUnitaire: matchedProduct.prixUnitaire || 0,
                                    date: new Date(brDate).toISOString(),
                                    notes: `Réception auto via BR ${brNum} pour OF ${selectedEvent?.modelName || ''}`,
                                    documentRef: brNum,
                                    bain: 'BR',
                                    modeleRef: selectedEvent?.modelName || ''
                                };

                                const currentLots = [...lots];
                                const lotId = uid();
                                const newLot: LotStock = {
                                    id: lotId,
                                    productId: matchedProduct.id,
                                    quantiteInitiale: qty,
                                    quantiteRestante: qty,
                                    prixUnitaire: matchedProduct.prixUnitaire || 0,
                                    dateEntree: newMvt.date,
                                    fournisseur: newReceipt.supplierName,
                                    etat: 'disponible',
                                    variante: 'BR'
                                };

                                try {
                                    const res = await fetch('/api/magasin/mvt', {
                                        credentials: 'include',
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            mouvement: newMvt,
                                            lotsUpdate: [...currentLots, newLot],
                                            productUpdate: null
                                        })
                                    });

                                    if (res.ok) {
                                        setLots(prev => [...prev, newLot]);
                                        setMvts(prev => [newMvt, ...prev]);
                                        alert(tx(lang, {fr: `Bon de Réception ${brNum} enregistré et stock mis à jour pour "${brSelectedMaterial}" !`, ar: `تم تسجيل إيصال الاستلام ${brNum} وتحديث المخزون لـ "${brSelectedMaterial}"!`, en: `Goods Receipt ${brNum} recorded and stock updated for "${brSelectedMaterial}"!`, es: `¡Recibo de mercancía ${brNum} registrado y stock actualizado para "${brSelectedMaterial}"!`, pt: `Recibo de mercadoria ${brNum} registrado e stock atualizado para "${brSelectedMaterial}"!`, tr: `${brNum} Mal Tesellim Fişi kaydedildi ve "${brSelectedMaterial}" için stok güncellendi!`}));
                                    } else {
                                        alert(tx(lang, {fr: `BR enregistré, mais échec de la mise à jour automatique du stock sur le serveur.`, ar: `تم تسجيل BR، لكن فشل التحديث التلقائي للمخزون على الخادم.`, en: `BR recorded, but automatic stock update on server failed.`, es: `BR registrado, pero falló la actualización automática del stock en el servidor.`, pt: `BR registrado, mas a atualização automática do stock no servidor falhou.`, tr: `BR kaydedildi, ancak sunucuda otomatik stok güncellemesi başarısız oldu.`}));
                                    }
                                } catch (err) {
                                    console.error(err);
                                    alert(tx(lang, {fr: `BR enregistré, mais échec de connexion pour la mise à jour du stock.`, ar: `تم تسجيل BR، لكن فشل الاتصال لتحديث المخزون.`, en: `BR recorded, but connection failed for stock update.`, es: `BR registrado, pero falló la conexión para la actualización del stock.`, pt: `BR registrado, mas a conexão falhou para atualização do stock.`, tr: `BR kaydedildi, ancak stok güncellemesi için bağlantı başarısız oldu.`}));
                                }
                            } else {
                                alert(tx(lang, {fr: `BR enregistré. Note : Aucun article nommé "${brSelectedMaterial}" trouvé dans le stock général. Le stock n'a pas été incrémenté.`, ar: `تم تسجيل BR. ملاحظة: لم يتم العثور على صنف باسم "${brSelectedMaterial}" في المخزون العام. لم يتم زيادة المخزون.`, en: `BR recorded. Note: No item named "${brSelectedMaterial}" found in general stock. Stock was not incremented.`, es: `BR registrado. Nota: No se encontró ningún artículo llamado "${brSelectedMaterial}" en el stock general. El stock no se incrementó.`, pt: `BR registrado. Nota: Nenhum artigo denominado "${brSelectedMaterial}" encontrado no stock geral. O stock não foi incrementado.`, tr: `BR kaydedildi. Not: Genel stokta "${brSelectedMaterial}" adında bir ürün bulunamadı. Stok artırılmadı.`}));
                            }
                        } else {
                            alert(tx(lang, {fr: `Bon de Réception ${brNum} enregistré (historique d'approvisionnement uniquement).`, ar: `تم تسجيل إيصال الاستلام ${brNum} (سجل التوريد فقط).`, en: `Goods Receipt ${brNum} recorded (supply history only).`, es: `Recibo de mercancía ${brNum} registrado (solo historial de suministro).`, pt: `Recibo de mercadoria ${brNum} registrado (apenas histórico de fornecimento).`, tr: `${brNum} Mal Tesellim Fişi kaydedildi (yalnızca tedarik geçmişi).`}));
                        }

                        // Reset inputs
                        setBrQty('');
                        setBrSelectedMaterial('');
                        setBrNum(`BR-${Math.floor(1000 + Math.random() * 9000)}`);
                    };

                    return (
                        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 max-w-7xl mx-auto">
                            <div className="bg-gradient-to-r from-slate-800 to-indigo-900 p-6 rounded-3xl text-white shadow-lg dark:shadow-dk-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-10"><Download className="w-48 h-48" /></div>
                                <h2 className="text-2xl font-black mb-1 flex items-center gap-3"><Download className="w-6 h-6 text-indigo-400 dark:text-indigo-300" /> {t('Bons de Réception ( الشحنات الواردة )')}</h2>
                                <p className="text-indigo-100 dark:text-indigo-200 font-bold max-w-xl">{t("Enregistrez les livraisons partielles ou totales de matières et fournitures (Temykou/Client ou Owned) pour les associer aux ordres de fabrication.")}</p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Form */}
                                <div className="bg-white dark:bg-dk-surface p-6 rounded-3xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm space-y-4">
                                    <h3 className="font-black text-slate-800 dark:text-dk-text text-lg border-b pb-2">{t('Nouvelle Réception')}</h3>
                                    
                                    <div>
                                        <Lbl t={tx(lang,{fr:'N° Bon de Réception *',ar:'رقم إيصال الاستلام *',en:'Receipt Note No. *',es:'N° de Recibo de Recepción *',pt:'N° do Recibo de Receção *',tr:'Teslim Alma Belgesi No *'})} />
                                        <input className={inp} value={brNum} onChange={e => setBrNum(e.target.value)} />
                                    </div>

                                    <div>
                                        <Lbl t={tx(lang,{fr:'Ordre de Fabrication (Pedido) *',ar:'أمر التصنيع *',en:'Production Order (Pedido) *',es:'Orden de Fabricación (Pedido) *',pt:'Ordem de Fabricação (Pedido) *',tr:'Üretim Emri (Pedido) *'})} />
                                        <select className={inp} value={brSelectedEventId} onChange={e => {
                                            const val = e.target.value;
                                            setBrSelectedEventId(val);
                                            const ev = activeEvents.find(x => x.id === val);
                                            if (ev) {
                                                setBrSupplier(ev.clientName || '');
                                                setBrOwner(ev.typeMarche === 'Export' ? 'client' : 'atelier');
                                            }
                                        }}>
                                             <option value="">{tx(lang,{fr:'-- Choisir OF --',ar:'-- اختر أمر التصنيع --',en:'-- Select PO --',es:'-- Seleccionar OF --',pt:'-- Selecionar OF --',tr:'-- Üretim Emri Seçin --'})}</option>
                                            {activeEvents.map(ev => (
                                                <option key={ev.id} value={ev.id}>{ev.clientName} - {ev.modelName} ({tx(lang,{fr:'Qté:',ar:'كمية:',en:'Qty:',es:'Cant:',pt:'Qtd:',tr:'Miktar:'})} {ev.qteTotal})</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <Lbl t={tx(lang,{fr:'Ligne de la BOM / Fourniture *',ar:'بند قائمة المواد / التموين *',en:'BOM Line / Supply Item *',es:'Línea de BOM / Suministro *',pt:'Linha da BOM / Fornecimento *',tr:'Ürün Ağacı Satırı / Tedarik *'})} />
                                        <select className={inp} value={brSelectedMaterial} onChange={e => setBrSelectedMaterial(e.target.value)} disabled={!brSelectedEventId}>
                                             <option value="">{tx(lang,{fr:'-- Choisir Trim/Matière --',ar:'-- اختر المادة/القصاصة --',en:'-- Select Trim/Material --',es:'-- Seleccionar Recorte/Material --',pt:'-- Selecionar Aparar/Material --',tr:'-- Kesim/Malzeme Seçin --'})}</option>
                                            {bomMaterials.map((m, idx) => (
                                                <option key={idx} value={m.name}>{m.name} ({m.qty} {m.unit} / {tx(lang,{fr:'pc',ar:'قطعة',en:'pc',es:'pz',pt:'pc',tr:'adet'})})</option>
                                            ))}
                                            {brSelectedEventId && bomMaterials.length === 0 && (
                                                 <option value="">{tx(lang,{fr:'Aucune fourniture définie dans la Fiche Technique',ar:'لا توجد مواد محددة في بطاقة التقنية',en:'No supplies defined in the Technical Sheet',es:'Ningún suministro definido en la Ficha Técnica',pt:'Nenhum fornecimento definido na Ficha Técnica',tr:'Teknik Fişte tanımlı malzeme yok'})}</option>
                                            )}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <Lbl t={tx(lang,{fr:'Quantité Reçue *',ar:'الكمية المستلمة *',en:'Received Quantity *',es:'Cantidad Recibida *',pt:'Quantidade Recebida *',tr:'Alınan Miktar *'})} />
                                            <input className={inp} type="number" min="0.01" step="any" placeholder="Ex: 5000" value={brQty} onChange={e => setBrQty(e.target.value)} />
                                        </div>
                                        <div>
                                            <Lbl t={tx(lang,{fr:'Date de Réception',ar:'تاريخ الاستلام',en:'Receipt Date',es:'Fecha de Recepción',pt:'Data de Receção',tr:'Teslim Alma Tarihi'})} />
                                            <input className={inp} type="date" value={brDate} onChange={e => setBrDate(e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <Lbl t={tx(lang,{fr:'Propriétaire (الملكية)',ar:'المالك',en:'Owner',es:'Propietario',pt:'Proprietário',tr:'Sahip'})} />
                                            <select className={inp} value={brOwner} onChange={e => setBrOwner(e.target.value as any)}>
                                                <option value="client">{tx(lang,{fr:'Client (Temykou)',ar:'العميل (Temykou)',en:'Client (Temykou)',es:'Cliente (Temykou)',pt:'Cliente (Temykou)',tr:'Müşteri (Temykou)'})}</option>
                                                <option value="atelier">{tx(lang,{fr:'Atelier (Factory Owned)',ar:'الورشة (ملك المصنع)',en:'Workshop (Factory Owned)',es:'Taller (Propio de la fábrica)',pt:'Oficina (Propriedade da Fábrica)',tr:'Atölye (Fabrikaya Ait)'})}</option>
                                            </select>
                                        </div>
                                        <div>
                                            <Lbl t={tx(lang,{fr:'Provenance / Fournisseur',ar:'المنشأ / المورد',en:'Origin / Supplier',es:'Origen / Proveedor',pt:'Origem / Fornecedor',tr:'Menşe / Tedarikçi'})} />
                                            <input className={inp} placeholder={tx(lang,{fr:'Nom du Client',ar:'اسم العميل',en:'Client Name',es:'Nombre del Cliente',pt:'Nome do Cliente',tr:'Müşteri Adı'})} value={brSupplier} onChange={e => setBrSupplier(e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 pt-2 border-t">
                                        <input type="checkbox" id="autoAddStock" checked={brAutoAddStock} onChange={e => setBrAutoAddStock(e.target.checked)} className="w-4 h-4 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300 rounded cursor-pointer" />
                                        <label htmlFor="autoAddStock" className="text-xs font-bold text-slate-600 dark:text-dk-text-soft cursor-pointer">{tx(lang,{fr:'Incrémenter automatiquement le stock WMS',ar:'زيادة المخزون تلقائياً في WMS',en:'Auto-increment WMS stock',es:'Incrementar automáticamente el stock WMS',pt:'Incrementar automaticamente o stock WMS',tr:'WMS stokunu otomatik artır'})}</label>
                                    </div>

                                    <button onClick={handleAddReceipt} className="w-full bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 hover:bg-indigo-700 dark:hover:bg-dk-accent-hover text-white font-black py-3 rounded-2xl shadow-md dark:shadow-dk-md transition active:scale-95 flex items-center justify-center gap-2">
                                        <Plus className="w-4 h-4" /> {tx(lang,{fr:'Enregistrer la réception',ar:'تسجيل الاستلام',en:'Record Receipt',es:'Registrar recepción',pt:'Registar receção',tr:'Teslim Alma Kaydet'})}
                                    </button>
                                </div>

                                {/* List Table */}
                                <div className="lg:col-span-2 bg-white dark:bg-dk-surface p-6 rounded-3xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm flex flex-col h-full overflow-hidden">
                                    <h3 className="font-black text-slate-800 dark:text-dk-text text-lg border-b pb-2 mb-4">{t('Historique des Réceptions')}</h3>
                                    <div className="overflow-x-auto flex-1 min-h-[300px]">
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead className="bg-slate-50 dark:bg-dk-bg text-slate-500 dark:text-dk-muted font-bold uppercase text-xs">
                                                <tr>
                                                    <th className="p-3">{tx(lang,{fr:'Bon de Réf (BR)',ar:'إيصال الاستلام (BR)',en:'Receipt Note (BR)',es:'Recibo de Recepción (BR)',pt:'Recibo de Receção (BR)',tr:'Teslim Belgesi (BR)'})}</th>
                                                    <th className="p-3">{tx(lang,{fr:'Date',ar:'التاريخ',en:'Date',es:'Fecha',pt:'Data',tr:'Tarih'})}</th>
                                                    <th className="p-3">{tx(lang,{fr:'OF / Modèle',ar:'أمر التصنيع / النموذج',en:'PO / Model',es:'OF / Modelo',pt:'OF / Modelo',tr:'Üretim Emri / Model'})}</th>
                                                    <th className="p-3">{tx(lang,{fr:'Matière / Trim',ar:'المادة / القصاصة',en:'Material / Trim',es:'Material / Recorte',pt:'Material / Aparar',tr:'Malzeme / Kesim'})}</th>
                                                    <th className="p-3 text-right">{tx(lang,{fr:'Qté Reçue',ar:'الكمية المستلمة',en:'Qty Received',es:'Cant. Recibida',pt:'Qtd Recebida',tr:'Alınan Miktar'})}</th>
                                                    <th className="p-3 text-center">{tx(lang,{fr:'Type',ar:'النوع',en:'Type',es:'Tipo',pt:'Tipo',tr:'Tür'})}</th>
                                                    <th className="p-3 text-right">{tx(lang,{fr:'Actions',ar:'الإجراءات',en:'Actions',es:'Acciones',pt:'Ações',tr:'İşlemler'})}</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y text-xs">
                                                {receptions.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className="p-8 text-center text-slate-400 dark:text-dk-muted font-bold">{tx(lang,{fr:'Aucune réception enregistrée.',ar:'لم يتم تسجيل أي استلام.',en:'No receipts recorded.',es:'Ninguna recepción registrada.',pt:'Nenhuma receção registada.',tr:'Kayıtlı teslim alma yok.'})}</td>
                                                    </tr>
                                                ) : (
                                                    receptions.map((r, idx) => {
                                                        const ev = planningEvents.find(x => x.id === r.pedidoId);
                                                        return (
                                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-dk-elevated/60">
                                                                <td className="p-3 font-bold text-slate-700 dark:text-dk-text">{r.id}</td>
                                                                <td className="p-3 text-slate-500 dark:text-dk-muted">{r.dateReceived}</td>
                                                                <td className="p-3">
                                                                    <div className="font-bold text-slate-800 dark:text-dk-text">{ev?.modelName || tx(lang,{fr:'OF inconnu',ar:'أمر تصنيع غير معروف',en:'Unknown PO',es:'OF desconocido',pt:'OF desconhecido',tr:'Bilinmeyen Üretim Emri'})}</div>
                                                                    <div className="text-[10px] text-slate-400 dark:text-dk-muted">{tx(lang,{fr:'Client:',ar:'العميل:',en:'Client:',es:'Cliente:',pt:'Cliente:',tr:'Müşteri:'})} {ev?.clientName || '—'}</div>
                                                                </td>
                                                                <td className="p-3 font-bold text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300">{r.materialName}</td>
                                                                <td className="p-3 text-right font-black text-slate-800 dark:text-dk-text">{r.qtyReceived.toLocaleString()}</td>
                                                                <td className="p-3 text-center">
                                                                     <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${r.owner === 'client' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'}`}>
                                                                        {r.owner === 'client' ? tx(lang,{fr:'Consigné (Temykou)',ar:'مُودع (Temykou)',en:'Consigned (Temykou)',es:'Consignado (Temykou)',pt:'Consignado (Temykou)',tr:'Konsinye (Temykou)'}) : tx(lang,{fr:'Acheté',ar:'مُشترى',en:'Purchased',es:'Comprado',pt:'Comprado',tr:'Satın Alındı'})}
                                                                    </span>
                                                                </td>
                                                                <td className="p-3 text-right">
                                                                    <button onClick={() => {
                                                                        if (confirm(tx(lang,{fr:'Voulez-vous vraiment supprimer ce bon de réception ?',ar:'هل تريد حقاً حذف إيصال الاستلام هذا؟',en:'Are you sure you want to delete this receipt note?',es:'¿Está seguro de eliminar este recibo de recepción?',pt:'Tem a certeza que deseja excluir este recibo de receção?',tr:'Bu teslim alma belgesini silmek istediğinize emin misiniz?'}))) {
                                                                            const target = receptions[idx];
                                                                            const updated = receptions.filter((_, i) => i !== idx);
                                                                            setReceptions(updated);
                                                                            sv('beramethode_receptions', updated);
                                                                            if (target) {
                                                                                fetch(`/api/material-receipts/${target.id}`, {
                                                                                    method: 'DELETE',
                                                                                    credentials: 'include'
                                                                                }).catch(e => console.error("Error deleting receipt:", e));
                                                                            }
                                                                        }
                                                                    }} className="text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:text-rose-300 p-1">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* ══ Gestion des Surplus ══ */}
                {tab === 'surplus' && (() => {
                    const closedEvents = planningEvents.filter(ev => ev.status === 'DONE' || models.find(m => m.id === ev.modelId)?.ficheData?.statutProduction === 'Clôturé');
                    
                    const handleTransferSurplus = (r: MaterialReceipt, targetEvId: string) => {
                        const targetEv = planningEvents.find(x => x.id === targetEvId);
                        if (!targetEv) return alert(tx(lang, {fr: "Ordre cible non trouvé.", ar: "الأمر المستهدف غير موجود.", en: "Target order not found.", es: "Orden objetivo no encontrada.", pt: "Ordem alvo não encontrada.", tr: "Hedef sipariş bulunamadı."}));
                        
                        let updatedReceipt: MaterialReceipt | null = null;
                        const updated = receptions.map(item => {
                            if (item.id === r.id && item.materialName === r.materialName) {
                                updatedReceipt = { ...item, pedidoId: targetEvId, modelId: targetEv.modelId || '' };
                                return updatedReceipt;
                            }
                            return item;
                        });
                        setReceptions(updated);
                        sv('beramethode_receptions', updated);
                        if (updatedReceipt) {
                            fetch('/api/material-receipts', {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(updatedReceipt)
                            }).catch(e => console.error("Error updating receipt:", e));
                        }
                        alert(tx(lang, {fr: `Surplus transféré avec succès vers l'OF ${targetEv.modelName} !`, ar: `تم تحويل الفائض بنجاح إلى الأمر التصنيعي ${targetEv.modelName}!`, en: `Surplus successfully transferred to OF ${targetEv.modelName}!`, es: `¡Excedente transferido con éxito a la OF ${targetEv.modelName}!`, pt: `Excedente transferido com sucesso para a OF ${targetEv.modelName}!`, tr: `Fazlalık başarıyla ${targetEv.modelName} OF'sine aktarıldı!`}));
                        setSurplusModal(null);
                    };

                    const handleAbsorbSurplus = async (r: MaterialReceipt, valuation: number) => {
                        const matchedProduct = products.find(p => p.designation.toLowerCase() === r.materialName.toLowerCase());
                        if (!matchedProduct) {
                            alert("Le produit correspondant doit exister dans la base produits du magasin avant d'être absorbé.");
                            return;
                        }

                        // Register a stock movement IN as 'atelier'
                        const qty = r.qtyReceived; 
                        const newMvt: MouvementStock = {
                            id: uid(),
                            productId: matchedProduct.id,
                            type: 'entree',
                            source: 'fournisseur',
                            destination: 'inventaire',
                            quantite: qty,
                            prixUnitaire: valuation,
                            date: new Date().toISOString(),
                            notes: `Absorbé depuis Surplus BR ${r.id} (Modèle Clôturé)`,
                            documentRef: r.id,
                            bain: 'SURPLUS'
                        };

                        const currentLots = [...lots];
                        const newLot: LotStock = {
                            id: uid(),
                            productId: matchedProduct.id,
                            quantiteInitiale: qty,
                            quantiteRestante: qty,
                            prixUnitaire: valuation,
                            dateEntree: newMvt.date,
                            fournisseur: 'Atelier (Surplus)',
                            etat: 'disponible',
                            variante: 'SURPLUS'
                        };

                        try {
                            const res = await fetch('/api/magasin/mvt', {
                                credentials: 'include',
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    mouvement: newMvt,
                                    lotsUpdate: [...currentLots, newLot],
                                    productUpdate: { id: matchedProduct.id, prixUnitaire: valuation }
                                })
                            });

                            if (res.ok) {
                                setLots(prev => [...prev, newLot]);
                                setMvts(prev => [newMvt, ...prev]);
                                
                                // Update receipt ownership to 'atelier'
                                let updatedReceipt: MaterialReceipt | null = null;
                                const updatedReceptions = receptions.map(item => {
                                    if (item.id === r.id && item.materialName === r.materialName) {
                                        updatedReceipt = { ...item, owner: 'atelier' as const };
                                        return updatedReceipt;
                                    }
                                    return item;
                                });
                                setReceptions(updatedReceptions);
                                sv('beramethode_receptions', updatedReceptions);
                                if (updatedReceipt) {
                                    fetch('/api/material-receipts', {
                                        method: 'POST',
                                        credentials: 'include',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(updatedReceipt)
                                    }).catch(e => console.error("Error updating receipt:", e));
                                }
                                
                                alert(tx(lang, {fr: `Les surplus ont été intégrés au stock atelier avec une valeur de ${valuation} DH/pièce !`, ar: `تم دمج الفوائض في مخزون الورشة بقيمة ${valuation} درهم/قطعة!`, en: `Surplus has been integrated into workshop stock at a value of ${valuation} MAD/unit!`, es: `¡Los excedentes se han integrado al stock del taller con un valor de ${valuation} MAD/unidad!`, pt: `Os excedentes foram integrados no stock da oficina com um valor de ${valuation} MAD/peça!`, tr: `Fazlalıklar, ${valuation} MAD/birim değeriyle atölye stokuna eklendi!`}));
                                setSurplusModal(null);
                            } else {
                                alert("Erreur lors de l'intégration au stock serveur.");
                            }
                        } catch (err) {
                            console.error(err);
                            alert("Échec de connexion au serveur.");
                        }
                    };

                    return (
                        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 max-w-7xl mx-auto">
                            <div className="bg-gradient-to-r from-slate-800 to-indigo-900 p-6 rounded-3xl text-white shadow-lg dark:shadow-dk-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-10"><Scale className="w-48 h-48" /></div>
                                <h2 className="text-2xl font-black mb-1 flex items-center gap-3"><Scale className="w-6 h-6 text-indigo-400 dark:text-indigo-300" /> {t('Gestion des Surplus ( الفائض )')}</h2>
                                <p className="text-indigo-100 dark:text-indigo-200 font-bold max-w-xl">{t("Gérez le reste des matières et fournitures (Temykou) après la clôture des commandes. Transférez-les à un autre modèle ou intégrez-les au stock propre du magasin.")}</p>
                            </div>

                            <div className="bg-white dark:bg-dk-surface p-6 rounded-3xl border border-slate-200 dark:border-dk-border shadow-sm dark:shadow-dk-sm">
                                <h3 className="font-black text-slate-800 dark:text-dk-text text-lg border-b pb-2 mb-4">{t('Commandes Clôturées et Restants')}</h3>
                                
                                <div className="space-y-6">
                                    {closedEvents.map(ev => {
                                        const model = models.find(m => m.id === ev.modelId);
                                        const eventReceipts = receptions.filter(r => r.pedidoId === ev.id);
                                        const bom = model?.ficheData?.materials || [];

                                        return (
                                            <div key={ev.id} className="border border-slate-100 dark:border-dk-border/60 bg-slate-50 dark:bg-dk-bg/50 p-5 rounded-2xl">
                                                <div className="flex flex-wrap justify-between items-center border-b pb-3 mb-4">
                                                    <div>
                                                        <h4 className="font-black text-slate-800 dark:text-dk-text text-base">{ev.modelName}</h4>
                                                        <p className="text-xs font-semibold text-slate-400 dark:text-dk-muted">Client: {ev.clientName} | DDS: {ev.strictDeadline_DDS || '—'} | Qté commandée: {ev.qteTotal} pcs</p>
                                                    </div>
                                                    <span className="px-3 py-1 bg-slate-200 dark:bg-dk-border text-slate-700 dark:text-dk-text font-bold text-xs rounded-full uppercase">Clôturé / Terminée</span>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {eventReceipts.map((r, idx) => {
                                                        const bomItem = bom.find(b => b.name === r.materialName);
                                                        const unitQty = bomItem ? bomItem.qty : 0;
                                                        const theoreticalCons = ev.qteTotal * unitQty;
                                                        const surplus = Math.max(0, r.qtyReceived - theoreticalCons);
                                                        const isConsumed = surplus === 0;

                                                        return (
                                                            <div key={idx} className="bg-white dark:bg-dk-surface p-4 border rounded-xl shadow-sm dark:shadow-dk-sm flex flex-col justify-between">
                                                                <div>
                                                                    <div className="flex justify-between items-start">
                                                                        <span className="font-bold text-slate-800 dark:text-dk-text text-sm">{r.materialName}</span>
                                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${isConsumed ? 'bg-slate-100 dark:bg-dk-elevated/60 text-slate-500 dark:text-dk-muted' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800'}`}>
                                                                            {isConsumed ? 'Consommé' : 'Fonds Excédentaire'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-2 mt-3 text-center border-y py-2 text-xs">
                                                                        <div>
                                                                            <span className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{tx(lang, {fr: 'Reçu', ar: 'المستلم', en: 'Received', es: 'Recibido', pt: 'Recebido', tr: 'Alınan'})}</span>
                                                                            <span className="font-bold text-slate-700 dark:text-dk-text">{r.qtyReceived.toLocaleString()}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">Théorique</span>
                                                                            <span className="font-bold text-slate-700 dark:text-dk-text">{theoreticalCons.toLocaleString()}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="block text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">Surplus</span>
                                                                            <span className={`font-black ${surplus > 0 ? 'text-emerald-600 dark:text-emerald-400 dark:text-emerald-300' : 'text-slate-500 dark:text-dk-muted'}`}>{surplus.toLocaleString()}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {surplus > 0 && r.owner === 'client' && (
                                                                    <div className="flex gap-2 mt-4 pt-2 border-t">
                                                                        <button onClick={() => {
                                                                            setSurplusModal({ open: true, eventId: ev.id, materialName: r.materialName, surplusQty: surplus, isTemykou: true });
                                                                            setSurplusActionType('transfer');
                                                                            setSurplusTargetEventId('');
                                                                        }} className="flex-1 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-dk-accent-text dark:text-indigo-300 font-bold text-xs rounded transition-colors uppercase tracking-wider">
                                                                            {tx(lang, {fr: 'Transférer', ar: 'تحويل', en: 'Transfer', es: 'Transferir', pt: 'Transferir', tr: 'Aktar'})}
                                                                        </button>
                                                                        <button onClick={() => {
                                                                            setSurplusModal({ open: true, eventId: ev.id, materialName: r.materialName, surplusQty: surplus, isTemykou: true });
                                                                            setSurplusActionType('absorb');
                                                                            setSurplusAbsorbValuation('');
                                                                        }} className="flex-1 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold text-xs rounded transition-colors uppercase tracking-wider">
                                                                            Absorber (Atelier)
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {r.owner === 'atelier' && (
                                                                    <div className="text-[10px] text-slate-400 dark:text-dk-muted font-bold mt-4 pt-2 border-t text-center uppercase tracking-widest">
                                                                        Intégré au stock général
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    {eventReceipts.length === 0 && (
                                                        <div className="col-span-full py-4 text-center text-xs text-slate-400 dark:text-dk-muted font-semibold italic">
                                                            Aucune livraison enregistrée pour cette commande.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {closedEvents.length === 0 && (
                                        <div className="text-center py-10 text-slate-400 dark:text-dk-muted font-bold italic">
                                            Aucune commande clôturée disponible pour l'analyse des restants.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Surplus Actions Modal */}
                            {surplusModal?.open && (
                                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                                    <div className="bg-white dark:bg-dk-surface rounded-3xl shadow-xl dark:shadow-dk-elevated w-full max-w-md p-6 overflow-hidden flex flex-col">
                                        <div className="flex items-center justify-between mb-4 border-b pb-2">
                                            <h3 className="font-black text-slate-800 dark:text-dk-text text-lg flex items-center gap-2">
                                                <Scale className="w-5 h-5 text-indigo-500 dark:text-indigo-300" /> Action sur Surplus
                                            </h3>
                                            <button onClick={() => setSurplusModal(null)} className="p-2 hover:bg-slate-100 rounded-full">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="text-sm font-bold text-slate-600 dark:text-dk-text-soft mb-4 bg-slate-50 dark:bg-dk-bg p-3 rounded-xl border">
                                            <div className="flex justify-between"><span>Fourniture :</span> <span className="text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text dark:text-indigo-300">{surplusModal.materialName}</span></div>
                                            <div className="flex justify-between mt-1"><span>{tx(lang,{fr:'Quantité surplus :',ar:'كمية الفائض :',en:'Surplus quantity :',es:'Cantidad sobrante :',pt:'Quantidade excedente :',tr:'Fazla miktar :'})}</span> <span className="text-emerald-600 dark:text-emerald-400 dark:text-emerald-300">{surplusModal.surplusQty?.toLocaleString()}</span></div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex bg-slate-100 dark:bg-dk-elevated/60 rounded-lg p-1">
                                                <button onClick={() => setSurplusActionType('transfer')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${surplusActionType === 'transfer' ? 'bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text shadow-sm dark:shadow-dk-sm' : 'text-slate-500 dark:text-dk-muted'}`}>{tx(lang,{fr:'Transférer',ar:'تحويل',en:'Transfer',es:'Transferir',pt:'Transferir',tr:'Aktar'})}</button>
                                                <button onClick={() => setSurplusActionType('absorb')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${surplusActionType === 'absorb' ? 'bg-white dark:bg-dk-surface text-slate-800 dark:text-dk-text shadow-sm dark:shadow-dk-sm' : 'text-slate-500 dark:text-dk-muted'}`}>{tx(lang,{fr:'Absorber',ar:'استيعاب',en:'Absorb',es:'Absorber',pt:'Absorver',tr:'Em'})}</button>
                                            </div>

                                            {surplusActionType === 'transfer' && (
                                                <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                                    <Lbl t={tx(lang,{fr:'Sélectionner le Modèle cible (même client)',ar:'اختر النموذج الهدف (نفس العميل)',en:'Select target Model (same client)',es:'Seleccionar Modelo objetivo (mismo cliente)',pt:'Selecionar Modelo alvo (mesmo cliente)',tr:'Hedef Modeli Seçin (aynı müşteri)'})} />
                                                    <select className={inp} value={surplusTargetEventId} onChange={e => setSurplusTargetEventId(e.target.value)}>
                                                        <option value="">{tx(lang,{fr:'-- Choisir OF cible --',ar:'-- اختر أمر التصنيع الهدف --',en:'-- Select target PO --',es:'-- Seleccionar OF objetivo --',pt:'-- Selecionar OF alvo --',tr:'-- Hedef Üretim Emri Seçin --'})}</option>
                                                        {planningEvents.filter(ev => ev.status !== 'DONE' && ev.clientName === planningEvents.find(x => x.id === surplusModal.eventId)?.clientName).map(ev => (
                                                            <option key={ev.id} value={ev.id}>{ev.modelName} (DDS: {ev.strictDeadline_DDS || '—'})</option>
                                                        ))}
                                                    </select>
                                                    <button onClick={() => {
                                                        const r = receptions.find(x => x.pedidoId === surplusModal.eventId && x.materialName === surplusModal.materialName);
                                                        if (r) handleTransferSurplus(r, surplusTargetEventId);
                                                    }} className="w-full bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white font-black py-2.5 rounded-xl text-sm">
                                                        {tx(lang,{fr:'Valider le transfert',ar:'تأكيد التحويل',en:'Confirm Transfer',es:'Confirmar transferencia',pt:'Confirmar transferência',tr:'Aktarımı Onayla'})}
                                                    </button>
                                                </div>
                                            )}

                                            {surplusActionType === 'absorb' && (
                                                <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                                    <Lbl t={tx(lang,{fr:'Valorisation Unitaire (DH / pièce) *',ar:'تقييم الوحدة (درهم / قطعة) *',en:'Unit Valuation (MAD / piece) *',es:'Valoración Unitaria (MAD / pieza) *',pt:'Valorização Unitária (MAD / peça) *',tr:'Birim Değerleme (MAD / adet) *'})} />
                                                    <input className={inp} type="number" min="0" placeholder="Ex: 12.50" value={surplusAbsorbValuation} onChange={e => setSurplusAbsorbValuation(e.target.value)} />
                                                    <button onClick={() => {
                                                        const r = receptions.find(x => x.pedidoId === surplusModal.eventId && x.materialName === surplusModal.materialName);
                                                        const val = parseFloat(surplusAbsorbValuation);
                                                        if (r && !isNaN(val) && val >= 0) handleAbsorbSurplus(r, val);
                                                        else alert(tx(lang,{fr:'Entrez une valeur correcte.',ar:'أدخل قيمة صحيحة.',en:'Enter a correct value.',es:'Ingrese un valor correcto.',pt:'Insira um valor correto.',tr:'Doğru bir değer girin.'}));
                                                    }} className="w-full bg-emerald-600 dark:bg-emerald-700 text-white font-black py-2.5 rounded-xl text-sm">
                                                        {tx(lang,{fr:"Valider l'absorption au stock",ar:'تأكيد الاستيعاب في المخزون',en:'Confirm absorption to stock',es:'Confirmar absorción al stock',pt:'Confirmar absorção ao stock',tr:'Stoka emilimi onayla'})}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

            </div>

            {prodModal.open && <ProductModal item={prodModal.item} onSave={saveProduct} onClose={() => setProdModal({ ...prodModal, open: false })} />}
            {bcModal.open && bcModal.item && (
                <BonCommandeModal
                    bc={bcModal.item}
                    products={products}
                    settings={dtpSettings}
                    onSave={bc => { setCommandes(prev => prev.find(x => x.id === bc.id) ? prev.map(x => x.id === bc.id ? bc : x) : [bc, ...prev]); setBcModal({ open: false }); }}
                    onClose={() => setBcModal({ open: false })}
                />
            )}
            
            {/* INVOICE MODALS */}
            {showInvoiceSettings && <InvoiceSettingsModal template={invoiceTemplate} onSave={saveInvoiceTemplate} onClose={() => setShowInvoiceSettings(false)} />}
            {printerMvt && <InvoicePrinter mvt={printerMvt} product={products.find(x => x.id === printerMvt.productId)} template={invoiceTemplate} onClose={() => setPrinterMvt(null)} t={t} lang={lang} />}
            
            {/* PRODUCT DETAIL PANEL */}
            {selectedProductForDetail && (
                <ProductDetailPanel
                    product={selectedProductForDetail}
                    lots={lots}
                    mouvements={mvts}
                    initialTab={detailInitialTab}
                    startEditing={detailStartEditing}
                    onEditMovement={(mvt) => {
                        setSelectedMovement(mvt);
                        setMovementEditDraft(mvt);
                    }}
                    onClose={() => {
                        setSelectedProductForDetail(null);
                        setDetailInitialTab('overview');
                        setDetailStartEditing(false);
                    }}
                    onSave={async (updatedProduct) => {
                        try {
                            const res = await fetch('/api/magasin/products', { credentials: 'include',  
                                method: 'POST', 
                                headers: { 'Content-Type': 'application/json' }, 
                                body: JSON.stringify(updatedProduct) 
                            });
                            if (res.ok) {
                                await refreshProducts();
                                setSelectedProductForDetail(updatedProduct);
                            } else {
                                alert('Erreur Serveur: Impossible de sauvegarder le produit.');
                            }
                        } catch (e) {
                            console.error(e);
                            alert(tx(lang, {fr: 'Erreur: Vérifiez votre connexion au serveur.', ar: 'خطأ: تحقق من اتصالك بالخادم.', en: 'Error: Check your server connection.', es: 'Error: Verifique su conexión al servidor.', pt: 'Erro: Verifique sua conexão ao servidor.', tr: 'Hata: Sunucu bağlantınızı kontrol edin.'}));
                        }
                    }}
                    lang={lang as 'fr' | 'ar' | 'en'}
                />
            )}
            {selectedMovement && movementEditDraft && (
                <MovementDetailModal
                    movement={selectedMovement}
                    product={products.find(p => p.id === selectedMovement.productId) || undefined}
                    stock={products.find(p => p.id === selectedMovement.productId) ? stockQty(lots, selectedMovement.productId) : 0}
                    draft={movementEditDraft}
                    setDraft={setMovementEditDraft}
                    onSave={saveMovementChanges}
                    onDelete={deleteMovement}
                    onClose={() => {
                        setSelectedMovement(null);
                        setMovementEditDraft(null);
                    }}
                    onViewProduct={(prod) => {
                        setSelectedProductForDetail(prod);
                        setSelectedMovement(null);
                        setMovementEditDraft(null);
                    }}
                    t={t}
                    lang={lang}
                />
            )}
        </div>
    );
}

function MovementDetailModal({ movement, product, stock, draft, setDraft, onSave, onDelete, onClose, onViewProduct, t, lang }: {
    movement: MouvementStock;
    product?: MagasinProduct;
    stock: number;
    draft: MouvementStock;
    setDraft: React.Dispatch<React.SetStateAction<MouvementStock | null>>;
    onSave: (movement: MouvementStock) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
    onViewProduct: (product: MagasinProduct) => void;
    t: (s: string) => string;
    lang: Lang;
}) {
    const toDatetimeLocal = (iso: string) => {
        const d = new Date(iso);
        const offset = d.getTimezoneOffset();
        const local = new Date(d.getTime() - offset * 60000);
        return local.toISOString().slice(0, 16);
    };

    const fromDatetimeLocal = (value: string) => {
        const d = new Date(value);
        const offset = d.getTimezoneOffset();
        return new Date(d.getTime() + offset * 60000).toISOString();
    };

    const setField = (key: keyof MouvementStock, value: any) => {
        setDraft(prev => prev ? ({ ...prev, [key]: value }) : prev);
    };

    const isEntry = draft.type === 'entree' || draft.type === 'retour_atelier';
    const isExit = draft.type === 'sortie' || draft.type === 'rebut' || draft.type === 'reservation';

    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-dk-surface rounded-3xl shadow-2xl dark:shadow-dk-elevated w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-dk-border flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-black text-slate-800 dark:text-dk-text flex items-center gap-2"><History className="w-5 h-5 text-indigo-500 dark:text-indigo-300" /> {t('Détails de l\'activité')}</h2>
                        <p className="text-xs text-slate-500 dark:text-dk-muted">{t('Modifier la ligne et enregistrer pour ajuster le registre de mouvement.')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-slate-500 dark:text-dk-muted hover:bg-slate-100"><X className="w-5 h-5" /></button>
                </div>
                <div className="overflow-y-auto p-6 space-y-6">
                    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                        <div className="space-y-4">
                            <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg p-4 flex items-center gap-4">
                                <div className="w-20 h-20 rounded-3xl overflow-hidden bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border flex items-center justify-center">
                                    {product?.photo ? <img src={product.photo} alt={product.designation} className="w-full h-full object-cover" /> : <Package className="w-8 h-8 text-slate-400 dark:text-dk-muted" />}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs uppercase tracking-widest text-slate-400 dark:text-dk-muted font-black">{t('Produit')}</p>
                                    <h3 className="font-black text-slate-900 dark:text-dk-text truncate">{product?.designation || t('Inconnu')}</h3>
                                    <p className="text-xs text-slate-500 dark:text-dk-muted">{product?.reference || ''}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
                                    <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Stock actuel')}</p>
                                    <p className="text-2xl font-black text-slate-800 dark:text-dk-text">{stock.toFixed(1)} {product?.unite || ''}</p>
                                </div>
                                <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
                                    <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Type de mouvement')}</p>
                                    <p className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase ${isEntry ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : isExit ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'}`}>{t(draft.type)}</p>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted">{t('Produit lié')}</p>
                                    <p className="font-black text-slate-900 dark:text-dk-text truncate">{product?.designation || t('Inconnu')}</p>
                                </div>
                                {product && <button onClick={() => onViewProduct(product)} className="px-3 py-2 rounded-xl bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white text-xs font-black hover:bg-indigo-700 dark:hover:bg-dk-accent-hover">{t('Voir produit')}</button>}
                            </div>
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="block text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Quantité')}</label>
                                    <input type="number" min="0" step="0.01" className="w-full border border-slate-200 dark:border-dk-border rounded-2xl px-3 py-2 text-sm" value={draft.quantite} onChange={e => setField('quantite', parseFloat(e.target.value) || 0)} />
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Date / Heure')}</label>
                                    <input type="datetime-local" className="w-full border border-slate-200 dark:border-dk-border rounded-2xl px-3 py-2 text-sm" value={toDatetimeLocal(draft.date)} onChange={e => setField('date', fromDatetimeLocal(e.target.value))} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Type')}</label>
                            <select className="w-full border border-slate-200 dark:border-dk-border rounded-2xl px-3 py-2 text-sm" value={draft.type} onChange={e => setField('type', e.target.value)}>
                                {['entree','sortie','retour_atelier','rebut','regularisation','reservation'].map(type => <option key={type} value={type}>{t(type)}</option>)}
                            </select>
                        </div>
                        <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Source')}</label>
                            <input className="w-full border border-slate-200 dark:border-dk-border rounded-2xl px-3 py-2 text-sm" value={draft.source} onChange={e => setField('source', e.target.value as any)} />
                        </div>
                        <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Destination')}</label>
                            <input className="w-full border border-slate-200 dark:border-dk-border rounded-2xl px-3 py-2 text-sm" value={draft.destination} onChange={e => setField('destination', e.target.value as any)} />
                        </div>
                        <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Prix Unitaire')}</label>
                            <input type="number" min="0" step="0.01" className="w-full border border-slate-200 dark:border-dk-border rounded-2xl px-3 py-2 text-sm" value={draft.prixUnitaire || ''} onChange={e => setField('prixUnitaire', e.target.value === '' ? undefined : parseFloat(e.target.value))} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Fournisseur')}</label>
                            <input className="w-full border border-slate-200 dark:border-dk-border rounded-2xl px-3 py-2 text-sm" value={draft.fournisseurId || ''} onChange={e => setField('fournisseurId', e.target.value || undefined)} />
                        </div>
                        <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Chaîne')}</label>
                            <input className="w-full border border-slate-200 dark:border-dk-border rounded-2xl px-3 py-2 text-sm" value={draft.chaineId || ''} onChange={e => setField('chaineId', e.target.value || undefined)} />
                        </div>
                        <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Référence OF')}</label>
                            <input className="w-full border border-slate-200 dark:border-dk-border rounded-2xl px-3 py-2 text-sm" value={draft.modeleRef || ''} onChange={e => setField('modeleRef', e.target.value || undefined)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Notes')}</label>
                            <textarea className="w-full min-h-[120px] border border-slate-200 dark:border-dk-border rounded-2xl px-3 py-2 text-sm" value={draft.notes || ''} onChange={e => setField('notes', e.target.value || undefined)} />
                        </div>
                        <div className="rounded-3xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 dark:text-dk-muted mb-2">{t('Document / Pièce jointe')}</label>
                            <input className="w-full border border-slate-200 dark:border-dk-border rounded-2xl px-3 py-2 text-sm" value={draft.documentRef || ''} onChange={e => setField('documentRef', e.target.value || undefined)} placeholder={t('Ref. bon / BL / facture')} />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg p-4 sm:flex-row sm:justify-between sm:items-center">
                    <button onClick={() => onDelete(movement.id)} className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-rose-600 dark:bg-rose-700 text-white font-black hover:bg-rose-700 transition-colors">{t('Supprimer')}</button>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <button onClick={onClose} className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text font-bold hover:bg-slate-50 dark:hover:bg-dk-elevated/60 transition-colors">{t('Annuler')}</button>
                        <button onClick={() => draft && onSave(draft)} className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-indigo-600 dark:bg-dk-accent dark:bg-indigo-700 text-white font-black hover:bg-indigo-700 dark:hover:bg-dk-accent-hover transition-colors">{t('Enregistrer')}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}