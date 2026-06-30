import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import db from './db';

type Beradb = typeof db;

const newId = (prefix: string) => `${prefix}-${randomUUID()}`;

/** Après upsert hr_workers : garantit une ligne platform_person + hr_worker_person. */
export function ensurePersonLinkAfterWorkerUpsert(
  database: Beradb,
  hrWorkerId: string,
  ownerId: number,
  linkPersonId?: string | null
): { person_id: string } {
  const row = database
    .prepare('SELECT person_id FROM hr_worker_person WHERE hr_worker_id = ?')
    .get(hrWorkerId) as { person_id: string } | undefined;

  if (linkPersonId) {
    const exists = database.prepare('SELECT 1 FROM platform_person WHERE id = ?').get(linkPersonId);
    if (!exists) {
      throw new Error('INVALID_PERSON_ID');
    }
    if (row) {
      database
        .prepare('UPDATE hr_worker_person SET person_id = ? WHERE hr_worker_id = ?')
        .run(linkPersonId, hrWorkerId);
      return { person_id: linkPersonId };
    }
    database
      .prepare('INSERT INTO hr_worker_person (person_id, hr_worker_id, owner_id) VALUES (?, ?, ?)')
      .run(linkPersonId, hrWorkerId, ownerId);
    return { person_id: linkPersonId };
  }

  if (row) {
    return { person_id: row.person_id };
  }

  const pid = newId('per');
  const tx = database.transaction(() => {
    database.prepare('INSERT INTO platform_person (id) VALUES (?)').run(pid);
    database
      .prepare('INSERT INTO hr_worker_person (person_id, hr_worker_id, owner_id) VALUES (?, ?, ?)')
      .run(pid, hrWorkerId, ownerId);
  });
  tx();
  return { person_id: pid };
}

export const getHRInvitations = (req: Request, res: Response) => {
  const companyId = (req as any).companyId;
  try {
    const rows = db
      .prepare(
        `SELECT i.*, p.id AS person_id_ref
         FROM hr_invitation i
         JOIN platform_person p ON p.id = i.person_id
         WHERE i.owner_id = ?
         ORDER BY i.created_at DESC`
      )
      .all(companyId);
    res.json(rows);
  } catch (e) {
    console.error('getHRInvitations', e);
    res.status(500).json({ message: 'Error' });
  }
};

async function trySendInvitationEmail(opts: {
  to: string;
  token: string;
  fullName: string;
  matricule: string;
  origin: string;
}): Promise<{ sent: boolean; error?: string }> {
  const to = String(opts.to || '').trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { sent: false, error: 'invalid_email' };
  }
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return { sent: false, error: 'smtp_not_configured' };
  }
  const base = opts.origin.replace(/\/$/, '');
  const inviteUrl = `${base}/hr-invite.html?token=${encodeURIComponent(opts.token)}`;
  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: user,
      to,
      subject: 'BERAMETHODE — Invitation à rejoindre l’effectif',
      text: `Bonjour,\n\nUne invitation a été créée pour ${opts.fullName} (matricule proposé : ${opts.matricule}).\nRépondez via ce lien : ${inviteUrl}\n\n— BERAMETHODE`,
      html: `<p>Bonjour,</p><p>Invitation pour <strong>${escapeHtml(opts.fullName)}</strong> (matricule proposé : <strong>${escapeHtml(opts.matricule)}</strong>).</p><p><a href="${inviteUrl}">Ouvrir la page de réponse</a></p><p>— BERAMETHODE</p>`,
    });
    return { sent: true };
  } catch (e) {
    console.warn('[hr invitation email]', e);
    return { sent: false, error: 'send_failed' };
  }
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const postHRInvitation = async (req: Request, res: Response) => {
  const companyId = (req as any).companyId;
  const { person_id, proposed_matricule, proposed_full_name, proposed_cin, invite_email } = req.body || {};
  if (!person_id || !proposed_matricule || !proposed_full_name) {
    return res.status(400).json({
      message: 'person_id, proposed_matricule et proposed_full_name sont requis',
    });
  }
  try {
    const p = db.prepare('SELECT 1 FROM platform_person WHERE id = ?').get(person_id);
    if (!p) {
      return res.status(404).json({ message: 'person_id inconnu' });
    }
    const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 8);
    const id = newId('inv');
    db.prepare(
      `INSERT INTO hr_invitation (id, owner_id, person_id, token, proposed_matricule, proposed_full_name, proposed_cin, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`
    ).run(
      id,
      companyId,
      person_id,
      token,
      String(proposed_matricule).trim(),
      String(proposed_full_name).trim(),
      proposed_cin ? String(proposed_cin).trim() : null
    );
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = req.get('host') || 'localhost:8000';
    const origin = `${proto}://${host}`;
    const invite_url = `${origin.replace(/\/$/, '')}/hr-invite.html?token=${encodeURIComponent(token)}`;
    let emailSent = false;
    let emailError: string | undefined;
    if (invite_email) {
      const er = await trySendInvitationEmail({
        to: String(invite_email),
        token,
        fullName: String(proposed_full_name).trim(),
        matricule: String(proposed_matricule).trim(),
        origin,
      });
      emailSent = er.sent;
      emailError = er.error;
    }
    res.status(201).json({
      id,
      token,
      status: 'PENDING',
      invite_url,
      emailSent,
      emailError: emailSent ? undefined : emailError,
      respondHint: 'POST /api/hr/invitations/respond avec { token, decision } (sans cookie)',
    });
  } catch (e) {
    console.error('postHRInvitation', e);
    res.status(500).json({ message: 'Error' });
  }
};

/** Public (lien magique) — accepte ou refuse une invitation. */
export const postHRInvitationRespond = (req: Request, res: Response) => {
  const { token, decision } = req.body || {};
  if (!token || !decision) {
    return res.status(400).json({ message: 'token et decision requis' });
  }
  const d = String(decision).toUpperCase();
  if (d !== 'ACCEPT' && d !== 'REFUSE') {
    return res.status(400).json({ message: 'decision doit être ACCEPT ou REFUSE' });
  }
  try {
    const inv = db
      .prepare(`SELECT * FROM hr_invitation WHERE token = ? AND status = 'PENDING'`)
      .get(token) as
      | {
          id: string;
          owner_id: number;
          person_id: string;
          proposed_matricule: string;
          proposed_full_name: string;
          proposed_cin: string | null;
        }
      | undefined;
    if (!inv) {
      return res.status(404).json({ message: 'Invitation invalide ou déjà traitée' });
    }

    if (d === 'REFUSE') {
      db.prepare(
        `UPDATE hr_invitation SET status = 'REFUSED', responded_at = datetime('now') WHERE id = ?`
      ).run(inv.id);
      return res.json({ ok: true, status: 'REFUSED' });
    }

    const matTaken = db
      .prepare('SELECT id FROM hr_workers WHERE owner_id = ? AND matricule = ?')
      .get(inv.owner_id, inv.proposed_matricule);
    if (matTaken) {
      return res.status(409).json({ code: 'MATRICULE_TAKEN', message: 'Matricule déjà utilisé pour cette entreprise' });
    }

    const workerId = newId('hr');
    const cinVal = inv.proposed_cin || null;
    if (cinVal) {
      const cinTaken = db.prepare('SELECT id, owner_id FROM hr_workers WHERE cin = ?').get(cinVal) as
        | { id: string; owner_id: number }
        | undefined;
      if (cinTaken) {
        return res.status(409).json({
          code: 'CIN_DUPLICATE',
          message: 'CIN déjà enregistré (pas de fusion automatique — Section 23)',
          existing: cinTaken,
        });
      }
    }

    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO hr_workers (
          id, matricule, full_name, cin, owner_id, date_embauche, role, is_active,
          salaire_base, taux_horaire, taux_piece, prime_assiduite, prime_transport, mode_paiement
        ) VALUES (?, ?, ?, ?, ?, date('now'), 'OPERATOR', 1, 0, 0, 0, 0, 0, 'VIREMENT')`
      ).run(
        workerId,
        inv.proposed_matricule,
        inv.proposed_full_name,
        cinVal,
        inv.owner_id
      );
      db.prepare(
        `INSERT INTO hr_worker_person (person_id, hr_worker_id, owner_id) VALUES (?, ?, ?)`
      ).run(inv.person_id, workerId, inv.owner_id);
      db.prepare(
        `UPDATE hr_invitation SET status = 'ACCEPTED', responded_at = datetime('now') WHERE id = ?`
      ).run(inv.id);
    });
    tx();
    res.json({ ok: true, status: 'ACCEPTED', workerId });
  } catch (e) {
    console.error('postHRInvitationRespond', e);
    res.status(500).json({ message: 'Error' });
  }
};

/** Détail invitation par token (aperçu avant réponse) — sans données financières. */
export const getHRInvitationByToken = (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const inv = db
      .prepare(
        `SELECT i.id, i.status, i.proposed_matricule, i.proposed_full_name, i.proposed_cin, i.created_at, i.owner_id
         FROM hr_invitation i WHERE i.token = ?`
      )
      .get(token) as Record<string, unknown> | undefined;
    if (!inv) {
      return res.status(404).json({ message: 'Invitation inconnue' });
    }
    res.json(inv);
  } catch (e) {
    res.status(500).json({ message: 'Error' });
  }
};
