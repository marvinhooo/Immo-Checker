// Zentrales Eingabe-Datenmodell des Immobilien-Investment-Checkers.
// Reine Typdefinitionen - keine Logik, keine UI. Wird von Engine, Store und UI geteilt.

export const SCHEMA_VERSION = 3;

export type Bundesland =
  | 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV'
  | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH';

export type ObjektTyp = 'bestand' | 'neubau' | 'denkmal';

/** AfA-Verfahren: linear (nach Baujahr), degressiv 5 %, Sonder-AfA §7b, Denkmal-AfA §7i. */
export type AfaModus = 'linear' | 'degressiv' | 'sonder7b' | 'denkmal7i';

export type BodenwertMode = 'percent' | 'perSqm';
export type VerkaufsnebenkostenMode = 'percent' | 'absolute';
export type EquityMode = 'percent' | 'absolute';
export type RentMode = 'perMonth' | 'perYear' | 'perSqm';
export type MaintenanceMode = 'perSqm' | 'percentRent' | 'absolute';
export type KostenErfassungMode = 'detailliert' | 'wirtschaftsplan';
export type TaxMode = 'income' | 'marginalRate';
export type Veranlagung = 'single' | 'splitting';
export type SanierungSteuerart =
  | 'sofort'
  | 'verteilt'
  | 'herstellung'
  | 'denkmal7i'
  | 'denkmal11b'
  | 'keine';

export interface Sanierungsmassnahme {
  id: string;
  bezeichnung: string;
  jahr: number; // Projektionsjahr 1..40
  betrag: number; // EUR
  steuerart: SanierungSteuerart;
  verteilungsJahre: number; // 2..5; relevant fuer 'verteilt' und 'denkmal11b'
  mieterhoehungMoeglich: boolean; // reiner Hinweis, keine automatische Mietsteigerung
}

/**
 * Eine Regel fuer flexible Zeitreihen (Miet- bzw. Wertsteigerung):
 * - 'step': einmalige Stufe von +percent % ab Jahr fromYear. Optional wirksamAbMonat (1-12,
 *   Default 1): Die Stufe greift erst ab diesem Monat, das Jahr fromYear wird anteilig
 *   gerechnet (z. B. Mieterhoehung nach §558b BGB fruehestens ab Beginn des 3. Monats).
 * - 'rate': laufende Rate percentPerYear % p. a. ab Jahr fromYear (gilt bis zur naechsten 'rate'-Regel).
 * Beispiel "nach 3 J. +10 %, nach 15 J. +25 %, sonst 1,5 % p. a." = eine 'rate' ab Jahr 1
 * plus zwei 'step'-Regeln ab Jahr 3 und Jahr 15.
 */
export type IncreaseRule =
  | { id: string; kind: 'step'; fromYear: number; percent: number; wirksamAbMonat?: number }
  | { id: string; kind: 'rate'; fromYear: number; percentPerYear: number };

export interface ObjektInput {
  kaufpreis: number; // EUR
  wohnflaeche: number; // m2
  fertigstellungsjahr: number; // Baujahr / Fertigstellung (steuert lineare AfA)
  bundesland: Bundesland;
  objektTyp: ObjektTyp;
  bodenwertMode: BodenwertMode; // Prozent direkt oder Bodenrichtwert EUR/m2
  bodenwertAnteilPct: number; // % des Kaufpreises auf Grund und Boden (NICHT abschreibbar)
  bodenrichtwertProSqm: number; // EUR/m2, bezogen auf die anteilige Grundstuecksflaeche
  grundstuecksflaeche: number; // m2 Gesamtgrundstueck laut Grundbuch/Teilungserklaerung; 0 = unbekannt -> vorlaeufiger 30-%-Fallback
  miteigentumsanteilZaehler: number; // MEA laut Teilungserklaerung, z. B. 57 (bei 57/1000); 0 = unbekannt
  miteigentumsanteilNenner: number; // MEA-Nenner, z. B. 1000; 0 = unbekannt, 1/1 = bestaetigtes Alleineigentum
  sanierungskosten: number; // EUR, Denkmal-/Modernisierungs-Topf (§7i)
}

export interface KaufnebenkostenInput {
  grestPct: number; // Grunderwerbsteuer %
  notarPct: number; // Notar + Grundbuch %
  maklerPct: number; // Maklerprovision (Kaeuferanteil) %
  mitfinanzieren: boolean; // Kaufnebenkosten anteilig ins Darlehen aufnehmen? (Default: nein)
  finanzierungsPct: number; // Anteil der KNK, der fremdfinanziert wird, wenn mitfinanzieren = true
}

export interface FinanzierungInput {
  equityMode: EquityMode;
  equityPct: number; // genutzt wenn equityMode = 'percent' (% von Kaufpreis + Sanierungskosten)
  equityAbsolute: number; // genutzt wenn equityMode = 'absolute' (EUR fuer Kaufpreis + Sanierungskosten)
  sollzinsPct: number; // p. a.
  tilgungPct: number; // anfaengliche Tilgung p. a.
  zinsbindungJahre: number;
  anschlusszinsPct: number; // Sollzins nach Ablauf der Zinsbindung
  anschlussTilgungPct: number | null; // Tilgung nach Zinsbindung (null = wie anfaengliche Tilgung)
  sondertilgungProJahr: number; // EUR p. a.
  disagioPct: number; // optional, 0 = kein Disagio
}

export interface MietspiegelInput {
  untererSpannwertProSqm: number; // EUR/m2/Monat
  mittelwertProSqm: number; // EUR/m2/Monat
  obererSpannwertProSqm: number; // EUR/m2/Monat
}

export interface MieteInput {
  rentMode: RentMode;
  kaltmieteProMonat: number; // EUR/Monat (rentMode = 'perMonth')
  kaltmieteProJahr: number; // EUR/Jahr (rentMode = 'perYear')
  kaltmieteProSqm: number; // EUR/m2/Monat (rentMode = 'perSqm')
  leerstandPct: number; // Mietausfallwagnis / Leerstand %
  mietspiegel: MietspiegelInput; // Vergleichswerte des fuer das Objekt geltenden Mietspiegels
  steigerungen: IncreaseRule[]; // flexible Mietsteigerung
}

export interface KostenInput {
  kostenErfassungMode: KostenErfassungMode; // detaillierte Schaetzung oder direkte Summen aus dem WEG-Wirtschaftsplan
  umlagefaehigeKostenProJahr?: number; // EUR/Jahr laut Wirtschaftsplan; bei Leerstand anteilig Eigentuemer-Cashout
  nichtUmlagefaehigeKostenProJahr?: number; // EUR/Jahr laut Wirtschaftsplan; im vereinfachten Modell laufend sofort abziehbar
  wegRuecklageProJahr?: number; // EUR/Jahr Zufuehrung zur WEG-Erhaltungsruecklage
  ruecklagenVerwendungPct?: number; // erwarteter Anteil jeder WEG-Zufuehrung, der nach der Verzoegerung verwendet wird
  ruecklagenVerzoegerungJahre?: number; // durchschnittliche Jahre zwischen Zufuehrung und steuerlich modellierter Verwendung
  ruecklagenBestandBeiKauf?: number; // beim Kauf uebernommener Bestand der WEG-Erhaltungsruecklage (EUR); Startwert der laufenden Ruecklage
  sevProJahr?: number; // Sondereigentumsverwaltung (EUR/Jahr); nicht umlagefaehig, sofort abziehbar, in beiden Erfassungsmodi aktiv
  maintenanceMode: MaintenanceMode;
  instandhaltungProSqm: number; // EUR/m2/Jahr (maintenanceMode = 'perSqm')
  instandhaltungPctRent: number; // % der Jahreskaltmiete (maintenanceMode = 'percentRent')
  instandhaltungAbsolut: number; // EUR/Jahr (maintenanceMode = 'absolute')
  ruecklagenAnteilPct: number; // % der Instandhaltung, der WEG-Ruecklagenzufuehrung + kalkulatorische Reserve ist (Cash-out, aber nicht sofort als Werbungskosten abziehbar)
  ruecklagenRestwertPct?: number; // % des kumulierten Bestands als geschaetzte Marktpreiswirkung beim Exit (Default: 0; kein separates Guthaben)
  verwaltungProJahr: number; // nicht-umlagefaehig, EUR/Jahr
  sonstigeKostenProJahr: number; // nicht-umlagefaehig, EUR/Jahr
  kostensteigerungPctPa: number; // % p. a. auf laufende Kosten
}

export interface SteuerInput {
  taxMode: TaxMode;
  bruttoJahresEinkommen: number; // zu versteuerndes Einkommen (taxMode = 'income')
  grenzsteuersatzPct: number; // fester Grenzsteuersatz (taxMode = 'marginalRate')
  veranlagung: Veranlagung;
  soli: boolean; // Solidaritaetszuschlag beruecksichtigen
  kirchensteuerPct: number; // 0 / 8 / 9
}

export interface AfaInput {
  modus: AfaModus;
  linearSatzPct: number; // abgeleitet aus Baujahr, editierbar
}

export interface WertentwicklungInput {
  szenario: IncreaseRule[]; // flexible Wertsteigerung (Stufen + laufende Raten)
}

export interface ExitInput {
  haltedauerJahre: number;
  verkaufsnebenkostenMode: VerkaufsnebenkostenMode; // % vom Verkaufspreis oder EUR-Pauschale
  verkaufsnebenkostenPct: number; // % vom Verkaufspreis (Makler etc.)
  verkaufsnebenkostenAbsolut: number; // EUR-Pauschale (verkaufsnebenkostenMode = 'absolute')
  vorfaelligkeitPct: number; // % auf Restschuld bei Verkauf vor Zinsbindungsende
}

export type AgentSourceKind = 'pdf' | 'web' | 'api' | 'text' | 'manual';
export type AgentFieldOrigin = 'extracted' | 'inferred' | 'assumption' | 'derived' | 'user';
export type AgentFieldStatus = 'missing' | 'uncertain' | 'confirmed' | 'not_applicable' | 'conflict';

export interface AgentSource {
  id: string;
  kind: AgentSourceKind;
  label: string;
  url?: string;
  sha256?: string;
  retrievedAt?: string;
}

export interface AgentEvidence {
  sourceId: string;
  page?: number;
  locator?: string;
  excerpt?: string;
}

export interface AgentFieldReview {
  status: AgentFieldStatus;
  origin: AgentFieldOrigin;
  required: boolean;
  confidence?: number;
  reason?: string;
  evidence: AgentEvidence[];
  reviewedAt?: string;
}

/**
 * Review-Metadaten eines Agenten-Entwurfs. Werte und Review-Status bleiben getrennt:
 * Ein plausibler Default kann rechnerisch genutzt werden und trotzdem als fehlend markiert sein.
 */
export interface AgentReview {
  version: 1;
  updatedAt: string;
  sources: AgentSource[];
  fields: Record<string, AgentFieldReview>;
  warnings?: string[];
}

export interface Scenario {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  notizen: string;
  sanierungen: Sanierungsmassnahme[];
  objekt: ObjektInput;
  knk: KaufnebenkostenInput;
  finanzierung: FinanzierungInput;
  miete: MieteInput;
  kosten: KostenInput;
  steuer: SteuerInput;
  afa: AfaInput;
  wertentwicklung: WertentwicklungInput;
  exit: ExitInput;
  agentReview?: AgentReview;
}
