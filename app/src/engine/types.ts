// Zentrales Eingabe-Datenmodell des Immobilien-Investment-Checkers.
// Reine Typdefinitionen - keine Logik, keine UI. Wird von Engine, Store und UI geteilt.

export const SCHEMA_VERSION = 1;

export type Bundesland =
  | 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV'
  | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH';

export type ObjektTyp = 'bestand' | 'neubau' | 'denkmal';

/** AfA-Verfahren: linear (nach Baujahr), degressiv 5 %, Sonder-AfA §7b, Denkmal-AfA §7i. */
export type AfaModus = 'linear' | 'degressiv' | 'sonder7b' | 'denkmal7i';

export type BodenwertMode = 'percent' | 'perSqm';
export type EquityMode = 'percent' | 'absolute';
export type RentMode = 'perMonth' | 'perYear' | 'perSqm';
export type MaintenanceMode = 'perSqm' | 'percentRent' | 'absolute';
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
  bodenrichtwertProSqm: number; // EUR/m2, wird ueber Wohnflaeche in % des Kaufpreises umgerechnet
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
  maintenanceMode: MaintenanceMode;
  instandhaltungProSqm: number; // EUR/m2/Jahr (maintenanceMode = 'perSqm')
  instandhaltungPctRent: number; // % der Jahreskaltmiete (maintenanceMode = 'percentRent')
  instandhaltungAbsolut: number; // EUR/Jahr (maintenanceMode = 'absolute')
  ruecklagenAnteilPct: number; // % der Instandhaltung, der Ruecklagenzufuehrung ist (Cash-out, aber nicht sofort als Werbungskosten abziehbar)
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
  verkaufsnebenkostenPct: number; // % vom Verkaufspreis (Makler etc.)
  vorfaelligkeitPct: number; // % auf Restschuld bei Verkauf vor Zinsbindungsende
}

export interface Scenario {
  schemaVersion: number;
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
}
