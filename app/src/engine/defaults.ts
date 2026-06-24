// Realistisches Default-Szenario (ETW 300.000 EUR), das sofort sinnvolle Ergebnisse liefert.
import { SCHEMA_VERSION, type Scenario } from './types';
import { GREST_BY_BUNDESLAND, linearAfaRateForYear } from './constants';

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

function uuid(): string {
  return crypto.randomUUID();
}

export function createDefaultScenario(overrides: DeepPartial<Scenario> = {}): Scenario {
  const bundesland = 'SN' as const;
  const fertigstellungsjahr = 1995;
  const wohnflaeche = 70;
  const kaufpreis = 300000;
  const kaltmieteProMonat = 1050;
  const bodenrichtwertProSqm = 1500;

  const base: Scenario = {
    schemaVersion: SCHEMA_VERSION,
    id: uuid(),
    name: 'Beispiel: ETW 300.000 EUR',
    objekt: {
      kaufpreis,
      wohnflaeche,
      fertigstellungsjahr,
      bundesland,
      objektTyp: 'bestand',
      bodenwertMode: 'perSqm',
      bodenwertAnteilPct: ((bodenrichtwertProSqm * wohnflaeche) / kaufpreis) * 100,
      bodenrichtwertProSqm,
      sanierungskosten: 0,
    },
    knk: {
      grestPct: GREST_BY_BUNDESLAND[bundesland],
      notarPct: 1.5,
      maklerPct: 3.57,
      mitfinanzieren: false,
      finanzierungsPct: 0,
    },
    finanzierung: {
      equityMode: 'percent',
      equityPct: 0,
      equityAbsolute: 0,
      sollzinsPct: 4.0,
      tilgungPct: 2.0,
      zinsbindungJahre: 10,
      anschlusszinsPct: 4.0,
      anschlussTilgungPct: null,
      sondertilgungProJahr: 0,
      disagioPct: 0,
    },
    miete: {
      rentMode: 'perMonth',
      kaltmieteProMonat,
      kaltmieteProJahr: kaltmieteProMonat * 12,
      kaltmieteProSqm: kaltmieteProMonat / wohnflaeche,
      leerstandPct: 3,
      steigerungen: [
        { id: uuid(), kind: 'rate', fromYear: 1, percentPerYear: 1.5 },
      ],
    },
    kosten: {
      maintenanceMode: 'perSqm',
      instandhaltungProSqm: 20,
      instandhaltungPctRent: 8,
      instandhaltungAbsolut: 1200,
      verwaltungProJahr: 360,
      sonstigeKostenProJahr: 300,
      kostensteigerungPctPa: 2,
    },
    steuer: {
      taxMode: 'income',
      bruttoJahresEinkommen: 80000,
      grenzsteuersatzPct: 42,
      veranlagung: 'single',
      soli: false,
      kirchensteuerPct: 0,
    },
    afa: {
      modus: 'linear',
      linearSatzPct: linearAfaRateForYear(fertigstellungsjahr),
    },
    wertentwicklung: {
      szenario: [
        { id: uuid(), kind: 'rate', fromYear: 1, percentPerYear: 1.5 },
      ],
    },
    exit: {
      haltedauerJahre: 15,
      verkaufsnebenkostenPct: 3,
      vorfaelligkeitPct: 0,
    },
  };

  return {
    ...base,
    ...overrides,
    objekt: { ...base.objekt, ...(overrides.objekt ?? {}) },
    knk: { ...base.knk, ...(overrides.knk ?? {}) },
    finanzierung: { ...base.finanzierung, ...(overrides.finanzierung ?? {}) },
    miete: { ...base.miete, ...(overrides.miete ?? {}) },
    kosten: { ...base.kosten, ...(overrides.kosten ?? {}) },
    steuer: { ...base.steuer, ...(overrides.steuer ?? {}) },
    afa: { ...base.afa, ...(overrides.afa ?? {}) },
    wertentwicklung: { ...base.wertentwicklung, ...(overrides.wertentwicklung ?? {}) },
    exit: { ...base.exit, ...(overrides.exit ?? {}) },
  };
}
