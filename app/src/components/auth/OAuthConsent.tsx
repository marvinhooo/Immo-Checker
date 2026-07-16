import { useEffect, useMemo, useState } from 'react';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

export interface OAuthConsentProps {
  authorizationId: string;
}

type ConsentDecision = 'approve' | 'deny';

const LOAD_ERROR =
  'Die Verbindungsanfrage konnte nicht geladen werden. Bitte versuche es erneut.';

export function OAuthConsent({ authorizationId }: OAuthConsentProps) {
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [decision, setDecision] = useState<ConsentDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let isCurrent = true;

    const loadAuthorization = async () => {
      setDetails(null);
      setError(null);
      setIsLoading(true);

      if (!authorizationId.trim()) {
        setError(LOAD_ERROR);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error: authorizationError } =
          await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

        if (!isCurrent) return;

        if (authorizationError || !data) {
          setError(LOAD_ERROR);
          setIsLoading(false);
          return;
        }

        if ('redirect_url' in data) {
          window.location.assign(data.redirect_url);
          return;
        }

        setDetails(data);
        setIsLoading(false);
      } catch {
        if (!isCurrent) return;
        setError(LOAD_ERROR);
        setIsLoading(false);
      }
    };

    void loadAuthorization();

    return () => {
      isCurrent = false;
    };
  }, [authorizationId, retryCount]);

  const scopes = useMemo(
    () => details?.scope.trim().split(/\s+/).filter(Boolean) ?? [],
    [details?.scope],
  );

  const submitDecision = async (nextDecision: ConsentDecision) => {
    if (!details) return;
    setError(null);
    setDecision(nextDecision);

    const grantRow = {
      user_id: details.user.id,
      client_id: details.client.id,
    };
    let createdGrantForRequest = false;

    const removeGrant = async () => supabase
      .from('agent_oauth_grants')
      .delete()
      .match(grantRow);

    const cleanupCreatedGrant = async () => {
      if (!createdGrantForRequest) return;
      try {
        await removeGrant();
      } catch {
        // Ein alleinstehender Custom-Grant kann ohne OAuth-Grant kein Token
        // erzeugen und wird spaeter in der Verbindungsverwaltung sichtbar.
      }
    };

    try {
      if (nextDecision === 'approve') {
        const { data: existingGrant, error: readGrantError } = await supabase
          .from('agent_oauth_grants')
          .select('client_id')
          .match(grantRow)
          .maybeSingle();
        if (readGrantError) {
          setError('Die Verbindung konnte nicht freigegeben werden. Bitte versuche es erneut.');
          setDecision(null);
          return;
        }

        if (!existingGrant) {
          const { error: grantError } = await supabase
            .from('agent_oauth_grants')
            .upsert(grantRow, { onConflict: 'user_id,client_id' });
          if (grantError) {
            setError('Die Verbindung konnte nicht freigegeben werden. Bitte versuche es erneut.');
            setDecision(null);
            return;
          }
          createdGrantForRequest = true;
        }
      } else {
        const { error: revokeError } = await removeGrant();
        if (revokeError) {
          setError('Die Ablehnung konnte nicht übermittelt werden. Bitte versuche es erneut.');
          setDecision(null);
          return;
        }
      }

      const request = nextDecision === 'approve'
        ? supabase.auth.oauth.approveAuthorization
        : supabase.auth.oauth.denyAuthorization;
      const { data, error: consentError } = await request(authorizationId, {
        skipBrowserRedirect: true,
      });

      if (consentError || !data?.redirect_url) {
        await cleanupCreatedGrant();
        setError(
          nextDecision === 'approve'
            ? 'Die Verbindung konnte nicht freigegeben werden. Bitte versuche es erneut.'
            : 'Die Ablehnung konnte nicht übermittelt werden. Bitte versuche es erneut.',
        );
        setDecision(null);
        return;
      }

      window.location.assign(data.redirect_url);
    } catch {
      await cleanupCreatedGrant();
      setError(
        nextDecision === 'approve'
          ? 'Die Verbindung konnte nicht freigegeben werden. Bitte versuche es erneut.'
          : 'Die Ablehnung konnte nicht übermittelt werden. Bitte versuche es erneut.',
      );
      setDecision(null);
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div role="status" className="text-center space-y-3" aria-live="polite">
          <div
            className="h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-slate-600">Verbindungsanfrage wird geprüft...</p>
        </div>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-900">Verbindung nicht verfügbar</h1>
          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
          >
            Erneut versuchen
          </button>
        </div>
      </main>
    );
  }

  const isSubmitting = decision !== null;

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-8">
      <section
        aria-labelledby="oauth-consent-title"
        aria-busy={isSubmitting}
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
            Sichere Kontoverbindung
          </p>
          <h1 id="oauth-consent-title" className="text-2xl font-bold tracking-tight text-slate-900">
            {details.client.name} möchte auf Immo-Checker zugreifen
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Die Freigabe gilt ausschließlich für das aktuell angemeldete Konto.
          </p>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Immo-MCP-Rechte</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex gap-2">
                <span aria-hidden="true" className="font-bold text-emerald-600">✓</span>
                Eigene Szenarien lesen
              </li>
              <li className="flex gap-2">
                <span aria-hidden="true" className="font-bold text-emerald-600">✓</span>
                Eigene Agent-Drafts schreiben
              </li>
              <li className="flex gap-2">
                <span aria-hidden="true" className="font-bold text-rose-600">×</span>
                Keine finalen Szenarien erstellen oder ändern und keine Adminaktionen ausführen
              </li>
            </ul>
          </div>

          <dl className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <div>
              <dt className="font-semibold text-slate-900">Angemeldetes Konto</dt>
              <dd className="mt-1 text-slate-600">
                {details.user.email ?? 'Aktuell angemeldetes Immo-Checker-Konto'}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Anwendung</dt>
              <dd className="mt-1 text-slate-600">{details.client.name}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Rücksprungadresse</dt>
              <dd className="mt-1 break-all text-slate-600">{details.redirect_uri}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-900">Angeforderte technische Berechtigungen</dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {scopes.length > 0 ? scopes.map((scope) => (
                  <code key={scope} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                    {scope}
                  </code>
                )) : (
                  <span className="text-slate-600">Keine zusätzlichen Berechtigungen</span>
                )}
              </dd>
            </div>
          </dl>

          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void submitDecision('deny')}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {decision === 'deny' ? 'Wird abgelehnt...' : 'Ablehnen'}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void submitDecision('approve')}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {decision === 'approve' ? 'Wird freigegeben...' : 'Verbindung erlauben'}
          </button>
        </div>
      </section>
    </main>
  );
}
