import { describe, it, expect } from 'vitest';
import { projectSeries, projectEndOfYearSeries } from './timeline';
import { IncreaseRule } from './types';

describe('timeline engine - projectSeries', () => {
  it('should return empty array for 0 or negative years', () => {
    expect(projectSeries(100, [], 0)).toEqual([]);
    expect(projectSeries(100, [], -5)).toEqual([]);
  });

  it('should return base value if no rules are specified', () => {
    const result = projectSeries(100, [], 3);
    expect(result).toEqual([100, 100, 100]);
  });

  it('should apply a constant annual rate correctly', () => {
    const rules: IncreaseRule[] = [
      { id: '1', kind: 'rate', fromYear: 1, percentPerYear: 2 }
    ];
    const result = projectSeries(100, rules, 3);
    expect(result[0]).toBeCloseTo(100, 4);      // Year 1: base
    expect(result[1]).toBeCloseTo(102, 4);      // Year 2: 100 * 1.02
    expect(result[2]).toBeCloseTo(104.04, 4);   // Year 3: 102 * 1.02
  });

  it('should apply the PRD example: nach 3 J. +10 %, nach 15 J. +25 %, sonst 1,5 % p.a.', () => {
    const rules: IncreaseRule[] = [
      { id: 'r1', kind: 'rate', fromYear: 1, percentPerYear: 1.5 },
      { id: 's1', kind: 'step', fromYear: 4, percent: 10 },    // "nach 3 J." -> Year 4
      { id: 's2', kind: 'step', fromYear: 16, percent: 25 }   // "nach 15 J." -> Year 16
    ];

    const result = projectSeries(100, rules, 16);
    expect(result[0]).toBeCloseTo(100, 4);                     // Year 1
    expect(result[1]).toBeCloseTo(101.5, 4);                   // Year 2
    expect(result[2]).toBeCloseTo(103.0225, 4);                // Year 3
    expect(result[3]).toBeCloseTo(103.0225 * 1.015 * 1.10, 4); // Year 4: rate + step
    
    // Check Year 15
    // Year 15 has 14 rates applied (from Y1) and 1 step (Y4)
    // val(t) = 100 * 1.015^(t-1) * 1.10 (for 4 <= t <= 15)
    const expectedYear15 = 100 * Math.pow(1.015, 14) * 1.10;
    expect(result[14]).toBeCloseTo(expectedYear15, 4);

    // Year 16: rate from Y15 to Y16, plus 25% step
    const expectedYear16 = expectedYear15 * 1.015 * 1.25;
    expect(result[15]).toBeCloseTo(expectedYear16, 4);
  });

  it('should prorate a step with wirksamAbMonat in its first year and apply it fully afterwards', () => {
    const rules: IncreaseRule[] = [
      { id: 's1', kind: 'step', fromYear: 1, percent: 15, wirksamAbMonat: 3 }
    ];
    const result = projectSeries(100, rules, 3);
    // Jahr 1: 2 Monate alt (100), 10 Monate neu (115) -> 100 * (1 + 0.15 * 10/12)
    expect(result[0]).toBeCloseTo(100 * (1 + 0.15 * (10 / 12)), 4);
    // Ab Jahr 2 gilt der volle neue Stand
    expect(result[1]).toBeCloseTo(115, 4);
    expect(result[2]).toBeCloseTo(115, 4);
  });

  it('should compound rates on the full stepped value, not the prorated year value', () => {
    const rules: IncreaseRule[] = [
      { id: 'r1', kind: 'rate', fromYear: 1, percentPerYear: 2 },
      { id: 's1', kind: 'step', fromYear: 2, percent: 10, wirksamAbMonat: 7 }
    ];
    const result = projectSeries(100, rules, 3);
    expect(result[0]).toBeCloseTo(100, 4);
    // Jahr 2: Rate auf 102, Stufe ab Monat 7 -> 102 * (1 + 0.10 * 6/12)
    expect(result[1]).toBeCloseTo(102 * 1.05, 4);
    // Jahr 3: Rate auf dem VOLLEN Stufenwert 102 * 1.10
    expect(result[2]).toBeCloseTo(102 * 1.10 * 1.02, 4);
  });

  it('should treat wirksamAbMonat 1 and undefined identically and support ignoreStepMonths', () => {
    const withMonth: IncreaseRule[] = [
      { id: 's1', kind: 'step', fromYear: 2, percent: 10, wirksamAbMonat: 1 }
    ];
    const withoutMonth: IncreaseRule[] = [
      { id: 's1', kind: 'step', fromYear: 2, percent: 10 }
    ];
    expect(projectSeries(100, withMonth, 3)).toEqual(projectSeries(100, withoutMonth, 3));

    const midYear: IncreaseRule[] = [
      { id: 's1', kind: 'step', fromYear: 2, percent: 10, wirksamAbMonat: 7 }
    ];
    const ignored = projectSeries(100, midYear, 3, { ignoreStepMonths: true });
    expect(ignored[1]).toBeCloseTo(110, 4);
  });

  it('should handle rate overrides correctly', () => {
    const rules: IncreaseRule[] = [
      { id: 'r1', kind: 'rate', fromYear: 1, percentPerYear: 1 },
      { id: 'r2', kind: 'rate', fromYear: 3, percentPerYear: 3 }
    ];
    const result = projectSeries(100, rules, 4);
    // Year 1: base = 100
    // Year 2: 100 * 1.01 (active rate at Y2 is 1%) = 101
    // Year 3: 101 * 1.03 (active rate at Y3 is 3%) = 104.03
    // Year 4: 104.03 * 1.03 = 107.1509
    expect(result[0]).toBeCloseTo(100, 4);
    expect(result[1]).toBeCloseTo(101, 4);
    expect(result[2]).toBeCloseTo(104.03, 4);
    expect(result[3]).toBeCloseTo(107.1509, 4);
  });
});

describe('timeline engine - projectEndOfYearSeries', () => {
  it('should return an empty array for 0 or negative years', () => {
    expect(projectEndOfYearSeries(100, [], 0)).toEqual([]);
    expect(projectEndOfYearSeries(100, [], -5)).toEqual([]);
  });

  it('should return exactly `years` entries and never contain the t0 base itself', () => {
    const rules: IncreaseRule[] = [
      { id: 'r1', kind: 'rate', fromYear: 1, percentPerYear: 10 },
    ];
    const result = projectEndOfYearSeries(100, rules, 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toBeCloseTo(110, 4);
  });

  it('differs from the flow series: rate 10 % ab Jahr 1', () => {
    const rules: IncreaseRule[] = [
      { id: 'r1', kind: 'rate', fromYear: 1, percentPerYear: 10 },
    ];
    // Stromgroesse (Miete): Jahr 1 = 100, Jahr 2 = 110
    const flow = projectSeries(100, rules, 2);
    expect(flow[0]).toBeCloseTo(100, 4);
    expect(flow[1]).toBeCloseTo(110, 4);

    // Bestandsgroesse (Immobilienwert): Ende Jahr 1 = 110, Ende Jahr 2 = 121
    const stock = projectEndOfYearSeries(100, rules, 2);
    expect(stock[0]).toBeCloseTo(110, 4);
    expect(stock[1]).toBeCloseTo(121, 4);
  });

  it('applies a rate that starts in year 3 only from year 3 on', () => {
    const rules: IncreaseRule[] = [
      { id: 'r1', kind: 'rate', fromYear: 3, percentPerYear: 10 },
    ];
    const result = projectEndOfYearSeries(100, rules, 3);
    expect(result[0]).toBeCloseTo(100, 4);
    expect(result[1]).toBeCloseTo(100, 4);
    expect(result[2]).toBeCloseTo(110, 4);
  });

  it('applies a step in year 3 exactly in year 3', () => {
    const rules: IncreaseRule[] = [
      { id: 's1', kind: 'step', fromYear: 3, percent: 10 },
    ];
    const result = projectEndOfYearSeries(100, rules, 3);
    expect(result[0]).toBeCloseTo(100, 4);
    expect(result[1]).toBeCloseTo(100, 4);
    expect(result[2]).toBeCloseTo(110, 4);
  });

  it('ignores wirksamAbMonat for stock values (no pro-rata year-end value)', () => {
    const rules: IncreaseRule[] = [
      { id: 's1', kind: 'step', fromYear: 2, percent: 10, wirksamAbMonat: 7 },
    ];
    const result = projectEndOfYearSeries(100, rules, 2);
    expect(result[1]).toBeCloseTo(110, 4);
  });
});
