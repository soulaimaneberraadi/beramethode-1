import { Request, Response } from 'express';
import db from './db';

// Rate-limit basique en mémoire : max 20 rapports par IP par 15 minutes
const reportRateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 min
const RATE_LIMIT_MAX = 20;

function checkReportRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = reportRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    reportRateMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

/**
 * POST /api/errors/report
 * Public (pas d'auth) — les crash reports peuvent arriver avant le login.
 * Corps : { message, stack, component_stack, url, user_agent, user_id? }
 */
export const reportError = (req: Request, res: Response) => {
  const ip = String(req.ip ?? req.socket?.remoteAddress ?? 'unknown');

  if (!checkReportRateLimit(ip)) {
    return res.status(429).json({ message: 'Trop de rapports. Réessayez plus tard.' });
  }

  const { message, stack, component_stack, url, user_agent, user_id } = req.body;

  try {
    db.prepare(
      `INSERT INTO crash_reports (message, stack, component_stack, url, user_agent, user_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      message ?? null,
      stack ?? null,
      component_stack ?? null,
      url ?? null,
      user_agent ?? null,
      user_id ?? null
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    console.error('[errorController] reportError:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * GET /api/errors/reports
 * Admin uniquement — retourne tous les rapports non résolus en premier.
 */
export const getReports = (_req: Request, res: Response) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, message, stack, component_stack, url, user_agent, user_id, resolved, created_at
         FROM crash_reports
         ORDER BY resolved ASC, created_at DESC
         LIMIT 500`
      )
      .all();

    return res.json(rows);
  } catch (error) {
    console.error('[errorController] getReports:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * PUT /api/errors/reports/:id/resolve
 * Admin uniquement — marque un rapport comme résolu.
 */
export const resolveReport = (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'id requis' });
  }

  try {
    const result = db
      .prepare('UPDATE crash_reports SET resolved = 1 WHERE id = ?')
      .run(id);

    if (result.changes === 0) {
      return res.status(404).json({ message: 'Rapport introuvable' });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('[errorController] resolveReport:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
