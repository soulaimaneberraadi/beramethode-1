import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

export const SUPABASE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = SUPABASE_ENABLED
  ? createClient(SUPABASE_URL!, SUPABASE_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'beramethode_supabase_session',
      },
    })
  : null as unknown as ReturnType<typeof createClient>;
