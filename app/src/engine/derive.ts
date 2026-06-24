// Zentral abgeleitete Werte (Kaufnebenkosten, Eigenkapital, Darlehen, Gesamtinvestition).
// Reine Funktionen ohne Seiteneffekte - von Store UND Tests genutzt.
import type { Scenario } from './types';

export interface CashInvestmentBreakdown {
  enteredEquity: number;
  financedKnk: number;
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

/** Effektiver Bodenwert in EUR aus Prozent oder Bodenrichtwert pro m2. */
export function landValueAmount(s: Scenario): number {
  if (s.objekt.bodenwertMode === 'perSqm') {
    return Math.min(
      s.objekt.kaufpreis,
      Math.max(0, s.objekt.bodenrichtwertProSqm * s.objekt.wohnflaeche)
    );
  }
  return (s.objekt.kaufpreis * Math.min(100, Math.max(0, s.objekt.bodenwertAnteilPct))) / 100;
}

/** Effektiver Bodenwertanteil am Kaufpreis in %. */
export function effectiveBodenwertAnteilPct(s: Scenario): number {
  if (s.objekt.kaufpreis <= 0) return 0;
  return (landValueAmount(s) / s.objekt.kaufpreis) * 100;
}

/** Gesamtinvestition = Kaufpreis + Kaufnebenkosten + Sanierungskosten (Denkmal-Topf). */
export function totalInvest(s: Scenario): number {
  return s.objekt.kaufpreis + knkAmount(s) + s.objekt.sanierungskosten;
}

/** Finanzierungsbasis fuer Kaufpreis und Sanierungskosten, ohne Kaufnebenkosten. */
export function purchaseFinancingBase(s: Scenario): number {
  return s.objekt.kaufpreis + s.objekt.sanierungskosten;
}

/** Eigenkapital fuer Kaufpreis/Sanierung in EUR (aus % der Finanzierungsbasis oder absolut). */
export function equityAmount(s: Scenario): number {
  const base = purchaseFinancingBase(s);
  if (s.finanzierung.equityMode === 'absolute') {
    return Math.min(Math.max(0, s.finanzierung.equityAbsolute), base);
  }
  return (base * s.finanzierung.equityPct) / 100;
}

/** Fremdfinanzierter Anteil der Kaufnebenkosten in EUR. */
export function financedKnkAmount(s: Scenario): number {
  if (!s.knk.mitfinanzieren) return 0;
  const pct = Math.min(100, Math.max(0, s.knk.finanzierungsPct));
  return (knkAmount(s) * pct) / 100;
}

/** Aufteilung des baren Anfangseinsatzes fuer Finanzierung, Renditen und UI-Erklaerung. */
export function cashInvestmentBreakdown(s: Scenario): CashInvestmentBreakdown {
  const enteredEquity = equityAmount(s);
  const financedKnk = financedKnkAmount(s);
  const unfinancedKnkCash = Math.max(0, knkAmount(s) - financedKnk);

  return {
    enteredEquity,
    financedKnk,
    unfinancedKnkCash,
    additionalCashForUnfinancedKnk: 0,
    equityAvailableAfterKnk: enteredEquity,
    totalCashInvestment: enteredEquity + unfinancedKnkCash,
  };
}

/** Zusaetzliche Barzahlung fuer nicht fremdfinanzierte KNK. */
export function unfinancedKnkCashGap(s: Scenario): number {
  return cashInvestmentBreakdown(s).unfinancedKnkCash;
}

/** Tatsaechlicher initialer Cash-Einsatz des Investors fuer Rendite- und ETF-Vergleiche. */
export function cashInvestment(s: Scenario): number {
  return cashInvestmentBreakdown(s).totalCashInvestment;
}

/**
 * Darlehensbetrag in EUR.
 * Eigenkapital reduziert Kaufpreis/Sanierung. KNK werden separat bar getragen oder anteilig fremdfinanziert.
 * Ein Disagio erhoeht den nominalen Darlehensbetrag, weil nur der Netto-Auszahlungsbetrag
 * zur Finanzierung der Investition verfuegbar ist.
 */
export function loanAmount(s: Scenario): number {
  const equity = equityAmount(s);
  const netFinancingNeed = purchaseFinancingBase(s) - equity + financedKnkAmount(s);

  const netLoan = Math.max(0, netFinancingNeed);
  const disagioPct = Math.min(Math.max(0, s.finanzierung.disagioPct), 99.999);

  return disagioPct > 0 ? netLoan / (1 - disagioPct / 100) : netLoan;
}

/** Jahres-Kaltmiete (brutto, vor Leerstand) in EUR aus dem gewaehlten Mietmodus. */
export function annualBaseRent(s: Scenario): number {
  switch (s.miete.rentMode) {
    case 'perSqm':
      return s.miete.kaltmieteProSqm * s.objekt.wohnflaeche * 12;
    case 'perYear':
      return s.miete.kaltmieteProJahr;
    case 'perMonth':
    default:
      return s.miete.kaltmieteProMonat * 12;
  }
}
