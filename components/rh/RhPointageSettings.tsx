import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, CheckCircle } from 'lucide-react';
import type { AppSettings } from '../../types';
import {
  buildPointageTranchesFromAppSettings,
  getDefaultPointageTranches,
  parsePointageTranchesFromSettings,
  type PointageTranchesConfig,
  type PointageTrancheSlot,
} from '../../lib/pointageGrille';
import { pickT } from '../../lib/i18n';
import { TRANSLATIONS } from '../configTranslations';
import type { Lang } from '../../app/constants';

const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

interface Props {
    settings: AppSettings;
    /** Applique le changement au reste de l'app (App.tsx). Absent = affichage seul. */
    setSettings?: React.Dispatch<React.SetStateAction<AppSettings>>;
    lang: Lang;
}

/**
 * Reglages RH « Pointage & comptabilite » : recalcul auto des heures, reference
 * de temps pour la compta, regles Sage (arrondi / ancrage de journee) et
 * tranches de la grille de pointage.
 *
 * POURQUOI ici : ces reglages vivaient dans la page Configuration globale, loin
 * de la page ou on les utilise. Ils sont desormais rendus dans Gestion RH
 * (onglet Sage / Paie), a cote des exports qu'ils gouvernent. Contrairement a
 * Configuration, il n'y a pas de brouillon avec un bouton « Enregistrer »
 * global : chaque changement est ecrit tout de suite (les regles Sage et les
 * tranches ont deja leurs propres boutons de sauvegarde).
 */
export default function RhPointageSettings({ settings, setSettings, lang }: Props) {
    const t = pickT(TRANSLATIONS, lang);
    const [showSaveToast, setShowSaveToast] = useState(false);
    const [sageR, setSageR] = useState(15);
    const [sageW, setSageW] = useState('06:00');
    const [sageA, setSageA] = useState(true);
    const [sageBusy, setSageBusy] = useState(false);
    const [trCfg, setTrCfg] = useState<PointageTranchesConfig>(() => getDefaultPointageTranches());
    const [trBusy, setTrBusy] = useState(false);

    /* Ecriture immediate d'un reglage AppSettings (pas de brouillon ici). En mode
       statique (Vercel, sans Express) /api/settings n'existe pas : la persistance
       passe par setSettings -> localStorage + Supabase (cf. App.tsx). */
    const patchSettings = (patch: Partial<AppSettings>) => {
        const next = { ...settings, ...patch } as AppSettings;
        setSettings?.(prev => ({ ...prev, ...patch }));
        if (IS_STATIC) return;
        fetch('/api/settings', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ global_settings: next }),
        }).catch(() => {});
    };

    const loadSage = useCallback(() => {
        fetch('/api/settings', { credentials: 'include' })
            .then(r => (r.ok ? r.json() : null))
            .then((d: Record<string, unknown> | null) => {
                if (!d) return;
                const r0 = d.hr_sage_rounding;
                const w0 = d.hr_sage_workday_start;
                const a0 = d.hr_sage_apply;
                if (r0 != null) setSageR(Math.min(60, Math.max(1, parseInt(String(r0), 10) || 15)));
                if (w0 != null && /^\d{1,2}:\d{2}/.test(String(w0))) setSageW(String(w0).match(/^\d{1,2}:\d{2}/)![0]);
                if (a0 !== undefined) setSageA(a0 !== 'false' && a0 !== false);
                setTrCfg(parsePointageTranchesFromSettings(d.hr_pointage_tranches, settings));
            })
            .catch(() => {});
    }, [settings]);
    useEffect(() => { loadSage(); }, [loadSage]);

    const saveSage = () => {
        setSageBusy(true);
        fetch('/api/settings', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hr_sage_rounding: String(sageR),
                hr_sage_workday_start: sageW,
                hr_sage_apply: sageA ? 'true' : 'false',
            }),
        })
            .then(r => {
                if (r.ok) {
                    setSettings?.(prev => ({ ...prev, hrSageRounding: sageR, hrSageWorkdayStart: sageW, hrSageApply: sageA }));
                    setShowSaveToast(true);
                    setTimeout(() => setShowSaveToast(false), 3000);
                }
            })
            .catch(() => {})
            .finally(() => setSageBusy(false));
    };

    const saveTranches = () => {
        setTrBusy(true);
        fetch('/api/settings', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hr_pointage_tranches: trCfg }),
        })
            .then(r => {
                if (r.ok) {
                    setShowSaveToast(true);
                    setTimeout(() => setShowSaveToast(false), 3000);
                }
            })
            .catch(() => {})
            .finally(() => setTrBusy(false));
    };

    const updateTrSlot = (index: number, patch: Partial<PointageTrancheSlot>) => {
        setTrCfg(c => ({ ...c, slots: c.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
    };

    const removeTrSlot = (index: number) => {
        setTrCfg(c => {
            if (c.slots.length <= 2) return c;
            const slots = c.slots.filter((_, i) => i !== index);
            let sep = c.sepAfterIndex;
            if (sep > slots.length - 2) sep = Math.max(-1, slots.length - 2);
            return { slots, sepAfterIndex: sep };
        });
    };

    const addTrSlot = () => {
        setTrCfg(c => ({ ...c, slots: [...c.slots, { label: `T${c.slots.length + 1}`, start: '08:00', end: '09:00' }] }));
    };

    const resetTranches = () => setTrCfg(buildPointageTranchesFromAppSettings(settings));

    return (
        <div className="bg-white dark:bg-dk-surface rounded-2xl border border-slate-200 dark:border-dk-border p-5 space-y-4">
            {showSaveToast && (
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                    <CheckCircle className="w-4 h-4" />
                    {t.saved}
                </div>
            )}
            <h3 className="font-bold text-slate-800 dark:text-dk-text">{t.rhComptaTitle}</h3>
            <label className="flex items-start gap-3 cursor-pointer">
                <input
                    type="checkbox"
                    className="mt-1 rounded border-slate-300 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text focus:ring-indigo-500"
                    checked={settings.hrAutoOvertime !== false}
                    onChange={e => patchSettings({ hrAutoOvertime: e.target.checked })}
                />
                <span>
                    <span className="font-bold text-slate-800 dark:text-dk-text text-sm block">{t.rhAutoOvertime}</span>
                    <span className="text-xs text-slate-500 dark:text-dk-muted">{t.rhAutoOvertimeHint}</span>
                </span>
            </label>
            <div>
                <label className="block text-xs font-bold uppercase text-slate-500 dark:text-dk-muted mb-2">{t.rhComptaRef}</label>
                <select
                    name="hrComptaPointageRef"
                    value={settings.hrComptaPointageRef === 'normales_paie' ? 'normales_paie' : 'pointees'}
                    onChange={e => patchSettings({ hrComptaPointageRef: e.target.value === 'normales_paie' ? 'normales_paie' : 'pointees' })}
                    className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-xl px-4 py-3 outline-none focus:border-indigo-500 font-medium text-slate-700 dark:text-dk-text-soft transition-all cursor-pointer text-sm"
                >
                    <option value="pointees">{t.rhComptaRefPointees}</option>
                    <option value="normales_paie">{t.rhComptaRefNormales}</option>
                </select>
                <p className="text-xs text-slate-500 dark:text-dk-muted mt-2">{t.rhComptaRefHint}</p>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-dk-border">
                <p className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide mb-2">{t.rhSageServerTitle}</p>
                <p className="text-xs text-slate-500 dark:text-dk-muted mb-3">{t.rhSageServerHint}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-dk-text-soft mb-1">{t.rhSageRounding}</label>
                        <input
                            type="number"
                            min={1}
                            max={60}
                            value={sageR}
                            onChange={e => setSageR(Math.min(60, Math.max(1, parseInt(e.target.value, 10) || 15)))}
                            className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-mono"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 dark:text-dk-text-soft mb-1">{t.rhSageWorkday}</label>
                        <input
                            type="time"
                            value={sageW}
                            onChange={e => setSageW(e.target.value || '06:00')}
                            className="w-full bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm font-mono"
                        />
                    </div>
                </div>
                <label className="flex items-start gap-2 mt-3 cursor-pointer">
                    <input
                        type="checkbox"
                        className="mt-0.5 rounded border-slate-300 text-indigo-600 dark:text-indigo-400 dark:text-dk-accent-text"
                        checked={sageA}
                        onChange={e => setSageA(e.target.checked)}
                    />
                    <span className="text-sm text-slate-800 dark:text-dk-text">{t.rhSageApply}</span>
                </label>
                <button
                    type="button"
                    onClick={saveSage}
                    disabled={sageBusy}
                    className="mt-3 w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold disabled:opacity-50"
                >
                    {sageBusy ? '…' : t.rhSageSave}
                </button>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-200 dark:border-dk-border">
                <p className="text-xs font-bold text-slate-500 dark:text-dk-muted uppercase tracking-wide mb-1">{t.rhTranchesTitle}</p>
                <p className="text-xs text-slate-500 dark:text-dk-muted mb-3">{t.rhTranchesDesc}</p>
                <div className="mb-3">
                    <label className="block text-xs font-bold text-slate-600 dark:text-dk-text-soft mb-1">{t.rhTranchesPause}</label>
                    <select
                        value={trCfg.sepAfterIndex}
                        onChange={e => {
                            const v = parseInt(e.target.value, 10);
                            setTrCfg(c => ({ ...c, sepAfterIndex: Number.isFinite(v) ? v : -1 }));
                        }}
                        className="w-full max-w-xs bg-slate-50 dark:bg-dk-bg border-2 border-slate-200 dark:border-dk-border rounded-lg px-3 py-2 text-sm"
                    >
                        <option value={-1}>{t.rhTranchesNone}</option>
                        {Array.from({ length: Math.max(0, trCfg.slots.length - 1) }, (_, i) => {
                            const s = trCfg.slots[i];
                            return (
                                <option key={i} value={i}>
                                    {i + 1} — {s?.label ?? ''} (colonne « — » avant la tranche suivante)
                                </option>
                            );
                        })}
                    </select>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {trCfg.slots.map((row, idx) => (
                        <div key={idx} className="flex flex-wrap items-end gap-2 bg-slate-50 dark:bg-dk-bg/80 border border-slate-200 dark:border-dk-border rounded-lg p-2">
                            <div className="min-w-[100px] flex-1">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase">{t.rhTranchesLabel}</label>
                                <input
                                    value={row.label}
                                    onChange={e => updateTrSlot(idx, { label: e.target.value })}
                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded px-2 py-1.5 text-sm"
                                />
                            </div>
                            <div className="w-24">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase">{t.rhTranchesStart}</label>
                                <input
                                    type="time"
                                    value={row.start}
                                    onChange={e => updateTrSlot(idx, { start: e.target.value })}
                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded px-2 py-1.5 text-sm font-mono"
                                />
                            </div>
                            <div className="w-24">
                                <label className="block text-[10px] font-bold text-slate-500 dark:text-dk-muted uppercase">{t.rhTranchesEnd}</label>
                                <input
                                    type="time"
                                    value={row.end}
                                    onChange={e => updateTrSlot(idx, { end: e.target.value })}
                                    className="w-full bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded px-2 py-1.5 text-sm font-mono"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => removeTrSlot(idx)}
                                disabled={trCfg.slots.length <= 2}
                                className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 disabled:opacity-30"
                                title={t.rhTranchesDel}
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                    <button
                        type="button"
                        onClick={addTrSlot}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 dark:bg-dk-accent/20 text-indigo-800 text-xs font-bold border border-indigo-200"
                    >
                        <Plus className="w-4 h-4" />
                        {t.rhTranchesAdd}
                    </button>
                    <button
                        type="button"
                        onClick={resetTranches}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 dark:text-dk-text-soft text-xs font-bold"
                    >
                        {t.rhTranchesReset}
                    </button>
                    <button
                        type="button"
                        onClick={saveTranches}
                        disabled={trBusy}
                        className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold disabled:opacity-50"
                    >
                        {trBusy ? '…' : t.rhTranchesSave}
                    </button>
                </div>
            </div>
        </div>
    );
}
