import { describe, expect, it } from 'vitest';
import { createDefaultScenario } from '../engine/defaults';
import { exportScenario, exportAllScenarios, importScenarios, exportToCSV } from './io';
import { ProjectionYear } from '../engine/projection';
import { Scenario } from '../engine/types';

describe('io', () => {
  it('should export and import a single scenario correctly', () => {
    const sc = createDefaultScenario();
    sc.name = 'Test Single Import';
    sc.notizen = 'Freie Notiz\nmit Umlaut: Küche';
    sc.miete.mietspiegel = {
      untererSpannwertProSqm: 8,
      mittelwertProSqm: 10,
      obererSpannwertProSqm: 12,
    };
    const json = exportScenario(sc);
    const imported = importScenarios(json);

    expect(Array.isArray(imported)).toBe(false);
    const single = imported as Scenario;
    expect(single.name).toBe('Test Single Import');
    expect(single.objekt.kaufpreis).toBe(sc.objekt.kaufpreis);
    expect(single.schemaVersion).toBe(1);
    expect(single.notizen).toBe('Freie Notiz\nmit Umlaut: Küche');
    expect(single.miete.mietspiegel).toEqual(sc.miete.mietspiegel);
  });

  it('should export and import multiple scenarios correctly in bulk format', () => {
    const sc1 = createDefaultScenario();
    sc1.name = 'Scenario 1';
    const sc2 = createDefaultScenario();
    sc2.id = 'another-id';
    sc2.name = 'Scenario 2';

    const json = exportAllScenarios([sc1, sc2]);
    const imported = importScenarios(json);

    expect(Array.isArray(imported)).toBe(true);
    const list = imported as Scenario[];
    expect(list.length).toBe(2);
    expect(list[0].name).toBe('Scenario 1');
    expect(list[1].name).toBe('Scenario 2');
    expect(list[1].id).toBe('another-id');
  });

  it('should reject duplicate scenario IDs in bulk imports', () => {
    const sc1 = createDefaultScenario();
    sc1.id = 'duplicate-id';
    const sc2 = createDefaultScenario();
    sc2.id = 'duplicate-id';

    expect(() => importScenarios(exportAllScenarios([sc1, sc2]))).toThrow(
      'Bulk-Import enthält doppelte Szenario-ID "duplicate-id".'
    );
  });

  it('should throw an error for invalid JSON string', () => {
    expect(() => importScenarios('{invalid-json}')).toThrow('Ungültiges Dateiformat. Keine valide JSON-Datei.');
  });

  it('should throw an error for missing required properties', () => {
    const invalidObj = { id: '123', name: 'Invalid Scenario', schemaVersion: 1 };
    const json = JSON.stringify(invalidObj);
    expect(() => importScenarios(json)).toThrow('Fehlende Sektion "objekt"');
  });

  it('should throw an error if critical properties have wrong types', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const objekt = parsed.objekt as Record<string, unknown>;
    objekt.kaufpreis = 'not a number';
    const json = JSON.stringify(parsed);
    expect(() => importScenarios(json)).toThrow('kaufpreis muss eine finite Zahl sein.');
  });

  it('should reject malformed increase rules', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const miete = parsed.miete as Record<string, unknown>;
    miete.steigerungen = [null];

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow('Mietsteigerungen [1]: Regel muss ein Objekt sein.');
  });

  it('should reject scenarios with incomplete exit settings', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    parsed.exit = {};

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow('haltedauerJahre muss eine finite Zahl sein.');
  });

  it('should reject imported horizons outside the UI-supported range', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const exit = parsed.exit as Record<string, unknown>;
    exit.haltedauerJahre = 50000;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'haltedauerJahre muss eine ganze Zahl zwischen 1 und 40 sein.'
    );
  });

  it('should reject imported timeline rules outside the supported year range', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const miete = parsed.miete as Record<string, unknown>;
    miete.steigerungen = [{ id: 'late-rule', kind: 'rate', fromYear: 50000, percentPerYear: 1 }];

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'fromYear muss eine ganze Zahl zwischen 1 und 50 sein.'
    );
  });

  it('should reject imported scenarios with impossible object values', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const objekt = parsed.objekt as Record<string, unknown>;
    objekt.kaufpreis = -1;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'kaufpreis muss eine Zahl zwischen 1 und 9007199254740991 sein.'
    );
  });

  it('should reject imported percentage values outside hard domain bounds', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const miete = parsed.miete as Record<string, unknown>;
    miete.leerstandPct = 101;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'leerstandPct muss eine Zahl zwischen 0 und 100 sein.'
    );
  });

  it('should reject imported disagio values that would make the loan denominator invalid', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const finanzierung = parsed.finanzierung as Record<string, unknown>;
    finanzierung.disagioPct = 100;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'disagioPct muss eine Zahl zwischen 0 und 99.999 sein.'
    );
  });

  it('should import old scenarios without Bodenrichtwert mode as percent mode', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const objekt = parsed.objekt as Record<string, unknown>;
    delete objekt.bodenwertMode;
    delete objekt.bodenrichtwertProSqm;

    const imported = importScenarios(JSON.stringify(parsed)) as Scenario;

    expect(imported.objekt.bodenwertMode).toBe('percent');
    expect(imported.objekt.bodenwertAnteilPct).toBe(35);
    expect(imported.objekt.bodenrichtwertProSqm).toBeCloseTo(1500, 5);
  });

  it('should import old scenarios without yearly cold rent and sync rent fields from the selected mode', () => {
    const sc = createDefaultScenario({
      miete: {
        rentMode: 'perMonth',
        kaltmieteProMonat: 900,
        kaltmieteProJahr: 111,
        kaltmieteProSqm: 1,
        leerstandPct: 0,
        steigerungen: [],
      },
    });
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const miete = parsed.miete as Record<string, unknown>;
    delete miete.kaltmieteProJahr;

    const imported = importScenarios(JSON.stringify(parsed)) as Scenario;

    expect(imported.miete.kaltmieteProMonat).toBe(900);
    expect(imported.miete.kaltmieteProJahr).toBe(10800);
    expect(imported.miete.kaltmieteProSqm).toBeCloseTo(900 / 70, 5);
  });

  it('should backfill notes and Mietspiegel values in old scenarios', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const miete = parsed.miete as Record<string, unknown>;
    delete parsed.notizen;
    delete miete.mietspiegel;

    const imported = importScenarios(JSON.stringify(parsed)) as Scenario;

    expect(imported.notizen).toBe('');
    expect(imported.miete.mietspiegel).toEqual({
      untererSpannwertProSqm: 0,
      mittelwertProSqm: 0,
      obererSpannwertProSqm: 0,
    });
  });

  it('should backfill an empty renovation list in schema-v1 scenarios', () => {
    const parsed = JSON.parse(exportScenario(createDefaultScenario())) as Record<string, unknown>;
    delete parsed.sanierungen;

    const imported = importScenarios(JSON.stringify(parsed)) as Scenario;

    expect(imported.schemaVersion).toBe(1);
    expect(imported.sanierungen).toEqual([]);
  });

  it('should preserve and validate renovation measures on import', () => {
    const scenario = createDefaultScenario({
      sanierungen: [
        {
          id: 'reno-1',
          bezeichnung: 'Denkmal-Erhaltungsaufwand',
          jahr: 4,
          betrag: 25000,
          steuerart: 'denkmal11b',
          verteilungsJahre: 5,
          mieterhoehungMoeglich: true,
        },
      ],
    });

    const imported = importScenarios(exportScenario(scenario)) as Scenario;

    expect(imported.sanierungen).toEqual(scenario.sanierungen);
  });

  it('should reject invalid renovation domains and duplicate IDs', () => {
    const scenario = createDefaultScenario({
      sanierungen: [
        {
          id: 'reno-1',
          bezeichnung: 'Bad',
          jahr: 41,
          betrag: 1000,
          steuerart: 'verteilt',
          verteilungsJahre: 3,
          mieterhoehungMoeglich: false,
        },
      ],
    });
    expect(() => importScenarios(exportScenario(scenario))).toThrow(
      'jahr muss eine ganze Zahl zwischen 1 und 40 sein.',
    );

    scenario.sanierungen[0].jahr = 2;
    scenario.sanierungen[0].verteilungsJahre = 6;
    expect(() => importScenarios(exportScenario(scenario))).toThrow(
      'verteilungsJahre muss eine ganze Zahl zwischen 2 und 5 sein.',
    );

    scenario.sanierungen[0].verteilungsJahre = 3;
    scenario.sanierungen.push({ ...scenario.sanierungen[0] });
    expect(() => importScenarios(exportScenario(scenario))).toThrow(
      'Sanierungen enthalten die doppelte ID "reno-1".',
    );
  });

  it('should reject invalid note and Mietspiegel field types', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    parsed.notizen = 123;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow('notizen muss ein Text sein.');

    parsed.notizen = '';
    const miete = parsed.miete as Record<string, unknown>;
    const mietspiegel = miete.mietspiegel as Record<string, unknown>;
    mietspiegel.mittelwertProSqm = -1;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'mittelwertProSqm muss eine Zahl zwischen 0 und 9007199254740991 sein.'
    );
  });

  it('should preserve and validate yearly cold rent mode on import', () => {
    const sc = createDefaultScenario({
      miete: {
        rentMode: 'perYear',
        kaltmieteProMonat: 1,
        kaltmieteProJahr: 14400,
        kaltmieteProSqm: 1,
        leerstandPct: 0,
        steigerungen: [],
      },
    });

    const imported = importScenarios(exportScenario(sc)) as Scenario;

    expect(imported.miete.rentMode).toBe('perYear');
    expect(imported.miete.kaltmieteProJahr).toBe(14400);
    expect(imported.miete.kaltmieteProMonat).toBe(1200);
    expect(imported.miete.kaltmieteProSqm).toBeCloseTo(1200 / 70, 5);
  });

  it('should preserve and validate configured Bodenrichtwert per sqm on import', () => {
    const sc = createDefaultScenario({
      objekt: {
        kaufpreis: 300000,
        wohnflaeche: 70,
        fertigstellungsjahr: 1995,
        bundesland: 'NW',
        objektTyp: 'bestand',
        bodenwertMode: 'perSqm',
        bodenwertAnteilPct: 23.333333,
        bodenrichtwertProSqm: 1000,
        sanierungskosten: 0,
      },
    });

    const imported = importScenarios(exportScenario(sc)) as Scenario;

    expect(imported.objekt.bodenwertMode).toBe('perSqm');
    expect(imported.objekt.bodenrichtwertProSqm).toBe(1000);
  });

  it('should reject invalid Bodenrichtwert mode and negative sqm values on import', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const objekt = parsed.objekt as Record<string, unknown>;
    objekt.bodenwertMode = 'invalid';

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'bodenwertMode hat einen ungültigen Wert.'
    );

    objekt.bodenwertMode = 'perSqm';
    objekt.bodenrichtwertProSqm = -1;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'bodenrichtwertProSqm muss eine Zahl zwischen 0 und 9007199254740991 sein.'
    );
  });

  it('should import old scenarios without Anschlusstilgung as the legacy default', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const finanzierung = parsed.finanzierung as Record<string, unknown>;
    delete finanzierung.anschlussTilgungPct;

    const imported = importScenarios(JSON.stringify(parsed)) as Scenario;

    expect(imported.finanzierung.anschlussTilgungPct).toBeNull();
  });

  it('should backfill plot share and absolute exit-cost fields in old scenarios', () => {
    const parsed = JSON.parse(exportScenario(createDefaultScenario())) as Record<string, unknown>;
    const objekt = parsed.objekt as Record<string, unknown>;
    const exit = parsed.exit as Record<string, unknown>;
    delete objekt.grundstuecksflaeche;
    delete objekt.miteigentumsanteilZaehler;
    delete objekt.miteigentumsanteilNenner;
    delete exit.verkaufsnebenkostenMode;
    delete exit.verkaufsnebenkostenAbsolut;

    const imported = importScenarios(JSON.stringify(parsed)) as Scenario;

    expect(imported.objekt.grundstuecksflaeche).toBe(0);
    expect(imported.objekt.miteigentumsanteilZaehler).toBe(1);
    expect(imported.objekt.miteigentumsanteilNenner).toBe(1);
    expect(imported.exit.verkaufsnebenkostenMode).toBe('percent');
    expect(imported.exit.verkaufsnebenkostenAbsolut).toBe(2500);
  });

  it('should reject impossible plot shares', () => {
    const parsed = JSON.parse(exportScenario(createDefaultScenario())) as Record<string, unknown>;
    const objekt = parsed.objekt as Record<string, unknown>;
    objekt.miteigentumsanteilZaehler = 1001;
    objekt.miteigentumsanteilNenner = 1000;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'miteigentumsanteilZaehler darf miteigentumsanteilNenner nicht überschreiten.'
    );
  });

  it('should reject a partial plot-share payload instead of assuming sole ownership', () => {
    const parsed = JSON.parse(exportScenario(createDefaultScenario())) as Record<string, unknown>;
    const objekt = parsed.objekt as Record<string, unknown>;
    objekt.grundstuecksflaeche = 550;
    delete objekt.miteigentumsanteilNenner;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'Bei einer Grundstücksfläche müssen MEA – Ihr Anteil und MEA – Objekt gesamt angegeben sein.'
    );
  });

  it('should reject absolute exit mode without its amount', () => {
    const parsed = JSON.parse(exportScenario(createDefaultScenario())) as Record<string, unknown>;
    const exit = parsed.exit as Record<string, unknown>;
    exit.verkaufsnebenkostenMode = 'absolute';
    delete exit.verkaufsnebenkostenAbsolut;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'verkaufsnebenkostenAbsolut fehlt für den Pauschalmodus.'
    );
  });

  it('should import old scenarios without KNK-Fremdfinanzierungsanteil using the legacy boolean', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const knk = parsed.knk as Record<string, unknown>;
    knk.mitfinanzieren = true;
    delete knk.finanzierungsPct;

    const imported = importScenarios(JSON.stringify(parsed)) as Scenario;

    expect(imported.knk.mitfinanzieren).toBe(true);
    expect(imported.knk.finanzierungsPct).toBe(100);
  });

  it('should preserve and validate configured KNK-Fremdfinanzierungsanteil on import', () => {
    const sc = createDefaultScenario({
      knk: {
        grestPct: 6.5,
        notarPct: 1.5,
        maklerPct: 3.57,
        mitfinanzieren: true,
        finanzierungsPct: 40,
      },
    });

    const imported = importScenarios(exportScenario(sc)) as Scenario;

    expect(imported.knk.finanzierungsPct).toBe(40);
  });

  it('should reject imported KNK-Fremdfinanzierungsanteil outside hard domain bounds', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const knk = parsed.knk as Record<string, unknown>;
    knk.finanzierungsPct = 101;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'finanzierungsPct muss eine Zahl zwischen 0 und 100 sein.'
    );
  });

  it('should preserve and validate configured Anschlusstilgung on import', () => {
    const sc = createDefaultScenario({
      finanzierung: {
        equityMode: 'percent',
        equityPct: 20,
        equityAbsolute: 0,
        sollzinsPct: 3.8,
        tilgungPct: 2,
        zinsbindungJahre: 10,
        anschlusszinsPct: 4.5,
        anschlussTilgungPct: 3.5,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
    });

    const imported = importScenarios(exportScenario(sc)) as Scenario;

    expect(imported.finanzierung.anschlussTilgungPct).toBe(3.5);
  });

  it('should default a missing ruecklagenAnteilPct to 0 on import', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const kosten = parsed.kosten as Record<string, unknown>;
    delete kosten.ruecklagenAnteilPct;

    const imported = importScenarios(JSON.stringify(parsed)) as Scenario;

    expect(imported.kosten.ruecklagenAnteilPct).toBe(0);
  });

  it('should reject a ruecklagenAnteilPct outside 0-100', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const kosten = parsed.kosten as Record<string, unknown>;
    kosten.ruecklagenAnteilPct = 101;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'ruecklagenAnteilPct muss eine Zahl zwischen 0 und 100 sein.'
    );
  });

  it('should accept step rules with and without wirksamAbMonat and reject invalid months', () => {
    const sc = createDefaultScenario({
      miete: {
        steigerungen: [
          { id: 'step-1', kind: 'step', fromYear: 1, percent: 15, wirksamAbMonat: 3 },
          { id: 'step-2', kind: 'step', fromYear: 4, percent: 10 },
        ],
      },
    });

    const imported = importScenarios(exportScenario(sc)) as Scenario;
    const step1 = imported.miete.steigerungen[0];
    expect(step1.kind).toBe('step');
    expect(step1.kind === 'step' ? step1.wirksamAbMonat : undefined).toBe(3);

    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const miete = parsed.miete as Record<string, unknown>;
    const rules = miete.steigerungen as Array<Record<string, unknown>>;
    rules[0].wirksamAbMonat = 13;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'wirksamAbMonat muss eine ganze Zahl zwischen 1 und 12 sein.'
    );
  });

  it('should reject imported Anschlusstilgung outside hard domain bounds', () => {
    const sc = createDefaultScenario();
    const parsed = JSON.parse(exportScenario(sc)) as Record<string, unknown>;
    const finanzierung = parsed.finanzierung as Record<string, unknown>;
    finanzierung.anschlussTilgungPct = 101;

    expect(() => importScenarios(JSON.stringify(parsed))).toThrow(
      'anschlussTilgungPct muss eine Zahl zwischen 0 und 100 sein.'
    );
  });

  it('should generate valid German CSV format from projection years', () => {
    const years: ProjectionYear[] = [
      {
        jahr: 1,
        bruttoKaltmiete: 12000,
        nettoKaltmiete: 11400,
        mietausfall: 600,
        instandhaltung: 1500,
        verwaltung: 300,
        sonstigeKosten: 100,
        bewirtschaftungskosten: 1900,
        ruecklagenZufuehrung: 250,
        zins: 5000,
        tilgung: 3000,
        sondertilgung: 0,
        annuitaet: 8000,
        sanierungsauszahlung: 10000,
        sanierungsWerbungskosten: 2500,
        objektAfa: 4000,
        sanierungsAfa: 500,
        afa: 4500,
        vvErgebnis: -100,
        steuereffekt: -42,
        cashflowVorSteuer: 1500,
        cashflowNachSteuer: 1542,
        cashflowVorSteuerMonatlich: 125,
        cashflowNachSteuerMonatlich: 128.5,
        immobilienwert: 305000,
        restschuld: 197000,
        eigenkapital: 108000,
        ltv: 64.59,
        dscr: 1.425,
        kumulierterCashflowNachSteuer: 1542,
        kumulierteSteuerersparnis: 42,
        kumulierteSondertilgung: 0,
        kumuliertesEigenkapital: 100000,
      },
    ];

    const csv = exportToCSV(years);
    // Should have BOM
    expect(csv.startsWith('\uFEFF')).toBe(true);
    // Should contain headers
    expect(csv).toContain('Jahr;Brutto-Kaltmiete (€);');
    expect(csv).toContain(
      'Sanierungsauszahlung (€);Sanierungs-Werbungskosten (€);Objekt-AfA (€);Sanierungs-AfA (€);AfA gesamt (€)',
    );
    // Should contain formatted numbers with German comma separator
    expect(csv).toContain('davon Rücklage + kalk. Reserve (nicht sofort abziehbar) (€)');
    expect(csv).toContain(
      '1;12000,00;11400,00;600,00;1500,00;300,00;100,00;1900,00;250,00;5000,00;3000,00;0,00;8000,00;10000,00;2500,00;4000,00;500,00;4500,00;-100,00;-42,00;1500,00;1542,00;125,00;128,50;305000,00;197000,00;108000,00;64,59;1,43',
    );
  });
});
