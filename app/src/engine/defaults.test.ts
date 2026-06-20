import { describe, expect, it } from 'vitest';
import { createDefaultScenario } from './defaults';

describe('createDefaultScenario', () => {
  it('deep merges nested partial overrides', () => {
    const scenario = createDefaultScenario({
      name: 'Teil-Override',
      objekt: {
        kaufpreis: 500000,
      },
      finanzierung: {
        sollzinsPct: 4.2,
      },
      miete: {
        steigerungen: [],
      },
    });

    expect(scenario.name).toBe('Teil-Override');
    expect(scenario.objekt.kaufpreis).toBe(500000);
    expect(scenario.objekt.wohnflaeche).toBe(70);
    expect(scenario.objekt.bundesland).toBe('NW');
    expect(scenario.finanzierung.sollzinsPct).toBe(4.2);
    expect(scenario.finanzierung.tilgungPct).toBe(2);
    expect(scenario.miete.steigerungen).toEqual([]);
    expect(scenario.miete.kaltmieteProMonat).toBe(1050);
  });
});
