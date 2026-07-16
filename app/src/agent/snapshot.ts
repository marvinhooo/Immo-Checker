import { calculateExit } from '../engine/exit';
import { calculateMetrics } from '../engine/metrics';
import { runProjection } from '../engine/projection';
import type { Scenario } from '../engine/types';
import {
  AGENT_API_VERSION,
  AGENT_SNAPSHOT_FORMAT,
  getAgentCapabilities,
  getAgentCompleteness,
} from './contract';

export function createAgentSnapshot(scenario: Scenario) {
  const projection = runProjection(scenario);
  const metrics = calculateMetrics(scenario, projection);
  const exit = calculateExit(scenario, projection);
  const firstYear = projection.years[0];
  const lastYear = projection.years[projection.years.length - 1];

  return {
    format: AGENT_SNAPSHOT_FORMAT,
    version: AGENT_API_VERSION,
    generatedAt: new Date().toISOString(),
    capabilities: getAgentCapabilities(),
    completeness: getAgentCompleteness(scenario.agentReview),
    scenario: structuredClone(scenario),
    analysis: {
      units: {
        currency: 'EUR',
        rates: 'percent',
        duration: 'years',
      },
      metrics,
      firstYear: firstYear ? {
        cashflowBeforeTax: firstYear.cashflowVorSteuer,
        cashflowAfterTax: firstYear.cashflowNachSteuer,
        monthlyCashflowAfterTax: firstYear.cashflowNachSteuerMonatlich,
        ltv: firstYear.ltv,
        dscr: firstYear.dscr,
      } : null,
      exit,
      endNetWorth: lastYear?.eigenkapital ?? 0,
      initialEquity: projection.initialEquity,
      totalInvestment: projection.totalInvestment,
      loanAmount: projection.loanAmount,
    },
  };
}
