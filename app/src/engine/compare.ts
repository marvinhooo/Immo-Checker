import { Scenario } from './types';
import { runProjection, ProjectionResult } from './projection';
import { calculateMetrics, ScenarioMetrics } from './metrics';
import { calculateExit } from './exit';

export interface EtfComparisonResult {
  totalInvested: number;      // Eigenkapital + Summe aller monatlichen Zuzahlungen (negativer Cashflow)
  immoEndvermoegen: number;   // Netto-Verkaufserlös nach Steuer + positive laufende Cashflows
  etfEndvermoegen: number;    // Endwert des ETF-Sparplans
  difference: number;         // Differenz: Immo - ETF
}

export interface SensitivityPoint {
  parameter: string;
  label: string;
  baseVal: number;
  lowVal: number;
  highVal: number;
  lowIrr: number;
  highIrr: number;
  baseIrr: number;
}

export interface EtfYearResult {
  jahr: number;
  immoVermoegen: number; // Netto-Verkaufserlös nach Steuer + kumulierter Cashflow, falls man in diesem Jahr verkauft
  etfVermoegen: number;  // ETF-Wert in diesem Jahr
}

/**
 * Führt eine Projektion und Kennzahlenberechnung mit variierten Parametern durch.
 * Nützlich für Live-Slider und Sensitivitätsanalysen.
 */
export function runSensitivity(
  scenario: Scenario,
  variations: {
    sollzinsPct?: number;
    leerstandPct?: number;
    wertsteigerungPct?: number;
    anschlusszinsPct?: number;
  }
): { metrics: ScenarioMetrics; projection: ProjectionResult } {
  const mutated = structuredClone(scenario);

  if (variations.sollzinsPct !== undefined) {
    mutated.finanzierung.sollzinsPct = variations.sollzinsPct;
  }
  if (variations.leerstandPct !== undefined) {
    mutated.miete.leerstandPct = variations.leerstandPct;
  }
  if (variations.anschlusszinsPct !== undefined) {
    mutated.finanzierung.anschlusszinsPct = variations.anschlusszinsPct;
  }
  if (variations.wertsteigerungPct !== undefined) {
    let updatedRate = false;
    mutated.wertentwicklung.szenario = mutated.wertentwicklung.szenario.map((rule) => {
      if (rule.kind === 'rate') {
        updatedRate = true;
        return { ...rule, percentPerYear: variations.wertsteigerungPct! };
      }
      return rule;
    });
    if (!updatedRate) {
      mutated.wertentwicklung.szenario = [
        {
          id: 'sensitivity-rate',
          kind: 'rate',
          fromYear: 1,
          percentPerYear: variations.wertsteigerungPct,
        },
        ...mutated.wertentwicklung.szenario,
      ];
    }
  }

  const proj = runProjection(mutated);
  const metrics = calculateMetrics(mutated, proj);
  return { metrics, projection: proj };
}

/**
 * Erstellt Datenpunkte für ein Tornado-Diagramm der IRR-Sensitivität.
 */
export function generateTornadoData(scenario: Scenario): SensitivityPoint[] {
  const baseProj = runProjection(scenario);
  const baseMetrics = calculateMetrics(scenario, baseProj);
  const baseIrr = baseMetrics.irr;

  const points: SensitivityPoint[] = [];

  // 1. Sollzins (±1%)
  const baseSollzins = scenario.finanzierung.sollzinsPct;
  const lowSollzins = Math.max(0, baseSollzins - 1);
  const highSollzins = baseSollzins + 1;
  const irrLowSollzins = runSensitivity(scenario, { sollzinsPct: lowSollzins }).metrics.irr;
  const irrHighSollzins = runSensitivity(scenario, { sollzinsPct: highSollzins }).metrics.irr;
  points.push({
    parameter: 'sollzinsPct',
    label: 'Sollzins (±1%)',
    baseVal: baseSollzins,
    lowVal: lowSollzins,
    highVal: highSollzins,
    lowIrr: irrLowSollzins,
    highIrr: irrHighSollzins,
    baseIrr,
  });

  // 2. Leerstand (±3%)
  const baseLeerstand = scenario.miete.leerstandPct;
  const lowLeerstand = Math.max(0, baseLeerstand - 3);
  const highLeerstand = baseLeerstand + 3;
  const irrLowLeerstand = runSensitivity(scenario, { leerstandPct: lowLeerstand }).metrics.irr;
  const irrHighLeerstand = runSensitivity(scenario, { leerstandPct: highLeerstand }).metrics.irr;
  points.push({
    parameter: 'leerstandPct',
    label: 'Leerstand (±3%)',
    baseVal: baseLeerstand,
    lowVal: lowLeerstand,
    highVal: highLeerstand,
    lowIrr: irrLowLeerstand,
    highIrr: irrHighLeerstand,
    baseIrr,
  });

  // 3. Wertsteigerung (±1% für alle 'rate'-Regeln)
  const firstRateRule = scenario.wertentwicklung.szenario.find((r) => r.kind === 'rate');
  const baseWert = firstRateRule ? firstRateRule.percentPerYear : 0;
  const lowWert = Math.max(0, baseWert - 1);
  const highWert = baseWert + 1;
  const irrLowWert = runSensitivity(scenario, { wertsteigerungPct: lowWert }).metrics.irr;
  const irrHighWert = runSensitivity(scenario, { wertsteigerungPct: highWert }).metrics.irr;
  points.push({
    parameter: 'wertsteigerungPct',
    label: 'Wertsteigerung (±1%)',
    baseVal: baseWert,
    lowVal: lowWert,
    highVal: highWert,
    lowIrr: irrLowWert,
    highIrr: irrHighWert,
    baseIrr,
  });

  // 4. Anschlusszins (±1%)
  const baseAnschluss = scenario.finanzierung.anschlusszinsPct;
  const lowAnschluss = Math.max(0, baseAnschluss - 1);
  const highAnschluss = baseAnschluss + 1;
  const irrLowAnschluss = runSensitivity(scenario, { anschlusszinsPct: lowAnschluss }).metrics.irr;
  const irrHighAnschluss = runSensitivity(scenario, { anschlusszinsPct: highAnschluss }).metrics.irr;
  points.push({
    parameter: 'anschlusszinsPct',
    label: 'Anschlusszins (±1%)',
    baseVal: baseAnschluss,
    lowVal: lowAnschluss,
    highVal: highAnschluss,
    lowIrr: irrLowAnschluss,
    highIrr: irrHighAnschluss,
    baseIrr,
  });

  return points;
}

/**
 * Vergleicht die Immobilie mit einer ETF-Alternativanlage unter Annahme desselben
 * Eigenkapitals und derselben monatlichen Sparraten (wenn der Immo-Cashflow negativ ist).
 */
export function calculateEtfComparison(
  scenario: Scenario,
  etfReturnPct: number,
  projection?: ProjectionResult
): EtfComparisonResult {
  const h = Math.max(1, scenario.exit.haltedauerJahre);
  const proj = projection || runProjection(scenario, h);
  const exitRes = calculateExit(scenario, proj);

  const initialEquity = proj.initialEquity;
  const totalMonths = h * 12;
  const etfMonthlyRate = etfReturnPct / 100 / 12;

  let etfValue = initialEquity;
  let totalInvested = initialEquity;
  let sumPositiveCashflow = 0;

  for (let m = 1; m <= totalMonths; m++) {
    const yearIdx = Math.floor((m - 1) / 12);
    const yrData = proj.years[yearIdx];
    
    // Monatlicher Cashflow der Immobilie
    const monthlyCf = yrData ? yrData.cashflowNachSteuer / 12 : 0;
    if (monthlyCf > 0) {
      sumPositiveCashflow += monthlyCf;
    }

    // Zuzahlung bei negativem Cashflow
    const monthlySaving = monthlyCf < 0 ? -monthlyCf : 0;
    totalInvested += monthlySaving;

    etfValue = etfValue * (1 + etfMonthlyRate) + monthlySaving;
  }

  const immoEndvermoegen = exitRes.nettoVerkaufserloesNachSteuer + sumPositiveCashflow;
  const etfEndvermoegen = etfValue;
  const difference = immoEndvermoegen - etfEndvermoegen;

  return {
    totalInvested,
    immoEndvermoegen,
    etfEndvermoegen,
    difference,
  };
}

/**
 * Berechnet die jährliche Wertentwicklung von Immobilie vs. ETF zur grafischen Darstellung.
 */
export function calculateEtfYearlyHistory(
  scenario: Scenario,
  etfReturnPct: number,
  projection?: ProjectionResult
): EtfYearResult[] {
  const h = Math.max(1, scenario.exit.haltedauerJahre);
  const proj = projection || runProjection(scenario, h);
  const initialEquity = proj.initialEquity;
  const etfMonthlyRate = etfReturnPct / 100 / 12;

  const history: EtfYearResult[] = [];
  let etfValue = initialEquity;

  for (let y = 1; y <= h; y++) {
    const yrData = proj.years[y - 1];

    // Simuliere 12 Monate für dieses Jahr
    for (let m = 1; m <= 12; m++) {
      const monthlyCf = yrData ? yrData.cashflowNachSteuer / 12 : 0;
      const monthlySaving = monthlyCf < 0 ? -monthlyCf : 0;
      etfValue = etfValue * (1 + etfMonthlyRate) + monthlySaving;
    }

    // Berechne Immobilien-Verkaufswert für dieses spezifische Jahr y
    const tempScenario = {
      ...scenario,
      exit: {
        ...scenario.exit,
        haltedauerJahre: y,
      },
    };
    const tempProj = runProjection(tempScenario, y);
    const tempExit = calculateExit(tempScenario, tempProj);
    
    const positiveCashflow = tempProj.years.reduce(
      (sum, yr) => sum + Math.max(0, yr.cashflowNachSteuer),
      0
    );
    const immoVermoegen = tempExit.nettoVerkaufserloesNachSteuer + positiveCashflow;

    history.push({
      jahr: y,
      immoVermoegen,
      etfVermoegen: etfValue,
    });
  }

  return history;
}
