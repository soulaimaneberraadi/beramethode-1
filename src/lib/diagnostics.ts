/**
 * Journal circulaire léger (breadcrumbs) pour le système de réclamations.
 *
 * Capture les derniers messages console (error/warn/log), les erreurs non
 * gérées (window 'error') et les rejets de promesses ('unhandledrejection').
 * Ces traces sont jointes à un rapport de réclamation pour diagnostiquer un
 * bug sans avoir à le reproduire — bien plus utile qu'une capture d'écran.
 */

export interface LogEntry {
  level: 'log' | 'warn' | 'error';
  text: string;
  at: string; // ISO
}

const MAX_ENTRIES = 60;
const buffer: LogEntry[] = [];
let installed = false;

const push = (level: LogEntry['level'], args: unknown[]) => {
  try {
    const text = args
      .map(a => {
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
      })
      .join(' ')
      .slice(0, 1000);
    buffer.push({ level, text, at: new Date().toISOString() });
    if (buffer.length > MAX_ENTRIES) buffer.shift();
  } catch {
    /* ne jamais laisser la capture casser l'app */
  }
};

/** Installe les hooks de capture. Idempotent — appeler une fois au démarrage. */
export const initDiagnostics = () => {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  (['log', 'warn', 'error'] as const).forEach(level => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      push(level, args);
      original(...args);
    };
  });

  window.addEventListener('error', (e) => {
    push('error', [`[window.error] ${e.message}`, e.filename ? `@ ${e.filename}:${e.lineno}` : '']);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    push('error', ['[unhandledrejection]', reason instanceof Error ? `${reason.name}: ${reason.message}` : reason]);
  });
};

/** Renvoie une copie des dernières traces capturées. */
export const getRecentLogs = (): LogEntry[] => buffer.slice();
