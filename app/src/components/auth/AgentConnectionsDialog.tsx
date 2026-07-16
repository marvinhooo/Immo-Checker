import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OAuthGrant } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export interface AgentConnectionsDialogProps {
  open: boolean;
  userId: string;
  onClose: () => void;
}

interface AgentGrantRow {
  client_id: string;
  created_at: string;
}

interface ConnectionView {
  clientId: string;
  oauthGrant?: OAuthGrant;
  agentGrant?: AgentGrantRow;
}

const LOAD_ERROR = 'Die Agent-Verbindungen konnten nicht geladen werden. Bitte versuche es erneut.';

function formatGrantedAt(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function AgentConnectionsDialog({ open, userId, onClose }: AgentConnectionsDialogProps) {
  const [oauthGrants, setOauthGrants] = useState<OAuthGrant[]>([]);
  const [agentGrants, setAgentGrants] = useState<AgentGrantRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [revokingClientId, setRevokingClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setOauthGrants([]);
    setAgentGrants([]);
    try {
      const [oauthResult, agentResult] = await Promise.all([
        supabase.auth.oauth.listGrants(),
        supabase
          .from('agent_oauth_grants')
          .select('client_id, created_at')
          .eq('user_id', userId),
      ]);

      if (oauthResult.error || agentResult.error) {
        setError(LOAD_ERROR);
        return;
      }

      setOauthGrants(oauthResult.data ?? []);
      setAgentGrants((agentResult.data ?? []).filter((row): row is AgentGrantRow => (
        typeof row?.client_id === 'string' && typeof row?.created_at === 'string'
      )));
    } catch {
      setError(LOAD_ERROR);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open) void loadConnections();
  }, [loadConnections, open]);

  const connections = useMemo<ConnectionView[]>(() => {
    const byClient = new Map<string, ConnectionView>();
    for (const grant of oauthGrants) {
      byClient.set(grant.client.id, { clientId: grant.client.id, oauthGrant: grant });
    }
    for (const grant of agentGrants) {
      const existing = byClient.get(grant.client_id);
      byClient.set(grant.client_id, {
        clientId: grant.client_id,
        oauthGrant: existing?.oauthGrant,
        agentGrant: grant,
      });
    }
    return Array.from(byClient.values()).sort((left, right) => {
      const leftName = left.oauthGrant?.client.name ?? left.clientId;
      const rightName = right.oauthGrant?.client.name ?? right.clientId;
      return leftName.localeCompare(rightName, 'de');
    });
  }, [agentGrants, oauthGrants]);

  const revokeConnection = async (connection: ConnectionView) => {
    setRevokingClientId(connection.clientId);
    setError(null);
    let agentAccessRevoked = !connection.agentGrant;

    try {
      if (connection.agentGrant) {
        const { error: grantError } = await supabase
          .from('agent_oauth_grants')
          .delete()
          .match({ user_id: userId, client_id: connection.clientId });
        if (grantError) throw grantError;
        agentAccessRevoked = true;
      }

      if (connection.oauthGrant) {
        const { error: oauthError } = await supabase.auth.oauth.revokeGrant({
          clientId: connection.clientId,
        });
        if (oauthError) throw oauthError;
      }

      await loadConnections();
    } catch {
      await loadConnections();
      setError(agentAccessRevoked
        ? 'Der Immo-MCP-Zugriff ist gesperrt. Die verbleibende OAuth-Freigabe konnte noch nicht entfernt werden; bitte erneut versuchen.'
        : 'Die Verbindung konnte nicht getrennt werden. Bitte versuche es erneut.');
    } finally {
      setRevokingClientId(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-connections-title"
    >
      <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Kontogebundener Zugriff</p>
            <h2 id="agent-connections-title" className="mt-1 text-xl font-bold text-slate-900">
              Agent-Verbindungen
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Jede aktive Immo-MCP-Verbindung gilt nur für dieses angemeldete Konto und den angezeigten Client.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Agent-Verbindungen schließen"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 cursor-pointer"
          >
            Schließen
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        {isLoading && connections.length === 0 ? (
          <p role="status" className="mt-6 text-sm font-medium text-slate-600">Verbindungen werden geladen…</p>
        ) : connections.length === 0 ? (
          <p className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Für dieses Konto bestehen keine OAuth- oder Immo-MCP-Verbindungen.
          </p>
        ) : (
          <ul className="mt-6 max-h-[28rem] space-y-3 overflow-y-auto" aria-label="Agent-Verbindungen dieses Kontos">
            {connections.map((connection) => {
              const grantedAt = formatGrantedAt(
                connection.oauthGrant?.granted_at ?? connection.agentGrant?.created_at,
              );
              const isActive = Boolean(connection.oauthGrant && connection.agentGrant);
              return (
                <li key={connection.clientId} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">
                        {connection.oauthGrant?.client.name ?? 'Nicht mehr registrierter OAuth-Client'}
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-500">{connection.clientId}</p>
                      <p className={`mt-3 text-xs font-bold ${isActive ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {isActive
                          ? 'Immo-MCP für dieses Konto aktiv'
                          : connection.agentGrant
                            ? 'MCP-Freigabe ohne aktive OAuth-Verbindung'
                            : 'OAuth-Freigabe ohne aktiven Immo-MCP-Zugriff'}
                      </p>
                      {grantedAt && <p className="mt-1 text-xs text-slate-500">Freigegeben: {grantedAt}</p>}
                    </div>
                    <button
                      type="button"
                      disabled={revokingClientId !== null}
                      onClick={() => void revokeConnection(connection)}
                      className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                    >
                      {revokingClientId === connection.clientId ? 'Wird getrennt…' : 'Verbindung trennen'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void loadConnections()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50 cursor-pointer"
          >
            Neu laden
          </button>
        </div>
      </section>
    </div>
  );
}
