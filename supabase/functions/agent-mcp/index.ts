import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { McpServer } from "npm:@modelcontextprotocol/sdk@1.29.0/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.29.0/server/webStandardStreamableHttp.js";
import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.108.2";
import { z } from "npm:zod@3.25.76";

const DRAFT_FORMAT = "immo-checker-agent-draft";
const DRAFT_VERSION = 1;
const MAX_REQUEST_BYTES = 1_200_000;
const MAX_DRAFT_BYTES = 1_000_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_SOURCES = 20;
const MAX_OPERATIONS = 120;
const MAX_WARNINGS = 50;
const MAX_SHORT_TEXT = 500;
const MAX_NOTES_TEXT = 20_000;
const MAX_TOKEN_LENGTH = 16_384;
const MAX_JSON_DEPTH = 10;
const MAX_JSON_COLLECTION_SIZE = 120;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type FieldType =
  | "string"
  | "number"
  | "nullable-number"
  | "boolean"
  | "enum"
  | "array";

interface AgentSource {
  id: string;
  kind: "pdf" | "web" | "api" | "text" | "manual";
  label: string;
  url?: string;
  sha256?: string;
  retrievedAt?: string;
}

interface AgentEvidence {
  sourceId: string;
  page?: number;
  locator?: string;
  excerpt?: string;
}

interface AgentOperation {
  op: "set";
  path: string;
  value: Json;
  origin: "extracted" | "inferred" | "assumption" | "conflict";
  confidence?: number;
  reason?: string;
  evidence: AgentEvidence[];
}

interface AgentDraft {
  format: typeof DRAFT_FORMAT;
  version: typeof DRAFT_VERSION;
  name: string;
  sources: AgentSource[];
  operations: AgentOperation[];
  warnings?: string[];
}

interface RuntimeConfig {
  supabaseUrl: string;
  publicKey: string;
  resourceUri: string;
  metadataUrl: string;
  issuer: string;
  allowedOrigins: Set<string>;
}

interface AuthContext {
  db: SupabaseClient;
  token: string;
  userId: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

type AuthenticationResult =
  | { status: "authenticated"; context: AuthContext }
  | { status: "missing" | "invalid" };

interface ListScenariosInput {
  limit: number;
  include_drafts: boolean;
}

interface GetScenarioInput {
  id: string;
  kind: "scenario" | "draft";
}

interface CreateDraftInput {
  name: string;
  sources?: unknown[];
  operations?: unknown[];
  warnings?: string[];
}

interface UpdateDraftInput {
  draft_id: string;
  revision: number;
  name?: string;
  sources?: unknown[];
  operations?: unknown[];
  warnings?: string[];
}

interface AnalyzeScenarioInput {
  scenario_id: string;
}

class PublicError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PublicError";
  }
}

class PayloadTooLargeError extends Error {}

// Must stay byte-for-byte equivalent by path and value type to
// app/src/agent/contract.ts. Calculated outputs, IDs and schemaVersion are absent.
const AGENT_FIELD_TYPES = {
  "/name": "string",
  "/notizen": "string",
  "/objekt/kaufpreis": "number",
  "/objekt/wohnflaeche": "number",
  "/objekt/grundstuecksflaeche": "number",
  "/objekt/miteigentumsanteilZaehler": "number",
  "/objekt/miteigentumsanteilNenner": "number",
  "/objekt/fertigstellungsjahr": "number",
  "/objekt/bundesland": "enum",
  "/objekt/objektTyp": "enum",
  "/objekt/bodenwertMode": "enum",
  "/objekt/bodenwertAnteilPct": "number",
  "/objekt/bodenrichtwertProSqm": "number",
  "/objekt/sanierungskosten": "number",
  "/knk/grestPct": "number",
  "/knk/notarPct": "number",
  "/knk/maklerPct": "number",
  "/knk/mitfinanzieren": "boolean",
  "/knk/finanzierungsPct": "number",
  "/finanzierung/equityMode": "enum",
  "/finanzierung/equityPct": "number",
  "/finanzierung/equityAbsolute": "number",
  "/finanzierung/sollzinsPct": "number",
  "/finanzierung/tilgungPct": "number",
  "/finanzierung/zinsbindungJahre": "number",
  "/finanzierung/anschlusszinsPct": "number",
  "/finanzierung/anschlussTilgungPct": "nullable-number",
  "/finanzierung/sondertilgungProJahr": "number",
  "/finanzierung/disagioPct": "number",
  "/miete/rentMode": "enum",
  "/miete/kaltmieteProMonat": "number",
  "/miete/kaltmieteProJahr": "number",
  "/miete/kaltmieteProSqm": "number",
  "/miete/leerstandPct": "number",
  "/miete/mietspiegel/untererSpannwertProSqm": "number",
  "/miete/mietspiegel/mittelwertProSqm": "number",
  "/miete/mietspiegel/obererSpannwertProSqm": "number",
  "/miete/steigerungen": "array",
  "/kosten/maintenanceMode": "enum",
  "/kosten/instandhaltungProSqm": "number",
  "/kosten/instandhaltungPctRent": "number",
  "/kosten/instandhaltungAbsolut": "number",
  "/kosten/ruecklagenAnteilPct": "number",
  "/kosten/verwaltungProJahr": "number",
  "/kosten/sonstigeKostenProJahr": "number",
  "/kosten/kostensteigerungPctPa": "number",
  "/steuer/taxMode": "enum",
  "/steuer/bruttoJahresEinkommen": "number",
  "/steuer/grenzsteuersatzPct": "number",
  "/steuer/veranlagung": "enum",
  "/steuer/soli": "boolean",
  "/steuer/kirchensteuerPct": "number",
  "/afa/modus": "enum",
  "/afa/linearSatzPct": "number",
  "/sanierungen": "array",
  "/wertentwicklung/szenario": "array",
  "/exit/haltedauerJahre": "number",
  "/exit/verkaufsnebenkostenMode": "enum",
  "/exit/verkaufsnebenkostenPct": "number",
  "/exit/verkaufsnebenkostenAbsolut": "number",
  "/exit/vorfaelligkeitPct": "number",
} as const satisfies Record<string, FieldType>;

const FIELD_ENUMS: Partial<
  Record<keyof typeof AGENT_FIELD_TYPES, readonly string[]>
> = {
  "/objekt/bundesland": [
    "BW",
    "BY",
    "BE",
    "BB",
    "HB",
    "HH",
    "HE",
    "MV",
    "NI",
    "NW",
    "RP",
    "SL",
    "SN",
    "ST",
    "SH",
    "TH",
  ],
  "/objekt/objektTyp": ["bestand", "neubau", "denkmal"],
  "/objekt/bodenwertMode": ["percent", "perSqm"],
  "/finanzierung/equityMode": ["percent", "absolute"],
  "/miete/rentMode": ["perMonth", "perYear", "perSqm"],
  "/kosten/maintenanceMode": ["perSqm", "percentRent", "absolute"],
  "/steuer/taxMode": ["income", "marginalRate"],
  "/steuer/veranlagung": ["single", "splitting"],
  "/afa/modus": ["linear", "degressiv", "sonder7b", "denkmal7i"],
  "/exit/verkaufsnebenkostenMode": ["percent", "absolute"],
};

const PERCENT_PATHS = new Set<string>([
  "/objekt/bodenwertAnteilPct",
  "/knk/grestPct",
  "/knk/notarPct",
  "/knk/maklerPct",
  "/knk/finanzierungsPct",
  "/finanzierung/equityPct",
  "/finanzierung/sollzinsPct",
  "/finanzierung/tilgungPct",
  "/finanzierung/anschlusszinsPct",
  "/finanzierung/anschlussTilgungPct",
  "/miete/leerstandPct",
  "/kosten/instandhaltungPctRent",
  "/kosten/ruecklagenAnteilPct",
  "/kosten/kostensteigerungPctPa",
  "/steuer/grenzsteuersatzPct",
  "/steuer/kirchensteuerPct",
  "/afa/linearSatzPct",
  "/exit/verkaufsnebenkostenPct",
  "/exit/vorfaelligkeitPct",
]);

const SHA256_PATTERN = /^[0-9A-Fa-f]{64}$/;
const ISO_TIMESTAMP_PATTERN =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$/;

const sourceSchema = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(["pdf", "web", "api", "text", "manual"]),
  label: z.string().min(1).max(MAX_SHORT_TEXT),
  url: z.string().max(2_000).optional(),
  sha256: z.string().regex(SHA256_PATTERN).optional(),
  retrievedAt: z.string().regex(ISO_TIMESTAMP_PATTERN).optional(),
}).strict();

const evidenceSchema = z.object({
  sourceId: z.string().min(1).max(120),
  page: z.number().int().min(1).max(100_000).optional(),
  locator: z.string().max(MAX_SHORT_TEXT).optional(),
  excerpt: z.string().max(MAX_SHORT_TEXT).optional(),
}).strict();

const nonEmptyShortTextSchema = z.string().min(1).max(MAX_SHORT_TEXT).refine(
  (value) => value.trim().length > 0,
  { message: "Text darf nicht nur aus Leerzeichen bestehen." },
);

const stepIncreaseRuleSchema = z.object({
  id: nonEmptyShortTextSchema,
  kind: z.literal("step"),
  fromYear: z.number().int().min(1).max(50),
  percent: z.number().finite().min(-100).max(100),
  wirksamAbMonat: z.number().int().min(1).max(12).optional(),
}).strict();

const rateIncreaseRuleSchema = z.object({
  id: nonEmptyShortTextSchema,
  kind: z.literal("rate"),
  fromYear: z.number().int().min(1).max(50),
  percentPerYear: z.number().finite().min(-100).max(100),
}).strict();

const increaseRulesSchema = z.array(
  z.discriminatedUnion("kind", [
    stepIncreaseRuleSchema,
    rateIncreaseRuleSchema,
  ]),
).max(MAX_JSON_COLLECTION_SIZE);

const sanierungSchema = z.object({
  id: nonEmptyShortTextSchema,
  bezeichnung: nonEmptyShortTextSchema,
  jahr: z.number().int().min(1).max(40),
  betrag: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER),
  steuerart: z.enum([
    "sofort",
    "verteilt",
    "herstellung",
    "denkmal7i",
    "denkmal11b",
    "keine",
  ]),
  verteilungsJahre: z.number().int().min(2).max(5),
  mieterhoehungMoeglich: z.boolean(),
}).strict();

const sanierungenSchema = z.array(sanierungSchema).max(
  MAX_JSON_COLLECTION_SIZE,
).superRefine((sanierungen, context) => {
  const seenIds = new Set<string>();
  sanierungen.forEach((sanierung, index) => {
    if (seenIds.has(sanierung.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, "id"],
        message: "Sanierungs-IDs muessen eindeutig sein.",
      });
    }
    seenIds.add(sanierung.id);
  });
});

const scalarOperationValueSchema = z.union([
  z.string().max(MAX_NOTES_TEXT),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

const operationMetadataShape = {
  op: z.literal("set"),
  origin: z.enum(["extracted", "inferred", "assumption", "conflict"]),
  confidence: z.number().finite().min(0).max(1).optional(),
  reason: z.string().max(MAX_SHORT_TEXT).optional(),
  evidence: z.array(evidenceSchema).max(20).optional(),
} as const;

const NON_ARRAY_AGENT_FIELD_PATHS = Object.entries(AGENT_FIELD_TYPES)
  .filter(([, type]) => type !== "array")
  .map(([path]) => path) as [
    Exclude<
      keyof typeof AGENT_FIELD_TYPES,
      "/miete/steigerungen" | "/sanierungen" | "/wertentwicklung/szenario"
    >,
    ...Exclude<
      keyof typeof AGENT_FIELD_TYPES,
      "/miete/steigerungen" | "/sanierungen" | "/wertentwicklung/szenario"
    >[],
  ];

const operationSchema = z.union([
  z.object({
    ...operationMetadataShape,
    path: z.enum(NON_ARRAY_AGENT_FIELD_PATHS),
    value: scalarOperationValueSchema,
  }).strict(),
  z.object({
    ...operationMetadataShape,
    path: z.literal("/miete/steigerungen"),
    value: increaseRulesSchema,
  }).strict(),
  z.object({
    ...operationMetadataShape,
    path: z.literal("/wertentwicklung/szenario"),
    value: increaseRulesSchema,
  }).strict(),
  z.object({
    ...operationMetadataShape,
    path: z.literal("/sanierungen"),
    value: sanierungenSchema,
  }).strict(),
]);

const createDraftSchema = z.object({
  name: z.string().min(1).max(MAX_SHORT_TEXT),
  sources: z.array(sourceSchema).max(MAX_SOURCES).optional(),
  operations: z.array(operationSchema).max(MAX_OPERATIONS).optional(),
  warnings: z.array(z.string().min(1).max(MAX_SHORT_TEXT)).max(MAX_WARNINGS)
    .optional(),
}).strict();

const updateDraftSchema = z.object({
  draft_id: z.string().uuid(),
  revision: z.number().int().positive(),
  name: z.string().min(1).max(MAX_SHORT_TEXT).optional(),
  sources: z.array(sourceSchema).max(MAX_SOURCES).optional(),
  operations: z.array(operationSchema).max(MAX_OPERATIONS).optional(),
  warnings: z.array(z.string().min(1).max(MAX_SHORT_TEXT)).max(MAX_WARNINGS)
    .optional(),
}).strict().refine(
  (value) =>
    value.name !== undefined || value.sources !== undefined ||
    value.operations !== undefined || value.warnings !== undefined,
  { message: "Mindestens ein Draft-Feld muss aktualisiert werden." },
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedKeys = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new PublicError(
      "invalid_draft",
      `${label} enthaelt nicht erlaubte Eigenschaften.`,
    );
  }
}

function byteLength(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new PublicError("invalid_json", "Der Wert ist kein valides JSON.");
  }
  return new TextEncoder().encode(serialized).byteLength;
}

function requireText(
  value: unknown,
  label: string,
  max: number,
  allowEmpty = false,
): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new PublicError(
      "invalid_draft",
      `${label} muss ein nicht-leerer Text sein.`,
    );
  }
  if (value.length > max) {
    throw new PublicError(
      "invalid_draft",
      `${label} ist zu lang (maximal ${max} Zeichen).`,
    );
  }
  return value;
}

function optionalText(
  value: unknown,
  label: string,
  max: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > max) {
    throw new PublicError(
      "invalid_draft",
      `${label} muss ein Text mit maximal ${max} Zeichen sein.`,
    );
  }
  return value;
}

function assertJsonValue(
  value: unknown,
  label: string,
  depth = 0,
): asserts value is Json {
  if (depth > MAX_JSON_DEPTH) {
    throw new PublicError(
      "invalid_draft",
      `${label} ist zu tief verschachtelt.`,
    );
  }
  if (
    value === null || typeof value === "string" || typeof value === "boolean"
  ) return;
  if (typeof value === "number") {
    if (
      !Number.isFinite(value) ||
      !Number.isSafeInteger(value) && Math.abs(value) > Number.MAX_SAFE_INTEGER
    ) {
      throw new PublicError(
        "invalid_draft",
        `${label} enthaelt eine ungueltige Zahl.`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_COLLECTION_SIZE) {
      throw new PublicError(
        "invalid_draft",
        `${label} enthaelt zu viele Eintraege.`,
      );
    }
    value.forEach((item, index) =>
      assertJsonValue(item, `${label}[${index}]`, depth + 1)
    );
    return;
  }
  if (!isRecord(value)) {
    throw new PublicError("invalid_draft", `${label} ist kein JSON-Wert.`);
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_JSON_COLLECTION_SIZE) {
    throw new PublicError(
      "invalid_draft",
      `${label} enthaelt zu viele Eigenschaften.`,
    );
  }
  for (const [key, child] of entries) {
    if (
      key.length > 160 || key === "__proto__" || key === "prototype" ||
      key === "constructor"
    ) {
      throw new PublicError(
        "invalid_draft",
        `${label} enthaelt einen ungueltigen Schluessel.`,
      );
    }
    assertJsonValue(child, `${label}.${key}`, depth + 1);
  }
}

function validateNumber(path: string, value: number): void {
  let min = 0;
  let max = Number.MAX_SAFE_INTEGER;
  let integer = false;

  if (path === "/objekt/kaufpreis" || path === "/objekt/wohnflaeche") min = 1;
  if (
    path === "/objekt/miteigentumsanteilZaehler" ||
    path === "/objekt/miteigentumsanteilNenner"
  ) min = 1;
  if (PERCENT_PATHS.has(path)) max = 100;
  if (path === "/finanzierung/disagioPct") max = 99.999;
  if (path === "/objekt/fertigstellungsjahr") {
    min = 1;
    max = 2100;
    integer = true;
  }
  if (path === "/finanzierung/zinsbindungJahre") {
    min = 1;
    max = 30;
    integer = true;
  }
  if (path === "/exit/haltedauerJahre") {
    min = 1;
    max = 40;
    integer = true;
  }

  if (
    !Number.isFinite(value) || value < min || value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new PublicError(
      "invalid_draft",
      `value fuer ${path} liegt ausserhalb des erlaubten Bereichs.`,
    );
  }
}

function validateFieldValue(
  path: keyof typeof AGENT_FIELD_TYPES,
  value: unknown,
): Json {
  const type = AGENT_FIELD_TYPES[path];
  if (type === "string") {
    return requireText(
      value,
      `value fuer ${path}`,
      path === "/notizen" ? MAX_NOTES_TEXT : MAX_SHORT_TEXT,
      path === "/notizen",
    );
  }
  if (type === "number" || type === "nullable-number") {
    if (type === "nullable-number" && value === null) return null;
    if (typeof value !== "number") {
      throw new PublicError(
        "invalid_draft",
        `value fuer ${path} muss eine Zahl sein.`,
      );
    }
    validateNumber(path, value);
    return value;
  }
  if (type === "boolean") {
    if (typeof value !== "boolean") {
      throw new PublicError(
        "invalid_draft",
        `value fuer ${path} muss true oder false sein.`,
      );
    }
    return value;
  }
  if (type === "enum") {
    const allowed = FIELD_ENUMS[path];
    if (typeof value !== "string" || !allowed?.includes(value)) {
      throw new PublicError(
        "invalid_draft",
        `value fuer ${path} hat einen ungueltigen Wert.`,
      );
    }
    return value;
  }
  if (!Array.isArray(value)) {
    throw new PublicError(
      "invalid_draft",
      `value fuer ${path} muss ein Array sein.`,
    );
  }
  const validation = path === "/sanierungen"
    ? sanierungenSchema.safeParse(value)
    : path === "/miete/steigerungen" ||
        path === "/wertentwicklung/szenario"
    ? increaseRulesSchema.safeParse(value)
    : null;
  if (!validation?.success) {
    throw new PublicError(
      "invalid_draft",
      `value fuer ${path} hat keine gueltige Array-Struktur.`,
    );
  }
  assertJsonValue(validation.data, `value fuer ${path}`);
  return validation.data as Json;
}

function parseSource(value: unknown, index: number): AgentSource {
  if (!isRecord(value)) {
    throw new PublicError(
      "invalid_draft",
      `Quelle ${index + 1} muss ein Objekt sein.`,
    );
  }
  assertOnlyKeys(
    value,
    ["id", "kind", "label", "url", "sha256", "retrievedAt"],
    `Quelle ${index + 1}`,
  );
  const kinds = ["pdf", "web", "api", "text", "manual"] as const;
  if (
    typeof value.kind !== "string" ||
    !kinds.includes(value.kind as typeof kinds[number])
  ) {
    throw new PublicError(
      "invalid_draft",
      `Quelle ${index + 1}: kind ist ungueltig.`,
    );
  }
  const url = optionalText(value.url, `Quelle ${index + 1}: url`, 2_000);
  const sha256 = optionalText(value.sha256, `Quelle ${index + 1}: sha256`, 64);
  const retrievedAt = optionalText(
    value.retrievedAt,
    `Quelle ${index + 1}: retrievedAt`,
    80,
  );
  if (sha256 !== undefined && !SHA256_PATTERN.test(sha256)) {
    throw new PublicError(
      "invalid_draft",
      `Quelle ${index + 1}: sha256 muss aus genau 64 Hex-Zeichen bestehen.`,
    );
  }
  if (retrievedAt !== undefined && !ISO_TIMESTAMP_PATTERN.test(retrievedAt)) {
    throw new PublicError(
      "invalid_draft",
      `Quelle ${index + 1}: retrievedAt muss ein ISO-Zeitstempel sein.`,
    );
  }
  return {
    id: requireText(value.id, `Quelle ${index + 1}: id`, 120),
    kind: value.kind as AgentSource["kind"],
    label: requireText(
      value.label,
      `Quelle ${index + 1}: label`,
      MAX_SHORT_TEXT,
    ),
    ...(url !== undefined ? { url } : {}),
    ...(sha256 !== undefined ? { sha256 } : {}),
    ...(retrievedAt !== undefined ? { retrievedAt } : {}),
  };
}

function parseEvidence(
  value: unknown,
  sourceIds: Set<string>,
  label: string,
): AgentEvidence {
  if (!isRecord(value)) {
    throw new PublicError("invalid_draft", `${label} muss ein Objekt sein.`);
  }
  assertOnlyKeys(value, ["sourceId", "page", "locator", "excerpt"], label);
  const sourceId = requireText(value.sourceId, `${label}: sourceId`, 120);
  if (!sourceIds.has(sourceId)) {
    throw new PublicError(
      "invalid_draft",
      `${label} verweist auf eine unbekannte Quelle.`,
    );
  }
  let page: number | undefined;
  if (value.page !== undefined) {
    if (
      typeof value.page !== "number" || !Number.isInteger(value.page) ||
      value.page < 1 || value.page > 100_000
    ) {
      throw new PublicError(
        "invalid_draft",
        `${label}: page muss eine positive ganze Zahl sein.`,
      );
    }
    page = value.page;
  }
  const locator = optionalText(
    value.locator,
    `${label}: locator`,
    MAX_SHORT_TEXT,
  );
  const excerpt = optionalText(
    value.excerpt,
    `${label}: excerpt`,
    MAX_SHORT_TEXT,
  );
  return {
    sourceId,
    ...(page !== undefined ? { page } : {}),
    ...(locator !== undefined ? { locator } : {}),
    ...(excerpt !== undefined ? { excerpt } : {}),
  };
}

function parseOperation(
  value: unknown,
  index: number,
  sourceIds: Set<string>,
): AgentOperation {
  if (!isRecord(value)) {
    throw new PublicError(
      "invalid_draft",
      `Operation ${index + 1} muss ein Objekt sein.`,
    );
  }
  assertOnlyKeys(
    value,
    ["op", "path", "value", "origin", "confidence", "reason", "evidence"],
    `Operation ${index + 1}`,
  );
  if (value.op !== "set") {
    throw new PublicError(
      "invalid_draft",
      `Operation ${index + 1}: Nur set ist erlaubt.`,
    );
  }
  const path = requireText(value.path, `Operation ${index + 1}: path`, 160);
  if (!hasOwn(AGENT_FIELD_TYPES, path)) {
    throw new PublicError(
      "invalid_draft",
      `Operation ${index + 1}: Feldpfad ist nicht schreibbar.`,
    );
  }
  if (!hasOwn(value, "value")) {
    throw new PublicError(
      "invalid_draft",
      `Operation ${index + 1}: value fehlt.`,
    );
  }
  const origins = ["extracted", "inferred", "assumption", "conflict"] as const;
  if (
    typeof value.origin !== "string" ||
    !origins.includes(value.origin as typeof origins[number])
  ) {
    throw new PublicError(
      "invalid_draft",
      `Operation ${index + 1}: origin ist ungueltig.`,
    );
  }

  let confidence: number | undefined;
  if (value.confidence !== undefined) {
    if (
      typeof value.confidence !== "number" ||
      !Number.isFinite(value.confidence) ||
      value.confidence < 0 || value.confidence > 1
    ) {
      throw new PublicError(
        "invalid_draft",
        `Operation ${index + 1}: confidence muss zwischen 0 und 1 liegen.`,
      );
    }
    confidence = value.confidence;
  }
  const evidenceRaw = value.evidence === undefined ? [] : value.evidence;
  if (!Array.isArray(evidenceRaw) || evidenceRaw.length > 20) {
    throw new PublicError(
      "invalid_draft",
      `Operation ${index + 1}: evidence ist zu gross oder kein Array.`,
    );
  }
  const evidence = evidenceRaw.map((item, evidenceIndex) =>
    parseEvidence(
      item,
      sourceIds,
      `Operation ${index + 1}, Beleg ${evidenceIndex + 1}`,
    )
  );
  const reason = optionalText(
    value.reason,
    `Operation ${index + 1}: reason`,
    MAX_SHORT_TEXT,
  );
  const typedPath = path as keyof typeof AGENT_FIELD_TYPES;
  return {
    op: "set",
    path,
    value: validateFieldValue(typedPath, value.value),
    origin: value.origin as AgentOperation["origin"],
    ...(confidence !== undefined ? { confidence } : {}),
    ...(reason !== undefined ? { reason } : {}),
    evidence,
  };
}

function parseDraft(value: unknown): AgentDraft {
  if (!isRecord(value)) {
    throw new PublicError("invalid_draft", "Der Entwurf muss ein Objekt sein.");
  }
  assertOnlyKeys(
    value,
    ["format", "version", "name", "sources", "operations", "warnings"],
    "Entwurf",
  );
  if (value.format !== DRAFT_FORMAT || value.version !== DRAFT_VERSION) {
    throw new PublicError(
      "invalid_draft",
      `Erwartetes Format: ${DRAFT_FORMAT}, Version ${DRAFT_VERSION}.`,
    );
  }
  if (!Array.isArray(value.sources) || value.sources.length > MAX_SOURCES) {
    throw new PublicError(
      "invalid_draft",
      `sources darf maximal ${MAX_SOURCES} Eintraege enthalten.`,
    );
  }
  const sources = value.sources.map(parseSource);
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (sourceIds.has(source.id)) {
      throw new PublicError(
        "invalid_draft",
        "Quellen-IDs muessen eindeutig sein.",
      );
    }
    sourceIds.add(source.id);
  }
  if (
    !Array.isArray(value.operations) || value.operations.length > MAX_OPERATIONS
  ) {
    throw new PublicError(
      "invalid_draft",
      `operations darf maximal ${MAX_OPERATIONS} Eintraege enthalten.`,
    );
  }
  const operations = value.operations.map((operation, index) =>
    parseOperation(operation, index, sourceIds)
  );
  const paths = new Set<string>();
  for (const operation of operations) {
    if (paths.has(operation.path)) {
      throw new PublicError(
        "invalid_draft",
        "Jeder Feldpfad darf nur einmal vorkommen.",
      );
    }
    paths.add(operation.path);
  }
  const operationByPath = new Map(operations.map((operation) => [operation.path, operation]));
  const miteigentumsanteilZaehler = operationByPath.get("/objekt/miteigentumsanteilZaehler")?.value;
  const miteigentumsanteilNenner = operationByPath.get("/objekt/miteigentumsanteilNenner")?.value;
  if (
    typeof miteigentumsanteilZaehler === "number" &&
    typeof miteigentumsanteilNenner === "number" &&
    miteigentumsanteilZaehler > miteigentumsanteilNenner
  ) {
    throw new PublicError(
      "invalid_draft",
      "MEA – Ihr Anteil darf MEA – Objekt gesamt nicht überschreiten.",
    );
  }
  let warnings: string[] | undefined;
  if (value.warnings !== undefined) {
    if (
      !Array.isArray(value.warnings) || value.warnings.length > MAX_WARNINGS
    ) {
      throw new PublicError(
        "invalid_draft",
        `warnings darf maximal ${MAX_WARNINGS} Eintraege enthalten.`,
      );
    }
    warnings = value.warnings.map((warning, index) =>
      requireText(warning, `Warnung ${index + 1}`, MAX_SHORT_TEXT)
    );
  }
  const draft: AgentDraft = {
    format: DRAFT_FORMAT,
    version: DRAFT_VERSION,
    name: requireText(value.name, "name", MAX_SHORT_TEXT),
    sources,
    operations,
    ...(warnings !== undefined ? { warnings } : {}),
  };
  if (byteLength(draft) > MAX_DRAFT_BYTES) {
    throw new PublicError(
      "draft_too_large",
      "Der Entwurf ist groesser als 1 MB.",
    );
  }
  return draft;
}

function canonicalHttpUrl(
  raw: string,
  label: string,
  originOnly = false,
): string {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, query or fragment`);
  }
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (url.protocol !== "https:") {
    if (url.protocol !== "http:" || !loopbackHosts.has(url.hostname)) {
      throw new Error(`${label} must use HTTPS outside loopback development`);
    }
  }
  if (originOnly && url.pathname !== "/") {
    throw new Error(`${label} must be an origin without a path`);
  }
  return url.href.replace(/\/+$/, "");
}

function protectedResourceMetadataUrl(resourceUri: string): string {
  const url = new URL(resourceUri);
  const resourcePath = url.pathname === "/"
    ? ""
    : url.pathname.replace(/\/+$/, "");
  url.pathname = `/.well-known/oauth-protected-resource${resourcePath}`;
  return url.href;
}

function isProtectedResourceMetadataRequest(
  requestUrl: URL,
  config: RuntimeConfig,
): boolean {
  const canonicalPath = new URL(config.metadataUrl).pathname;
  const edgeFunctionCompatibilityPath =
    "/agent-mcp/.well-known/oauth-protected-resource";
  return requestUrl.pathname === canonicalPath ||
    requestUrl.pathname.endsWith(edgeFunctionCompatibilityPath);
}

function loadConfig(): RuntimeConfig {
  const rawSupabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const rawResourceUri = Deno.env.get("MCP_RESOURCE_URI") ?? "";
  if (!rawSupabaseUrl || !publicKey || !rawResourceUri) {
    throw new Error("agent-mcp is not configured");
  }
  const supabaseUrl = canonicalHttpUrl(rawSupabaseUrl, "SUPABASE_URL", true);
  const resourceUri = canonicalHttpUrl(rawResourceUri, "MCP_RESOURCE_URI");
  const parsedResourceUri = new URL(resourceUri);
  const configuredOrigins = (Deno.env.get("MCP_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => canonicalHttpUrl(entry, "MCP_ALLOWED_ORIGINS", true));
  const allowedOrigins = new Set<string>([
    parsedResourceUri.origin,
    ...configuredOrigins,
  ]);
  return {
    supabaseUrl,
    publicKey,
    resourceUri,
    metadataUrl: protectedResourceMetadataUrl(resourceUri),
    issuer: `${supabaseUrl}/auth/v1`,
    allowedOrigins,
  };
}

function appendVary(headers: Headers, value: string): void {
  const current = headers.get("Vary");
  const values = new Set(
    (current ?? "").split(",").map((item) => item.trim()).filter(Boolean),
  );
  values.add(value);
  headers.set("Vary", [...values].join(", "));
}

function withCors(
  response: Response,
  request: Request,
  config: RuntimeConfig,
): Response {
  const origin = request.headers.get("Origin");
  if (!origin || !config.allowedOrigins.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set(
    "Access-Control-Expose-Headers",
    "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  );
  appendVary(headers, "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(
  status: number,
  body: unknown,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function jsonRpcError(
  status: number,
  code: number,
  message: string,
  headers?: HeadersInit,
): Response {
  return jsonResponse(status, {
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  }, headers);
}

function unauthorized(config: RuntimeConfig, invalidToken: boolean): Response {
  const challenge = invalidToken
    ? `Bearer error="invalid_token", resource_metadata="${config.metadataUrl}"`
    : `Bearer resource_metadata="${config.metadataUrl}"`;
  return jsonResponse(401, {
    error: invalidToken ? "invalid_token" : "authorization_required",
    error_description: "A valid OAuth bearer token is required.",
  }, {
    "WWW-Authenticate": challenge,
  });
}

function createRlsClient(config: RuntimeConfig, token: string): SupabaseClient {
  return createClient(config.supabaseUrl, config.publicKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function audienceContains(audience: unknown, expected: string): boolean {
  return audience === expected ||
    Array.isArray(audience) && audience.some((item) => item === expected);
}

function scopesFromClaims(claims: Record<string, unknown>): string[] {
  if (typeof claims.scope === "string") {
    return claims.scope.split(/\s+/).filter(Boolean);
  }
  if (Array.isArray(claims.scopes)) {
    return claims.scopes.filter((scope): scope is string =>
      typeof scope === "string"
    );
  }
  return [];
}

async function authenticate(
  request: Request,
  config: RuntimeConfig,
): Promise<AuthenticationResult> {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return { status: "missing" };
  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match || match[1].length > MAX_TOKEN_LENGTH) {
    return { status: "invalid" };
  }

  try {
    const token = match[1];
    const db = createRlsClient(config, token);
    const { data, error } = await db.auth.getClaims(token);
    if (error || !data?.claims || !isRecord(data.claims)) {
      return { status: "invalid" };
    }
    const claims = data.claims;
    const expiresAt = claims.exp;
    const userId = claims.sub;
    const clientId = claims.client_id;
    if (
      typeof expiresAt !== "number" ||
      expiresAt <= Math.floor(Date.now() / 1000) ||
      typeof userId !== "string" ||
      !z.string().uuid().safeParse(userId).success ||
      typeof clientId !== "string" || clientId.length < 1 ||
      clientId.length > 500 ||
      claims.immo_checker_mcp !== true ||
      claims.iss !== config.issuer ||
      claims.role !== "authenticated" ||
      !audienceContains(claims.aud, config.resourceUri)
    ) {
      return { status: "invalid" };
    }

    // Zweite, RLS-kontextgebundene Pruefung: Grant und Profilfreigabe koennen
    // nach Token-Ausgabe entzogen worden sein und muessen aktuell gueltig sein.
    const { data: isAuthorized, error: authorizationError } = await db.rpc(
      "is_immo_checker_mcp",
    );
    if (authorizationError || isAuthorized !== true) {
      return { status: "invalid" };
    }

    return {
      status: "authenticated",
      context: {
        db,
        token,
        userId,
        clientId,
        scopes: scopesFromClaims(claims),
        expiresAt,
      },
    };
  } catch {
    return { status: "invalid" };
  }
}

async function readLimitedJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("Content-Length");
  if (contentLength !== null && Number(contentLength) > MAX_REQUEST_BYTES) {
    throw new PayloadTooLargeError();
  }
  if (!request.body) {
    throw new PublicError("invalid_request", "Der Request-Body fehlt.");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new PublicError("parse_error", "Parse error: Invalid JSON");
  }
}

function toolSuccess(value: unknown) {
  if (byteLength(value) > MAX_RESPONSE_BYTES) {
    return toolFailure(
      new PublicError(
        "response_too_large",
        "Die Antwort ist zu gross; bitte die Abfrage eingrenzen.",
      ),
    );
  }
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

function toolFailure(error: unknown) {
  const publicError = error instanceof PublicError ? error : new PublicError(
    "internal_error",
    "Die Anfrage konnte nicht verarbeitet werden.",
  );
  if (!(error instanceof PublicError)) {
    console.error(
      "agent-mcp tool failure",
      error instanceof Error ? error.name : "unknown",
    );
  }
  return {
    isError: true,
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        error: { code: publicError.code, message: publicError.message },
      }),
    }],
  };
}

function assertDb(error: { code?: string } | null, action: string): void {
  if (!error) return;
  console.error("agent-mcp database failure", action, error.code ?? "unknown");
  throw new PublicError(
    "database_error",
    "Die Datenbankanfrage konnte nicht verarbeitet werden.",
  );
}

function buildServer(context: AuthContext): McpServer {
  const server = new McpServer({
    name: "immo-checker-agent-mcp",
    version: "1.0.0",
  });

  server.registerTool("list_scenarios", {
    title: "List scenarios and drafts",
    description:
      "Lists the signed-in account's scenarios and optional staged agent drafts. No user IDs are returned.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).default(25),
      include_drafts: z.boolean().default(true),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ limit, include_drafts }: ListScenariosInput) => {
    try {
      const scenariosQuery = context.db
        .from("scenarios")
        .select("id, name:data->>name, updated_at")
        .order("updated_at", { ascending: false })
        .limit(limit);
      const draftsQuery = include_drafts
        ? context.db.from("scenario_drafts")
          .select("id, name:data->>name, revision, created_at, updated_at")
          .order("updated_at", { ascending: false })
          .limit(limit)
        : Promise.resolve({ data: [], error: null });
      const [scenarioResult, draftResult] = await Promise.all([
        scenariosQuery,
        draftsQuery,
      ]);
      assertDb(scenarioResult.error, "list_scenarios");
      assertDb(draftResult.error, "list_drafts");
      const scenarios = (scenarioResult.data ?? []).map((row) => ({
        id: row.id,
        name: typeof row.name === "string" ? row.name : null,
        updatedAt: row.updated_at,
      }));
      const drafts = (draftResult.data ?? []).map((row) => ({
        id: row.id,
        name: typeof row.name === "string" ? row.name : null,
        revision: row.revision,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
      return toolSuccess({ scenarios, drafts });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("get_scenario", {
    title: "Get scenario or draft",
    description:
      "Reads one account-owned scenario or staged draft. Use kind=draft for a draft UUID.",
    inputSchema: z.object({
      id: z.string().min(1).max(200),
      kind: z.enum(["scenario", "draft"]).default("scenario"),
    }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ id, kind }: GetScenarioInput) => {
    try {
      if (kind === "draft") {
        if (!z.string().uuid().safeParse(id).success) {
          throw new PublicError("invalid_id", "draft id muss eine UUID sein.");
        }
        const { data, error } = await context.db.from("scenario_drafts")
          .select("id, data, revision, created_at, updated_at")
          .eq("id", id)
          .maybeSingle();
        assertDb(error, "get_draft");
        if (!data) {
          throw new PublicError("not_found", "Entwurf nicht gefunden.");
        }
        return toolSuccess({
          kind: "draft",
          id: data.id,
          data: data.data,
          revision: data.revision,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        });
      }
      const { data, error } = await context.db.from("scenarios")
        .select("id, data, analysis, updated_at")
        .eq("id", id)
        .maybeSingle();
      assertDb(error, "get_scenario");
      if (!data) throw new PublicError("not_found", "Szenario nicht gefunden.");
      return toolSuccess({
        kind: "scenario",
        id: data.id,
        data: data.data,
        analysis: data.analysis,
        updatedAt: data.updated_at,
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool("create_draft", {
    title: "Create staged scenario draft",
    description:
      "Creates an account-owned draft only. It never commits a final scenario and accepts no user_id.",
    inputSchema: createDraftSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, async ({ name, sources, operations, warnings }: CreateDraftInput) => {
    try {
      const draft = parseDraft({
        format: DRAFT_FORMAT,
        version: DRAFT_VERSION,
        name,
        sources: sources ?? [],
        operations: operations ?? [],
        ...(warnings !== undefined ? { warnings } : {}),
      });
      const { data, error } = await context.db.from("scenario_drafts")
        .insert({ user_id: context.userId, data: draft })
        .select("id, data, revision, created_at, updated_at")
        .single();
      assertDb(error, "create_draft");
      if (!data) {
        throw new PublicError(
          "database_error",
          "Der Entwurf konnte nicht angelegt werden.",
        );
      }
      return toolSuccess({
        kind: "draft",
        id: data.id,
        data: data.data,
        revision: data.revision,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  server.registerTool(
    "update_draft",
    {
      title: "Update staged scenario draft",
      description:
        "Replaces supplied draft fields using compare-and-swap (CAS). Pass the last read revision; omitted fields stay unchanged.",
      inputSchema: updateDraftSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (
      { draft_id, revision, name, sources, operations, warnings }:
        UpdateDraftInput,
    ) => {
      try {
        const { data: currentRow, error: readError } = await context.db.from(
          "scenario_drafts",
        )
          .select("id, data, revision")
          .eq("id", draft_id)
          .maybeSingle();
        assertDb(readError, "read_draft_for_update");
        if (!currentRow) {
          throw new PublicError(
            "not_found",
            "Entwurf nicht gefunden.",
          );
        }
        if (currentRow.revision !== revision) {
          throw new PublicError(
            "revision_conflict",
            "Der Entwurf wurde inzwischen geaendert. Bitte neu lesen und erneut versuchen.",
          );
        }
        const current = parseDraft(currentRow.data);
        const next = parseDraft({
          ...current,
          ...(name !== undefined ? { name } : {}),
          ...(sources !== undefined ? { sources } : {}),
          ...(operations !== undefined ? { operations } : {}),
          ...(warnings !== undefined ? { warnings } : {}),
        });
        const { data, error } = await context.db.from("scenario_drafts")
          .update({ data: next })
          .eq("id", draft_id)
          .eq("revision", revision)
          .select("id, data, revision, created_at, updated_at")
          .maybeSingle();
        assertDb(error, "update_draft");
        if (!data) {
          throw new PublicError(
            "revision_conflict",
            "Der Entwurf wurde inzwischen geaendert. Bitte neu lesen und erneut versuchen.",
          );
        }
        return toolSuccess({
          kind: "draft",
          id: data.id,
          data: data.data,
          revision: data.revision,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        });
      } catch (error) {
        return toolFailure(error);
      }
    },
  );

  server.registerTool("analyze_scenario", {
    title: "Read stored scenario analysis",
    description:
      "Returns the already stored analysis for an account-owned final scenario. It does not recompute or mutate anything.",
    inputSchema: z.object({ scenario_id: z.string().min(1).max(200) }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }, async ({ scenario_id }: AnalyzeScenarioInput) => {
    try {
      const { data, error } = await context.db.from("scenarios")
        .select("id, analysis, updated_at")
        .eq("id", scenario_id)
        .maybeSingle();
      assertDb(error, "analyze_scenario");
      if (!data) throw new PublicError("not_found", "Szenario nicht gefunden.");
      if (data.analysis === null) {
        throw new PublicError(
          "analysis_not_available",
          "Fuer dieses Szenario ist noch keine gespeicherte Analyse vorhanden.",
        );
      }
      return toolSuccess({
        id: data.id,
        analysis: data.analysis,
        updatedAt: data.updated_at,
      });
    } catch (error) {
      return toolFailure(error);
    }
  });

  return server;
}

Deno.serve(async (request) => {
  let config: RuntimeConfig;
  try {
    config = loadConfig();
  } catch {
    return jsonResponse(503, {
      error: "service_unavailable",
      error_description: "agent-mcp is not configured.",
    });
  }

  const origin = request.headers.get("Origin");
  if (origin && !config.allowedOrigins.has(origin)) {
    return jsonRpcError(403, -32000, "Invalid Origin header.");
  }
  if (request.method === "OPTIONS") {
    return withCors(
      new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
          "Access-Control-Max-Age": "600",
        },
      }),
      request,
      config,
    );
  }

  const requestUrl = new URL(request.url);
  if (
    request.method === "GET" &&
    isProtectedResourceMetadataRequest(requestUrl, config)
  ) {
    return withCors(
      jsonResponse(200, {
        resource: config.resourceUri,
        resource_name: "Immo-Checker Agent MCP",
        authorization_servers: [config.issuer],
        bearer_methods_supported: ["header"],
      }),
      request,
      config,
    );
  }

  const authResult = await authenticate(request, config);
  if (authResult.status !== "authenticated") {
    return withCors(
      unauthorized(config, authResult.status === "invalid"),
      request,
      config,
    );
  }
  const auth = authResult.context;
  if (request.method !== "POST") {
    return withCors(
      jsonRpcError(405, -32000, "Method not allowed.", {
        Allow: "POST, OPTIONS",
      }),
      request,
      config,
    );
  }
  if (
    !request.headers.get("Content-Type")?.toLowerCase().includes(
      "application/json",
    )
  ) {
    return withCors(
      jsonRpcError(415, -32000, "Content-Type must be application/json."),
      request,
      config,
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = await readLimitedJson(request);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return withCors(
        jsonRpcError(413, -32000, "Request body exceeds the 1.2 MB limit."),
        request,
        config,
      );
    }
    return withCors(
      jsonRpcError(400, -32700, "Parse error: Invalid JSON"),
      request,
      config,
    );
  }

  try {
    const server = buildServer(auth);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    const response = await transport.handleRequest(request, {
      parsedBody,
      authInfo: {
        token: auth.token,
        clientId: auth.clientId,
        scopes: auth.scopes,
        expiresAt: auth.expiresAt,
      },
    });
    return withCors(
      new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
      request,
      config,
    );
  } catch (error) {
    console.error(
      "agent-mcp request failure",
      error instanceof Error ? error.name : "unknown",
    );
    return withCors(
      jsonRpcError(500, -32603, "Internal error."),
      request,
      config,
    );
  }
});
