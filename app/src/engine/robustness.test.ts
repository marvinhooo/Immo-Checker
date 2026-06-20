import { describe, expect, it } from 'vitest';
import { createDefaultScenario } from './defaults';
import type { Scenario } from './types';
import { runProjection } from './projection';
import { calculateExit } from './exit';
import { calculateMetrics } from './metrics';
import { analyzeHoldingPeriods } from './holding';

// Story 12: degenerate / extreme inputs must never produce NaN, Infinity or crashes.

function assertAllFinite(label: string, obj: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'number') {
      expect(Number.isFinite(value), `${label}.${key} = ${value}`).toBe(true);
    }
  }
}

function runWholeEngine(scenario: Scenario): void {
  const proj = runProjection(scenario);
  for (const y of proj.years) {
    assertAllFinite(`year ${y.jahr}`, y as unknown as Record<string, unknown>);
  }
  const exit = calculateExit(scenario, proj);
  assertAllFinite('exit', exit as unknown as Record<string, unknown>);

  const metrics = calculateMetrics(scenario, proj);
  assertAllFinite('metrics', metrics as unknown as Record<string, unknown>);

  const holding = analyzeHoldingPeriods(scenario);
  for (const y of holding.years) {
    assertAllFinite(`holding year ${y.jahr}`, y as unknown as Record<string, unknown>);
  }
}

const cases: Record<string, Partial<Scenario>> = {
  'zero purchase price': { objekt: { ...createDefaultScenario().objekt, kaufpreis: 0 } },
  'zero living space': { objekt: { ...createDefaultScenario().objekt, wohnflaeche: 0 } },
  'zero rent': {
    miete: { ...createDefaultScenario().miete, kaltmieteProMonat: 0, kaltmieteProSqm: 0 },
  },
  '100% vacancy': { miete: { ...createDefaultScenario().miete, leerstandPct: 100 } },
  '100% equity (no loan)': {
    finanzierung: { ...createDefaultScenario().finanzierung, equityMode: 'percent', equityPct: 100 },
  },
  'zero tilgung': { finanzierung: { ...createDefaultScenario().finanzierung, tilgungPct: 0 } },
  'extreme interest 25%': {
    finanzierung: { ...createDefaultScenario().finanzierung, sollzinsPct: 25, anschlusszinsPct: 25 },
  },
  'one-year holding': { exit: { ...createDefaultScenario().exit, haltedauerJahre: 1 } },
  'no growth rules': {
    miete: { ...createDefaultScenario().miete, steigerungen: [] },
    wertentwicklung: { szenario: [] },
  },
  '100% land share (no AfA base)': {
    objekt: { ...createDefaultScenario().objekt, bodenwertAnteilPct: 100 },
  },
  'denkmal with zero Sanierung': {
    objekt: { ...createDefaultScenario().objekt, sanierungskosten: 0 },
    afa: { modus: 'denkmal7i', linearSatzPct: 2.0 },
  },
};

describe('Engine robustness against degenerate inputs (Story 12)', () => {
  for (const [name, overrides] of Object.entries(cases)) {
    it(`produces only finite numbers: ${name}`, () => {
      const scenario = createDefaultScenario(overrides);
      expect(() => runWholeEngine(scenario)).not.toThrow();
    });
  }
});
