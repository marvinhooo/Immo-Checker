import { useId, useMemo } from 'react';
import {
  AGENT_FIELD_DEFINITIONS,
  getAgentCompleteness,
  getAgentFieldDefinition,
  isOpenAgentField,
} from '../../agent/contract';
import type { AgentEvidence, AgentFieldReview, AgentFieldStatus } from '../../engine/types';
import { useAgentEdit } from './AgentEditContext';

type OpenAgentStatus = Extract<AgentFieldStatus, 'missing' | 'uncertain' | 'conflict'>;

const FIELD_ORDER = new Map<string, number>(
  AGENT_FIELD_DEFINITIONS.map((definition, index) => [definition.path, index]),
);

const STATUS_VIEW: Record<OpenAgentStatus, {
  label: string;
  badgeClassName: string;
  itemClassName: string;
  dotClassName: string;
}> = {
  missing: {
    label: 'Fehlt',
    badgeClassName: 'border-amber-200 bg-amber-50 text-amber-800',
    itemClassName: 'border-amber-200 bg-amber-50/40',
    dotClassName: 'bg-amber-500',
  },
  uncertain: {
    label: 'Bitte prüfen',
    badgeClassName: 'border-violet-200 bg-violet-50 text-violet-800',
    itemClassName: 'border-violet-200 bg-violet-50/40',
    dotClassName: 'bg-violet-500',
  },
  conflict: {
    label: 'Widerspruch',
    badgeClassName: 'border-rose-200 bg-rose-50 text-rose-800',
    itemClassName: 'border-rose-200 bg-rose-50/40',
    dotClassName: 'bg-rose-500',
  },
};

export interface AgentReviewPanelProps {
  className?: string;
}

function isSafeWebUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function AgentEvidenceDetails({
  evidence,
}: {
  evidence: AgentEvidence[];
}) {
  const { getSource } = useAgentEdit();
  if (evidence.length === 0) return null;

  return (
    <details className="agent-review-evidence rounded-lg border border-slate-200 bg-white/80 px-3 py-2">
      <summary className="min-h-6 cursor-pointer text-xs font-semibold text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30">
        Quellen &amp; Belege ({evidence.length})
      </summary>
      <ul className="mt-2 space-y-2" aria-label="Quellen und Belege">
        {evidence.map((item, index) => {
          const source = getSource(item.sourceId);
          const sourceLabel = source?.label ?? item.sourceId;
          return (
            <li key={`${item.sourceId}-${item.page ?? 'ohne-seite'}-${index}`} className="text-xs leading-relaxed text-slate-600">
              <div className="font-semibold text-slate-700">
                {source && isSafeWebUrl(source.url) ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-slate-300 underline-offset-2 hover:text-blue-700"
                  >
                    {sourceLabel}
                  </a>
                ) : sourceLabel}
                {item.page ? ` · Seite ${item.page}` : ''}
                {item.locator ? ` · ${item.locator}` : ''}
              </div>
              {item.excerpt && (
                <blockquote className="mt-1 border-l-2 border-slate-200 pl-2 text-slate-500">
                  {item.excerpt}
                </blockquote>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function AgentReviewItem({
  path,
  field,
}: {
  path: string;
  field: AgentFieldReview;
}) {
  const { confirmField, navigateToField } = useAgentEdit();
  const definition = getAgentFieldDefinition(path);
  const label = definition?.label ?? path;
  const status = field.status as OpenAgentStatus;
  const view = STATUS_VIEW[status];

  return (
    <li className={`agent-review-field agent-review-field--${status} rounded-xl border p-3.5 ${view.itemClassName}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              className={`agent-review-pulse-soft h-2.5 w-2.5 shrink-0 rounded-full motion-safe:animate-pulse motion-reduce:animate-none [animation-duration:2.8s] ${view.dotClassName}`}
            />
            <span className="font-semibold text-slate-800">{label}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${view.badgeClassName}`}>
              {view.label}
            </span>
            {field.required && (
              <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Pflichtangabe
              </span>
            )}
          </div>
          {field.reason && (
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{field.reason}</p>
          )}
          {field.confidence !== undefined && (
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Agent-Sicherheit: {Math.round(field.confidence * 100)} %
            </p>
          )}
        </div>
      </div>

      {field.evidence.length > 0 && (
        <div className="mt-3">
          <AgentEvidenceDetails evidence={field.evidence} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => navigateToField(path)}
          aria-label={`Zum Eingabebereich ${label}`}
          className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
        >
          Zum Eingabebereich
        </button>
        <button
          type="button"
          onClick={() => confirmField(path)}
          aria-label={`${label} als geprüft markieren`}
          className="min-h-10 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
        >
          Als geprüft markieren
        </button>
      </div>
    </li>
  );
}

export function AgentReviewPanel({ className = '' }: AgentReviewPanelProps) {
  const {
    enabled,
    review,
    setEnabled,
    navigateToField,
  } = useAgentEdit();
  const headingId = useId();
  const completeness = getAgentCompleteness(review);
  const openFields = useMemo(
    () => Object.entries(review?.fields ?? {})
      .filter((entry) => isOpenAgentField(entry[1]))
      .sort(([leftPath], [rightPath]) =>
        (FIELD_ORDER.get(leftPath) ?? Number.MAX_SAFE_INTEGER)
        - (FIELD_ORDER.get(rightPath) ?? Number.MAX_SAFE_INTEGER)),
    [review],
  );

  return (
    <section
      aria-labelledby={headingId}
      className={`agent-review-panel rounded-xl border border-slate-200 bg-white p-4 shadow-xs ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={headingId} className="text-sm font-bold text-slate-900">Agent Edit Mode</h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Fehlende, unsichere oder widersprüchliche Angaben gezielt prüfen.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Agent Edit Mode"
          disabled={!review}
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-8 w-14 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40 ${enabled ? 'bg-blue-600' : 'bg-slate-300'}`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none mt-0.5 inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0.5'}`}
          />
        </button>
      </div>

      {!review ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Für dieses Szenario liegen keine Agent-Prüfdaten vor.
        </p>
      ) : (
        <div className="mt-4" aria-live="polite">
          {review.warnings && review.warnings.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
              <p className="font-bold">Hinweise des Agenten</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4">
                {review.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
              {completeness.missing} fehlen
            </span>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-violet-800">
              {completeness.uncertain} prüfen
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-800">
              {completeness.conflicts} Widersprüche
            </span>
          </div>

          {enabled && (
            <>
              {openFields.length > 0 ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                    <p className="text-xs font-medium text-slate-600">
                      {completeness.requiredOpen} offene Pflichtangaben
                      {completeness.provisional ? ' · Auswertung vorläufig' : ' · nur optionale Hinweise offen'}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigateToField(openFields[0][0])}
                      className="min-h-10 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/30"
                    >
                      Nächstes offenes Feld
                    </button>
                  </div>
                  <ul className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto pr-1" aria-label="Offene Agent-Prüfungen">
                    {openFields.map(([path, field]) => (
                      <AgentReviewItem key={path} path={path} field={field} />
                    ))}
                  </ul>
                </>
              ) : (
                <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-800">
                  Alle Agent-Angaben sind geprüft.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
