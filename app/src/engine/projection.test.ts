import { describe, it, expect } from 'vitest';
import { createDefaultScenario } from './defaults';
import { runProjection } from './projection';

describe('Projection Engine', () => {
  it('should run a projection for the default scenario and verify basic consistency', () => {
    const scenario = createDefaultScenario();
    // Use exit.haltedauerJahre as default (15 years)
    const result = runProjection(scenario);

    expect(result.years.length).toBe(15);
    expect(result.initialEquity).toBeGreaterThan(0);
    expect(result.totalInvestment).toBeGreaterThan(scenario.objekt.kaufpreis);
    expect(result.loanAmount).toBeGreaterThan(0);

    // Verify consistency for each year
    result.years.forEach((y, idx) => {
      expect(y.jahr).toBe(idx + 1);
      expect(y.bruttoKaltmiete).toBeGreaterThan(0);
      expect(y.nettoKaltmiete).toBeLessThanOrEqual(y.bruttoKaltmiete);
      expect(y.mietausfall).toBeCloseTo(y.bruttoKaltmiete - y.nettoKaltmiete, 2);

      expect(y.bewirtschaftungskosten).toBeCloseTo(y.instandhaltung + y.verwaltung + y.sonstigeKosten, 2);
      expect(y.annuitaet).toBeCloseTo(y.zins + y.tilgung, 2);

      // V&V & Tax consistency
      expect(y.vvErgebnis).toBeCloseTo(y.nettoKaltmiete - y.zins - y.afa - y.bewirtschaftungskosten, 2);
      
      // Cashflow consistency
      expect(y.cashflowVorSteuer).toBeCloseTo(y.nettoKaltmiete - y.zins - y.tilgung - y.sondertilgung - y.bewirtschaftungskosten, 2);
      expect(y.cashflowNachSteuer).toBeCloseTo(y.cashflowVorSteuer - y.steuereffekt, 2);

      expect(y.cashflowVorSteuerMonatlich).toBeCloseTo(y.cashflowVorSteuer / 12, 2);
      expect(y.cashflowNachSteuerMonatlich).toBeCloseTo(y.cashflowNachSteuer / 12, 2);

      // Balance sheet consistency
      expect(y.eigenkapital).toBeCloseTo(y.immobilienwert - y.restschuld, 2);
      expect(y.ltv).toBeCloseTo((y.restschuld / y.immobilienwert) * 100, 2);

      if (y.zins + y.tilgung > 0) {
        expect(y.dscr).toBeCloseTo(y.nettoKaltmiete / (y.zins + y.tilgung), 4);
      } else {
        expect(y.dscr).toBe(0);
      }

      // Cumulative checks
      if (idx === 0) {
        expect(y.kumulierterCashflowNachSteuer).toBe(y.cashflowNachSteuer);
        expect(y.kumulierteSteuerersparnis).toBe(y.steuereffekt < 0 ? -y.steuereffekt : 0);
        expect(y.kumulierteSondertilgung).toBe(y.sondertilgung);
        expect(y.kumuliertesEigenkapital).toBe(result.initialEquity + y.sondertilgung);
      } else {
        const prev = result.years[idx - 1];
        expect(y.kumulierterCashflowNachSteuer).toBeCloseTo(prev.kumulierterCashflowNachSteuer + y.cashflowNachSteuer, 2);
        const currentErsparnis = y.steuereffekt < 0 ? -y.steuereffekt : 0;
        expect(y.kumulierteSteuerersparnis).toBeCloseTo(prev.kumulierteSteuerersparnis + currentErsparnis, 2);
        expect(y.kumulierteSondertilgung).toBeCloseTo(prev.kumulierteSondertilgung + y.sondertilgung, 2);
        expect(y.kumuliertesEigenkapital).toBeCloseTo(result.initialEquity + y.kumulierteSondertilgung, 2);
      }
    });
  });

  it('should handle 100% equity scenario (no loan) correctly', () => {
    const scenario = createDefaultScenario({
      finanzierung: {
        equityMode: 'percent',
        equityPct: 100,
        equityAbsolute: 300000,
        sollzinsPct: 3.8,
        tilgungPct: 2.0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 4.5,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      }
    });

    const result = runProjection(scenario, 5);

    expect(result.years.length).toBe(5);
    expect(result.loanAmount).toBe(0);

    result.years.forEach(y => {
      expect(y.zins).toBe(0);
      expect(y.tilgung).toBe(0);
      expect(y.annuitaet).toBe(0);
      expect(y.restschuld).toBe(0);
      expect(y.ltv).toBe(0);
      expect(y.dscr).toBe(0);
      expect(y.eigenkapital).toBe(y.immobilienwert);
      expect(y.cashflowVorSteuer).toBeCloseTo(y.nettoKaltmiete - y.bewirtschaftungskosten, 2);
    });
  });

  it('includes unfinanced KNK cash gap in the initial equity investment', () => {
    const scenario = createDefaultScenario({
      finanzierung: {
        equityMode: 'percent',
        equityPct: 0,
        equityAbsolute: 0,
        sollzinsPct: 3.8,
        tilgungPct: 2.0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 4.5,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
      knk: {
        grestPct: 6.5,
        notarPct: 1.5,
        maklerPct: 3.57,
        mitfinanzieren: false,
      },
    });

    const result = runProjection(scenario, 1);

    expect(result.initialEquity).toBeCloseTo(34710, 2);
    expect(result.loanAmount).toBeCloseTo(300000, 2);
  });

  it('passes configured Anschlusstilgung into the amortization projection', () => {
    const base = createDefaultScenario({
      finanzierung: {
        equityMode: 'percent',
        equityPct: 20,
        equityAbsolute: 0,
        sollzinsPct: 3.0,
        tilgungPct: 2.0,
        zinsbindungJahre: 5,
        anschlusszinsPct: 3.0,
        anschlussTilgungPct: null,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
      exit: {
        haltedauerJahre: 12,
        verkaufsnebenkostenPct: 3,
        vorfaelligkeitPct: 0,
      },
    });
    const higher = createDefaultScenario({
      ...base,
      finanzierung: {
        ...base.finanzierung,
        anschlussTilgungPct: 4,
      },
    });

    const baseProjection = runProjection(base);
    const higherProjection = runProjection(higher);

    expect(higherProjection.years[4].restschuld).toBeCloseTo(baseProjection.years[4].restschuld, 2);
    expect(higherProjection.years[5].tilgung).toBeGreaterThan(baseProjection.years[5].tilgung);
    expect(higherProjection.years[11].restschuld).toBeLessThan(baseProjection.years[11].restschuld);
  });

  it('keeps equivalent financing economically consistent when EK exactly covers KNK', () => {
    const noEquityScenario = createDefaultScenario({
      finanzierung: {
        equityMode: 'percent',
        equityPct: 0,
        equityAbsolute: 0,
        sollzinsPct: 3.8,
        tilgungPct: 2.0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 4.5,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
      knk: {
        grestPct: 6.5,
        notarPct: 1.5,
        maklerPct: 3.57,
        mitfinanzieren: false,
      },
    });
    const cashKnkScenario = createDefaultScenario({
      finanzierung: {
        equityMode: 'absolute',
        equityPct: 0,
        equityAbsolute: 34710,
        sollzinsPct: 3.8,
        tilgungPct: 2.0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 4.5,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
      knk: {
        grestPct: 6.5,
        notarPct: 1.5,
        maklerPct: 3.57,
        mitfinanzieren: false,
      },
    });

    const a = runProjection(noEquityScenario, 1);
    const b = runProjection(cashKnkScenario, 1);

    expect(a.initialEquity).toBeCloseTo(b.initialEquity, 2);
    expect(a.loanAmount).toBeCloseTo(b.loanAmount, 2);
    expect(a.years[0].cashflowNachSteuer).toBeCloseTo(b.years[0].cashflowNachSteuer, 2);
  });

  it('should handle sondertilgung correctly and verify cumulative equity growth', () => {
    const scenario = createDefaultScenario({
      finanzierung: {
        equityMode: 'percent',
        equityPct: 20,
        equityAbsolute: 60000,
        sollzinsPct: 3.8,
        tilgungPct: 2.0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 4.5,
        sondertilgungProJahr: 2000, // 2000 EUR sondertilgung p.a.
        disagioPct: 0,
      }
    });

    const result = runProjection(scenario, 5);

    result.years.forEach(y => {
      expect(y.sondertilgung).toBe(2000);
      expect(y.kumulierteSondertilgung).toBe(y.jahr * 2000);
      expect(y.kumuliertesEigenkapital).toBe(result.initialEquity + y.jahr * 2000);
    });
  });

  it('should match a known snapshot of calculations for reproducibility', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 100000,
        wohnflaeche: 50,
        fertigstellungsjahr: 2000,
        bundesland: 'BY', // 3.5% GrESt
        objektTyp: 'bestand',
        bodenwertAnteilPct: 20,
        sanierungskosten: 0,
      },
      knk: {
        grestPct: 3.5,
        notarPct: 1.5,
        maklerPct: 0,
        mitfinanzieren: false,
      },
      finanzierung: {
        equityMode: 'absolute',
        equityPct: 20,
        equityAbsolute: 25000,
        sollzinsPct: 4.0,
        tilgungPct: 2.0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 4.0,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
      miete: {
        rentMode: 'perMonth',
        kaltmieteProMonat: 500,
        kaltmieteProSqm: 10,
        leerstandPct: 0,
        steigerungen: [],
      },
      kosten: {
        maintenanceMode: 'absolute',
        instandhaltungProSqm: 0,
        instandhaltungPctRent: 0,
        instandhaltungAbsolut: 500,
        verwaltungProJahr: 200,
        sonstigeKostenProJahr: 100,
        kostensteigerungPctPa: 0,
      },
      steuer: {
        taxMode: 'marginalRate',
        bruttoJahresEinkommen: 50000,
        grenzsteuersatzPct: 30, // feste 30% Steuer
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      },
      afa: {
        modus: 'linear',
        linearSatzPct: 2.0,
      },
      wertentwicklung: {
        szenario: [],
      },
      exit: {
        haltedauerJahre: 2,
        verkaufsnebenkostenPct: 0,
        vorfaelligkeitPct: 0,
      }
    });

    const result = runProjection(scenario);

    // Initial calculations:
    // knkAmount = 100000 * 5% = 5000
    // totalInvest = 100000 + 5000 = 105000
    // loanAmount = 100000 - (25000 - 5000) = 80000
    expect(result.initialEquity).toBe(25000);
    expect(result.totalInvestment).toBe(105000);
    expect(result.loanAmount).toBe(80000);

    // Amortization:
    // Sollzins + Tilgung = 6% p.a. -> Annuity = 80000 * 6% = 4800 / year (400 / month)
    // Year 1:
    // Interest is calculated monthly:
    // Month 1: interest = 80000 * 4% / 12 = 266.67, tilgung = 400 - 266.67 = 133.33
    // By simulating monthly, the interest for Year 1 is approx 3169.58, tilgung is approx 1630.42
    // Let's verify the exact year-end values:
    const y1 = result.years[0];
    expect(y1.jahr).toBe(1);
    expect(y1.bruttoKaltmiete).toBe(6000);
    expect(y1.nettoKaltmiete).toBe(6000);
    expect(y1.bewirtschaftungskosten).toBe(800); // 500 + 200 + 100
    expect(y1.annuitaet).toBeCloseTo(y1.zins + y1.tilgung, 2);

    // AfA:
    // buildingBasis = (100000 + 5000) * 80% = 84000
    // afaAmount = 84000 * 2% = 1680
    expect(y1.afa).toBe(1680);

    // V&V Ergebnis:
    // vvErgebnis = 6000 (net rent) - zins - 1680 (afa) - 800 (costs)
    expect(y1.vvErgebnis).toBeCloseTo(6000 - y1.zins - 1680 - 800, 2);

    // Tax Effect:
    // marginalRate = 30%
    // steuereffekt = vvErgebnis * 30%
    expect(y1.steuereffekt).toBeCloseTo(y1.vvErgebnis * 0.3, 2);

    // Cashflow:
    // cashflowVorSteuer = 6000 - zins - tilgung - 800
    expect(y1.cashflowVorSteuer).toBeCloseTo(6000 - y1.zins - y1.tilgung - 800, 2);
    expect(y1.cashflowNachSteuer).toBeCloseTo(y1.cashflowVorSteuer - y1.steuereffekt, 2);
  });
});
