import { describe, expect, it } from 'vitest';
import { createDefaultScenario } from './defaults';
import {
  bodenwertFlaeche,
  landValueAmount,
  effectiveBodenwertAnteilPct,
  hasCompleteBodenrichtwertInputs,
} from './derive';

describe('Bodenwert derivation', () => {
  it('uses the pro-rata plot area (Grundstueck x MEA) in perSqm mode', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 60000,
        wohnflaeche: 40.55,
        bodenwertMode: 'perSqm',
        bodenrichtwertProSqm: 620,
        grundstuecksflaeche: 550,
        miteigentumsanteilZaehler: 57,
        miteigentumsanteilNenner: 1000,
      },
    });

    // 550 m2 * 57/1000 = 31.35 m2 anteiliges Grundstueck
    expect(bodenwertFlaeche(scenario)).toBeCloseTo(31.35, 6);
    expect(landValueAmount(scenario)).toBeCloseTo(620 * 31.35, 6);
    expect(effectiveBodenwertAnteilPct(scenario)).toBeCloseTo(((620 * 31.35) / 60000) * 100, 6);
  });

  it('uses the temporary 30 percent fallback without overwriting partial raw values', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 60000,
        wohnflaeche: 40.55,
        bodenwertMode: 'perSqm',
        bodenwertAnteilPct: 17,
        bodenrichtwertProSqm: 620,
        grundstuecksflaeche: 0,
        miteigentumsanteilZaehler: 57,
        miteigentumsanteilNenner: 1000,
      },
    });
    const rawBefore = structuredClone(scenario.objekt);

    expect(hasCompleteBodenrichtwertInputs(scenario)).toBe(false);
    expect(bodenwertFlaeche(scenario)).toBe(0);
    expect(landValueAmount(scenario)).toBe(18000);
    expect(effectiveBodenwertAnteilPct(scenario)).toBe(30);
    expect(scenario.objekt).toEqual(rawBefore);

    scenario.objekt.grundstuecksflaeche = 550;
    expect(hasCompleteBodenrichtwertInputs(scenario)).toBe(true);
    expect(landValueAmount(scenario)).toBeCloseTo(620 * 31.35, 6);
    expect(scenario.objekt.bodenwertAnteilPct).toBe(17);
    expect(scenario.objekt.bodenrichtwertProSqm).toBe(620);
  });

  it('uses only the explicitly active land-value method and preserves both raw inputs', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 60000,
        bodenwertMode: 'percent',
        bodenwertAnteilPct: 17,
        bodenrichtwertProSqm: 650,
        grundstuecksflaeche: 550,
        miteigentumsanteilZaehler: 57,
        miteigentumsanteilNenner: 1000,
      },
    });
    const rawInputs = {
      bodenwertAnteilPct: scenario.objekt.bodenwertAnteilPct,
      bodenrichtwertProSqm: scenario.objekt.bodenrichtwertProSqm,
      grundstuecksflaeche: scenario.objekt.grundstuecksflaeche,
      miteigentumsanteilZaehler: scenario.objekt.miteigentumsanteilZaehler,
      miteigentumsanteilNenner: scenario.objekt.miteigentumsanteilNenner,
    };

    expect(landValueAmount(scenario)).toBe(10200);

    scenario.objekt.bodenwertMode = 'perSqm';
    expect(landValueAmount(scenario)).toBeCloseTo(20377.5, 6);
    expect({
      bodenwertAnteilPct: scenario.objekt.bodenwertAnteilPct,
      bodenrichtwertProSqm: scenario.objekt.bodenrichtwertProSqm,
      grundstuecksflaeche: scenario.objekt.grundstuecksflaeche,
      miteigentumsanteilZaehler: scenario.objekt.miteigentumsanteilZaehler,
      miteigentumsanteilNenner: scenario.objekt.miteigentumsanteilNenner,
    }).toEqual(rawInputs);
  });

  it('does not use an impossible MEA ratio above 100 percent', () => {
    const scenario = createDefaultScenario({
      objekt: {
        wohnflaeche: 40.55,
        grundstuecksflaeche: 550,
        miteigentumsanteilZaehler: 1001,
        miteigentumsanteilNenner: 1000,
      },
    });

    expect(bodenwertFlaeche(scenario)).toBe(0);
    expect(landValueAmount(scenario)).toBeCloseTo(scenario.objekt.kaufpreis * 0.3, 6);
  });

  it('keeps the 30 percent fallback when plot and BRW exist but MEA is still unknown', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 60000,
        bodenwertMode: 'perSqm',
        bodenrichtwertProSqm: 620,
        grundstuecksflaeche: 550,
        miteigentumsanteilZaehler: 0,
        miteigentumsanteilNenner: 0,
      },
    });

    expect(hasCompleteBodenrichtwertInputs(scenario)).toBe(false);
    expect(bodenwertFlaeche(scenario)).toBe(0);
    expect(landValueAmount(scenario)).toBe(18000);
  });

  it('caps the land value at the purchase price', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 10000,
        wohnflaeche: 40,
        bodenwertMode: 'perSqm',
        bodenrichtwertProSqm: 2000,
        grundstuecksflaeche: 500,
        miteigentumsanteilZaehler: 1,
        miteigentumsanteilNenner: 1,
      },
    });

    expect(landValueAmount(scenario)).toBe(10000);
  });
});
