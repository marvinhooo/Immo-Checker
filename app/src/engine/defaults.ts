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
  const bundesland = 'NW' as const;
  const fertigstellungsjahr = 1995;

  const base: Scenario = {
    schemaVersion: SCHEMA_VERSION,
    id: uuid(),
    name: 'Beispiel: ETW 300.000 EUR',
    objekt: {
      kaufpreis: 300000,
      wohnflaeche: 70,
      fertigstellungsjahr,
      bundesland,
      objektTyp: 'bestand',
      bodenwertAnteilPct: 20,
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
      equityPct: 20,
      equityAbsolute: 60000,
      sollzinsPct: 3.8,
      tilgungPct: 2.0,
      zinsbindungJahre: 10,
      anschlusszinsPct: 4.5,
      anschlussTilgungPct: null,
      sondertilgungProJahr: 0,
      disagioPct: 0,
    },
    miete: {
      rentMode: 'perMonth',
      kaltmieteProMonat: 1050,
      kaltmieteProSqm: 15,
      leerstandPct: 3,
      steigerungen: [
        { id: uuid(), kind: 'rate', fromYear: 1, percentPerYear: 1.5 },
      ],
    },
    kosten: {
      maintenanceMode: 'perSqm',
      instandhaltungProSqm: 12,
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
