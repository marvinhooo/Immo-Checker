import { describe, expect, it } from 'vitest';
import { buildAmortizationSchedule } from './financing';

describe('buildAmortizationSchedule', () => {
  it('calculates the reference case correctly (no sondertilgung)', () => {
    // Reference case:
    // Loan: 233,058 EUR
    // Interest: 3.8 % p.a.
    // Tilgung: 2.0 % p.a.
    // Zinsbindung: 10 years
    // Anschlusszins: 4.5 % p.a.
    // Haltedauer: 15 years
    const result = buildAmortizationSchedule({
      loanAmount: 233058,
      sollzinsPct: 3.8,
      tilgungPct: 2.0,
      zinsbindungJahre: 10,
      anschlusszinsPct: 4.5,
      sondertilgungProJahr: 0,
      haltedauerJahre: 15,
    });

    expect(result.years).toHaveLength(37);
    
    // Year 1 checks
    const y1 = result.years[0];
    expect(y1.jahr).toBe(1);
    expect(y1.anfangsbestand).toBe(233058);
    // Let's check interest and tilgung math:
    // Interest in month 1: 233058 * 0.038 / 12 = 738.017
    // Annuity: 233058 * 0.058 / 12 = 1126.447
    // Tilgung in month 1: 1126.447 - 738.017 = 388.43
    // Summing monthly values over 12 months:
    // We can check if the calculated values are in the correct range.
    expect(y1.zinsen).toBeGreaterThan(8600);
    expect(y1.zinsen).toBeLessThan(8900);
    expect(y1.tilgung).toBeGreaterThan(4600);
    expect(y1.tilgung).toBeLessThan(4900);
    expect(y1.endbestand).toBeCloseTo(228315, 0); // Endbestand around 228,315 EUR

    // Zinsbindung check (Year 10)
    expect(result.restschuldZinsbindungEnde).toBe(result.years[9].endbestand);
    expect(result.restschuldZinsbindungEnde).toBeCloseTo(176461, 0);

    // Haltedauer check (Year 15)
    expect(result.restschuldHaltedauerEnde).toBe(result.years[14].endbestand);
    expect(result.restschuldHaltedauerEnde).toBeCloseTo(156713, 0);
    
    // Total interest check
    expect(result.kumulierteZinsen).toBeGreaterThan(0);
  });

  it('verifies that Sondertilgung reduces run time and debt', () => {
    const withoutST = buildAmortizationSchedule({
      loanAmount: 200000,
      sollzinsPct: 4.0,
      tilgungPct: 2.0,
      zinsbindungJahre: 10,
      anschlusszinsPct: 4.0,
      sondertilgungProJahr: 0,
      haltedauerJahre: 15,
    });

    const withST = buildAmortizationSchedule({
      loanAmount: 200000,
      sollzinsPct: 4.0,
      tilgungPct: 2.0,
      zinsbindungJahre: 10,
      anschlusszinsPct: 4.0,
      sondertilgungProJahr: 5000, // 5000 EUR sondertilgung per year
      haltedauerJahre: 15,
    });

    // Debt at end of Year 10 should be significantly lower with ST
    expect(withST.restschuldZinsbindungEnde).toBeLessThan(withoutST.restschuldZinsbindungEnde - 50000);
    // Run time in months should be shorter
    expect(withST.laufzeitMonate).toBeLessThan(withoutST.laufzeitMonate);
  });

  it('handles 100% equity case gracefully (loanAmount = 0)', () => {
    const result = buildAmortizationSchedule({
      loanAmount: 0,
      sollzinsPct: 3.5,
      tilgungPct: 2.0,
      zinsbindungJahre: 10,
      anschlusszinsPct: 4.0,
      sondertilgungProJahr: 0,
      haltedauerJahre: 15,
    });

    expect(result.years).toHaveLength(15);
    expect(result.restschuldZinsbindungEnde).toBe(0);
    expect(result.restschuldHaltedauerEnde).toBe(0);
    expect(result.kumulierteZinsen).toBe(0);
    expect(result.laufzeitMonate).toBe(0);
    
    // Every year should be zeroed
    result.years.forEach((y, idx) => {
      expect(y.jahr).toBe(idx + 1);
      expect(y.anfangsbestand).toBe(0);
      expect(y.zinsen).toBe(0);
      expect(y.tilgung).toBe(0);
      expect(y.sondertilgung).toBe(0);
      expect(y.annuitaet).toBe(0);
      expect(y.endbestand).toBe(0);
    });
  });

  it('handles interest-only (0% initial tilgung) loan', () => {
    const result = buildAmortizationSchedule({
      loanAmount: 100000,
      sollzinsPct: 4.0,
      tilgungPct: 0.0, // interest-only
      zinsbindungJahre: 10,
      anschlusszinsPct: 5.0,
      sondertilgungProJahr: 0,
      haltedauerJahre: 15,
    });

    expect(result.years).toHaveLength(100);
    // Debt remains constant during zinsbindung
    expect(result.years[0].endbestand).toBeCloseTo(100000, 2);
    expect(result.years[9].endbestand).toBeCloseTo(100000, 2);
    // After zinsbindung, the new rate applies, debt still constant since tilgung = 0
    expect(result.years[14].endbestand).toBeCloseTo(100000, 2);

    expect(result.restschuldZinsbindungEnde).toBeCloseTo(100000, 2);
    expect(result.restschuldHaltedauerEnde).toBeCloseTo(100000, 2);
    expect(result.laufzeitMonate).toBe(Number.POSITIVE_INFINITY);
    expect(result.laufzeitJahre).toBe(Number.POSITIVE_INFINITY);
  });

  it('sets the loan term when Sondertilgung fully repays at year-end', () => {
    const result = buildAmortizationSchedule({
      loanAmount: 5000,
      sollzinsPct: 0,
      tilgungPct: 0,
      zinsbindungJahre: 10,
      anschlusszinsPct: 0,
      sondertilgungProJahr: 5000,
      haltedauerJahre: 5,
    });

    expect(result.years[0].endbestand).toBe(0);
    expect(result.years[0].sondertilgung).toBe(5000);
    expect(result.laufzeitMonate).toBe(12);
    expect(result.laufzeitJahre).toBe(1);
  });
});
