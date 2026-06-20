import { describe, expect, it } from 'vitest';
import { createDefaultScenario } from './defaults';
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

      // IRR of a standard investment should be calculated and positive
      expect(metrics.irr).toBeGreaterThan(1.0);
      expect(metrics.rating).toBeDefined();

      // Break-even points should be calculated
      expect(metrics.breakEvenRent).toBeGreaterThan(0);
      expect(metrics.breakEvenInterestRate).toBeGreaterThan(0);
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

    it('verifies that the break-even interest rate yields a year-1 cashflow near 0', () => {
      const scenario = createDefaultScenario();
      const breakEvenRate = findBreakEvenInterestRate(scenario);

      const testScenario = {
        ...scenario,
        finanzierung: {
          ...scenario.finanzierung,
          sollzinsPct: breakEvenRate,
        },
      };

      const proj = runProjection(testScenario, 1);
      expect(proj.years[0].cashflowNachSteuer).toBeCloseTo(0, 1);
    });

    it('returns 0 for break-even interest when no loan exists', () => {
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

      expect(findBreakEvenInterestRate(scenario)).toBe(0);
    });
  });
});
