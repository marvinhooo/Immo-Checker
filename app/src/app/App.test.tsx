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

function expectNormalizedText(element: Element | null, expected: string): void {
  expect(element?.textContent?.replace(/\s/g, ' ')).toContain(expected.replace(/\s/g, ' '));
}

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
    expect(hint).toHaveTextContent('Beides bindet Liquidität, aber mindert noch nicht das V&V-Ergebnis');
    expect(hint).toHaveTextContent('separate Preiswirkungsquote');
    expect(screen.getByText('Cash-Abfluss Jahr 1 insgesamt')).toBeInTheDocument();
    expect(screen.getByText('davon nicht sofort abziehbar')).toBeInTheDocument();
    expect(screen.getByText('davon im Jahr sofort abziehbar')).toBeInTheDocument();
    expect(screen.getByText(/Die Prozentquote teilt den oben eingegebenen Gesamtbetrag nur auf/)).toBeInTheDocument();
    expect(screen.getByText('Reserve: Preiswirkung beim Exit (%)')).toBeInTheDocument();
    const exitHint = screen.getByText('Preiswirkung konservativ wählen:', { selector: 'strong' }).closest('p');
    expect(exitHint).toHaveTextContent('WEG-Zuführung und private Reserve nicht trennt');
    expect(exitHint).toHaveTextContent('grundsätzlich 0 %');
    expect(exitHint).toHaveTextContent('private Reserve bleibt Vermögen des Verkäufers');
    expect(screen.getByText('Rücklagen-Preiswirkung')).toBeInTheDocument();
  });

  it('uebernimmt Wirtschaftsplan-Summen direkt und nutzt die vorhandene Leerstandsquote', () => {
    useScenarioStore.getState().updateActive((draft) => {
      draft.miete.leerstandPct = 3;
      draft.kosten.kostenErfassungMode = 'detailliert';
      draft.kosten.maintenanceMode = 'absolute';
      draft.kosten.instandhaltungProSqm = 21;
      draft.kosten.instandhaltungPctRent = 9;
      draft.kosten.instandhaltungAbsolut = 777;
      draft.kosten.umlagefaehigeKostenProJahr = 1194.99;
      draft.kosten.nichtUmlagefaehigeKostenProJahr = 554.06;
      draft.kosten.wegRuecklageProJahr = 456;
    });
    render(<App />);

    fireEvent.click(screen.getByText('Laufende Kosten').closest('button') as HTMLButtonElement);
    expect(screen.getByText('Berechnungsart laufende Kosten')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Direkt aus Wirtschaftsplan' }));

    expect(screen.getByLabelText('Summe umlagefähige Kosten')).toHaveValue(formatEUR(1194.99, 2));
    expect(screen.getByLabelText('Summe nicht umlagefähige Kosten')).toHaveValue(formatEUR(554.06, 2));
    expect(screen.getByLabelText('Summe Zuführung Erhaltungsrücklage')).toHaveValue(formatEUR(456, 2));
    expectNormalizedText(screen.getByText('Summe geplante Kosten').closest('div'), formatEUR(1749.05, 2));
    expectNormalizedText(
      screen.getByText('Summe geplante Vorschüsse / Hausgeld p. a.').closest('div'),
      formatEUR(2205.05, 2),
    );
    expectNormalizedText(
      screen.getByText(/Nicht umlegbar wegen .* Leerstand/).closest('div'),
      formatEUR(35.8497, 2),
    );
    expectNormalizedText(screen.getByText('Eigentümer-Cashout p. a.').closest('div'), formatEUR(1045.9097, 2));
    expectNormalizedText(
      screen.getByText('davon sofort steuerlich berücksichtigt (Modell)').closest('div'),
      formatEUR(589.9097, 2),
    );
    expectNormalizedText(
      screen.getByText('davon nicht sofort berücksichtigt').closest('div'),
      formatEUR(456, 2),
    );
    expect(screen.getByText('Verwendung je Jahreszuführung (%)')).toBeInTheDocument();
    expect(screen.getByLabelText('Durchschnittliche Verzögerung')).toHaveValue('5 Jahre');
    // Ohne SEV bleibt die Zeile ausgeblendet.
    expect(screen.queryByText(/Sondereigentumsverwaltung \(außerhalb/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Detaillierte Schätzung' }));
    expect(screen.getByText('Berechnungsart Instandhaltung')).toBeInTheDocument();
    expect(screen.getByLabelText('Instandhaltung pro Jahr')).toHaveValue(formatEUR(777));
    expect(useScenarioStore.getState().active.kosten.umlagefaehigeKostenProJahr).toBe(1194.99);

    fireEvent.click(screen.getByRole('button', { name: 'Pro m²/Jahr' }));
    expect(screen.getByLabelText('Instandhaltung pro m²/Jahr')).toHaveValue('21');
    fireEvent.click(screen.getByRole('button', { name: '% der Miete' }));
    expect(screen.getByLabelText('Instandhaltung (% der Kaltmiete)')).toHaveValue('9');
    fireEvent.click(screen.getByRole('button', { name: 'Absolut p. a.' }));
    expect(screen.getByLabelText('Instandhaltung pro Jahr')).toHaveValue(formatEUR(777));
    expect(useScenarioStore.getState().active.kosten).toMatchObject({
      instandhaltungProSqm: 21,
      instandhaltungPctRent: 9,
      instandhaltungAbsolut: 777,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Direkt aus Wirtschaftsplan' }));
    expect(screen.getByLabelText('Summe umlagefähige Kosten')).toHaveValue(formatEUR(1194.99, 2));
  });

  it('zeigt die SEV in der Wirtschaftsplan-Zusammenfassung wie in der Engine', () => {
    useScenarioStore.getState().updateActive((draft) => {
      draft.miete.leerstandPct = 3;
      draft.kosten.kostenErfassungMode = 'wirtschaftsplan';
      draft.kosten.umlagefaehigeKostenProJahr = 1194.99;
      draft.kosten.nichtUmlagefaehigeKostenProJahr = 554.06;
      draft.kosten.wegRuecklageProJahr = 456;
      draft.kosten.sevProJahr = 300;
    });
    render(<App />);

    fireEvent.click(screen.getByText('Laufende Kosten').closest('button') as HTMLButtonElement);

    // Die Zusammenfassung muss exakt den Werten der Engine entsprechen.
    const engineYear1 = runProjection(useScenarioStore.getState().active, 1).years[0];
    expect(engineYear1.bewirtschaftungskosten).toBeCloseTo(1345.9097, 4);

    expectNormalizedText(
      screen.getByText(/Sondereigentumsverwaltung \(außerhalb/).closest('div'),
      formatEUR(300, 2),
    );
    expectNormalizedText(
      screen.getByText('Eigentümer-Cashout p. a.').closest('div'),
      formatEUR(engineYear1.bewirtschaftungskosten, 2),
    );
    expectNormalizedText(
      screen.getByText('davon sofort steuerlich berücksichtigt (Modell)').closest('div'),
      formatEUR(889.9097, 2),
    );
    // Der Wirtschaftsplan selbst enthaelt die SEV nicht.
    expectNormalizedText(screen.getByText('Summe geplante Kosten').closest('div'), formatEUR(1749.05, 2));
    expectNormalizedText(
      screen.getByText('Summe geplante Vorschüsse / Hausgeld p. a.').closest('div'),
      formatEUR(2205.05, 2),
    );
  });

  it('nutzt bei unvollständigen Bodenwertdaten 30 Prozent und bewahrt alle Rohwerte', () => {
    useScenarioStore.getState().updateActive((draft) => {
      draft.objekt.kaufpreis = 60000;
      draft.objekt.bodenwertMode = 'perSqm';
      draft.objekt.bodenwertAnteilPct = 17;
      draft.objekt.bodenrichtwertProSqm = 620;
      draft.objekt.grundstuecksflaeche = 0;
      draft.objekt.miteigentumsanteilZaehler = 57;
      draft.objekt.miteigentumsanteilNenner = 1000;
    });
    render(<App />);

    expect(screen.getByText('Berechnungsart Bodenwert')).toBeInTheDocument();
    expect(screen.getByText(/30-%-Standardannahme/).closest('p')).toHaveTextContent('nicht an jedem Standort automatisch konservativ');
    expect(screen.getByText(/entspricht diese 30-%-Annahme/).closest('p')).toHaveTextContent('509,3 m²');
    expect(screen.getByText(/entspricht diese 30-%-Annahme/).closest('p')).toHaveTextContent('größer');
    expectNormalizedText(screen.getByText(/Bodenwert:/).closest('div'), formatEUR(18000));

    fireEvent.click(screen.getByRole('button', { name: 'Prozent vom Kaufpreis' }));
    expect(screen.getByLabelText('Bodenwertanteil (%)')).toHaveValue('17');
    expectNormalizedText(screen.getByText(/Bodenwert:/).closest('div'), formatEUR(10200));
    fireEvent.click(screen.getByRole('button', { name: 'Bodenrichtwert (€/m²) × Fläche' }));

    expect(screen.getByLabelText('Bodenrichtwert (€/m²)')).toHaveValue('620 EUR/m²');
    expect(screen.getByLabelText('Grundstück gesamt (m²)')).toHaveValue('0');
    expect(screen.getByLabelText('MEA – Ihr Anteil')).toHaveValue('57');
    expect(screen.getByLabelText('MEA – Objekt gesamt')).toHaveValue('1000');

    const meaNumerator = screen.getByLabelText('MEA – Ihr Anteil');
    fireEvent.focus(meaNumerator);
    fireEvent.change(meaNumerator, { target: { value: '1001' } });
    fireEvent.blur(meaNumerator);
    expect(useScenarioStore.getState().active.objekt.miteigentumsanteilZaehler).toBe(1001);
    expect(useScenarioStore.getState().active.objekt.miteigentumsanteilNenner).toBe(1000);
    expect(useScenarioStore.getState().active.objekt.bodenwertAnteilPct).toBe(17);
    expect(useScenarioStore.getState().active.objekt.bodenrichtwertProSqm).toBe(620);
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

  it('vergleicht das beste Exit-Jahr unabhängig von der gewählten Haltedauer bis Jahr 40', () => {
    useScenarioStore.getState().updateActive((draft) => {
      draft.exit.haltedauerJahre = 3;
    });

    render(<App />);

    expect(screen.getByText(/Bester Verkauf im Vergleich von Jahr 1 bis 40/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Verkauf$/ }));
    expect(screen.getByText(/alle Verkaufsjahre 1 bis 40/)).toBeInTheDocument();
  });

  it('zeigt einen Cloud-Sync-Fehler als schließbare Warnung', () => {
    const message = '1 Cloud-Szenario konnte wegen ungültiger Daten nicht geladen werden.';
    useScenarioStore.setState({ syncError: message });

    render(<App />);

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    fireEvent.click(screen.getByRole('button', { name: 'Hinweis schließen' }));

    expect(useScenarioStore.getState().syncError).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
    store.updateActive((d) => { d.kosten.ruecklagenRestwertPct = 25; });
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
    expect(saved[0].kosten.ruecklagenRestwertPct).toBe(25);
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
