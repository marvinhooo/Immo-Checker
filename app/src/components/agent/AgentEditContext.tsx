import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getAgentFieldDefinition, type AgentSection } from '../../agent/contract';
import type { AgentFieldReview, AgentReview, AgentSource } from '../../engine/types';

export interface AgentEditContextValue {
  enabled: boolean;
  review?: AgentReview;
  setEnabled: (enabled: boolean) => void;
  confirmField: (path: string) => void;
  navigateToField: (path: string) => void;
  getFieldReview: (path: string) => AgentFieldReview | undefined;
  getSource: (sourceId: string) => AgentSource | undefined;
}

export interface AgentEditProviderProps {
  children: ReactNode;
  enabled: boolean;
  review?: AgentReview;
  onEnabledChange: (enabled: boolean) => void;
  onConfirmField: (path: string) => void;
  onNavigateToField: (path: string, section?: AgentSection) => void;
}

const AgentEditContext = createContext<AgentEditContextValue | null>(null);

export function AgentEditProvider({
  children,
  enabled,
  review,
  onEnabledChange,
  onConfirmField,
  onNavigateToField,
}: AgentEditProviderProps) {
  const value = useMemo<AgentEditContextValue>(() => {
    const sourcesById = new Map(review?.sources.map((source) => [source.id, source]) ?? []);

    return {
      enabled,
      review,
      setEnabled: onEnabledChange,
      confirmField: onConfirmField,
      navigateToField: (path) => {
        onNavigateToField(path, getAgentFieldDefinition(path)?.section);
      },
      getFieldReview: (path) => review?.fields[path],
      getSource: (sourceId) => sourcesById.get(sourceId),
    };
  }, [enabled, onConfirmField, onEnabledChange, onNavigateToField, review]);

  return (
    <AgentEditContext.Provider value={value}>
      {children}
    </AgentEditContext.Provider>
  );
}

export function useAgentEdit(): AgentEditContextValue {
  const value = useContext(AgentEditContext);
  if (!value) {
    throw new Error('useAgentEdit muss innerhalb eines AgentEditProvider verwendet werden.');
  }
  return value;
}

export function useOptionalAgentEdit(): AgentEditContextValue | null {
  return useContext(AgentEditContext);
}
