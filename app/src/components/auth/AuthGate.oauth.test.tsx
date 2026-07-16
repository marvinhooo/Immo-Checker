import { cleanup, render, screen } from '@testing-library/react';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../store/authStore';
import { AuthGate } from './AuthGate';

vi.mock('./OAuthConsent', () => ({
  OAuthConsent: ({ authorizationId }: { authorizationId: string }) => (
    <div data-testid="oauth-consent">Freigabe {authorizationId}</div>
  ),
}));

vi.mock('../../app/App', () => ({
  App: () => <div data-testid="app">App</div>,
}));

const initialAuthState = useAuthStore.getState();

describe('AuthGate OAuth-Route', () => {
  beforeEach(() => {
    const user = { id: 'account-a', email: 'account-a@example.com' } as User;
    useAuthStore.setState({
      user,
      session: { user } as Session,
      profile: {
        id: user.id,
        is_admin: false,
        approved: true,
        created_at: '2026-07-16T00:00:00.000Z',
      },
      isLoading: false,
      authView: 'login',
      initialize: vi.fn(() => () => {}),
    });
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
    useAuthStore.setState(initialAuthState, true);
  });

  it('zeigt die MCP-Freigabe nur innerhalb einer angemeldeten, freigegebenen Sitzung', () => {
    window.history.replaceState({}, '', '/?authorization_id=request-123');
    render(<AuthGate />);

    expect(screen.getByTestId('oauth-consent')).toHaveTextContent('request-123');
    expect(screen.queryByTestId('app')).not.toBeInTheDocument();
  });

  it('lässt eine nicht freigegebene Person nicht zum OAuth-Dialog durch', () => {
    useAuthStore.setState((state) => ({
      profile: state.profile ? { ...state.profile, approved: false } : null,
    }));
    window.history.replaceState({}, '', '/?authorization_id=request-123');
    render(<AuthGate />);

    expect(screen.getByText('Warten auf Freigabe')).toBeInTheDocument();
    expect(screen.queryByTestId('oauth-consent')).not.toBeInTheDocument();
  });
});
