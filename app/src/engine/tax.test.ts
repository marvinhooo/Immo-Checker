import { describe, it, expect } from 'vitest';
import { incomeTax, calculateTotalTax, marginalRate, calculateTaxEffect } from './tax';
import { createDefaultScenario } from './defaults';

describe('tax engine - incomeTax', () => {
  it('should return 0 for income below or at Grundfreibetrag 2026', () => {
    expect(incomeTax(0)).toBe(0);
    expect(incomeTax(12348)).toBe(0);
    expect(incomeTax(-5000)).toBe(0);
  });

  it('should calculate tax in Zone 2 correctly (e.g. 15,000 EUR)', () => {
    // zvE = 15000. y = (15000 - 12348) / 10000 = 0.2652
    // Raw ESt = (914.51 * y + 1400) * y = 435.598..., rounded down to full EUR.
    expect(incomeTax(15000)).toBe(435);
  });

  it('should calculate tax in Zone 4 correctly (e.g. 80,000 EUR)', () => {
    // zvE = 80000. Raw ESt = 0.42 * 80000 - 11135.63 = 22464.37, rounded down.
    expect(incomeTax(80000)).toBe(22464);
  });

  it('should double the brackets for splitting veranlagung', () => {
    // Splitting applies the single tariff to half the income, rounds that tax, then doubles it.
    expect(incomeTax(30000, 'splitting')).toBe(870);
  });
});

describe('tax engine - calculateTotalTax', () => {
  it('should calculate tax without Soli if ESt is below threshold', () => {
    // ESt on 40,000 is 0.42 * 40000 - 10637.32 ? No, 40,000 is in Zone 3.
    // ESt on 40,000 single is ~6200. This is below 20,350 Soli threshold.
    // Soli should be 0.
    const est = incomeTax(40000, 'single');
    const totalTax = calculateTotalTax(40000, false, true, 0); // soli = true, kist = 0%
    expect(totalTax).toBeCloseTo(est, 2);
  });

  it('should apply Soli above threshold (mitigated and full rate)', () => {
    // ESt needs to be above 20,350 to trigger Soli.
    // At zvE = 100,000, raw ESt is 30,864.37 and tariff ESt is rounded down to 30,864.
    const est = incomeTax(100000, 'single');
    const totalTax = calculateTotalTax(100000, false, true, 0);
    const expectedSoli = Math.min(0.055 * est, 0.119 * (est - 20350));
    expect(totalTax).toBeCloseTo(est + expectedSoli, 1);
  });

  it('should drop fractions of a cent from Soli in the mitigation zone', () => {
    const est = incomeTax(74969, 'single');
    const totalTax = calculateTotalTax(74969, false, true, 0);

    expect(est).toBe(20351);
    expect(totalTax).toBe(20351.11);
  });

  it('should apply Kirchensteuer correctly', () => {
    const est = incomeTax(50000, 'single');
    const totalTax = calculateTotalTax(50000, false, false, 9); // kist = 9%
    expect(totalTax).toBeCloseTo(est * 1.09, 2);
  });
});

describe('tax engine - marginalRate', () => {
  it('should calculate marginal tax rate correctly', () => {
    // In Zone 4 (e.g. 80,000 EUR), marginal rate is exactly 42%
    expect(marginalRate(80000, 'single')).toBeCloseTo(42.0, 1);

    // In Zone 1 (below Grundfreibetrag), marginal rate is 0%
    expect(marginalRate(5000, 'single')).toBe(0.0);
  });
});

describe('tax engine - calculateTaxEffect', () => {
  it('should calculate tax effect with flat marginal rate', () => {
    const scenario = createDefaultScenario({
      steuer: {
        taxMode: 'marginalRate',
        bruttoJahresEinkommen: 80000,
        grenzsteuersatzPct: 42,
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      }
    });

    // Loss of -10,000 EUR should give tax effect of -4,200 EUR (savings)
    expect(calculateTaxEffect(scenario, -10000)).toBeCloseTo(-4200, 2);
    
    // Profit of 5,000 EUR should give tax effect of +2,100 EUR (additional tax)
    expect(calculateTaxEffect(scenario, 5000)).toBeCloseTo(2100, 2);
  });

  it('should calculate progressive tax effect (higher income -> larger savings on loss)', () => {
    const lowIncomeScenario = createDefaultScenario({
      steuer: {
        taxMode: 'income',
        bruttoJahresEinkommen: 30000,
        grenzsteuersatzPct: 42,
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      }
    });

    const highIncomeScenario = createDefaultScenario({
      steuer: {
        taxMode: 'income',
        bruttoJahresEinkommen: 90000,
        grenzsteuersatzPct: 42,
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      }
    });

    const loss = -5000;
    const lowIncomeSavings = calculateTaxEffect(lowIncomeScenario, loss);
    const highIncomeSavings = calculateTaxEffect(highIncomeScenario, loss);

    // Both should be negative (savings)
    expect(lowIncomeSavings).toBeLessThan(0);
    expect(highIncomeSavings).toBeLessThan(0);

    // High income should save more money due to progressive tax rates (42% vs ~28%)
    // Absolute savings of high income should be greater (meaning more negative)
    expect(Math.abs(highIncomeSavings)).toBeGreaterThan(Math.abs(lowIncomeSavings));
  });
});
