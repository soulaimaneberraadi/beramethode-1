import React, { useEffect, useState } from 'react';
import { RefreshCw, Check } from 'lucide-react';
import { tx } from '../lib/i18n';
import { useLang } from '../src/context/LanguageContext';
import { useAuth } from '../src/context/AuthContext';
import { isCloudSyncUserId } from '../src/lib/cloudSync';

const IS_STATIC = import.meta.env.VITE_STATIC_MODE === 'true';

/**
 * Indicateur de synchronisation cloud discret pour le header.
 * 
 * Toujours visible lorsque l'utilisateur est connecté pour éviter le décalage (layout shift),
 * et permet de forcer une synchronisation manuelle en cliquant dessus.
 */
const SyncIndicator: React.FC = () => {
    const { lang } = useLang();
    const { user } = useAuth();
    const [state, setState] = useState<'idle' | 'syncing' | 'done'>('idle');

    useEffect(() => {
        let doneTimer: ReturnType<typeof setTimeout> | null = null;

        const onStart = () => {
            if (doneTimer) { clearTimeout(doneTimer); doneTimer = null; }
            setState('syncing');
        };
        const onEnd = () => {
            setState('done');
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

    // Cacher l'indicateur si aucun utilisateur n'est connecté
    const canCloudSync = Boolean(user && IS_STATIC && isCloudSyncUserId(String(user.id)));

    if (!canCloudSync) return null;

    const syncing = state === 'syncing';

    const handleSyncClick = async () => {
        if (!user || syncing || !canCloudSync) return;
        setState('syncing');
        try {
            const { pullSnapshotFromCloud } = await import('../src/lib/cloudSync');
            const success = await pullSnapshotFromCloud(String(user.id));
            if (success) {
                setState('done');
                setTimeout(() => setState('idle'), 1800);
            } else {
                setState('idle');
            }
        } catch {
            setState('idle');
        }
    };

    return (
        <button
            onClick={handleSyncClick}
            disabled={syncing}
            className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all outline-none ${
                syncing
                    ? 'bg-white dark:bg-dk-surface border-gray-100 dark:border-dk-border text-emerald-500 cursor-wait'
                    : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 cursor-pointer hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50'
            }`}
            title={
                syncing
                    ? tx(lang, { fr: "Synchronisation en cours…", ar: "المزامنة جارية…", en: "Syncing…", es: "Sincronizando…", pt: "Sincronizando…", tr: "Senkronize ediliyor…" })
                    : tx(lang, {
                        fr: "Synchronisé (Cliquer pour forcer la synchronisation)",
                        ar: "تمت المزامنة (اضغط للمزامنة الفورية)",
                        en: "Synced (Click to force sync)",
                        es: "Sincronizado (Clic para forzar)",
                        pt: "Sincronizado (Clique para forçar)",
                        tr: "Senkronize edildi (Zorlamak için tıklayın)"
                    })
            }
            aria-live="polite"
        >
            {syncing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
                <Check className="w-3.5 h-3.5" />
            )}
        </button>
    );
};

export default SyncIndicator;
