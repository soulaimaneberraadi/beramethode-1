import { Request, Response } from 'express';

/**
 * licenseController — proxy léger côté serveur vers l'Edge Function Supabase
 * `verify-license`. Le frontend (src/lib/licenseClient.ts) appelle
 * POST /api/license/verify ; ce contrôleur relaie la requête vers Supabase
 * (avec apikey + Bearer = anon key) et renvoie le JSON de l'Edge Function tel quel.
 *
 * En cas d'erreur (réseau, config manquante, statut non-OK), on renvoie un JSON
 * sûr `{ ok: false }` que le client interprète comme EMPTY/non vérifié — sans
 * jamais lever d'exception ni casser le boot.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

/**
 * POST /api/license/verify
 * Body attendu : { email } OU { key_code } (cf. licenseClient.verifyLicense).
 */
export const verifyLicenseProxy = async (req: Request, res: Response) => {
  try {
    const { email, key_code } = (req.body ?? {}) as { email?: string; key_code?: string };

    if (!email && !key_code) {
      return res.status(400).json({ ok: false, error: 'missing_key' });
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      // Config absente → réponse sûre (client → EMPTY / fallback cache offline)
      return res.json({ ok: false, error: 'not_configured' });
    }

    const edgeUrl = `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/verify-license`;
    const payload = key_code ? { key_code } : { email };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // Relaie le JSON de l'Edge Function tel quel (même contrat).
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return res.json({ ok: false, error: 'bad_upstream_response' });
    }

    return res.status(response.ok ? 200 : response.status).json(data);
  } catch {
    // Réseau/erreur inattendue → réponse sûre, jamais d'exception.
    return res.json({ ok: false, error: 'proxy_error' });
  }
};
