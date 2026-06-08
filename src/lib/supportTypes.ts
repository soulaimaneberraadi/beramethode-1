// Types partagés du système de support (tickets + chat).
// Copie identique côté Bera-master-admin (src/lib/supportTypes.ts) — garder synchronisé.

export type SupportKind = 'page' | 'connexion' | 'question';
export type SupportStatus = 'nouveau' | 'en_cours' | 'resolu';
export type SupportSender = 'master' | 'user';

export interface SupportTicket {
  id?: string;
  tenant_id?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  kind: SupportKind;
  message: string;
  view?: string | null;
  url?: string | null;
  context?: Record<string, unknown> | null;
  status: SupportStatus;
  last_message_at?: string;
  user_last_read_at?: string | null;
  master_last_read_at?: string | null;
  created_at?: string;
}

export interface SupportMessage {
  id?: string;
  ticket_id: string;
  sender: SupportSender;
  text: string;
  created_at?: string;
}

// Noms de canaux Broadcast (zéro charge DB) :
//  - le worker écoute `support_user_<userId>` pour les réponses du master ;
//  - le master écoute `support_master` pour les nouveaux tickets/messages.
export const userChannel = (userId: string) => `support_user_${userId}`;
export const MASTER_CHANNEL = 'support_master';
export const SUPPORT_EVENT = 'support_ping';
