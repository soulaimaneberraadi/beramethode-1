import React, { useEffect, useState } from 'react';
import { RefreshCw, Check, AlertTriangle } from 'lucide-react';
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
    // Le stockage du navigateur a refusé une écriture (téléphone plein). Tant
    // que ça dure, l'appareil ne peut RIEN enregistrer : le dire vaut mieux que
    // d'afficher une coche verte pendant que le travail se perd.
    const [plein, setPlein] = useState(false);

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

        const onFull = () => setPlein(true);

        window.addEventListener('beramethode:cloud-sync-start', onStart);
        window.addEventListener('beramethode:cloud-sync-end', onEnd);
        window.addEventListener('beramethode:storage-full', onFull);
        return () => {
            window.removeEventListener('beramethode:cloud-sync-start', onStart);
            window.removeEventListener('beramethode:cloud-sync-end', onEnd);
            window.removeEventListener('beramethode:storage-full', onFull);
            if (doneTimer) clearTimeout(doneTimer);
        };
    }, []);

    // Cacher l'indicateur si aucun utilisateur n'est connecté
    const canCloudSync = Boolean(user && IS_STATIC && isCloudSyncUserId(String(user.id)));

    if (!canCloudSync) return null;

    const syncing = state === 'syncing';

    const titreStockagePlein = tx(lang, {
        fr: "Mémoire de l'appareil pleine : les enregistrements échouent. Libérez de l'espace (supprimez des photos de modèles) puis resynchronisez.",
        ar: "ذاكرة الجهاز ممتلئة: الحفظ يفشل. حرّر مساحة (احذف صور بعض النماذج) ثم أعد المزامنة.",
        en: "Device storage full: saving fails. Free some space (remove model photos) then sync again.",
        es: "Memoria del dispositivo llena: no se guarda. Libere espacio (fotos de modelos) y sincronice.",
        pt: "Memória do aparelho cheia: não grava. Liberte espaço (fotos de modelos) e sincronize.",
        tr: "Cihaz belleği dolu: kayıt başarısız. Yer açın (model fotoğrafları) ve yeniden eşitleyin.",
    });

    const handleSyncClick = async () => {
        if (!user || syncing || !canCloudSync) return;
        setState('syncing');
        try {
            const { pullSnapshotFromCloud, pushSnapshotToCloud } = await import('../src/lib/cloudSync');
            // D'abord POUSSER : le bouton sert surtout au téléphone qui vient de
            // travailler hors ligne. Tirer sans avoir poussé ferait passer la
            // main aux autres appareils avant même que ce travail soit parti.
            await pushSnapshotToCloud(String(user.id)).catch(() => false);
            // `force` : sauter le pull conditionnel. Un appareil qui se croit
            // déjà à jour ne retéléchargeait rien, et le bouton affichait
            // « synchronisé » sans avoir rien rapporté.
            const success = await pullSnapshotFromCloud(String(user.id), { force: true });
            if (success) {
                setPlein(false);
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
                    : plein
                    ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 cursor-pointer hover:bg-amber-100/80 dark:hover:bg-amber-900/50'
                    : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 cursor-pointer hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50'
            }`}
            title={
                plein
                    ? titreStockagePlein
                    : syncing
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
            ) : plein ? (
                <AlertTriangle className="w-3.5 h-3.5" />
            ) : (
                <Check className="w-3.5 h-3.5" />
            )}
        </button>
    );
};

export default SyncIndicator;
