import { Scenario, SCHEMA_VERSION } from '../engine/types';
import { ProjectionYear } from '../engine/projection';
import { isAgentFieldPath } from '../agent/contract';
import { MAX_HOLDING_PERIOD_YEARS } from '../engine/constants';

const BUNDESLAENDER = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'] as const;
const OBJEKT_TYPEN = ['bestand', 'neubau', 'denkmal'] as const;
const BODENWERT_MODES = ['percent', 'perSqm'] as const;
const VERKAUFSNEBENKOSTEN_MODES = ['percent', 'absolute'] as const;
const EQUITY_MODES = ['percent', 'absolute'] as const;
const RENT_MODES = ['perMonth', 'perYear', 'perSqm'] as const;
const MAINTENANCE_MODES = ['perSqm', 'percentRent', 'absolute'] as const;
const KOSTEN_ERFASSUNG_MODES = ['detailliert', 'wirtschaftsplan'] as const;
const TAX_MODES = ['income', 'marginalRate'] as const;
const VERANLAGUNGEN = ['single', 'splitting'] as const;
const AFA_MODI = ['linear', 'degressiv', 'sonder7b', 'denkmal7i'] as const;
const RULE_KINDS = ['step', 'rate'] as const;
const SANIERUNG_STEUERARTEN = [
  'sofort',
  'verteilt',
  'herstellung',
  'denkmal7i',
  'denkmal11b',
  'keine',
] as const;
const AGENT_SOURCE_KINDS = ['pdf', 'web', 'api', 'text', 'manual'] as const;
const AGENT_FIELD_STATUSES = ['missing', 'uncertain', 'confirmed', 'not_applicable', 'conflict'] as const;
const AGENT_FIELD_ORIGINS = ['extracted', 'inferred', 'assumption', 'derived', 'user'] as const;
const LEGACY_SCHEMA_VERSION = 1;
const PREVIOUS_SCHEMA_VERSION = 2;

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

function requireLegacyFallback(isLegacySchema: boolean, key: string, prefix: string): void {
  if (!isLegacySchema) {
    throw new Error(`${prefix}${key} fehlt.`);
  }
}

function requireOptionalString(
  obj: Record<string, unknown>,
  key: string,
  prefix: string,
  maxLength: number,
): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new Error(`${prefix}${key} muss ein Text mit maximal ${maxLength} Zeichen sein.`);
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
      if (rule.wirksamAbMonat !== undefined && rule.wirksamAbMonat !== null) {
        requireIntegerInRange(rule, 'wirksamAbMonat', 1, 12, rulePrefix);
      }
    } else {
      requireNumberInRange(rule, 'percentPerYear', -100, 100, rulePrefix);
    }
  });
}

function validateAgentReview(value: unknown, prefix: string): void {
  if (!isRecord(value)) throw new Error(`${prefix}agentReview muss ein Objekt sein.`);
  if (requireNumber(value, 'version', prefix) !== 1) {
    throw new Error(`${prefix}Nicht unterstuetzte agentReview-Version.`);
  }
  requireString(value, 'updatedAt', prefix);

  if (!Array.isArray(value.sources) || value.sources.length > 20) {
    throw new Error(`${prefix}agentReview.sources muss ein Array mit maximal 20 Eintraegen sein.`);
  }
  const sourceIds = new Set<string>();
  value.sources.forEach((source, index) => {
    const sourcePrefix = `${prefix}Agent-Quelle [${index + 1}]: `;
    if (!isRecord(source)) throw new Error(`${sourcePrefix}Quelle muss ein Objekt sein.`);
    const id = requireString(source, 'id', sourcePrefix);
    if (sourceIds.has(id)) throw new Error(`${prefix}Agent-Quellen enthalten die doppelte ID "${id}".`);
    sourceIds.add(id);
    requireEnum(source, 'kind', AGENT_SOURCE_KINDS, sourcePrefix);
    requireString(source, 'label', sourcePrefix);
    requireOptionalString(source, 'url', sourcePrefix, 2_000);
    requireOptionalString(source, 'sha256', sourcePrefix, 128);
    requireOptionalString(source, 'retrievedAt', sourcePrefix, 80);
  });

  if (!isRecord(value.fields) || Object.keys(value.fields).length > 120) {
    throw new Error(`${prefix}agentReview.fields muss ein Objekt mit maximal 120 Eintraegen sein.`);
  }
  if (value.warnings !== undefined && value.warnings !== null) {
    if (!Array.isArray(value.warnings) || value.warnings.length > 50) {
      throw new Error(`${prefix}agentReview.warnings muss ein Array mit maximal 50 Eintraegen sein.`);
    }
    value.warnings.forEach((warning, index) => {
      if (typeof warning !== 'string' || warning.trim() === '' || warning.length > 500) {
        throw new Error(`${prefix}Agent-Warnung [${index + 1}] muss ein Text mit maximal 500 Zeichen sein.`);
      }
    });
  }
  for (const [path, field] of Object.entries(value.fields)) {
    const fieldPrefix = `${prefix}Agent-Feld "${path}": `;
    if (!isAgentFieldPath(path)) throw new Error(`${fieldPrefix}Feldpfad ist nicht erlaubt.`);
    if (!isRecord(field)) throw new Error(`${fieldPrefix}Review muss ein Objekt sein.`);
    requireEnum(field, 'status', AGENT_FIELD_STATUSES, fieldPrefix);
    requireEnum(field, 'origin', AGENT_FIELD_ORIGINS, fieldPrefix);
    requireBoolean(field, 'required', fieldPrefix);
    requireOptionalString(field, 'reason', fieldPrefix, 500);
    requireOptionalString(field, 'reviewedAt', fieldPrefix, 80);
    if (field.confidence !== undefined && field.confidence !== null) {
      requireNumberInRange(field, 'confidence', 0, 1, fieldPrefix);
    }
    if (!Array.isArray(field.evidence) || field.evidence.length > 20) {
      throw new Error(`${fieldPrefix}evidence muss ein Array mit maximal 20 Eintraegen sein.`);
    }
    field.evidence.forEach((evidence, index) => {
      const evidencePrefix = `${fieldPrefix}Beleg [${index + 1}]: `;
      if (!isRecord(evidence)) throw new Error(`${evidencePrefix}Beleg muss ein Objekt sein.`);
      const sourceId = requireString(evidence, 'sourceId', evidencePrefix);
      if (!sourceIds.has(sourceId)) throw new Error(`${evidencePrefix}Unbekannte Quelle "${sourceId}".`);
      if (evidence.page !== undefined && evidence.page !== null) {
        requireIntegerInRange(evidence, 'page', 1, 100_000, evidencePrefix);
      }
      requireOptionalString(evidence, 'locator', evidencePrefix, 500);
      requireOptionalString(evidence, 'excerpt', evidencePrefix, 500);
    });
  }
}

export function validateScenario(s: unknown, index?: number): Scenario {
  const prefix = index !== undefined ? `Szenario [${index + 1}]: ` : '';

  if (!isRecord(s)) {
    throw new Error(`${prefix}Szenario-Daten müssen ein Objekt sein.`);
  }

  requireString(s, 'id', prefix);
  requireString(s, 'name', prefix);
  const schemaVersion = requireNumber(s, 'schemaVersion', prefix);
  if (
    schemaVersion !== LEGACY_SCHEMA_VERSION
    && schemaVersion !== PREVIOUS_SCHEMA_VERSION
    && schemaVersion !== SCHEMA_VERSION
  ) {
    throw new Error(`${prefix}Nicht unterstützte Schema-Version.`);
  }
  const isLegacySchema = schemaVersion === LEGACY_SCHEMA_VERSION;
  if (s.notizen === undefined || s.notizen === null) {
    requireLegacyFallback(isLegacySchema, 'notizen', prefix);
    s.notizen = '';
  } else if (typeof s.notizen !== 'string') {
    throw new Error(`${prefix}notizen muss ein Text sein.`);
  }
  if (s.agentReview !== undefined && s.agentReview !== null) {
    validateAgentReview(s.agentReview, prefix);
  }

  if (s.sanierungen === undefined || s.sanierungen === null) {
    requireLegacyFallback(isLegacySchema, 'sanierungen', prefix);
    s.sanierungen = [];
  } else if (!Array.isArray(s.sanierungen)) {
    throw new Error(`${prefix}sanierungen muss ein Array sein.`);
  } else {
    const seenIds = new Set<string>();
    s.sanierungen.forEach((massnahme, idx) => {
      const massnahmePrefix = `${prefix}Sanierung [${idx + 1}]: `;
      if (!isRecord(massnahme)) {
        throw new Error(`${massnahmePrefix}Maßnahme muss ein Objekt sein.`);
      }
      const id = requireString(massnahme, 'id', massnahmePrefix);
      if (seenIds.has(id)) {
        throw new Error(`${prefix}Sanierungen enthalten die doppelte ID "${id}".`);
      }
      seenIds.add(id);
      requireString(massnahme, 'bezeichnung', massnahmePrefix);
      requireIntegerInRange(massnahme, 'jahr', 1, 40, massnahmePrefix);
      requireNumberInRange(massnahme, 'betrag', 0, Number.MAX_SAFE_INTEGER, massnahmePrefix);
      requireEnum(massnahme, 'steuerart', SANIERUNG_STEUERARTEN, massnahmePrefix);
      requireIntegerInRange(massnahme, 'verteilungsJahre', 2, 5, massnahmePrefix);
      requireBoolean(massnahme, 'mieterhoehungMoeglich', massnahmePrefix);
    });
  }

  const objekt = requireSection(s, 'objekt', prefix);
  const kaufpreis = requireNumberInRange(objekt, 'kaufpreis', 1, Number.MAX_SAFE_INTEGER, prefix);
  const wohnflaeche = requireNumberInRange(objekt, 'wohnflaeche', 1, Number.MAX_SAFE_INTEGER, prefix);
  requireIntegerInRange(objekt, 'fertigstellungsjahr', 1, 2100, prefix);
  requireEnum(objekt, 'bundesland', BUNDESLAENDER, prefix);
  requireEnum(objekt, 'objektTyp', OBJEKT_TYPEN, prefix);
  const bodenwertAnteilPct = requireNumberInRange(objekt, 'bodenwertAnteilPct', 0, 100, prefix);
  const hasBodenwertMode = objekt.bodenwertMode !== undefined && objekt.bodenwertMode !== null;
  const hasBodenrichtwertProSqm = objekt.bodenrichtwertProSqm !== undefined
    && objekt.bodenrichtwertProSqm !== null;
  if (isLegacySchema && hasBodenwertMode !== hasBodenrichtwertProSqm) {
    throw new Error(`${prefix}Unvollständige Bodenwert-Angaben in Schema-Version 1.`);
  }
  if (!hasBodenwertMode) {
    requireLegacyFallback(isLegacySchema, 'bodenwertMode', prefix);
    objekt.bodenwertMode = 'percent';
  } else {
    requireEnum(objekt, 'bodenwertMode', BODENWERT_MODES, prefix);
  }
  if (!hasBodenrichtwertProSqm) {
    requireLegacyFallback(isLegacySchema, 'bodenrichtwertProSqm', prefix);
    objekt.bodenrichtwertProSqm = (kaufpreis * (bodenwertAnteilPct / 100)) / wohnflaeche;
  } else {
    requireNumberInRange(objekt, 'bodenrichtwertProSqm', 0, Number.MAX_SAFE_INTEGER, prefix);
  }
  const hasGrundstuecksflaeche = objekt.grundstuecksflaeche !== undefined
    && objekt.grundstuecksflaeche !== null;
  const hasMiteigentumsanteilZaehler = objekt.miteigentumsanteilZaehler !== undefined
    && objekt.miteigentumsanteilZaehler !== null;
  const hasMiteigentumsanteilNenner = objekt.miteigentumsanteilNenner !== undefined
    && objekt.miteigentumsanteilNenner !== null;
  const plotShareFieldsPresent = Number(hasGrundstuecksflaeche)
    + Number(hasMiteigentumsanteilZaehler)
    + Number(hasMiteigentumsanteilNenner);
  if (isLegacySchema && plotShareFieldsPresent > 0 && plotShareFieldsPresent < 3) {
    throw new Error(`${prefix}Unvollständige Grundstücks-/MEA-Angaben in Schema-Version 1.`);
  }
  let grundstuecksflaeche: number;
  if (!hasGrundstuecksflaeche) {
    requireLegacyFallback(isLegacySchema, 'grundstuecksflaeche', prefix);
    objekt.grundstuecksflaeche = 0;
    grundstuecksflaeche = 0;
  } else {
    grundstuecksflaeche = requireNumberInRange(
      objekt,
      'grundstuecksflaeche',
      0,
      Number.MAX_SAFE_INTEGER,
      prefix,
    );
  }
  if (grundstuecksflaeche > 0 && (!hasMiteigentumsanteilZaehler || !hasMiteigentumsanteilNenner)) {
    throw new Error(`${prefix}Bei einer Grundstücksfläche müssen MEA – Ihr Anteil und MEA – Objekt gesamt angegeben sein.`);
  }
  if (!hasMiteigentumsanteilZaehler) {
    requireLegacyFallback(isLegacySchema, 'miteigentumsanteilZaehler', prefix);
  }
  if (!hasMiteigentumsanteilNenner) {
    requireLegacyFallback(isLegacySchema, 'miteigentumsanteilNenner', prefix);
  }
  const miteigentumsanteilZaehler = objekt.miteigentumsanteilZaehler === undefined || objekt.miteigentumsanteilZaehler === null
    ? (objekt.miteigentumsanteilZaehler = 0)
    : requireNumberInRange(objekt, 'miteigentumsanteilZaehler', 0, Number.MAX_SAFE_INTEGER, prefix);
  const miteigentumsanteilNenner = objekt.miteigentumsanteilNenner === undefined || objekt.miteigentumsanteilNenner === null
    ? (objekt.miteigentumsanteilNenner = 0)
    : requireNumberInRange(objekt, 'miteigentumsanteilNenner', 0, Number.MAX_SAFE_INTEGER, prefix);
  if (
    miteigentumsanteilZaehler > 0
    && miteigentumsanteilNenner > 0
    && miteigentumsanteilZaehler > miteigentumsanteilNenner
  ) {
    throw new Error(`${prefix}miteigentumsanteilZaehler darf miteigentumsanteilNenner nicht überschreiten.`);
  }
  requireNumberInRange(objekt, 'sanierungskosten', 0, Number.MAX_SAFE_INTEGER, prefix);

  const knk = requireSection(s, 'knk', prefix);
  requireNumberInRange(knk, 'grestPct', 0, 100, prefix);
  requireNumberInRange(knk, 'notarPct', 0, 100, prefix);
  requireNumberInRange(knk, 'maklerPct', 0, 100, prefix);
  const knkMitfinanzieren = requireBoolean(knk, 'mitfinanzieren', prefix);
  if (knk.finanzierungsPct === undefined || knk.finanzierungsPct === null) {
    requireLegacyFallback(isLegacySchema, 'finanzierungsPct', prefix);
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
  if (finanzierung.anschlussTilgungPct === undefined) {
    requireLegacyFallback(isLegacySchema, 'anschlussTilgungPct', prefix);
    finanzierung.anschlussTilgungPct = null;
  } else if (finanzierung.anschlussTilgungPct !== null) {
    requireNumberInRange(finanzierung, 'anschlussTilgungPct', 0, 100, prefix);
  }
  requireNumberInRange(finanzierung, 'sondertilgungProJahr', 0, Number.MAX_SAFE_INTEGER, prefix);
  requireNumberInRange(finanzierung, 'disagioPct', 0, 99.999, prefix);

  const miete = requireSection(s, 'miete', prefix);
  const rentMode = requireEnum(miete, 'rentMode', RENT_MODES, prefix);
  const kaltmieteProMonat = requireNumberInRange(miete, 'kaltmieteProMonat', 0, Number.MAX_SAFE_INTEGER, prefix);
  const kaltmieteProSqm = requireNumberInRange(miete, 'kaltmieteProSqm', 0, Number.MAX_SAFE_INTEGER, prefix);
  const hasKaltmieteProJahr = miete.kaltmieteProJahr !== undefined
    && miete.kaltmieteProJahr !== null;
  if (isLegacySchema && rentMode === 'perYear' && !hasKaltmieteProJahr) {
    throw new Error(`${prefix}Unvollständige Jahresmiet-Angaben in Schema-Version 1.`);
  }
  let kaltmieteProJahr: number;
  if (!hasKaltmieteProJahr) {
    requireLegacyFallback(isLegacySchema, 'kaltmieteProJahr', prefix);
    kaltmieteProJahr = rentMode === 'perSqm'
      ? kaltmieteProSqm * wohnflaeche * 12
      : kaltmieteProMonat * 12;
  } else {
    kaltmieteProJahr = requireNumberInRange(
      miete,
      'kaltmieteProJahr',
      0,
      Number.MAX_SAFE_INTEGER,
      prefix,
    );
  }
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
  if (miete.mietspiegel === undefined || miete.mietspiegel === null) {
    requireLegacyFallback(isLegacySchema, 'mietspiegel', prefix);
    miete.mietspiegel = {
      untererSpannwertProSqm: 0,
      mittelwertProSqm: 0,
      obererSpannwertProSqm: 0,
    };
  } else {
    const mietspiegel = requireSection(miete, 'mietspiegel', prefix);
    requireNumberInRange(mietspiegel, 'untererSpannwertProSqm', 0, Number.MAX_SAFE_INTEGER, prefix);
    requireNumberInRange(mietspiegel, 'mittelwertProSqm', 0, Number.MAX_SAFE_INTEGER, prefix);
    requireNumberInRange(mietspiegel, 'obererSpannwertProSqm', 0, Number.MAX_SAFE_INTEGER, prefix);
  }
  validateIncreaseRules(miete.steigerungen, 'Mietsteigerungen', prefix);

  const kosten = requireSection(s, 'kosten', prefix);
  const isPreWirtschaftsplanSchema = schemaVersion < 3;
  if (kosten.kostenErfassungMode === undefined || kosten.kostenErfassungMode === null) {
    if (!isPreWirtschaftsplanSchema) throw new Error(`${prefix}kostenErfassungMode fehlt.`);
    kosten.kostenErfassungMode = 'detailliert';
  } else {
    requireEnum(kosten, 'kostenErfassungMode', KOSTEN_ERFASSUNG_MODES, prefix);
  }
  const additiveKostenDefaults = {
    umlagefaehigeKostenProJahr: 0,
    nichtUmlagefaehigeKostenProJahr: 0,
    wegRuecklageProJahr: 0,
    ruecklagenVerwendungPct: 50,
    ruecklagenVerzoegerungJahre: 5,
  } as const;
  for (const [key, fallback] of Object.entries(additiveKostenDefaults)) {
    if (kosten[key] === undefined || kosten[key] === null) {
      if (!isPreWirtschaftsplanSchema) throw new Error(`${prefix}${key} fehlt.`);
      kosten[key] = fallback;
    }
  }
  requireNumberInRange(kosten, 'umlagefaehigeKostenProJahr', 0, Number.MAX_SAFE_INTEGER, prefix);
  requireNumberInRange(kosten, 'nichtUmlagefaehigeKostenProJahr', 0, Number.MAX_SAFE_INTEGER, prefix);
  requireNumberInRange(kosten, 'wegRuecklageProJahr', 0, Number.MAX_SAFE_INTEGER, prefix);
  requireNumberInRange(kosten, 'ruecklagenVerwendungPct', 0, 100, prefix);
  requireIntegerInRange(kosten, 'ruecklagenVerzoegerungJahre', 1, 40, prefix);
  requireEnum(kosten, 'maintenanceMode', MAINTENANCE_MODES, prefix);
  requireNumberInRange(kosten, 'instandhaltungProSqm', 0, Number.MAX_SAFE_INTEGER, prefix);
  requireNumberInRange(kosten, 'instandhaltungPctRent', 0, 100, prefix);
  requireNumberInRange(kosten, 'instandhaltungAbsolut', 0, Number.MAX_SAFE_INTEGER, prefix);
  if (kosten.ruecklagenAnteilPct === undefined || kosten.ruecklagenAnteilPct === null) {
    requireLegacyFallback(isLegacySchema, 'ruecklagenAnteilPct', prefix);
    kosten.ruecklagenAnteilPct = 0;
  } else {
    requireNumberInRange(kosten, 'ruecklagenAnteilPct', 0, 100, prefix);
  }
  if (kosten.ruecklagenRestwertPct === undefined || kosten.ruecklagenRestwertPct === null) {
    // Additives Schema-v2-Feld: auch bereits exportierte Version-2-Szenarien bleiben kompatibel.
    kosten.ruecklagenRestwertPct = 0;
  } else {
    requireNumberInRange(kosten, 'ruecklagenRestwertPct', 0, 100, prefix);
  }
  if (kosten.ruecklagenBestandBeiKauf === undefined || kosten.ruecklagenBestandBeiKauf === null) {
    // Additives Feld: uebernommener WEG-Ruecklagenbestand; aeltere Exporte starten bei 0.
    kosten.ruecklagenBestandBeiKauf = 0;
  } else {
    requireNumberInRange(kosten, 'ruecklagenBestandBeiKauf', 0, Number.MAX_SAFE_INTEGER, prefix);
  }
  if (kosten.sevProJahr === undefined || kosten.sevProJahr === null) {
    // Additives Feld: Sondereigentumsverwaltung; aeltere Exporte starten bei 0.
    kosten.sevProJahr = 0;
  } else {
    requireNumberInRange(kosten, 'sevProJahr', 0, Number.MAX_SAFE_INTEGER, prefix);
  }
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
  requireIntegerInRange(exit, 'haltedauerJahre', 1, MAX_HOLDING_PERIOD_YEARS, prefix);
  const hasVerkaufsnebenkostenMode = exit.verkaufsnebenkostenMode !== undefined
    && exit.verkaufsnebenkostenMode !== null;
  const hasVerkaufsnebenkostenAbsolut = exit.verkaufsnebenkostenAbsolut !== undefined
    && exit.verkaufsnebenkostenAbsolut !== null;
  if (isLegacySchema && hasVerkaufsnebenkostenMode !== hasVerkaufsnebenkostenAbsolut) {
    throw new Error(`${prefix}Unvollständige Verkaufsnebenkosten-Angaben in Schema-Version 1.`);
  }
  if (exit.verkaufsnebenkostenMode === undefined || exit.verkaufsnebenkostenMode === null) {
    requireLegacyFallback(isLegacySchema, 'verkaufsnebenkostenMode', prefix);
    exit.verkaufsnebenkostenMode = 'percent';
  } else {
    requireEnum(exit, 'verkaufsnebenkostenMode', VERKAUFSNEBENKOSTEN_MODES, prefix);
  }
  requireNumberInRange(exit, 'verkaufsnebenkostenPct', 0, 100, prefix);
  if (exit.verkaufsnebenkostenAbsolut === undefined || exit.verkaufsnebenkostenAbsolut === null) {
    if (hasVerkaufsnebenkostenMode && exit.verkaufsnebenkostenMode === 'absolute') {
      throw new Error(`${prefix}verkaufsnebenkostenAbsolut fehlt für den Pauschalmodus.`);
    }
    requireLegacyFallback(isLegacySchema, 'verkaufsnebenkostenAbsolut', prefix);
    exit.verkaufsnebenkostenAbsolut = 2500;
  } else {
    requireNumberInRange(exit, 'verkaufsnebenkostenAbsolut', 0, Number.MAX_SAFE_INTEGER, prefix);
  }
  requireNumberInRange(exit, 'vorfaelligkeitPct', 0, 100, prefix);

  s.schemaVersion = SCHEMA_VERSION;
  return s as unknown as Scenario;
}

/**
 * Exports a single scenario as a JSON string.
 */
export function exportScenario(scenario: Scenario): string {
  return JSON.stringify(validateScenario(structuredClone(scenario)), null, 2);
}

/**
 * Exports all saved scenarios as a JSON string.
 */
export function exportAllScenarios(scenarios: Scenario[]): string {
  const validatedScenarios = validateScenarioList(scenarios.map((scenario) => (
    validateScenario(structuredClone(scenario))
  )));
  return JSON.stringify(
    {
      type: 'immo-checker-export',
      version: SCHEMA_VERSION,
      scenarios: validatedScenarios,
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
      const exportVersion = requireNumber(obj, 'version', 'Bulk-Export: ');
      if (
        exportVersion !== LEGACY_SCHEMA_VERSION
        && exportVersion !== PREVIOUS_SCHEMA_VERSION
        && exportVersion !== SCHEMA_VERSION
      ) {
        throw new Error('Bulk-Export hat eine nicht unterstützte Schema-Version.');
      }
      if (!Array.isArray(obj.scenarios)) {
        throw new Error('Bulk-Export enthält keine Liste von Szenarien.');
      }
      if (obj.scenarios.some((scenario) => (
        !isRecord(scenario) || scenario.schemaVersion !== exportVersion
      ))) {
        throw new Error('Bulk-Export und enthaltene Szenarien haben unterschiedliche Schema-Versionen.');
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
    'Umlagefähige Kosten laut Wirtschaftsplan (€)',
    'davon Eigentümeranteil wegen Leerstand (€)',
    'Nicht umlagefähige Kosten (€)',
    'Bewirtschaftungskosten gesamt (€)',
    'WEG-Rücklagenzuführung / Reserveanteil (nicht sofort abziehbar) (€)',
    'Erwartete WEG-Rücklagenverwendung (kein zweiter Cash-out) (€)',
    'Nachgelagerte Rücklagen-Werbungskosten (€)',
    'Rücklage kumuliert (nach modellierter Verwendung) (€)',
    'Zins (€)',
    'Tilgung (€)',
    'Sondertilgung (€)',
    'Annuität (€)',
    'Sanierungsauszahlung (€)',
    'Sanierungs-Werbungskosten (€)',
    'Objekt-AfA (€)',
    'Sanierungs-AfA (€)',
    'AfA gesamt (€)',
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
      formatCsvNum(y.umlagefaehigeKosten),
      formatCsvNum(y.leerstandsbedingteUmlagekosten),
      formatCsvNum(y.nichtUmlagefaehigeKosten),
      formatCsvNum(y.bewirtschaftungskosten),
      formatCsvNum(y.ruecklagenZufuehrung),
      formatCsvNum(y.ruecklagenEntnahme),
      formatCsvNum(y.ruecklagenWerbungskosten),
      formatCsvNum(y.kumulierteRuecklage),
      formatCsvNum(y.zins),
      formatCsvNum(y.tilgung),
      formatCsvNum(y.sondertilgung),
      formatCsvNum(y.annuitaet),
      formatCsvNum(y.sanierungsauszahlung),
      formatCsvNum(y.sanierungsWerbungskosten),
      formatCsvNum(y.objektAfa),
      formatCsvNum(y.sanierungsAfa),
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
