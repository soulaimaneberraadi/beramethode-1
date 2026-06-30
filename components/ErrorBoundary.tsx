import React, { Component, ErrorInfo, ReactNode } from 'react';
import { tx } from '../lib/i18n';
import { LanguageContext } from '../src/context/LanguageContext';

/**
 * Charge utile transmise au système de réclamations (futur) lorsqu'un
 * utilisateur signale un problème. Contient assez de contexte pour diagnostiquer
 * sans avoir à reproduire le bug.
 */
export interface ErrorReport {
  message: string;
  stack?: string;
  componentStack?: string;
  kind: 'connexion' | 'page';
  view?: string;
  url: string;
  userAgent: string;
  at: string; // ISO timestamp
}

interface Props {
  children?: ReactNode;
  /**
   * `inline` : le fallback remplit son conteneur (une page dans <main>) au lieu
   * de prendre tout l'écran. Permet d'isoler le crash d'une page sans tuer la
   * barre de navigation ni le reste de l'application.
   */
  inline?: boolean;
  /** Identifie la zone (ex. la vue courante) — joint au rapport. */
  view?: string;
  /** Hook optionnel pour le futur système de réclamations. */
  onReport?: (report: ErrorReport) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  reported: boolean;
}

/**
 * Détecte si l'erreur provient d'un problème réseau / Supabase injoignable
 * plutôt que d'un vrai bug dans le code de la page.
 */
const isConnectionError = (err: Error | null): boolean => {
  const m = (err?.message || '').toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('load failed') ||
    m.includes('connexion') ||
    m.includes('timeout') ||
    m.includes('supabase')
  );
};

export class ErrorBoundary extends Component<Props, State> {
  static contextType = LanguageContext;
  declare context: React.ContextType<typeof LanguageContext>;
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    reported: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });

    // Rapport automatique best-effort vers /api/errors/report.
    // On ne lève jamais d'exception ici : un crash dans componentDidCatch
    // provoquerait une boucle infinie et masquerait l'erreur originale.
    fetch('/api/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        component_stack: errorInfo.componentStack,
        url: typeof window !== 'undefined' ? window.location.href : '',
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }),
    }).catch(() => {});
  }

  private buildReport = (kind: 'connexion' | 'page'): ErrorReport => ({
    message: this.state.error?.message || tx(this.context?.lang || 'fr', {fr:'Erreur inconnue',ar:'خطأ غير معروف',en:'Unknown error',es:'Error desconocido',pt:'Erro desconhecido',tr:'Bilinmeyen hata'}),
    stack: this.state.error?.stack,
    componentStack: this.state.errorInfo?.componentStack || undefined,
    kind,
    view: this.props.view,
    url: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    at: new Date().toISOString(),
  });

  /** Réessaie sans recharger toute l'application : on remet juste la page. */
  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, reported: false });
  };

  private handleReport = (kind: 'connexion' | 'page') => {
    const report = this.buildReport(kind);
    try {
      this.props.onReport?.(report);
    } catch (e) {
      console.warn('onReport handler failed', e);
    }
    this.setState({ reported: true });
  };

  private isDark(): boolean {
    return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  }

  public render() {
    if (!this.state.hasError) return this.props.children;

    const err = this.state.error;
    const connection = isConnectionError(err);
    const kind: 'connexion' | 'page' = connection ? 'connexion' : 'page';
    const inline = this.props.inline;
    const dark = this.isDark();

    const _ = (m: {fr:string;ar:string;en:string;es:string;pt:string;tr:string}) => tx(this.context?.lang || 'fr', m);

    return (
      <div className={`p-6 flex items-center justify-center overflow-auto bg-[#fafafa] dark:bg-dk-bg dark:text-dk-text ${inline ? 'h-full w-full' : 'h-screen'}`}>
        <div className="bg-white dark:bg-dk-surface dark:border-red-900" style={{ maxWidth: 520, width: '100%', border: dark ? '1px solid #7f1d1d' : '1px solid #fecaca', borderRadius: 16, padding: 24, boxShadow: dark ? '0 4px 24px rgba(0,0,0,0.3)' : '0 4px 24px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{connection ? '📡' : '⚠️'}</div>
          <h2 className="dark:text-dk-text" style={{ margin: '0 0 6px', color: dark ? '#fca5a5' : '#b91c1c', fontSize: 18, fontWeight: 800 }}>
            {connection ? _( {fr:'Problème de connexion',ar:'مشكلة في الاتصال',en:'Connection problem',es:'Problema de conexión',pt:'Problema de conexão',tr:'Bağlantı sorunu'} ) : _( {fr:'Cette page a rencontré une erreur',ar:'واجهت هذه الصفحة خطأً',en:'This page encountered an error',es:'Esta página encontró un error',pt:'Esta página encontrou um erro',tr:'Bu sayfada bir hata oluştu'} )}
          </h2>
          <p className="dark:text-dk-text-soft" style={{ margin: '0 0 16px', color: dark ? '#94a3b8' : '#6b7280', fontSize: 14, lineHeight: 1.5 }}>
            {connection
              ? _( {fr:"Impossible de joindre le serveur. Vérifiez votre connexion Internet — le reste de l'application continue de fonctionner.",ar:"تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت — بقية التطبيق يستمر في العمل.",en:"Unable to reach the server. Check your Internet connection — the rest of the app keeps working.",es:"No se puede conectar al servidor. Verifique su conexión a Internet — el resto de la aplicación sigue funcionando.",pt:"Não foi possível contactar o servidor. Verifique sua conexão com a Internet — o resto do aplicativo continua funcionando.",tr:"Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin — uygulamanın geri kalanı çalışmaya devam ediyor."} )
              : _( {fr:"Le problème est limité à cette page. Vous pouvez réessayer ou revenir au menu sans perdre votre travail.",ar:"المشكلة محصورة في هذه الصفحة. يمكنك إعادة المحاولة أو العودة إلى القائمة دون فقدان عملك.",en:"The problem is limited to this page. You can retry or go back to the menu without losing your work.",es:"El problema se limita a esta página. Puede reintentar o volver al menú sin perder su trabajo.",pt:"O problema está limitado a esta página. Pode tentar novamente ou voltar ao menu sem perder o seu trabalho.",tr:"Sorun bu sayfayla sınırlıdır. Çalışmanızı kaybetmeden yeniden deneyebilir veya menüye dönebilirsiniz."} )}
          </p>

          {err?.message && (
            <pre className="dark:bg-red-950 dark:text-red-400" style={{ background: dark ? '#450a0a' : '#fef2f2', padding: 12, borderRadius: 8, color: dark ? '#fca5a5' : '#b91c1c', fontSize: 12, overflow: 'auto', maxHeight: '24vh', margin: '0 0 12px' }}>
              {err.message}
            </pre>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={this.handleRetry}
              style={{ padding: '10px 16px', fontWeight: 700, borderRadius: 8, border: 'none', background: dark ? '#059669' : '#10b981', color: '#fff', cursor: 'pointer' }}
            >
              {_({fr:'Réessayer',ar:'إعادة المحاولة',en:'Retry',es:'Reintentar',pt:'Tentar novamente',tr:'Yeniden dene'})}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="dark:bg-dk-surface dark:border-dk-border dark:text-dk-text"
              style={{ padding: '10px 16px', fontWeight: 700, borderRadius: 8, border: dark ? '1px solid #374151' : '1px solid #d1d5db', background: dark ? '#2a3a34' : '#fff', color: dark ? '#e2e8f0' : '#374151', cursor: 'pointer' }}
            >
              {_({fr:'Recharger',ar:'إعادة تحميل',en:'Reload',es:'Recargar',pt:'Recarregar',tr:'Yenile'})}
            </button>
            <button
              type="button"
              disabled={this.state.reported}
              onClick={() => this.handleReport(kind)}
              style={{ padding: '10px 16px', fontWeight: 700, borderRadius: 8, border: dark ? '1px solid #fca5a5' : '1px solid #b91c1c', background: this.state.reported ? (dark ? '#374151' : '#f3f4f6') : (dark ? '#2a3a34' : '#fff'), color: this.state.reported ? (dark ? '#6b7280' : '#9ca3af') : (dark ? '#fca5a5' : '#b91c1c'), cursor: this.state.reported ? 'default' : 'pointer' }}
            >
              {this.state.reported ? '✓ ' + _({fr:'Problème signalé',ar:'تم الإبلاغ',en:'Reported',es:'Reportado',pt:'Reportado',tr:'Raporlandı'}) : _({fr:'Signaler le problème',ar:'الإبلاغ عن المشكلة',en:'Report issue',es:'Reportar problema',pt:'Reportar problema',tr:'Sorunu bildir'})}
            </button>
          </div>

          {this.state.reported && (
            <p className="dark:text-dk-text" style={{ margin: '12px 0 0', color: dark ? '#34d399' : '#059669', fontSize: 13 }}>
              {_({fr:'Merci, votre signalement a bien été enregistré. Nous le traitons au plus vite.',ar:'شكراً، تم تسجيل بلاغك بنجاح. سنعالجه في أقرب وقت.',en:'Thank you, your report has been recorded. We will process it as soon as possible.',es:'Gracias, su reporte ha sido registrado. Lo procesaremos lo antes posible.',pt:'Obrigado, seu relato foi registrado. Processaremos o mais rápido possível.',tr:'Teşekkürler, raporunuz kaydedildi. En kısa sürede işleme alacağız.'})}
            </p>
          )}

          <details className="dark:text-dk-text-soft" style={{ whiteSpace: 'pre-wrap', marginTop: 16, color: dark ? '#94a3b8' : '#6b7280', fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{_({fr:'Détails techniques',ar:'تفاصيل تقنية',en:'Technical details',es:'Detalles técnicos',pt:'Detalhes técnicos',tr:'Teknik detaylar'})}</summary>
            {err?.toString()}
            {this.state.errorInfo?.componentStack}
          </details>
        </div>
      </div>
    );
  }
}
