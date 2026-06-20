import { IncreaseRule } from './types';

/**
 * Generates an array of values for each year (1 to years) based on a base value
 * and a list of step/rate increase rules.
 * 
 * - Year 1 (index 0) starts at `base`. If there is a step rule for Year 1, it is applied.
 * - For Year t (t > 1):
 *   1. We apply the active growth rate (defined by the 'rate' rule with the largest fromYear <= t).
 *   2. If there is a 'step' rule for Year t, we apply the one-time percentage increase.
 */
export function projectSeries(base: number, rules: IncreaseRule[], years: number): number[] {
  const result: number[] = [];
  if (years <= 0) return result;

  // 1. Calculate Year 1
  let val = base;
  const year1Steps = rules.filter(r => r.kind === 'step' && r.fromYear === 1);
  for (const step of year1Steps) {
    if ('percent' in step) {
      val = val * (1 + step.percent / 100);
    }
  }
  result.push(val);

  // 2. Calculate Years 2 to N
  for (let t = 2; t <= years; t++) {
    // Find active rate for year t
    const activeRateRule = rules
      .filter(r => r.kind === 'rate' && r.fromYear <= t)
      .reduce<IncreaseRule | null>((maxRule, currentRule) => {
        if (!maxRule) return currentRule;
        return currentRule.fromYear > maxRule.fromYear ? currentRule : maxRule;
      }, null);

    const ratePct = activeRateRule && 'percentPerYear' in activeRateRule
      ? activeRateRule.percentPerYear
      : 0;

    // Apply rate (growth from year t-1 to t)
    let currentVal = result[t - 2] * (1 + ratePct / 100);

    // Apply any steps for year t
    const currentSteps = rules.filter(r => r.kind === 'step' && r.fromYear === t);
    for (const step of currentSteps) {
      if ('percent' in step) {
        currentVal = currentVal * (1 + step.percent / 100);
      }
    }

    result.push(currentVal);
  }

  return result;
}
