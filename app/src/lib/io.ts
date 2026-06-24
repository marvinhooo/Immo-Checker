import { Scenario, SCHEMA_VERSION } from '../engine/types';
import { ProjectionYear } from '../engine/projection';

const BUNDESLAENDER = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'] as const;
const OBJEKT_TYPEN = ['bestand', 'neubau', 'denkmal'] as const;
const BODENWERT_MODES = ['percent', 'perSqm'] as const;
const EQUITY_MODES = ['percent', 'absolute'] as const;
const RENT_MODES = ['perMonth', 'perYear', 'perSqm'] as const;
const MAINTENANCE_MODES = ['perSqm', 'percentRent', 'absolute'] as const;
const TAX_MODES = ['income', 'marginalRate'] as const;
const VERANLAGUNGEN = ['single', 'splitting'] as const;
const AFA_MODI = ['linear', 'degressiv', 'sonder7b', 'denkmal7i'] as const;
const RULE_KINDS = ['step', 'rate'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireSection(obj: Record<string, unknown>, key: string, prefix: string): Record<string, unknown> {
  const value = obj[key];
  if (!isRecord(value)) {
    throw new Error(`${prefix}Fehlende Sektion "${key}".`);
  }
  return value;
}

function requireString(obj: Record<string, unknown>, key: string, prefix: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${prefix}${key} muss ein nicht-leerer Text sein.`);
  }
  return value;
}

function requireNumber(obj: Record<string, unknown>, key: string, prefix: string): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${prefix}${key} muss eine finite Zahl sein.`);
  }
  return value;
}

function requireNumberInRange(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  prefix: string
): number {
  const value = requireNumber(obj, key, prefix);
  if (value < min || value > max) {
    throw new Error(`${prefix}${key} muss eine Zahl zwischen ${min} und ${max} sein.`);
  }
  return value;
}

function requireIntegerInRange(
  obj: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  prefix: string
): number {
  const value = requireNumber(obj, key, prefix);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${prefix}${key} muss eine ganze Zahl zwischen ${min} und ${max} sein.`);
  }
  return value;
}

function requireBoolean(obj: Record<string, unknown>, key: string, prefix: string): boolean {
  const value = obj[key];
  if (typeof value !== 'boolean') {
    throw new Error(`${prefix}${key} muss true oder false sein.`);
  }
  return value;
}

function requireEnum<T extends readonly string[]>(
  obj: Record<string, unknown>,
  key: string,
  allowed: T,
  prefix: string
): T[number] {
  const value = obj[key];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${prefix}${key} hat einen ungültigen Wert.`);
  }
  return value;
}

function validateIncreaseRules(value: unknown, label: string, prefix: string): void {
  if (!Array.isArray(value)) {
    throw new Error(`${prefix}${label} muss ein Array sein.`);
  }

  value.forEach((rule, idx) => {
    const rulePrefix = `${prefix}${label} [${idx + 1}]: `;
    if (!isRecord(rule)) {
      throw new Error(`${rulePrefix}Regel muss ein Objekt sein.`);
    }
    requireString(rule, 'id', rulePrefix);
    const kind = requireEnum(rule, 'kind', RULE_KINDS, rulePrefix);
    requireIntegerInRange(rule, 'fromYear', 1, 50, rulePrefix);
    if (kind === 'step') {
      requireNumberInRange(rule, 'percent', -100, 100, rulePrefix);
    } else {
      requireNumberInRange(rule, 'percentPerYear', -100, 100, rulePrefix);
    }
  });
}

export function validateScenario(s: unknown, index?: number): Scenario {
  const prefix = index !== undefined ? `Szenario [${index + 1}]: ` : '';

  if (!isRecord(s)) {
    throw new Error(`${prefix}Szenario-Daten müssen ein Objekt sein.`);
  }

  requireString(s, 'id', prefix);
  requireString(s, 'name', prefix);
  if (requireNumber(s, 'schemaVersion', prefix) !== SCHEMA_VERSION) {
    throw new Error(`${prefix}Nicht unterstützte Schema-Version.`);
  }

  const objekt = requireSection(s, 'objekt', prefix);
  const kaufpreis = requireNumberInRange(objekt, 'kaufpreis', 1, Number.MAX_SAFE_INTEGER, prefix);
  const wohnflaeche = requireNumberInRange(objekt, 'wohnflaeche', 1, Number.MAX_SAFE_INTEGER, prefix);
  requireIntegerInRange(objekt, 'fertigstellungsjahr', 1, 2100, prefix);
  requireEnum(objekt, 'bundesland', BUNDESLAENDER, prefix);
  requireEnum(objekt, 'objektTyp', OBJEKT_TYPEN, prefix);
  const bodenwertAnteilPct = requireNumberInRange(objekt, 'bodenwertAnteilPct', 0, 100, prefix);
  if (objekt.bodenwertMode === undefined || objekt.bodenwertMode === null) {
    objekt.bodenwertMode = 'percent';
  } else {
    requireEnum(objekt, 'bodenwertMode', BODENWERT_MODES, prefix);
  }
  if (objekt.bodenrichtwertProSqm === undefined || objekt.bodenrichtwertProSqm === null) {
    objekt.bodenrichtwertProSqm = (kaufpreis * (bodenwertAnteilPct / 100)) / wohnflaeche;
  } else {
    requireNumberInRange(objekt, 'bodenrichtwertProSqm', 0, Number.MAX_SAFE_INTEGER, prefix);
  }
  requireNumberInRange(objekt, 'sanierungskosten', 0, Number.MAX_SAFE_INTEGER, prefix);

  const knk = requireSection(s, 'knk', prefix);
  requireNumberInRange(knk, 'grestPct', 0, 100, prefix);
  requireNumberInRange(knk, 'notarPct', 0, 100, prefix);
  requireNumberInRange(knk, 'maklerPct', 0, 100, prefix);
  const knkMitfinanzieren = requireBoolean(knk, 'mitfinanzieren', prefix);
  if (knk.finanzierungsPct === undefined || knk.finanzierungsPct === null) {
    knk.finanzierungsPct = knkMitfinanzieren ? 100 : 0;
  } else {
    requireNumberInRange(knk, 'finanzierungsPct', 0, 100, prefix);
  }

  const finanzierung = requireSection(s, 'finanzierung', prefix);
  requireEnum(finanzierung, 'equityMode', EQUITY_MODES, prefix);
  requireNumberInRange(finanzierung, 'equityPct', 0, 100, prefix);
  requireNumberInRange(finanzierung, 'equityAbsolute', 0, Number.MAX_SAFE_INTEGER, prefix);
  requireNumberInRange(finanzierung, 'sollzinsPct', 0, 100, prefix);
  requireNumberInRange(finanzierung, 'tilgungPct', 0, 100, prefix);
  requireIntegerInRange(finanzierung, 'zinsbindungJahre', 1, 30, prefix);
  requireNumberInRange(finanzierung, 'anschlusszinsPct', 0, 100, prefix);
  if (finanzierung.anschlussTilgungPct === undefined || finanzierung.anschlussTilgungPct === null) {
    finanzierung.anschlussTilgungPct = null;
  } else {
    requireNumberInRange(finanzierung, 'anschlussTilgungPct', 0, 100, prefix);
  }
  requireNumberInRange(finanzierung, 'sondertilgungProJahr', 0, Number.MAX_SAFE_INTEGER, prefix);
  requireNumberInRange(finanzierung, 'disagioPct', 0, 99.999, prefix);

  const miete = requireSection(s, 'miete', prefix);
  const rentMode = requireEnum(miete, 'rentMode', RENT_MODES, prefix);
  const kaltmieteProMonat = requireNumberInRange(miete, 'kaltmieteProMonat', 0, Number.MAX_SAFE_INTEGER, prefix);
  const kaltmieteProSqm = requireNumberInRange(miete, 'kaltmieteProSqm', 0, Number.MAX_SAFE_INTEGER, prefix);
  const kaltmieteProJahr = miete.kaltmieteProJahr === undefined || miete.kaltmieteProJahr === null
    ? (rentMode === 'perSqm' ? kaltmieteProSqm * wohnflaeche * 12 : kaltmieteProMonat * 12)
    : requireNumberInRange(miete, 'kaltmieteProJahr', 0, Number.MAX_SAFE_INTEGER, prefix);
  if (rentMode === 'perSqm') {
    const monthlyRent = kaltmieteProSqm * wohnflaeche;
    miete.kaltmieteProMonat = monthlyRent;
    miete.kaltmieteProJahr = monthlyRent * 12;
  } else if (rentMode === 'perYear') {
    miete.kaltmieteProMonat = kaltmieteProJahr / 12;
    miete.kaltmieteProSqm = wohnflaeche > 0 ? (kaltmieteProJahr / 12) / wohnflaeche : 0;
  } else {
    miete.kaltmieteProJahr = kaltmieteProMonat * 12;
    miete.kaltmieteProSqm = wohnflaeche > 0 ? kaltmieteProMonat / wohnflaeche : 0;
  }
  requireNumberInRange(miete, 'leerstandPct', 0, 100, prefix);
  validateIncreaseRules(miete.steigerungen, 'Mietsteigerungen', prefix);

  const kosten = requireSection(s, 'kosten', prefix);
  requireEnum(kosten, 'maintenanceMode', MAINTENANCE_MODES, prefix);
  requireNumberInRange(kosten, 'instandhaltungProSqm', 0, Number.MAX_SAFE_INTEGER, prefix);
  requireNumberInRange(kosten, 'instandhaltungPctRent', 0, 100, prefix);
  requireNumberInRange(kosten, 'instandhaltungAbsolut', 0, Number.MAX_SAFE_INTEGER, prefix);
  requireNumberInRange(kosten, 'verwaltungProJahr', 0, Number.MAX_SAFE_INTEGER, prefix);
  requireNumberInRange(kosten, 'sonstigeKostenProJahr', 0, Number.MAX_SAFE_INTEGER, prefix);
  requireNumberInRange(kosten, 'kostensteigerungPctPa', 0, 100, prefix);

  const steuer = requireSection(s, 'steuer', prefix);
  requireEnum(steuer, 'taxMode', TAX_MODES, prefix);
  requireNumberInRange(steuer, 'bruttoJahresEinkommen', 0, Number.MAX_SAFE_INTEGER, prefix);
  requireNumberInRange(steuer, 'grenzsteuersatzPct', 0, 100, prefix);
  requireEnum(steuer, 'veranlagung', VERANLAGUNGEN, prefix);
  requireBoolean(steuer, 'soli', prefix);
  requireNumberInRange(steuer, 'kirchensteuerPct', 0, 100, prefix);

  const afa = requireSection(s, 'afa', prefix);
  requireEnum(afa, 'modus', AFA_MODI, prefix);
  requireNumberInRange(afa, 'linearSatzPct', 0, 100, prefix);

  const wertentwicklung = requireSection(s, 'wertentwicklung', prefix);
  validateIncreaseRules(wertentwicklung.szenario, 'Wertentwicklung-Szenario', prefix);

  const exit = requireSection(s, 'exit', prefix);
  requireIntegerInRange(exit, 'haltedauerJahre', 1, 40, prefix);
  requireNumberInRange(exit, 'verkaufsnebenkostenPct', 0, 100, prefix);
  requireNumberInRange(exit, 'vorfaelligkeitPct', 0, 100, prefix);

  return s as unknown as Scenario;
}

/**
 * Exports a single scenario as a JSON string.
 */
export function exportScenario(scenario: Scenario): string {
  return JSON.stringify(scenario, null, 2);
}

/**
 * Exports all saved scenarios as a JSON string.
 */
export function exportAllScenarios(scenarios: Scenario[]): string {
  return JSON.stringify(
    {
      type: 'immo-checker-export',
      version: SCHEMA_VERSION,
      scenarios,
    },
    null,
    2
  );
}

/**
 * Parses and validates a JSON string. Returns a single Scenario or an array of Scenarios.
 * Throws an error with a user-friendly message if the JSON is invalid or missing required properties.
 */
export function importScenarios(jsonString: string): Scenario | Scenario[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new Error('Ungültiges Dateiformat. Keine valide JSON-Datei.', {
      cause: err,
    });
  }

  // Check if it's a bulk export structure
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (obj.type === 'immo-checker-export') {
      if (!Array.isArray(obj.scenarios)) {
        throw new Error('Bulk-Export enthält keine Liste von Szenarien.');
      }
      return validateScenarioList(obj.scenarios.map((s: unknown, idx: number) => validateScenario(s, idx)));
    }
  }

  // Check if it's directly an array of scenarios
  if (Array.isArray(parsed)) {
    return validateScenarioList(parsed.map((s: unknown, idx: number) => validateScenario(s, idx)));
  }

  // Otherwise treat as a single scenario
  return validateScenario(parsed);
}

function validateScenarioList(scenarios: Scenario[]): Scenario[] {
  const seen = new Set<string>();
  for (const scenario of scenarios) {
    if (seen.has(scenario.id)) {
      throw new Error(`Bulk-Import enthält doppelte Szenario-ID "${scenario.id}".`);
    }
    seen.add(scenario.id);
  }
  return scenarios;
}

/**
 * Formats a number for CSV output using German decimal separator.
 */
function formatCsvNum(n: number): string {
  if (isNaN(n) || !isFinite(n)) return '0';
  return n.toFixed(2).replace('.', ',');
}

/**
 * Converts the projection year data into a German CSV string (semicolon separated).
 */
export function exportToCSV(years: ProjectionYear[]): string {
  const headers = [
    'Jahr',
    'Brutto-Kaltmiete (€)',
    'Netto-Kaltmiete (€)',
    'Mietausfall (€)',
    'Instandhaltung (€)',
    'Verwaltungskosten (€)',
    'Sonstige Kosten (€)',
    'Bewirtschaftungskosten gesamt (€)',
    'Zins (€)',
    'Tilgung (€)',
    'Sondertilgung (€)',
    'Annuität (€)',
    'AfA (€)',
    'V&V Ergebnis (€)',
    'Steuereffekt (€)',
    'Cashflow vor Steuer (€)',
    'Cashflow nach Steuer (€)',
    'Cashflow vor Steuer/Monat (€)',
    'Cashflow nach Steuer/Monat (€)',
    'Immobilienwert (€)',
    'Restschuld (€)',
    'Eigenkapital / Nettovermögen (€)',
    'LTV (%)',
    'DSCR',
  ];

  const lines = [headers.join(';')];

  for (const y of years) {
    const row = [
      y.jahr,
      formatCsvNum(y.bruttoKaltmiete),
      formatCsvNum(y.nettoKaltmiete),
      formatCsvNum(y.mietausfall),
      formatCsvNum(y.instandhaltung),
      formatCsvNum(y.verwaltung),
      formatCsvNum(y.sonstigeKosten),
      formatCsvNum(y.bewirtschaftungskosten),
      formatCsvNum(y.zins),
      formatCsvNum(y.tilgung),
      formatCsvNum(y.sondertilgung),
      formatCsvNum(y.annuitaet),
      formatCsvNum(y.afa),
      formatCsvNum(y.vvErgebnis),
      formatCsvNum(y.steuereffekt),
      formatCsvNum(y.cashflowVorSteuer),
      formatCsvNum(y.cashflowNachSteuer),
      formatCsvNum(y.cashflowVorSteuerMonatlich),
      formatCsvNum(y.cashflowNachSteuerMonatlich),
      formatCsvNum(y.immobilienwert),
      formatCsvNum(y.restschuld),
      formatCsvNum(y.eigenkapital),
      formatCsvNum(y.ltv),
      formatCsvNum(y.dscr),
    ];
    lines.push(row.join(';'));
  }

  // Include UTF-8 Byte Order Mark (BOM) to force Excel to read CSV correctly in UTF-8
  return '\uFEFF' + lines.join('\n');
}
