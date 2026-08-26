import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Icon } from '@iconify/react';
import { SanaLogoIcon } from './SanaLogoIcon';

interface Props {
  children: ReactNode;
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
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('prosana Uncaught Application Error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetState = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn('Could not clear storage:', e);
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full min-h-screen bg-[#f8f9fb] flex flex-col items-center justify-center p-6 text-center select-none font-sans">
          <div className="mb-4">
            <SanaLogoIcon size={40} color="#121316" />
          </div>

          <span className="text-xs font-bold uppercase tracking-wider text-rose-500 bg-rose-50 border border-rose-200/60 px-2.5 py-1 rounded-full mb-3">
            Interface Recovery
          </span>

          <h2 className="text-xl font-bold tracking-tight text-[#121316] mb-2">
            Something went wrong while rendering
          </h2>
          <p className="text-xs text-slate-500 max-w-sm mb-6 leading-relaxed">
            prosana encountered a client-side execution interruption. Your persisted data in Firestore remains completely safe.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full max-w-xs mb-4">
            <button
              onClick={this.handleReload}
              className="w-full py-3 px-4 rounded-xl bg-[#121316] text-white text-xs font-semibold hover:bg-black transition-colors flex items-center justify-center space-x-2 shadow-md shadow-slate-900/10 cursor-pointer"
            >
              <Icon icon="solar:restart-bold" className="w-4 h-4" />
              <span>Reload Application</span>
            </button>
            <button
              onClick={this.handleResetState}
              className="w-full py-3 px-4 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Icon icon="solar:trash-bin-trash-bold" className="w-4 h-4 text-slate-400" />
              <span>Clear Cache & Reset</span>
            </button>
          </div>

          {this.state.error && (
            <div className="mt-4 p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-left max-w-md w-full overflow-x-auto text-[11px] font-mono text-slate-700">
              <p className="font-semibold text-rose-600 mb-1">{this.state.error.toString()}</p>
              {this.state.error.stack && (
                <pre className="text-[10px] text-slate-500 whitespace-pre-wrap max-h-36 overflow-y-auto">
                  {this.state.error.stack}
                </pre>
              )}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
