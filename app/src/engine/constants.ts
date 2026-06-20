// Konfigurierbare Default-Werte / Stammdaten. Bewusst als Tabellen, damit jaehrliche
// Aktualisierungen trivial sind (keine harten Werte in der Berechnungslogik).
import type { Bundesland } from './types';

/** Grunderwerbsteuer in % je Bundesland (Stand 2026, in der UI editierbar). */
export const GREST_BY_BUNDESLAND: Record<Bundesland, number> = {
  BW: 5.0,
  BY: 3.5,
  BE: 6.0,
  BB: 6.5,
  HB: 5.5,
  HH: 5.5,
  HE: 6.0,
  MV: 6.0,
  NI: 5.0,
  NW: 6.5,
  RP: 5.0,
  SL: 6.5,
  SN: 5.5,
  ST: 5.0,
  SH: 6.5,
  TH: 5.0,
};

export const BUNDESLAND_LABELS: Record<Bundesland, string> = {
  BW: 'Baden-Wuerttemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thueringen',
};

/**
 * Linearer Gebaeude-AfA-Satz nach Fertigstellungsjahr (Wohnimmobilie):
 * 3,0 % ab 2023, 2,5 % vor 1925, sonst 2,0 %.
 */
export function linearAfaRateForYear(fertigstellungsjahr: number): number {
  if (fertigstellungsjahr >= 2023) return 3.0;
  if (fertigstellungsjahr < 1925) return 2.5;
  return 2.0;
}
