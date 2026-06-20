import { Scenario } from './types';
import { totalInvest, cashInvestment, loanAmount } from './derive';
import { buildAmortizationSchedule, AmortizationInput } from './financing';
import { projectRent, projectCosts } from './rent';
import { projectSeries } from './timeline';
import { projectAfa } from './afa';
import { calculateTaxEffect } from './tax';

export interface ProjectionYear {
  jahr: number;
  
  // Miete
  bruttoKaltmiete: number;
  nettoKaltmiete: number;
  mietausfall: number;
  
  // Kosten
  instandhaltung: number;
  verwaltung: number;
  sonstigeKosten: number;
  bewirtschaftungskosten: number; // Summe der nicht-umlagefähigen Kosten
  
  // Finanzierung (Jahreswerte)
  zins: number;
  tilgung: number;
  sondertilgung: number;
  annuitaet: number; // zins + tilgung (ohne Sondertilgung)
  
  // AfA
  afa: number;
  
  // Steuer
  vvErgebnis: number;
  steuereffekt: number; // negativ = Steuerersparnis (Inflow), positiv = Steuerzahlung (Outflow)
  
  // Cashflow
  cashflowVorSteuer: number;
  cashflowNachSteuer: number;
  cashflowVorSteuerMonatlich: number;
  cashflowNachSteuerMonatlich: number;
  
  // Vermögen & Kennzahlen (Jahresendwerte)
  immobilienwert: number;
  restschuld: number;
  eigenkapital: number; // Nettovermögen = immobilienwert - restschuld
  ltv: number; // Loan-to-Value in %
  dscr: number; // Debt Service Coverage Ratio
  
  // Kumulierte Werte
  kumulierterCashflowNachSteuer: number;
  kumulierteSteuerersparnis: number;
  kumulierteSondertilgung: number;
  kumuliertesEigenkapital: number; // Eingesetztes Eigenkapital (initial + kumulierte Sondertilgung)
}

export interface ProjectionResult {
  years: ProjectionYear[];
  initialEquity: number;
  totalInvestment: number;
  loanAmount: number;
}

/**
 * Führt die Berechnungen von Tilgungsplan, Miete, Kosten, AfA und Steuer zusammen,
 * um eine Jahr-für-Jahr-Projektion über die Haltedauer zu erstellen.
 *
 * @param scenario Das aktive Szenario
 * @param projectionYears Optionale Anzahl der Projektionsjahre (Standard: exit.haltedauerJahre)
 */
export function runProjection(scenario: Scenario, projectionYears?: number): ProjectionResult {
  const yearsToProject = projectionYears !== undefined ? projectionYears : scenario.exit.haltedauerJahre;
  const safeYears = Math.max(1, yearsToProject);

  const initEquity = cashInvestment(scenario);
  const initLoan = loanAmount(scenario);
  const initInvest = totalInvest(scenario);

  // 1. Tilgungsplan berechnen
  const amortizationInput: AmortizationInput = {
    loanAmount: initLoan,
    sollzinsPct: scenario.finanzierung.sollzinsPct,
    tilgungPct: scenario.finanzierung.tilgungPct,
    zinsbindungJahre: scenario.finanzierung.zinsbindungJahre,
    anschlusszinsPct: scenario.finanzierung.anschlusszinsPct,
    anschlussTilgungPct: scenario.finanzierung.anschlussTilgungPct,
    sondertilgungProJahr: scenario.finanzierung.sondertilgungProJahr,
    haltedauerJahre: safeYears,
  };
  const amortization = buildAmortizationSchedule(amortizationInput);

  // 2. Mietprojektion berechnen
  const rentProjection = projectRent(scenario.miete, scenario.objekt.wohnflaeche, safeYears);
  const bruttoRents = rentProjection.map(r => r.bruttoKaltmiete);

  // 3. Kostenprojektion berechnen
  const costProjection = projectCosts(scenario.kosten, scenario.objekt.wohnflaeche, bruttoRents, safeYears);

  // 4. AfA-Projektion berechnen
  const afaProjection = projectAfa(scenario, safeYears);

  // 5. Immobilienwert-Entwicklung berechnen (Länge safeYears + 1 für Endwerte)
  const valueSeries = projectSeries(scenario.objekt.kaufpreis, scenario.wertentwicklung.szenario, safeYears + 1);

  const years: ProjectionYear[] = [];
  let runningCashflowNachSteuer = 0;
  let runningSteuerersparnis = 0;
  let runningSondertilgung = 0;

  for (let t = 1; t <= safeYears; t++) {
    const idx = t - 1;

    // Miete & Kosten
    const bruttoKaltmiete = rentProjection[idx]?.bruttoKaltmiete || 0;
    const nettoKaltmiete = rentProjection[idx]?.nettoKaltmiete || 0;
    const mietausfall = rentProjection[idx]?.mietausfall || 0;

    const instandhaltung = costProjection[idx]?.instandhaltung || 0;
    const verwaltung = costProjection[idx]?.verwaltung || 0;
    const sonstigeKosten = costProjection[idx]?.sonstigeKosten || 0;
    const bewirtschaftungskosten = costProjection[idx]?.summeKosten || 0;

    // Amortization (Zins & Tilgung)
    const zins = amortization.years[idx]?.zinsen || 0;
    const tilgung = amortization.years[idx]?.tilgung || 0;
    const sondertilgung = amortization.years[idx]?.sondertilgung || 0;
    const annuitaet = amortization.years[idx]?.annuitaet || 0;

    // AfA
    const afa = afaProjection[idx]?.afaAmount || 0;

    // V&V Ergebnis & Steuereffekt
    const vvErgebnis = nettoKaltmiete - zins - afa - bewirtschaftungskosten;
    const steuereffekt = calculateTaxEffect(scenario, vvErgebnis);

    // Cashflow vor & nach Steuer
    // Tilgung und Sondertilgung sowie Zins und Bewirtschaftungskosten reduzieren die Liquidität
    const cashflowVorSteuer = nettoKaltmiete - zins - tilgung - sondertilgung - bewirtschaftungskosten;
    const cashflowNachSteuer = cashflowVorSteuer - steuereffekt;

    const cashflowVorSteuerMonatlich = cashflowVorSteuer / 12;
    const cashflowNachSteuerMonatlich = cashflowNachSteuer / 12;

    // Vermögenswerte am Jahresende
    const immobilienwert = valueSeries[t] !== undefined ? valueSeries[t] : scenario.objekt.kaufpreis;
    const restschuld = amortization.years[idx]?.endbestand !== undefined ? amortization.years[idx].endbestand : 0;
    const eigenkapital = immobilienwert - restschuld;

    // LTV (Loan-to-Value)
    const ltv = immobilienwert > 0 ? (restschuld / immobilienwert) * 100 : 0;

    // DSCR (Debt Service Coverage Ratio)
    // Kapitaldienst = Zins + Tilgung
    const debtService = zins + tilgung;
    const dscr = debtService > 0 ? nettoKaltmiete / debtService : 0;

    // Akkumulatoren aktualisieren
    runningCashflowNachSteuer += cashflowNachSteuer;
    // Steuerersparnis ist der positive Teil eines negativen Steuereffekts
    const steuerersparnis = steuereffekt < 0 ? -steuereffekt : 0;
    runningSteuerersparnis += steuerersparnis;
    runningSondertilgung += sondertilgung;

    years.push({
      jahr: t,
      bruttoKaltmiete,
      nettoKaltmiete,
      mietausfall,
      instandhaltung,
      verwaltung,
      sonstigeKosten,
      bewirtschaftungskosten,
      zins,
      tilgung,
      sondertilgung,
      annuitaet,
      afa,
      vvErgebnis,
      steuereffekt,
      cashflowVorSteuer,
      cashflowNachSteuer,
      cashflowVorSteuerMonatlich,
      cashflowNachSteuerMonatlich,
      immobilienwert,
      restschuld,
      eigenkapital,
      ltv,
      dscr,
      kumulierterCashflowNachSteuer: runningCashflowNachSteuer,
      kumulierteSteuerersparnis: runningSteuerersparnis,
      kumulierteSondertilgung: runningSondertilgung,
      kumuliertesEigenkapital: initEquity + runningSondertilgung,
    });
  }

  return {
    years,
    initialEquity: initEquity,
    totalInvestment: initInvest,
    loanAmount: initLoan,
  };
}
