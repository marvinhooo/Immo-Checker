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

  it('weist Rücklage und kalkulatorische Reserve gemeinsam als nicht sofort abziehbar aus', () => {
    render(<App />);

    const sectionButton = screen.getByText('Laufende Kosten').closest('button');
    expect(sectionButton).not.toBeNull();
    fireEvent.click(sectionButton as HTMLButtonElement);

    expect(screen.getByText('davon Rücklage + kalkulatorische Reserve (%)')).toBeInTheDocument();
    const hint = screen.getByText('nicht sofort abziehbar', { selector: 'strong' }).closest('p');
    expect(hint).not.toBeNull();
    expect(hint).toHaveTextContent('Erhaltungsrücklage der WEG');
    expect(hint).toHaveTextContent('kalkulatorische Reserve für das Sondereigentum');
    expect(hint).toHaveTextContent('Beides mindert den Cashflow, aber nicht das V&V-Ergebnis');
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

  it('zeigt die MEA-Felder verständlich und berechnet die anteilige Grundstücksfläche', () => {
    const active = structuredClone(useScenarioStore.getState().active);
    active.objekt.grundstuecksflaeche = 550;
    active.objekt.miteigentumsanteilZaehler = 57;
    active.objekt.miteigentumsanteilNenner = 1000;
    useScenarioStore.setState({ active });

    render(<App />);

    expect(screen.getByLabelText('MEA – Ihr Anteil')).toHaveValue('57');
    expect(screen.getByLabelText('MEA – Objekt gesamt')).toHaveValue('1000');
    expect(screen.getByText(/Verteilungsbasis Miteigentumsanteile/)).toBeVisible();
    expect(screen.getByText('31,4 m²')).toBeVisible();
  });

  it('schaltet Verkaufsnebenkosten sichtbar auf eine EUR-Pauschale um', () => {
    render(<App />);

    fireEvent.click(screen.getByText('Verkauf (Exit)').closest('button') as HTMLButtonElement);
    fireEvent.click(screen.getByRole('button', { name: 'EUR pauschal' }));

    expect(screen.getByLabelText('Verkaufsnebenkosten (Pauschale)')).toBeVisible();
    expect(useScenarioStore.getState().active.exit.verkaufsnebenkostenMode).toBe('absolute');
    expect(useScenarioStore.getState().active.exit.verkaufsnebenkostenAbsolut).toBe(2500);
  });

  it('markiert im Jahresraster erst Exit-Jahr 11 als steuerfrei', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^Verkauf$/ }));

    const taxFreeBadge = screen.getByText('(Modell: steuerfrei)');
    expect(taxFreeBadge.closest('td')).toHaveTextContent('11');
    expect(taxFreeBadge.closest('td')).not.toHaveTextContent('10(Modell: steuerfrei)');
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

describe('Szenario speichern über Abschnitts-Buttons', () => {
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

  it('speichert über den Abschnitts-Button immer das komplette Szenario', async () => {
    const store = useScenarioStore.getState();
    store.updateActive((d) => { d.objekt.kaufpreis = 123456; });
    store.updateActive((d) => { d.kosten.ruecklagenAnteilPct = 37; });
    store.updateActive((d) => { d.exit.haltedauerJahre = 22; });

    render(<App />);

    // Nur der Button des offenen Objekt-Abschnitts ist gerendert.
    fireEvent.click(screen.getAllByRole('button', { name: 'Szenario speichern' })[0]);

    expect(await screen.findByRole('status')).toHaveTextContent('gespeichert');

    const saved = useScenarioStore.getState().saved;
    expect(saved).toHaveLength(1);
    // Auch Werte aus nicht geöffneten Abschnitten sind gespeichert:
    expect(saved[0].objekt.kaufpreis).toBe(123456);
    expect(saved[0].kosten.ruecklagenAnteilPct).toBe(37);
    expect(saved[0].exit.haltedauerJahre).toBe(22);
  });

  it('fragt vor dem Überschreiben mit eigenem Dialog nach und speichert erst nach Bestätigung', async () => {
    const original = structuredClone(useScenarioStore.getState().active);
    useScenarioStore.setState({ saved: [original] });
    useScenarioStore.getState().updateActive((d) => { d.miete.leerstandPct = 7; });

    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Szenario speichern' })[0]);

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Szenario überschreiben?');

    // Abbrechen: nichts überschrieben
    fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useScenarioStore.getState().saved[0].miete.leerstandPct).toBe(original.miete.leerstandPct);

    // Erneut speichern und bestätigen
    fireEvent.click(screen.getAllByRole('button', { name: 'Szenario speichern' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Überschreiben' }));

    expect(await screen.findByRole('status')).toHaveTextContent('gespeichert');
    expect(useScenarioStore.getState().saved[0].miete.leerstandPct).toBe(7);
  });
});
