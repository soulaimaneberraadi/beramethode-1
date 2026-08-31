import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Users, Plus, Trash2, Edit2, Eye, Search, Loader2, AlertCircle, Save, Download, FileText , ArrowLeft} from 'lucide-react';
import { useLang } from '../../src/context/LanguageContext';
import { tx } from '../../lib/i18n';
import { retourEncours } from '../ventes/naviguerTiers';
import { fmt } from '../../app/constants';
import SheetModal from '../shared/SheetModal';

/** Client de l'atelier. Reflet exact de la table `st_clients`. */
export type TiersRole = 'CLIENT' | 'FOURNISSEUR' | 'LES_DEUX';

export interface AtelierClient {
    id: string;
    nom: string;
    /** GROS = revendeur au carton · DETAIL = client final · BOUTIQUE = point de vente. */
    type: 'GROS' | 'DETAIL' | 'BOUTIQUE';
    /** SENS de la relation. Le même atelier nous achète des pièces et nous vend
     *  du tissu : deux registres séparés obligeaient à ressaisir la même ICE et
     *  empêchaient de répondre à « où en est-on avec eux ? ». Absent = CLIENT,
     *  pour que les fiches d'avant gardent leur sens. */
    role?: TiersRole;
    ice?: string | null;
    rc?: string | null;
    tel?: string | null;
    email?: string | null;
    adresse?: string | null;
    ville?: string | null;
    notes?: string | null;
    /** Logo / photo du client (data-URL), pour le reconnaître d'un coup d'œil
     *  dans la liste et sur les documents commerciaux. */
    photo?: string | null;
    /** Pièce jointe recto/verso (data-URL, image ou PDF) : document officiel du
     *  client (CIN, RC, contrat…) — même usage que la fiche sous-traitant. */
    docRecto?: string | null;
    docVerso?: string | null;
}

const EMPTY: AtelierClient = { id: '', nom: '', type: 'DETAIL', role: 'CLIENT' };

/** Redimensionne et compresse une image côté client avant stockage en data-URL.
 *  Une photo de téléphone brute (souvent 20-30 Mo en base64) dépasse la limite
 *  de taille du serveur et l'enregistrement échoue sans message clair — mieux
 *  vaut ne jamais lui envoyer un fichier aussi lourd pour un simple avatar. */
const compressPhoto = (file: File, maxDim = 640, quality = 0.85): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
        const src = typeof reader.result === 'string' ? reader.result : '';
        if (!src) { reject(new Error('read')); return; }
        const img = new Image();
        img.onerror = () => reject(new Error('decode'));
        img.onload = () => {
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
                const ratio = Math.min(maxDim / width, maxDim / height);
                width = Math.max(1, Math.round(width * ratio));
                height = Math.max(1, Math.round(height * ratio));
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(src); return; }
            ctx.drawImage(img, 0, 0, width, height);
            const keepAlpha = /image\/(png|webp|gif)/.test(file.type);
            resolve(keepAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', quality));
        };
        img.src = src;
    };
    reader.readAsDataURL(file);
});

/** Lit un fichier (image ou PDF) tel quel, en gardant son nom d'origine dans la
 *  data-URL (`data:<mime>;name=<nom>;base64,...`) : contrairement à la photo,
 *  un document officiel ne doit jamais perdre en qualité, et son téléchargement
 *  doit restituer le fichier exact qui a été déposé. */
const readDocumentFile = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
        const raw = typeof reader.result === 'string' ? reader.result : '';
        if (!raw) { reject(new Error('read')); return; }
        const sep = raw.indexOf(',');
        const meta = raw.slice(0, sep);
        const withName = meta.includes(';name=')
            ? raw
            : `${meta.replace(';base64', `;name=${encodeURIComponent(file.name)};base64`)}${raw.slice(sep)}`;
        resolve(withName);
    };
    reader.readAsDataURL(file);
});

/** Nom d'origine encodé dans la data-URL, s'il est présent. */
const originalFileName = (dataUrl: string): string | null => {
    const meta = dataUrl.slice(0, dataUrl.indexOf(','));
    const match = meta.match(/;name=([^;]*)/);
    if (!match) return null;
    try { return decodeURIComponent(match[1]) || null; } catch { return match[1] || null; }
};

/** Normalisation pour la recherche : ni la casse, ni les accents, ni les espaces
 *  multiples ne doivent faire disparaître un client de la liste. */
const norm = (s: any) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');

interface ClientsPanelProps {
    /** Notifie le parent après tout changement, pour rafraîchir les listes de
     *  sélection ailleurs (sortie de stock, facture de vente). */
    onChanged?: (clients: AtelierClient[]) => void;
    /** Sorties de stock brutes. Un registre qui n'affiche que des coordonnées
     *  ne dit pas qui fait vivre l'atelier : sans le chiffre d'affaires, tous
     *  les clients se ressemblent, y compris ceux qui n'ont jamais rien acheté. */
    sorties?: any[];
    /** Ouvre la fiche client (agrégats + historique). */
    onOpenClient?: (client: AtelierClient) => void;
    /** Demande d'édition venue de l'extérieur (fiche client) : on rouvre LE
     *  formulaire existant plutôt que d'en dupliquer un second ailleurs. */
    editClientId?: string | null;
    onEditConsumed?: () => void;
    currency?: string;
    dateLocale?: string;
}

/**
 * Registre des clients de l'atelier.
 *
 * Les factures de vente demandaient jusqu'ici de retaper le nom, l'ICE et le RC
 * du client à chaque sortie : même client écrit de trois façons, ICE parfois
 * oublié, aucun historique. Ici la fiche est saisie UNE fois et réutilisée.
 */
const ClientsPanel: React.FC<ClientsPanelProps> = ({
    onChanged, sorties = [], onOpenClient, editClientId, onEditConsumed,
    currency = 'MAD', dateLocale = 'fr-FR',
}) => {
    const { lang } = useLang();
    const [clients, setClients] = useState<AtelierClient[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    // Le terme vient d ailleurs (une adresse cliquee dans l encours) : on le
    // pose dans la barre plutot que de filtrer en douce, pour que la liste
    // affichee soit toujours celle que le champ annonce.
    // Arrivé ici depuis l'encours : sans repère, on ne sait plus d'où l'on
    // vient ni comment y retourner.
    const [venuDeLEncours, setVenuDeLEncours] = useState(false);
    useEffect(() => {
        const poser = (e: Event) => {
            const terme = (e as CustomEvent)?.detail?.terme;
            if (typeof terme === 'string') { setSearch(terme); setVenuDeLEncours(true); }
        };
        window.addEventListener('bera:tiers-recherche', poser);
        return () => window.removeEventListener('bera:tiers-recherche', poser);
    }, []);
    /** Filtre de rôle. 'TOUS' d'abord : cacher par défaut la moitié du registre
     *  ferait croire à une fiche manquante et provoquerait un doublon. */
    const [roleFilter, setRoleFilter] = useState<'TOUS' | 'CLIENT' | 'FOURNISSEUR'>('TOUS');
    const [form, setForm] = useState<AtelierClient | null>(null);
    const [saving, setSaving] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<AtelierClient | null>(null);
    const [previewSrc, setPreviewSrc] = useState<string | null>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);

    const downloadPhoto = (dataUrl: string, filename: string) => {
        const a = document.createElement('a');
        a.href = dataUrl;
        // Restitue le fichier tel qu'il a été déposé (nom + extension) quand ce
        // nom a été conservé ; sinon `filename` sert de repli.
        a.download = originalFileName(dataUrl) || filename;
        a.click();
    };

    /** PDF : ouvert dans un nouvel onglet (pas d'aperçu inline possible).
     *  Image : loupe plein écran, comme la photo du client. */
    const openDocument = (dataUrl: string) => {
        if (dataUrl.startsWith('data:image')) { setPreviewSrc(dataUrl); return; }
        const w = window.open('', '_blank');
        if (w) w.location.href = dataUrl;
    };

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

    /** Un tiers « les deux » appartient aux deux listes : le masquer d'un côté
     *  le ferait recréer en double. */
    const roleOf = (c: AtelierClient): TiersRole => c.role || 'CLIENT';
    const matchesRole = (c: AtelierClient) =>
        roleFilter === 'TOUS' || roleOf(c) === roleFilter || roleOf(c) === 'LES_DEUX';

    const filtered = useMemo(() => {
        const q = norm(search);
        if (!q) return clients;
        // Chaque mot doit se retrouver quelque part dans la fiche, pas
        // forcément dans le même champ : « tanger-mers, Tanger » colle une
        // adresse et une ville, et ne correspondait donc à AUCUN champ pris
        // isolément — la recherche ne rendait rien alors que le client existe.
        const mots = q.split(/[\s,;]+/).filter(Boolean);
        return clients.filter(c => matchesRole(c)).filter(c => {
            const cree = String((c as any).created_at || '').slice(0, 10);
            const creeLisible = cree ? `${cree.slice(8, 10)}/${cree.slice(5, 7)}/${cree.slice(0, 4)}` : '';
            const meule = norm([c.nom, c.ice, c.rc, c.tel, c.ville, c.adresse, c.type, cree, creeLisible].filter(Boolean).join(' '));
            return mots.every(mot => meule.includes(mot));
        });
    }, [clients, search, roleFilter]);

    /** Poids commercial de chaque client, agrégé côté client depuis les sorties
     *  de stock déjà chargées par le parent. Rattachement par `client_id` quand
     *  il existe, sinon par nom normalisé : les ventes saisies avant l'existence
     *  du registre doivent rester comptées, sinon un vrai client apparaîtrait
     *  comme un prospect. */
    const salesByClient = useMemo(() => {
        const byId = new Map<string, { ca: number; pieces: number; last: string }>();
        const byNom = new Map<string, { ca: number; pieces: number; last: string }>();
        sorties.forEach(s => {
            const q = Number(s.quantite) || 0;
            const montant = q * (Number(s.prix_unitaire) || 0);
            const date = String(s.date_sortie || '');
            const push = (map: Map<string, { ca: number; pieces: number; last: string }>, key: string) => {
                if (!key) return;
                const row = map.get(key) || { ca: 0, pieces: 0, last: '' };
                row.ca += montant;
                row.pieces += q;
                if (date > row.last) row.last = date;
                map.set(key, row);
            };
            if (s.client_id) push(byId, String(s.client_id));
            push(byNom, norm(s.client_nom));
        });
        return (c: AtelierClient) => byId.get(String(c.id)) || byNom.get(norm(c.nom)) || { ca: 0, pieces: 0, last: '' };
    }, [sorties]);

    /** Une demande d'édition venue de la fiche client rouvre ce formulaire dès
     *  que le registre est chargé — puis se consomme pour ne pas se rejouer. */
    useEffect(() => {
        if (!editClientId || clients.length === 0) return;
        const target = clients.find(c => String(c.id) === String(editClientId));
        if (target) setForm(target);
        onEditConsumed?.();
    }, [editClientId, clients]);

    const fmtDay = (raw: string) => {
        if (!raw) return '—';
        const d = new Date(raw);
        return isNaN(d.getTime()) ? raw : d.toLocaleDateString(dateLocale);
    };

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
            if (!res.ok) throw new Error(res.status === 413 ? 'TOO_LARGE' : String(res.status));
            setForm(null);
            await load();
        } catch (e: any) {
            setError(e?.message === 'TOO_LARGE'
                ? tx(lang, { fr: "La photo est trop lourde même après compression. Réessayez avec une autre image.", ar: 'الصورة ثقيلة بزاف حتى بعد الضغط. جرّب صورة أخرى.', en: 'The photo is too heavy even after compression. Try another image.', es: 'La foto sigue siendo demasiado pesada tras la compresión. Pruebe con otra imagen.', pt: 'A foto continua demasiado pesada mesmo após compressão. Tente outra imagem.', tr: 'Sıkıştırmadan sonra bile fotoğraf çok büyük. Başka bir görsel deneyin.' })
                : tx(lang, { fr: "L'enregistrement a échoué.", ar: 'فشل الحفظ.', en: 'Saving failed.', es: 'Error al guardar.', pt: 'Falha ao guardar.', tr: 'Kaydetme başarısız.' }));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (c: AtelierClient) => {
        setSaving(true);
        try {
            await fetch(`/api/subcontract/clients/${c.id}`, { method: 'DELETE', credentials: 'include' });
            await load();
            // Le formulaire d'édition pointait sur cette fiche : elle n'existe
            // plus, il doit se fermer avec elle, sinon "Enregistrer" ressusciterait
            // un client déjà supprimé.
            setForm(f => (f && f.id === c.id ? null : f));
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

    const roleLabel = (r: TiersRole) =>
        r === 'FOURNISSEUR' ? tx(lang, { fr: 'Fournisseur', ar: 'مورّد', en: 'Supplier', es: 'Proveedor', pt: 'Fornecedor', tr: 'Tedarikçi' })
            : r === 'LES_DEUX' ? tx(lang, { fr: 'Client et fournisseur', ar: 'زبون ومورّد', en: 'Client and supplier', es: 'Cliente y proveedor', pt: 'Cliente e fornecedor', tr: 'Müşteri ve tedarikçi' })
                : tx(lang, { fr: 'Client', ar: 'زبون', en: 'Client', es: 'Cliente', pt: 'Cliente', tr: 'Müşteri' });

    const roleChip = (r: TiersRole) =>
        r === 'FOURNISSEUR' ? 'bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-800/50'
            : r === 'LES_DEUX' ? 'bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800/50'
                : 'bg-slate-50 dark:bg-dk-bg text-slate-600 dark:text-dk-text-soft border-slate-200 dark:border-dk-border';

    const field = 'w-full bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-3 py-2 text-[12px] text-slate-800 dark:text-dk-text outline-none focus:border-indigo-500 dark:focus:border-dk-accent focus:bg-white dark:focus:bg-dk-surface';
    const label = 'block font-bold text-slate-400 dark:text-dk-muted uppercase tracking-widest text-[9px] mb-1';

    return (
        <div className="space-y-4">
            {/* Le chemin du retour. Une navigation qui ne se rembobine pas est
                un cul-de-sac : venu de l'encours par une adresse, il fallait
                refaire tout le trajet a la main pour y revenir. */}
            {venuDeLEncours && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2">
                    <button
                        type="button"
                        onClick={() => { setVenuDeLEncours(false); setSearch(''); retourEncours(); }}
                        className="h-8 px-2.5 rounded-lg text-[11px] font-black inline-flex items-center gap-1.5 bg-slate-900 dark:bg-dk-accent text-white"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        {tx(lang, { fr: 'Retour a l’encours', ar: 'رجوع إلى الذمّة', en: 'Back to receivables', es: 'Volver a los saldos', pt: 'Voltar aos saldos', tr: 'Alacaklara don' })}
                    </button>
                    <span className="text-[11px] text-slate-500 dark:text-dk-muted">
                        {tx(lang, { fr: 'Filtre', ar: 'تصفية', en: 'Filter', es: 'Filtro', pt: 'Filtro', tr: 'Filtre' })} : <b>{search}</b> · {filtered.length}
                    </span>
                    <button
                        type="button"
                        onClick={() => { setVenuDeLEncours(false); setSearch(''); }}
                        className="ml-auto h-8 px-2.5 rounded-lg text-[11px] font-bold text-slate-500 dark:text-dk-muted border border-slate-200 dark:border-dk-border"
                    >
                        {tx(lang, { fr: 'Tout voir', ar: 'عرض الكلّ', en: 'Show all', es: 'Ver todo', pt: 'Ver tudo', tr: 'Tumunu gor' })}
                    </button>
                </div>
            )}

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
                {/* Filtre de sens. « Tous » d'abord : masquer la moitie du
                    registre par defaut ferait croire a une fiche manquante et
                    ferait creer un doublon. */}
                <div className="inline-flex rounded-xl border border-slate-200 dark:border-dk-border overflow-hidden shrink-0">
                    {([
                        { id: 'TOUS', label: tx(lang, { fr: 'Tous', ar: 'الكل', en: 'All', es: 'Todos', pt: 'Todos', tr: 'Tümü' }) },
                        { id: 'CLIENT', label: tx(lang, { fr: 'Clients', ar: 'الزبناء', en: 'Clients', es: 'Clientes', pt: 'Clientes', tr: 'Müşteriler' }) },
                        { id: 'FOURNISSEUR', label: tx(lang, { fr: 'Fournisseurs', ar: 'الموردون', en: 'Suppliers', es: 'Proveedores', pt: 'Fornecedores', tr: 'Tedarikçiler' }) },
                    ] as const).map((o, i) => (
                        <button
                            key={o.id}
                            type="button"
                            onClick={() => setRoleFilter(o.id)}
                            className={`px-3 py-2 text-[11px] font-bold transition-colors ${i > 0 ? 'border-l border-slate-200 dark:border-dk-border' : ''} ${
                                roleFilter === o.id
                                    ? 'bg-slate-800 dark:bg-dk-accent text-white'
                                    : 'bg-white dark:bg-dk-surface text-slate-500 dark:text-dk-muted hover:bg-slate-50 dark:hover:bg-dk-elevated'
                            }`}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => setForm({ ...EMPTY, role: roleFilter === 'FOURNISSEUR' ? 'FOURNISSEUR' : 'CLIENT' })}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 dark:bg-dk-accent text-white font-bold text-[11px] hover:bg-indigo-700 transition-colors shrink-0"
                >
                    <Plus className="w-3.5 h-3.5" />
                    {roleFilter === 'FOURNISSEUR'
                        ? tx(lang, { fr: 'Nouveau fournisseur', ar: 'مورّد جديد', en: 'New supplier', es: 'Nuevo proveedor', pt: 'Novo fornecedor', tr: 'Yeni tedarikçi' })
                        : tx(lang, { fr: 'Nouveau client', ar: 'زبون جديد', en: 'New client', es: 'Nuevo cliente', pt: 'Novo cliente', tr: 'Yeni müşteri' })}
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
                    {filtered.map(c => {
                    // Un prospect n'est pas un client : le distinguer visuellement
                    // évite de croire que le carnet d'adresses est un portefeuille.
                    const sales = salesByClient(c);
                    const isProspect = sales.pieces === 0 && sales.ca === 0;
                    return (
                        <div
                            key={c.id}
                            onClick={onOpenClient ? () => onOpenClient(c) : undefined}
                            className={isProspect
                                ? 'bg-slate-50/70 dark:bg-dk-bg/40 border border-dashed border-slate-200 dark:border-dk-border rounded-2xl p-4 space-y-2 cursor-pointer hover:border-slate-300 dark:hover:border-dk-border transition-all'
                                : 'bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-2xl p-4 space-y-2 cursor-pointer hover:border-indigo-300 dark:hover:border-dk-accent hover:shadow-md hover:-translate-y-0.5 transition-all'}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5 min-w-0">
                                    {c.photo ? (
                                        <img src={c.photo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 dark:border-dk-border" />
                                    ) : (
                                        <div className={isProspect
                                            ? 'w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-[12px] bg-slate-100 dark:bg-dk-elevated text-slate-400 dark:text-dk-muted'
                                            : 'w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-[12px] bg-indigo-50 dark:bg-dk-accent/15 text-indigo-600 dark:text-dk-accent'}>
                                            {c.nom.trim().slice(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <div className="min-w-0 pt-0.5">
                                        <p className={isProspect
                                            ? 'font-bold text-slate-500 dark:text-dk-muted truncate'
                                            : 'font-bold text-slate-800 dark:text-dk-text truncate hover:text-indigo-600 dark:hover:text-dk-accent transition-colors'}>{c.nom}</p>
                                        <div className="flex flex-wrap items-center gap-1 mt-1">
                                            {/* Le SENS d'abord : savoir si on lui vend ou s'il
                                                nous vend prime sur son segment tarifaire. */}
                                            {roleOf(c) !== 'CLIENT' && (
                                                <span className={`inline-block px-2 py-0.5 rounded border text-[9px] font-bold ${roleChip(roleOf(c))}`}>
                                                    {roleLabel(roleOf(c))}
                                                </span>
                                            )}
                                            {/* Le segment tarifaire ne veut rien dire pour un
                                                pur fournisseur : on ne lui vend pas. */}
                                            {roleOf(c) !== 'FOURNISSEUR' && (
                                                <span className={`inline-block px-2 py-0.5 rounded border text-[9px] font-bold ${typeChip(c.type)}`}>
                                                    {typeLabel(c.type)}
                                                </span>
                                            )}
                                            {isProspect && roleOf(c) !== 'FOURNISSEUR' && (
                                                <span className="inline-block px-2 py-0.5 rounded border text-[9px] font-bold bg-slate-100 dark:bg-dk-elevated text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border">
                                                    {tx(lang, { fr: 'Prospect', ar: 'زبون محتمل', en: 'Prospect', es: 'Prospecto', pt: 'Potencial', tr: 'Aday' })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {onOpenClient && (
                                        <button
                                            type="button"
                                            onClick={e => { e.stopPropagation(); onOpenClient(c); }}
                                            title={tx(lang, { fr: 'Ouvrir la fiche', ar: 'فتح البطاقة', en: 'Open sheet', es: 'Abrir ficha', pt: 'Abrir ficha', tr: 'Kartı aç' })}
                                            className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent hover:bg-indigo-50 dark:hover:bg-dk-accent/20 transition-colors"
                                        >
                                            <Eye className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); setForm(c); }}
                                        title={tx(lang, { fr: 'Modifier', ar: 'تعديل', en: 'Edit', es: 'Editar', pt: 'Editar', tr: 'Düzenle' })}
                                        className="p-1.5 rounded-lg text-slate-400 dark:text-dk-muted hover:text-indigo-600 dark:hover:text-dk-accent hover:bg-indigo-50 dark:hover:bg-dk-accent/20 transition-colors"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-dk-muted space-y-0.5">
                                <p>{[c.ice && `ICE : ${c.ice}`, c.rc && `RC : ${c.rc}`].filter(Boolean).join(' · ') || '—'}</p>
                                <p>{[c.tel, c.ville].filter(Boolean).join(' · ') || '—'}</p>
                            </div>

                            {/* Poids commercial : CA, pièces, dernier achat. */}
                            <div className="grid grid-cols-3 gap-1.5 pt-2 mt-1 border-t border-slate-100 dark:border-dk-border">
                                <div>
                                    <span className="block text-[8px] uppercase tracking-wide text-slate-400 dark:text-dk-muted font-bold">CA</span>
                                    <span className={isProspect
                                        ? 'block text-[11px] font-bold text-slate-400 dark:text-dk-muted'
                                        : 'block text-[11px] font-bold text-indigo-600 dark:text-dk-accent'}>
                                        {sales.ca > 0 ? `${fmt(sales.ca)} ${currency}` : '—'}
                                    </span>
                                </div>
                                <div>
                                    <span className="block text-[8px] uppercase tracking-wide text-slate-400 dark:text-dk-muted font-bold">
                                        {tx(lang, { fr: 'Pièces', ar: 'القطع', en: 'Pieces', es: 'Piezas', pt: 'Peças', tr: 'Parça' })}
                                    </span>
                                    <span className={isProspect
                                        ? 'block text-[11px] font-bold text-slate-400 dark:text-dk-muted'
                                        : 'block text-[11px] font-bold text-slate-800 dark:text-dk-text'}>
                                        {sales.pieces > 0 ? sales.pieces.toLocaleString(dateLocale) : '—'}
                                    </span>
                                </div>
                                <div>
                                    <span className="block text-[8px] uppercase tracking-wide text-slate-400 dark:text-dk-muted font-bold">
                                        {tx(lang, { fr: 'Dernier achat', ar: 'آخر شراء', en: 'Last purchase', es: 'Última compra', pt: 'Última compra', tr: 'Son alım' })}
                                    </span>
                                    <span className="block text-[11px] font-semibold text-slate-600 dark:text-dk-text-soft">{fmtDay(sales.last)}</span>
                                </div>
                            </div>
                        </div>
                    );
                    })}
                </div>
            )}

            {/* Fiche client — création et modification partagent le même formulaire. */}
            {form && (
                <SheetModal
                    onClose={() => setForm(null)}
                    title={form.id
                        ? tx(lang, { fr: 'Modifier le client', ar: 'تعديل الزبون', en: 'Edit client', es: 'Editar cliente', pt: 'Editar cliente', tr: 'Müşteriyi düzenle' })
                        : tx(lang, { fr: 'Nouveau client', ar: 'زبون جديد', en: 'New client', es: 'Nuevo cliente', pt: 'Novo cliente', tr: 'Yeni müşteri' })}
                    icon={<Users className="w-4 h-4 text-indigo-600 dark:text-dk-accent shrink-0" />}
                    size="lg"
                    zClass="z-[230]"
                    closeOnBackdrop
                    bare
                >
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <div className="p-5 space-y-3">
                            <div className="flex items-center gap-3">
                                {form.photo ? (
                                    <img src={form.photo} alt="" className="w-14 h-14 rounded-xl object-cover border border-slate-200 dark:border-dk-border shrink-0" />
                                ) : (
                                    <div className="w-14 h-14 rounded-xl bg-slate-100 dark:bg-dk-elevated border border-dashed border-slate-300 dark:border-dk-border flex items-center justify-center shrink-0">
                                        <Users className="w-5 h-5 text-slate-400 dark:text-dk-muted" />
                                    </div>
                                )}
                                <input
                                    ref={photoInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={e => {
                                        const file = e.target.files?.[0];
                                        e.target.value = '';
                                        if (!file) return;
                                        compressPhoto(file)
                                            .then(dataUrl => setForm(f => f && { ...f, photo: dataUrl }))
                                            .catch(() => setError(tx(lang, { fr: "Impossible de lire l'image.", ar: 'تعذّر قراءة الصورة.', en: 'Could not read the image.', es: 'No se pudo leer la imagen.', pt: 'Não foi possível ler a imagem.', tr: 'Resim okunamadı.' })));
                                    }}
                                />
                                <div className="flex items-center gap-0.5">
                                    {form.photo && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => setPreviewSrc(form.photo!)}
                                                title={tx(lang, { fr: 'Voir en grand', ar: 'عرض بحجم كبير', en: 'View full size', es: 'Ver en grande', pt: 'Ver ampliado', tr: 'Büyük görüntüle' })}
                                                className="p-1 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:hover:text-dk-accent transition-colors"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => downloadPhoto(form.photo!, `photo-${form.nom || 'client'}.jpg`)}
                                                title={tx(lang, { fr: 'Télécharger', ar: 'تنزيل', en: 'Download', es: 'Descargar', pt: 'Descarregar', tr: 'İndir' })}
                                                className="p-1 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:hover:text-dk-accent transition-colors"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                            </button>
                                        </>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => photoInputRef.current?.click()}
                                        title={tx(lang, { fr: 'Changer', ar: 'تغيير', en: 'Change', es: 'Cambiar', pt: 'Alterar', tr: 'Değiştir' })}
                                        className="p-1 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:hover:text-dk-accent transition-colors"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    {form.photo && (
                                        <button
                                            type="button"
                                            onClick={() => setForm({ ...form, photo: '' })}
                                            title={tx(lang, { fr: 'Retirer', ar: 'إزالة', en: 'Remove', es: 'Quitar', pt: 'Remover', tr: 'Kaldır' })}
                                            className="p-1 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Document(s) — CIN, RC ou contrat, recto/verso. Deux
                                emplacements, comme sur la fiche sous-traitant : un client
                                n'a pas toujours besoin des deux, mais quand il en a besoin,
                                les deux faces doivent pouvoir vivre côte à côte. */}
                            <div className="space-y-1.5">
                                <label className={label}>{tx(lang, { fr: 'Document (recto / verso)', ar: 'وثيقة (وجه / ظهر)', en: 'Document (front / back)', es: 'Documento (anverso / reverso)', pt: 'Documento (frente / verso)', tr: 'Belge (ön / arka)' })}</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {([
                                        { key: 'docRecto' as const, label: tx(lang, { fr: 'Recto', ar: 'الوجه', en: 'Front', es: 'Anverso', pt: 'Frente', tr: 'Ön' }) },
                                        { key: 'docVerso' as const, label: tx(lang, { fr: 'Verso', ar: 'الظهر', en: 'Back', es: 'Reverso', pt: 'Verso', tr: 'Arka' }) },
                                    ]).map(slot => {
                                        const value = form[slot.key];
                                        return (
                                            <div key={slot.key} className="space-y-1.5">
                                                {value ? (
                                                    <button type="button" onClick={() => openDocument(value)} className="w-full block text-left">
                                                        {value.startsWith('data:image') ? (
                                                            <img src={value} alt={slot.label} className="w-full h-14 object-cover rounded-xl border border-slate-200 dark:border-dk-border" />
                                                        ) : (
                                                            <div className="w-full h-14 rounded-xl border border-slate-200 dark:border-dk-border bg-slate-50 dark:bg-dk-bg flex flex-col items-center justify-center gap-1">
                                                                <FileText className="w-5 h-5 text-slate-400 dark:text-dk-muted" />
                                                                <span className="text-[9px] text-slate-400 dark:text-dk-muted px-1.5 text-center break-all line-clamp-2" title={originalFileName(value) || undefined}>
                                                                    {originalFileName(value) || `PDF · ${slot.label}`}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </button>
                                                ) : (
                                                    <label className="cursor-pointer block">
                                                        <div className="w-full h-14 rounded-xl border border-dashed border-slate-300 dark:border-dk-border bg-slate-50 dark:bg-dk-bg flex flex-col items-center justify-center gap-1 hover:border-indigo-400 dark:hover:border-dk-accent transition-colors">
                                                            <Plus className="w-4 h-4 text-slate-400 dark:text-dk-muted" />
                                                            <span className="text-[9px] font-bold text-slate-400 dark:text-dk-muted uppercase">{slot.label}</span>
                                                        </div>
                                                        <input
                                                            type="file"
                                                            accept="image/*,application/pdf"
                                                            className="hidden"
                                                            onChange={e => {
                                                                const file = e.target.files?.[0];
                                                                e.target.value = '';
                                                                if (!file) return;
                                                                readDocumentFile(file)
                                                                    .then(dataUrl => setForm(f => f && { ...f, [slot.key]: dataUrl }))
                                                                    .catch(() => setError(tx(lang, { fr: 'Impossible de lire le fichier.', ar: 'تعذّر قراءة الملف.', en: 'Could not read the file.', es: 'No se pudo leer el archivo.', pt: 'Não foi possível ler o ficheiro.', tr: 'Dosya okunamadı.' })));
                                                            }}
                                                        />
                                                    </label>
                                                )}

                                                {value && (
                                                    <div className="flex items-center justify-center gap-1">
                                                        <button type="button" onClick={() => openDocument(value)} title={tx(lang, { fr: 'Ouvrir', ar: 'فتح', en: 'Open', es: 'Abrir', pt: 'Abrir', tr: 'Aç' })} className="p-1 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:hover:text-dk-accent transition-colors">
                                                            <Eye className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button type="button" onClick={() => downloadPhoto(value, `${slot.label}-${form.nom || 'client'}`)} title={tx(lang, { fr: 'Télécharger', ar: 'تنزيل', en: 'Download', es: 'Descargar', pt: 'Descarregar', tr: 'İndir' })} className="p-1 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:hover:text-dk-accent transition-colors">
                                                            <Download className="w-3.5 h-3.5" />
                                                        </button>
                                                        <label className="p-1 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-slate-100 dark:hover:bg-dk-elevated hover:text-indigo-600 dark:hover:text-dk-accent transition-colors cursor-pointer" title={tx(lang, { fr: 'Remplacer', ar: 'استبدال', en: 'Replace', es: 'Reemplazar', pt: 'Substituir', tr: 'Değiştir' })}>
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                            <input
                                                                type="file"
                                                                accept="image/*,application/pdf"
                                                                className="hidden"
                                                                onChange={e => {
                                                                    const file = e.target.files?.[0];
                                                                    e.target.value = '';
                                                                    if (!file) return;
                                                                    readDocumentFile(file)
                                                                        .then(dataUrl => setForm(f => f && { ...f, [slot.key]: dataUrl }))
                                                                        .catch(() => setError(tx(lang, { fr: 'Impossible de lire le fichier.', ar: 'تعذّر قراءة الملف.', en: 'Could not read the file.', es: 'No se pudo leer el archivo.', pt: 'Não foi possível ler o ficheiro.', tr: 'Dosya okunamadı.' })));
                                                                }}
                                                            />
                                                        </label>
                                                        <button type="button" onClick={() => setForm(f => f && { ...f, [slot.key]: '' })} title={tx(lang, { fr: 'Retirer', ar: 'إزالة', en: 'Remove', es: 'Quitar', pt: 'Remover', tr: 'Kaldır' })} className="p-1 rounded-lg text-slate-500 dark:text-dk-muted hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:text-rose-600 dark:hover:text-rose-400 transition-colors">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <label className={label}>{tx(lang, { fr: 'Nom / Raison sociale *', ar: 'الاسم / الاسم التجاري *', en: 'Name / Company *', es: 'Nombre / Razón social *', pt: 'Nome / Razão social *', tr: 'Ad / Ticari unvan *' })}</label>
                                <input type="text" value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} className={field} autoFocus />
                            </div>

                            <div>
                                <label className={label}>{tx(lang, { fr: 'Sens de la relation', ar: 'نوع العلاقة', en: 'Relationship', es: 'Sentido de la relación', pt: 'Sentido da relação', tr: 'İlişki yönü' })}</label>
                                <div className="flex flex-wrap gap-2">
                                    {([
                                        { id: 'CLIENT', label: tx(lang, { fr: 'Il nous achète', ar: 'كيشري مننا', en: 'They buy from us', es: 'Nos compra', pt: 'Compra-nos', tr: 'Bizden alır' }) },
                                        { id: 'FOURNISSEUR', label: tx(lang, { fr: 'Il nous vend', ar: 'كيبيع لينا', en: 'They sell to us', es: 'Nos vende', pt: 'Vende-nos', tr: 'Bize satar' }) },
                                        { id: 'LES_DEUX', label: tx(lang, { fr: 'Les deux', ar: 'بجوج', en: 'Both', es: 'Ambos', pt: 'Ambos', tr: 'İkisi de' }) },
                                    ] as const).map(r => (
                                        <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => setForm({ ...form, role: r.id })}
                                            className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold transition-colors ${
                                                (form.role || 'CLIENT') === r.id
                                                    ? 'bg-slate-800 dark:bg-dk-accent text-white border-slate-800 dark:border-dk-accent'
                                                    : 'bg-white dark:bg-dk-bg text-slate-500 dark:text-dk-muted border-slate-200 dark:border-dk-border hover:border-slate-400 dark:hover:border-dk-accent/40'
                                            }`}
                                        >
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="mt-1 text-[10px] text-slate-400 dark:text-dk-muted leading-snug">
                                    {tx(lang, { fr: 'Une même entreprise peut faire les deux : une seule fiche, un seul historique.', ar: 'نفس الشركة تقدر تكون الجوج: بطاقة وحدة وتاريخ واحد.', en: 'One company can be both: a single sheet, a single history.', es: 'Una misma empresa puede ser ambas: una sola ficha, un solo historial.', pt: 'A mesma empresa pode ser ambas: uma ficha, um histórico.', tr: 'Aynı şirket ikisi de olabilir: tek kart, tek geçmiş.' })}
                                </p>
                            </div>

                            {/* Le segment tarifaire n'a de sens que si on lui vend. */}
                            {(form.role || 'CLIENT') !== 'FOURNISSEUR' && (
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
                            )}

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

                    </div>

                        <div className="shrink-0 px-5 py-3 border-t border-slate-100 dark:border-dk-border flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-dk-surface">
                            {form.id ? (
                                <button
                                    type="button"
                                    onClick={() => setPendingDelete(form)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 font-bold text-[11px] hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    {tx(lang, { fr: 'Supprimer', ar: 'حذف', en: 'Delete', es: 'Eliminar', pt: 'Eliminar', tr: 'Sil' })}
                                </button>
                            ) : <span />}
                            <div className="flex items-center gap-2">
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
                </SheetModal>
            )}

            {pendingDelete && (
                /* Confirmation courte : pas de plein écran. */
                <SheetModal
                    onClose={() => setPendingDelete(null)}
                    size="sm"
                    zClass="z-[240]"
                    closeOnBackdrop
                    bodyClassName="flex-1 overflow-y-auto min-h-0 p-5 space-y-4"
                >
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
                </SheetModal>
            )}

            {previewSrc && (
                /* Aperçu : l'image occupe déjà la fenêtre, pas de plein écran. */
                <SheetModal
                    onClose={() => setPreviewSrc(null)}
                    size="xl"
                    zClass="z-[250]"
                    bodyClassName="flex-1 overflow-y-auto min-h-0 p-4 flex items-center justify-center"
                >
                    <img src={previewSrc} alt="" className="max-w-full max-h-[70vh] rounded-2xl object-contain" />
                </SheetModal>
            )}
        </div>
    );
};

export default ClientsPanel;
