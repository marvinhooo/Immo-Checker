import { Scenario, RentMode } from './types';
import { runProjection, ProjectionResult } from './projection';
import { knkAmount, annualBaseRent } from './derive';
import { calculateExit } from './exit';

export type Rating = 'green' | 'yellow' | 'red';

export interface ScenarioMetrics {
  bruttomietrendite: number;
  nettomietrendite: number;
  kaufpreisfaktor: number;
  cocYear1: number;
  cocAverage: number;
  roeYear1: number;
  roeAverage: number;
  irr: number;
  /**
   * Break-even-BASISMIETE in der aktuell gewaehlten Eingabeeinheit (siehe breakEvenRentMode),
   * also der Eingabewert VOR Anwendung der Mietsteigerungsregeln.
   */
  breakEvenRent: number;
  /** Einheit, in der breakEvenRent ausgewiesen wird (= scenario.miete.rentMode). */
  breakEvenRentMode: RentMode;
  /** Tatsaechliche Brutto-Jahreskaltmiete in Jahr 1 bei Break-even-Basismiete (nach Mietregeln). */
  breakEvenRentJahr1Brutto: number;
  /** Tatsaechliche Brutto-Monatskaltmiete in Jahr 1 bei Break-even-Basismiete. */
  breakEvenRentJahr1ProMonat: number;
  /** Tatsaechliche EUR/m2/Monat in Jahr 1; null wenn keine Wohnflaeche hinterlegt ist. */
  breakEvenRentJahr1ProSqm: number | null;
  /**
   * Break-even-Sollzins in Prozent.
   * null bedeutet "nicht ermittelbar": entweder gibt es kein Darlehen (nicht anwendbar)
   * oder der Cashflow ist bereits bei 0 % negativ bzw. auch bei 100 % noch positiv.
   */
  breakEvenInterestRate: number | null;
  /** Ampel nur auf Basis der IRR gegen die Zielrendite. */
  irrRating: Rating;
  /** Ampel nur auf Basis der jaehrlichen Cashflows nach Steuern in der Haltedauer. */
  liquidityRating: Rating;
  /** Gesamturteil: gruen nur wenn IRR UND Liquiditaet gruen, rot sobald eines rot ist. */
  rating: Rating;
}

/**
 * Berechnet den internen Zinsfuß (IRR) einer Reihe von Zahlungsströmen.
 *
 * @param cashflows Array von jährlichen Zahlungen (t=0 ist negativ, t > 0 sind Zu- oder Abflüsse)
 */
export function computeIRR(cashflows: number[]): number {
  if (cashflows.length < 2) return 0;

  let positive = 0;
  let negative = 0;
  for (const cf of cashflows) {
    if (cf > 0) positive++;
    if (cf < 0) negative++;
  }

  // Falls keine Vorzeichenwechsel vorliegen, ist der IRR nicht sinnvoll berechenbar.
  if (positive === 0) return -100; // Totalverlust
  if (negative === 0) return 100;  // Unendliche Rendite (kein Investment)

  const npv = (r: number) => {
    let sum = 0;
    for (let t = 0; t < cashflows.length; t++) {
      sum += cashflows[t] / Math.pow(1 + r, t);
    }
    return sum;
  };

  let low = -0.999;
  let high = 5.0; // 500% Rendite

  // Erweitere Grenzen, falls notwendig
  let fLow = npv(low);
  let fHigh = npv(high);
  let iterations = 0;

  while (fLow * fHigh > 0 && iterations < 20) {
    if (Math.abs(fLow) < Math.abs(fHigh)) {
      low -= 0.5;
      fLow = npv(low);
    } else {
      high *= 2.0;
      fHigh = npv(high);
    }
    iterations++;
  }

  // Scan-Fallback bei gleicher Polarität
  if (fLow * fHigh > 0) {
    let bracketFound = false;
    let lastR = -0.95;
    let lastVal = npv(lastR);
    for (let r = -0.99; r <= 5.0; r += 0.01) {
      const val = npv(r);
      if (lastVal * val < 0) {
        low = lastR;
        high = r;
        fLow = lastVal;
        bracketFound = true;
        break;
      }
      lastR = r;
      lastVal = val;
    }
    if (!bracketFound) {
      return 0;
    }
  }

  // Bisektionsverfahren zur Nullstellensuche
  const tolerance = 1e-7;
  const maxIterations = 100;
  let r = 0;

  for (let i = 0; i < maxIterations; i++) {
    r = (low + high) / 2;
    const val = npv(r);

    if (Math.abs(val) < tolerance) {
      break;
    }

    if (val * fLow < 0) {
      high = r;
    } else {
      low = r;
      fLow = val;
    }

    if (high - low < tolerance) {
      break;
    }
  }

  return r * 100; // In Prozent
}

/**
 * Erzeugt eine Kopie des Szenarios, in der die BASISMIETE (Eingabewert vor Mietsteigerungs-
 * regeln) auf `rentVal` in der aktuell gewaehlten Einheit gesetzt ist. Alle drei Repraesentationen
 * werden konsistent mitgefuehrt, damit die Projektion unabhaengig vom rentMode korrekt rechnet.
 */
function withBaseRent(scenario: Scenario, rentVal: number): Scenario {
  const monthlyRent = scenario.miete.rentMode === 'perSqm'
    ? rentVal * scenario.objekt.wohnflaeche
    : scenario.miete.rentMode === 'perYear'
      ? rentVal / 12
      : rentVal;
  const yearlyRent = scenario.miete.rentMode === 'perYear' ? rentVal : monthlyRent * 12;

  return {
    ...scenario,
    miete: {
      ...scenario.miete,
      kaltmieteProMonat: monthlyRent,
      kaltmieteProJahr: yearlyRent,
      kaltmieteProSqm: scenario.objekt.wohnflaeche > 0 ? monthlyRent / scenario.objekt.wohnflaeche : 0,
    },
  };
}

/**
 * Findet die Kaltmiete in der aktuell gewaehlten Einheit, bei der der Netto-Cashflow nach Steuern
 * im ersten Jahr genau 0 EUR betraegt.
 *
 * ACHTUNG: Rueckgabewert ist die BASISMIETE vor Anwendung der Mietsteigerungsregeln.
 * Die tatsaechlich in Jahr 1 anfallende Miete kann davon abweichen (z. B. Stufe ab Jahr 1);
 * calculateMetrics weist diese Groessen zusaetzlich als breakEvenRentJahr1* aus.
 */
export function findBreakEvenRent(scenario: Scenario): number {
  const getCashflowForRent = (rentVal: number) =>
    runProjection(withBaseRent(scenario, rentVal), 1).years[0].cashflowNachSteuer;

  let low = 0;
  let high = 100000;

  let fLow = getCashflowForRent(low);
  let fHigh = getCashflowForRent(high);

  if (Math.abs(fLow) < 0.01) return low;

  let expansions = 0;
  while (fLow * fHigh > 0 && fLow < 0 && fHigh < 0 && expansions < 30) {
    high *= 2;
    fHigh = getCashflowForRent(high);
    expansions++;
  }

  if (Math.abs(fHigh) < 0.01) return high;

  if (fLow * fHigh > 0) {
    return 0;
  }

  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const fMid = getCashflowForRent(mid);
    if (Math.abs(fMid) < 0.01) {
      return mid;
    }
    if (fMid * fLow < 0) {
      high = mid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

/**
 * Findet den Sollzins, bei dem der Netto-Cashflow nach Steuern im ersten Jahr genau 0 EUR beträgt.
 *
 * Rueckgabe:
 * - `null` = nicht ermittelbar. Drei Faelle: kein Darlehen (nicht anwendbar), Cashflow bereits
 *   bei 0 % negativ (nicht erreichbar), Cashflow auch bei 100 % noch positiv (ausserhalb des
 *   Suchbereichs).
 * - `0` = der Cashflow ist exakt bei 0 % Sollzins gleich null.
 * - sonst der Sollzins in Prozent zwischen 0 und 100.
 */
export function findBreakEvenInterestRate(scenario: Scenario): number | null {
  if (runProjection(scenario, 1).loanAmount <= 0) {
    // Ohne Darlehen existiert kein Break-even-Zins.
    return null;
  }

  const getCashflowForInterest = (zinsVal: number) => {
    const testScenario = {
      ...scenario,
      finanzierung: {
        ...scenario.finanzierung,
        sollzinsPct: zinsVal,
      }
    };
    const proj = runProjection(testScenario, 1);
    return proj.years[0].cashflowNachSteuer;
  };

  let low = 0;
  let high = 100;

  let fLow = getCashflowForInterest(low);

  // Exakt break-even schon ohne Zins.
  if (Math.abs(fLow) < 0.01) return 0;
  // Schon bei 0 % Sollzins negativ: ein Break-even-Zins existiert nicht.
  if (fLow < 0) return null;

  const fHigh = getCashflowForInterest(high);
  if (Math.abs(fHigh) < 0.01) return high;
  // Auch bei 100 % Sollzins noch positiv: ausserhalb des Suchbereichs.
  if (fHigh > 0) return null;

  for (let i = 0; i < 50; i++) {
    const mid = (low + high) / 2;
    const fMid = getCashflowForInterest(mid);
    if (Math.abs(fMid) < 0.01) {
      return mid;
    }
    if (fMid * fLow < 0) {
      high = mid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

/**
 * Berechnet alle relevanten Renditekennzahlen und Ampel-Ratings.
 *
 * @param scenario Das aktive Szenario
 * @param projection Bereits berechnete Projektion
 * @param targetReturn Optionale Alternativrendite-Schwelle (Standard: 4.0 %)
 */
export function calculateMetrics(
  scenario: Scenario,
  projection?: ProjectionResult,
  targetReturn: number = 4.0
): ScenarioMetrics {
  const h = Math.max(1, scenario.exit.haltedauerJahre);
  const proj = projection || runProjection(scenario, h);
  const exitRes = calculateExit(scenario, proj);

  const kaufpreis = scenario.objekt.kaufpreis;
  const knk = knkAmount(scenario);
  const initialEquity = proj.initialEquity;

  const firstYear = proj.years[0];

  // 1. Mietrenditen
  const jahreskaltmiete = annualBaseRent(scenario);
  const bruttomietrendite = kaufpreis > 0 ? (jahreskaltmiete / kaufpreis) * 100 : 0;

  // Die Projektion kennt fuer beide Erfassungsmodi bereits den vollstaendigen
  // Eigentuemer-Cashout. Im Wirtschaftsplanmodus umfasst er insbesondere auch
  // die WEG-Zufuehrung und umlagefaehige Kosten, die wegen Leerstands ausfallen.
  const bewirtschaftungskostenYear1 = firstYear?.bewirtschaftungskosten ?? 0;
  const nettoKaltmieteYear1 = firstYear?.nettoKaltmiete ?? jahreskaltmiete;

  const nettomietrendite = (kaufpreis + knk) > 0
    ? ((nettoKaltmieteYear1 - bewirtschaftungskostenYear1) / (kaufpreis + knk)) * 100
    : 0;

  const kaufpreisfaktor = jahreskaltmiete > 0 ? kaufpreis / jahreskaltmiete : 0;

  // 2. Cash-on-Cash (CoC) Rendite
  const cocYear1 = initialEquity > 0 && firstYear
    ? (firstYear.cashflowNachSteuer / initialEquity) * 100
    : 0;

  const averageCashflow = proj.years.reduce((sum, y) => sum + y.cashflowNachSteuer, 0) / h;
  const cocAverage = initialEquity > 0 ? (averageCashflow / initialEquity) * 100 : 0;

  // 3. Return on Equity (ROE)
  const tilgungYear1 = firstYear ? firstYear.tilgung + firstYear.sondertilgung : 0;
  const roeYear1 = initialEquity > 0 && firstYear
    ? ((firstYear.cashflowNachSteuer + tilgungYear1) / initialEquity) * 100
    : 0;

  const averageTilgung = proj.years.reduce((sum, y) => sum + y.tilgung + y.sondertilgung, 0) / h;
  const roeAverage = initialEquity > 0
    ? ((averageCashflow + averageTilgung) / initialEquity) * 100
    : 0;

  // 4. Interner Zinsfuß (IRR) der Eigenkapital-Cashflows
  // CF0 = -initialEquity
  // CFt = cashflowNachSteuer (t = 1..h-1)
  // CFh = cashflowNachSteuer(h) + nettoVerkaufserloesNachSteuer
  const cashflows: number[] = [-initialEquity];
  for (let t = 1; t <= h; t++) {
    const yr = proj.years[t - 1];
    const cf = yr ? yr.cashflowNachSteuer : 0;
    if (t === h) {
      cashflows.push(cf + exitRes.nettoVerkaufserloesNachSteuer);
    } else {
      cashflows.push(cf);
    }
  }

  const irr = computeIRR(cashflows);

  // 5. Break-even-Analysen
  const breakEvenRent = findBreakEvenRent(scenario);
  const breakEvenInterestRate = findBreakEvenInterestRate(scenario);

  // Der Break-even-Wert ist die BASISMIETE. Was daraus in Jahr 1 nach den Mietsteigerungs-
  // regeln tatsaechlich wird, kann deutlich abweichen und wird hier separat ausgewiesen.
  const breakEvenYear1 = runProjection(withBaseRent(scenario, breakEvenRent), 1).years[0];
  const breakEvenRentJahr1Brutto = breakEvenYear1?.bruttoKaltmiete ?? 0;
  const breakEvenRentJahr1ProMonat = breakEvenRentJahr1Brutto / 12;
  const breakEvenRentJahr1ProSqm = scenario.objekt.wohnflaeche > 0
    ? breakEvenRentJahr1ProMonat / scenario.objekt.wohnflaeche
    : null;

  // 6. Ratings (Ampeln)
  // 6a. Rendite-Ampel: nur die IRR gegen die Zielrendite.
  let irrRating: Rating = 'yellow';
  if (irr >= targetReturn) {
    irrRating = 'green';
  } else if (irr < 0) {
    irrRating = 'red';
  }

  // 6b. Liquiditaets-Ampel: die jaehrlichen Cashflows nach Steuern in der Haltedauer.
  const yearlyCashflows = proj.years.map(y => y.cashflowNachSteuer);
  const alleCfNegativ = yearlyCashflows.length > 0 && yearlyCashflows.every(cf => cf < 0);
  const alleCfNichtNegativ = yearlyCashflows.every(cf => cf >= 0);
  const liquidityRating: Rating = alleCfNegativ
    ? 'red'
    : alleCfNichtNegativ
      ? 'green'
      : 'yellow';

  // 6c. Gesamturteil: eine gute IRR rechtfertigt keine dauerhaft negative Liquiditaet.
  const rating: Rating = irrRating === 'red' || liquidityRating === 'red'
    ? 'red'
    : irrRating === 'green' && liquidityRating === 'green'
      ? 'green'
      : 'yellow';

  return {
    bruttomietrendite,
    nettomietrendite,
    kaufpreisfaktor,
    cocYear1,
    cocAverage,
    roeYear1,
    roeAverage,
    irr,
    breakEvenRent,
    breakEvenRentMode: scenario.miete.rentMode,
    breakEvenRentJahr1Brutto,
    breakEvenRentJahr1ProMonat,
    breakEvenRentJahr1ProSqm,
    breakEvenInterestRate,
    irrRating,
    liquidityRating,
    rating,
  };
}
