import { describe, expect, it } from 'vitest';
import { createDefaultScenario } from './defaults';
import { runProjection } from './projection';
import { calculateExit } from './exit';
import { calculateTotalTax } from './tax';

describe('Exit calculation Engine', () => {
  it('calculates exit correctly for a standard scenario', () => {
    const scenario = createDefaultScenario({
      exit: {
        haltedauerJahre: 10,
        verkaufsnebenkostenPct: 3.0,
        vorfaelligkeitPct: 0.0,
      },
    });

    const projection = runProjection(scenario);
    const exitRes = calculateExit(scenario, projection);

    // Haltedauer is 10 years -> Spekulationssteuer must be 0
    expect(exitRes.spekulationssteuer).toBe(0);

    // Verkaufspreis is the 10th year value (1.5% growth from 300,000)
    // Value at year 10 is 300,000 * (1.015)^10 = 348162
    expect(exitRes.verkaufspreis).toBeGreaterThan(340000);
    expect(exitRes.verkaufsnebenkosten).toBeCloseTo(exitRes.verkaufspreis * 0.03, 2);
    
    // Netto-Verkaufserloes = verkaufspreis - verkaufsnebenkosten - restschuld - vorfaelligkeit
    expect(exitRes.nettoVerkaufserloes).toBeCloseTo(
      exitRes.verkaufspreis - exitRes.verkaufsnebenkosten - exitRes.restschuld - exitRes.vorfaelligkeitsEntschaedigung,
      2
    );
    expect(exitRes.nettoVerkaufserloesNachSteuer).toBe(exitRes.nettoVerkaufserloes);
  });

  it('verifies that Spekulationssteuer is applied for holding periods < 10 years', () => {
    const scenario = createDefaultScenario({
      exit: {
        haltedauerJahre: 5,
        verkaufsnebenkostenPct: 2.0,
        vorfaelligkeitPct: 1.0,
      },
      steuer: {
        taxMode: 'marginalRate',
        bruttoJahresEinkommen: 60000,
        grenzsteuersatzPct: 40.0, // Fixed 40% marginal rate
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      },
      wertentwicklung: {
        szenario: [
          { id: 'rate-1', kind: 'rate', fromYear: 1, percentPerYear: 3.0 } // 3% p.a. growth
        ]
      }
    });

    const projection = runProjection(scenario);
    const exitRes = calculateExit(scenario, projection);

    // Since h = 5 years < 10, there should be speculation tax
    expect(exitRes.spekulationssteuer).toBeGreaterThan(0);

    // Prepayment penalty should apply because 5 years < 10 years Zinsbindung
    expect(exitRes.vorfaelligkeitsEntschaedigung).toBeGreaterThan(0);
    expect(exitRes.vorfaelligkeitsEntschaedigung).toBeCloseTo(exitRes.restschuld * 0.01, 2);

    // Let's verify the Spekulationsgewinn math:
    // kaufpreis = 300,000
    // knk = 300,000 * ( Northwest rate NW: 6.5% + 1.5% + 3.57% = 11.57% ) = 34,710
    // purchaseCostBasis = 334,710
    // verkaufspreis after 5 years of 3% growth = 300,000 * (1.03)^5 = 347,782.20
    // kumulierte AfA for 5 years:
    // buildingBasis = (300,000 + 34,710) * 80% = 267,768
    // afaSatz = 2% (NW fertigstellungsjahr 1995) -> 5355.36 / year
    // 5 years afa = 26,776.80
    // Gewinn = 347,782.20 - 2% Verkaufsnebenkosten - Vorfaelligkeit - 334,710 + 26,776.80
    expect(exitRes.spekulationsGewinn).toBeGreaterThan(29000);
    expect(exitRes.spekulationsGewinn).toBeCloseTo(
      exitRes.verkaufspreis
        - exitRes.verkaufsnebenkosten
        - exitRes.vorfaelligkeitsEntschaedigung
        - (300000 + 34710)
        + 26776.8,
      0
    );
    expect(exitRes.spekulationssteuer).toBeCloseTo(exitRes.spekulationsGewinn * 0.40, 2);
    expect(exitRes.nettoVerkaufserloesNachSteuer).toBeCloseTo(
      exitRes.nettoVerkaufserloes - exitRes.spekulationssteuer,
      2
    );
  });

  it('does not tax speculation gains below the 1,000 EUR threshold', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 100000,
        wohnflaeche: 100,
        fertigstellungsjahr: 1995,
        bundesland: 'NW',
        objektTyp: 'bestand',
        bodenwertAnteilPct: 100,
        sanierungskosten: 0,
      },
      knk: {
        grestPct: 0,
        notarPct: 0,
        maklerPct: 0,
        mitfinanzieren: false,
      },
      finanzierung: {
        equityMode: 'percent',
        equityPct: 100,
        equityAbsolute: 100000,
        sollzinsPct: 0,
        tilgungPct: 0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 0,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
      afa: {
        modus: 'linear',
        linearSatzPct: 0,
      },
      exit: {
        haltedauerJahre: 5,
        verkaufsnebenkostenPct: 0,
        vorfaelligkeitPct: 0,
      },
      steuer: {
        taxMode: 'marginalRate',
        bruttoJahresEinkommen: 60000,
        grenzsteuersatzPct: 40,
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      },
      wertentwicklung: {
        szenario: [
          { id: 'small-growth', kind: 'rate', fromYear: 1, percentPerYear: 0.1 },
        ],
      },
    });

    const exitRes = calculateExit(scenario, runProjection(scenario));

    expect(exitRes.spekulationsGewinn).toBeGreaterThan(0);
    expect(exitRes.spekulationsGewinn).toBeLessThan(1000);
    expect(exitRes.spekulationssteuer).toBe(0);
  });

  it('taxes speculation gains from the 1,000 EUR threshold upward', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 100000,
        wohnflaeche: 100,
        fertigstellungsjahr: 1995,
        bundesland: 'NW',
        objektTyp: 'bestand',
        bodenwertAnteilPct: 100,
        sanierungskosten: 0,
      },
      knk: {
        grestPct: 0,
        notarPct: 0,
        maklerPct: 0,
        mitfinanzieren: false,
      },
      finanzierung: {
        equityMode: 'percent',
        equityPct: 100,
        equityAbsolute: 100000,
        sollzinsPct: 0,
        tilgungPct: 0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 0,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
      afa: {
        modus: 'linear',
        linearSatzPct: 0,
      },
      exit: {
        haltedauerJahre: 1,
        verkaufsnebenkostenPct: 0,
        vorfaelligkeitPct: 0,
      },
      steuer: {
        taxMode: 'marginalRate',
        bruttoJahresEinkommen: 60000,
        grenzsteuersatzPct: 40,
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      },
      wertentwicklung: {
        szenario: [
          { id: 'threshold-growth', kind: 'rate', fromYear: 1, percentPerYear: 1 },
        ],
      },
    });

    const exitRes = calculateExit(scenario, runProjection(scenario));

    expect(exitRes.spekulationsGewinn).toBeCloseTo(1000, 2);
    expect(exitRes.spekulationssteuer).toBeCloseTo(400, 2);
  });

  it('includes Soli and Kirchensteuer in flat-rate speculation tax', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 100000,
        wohnflaeche: 100,
        fertigstellungsjahr: 1995,
        bundesland: 'NW',
        objektTyp: 'bestand',
        bodenwertAnteilPct: 100,
        sanierungskosten: 0,
      },
      knk: {
        grestPct: 0,
        notarPct: 0,
        maklerPct: 0,
        mitfinanzieren: false,
      },
      finanzierung: {
        equityMode: 'percent',
        equityPct: 100,
        equityAbsolute: 100000,
        sollzinsPct: 0,
        tilgungPct: 0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 0,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
      afa: {
        modus: 'linear',
        linearSatzPct: 0,
      },
      exit: {
        haltedauerJahre: 1,
        verkaufsnebenkostenPct: 0,
        vorfaelligkeitPct: 0,
      },
      steuer: {
        taxMode: 'marginalRate',
        bruttoJahresEinkommen: 60000,
        grenzsteuersatzPct: 40,
        veranlagung: 'single',
        soli: true,
        kirchensteuerPct: 9,
      },
      wertentwicklung: {
        szenario: [
          { id: 'threshold-growth', kind: 'rate', fromYear: 1, percentPerYear: 1 },
        ],
      },
    });

    const exitRes = calculateExit(scenario, runProjection(scenario));
    const baseTax = exitRes.spekulationsGewinn * 0.4;

    expect(exitRes.spekulationsGewinn).toBeCloseTo(1000, 2);
    expect(exitRes.spekulationssteuer).toBeCloseTo(baseTax * (1 + 0.055 + 0.09), 2);
  });

  it('deducts renovation costs from the speculation gain basis', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 300000,
        wohnflaeche: 70,
        fertigstellungsjahr: 1995,
        bundesland: 'NW',
        objektTyp: 'denkmal',
        bodenwertAnteilPct: 20,
        sanierungskosten: 200000,
      },
      afa: {
        modus: 'denkmal7i',
        linearSatzPct: 2,
      },
      wertentwicklung: {
        szenario: [],
      },
      exit: {
        haltedauerJahre: 5,
        verkaufsnebenkostenPct: 0,
        vorfaelligkeitPct: 0,
      },
      steuer: {
        taxMode: 'marginalRate',
        bruttoJahresEinkommen: 60000,
        grenzsteuersatzPct: 40,
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      },
    });

    const exitRes = calculateExit(scenario, runProjection(scenario));

    expect(exitRes.spekulationsGewinn).toBe(0);
    expect(exitRes.spekulationssteuer).toBe(0);
  });

  it('uses the full tariff delta for speculation tax in income mode', () => {
    const scenario = createDefaultScenario({
      exit: {
        haltedauerJahre: 5,
        verkaufsnebenkostenPct: 0,
        vorfaelligkeitPct: 0,
      },
      steuer: {
        taxMode: 'income',
        bruttoJahresEinkommen: 12000,
        grenzsteuersatzPct: 42,
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      },
      wertentwicklung: {
        szenario: [
          { id: 'growth', kind: 'rate', fromYear: 1, percentPerYear: 15 },
        ],
      },
    });

    const exitRes = calculateExit(scenario, runProjection(scenario));
    const expectedTax = calculateTotalTax(
      scenario.steuer.bruttoJahresEinkommen + exitRes.spekulationsGewinn,
      false,
      false,
      0
    ) - calculateTotalTax(scenario.steuer.bruttoJahresEinkommen, false, false, 0);

    expect(exitRes.spekulationsGewinn).toBeGreaterThan(0);
    expect(exitRes.spekulationssteuer).toBeCloseTo(expectedTax, 2);
  });
});
