import type { AgentFieldReview, AgentReview, Scenario } from '../engine/types';

export const AGENT_DRAFT_FORMAT = 'immo-checker-agent-draft' as const;
export const AGENT_SNAPSHOT_FORMAT = 'immo-checker-agent-snapshot' as const;
export const AGENT_API_VERSION = 1 as const;

export type AgentSection =
  | 'objekt'
  | 'knk'
  | 'finanzierung'
  | 'miete'
  | 'kosten'
  | 'steuer'
  | 'afa'
  | 'sanierungen'
  | 'wertentwicklung'
  | 'exit'
  | 'notizen';

export interface AgentFieldDefinition {
  path: string;
  label: string;
  section: AgentSection;
  valueType: 'string' | 'number' | 'nullable-number' | 'boolean' | 'enum' | 'array';
  unit?: string;
  description?: string;
}

/**
 * Zentrale Allowlist fuer Agent-Schreibzugriffe. IDs, Schema-Versionen und berechnete
 * Ergebnisse sind absichtlich nicht enthalten.
 */
export const AGENT_FIELD_DEFINITIONS = [
  { path: '/name', label: 'Szenarioname', section: 'notizen', valueType: 'string' },
  { path: '/notizen', label: 'Notizen', section: 'notizen', valueType: 'string' },
  { path: '/objekt/kaufpreis', label: 'Kaufpreis', section: 'objekt', valueType: 'number', unit: 'EUR' },
  { path: '/objekt/wohnflaeche', label: 'Wohnflaeche', section: 'objekt', valueType: 'number', unit: 'm2' },
  { path: '/objekt/grundstuecksflaeche', label: 'Grundstuecksflaeche', section: 'objekt', valueType: 'number', unit: 'm2' },
  { path: '/objekt/miteigentumsanteilZaehler', label: 'Miteigentumsanteil Zaehler', section: 'objekt', valueType: 'number' },
  { path: '/objekt/miteigentumsanteilNenner', label: 'Miteigentumsanteil Nenner', section: 'objekt', valueType: 'number' },
  { path: '/objekt/fertigstellungsjahr', label: 'Baujahr / Fertigstellung', section: 'objekt', valueType: 'number' },
  { path: '/objekt/bundesland', label: 'Bundesland', section: 'knk', valueType: 'enum' },
  { path: '/objekt/objektTyp', label: 'Objekttyp', section: 'objekt', valueType: 'enum' },
  { path: '/objekt/bodenwertMode', label: 'Bodenwert-Modus', section: 'objekt', valueType: 'enum' },
  { path: '/objekt/bodenwertAnteilPct', label: 'Bodenwertanteil', section: 'objekt', valueType: 'number', unit: '%' },
  { path: '/objekt/bodenrichtwertProSqm', label: 'Bodenrichtwert', section: 'objekt', valueType: 'number', unit: 'EUR/m2' },
  { path: '/objekt/sanierungskosten', label: 'Initiale Sanierungskosten', section: 'objekt', valueType: 'number', unit: 'EUR' },
  { path: '/knk/grestPct', label: 'Grunderwerbsteuer', section: 'knk', valueType: 'number', unit: '%' },
  { path: '/knk/notarPct', label: 'Notar und Grundbuch', section: 'knk', valueType: 'number', unit: '%' },
  { path: '/knk/maklerPct', label: 'Maklerprovision', section: 'knk', valueType: 'number', unit: '%' },
  { path: '/knk/mitfinanzieren', label: 'Kaufnebenkosten fremdfinanzieren', section: 'knk', valueType: 'boolean' },
  { path: '/knk/finanzierungsPct', label: 'Fremdfinanzierter KNK-Anteil', section: 'knk', valueType: 'number', unit: '%' },
  { path: '/finanzierung/equityMode', label: 'Eigenkapital-Modus', section: 'finanzierung', valueType: 'enum' },
  { path: '/finanzierung/equityPct', label: 'Eigenkapitalanteil', section: 'finanzierung', valueType: 'number', unit: '%' },
  { path: '/finanzierung/equityAbsolute', label: 'Eigenkapital absolut', section: 'finanzierung', valueType: 'number', unit: 'EUR' },
  { path: '/finanzierung/sollzinsPct', label: 'Sollzins', section: 'finanzierung', valueType: 'number', unit: '%' },
  { path: '/finanzierung/tilgungPct', label: 'Anfaengliche Tilgung', section: 'finanzierung', valueType: 'number', unit: '%' },
  { path: '/finanzierung/zinsbindungJahre', label: 'Zinsbindung', section: 'finanzierung', valueType: 'number', unit: 'Jahre' },
  { path: '/finanzierung/anschlusszinsPct', label: 'Anschlusszins', section: 'finanzierung', valueType: 'number', unit: '%' },
  { path: '/finanzierung/anschlussTilgungPct', label: 'Anschlusstilgung', section: 'finanzierung', valueType: 'nullable-number', unit: '%' },
  { path: '/finanzierung/sondertilgungProJahr', label: 'Sondertilgung', section: 'finanzierung', valueType: 'number', unit: 'EUR/Jahr' },
  { path: '/finanzierung/disagioPct', label: 'Disagio', section: 'finanzierung', valueType: 'number', unit: '%' },
  { path: '/miete/rentMode', label: 'Miet-Modus', section: 'miete', valueType: 'enum' },
  { path: '/miete/kaltmieteProMonat', label: 'Nettokaltmiete pro Monat', section: 'miete', valueType: 'number', unit: 'EUR/Monat' },
  { path: '/miete/kaltmieteProJahr', label: 'Nettokaltmiete pro Jahr', section: 'miete', valueType: 'number', unit: 'EUR/Jahr' },
  { path: '/miete/kaltmieteProSqm', label: 'Nettokaltmiete pro Quadratmeter', section: 'miete', valueType: 'number', unit: 'EUR/m2/Monat' },
  { path: '/miete/leerstandPct', label: 'Leerstand / Mietausfall', section: 'miete', valueType: 'number', unit: '%' },
  { path: '/miete/mietspiegel/untererSpannwertProSqm', label: 'Mietspiegel Untergrenze', section: 'miete', valueType: 'number', unit: 'EUR/m2/Monat' },
  { path: '/miete/mietspiegel/mittelwertProSqm', label: 'Mietspiegel Mittelwert', section: 'miete', valueType: 'number', unit: 'EUR/m2/Monat' },
  { path: '/miete/mietspiegel/obererSpannwertProSqm', label: 'Mietspiegel Obergrenze', section: 'miete', valueType: 'number', unit: 'EUR/m2/Monat' },
  { path: '/miete/steigerungen', label: 'Mietsteigerungsregeln', section: 'miete', valueType: 'array' },
  { path: '/kosten/kostenErfassungMode', label: 'Kosten-Erfassungsmodus', section: 'kosten', valueType: 'enum' },
  { path: '/kosten/umlagefaehigeKostenProJahr', label: 'Umlagefaehige Kosten', section: 'kosten', valueType: 'number', unit: 'EUR/Jahr' },
  { path: '/kosten/nichtUmlagefaehigeKostenProJahr', label: 'Nicht umlagefaehige Kosten', section: 'kosten', valueType: 'number', unit: 'EUR/Jahr' },
  { path: '/kosten/wegRuecklageProJahr', label: 'Zufuehrung WEG-Erhaltungsruecklage', section: 'kosten', valueType: 'number', unit: 'EUR/Jahr' },
  { path: '/kosten/ruecklagenVerwendungPct', label: 'Erwartete Ruecklagenverwendung je Zufuehrung', section: 'kosten', valueType: 'number', unit: '%' },
  { path: '/kosten/ruecklagenVerzoegerungJahre', label: 'Verzoegerung bis zur Ruecklagenverwendung', section: 'kosten', valueType: 'number', unit: 'Jahre' },
  { path: '/kosten/maintenanceMode', label: 'Instandhaltungs-Modus', section: 'kosten', valueType: 'enum' },
  { path: '/kosten/instandhaltungProSqm', label: 'Instandhaltung pro Quadratmeter', section: 'kosten', valueType: 'number', unit: 'EUR/m2/Jahr' },
  { path: '/kosten/instandhaltungPctRent', label: 'Instandhaltung als Mietanteil', section: 'kosten', valueType: 'number', unit: '%' },
  { path: '/kosten/instandhaltungAbsolut', label: 'Instandhaltung absolut', section: 'kosten', valueType: 'number', unit: 'EUR/Jahr' },
  { path: '/kosten/ruecklagenAnteilPct', label: 'Ruecklagen- und Reserveanteil', section: 'kosten', valueType: 'number', unit: '%' },
  { path: '/kosten/ruecklagenRestwertPct', label: 'Ruecklagen-Preiswirkung beim Exit', section: 'kosten', valueType: 'number', unit: '%' },
  { path: '/kosten/verwaltungProJahr', label: 'Verwaltungskosten', section: 'kosten', valueType: 'number', unit: 'EUR/Jahr' },
  { path: '/kosten/sonstigeKostenProJahr', label: 'Sonstige laufende Kosten', section: 'kosten', valueType: 'number', unit: 'EUR/Jahr' },
  { path: '/kosten/kostensteigerungPctPa', label: 'Kostensteigerung', section: 'kosten', valueType: 'number', unit: '%/Jahr' },
  { path: '/steuer/taxMode', label: 'Steuer-Modus', section: 'steuer', valueType: 'enum' },
  { path: '/steuer/bruttoJahresEinkommen', label: 'Zu versteuerndes Jahreseinkommen', section: 'steuer', valueType: 'number', unit: 'EUR/Jahr' },
  { path: '/steuer/grenzsteuersatzPct', label: 'Grenzsteuersatz', section: 'steuer', valueType: 'number', unit: '%' },
  { path: '/steuer/veranlagung', label: 'Veranlagung', section: 'steuer', valueType: 'enum' },
  { path: '/steuer/soli', label: 'Solidaritaetszuschlag', section: 'steuer', valueType: 'boolean' },
  { path: '/steuer/kirchensteuerPct', label: 'Kirchensteuer', section: 'steuer', valueType: 'number', unit: '%' },
  { path: '/afa/modus', label: 'AfA-Verfahren', section: 'afa', valueType: 'enum' },
  { path: '/afa/linearSatzPct', label: 'Linearer AfA-Satz', section: 'afa', valueType: 'number', unit: '%' },
  { path: '/sanierungen', label: 'Sanierungen und Modernisierungen', section: 'sanierungen', valueType: 'array' },
  { path: '/wertentwicklung/szenario', label: 'Wertentwicklungsregeln', section: 'wertentwicklung', valueType: 'array' },
  { path: '/exit/haltedauerJahre', label: 'Haltedauer', section: 'exit', valueType: 'number', unit: 'Jahre' },
  { path: '/exit/verkaufsnebenkostenMode', label: 'Verkaufsnebenkosten-Modus', section: 'exit', valueType: 'enum' },
  { path: '/exit/verkaufsnebenkostenPct', label: 'Verkaufsnebenkosten', section: 'exit', valueType: 'number', unit: '%' },
  { path: '/exit/verkaufsnebenkostenAbsolut', label: 'Verkaufsnebenkosten absolut', section: 'exit', valueType: 'number', unit: 'EUR' },
  { path: '/exit/vorfaelligkeitPct', label: 'Vorfaelligkeitsentschaedigung', section: 'exit', valueType: 'number', unit: '%' },
] as const satisfies readonly AgentFieldDefinition[];

const FIELD_DEFINITION_BY_PATH = new Map<string, AgentFieldDefinition>(
  AGENT_FIELD_DEFINITIONS.map((field) => [field.path, field]),
);

export function getAgentFieldDefinition(path: string): AgentFieldDefinition | undefined {
  return FIELD_DEFINITION_BY_PATH.get(path);
}

export function isAgentFieldPath(path: string): boolean {
  return FIELD_DEFINITION_BY_PATH.has(path);
}

export function requiredAgentFieldPaths(scenario: Scenario): string[] {
  return [
    '/objekt/kaufpreis',
    '/objekt/wohnflaeche',
    '/objekt/fertigstellungsjahr',
    '/objekt/objektTyp',
    '/objekt/bundesland',
    '/objekt/bodenwertMode',
    ...(scenario.objekt.bodenwertMode === 'percent'
      ? ['/objekt/bodenwertAnteilPct']
      : [
          '/objekt/bodenrichtwertProSqm',
          '/objekt/grundstuecksflaeche',
          '/objekt/miteigentumsanteilZaehler',
          '/objekt/miteigentumsanteilNenner',
        ]),
    '/finanzierung/equityMode',
    scenario.finanzierung.equityMode === 'percent'
      ? '/finanzierung/equityPct'
      : '/finanzierung/equityAbsolute',
    '/finanzierung/sollzinsPct',
    '/finanzierung/tilgungPct',
    '/finanzierung/zinsbindungJahre',
    '/finanzierung/anschlusszinsPct',
    '/miete/rentMode',
    scenario.miete.rentMode === 'perYear'
      ? '/miete/kaltmieteProJahr'
      : scenario.miete.rentMode === 'perSqm'
        ? '/miete/kaltmieteProSqm'
        : '/miete/kaltmieteProMonat',
    '/kosten/kostenErfassungMode',
    ...((scenario.kosten.kostenErfassungMode ?? 'detailliert') === 'wirtschaftsplan'
      ? [
          '/kosten/umlagefaehigeKostenProJahr',
          '/kosten/nichtUmlagefaehigeKostenProJahr',
          '/kosten/wegRuecklageProJahr',
        ]
      : [
          '/kosten/maintenanceMode',
          scenario.kosten.maintenanceMode === 'percentRent'
            ? '/kosten/instandhaltungPctRent'
            : scenario.kosten.maintenanceMode === 'absolute'
              ? '/kosten/instandhaltungAbsolut'
              : '/kosten/instandhaltungProSqm',
        ]),
    '/steuer/taxMode',
    scenario.steuer.taxMode === 'marginalRate'
      ? '/steuer/grenzsteuersatzPct'
      : '/steuer/bruttoJahresEinkommen',
    ...(scenario.steuer.taxMode === 'income' ? ['/steuer/veranlagung'] : []),
    '/exit/haltedauerJahre',
    '/exit/verkaufsnebenkostenMode',
    scenario.exit.verkaufsnebenkostenMode === 'absolute'
      ? '/exit/verkaufsnebenkostenAbsolut'
      : '/exit/verkaufsnebenkostenPct',
  ];
}

export interface AgentCompleteness {
  tracked: number;
  confirmed: number;
  missing: number;
  uncertain: number;
  conflicts: number;
  requiredOpen: number;
  provisional: boolean;
}

export function getAgentCompleteness(review: AgentReview | undefined): AgentCompleteness {
  const fields = review ? Object.values(review.fields) : [];
  const count = (status: AgentFieldReview['status']) => fields.filter((field) => field.status === status).length;
  const requiredOpen = fields.filter((field) =>
    field.required && field.status !== 'confirmed' && field.status !== 'not_applicable'
  ).length;

  return {
    tracked: fields.length,
    confirmed: count('confirmed'),
    missing: count('missing'),
    uncertain: count('uncertain'),
    conflicts: count('conflict'),
    requiredOpen,
    provisional: requiredOpen > 0 || count('conflict') > 0,
  };
}

export function isOpenAgentField(field: AgentFieldReview): boolean {
  return field.status === 'missing' || field.status === 'uncertain' || field.status === 'conflict';
}

export function confirmAgentField(scenario: Scenario, path: string, reviewedAt = new Date().toISOString()): void {
  const review = scenario.agentReview;
  const field = review?.fields[path];
  if (!review || !field || !isOpenAgentField(field)) return;

  field.status = 'confirmed';
  field.origin = 'user';
  field.reviewedAt = reviewedAt;
  review.updatedAt = reviewedAt;
}

/** Haelt bedingte Pflichtfelder nach einem Moduswechsel konsistent. */
export function reconcileAgentReview(scenario: Scenario, updatedAt = new Date().toISOString()): void {
  const review = scenario.agentReview;
  if (!review) return;

  const required = new Set(requiredAgentFieldPaths(scenario));
  let changed = false;

  for (const [path, field] of Object.entries(review.fields)) {
    const isRequired = required.has(path);
    if (field.required !== isRequired) {
      field.required = isRequired;
      changed = true;
    }
    if (!isRequired && field.status === 'missing') {
      field.status = 'not_applicable';
      field.reason = 'Durch die aktuelle Modusauswahl nicht erforderlich.';
      changed = true;
    } else if (isRequired && field.status === 'not_applicable') {
      field.status = 'missing';
      field.reason = 'Durch die aktuelle Modusauswahl jetzt erforderlich; bitte eingeben und prüfen.';
      changed = true;
    }
  }

  for (const path of required) {
    if (review.fields[path]) continue;
    review.fields[path] = {
      status: 'missing',
      origin: 'assumption',
      required: true,
      reason: 'Durch die aktuelle Modusauswahl jetzt erforderlich; aktuell wird der App-Standard als Annahme verwendet.',
      evidence: [],
    };
    changed = true;
  }

  if (changed) review.updatedAt = updatedAt;
}

export function getAgentCapabilities() {
  return {
    name: 'Immo-Checker Agent API',
    version: AGENT_API_VERSION,
    transport: 'browser-tab',
    draftFormat: AGENT_DRAFT_FORMAT,
    snapshotFormat: AGENT_SNAPSHOT_FORMAT,
    tools: [
      { name: 'listScenarios', mode: 'read' },
      { name: 'getScenario', mode: 'read-with-analysis' },
      { name: 'stageDraft', mode: 'stage-only' },
    ],
    fields: AGENT_FIELD_DEFINITIONS,
  };
}
