// ════════════════════════════════════════════════════════════════════════════
// AnnouncementBar — شريط علوي يعرض إعلانات BERA MASTER (الصيانة، التحديثات...).
// يقرأ جدول announcements (قراءة عامة عبر RLS). آمن: لا يعرض شيئاً إن لا إعلانات.
// ════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { supabase } from '../src/lib/supabaseClient';

interface Announcement {
  id: string;
  message: string;
  level: 'info' | 'warning' | 'maintenance';
  target_audience: { all?: boolean; region?: string; tenant_ids?: string[] };
  expires_at: string | null;
}

const LEVEL_STYLE: Record<string, string> = {
  info: 'bg-blue-600',
  warning: 'bg-amber-500',
  maintenance: 'bg-rose-600',
};

// جدول announcements قد لا يكون موجوداً على مشروع Supabase الحالي (الجسر المؤقّت).
// نتجنّب الطلب — وبالتالي أخطاء 404 في الـ console — إلا إذا فُعّل صراحةً.
const ANNOUNCEMENTS_ENABLED = import.meta.env.VITE_ANNOUNCEMENTS_ENABLED === 'true';

const AnnouncementBar: React.FC = () => {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('bera_ann_dismissed') || '[]')); }
    catch { return new Set(); }
  });

  useEffect(() => {
    if (!ANNOUNCEMENTS_ENABLED) return;
    let mounted = true;
    const load = async () => {
      try {
        const nowIso = new Date().toISOString();
        const { data } = await supabase
          .from('announcements')
          .select('*')
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order('created_at', { ascending: false });
        if (mounted && data) setItems(data as Announcement[]);
      } catch { /* table absente / hors-ligne → silencieux */ }
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000); // كل 5 دقائق
    return () => { mounted = false; clearInterval(t); };
  }, []);

  const dismiss = (id: string) => {
    const next = new Set(dismissed); next.add(id);
    setDismissed(next);
    try { localStorage.setItem('bera_ann_dismissed', JSON.stringify([...next])); } catch { /* ignore */ }
  };

  const visible = items.filter((a) => !dismissed.has(a.id));
  if (!visible.length) return null;

  return (
    <div className="w-full">
      {visible.map((a) => (
        <div key={a.id} className={`${LEVEL_STYLE[a.level] || 'bg-slate-700 dark:bg-slate-800'} text-white text-sm px-4 py-2 flex items-center justify-between gap-3`}>
          <span className="flex-1">{a.message}</span>
          <button onClick={() => dismiss(a.id)} className="opacity-80 hover:opacity-100 text-xs px-2">✕</button>
        </div>
      ))}
    </div>
  );
};

export default AnnouncementBar;
