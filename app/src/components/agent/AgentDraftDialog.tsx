import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  createAgentDraftExample,
  parseAgentDraft,
  type AgentDraftEnvelope,
} from '../../agent/draft';

export const AGENT_DRAFT_EXAMPLE_JSON = JSON.stringify(createAgentDraftExample(), null, 2);

export interface AgentDraftDialogProps {
  open: boolean;
  onClose: () => void;
  onDraftReady: (draft: AgentDraftEnvelope) => void;
  initialValue?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Der Agent-Entwurf konnte nicht gelesen werden.';
}

export function AgentDraftDialog({
  open,
  onClose,
  onDraftReady,
  initialValue = '',
}: AgentDraftDialogProps) {
  const [jsonText, setJsonText] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useEffect(() => {
    if (!open) return;
    setJsonText(initialValue);
    setError(null);

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const frame = requestAnimationFrame(() => textareaRef.current?.focus());
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleEscape);
      previousFocus?.focus();
    };
  }, [initialValue, onClose, open]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const parsed = parseAgentDraft(jsonText);
      setError(null);
      onDraftReady(parsed);
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const keepFocusInside = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href]',
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={keepFocusInside}
        className="agent-draft-dialog flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 id={titleId} className="text-lg font-bold text-slate-900">Agent-Entwurf importieren</h2>
          <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-slate-500">
            Fügen Sie einen Agent-Draft als JSON ein. Der Dialog prüft nur das Format und speichert selbst nichts.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="agent-draft-json" className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Agent-Entwurf als JSON
              </label>
              <button
                type="button"
                onClick={() => {
                  setJsonText(AGENT_DRAFT_EXAMPLE_JSON);
                  setError(null);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
                className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
              >
                Beispiel einsetzen
              </button>
            </div>
            <textarea
              ref={textareaRef}
              id="agent-draft-json"
              value={jsonText}
              onChange={(event) => {
                setJsonText(event.target.value);
                if (error) setError(null);
              }}
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
              rows={18}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder={'{ "format": "immo-checker-agent-draft", ... }'}
              className={`mt-2 w-full resize-y rounded-xl border bg-slate-950 px-4 py-3 font-mono text-sm leading-relaxed text-slate-100 shadow-inner focus:outline-none focus:ring-4 ${error ? 'border-rose-500 focus:border-rose-400 focus:ring-rose-500/15' : 'border-slate-700 focus:border-blue-500 focus:ring-blue-500/15'}`}
            />
            {error && (
              <p id={errorId} role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={jsonText.trim() === ''}
              className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Entwurf prüfen und übernehmen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
