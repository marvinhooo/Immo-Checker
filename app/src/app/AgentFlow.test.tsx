import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentDraftExample } from '../agent/draft';
import { createDefaultScenario } from '../engine/defaults';
import { useAuthStore } from '../store/authStore';
import { useScenarioStore } from '../store/scenarioStore';
import { App } from './App';

const syncMocks = vi.hoisted(() => ({
  pullAgentDrafts: vi.fn(() => new Promise<never>(() => {})),
}));

vi.mock('../lib/sync', () => ({
  pullScenarios: vi.fn(async () => []),
  pushScenarios: vi.fn(async () => {}),
  pushSingleScenario: vi.fn(async () => {}),
  deleteRemoteScenario: vi.fn(async () => {}),
  pullAgentDrafts: syncMocks.pullAgentDrafts,
  deleteRemoteAgentDraft: vi.fn(async () => {}),
}));

const initialAuthState = useAuthStore.getState();
const initialScenarioState = useScenarioStore.getState();

describe('Agent-Draft-Ablauf', () => {
  beforeEach(() => {
    const active = createDefaultScenario({ name: 'Aktuelles Konto-Szenario' });
    useAuthStore.setState({
      user: { id: 'account-a', email: 'account-a@example.com' } as User,
      session: null,
      profile: null,
      isLoading: false,
      authView: 'login',
    });
    useScenarioStore.setState({
      ownerUserId: 'account-a',
      active,
      saved: [active],
      isSyncing: false,
      syncError: null,
      loadFromCloud: vi.fn(async () => {}),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.immoCheckerAgent;
    useAuthStore.setState(initialAuthState, true);
    useScenarioStore.setState(initialScenarioState, true);
  });

  it('stellt einen validierten Draft bereit, ohne das aktuelle Szenario zu ersetzen oder zu speichern', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Agent-Entwurf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Beispiel einsetzen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Entwurf prüfen und übernehmen' }));

    expect(screen.getByText('Agent-Entwurf bereit: Objekt Musterstrasse')).toBeInTheDocument();
    expect(useScenarioStore.getState().active.name).toBe('Aktuelles Konto-Szenario');
    expect(useScenarioStore.getState().saved).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Entwurf öffnen' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Entwurf öffnen' }));

    await waitFor(() => expect(useScenarioStore.getState().active.name).toBe('Objekt Musterstrasse'));
    expect(useScenarioStore.getState().saved).toHaveLength(1);
    expect(screen.getByText('Vorläufige Agent-Auswertung')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Agent Edit Mode' })).toHaveAttribute('aria-checked', 'true');
    expect(document.querySelectorAll('[data-agent-status="missing"].agent-field-frame').length).toBeGreaterThan(0);
    expect(syncMocks.pullAgentDrafts).not.toHaveBeenCalled();

    vi.spyOn(window, 'prompt').mockReturnValue('Nur lokal umbenannt');
    fireEvent.click(screen.getByRole('button', { name: 'Umbenennen' }));
    await waitFor(() => expect(useScenarioStore.getState().active.name).toBe('Nur lokal umbenannt'));
    expect(useScenarioStore.getState().saved).toHaveLength(1);
    expect(useScenarioStore.getState().saved[0].name).toBe('Aktuelles Konto-Szenario');

    const currentId = useScenarioStore.getState().active.id;
    fireEvent.click(screen.getByRole('button', { name: 'Duplizieren' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Abbrechen' }));
    expect(useScenarioStore.getState().active.id).toBe(currentId);
    expect(useScenarioStore.getState().saved).toHaveLength(1);
  });

  it('stellt die Browser-Agent-API erst bewusst im angemeldeten Konto bereit', async () => {
    render(<App />);
    expect(window.immoCheckerAgent).toBeUndefined();

    fireEvent.click(screen.getByRole('switch', { name: 'Browser-Agent-Verbindung' }));

    await waitFor(() => expect(window.immoCheckerAgent).toBeDefined());
    expect(window.immoCheckerAgent?.listScenarios()).toEqual([
      { id: useScenarioStore.getState().active.id, name: 'Aktuelles Konto-Szenario' },
    ]);
    expect(() => window.immoCheckerAgent?.getScenario('anderes-konto')).toThrow(
      'Szenario ist in diesem angemeldeten Konto nicht verfügbar.',
    );

    window.immoCheckerAgent?.stageDraft(createAgentDraftExample());
    expect(await screen.findByText('Agent-Entwurf bereit: Objekt Musterstrasse')).toBeInTheDocument();
    expect(useScenarioStore.getState().active.name).toBe('Aktuelles Konto-Szenario');

    const capturedApi = window.immoCheckerAgent;
    act(() => {
      useAuthStore.setState({ user: { id: 'account-b' } as User });
      useScenarioStore.setState({ ownerUserId: 'account-b' });
    });
    expect(() => capturedApi?.listScenarios()).toThrow(
      'Agent-Verbindung ist nicht mehr für das angemeldete Konto gültig.',
    );
    expect(() => capturedApi?.getScenario(useScenarioStore.getState().active.id)).toThrow(
      'Agent-Verbindung ist nicht mehr für das angemeldete Konto gültig.',
    );
    expect(() => capturedApi?.stageDraft(createAgentDraftExample())).toThrow(
      'Agent-Verbindung ist nicht mehr für das angemeldete Konto gültig.',
    );
  });
});
