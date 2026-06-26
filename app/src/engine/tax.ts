import { Scenario } from './types';

/**
 * Calculates the basic German Einkommensteuer (income tax) for a given zvE (zu versteuerndes Einkommen)
 * based on the § 32a EStG formula for 2026.
 *
 * @param zvE Taxable income in EUR
 * @param veranlagung 'single' or 'splitting'
 */
function incomeTaxRaw(zvE: number, veranlagung: 'single' | 'splitting' = 'single'): number {
  if (zvE <= 0) return 0;

  if (veranlagung === 'splitting') {
    return Math.floor(incomeTaxRaw(zvE / 2, 'single')) * 2;
  }

  const x = Math.floor(zvE);

  if (x <= 12348) {
    return 0;
  } else if (x <= 17799) {
    const y = (x - 12348) / 10000;
    return (914.51 * y + 1400) * y;
  } else if (x <= 69878) {
    const z = (x - 17799) / 10000;
    return (173.10 * z + 2397) * z + 1034.87;
  } else if (x <= 277825) {
    return 0.42 * x - 11135.63;
  } else {
    return 0.45 * x - 19470.38;
  }
}

export function incomeTax(zvE: number, veranlagung: 'single' | 'splitting' = 'single'): number {
  return Math.floor(incomeTaxRaw(zvE, veranlagung));
}

function calculateSoliFromIncomeTax(est: number, splitting: boolean): number {
  const freigrenze = splitting ? 40700 : 20350;
  if (est <= freigrenze) return 0;

  const soli = Math.min(0.055 * est, 0.119 * (est - freigrenze));
  return Math.trunc(soli * 100) / 100;
}

/**
 * Calculates the total tax including Einkommensteuer, optional Solidaritaetszuschlag (Soli),
 * and optional Kirchensteuer.
 */
export function calculateTotalTax(
  zvE: number,
  splitting: boolean,
  useSoli: boolean,
  kirchensteuerPct: number
): number {
  const est = incomeTax(zvE, splitting ? 'splitting' : 'single');
  
  const soli = useSoli ? calculateSoliFromIncomeTax(est, splitting) : 0;
  const kist = (kirchensteuerPct / 100) * est;
  
  return est + soli + kist;
}

export function applyFlatTaxSurcharges(
  baseIncomeTaxAmount: number,
  useSoli: boolean,
  kirchensteuerPct: number
): number {
  const soli = useSoli ? baseIncomeTaxAmount * 0.055 : 0;
  const kist = (kirchensteuerPct / 100) * baseIncomeTaxAmount;
  return baseIncomeTaxAmount + soli + kist;
}

export function applyFlatTaxSurchargesWithSoliFreigrenze(
  baseIncomeTaxAmount: number,
  useSoli: boolean,
  kirchensteuerPct: number,
  splitting: boolean
): number {
  const sign = baseIncomeTaxAmount < 0 ? -1 : 1;
  const absBaseIncomeTax = Math.abs(baseIncomeTaxAmount);
  const soli = useSoli ? calculateSoliFromIncomeTax(absBaseIncomeTax, splitting) : 0;
  const kist = (kirchensteuerPct / 100) * absBaseIncomeTax;
  return sign * (absBaseIncomeTax + soli + kist);
}

/**
 * Calculates the marginal tax rate (Grenzsteuersatz) in percent at a given zvE level.
 * Uses numerical differentiation for accuracy across the piecewise tariff.
 */
export function marginalRate(zvE: number, veranlagung: 'single' | 'splitting' = 'single'): number {
  const checkZvE = Math.max(0, zvE);
  const delta = 100;
  const tax1 = incomeTaxRaw(checkZvE, veranlagung);
  const tax2 = incomeTaxRaw(checkZvE + delta, veranlagung);
  return ((tax2 - tax1) / delta) * 100;
}

/**
 * Calculates the tax effect of real estate rental income (V&V result).
 * A negative V&V result (loss) leads to a tax savings (negative return value).
 */
export function calculateTaxEffect(scenario: Scenario, vvResult: number): number {
  const {
    taxMode,
    bruttoJahresEinkommen,
    grenzsteuersatzPct,
    veranlagung,
    soli,
    kirchensteuerPct,
  } = scenario.steuer;

  if (taxMode === 'marginalRate') {
    // Fixed marginal rate mode (fester Grenzsteuersatz)
    return applyFlatTaxSurcharges(
      (grenzsteuersatzPct / 100) * vvResult,
      soli,
      kirchensteuerPct
    );
  }

  // Progressive tax mode based on § 32a EStG 2026
  const isSplitting = veranlagung === 'splitting';
  const zvEWithout = Math.max(0, bruttoJahresEinkommen);
  const zvEWith = Math.max(0, bruttoJahresEinkommen + vvResult);

  const taxWithout = calculateTotalTax(zvEWithout, isSplitting, soli, kirchensteuerPct);
  const taxWith = calculateTotalTax(zvEWith, isSplitting, soli, kirchensteuerPct);

  return taxWith - taxWithout;
}
