import { describe, expect, it } from 'vitest';
import { createDefaultScenario } from './defaults';
import { knkAmount } from './derive';
import { runProjection } from './projection';
import { computeIRR, calculateMetrics, findBreakEvenRent, findBreakEvenInterestRate } from './metrics';

describe('Metrics Engine', () => {
  describe('computeIRR', () => {
    it('calculates simple 1-year IRR correctly', () => {
      const irr = computeIRR([-100, 110]);
      expect(irr).toBeCloseTo(10.0, 4);
    });

    it('calculates 2-year IRR correctly', () => {
      const irr = computeIRR([-100, 0, 121]);
      expect(irr).toBeCloseTo(10.0, 4);
    });

    it('handles negative IRR correctly', () => {
      const irr = computeIRR([-100, 90]);
      expect(irr).toBeCloseTo(-10.0, 4);
    });

    it('handles total loss gracefully', () => {
      const irr = computeIRR([-100, 0, 0]);
      expect(irr).toBe(-100);
    });
  });

  describe('calculateMetrics', () => {
    it('calculates plausible investment metrics for the default scenario', () => {
      const scenario = createDefaultScenario({
        exit: {
          haltedauerJahre: 10,
          verkaufsnebenkostenPct: 3.0,
          vorfaelligkeitPct: 0.0,
        },
      });

      const projection = runProjection(scenario);
      const metrics = calculateMetrics(scenario, projection, 4.0);

      // Kaufpreis = 300,000, Miete = 1050 * 12 = 12,600
      // Bruttomietrendite = 12600 / 300000 = 4.2 %
      expect(metrics.bruttomietrendite).toBeCloseTo(4.2, 2);
      expect(metrics.kaufpreisfaktor).toBeCloseTo(300000 / 12600, 2);

      // Nettomietrendite should be lower than Bruttomietrendite
      expect(metrics.nettomietrendite).toBeLessThan(metrics.bruttomietrendite);
      expect(metrics.nettomietrendite).toBeGreaterThan(0);

      // IRR of a standard investment should be calculated and positive.
      // Der Exit in Jahr 10 traegt seit dem §23-Fix Spekulationssteuer,
      // daher liegt die IRR unter dem frueheren steuerfreien Wert.
      expect(metrics.irr).toBeGreaterThan(0);
      expect(metrics.rating).toBeDefined();

      // Break-even points should be calculated
      expect(metrics.breakEvenRent).toBeGreaterThan(0);
      expect(metrics.breakEvenInterestRate).toBeGreaterThan(0);
    });

    it('uses the complete Wirtschaftsplan owner cashout for net rental yield', () => {
      const scenario = createDefaultScenario({
        objekt: { kaufpreis: 60000 },
        miete: {
          rentMode: 'perMonth',
          kaltmieteProMonat: 211,
          kaltmieteProJahr: 2532,
          leerstandPct: 3,
          steigerungen: [],
        },
        kosten: {
          kostenErfassungMode: 'wirtschaftsplan',
          umlagefaehigeKostenProJahr: 1194.99,
          nichtUmlagefaehigeKostenProJahr: 554.06,
          wegRuecklageProJahr: 456,
          kostensteigerungPctPa: 0,
        },
      });
      const projection = runProjection(scenario);
      const metrics = calculateMetrics(scenario, projection);

      expect(projection.years[0].bewirtschaftungskosten).toBeCloseTo(1045.9097, 6);
      expect(metrics.nettomietrendite).toBeCloseTo(
        ((2532 * 0.97 - 1045.9097) / (60000 + knkAmount(scenario))) * 100,
        6,
      );
    });

    it('applies an explicitly selected 100 percent price-effect sensitivity without double counting', () => {
      const base = createDefaultScenario({
        objekt: { kaufpreis: 100000 },
        knk: {
          grestPct: 0,
          notarPct: 0,
          maklerPct: 0,
          mitfinanzieren: false,
          finanzierungsPct: 0,
        },
        finanzierung: {
          equityMode: 'percent',
          equityPct: 100,
          equityAbsolute: 0,
          sollzinsPct: 0,
          tilgungPct: 0,
          zinsbindungJahre: 10,
          anschlusszinsPct: 0,
          anschlussTilgungPct: null,
          sondertilgungProJahr: 0,
          disagioPct: 0,
        },
        miete: {
          rentMode: 'perMonth',
          kaltmieteProMonat: 0,
          kaltmieteProJahr: 0,
          kaltmieteProSqm: 0,
          leerstandPct: 0,
          steigerungen: [],
        },
        kosten: {
          maintenanceMode: 'absolute',
          instandhaltungProSqm: 0,
          instandhaltungPctRent: 0,
          instandhaltungAbsolut: 0,
          ruecklagenAnteilPct: 0,
          verwaltungProJahr: 0,
          sonstigeKostenProJahr: 0,
          kostensteigerungPctPa: 0,
        },
        steuer: {
          taxMode: 'marginalRate',
          bruttoJahresEinkommen: 0,
          grenzsteuersatzPct: 0,
          veranlagung: 'single',
          soli: false,
          kirchensteuerPct: 0,
        },
        afa: { modus: 'linear', linearSatzPct: 0 },
        wertentwicklung: { szenario: [] },
        exit: {
          haltedauerJahre: 2,
          verkaufsnebenkostenMode: 'percent',
          verkaufsnebenkostenPct: 0,
          verkaufsnebenkostenAbsolut: 0,
          vorfaelligkeitPct: 0,
        },
      });
      const withReserve = createDefaultScenario({
        ...base,
        kosten: {
          ...base.kosten,
          instandhaltungAbsolut: 1000,
          ruecklagenAnteilPct: 100,
          ruecklagenRestwertPct: 100,
        },
      });

      const baseMetrics = calculateMetrics(base);
      const reserveProjection = runProjection(withReserve);
      const reserveMetrics = calculateMetrics(withReserve, reserveProjection);

      expect(reserveProjection.years.map((year) => year.cashflowNachSteuer)).toEqual([-1000, -1000]);
      expect(reserveProjection.years[1].kumulierteRuecklage).toBe(2000);
      expect(baseMetrics.irr).toBeCloseTo(0, 4);
      expect(reserveMetrics.irr).toBeCloseTo(baseMetrics.irr, 4);
    });
  });

  describe('Rating-Aufspaltung (IRR / Liquiditaet / Gesamt)', () => {
    const halte = (n: number) => ({
      haltedauerJahre: n,
      verkaufsnebenkostenMode: 'percent' as const,
      verkaufsnebenkostenPct: 3,
      verkaufsnebenkostenAbsolut: 2500,
      vorfaelligkeitPct: 0,
    });

    it('rates IRR green but overall red when every year is cash-negative', () => {
      // Hoher Leverage + starke Wertsteigerung: gute IRR, aber jedes Jahr negativer Cashflow.
      const scenario = createDefaultScenario({
        objekt: { kaufpreis: 300000, wohnflaeche: 70, fertigstellungsjahr: 2000, bundesland: 'NW', objektTyp: 'bestand', bodenwertAnteilPct: 20, sanierungskosten: 0 },
        miete: { rentMode: 'perMonth', kaltmieteProMonat: 800, kaltmieteProJahr: 9600, kaltmieteProSqm: 800 / 70, leerstandPct: 3, mietspiegel: { untererSpannwertProSqm: 0, mittelwertProSqm: 0, obererSpannwertProSqm: 0 }, steigerungen: [{ id: 'r', kind: 'rate', fromYear: 1, percentPerYear: 2 }] },
        wertentwicklung: { szenario: [{ id: 'r', kind: 'rate', fromYear: 1, percentPerYear: 6 }] },
        finanzierung: { equityMode: 'percent', equityPct: 5, equityAbsolute: 0, sollzinsPct: 4, tilgungPct: 3, zinsbindungJahre: 10, anschlusszinsPct: 4, anschlussTilgungPct: null, sondertilgungProJahr: 0, disagioPct: 0 },
        exit: halte(8),
      });
      const m = calculateMetrics(scenario, runProjection(scenario), 4.0);
      expect(m.irr).toBeGreaterThanOrEqual(4.0);
      expect(m.irrRating).toBe('green');
      expect(m.liquidityRating).toBe('red');
      expect(m.rating).toBe('red');
    });

    it('rates everything green when IRR beats the target and all cashflows are non-negative', () => {
      const scenario = createDefaultScenario({
        objekt: { kaufpreis: 200000, wohnflaeche: 70, fertigstellungsjahr: 2000, bundesland: 'NW', objektTyp: 'bestand', bodenwertAnteilPct: 20, sanierungskosten: 0 },
        miete: { rentMode: 'perMonth', kaltmieteProMonat: 1400, kaltmieteProJahr: 16800, kaltmieteProSqm: 20, leerstandPct: 0, mietspiegel: { untererSpannwertProSqm: 0, mittelwertProSqm: 0, obererSpannwertProSqm: 0 }, steigerungen: [{ id: 'r', kind: 'rate', fromYear: 1, percentPerYear: 2 }] },
        finanzierung: { equityMode: 'percent', equityPct: 60, equityAbsolute: 0, sollzinsPct: 3, tilgungPct: 2, zinsbindungJahre: 10, anschlusszinsPct: 3, anschlussTilgungPct: null, sondertilgungProJahr: 0, disagioPct: 0 },
        exit: halte(10),
      });
      const m = calculateMetrics(scenario, runProjection(scenario), 4.0);
      expect(m.irr).toBeGreaterThanOrEqual(4.0);
      expect(m.irrRating).toBe('green');
      expect(m.liquidityRating).toBe('green');
      expect(m.rating).toBe('green');
    });

    it('rates overall yellow for a positive IRR below target with mixed cashflows', () => {
      const scenario = createDefaultScenario({
        objekt: { kaufpreis: 300000, wohnflaeche: 70, fertigstellungsjahr: 2000, bundesland: 'NW', objektTyp: 'bestand', bodenwertAnteilPct: 20, sanierungskosten: 0 },
        miete: { rentMode: 'perMonth', kaltmieteProMonat: 980, kaltmieteProJahr: 11760, kaltmieteProSqm: 980 / 70, leerstandPct: 3, mietspiegel: { untererSpannwertProSqm: 0, mittelwertProSqm: 0, obererSpannwertProSqm: 0 }, steigerungen: [{ id: 'r', kind: 'rate', fromYear: 1, percentPerYear: 7 }] },
        wertentwicklung: { szenario: [{ id: 'r', kind: 'rate', fromYear: 1, percentPerYear: 1.5 }] },
        finanzierung: { equityMode: 'percent', equityPct: 40, equityAbsolute: 0, sollzinsPct: 4, tilgungPct: 2, zinsbindungJahre: 10, anschlusszinsPct: 4, anschlussTilgungPct: null, sondertilgungProJahr: 0, disagioPct: 0 },
        exit: halte(8),
      });
      const proj = runProjection(scenario);
      const m = calculateMetrics(scenario, proj, 4.0);
      const cfs = proj.years.map((y) => y.cashflowNachSteuer);
      expect(m.irr).toBeGreaterThan(0);
      expect(m.irr).toBeLessThan(4.0);
      expect(cfs.some((cf) => cf < 0)).toBe(true);
      expect(cfs.some((cf) => cf >= 0)).toBe(true);
      expect(m.irrRating).toBe('yellow');
      expect(m.liquidityRating).toBe('yellow');
      expect(m.rating).toBe('yellow');
    });

    it('rates everything red for a negative IRR', () => {
      const scenario = createDefaultScenario({
        objekt: { kaufpreis: 500000, wohnflaeche: 70, fertigstellungsjahr: 2000, bundesland: 'NW', objektTyp: 'bestand', bodenwertAnteilPct: 20, sanierungskosten: 0 },
        miete: { rentMode: 'perMonth', kaltmieteProMonat: 700, kaltmieteProJahr: 8400, kaltmieteProSqm: 10, leerstandPct: 5, mietspiegel: { untererSpannwertProSqm: 0, mittelwertProSqm: 0, obererSpannwertProSqm: 0 }, steigerungen: [] },
        wertentwicklung: { szenario: [{ id: 'r', kind: 'rate', fromYear: 1, percentPerYear: -2 }] },
        finanzierung: { equityMode: 'percent', equityPct: 20, equityAbsolute: 0, sollzinsPct: 5, tilgungPct: 2, zinsbindungJahre: 10, anschlusszinsPct: 5, anschlussTilgungPct: null, sondertilgungProJahr: 0, disagioPct: 0 },
        exit: halte(5),
      });
      const m = calculateMetrics(scenario, runProjection(scenario), 4.0);
      expect(m.irr).toBeLessThan(0);
      expect(m.irrRating).toBe('red');
      expect(m.rating).toBe('red');
    });
  });

  describe('Break-even-Zins Semantik (null-Faelle)', () => {
    it('returns null when a financed scenario is already cash-negative at 0 % interest', () => {
      // Hohe Tilgung: der Cashflow nach Steuern ist selbst bei 0 % Sollzins negativ.
      const scenario = createDefaultScenario({
        finanzierung: { equityMode: 'percent', equityPct: 5, equityAbsolute: 0, sollzinsPct: 4, tilgungPct: 8, zinsbindungJahre: 10, anschlusszinsPct: 4, anschlussTilgungPct: null, sondertilgungProJahr: 0, disagioPct: 0 },
        exit: { haltedauerJahre: 5, verkaufsnebenkostenMode: 'percent', verkaufsnebenkostenPct: 3, verkaufsnebenkostenAbsolut: 2500, vorfaelligkeitPct: 0 },
      });
      // Sicherstellen, dass Jahr-1-Cashflow bei 0 % wirklich negativ ist.
      const at0 = runProjection({ ...scenario, finanzierung: { ...scenario.finanzierung, sollzinsPct: 0 } }, 1);
      expect(at0.years[0].cashflowNachSteuer).toBeLessThan(0);
      expect(findBreakEvenInterestRate(scenario)).toBeNull();
    });

    it('does not regress to NaN or Infinity for the default scenario', () => {
      const scenario = createDefaultScenario();
      const be = findBreakEvenInterestRate(scenario);
      expect(be).not.toBeNull();
      expect(Number.isFinite(be as number)).toBe(true);
      expect(be as number).toBeGreaterThan(0);
      expect(be as number).toBeLessThanOrEqual(100);
    });
  });

  describe('Break-even-Basismiete vs. Jahr-1-Miete nach Mietregeln', () => {
    it('reports the actual year-1 rent after a 15 % first-year step while keeping the base value', () => {
      const scenario = createDefaultScenario({
        objekt: { kaufpreis: 120000, wohnflaeche: 68, fertigstellungsjahr: 1990, bundesland: 'TH', objektTyp: 'bestand', bodenwertAnteilPct: 20, sanierungskosten: 0 },
        miete: {
          rentMode: 'perYear',
          kaltmieteProMonat: 0,
          kaltmieteProJahr: 6000,
          kaltmieteProSqm: 0,
          leerstandPct: 0,
          mietspiegel: { untererSpannwertProSqm: 0, mittelwertProSqm: 0, obererSpannwertProSqm: 0 },
          steigerungen: [{ id: 's1', kind: 'step', fromYear: 1, percent: 15 }],
        },
      });

      const m = calculateMetrics(scenario, runProjection(scenario), 4.0);

      // Die Einheit des Basiswerts wird korrekt mitgefuehrt.
      expect(m.breakEvenRentMode).toBe('perYear');
      // Der Basiswert selbst ist die Miete VOR den Mietregeln; die tatsaechliche
      // Jahr-1-Bruttomiete ist wegen der 15-%-Stufe genau um Faktor 1,15 hoeher.
      expect(m.breakEvenRentJahr1Brutto).toBeCloseTo(m.breakEvenRent * 1.15, 2);
      expect(m.breakEvenRentJahr1Brutto).toBeGreaterThan(m.breakEvenRent);
      // EUR/Monat und EUR/m2/Monat leiten sich aus der TATSAECHLICHEN Jahr-1-Miete ab.
      expect(m.breakEvenRentJahr1ProMonat).toBeCloseTo(m.breakEvenRentJahr1Brutto / 12, 4);
      expect(m.breakEvenRentJahr1ProSqm).not.toBeNull();
      expect(m.breakEvenRentJahr1ProSqm as number).toBeCloseTo(m.breakEvenRentJahr1Brutto / 12 / 68, 4);
    });

    it('exposes concrete example numbers (base 5.440 €/a + 15 % → 6.256 €/a year 1)', () => {
      // Rein rechnerische Kontrolle der Kontextualisierung, unabhaengig vom Solver.
      const base = 5440;
      const jahr1 = base * 1.15;
      expect(jahr1).toBeCloseTo(6256, 6);
    });

    it('returns null EUR/m2 when no living area is set', () => {
      const scenario = createDefaultScenario({
        objekt: { kaufpreis: 120000, wohnflaeche: 0, fertigstellungsjahr: 1990, bundesland: 'TH', objektTyp: 'bestand', bodenwertAnteilPct: 20, sanierungskosten: 0 },
        miete: { rentMode: 'perYear', kaltmieteProMonat: 0, kaltmieteProJahr: 6000, kaltmieteProSqm: 0, leerstandPct: 0, mietspiegel: { untererSpannwertProSqm: 0, mittelwertProSqm: 0, obererSpannwertProSqm: 0 }, steigerungen: [] },
      });
      const m = calculateMetrics(scenario, runProjection(scenario), 4.0);
      expect(m.breakEvenRentJahr1ProSqm).toBeNull();
    });
  });

  describe('Break-even solvers', () => {
    it('verifies that the break-even rent yields a year-1 cashflow near 0', () => {
      const scenario = createDefaultScenario();
      const breakEvenRent = findBreakEvenRent(scenario);

      const testScenario = {
        ...scenario,
        miete: {
          ...scenario.miete,
          kaltmieteProMonat: breakEvenRent,
        },
      };

      const proj = runProjection(testScenario, 1);
      expect(proj.years[0].cashflowNachSteuer).toBeCloseTo(0, 1);
    });

    it('expands the rent search range for unusually large financing loads', () => {
      const scenario = createDefaultScenario({
        objekt: {
          kaufpreis: 10000000,
          wohnflaeche: 100,
          fertigstellungsjahr: 1995,
          bundesland: 'NW',
          objektTyp: 'bestand',
          bodenwertAnteilPct: 0,
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
          equityPct: 0,
          equityAbsolute: 0,
          sollzinsPct: 10,
          tilgungPct: 10,
          zinsbindungJahre: 10,
          anschlusszinsPct: 10,
          sondertilgungProJahr: 0,
          disagioPct: 0,
        },
        miete: {
          rentMode: 'perMonth',
          kaltmieteProMonat: 0,
          kaltmieteProSqm: 0,
          leerstandPct: 0,
          steigerungen: [],
        },
        kosten: {
          maintenanceMode: 'absolute',
          instandhaltungProSqm: 0,
          instandhaltungPctRent: 0,
          instandhaltungAbsolut: 0,
          verwaltungProJahr: 0,
          sonstigeKostenProJahr: 0,
          kostensteigerungPctPa: 0,
        },
        steuer: {
          taxMode: 'marginalRate',
          bruttoJahresEinkommen: 0,
          grenzsteuersatzPct: 0,
          veranlagung: 'single',
          soli: false,
          kirchensteuerPct: 0,
        },
        afa: {
          modus: 'linear',
          linearSatzPct: 0,
        },
      });

      const breakEvenRent = findBreakEvenRent(scenario);
      const testScenario = {
        ...scenario,
        miete: {
          ...scenario.miete,
          kaltmieteProMonat: breakEvenRent,
        },
      };

      expect(breakEvenRent).toBeGreaterThan(100000);
      expect(runProjection(testScenario, 1).years[0].cashflowNachSteuer).toBeCloseTo(0, 1);
    });

    it('returns 0 rent when zero rent is already break-even', () => {
      const scenario = createDefaultScenario({
        knk: {
          grestPct: 0,
          notarPct: 0,
          maklerPct: 0,
          mitfinanzieren: false,
        },
        finanzierung: {
          equityMode: 'percent',
          equityPct: 100,
          equityAbsolute: 0,
          sollzinsPct: 0,
          tilgungPct: 0,
          zinsbindungJahre: 10,
          anschlusszinsPct: 0,
          sondertilgungProJahr: 0,
          disagioPct: 0,
        },
        miete: {
          rentMode: 'perMonth',
          kaltmieteProMonat: 0,
          kaltmieteProSqm: 0,
          leerstandPct: 0,
          steigerungen: [],
        },
        kosten: {
          maintenanceMode: 'absolute',
          instandhaltungProSqm: 0,
          instandhaltungPctRent: 0,
          instandhaltungAbsolut: 0,
          verwaltungProJahr: 0,
          sonstigeKostenProJahr: 0,
          kostensteigerungPctPa: 0,
        },
        steuer: {
          taxMode: 'marginalRate',
          bruttoJahresEinkommen: 0,
          grenzsteuersatzPct: 0,
          veranlagung: 'single',
          soli: false,
          kirchensteuerPct: 0,
        },
        afa: {
          modus: 'linear',
          linearSatzPct: 0,
        },
      });

      expect(findBreakEvenRent(scenario)).toBe(0);
    });

    it('verifies that the break-even interest rate yields a year-1 cashflow near 0', () => {
      const scenario = createDefaultScenario();
      const breakEvenRate = findBreakEvenInterestRate(scenario);
      expect(breakEvenRate).not.toBeNull();

      const testScenario = {
        ...scenario,
        finanzierung: {
          ...scenario.finanzierung,
          sollzinsPct: breakEvenRate as number,
        },
      };

      const proj = runProjection(testScenario, 1);
      expect(proj.years[0].cashflowNachSteuer).toBeCloseTo(0, 1);
    });

    it('returns null for break-even interest when no loan exists', () => {
      const scenario = createDefaultScenario({
        finanzierung: {
          equityMode: 'percent',
          equityPct: 100,
          equityAbsolute: 0,
          sollzinsPct: 3.8,
          tilgungPct: 2,
          zinsbindungJahre: 10,
          anschlusszinsPct: 4.5,
          sondertilgungProJahr: 0,
          disagioPct: 0,
        },
      });

      expect(findBreakEvenInterestRate(scenario)).toBeNull();
    });

    it('returns 0 interest when 0% is already break-even', () => {
      const scenario = createDefaultScenario({
        knk: {
          grestPct: 0,
          notarPct: 0,
          maklerPct: 0,
          mitfinanzieren: true,
        },
        finanzierung: {
          equityMode: 'percent',
          equityPct: 0,
          equityAbsolute: 0,
          sollzinsPct: 0,
          tilgungPct: 0,
          zinsbindungJahre: 10,
          anschlusszinsPct: 0,
          sondertilgungProJahr: 0,
          disagioPct: 0,
        },
        miete: {
          rentMode: 'perMonth',
          kaltmieteProMonat: 0,
          kaltmieteProSqm: 0,
          leerstandPct: 0,
          steigerungen: [],
        },
        kosten: {
          maintenanceMode: 'absolute',
          instandhaltungProSqm: 0,
          instandhaltungPctRent: 0,
          instandhaltungAbsolut: 0,
          verwaltungProJahr: 0,
          sonstigeKostenProJahr: 0,
          kostensteigerungPctPa: 0,
        },
        steuer: {
          taxMode: 'marginalRate',
          bruttoJahresEinkommen: 0,
          grenzsteuersatzPct: 0,
          veranlagung: 'single',
          soli: false,
          kirchensteuerPct: 0,
        },
        afa: {
          modus: 'linear',
          linearSatzPct: 0,
        },
      });

      expect(findBreakEvenInterestRate(scenario)).toBe(0);
    });
  });
});
