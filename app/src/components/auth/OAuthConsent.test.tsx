import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OAuthConsent } from './OAuthConsent';

const oauthMocks = vi.hoisted(() => ({
  getAuthorizationDetails: vi.fn(),
  approveAuthorization: vi.fn(),
  denyAuthorization: vi.fn(),
}));

const grantMocks = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  select: vi.fn(),
  selectMatch: vi.fn(),
  maybeSingle: vi.fn(),
  delete: vi.fn(),
  deleteMatch: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: grantMocks.from,
    auth: {
      oauth: oauthMocks,
    },
  },
}));

const authorizationDetails = {
  authorization_id: 'authorization-123',
  redirect_uri: 'https://agent.example/callback',
  client: {
    id: 'client-123',
    name: 'Analyse-Agent',
    uri: 'https://agent.example',
    logo_uri: 'https://agent.example/logo.svg',
  },
  user: {
    id: 'user-123',
    email: 'user@example.com',
  },
  scope: 'openid scenarios.read agent_drafts.write',
};

describe('OAuthConsent', () => {
  const locationAssign = vi.fn();
  const realWindow = globalThis.window;

  beforeEach(() => {
    vi.clearAllMocks();
    grantMocks.upsert.mockResolvedValue({ error: null });
    grantMocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    grantMocks.deleteMatch.mockResolvedValue({ error: null });
    grantMocks.selectMatch.mockReturnValue({ maybeSingle: grantMocks.maybeSingle });
    grantMocks.select.mockReturnValue({ match: grantMocks.selectMatch });
    grantMocks.delete.mockReturnValue({ match: grantMocks.deleteMatch });
    grantMocks.from.mockReturnValue({
      upsert: grantMocks.upsert,
      select: grantMocks.select,
      delete: grantMocks.delete,
    });
    const testWindow = Object.create(realWindow) as Window;
    Object.defineProperty(testWindow, 'location', {
      value: { assign: locationAssign },
      configurable: true,
    });
    vi.stubGlobal('window', testWindow);

    oauthMocks.getAuthorizationDetails.mockResolvedValue({
      data: authorizationDetails,
      error: null,
    });
    oauthMocks.approveAuthorization.mockResolvedValue({
      data: { redirect_url: 'https://agent.example/callback?code=approved' },
      error: null,
    });
    oauthMocks.denyAuthorization.mockResolvedValue({
      data: { redirect_url: 'https://agent.example/callback?error=access_denied' },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lädt die Anfrage und zeigt Client, Redirect, Scopes und begrenzte Immo-MCP-Rechte', async () => {
    render(<OAuthConsent authorizationId="authorization-123" />);

    expect(screen.getByRole('status')).toHaveTextContent('Verbindungsanfrage wird geprüft');
    expect(await screen.findByRole('heading', {
      name: 'Analyse-Agent möchte auf Immo-Checker zugreifen',
    })).toBeVisible();

    expect(oauthMocks.getAuthorizationDetails).toHaveBeenCalledWith('authorization-123');
    expect(screen.getByText('https://agent.example/callback')).toBeVisible();
    expect(screen.getByText('openid')).toBeVisible();
    expect(screen.getByText('scenarios.read')).toBeVisible();
    expect(screen.getByText('agent_drafts.write')).toBeVisible();
    expect(screen.getByText('Eigene Szenarien lesen')).toBeVisible();
    expect(screen.getByText('Eigene Agent-Drafts schreiben')).toBeVisible();
    expect(screen.getByText(/Keine finalen Szenarien.*keine Adminaktionen/)).toBeVisible();
    expect(screen.getByText('user@example.com')).toBeVisible();
  });

  it('leitet eine bereits genehmigte Anfrage direkt weiter', async () => {
    oauthMocks.getAuthorizationDetails.mockResolvedValueOnce({
      data: { redirect_url: 'https://agent.example/callback?code=existing' },
      error: null,
    });

    render(<OAuthConsent authorizationId="authorization-123" />);

    await waitFor(() => {
      expect(locationAssign).toHaveBeenCalledWith(
        'https://agent.example/callback?code=existing',
      );
    });
    expect(screen.queryByRole('button', { name: 'Verbindung erlauben' })).not.toBeInTheDocument();
  });

  it('genehmigt kontrolliert und verwendet die zurückgegebene Redirect-URL', async () => {
    render(<OAuthConsent authorizationId="authorization-123" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Verbindung erlauben' }));

    await waitFor(() => {
      expect(grantMocks.from).toHaveBeenCalledWith('agent_oauth_grants');
      expect(grantMocks.upsert).toHaveBeenCalledWith(
        { user_id: 'user-123', client_id: 'client-123' },
        { onConflict: 'user_id,client_id' },
      );
      expect(oauthMocks.approveAuthorization).toHaveBeenCalledWith(
        'authorization-123',
        { skipBrowserRedirect: true },
      );
      expect(grantMocks.upsert.mock.invocationCallOrder[0]).toBeLessThan(
        oauthMocks.approveAuthorization.mock.invocationCallOrder[0],
      );
      expect(locationAssign).toHaveBeenCalledWith(
        'https://agent.example/callback?code=approved',
      );
    });
    expect(oauthMocks.denyAuthorization).not.toHaveBeenCalled();
  });

  it('lehnt kontrolliert ab und verwendet die zurückgegebene Redirect-URL', async () => {
    render(<OAuthConsent authorizationId="authorization-123" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ablehnen' }));

    await waitFor(() => {
      expect(grantMocks.delete).toHaveBeenCalledTimes(1);
      expect(grantMocks.deleteMatch).toHaveBeenCalledWith({
        user_id: 'user-123',
        client_id: 'client-123',
      });
      expect(oauthMocks.denyAuthorization).toHaveBeenCalledWith(
        'authorization-123',
        { skipBrowserRedirect: true },
      );
      expect(grantMocks.deleteMatch.mock.invocationCallOrder[0]).toBeLessThan(
        oauthMocks.denyAuthorization.mock.invocationCallOrder[0],
      );
      expect(locationAssign).toHaveBeenCalledWith(
        'https://agent.example/callback?error=access_denied',
      );
    });
    expect(oauthMocks.approveAuthorization).not.toHaveBeenCalled();
  });

  it('zeigt Ladefehler zugänglich an und erlaubt einen erneuten Versuch', async () => {
    oauthMocks.getAuthorizationDetails
      .mockResolvedValueOnce({ data: null, error: new Error('internal details') })
      .mockResolvedValueOnce({ data: authorizationDetails, error: null });

    render(<OAuthConsent authorizationId="authorization-123" />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Verbindungsanfrage konnte nicht geladen werden',
    );
    expect(screen.queryByText('internal details')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByRole('heading', {
      name: 'Analyse-Agent möchte auf Immo-Checker zugreifen',
    })).toBeVisible();
    expect(oauthMocks.getAuthorizationDetails).toHaveBeenCalledTimes(2);
  });

  it('zeigt einen Entscheidungsfehler ohne Redirect und erlaubt einen neuen Versuch', async () => {
    oauthMocks.approveAuthorization.mockResolvedValueOnce({
      data: null,
      error: new Error('internal approval'),
    });

    render(<OAuthConsent authorizationId="authorization-123" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Verbindung erlauben' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Verbindung konnte nicht freigegeben werden',
    );
    expect(screen.queryByText('internal approval')).not.toBeInTheDocument();
    expect(locationAssign).not.toHaveBeenCalled();
    expect(grantMocks.deleteMatch).toHaveBeenCalledWith({
      user_id: 'user-123',
      client_id: 'client-123',
    });
    expect(screen.getByRole('button', { name: 'Verbindung erlauben' })).toBeEnabled();
  });

  it('erteilt ohne kontogebundenen Client-Grant keine OAuth-Freigabe', async () => {
    grantMocks.upsert.mockResolvedValueOnce({ error: new Error('grant failed') });

    render(<OAuthConsent authorizationId="authorization-123" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Verbindung erlauben' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Verbindung konnte nicht freigegeben werden',
    );
    expect(oauthMocks.approveAuthorization).not.toHaveBeenCalled();
    expect(locationAssign).not.toHaveBeenCalled();
  });
});
