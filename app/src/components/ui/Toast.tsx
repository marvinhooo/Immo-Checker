import { useEffect } from 'react';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

export interface ToastProps {
  message: string;
  onDismiss: () => void;
  /** Anzeigedauer in ms; null bleibt bis zum manuellen Schliessen sichtbar. */
  durationMs?: number | null;
  tone?: 'success' | 'warning';
}

export function Toast({ message, onDismiss, durationMs = 4000, tone = 'success' }: ToastProps) {
  useEffect(() => {
    if (durationMs === null) return undefined;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, message, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:justify-end sm:px-0">
      <div
        role={tone === 'warning' ? 'alert' : 'status'}
        aria-live={tone === 'warning' ? 'assertive' : 'polite'}
        className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg"
      >
        <span className={`mt-0.5 shrink-0 ${tone === 'warning' ? 'text-amber-600' : 'text-emerald-600'}`}>
          {tone === 'warning' ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
        </span>
        <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-800">{message}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Hinweis schließen"
          className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
