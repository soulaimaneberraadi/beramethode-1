import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EffectifRoleTagKey, SuiviData } from '../types';
import { X } from 'lucide-react';
import { useLang } from '../src/context/LanguageContext';
import { useIsDark } from '../src/context/ThemeContext';
import { tx } from '../lib/i18n';

const ROLE_KEYS: EffectifRoleTagKey[] = ['chaf', 'recta', 'sujet', 'transp', 'man', 'sp', 'stager'];

const ROLE_LABELS: Record<EffectifRoleTagKey, string> = {
    chaf: 'CHAF — Chef de chaîne',
    recta: 'REC — Recta',
    sujet: 'SUJ — Sujet',
    transp: 'TRP — Transparent',
    man: 'MAN — Machiniste',
    sp: 'SP — Spéciale',
    stager: 'STG — Stagiaire',
};

function sumEffectifs(s: Pick<SuiviData, EffectifRoleTagKey>): number {
    return ROLE_KEYS.reduce((acc, k) => acc + (Number(s[k]) || 0), 0);
}

export type SuiviEffectifsModalProps = {
    open: boolean;
    suivi: SuiviData | null;
    onClose: () => void;
    onConfirm: (next: SuiviData) => void;
};

export default function SuiviEffectifsModal({ open, suivi, onClose, onConfirm }: SuiviEffectifsModalProps) {
    const { lang } = useLang();
    const isDark = useIsDark();
    const [draft, setDraft] = useState<SuiviData | null>(null);
    const firstFieldRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open || !suivi) {
            setDraft(null);
            return;
        }
        setDraft({ ...suivi, effectifRoleTags: { ...(suivi.effectifRoleTags || {}) } });
    }, [open, suivi?.id, suivi]);

    const totalPreview = useMemo(() => (draft ? sumEffectifs(draft) : 0), [draft]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!open || !draft) return;
        const t = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
        return () => window.clearTimeout(t);
    }, [open, draft?.id]);

    if (!open || !draft) return null;

    const setNum = (key: EffectifRoleTagKey, raw: string) => {
        if (raw.trim() === '') {
            setDraft(prev => {
                if (!prev) return prev;
                const next = { ...prev, [key]: undefined } as SuiviData;
                next.totalWorkers = sumEffectifs(next);
                return next;
            });
            return;
        }
        const v = Math.max(0, Math.floor(Number(raw)));
        if (Number.isNaN(v)) return;
        setDraft(prev => {
            if (!prev) return prev;
            const next = { ...prev, [key]: v } as SuiviData;
            next.totalWorkers = sumEffectifs(next);
            return next;
        });
    };

    const setTag = (key: EffectifRoleTagKey, raw: string) => {
        const t = raw.trim();
        setDraft(prev => {
            if (!prev) return prev;
            const tags = { ...(prev.effectifRoleTags || {}) };
            if (!t) delete tags[key];
            else tags[key] = t;
            return { ...prev, effectifRoleTags: Object.keys(tags).length ? tags : undefined };
        });
    };

    const resetRole = (key: EffectifRoleTagKey) => {
        setDraft(prev => {
            if (!prev) return prev;
            const next = { ...prev, [key]: undefined } as SuiviData;
            const tags = { ...(next.effectifRoleTags || {}) };
            delete tags[key];
            next.effectifRoleTags = Object.keys(tags).length ? tags : undefined;
            next.totalWorkers = sumEffectifs(next);
            return next;
        });
    };

    const handleConfirm = () => {
        if (!draft) return;
        onConfirm({ ...draft, totalWorkers: sumEffectifs(draft) });
        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="suivi-effectifs-title"
            onMouseDown={e => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className={`w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${isDark ? 'border-dk-border bg-dk-surface' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface'}`}
                onMouseDown={e => e.stopPropagation()}
            >
                <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${isDark ? 'border-dk-border' : 'border-slate-100 dark:border-dk-border'}`}>
                    <h2 id="suivi-effectifs-title" className={`text-sm font-black tracking-tight ${isDark ? 'text-dk-text' : 'text-slate-800 dark:text-dk-text'}`}>
                        {tx(lang, {fr:"Effectifs (AJANIF)",ar:"الموارد (AJANIF)",en:"Staff (AJANIF)",es:"Efectivos (AJANIF)",pt:"Efetivos (AJANIF)",tr:"Personel (AJANIF)"})}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`p-2 rounded-lg ${isDark ? 'text-dk-muted hover:text-dk-text hover:bg-dk-bg' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
                        aria-label={tx(lang, {fr:"Fermer",ar:"إغلاق",en:"Close",es:"Cerrar",pt:"Fechar",tr:"Kapat"})}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-4 py-3 space-y-3 text-xs">
                    <p className={`font-medium ${isDark ? 'text-dk-muted' : 'text-slate-500 dark:text-dk-muted'}`}>
                        {tx(lang, {fr:"Date",ar:"التاريخ",en:"Date",es:"Fecha",pt:"Data",tr:"Tarih"})} <span className={`font-mono font-bold ${isDark ? 'text-dk-text' : 'text-slate-700 dark:text-dk-text-soft'}`}>{draft.date}</span>
                        {' · '}
                        <span className={isDark ? 'text-dk-muted' : 'text-slate-400 dark:text-dk-muted'}>{tx(lang, {fr:"Tot M (aperçu) :",ar:"المجموع (نظرة عامة):",en:"Tot M (preview):",es:"Total M (vista previa):",pt:"Total M (prévia):",tr:"Top M (ön izleme):"})}</span>{' '}
                        <span className="font-black text-emerald-700">{totalPreview}</span>
                    </p>
                    <div className="space-y-2">
                        {ROLE_KEYS.map((key, idx) => (
                            <div key={key} className={`rounded-xl border p-2.5 space-y-1.5 ${isDark ? 'border-dk-border bg-dk-bg/80' : 'border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/80'}`}>
                                <label className={`block text-[10px] font-black uppercase tracking-wider ${isDark ? 'text-dk-muted' : 'text-slate-500 dark:text-dk-muted'}`}>
                                    {ROLE_LABELS[key]}
                                </label>
                                <div className="flex flex-wrap gap-2 items-center">
                                    <input
                                        ref={idx === 0 ? firstFieldRef : undefined}
                                        type="number"
                                        min={0}
                                        step={1}
                                        className={`w-20 shrink-0 rounded-lg border px-2 py-1.5 font-bold ${isDark ? 'border-dk-border bg-dk-bg text-dk-text' : 'border-slate-200 dark:border-dk-border text-slate-800 dark:text-dk-text'}`}
                                        placeholder="—"
                                        value={draft[key] == null ? '' : String(draft[key])}
                                        onChange={e => setNum(key, e.target.value)}
                                    />
                                    <input
                                        type="text"
                                        className={`min-w-[120px] flex-1 rounded-lg border px-2 py-1.5 font-medium ${isDark ? 'border-dk-border bg-dk-bg text-dk-text' : 'border-slate-200 dark:border-dk-border text-slate-700 dark:text-dk-text-soft'}`}
                                        placeholder="Tag (ex. OVR)"
                                        value={draft.effectifRoleTags?.[key] ?? ''}
                                        onChange={e => setTag(key, e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline shrink-0"
                                        onClick={() => resetRole(key)}
                                    >
                                        {tx(lang, {fr:"Effacer",ar:"مسح",en:"Clear",es:"Limpiar",pt:"Limpar",tr:"Temizle"})}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className={`flex items-center justify-end gap-2 border-t px-4 py-3 ${isDark ? 'border-dk-border bg-dk-bg/80' : 'border-slate-100 dark:border-dk-border bg-slate-50 dark:bg-dk-bg/80'}`}>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`px-4 py-2 rounded-xl text-xs font-bold ${isDark ? 'text-dk-muted hover:bg-dk-bg' : 'text-slate-600 dark:text-dk-text-soft hover:bg-slate-200/80'}`}
                    >
                        {tx(lang, {fr:"Annuler",ar:"إلغاء",en:"Cancel",es:"Cancelar",pt:"Cancelar",tr:"İptal"})}
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 dark:bg-dk-accent text-white hover:bg-indigo-700 dark:hover:bg-dk-accent-hover shadow-sm"
                    >
                        {tx(lang, {fr:"Confirmer",ar:"تأكيد",en:"Confirm",es:"Confirmar",pt:"Confirmar",tr:"Onayla"})}
                    </button>
                </div>
            </div>
        </div>
    );
}
