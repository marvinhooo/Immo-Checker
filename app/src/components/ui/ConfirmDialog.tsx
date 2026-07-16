import { useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' färbt Icon und Bestätigungsbutton rot (z. B. Überschreiben/Löschen). */
  tone?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  tone = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = requestAnimationFrame(() => confirmRef.current?.focus());
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleEscape);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleEscape);
      previousFocus?.focus();
    };
  }, [onCancel, open]);

  if (!open) return null;

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled])',
    ) ?? []);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const isDanger = tone === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onKeyDown={keepFocusInside}
        className="toast-in w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start gap-3.5 px-5 pt-5 sm:px-6">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              isDanger ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
            }`}
          >
            <AlertTriangle size={19} />
          </div>
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-slate-900">{title}</h2>
            <p id={messageId} className="mt-1 text-sm leading-relaxed text-slate-500">
              {message}
            </p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={`min-h-11 rounded-lg px-4 py-2.5 text-sm font-bold text-white transition focus:outline-none focus-visible:ring-2 ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500/30'
                : 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500/30'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
