import { describe, expect, it } from 'vitest';
import { createDefaultScenario } from './defaults';
import { runProjection } from './projection';
import { calculateExit } from './exit';
import { calculateMetrics } from './metrics';
import { analyzeHoldingPeriods } from './holding';

describe('Holding-period analysis (Story 13)', () => {
  it('produces one row per holding year', () => {
    const scenario = createDefaultScenario(); // haltedauer 15
    const analysis = analyzeHoldingPeriods(scenario);
    expect(analysis.years).toHaveLength(15);
    expect(analysis.years.map((y) => y.jahr)).toEqual(
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
    expect(analysis.initialEquity).toBeGreaterThan(0);
  });

  it('matches the single-exit calculation (Story 6) for the chosen holding year', () => {
    const scenario = createDefaultScenario({
      exit: { haltedauerJahre: 12, verkaufsnebenkostenPct: 3, vorfaelligkeitPct: 0 },
    });
    const analysis = analyzeHoldingPeriods(scenario);
    const row = analysis.years.find((y) => y.jahr === 12)!;

    const proj = runProjection(scenario);
    const exitRes = calculateExit(scenario, proj);
    const metrics = calculateMetrics(scenario, proj);

    // Identity: holding-row for the chosen year == single-exit result (< 1 EUR tolerance)
    expect(row.nettoVerkaufserloesNachSteuer).toBeCloseTo(exitRes.nettoVerkaufserloesNachSteuer, 0);
    expect(row.restschuld).toBeCloseTo(exitRes.restschuld, 0);
    expect(row.spekulationssteuer).toBeCloseTo(exitRes.spekulationssteuer, 0);
    // IRR matches the metrics IRR for the same horizon
    expect(row.irrPct).toBeCloseTo(metrics.irr, 4);
  });

  it('subtracts the accumulated (negative) cashflow from the total gain', () => {
    // Underwater scenario: high interest + low rent -> negative cashflow after tax
    const scenario = createDefaultScenario({
      finanzierung: {
        equityMode: 'percent',
        equityPct: 10,
        equityAbsolute: 30000,
        sollzinsPct: 8.0,
        tilgungPct: 2.0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 8.0,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
      miete: {
        rentMode: 'perMonth',
        kaltmieteProMonat: 500,
        kaltmieteProSqm: 7,
        leerstandPct: 5,
        steigerungen: [{ id: 'r1', kind: 'rate', fromYear: 1, percentPerYear: 1.0 }],
      },
    });

    const analysis = analyzeHoldingPeriods(scenario);
    const row = analysis.years[analysis.years.length - 1];

    // Cumulative after-tax cashflow must be negative here
    expect(row.kumulierterCashflowNachSteuer).toBeLessThan(0);
    // Total gain = kumCf + nettoVerkaufserloesNachSteuer - equity, so the negative cashflow
    // pulls the gain below "sale proceeds minus equity" by exactly that cashflow.
    expect(row.gesamtgewinn).toBeCloseTo(
      row.kumulierterCashflowNachSteuer + row.nettoVerkaufserloesNachSteuer - analysis.initialEquity,
      2,
    );
    expect(row.gesamtgewinn).toBeLessThan(row.nettoVerkaufserloesNachSteuer - analysis.initialEquity);
  });

  it('applies Spekulationssteuer before year 10 and not at/after year 10', () => {
    const scenario = createDefaultScenario({
      exit: { haltedauerJahre: 15, verkaufsnebenkostenPct: 3, vorfaelligkeitPct: 0 },
    });
    const analysis = analyzeHoldingPeriods(scenario);

    const year9 = analysis.years.find((y) => y.jahr === 9)!;
    const year10 = analysis.years.find((y) => y.jahr === 10)!;

    expect(year9.spekulationssteuerPflichtig).toBe(true);
    expect(year9.spekulationssteuer).toBeGreaterThan(0);

    expect(year10.spekulationssteuerPflichtig).toBe(false);
    expect(year10.spekulationssteuer).toBe(0);
  });

  it('reports EK profitability both annualized (IRR + CAGR) and total (multiple)', () => {
    const scenario = createDefaultScenario();
    const analysis = analyzeHoldingPeriods(scenario);

    for (const y of analysis.years) {
      expect(Number.isFinite(y.irrPct)).toBe(true);
      expect(Number.isFinite(y.cagrPct)).toBe(true);
      expect(Number.isFinite(y.ekMultiple)).toBe(true);
      expect(Number.isFinite(y.ekRenditeGesamtPct)).toBe(true);
      // multiple and total return % are consistent: multiple = 1 + return/100
      expect(y.ekMultiple).toBeCloseTo(1 + y.ekRenditeGesamtPct / 100, 6);
    }

    expect(analysis.besteExitJahrNachIrr).not.toBeNull();
    expect(analysis.steuerfreiAbJahr).toBe(10);
  });
});
