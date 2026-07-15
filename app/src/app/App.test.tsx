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

  it('bietet einen eigenen Sanierungsplan an', () => {
    render(<App />);

    const sectionButton = screen.getByText('Sanierungen & Modernisierungen').closest('button');
    expect(sectionButton).not.toBeNull();
    fireEvent.click(sectionButton as HTMLButtonElement);

    expect(screen.getByText('Noch keine Sanierung oder Modernisierung geplant.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Maßnahme' }));

    expect(screen.getByLabelText('Bezeichnung der Maßnahme 1')).toHaveValue('Neue Sanierung');
    expect(screen.getByLabelText('Projektjahr')).toBeInTheDocument();
    expect(screen.getByLabelText('Betrag')).toBeInTheDocument();
    expect(screen.getByLabelText('Steuerliche Behandlung')).toHaveValue('keine');
    expect(screen.getByRole('switch', { name: 'Modernisierung: Mieterhöhung ggf. möglich' })).toHaveAttribute('aria-checked', 'false');
  });

  it('zeigt markierte Modernisierungen als Prüfhinweis im Mietbereich', () => {
    const active = structuredClone(useScenarioStore.getState().active);
    active.sanierungen = [{
      id: 'modernisierung-1',
      bezeichnung: 'Neue Heizung',
      jahr: 4,
      betrag: 18000,
      steuerart: 'herstellung',
      verteilungsJahre: 2,
      mieterhoehungMoeglich: true,
    }];
    useScenarioStore.setState({ active });

    render(<App />);

    const sectionButton = screen.getByText('Miete').closest('button');
    expect(sectionButton).not.toBeNull();
    fireEvent.click(sectionButton as HTMLButtonElement);

    expect(screen.getByText('Mieterhöhung nach Modernisierung ggf. prüfen')).toBeInTheDocument();
    const measureHint = screen.getByText('Neue Heizung').closest('li');
    expect(measureHint).not.toBeNull();
    expect(measureHint).toHaveTextContent('Neue Heizung: nach Abschluss in Jahr 4 ggf. möglich.');
    expect(screen.getByText(/Keine automatische Mietanpassung/)).toBeInTheDocument();
  });
});

describe('AfA-Satz-Ableitung aus dem Baujahr', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: 'test-user', email: 'test@example.com' } as User,
      session: null,
      profile: null,
      isLoading: false,
      authView: 'login',
    });
    useScenarioStore.setState({
      ownerUserId: 'test-user',
      active: createDefaultScenario(),
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

  it('leitet den linearen Satz auch im Denkmal-Modus aus dem Baujahr ab', () => {
    const active = structuredClone(useScenarioStore.getState().active);
    active.objekt.objektTyp = 'denkmal';
    active.afa.modus = 'denkmal7i';
    active.afa.linearSatzPct = 2.0;
    useScenarioStore.setState({ active });

    render(<App />);

    const baujahrInput = screen.getByDisplayValue('1995');
    fireEvent.change(baujahrInput, { target: { value: '1911' } });

    const state = useScenarioStore.getState().active;
    expect(state.objekt.fertigstellungsjahr).toBe(1911);
    expect(state.afa.modus).toBe('denkmal7i');
    expect(state.afa.linearSatzPct).toBe(2.5);
  });

  it('leitet den Satz beim Wechsel des Objekttyps auf Denkmal neu ab', () => {
    const active = structuredClone(useScenarioStore.getState().active);
    active.objekt.fertigstellungsjahr = 1911;
    active.afa.modus = 'linear';
    active.afa.linearSatzPct = 2.0; // veralteter Stand
    useScenarioStore.setState({ active });

    render(<App />);

    fireEvent.change(screen.getByLabelText('Objekttyp'), { target: { value: 'denkmal' } });

    const state = useScenarioStore.getState().active;
    expect(state.afa.modus).toBe('denkmal7i');
    expect(state.afa.linearSatzPct).toBe(2.5);
  });
});
