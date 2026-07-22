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
        mietspiegel: {
          mittelwertProSqm: 10,
        },
      },
    });

    expect(scenario.name).toBe('Teil-Override');
    expect(scenario.objekt.kaufpreis).toBe(500000);
    expect(scenario.objekt.wohnflaeche).toBe(70);
    expect(scenario.objekt.bundesland).toBe('SN');
    expect(scenario.objekt.bodenwertMode).toBe('perSqm');
    expect(scenario.objekt.bodenwertAnteilPct).toBe(30);
    expect(scenario.objekt.bodenrichtwertProSqm).toBe(1500);
    expect(scenario.objekt.miteigentumsanteilZaehler).toBe(0);
    expect(scenario.objekt.miteigentumsanteilNenner).toBe(0);
    expect(scenario.finanzierung.sollzinsPct).toBe(4.2);
    expect(scenario.finanzierung.tilgungPct).toBe(2);
    expect(scenario.miete.steigerungen).toEqual([]);
    expect(scenario.miete.kaltmieteProMonat).toBe(1050);
    expect(scenario.miete.kaltmieteProJahr).toBe(12600);
    expect(scenario.miete.mietspiegel).toEqual({
      untererSpannwertProSqm: 0,
      mittelwertProSqm: 10,
      obererSpannwertProSqm: 0,
    });
    expect(scenario.notizen).toBe('');
    expect(scenario.sanierungen).toEqual([]);
    expect(scenario.kosten.instandhaltungProSqm).toBe(20);
    expect(scenario.kosten.kostenErfassungMode).toBe('detailliert');
    expect(scenario.kosten.umlagefaehigeKostenProJahr).toBe(0);
    expect(scenario.kosten.nichtUmlagefaehigeKostenProJahr).toBe(0);
    expect(scenario.kosten.wegRuecklageProJahr).toBe(0);
    expect(scenario.kosten.ruecklagenVerwendungPct).toBe(50);
    expect(scenario.kosten.ruecklagenVerzoegerungJahre).toBe(5);
    expect(scenario.kosten.ruecklagenRestwertPct).toBe(0);
  });
});
