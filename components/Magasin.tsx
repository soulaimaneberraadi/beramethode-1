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

export interface MagasinProps {
    models?: ModelData[];
    demandes?: DemandeAppro[];
    setDemandes?: React.Dispatch<React.SetStateAction<DemandeAppro[]>>;
    planningEvents?: PlanningEvent[];
    lang?: 'fr' | 'ar' | 'en';
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
    tissu: 'bg-blue-100 text-blue-700', fil: 'bg-purple-100 text-purple-700',
    bouton: 'bg-amber-100 text-amber-700', fermeture: 'bg-slate-100 text-slate-600',
    etiquette: 'bg-green-100 text-green-700', emballage: 'bg-orange-100 text-orange-700',
    autre: 'bg-rose-100 text-rose-700',
};
const inp = "w-full border border-slate-200 bg-white rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all shadow-sm";
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

const Lbl = ({ t }: { t: string }) => <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">{t}</label>;

const StockBadge = ({ stock, seuil }: { stock: number; seuil: number }) => {
    if (stock === 0) return <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-[10px] font-black uppercase">Rupture</span>;
    if (stock <= seuil) return <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10px] font-black uppercase">Faible</span>;
    return <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase">En Stock</span>;
};

// ══════════════════════════════════════════════════════════════════════════════
//  PRODUCT MODAL
// ══════════════════════════════════════════════════════════════════════════════
function ProductModal({ item, onSave, onClose }: { item?: MagasinProduct; onSave: (p: MagasinProduct) => void; onClose: () => void; }) {
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
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="font-black text-slate-800 text-lg flex items-center gap-2">{item ? <Edit2 className="w-5 h-5 text-indigo-500" /> : <Plus className="w-5 h-5 text-emerald-500" />}{item ? 'Modifier Article' : 'Nouvel Article'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-rose-50 rounded-full transition-colors text-slate-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                    <div className="flex gap-5">
                        <div onClick={() => fileRef.current?.click()} className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 flex items-center justify-center cursor-pointer overflow-hidden shrink-0">
                            {f.photo ? <img src={f.photo} className="w-full h-full object-cover" alt="" /> : <span className="text-xs font-bold text-slate-400">Photo</span>}
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => {
                            const file = e.target.files?.[0]; if (!file) return;
                            const r = new FileReader(); r.onload = ev => set('photo', ev.target?.result as string); r.readAsDataURL(file);
                        }} />
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div><Lbl t="Référence (Code-barres)" /><input className={inp} value={f.reference} onChange={e => set('reference', e.target.value)} /></div>
                            <div><Lbl t="Désignation *" /><input className={inp} placeholder="Ex: Fil Coton Noir..." value={f.designation} onChange={e => set('designation', e.target.value)} autoFocus /></div>
                            <div><Lbl t="Catégorie" /><select className={inp} value={f.categorie} onChange={e => set('categorie', e.target.value)}>{CATS.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}</select></div>
                            <div><Lbl t="Unité" /><select className={inp} value={f.unite} onChange={e => set('unite', e.target.value)}>{UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div><Lbl t="Prix u. par défaut" /><input className={inp} type="number" min="0" step="0.01" value={f.prixUnitaire || ''} onChange={e => set('prixUnitaire', Math.max(0, +e.target.value.replace(/-/g, '') || 0))} /></div>
                        <div>
                            <div className="flex items-center gap-2 mb-1 cursor-pointer" onClick={() => { setHasAlerte(!hasAlerte); if (hasAlerte) set('stockAlerte', 0); }}>
                                <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded cursor-pointer" checked={hasAlerte} readOnly />
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide cursor-pointer">Seuil de réappro.</label>
                            </div>
                            <input className={`${inp} ${!hasAlerte ? 'opacity-50 cursor-not-allowed bg-slate-100' : ''}`} type="number" min="0" disabled={!hasAlerte} value={f.stockAlerte || ''} onChange={e => set('stockAlerte', Math.max(0, +e.target.value.replace(/-/g, '') || 0))} />
                        </div>
                        <div><Lbl t="Emplacement physique" /><input className={inp} placeholder="Rayon A, Étagère 3..." value={f.emplacement || ''} onChange={e => set('emplacement', e.target.value)} /></div>
                    </div>

                    <div className="border border-slate-100 bg-slate-50 rounded-2xl p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div><Lbl t="Fournisseur Privilégié" /><input className={inp} placeholder="Entreprise..." value={f.fournisseurNom || ''} onChange={e => set('fournisseurNom', e.target.value)} /></div>
                            <div><Lbl t="Téléphone Frs." /><input className={inp} placeholder="+212..." value={f.fournisseurTel || ''} onChange={e => set('fournisseurTel', e.target.value)} /></div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowFrsExtra(v => !v)}
                            className="w-full flex items-center justify-between gap-2 py-2 px-3 rounded-xl border border-slate-200 bg-white text-left text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <span>Informations fournisseur (optionnel)</span>
                            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showFrsExtra ? 'rotate-180' : ''}`} />
                        </button>
                        {showFrsExtra && (
                            <div className="space-y-4 pt-1 border-t border-slate-200">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><Lbl t="E-mail Frs." /><input className={inp} type="email" placeholder="contact@..." value={f.fournisseurEmail || ''} onChange={e => set('fournisseurEmail', e.target.value)} /></div>
                                    <div><Lbl t="Contact (personne)" /><input className={inp} placeholder="Nom du contact" value={f.fournisseurContact || ''} onChange={e => set('fournisseurContact', e.target.value)} /></div>
                                </div>
                                <div><Lbl t="Adresse" /><input className={inp} placeholder="Ville, rue, n°..." value={f.fournisseurAdresse || ''} onChange={e => set('fournisseurAdresse', e.target.value)} /></div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><Lbl t="ICE" /><input className={inp} placeholder="..." value={f.fournisseurIce || ''} onChange={e => set('fournisseurIce', e.target.value)} /></div>
                                    <div><Lbl t="RC" /><input className={inp} placeholder="..." value={f.fournisseurRc || ''} onChange={e => set('fournisseurRc', e.target.value)} /></div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div><Lbl t="Conditions de paiement" /><input className={inp} placeholder="Ex: 30j fin de mois" value={f.fournisseurConditionsPaiement || ''} onChange={e => set('fournisseurConditionsPaiement', e.target.value)} /></div>
                                    <div><Lbl t="Devise achat" />
                                        <select className={inp} value={f.fournisseurDevise ?? ''} onChange={e => set('fournisseurDevise', e.target.value || undefined)}>
                                            <option value="">—</option>
                                            <option value="MAD">MAD</option>
                                            <option value="EUR">EUR</option>
                                            <option value="USD">USD</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><Lbl t="Délai livraison (jours)" /><input className={inp} type="number" min="0" step="1" placeholder="—" value={f.fournisseurDelaiLivraisonJours ?? ''} onChange={e => set('fournisseurDelaiLivraisonJours', e.target.value === '' ? undefined : +e.target.value)} /></div>
                                    <div><Lbl t="MOQ (min. commande)" /><input className={inp} type="number" min="0" step="0.01" placeholder="—" value={f.fournisseurMoq ?? ''} onChange={e => set('fournisseurMoq', e.target.value === '' ? undefined : +e.target.value)} /></div>
                                </div>
                                <div><Lbl t="Notes fournisseur" /><textarea className={`${inp} min-h-[72px] resize-y`} placeholder="Qualité, horaires, remarques..." value={f.fournisseurNotes || ''} onChange={e => set('fournisseurNotes', e.target.value)} /></div>
                                <div><Lbl t="Logo fournisseur" /><div onClick={() => { const el = document.createElement('input'); el.type = 'file'; el.accept = 'image/*'; el.onchange = (e: any) => { const file = e.target.files?.[0]; if (file) { const r = new FileReader(); r.onload = ev => set('fournisseurLogo', ev.target?.result as string); r.readAsDataURL(file); } }; el.click(); }} className="w-full border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50 rounded-2xl p-4 cursor-pointer flex items-center justify-center">{f.fournisseurLogo ? <img src={f.fournisseurLogo} alt="Logo" className="w-24 h-24 object-contain" /> : <span className="text-xs font-bold text-slate-400">Cliquez pour ajouter logo</span>}</div></div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50">
                    <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors">Annuler</button>
                    <button onClick={() => { if (!f.designation.trim()) { alert('Désignation obligatoire'); return; } onSave(f); }} className="px-6 py-2 text-sm font-black bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-2"><Save className="w-4 h-4" /> Enregistrer</button>
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
    const [bc, setBc] = useState<BonCommande>({ ...initial });
    const [addPid, setAddPid] = useState('');
    const [addQty, setAddQty] = useState('');

    const calcTotal = (lignes: BonCommandeLigne[]) => lignes.reduce((s, l) => s + (l.quantite * (l.prixUnitaire || 0)), 0);

    const handleAdd = () => {
        if (!addPid || !addQty) return alert('Sélectionner un produit et une quantité');
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
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    <h2 className="font-black text-slate-800 text-lg flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-500" /> Éditer Bon de Commande - {bc.numero}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-rose-50 rounded-full transition-colors text-slate-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-50/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 border rounded-2xl shadow-sm">
                        <div><Lbl t="Fournisseur" /><input className={inp} value={bc.fournisseurNom} onChange={e => setBc({ ...bc, fournisseurNom: e.target.value })} /></div>
                        <div>
                            <Lbl t="Date Prévue" />
                            <DateTimePicker
                                value={bc.dateLivraisonPrevue || ''}
                                onChange={(iso) => setBc({ ...bc, dateLivraisonPrevue: iso.split('T')[0] })}
                                mode="date"
                                settings={settings}
                                inputClassName={inp}
                            />
                        </div>
                        <div><Lbl t="Statut" /><select className={inp} value={bc.statut} onChange={e => setBc({ ...bc, statut: e.target.value as any })}><option value="brouillon">Brouillon</option><option value="envoye">Envoyé</option><option value="valide">Validé/Approuvé</option><option value="livre">Livré totalement</option></select></div>
                    </div>

                    <div className="bg-white border rounded-2xl shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 bg-slate-50 border-b flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[200px]"><Lbl t="Ajouter un Produit" /><select className={inp} value={addPid} onChange={e => setAddPid(e.target.value)}><option value="">-- Sélectionner --</option>{products.map(p => <option key={p.id} value={p.id}>{p.reference} - {p.designation} (Frs: {p.fournisseurNom || '?'})</option>)}</select></div>
                            <div className="w-32"><Lbl t="Quantité" /><input type="number" min="0" className={inp} value={addQty} onChange={e => setAddQty(e.target.value.replace(/-/g, ''))} /></div>
                            <button onClick={handleAdd} className="bg-indigo-600 text-white px-4 py-2 h-[38px] rounded-xl font-bold text-sm hover:bg-indigo-700">Ajouter</button>
                        </div>

                        <div className="p-0 overflow-x-auto max-h-[300px]">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50 sticky top-0 border-b"><tr className="text-slate-500"><th className="p-3 font-bold">Produit</th><th className="p-3 font-bold text-right">Qté</th><th className="p-3 font-bold text-right">Prix Unitaire</th><th className="p-3 font-bold text-right">Sous-total</th><th className="p-3 pr-4"></th></tr></thead>
                                <tbody>
                                    {bc.lignes.length === 0 ? <tr><td colSpan={5} className="p-8 text-center text-slate-400 font-bold bg-white">Aucun produit dans cette commande.</td></tr> : bc.lignes.map(l => (
                                        <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50 bg-white">
                                            <td className="p-3 font-bold text-slate-700">{l.productNom}</td>
                                            <td className="p-3 text-right"><input type="number" min="0" className="w-20 border rounded px-2 py-1 text-right text-sm font-bold bg-slate-50" value={l.quantite} onChange={e => { const val = parseFloat(e.target.value.replace(/-/g, '')) || 0; const mathMaxVal = Math.max(0, val); const nl = bc.lignes.map(x => x.id === l.id ? { ...x, quantite: mathMaxVal } : x); setBc({ ...bc, lignes: nl, total: calcTotal(nl) }); }} /></td>
                                            <td className="p-3 text-right"><input type="number" min="0" className="w-24 border rounded px-2 py-1 text-right text-sm font-bold bg-slate-50" value={l.prixUnitaire || 0} onChange={e => { const val = parseFloat(e.target.value.replace(/-/g, '')) || 0; const mathMaxVal = Math.max(0, val); const nl = bc.lignes.map(x => x.id === l.id ? { ...x, prixUnitaire: mathMaxVal } : x); setBc({ ...bc, lignes: nl, total: calcTotal(nl) }); }} /> DH</td>
                                            <td className="p-3 text-right font-black text-indigo-600">{(l.quantite * (l.prixUnitaire || 0)).toLocaleString()} DH</td>
                                            <td className="p-3 pr-4 text-right"><button onClick={() => rmLine(l.id)} className="text-slate-400 hover:text-rose-500 p-1"><Trash2 className="w-4 h-4" /></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 bg-slate-100 border-t flex justify-end items-center gap-4">
                            <span className="text-sm font-bold text-slate-500 uppercase">Total Estimé HT</span>
                            <span className="text-2xl font-black text-slate-800">{(bc.total || 0).toLocaleString()} <span className="text-sm">DH</span></span>
                        </div>
                    </div>
                </div>

                <div className="flex justify-between items-center px-6 py-4 border-t border-slate-100 bg-white shrink-0">
                    <div className="text-xs text-slate-400 font-bold"><Activity className="w-3 h-3 inline mr-1" /> Sauvegarde automatique locale</div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Fermer</button>
                        <button onClick={() => onSave(bc)} className="px-8 py-2.5 text-sm font-black bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Enregistrer BC</button>
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

    const invInp = 'w-full bg-white/90 border border-slate-200/80 rounded-xl px-4 py-2.5 mt-1.5 text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 transition-all duration-200 hover:border-slate-300';

    // Toggle component — amber/warm theme
    const Toggle = ({ k, label, icon: Ic }: { k: keyof InvoiceTemplate; label: string; icon?: React.FC<any> }) => {
        const on = !!s[k];
        return (
            <button type="button" onClick={() => setS(p => ({ ...p, [k]: !p[k] }))} className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all duration-200 group ${
                on ? 'bg-white border-amber-200/60 shadow-sm shadow-amber-100/50' : 'bg-slate-50/50 border-slate-100 hover:border-slate-200'
            }`}>
                {Ic && <Ic className={`w-3.5 h-3.5 transition-colors ${on ? 'text-amber-500' : 'text-slate-300'}`} />}
                <span className={`flex-1 text-left text-[13px] font-semibold transition-colors ${on ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
                <div className={`relative w-10 h-[22px] rounded-full transition-all duration-300 shrink-0 ${on ? 'bg-gradient-to-r from-amber-400 to-orange-400 shadow-inner' : 'bg-slate-200'}`}>
                    <div className={`absolute top-[3px] w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 ${on ? 'left-[21px] scale-105' : 'left-[3px]'}`} />
                </div>
            </button>
        );
    };

    // ─── LIVE DOCUMENT PREVIEW (always visible) ───
    const LivePreview = () => (
        <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden h-full" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* Preview header badge */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-3 py-1.5 flex items-center justify-between">
                <span className="text-[9px] font-black text-white/70 uppercase tracking-widest flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Aperçu en direct
                </span>
                <span className="text-[8px] text-white/40 font-bold">A4</span>
            </div>
            <div className="p-3.5 space-y-2.5" style={{ fontSize: '8px', lineHeight: 1.5 }}>
                {/* Header */}
                <div className="flex justify-between items-start pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        {s.showLogo && <div className="w-7 h-7 rounded bg-amber-50 flex items-center justify-center overflow-hidden border border-amber-100">
                            {s.logo ? <img src={s.logo} className="w-full h-full object-contain" /> : <Building2 className="w-3.5 h-3.5 text-amber-400" />}
                        </div>}
                        <div>
                            <div className="font-black text-[9px] text-slate-800">{s.raisonSociale || 'VOTRE ENTREPRISE'}</div>
                            {s.showAdresse && s.adresse && <div className="text-slate-400" style={{ fontSize: '6.5px' }}>{s.adresse}</div>}
                            <div className="flex gap-2 mt-0.5">
                                {s.showTelephone && s.telephone && <span className="text-slate-400" style={{ fontSize: '5.5px' }}>📞 {s.telephone}</span>}
                                {s.showEmail && s.email && <span className="text-slate-400" style={{ fontSize: '5.5px' }}>✉ {s.email}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        {s.showDocumentNumber && <div className="font-black text-amber-600" style={{ fontSize: '7px' }}>BL-2025-A1B2C3</div>}
                        {s.showDateDocument && <div className="text-slate-400" style={{ fontSize: '5.5px' }}>{new Date().toLocaleDateString('fr-FR')}</div>}
                    </div>
                </div>

                {/* Legal bar */}
                {(s.showICE || s.showRC || s.showIF) && (
                    <div className="flex gap-2 text-slate-400" style={{ fontSize: '5.5px' }}>
                        {s.showICE && <span>ICE: {s.ice || '...'}</span>}
                        {s.showRC && <span>RC: {s.rc || '...'}</span>}
                        {s.showIF && <span>IF: {s.if_number || '...'}</span>}
                    </div>
                )}

                {/* Type */}
                {s.showTypeOperation && <div className="text-center font-black text-[9px] text-amber-700 py-1 bg-amber-50 rounded border border-amber-100">BON DE LIVRAISON</div>}

                {/* Table */}
                <div className="border border-slate-100 rounded overflow-hidden">
                    <div className="flex bg-slate-50 font-black text-slate-500" style={{ fontSize: '5.5px' }}>
                        <div className="flex-1 p-1">Désignation</div>
                        {s.showReferenceColumn && <div className="w-10 p-1">Réf</div>}
                        <div className="w-7 p-1 text-center">Qté</div>
                        {s.showPrixColumn && <div className="w-10 p-1 text-right">P.U.</div>}
                        {s.showTotalColumn && <div className="w-12 p-1 text-right">Total</div>}
                    </div>
                    <div className="flex text-slate-600" style={{ fontSize: '5.5px' }}>
                        <div className="flex-1 p-1">Tissu coton premium</div>
                        {s.showReferenceColumn && <div className="w-10 p-1">TSU-001</div>}
                        <div className="w-7 p-1 text-center">50</div>
                        {s.showPrixColumn && <div className="w-10 p-1 text-right">45.00</div>}
                        {s.showTotalColumn && <div className="w-12 p-1 text-right font-bold">2,250.00</div>}
                    </div>
                    <div className="flex text-slate-500 border-t border-slate-50" style={{ fontSize: '5.5px' }}>
                        <div className="flex-1 p-1">Boutons nacre 20mm</div>
                        {s.showReferenceColumn && <div className="w-10 p-1">BTN-042</div>}
                        <div className="w-7 p-1 text-center">200</div>
                        {s.showPrixColumn && <div className="w-10 p-1 text-right">3.50</div>}
                        {s.showTotalColumn && <div className="w-12 p-1 text-right font-bold">700.00</div>}
                    </div>
                    {s.showFillerRows && [0,1].map(i => <div key={i} className="flex border-t border-slate-50" style={{ fontSize: '5.5px' }}>
                        <div className="flex-1 p-1 text-slate-200">—</div>
                    </div>)}
                </div>

                {/* Total */}
                {s.showTotalColumn && <div className="flex justify-end">
                    <div className="bg-slate-50 rounded px-2 py-1 border border-slate-100">
                        <span className="text-slate-400 font-bold" style={{ fontSize: '5.5px' }}>Total HT: </span>
                        <span className="text-slate-700 font-black" style={{ fontSize: '7px' }}>2,950.00 MAD</span>
                    </div>
                </div>}

                {/* Parties */}
                {s.showPartiesSection && <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-slate-50 rounded p-1.5"><div className="font-black text-slate-400 mb-0.5" style={{ fontSize: '5.5px' }}>ÉMETTEUR</div><div className="text-slate-300" style={{ fontSize: '4.5px' }}>Cachet & Signature</div></div>
                    <div className="bg-slate-50 rounded p-1.5"><div className="font-black text-slate-400 mb-0.5" style={{ fontSize: '5.5px' }}>DESTINATAIRE</div><div className="text-slate-300" style={{ fontSize: '4.5px' }}>Reçu par</div></div>
                </div>}

                {/* Notes */}
                {s.showNotesSection && <div className="bg-amber-50/50 rounded p-1.5"><span className="font-bold text-amber-500" style={{ fontSize: '5.5px' }}>Notes:</span> <span className="text-slate-400" style={{ fontSize: '4.5px' }}>Observations...</span></div>}

                {/* Signatures */}
                {s.showSignatureZone && <div className="grid grid-cols-2 gap-3 pt-1.5 border-t border-dashed border-slate-200">
                    <div className="text-center"><div className="w-full h-3 border-b border-slate-200" /><div className="text-slate-400 mt-0.5" style={{ fontSize: '4.5px' }}>Signature Magasinier</div></div>
                    <div className="text-center"><div className="w-full h-3 border-b border-slate-200" /><div className="text-slate-400 mt-0.5" style={{ fontSize: '4.5px' }}>Signature Récepteur</div></div>
                </div>}

                {/* Footer */}
                {s.showPiedDePage && s.piedDePage && <div className="text-center text-slate-300 pt-1 border-t border-slate-100" style={{ fontSize: '4.5px' }}>{s.piedDePage.substring(0, 80)}{s.piedDePage.length > 80 ? '...' : ''}</div>}
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
                <div className={`relative bg-white/95 backdrop-blur-2xl rounded-[24px] shadow-2xl w-full max-w-[1200px] max-h-[92vh] overflow-hidden flex flex-col border border-white/40 ${isClosing ? 'inv-modal-exit' : 'inv-modal-enter'}`}
                     style={{ boxShadow: '0 32px 64px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.1) inset' }}>

                    {/* ─ HEADER ─ warm amber/charcoal */}
                    <div className="relative px-7 py-4 shrink-0 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-800" />
                        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 70% 50%, rgba(245,158,11,0.12) 0%, transparent 60%)' }} />
                        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/5 rounded-full -translate-y-1/2 translate-x-1/4" />

                        <div className="relative flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 bg-amber-500/15 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-amber-400/20 shadow-lg shadow-amber-900/10">
                                    <FileText className="w-5 h-5 text-amber-400" />
                                </div>
                                <div>
                                    <h2 className="font-black text-white text-lg tracking-tight">Paramètres Documents</h2>
                                    <p className="text-amber-200/50 text-xs font-semibold mt-0.5 tracking-wide">Personnalisez vos Factures & Bons de Livraison</p>
                                </div>
                            </div>
                            <button onClick={handleClose} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-all duration-200 border border-white/5">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* ─ BODY: SPLIT PANEL ─ */}
                    <div className="flex-1 flex overflow-hidden min-h-0">

                        {/* ══ LEFT SIDE: Vertical Tabs + Settings ══ */}
                        <div className="flex-1 flex min-w-0">
                            {/* Vertical Tab Bar */}
                            <div className="w-[52px] shrink-0 bg-slate-50/80 border-r border-slate-100/80 py-3 flex flex-col items-center gap-1">
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
                                                    ? 'bg-white shadow-sm border border-slate-200/60 text-amber-600'
                                                    : 'text-slate-400 hover:text-slate-600 hover:bg-white/60'
                                            }`}
                                        >
                                            <Icon className={`w-4 h-4 ${isActive ? 'text-amber-500' : ''}`} />
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
                                                <h3 className="font-black text-slate-800 text-base flex items-center gap-2"><Image className="w-5 h-5 text-amber-500" /> Logo & Identité</h3>
                                                <p className="text-xs text-slate-400 font-medium mt-0.5">Votre logo apparaîtra sur tous les documents</p>
                                            </div>

                                            {/* Logo upload */}
                                            <div className="relative bg-gradient-to-br from-slate-50 to-white rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center group hover:border-amber-300 transition-all duration-300">
                                                {s.logo ? (
                                                    <div className="space-y-3">
                                                        <div className="w-24 h-24 mx-auto rounded-2xl bg-white shadow-lg border border-slate-100 overflow-hidden p-2">
                                                            <img src={s.logo} className="w-full h-full object-contain" />
                                                        </div>
                                                        <div className="flex items-center justify-center gap-2">
                                                            <label className="cursor-pointer px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors">
                                                                Changer
                                                                <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
                                                            </label>
                                                            <button onClick={() => setS(p => ({ ...p, logo: '' }))} className="px-3 py-1.5 text-rose-500 hover:bg-rose-50 rounded-lg text-xs font-bold transition-colors">
                                                                Supprimer
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <label className="cursor-pointer block space-y-2">
                                                        <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 group-hover:bg-amber-50 flex items-center justify-center transition-colors">
                                                            <Image className="w-7 h-7 text-slate-300 group-hover:text-amber-400 transition-colors" />
                                                        </div>
                                                        <p className="text-sm font-bold text-slate-500">Glissez ou <span className="text-amber-600 underline">parcourir</span></p>
                                                        <p className="text-[10px] text-slate-300">PNG, JPG, SVG • Max 2 Mo</p>
                                                        <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
                                                    </label>
                                                )}
                                            </div>

                                            <Toggle k="showLogo" label="Afficher le logo sur les documents" icon={Eye} />
                                        </div>
                                    )}

                                    {/* ═══ COMPANY TAB ═══ */}
                                    {activeTab === 'company' && (
                                        <div className="space-y-5">
                                            <div>
                                                <h3 className="font-black text-slate-800 text-base flex items-center gap-2"><Building2 className="w-5 h-5 text-emerald-500" /> Informations Société</h3>
                                                <p className="text-xs text-slate-400 font-medium mt-0.5">En-tête de vos documents</p>
                                            </div>
                                            <div className="space-y-3">
                                                 <div>
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Briefcase className="w-3 h-3" /> Raison Sociale <span className="text-rose-400">*</span></label>
                                                    <input className={invInp} value={s.raisonSociale} onChange={e => setS(p => ({ ...p, raisonSociale: e.target.value }))} placeholder="Ex: BERAMETHODE SARL" />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><MapPin className="w-3 h-3" /> Adresse</label>
                                                    <input className={invInp} value={s.adresse} onChange={e => setS(p => ({ ...p, adresse: e.target.value }))} placeholder="123 Rue du Commerce, Casablanca" />
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Phone className="w-3 h-3" /> Téléphone</label>
                                                        <input className={invInp} value={s.telephone} onChange={e => setS(p => ({ ...p, telephone: e.target.value }))} placeholder="+212 5XX-XXXXXX" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Mail className="w-3 h-3" /> Email</label>
                                                        <input className={invInp} value={s.email} onChange={e => setS(p => ({ ...p, email: e.target.value }))} placeholder="contact@entreprise.ma" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="pt-4 border-t border-slate-100 space-y-1.5">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Visibilité</p>
                                                <Toggle k="showAdresse" label="Adresse" icon={MapPin} />
                                                <Toggle k="showTelephone" label="Téléphone" icon={Phone} />
                                                <Toggle k="showEmail" label="Email" icon={Mail} />
                                            </div>
                                        </div>
                                    )}

                                    {/* ═══ LEGAL TAB ═══ */}
                                    {activeTab === 'legal' && (
                                        <div className="space-y-5">
                                            <div>
                                                <h3 className="font-black text-slate-800 text-base flex items-center gap-2"><Stamp className="w-5 h-5 text-amber-500" /> Identifiants Légaux</h3>
                                                <p className="text-xs text-slate-400 font-medium mt-0.5">Identifiants fiscaux obligatoires</p>
                                            </div>
                                            <div className="space-y-3">
                                                {[
                                                    { key: 'ice' as keyof InvoiceTemplate, label: 'ICE', ph: '000000000000001' },
                                                    { key: 'rc' as keyof InvoiceTemplate, label: 'RC', ph: 'CS 12345' },
                                                    { key: 'if_number' as keyof InvoiceTemplate, label: 'IF', ph: '12345678' },
                                                ].map(f => (
                                                    <div key={f.key} className="bg-amber-50/30 rounded-xl p-3 border border-amber-100/40">
                                                        <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1"><Hash className="w-3 h-3" /> {f.label}</label>
                                                        <input className={invInp} value={s[f.key] as string} onChange={e => setS(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} />
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="pt-4 border-t border-slate-100 space-y-1.5">
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Visibilité</p>
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
                                                <h3 className="font-black text-slate-800 text-base flex items-center gap-2"><AlignLeft className="w-5 h-5 text-purple-500" /> Pied de Page</h3>
                                                <p className="text-xs text-slate-400 font-medium mt-0.5">Mentions en bas de chaque document</p>
                                            </div>
                                            <div className="relative">
                                                <textarea
                                                    className="w-full bg-white/90 border border-slate-200/80 rounded-2xl px-4 py-3 text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all duration-200 resize-none"
                                                    rows={4}
                                                    value={s.piedDePage}
                                                    onChange={e => setS(p => ({ ...p, piedDePage: e.target.value }))}
                                                    placeholder={"Ex: Banque Populaire • Compte N° 0000-0000\nConditions: Paiement à 30 jours"}
                                                />
                                                <div className="absolute bottom-2.5 right-3 text-[9px] font-bold text-slate-300">{(s.piedDePage || '').length}/200</div>
                                            </div>
                                            <Toggle k="showPiedDePage" label="Afficher le pied de page" icon={Eye} />
                                        </div>
                                    )}

                                    {/* ═══ VISIBILITY TAB ═══ */}
                                    {activeTab === 'visibility' && (
                                        <div className="space-y-5">
                                            <div>
                                                <h3 className="font-black text-slate-800 text-base flex items-center gap-2"><Eye className="w-5 h-5 text-rose-500" /> Contenu Document</h3>
                                                <p className="text-xs text-slate-400 font-medium mt-0.5">Éléments visibles à l'impression</p>
                                            </div>

                                            {/* Document block */}
                                            <div className="bg-violet-50/30 rounded-xl p-3.5 border border-violet-100/40">
                                                <h4 className="text-[10px] font-black text-violet-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Bloc Document</h4>
                                                <div className="space-y-1.5">
                                                    <Toggle k="showDocumentNumber" label="N° de Document" icon={Hash} />
                                                    <Toggle k="showDateDocument" label="Date" icon={FileText} />
                                                    <Toggle k="showTypeOperation" label="Type d'Opération" icon={Type} />
                                                </div>
                                            </div>

                                            {/* Table columns */}
                                            <div className="bg-emerald-50/30 rounded-xl p-3.5 border border-emerald-100/40">
                                                <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5"><Table className="w-3.5 h-3.5" /> Tableau</h4>
                                                <div className="space-y-1.5">
                                                    <Toggle k="showReferenceColumn" label="Colonne Référence" icon={Hash} />
                                                    <Toggle k="showPrixColumn" label="Prix Unitaire" icon={FileText} />
                                                    <Toggle k="showTotalColumn" label="Total HT" icon={FileText} />
                                                    <Toggle k="showFillerRows" label="Lignes vides" icon={AlignLeft} />
                                                </div>
                                            </div>

                                            {/* General sections */}
                                            <div className="bg-amber-50/30 rounded-xl p-3.5 border border-amber-100/40">
                                                <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5"><LayoutGrid className="w-3.5 h-3.5" /> Sections</h4>
                                                <div className="space-y-1.5">
                                                    <Toggle k="showPartiesSection" label="Émetteur / Destinataire" icon={Building2} />
                                                    <Toggle k="showNotesSection" label="Notes / Observations" icon={AlignLeft} />
                                                    <Toggle k="showSignatureZone" label="Signatures" icon={FileSignature} />
                                                    <Toggle k="showPiedDePage" label="Pied de Page" icon={AlignLeft} />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ══ RIGHT SIDE: Live Preview (always visible) ══ */}
                        <div className="w-[340px] shrink-0 bg-gradient-to-b from-slate-100/80 to-slate-50 border-l border-slate-200/60 p-4 flex flex-col">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Prototype</span>
                                <span className="text-[9px] font-bold text-slate-300 bg-white px-2 py-0.5 rounded-full border border-slate-100">En direct ✨</span>
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
                    <div className="px-7 py-3.5 bg-gradient-to-t from-slate-50/90 to-white/80 border-t border-slate-100/80 flex items-center justify-between shrink-0">
                        <div className="text-xs text-slate-400 font-medium">
                            {!s.raisonSociale ? (
                                <span className="flex items-center gap-1.5 text-amber-500"><AlertTriangle className="w-3.5 h-3.5" /> Raison sociale requise</span>
                            ) : (
                                <span className="flex items-center gap-1.5 text-emerald-500"><CheckCircle className="w-3.5 h-3.5" /> Modèle prêt</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={handleClose} className="px-5 py-2 font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl text-sm transition-all duration-200">
                                Annuler
                            </button>
                            <button
                                onClick={handleSave}
                                className={`px-6 py-2 font-black text-white bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-600 hover:via-orange-600 hover:to-amber-700 rounded-xl text-sm flex gap-2 items-center shadow-lg shadow-amber-200/40 transition-all duration-200 hover:scale-[1.02] active:scale-95 ${saveFlash ? 'inv-save-flash' : ''}`}
                            >
                                <Save className="w-4 h-4" /> Sauvegarder
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
function InvoicePrinter({ mvt, product, template, onClose, t, lang }: { mvt: MouvementStock; product?: MagasinProduct; template: InvoiceTemplate; onClose: () => void; t: (s: string) => string; lang: 'fr'|'ar'|'en' }) {
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
        <div className="fixed inset-0 bg-slate-100 z-[200] overflow-y-auto">
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
            <div className="bl-no-print sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
                <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold text-sm transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Retour
                        </button>
                        <div className="h-6 w-px bg-slate-200" />
                        <div>
                            <h2 className="font-black text-slate-800 text-sm">{docTitle} — {docNum}</h2>
                            <p className="text-xs text-slate-400 font-bold">{product?.designation} · {new Date(mvt.date).toLocaleDateString('fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-sm shadow-lg shadow-indigo-200 transition-all active:scale-95"
                    >
                        <Printer className="w-4 h-4" /> Imprimer
                    </button>
                </div>
            </div>

            {/* A4 Sheet */}
            <div className="bl-print-root py-8">
                <div className="bl-sheet bg-white max-w-4xl mx-auto shadow-2xl rounded-2xl overflow-hidden" style={{ minHeight: '297mm' }}>
                    <div className="p-12">

                        {/* === HEADER === */}
                        <div className="flex justify-between items-start pb-8 mb-8 border-b-4 border-indigo-600">
                            {/* Company Info */}
                            <div className="max-w-xs">
                                {template.showLogo && template.logo && (
                                    <img src={template.logo} className="h-16 mb-4 object-contain" alt="logo" />
                                )}
                                <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{template.raisonSociale}</h1>
                                <div className="mt-3 space-y-1">
                                    {template.showAdresse   && <p className="text-xs text-slate-500 font-medium">{template.adresse}</p>}
                                    {template.showTelephone && template.telephone && <p className="text-xs text-slate-500">📞 {template.telephone}</p>}
                                    {template.showEmail     && template.email     && <p className="text-xs text-slate-500">✉ {template.email}</p>}
                                </div>
                                {(template.showICE || template.showRC || template.showIF) && (
                                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                                        {template.showICE && template.ice       && <p className="text-[10px] text-slate-400 font-mono">ICE: {template.ice}</p>}
                                        {template.showRC  && template.rc        && <p className="text-[10px] text-slate-400 font-mono">RC: {template.rc}</p>}
                                        {template.showIF  && template.if_number && <p className="text-[10px] text-slate-400 font-mono">IF: {template.if_number}</p>}
                                    </div>
                                )}
                            </div>

                            {/* Document Title Block */}
                            <div className={lang === 'ar' ? "text-left" : "text-right"}>
                                <div className="inline-block bg-indigo-600 text-white px-6 py-3 rounded-2xl mb-4">
                                    <h2 className="text-xl font-black tracking-wider">{docTitle}</h2>
                                </div>
                                <div className="space-y-2">
                                    {template.showDocumentNumber && (
                                        <div className={`flex ${flexE} gap-3 items-center`}>
                                            <span className="text-xs text-slate-400 font-bold uppercase">{t('N° DOCUMENT')}</span>
                                            <span className="font-black text-slate-800 font-mono text-sm bg-slate-100 px-3 py-1 rounded-lg" dir="ltr">{docNum}</span>
                                        </div>
                                    )}
                                    {template.showDateDocument && (
                                        <div className={`flex ${flexE} gap-3 items-center`}>
                                            <span className="text-xs text-slate-400 font-bold uppercase">{t('DATE')}</span>
                                            <span className="font-bold text-slate-700 text-sm" dir="ltr">{new Date(mvt.date).toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-MA', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
                                        </div>
                                    )}
                                    {template.showTypeOperation && (
                                        <div className={`flex ${flexE} gap-3 items-center`}>
                                            <span className="text-xs text-slate-400 font-bold uppercase">{t('TYPE')}</span>
                                            <span className={`text-xs font-black px-2 py-0.5 rounded-full ${isSortie ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{t(mvt.type)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* === PARTIES === */}
                        {template.showPartiesSection && (
                            <div className="grid grid-cols-2 gap-6 mb-8 mt-4">
                                <div className="border border-slate-200 rounded-xl p-5 bg-slate-50 relative">
                                    <span className={`absolute -top-2.5 ${lang==='ar'? 'right-4' : 'left-4'} bg-slate-50 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest`}>{t('ÉMETTEUR (Magasin)')}</span>
                                    <p className="font-black text-slate-800">{template.raisonSociale}</p>
                                    {template.showAdresse && <p className="text-xs text-slate-500 mt-1">{template.adresse}</p>}
                                </div>
                                <div className="border border-slate-200 rounded-xl p-5 bg-slate-50 relative">
                                    <span className={`absolute -top-2.5 ${lang==='ar'? 'right-4' : 'left-4'} bg-slate-50 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest`}>{isSortie ? t('DESTINATAIRE') : t('FOURNISSEUR')}</span>
                                    <p className="font-black text-slate-800">
                                        {isSortie ? (mvt.chaineId || t('Atelier / Production')) : (mvt.fournisseurId || '—')}
                                    </p>
                                    {mvt.modeleRef    && <p className="text-xs text-indigo-600 font-bold mt-1">{t('Réf. OF :')} {mvt.modeleRef}</p>}
                                    {mvt.operateurNom && <p className="text-xs text-slate-500 mt-1">{t('Responsable :')} {mvt.operateurNom}</p>}
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
                                        <tr className="bg-indigo-600 text-white">
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
                                        <tr className="border-b-2 border-slate-200 bg-white">
                                            {template.showReferenceColumn && <td className={`p-4 font-mono text-sm font-bold text-slate-600 ${alignL}`}>{product?.reference || '—'}</td>}
                                            <td className={`p-4 ${alignL}`}>
                                                <div className="font-black text-slate-800">{product?.designation || t('Article')}</div>
                                                {(mvt.bain || mvt.notes) && (
                                                    <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                                                        {mvt.bain  && <span className={`inline-block bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded ${lang==='ar'?'ml-2':'mr-2'} font-bold`}>{t('Bain:')} {mvt.bain}</span>}
                                                        {mvt.notes && <span className="italic">{mvt.notes}</span>}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 text-center text-slate-600 font-bold">{product?.unite || '—'}</td>
                                            <td className={`p-4 ${alignR} font-black text-slate-800 text-lg`}>{mvt.quantite}</td>
                                            {template.showPrixColumn && (
                                                <td className={`p-4 ${alignR} text-slate-600 font-bold`} dir="ltr">
                                                    {prixU > 0 ? `${prixU.toFixed(2)} DH` : <span className="text-slate-300 text-xs">N/A</span>}
                                                </td>
                                            )}
                                            {template.showTotalColumn && (
                                                <td className={`p-4 ${alignR} font-black text-indigo-700 text-lg`} dir="ltr">
                                                    {totalHT > 0 ? `${totalHT.toFixed(2)} DH` : <span className="text-slate-300 text-xs">N/A</span>}
                                                </td>
                                            )}
                                        </tr>
                                        {template.showFillerRows && [1, 2].map(i => (
                                            <tr key={i} className="border-b border-slate-100">
                                                {template.showReferenceColumn && <td className="p-4 text-slate-200 text-xs">—</td>}
                                                <td className="p-4" /><td className="p-4" /><td className="p-4" />
                                                {template.showPrixColumn  && <td className="p-4" />}
                                                {template.showTotalColumn && <td className="p-4" />}
                                            </tr>
                                        ))}
                                    </tbody>
                                    {template.showTotalColumn && (
                                        <tfoot>
                                            <tr className="bg-slate-50">
                                                <td colSpan={totalCols - 2} className="p-4" />
                                                <td className="p-4 text-right text-xs font-black text-slate-500 uppercase">Total HT</td>
                                                <td className="p-4 text-right font-black text-slate-800 text-xl border-t-2 border-indigo-600">
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
                            <div className="mb-8 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                <p className="text-xs font-black text-amber-600 uppercase tracking-wide mb-1">Notes / Observations</p>
                                <p className="text-sm text-amber-800 italic">{mvt.notes}</p>
                            </div>
                        )}

                        {/* === SIGNATURES === */}
                        {template.showSignatureZone && (
                            <div className="grid grid-cols-2 gap-10 mt-12">
                                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 h-36 relative bg-slate-50/50">
                                    <span className="absolute -top-3 left-6 bg-white px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Signature &amp; Cachet Magasin</span>
                                    <div className="text-center text-slate-300 text-xs mt-6 font-bold">Nom &amp; Signature :</div>
                                </div>
                                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 h-36 relative bg-slate-50/50">
                                    <span className="absolute -top-3 left-6 bg-white px-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Signature {isSortie ? 'Réceptionnaire' : 'Livreur'}</span>
                                    <div className="text-center text-slate-300 text-xs mt-6 font-bold">Nom &amp; Signature :</div>
                                </div>
                            </div>
                        )}

                        {/* === FOOTER === */}
                        {template.showPiedDePage && (
                            <div className="mt-10 pt-6 border-t border-slate-200 text-center">
                                <p className="text-xs text-slate-400 font-medium leading-relaxed">{template.piedDePage}</p>
                                <p className="text-[9px] text-slate-300 mt-2 font-mono">Généré le {new Date().toLocaleString('fr-MA')} · BERAMETHODE Magasin</p>
                            </div>
                        )}

                    </div>
                </div>
            </div>
        </div>
    );
}

const DICT: Record<string, { ar: string, en: string }> = {
    'Tableau de Bord': { ar: 'لوحة القيادة', en: 'Dashboard' },
    'Base Produits': { ar: 'قاعدة المنتجات', en: 'Product Base' },
    'Bureau Magasin': { ar: 'مكتب المستودع', en: 'Warehouse Desk' },
    'Inventaire Tournant': { ar: 'الجرد الدوري', en: 'Cyclic Inventory' },
    'Plan WMS': { ar: 'خريطة المستودع', en: 'WMS Map' },
    'Radar Fournisseurs': { ar: 'رادار الموردين', en: 'Supplier Radar' },
    'Bons de Commande': { ar: 'أوامر الشراء', en: 'Purchase Orders' },
    'Demandes Atelier': { ar: 'طلبات الورشة', en: 'Workshop Requests' },
    'Alertes & Ruptures': { ar: 'تنبيهات ونواقص', en: 'Alerts & Shortages' },
    'S. Valorisation (Déchets)': { ar: 'تثمين النفايات', en: 'Waste Valuation' },
    'Traçabilité': { ar: 'التسلسل والتتبع', en: 'Traceability' },
    'Stock • Traçabilité • Emplacements': { ar: 'مخزون • تتبع • مواقع', en: 'Stock • Traceability • Locations' },
    'Valeur': { ar: 'القيمة', en: 'Value' },
    'Urgences': { ar: 'عاجل', en: 'Emergencies' },
    'Total Références': { ar: 'إجمالي المراجع', en: 'Total References' },
    'Valeur Globale (CUMP)': { ar: 'القيمة الإجمالية', en: 'Global Value (WAC)' },
    'Alerte Rupture': { ar: 'تنبيه النقص', en: 'Shortage Alert' },
    'Mouvements (7j)': { ar: 'حركات (7 أيام)', en: 'Movements (7d)' },
    'Stock Dormant': { ar: 'مخزون راكد', en: 'Dormant Stock' },
    'Articles > 90 Jours': { ar: 'عناصر > 90 يوم', en: 'Items > 90 Days' },
    'Unités immobiles': { ar: 'وحدات غير متحركة', en: 'Immobile Units' },
    'Valeur Gelée': { ar: 'القيمة المجمدة', en: 'Frozen Value' },
    'Anticipation Production': { ar: 'توقع الإنتاج', en: 'Production Anticipation' },
    'Préparation des Modèles Imminents': { ar: 'تحضير النماذج الوشيكة', en: 'Preparation of Imminent Models' },
    'Besoins / Fournitures': { ar: 'الإحتياجات / اللوازم', en: 'Needs / Supplies' },
    'Tissu requis': { ar: 'القماش المطلوب', en: 'Required Fabric' },
    'Accessoires': { ar: 'الإكسسوارات', en: 'Accessories' },
    'Approvisionnements en Transit': { ar: 'تزويدات قيد النقل', en: 'Supplies in Transit' },
    'Derniers Mouvements': { ar: 'أحدث الحركات', en: 'Latest Movements' },
    'Voir tout': { ar: 'عرض الكل', en: 'See all' },
    'Cliquez sur une ligne pour voir le produit, le stock et son historique complet.': { ar: 'انقر على سطر لعرض المنتج والمخزون وسجل الحركة الكامل.', en: 'Click a row to view the product, stock and full history.' },
    'Photo': { ar: 'الصورة', en: 'Photo' },
    'Stock': { ar: 'المخزون', en: 'Stock' },
    'Stock actuel': { ar: 'المخزون الحالي', en: 'Current stock' },
    'Détails de l\'activité': { ar: 'تفاصيل الحركة', en: 'Activity details' },
    'Modifier la ligne et enregistrer pour ajuster le registre de mouvement.': { ar: 'عدّل السطر واحفظ لتحديث سجل الحركة.', en: 'Edit the row and save to update the movement register.' },
    'Type de mouvement': { ar: 'نوع الحركة', en: 'Movement type' },
    'Produit lié': { ar: 'المنتج المرتبط', en: 'Linked product' },
    'Date / Heure': { ar: 'التاريخ / الوقت', en: 'Date / Time' },
    'Fournisseur': { ar: 'المورد', en: 'Supplier' },
    'Chaîne': { ar: 'السلسلة', en: 'Chain' },
    'Référence OF': { ar: 'مرجع أمر الإنتاج', en: 'OF reference' },
    'Notes': { ar: 'ملاحظات', en: 'Notes' },
    'Document / Pièce jointe': { ar: 'وثيقة / مرفق', en: 'Document / Attachment' },
    'Supprimer': { ar: 'حذف', en: 'Delete' },
    'Annuler': { ar: 'إلغاء', en: 'Cancel' },
    'Enregistrer': { ar: 'حفظ', en: 'Save' },
    'Voir produit': { ar: 'عرض المنتج', en: 'View product' },
    'Produit': { ar: 'المنتج', en: 'Product' },
    'Quantité': { ar: 'الكمية', en: 'Quantity' },
    'Aucune commande en cours d\'acheminement.': { ar: 'لا توجد طلبات قيد النقل.', en: 'No orders in transit.' },
    'Chez': { ar: 'عند', en: 'At' },
    'Type': { ar: 'النوع', en: 'Type' },

    'articles': { ar: 'مواد', en: 'items' },
    'Livraison prévue :': { ar: 'التسليم المتوقع :', en: 'Expected delivery :' },
    'Aucun mouvement enregistré.': { ar: 'لم يتم تسجيل أي حركة.', en: 'No movement recorded.' },
    'Inconnu': { ar: 'غير معروف', en: 'Unknown' },
    'Demandes d\'Approvisionnement (Atelier)': { ar: 'طلبات التوريد (الورشة)', en: 'Supply Requests (Workshop)' },
    'Créer Demande Test': { ar: 'إنشاء طلب تجريبي', en: 'Create Test Request' },
    'Aucune demande en attente.': { ar: 'لا توجد طلبات في الانتظار.', en: 'No pending requests.' },
    'Demande du': { ar: 'طلب بتاريخ', en: 'Request from' },
    'Produit Inconnu': { ar: 'منتج غير معروف', en: 'Unknown Product' },
    'Pour Ordre de Fab:': { ar: 'لأمر التصنيع:', en: 'For Mfg Order:' },
    'Demandé': { ar: 'مطلوب', en: 'Requested' },
    'En Stock': { ar: 'في المخزون', en: 'In Stock' },
    'Stock insuffisant ! Veuillez approvisionner.': { ar: 'المخزون غير كافٍ! يرجى التوريد.', en: 'Insufficient stock! Please supply.' },
    'Préparer': { ar: 'تحضير', en: 'Prepare' },
    'Refuser': { ar: 'رفض', en: 'Reject' },
    'Rechercher (Nom, Réf, Emplacement)...': { ar: 'بحث (اسم، مرجع، موقع)...', en: 'Search (Name, Ref, Location)...' },
    'Catégories': { ar: 'الفئات', en: 'Categories' },
    'CSV': { ar: 'CSV', en: 'CSV' },
    'Ajouter': { ar: 'إضافة', en: 'Add' },
    'Bains Disponibles': { ar: 'دفعات الصباغة المتاحة', en: 'Available Dye Lots' },
    'Stock Réel': { ar: 'المخزون الفعلي', en: 'Actual Stock' },
    // Type terms
    'tissu': { ar: 'قماش', en: 'fabric' },
    'fil': { ar: 'خيط', en: 'yarn' },
    'bouton': { ar: 'زر', en: 'button' },
    'fermeture': { ar: 'سحاب', en: 'zipper' },
    'etiquette': { ar: 'ملصق', en: 'label' },
    'emballage': { ar: 'تغليف', en: 'packaging' },
    'autre': { ar: 'أخرى', en: 'other' },
    'entree': { ar: 'إدخال', en: 'entry' },
    'sortie': { ar: 'إخراج', en: 'exit' },
    'regularisation': { ar: 'تسوية', en: 'adjustment' },
    'retour_atelier': { ar: 'إرجاع للورشة', en: 'return workshop' },
    'rebut': { ar: 'إتلاف', en: 'scrap' },
    'reservation': { ar: 'حجز', en: 'reservation' },
    // Status terms
    'brouillon': { ar: 'مسودة', en: 'draft' },
    'envoye': { ar: 'مُرسلة', en: 'sent' },
    'valide': { ar: 'مُعتمدة', en: 'validated' },
    'livre': { ar: 'مُسلمة', en: 'delivered' },
    'attente': { ar: 'انتظار', en: 'wait' },
    'preparee': { ar: 'مُجهزة', en: 'prepared' },
    'rejetee': { ar: 'مرفوضة', en: 'rejected' },
    'Entrée': { ar: 'دخول', en: 'Entry' },
    'Sortie': { ar: 'خروج', en: 'Exit' },
    'Inventaire': { ar: 'جرد', en: 'Inventory' },
    'Retour': { ar: 'إرجاع', en: 'Return' },
    'Déchets': { ar: 'نفايات', en: 'Waste' },
    'Réserver': { ar: 'حجز', en: 'Reserve' },
    'Rechercher produit': { ar: 'البحث عن منتج', en: 'Search product' },
    'Sélect...': { ar: 'اختر...', en: 'Select...' },
    'En stock:': { ar: 'في المخزون:', en: 'In stock:' },
    'Flashez le code-barres...': { ar: 'امسح الرمز الشريطي...', en: 'Scan the barcode...' },
    'À prendre au :': { ar: 'يؤخذ من:', en: 'Take from:' },
    'Quantité Réelle Constatée': { ar: 'الكمية الفعلية', en: 'Actual Quantity' },
    'N° Bain/Lot (Teinture)': { ar: 'رقم الحمام/الصباغة', en: 'Dye Lot/Batch No.' },
    'Prix Unitaire (CUMP)': { ar: 'سعر الوحدة', en: 'Unit Price' },

    'Ordre de Fab. (OF)': { ar: 'أمر التصنيع', en: 'Mfg. Order' },
    'FIFO (Premier entré)': { ar: 'الأول دخولاً', en: 'FIFO (First In)' },
    'LIFO (Dernier entré)': { ar: 'الأخير دخولاً', en: 'LIFO (Last In)' },
    'Valider l\'Opération': { ar: 'تأكيد العملية', en: 'Validate Operation' },
    'Détail des Lots': { ar: 'تفاصيل الدفعات', en: 'Lot Details' },
    'Bain:': { ar: 'حمام:', en: 'Lot:' },
    'Aucun lot disponible.': { ar: 'لا توجد دفعات متاحة.', en: 'No lots available.' },
    'Registre des Mouvements': { ar: 'سجل الحركات', en: 'Movement Register' },
    'Sélectionnez un type d\'opération': { ar: 'حدد نوع العملية', en: 'Select an operation' },
    'Gérez vos réapprovisionnements fournisseurs': { ar: 'إدارة عمليات إعادة التوريد من الموردين', en: 'Manage your supplier replenishments' },
    'Nouveau BC': { ar: 'أمر شراء جديد', en: 'New PO' },
    'Aucun Bon de Commande': { ar: 'لا يوجد أوامر شراء', en: 'No Purchase Orders' },
    'Créez votre premier BC pour réapprovisionner votre stock.': { ar: 'قم بإنشاء أمر الشراء الأول لإعادة تزويد مخزونك.', en: 'Create your first PO to replenish your stock.' },
    'Date de création': { ar: 'تاريخ الإنشاء', en: 'Creation Date' },
    'Total estimé': { ar: 'الإجمالي المقدر', en: 'Estimated Total' },
    'article': { ar: 'مادة', en: 'item' },
    'dans ce bon': { ar: 'في هذا الأمر', en: 'in this PO' },
    'Éditer': { ar: 'تعديل', en: 'Edit' },
    'Supprimer ce Bon ?': { ar: 'حذف هذا الأمر؟', en: 'Delete this PO?' },
    'Vérifiez régulièrement l\'exactitude de votre stock sans bloquer l\'entrepôt en comptant une petite sélection d\'articles.': { ar: 'تحقق بانتظام من دقة مخزونك دون إيقاف المستودع عن طريق عد مجموعة صغيرة من المواد.', en: 'Regularly check your stock accuracy without blocking the warehouse by counting a small selection of items.' },
    'Aucun produit dans la base.': { ar: 'لا يوجد منتج في القاعدة.', en: 'No product in the base.' },
    'Générer une Session (5 articles)': { ar: 'إنشاء جلسة (5 مواد)', en: 'Generate a Session (5 items)' },
    'Session d\'inventaire #': { ar: 'جلسة الجرد #', en: 'Inventory Session #' },
    'Annuler cette session ?': { ar: 'إلغاء هذه الجلسة؟', en: 'Cancel this session?' },

    'Article Inconnu': { ar: 'مادة غير معروفة', en: 'Unknown Item' },
    'Emplacement:': { ar: 'الموقع:', en: 'Location:' },
    'Non défini': { ar: 'غير محدد', en: 'Undefined' },
    'Théorique': { ar: 'نظري', en: 'Theoretical' },
    'Comptage Réel': { ar: 'العد الفعلي', en: 'Actual Count' },
    'articles mis à jour avec succès !': { ar: 'مواد تم تحديثها بنجاح!', en: 'items updated successfully!' },
    'Aucun écart constaté. Inventaire validé.': { ar: 'لم يلاحظ أي فرق. تم اعتماد الجرد.', en: 'No discrepancy noted. Inventory validated.' },
    'Valider l\'inventaire complet': { ar: 'تأكيد الجرد الكامل', en: 'Validate complete inventory' },
    'Nouveau Fournisseur': { ar: 'مورد جديد', en: 'New Supplier' },
    'Stocks Critiques (Base)': { ar: 'مخزون حرج (القاعدة)', en: 'Critical Stocks (Base)' },
    'Aucune rupture critique.': { ar: 'لا يوجد نقص حرج.', en: 'No critical shortage.' },
    'Tous les produits sont au/dessus de leur seuil d\'alerte.': { ar: 'جميع المنتجات فوق مستوى الإنذار الخاص بها.', en: 'All products are above their alert threshold.' },
    'URGENCE ACHAT': { ar: 'شراء طارئ', en: 'URGENT PURCHASE' },
    'Stock Actuel': { ar: 'المخزون الحالي', en: 'Current Stock' },
    'Seuil:': { ar: 'عتبة:', en: 'Threshold:' },
    'Approvisionner': { ar: 'توريد', en: 'Supply' },
    'Besoins de Production (OF en cours)': { ar: 'احتياجات الإنتاج', en: 'Production Needs' },
    'Stock suffisant pour la production.': { ar: 'مخزون كافٍ للإنتاج.', en: 'Sufficient stock for production.' },
    'Aucune rupture détectée pour les modèles en lancement.': { ar: 'لم يتم رصد أي نقص للنماذج قيد الإطلاق.', en: 'No shortage detected for models being launched.' },
    'Objectif:': { ar: 'الهدف:', en: 'Target:' },
    'pcs': { ar: 'قطعة', en: 'pcs' },
    'Manquant': { ar: 'مفقود', en: 'Missing' },
    'Besoin': { ar: 'بحاجة', en: 'Need' },
    'En Magasin': { ar: 'في المستودع', en: 'In Warehouse' },
    'Suggestion Plan B :': { ar: 'اقتراح الخطة ب:', en: 'Plan B Suggestion:' },
    'Remplacer par': { ar: 'استبدال بـ', en: 'Replace with' },
    'Action requise :': { ar: 'الإجراء المطلوب:', en: 'Action required:' },
    'Aucune alternative (Plan B) trouvée en stock. Achat nécessaire.': { ar: 'لم يتم العثور على بديل (الخطة ب) في المخزون. الشراء ضروري.', en: 'No alternative (Plan B) found in stock. Purchase necessary.' },
    'Valorisation : Déchets & Revente': { ar: 'تثمين: نفايات وإعادة بيع', en: 'Valuation: Waste & Resale' },
    'Fonctionnalité en cours de développement (Phase 6).': { ar: 'ميزة قيد التطوير (المرحلة 6).', en: 'Feature in development (Phase 6).' },
    'Déclarer Nouveau Surplus': { ar: 'التصريح بفائض جديد', en: 'Declare New Surplus' },
    'Chutes de Coupe (Tissu)': { ar: 'بقايا القص (قماش)', en: 'Cutting Scraps (Fabric)' },
    'Volume total de déchets accumulés ce mois.': { ar: 'إجمالي حجم النفايات المتراكمة هذا الشهر.', en: 'Total volume of waste accumulated this month.' },
    'Opération de recyclage confirmée. Le lot a été déduit du compte de valorisation.': { ar: 'تم تأكيد عملية إعادة التدوير. تم خصم الدفعة من حساب التثمين.', en: 'Recycling operation confirmed. Lot deducted from valuation account.' },
    'Revendre / Recycler le lot (345 kg)': { ar: 'إعادة بيع / إعادة تدوير الدفعة (345 كجم)', en: 'Resell / Recycle lot (345 kg)' },
    'Surplus Fournitures (À revendre)': { ar: 'فائض اللوازم (للبيع)', en: 'Supplies Surplus (To resell)' },
    'Valeur estimée du surplus dormant revendable.': { ar: 'القيمة المقدرة للفائض الراكد القابل للبيع.', en: 'Estimated value of dormant resaleable surplus.' },
    'Suppression de': { ar: 'حذف', en: 'Deletion of' },
    'des surplus.': { ar: 'من الفوائض.', en: 'from surpluses.' },
    'Traçabilité Ascendante / Descendante': { ar: 'التتبع الصاعد / النازل', en: 'Upward / Downward Traceability' },
    'Rechercher par Numéro OF, Numéro de Bain, ou Référence Article...': { ar: 'البحث برقم أمر التصنيع، رقم الحمام، أو مرجع المادة...', en: 'Search by MO Number, Dye Lot, or Item Ref...' },
    'Tapez par exemple': { ar: 'اكتب على سبيل المثال', en: 'For example, type' },
    'ou': { ar: 'أو', en: 'or' },
    'pour voir tous les mouvements liés.': { ar: 'لرؤية جميع الحركات المرتبطة.', en: 'to see all related movements.' },
    'Résultats pour "': { ar: 'نتائج لـ "', en: 'Results for "' },
    'Qté:': { ar: 'الكمية:', en: 'Qty:' },
    'OF:': { ar: 'أمر تصنيع:', en: 'MO:' },
    'Chaîne:': { ar: 'سلسلة:', en: 'Chain:' },
    'Frs:': { ar: 'مورد:', en: 'Supp:' },
    'Aucun mouvement trouvé pour cette recherche.': { ar: 'لم يتم العثور على أي حركة لهذا البحث.', en: 'No movement found for this search.' },
    'Audit de Traçabilité': { ar: 'تدقيق التتبع', en: 'Traceability Audit' },
    'Cartographie WMS 2D': { ar: 'رسم خرائط إدارة المستودعات (WMS) ثنائي الأبعاد', en: '2D WMS Mapping' },
    'Vue de l\'entrepôt par rayon. Densité basée sur le volume de stock actic.': { ar: 'عرض المستودع حسب الجناح. تعتمد الكثافة على حجم المخزون النشط.', en: 'Warehouse view by aisle. Density based on active stock volume.' },
    'Vide': { ar: 'فارغ', en: 'Empty' },
    'Moyen': { ar: 'متوسط', en: 'Medium' },
    'Dense': { ar: 'كثيف', en: 'Dense' },
    'Dock Réception': { ar: 'رصيف الاستلام', en: 'Receiving Dock' },
    'Expédition / Atelier': { ar: 'إرسال / ورشة', en: 'Shipping / Workshop' },
    'Rayon': { ar: 'جناح', en: 'Aisle' },
    'Réf. Uniques': { ar: 'مراجع فريدة', en: 'Unique Refs' },
    'Stock Total': { ar: 'مخزون إجمالي', en: 'Total Stock' },
    'Détails Emplacements': { ar: 'تفاصيل المواقع', en: 'Location Details' },
    'Filtrer... (ex: ^A pour Rayon A)': { ar: 'تصفية... (مثال: ^A للجناح A)', en: 'Filter... (e.g., ^A for Aisle A)' },
    'Non Défini': { ar: 'غير محدد', en: 'Undefined' },
    'Dispo:': { ar: 'متاح:', en: 'Avail:' },
    'Radar Fournisseurs (Sourcing)': { ar: 'رادار الموردين (المصادر)', en: 'Suppliers Radar (Sourcing)' },
    'Évaluez la performance de vos fournisseurs, surveillez l\'évolution des prix d\'achat (CUMP) et optimisez votre sourcing stratégique.': { ar: 'قم بتقييم أداء الموردين، ومراقبة تطور أسعار الشراء، وتحسين مصادرك الاستراتيجية.', en: 'Evaluate supplier performance, monitor purchase price evolution, and optimize strategic sourcing.' },
    'références matérielles': { ar: 'مراجع المواد', en: 'material references' },
    'Valeur Stock': { ar: 'قيمة المخزون', en: 'Stock Value' },
    'Évolution Prix': { ar: 'تطور السعر', en: 'Price Evolution' },
    'Livraisons Récentes': { ar: 'عمليات تسليم حديثة', en: 'Recent Deliveries' },
    'transactions': { ar: 'معاملات', en: 'transactions' },
    'Aucun Fournisseur': { ar: 'لا يوجد مورد', en: 'No Supplier' },
    'Associez des fournisseurs à vos produits dans la base pour voir leurs statistiques ici.': { ar: 'قم بربط الموردين بمنتجاتك في القاعدة لرؤية إحصائياتهم هنا.', en: 'Associate suppliers to your products in the base to view their statistics here.' },
    // Invoice / BL feature — translations
    'Enregistrez vos entrées et sorties de stock': { ar: 'سجّل دخول وخروج المخزون', en: 'Record your stock entries and exits' },
    'Paramètres Facture / BL': { ar: 'إعدادات الفاتورة / وثيقة التسليم', en: 'Invoice / Delivery Note Settings' },
    'Configurer le modèle Facture / Bon de Livraison': { ar: 'إعداد قالب الفاتورة / وثيقة التسليم', en: 'Configure Invoice / Delivery Note template' },
    'Configurer le modèle Facture / BL': { ar: 'إعداد قالب الفاتورة / وثيقة التسليم', en: 'Configure Invoice / BL template' },
    'Voir Document': { ar: 'عرض المستند', en: 'View Document' },
    'Imprimer / Aperçu de Facure / BL': { ar: 'طباعة / معاينة فاتورة / وثيقة تسليم', en: 'Print / Preview Invoice / DL' },
    'Réf:': { ar: 'مرجع:', en: 'Ref:' },
    'N° Bon / Facture (Optionnel)': { ar: 'رقم الوثيقة / الفاتورة (اختياري)', en: 'Doc / Invoice No. (Optional)' },
    'Scanner / Joindre Document': { ar: 'مسح / إرفاق مستند', en: 'Scan / Attach Document' },
    // Gallery tab translations
    'Factures & BL': { ar: 'الفواتير ووثائق التسليم', en: 'Invoices & Delivery Notes' },
    'Factures & Bons de Livraison': { ar: 'الفواتير ووثائق التسليم', en: 'Invoices & Delivery Notes' },
    'Tous les documents joints aux mouvements — cliquez pour imprimer / télécharger': { ar: 'جميع المستندات المرفقة بالحركات — انقر للطباعة / التنزيل', en: 'All documents attached to movements — click to print / download' },
    'Tout Imprimer': { ar: 'طباعة الكل', en: 'Print All' },
    'Documents avec pièce jointe': { ar: 'مستندات مع مرفقات', en: 'Documents with attachments' },
    'Avec référence': { ar: 'مع مرجع', en: 'With reference' },
    'Aucun document': { ar: 'لا يوجد مستند', en: 'No documents' },
    'Joignez des pièces justificatives lors des entrées/sorties pour les voir apparaître ici.': { ar: 'أرفق المستندات التبريرية عند الدخول/الخروج لعرضها هنا.', en: 'Attach supporting documents during entries/exits to see them here.' },
    'Imprimer': { ar: 'طباعة', en: 'Print' },
    'Nom du fournisseur': { ar: 'اسم المورد', en: 'Supplier name' },
    'Destination / Atelier': { ar: 'الوجهة / الورشة', en: 'Destination / Workshop' },
    "Fournisseur (Origine)": { ar: 'المورد (الأصل)', en: 'Supplier (Origin)' },
    "Vers": { ar: 'نحو', en: 'To' },
};

function ImageMagnifier({ src, onClose }: { src: string, onClose: () => void }) {
    return (
        <div 
            className="fixed inset-0 z-[101] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={onClose}
        >
            <button 
                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
                onClick={onClose}
            >
                <X className="w-6 h-6" />
            </button>
            <div 
                className="relative max-w-[90vw] max-h-[90vh] bg-white p-2 rounded-3xl shadow-2xl animate-in zoom-in-95 duration-300"
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
                    className="w-full h-full object-cover rounded cursor-zoom-in hover:ring-2 hover:ring-indigo-400 transition-all shadow-sm"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    onClick={(e) => { e.stopPropagation(); setMagnify(true); }}
                />
                
                {hovering && (
                    <div className="absolute left-full ml-3 top-0 z-[100] w-48 h-48 bg-white p-2 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-100 animate-in fade-in zoom-in-90 slide-in-from-left-2 duration-200 pointer-events-none">
                        <img src={src} className="w-full h-full object-cover rounded-xl shadow-inner" />
                        <div className="absolute -left-1.5 top-4 w-3 h-3 bg-white border-l border-b border-slate-100 rotate-45 transform" />
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
                className={`w-full border border-slate-200 bg-white rounded-xl px-4 py-2 text-sm outline-none cursor-pointer flex items-center justify-between ${open ? 'ring-2 ring-indigo-300 border-indigo-400 shadow-lg' : ''}`}
                onClick={() => setOpen(!open)}
            >
                {selected ? (
                    <div className="flex items-center gap-2">
                        {selected.photo ? (
                            <div className="w-6 h-6">
                                <ProductPhotoWithPreview src={selected.photo} t={t} />
                            </div>
                        ) : (
                            <div className="w-6 h-6 rounded bg-slate-200 flex items-center justify-center text-slate-400"><Package className="w-3 h-3" /></div>
                        )}
                        <span className="font-bold text-slate-700 whitespace-nowrap overflow-hidden text-ellipsis mr-2 tracking-tight">{selected.designation}</span>
                    </div>
                ) : <span className="text-slate-400 font-medium">{t("Sélect...")}</span>}
                
                <div className="flex items-center gap-2">
                    {selected && (
                        <span className="text-indigo-600 text-[10px] uppercase tracking-widest whitespace-nowrap bg-indigo-50 px-2 py-0.5 rounded-md font-black">
                            {t("Stock:")} {stockQty(lots, selected.id).toFixed(1)} {selected.unite}
                        </span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                </div>
            </div>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute top-11 left-0 w-full z-50 bg-white border border-slate-200 shadow-xl rounded-xl mt-1 max-h-64 overflow-y-auto">
                        <div 
                            className="p-3 hover:bg-slate-50 cursor-pointer flex items-center border-b" 
                            onClick={() => { onChange(""); setOpen(false); }}
                        >
                            <span className="text-slate-400 font-bold">{t("Sélect...")}</span>
                        </div>
                        {products.map((p: any) => (
                            <div 
                                key={p.id} 
                                className="p-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between border-b last:border-0"
                                onClick={() => { onChange(p.id); setOpen(false); }}
                            >
                                <div className="flex items-center gap-3">
                                    {p.photo ? (
                                        <div className="w-10 h-10">
                                            <ProductPhotoWithPreview src={p.photo} t={t} />
                                        </div>
                                    ) : (
                                        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center border text-slate-300">
                                            <Package className="w-5 h-5" />
                                        </div>
                                    )}
                                    <div>
                                        <div className="font-black text-slate-800 leading-tight">{p.designation}</div>
                                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{p.reference}</div>
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <div className="text-[10px] font-bold uppercase text-slate-400">{t("En stock:")}</div>
                                    <div className="font-black text-slate-700">{stockQty(lots, p.id).toFixed(1)} {p.unite}</div>
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
export default function Magasin({ models = [], planningEvents = [], lang = 'fr', settings }: MagasinProps) {
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
            } else alert('Erreur Serveur: Impossible de sauvegarder le produit.');
        } catch (e) {
            console.error(e);
            alert('Erreur: Vérifiez votre connexion au serveur.');
        }
    };

    const deleteProduct = async (id: string) => {
        if (confirm('Supprimer l\'article (Action irréversible sur la base de données) ?')) {
            try {
                const res = await fetch(`/api/magasin/products/${id}`, { credentials: 'include',  method: 'DELETE' });
                if (res.ok) {
                    setProducts(prev => prev.filter(p => p.id !== id));
                    setLots(prev => prev.filter(l => l.productId !== id));
                } else alert('Erreur Serveur: Suppression refusée.');
            } catch (e) {
                console.error(e);
                alert('Erreur: Vérifiez votre connexion au serveur.');
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
            alert('Mouvement mis à jour');
        } catch (error: any) {
            console.error(error);
            alert('Impossible de sauvegarder les modifications : ' + (error.message || 'Erreur'));}
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
            alert('Mouvement supprimé');
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
        if (!bPid || isNaN(qty) || qty <= 0) return alert('Sélection / Quantité invalide');
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
            if (diff === 0) return alert('Le stock scanné est identique au stock actuel');
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
        <div className="h-full flex flex-col bg-slate-50 overflow-hidden font-sans">
            {/* Header */}
            <div className={`bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap justify-between items-center z-10 sticky top-0`}>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white"><Activity className="w-5 h-5" /></div>
                    <div><h1 className="text-xl font-black text-slate-800 flex items-center gap-2">Magasin ERP {aiEnabled && <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />}</h1><p className="text-xs text-slate-500 font-bold tracking-widest uppercase">{t('Stock • Traçabilité • Emplacements')}</p></div>
                </div>
                <div className="flex items-center gap-4">

                    <button onClick={() => setAiEnabled(!aiEnabled)} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-black transition-colors ${aiEnabled ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-inner' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                        {aiEnabled ? <Sparkles className="w-4 h-4" /> : <Power className="w-4 h-4" />} IA: {aiEnabled ? 'ON' : 'OFF'}
                    </button>
                    <div className="px-4 py-1.5 border rounded-xl bg-slate-50 text-center flex flex-col items-end"><div className="text-[10px] font-black text-slate-400 uppercase">{t('Valeur')}</div><div className="font-black text-slate-700 text-sm leading-tight">{lots.reduce((s, l) => s + (l.quantiteRestante * l.prixUnitaire), 0).toLocaleString()} DH</div></div>
                    {alertes.length > 0 && <button onClick={() => setTab('alertes')} className="px-3 py-1.5 border border-red-200 bg-red-50 text-center rounded-xl cursor-pointer hover:bg-red-100 flex flex-col items-end"><div className="text-[10px] font-black text-red-500 uppercase flex items-center gap-1 justify-center"><AlertTriangle className="w-3 h-3" /> {t('Urgences')}</div><div className="font-black text-red-600 text-sm leading-tight">{alertes.length}</div></button>}
                </div>
            </div>

            {/* Tabs */}
            <div className={`bg-white px-6 border-b flex gap-6 shrink-0 z-0 border-slate-200 overflow-x-auto hide-scrollbar`}>
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
                    <button key={tObj.i} onClick={() => setTab(tObj.i as any)} className={`py-3 text-sm font-bold flex items-center gap-2 relative transition-colors whitespace-nowrap ${tab === tObj.i ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>
                        <tObj.ic className="w-4 h-4" />{t(tObj.l)} {!!tObj.b && <span className="bg-red-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">{tObj.b}</span>}
                        {tab === tObj.i && <div className="absolute bottom-0 inset-x-0 h-1 bg-indigo-600 rounded-t-full" />}
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
                            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                    <Package className="w-6 h-6 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500">{t('Total Références')}</p>
                                    <p className="text-2xl font-black text-slate-800">{products.length}</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                                    <TrendingUp className="w-6 h-6 text-emerald-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500">{t('Valeur Globale (CUMP)')}</p>
                                    <p className="text-xl sm:text-2xl font-black text-slate-800 flex items-baseline gap-1">
                                        {totalStockValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        <span className="text-xs font-black text-slate-400">DH</span>
                                    </p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-6 h-6 text-rose-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500">{t('Alerte Rupture')}</p>
                                    <p className="text-2xl font-black text-rose-600">{alertCount}</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                    <Activity className="w-6 h-6 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500">{t('Mouvements (7j)')}</p>
                                    <p className="text-2xl font-black text-slate-800">{recentArrivalsCount}</p>
                                </div>
                            </div>
                        </div>

                        {/* MIDDLE SECTION: HEALTH & ANTICIPATION */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* STOCK HEALTH */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:col-span-1 flex flex-col items-center justify-center relative overflow-hidden">
                                <div className="absolute -top-10 -right-10 w-32 h-32 bg-slate-50 rounded-full zoom-in-50"></div>
                                <Layers className="w-10 h-10 text-slate-300 mb-4" />
                                <h3 className="font-black text-slate-800 text-lg mb-1">{t('Stock Dormant')}</h3>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-6">{t('Articles > 90 Jours')}</p>

                                <div className="text-center w-full">
                                    <p className="text-5xl font-black text-slate-800 mb-2">{dormantQty.toLocaleString()}</p>
                                    <p className="text-sm font-bold text-slate-500">{t('Unités immobiles')}</p>

                                    <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center w-full">
                                        <span className="text-xs font-bold text-slate-400 uppercase">{t('Valeur Gelée')}</span>
                                        <span className="text-lg font-black text-rose-500">{dormantValue.toLocaleString()} DH</span>
                                    </div>
                                </div>
                            </div>

                            {/* PLANNING ANTICIPATION */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:col-span-2 flex flex-col">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h3 className="font-black text-slate-800 text-lg flex items-center gap-2"><Send className="w-5 h-5 text-indigo-500" /> {t('Anticipation Production')}</h3>
                                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t('Préparation des Modèles Imminents')}</p>
                                    </div>
                                    <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-3 py-1 rounded-full">{upcomingEvents.length} OF Prévus</span>
                                </div>

                                {upcomingEvents.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                        <Layers className="w-10 h-10 mb-3 opacity-20" />
                                        <p className="font-bold text-sm">Aucune production imminente planifiée.</p>
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
                                                <div key={evt.id} className="bg-slate-50 rounded-2xl p-4 border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all flex flex-col relative overflow-hidden">
                                                    {!isTissuSuffisant && <div className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-black px-2 py-0.5 rounded-bl-lg z-10 animate-pulse">STOCK CRITIQUE</div>}

                                                    <div className="flex gap-3 mb-3 relative z-0">
                                                        <div className="w-12 h-16 bg-slate-200 rounded-xl overflow-hidden shadow-sm shrink-0">
                                                            {photo ? <img src={photo} className="w-full h-full object-cover" alt="" /> : <Package className="w-6 h-6 m-3 text-slate-400" />}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[10px] font-bold text-slate-400 mb-1">{new Date(evt.dateLancement).toLocaleDateString('fr-FR')} • {evt.chaineId}</div>
                                                            <h4 className="font-black text-sm text-slate-800 leading-tight truncate" title={modelName}>{modelName}</h4>
                                                            <div className="text-xs font-bold text-indigo-600 mt-1">{evt.qteTotal.toLocaleString()} pcs</div>
                                                        </div>
                                                    </div>

                                                    <div className="mt-auto pt-3 border-t border-slate-200 space-y-2">
                                                        <p className="text-[10px] uppercase font-bold text-slate-400">{t('Besoins / Fournitures')}</p>
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="text-slate-600 font-medium">{t('Tissu requis')}</span>
                                                            <span className={`font-black ${isTissuSuffisant ? 'text-slate-800' : 'text-red-600'}`}>~{fabricNeeded.toLocaleString()} m</span>
                                                        </div>
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="text-slate-600 font-medium">{t('Accessoires')}</span>
                                                            <span className="font-black text-slate-800">~{accNeeded.toLocaleString()} u</span>
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
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-800 flex items-center gap-2"><ArrowDownCircle className="w-4 h-4 text-emerald-500" /> {t('Approvisionnements en Transit')}</h3>
                                    <button onClick={() => setTab('commandes')} className="text-[10px] uppercase font-black tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 transition-colors">{t('Gérer')}</button>
                                </div>
                                <div className="p-0 flex-1">
                                    {commandes.filter(c => c.statut === 'envoye' || c.statut === 'valide').length === 0 ? (
                                        <p className="p-8 text-center text-sm font-medium text-slate-400">{t("Aucune commande en cours d'acheminement.")}</p>
                                    ) : (
                                        <ul className="divide-y divide-slate-50">
                                            {commandes.filter(c => c.statut === 'envoye' || c.statut === 'valide').map(c => (
                                                <li key={c.id} className="p-4 hover:bg-slate-50 flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                                        <FileText className="w-5 h-5 text-emerald-600" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-baseline mb-1">
                                                            <p className="font-black text-slate-800 text-sm">{c.numero}</p>
                                                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded uppercase">{t(c.statut)}</span>
                                                        </div>
                                                        <p className="text-xs font-bold text-slate-500 truncate">{t('Chez')} {c.fournisseurNom} • {c.lignes.length} {t('articles')}</p>
                                                        {c.dateLivraisonPrevue && <p className="text-[10px] text-slate-400 mt-1">{t('Livraison prévue :')} {new Date(c.dateLivraisonPrevue).toLocaleDateString()}</p>}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>

                            {/* RECENT MOVEMENTS */}
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                                    <div>
                                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><History className="w-4 h-4 text-indigo-500" /> {t('Derniers Mouvements')}</h3>
                                        <p className="text-xs text-slate-400 mt-1">{t('Cliquez sur une ligne pour voir le produit, le stock et son historique complet.')}</p>
                                    </div>
                                    <button onClick={() => setTab('tracabilite')} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">{t('Voir tout')}</button>
                                </div>
                                <div className="p-0 overflow-x-auto">
                                    {mvts.length === 0 ? <p className="p-6 text-center text-sm font-medium text-slate-400">{t('Aucun mouvement enregistré.')}</p> : (
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead className="bg-slate-50"><tr className="text-slate-500"><th className="p-3 pl-6 font-bold w-20">{t('Photo')}</th><th className="p-3 font-bold w-40">{t('Date')}</th><th className="p-3 font-bold w-24">{t('Type')}</th><th className="p-3 font-bold">{t('Produit')}</th><th className="p-3 font-bold text-right w-24">{t('Stock')}</th><th className="p-3 font-bold text-right pr-6 w-28">{t('Quantité')}</th></tr></thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {mvts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5).map(m => {
                                                    const prod = products.find(p => p.id === m.productId);
                                                    const prodStock = prod ? stockQty(lots, prod.id) : 0;
                                                    return (
                                                        <tr key={m.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedMovement(m)}>
                                                            <td className="p-3 pl-6">
                                                                <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 flex items-center justify-center">
                                                                    {prod?.photo ? <img src={prod.photo} alt={prod.designation} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-slate-400" />}
                                                                </div>
                                                            </td>
                                                            <td className="p-3 text-slate-500 font-mono text-xs">{new Date(m.date).toLocaleString()}</td>
                                                            <td className="p-3">
                                                                <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${m.type === 'entree' || m.type === 'retour_atelier' ? 'bg-emerald-100 text-emerald-700' : m.type === 'sortie' ? 'bg-indigo-100 text-indigo-700' : m.type === 'rebut' ? 'bg-rose-100 text-rose-700' : m.type === 'regularisation' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>{t(m.type)}</span>
                                                            </td>
                                                            <td className="p-3 font-bold text-slate-700">{prod?.designation || t('Inconnu')}</td>
                                                            <td className="p-3 text-right text-slate-600 font-bold">{prod ? `${prodStock.toFixed(1)} ${prod.unite}` : '-'}</td>
                                                            <td className={`p-3 pr-6 text-right font-black ${m.type === 'entree' || m.type === 'retour_atelier' ? 'text-emerald-600' : m.type === 'sortie' || m.type === 'rebut' ? 'text-rose-600' : 'text-amber-500'}`}>{m.type === 'sortie' || m.type === 'rebut' ? '-' : '+'}{m.quantite}</td>
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
                            <h2 className="text-xl font-black text-slate-800 flex-1">{t('Demandes d\'Approvisionnement (Atelier)')}</h2>
                            <button onClick={() => {
                                const did = uid();
                                const newDemande = { id: did, modelId: 'OF-' + Math.floor(Math.random() * 900 + 100), chaineId: '', produitDesignation: products[0]?.designation || '', quantiteDemandee: 10, dateDemande: new Date().toISOString(), demandeur: 'Atelier Central', statut: 'attente' as any };
                                saveDemande(newDemande);
                            }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black text-sm hover:bg-indigo-700 flex items-center gap-2"><Plus className="w-4 h-4" /> {t('Créer Demande Test')}</button>
                        </div>

                        <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
                            {demandes.length === 0 ? (
                                <div className="py-24 text-center">
                                    <Package className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                                    <p className="text-xl font-black text-slate-400">{t('Aucune demande en attente.')}</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {demandes?.map(d => {
                                        const p = products.find(x => x.designation === d.produitDesignation);
                                        const st = p ? stockQty(lots, p.id) : 0;
                                        return (
                                            <div key={d.id} className="p-4 md:p-6 flex flex-col md:flex-row gap-6 md:items-center hover:bg-slate-50 transition-colors">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${d.statut === 'attente' ? 'bg-amber-50 text-amber-700 border-amber-200' : d.statut === 'preparee' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : d.statut === 'rejetee' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>{t(d.statut)}</span>
                                                        <span className="text-xs font-bold text-slate-500 font-mono">{t('Demande du')} {new Date(d.dateDemande).toLocaleDateString()}</span>
                                                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">{d.demandeur}</span>
                                                    </div>
                                                    <h3 className="font-black text-lg text-slate-800">{d.produitDesignation || t('Produit Inconnu')}</h3>
                                                    <div className="text-sm text-slate-500 font-bold mt-1">{t('Pour Ordre de Fab:')} <span className="text-indigo-600">{d.modelId}</span></div>
                                                    {d.notes && <div className="mt-2 text-xs bg-amber-50 text-amber-800 p-2 rounded-lg italic">"{d.notes}"</div>}
                                                </div>

                                                <div className="flex flex-col md:flex-row items-center gap-6">
                                                    <div className="bg-slate-100 rounded-2xl p-4 flex gap-6 text-center shadow-inner">
                                                        <div><div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('Demandé')}</div><div className="font-black text-2xl text-slate-800">{d.quantiteDemandee} <span className="text-sm font-medium">{p?.unite}</span></div></div>
                                                        <div className="w-px bg-slate-200" />
                                                        <div><div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('En Stock')}</div><div className={`font-black text-2xl ${st >= d.quantiteDemandee ? 'text-emerald-600' : 'text-rose-600'}`}>{st.toFixed(0)} <span className="text-sm font-medium">{p?.unite}</span></div></div>
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
                                                            }} className="flex-1 md:flex-none px-6 py-3 bg-indigo-600 text-white font-black text-sm rounded-xl hover:bg-indigo-700 shadow-sm shadow-indigo-200 transition-all active:scale-95">{t('Préparer')}</button>
                                                            <button onClick={() => setDemandes?.(ds => ds.map(x => x.id === d.id ? { ...x, statut: 'rejetee' } : x))} className="flex-1 md:flex-none px-4 py-3 bg-white border-2 border-slate-200 text-slate-600 font-black text-sm rounded-xl hover:border-rose-200 hover:text-rose-600 transition-all active:scale-95">{t('Refuser')}</button>
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
                        <div className="flex gap-2 flex-wrap items-center bg-white p-2 rounded-xl border border-slate-200">
                            <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input className="w-full pl-9 pr-3 py-2 text-sm outline-none" placeholder={t("Rechercher (Nom, Réf, Emplacement)...")} value={search} onChange={e => setSearch(e.target.value)} /></div>
                            <select className="px-3 py-2 text-sm bg-slate-50 border rounded-lg font-bold text-slate-600" value={catFilter} onChange={e => setCatFilter(e.target.value)}><option value="all">{t('Catégories')}</option>{CATS.map(c => <option key={c} value={c}>{t(c)}</option>)}</select>
                            <button onClick={downloadCSV} className="px-3 py-2 border rounded-lg hover:bg-slate-50 flex gap-2 items-center text-sm font-bold text-slate-600"><Download className="w-4 h-4" /> {t('CSV')}</button>
                            <button onClick={() => setProdModal({ open: true })} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-black text-sm hover:bg-indigo-700 flex gap-2 items-center"><Plus className="w-4 h-4" /> {t('Ajouter')}</button>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                            {filtered.map(p => {
                                const st = stockQty(lots, p.id);
                                const frsExtra = !!(p.fournisseurEmail || p.fournisseurAdresse || p.fournisseurIce || p.fournisseurRc || p.fournisseurConditionsPaiement || p.fournisseurDelaiLivraisonJours != null || p.fournisseurMoq != null || p.fournisseurDevise || p.fournisseurContact || p.fournisseurNotes);
                                return (
                                        <div 
                                            key={p.id} 
                                            className="bg-white rounded-2xl border shadow-sm p-4 hover:shadow-md transition-shadow relative overflow-hidden cursor-pointer group" 
                                            onClick={() => setSelectedProductForDetail(p)}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                setContextMenu({ x: e.clientX, y: e.clientY, pid: p.id });
                                            }}
                                        >
                                         <div className={`absolute top-0 inset-x-0 h-1 ${st === 0 ? 'bg-red-500' : st <= p.stockAlerte ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                         <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                             <div className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow-lg">
                                                 Voir détails
                                             </div>
                                         </div>
                                         <div className="flex gap-4">
                                             <div className="w-16 h-16 bg-slate-100 rounded-xl overflow-hidden shrink-0" onClick={(e) => { e.stopPropagation(); setProdModal({ open: true, item: p }); }}>{p.photo ? <img src={p.photo} className="w-full h-full object-cover" /> : <Package className="w-8 h-8 m-4 text-slate-300" />}</div>
                                             <div className="flex-1 min-w-0">
                                                 <div className="flex justify-between items-start"><h3 className="font-black text-slate-800 text-lg truncate pr-2">{p.designation}</h3><StockBadge stock={st} seuil={p.stockAlerte} /></div>
                                                 <div className="text-xs text-slate-500 font-mono mt-0.5">{p.reference}</div>
                                                 <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                     {p.emplacement && <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md flex items-center gap-1"><MapPin className="w-3 h-3" /> {p.emplacement}</span>}
                                                     {p.fournisseurNom && (
                                                         <span
                                                             onClick={(e) => {
                                                                 e.stopPropagation();
                                                                 setSelectedProductForDetail(p);
                                                                 setDetailInitialTab('supplier');
                                                                 setDetailStartEditing(true);
                                                             }}
                                                             className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md flex items-center gap-1 h-6 cursor-pointer hover:bg-indigo-100"
                                                             title="Modifier le fournisseur"
                                                         >
                                                             <Building2 className="w-3 h-3" />
                                                             {p.fournisseurLogo && <img src={p.fournisseurLogo} alt="" className="w-4 h-4 object-contain" />}
                                                             {p.fournisseurNom}
                                                         </span>
                                                     )}
                                                     {frsExtra && <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md" title="Infos fournisseur détaillées">+ détails</span>}
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
                                            const colors = ['bg-indigo-100 text-indigo-700 border-indigo-200', 'bg-emerald-100 text-emerald-700 border-emerald-200', 'bg-amber-100 text-amber-700 border-amber-200', 'bg-purple-100 text-purple-700 border-purple-200', 'bg-rose-100 text-rose-700 border-rose-200', 'bg-cyan-100 text-cyan-700 border-cyan-200'];

                                            return (
                                                <div className="mt-4 pt-3 border-t border-dashed border-slate-200">
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase mb-2">{t('Bains Disponibles')}</div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {Object.entries(baths).sort((a, b) => b[1] - a[1]).map(([bain, q], idx) => {
                                                            const colorClass = colors[bain.length % colors.length];
                                                            return (
                                                                <div key={bain} className={`text-xs font-black px-2 py-1 rounded border ${colorClass} flex items-center justify-between min-w-[100px] shadow-sm`}>
                                                                    <span>#{bain}</span>
                                                                    <span className="opacity-80 ml-2">{q.toFixed(1)} <span className="text-[10px]">{p.unite}</span></span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                                             <div><div className="text-[10px] text-slate-400 font-bold uppercase">{t('Stock Réel')}</div><div className="font-black text-lg">{st.toFixed(1)} <span className="text-xs font-medium">{p.unite}</span></div></div>
                                         </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {contextMenu && (
                    <div 
                        className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-sm w-48 animate-in fade-in zoom-in-95 duration-100"
                        style={{ top: contextMenu.y, left: contextMenu.x }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button onClick={() => { setTab('bureau'); setBMode('entree'); setBPid(contextMenu.pid); setContextMenu(null); }} className="w-full text-left px-4 py-3 hover:bg-emerald-50 text-emerald-700 font-bold border-b border-slate-100 flex items-center gap-2 shadow-sm"><ArrowDownCircle className="w-4 h-4" /> {t('Entrée')}</button>
                        <button onClick={() => { setTab('bureau'); setBMode('sortie'); setBPid(contextMenu.pid); setContextMenu(null); }} className="w-full text-left px-4 py-3 hover:bg-indigo-50 text-indigo-700 font-bold border-b border-slate-100 flex items-center gap-2 shadow-sm"><ArrowUpCircle className="w-4 h-4" /> {t('Sortie')}</button>
                        <button onClick={() => { setTab('bureau'); setBMode('rebut'); setBPid(contextMenu.pid); setContextMenu(null); }} className="w-full text-left px-4 py-3 hover:bg-rose-50 text-rose-700 font-bold border-b border-slate-100 flex items-center gap-2 shadow-sm"><Trash2 className="w-4 h-4" /> {t('Rebut')}</button>
                        <button onClick={() => { setTab('bureau'); setBMode('retour_atelier'); setBPid(contextMenu.pid); setContextMenu(null); }} className="w-full text-left px-4 py-3 hover:bg-blue-50 text-blue-700 font-bold flex items-center gap-2"><RefreshCw className="w-4 h-4" /> {t('Retour')}</button>
                    </div>
                )}

                {/* ══ Bureau ══ */}
                {tab === 'bureau' && (
                    <div className="space-y-6">
                        {/* Bureau Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-black text-slate-800">{t('Bureau Magasin')}</h2>
                                <p className="text-sm text-slate-500 font-bold">{t('Enregistrez vos entrées et sorties de stock')}</p>
                            </div>
                            <button
                                onClick={() => setShowInvoiceSettings(true)}
                                className="flex items-center gap-2 px-4 py-2.5 border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50 rounded-xl font-black text-sm transition-all group"
                                title={t('Configurer le modèle Facture / Bon de Livraison')}
                            >
                                <FileText className="w-4 h-4 group-hover:scale-110 transition-transform" />
                                {t('Paramètres Facture / BL')}
                            </button>
                        </div>

                        {bSuccess && <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-bold flex gap-2"><CheckCircle className="w-5 h-5" />{bSuccess}</div>}

                        <div className="grid lg:grid-cols-2 gap-6">
                            {/* Action Form */}
                            <div className="bg-white rounded-2xl border shadow-sm">
                                <div className="grid grid-cols-3 divide-x divide-y border-b text-xs sm:text-sm">
                                    <button onClick={() => setBMode('entree')} className={`col-span-1 p-3 font-black flex flex-col gap-1 items-center justify-center ${bMode === 'entree' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50'}`}><ArrowDownCircle className="w-5 h-5" /> {t('Entrée')}</button>
                                    <button onClick={() => setBMode('sortie')} className={`col-span-1 p-3 font-black flex flex-col gap-1 items-center justify-center ${bMode === 'sortie' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><ArrowUpCircle className="w-5 h-5" /> {t('Sortie')}</button>
                                    <button onClick={() => setBMode('regularisation')} className={`col-span-1 p-3 font-black flex flex-col gap-1 items-center justify-center border-t md:border-t-0 md:border-l ${bMode === 'regularisation' ? 'bg-amber-50 text-amber-700' : 'text-slate-500 hover:bg-slate-50'}`}><Scale className="w-5 h-5" /> {t('Inventaire')}</button>
                                    <button onClick={() => setBMode('retour_atelier')} className={`col-span-1 p-3 font-black flex flex-col gap-1 items-center justify-center border-t border-slate-200 ${bMode === 'retour_atelier' ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}><RefreshCw className="w-5 h-5" /> {t('Retour')}</button>
                                    <button onClick={() => setBMode('rebut')} className={`col-span-1 p-3 font-black flex flex-col gap-1 items-center justify-center border-t border-slate-200 ${bMode === 'rebut' ? 'bg-rose-50 text-rose-700' : 'text-slate-500 hover:bg-slate-50'}`}><Trash2 className="w-5 h-5" /> {t('Déchets')}</button>
                                    <button onClick={() => setBMode('reservation')} className={`col-span-1 p-3 font-black flex flex-col gap-1 items-center justify-center border-t border-slate-200 ${bMode === 'reservation' ? 'bg-purple-50 text-purple-700' : 'text-slate-500 hover:bg-slate-50'}`}><Package className="w-5 h-5" /> {t('Réserver')}</button>
                                </div>
                                <div className="p-6 space-y-5">
                                    {!bMode ? <div className="py-20 text-center text-slate-400 font-bold bg-slate-50/50 rounded-xl my-2 border-2 border-dashed border-slate-100"><ArrowUpCircle className="w-12 h-12 mx-auto mb-3 opacity-20 text-indigo-400" />{t("Sélectionnez un type d'opération")}</div> : (
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
                                                <button onClick={() => setScannerMode(!scannerMode)} className={`px-4 rounded-xl border-2 font-black transition-colors ${scannerMode ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white text-slate-600 hover:border-slate-300'}`}><Barcode className="w-5 h-5" /></button>
                                            </div>
                                            {scannerMode && <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl animate-pulse"><input autoFocus placeholder={t("Flashez le code-barres...")} className="w-full bg-transparent text-center font-black outline-none" onChange={handleScan} /></div>}

                                            {bureauProduct && (
                                                <div className="space-y-4">
                                                    {bureauProduct.emplacement && <div className="bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold flex gap-2"><MapPin className="w-4 h-4" /> {t("À prendre au :")} {bureauProduct.emplacement}</div>}

                                                    <div className="flex gap-4">
                                                        <div className="flex-1"><Lbl t={bMode === 'regularisation' ? t('Quantité Réelle Constatée') : `${t('Quantité')} (${bureauProduct.unite})`} /><input className={inp + ' text-xl font-black'} type="number" min="0" value={bQty} onChange={e => setBQty(e.target.value.replace(/-/g, ''))} autoFocus />
                                                            {bMode !== 'regularisation' && <div className="flex gap-1 mt-1">{[10, 50, 100].map(q => <button key={q} onClick={() => setBQty(q.toString())} className="px-2 py-1 text-xs border rounded hover:bg-slate-50 font-bold">+{q}</button>)}</div>}
                                                        </div>
                                                        {bMode === 'entree' && <div className="w-1/3"><Lbl t={t("N° Bain/Lot (Teinture)")} /><input className={inp} placeholder="TEIN-..." value={bNumBain} onChange={e => setBNumBain(e.target.value)} /></div>}
                                                    </div>

                                                    {(bMode === 'entree' || bMode === 'retour_atelier') && <div className="grid grid-cols-2 gap-3"><div><Lbl t={t("Prix Unitaire (CUMP)")} /><input type="number" min="0" step="0.01" className={inp} value={bPrix} onChange={e => setBPrix(e.target.value.replace(/-/g, ''))} /></div><div><Lbl t={t("Fournisseur")} /><input className={inp} value={bFournisseur} onChange={e => setBFournisseur(e.target.value)} placeholder={t("Nom du fournisseur")} /></div></div>}
                                                    {bMode === 'sortie' && <div className="grid grid-cols-2 gap-3"><div><Lbl t={t("Destination / Atelier")} /><input className={inp} value={bChaine} onChange={e => setBChaine(e.target.value)} placeholder={t("Chaîne / Atelier")} /></div><div><Lbl t={t("Fournisseur (Origine)")} /><input className={inp} value={bFournisseur} onChange={e => setBFournisseur(e.target.value)} placeholder={t("Fournisseur d'origine")} /></div></div>}

                                                    {(bMode === 'sortie' || bMode === 'reservation' || bMode === 'rebut') && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            {bMode !== 'rebut' && <div><Lbl t={t("Chaîne")} /><input className={inp} value={bChaine} onChange={e => setBChaine(e.target.value)} readOnly={!!bureauProduct.chaineExclusive} style={bureauProduct.chaineExclusive ? { background: '#f5f3ff' } : {}} /></div>}
                                                            <div><Lbl t={t("Ordre de Fab. (OF)")} /><input className={inp} value={bModele} onChange={e => setBModele(e.target.value)} /></div>
                                                            <div className="col-span-2 flex border rounded-xl overflow-hidden mt-1 text-sm font-bold">
                                                                <button onClick={() => setBMethod('FIFO')} className={`flex-1 py-1.5 ${bMethod === 'FIFO' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>{t('FIFO (Premier entré)')}</button>
                                                                <button onClick={() => setBMethod('LIFO')} className={`flex-1 py-1.5 ${bMethod === 'LIFO' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>{t('LIFO (Dernier entré)')}</button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Pièces Justificatives (Facture / BL) */}
                                                    {(bMode === 'entree' || bMode === 'sortie' || bMode === 'retour_atelier') && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100">
                                                            <div>
                                                                <Lbl t={t("N° Bon / Facture (Optionnel)")} />
                                                                <input className={inp} value={bDocumentRef} onChange={e => setBDocumentRef(e.target.value)} placeholder="Ex: BL-2024-001" />
                                                            </div>
                                                            <div>
                                                                <Lbl t={t("Scanner / Joindre Document")} />
                                                                <input type="file" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 border border-slate-200 rounded-xl bg-slate-50" accept="image/*,application/pdf" onChange={e => {
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

                                                    <button onClick={submitAction} className={`w-full py-3 rounded-xl font-black text-white text-lg ${(bMode === 'entree' || bMode === 'retour_atelier') ? 'bg-emerald-600 hover:bg-emerald-700' : bMode === 'reservation' ? 'bg-purple-600 hover:bg-purple-700' : (bMode === 'sortie' || bMode === 'rebut') ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-500 hover:bg-amber-600'}`}>{t("Valider l'Opération")}</button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Right Panel: Lots & History */}
                            <div className="space-y-6 flex flex-col h-full">
                                {bPid && (
                                    <div className="bg-white rounded-2xl border shadow-sm">
                                        <div className="px-4 py-2 bg-slate-50 border-b font-bold text-sm text-slate-600 flex justify-between"><span className="flex items-center gap-1"><Layers className="w-4 h-4" /> {t("Détail des Lots")}</span><span>{t("Traçabilité")}</span></div>
                                        <div className="max-h-[220px] overflow-y-auto divide-y text-sm">
                                            {lots.filter(l => l.productId === bPid && l.quantiteRestante > 0).map((l, i) => (
                                                <div key={l.id} className="p-3 flex justify-between items-center">
                                                    <div><div className="font-bold text-slate-700">{new Date(l.dateEntree).toLocaleDateString()}</div><div className="text-xs text-slate-400">{l.fournisseur || '—'} {l.numBain && <span className="bg-indigo-100 text-indigo-700 px-1 ml-1 rounded">{t("Bain:")} {l.numBain}</span>}</div></div>
                                                    <div className="text-right font-black text-emerald-600 text-lg">{l.quantiteRestante.toFixed(1)}</div>
                                                </div>
                                            ))}
                                            {lots.filter(l => l.productId === bPid && l.quantiteRestante > 0).length === 0 && <div className="p-4 text-center text-slate-400 font-bold">{t("Aucun lot disponible.")}</div>}
                                        </div>
                                    </div>
                                )}
                                <div className="bg-white rounded-2xl border shadow-sm flex-1 overflow-hidden flex flex-col">
                                    <div className="px-4 py-3 border-b font-bold text-slate-800 flex items-center justify-between">
                                        <span className="flex items-center gap-2"><History className="w-4 h-4 text-indigo-500" /> {t("Registre des Mouvements")}</span>
                                        <button onClick={() => setShowInvoiceSettings(true)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title={t('Configurer le modèle Facture / BL')}>
                                            <Settings className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-y-auto divide-y max-h-[300px]">
                                        {mvts.map(m => (
                                            <div key={m.id} className="p-3 flex gap-3 text-sm">
                                                <div className={`mt-0.5 w-6 h-6 rounded flex items-center justify-center shrink-0 ${m.type === 'entree' ? 'bg-emerald-100 text-emerald-600' : m.type === 'sortie' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>{m.type === 'entree' ? <TrendingDown className="w-3 h-3" /> : m.type === 'sortie' ? <TrendingUp className="w-3 h-3" /> : <Scale className="w-3 h-3" />}</div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between font-bold">
                                                        <span className="truncate pr-2">{products.find(p => p.id === m.productId)?.designation || t('Inconnu')}</span>
                                                        <div className="flex gap-2 items-center">
                                                            {m.pieceJointe && <button title={t("Voir Document")} onClick={() => { const win = window.open(); if (win) win.document.write(`<img src="${m.pieceJointe}" style="max-width:100%"/>`); }} className="hover:bg-slate-100 p-0.5 rounded text-indigo-500"><Paperclip className="w-3.5 h-3.5" /></button>}
                                                            <span className={m.type === 'entree' ? 'text-emerald-600' : m.type === 'sortie' ? 'text-rose-600' : 'text-amber-600'}>{m.type === 'sortie' ? '-' : '+'}{m.quantite}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-between mt-1 items-end">
                                                            <div className="text-xs text-slate-500">
                                                             {m.type === 'entree' ? m.fournisseurId : m.type === 'sortie' ? `${m.fournisseurId ? `${m.fournisseurId} → ` : ''}Vers ${m.chaineId} (OF: ${m.modeleRef})` : m.type === 'regularisation' ? m.notes : `Vers ${m.chaineId} (OF: ${m.modeleRef})`}
                                                            {m.documentRef && <div className="text-[10px] font-bold text-indigo-500 mt-0.5">{t("Réf:")} {m.documentRef}</div>}
                                                        </div>
                                                        <button onClick={() => setPrinterMvt(m)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-indigo-600 transition-colors" title={t("Imprimer / Aperçu de Facure / BL")}><Printer className="w-4 h-4" /></button>
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
                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border shadow-sm">
                            <div><h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-500" /> {t('Bons de Commande')}</h2><p className="text-sm text-slate-500 font-bold">{t('Gérez vos réapprovisionnements fournisseurs')}</p></div>
                            <button onClick={() => {
                                const newBc: BonCommande = { id: uid(), numero: `BC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`, fournisseurNom: t('Nouveau Fournisseur'), dateCreation: new Date().toISOString(), lignes: [], statut: 'brouillon' };
                                saveCommande(newBc);
                            }} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 transition-transform active:scale-95"><Plus className="w-5 h-5" /> {t('Nouveau BC')}</button>
                        </div>

                        {commandes.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300"><FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" /><h3 className="text-lg font-black text-slate-800">{t('Aucun Bon de Commande')}</h3><p className="text-slate-500 font-bold text-sm">{t('Créez votre premier BC pour réapprovisionner votre stock.')}</p></div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                                {commandes.map(c => (
                                    <div key={c.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col relative group">
                                        <div className={`h-1.5 w-full ${c.statut === 'brouillon' ? 'bg-slate-300' : c.statut === 'envoye' ? 'bg-amber-400' : c.statut === 'valide' ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                                        <div className="p-5 flex-1 space-y-4">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="font-black text-slate-800 text-lg">{c.numero}</div>
                                                    <div className="text-xs font-bold text-slate-400 flex items-center gap-1 mt-1"><Building2 className="w-3 h-3" /> {c.fournisseurNom}</div>
                                                </div>
                                                <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg ${c.statut === 'brouillon' ? 'bg-slate-100 text-slate-600' : c.statut === 'envoye' ? 'bg-amber-100 text-amber-700' : c.statut === 'valide' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>{c.statut}</span>
                                            </div>

                                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-2">
                                                <div className="flex justify-between text-xs font-bold"><span className="text-slate-400">{t('Date de création')}</span><span className="text-slate-700">{new Date(c.dateCreation).toLocaleDateString()}</span></div>
                                                <div className="flex justify-between text-xs font-bold"><span className="text-slate-400">{t('Total estimé')}</span><span className="text-slate-800 font-black">{(c.total || 0).toLocaleString()} DH</span></div>
                                                <div className="text-xs font-bold text-slate-500 pt-2 border-t border-slate-200">{c.lignes.length} {c.lignes.length === 1 ? t('article') : t('articles')} {t('dans ce bon')}</div>
                                            </div>
                                        </div>
                                        <div className="p-3 border-t bg-slate-50 flex gap-2">
                                            <button onClick={() => setBcModal({ open: true, item: c })} className="flex-1 py-2 bg-white border rounded-lg text-xs font-black text-slate-700 hover:bg-slate-50 flex justify-center items-center gap-2 transition-colors"><Edit2 className="w-3 h-3" /> {t('Éditer')}</button>
                                            <button onClick={() => window.print()} className="py-2 px-3 bg-white border rounded-lg text-xs font-black text-slate-400 hover:text-indigo-600 hover:bg-slate-50 flex justify-center items-center transition-colors"><Printer className="w-4 h-4" /></button>
                                            <button className="py-2 px-3 bg-white border rounded-lg text-xs font-black text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex justify-center items-center transition-colors" onClick={() => { if (confirm(t('Supprimer ce Bon ?'))) deleteCommande(c.id); }}><Trash2 className="w-4 h-4" /></button>
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
                        <div className="bg-white p-6 rounded-3xl border shadow-sm">
                            <div className="flex items-center justify-between gap-4 mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center"><RefreshCw className="w-6 h-6" /></div>
                                    <div>
                                        <h2 className="text-2xl font-black text-slate-800">{t('Inventaire Tournant')}</h2>
                                    </div>
                                </div>
                                <button onClick={downloadCSV} className="px-3 py-2 border rounded-lg hover:bg-slate-50 flex gap-2 items-center text-sm font-bold text-slate-600" title="Exporter l'inventaire en CSV"><Download className="w-4 h-4" /> CSV</button>
                            </div>
                            <p className="text-slate-500 font-bold mb-6 max-w-md">{t("Vérifiez régulièrement l'exactitude de votre stock sans bloquer l'entrepôt en comptant une petite sélection d'articles.")}</p>

                            {!invSession && (
                                <button onClick={() => {
                                    if (products.length === 0) return alert(t('Aucun produit dans la base.'));
                                    const shuffled = [...products].sort(() => 0.5 - Math.random());
                                    const selected = shuffled.slice(0, Math.min(5, products.length));
                                    setInvSession({ id: uid(), items: selected.map(p => ({ pid: p.id, qty: '' })) });
                                }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 mx-auto transition-transform active:scale-95"><RefreshCw className="w-5 h-5" /> {t('Générer une Session (5 articles)')}</button>
                            )}
                        </div>

                        {invSession && (
                            <div className="bg-white rounded-3xl border shadow-sm overflow-hidden flex flex-col">
                                <div className="p-4 bg-slate-50 border-b flex justify-between items-center">
                                    <div className="font-bold text-slate-700">{t("Session d'inventaire #")}{invSession.id.toUpperCase()}</div>
                                    <button onClick={() => { if (confirm(t('Annuler cette session ?'))) setInvSession(null); }} className="text-rose-500 hover:text-rose-600 font-bold text-sm bg-rose-50 px-3 py-1 rounded-lg">{t('Annuler')}</button>
                                </div>

                                <div className="divide-y divide-slate-100">
                                    {invSession.items.map((item, idx) => {
                                        const p = products.find(x => x.id === item.pid);
                                        const st = p ? stockQty(lots, p.id) : 0;
                                        return (
                                            <div key={item.pid} className="p-4 md:p-6 flex flex-col md:flex-row gap-4 md:items-center hover:bg-slate-50 transition-colors">
                                                <div className="font-black text-slate-300 text-2xl w-8">{idx + 1}</div>
                                                <div className="flex-1">
                                                    <h3 className="font-black text-lg text-slate-800">{p?.designation || t('Article Inconnu')}</h3>
                                                    <div className="text-xs text-slate-400 font-mono mt-1">{p?.reference} • {t('Emplacement:')} <span className="text-slate-700 font-bold">{p?.emplacement || t('Non défini')}</span></div>
                                                </div>
                                                <div className="bg-slate-100 rounded-xl p-3 flex gap-4 text-center items-center shadow-inner">
                                                    <div>
                                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{t('Théorique')}</div>
                                                        <div className="font-black text-lg text-slate-500">{st.toFixed(1)} <span className="text-xs">{p?.unite}</span></div>
                                                    </div>
                                                    <div className="w-px h-8 bg-slate-200" />
                                                    <div>
                                                        <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">{t('Comptage Réel')}</div>
                                                        <input autoFocus={idx === 0} type="number" className="w-24 border-2 border-emerald-200 rounded-lg px-2 py-1 text-center font-black text-emerald-700 bg-emerald-50 focus:outline-none focus:border-emerald-500" placeholder="0" value={item.qty} onChange={e => {
                                                            const n = [...invSession.items];
                                                            n[idx].qty = e.target.value;
                                                            setInvSession({ ...invSession, items: n });
                                                        }} /> <span className="text-xs font-bold text-slate-400">{p?.unite}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="p-4 bg-slate-50 border-t">
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
                                    }} className="w-full py-4 bg-emerald-600 text-white font-black text-lg rounded-2xl hover:bg-emerald-700 flex items-center justify-center gap-2 shadow-lg shadow-emerald-200 transition-transform active:scale-95"><CheckCircle className="w-6 h-6" /> {t("Valider l'inventaire complet")}</button>
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
                                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-rose-500" /> {t('Stocks Critiques (Base)')}
                                </h3>
                                {alertes.length === 0 ? (
                                    <div className="bg-white rounded-2xl border border-emerald-100 p-6 flex items-center gap-4 text-emerald-700">
                                        <CheckCircle className="w-8 h-8 text-emerald-500" />
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
                                                <div key={p.id} className="bg-white rounded-2xl border border-red-200 overflow-hidden shadow-sm relative group hover:shadow-md transition-shadow">
                                                    <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-bl-lg">{t('URGENCE ACHAT')}</div>
                                                    <div className="p-4 space-y-3">
                                                        <div className="font-black text-slate-800 text-lg leading-tight mt-2 pr-4">{p.designation}</div>
                                                        <div className="text-xs text-slate-400 font-mono">{p.reference}</div>
                                                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100"><div className="text-[10px] uppercase font-bold text-slate-400">{t('Stock Actuel')}</div><div className="text-2xl font-black text-red-600">{st.toFixed(1)} <span className="text-sm">{p.unite}</span></div><div className="text-xs text-slate-400 mt-1">{t('Seuil:')} {p.stockAlerte} {p.unite}</div></div>
                                                        {p.fournisseurNom && <div className="text-xs font-bold text-slate-600 p-2 bg-indigo-50 rounded-lg flex items-center gap-1 border border-indigo-100"><Phone className="w-3 h-3 text-indigo-400" /> {p.fournisseurNom}</div>}
                                                        <button onClick={() => { setTab('bureau'); setBPid(p.id); setBMode('entree'); }} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm rounded-xl transition-colors">{t('Approvisionner')}</button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Alertes Production (Besoins) */}
                            <div>
                                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                                    <Layers className="w-5 h-5 text-indigo-500" /> {t('Besoins de Production (OF en cours)')}
                                </h3>
                                {modelNeeds.length === 0 ? (
                                    <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col items-center justify-center text-slate-400 min-h-[200px]">
                                        <CheckCircle className="w-12 h-12 text-slate-300 mb-3" />
                                        <p className="font-black text-lg text-slate-500">{t('Stock suffisant pour la production.')}</p>
                                        <p className="text-sm font-bold mt-1">{t('Aucune rupture détectée pour les modèles en lancement.')}</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {modelNeeds.map((mn, i) => (
                                            <div key={i} className="bg-white rounded-3xl border border-rose-200 shadow-sm overflow-hidden flex flex-col">
                                                <div className="bg-rose-50 border-b border-rose-100 p-4 flex gap-4 items-center">
                                                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm overflow-hidden shrink-0">
                                                        {mn.model.images?.front || mn.model.image ? (
                                                            <img src={mn.model.images?.front || mn.model.image} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <Package className="w-6 h-6 m-3 text-rose-300" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1">
                                                        <h4 className="font-black text-slate-800 text-lg leading-tight">{mn.model.meta_data.nom_modele}</h4>
                                                        <p className="text-xs font-bold text-slate-500">{t('Objectif:')} <span className="text-indigo-600">{mn.model.meta_data.quantity || 0} {t('pcs')}</span></p>
                                                    </div>
                                                </div>
                                                <div className="p-4 space-y-4">
                                                    {mn.shortages.map((s: any, idx) => {
                                                        // Find a plan B (same category, different product, with enough stock)
                                                        const planB = s.inMagasin ? products.find(p => p.categorie === s.inMagasin.categorie && p.id !== s.inMagasin.id && stockQty(lots, p.id) >= s.needed) : null;

                                                        return (
                                                            <div key={idx} className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <div className="font-black text-slate-800">{s.name}</div>
                                                                    <div className="text-[10px] font-black bg-rose-100 text-rose-700 px-2 py-0.5 rounded uppercase">{t('Manquant')}</div>
                                                                </div>
                                                                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                                                                    <div className="bg-white rounded-lg p-2 border border-slate-100">
                                                                        <div className="text-[10px] text-slate-400 font-bold uppercase">{t('Besoin')}</div>
                                                                        <div className="font-black text-slate-700">{s.needed} {s.unit}</div>
                                                                    </div>
                                                                    <div className="bg-white rounded-lg p-2 border border-slate-100">
                                                                        <div className="text-[10px] text-slate-400 font-bold uppercase">{t('En Magasin')}</div>
                                                                        <div className="font-black text-rose-600">{s.stock} {s.unit}</div>
                                                                    </div>
                                                                </div>

                                                                {/* Plan B Suggestion */}
                                                                <div className="mt-2 text-xs">
                                                                    {planB ? (
                                                                        <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-2.5 rounded-xl flex gap-2 items-start">
                                                                            <RefreshCw className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                                                                            <div>
                                                                                <span className="font-black block text-emerald-700">{t('Suggestion Plan B :')}</span>
                                                                                {t('Remplacer par')} <strong>{planB.designation}</strong> ({t('En stock:')} {stockQty(lots, planB.id).toFixed(1)} {planB.unite})
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="bg-orange-50 border border-orange-100 text-orange-800 p-2.5 rounded-xl flex gap-2 items-start">
                                                                            <AlertTriangle className="w-4 h-4 shrink-0 text-orange-600 mt-0.5" />
                                                                            <div>
                                                                                <span className="font-black block text-orange-700">{t('Action requise :')}</span>
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
                            <h2 className="text-xl font-black text-slate-800 flex-1 flex items-center gap-2"><Recycle className="w-6 h-6 text-emerald-500" /> {t('Valorisation : Déchets & Revente')}</h2>
                            <button onClick={() => alert(t("Fonctionnalité en cours de développement (Phase 6)."))} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-sm hover:bg-emerald-700 shadow-sm flex items-center gap-2 transition-colors">
                                <Plus className="w-4 h-4" /> {t('Déclarer Nouveau Surplus')}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Chutes & Déchets */}
                            <div className="bg-white rounded-3xl border shadow-sm p-6">
                                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><Trash2 className="w-5 h-5 text-rose-500" /> {t('Chutes de Coupe (Tissu)')}</h3>
                                <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 text-center mb-6">
                                    <div className="text-4xl font-black text-rose-600 mb-2">345 <span className="text-lg">kg</span></div>
                                    <p className="text-sm font-bold text-rose-800">{t('Volume total de déchets accumulés ce mois.')}</p>
                                </div>
                                <div className="space-y-4">
                                    {[
                                        { date: 'Hier, 16:30', m: 'Tissu Jean Bleu', q: '42 kg', src: 'Atelier Coupe 1' },
                                        { date: '10 Mars, 11:00', m: 'Toile Coton Blanche', q: '15 kg', src: 'Atelier Coupe 2' },
                                        { date: '08 Mars, 09:15', m: 'Tissu Synthétique Noir', q: '28 kg', src: 'Atelier Coupe 1' }
                                    ].map((d, i) => (
                                        <div key={i} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100">
                                            <div>
                                                <p className="text-sm font-black text-slate-800">{d.m}</p>
                                                <p className="text-[10px] font-bold text-slate-400">{d.date} • {d.src}</p>
                                            </div>
                                            <span className="font-black text-rose-600 bg-rose-50 px-2 py-1 rounded">{d.q}</span>
                                        </div>
                                    ))}
                                </div>
                                <button onClick={() => alert(t("Opération de recyclage confirmée. Le lot a été déduit du compte de valorisation."))} className="w-full mt-6 py-3 border-2 border-dashed border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-50 transition-colors text-sm">
                                    {t('Revendre / Recycler le lot (345 kg)')}
                                </button>
                            </div>

                            {/* Surplus Fournitures */}
                            <div className="bg-white rounded-3xl border shadow-sm p-6 flex flex-col">
                                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><ArrowLeft className="w-5 h-5 text-blue-500" /> {t('Surplus Fournitures (À revendre)')}</h3>
                                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center mb-6">
                                    <div className="text-4xl font-black text-blue-600 mb-2">1,250 <span className="text-lg">DH</span></div>
                                    <p className="text-sm font-bold text-blue-800">{t('Valeur estimée du surplus dormant revendable.')}</p>
                                </div>

                                <div className="flex-1">
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        {[
                                            { p: 'Boutons Pression Métal', q: 450, u: 'pcs', val: 220 },
                                            { p: 'Fermetures Éclair 15cm', q: 120, u: 'pcs', val: 300 },
                                            { p: 'Étiquettes Cuir Brand', q: 1500, u: 'pcs', val: 750 }
                                        ].map((s, i) => (
                                            <div key={i} className="border border-slate-100 bg-slate-50 p-4 rounded-xl relative group">
                                                <button onClick={() => alert(`${t('Suppression de')} ${s.p} ${t('des surplus.')}`)} className="absolute top-2 right-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
                                                <p className="text-xs font-black text-slate-800 leading-tight mb-2 pr-6">{s.p}</p>
                                                <div className="flex justify-between items-end">
                                                    <div>
                                                        <p className="text-lg font-black text-blue-600">{s.q} <span className="text-[10px] text-blue-400">{s.u}</span></p>
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-500">{s.val} DH</p>
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
                        <div className="bg-white p-6 rounded-3xl border shadow-sm">
                            <div className="flex items-center justify-between gap-4 mb-4">
                                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><LinkIcon className="w-5 h-5 text-indigo-500" /> {t('Traçabilité Ascendante / Descendante')}</h2>
                                <button onClick={exportMouvements} className="px-3 py-2 border rounded-lg hover:bg-slate-50 flex gap-2 items-center text-sm font-bold text-slate-600" title="Exporter tous les mouvements en CSV"><Download className="w-4 h-4" /> CSV</button>
                            </div>
                            <div className="relative">
                                <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                <input className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl py-4 pl-12 pr-4 text-lg font-bold outline-none focus:border-indigo-500 transition-colors" placeholder={t("Rechercher par Numéro OF, Numéro de Bain, ou Référence Article...")} value={traceQuery} onChange={e => setTraceQuery(e.target.value)} />
                            </div>
                            <p className="text-xs text-slate-400 font-bold mt-3 text-center">{t('Tapez par exemple')} <span className="text-indigo-500">OF-105</span> {t('ou')} <span className="text-indigo-500">TEIN-889</span> {t('pour voir tous les mouvements liés.')}</p>
                        </div>

                        {traceQuery.length > 2 ? (
                            <div className="bg-white p-6 rounded-3xl border shadow-sm">
                                <h3 className="text-lg font-black text-slate-700 mb-6">{t('Résultats pour "')}{traceQuery}"</h3>
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
                                                <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-slate-100 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                                    {m.type === 'entree' || m.type === 'retour_atelier' ? <TrendingDown className="w-4 h-4 text-emerald-500" /> : m.type === 'sortie' || m.type === 'rebut' ? <TrendingUp className="w-4 h-4 text-rose-500" /> : <RefreshCw className="w-4 h-4 text-amber-500" />}
                                                </div>
                                                <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-2xl border shadow-sm">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${m.type === 'entree' || m.type === 'retour_atelier' ? 'bg-emerald-100 text-emerald-700' : m.type === 'sortie' ? 'bg-indigo-100 text-indigo-700' : m.type === 'rebut' ? 'bg-rose-100 text-rose-700' : m.type === 'regularisation' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>{t(m.type)}</span>
                                                        <span className="text-xs font-bold text-slate-400">{new Date(m.date).toLocaleString()}</span>
                                                    </div>
                                                    <h4 className="font-black text-slate-800 text-base">{pName}</h4>
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        <span className="text-xs font-black text-slate-600 bg-slate-100 px-2 py-1 rounded">{t('Qté:')} <span className={m.type === 'entree' || m.type === 'retour_atelier' ? 'text-emerald-600' : m.type === 'sortie' || m.type === 'rebut' ? 'text-rose-600' : 'text-amber-500'}>{m.type === 'sortie' || m.type === 'rebut' ? '-' : '+'}{m.quantite}</span></span>
                                                        {m.modeleRef && <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded">{t('OF:')} {m.modeleRef}</span>}
                                                        {m.bain && <span className="text-xs font-black text-purple-600 bg-purple-50 px-2 py-1 rounded">{t('Bain:')} {m.bain}</span>}
                                                        {m.chaineId && <span className="text-xs font-bold text-slate-500 bg-slate-50 border px-2 py-1 rounded">{t('Chaîne:')} {m.chaineId}</span>}
                                                        {m.fournisseurId && <span className="text-xs font-bold text-slate-500 bg-slate-50 border px-2 py-1 rounded">{t('Frs:')} {m.fournisseurId}</span>}
                                                    </div>
                                                    {m.notes && <p className="text-xs text-slate-400 mt-2 italic">"{m.notes}"</p>}
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
                                            <div className="text-center py-12 text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 relative z-10 mx-6 md:mx-0">
                                                {t('Aucun mouvement trouvé pour cette recherche.')}
                                            </div>
                                        )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                                <LinkIcon className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                                <h3 className="text-lg font-black text-slate-700">{t('Audit de Traçabilité')}</h3>
                                <p className="text-slate-500 font-bold text-sm max-w-sm mx-auto">Recherchez un terme pour afficher l'historique de vie complet et garantir la qualité.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ══ Factures & BL (Gallery) ══ */}
                {tab === 'factures' && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="bg-white p-6 rounded-3xl border shadow-sm">
                            <div className="flex items-center justify-between gap-4 mb-4">
                                <div>
                                    <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-500" /> {t('Factures & Bons de Livraison')}</h2>
                                    <p className="text-sm text-slate-500 font-bold">{t('Tous les documents joints aux mouvements — cliquez pour imprimer / télécharger')}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { const el = document.getElementById('factures-print-all'); if (el) el.click(); }} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm transition-all active:scale-95">
                                        <Printer className="w-4 h-4" /> {t('Tout Imprimer')}
                                    </button>
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 font-bold">{t('Documents avec pièce jointe')} : {mvts.filter(m => m.pieceJointe).length} · {t('Avec référence')} : {mvts.filter(m => m.documentRef).length}</p>
                        </div>

                        {(() => {
                            const docMvts = mvts.filter(m => m.pieceJointe || m.documentRef);
                            if (docMvts.length === 0) {
                                return (
                                    <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                                        <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                                        <h3 className="text-lg font-black text-slate-700">{t('Aucun document')}</h3>
                                        <p className="text-slate-500 font-bold text-sm max-w-sm mx-auto">{t('Joignez des pièces justificatives lors des entrées/sorties pour les voir apparaître ici.')}</p>
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
                                            <h3 className="text-sm font-black text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                <div className="h-px flex-1 bg-slate-200" />
                                                <span>{month}</span>
                                                <div className="h-px flex-1 bg-slate-200" />
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
                                                            className="group relative bg-white rounded-2xl border-2 border-slate-100 hover:border-indigo-300 shadow-sm hover:shadow-lg transition-all cursor-pointer overflow-hidden"
                                                        >
                                                            {/* Thumbnail */}
                                                            <div className="aspect-[3/4] bg-slate-50 flex items-center justify-center overflow-hidden relative">
                                                                {m.pieceJointe ? (
                                                                    <img src={m.pieceJointe} alt={docNum} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                                ) : (
                                                                    <div className="flex flex-col items-center gap-2 text-slate-300">
                                                                        <FileText className="w-12 h-12" />
                                                                        <span className="text-xs font-bold">{docTitle}</span>
                                                                    </div>
                                                                )}
                                                                {/* Overlay on hover */}
                                                                <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors flex items-center justify-center">
                                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur rounded-xl px-3 py-2 shadow-lg flex items-center gap-2">
                                                                        <Printer className="w-4 h-4 text-indigo-600" />
                                                                        <span className="text-xs font-black text-indigo-700">{t('Imprimer')}</span>
                                                                    </div>
                                                                </div>
                                                                {/* Type badge */}
                                                                <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${isSortie ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                                    {isSortie ? 'BL' : 'BR'}
                                                                </div>
                                                            </div>
                                                            {/* Info */}
                                                            <div className="p-3">
                                                                <div className="font-black text-slate-800 text-xs truncate">{p?.designation || t('Inconnu')}</div>
                                                                <div className="text-[10px] text-slate-400 font-bold mt-1 font-mono">{docNum}</div>
                                                                <div className="flex justify-between items-center mt-2">
                                                                    <span className="text-[10px] text-slate-400 font-bold">{new Date(m.date).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })}</span>
                                                                    <span className={`text-xs font-black ${isSortie ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                                        {isSortie ? '-' : '+'}{m.quantite}
                                                                    </span>
                                                                </div>
                                                                {m.fournisseurId && <div className="text-[10px] text-indigo-500 font-bold mt-1 truncate">📦 {m.fournisseurId}</div>}
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
                            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                    <Package className="w-6 h-6 text-indigo-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500">{t('Total Modèles')}</p>
                                    <p className="text-2xl font-black text-slate-800">{finishedGoods.length}</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                                    <CheckCircle className="w-6 h-6 text-emerald-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500">{t('Disponible')}</p>
                                    <p className="text-2xl font-black text-emerald-600">{finishedGoods.filter(fg => fg.statut === 'disponible').reduce((s, fg) => s + fg.quantiteRestante, 0).toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                                    <Send className="w-6 h-6 text-amber-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500">{t('Expédié')}</p>
                                    <p className="text-2xl font-black text-amber-600">{finishedGoods.reduce((s, fg) => s + fg.quantiteExpediee, 0).toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                                    <AlertTriangle className="w-6 h-6 text-rose-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-500">{t('Défauts')}</p>
                                    <p className="text-2xl font-black text-rose-600">{finishedGoods.reduce((s, fg) => s + fg.quantiteDefaut, 0).toLocaleString()}</p>
                                </div>
                            </div>
                        </div>

                        {/* Finished Goods Table */}
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                                <div>
                                    <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                                        <Package className="w-5 h-5 text-indigo-500" /> {t('Stock Produit Fini')}
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-1">{t('Pièces finies après production — suivi des quantités, défauts et expéditions.')}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        placeholder={t('Rechercher...')}
                                        className="px-3 py-1.5 border border-slate-200 rounded-xl text-sm"
                                        onChange={e => {
                                            const q = e.target.value.toLowerCase();
                                            // Filter handled in render below
                                        }}
                                    />
                                </div>
                            </div>

                            {finishedGoods.length === 0 ? (
                                <div className="p-12 text-center">
                                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                    <p className="font-bold text-slate-500">{t('Aucun produit fini en stock.')}</p>
                                    <p className="text-xs text-slate-400 mt-1">{t('Les entrées seront créées automatiquement lors de la clôture des OFs.')}</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50">
                                            <tr className="text-slate-500">
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
                                                    <tr key={fg.id} className="hover:bg-slate-50 transition-colors">
                                                        <td className="p-3 pl-6">
                                                            <div className="font-black text-slate-800">{fg.designation || fg.reference || '-'}</div>
                                                            <div className="text-[10px] text-slate-400 font-bold mt-0.5">{fg.reference || ''}</div>
                                                        </td>
                                                        <td className="p-3 text-slate-600 font-medium">{fg.clientName || '-'}</td>
                                                        <td className="p-3 text-slate-600 font-medium">{fg.chaineId || '-'}</td>
                                                        <td className="p-3 text-center">
                                                            <span className="font-black text-slate-800">{fg.quantiteProduite}</span>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <span className={`font-black ${fg.quantiteDefaut > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                                                                {fg.quantiteDefaut}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <span className="font-black text-amber-600">{fg.quantiteExpediee}</span>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <div className="flex flex-col items-center">
                                                                <span className={`font-black ${fg.quantiteRestante > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                                                                    {fg.quantiteRestante}
                                                                </span>
                                                                <div className="w-16 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                                    <div
                                                                        className="h-full bg-emerald-500 rounded-full transition-all"
                                                                        style={{ width: `${progress}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="text-xs text-slate-500">{fg.dateProduction}</div>
                                                            {isLate && (
                                                                <span className="text-[9px] font-black text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                                                                    EN RETARD
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-3">
                                                            <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                                                                fg.statut === 'disponible' ? 'bg-emerald-100 text-emerald-700' :
                                                                fg.statut === 'partielle' ? 'bg-amber-100 text-amber-700' :
                                                                'bg-slate-100 text-slate-600'
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
                                                                    className="px-2 py-1 rounded-lg bg-indigo-100 text-indigo-700 text-[10px] font-bold hover:bg-indigo-200 transition-colors"
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
                                                                    className="px-2 py-1 rounded-lg bg-rose-100 text-rose-700 text-[10px] font-bold hover:bg-rose-200 transition-colors"
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
                            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100">
                                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                        <History className="w-4 h-4 text-indigo-500" /> {t('Derniers Mouvements PF')}
                                    </h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50">
                                            <tr className="text-slate-500">
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
                                                    <tr key={m.id} className="hover:bg-slate-50">
                                                        <td className="p-3 pl-6 text-xs text-slate-500 font-mono">{new Date(m.date).toLocaleString()}</td>
                                                        <td className="p-3">
                                                            <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                                                                m.type === 'expedition' ? 'bg-amber-100 text-amber-700' :
                                                                m.type === 'retour' ? 'bg-emerald-100 text-emerald-700' :
                                                                'bg-slate-100 text-slate-600'
                                                            }`}>{t(m.type)}</span>
                                                        </td>
                                                        <td className="p-3 font-bold text-slate-700">{fg?.designation || '-'}</td>
                                                        <td className="p-3 text-center font-black text-slate-800">{m.quantite}</td>
                                                        <td className="p-3 text-slate-600">{m.clientNom || '-'}</td>
                                                        <td className="p-3 text-slate-500 text-xs">{m.bonLivraisonRef || '-'}</td>
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
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                             <div className="p-6">
                                 <h3 className="text-xl font-black text-rose-600 flex items-center gap-2 mb-2">
                                     <AlertTriangle className="w-6 h-6" /> Conflit de Réservation
                                 </h3>
                                 <p className="text-slate-600">
                                     Le stock total est de <b className="text-slate-800">{conflictData.st}</b>, mais il ne reste que <b className="text-indigo-600">{conflictData.avail}</b> unités disponibles (le reste est déjà réservé).
                                 </p>
                                 <div className="mt-8 flex flex-col gap-3">
                                     <button onClick={() => {
                                          setBQty(conflictData.avail.toString());
                                          setConflictData(null);
                                     }} className="w-full py-3 bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold rounded-xl flex justify-center items-center gap-2 transition-colors">
                                         <Edit2 className="w-4 h-4" /> Réserver uniquement {conflictData.avail}
                                     </button>
                                     <button onClick={() => {
                                          setTab('demandes');
                                          setConflictData(null);
                                     }} className="w-full py-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold rounded-xl flex justify-center items-center gap-2 transition-colors">
                                         <Plus className="w-4 h-4" /> Nouvelle Demande d'Appro.
                                     </button>
                                     <button onClick={() => setConflictData(null)} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors">
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
                            <div className="bg-white p-6 rounded-3xl border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><MapPin className="w-5 h-5 text-indigo-500" /> {t('Cartographie WMS 2D')}</h2>
                                    <p className="text-sm text-slate-500 font-bold mt-1">{t("Vue de l'entrepôt par rayon. Densité basée sur le volume de stock actic.")}</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><div className="w-3 h-3 rounded bg-slate-100"></div> {t('Vide')}</div>
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><div className="w-3 h-3 rounded bg-indigo-200"></div> {t('Moyen')}</div>
                                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><div className="w-3 h-3 rounded bg-indigo-500"></div> {t('Dense')}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                <div className="lg:col-span-3 bg-slate-100 p-8 rounded-3xl border border-slate-200 shadow-inner grid grid-cols-2 md:grid-cols-3 gap-8 overflow-x-auto relative min-h-[500px]">
                                    {/* Mock portes / Layout */}
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-white px-8 py-2 border-b-2 border-x-2 border-slate-200 rounded-b-xl text-xs font-black text-slate-400 uppercase tracking-widest shadow-sm">{t('Dock Réception')}</div>
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-white px-8 py-2 border-t-2 border-x-2 border-slate-200 rounded-t-xl text-xs font-black text-slate-400 uppercase tracking-widest shadow-sm">{t('Expédition / Atelier')}</div>

                                    {rayons.map(r => {
                                        const d = wmsData[r];
                                        const isDense = d.totalStock > 5000;
                                        const isMedium = d.totalStock > 1000;
                                        return (
                                            <div key={r} onClick={() => setSearch(`^${r}`)} className={`cursor-pointer transition-transform hover:scale-105 group relative mt-10 mb-10 bg-white rounded-2xl border-4 ${isDense ? 'border-indigo-500 shadow-lg shadow-indigo-200' : isMedium ? 'border-indigo-300 shadow-md' : 'border-slate-300'} flex flex-col overflow-hidden h-64`}>
                                                <div className={`p-2 text-center text-white font-black text-lg ${isDense ? 'bg-indigo-500' : isMedium ? 'bg-indigo-400' : 'bg-slate-400'}`}>{t('Rayon')} {r}</div>
                                                <div className="p-4 flex-1 flex flex-col justify-center text-center bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
                                                    <div className="text-3xl font-black text-slate-800">{d.items.length} <span className="text-sm text-slate-500 font-bold block">{t('Réf. Uniques')}</span></div>
                                                    <div className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">{t('Stock Total')}</div>
                                                    <div className={`font-black text-xl ${isDense ? 'text-indigo-600' : 'text-slate-600'}`}>{d.totalStock.toLocaleString()}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="bg-white p-6 rounded-3xl border shadow-sm h-[500px] overflow-y-auto flex flex-col">
                                    <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2"><Search className="w-4 h-4 text-indigo-500" /> {t('Détails Emplacements')}</h3>
                                    <input placeholder={t("Filtrer... (ex: ^A pour Rayon A)")} value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold mb-4 outline-none focus:border-indigo-500" />
                                    <div className="flex-1 overflow-y-auto pr-2 space-y-3">
                                        {products.filter(p => search.startsWith('^') ? (p.emplacement || '?').toUpperCase().startsWith(search.substring(1).toUpperCase()) : (p.emplacement?.toLowerCase().includes(search.toLowerCase()) || p.designation.toLowerCase().includes(search.toLowerCase()))).map(p => {
                                            const st = stockQty(lots, p.id);
                                            return (
                                                <div key={p.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-colors">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{p.emplacement || t('Non Défini')}</span>
                                                        <span className="text-[10px] font-bold text-slate-400">{p.reference}</span>
                                                    </div>
                                                    <div className="font-bold text-slate-800 text-sm mt-1 leading-tight">{p.designation}</div>
                                                    <div className="text-xs font-black text-slate-500 mt-2">{t('Dispo:')} <span className={st === 0 ? 'text-red-500' : 'text-emerald-600'}>{st} {p.unite}</span></div>
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
                            <div className="bg-gradient-to-r from-slate-800 to-indigo-900 p-8 rounded-3xl text-white shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-10"><Building2 className="w-48 h-48" /></div>
                                <h2 className="text-3xl font-black mb-2 flex items-center gap-3"><Building2 className="w-8 h-8 text-indigo-400" /> {t('Radar Fournisseurs (Sourcing)')}</h2>
                                <p className="text-indigo-100 font-bold max-w-xl">{t("Évaluez la performance de vos fournisseurs, surveillez l'évolution des prix d'achat (CUMP) et optimisez votre sourcing stratégique.")}</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {suppliersData.map(s => (
                                    <div key={s.name} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all group">
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                                                <Building2 className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
                                            </div>
                                            <div className={`px-4 py-2 rounded-xl text-lg font-black border-2 border-dashed ${s.score >= 85 ? 'border-emerald-200 text-emerald-600 bg-emerald-50' : s.score >= 70 ? 'border-amber-200 text-amber-600 bg-amber-50' : 'border-rose-200 text-rose-600 bg-rose-50'}`}>
                                                {s.score}/100
                                            </div>
                                        </div>
                                        <h3 className="text-xl font-black text-slate-800 mb-1">{s.name}</h3>
                                        <p className="text-sm font-bold text-slate-400 mb-6 flex items-center gap-2"><Layers className="w-4 h-4" /> {s.prods} {t('références matérielles')}</p>

                                        <div className="space-y-4">
                                            <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center">
                                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('Valeur Stock')}</span>
                                                <span className="font-black text-slate-700">{s.value.toLocaleString()} DH</span>
                                            </div>
                                            <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center">
                                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('Évolution Prix')}</span>
                                                <span className={`font-black flex items-center gap-1 ${s.evolution > 0 ? 'text-rose-500' : s.evolution < 0 ? 'text-emerald-500' : 'text-slate-500'}`}>
                                                    {s.evolution > 0 ? '+' : ''}{s.evolution.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center">
                                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('Livraisons Récentes')}</span>
                                                <span className="font-black text-slate-700">{s.entries} {t('transactions')}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {suppliersData.length === 0 && (
                                    <div className="col-span-full text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                                        <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                        <h3 className="text-lg font-black text-slate-700">{t('Aucun Fournisseur')}</h3>
                                        <p className="text-slate-500 font-bold max-w-sm mx-auto mt-2">{t('Associez des fournisseurs à vos produits dans la base pour voir leurs statistiques ici.')}</p>
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
                            alert("Veuillez remplir tous les champs obligatoires (N° BR, Commande, Fourniture, Quantité).");
                            return;
                        }

                        const qty = parseFloat(brQty);
                        if (isNaN(qty) || qty <= 0) {
                            alert("La quantité doit être supérieure à 0.");
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
                                        alert(`Bon de Réception ${brNum} enregistré et stock mis à jour pour "${brSelectedMaterial}" !`);
                                    } else {
                                        alert(`BR enregistré, mais échec de la mise à jour automatique du stock sur le serveur.`);
                                    }
                                } catch (err) {
                                    console.error(err);
                                    alert(`BR enregistré, mais échec de connexion pour la mise à jour du stock.`);
                                }
                            } else {
                                alert(`BR enregistré. Note : Aucun article nommé "${brSelectedMaterial}" trouvé dans le stock général. Le stock n'a pas été incrémenté.`);
                            }
                        } else {
                            alert(`Bon de Réception ${brNum} enregistré (historique d'approvisionnement uniquement).`);
                        }

                        // Reset inputs
                        setBrQty('');
                        setBrSelectedMaterial('');
                        setBrNum(`BR-${Math.floor(1000 + Math.random() * 9000)}`);
                    };

                    return (
                        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300 max-w-7xl mx-auto">
                            <div className="bg-gradient-to-r from-slate-800 to-indigo-900 p-6 rounded-3xl text-white shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-10"><Download className="w-48 h-48" /></div>
                                <h2 className="text-2xl font-black mb-1 flex items-center gap-3"><Download className="w-6 h-6 text-indigo-400" /> {t('Bons de Réception ( الشحنات الواردة )')}</h2>
                                <p className="text-indigo-100 font-bold max-w-xl">{t("Enregistrez les livraisons partielles ou totales de matières et fournitures (Temykou/Client ou Owned) pour les associer aux ordres de fabrication.")}</p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Form */}
                                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                                    <h3 className="font-black text-slate-800 text-lg border-b pb-2">{t('Nouvelle Réception')}</h3>
                                    
                                    <div>
                                        <Lbl t="N° Bon de Réception *" />
                                        <input className={inp} value={brNum} onChange={e => setBrNum(e.target.value)} />
                                    </div>

                                    <div>
                                        <Lbl t="Ordre de Fabrication (Pedido) *" />
                                        <select className={inp} value={brSelectedEventId} onChange={e => {
                                            const val = e.target.value;
                                            setBrSelectedEventId(val);
                                            const ev = activeEvents.find(x => x.id === val);
                                            if (ev) {
                                                setBrSupplier(ev.clientName || '');
                                                setBrOwner(ev.typeMarche === 'Export' ? 'client' : 'atelier');
                                            }
                                        }}>
                                            <option value="">-- Choisir OF --</option>
                                            {activeEvents.map(ev => (
                                                <option key={ev.id} value={ev.id}>{ev.clientName} - {ev.modelName} (Qté: {ev.qteTotal})</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <Lbl t="Ligne de la BOM / Fourniture *" />
                                        <select className={inp} value={brSelectedMaterial} onChange={e => setBrSelectedMaterial(e.target.value)} disabled={!brSelectedEventId}>
                                            <option value="">-- Choisir Trim/Matière --</option>
                                            {bomMaterials.map((m, idx) => (
                                                <option key={idx} value={m.name}>{m.name} ({m.qty} {m.unit} / pc)</option>
                                            ))}
                                            {brSelectedEventId && bomMaterials.length === 0 && (
                                                <option value="">Aucune fourniture définie dans la Fiche Technique</option>
                                            )}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <Lbl t="Quantité Reçue *" />
                                            <input className={inp} type="number" min="0.01" step="any" placeholder="Ex: 5000" value={brQty} onChange={e => setBrQty(e.target.value)} />
                                        </div>
                                        <div>
                                            <Lbl t="Date de Réception" />
                                            <input className={inp} type="date" value={brDate} onChange={e => setBrDate(e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <Lbl t="Propriétaire (الملكية)" />
                                            <select className={inp} value={brOwner} onChange={e => setBrOwner(e.target.value as any)}>
                                                <option value="client">Client (Temykou)</option>
                                                <option value="atelier">Atelier (Factory Owned)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <Lbl t="Provenance / Fournisseur" />
                                            <input className={inp} placeholder="Nom du Client" value={brSupplier} onChange={e => setBrSupplier(e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 pt-2 border-t">
                                        <input type="checkbox" id="autoAddStock" checked={brAutoAddStock} onChange={e => setBrAutoAddStock(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded cursor-pointer" />
                                        <label htmlFor="autoAddStock" className="text-xs font-bold text-slate-600 cursor-pointer">Incrémenter automatiquement le stock WMS</label>
                                    </div>

                                    <button onClick={handleAddReceipt} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-2xl shadow-md transition active:scale-95 flex items-center justify-center gap-2">
                                        <Plus className="w-4 h-4" /> Enregistrer la réception
                                    </button>
                                </div>

                                {/* List Table */}
                                <div className="lg:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
                                    <h3 className="font-black text-slate-800 text-lg border-b pb-2 mb-4">{t('Historique des Réceptions')}</h3>
                                    <div className="overflow-x-auto flex-1 min-h-[300px]">
                                        <table className="w-full text-left text-sm whitespace-nowrap">
                                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                                <tr>
                                                    <th className="p-3">Bon de Réf (BR)</th>
                                                    <th className="p-3">Date</th>
                                                    <th className="p-3">OF / Modèle</th>
                                                    <th className="p-3">Matière / Trim</th>
                                                    <th className="p-3 text-right">Qté Reçue</th>
                                                    <th className="p-3 text-center">Type</th>
                                                    <th className="p-3 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y text-xs">
                                                {receptions.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className="p-8 text-center text-slate-400 font-bold">Aucune réception enregistrée.</td>
                                                    </tr>
                                                ) : (
                                                    receptions.map((r, idx) => {
                                                        const ev = planningEvents.find(x => x.id === r.pedidoId);
                                                        return (
                                                            <tr key={idx} className="hover:bg-slate-50">
                                                                <td className="p-3 font-bold text-slate-700">{r.id}</td>
                                                                <td className="p-3 text-slate-500">{r.dateReceived}</td>
                                                                <td className="p-3">
                                                                    <div className="font-bold text-slate-800">{ev?.modelName || 'OF inconnu'}</div>
                                                                    <div className="text-[10px] text-slate-400">Client: {ev?.clientName || '—'}</div>
                                                                </td>
                                                                <td className="p-3 font-bold text-indigo-700">{r.materialName}</td>
                                                                <td className="p-3 text-right font-black text-slate-800">{r.qtyReceived.toLocaleString()}</td>
                                                                <td className="p-3 text-center">
                                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${r.owner === 'client' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                                                                        {r.owner === 'client' ? 'Consigné (Temykou)' : 'Acheté'}
                                                                    </span>
                                                                </td>
                                                                <td className="p-3 text-right">
                                                                    <button onClick={() => {
                                                                        if (confirm("Voulez-vous vraiment supprimer ce bon de réception ?")) {
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
                                                                    }} className="text-slate-400 hover:text-rose-600 p-1">
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
                        if (!targetEv) return alert("Ordre cible non trouvé.");
                        
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
                        alert(`Surplus transféré avec succès vers l'OF ${targetEv.modelName} !`);
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
                                
                                alert(`Les surplus ont été intégrés au stock atelier avec une valeur de ${valuation} DH/pièce !`);
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
                            <div className="bg-gradient-to-r from-slate-800 to-indigo-900 p-6 rounded-3xl text-white shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-10"><Scale className="w-48 h-48" /></div>
                                <h2 className="text-2xl font-black mb-1 flex items-center gap-3"><Scale className="w-6 h-6 text-indigo-400" /> {t('Gestion des Surplus ( الفائض )')}</h2>
                                <p className="text-indigo-100 font-bold max-w-xl">{t("Gérez le reste des matières et fournitures (Temykou) après la clôture des commandes. Transférez-les à un autre modèle ou intégrez-les au stock propre du magasin.")}</p>
                            </div>

                            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                                <h3 className="font-black text-slate-800 text-lg border-b pb-2 mb-4">{t('Commandes Clôturées et Restants')}</h3>
                                
                                <div className="space-y-6">
                                    {closedEvents.map(ev => {
                                        const model = models.find(m => m.id === ev.modelId);
                                        const eventReceipts = receptions.filter(r => r.pedidoId === ev.id);
                                        const bom = model?.ficheData?.materials || [];

                                        return (
                                            <div key={ev.id} className="border border-slate-100 bg-slate-50/50 p-5 rounded-2xl">
                                                <div className="flex flex-wrap justify-between items-center border-b pb-3 mb-4">
                                                    <div>
                                                        <h4 className="font-black text-slate-800 text-base">{ev.modelName}</h4>
                                                        <p className="text-xs font-semibold text-slate-400">Client: {ev.clientName} | DDS: {ev.strictDeadline_DDS || '—'} | Qté commandée: {ev.qteTotal} pcs</p>
                                                    </div>
                                                    <span className="px-3 py-1 bg-slate-200 text-slate-700 font-bold text-xs rounded-full uppercase">Clôturé / Terminée</span>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {eventReceipts.map((r, idx) => {
                                                        const bomItem = bom.find(b => b.name === r.materialName);
                                                        const unitQty = bomItem ? bomItem.qty : 0;
                                                        const theoreticalCons = ev.qteTotal * unitQty;
                                                        const surplus = Math.max(0, r.qtyReceived - theoreticalCons);
                                                        const isConsumed = surplus === 0;

                                                        return (
                                                            <div key={idx} className="bg-white p-4 border rounded-xl shadow-sm flex flex-col justify-between">
                                                                <div>
                                                                    <div className="flex justify-between items-start">
                                                                        <span className="font-bold text-slate-800 text-sm">{r.materialName}</span>
                                                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${isConsumed ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-800'}`}>
                                                                            {isConsumed ? 'Consommé' : 'Fonds Excédentaire'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-2 mt-3 text-center border-y py-2 text-xs">
                                                                        <div>
                                                                            <span className="block text-[9px] font-bold text-slate-400 uppercase">Reçu</span>
                                                                            <span className="font-bold text-slate-700">{r.qtyReceived.toLocaleString()}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="block text-[9px] font-bold text-slate-400 uppercase">Théorique</span>
                                                                            <span className="font-bold text-slate-700">{theoreticalCons.toLocaleString()}</span>
                                                                        </div>
                                                                        <div>
                                                                            <span className="block text-[9px] font-bold text-slate-400 uppercase">Surplus</span>
                                                                            <span className={`font-black ${surplus > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>{surplus.toLocaleString()}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {surplus > 0 && r.owner === 'client' && (
                                                                    <div className="flex gap-2 mt-4 pt-2 border-t">
                                                                        <button onClick={() => {
                                                                            setSurplusModal({ open: true, eventId: ev.id, materialName: r.materialName, surplusQty: surplus, isTemykou: true });
                                                                            setSurplusActionType('transfer');
                                                                            setSurplusTargetEventId('');
                                                                        }} className="flex-1 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded transition-colors uppercase tracking-wider">
                                                                            Transférer
                                                                        </button>
                                                                        <button onClick={() => {
                                                                            setSurplusModal({ open: true, eventId: ev.id, materialName: r.materialName, surplusQty: surplus, isTemykou: true });
                                                                            setSurplusActionType('absorb');
                                                                            setSurplusAbsorbValuation('');
                                                                        }} className="flex-1 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded transition-colors uppercase tracking-wider">
                                                                            Absorber (Atelier)
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {r.owner === 'atelier' && (
                                                                    <div className="text-[10px] text-slate-400 font-bold mt-4 pt-2 border-t text-center uppercase tracking-widest">
                                                                        Intégré au stock général
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    {eventReceipts.length === 0 && (
                                                        <div className="col-span-full py-4 text-center text-xs text-slate-400 font-semibold italic">
                                                            Aucune livraison enregistrée pour cette commande.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {closedEvents.length === 0 && (
                                        <div className="text-center py-10 text-slate-400 font-bold italic">
                                            Aucune commande clôturée disponible pour l'analyse des restants.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Surplus Actions Modal */}
                            {surplusModal?.open && (
                                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-6 overflow-hidden flex flex-col">
                                        <div className="flex items-center justify-between mb-4 border-b pb-2">
                                            <h3 className="font-black text-slate-800 text-lg flex items-center gap-2">
                                                <Scale className="w-5 h-5 text-indigo-500" /> Action sur Surplus
                                            </h3>
                                            <button onClick={() => setSurplusModal(null)} className="p-2 hover:bg-slate-100 rounded-full">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="text-sm font-bold text-slate-600 mb-4 bg-slate-50 p-3 rounded-xl border">
                                            <div className="flex justify-between"><span>Fourniture :</span> <span className="text-indigo-600">{surplusModal.materialName}</span></div>
                                            <div className="flex justify-between mt-1"><span>Quantité surplus :</span> <span className="text-emerald-600">{surplusModal.surplusQty?.toLocaleString()}</span></div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="flex bg-slate-100 rounded-lg p-1">
                                                <button onClick={() => setSurplusActionType('transfer')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${surplusActionType === 'transfer' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Transférer</button>
                                                <button onClick={() => setSurplusActionType('absorb')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${surplusActionType === 'absorb' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>Absorber</button>
                                            </div>

                                            {surplusActionType === 'transfer' && (
                                                <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                                    <Lbl t="Sélectionner le Modèle cible (même client)" />
                                                    <select className={inp} value={surplusTargetEventId} onChange={e => setSurplusTargetEventId(e.target.value)}>
                                                        <option value="">-- Choisir OF cible --</option>
                                                        {planningEvents.filter(ev => ev.status !== 'DONE' && ev.clientName === planningEvents.find(x => x.id === surplusModal.eventId)?.clientName).map(ev => (
                                                            <option key={ev.id} value={ev.id}>{ev.modelName} (DDS: {ev.strictDeadline_DDS || '—'})</option>
                                                        ))}
                                                    </select>
                                                    <button onClick={() => {
                                                        const r = receptions.find(x => x.pedidoId === surplusModal.eventId && x.materialName === surplusModal.materialName);
                                                        if (r) handleTransferSurplus(r, surplusTargetEventId);
                                                    }} className="w-full bg-indigo-600 text-white font-black py-2.5 rounded-xl text-sm">
                                                        Valider le transfert
                                                    </button>
                                                </div>
                                            )}

                                            {surplusActionType === 'absorb' && (
                                                <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                                    <Lbl t="Valorisation Unitaire (DH / pièce) *" />
                                                    <input className={inp} type="number" min="0" placeholder="Ex: 12.50" value={surplusAbsorbValuation} onChange={e => setSurplusAbsorbValuation(e.target.value)} />
                                                    <button onClick={() => {
                                                        const r = receptions.find(x => x.pedidoId === surplusModal.eventId && x.materialName === surplusModal.materialName);
                                                        const val = parseFloat(surplusAbsorbValuation);
                                                        if (r && !isNaN(val) && val >= 0) handleAbsorbSurplus(r, val);
                                                        else alert("Entrez une valeur correcte.");
                                                    }} className="w-full bg-emerald-600 text-white font-black py-2.5 rounded-xl text-sm">
                                                        Valider l'absorption au stock
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
                            alert('Erreur: Vérifiez votre connexion au serveur.');
                        }
                    }}
                    lang={lang}
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
    lang: 'fr' | 'ar' | 'en';
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
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><History className="w-5 h-5 text-indigo-500" /> {t('Détails de l\'activité')}</h2>
                        <p className="text-xs text-slate-500">{t('Modifier la ligne et enregistrer pour ajuster le registre de mouvement.')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-slate-500 hover:bg-slate-100"><X className="w-5 h-5" /></button>
                </div>
                <div className="overflow-y-auto p-6 space-y-6">
                    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
                        <div className="space-y-4">
                            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 flex items-center gap-4">
                                <div className="w-20 h-20 rounded-3xl overflow-hidden bg-white border border-slate-200 flex items-center justify-center">
                                    {product?.photo ? <img src={product.photo} alt={product.designation} className="w-full h-full object-cover" /> : <Package className="w-8 h-8 text-slate-400" />}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs uppercase tracking-widest text-slate-400 font-black">{t('Produit')}</p>
                                    <h3 className="font-black text-slate-900 truncate">{product?.designation || t('Inconnu')}</h3>
                                    <p className="text-xs text-slate-500">{product?.reference || ''}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                                    <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Stock actuel')}</p>
                                    <p className="text-2xl font-black text-slate-800">{stock.toFixed(1)} {product?.unite || ''}</p>
                                </div>
                                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                                    <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Type de mouvement')}</p>
                                    <p className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase ${isEntry ? 'bg-emerald-100 text-emerald-700' : isExit ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{t(draft.type)}</p>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-slate-400">{t('Produit lié')}</p>
                                    <p className="font-black text-slate-900 truncate">{product?.designation || t('Inconnu')}</p>
                                </div>
                                {product && <button onClick={() => onViewProduct(product)} className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700">{t('Voir produit')}</button>}
                            </div>
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Quantité')}</label>
                                    <input type="number" min="0" step="0.01" className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm" value={draft.quantite} onChange={e => setField('quantite', parseFloat(e.target.value) || 0)} />
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Date / Heure')}</label>
                                    <input type="datetime-local" className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm" value={toDatetimeLocal(draft.date)} onChange={e => setField('date', fromDatetimeLocal(e.target.value))} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-3xl border border-slate-200 bg-white p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Type')}</label>
                            <select className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm" value={draft.type} onChange={e => setField('type', e.target.value)}>
                                {['entree','sortie','retour_atelier','rebut','regularisation','reservation'].map(type => <option key={type} value={type}>{t(type)}</option>)}
                            </select>
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-white p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Source')}</label>
                            <input className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm" value={draft.source} onChange={e => setField('source', e.target.value as any)} />
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-white p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Destination')}</label>
                            <input className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm" value={draft.destination} onChange={e => setField('destination', e.target.value as any)} />
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-white p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Prix Unitaire')}</label>
                            <input type="number" min="0" step="0.01" className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm" value={draft.prixUnitaire || ''} onChange={e => setField('prixUnitaire', e.target.value === '' ? undefined : parseFloat(e.target.value))} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="rounded-3xl border border-slate-200 bg-white p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Fournisseur')}</label>
                            <input className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm" value={draft.fournisseurId || ''} onChange={e => setField('fournisseurId', e.target.value || undefined)} />
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-white p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Chaîne')}</label>
                            <input className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm" value={draft.chaineId || ''} onChange={e => setField('chaineId', e.target.value || undefined)} />
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-white p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Référence OF')}</label>
                            <input className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm" value={draft.modeleRef || ''} onChange={e => setField('modeleRef', e.target.value || undefined)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-3xl border border-slate-200 bg-white p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Notes')}</label>
                            <textarea className="w-full min-h-[120px] border border-slate-200 rounded-2xl px-3 py-2 text-sm" value={draft.notes || ''} onChange={e => setField('notes', e.target.value || undefined)} />
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-white p-4">
                            <label className="block text-[10px] uppercase tracking-widest text-slate-400 mb-2">{t('Document / Pièce jointe')}</label>
                            <input className="w-full border border-slate-200 rounded-2xl px-3 py-2 text-sm" value={draft.documentRef || ''} onChange={e => setField('documentRef', e.target.value || undefined)} placeholder={t('Ref. bon / BL / facture')} />
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 p-4 sm:flex-row sm:justify-between sm:items-center">
                    <button onClick={() => onDelete(movement.id)} className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-rose-600 text-white font-black hover:bg-rose-700 transition-colors">{t('Supprimer')}</button>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <button onClick={onClose} className="w-full sm:w-auto px-5 py-3 rounded-2xl border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 transition-colors">{t('Annuler')}</button>
                        <button onClick={() => draft && onSave(draft)} className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-indigo-600 text-white font-black hover:bg-indigo-700 transition-colors">{t('Enregistrer')}</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
