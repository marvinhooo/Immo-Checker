import { IncreaseRule } from './types';

export interface ProjectSeriesOptions {
  /**
   * Ignoriert wirksamAbMonat von Stufen-Regeln und weist im Stufenjahr den vollen
   * neuen Stand aus (z. B. fuer die Anzeige des Mietniveaus nach der Erhoehung).
   */
  ignoreStepMonths?: boolean;
}

/**
 * Generates an array of values for each year (1 to years) based on a base value
 * and a list of step/rate increase rules.
 *
 * - Year 1 (index 0) starts at `base`. If there is a step rule for Year 1, it is applied.
 * - For Year t (t > 1):
 *   1. We apply the active growth rate (defined by the 'rate' rule with the largest fromYear <= t).
 *   2. If there is a 'step' rule for Year t, we apply the one-time percentage increase.
 *
 * A step rule with wirksamAbMonat m > 1 only counts for the months m..12 of its fromYear
 * (pro rata); from the following year on the full stepped value is carried forward.
 */
export function projectSeries(
  base: number,
  rules: IncreaseRule[],
  years: number,
  options?: ProjectSeriesOptions
): number[] {
  const result: number[] = [];
  if (years <= 0) return result;

  const ignoreStepMonths = options?.ignoreStepMonths ?? false;

  // Fortgeschriebener Stand mit voll angewandten Stufen (Basis fuer Folgejahre),
  // unabhaengig vom anteilig ausgewiesenen Jahreswert.
  let fullVal = base;

  for (let t = 1; t <= years; t++) {
    if (t > 1) {
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
      fullVal = fullVal * (1 + ratePct / 100);
    }

    // Apply any steps for year t
    let reportedVal = fullVal;
    const currentSteps = rules.filter(r => r.kind === 'step' && r.fromYear === t);
    for (const step of currentSteps) {
      if ('percent' in step) {
        fullVal = fullVal * (1 + step.percent / 100);

        const month = !ignoreStepMonths && step.wirksamAbMonat !== undefined
          ? Math.min(12, Math.max(1, Math.round(step.wirksamAbMonat)))
          : 1;
        // Anteil des Jahres, in dem die Stufe bereits wirkt (Monate month..12)
        const activeFraction = (13 - month) / 12;
        reportedVal = reportedVal * (1 + (step.percent / 100) * activeFraction);
      }
    }

    result.push(reportedVal);
  }

  return result;
}

/**
 * Bestandsgroessen-Variante von projectSeries fuer Werte, die zum JAHRESENDE gelten
 * (z. B. Immobilienwert), nicht fuer Stroeme, die ueber das Jahr anfallen (z. B. Miete).
 *
 * - `base` ist der Stand in t0 (Kaufzeitpunkt), er selbst ist NICHT Teil des Ergebnisses.
 * - Ergebnis[t - 1] ist der Wert am Ende von Jahr t, das Array hat exakt `years` Eintraege.
 * - Fuer jedes Jahr t wird zuerst die aktive Jahresrate angewandt, danach die Stufen mit
 *   fromYear === t. `wirksamAbMonat` ist hier bewusst ohne Wirkung: ein Bestand zum
 *   Jahresende ist entweder gestiegen oder nicht, eine unterjaehrige Quotelung gibt es nicht.
 */
export function projectEndOfYearSeries(
  base: number,
  rules: IncreaseRule[],
  years: number
): number[] {
  const result: number[] = [];
  if (years <= 0) return result;

  let value = base;

  for (let t = 1; t <= years; t++) {
    const activeRateRule = rules
      .filter(r => r.kind === 'rate' && r.fromYear <= t)
      .reduce<IncreaseRule | null>((maxRule, currentRule) => {
        if (!maxRule) return currentRule;
        return currentRule.fromYear > maxRule.fromYear ? currentRule : maxRule;
      }, null);

    const ratePct = activeRateRule && 'percentPerYear' in activeRateRule
      ? activeRateRule.percentPerYear
      : 0;

    value = value * (1 + ratePct / 100);

    for (const step of rules.filter(r => r.kind === 'step' && r.fromYear === t)) {
      if ('percent' in step) {
        value = value * (1 + step.percent / 100);
      }
    }

    result.push(value);
  }

  return result;
}
