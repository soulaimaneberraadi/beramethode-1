// ════════════════════════════════════════════════════════════════════════════
// Edge Function: verify-license
// التحقق الآمن من مفتاح الترخيص من جهة الخادم (يحمل service_role + سرّ التوقيع).
// يستدعيها BERAMETHODE عند التفعيل وعند كل دخول/مزامنة.
//
// النشر:  supabase functions deploy verify-license --no-verify-jwt
// الأسرار: supabase secrets set LICENSE_SIGN_SECRET=... SERVICE_ROLE_KEY=...
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGN_SECRET = Deno.env.get('LICENSE_SIGN_SECRET') ?? 'bera-dev-secret-change-me';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function hmacHex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(SIGN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

// نفس صيغة الحمولة المستعملة في src/lib/license.ts
function payloadOf(lic: {
  key_code: string; client_email: string; modules: string[]; max_workers: number; expires_at: string;
}): string {
  return JSON.stringify({
    k: lic.key_code,
    e: lic.client_email,
    m: [...lic.modules].sort(),
    w: lic.max_workers,
    x: lic.expires_at,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  let body: { key_code?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let query = admin.from('licenses').select('*').limit(1);
  if (body.key_code) query = query.eq('key_code', body.key_code.trim().toUpperCase());
  else if (body.email) query = query.eq('client_email', body.email.trim().toLowerCase());
  else return json({ ok: false, error: 'missing_key' }, 400);

  const { data, error } = await query.maybeSingle();
  if (error) return json({ ok: false, error: 'db' }, 500);
  if (!data) return json({ ok: false, error: 'not_found' });

  const lic = data as Record<string, unknown>;
  const modules = (lic.modules as string[]) ?? [];

  // 1) التحقق من التوقيع (يمنع التزوير)
  const expectedSig = await hmacHex(payloadOf({
    key_code: lic.key_code as string,
    client_email: lic.client_email as string,
    modules,
    max_workers: lic.max_workers as number,
    expires_at: lic.expires_at as string,
  }));
  if (expectedSig !== lic.signature) {
    return json({ ok: false, error: 'invalid_signature' });
  }

  // 2) الحالة والمدة
  const status = lic.status as string;
  const expiresAt = new Date(lic.expires_at as string).getTime();
  const now = Date.now();
  const expired = expiresAt < now;
  const active = status === 'active' && !expired;
  const daysLeft = Math.ceil((expiresAt - now) / 86_400_000);

  // 3) توكن مُتحقَّق قصير الأجل (يُخزَّن محلياً للعمل أوفلاين ضمن فترة سماح)
  const verifiedAt = new Date().toISOString();
  const token = await hmacHex(`${lic.key_code}|${verifiedAt}|${active}`);

  return json({
    ok: true,
    active,
    expired,
    status,
    daysLeft,
    modules,
    max_workers: lic.max_workers,
    expires_at: lic.expires_at,
    client_email: lic.client_email,
    verified_at: verifiedAt,
    token,
  });
});
