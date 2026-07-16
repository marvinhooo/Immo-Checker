import { describe, expect, it } from 'vitest';
import { createDefaultScenario } from './defaults';
import { bodenwertFlaeche, landValueAmount, effectiveBodenwertAnteilPct } from './derive';

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

  it('falls back to Wohnflaeche while no plot area is entered', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 60000,
        wohnflaeche: 40.55,
        bodenwertMode: 'perSqm',
        bodenrichtwertProSqm: 620,
        grundstuecksflaeche: 0,
      },
    });

    expect(bodenwertFlaeche(scenario)).toBeCloseTo(40.55, 6);
    expect(landValueAmount(scenario)).toBeCloseTo(620 * 40.55, 6);
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

    expect(bodenwertFlaeche(scenario)).toBeCloseTo(40.55, 6);
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
