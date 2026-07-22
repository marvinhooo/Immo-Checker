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
      expect(y.afa).toBeCloseTo(y.objektAfa + y.sanierungsAfa, 2);
      expect(y.vvErgebnis).toBeCloseTo(
        y.nettoKaltmiete - y.zins - y.afa - (y.bewirtschaftungskosten - y.ruecklagenZufuehrung) - y.sanierungsWerbungskosten,
        2,
      );
      
      // Cashflow consistency
      expect(y.cashflowVorSteuer).toBeCloseTo(
        y.nettoKaltmiete
          - y.zins
          - y.tilgung
          - y.sondertilgung
          - y.bewirtschaftungskosten
          - y.sanierungsauszahlung,
        2,
      );
      expect(y.cashflowNachSteuer).toBeCloseTo(y.cashflowVorSteuer - y.steuereffekt, 2);

      expect(y.cashflowVorSteuerMonatlich).toBeCloseTo(y.cashflowVorSteuer / 12, 2);
      expect(y.cashflowNachSteuerMonatlich).toBeCloseTo(y.cashflowNachSteuer / 12, 2);

      // Balance sheet consistency
      expect(y.eigenkapital).toBeCloseTo(y.immobilienwert - y.restschuld, 2);
      expect(y.ltv).toBeCloseTo((y.restschuld / y.immobilienwert) * 100, 2);

      if (y.zins + y.tilgung > 0) {
        expect(y.dscr).toBeCloseTo((y.nettoKaltmiete - y.bewirtschaftungskosten) / (y.zins + y.tilgung), 4);
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

  it('includes planned renovations in cashflow, V&V and total AfA without changing rent', () => {
    const base = createDefaultScenario({
      steuer: {
        taxMode: 'marginalRate',
        bruttoJahresEinkommen: 50000,
        grenzsteuersatzPct: 30,
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      },
      afa: { modus: 'linear', linearSatzPct: 2 },
      exit: { haltedauerJahre: 3, verkaufsnebenkostenPct: 0, vorfaelligkeitPct: 0 },
    });
    const withRenovations = createDefaultScenario({
      ...base,
      sanierungen: [
        {
          id: 'direct',
          bezeichnung: 'Direkter Aufwand',
          jahr: 2,
          betrag: 12000,
          steuerart: 'sofort',
          verteilungsJahre: 2,
          mieterhoehungMoeglich: true,
        },
        {
          id: 'manufacturing',
          bezeichnung: 'Herstellungskosten',
          jahr: 2,
          betrag: 10000,
          steuerart: 'herstellung',
          verteilungsJahre: 2,
          mieterhoehungMoeglich: true,
        },
      ],
    });

    const baseProjection = runProjection(base);
    const renovationProjection = runProjection(withRenovations);
    const baseYear2 = baseProjection.years[1];
    const year2 = renovationProjection.years[1];

    expect(year2.bruttoKaltmiete).toBe(baseYear2.bruttoKaltmiete);
    expect(year2.nettoKaltmiete).toBe(baseYear2.nettoKaltmiete);
    expect(year2.immobilienwert).toBe(baseYear2.immobilienwert);
    expect(year2.sanierungsauszahlung).toBe(22000);
    expect(year2.sanierungsWerbungskosten).toBe(12000);
    expect(year2.objektAfa).toBe(baseYear2.afa);
    expect(year2.sanierungsAfa).toBe(200);
    expect(year2.afa).toBe(baseYear2.afa + 200);
    expect(year2.vvErgebnis).toBeCloseTo(baseYear2.vvErgebnis - 12200, 2);
    expect(year2.cashflowVorSteuer).toBeCloseTo(baseYear2.cashflowVorSteuer - 22000, 2);
    expect(year2.steuereffekt).toBeCloseTo(baseYear2.steuereffekt - 3660, 2);
    expect(year2.cashflowNachSteuer).toBeCloseTo(baseYear2.cashflowNachSteuer - 18340, 2);
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

  it('keeps zero purchase equity equivalent across percent and absolute modes', () => {
    const noPurchaseEquityScenario = createDefaultScenario({
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
    const equivalentAbsoluteScenario = createDefaultScenario({
      finanzierung: {
        equityMode: 'absolute',
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

    const a = runProjection(noPurchaseEquityScenario, 1);
    const b = runProjection(equivalentAbsoluteScenario, 1);

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

  it('treats the Ruecklagenanteil as cash-out but not as immediately deductible', () => {
    const base = createDefaultScenario({
      steuer: {
        taxMode: 'marginalRate',
        bruttoJahresEinkommen: 50000,
        grenzsteuersatzPct: 30,
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      },
      kosten: {
        maintenanceMode: 'absolute',
        instandhaltungProSqm: 0,
        instandhaltungPctRent: 0,
        instandhaltungAbsolut: 1000,
        ruecklagenAnteilPct: 0,
        verwaltungProJahr: 300,
        sonstigeKostenProJahr: 100,
        kostensteigerungPctPa: 0,
      },
    });
    const withRuecklage = createDefaultScenario({
      ...base,
      kosten: { ...base.kosten, ruecklagenAnteilPct: 40 },
    });

    const baseYear1 = runProjection(base, 1).years[0];
    const ruecklagenProjection = runProjection(withRuecklage, 2);
    const year1 = ruecklagenProjection.years[0];
    const year2 = ruecklagenProjection.years[1];

    // 40 % von 1000 EUR Instandhaltung sind Ruecklagenzufuehrung
    expect(year1.ruecklagenZufuehrung).toBeCloseTo(400, 2);
    expect(year1.kumulierteRuecklage).toBeCloseTo(400, 2);
    expect(year2.kumulierteRuecklage).toBeCloseTo(800, 2);
    // Cash-out unveraendert (volle Bewirtschaftungskosten fliessen ab)
    expect(year1.cashflowVorSteuer).toBeCloseTo(baseYear1.cashflowVorSteuer, 2);
    expect(year1.bewirtschaftungskosten).toBeCloseTo(baseYear1.bewirtschaftungskosten, 2);
    // V&V-Ergebnis steigt um den nicht abziehbaren Anteil
    expect(year1.vvErgebnis).toBeCloseTo(baseYear1.vvErgebnis + 400, 2);
    // Steuereffekt entsprechend hoeher (30 % Grenzsteuersatz)
    expect(year1.steuereffekt).toBeCloseTo(baseYear1.steuereffekt + 120, 2);
    expect(year1.cashflowNachSteuer).toBeCloseTo(baseYear1.cashflowNachSteuer - 120, 2);
  });

  it('uses 50 percent of each WEG contribution after five years without a second cash-out', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 100000,
        wohnflaeche: 50,
        bodenwertMode: 'percent',
        bodenwertAnteilPct: 30,
      },
      finanzierung: {
        equityMode: 'absolute',
        equityAbsolute: 100000,
        sollzinsPct: 0,
        tilgungPct: 0,
        sondertilgungProJahr: 0,
      },
      miete: {
        rentMode: 'perMonth',
        kaltmieteProMonat: 1000,
        kaltmieteProJahr: 12000,
        kaltmieteProSqm: 20,
        leerstandPct: 0,
        steigerungen: [],
      },
      kosten: {
        kostenErfassungMode: 'wirtschaftsplan',
        umlagefaehigeKostenProJahr: 0,
        nichtUmlagefaehigeKostenProJahr: 0,
        wegRuecklageProJahr: 1000,
        ruecklagenVerwendungPct: 50,
        ruecklagenVerzoegerungJahre: 5,
        kostensteigerungPctPa: 0,
      },
      steuer: {
        taxMode: 'marginalRate',
        grenzsteuersatzPct: 30,
        soli: false,
        kirchensteuerPct: 0,
      },
      wertentwicklung: { szenario: [] },
    });

    const result = runProjection(scenario, 7);
    expect(result.years.slice(0, 5).map((year) => year.ruecklagenEntnahme)).toEqual([0, 0, 0, 0, 0]);
    expect(result.years[5].ruecklagenEntnahme).toBe(500);
    expect(result.years[6].ruecklagenEntnahme).toBe(500);
    expect(result.years[5].ruecklagenWerbungskosten).toBe(500);
    expect(result.years.map((year) => year.kumulierteRuecklage)).toEqual([
      1000, 2000, 3000, 4000, 5000, 5500, 6000,
    ]);

    // Die Verwendung wurde bereits durch die Zufuehrung bezahlt und ist kein zweiter Cash-Abfluss.
    expect(result.years[5].cashflowVorSteuer).toBeCloseTo(result.years[4].cashflowVorSteuer, 6);
    expect(result.years[5].vvErgebnis).toBeCloseTo(result.years[4].vvErgebnis - 500, 6);
    expect(result.years[5].cashflowNachSteuer).toBeCloseTo(result.years[4].cashflowNachSteuer + 150, 6);

    const tenYears = runProjection(scenario, 10).years;
    const fifteenYears = runProjection(scenario, 15).years;
    expect(fifteenYears.slice(0, 10)).toEqual(tenYears);
  });

  it('should match a known snapshot of calculations for reproducibility', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 100000,
        wohnflaeche: 50,
        fertigstellungsjahr: 2000,
        bundesland: 'BY', // 3.5% GrESt
        objektTyp: 'bestand',
        bodenwertMode: 'percent',
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
    // loanAmount = 100000 - 25000 = 75000; KNK bleiben separater Baranteil.
    expect(result.initialEquity).toBe(30000);
    expect(result.totalInvestment).toBe(105000);
    expect(result.loanAmount).toBe(75000);

    // Amortization:
    // Sollzins + Tilgung = 6% p.a. -> Annuity = 75000 * 6% = 4500 / year (375 / month)
    // Year 1:
    // Interest is calculated monthly:
    // Month 1: interest = 75000 * 4% / 12 = 250.00, tilgung = 375 - 250 = 125.00
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
