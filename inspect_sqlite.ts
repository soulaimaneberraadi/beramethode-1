import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://utrojjhscyatppgcszrt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0cm9qamhzY3lhdHBwZ2NzenJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MjUwNDEsImV4cCI6MjA5NzIwMTA0MX0.Nu6MQJe6YTN-TH7kBLHqStaFSrvXpuGuzr6wp28XFlk';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const email = 'soulaimaneberraadi@gmail.com';
const password = 'Admin123!';

async function run() {
  const { data: authData } = await supabase.auth.signInWithPassword({ email, password });
  const userId = authData.user!.id;
  const { data: userData } = await supabase
    .from('user_data')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();

  const snap = userData?.data || {};
  console.log('--- counts ---');
  console.log(snap.__sqlite_export__?.counts);
}

run().catch(console.error);
