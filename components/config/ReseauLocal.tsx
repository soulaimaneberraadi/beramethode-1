import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { Wifi, Copy, Check, Monitor, Smartphone, Info, ChevronDown } from 'lucide-react';
import { tx } from '../../lib/i18n';
import type { Lang } from '../../app/constants';

/**
 * Trois blocs Configuration réservés à l'édition BERACOUPE (poste local en
 * réseau d'atelier, sans compte ni cloud) : « Réseau local », « Appareils
 * connectés » et « À propos ». Regroupés ici pour garder Configuration.tsx
 * lisible — chacun suit le même style de carte repliable que les autres
 * sections (`open`/`onToggle` fournis par le parent, comme BoutiqueConfigSection).
 */

interface SectionShellProps {
    icon: React.ReactNode;
    title: string;
    badge?: string;
    open: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

function SectionShell({ icon, title, badge, open, onToggle, children }: SectionShellProps) {
    return (
        <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm dark:shadow-dk-sm border border-slate-200 dark:border-dk-border overflow-hidden flex flex-col mt-6">
            <div onClick={onToggle} className={`px-5 py-4 bg-slate-50 dark:bg-dk-bg flex items-center justify-between cursor-pointer select-none ${open ? 'border-b border-slate-100 dark:border-dk-border' : ''}`}>
                <div className="flex items-center gap-2">
                    {icon}
                    <h2 className="font-bold text-slate-800 dark:text-dk-text">{title}</h2>
                    {badge && (
                        <span className="text-[10px] font-black uppercase tracking-wider bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 px-1.5 py-0.5 rounded">{badge}</span>
                    )}
                </div>
                <ChevronDown className={`w-5 h-5 text-slate-400 dark:text-dk-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </div>
            <div className={`p-6 md:p-8 space-y-4 ${open ? '' : 'hidden'}`}>
                {children}
            </div>
        </div>
    );
}

interface EditionInfo {
    edition: 'coupe';
    initialise: boolean;
    entreprise: string | null;
    port: number;
    adresses: string[];
}

/** « Réseau local » — les adresses LAN où ouvrir BERACOUPE depuis un autre poste/téléphone. */
export function ReseauLocalSection({ lang, open, onToggle }: { lang: Lang; open: boolean; onToggle: () => void }) {
    const [info, setInfo] = useState<EditionInfo | null>(null);
    const [erreur, setErreur] = useState(false);
    const [copie, setCopie] = useState<string | null>(null);

    useEffect(() => {
        if (!open || info || erreur) return;
        fetch('/api/edition', { credentials: 'include' })
            .then(r => (r.ok ? r.json() : Promise.reject()))
            .then((data: EditionInfo) => setInfo(data))
            .catch(() => setErreur(true));
    }, [open, info, erreur]);

    const copier = (url: string) => {
        try {
            navigator.clipboard?.writeText(url);
            setCopie(url);
            setTimeout(() => setCopie(prev => (prev === url ? null : prev)), 1800);
        } catch { /* copie manuelle par sélection si le presse-papiers est indisponible */ }
    };

    return (
        <SectionShell
            icon={<Wifi className="w-5 h-5 text-red-500 dark:text-red-400" />}
            title={tx(lang, { fr: 'Réseau local', ar: 'الشبكة المحلية', en: 'Local network' })}
            open={open}
            onToggle={onToggle}
        >
            <p className="text-sm text-slate-500 dark:text-dk-muted font-medium">
                {tx(lang, {
                    fr: "Les autres ordinateurs et téléphones connectés au Wi-Fi de l'entreprise peuvent ouvrir BERACOUPE dans leur navigateur avec l'une de ces adresses.",
                    ar: 'يمكن لبقية الحواسيب والهواتف المتصلة بشبكة Wi-Fi الخاصة بالشركة فتح BERACOUPE عبر متصفحها باستعمال أحد هذه العناوين.',
                    en: "Other computers and phones connected to the company's Wi-Fi can open BERACOUPE in their browser using one of these addresses.",
                })}
            </p>

            {erreur && (
                <p className="text-sm text-rose-600 dark:text-rose-400 italic">
                    {tx(lang, { fr: 'Adresses indisponibles pour le moment.', ar: 'العناوين غير متوفرة حالياً.', en: 'Addresses unavailable right now.' })}
                </p>
            )}

            {info && info.adresses.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-dk-muted italic text-center py-4 bg-slate-50 dark:bg-dk-bg rounded-lg border border-dashed border-slate-200 dark:border-dk-border">
                    {tx(lang, { fr: 'Aucune adresse réseau détectée.', ar: 'لم يتم رصد أي عنوان شبكي.', en: 'No network address detected.' })}
                </p>
            )}

            {info && info.adresses.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {info.adresses.map(url => (
                        <div key={url} className="flex items-center gap-4 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl p-4">
                            <div className="bg-white p-1.5 rounded-lg border border-slate-200 shrink-0">
                                <QRCode value={url} size={72} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-mono text-sm font-bold text-slate-800 dark:text-dk-text break-all">{url}</p>
                                <button
                                    type="button"
                                    onClick={() => copier(url)}
                                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-700 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-lg border border-red-100 dark:border-red-800 transition-colors"
                                >
                                    {copie === url ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copie === url
                                        ? tx(lang, { fr: 'Copié', ar: 'تم النسخ', en: 'Copied' })
                                        : tx(lang, { fr: 'Copier le lien', ar: 'نسخ الرابط', en: 'Copy link' })}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <p className="text-xs text-slate-400 dark:text-dk-muted flex items-start gap-1.5 pt-2 border-t border-slate-100 dark:border-dk-border">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {tx(lang, {
                    fr: "Fonctionne uniquement sur le réseau de l'entreprise — inaccessible depuis l'extérieur.",
                    ar: 'يعمل فقط داخل شبكة الشركة — لا يمكن الوصول إليه من الخارج.',
                    en: "Works only on the company's network — not reachable from outside.",
                })}
            </p>
        </SectionShell>
    );
}

interface Appareil {
    id: string;
    ip: string;
    nom: string;
    navigateur?: string;
    vuLe: string | number;
    local: boolean;
}

const ilYA = (vuLe: string | number, lang: Lang, tick: number): string => {
    void tick; // force le recalcul à chaque tic (voir setInterval ci-dessous)
    const t = typeof vuLe === 'number' ? vuLe : new Date(vuLe).getTime();
    if (!Number.isFinite(t)) return '';
    const secondes = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (secondes < 60) return tx(lang, { fr: `il y a ${secondes}s`, ar: `منذ ${secondes}ث`, en: `${secondes}s ago` });
    const minutes = Math.round(secondes / 60);
    if (minutes < 60) return tx(lang, { fr: `il y a ${minutes} min`, ar: `منذ ${minutes} د`, en: `${minutes}m ago` });
    const heures = Math.round(minutes / 60);
    return tx(lang, { fr: `il y a ${heures} h`, ar: `منذ ${heures} س`, en: `${heures}h ago` });
};

/** « Appareils connectés » — présence réseau local (`GET /api/edition/appareils`), rafraîchie toutes les 10 s. */
export function AppareilsConnectesSection({ lang, open, onToggle }: { lang: Lang; open: boolean; onToggle: () => void }) {
    const [appareils, setAppareils] = useState<Appareil[]>([]);
    const [total, setTotal] = useState(0);
    const [charge, setCharge] = useState(false);
    const [tick, setTick] = useState(0);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!open) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            return;
        }
        const charger = () => {
            fetch('/api/edition/appareils', { credentials: 'include' })
                .then(r => (r.ok ? r.json() : Promise.reject()))
                .then((data: { appareils: Appareil[]; total: number }) => {
                    setAppareils(data.appareils || []);
                    setTotal(data.total ?? (data.appareils || []).length);
                    setCharge(true);
                })
                .catch(() => setCharge(true));
        };
        charger();
        pollRef.current = setInterval(charger, 10000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [open]);

    // Fait vivre les libellés « il y a Xs » entre deux rafraîchissements réseau.
    useEffect(() => {
        if (!open) return;
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, [open]);

    return (
        <SectionShell
            icon={<Monitor className="w-5 h-5 text-red-500 dark:text-red-400" />}
            title={tx(lang, { fr: 'Appareils connectés', ar: 'الأجهزة المتصلة', en: 'Connected devices' })}
            badge={charge ? String(total) : undefined}
            open={open}
            onToggle={onToggle}
        >
            {!charge && (
                <p className="text-sm text-slate-400 dark:text-dk-muted italic">
                    {tx(lang, { fr: 'Chargement…', ar: 'جاري التحميل...', en: 'Loading…' })}
                </p>
            )}

            {charge && appareils.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-dk-muted italic text-center py-4 bg-slate-50 dark:bg-dk-bg rounded-lg border border-dashed border-slate-200 dark:border-dk-border">
                    {tx(lang, { fr: 'Aucun autre appareil détecté pour le moment.', ar: 'لم يتم رصد أي جهاز آخر حالياً.', en: 'No other device detected yet.' })}
                </p>
            )}

            {appareils.length > 0 && (
                <div className="space-y-2">
                    {appareils.map(a => (
                        <div key={a.id} className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-dk-bg border border-slate-200 dark:border-dk-border rounded-xl px-4 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                                {/^(iphone|téléphone|telephone|mobile)/i.test(a.nom) ? (
                                    <Smartphone className="w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0" />
                                ) : (
                                    <Monitor className="w-4 h-4 text-slate-400 dark:text-dk-muted shrink-0" />
                                )}
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-800 dark:text-dk-text truncate">
                                        {a.nom}
                                        {a.local && (
                                            <span className="ms-2 text-[10px] font-black uppercase tracking-wide bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded align-middle">
                                                {tx(lang, { fr: 'cet ordinateur', ar: 'هذا الحاسوب', en: 'this computer' })}
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-dk-muted font-mono truncate">{a.ip}</p>
                                </div>
                            </div>
                            <span className="text-[11px] font-semibold text-slate-400 dark:text-dk-muted shrink-0">
                                {ilYA(a.vuLe, lang, tick)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </SectionShell>
    );
}

/** « À propos » — identité de l'édition + numéro de version (build Electron). */
export function AProposSection({ lang, open, onToggle }: { lang: Lang; open: boolean; onToggle: () => void }) {
    const version = (typeof window !== 'undefined' ? (window as any).beraElectron?.version : null) as string | null | undefined;
    return (
        <SectionShell
            icon={<Info className="w-5 h-5 text-red-500 dark:text-red-400" />}
            title={tx(lang, { fr: 'À propos', ar: 'حول التطبيق', en: 'About' })}
            open={open}
            onToggle={onToggle}
        >
            <div className="flex flex-col items-start gap-1">
                <p className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-dk-text">
                    BERA<span className="text-red-600 dark:text-red-400">COUPE</span>
                </p>
                <p className="text-sm text-slate-500 dark:text-dk-muted font-medium">
                    {tx(lang, {
                        fr: 'BERACOUPE — la salle de coupe, issue de BERAMETHODE.',
                        ar: 'BERACOUPE — قسم القص، من BERAMETHODE.',
                        en: 'BERACOUPE — the cutting room, from BERAMETHODE.',
                    })}
                </p>
                {version && (
                    <p className="text-xs font-mono text-slate-400 dark:text-dk-muted mt-2">
                        {tx(lang, { fr: 'Version', ar: 'النسخة', en: 'Version' })} {version}
                    </p>
                )}
            </div>
        </SectionShell>
    );
}
