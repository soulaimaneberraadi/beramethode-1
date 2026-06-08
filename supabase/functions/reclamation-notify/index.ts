// Supabase Edge Function — Notifications de réclamations par e-mail (via Resend)
//
// Déclenchée par un *Database Webhook* sur la table `public.reclamations` :
//   - INSERT                         → e-mail « bien reçu, merci »
//   - UPDATE vers status = 'resolu'  → e-mail « problème résolu, réessayez »
//
// Déploiement :
//   supabase functions deploy reclamation-notify --no-verify-jwt
//   supabase secrets set RESEND_API_KEY=re_xxx FROM_EMAIL="BERAMETHODE <no-reply@votredomaine.com>"
//   (optionnel) supabase secrets set WEBHOOK_SECRET=une_chaine_secrete
//
// Puis créer le webhook : Dashboard → Database → Webhooks → New
//   Table: reclamations | Events: Insert, Update | Type: HTTP POST
//   URL: https://<project-ref>.functions.supabase.co/reclamation-notify
//   (optionnel) Header: x-webhook-secret = la meme valeur que WEBHOOK_SECRET

interface Reclamation {
  id: string;
  user_email: string | null;
  message: string;
  view: string | null;
  status: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Reclamation | null;
  old_record: Reclamation | null;
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'BERAMETHODE <onboarding@resend.dev>';
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? '';

const sendEmail = async (to: string, subject: string, html: string): Promise<boolean> => {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY manquante');
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    console.error('Echec envoi Resend:', res.status, await res.text());
    return false;
  }
  return true;
};

const wrap = (title: string, body: string) => `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1f2937">
    <h2 style="color:#059669;margin:0 0 4px">BERA<span style="color:#111">METHODE</span></h2>
    <h3 style="margin:16px 0 8px">${title}</h3>
    <p style="line-height:1.6;color:#374151">${body}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
    <p style="font-size:12px;color:#9ca3af">Message automatique — merci de ne pas répondre.</p>
  </div>`;

Deno.serve(async (req) => {
  try {
    // Sécurité optionnelle : vérifier un secret partagé avec le webhook.
    if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    const payload = (await req.json()) as WebhookPayload;
    const rec = payload.record;
    if (!rec || !rec.user_email) {
      return new Response(JSON.stringify({ skipped: 'pas d\'e-mail' }), { status: 200 });
    }

    let sent = false;

    if (payload.type === 'INSERT') {
      sent = await sendEmail(
        rec.user_email,
        'Nous avons bien reçu votre signalement',
        wrap(
          'Merci pour votre signalement',
          `Nous avons bien reçu votre signalement${rec.view ? ` sur la page « ${rec.view} »` : ''} :<br/><br/>` +
          `<em>« ${rec.message} »</em><br/><br/>` +
          `Notre équipe l'examine et reviendra vers vous rapidement.`,
        ),
      );
    } else if (
      payload.type === 'UPDATE' &&
      rec.status === 'resolu' &&
      payload.old_record?.status !== 'resolu'
    ) {
      sent = await sendEmail(
        rec.user_email,
        'Votre problème a été résolu ✅',
        wrap(
          'Problème résolu',
          `Bonne nouvelle ! Le problème que vous avez signalé${rec.view ? ` sur « ${rec.view} »` : ''} a été résolu.<br/><br/>` +
          `<em>« ${rec.message} »</em><br/><br/>` +
          `Merci de réessayer. Si le souci persiste, n'hésitez pas à le signaler de nouveau.`,
        ),
      );
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Erreur fonction:', e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
