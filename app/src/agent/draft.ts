import { GREST_BY_BUNDESLAND, linearAfaRateForYear } from '../engine/constants';
import { createDefaultScenario } from '../engine/defaults';
import { bodenwertFlaeche } from '../engine/derive';
import type {
  AgentEvidence,
  AgentFieldOrigin,
  AgentFieldReview,
  AgentSource,
  AgentSourceKind,
  Scenario,
} from '../engine/types';
import { validateScenario } from '../lib/io';
import {
  AGENT_DRAFT_FORMAT,
  AGENT_API_VERSION,
  getAgentFieldDefinition,
  isAgentFieldPath,
  requiredAgentFieldPaths,
} from './contract';

const MAX_DRAFT_BYTES = 1_000_000;
const MAX_SOURCES = 20;
const MAX_OPERATIONS = 120;
const MAX_EVIDENCE_PER_OPERATION = 20;
const MAX_WARNINGS = 50;
const MAX_SHORT_TEXT = 500;
const MAX_NOTES_TEXT = 20_000;
const MAX_JSON_DEPTH = 10;
const MAX_JSON_COLLECTION_SIZE = 120;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

export type AgentDraftOrigin = 'extracted' | 'inferred' | 'assumption' | 'conflict';

export interface AgentDraftOperation {
  op: 'set';
  path: string;
  value: unknown;
  origin: AgentDraftOrigin;
  confidence?: number;
  reason?: string;
  evidence?: AgentEvidence[];
}

export interface AgentDraftEnvelope {
  format: typeof AGENT_DRAFT_FORMAT;
  version: typeof AGENT_API_VERSION;
  name: string;
  sources: AgentSource[];
  operations: AgentDraftOperation[];
  warnings?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`${label} enthaelt unerlaubte Felder: ${unexpected.join(', ')}.`);
  }
}

function assertBoundedJson(value: unknown, label: string, depth = 0): void {
  if (depth > MAX_JSON_DEPTH) throw new Error(`${label} ist zu tief verschachtelt.`);
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_COLLECTION_SIZE) {
      throw new Error(`${label} enthaelt zu viele Eintraege.`);
    }
    value.forEach((item, index) => assertBoundedJson(item, `${label}[${index}]`, depth + 1));
    return;
  }
  if (!isRecord(value)) return;
  const keys = Object.keys(value);
  if (keys.length > MAX_JSON_COLLECTION_SIZE) throw new Error(`${label} enthaelt zu viele Felder.`);
  for (const key of keys) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new Error(`${label} enthaelt einen reservierten JSON-Schluessel.`);
    }
    assertBoundedJson(value[key], `${label}.${key}`, depth + 1);
  }
}

function requireShortString(value: unknown, label: string, max = MAX_SHORT_TEXT): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} muss ein nicht-leerer Text sein.`);
  }
  if (value.length > max) {
    throw new Error(`${label} ist zu lang (maximal ${max} Zeichen).`);
  }
  return value;
}

function optionalShortString(value: unknown, label: string, max = MAX_SHORT_TEXT): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length > max) {
    throw new Error(`${label} muss ein Text mit maximal ${max} Zeichen sein.`);
  }
  return value;
}

function optionalSha256(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !/^[a-f\d]{64}$/i.test(value)) {
    throw new Error(`${label} muss ein SHA-256-Hash mit 64 Hex-Zeichen sein.`);
  }
  return value.toLowerCase();
}

function optionalIsoTimestamp(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${label} muss ein gueltiger ISO-Zeitstempel sein.`);
  }
  return value;
}

function requireNumberInRange(
  value: unknown,
  label: string,
  min: number,
  max: number,
  integer = false,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)
    || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} hat einen ungueltigen Zahlenwert.`);
  }
  return value;
}

function validateIncreaseRulesValue(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length > MAX_JSON_COLLECTION_SIZE) {
    throw new Error(`${label} muss ein Array mit maximal ${MAX_JSON_COLLECTION_SIZE} Regeln sein.`);
  }
  value.forEach((rule, index) => {
    const ruleLabel = `${label}, Regel ${index + 1}`;
    if (!isRecord(rule)) throw new Error(`${ruleLabel} muss ein Objekt sein.`);
    const kind = rule.kind;
    if (kind === 'step') {
      assertOnlyKeys(rule, ['id', 'kind', 'fromYear', 'percent', 'wirksamAbMonat'], ruleLabel);
      requireNumberInRange(rule.percent, `${ruleLabel}: percent`, -100, 100);
      if (rule.wirksamAbMonat !== undefined) {
        requireNumberInRange(rule.wirksamAbMonat, `${ruleLabel}: wirksamAbMonat`, 1, 12, true);
      }
    } else if (kind === 'rate') {
      assertOnlyKeys(rule, ['id', 'kind', 'fromYear', 'percentPerYear'], ruleLabel);
      requireNumberInRange(rule.percentPerYear, `${ruleLabel}: percentPerYear`, -100, 100);
    } else {
      throw new Error(`${ruleLabel}: kind hat einen ungueltigen Wert.`);
    }
    requireShortString(rule.id, `${ruleLabel}: id`);
    requireNumberInRange(rule.fromYear, `${ruleLabel}: fromYear`, 1, 50, true);
  });
}

function validateRenovationsValue(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length > MAX_JSON_COLLECTION_SIZE) {
    throw new Error(`${label} muss ein Array mit maximal ${MAX_JSON_COLLECTION_SIZE} Massnahmen sein.`);
  }
  const ids = new Set<string>();
  const allowedTaxKinds = ['sofort', 'verteilt', 'herstellung', 'denkmal7i', 'denkmal11b', 'keine'];
  value.forEach((renovation, index) => {
    const itemLabel = `${label}, Massnahme ${index + 1}`;
    if (!isRecord(renovation)) throw new Error(`${itemLabel} muss ein Objekt sein.`);
    assertOnlyKeys(
      renovation,
      ['id', 'bezeichnung', 'jahr', 'betrag', 'steuerart', 'verteilungsJahre', 'mieterhoehungMoeglich'],
      itemLabel,
    );
    const id = requireShortString(renovation.id, `${itemLabel}: id`);
    if (ids.has(id)) throw new Error(`${label} enthaelt die doppelte ID "${id}".`);
    ids.add(id);
    requireShortString(renovation.bezeichnung, `${itemLabel}: bezeichnung`);
    requireNumberInRange(renovation.jahr, `${itemLabel}: jahr`, 1, 40, true);
    requireNumberInRange(renovation.betrag, `${itemLabel}: betrag`, 0, Number.MAX_SAFE_INTEGER);
    if (typeof renovation.steuerart !== 'string' || !allowedTaxKinds.includes(renovation.steuerart)) {
      throw new Error(`${itemLabel}: steuerart hat einen ungueltigen Wert.`);
    }
    requireNumberInRange(renovation.verteilungsJahre, `${itemLabel}: verteilungsJahre`, 2, 5, true);
    if (typeof renovation.mieterhoehungMoeglich !== 'boolean') {
      throw new Error(`${itemLabel}: mieterhoehungMoeglich muss true oder false sein.`);
    }
  });
}

function validateStructuredArrayValue(path: string, value: unknown, label: string): void {
  if (path === '/miete/steigerungen' || path === '/wertentwicklung/szenario') {
    validateIncreaseRulesValue(value, label);
  } else if (path === '/sanierungen') {
    validateRenovationsValue(value, label);
  }
}

function parseSource(value: unknown, index: number): AgentSource {
  if (!isRecord(value)) throw new Error(`Quelle ${index + 1} muss ein Objekt sein.`);
  assertOnlyKeys(value, ['id', 'kind', 'label', 'url', 'sha256', 'retrievedAt'], `Quelle ${index + 1}`);
  const kind = value.kind;
  const allowedKinds: AgentSourceKind[] = ['pdf', 'web', 'api', 'text', 'manual'];
  if (typeof kind !== 'string' || !allowedKinds.includes(kind as AgentSourceKind)) {
    throw new Error(`Quelle ${index + 1}: kind hat einen ungueltigen Wert.`);
  }

  return {
    id: requireShortString(value.id, `Quelle ${index + 1}: id`, 120),
    kind: kind as AgentSourceKind,
    label: requireShortString(value.label, `Quelle ${index + 1}: label`),
    ...(optionalShortString(value.url, `Quelle ${index + 1}: url`, 2_000) !== undefined
      ? { url: value.url as string }
      : {}),
    ...(optionalSha256(value.sha256, `Quelle ${index + 1}: sha256`) !== undefined
      ? { sha256: (value.sha256 as string).toLowerCase() }
      : {}),
    ...(optionalIsoTimestamp(value.retrievedAt, `Quelle ${index + 1}: retrievedAt`) !== undefined
      ? { retrievedAt: value.retrievedAt as string }
      : {}),
  };
}

function parseEvidence(value: unknown, sourceIds: Set<string>, label: string): AgentEvidence {
  if (!isRecord(value)) throw new Error(`${label} muss ein Objekt sein.`);
  assertOnlyKeys(value, ['sourceId', 'page', 'locator', 'excerpt'], label);
  const sourceId = requireShortString(value.sourceId, `${label}: sourceId`, 120);
  if (!sourceIds.has(sourceId)) {
    throw new Error(`${label}: Unbekannte Quelle "${sourceId}".`);
  }

  let page: number | undefined;
  if (value.page !== undefined && value.page !== null) {
    if (typeof value.page !== 'number' || !Number.isInteger(value.page) || value.page < 1 || value.page > 100_000) {
      throw new Error(`${label}: page muss eine positive ganze Zahl sein.`);
    }
    page = value.page;
  }

  return {
    sourceId,
    ...(page !== undefined ? { page } : {}),
    ...(optionalShortString(value.locator, `${label}: locator`) !== undefined
      ? { locator: value.locator as string }
      : {}),
    ...(optionalShortString(value.excerpt, `${label}: excerpt`) !== undefined
      ? { excerpt: value.excerpt as string }
      : {}),
  };
}

function parseOperation(value: unknown, index: number, sourceIds: Set<string>): AgentDraftOperation {
  if (!isRecord(value)) throw new Error(`Operation ${index + 1} muss ein Objekt sein.`);
  assertOnlyKeys(value, ['op', 'path', 'value', 'origin', 'confidence', 'reason', 'evidence'], `Operation ${index + 1}`);
  if (value.op !== 'set') throw new Error(`Operation ${index + 1}: Nur "set" ist erlaubt.`);

  const path = requireShortString(value.path, `Operation ${index + 1}: path`, 160);
  if (!isAgentFieldPath(path)) {
    throw new Error(`Operation ${index + 1}: Feldpfad "${path}" ist nicht schreibbar.`);
  }
  assertBoundedJson(value.value, `Operation ${index + 1}: value`);
  validateStructuredArrayValue(path, value.value, `Operation ${index + 1}: value`);

  const allowedOrigins: AgentDraftOrigin[] = ['extracted', 'inferred', 'assumption', 'conflict'];
  if (typeof value.origin !== 'string' || !allowedOrigins.includes(value.origin as AgentDraftOrigin)) {
    throw new Error(`Operation ${index + 1}: origin hat einen ungueltigen Wert.`);
  }

  let confidence: number | undefined;
  if (value.confidence !== undefined && value.confidence !== null) {
    if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence)
      || value.confidence < 0 || value.confidence > 1) {
      throw new Error(`Operation ${index + 1}: confidence muss zwischen 0 und 1 liegen.`);
    }
    confidence = value.confidence;
  }

  let evidence: AgentEvidence[] = [];
  if (value.evidence !== undefined) {
    if (!Array.isArray(value.evidence) || value.evidence.length > MAX_EVIDENCE_PER_OPERATION) {
      throw new Error(`Operation ${index + 1}: evidence muss ein Array mit maximal ${MAX_EVIDENCE_PER_OPERATION} Eintraegen sein.`);
    }
    evidence = value.evidence.map((item, evidenceIndex) =>
      parseEvidence(item, sourceIds, `Operation ${index + 1}, Beleg ${evidenceIndex + 1}`));
  }

  const definition = getAgentFieldDefinition(path);
  if (definition?.valueType === 'string') {
    const max = path === '/notizen' ? MAX_NOTES_TEXT : MAX_SHORT_TEXT;
    if (typeof value.value !== 'string' || value.value.length > max) {
      throw new Error(`Operation ${index + 1}: value muss ein Text mit maximal ${max} Zeichen sein.`);
    }
  }

  return {
    op: 'set',
    path,
    value: structuredClone(value.value),
    origin: value.origin as AgentDraftOrigin,
    ...(confidence !== undefined ? { confidence } : {}),
    ...(optionalShortString(value.reason, `Operation ${index + 1}: reason`) !== undefined
      ? { reason: value.reason as string }
      : {}),
    evidence,
  };
}

export function isAgentDraft(value: unknown): boolean {
  return isRecord(value) && value.format === AGENT_DRAFT_FORMAT;
}

export function parseAgentDraft(input: string | unknown): AgentDraftEnvelope {
  let raw: unknown = input;
  if (typeof input === 'string') {
    if (new Blob([input]).size > MAX_DRAFT_BYTES) {
      throw new Error('Agent-Entwurf ist zu gross (maximal 1 MB).');
    }
    try {
      raw = JSON.parse(input);
    } catch (error) {
      throw new Error('Agent-Entwurf enthaelt kein valides JSON.', { cause: error });
    }
  } else {
    try {
      const serialized = JSON.stringify(input);
      if (serialized === undefined || new Blob([serialized]).size > MAX_DRAFT_BYTES) {
        throw new Error('Agent-Entwurf ist zu gross (maximal 1 MB).');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('maximal 1 MB')) throw error;
      throw new Error('Agent-Entwurf muss ein serialisierbares JSON-Objekt sein.', { cause: error });
    }
  }

  if (!isRecord(raw) || raw.format !== AGENT_DRAFT_FORMAT) {
    throw new Error(`Erwartetes Format: "${AGENT_DRAFT_FORMAT}".`);
  }
  assertOnlyKeys(raw, ['format', 'version', 'name', 'sources', 'operations', 'warnings'], 'Agent-Entwurf');
  if (raw.version !== AGENT_API_VERSION) {
    throw new Error('Nicht unterstuetzte Agent-Draft-Version.');
  }

  if (!Array.isArray(raw.sources) || raw.sources.length > MAX_SOURCES) {
    throw new Error(`sources muss ein Array mit maximal ${MAX_SOURCES} Eintraegen sein.`);
  }
  const sources = raw.sources.map(parseSource);
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (sourceIds.has(source.id)) throw new Error(`Doppelte Quellen-ID "${source.id}".`);
    sourceIds.add(source.id);
  }

  if (!Array.isArray(raw.operations) || raw.operations.length > MAX_OPERATIONS) {
    throw new Error(`operations muss ein Array mit maximal ${MAX_OPERATIONS} Eintraegen sein.`);
  }
  const operations = raw.operations.map((operation, index) => parseOperation(operation, index, sourceIds));
  const operationPaths = new Set<string>();
  for (const operation of operations) {
    if (operationPaths.has(operation.path)) {
      throw new Error(`Feldpfad "${operation.path}" kommt mehrfach vor. Konflikte muessen explizit markiert werden.`);
    }
    operationPaths.add(operation.path);
  }

  const warnings = raw.warnings === undefined
    ? undefined
    : Array.isArray(raw.warnings) && raw.warnings.length <= MAX_WARNINGS
      ? raw.warnings.map((warning, index) => requireShortString(warning, `Warnung ${index + 1}`))
      : (() => { throw new Error(`warnings muss ein Array mit maximal ${MAX_WARNINGS} Eintraegen sein.`); })();

  return {
    format: AGENT_DRAFT_FORMAT,
    version: AGENT_API_VERSION,
    name: requireShortString(raw.name, 'name'),
    sources,
    operations,
    ...(warnings ? { warnings } : {}),
  };
}

function setAllowedPath(target: Scenario, path: string, value: unknown): void {
  const keys = path.slice(1).split('/');
  let current: Record<string, unknown> = target as unknown as Record<string, unknown>;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const next = current[keys[index]];
    if (!isRecord(next)) throw new Error(`Feldpfad "${path}" kann nicht gesetzt werden.`);
    current = next;
  }
  current[keys[keys.length - 1]] = structuredClone(value);
}

function normalizeDependentFields(scenario: Scenario, supplied: Set<string>): Set<string> {
  const derived = new Set<string>();

  if (supplied.has('/objekt/bundesland') && !supplied.has('/knk/grestPct')) {
    scenario.knk.grestPct = GREST_BY_BUNDESLAND[scenario.objekt.bundesland];
  }
  if (supplied.has('/objekt/fertigstellungsjahr') && !supplied.has('/afa/linearSatzPct')) {
    scenario.afa.linearSatzPct = linearAfaRateForYear(scenario.objekt.fertigstellungsjahr);
  }
  if (supplied.has('/objekt/objektTyp') && !supplied.has('/afa/modus')) {
    scenario.afa.modus = scenario.objekt.objektTyp === 'denkmal' ? 'denkmal7i' : 'linear';
  }

  const suppliedRentValues = [
    '/miete/kaltmieteProMonat',
    '/miete/kaltmieteProJahr',
    '/miete/kaltmieteProSqm',
  ].filter((path) => supplied.has(path));
  if (!supplied.has('/miete/rentMode') && suppliedRentValues.length === 1) {
    scenario.miete.rentMode = suppliedRentValues[0].endsWith('ProJahr')
      ? 'perYear'
      : suppliedRentValues[0].endsWith('ProSqm')
        ? 'perSqm'
        : 'perMonth';
    derived.add('/miete/rentMode');
  } else if (!supplied.has('/miete/rentMode') && suppliedRentValues.length > 1) {
    throw new Error('Mehrere Mietwerte benoetigen eine explizite Operation fuer /miete/rentMode.');
  }

  if (scenario.miete.rentMode === 'perYear') {
    scenario.miete.kaltmieteProMonat = scenario.miete.kaltmieteProJahr / 12;
    scenario.miete.kaltmieteProSqm = scenario.objekt.wohnflaeche > 0
      ? scenario.miete.kaltmieteProMonat / scenario.objekt.wohnflaeche
      : 0;
  } else if (scenario.miete.rentMode === 'perSqm') {
    scenario.miete.kaltmieteProMonat = scenario.miete.kaltmieteProSqm * scenario.objekt.wohnflaeche;
    scenario.miete.kaltmieteProJahr = scenario.miete.kaltmieteProMonat * 12;
  } else {
    scenario.miete.kaltmieteProJahr = scenario.miete.kaltmieteProMonat * 12;
    scenario.miete.kaltmieteProSqm = scenario.objekt.wohnflaeche > 0
      ? scenario.miete.kaltmieteProMonat / scenario.objekt.wohnflaeche
      : 0;
  }

  const suppliedBodenwerte = ['/objekt/bodenwertAnteilPct', '/objekt/bodenrichtwertProSqm']
    .filter((path) => supplied.has(path));
  if (!supplied.has('/objekt/bodenwertMode') && suppliedBodenwerte.length === 1) {
    scenario.objekt.bodenwertMode = suppliedBodenwerte[0].endsWith('AnteilPct') ? 'percent' : 'perSqm';
    derived.add('/objekt/bodenwertMode');
  } else if (!supplied.has('/objekt/bodenwertMode') && suppliedBodenwerte.length > 1) {
    throw new Error('Mehrere Bodenwerte benoetigen eine explizite Operation fuer /objekt/bodenwertMode.');
  }
  if (
    supplied.has('/objekt/miteigentumsanteilZaehler')
    && !supplied.has('/objekt/miteigentumsanteilNenner')
    && scenario.objekt.miteigentumsanteilZaehler > scenario.objekt.miteigentumsanteilNenner
  ) {
    // Der fehlende Nenner bleibt im Review offen; intern halten wir den partiellen
    // Entwurf dennoch valide, bis der Benutzer den echten Gesamtanteil eintraegt.
    scenario.objekt.miteigentumsanteilNenner = scenario.objekt.miteigentumsanteilZaehler;
  }
  const effectivePlotArea = bodenwertFlaeche(scenario);
  if (scenario.objekt.bodenwertMode === 'percent') {
    scenario.objekt.bodenrichtwertProSqm = effectivePlotArea > 0
      ? (scenario.objekt.kaufpreis * (scenario.objekt.bodenwertAnteilPct / 100)) / effectivePlotArea
      : 0;
  } else {
    scenario.objekt.bodenwertAnteilPct = scenario.objekt.kaufpreis > 0
      ? Math.min(
          100,
          Math.max(
            0,
            ((scenario.objekt.bodenrichtwertProSqm * effectivePlotArea) / scenario.objekt.kaufpreis) * 100
          )
        )
      : 0;
  }

  const suppliedExitCosts = [
    '/exit/verkaufsnebenkostenPct',
    '/exit/verkaufsnebenkostenAbsolut',
  ].filter((path) => supplied.has(path));
  if (!supplied.has('/exit/verkaufsnebenkostenMode') && suppliedExitCosts.length === 1) {
    scenario.exit.verkaufsnebenkostenMode = suppliedExitCosts[0].endsWith('Absolut') ? 'absolute' : 'percent';
    derived.add('/exit/verkaufsnebenkostenMode');
  } else if (!supplied.has('/exit/verkaufsnebenkostenMode') && suppliedExitCosts.length > 1) {
    throw new Error('Mehrere Verkaufsnebenkosten benoetigen eine explizite Operation fuer /exit/verkaufsnebenkostenMode.');
  }

  if (supplied.has('/knk/finanzierungsPct') && !supplied.has('/knk/mitfinanzieren')) {
    scenario.knk.mitfinanzieren = scenario.knk.finanzierungsPct > 0;
    derived.add('/knk/mitfinanzieren');
  } else if (supplied.has('/knk/mitfinanzieren') && !scenario.knk.mitfinanzieren) {
    scenario.knk.finanzierungsPct = 0;
  }

  return derived;
}

function reviewForOperation(operation: AgentDraftOperation, required: boolean): AgentFieldReview {
  const status = operation.origin === 'conflict' ? 'conflict' : 'uncertain';
  const origin: AgentFieldOrigin = operation.origin === 'conflict' ? 'inferred' : operation.origin;
  return {
    status,
    origin,
    required,
    ...(operation.confidence !== undefined ? { confidence: operation.confidence } : {}),
    ...(operation.reason ? { reason: operation.reason } : {}),
    evidence: operation.evidence ?? [],
  };
}

export function materializeAgentDraft(input: string | unknown): Scenario {
  const draft = parseAgentDraft(input);
  const scenario = createDefaultScenario({ name: draft.name });
  const supplied = new Set<string>();

  for (const operation of draft.operations) {
    setAllowedPath(scenario, operation.path, operation.value);
    supplied.add(operation.path);
  }

  const derived = normalizeDependentFields(scenario, supplied);
  const validated = validateScenario(structuredClone(scenario));
  const required = new Set(requiredAgentFieldPaths(validated));
  const fields: Record<string, AgentFieldReview> = {};

  for (const operation of draft.operations) {
    fields[operation.path] = reviewForOperation(operation, required.has(operation.path));
  }
  for (const path of derived) {
    if (fields[path]) continue;
    fields[path] = {
      status: 'uncertain',
      origin: 'derived',
      required: required.has(path),
      reason: 'Aus einem gelieferten Feld eindeutig abgeleitet; bitte kurz pruefen.',
      evidence: [],
    };
  }
  for (const path of required) {
    if (fields[path]) continue;
    fields[path] = {
      status: 'missing',
      origin: 'assumption',
      required: true,
      reason: 'Vom Agenten nicht geliefert; aktuell wird der App-Standard als Annahme verwendet.',
      evidence: [],
    };
  }

  const now = new Date().toISOString();
  validated.agentReview = {
    version: 1,
    updatedAt: now,
    sources: draft.sources,
    fields,
    ...(draft.warnings && draft.warnings.length > 0 ? { warnings: draft.warnings } : {}),
  };
  return validated;
}

export function createAgentDraftExample(): AgentDraftEnvelope {
  return {
    format: AGENT_DRAFT_FORMAT,
    version: AGENT_API_VERSION,
    name: 'Objekt Musterstrasse',
    sources: [{ id: 'expose', kind: 'pdf', label: 'Expose.pdf' }],
    operations: [
      {
        op: 'set',
        path: '/objekt/kaufpreis',
        value: 275000,
        origin: 'extracted',
        confidence: 0.98,
        evidence: [{ sourceId: 'expose', page: 2, excerpt: 'Kaufpreis 275.000 EUR' }],
      },
      {
        op: 'set',
        path: '/objekt/wohnflaeche',
        value: 68,
        origin: 'extracted',
        confidence: 0.96,
        evidence: [{ sourceId: 'expose', page: 1, excerpt: 'Wohnflaeche ca. 68 m2' }],
      },
    ],
  };
}
