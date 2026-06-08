import { supabase } from './supabaseClient';
import { getRecentLogs } from './diagnostics';
import type { ErrorReport } from '../../components/ErrorBoundary';
import {
  type SupportTicket,
  type SupportMessage,
  type SupportKind,
  MASTER_CHANNEL,
  userChannel,
  SUPPORT_EVENT,
} from './supportTypes';

const TICKETS = 'support_tickets';
const MESSAGES = 'support_messages';

// TODO(phases 3-6): renseigner tenant_id quand le modèle entreprise existera.
// Pour l'instant l'isolation se fait par user_id (auth.uid()).
const currentTenantId = (): string | null => null;

const currentUser = async (): Promise<{ id: string | null; email: string | null }> => {
  try {
    const { data } = await supabase.auth.getUser();
    return { id: data.user?.id ?? null, email: data.user?.email ?? null };
  } catch {
    return { id: null, email: null };
  }
};

// ─── Canal Broadcast pour notifier le master (zéro charge DB) ──────────────────
let masterCh: ReturnType<typeof supabase.channel> | null = null;
const pingMaster = async (payload: Record<string, unknown>) => {
  try {
    if (!masterCh) {
      masterCh = supabase.channel(MASTER_CHANNEL);
      await new Promise<void>((resolve) => masterCh!.subscribe(() => resolve()));
    }
    await masterCh.send({ type: 'broadcast', event: SUPPORT_EVENT, payload });
  } catch {
    /* hors-ligne : le master verra le ticket au prochain rafraîchissement */
  }
};

// ─── Création de ticket ────────────────────────────────────────────────────────

/** Crée un ticket à partir d'un rapport d'ErrorBoundary (bouton « Signaler »). */
export const createTicketFromReport = async (report: ErrorReport): Promise<string | null> => {
  const user = await currentUser();
  const context = {
    stack: report.stack,
    component_stack: report.componentStack,
    user_agent: report.userAgent,
    logs: getRecentLogs(),
  };
  return insertTicket({
    kind: report.kind,
    message: report.message,
    view: report.view ?? null,
    url: report.url,
    context,
  }, user);
};

/** Crée un ticket manuel (question / demande d'aide depuis l'app). */
export const createTicket = async (message: string, kind: SupportKind = 'question', view?: string): Promise<string | null> => {
  const user = await currentUser();
  return insertTicket({ kind, message, view: view ?? null, url: typeof location !== 'undefined' ? location.href : '' }, user);
};

const insertTicket = async (
  partial: Pick<SupportTicket, 'kind' | 'message' | 'view'> & Partial<SupportTicket>,
  user: { id: string | null; email: string | null },
): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from(TICKETS)
      .insert({
        tenant_id: currentTenantId(),
        user_id: user.id,
        user_email: user.email,
        status: 'nouveau',
        user_last_read_at: new Date().toISOString(),
        ...partial,
      })
      .select('id')
      .single();
    if (error) { console.warn('[support] createTicket failed:', error.message); return null; }
    await pingMaster({ type: 'ticket', ticket_id: data.id });
    return data.id as string;
  } catch (e) {
    console.warn('[support] createTicket error:', e);
    return null;
  }
};

// ─── Lecture ───────────────────────────────────────────────────────────────────

export const listMyTickets = async (): Promise<SupportTicket[]> => {
  const { data, error } = await supabase
    .from(TICKETS)
    .select('*')
    .order('last_message_at', { ascending: false })
    .limit(100);
  if (error) { console.warn('[support] listMyTickets:', error.message); return []; }
  return (data as SupportTicket[]) || [];
};

export const listMessages = async (ticketId: string): Promise<SupportMessage[]> => {
  const { data, error } = await supabase
    .from(MESSAGES)
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) { console.warn('[support] listMessages:', error.message); return []; }
  return (data as SupportMessage[]) || [];
};

// ─── Écriture ──────────────────────────────────────────────────────────────────

export const sendUserMessage = async (ticketId: string, text: string): Promise<boolean> => {
  const t = text.trim();
  if (!t) return false;
  const { error } = await supabase.from(MESSAGES).insert({ ticket_id: ticketId, sender: 'user', text: t });
  if (error) { console.warn('[support] sendUserMessage:', error.message); return false; }
  await markTicketReadByUser(ticketId);
  await pingMaster({ type: 'message', ticket_id: ticketId });
  return true;
};

export const markTicketReadByUser = async (ticketId: string): Promise<void> => {
  try {
    await supabase.from(TICKETS).update({ user_last_read_at: new Date().toISOString() }).eq('id', ticketId);
  } catch { /* non bloquant */ }
};

// ─── Temps réel (Broadcast) ────────────────────────────────────────────────────

/** Écoute les réponses du master pour ce worker. Retourne une fonction de désinscription. */
export const subscribeUserSupport = (userId: string, onPing: () => void): (() => void) => {
  const ch = supabase.channel(userChannel(userId));
  ch.on('broadcast', { event: SUPPORT_EVENT }, () => onPing()).subscribe();
  return () => { try { supabase.removeChannel(ch); } catch { /* ignore */ } };
};

// ─── Aide UI : ticket non lu côté worker ───────────────────────────────────────

export const isUnreadForUser = (t: SupportTicket): boolean => {
  const last = t.last_message_at ? new Date(t.last_message_at).getTime() : 0;
  const read = new Date(t.user_last_read_at ?? t.created_at ?? 0).getTime();
  return last > read;
};

export const countUnreadForUser = (tickets: SupportTicket[]): number =>
  tickets.reduce((n, t) => n + (isUnreadForUser(t) ? 1 : 0), 0);
