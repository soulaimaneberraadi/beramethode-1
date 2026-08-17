import React, { useEffect, useMemo, useState } from 'react';
import { Users, Plus, Trash2, Edit2, Search, Loader2, AlertCircle, X, Save } from 'lucide-react';
import { useLang } from '../../src/context/LanguageContext';
import { tx } from '../../lib/i18n';

/** Client de l'atelier. Reflet exact de la table `st_clients`. */
export interface AtelierClient {
    id: string;
    nom: string;
    /** GROS = revendeur au carton · DETAIL = client final · BOUTIQUE = point de vente. */
    type: 'GROS' | 'DETAIL' | 'BOUTIQUE';
    ice?: string | null;
    rc?: string | null;
    tel?: string | null;
    email?: string | null;
    adresse?: string | null;
    ville?: string | null;
    notes?: string | null;
}

const EMPTY: AtelierClient = { id: '', nom: '', type: 'DETAIL' };

/** Normalisation pour la recherche : ni la casse, ni les accents, ni les espaces
 *  multiples ne doivent faire disparaître un client de la liste. */
const norm = (s: any) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');

interface ClientsPanelProps {
    /** Notifie le parent après tout changement, pour rafraîchir les listes de
     *  sélection ailleurs (sortie de stock, facture de vente). */
    onChanged?: (clients: AtelierClient[]) => void;
}

/**
 * Registre des clients de l'atelier.
 *
 * Les factures de vente demandaient jusqu'ici de retaper le nom, l'ICE et le RC
 * du client à chaque sortie : même client écrit de trois façons, ICE parfois
 * oublié, aucun historique. Ici la fiche est saisie UNE fois et réutilisée.
 */
const ClientsPanel: React.FC<ClientsPanelProps> = ({ onChanged }) => {
    const { lang } = useLang();
    const [clients, setClients] = useState<AtelierClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [form, setForm] = useState<AtelierClient | null>(null);
    const [saving, setSaving] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<AtelierClient | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/subcontract/clients', { credentials: 'include' });
            if (!res.ok) throw new Error();
            const data = await res.json();
            const list = Array.isArray(data) ? data : [];
            setClients(list);
            onChanged?.(list);
        } catch {
            setError(tx(lang, { fr: 'Impossible de charger les clients.', ar: 'تعذّر تحميل الزبناء.', en: 'Could not load clients.', es: 'No se pudieron cargar los clientes.', pt: 'Não foi possível carregar os clientes.', tr: 'Müşteriler yüklenemedi.' }));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const filtered = useMemo(() => {
        const q = norm(search);
        if (!q) return clients;
        return clients.filter(c =>
            norm(c.nom).includes(q) || norm(c.ice).includes(q) || norm(c.rc).includes(q)
            || norm(c.tel).includes(q) || norm(c.ville).includes(q)
        );
    }, [clients, search]);

    const save = async () => {
        if (!form || !form.nom.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/subcontract/clients', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            if (!res.ok) throw new Error();
            setForm(null);
            await load();
        } catch {
            setError(tx(lang, { fr: "L'enregistrement a échoué.", ar: 'فشل الحفظ.', en: 'Saving failed.', es: 'Error al guardar.', pt: 'Falha ao guardar.', tr: 'Kaydetme başarısız.' }));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (c: AtelierClient) => {
        setSaving(true);
        try {
            await fetch(`/api/subcontract/clients/${c.id}`, { method: 'DELETE', credentials: 'include' });
            await load();
        } catch {
            setError(tx(lang, { fr: 'La suppression a échoué.', ar: 'فشل الحذف.', en: 'Deletion failed.', es: 'Error al eliminar.', pt: 'Falha ao eliminar.', tr: 'Silme başarısız.' }));
        } finally {
            setSaving(false);
            setPendingDelete(null);
        }
    };

    const typeLabel = (t: AtelierClient['type']) =>
        t === 'GROS' ? tx(lang, { fr: 'Gros', ar: 'الجملة', en: 'Wholesale', es: 'Mayorista', pt: 'Grosso', tr: 'Toptan' })
            : t === 'BOUTIQUE' ? tx(lang, { fr: 'Boutique', ar: 'محلّ', en: 'Store', es: 'Tienda', pt: 'Loja', tr: 'Mağaza' })
                : tx(lang, { fr: 'Détail', ar: 'التقسيط', en: 'Retail', es: 'Detalle', pt: 'Retalho', tr: 'Perakende' });

    const typeChip = (t: AtelierClient['type']) =>
        t === 'GROS' ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50'
            : t === 'BOUTIQUE' ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'
                : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50';

    const field = 'w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white dark:focus:bg-dk-surface';
    const label = 'block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1';

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 dark:text-dk-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={tx(lang, { fr: 'Rechercher un client (nom, ICE, RC, tél, ville)…', ar: 'بحث عن زبون (الاسم، ICE، RC، الهاتف، المدينة)…', en: 'Search a client (name, ICE, RC, phone, city)…', es: 'Buscar un cliente (nombre, ICE, RC, tel., ciudad)…', pt: 'Procurar um cliente (nome, ICE, RC, tel., cidade)…', tr: 'Müşteri ara (ad, ICE, RC, tel, şehir)…' })}
                        className={`${field} pl-9`}
                    />
                </div>
                <button
                    type="button"
                    onClick={() => setForm({ ...EMPTY })}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 dark:bg-dk-accent text-white font-bold text-[11px] hover:bg-indigo-700 transition-colors shrink-0"
                >
                    <Plus className="w-3.5 h-3.5" />
                    {tx(lang, { fr: 'Nouveau client', ar: 'زبون جديد', en: 'New client', es: 'Nuevo cliente', pt: 'Novo cliente', tr: 'Yeni müşteri' })}
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span className="text-[10px] font-semibold">{error}</span>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-slate-400 dark:text-dk-muted text-[11px] font-semibold py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{tx(lang, { fr: 'Chargement…', ar: 'جارٍ التحميل…', en: 'Loading…', es: 'Cargando…', pt: 'A carregar…', tr: 'Yükleniyor…' })}</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-200 dark:border-dk-border rounded-2xl">
                    <Users className="w-8 h-8 text-slate-300 dark:text-dk-muted mx-auto mb-2" />
                    <p className="text-[11px] font-semibold text-slate-400 dark:text-dk-muted">
                        {clients.length === 0
                            ? tx(lang, { fr: 'Aucun client enregistré.', ar: 'ما كاين حتى زبون مسجّل.', en: 'No client recorded.', es: 'Ningún cliente registrado.', pt: 'Nenhum cliente registado.', tr: 'Kayıtlı müşteri yok.' })
                            : tx(lang, { fr: 'Aucun client ne correspond à cette recherche.', ar: 'ما كاين حتى زبون مطابق لهاد البحث.', en: 'No client matches this search.', es: 'Ningún cliente coincide con esta búsqueda.', pt: 'Nenhum cliente corresponde a esta pesquisa.', tr: 'Bu aramaya uyan müşteri yok.' })}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filtered.map(c => (
                        <div key={c.id} className="bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-2xl p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-800 dark:text-dk-text truncate">{c.nom}</p>
                                    <span className={`inline-block mt-1 px-2 py-0.5 rounded border text-[9px] font-bold ${typeChip(c.type)}`}>
                                        {typeLabel(c.type)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setForm(c)}
                                        title={tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' })}
                                        className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent hover:bg-indigo-50 dark:hover:bg-dk-accent/20 transition-colors"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPendingDelete(c)}
                                        title={tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Eliminar', tr: 'Sil' })}
                                        className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-dk-muted space-y-0.5">
                                <p>{[c.ice && `ICE : ${c.ice}`, c.rc && `RC : ${c.rc}`].filter(Boolean).join(' · ') || '—'}</p>
                                <p>{[c.tel, c.ville].filter(Boolean).join(' · ') || '—'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Fiche client — création et modification partagent le même formulaire. */}
            {form && (
                <div className="fixed inset-0 z-[230] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setForm(null)}>
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="px-5 h-12 border-b border-slate-100 dark:border-dk-border flex items-center justify-between sticky top-0 bg-white dark:bg-dk-surface">
                            <h3 className="text-[13px] font-bold text-slate-900 dark:text-dk-text flex items-center gap-2">
                                <Users className="w-4 h-4 text-indigo-600 dark:text-dk-accent" />
                                {form.id
                                    ? tx(lang, { fr: 'Modifier le client', ar: 'تعديل الزبون', en: 'Edit client', es: 'Editar cliente', pt: 'Editar cliente', tr: 'Müşteriyi düzenle' })
                                    : tx(lang, { fr: 'Nouveau client', ar: 'زبون جديد', en: 'New client', es: 'Nuevo cliente', pt: 'Novo cliente', tr: 'Yeni müşteri' })}
                            </h3>
                            <button onClick={() => setForm(null)} className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-3">
                            <div>
                                <label className={label}>{tx(lang, { fr: 'Nom / Raison sociale *', ar: 'الاسم / الاسم التجاري *', en: 'Name / Company *', es: 'Nombre / Razón social *', pt: 'Nome / Razão social *', tr: 'Ad / Ticari unvan *' })}</label>
                                <input type="text" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} className={field} autoFocus />
                            </div>

                            <div>
                                <label className={label}>{tx(lang, { fr: 'Type de client', ar: 'نوع الزبون', en: 'Client type', es: 'Tipo de cliente', pt: 'Tipo de cliente', tr: 'Müşteri tipi' })}</label>
                                <div className="flex flex-wrap gap-2">
                                    {(['GROS', 'DETAIL', 'BOUTIQUE'] as const).map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setForm({ ...form, type: t })}
                                            className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${
                                                form.type === t ? typeChip(t) : 'border-slate-200 dark:border-dk-border text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated'
                                            }`}
                                        >
                                            {typeLabel(t)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={label}>ICE</label>
                                    <input type="text" value={form.ice || ''} onChange={e => setForm({ ...form, ice: e.target.value })} className={field} />
                                </div>
                                <div>
                                    <label className={label}>RC</label>
                                    <input type="text" value={form.rc || ''} onChange={e => setForm({ ...form, rc: e.target.value })} className={field} />
                                </div>
                                <div>
                                    <label className={label}>{tx(lang, { fr: 'Téléphone', ar: 'الهاتف', en: 'Phone', es: 'Teléfono', pt: 'Telefone', tr: 'Telefon' })}</label>
                                    <input type="text" value={form.tel || ''} onChange={e => setForm({ ...form, tel: e.target.value })} className={field} />
                                </div>
                                <div>
                                    <label className={label}>Email</label>
                                    <input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} className={field} />
                                </div>
                                <div>
                                    <label className={label}>{tx(lang, { fr: 'Ville', ar: 'المدينة', en: 'City', es: 'Ciudad', pt: 'Cidade', tr: 'Şehir' })}</label>
                                    <input type="text" value={form.ville || ''} onChange={e => setForm({ ...form, ville: e.target.value })} className={field} />
                                </div>
                                <div>
                                    <label className={label}>{tx(lang, { fr: 'Adresse', ar: 'العنوان', en: 'Address', es: 'Dirección', pt: 'Morada', tr: 'Adres' })}</label>
                                    <input type="text" value={form.adresse || ''} onChange={e => setForm({ ...form, adresse: e.target.value })} className={field} />
                                </div>
                            </div>

                            <div>
                                <label className={label}>{tx(lang, { fr: 'Notes', ar: 'ملاحظات', en: 'Notes', es: 'Notas', pt: 'Notas', tr: 'Notlar' })}</label>
                                <textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} className={field} />
                            </div>
                        </div>

                        <div className="px-5 py-3 border-t border-slate-100 dark:border-dk-border flex justify-end gap-2 sticky bottom-0 bg-white dark:bg-dk-surface">
                            <button onClick={() => setForm(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors">
                                {tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}
                            </button>
                            <button
                                onClick={save}
                                disabled={saving || !form.nom.trim()}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 dark:bg-dk-accent text-white font-bold text-[11px] hover:bg-indigo-700 transition-colors disabled:opacity-40"
                            >
                                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                {tx(lang, { fr: 'Enregistrer', ar: 'حفظ', en: 'Save', es: 'Guardar', pt: 'Guardar', tr: 'Kaydet' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {pendingDelete && (
                <div className="fixed inset-0 z-[240] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setPendingDelete(null)}>
                    <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start gap-2.5">
                            <Trash2 className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-[13px] font-bold text-slate-800 dark:text-dk-text">
                                    {tx(lang, { fr: `Supprimer « ${pendingDelete.nom} » ?`, ar: `حذف «${pendingDelete.nom}»؟`, en: `Delete “${pendingDelete.nom}”?`, es: `¿Eliminar «${pendingDelete.nom}»?`, pt: `Eliminar “${pendingDelete.nom}”?`, tr: `“${pendingDelete.nom}” silinsin mi?` })}
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-dk-muted mt-1">
                                    {tx(lang, { fr: 'Les factures déjà émises gardent son nom : elles ne sont pas modifiées.', ar: 'الفواتير الصادرة كتحتفظ باسمو: ما كتتبدّلش.', en: 'Invoices already issued keep his name: they are not modified.', es: 'Las facturas ya emitidas conservan su nombre: no se modifican.', pt: 'As faturas já emitidas mantêm o nome: não são alteradas.', tr: 'Daha önce kesilen faturalar adını korur: değiştirilmez.' })}
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setPendingDelete(null)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text-soft font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-dk-elevated transition-colors">
                                {tx(lang, { fr: 'Annuler', ar: 'إلغاء', en: 'Cancel', es: 'Cancelar', pt: 'Cancelar', tr: 'İptal' })}
                            </button>
                            <button onClick={() => remove(pendingDelete)} disabled={saving} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold text-[11px] hover:bg-rose-700 transition-colors disabled:opacity-40">
                                {tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Eliminar', tr: 'Sil' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClientsPanel;
