/**
 * Le dossier que surveille le logiciel du traceur (outil de trace d'Optitex),
 * relie une fois depuis le navigateur. « Envoyer au traceur » y depose alors
 * le trace numerote directement : sans serveur a redemarrer, et aussi depuis
 * la version en ligne. Sans dossier relie, on passe par le serveur local.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Printer, FolderOpen, RefreshCw } from 'lucide-react';
import { tx } from '../../lib/i18n';
import { useLang } from '../../src/context/LanguageContext';
import { autoriserDossier, choisirDossier, deposerSansEcraser, dossierMemorise, estSupporte } from '../../lib/dossierLocal';
import { enBase64 } from '../../lib/numerotationPlt';

const CLE = 'traceur';
const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

export interface DossierTraceur {
    supporte: boolean;
    dossier: string | null;
    permission: 'granted' | 'prompt' | 'denied' | null;
    /** Vrai si un envoi est possible (dossier relie, ou serveur local). */
    disponible: boolean;
    choisir: () => Promise<void>;
    reactiver: () => Promise<void>;
    deposer: (nom: string, octets: Uint8Array<ArrayBuffer>) => Promise<{ ok: boolean; message: string }>;
}

export function useDossierTraceur(): DossierTraceur {
    const supporte = estSupporte();
    const [dossier, setDossier] = useState<string | null>(null);
    const [permission, setPermission] = useState<DossierTraceur['permission']>(null);

    const relire = useCallback(async () => {
        const m = await dossierMemorise(CLE);
        setDossier(m?.nom ?? null);
        setPermission(m?.permission ?? null);
    }, []);
    useEffect(() => { if (supporte) relire(); }, [supporte, relire]);

    const deposer = async (nom: string, octets: Uint8Array<ArrayBuffer>) => {
        if (supporte && dossier && permission === 'granted') {
            const r = await deposerSansEcraser(CLE, nom, new Blob([octets], { type: 'application/octet-stream' }));
            if (r.resultat === 'ok') return { ok: true, message: `${dossier}\\${r.nom}` };
            if (r.resultat === 'permission') setPermission('prompt');
            return { ok: false, message: r.resultat };
        }
        if (IS_STATIC) return { ok: false, message: 'Reliez le dossier du traceur' };
        try {
            const res = await fetch('/api/traceur/deposer', {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nom, donnees: enBase64(octets) }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return { ok: false, message: data?.message || `HTTP ${res.status}` };
            return { ok: true, message: data.chemin };
        } catch (e: any) {
            return { ok: false, message: e?.message || String(e) };
        }
    };

    return {
        supporte, dossier, permission,
        disponible: (supporte && !!dossier && permission === 'granted') || !IS_STATIC,
        choisir: async () => { if (await choisirDossier(CLE)) await relire(); },
        reactiver: async () => { await autoriserDossier(CLE); await relire(); },
        deposer,
    };
}

/** Petite ligne « Traceur : dossier » avec de quoi le relier ou le reactiver. */
export function PuceTraceur({ traceur }: { traceur: DossierTraceur }) {
    const { lang } = useLang();
    const L = (fr: string, ar: string, en: string) => tx(lang, { fr, ar, en });
    if (!traceur.supporte && !IS_STATIC) return null;
    const bouton = 'h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-[11px] font-semibold border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text-soft hover:border-indigo-300';
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            {traceur.dossier ? (
                <span className="text-[11px] text-slate-600 dark:text-dk-text-soft">
                    {L('Traceur', 'الـ traceur', 'Plotter')} : <b>{traceur.dossier}</b>
                    {traceur.permission !== 'granted' && <span className="text-amber-600"> · {L('a reactiver', 'يحتاج تفعيلاً', 'needs re-activation')}</span>}
                </span>
            ) : (
                <span className="text-[11px] text-slate-500">{IS_STATIC ? L('Traceur : aucun dossier relie', 'الـ traceur: لا مجلّد مربوط', 'Plotter: no folder') : L('Traceur : via le serveur', 'الـ traceur: عبر الخادم', 'Plotter: via server')}</span>
            )}
            {traceur.dossier && traceur.permission !== 'granted' && (
                <button type="button" onClick={traceur.reactiver} className={bouton}><RefreshCw className="w-3.5 h-3.5" />{L('Reactiver', 'تفعيل', 'Re-activate')}</button>
            )}
            {traceur.supporte && (
                <button type="button" onClick={traceur.choisir} className={bouton} title={L('Le dossier que surveille l’outil de trace d’Optitex', 'المجلّد الذي تراقبه أداة الطباعة في Optitex', 'The folder watched by the Optitex plot tool')}>
                    <FolderOpen className="w-3.5 h-3.5" />{traceur.dossier ? L('Changer', 'تغيير', 'Change') : L('Relier le dossier du traceur', 'ربط مجلّد الـ traceur', 'Link plotter folder')}
                </button>
            )}
        </div>
    );
}
