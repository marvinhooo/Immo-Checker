import { Scenario } from './types';
import { totalInvest, cashInvestment, loanAmount } from './derive';
import { buildAmortizationSchedule, AmortizationInput } from './financing';
import { projectRent, projectCosts } from './rent';
import { projectEndOfYearSeries } from './timeline';
import { projectAfa } from './afa';
import { calculateTaxEffect } from './tax';
import { projectRenovations } from './renovation';

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
  umlagefaehigeKosten: number;
  leerstandsbedingteUmlagekosten: number;
  nichtUmlagefaehigeKosten: number;
  bewirtschaftungskosten: number; // Eigentuemer-Cashout inkl. Ruecklage und ggf. Leerstandsanteil
  ruecklagenZufuehrung: number; // Cash-out, aber nicht sofort abziehbar
  ruecklagenEntnahme: number; // erwartete Verwendung aus der WEG-Ruecklage; kein erneuter Cash-out
  ruecklagenWerbungskosten: number; // erwarteter nachgelagerter Werbungskostenabzug
  
  // Finanzierung (Jahreswerte)
  zins: number;
  tilgung: number;
  sondertilgung: number;
  annuitaet: number; // zins + tilgung (ohne Sondertilgung)
  
  // AfA
  objektAfa: number;
  sanierungsAfa: number;
  afa: number; // Gesamt-AfA aus Objekt und geplanten Sanierungen

  // Geplante Sanierungen
  sanierungsauszahlung: number;
  sanierungsWerbungskosten: number;
  
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
  kumulierteRuecklage: number; // Zufuehrungen abzueglich modellierter WEG-Verwendungen
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
  const costProjection = projectCosts(
    scenario.kosten,
    scenario.objekt.wohnflaeche,
    bruttoRents,
    safeYears,
    scenario.miete.leerstandPct,
  );

  // 4. AfA-Projektion berechnen
  const afaProjection = projectAfa(scenario, safeYears);

  // 5. Geplante Sanierungen berechnen (Auszahlungen, Werbungskosten und Zusatz-AfA)
  const renovationProjection = projectRenovations(scenario, safeYears);

  // 6. Immobilienwert-Entwicklung berechnen (Bestandsgröße: Wert am Ende von Jahr 1..safeYears)
  const endOfYearValues = projectEndOfYearSeries(
    scenario.objekt.kaufpreis,
    scenario.wertentwicklung.szenario,
    safeYears
  );

  const years: ProjectionYear[] = [];
  let runningCashflowNachSteuer = 0;
  let runningSteuerersparnis = 0;
  let runningSondertilgung = 0;
  // Beim Kauf uebernommener WEG-Ruecklagenbestand als Startwert der laufenden Ruecklage.
  // Wirkt nur auf den ausgewiesenen kumulierten Bestand; ein Exit-Restwert entsteht daraus
  // erst bei ruecklagenRestwertPct > 0 (Default 0 -> keine stillschweigende Ergebnisaenderung).
  let runningRuecklage = Math.max(0, scenario.kosten.ruecklagenBestandBeiKauf ?? 0);

  for (let t = 1; t <= safeYears; t++) {
    const idx = t - 1;

    // Miete & Kosten
    const bruttoKaltmiete = rentProjection[idx]?.bruttoKaltmiete || 0;
    const nettoKaltmiete = rentProjection[idx]?.nettoKaltmiete || 0;
    const mietausfall = rentProjection[idx]?.mietausfall || 0;

    const instandhaltung = costProjection[idx]?.instandhaltung || 0;
    const verwaltung = costProjection[idx]?.verwaltung || 0;
    const sonstigeKosten = costProjection[idx]?.sonstigeKosten || 0;
    const umlagefaehigeKosten = costProjection[idx]?.umlagefaehigeKosten || 0;
    const leerstandsbedingteUmlagekosten = costProjection[idx]?.leerstandsbedingteUmlagekosten || 0;
    const nichtUmlagefaehigeKosten = costProjection[idx]?.nichtUmlagefaehigeKosten || 0;
    const bewirtschaftungskosten = costProjection[idx]?.summeKosten || 0;

    // Amortization (Zins & Tilgung)
    const zins = amortization.years[idx]?.zinsen || 0;
    const tilgung = amortization.years[idx]?.tilgung || 0;
    const sondertilgung = amortization.years[idx]?.sondertilgung || 0;
    const annuitaet = amortization.years[idx]?.annuitaet || 0;

    // AfA & geplante Sanierungen
    const objektAfa = afaProjection[idx]?.afaAmount || 0;
    const sanierungsAfa = renovationProjection[idx]?.afa || 0;
    const afa = objektAfa + sanierungsAfa;
    const sanierungsauszahlung = renovationProjection[idx]?.auszahlung || 0;
    const sanierungsWerbungskosten = renovationProjection[idx]?.werbungskosten || 0;

    // V&V Ergebnis & Steuereffekt
    // Ruecklagenzufuehrungen (z. B. WEG-Erhaltungsruecklage) sind Cash-out, aber erst bei
    // Verausgabung als Werbungskosten abziehbar - sie mindern das V&V-Ergebnis nicht.
    const ruecklagenZufuehrung = costProjection[idx]?.wegRuecklage || 0;
    const wirtschaftsplanMode = scenario.kosten.kostenErfassungMode === 'wirtschaftsplan';
    const ruecklagenVerwendungPct = Math.min(100, Math.max(0, scenario.kosten.ruecklagenVerwendungPct ?? 50));
    const ruecklagenVerzoegerungJahre = Math.max(1, Math.trunc(scenario.kosten.ruecklagenVerzoegerungJahre ?? 5));
    const sourceIndex = idx - ruecklagenVerzoegerungJahre;
    const ruecklagenEntnahme = wirtschaftsplanMode && sourceIndex >= 0
      ? (costProjection[sourceIndex]?.wegRuecklage || 0) * (ruecklagenVerwendungPct / 100)
      : 0;
    const ruecklagenWerbungskosten = ruecklagenEntnahme;
    const abziehbareBewirtschaftungskosten = costProjection[idx]?.sofortAbziehbareKosten || 0;
    const vvErgebnis = nettoKaltmiete
      - zins
      - afa
      - abziehbareBewirtschaftungskosten
      - ruecklagenWerbungskosten
      - sanierungsWerbungskosten;
    const steuereffekt = calculateTaxEffect(scenario, vvErgebnis);

    // Cashflow vor & nach Steuer
    // Tilgung und Sondertilgung sowie Zins und Bewirtschaftungskosten reduzieren die Liquidität
    const cashflowVorSteuer = nettoKaltmiete
      - zins
      - tilgung
      - sondertilgung
      - bewirtschaftungskosten
      - sanierungsauszahlung;
    const cashflowNachSteuer = cashflowVorSteuer - steuereffekt;

    const cashflowVorSteuerMonatlich = cashflowVorSteuer / 12;
    const cashflowNachSteuerMonatlich = cashflowNachSteuer / 12;

    // Vermögenswerte am Jahresende
    const immobilienwert = endOfYearValues[idx] !== undefined ? endOfYearValues[idx] : scenario.objekt.kaufpreis;
    const restschuld = amortization.years[idx]?.endbestand !== undefined ? amortization.years[idx].endbestand : 0;
    const eigenkapital = immobilienwert - restschuld;

    // LTV (Loan-to-Value)
    const ltv = immobilienwert > 0 ? (restschuld / immobilienwert) * 100 : 0;

    // DSCR (Debt Service Coverage Ratio)
    // Kapitaldienst = Zins + Tilgung; Zaehler bankueblich nach Bewirtschaftungskosten
    const debtService = zins + tilgung;
    const dscr = debtService > 0 ? (nettoKaltmiete - bewirtschaftungskosten) / debtService : 0;

    // Akkumulatoren aktualisieren
    runningCashflowNachSteuer += cashflowNachSteuer;
    // Steuerersparnis ist der positive Teil eines negativen Steuereffekts
    const steuerersparnis = steuereffekt < 0 ? -steuereffekt : 0;
    runningSteuerersparnis += steuerersparnis;
    runningSondertilgung += sondertilgung;
    runningRuecklage = Math.max(0, runningRuecklage + ruecklagenZufuehrung - ruecklagenEntnahme);

    years.push({
      jahr: t,
      bruttoKaltmiete,
      nettoKaltmiete,
      mietausfall,
      instandhaltung,
      verwaltung,
      sonstigeKosten,
      umlagefaehigeKosten,
      leerstandsbedingteUmlagekosten,
      nichtUmlagefaehigeKosten,
      bewirtschaftungskosten,
      ruecklagenZufuehrung,
      ruecklagenEntnahme,
      ruecklagenWerbungskosten,
      zins,
      tilgung,
      sondertilgung,
      annuitaet,
      objektAfa,
      sanierungsAfa,
      afa,
      sanierungsauszahlung,
      sanierungsWerbungskosten,
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
      kumulierteRuecklage: runningRuecklage,
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
