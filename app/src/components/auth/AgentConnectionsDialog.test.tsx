import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentConnectionsDialog } from './AgentConnectionsDialog';

const oauthMocks = vi.hoisted(() => ({
  listGrants: vi.fn(),
  revokeGrant: vi.fn(),
}));

const grantMocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  delete: vi.fn(),
  match: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: grantMocks.from,
    auth: { oauth: oauthMocks },
  },
}));

const oauthGrant = {
  client: {
    id: 'client-123',
    name: 'Analyse-Agent',
    uri: 'https://agent.example',
    logo_uri: 'https://agent.example/logo.svg',
  },
  scopes: ['openid'],
  granted_at: '2026-07-16T10:00:00.000Z',
};

describe('AgentConnectionsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    oauthMocks.listGrants.mockResolvedValue({ data: [oauthGrant], error: null });
    oauthMocks.revokeGrant.mockResolvedValue({ data: {}, error: null });
    grantMocks.eq.mockResolvedValue({
      data: [{ client_id: 'client-123', created_at: '2026-07-16T10:00:00.000Z' }],
      error: null,
    });
    grantMocks.match.mockResolvedValue({ error: null });
    grantMocks.select.mockReturnValue({ eq: grantMocks.eq });
    grantMocks.delete.mockReturnValue({ match: grantMocks.match });
    grantMocks.from.mockReturnValue({
      select: grantMocks.select,
      delete: grantMocks.delete,
    });
  });

  it('zeigt nur das konkrete Konto-Client-Paar als aktive Immo-MCP-Verbindung', async () => {
    render(
      <AgentConnectionsDialog open userId="user-123" onClose={vi.fn()} />,
    );

    expect(await screen.findByText('Analyse-Agent')).toBeVisible();
    expect(screen.getByText('client-123')).toBeVisible();
    expect(screen.getByText('Immo-MCP für dieses Konto aktiv')).toBeVisible();
    expect(grantMocks.eq).toHaveBeenCalledWith('user_id', 'user-123');
  });

  it('sperrt zuerst den kontogebundenen Grant und widerruft danach OAuth', async () => {
    render(
      <AgentConnectionsDialog open userId="user-123" onClose={vi.fn()} />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Verbindung trennen' }));

    await waitFor(() => {
      expect(grantMocks.match).toHaveBeenCalledWith({
        user_id: 'user-123',
        client_id: 'client-123',
      });
      expect(oauthMocks.revokeGrant).toHaveBeenCalledWith({ clientId: 'client-123' });
      expect(grantMocks.match.mock.invocationCallOrder[0]).toBeLessThan(
        oauthMocks.revokeGrant.mock.invocationCallOrder[0],
      );
    });
  });

  it('meldet bei einem OAuth-Teilfehler, dass der MCP-Zugriff bereits gesperrt ist', async () => {
    oauthMocks.revokeGrant.mockResolvedValueOnce({
      data: null,
      error: new Error('OAuth unavailable'),
    });

    render(
      <AgentConnectionsDialog open userId="user-123" onClose={vi.fn()} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Verbindung trennen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Der Immo-MCP-Zugriff ist gesperrt',
    );
  });

  it('zeigt einen reinen OAuth-Grant als Reconnect-Rest und kann ihn entfernen', async () => {
    grantMocks.eq.mockResolvedValue({ data: [], error: null });

    render(
      <AgentConnectionsDialog open userId="user-123" onClose={vi.fn()} />,
    );

    expect(await screen.findByText('OAuth-Freigabe ohne aktiven Immo-MCP-Zugriff')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Verbindung trennen' }));

    await waitFor(() => {
      expect(oauthMocks.revokeGrant).toHaveBeenCalledWith({ clientId: 'client-123' });
    });
    expect(grantMocks.delete).not.toHaveBeenCalled();
  });
});
