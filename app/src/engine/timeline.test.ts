import { describe, it, expect } from 'vitest';
import { projectSeries } from './timeline';
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
