import { Scenario } from './types';
import { runProjection } from './projection';
import { calculateExit } from './exit';
import { computeIRR } from './metrics';

export interface HoldingYearAnalysis {
  jahr: number;
  immobilienwert: number;
  restschuld: number;
  verkaufsnebenkosten: number;
  vorfaelligkeit: number;
  nettoVerkaufserloes: number; // vor Spekulationssteuer
  spekulationsGewinn: number;
  spekulationssteuer: number;
  spekulationssteuerPflichtig: boolean; // true wenn Verkauf innerhalb der 10-Jahres-Frist
  nettoVerkaufserloesNachSteuer: number;
  kumulierterCashflowNachSteuer: number; // Summe Cashflow n. St. Jahr 1..t (kann negativ sein)
  kumulierterEkNachschuss: number; // Summe negativer Cashflows als zusaetzlich aufgebrachtes EK
  ekGesamteinsatz: number; // initiales EK + kumulierter EK-Nachschuss
  gesamtgewinn: number; // kumCf + nettoVerkaufserloesNachSteuer - eingesetztes Eigenkapital
  ekRenditeGesamtPct: number; // Gesamtgewinn / Eigenkapital in % (insgesamt ueber Haltedauer)
  ekRenditeGesamteinsatzPct: number; // Gesamtgewinn / (initiales EK + negative Cashflows) in %
  ekMultiple: number; // (Eigenkapital + Gesamtgewinn) / Eigenkapital
  irrPct: number; // annualisierte Eigenkapitalrendite (interner Zinsfuss)
  cagrPct: number; // annualisiert auf Basis des Gesamt-Multiples (Fallback/Vergleich zur IRR)
}

export interface HoldingAnalysis {
  initialEquity: number;
  years: HoldingYearAnalysis[];
  breakEvenJahr: number | null; // erstes Jahr mit Gesamtgewinn >= 0
  besteExitJahrNachIrr: number | null; // Exit-Jahr mit der hoechsten IRR
  steuerfreiAbJahr: number; // ab diesem Jahr (10) entfaellt die Spekulationssteuer
}

/**
 * Berechnet fuer JEDES moegliche Verkaufsjahr t = 1..N den realisierten Gesamtgewinn
 * und die Eigenkapital-Profitabilitaet (p. a. via IRR/CAGR sowie insgesamt als Multiple),
 * inklusive des bis dahin aufgelaufenen (ggf. negativen) Cashflows und der Spekulationssteuer.
 *
 * Wiederverwendet Story 6 (calculateExit) und den IRR-Solver (computeIRR), damit der
 * Eintrag fuer das gewaehlte Haltejahr exakt mit der Einzel-Exit-Berechnung uebereinstimmt.
 */
export function analyzeHoldingPeriods(scenario: Scenario): HoldingAnalysis {
  const N = Math.max(1, scenario.exit.haltedauerJahre);
  const initialEquity = runProjection(scenario, N).initialEquity;

  const years: HoldingYearAnalysis[] = [];
  let breakEvenJahr: number | null = null;
  let besteExitJahrNachIrr: number | null = null;
  let bestIrr = -Infinity;

  for (let t = 1; t <= N; t++) {
    // Szenario mit Exit in Jahr t; Projektionsjahre 1..t sind identisch zur Gesamtprojektion.
    const scenarioT: Scenario = {
      ...scenario,
      exit: { ...scenario.exit, haltedauerJahre: t },
    };
    const projT = runProjection(scenarioT, t);
    const exitT = calculateExit(scenarioT, projT);

    const kumCf = projT.years[t - 1].kumulierterCashflowNachSteuer;

    // Eigenkapital-Cashflows fuer die IRR: -EK in t0, Jahres-Cashflows, Verkaufserloes in t.
    const cashflows: number[] = [-initialEquity];
    for (let i = 1; i <= t; i++) {
      const cf = projT.years[i - 1].cashflowNachSteuer;
      cashflows.push(i === t ? cf + exitT.nettoVerkaufserloesNachSteuer : cf);
    }
    const irrPct = computeIRR(cashflows);

    const gesamtgewinn = kumCf + exitT.nettoVerkaufserloesNachSteuer - initialEquity;
    const finalValue = initialEquity + gesamtgewinn; // = kumCf + nettoVerkaufserloesNachSteuer
    const kumulierterEkNachschuss = projT.years
      .slice(0, t)
      .reduce((sum, y) => sum + Math.max(0, -y.cashflowNachSteuer), 0);
    const ekGesamteinsatz = initialEquity + kumulierterEkNachschuss;
    const ekRenditeGesamtPct = initialEquity > 0 ? (gesamtgewinn / initialEquity) * 100 : 0;
    const ekRenditeGesamteinsatzPct = ekGesamteinsatz > 0 ? (gesamtgewinn / ekGesamteinsatz) * 100 : 0;
    const ekMultiple = initialEquity > 0 ? finalValue / initialEquity : 0;
    const cagrPct =
      initialEquity > 0 && finalValue > 0
        ? (Math.pow(finalValue / initialEquity, 1 / t) - 1) * 100
        : -100;

    if (breakEvenJahr === null && gesamtgewinn >= 0) breakEvenJahr = t;
    if (irrPct > bestIrr) {
      bestIrr = irrPct;
      besteExitJahrNachIrr = t;
    }

    years.push({
      jahr: t,
      immobilienwert: projT.years[t - 1].immobilienwert,
      restschuld: exitT.restschuld,
      verkaufsnebenkosten: exitT.verkaufsnebenkosten,
      vorfaelligkeit: exitT.vorfaelligkeitsEntschaedigung,
      nettoVerkaufserloes: exitT.nettoVerkaufserloes,
      spekulationsGewinn: exitT.spekulationsGewinn,
      spekulationssteuer: exitT.spekulationssteuer,
      spekulationssteuerPflichtig: t < 10,
      nettoVerkaufserloesNachSteuer: exitT.nettoVerkaufserloesNachSteuer,
      kumulierterCashflowNachSteuer: kumCf,
      kumulierterEkNachschuss,
      ekGesamteinsatz,
      gesamtgewinn,
      ekRenditeGesamtPct,
      ekRenditeGesamteinsatzPct,
      ekMultiple,
      irrPct,
      cagrPct,
    });
  }

  return {
    initialEquity,
    years,
    breakEvenJahr,
    besteExitJahrNachIrr,
    steuerfreiAbJahr: 10,
  };
}
