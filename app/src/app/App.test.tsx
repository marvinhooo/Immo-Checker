import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultScenario } from '../engine/defaults';
import { runProjection } from '../engine/projection';
import { formatEUR } from '../lib/format';
import { useAuthStore } from '../store/authStore';
import { useScenarioStore } from '../store/scenarioStore';
import { App } from './App';

const initialAuthState = useAuthStore.getState();
const initialScenarioState = useScenarioStore.getState();

describe('Dashboard-Jahresauswahl', () => {
  beforeEach(() => {
    const active = createDefaultScenario();

    useAuthStore.setState({
      user: { id: 'test-user', email: 'test@example.com' } as User,
      session: null,
      profile: null,
      isLoading: false,
      authView: 'login',
    });
    useScenarioStore.setState({
      ownerUserId: 'test-user',
      active,
      saved: [],
      isSyncing: false,
      syncError: null,
      loadFromCloud: vi.fn(async () => {}),
    });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState(initialAuthState, true);
    useScenarioStore.setState(initialScenarioState, true);
  });

  it('zeigt nach der Auswahl die Cashflows des gewählten Folgejahres', () => {
    const projection = runProjection(useScenarioStore.getState().active);
    const yearOne = projection.years[0];
    const yearTwo = projection.years[1];

    expect(yearTwo.cashflowNachSteuerMonatlich).not.toBe(yearOne.cashflowNachSteuerMonatlich);

    render(<App />);

    const yearSelect = screen.getByLabelText('Jahr für Cashflow auswählen');
    expect(yearSelect).toHaveValue('1');
    expect((yearSelect as HTMLSelectElement).options).toHaveLength(projection.years.length);
    expect((yearSelect as HTMLSelectElement).options.item(projection.years.length - 1)?.textContent)
      .toBe(`Jahr ${projection.years.length}`);
    expect(screen.getByText('Cashflow Monat · Jahr 1')).toBeInTheDocument();

    fireEvent.change(yearSelect, { target: { value: '2' } });

    expect(yearSelect).toHaveValue('2');
    expect(screen.getByText('Cashflow Monat · Jahr 2')).toBeInTheDocument();

    const afterTaxRow = screen.getByText('Cashflow nach Steuern / Monat').closest('.flex.items-baseline.justify-between');
    const beforeTaxRow = screen.getByText('Cashflow vor Steuern / Monat').closest('.flex.items-baseline.justify-between');

    expect(afterTaxRow).not.toBeNull();
    expect(beforeTaxRow).not.toBeNull();
    expect(afterTaxRow?.textContent?.replace(/\s/g, ' ')).toContain(formatEUR(yearTwo.cashflowNachSteuerMonatlich).replace(/\s/g, ' '));
    expect(beforeTaxRow?.textContent?.replace(/\s/g, ' ')).toContain(formatEUR(yearTwo.cashflowVorSteuerMonatlich).replace(/\s/g, ' '));
  });
});
