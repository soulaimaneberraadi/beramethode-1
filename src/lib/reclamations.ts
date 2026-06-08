import { supabase } from './supabaseClient';
import { getRecentLogs } from './diagnostics';
import type { ErrorReport } from '../../components/ErrorBoundary';

/**
 * Enregistre une réclamation dans Supabase (table `public.reclamations`).
 *
 * Enrichit le rapport de l'ErrorBoundary avec l'utilisateur courant, la taille
 * d'écran et les dernières traces console, puis l'insère. Tout est défensif :
 * un échec d'envoi ne doit jamais relancer une erreur dans l'app déjà en panne.
 *
 * Retourne `true` si l'insertion a réussi.
 */
export const submitReclamation = async (report: ErrorReport): Promise<boolean> => {
  try {
    let userId: string | null = null;
    let userEmail: string | null = null;
    try {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      userEmail = data.user?.email ?? null;
    } catch {
      /* hors-ligne ou non connecté : on envoie quand même, sans identité */
    }

    const screen =
      typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '';

    const { error } = await supabase.from('reclamations').insert({
      user_id: userId,
      user_email: userEmail,
      kind: report.kind,
      message: report.message,
      view: report.view ?? null,
      url: report.url,
      stack: report.stack ?? null,
      component_stack: report.componentStack ?? null,
      logs: getRecentLogs(),
      user_agent: report.userAgent,
      screen,
    });

    if (error) {
      console.warn('[reclamations] insert failed:', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[reclamations] submit error:', e);
    return false;
  }
};
