import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { EffectifRoleTagKey, SuiviData } from '../types';
import { X } from 'lucide-react';
import { useLang } from '../src/context/LanguageContext';
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
                className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
                onMouseDown={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <h2 id="suivi-effectifs-title" className="text-sm font-black text-slate-800 tracking-tight">
                        {tx(lang, {fr:"Effectifs (AJANIF)",ar:"الموارد (AJANIF)",en:"Staff (AJANIF)",es:"Efectivos (AJANIF)",pt:"Efetivos (AJANIF)",tr:"Personel (AJANIF)"})}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                        aria-label={tx(lang, {fr:"Fermer",ar:"إغلاق",en:"Close",es:"Cerrar",pt:"Fechar",tr:"Kapat"})}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-4 py-3 space-y-3 text-xs">
                    <p className="text-slate-500 font-medium">
                        {tx(lang, {fr:"Date",ar:"التاريخ",en:"Date",es:"Fecha",pt:"Data",tr:"Tarih"})} <span className="font-mono font-bold text-slate-700">{draft.date}</span>
                        {' · '}
                        <span className="text-slate-400">{tx(lang, {fr:"Tot M (aperçu) :",ar:"المجموع (نظرة عامة):",en:"Tot M (preview):",es:"Total M (vista previa):",pt:"Total M (prévia):",tr:"Top M (ön izleme):"})}</span>{' '}
                        <span className="font-black text-emerald-700">{totalPreview}</span>
                    </p>
                    <div className="space-y-2">
                        {ROLE_KEYS.map((key, idx) => (
                            <div key={key} className="rounded-xl border border-slate-100 bg-slate-50/80 p-2.5 space-y-1.5">
                                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    {ROLE_LABELS[key]}
                                </label>
                                <div className="flex flex-wrap gap-2 items-center">
                                    <input
                                        ref={idx === 0 ? firstFieldRef : undefined}
                                        type="number"
                                        min={0}
                                        step={1}
                                        className="w-20 shrink-0 rounded-lg border border-slate-200 px-2 py-1.5 font-bold text-slate-800"
                                        placeholder="—"
                                        value={draft[key] == null ? '' : String(draft[key])}
                                        onChange={e => setNum(key, e.target.value)}
                                    />
                                    <input
                                        type="text"
                                        className="min-w-[120px] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 font-medium text-slate-700"
                                        placeholder="Tag (ex. OVR)"
                                        value={draft.effectifRoleTags?.[key] ?? ''}
                                        onChange={e => setTag(key, e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className="text-[10px] font-bold text-rose-600 hover:underline shrink-0"
                                        onClick={() => resetRole(key)}
                                    >
                                        {tx(lang, {fr:"Effacer",ar:"مسح",en:"Clear",es:"Limpiar",pt:"Limpar",tr:"Temizle"})}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-4 py-3 bg-slate-50/80">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/80"
                    >
                        {tx(lang, {fr:"Annuler",ar:"إلغاء",en:"Cancel",es:"Cancelar",pt:"Cancelar",tr:"İptal"})}
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm"
                    >
                        {tx(lang, {fr:"Confirmer",ar:"تأكيد",en:"Confirm",es:"Confirmar",pt:"Confirmar",tr:"Onayla"})}
                    </button>
                </div>
            </div>
        </div>
    );
}
