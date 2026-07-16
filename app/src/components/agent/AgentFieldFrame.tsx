import type { ReactNode } from 'react';
import { getAgentFieldDefinition, isOpenAgentField } from '../../agent/contract';
import { useOptionalAgentEdit } from './AgentEditContext';

const STATUS_LABELS = {
  missing: 'Eingabe fehlt',
  uncertain: 'Bitte prüfen',
  conflict: 'Widerspruch prüfen',
} as const;

export interface AgentFieldFrameProps {
  path: string;
  children: ReactNode;
  className?: string;
}

/** Markiert genau das Eingabefeld, das laut Agent-Review noch Aufmerksamkeit braucht. */
export function AgentFieldFrame({ path, children, className = '' }: AgentFieldFrameProps) {
  const agentEdit = useOptionalAgentEdit();
  const field = agentEdit?.getFieldReview(path);
  const isOpen = Boolean(agentEdit?.enabled && field && isOpenAgentField(field));
  const status = isOpen && field ? field.status as keyof typeof STATUS_LABELS : undefined;
  const definition = getAgentFieldDefinition(path);

  return (
    <div
      data-agent-path={path}
      data-agent-status={status}
      className={`agent-field-frame ${isOpen ? `agent-field-frame--${status}` : ''} ${className}`.trim()}
    >
      {children}
      {status && (
        <span className="agent-field-status" aria-live="polite">
          {STATUS_LABELS[status]}{definition?.unit ? ` · ${definition.unit}` : ''}
        </span>
      )}
    </div>
  );
}
