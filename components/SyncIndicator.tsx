import React, { useEffect, useState } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';

/**
 * Indicateur de synchronisation cloud discret pour le header.
 *
 * Remplace l'ancien écran de chargement plein écran qui réapparaissait à chaque
 * pull Supabase (cf. suppression du window.location.reload() dans cloudSync).
 * Écoute les évènements émis par cloudSync :
 *   - 'beramethode:cloud-sync-start'   → affiche une icône qui tourne
 *   - 'beramethode:cloud-sync-end'     → bascule en « synchronisé » (coche)
 *
 * En dehors d'une synchronisation, le composant est invisible (aucune place
 * occupée), pour rester aussi sobre que le reste du header.
 */
const SyncIndicator: React.FC = () => {
    const { lang } = useLang();
    const [state, setState] = useState<'idle' | 'syncing' | 'done'>('idle');

    useEffect(() => {
        let doneTimer: ReturnType<typeof setTimeout> | null = null;

        const onStart = () => {
            if (doneTimer) { clearTimeout(doneTimer); doneTimer = null; }
            setState('syncing');
        };
        const onEnd = () => {
            setState('done');
            // La coche « synchronisé » disparaît après un court instant.
            doneTimer = setTimeout(() => setState('idle'), 1800);
        };

        window.addEventListener('beramethode:cloud-sync-start', onStart);
        window.addEventListener('beramethode:cloud-sync-end', onEnd);
        return () => {
            window.removeEventListener('beramethode:cloud-sync-start', onStart);
            window.removeEventListener('beramethode:cloud-sync-end', onEnd);
            if (doneTimer) clearTimeout(doneTimer);
        };
    }, []);

    if (state === 'idle') return null;

    const syncing = state === 'syncing';

    return (
        <div
            className={`hidden md:flex items-center justify-center w-8 h-8 rounded-full border transition-colors ${
                syncing
                    ? 'bg-white dark:bg-dk-surface border-gray-100 dark:border-dk-border text-emerald-500'
                    : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800 text-emerald-600 dark:text-emerald-300'
            }`}
            title={syncing ? tx(lang,{fr:"Synchronisation en cours…",ar:"المزامنة جارية…",en:"Syncing…",es:"Sincronizando…",pt:"Sincronizando…",tr:"Senkronize ediliyor…"}) : tx(lang,{fr:"Synchronisé",ar:"تمت المزامنة",en:"Synced",es:"Sincronizado",pt:"Sincronizado",tr:"Senkronize edildi"})}
            aria-live="polite"
        >
            {syncing
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" />}
        </div>
    );
};

export default SyncIndicator;
