import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      const err = this.state.error;
      return (
        <div style={{ padding: '20px', background: '#ffebee', color: '#c62828', height: '100vh', overflow: 'auto' }}>
          <h2 style={{ marginTop: 0 }}>Oops, there is an error!</h2>
          {err?.message && (
            <pre style={{ background: '#fff', padding: '12px', borderRadius: '8px', color: '#b71c1c', fontSize: '13px', overflow: 'auto', maxHeight: '40vh' }}>
              {err.message}
            </pre>
          )}
          <details style={{ whiteSpace: 'pre-wrap', marginTop: '12px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Détails techniques</summary>
            {err && err.toString()}
            <br />
            {this.state.errorInfo?.componentStack}
          </details>
          <button
            type="button"
            style={{ marginTop: '16px', padding: '10px 16px', fontWeight: 700, borderRadius: '8px', border: '1px solid #c62828', background: '#fff', color: '#c62828', cursor: 'pointer' }}
            onClick={() => window.location.reload()}
          >
            Recharger la page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
