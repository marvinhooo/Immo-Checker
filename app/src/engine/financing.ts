
export interface AmortizationInput {
  loanAmount: number;
  sollzinsPct: number;
  tilgungPct: number;
  zinsbindungJahre: number;
  anschlusszinsPct: number;
  anschlussTilgungPct: number | null;
  sondertilgungProJahr: number;
  haltedauerJahre: number;
}

export interface AmortizationPeriod {
  jahr: number;
  anfangsbestand: number;
  zinsen: number;
  tilgung: number;
  sondertilgung: number;
  annuitaet: number; // Regular annuity = zinsen + tilgung (excluding sondertilgung)
  endbestand: number;
}

export interface AmortizationSchedule {
  years: AmortizationPeriod[];
  restschuldZinsbindungEnde: number;
  restschuldHaltedauerEnde: number;
  kumulierteZinsen: number;
  laufzeitMonate: number;
  laufzeitJahre: number;
}

/**
 * Calculates the monthly amortization schedule and aggregates it into yearly periods.
 * Handles Zinsbindung renewal, Sondertilgung, 100% equity, and 0% tilgung.
 */
export function buildAmortizationSchedule(input: AmortizationInput): AmortizationSchedule {
  const {
    loanAmount,
    sollzinsPct,
    tilgungPct,
    zinsbindungJahre,
    anschlusszinsPct,
    anschlussTilgungPct,
    sondertilgungProJahr,
    haltedauerJahre,
  } = input;

  const years: AmortizationPeriod[] = [];
  let restschuldZinsbindungEnde = 0;
  let restschuldHaltedauerEnde = 0;
  let kumulierteZinsen = 0;
  let laufzeitMonate = 0;

  // Handle edge case of no loan (100% equity)
  if (loanAmount <= 0) {
    // Generate dummy years up to haltedauerJahre to avoid empty charts or failures in projection
    for (let y = 1; y <= haltedauerJahre; y++) {
      years.push({
        jahr: y,
        anfangsbestand: 0,
        zinsen: 0,
        tilgung: 0,
        sondertilgung: 0,
        annuitaet: 0,
        endbestand: 0,
      });
    }
    return {
      years,
      restschuldZinsbindungEnde: 0,
      restschuldHaltedauerEnde: 0,
      kumulierteZinsen: 0,
      laufzeitMonate: 0,
      laufzeitJahre: 0,
    };
  }

  let currentDebt = loanAmount;
  let monthlyAnnuity = (loanAmount * (sollzinsPct + tilgungPct)) / 100 / 12;

  // Max simulation time: at least 100 years, but long enough to cover imported horizons.
  const maxMonths = Math.max(100 * 12, Math.ceil(haltedauerJahre) * 12);
  let currentMonth = 0;

  let currentYearAnfang = currentDebt;
  let currentYearZinsen = 0;
  let currentYearTilgung = 0;
  let currentYearSondertilgung = 0;

  while (currentDebt > 0.005 && currentMonth < maxMonths) {
    currentMonth++;
    const currentYear = Math.ceil(currentMonth / 12);
    const isWithinZinsbindung = currentYear <= zinsbindungJahre;
    const activeRatePct = isWithinZinsbindung ? sollzinsPct : anschlusszinsPct;

    // Recalculate annuity at the beginning of the post-zinsbindung period.
    // Keep at least the previous monthly payment so higher initial tilgung still shortens
    // the total loan term instead of being neutralized by a smaller refinancing base.
    if (currentMonth === zinsbindungJahre * 12 + 1) {
      const effectiveTilgung = anschlussTilgungPct ?? tilgungPct;
      const refinancingAnnuity = (currentDebt * (activeRatePct + effectiveTilgung)) / 100 / 12;
      monthlyAnnuity = Math.max(monthlyAnnuity, refinancingAnnuity);
    }

    // Calculate monthly interest
    const interest = (currentDebt * (activeRatePct / 100)) / 12;
    kumulierteZinsen += interest;
    currentYearZinsen += interest;

    // Calculate monthly tilgung
    let tilgung = Math.max(0, monthlyAnnuity - interest);

    // If annuity is less than interest, standard bank logic is applied:
    // the monthly payment is adjusted to cover at least the interest (no negative amortization).
    if (monthlyAnnuity < interest) {
      tilgung = 0;
    }

    if (currentDebt <= tilgung) {
      tilgung = currentDebt;
      currentDebt = 0;
      currentYearTilgung += tilgung;
      laufzeitMonate = currentMonth;
      
      // End of year processing if loan is fully paid mid-year
      const monthsInYear = currentMonth % 12;
      if (monthsInYear > 0) {
        // Aggregate partial year
        years.push({
          jahr: currentYear,
          anfangsbestand: currentYearAnfang,
          zinsen: currentYearZinsen,
          tilgung: currentYearTilgung,
          sondertilgung: currentYearSondertilgung,
          annuitaet: currentYearZinsen + currentYearTilgung,
          endbestand: 0,
        });
      } else {
        // Exact end of year
        years.push({
          jahr: currentYear,
          anfangsbestand: currentYearAnfang,
          zinsen: currentYearZinsen,
          tilgung: currentYearTilgung,
          sondertilgung: currentYearSondertilgung,
          annuitaet: currentYearZinsen + currentYearTilgung,
          endbestand: 0,
        });
      }
      break;
    } else {
      currentDebt -= tilgung;
      currentYearTilgung += tilgung;
    }

    // Check for Sondertilgung at the end of the year
    if (currentMonth % 12 === 0) {
      if (currentDebt > 0 && sondertilgungProJahr > 0) {
        const st = Math.min(sondertilgungProJahr, currentDebt);
        currentDebt -= st;
        currentYearSondertilgung = st;
        if (currentDebt <= 0.005) {
          currentDebt = 0;
          if (laufzeitMonate === 0) {
            laufzeitMonate = currentMonth;
          }
        }
      }

      years.push({
        jahr: currentYear,
        anfangsbestand: currentYearAnfang,
        zinsen: currentYearZinsen,
        tilgung: currentYearTilgung,
        sondertilgung: currentYearSondertilgung,
        annuitaet: currentYearZinsen + currentYearTilgung,
        endbestand: currentDebt,
      });

      // Track Restschuld at Zinsbindung-Ende
      if (currentYear === zinsbindungJahre) {
        restschuldZinsbindungEnde = currentDebt;
      }
      // Track Restschuld at Haltedauer-Ende
      if (currentYear === haltedauerJahre) {
        restschuldHaltedauerEnde = currentDebt;
      }

      // Reset annual aggregators
      currentYearAnfang = currentDebt;
      currentYearZinsen = 0;
      currentYearTilgung = 0;
      currentYearSondertilgung = 0;
    }
  }

  // If zinsbindung ends after the loan is fully paid, the debt is 0
  if (zinsbindungJahre > Math.ceil(currentMonth / 12)) {
    restschuldZinsbindungEnde = 0;
  }
  // Same for haltedauer
  if (haltedauerJahre > Math.ceil(currentMonth / 12)) {
    restschuldHaltedauerEnde = 0;
  }

  // If the loan is not fully paid after the simulation cap, it is not amortizing.
  if (currentDebt > 0 && laufzeitMonate === 0) {
    laufzeitMonate = Number.POSITIVE_INFINITY;
  }

  // Fill up years to haltedauerJahre if the loan was paid off early, so subsequent engines get a full timeline
  const lastActiveYear = years.length;
  if (lastActiveYear < haltedauerJahre) {
    for (let y = lastActiveYear + 1; y <= haltedauerJahre; y++) {
      years.push({
        jahr: y,
        anfangsbestand: 0,
        zinsen: 0,
        tilgung: 0,
        sondertilgung: 0,
        annuitaet: 0,
        endbestand: 0,
      });
    }
  }

  // If haltedauer is shorter than the active plan, retrieve the restschuld at that year
  if (haltedauerJahre <= lastActiveYear && haltedauerJahre > 0) {
    restschuldHaltedauerEnde = years[haltedauerJahre - 1].endbestand;
  }
  if (zinsbindungJahre <= lastActiveYear && zinsbindungJahre > 0) {
    restschuldZinsbindungEnde = years[zinsbindungJahre - 1].endbestand;
  }

  return {
    years,
    restschuldZinsbindungEnde: Math.max(0, restschuldZinsbindungEnde),
    restschuldHaltedauerEnde: Math.max(0, restschuldHaltedauerEnde),
    kumulierteZinsen,
    laufzeitMonate,
    laufzeitJahre: laufzeitMonate / 12,
  };
}
