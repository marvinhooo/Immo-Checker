// Zentral abgeleitete Werte (Kaufnebenkosten, Eigenkapital, Darlehen, Gesamtinvestition).
// Reine Funktionen ohne Seiteneffekte - von Store UND Tests genutzt.
import type { Scenario } from './types';

export interface CashInvestmentBreakdown {
  enteredEquity: number;
  unfinancedKnkCash: number;
  additionalCashForUnfinancedKnk: number;
  equityAvailableAfterKnk: number;
  totalCashInvestment: number;
}

/** Kaufnebenkosten in EUR (GrESt + Notar/Grundbuch + Makler) auf Basis des Kaufpreises. */
export function knkAmount(s: Scenario): number {
  const { grestPct, notarPct, maklerPct } = s.knk;
  return (s.objekt.kaufpreis * (grestPct + notarPct + maklerPct)) / 100;
}

/** Gesamtinvestition = Kaufpreis + Kaufnebenkosten + Sanierungskosten (Denkmal-Topf). */
export function totalInvest(s: Scenario): number {
  return s.objekt.kaufpreis + knkAmount(s) + s.objekt.sanierungskosten;
}

/** Eingesetztes Eigenkapital in EUR (aus % der Gesamtinvestition oder absolut). */
export function equityAmount(s: Scenario): number {
  const base = totalInvest(s);
  if (s.finanzierung.equityMode === 'absolute') {
    return Math.min(Math.max(0, s.finanzierung.equityAbsolute), base);
  }
  return (base * s.finanzierung.equityPct) / 100;
}

/** Aufteilung des baren Anfangseinsatzes fuer Finanzierung, Renditen und UI-Erklaerung. */
export function cashInvestmentBreakdown(s: Scenario): CashInvestmentBreakdown {
  const enteredEquity = equityAmount(s);
  const unfinancedKnkCash = s.knk.mitfinanzieren ? 0 : knkAmount(s);
  const additionalCashForUnfinancedKnk = Math.max(0, unfinancedKnkCash - enteredEquity);

  return {
    enteredEquity,
    unfinancedKnkCash,
    additionalCashForUnfinancedKnk,
    equityAvailableAfterKnk: Math.max(0, enteredEquity - unfinancedKnkCash),
    totalCashInvestment: enteredEquity + additionalCashForUnfinancedKnk,
  };
}

/** Zusaetzliche Barzahlung, wenn nicht mitfinanzierte KNK hoeher als das eingetragene Eigenkapital sind. */
export function unfinancedKnkCashGap(s: Scenario): number {
  return cashInvestmentBreakdown(s).additionalCashForUnfinancedKnk;
}

/** Tatsaechlicher initialer Cash-Einsatz des Investors fuer Rendite- und ETF-Vergleiche. */
export function cashInvestment(s: Scenario): number {
  return cashInvestmentBreakdown(s).totalCashInvestment;
}

/**
 * Darlehensbetrag in EUR.
 * Wenn Kaufnebenkosten nicht mitfinanziert werden, deckt Eigenkapital zuerst diese Bar-Kosten.
 * Ein Disagio erhoeht den nominalen Darlehensbetrag, weil nur der Netto-Auszahlungsbetrag
 * zur Finanzierung der Investition verfuegbar ist.
 */
export function loanAmount(s: Scenario): number {
  const knk = knkAmount(s);
  const equity = equityAmount(s);
  const financedBase = s.objekt.kaufpreis + s.objekt.sanierungskosten;
  const netFinancingNeed = s.knk.mitfinanzieren
    ? totalInvest(s) - equity
    : financedBase - Math.max(0, equity - knk);

  const netLoan = Math.max(0, netFinancingNeed);
  const disagioPct = Math.min(Math.max(0, s.finanzierung.disagioPct), 99.999);

  return disagioPct > 0 ? netLoan / (1 - disagioPct / 100) : netLoan;
}

/** Jahres-Kaltmiete (brutto, vor Leerstand) in EUR aus dem gewaehlten Mietmodus. */
export function annualBaseRent(s: Scenario): number {
  if (s.miete.rentMode === 'perSqm') {
    return s.miete.kaltmieteProSqm * s.objekt.wohnflaeche * 12;
  }
  return s.miete.kaltmieteProMonat * 12;
}
