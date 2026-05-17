import { supabase } from './supabaseClient';
import { SCHEMA_VERSION, migrateSnapshot } from './dataVersion';

// Keys synchronisées vers Supabase (toutes les données qui doivent suivre l'utilisateur entre appareils)
const SYNC_KEYS = [
  'beramethode_autosave_v1',
  'beramethode_library',
  'beramethode_planning',
  'beramethode_suivis',
  'beramethode_settings',
  'beramethode_machine_instances',
  'beramethode_machines_v1',
  'beramethode_machines_fleet_history_v1',
  'beramethode_manual_links',
  'beramethode_demandesAppro',
  'bera_nav_config',
  'BERA_CUSTOM_ROLES',
  'BERA_CUSTOM_PARTITIONS',
  'BERA_SALLES',
];

const TABLE = 'user_data';

let syncTimer: ReturnType<typeof setTimeout> | null = null;
let isApplyingRemote = false;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

const collectLocalSnapshot = (): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const k of SYNC_KEYS) {
    try {
      const v = localStorage.getItem(k);
      if (v != null) out[k] = JSON.parse(v);
    } catch {
      const raw = localStorage.getItem(k);
      if (raw != null) out[k] = raw;
    }
  }
  // Préserve les données serveur seed importées (workers, HR, magasin)
  // pour qu'elles ne soient pas effacées par un push subséquent.
  try {
    const exp = localStorage.getItem('__bera_sqlite_export__');
    if (exp) out.__sqlite_export__ = JSON.parse(exp);
  } catch {}
  return out;
};

const applySnapshotToLocal = (snapshot: Record<string, unknown> | null) => {
  if (!snapshot) return;
  isApplyingRemote = true;
  try {
    for (const k of SYNC_KEYS) {
      if (k in snapshot) {
        try {
          localStorage.setItem(k, JSON.stringify(snapshot[k]));
        } catch {}
      }
    }
    // Données serveur (lecture seule, non re-synchronisées)
    if ('__sqlite_export__' in snapshot) {
      try {
        localStorage.setItem('__bera_sqlite_export__', JSON.stringify(snapshot.__sqlite_export__));
      } catch {}
    }
  } finally {
    isApplyingRemote = false;
  }
  window.dispatchEvent(new CustomEvent('beramethode:cloud-sync-applied'));
};

export const pushSnapshotToCloud = async (userId: string) => {
  if (!userId || isApplyingRemote) return;
  const snapshot = { ...collectLocalSnapshot(), __schema_version: SCHEMA_VERSION };
  try {
    await supabase.from(TABLE).upsert(
      { user_id: userId, data: snapshot, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  } catch (err) {
    console.warn('Cloud push failed:', err);
  }
};

const RELOAD_FLAG = 'beramethode_pulled_once';

export const pullSnapshotFromCloud = async (userId: string): Promise<boolean> => {
  if (!userId) return false;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('data')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data?.data) return false;
    let snap = data.data as Record<string, unknown>;
    const v = typeof snap.__schema_version === 'number' ? (snap.__schema_version as number) : 0;
    if (v < SCHEMA_VERSION) snap = migrateSnapshot(snap, v);
    const wasEmpty = !sessionStorage.getItem(RELOAD_FLAG);
    applySnapshotToLocal(snap);
    if (wasEmpty) {
      // Premier pull de la session: recharger pour que tous les useState
      // initialisés depuis localStorage récupèrent les nouvelles données.
      sessionStorage.setItem(RELOAD_FLAG, '1');
      setTimeout(() => window.location.reload(), 200);
    }
    return true;
  } catch (err) {
    console.warn('Cloud pull failed:', err);
    return false;
  }
};

export const startCloudSync = (userId: string) => {
  if (!userId) return;

  // Intercepter writes à localStorage pour déclencher un push debouncé
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (this === localStorage && SYNC_KEYS.includes(key) && !isApplyingRemote) {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => pushSnapshotToCloud(userId), 1500);
    }
  };

  // Realtime: écouter les changements depuis d'autres appareils
  if (realtimeChannel) realtimeChannel.unsubscribe();
  realtimeChannel = supabase
    .channel(`user_data_${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` },
      (payload) => {
        const newRow = (payload.new as { data?: Record<string, unknown> } | null)?.data;
        if (newRow) applySnapshotToLocal(newRow);
      },
    )
    .subscribe();
};

export const stopCloudSync = () => {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
    realtimeChannel = null;
  }
};
