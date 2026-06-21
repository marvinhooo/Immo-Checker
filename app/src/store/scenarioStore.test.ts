import { beforeEach, describe, expect, it } from 'vitest';
import { useScenarioStore } from './scenarioStore';
import { createDefaultScenario } from '../engine/defaults';
import {
  knkAmount,
  totalInvest,
  equityAmount,
  cashInvestment,
  cashInvestmentBreakdown,
  unfinancedKnkCashGap,
  loanAmount,
} from '../engine/derive';

beforeEach(() => {
  useScenarioStore.setState({ active: createDefaultScenario(), saved: [] });
});

describe('scenarioStore', () => {
  it('loads a default scenario', () => {
    const { active } = useScenarioStore.getState();
    expect(active.objekt.kaufpreis).toBe(300000);
    expect(active.schemaVersion).toBe(1);
  });

  it('updates a field immutably via updateActive', () => {
    const before = useScenarioStore.getState().active;
    useScenarioStore.getState().updateActive((d) => {
      d.objekt.kaufpreis = 400000;
    });
    const after = useScenarioStore.getState().active;
    expect(after.objekt.kaufpreis).toBe(400000);
    expect(before.objekt.kaufpreis).toBe(300000); // Original unveraendert
    expect(after).not.toBe(before); // neue Referenz
  });

  it('saves, loads and deletes named scenarios', () => {
    useScenarioStore.getState().updateActive((d) => {
      d.objekt.kaufpreis = 250000;
    });
    const id = useScenarioStore.getState().saveCurrent('Test A');
    expect(useScenarioStore.getState().saved).toHaveLength(1);
    expect(useScenarioStore.getState().saved[0].name).toBe('Test A');

    // aktives Szenario aendern, dann gespeichertes wieder laden -> wiederhergestellt
    useScenarioStore.getState().updateActive((d) => {
      d.objekt.kaufpreis = 999999;
    });
    useScenarioStore.getState().loadSaved(id);
    expect(useScenarioStore.getState().active.objekt.kaufpreis).toBe(250000);

    useScenarioStore.getState().deleteSaved(id);
    expect(useScenarioStore.getState().saved).toHaveLength(0);
  });

  it('resets the active scenario to defaults', () => {
    useScenarioStore.getState().updateActive((d) => {
      d.objekt.kaufpreis = 1;
    });
    useScenarioStore.getState().resetActive();
    expect(useScenarioStore.getState().active.objekt.kaufpreis).toBe(300000);
  });

});

describe('derive helpers', () => {
  it('computes KNK, total invest, equity and loan consistently (NW default)', () => {
    const s = createDefaultScenario();
    // KNK = 300.000 * (6,5 + 1,5 + 3,57)% = 34.710
    expect(knkAmount(s)).toBeCloseTo(34710, 2);
    expect(totalInvest(s)).toBeCloseTo(334710, 2);
    // Eigenkapital = 20 % der Gesamtinvestition
    expect(equityAmount(s)).toBeCloseTo(66942, 2);
    // mitfinanzieren=false -> Eigenkapital deckt zuerst KNK; Darlehen = 300.000 - (66.942 - 34.710)
    expect(loanAmount(s)).toBeCloseTo(267768, 2);

    const breakdown = cashInvestmentBreakdown(s);
    expect(breakdown.enteredEquity).toBeCloseTo(66942, 2);
    expect(breakdown.unfinancedKnkCash).toBeCloseTo(34710, 2);
    expect(breakdown.additionalCashForUnfinancedKnk).toBe(0);
    expect(breakdown.equityAvailableAfterKnk).toBeCloseTo(32232, 2);
    expect(breakdown.totalCashInvestment).toBeCloseTo(66942, 2);
  });

  it('caps loan at 0 for 100% equity', () => {
    const s = createDefaultScenario({});
    s.finanzierung.equityMode = 'absolute';
    s.finanzierung.equityAbsolute = totalInvest(s);
    expect(loanAmount(s)).toBe(0);
  });

  it('applies disagio to the nominal loan amount', () => {
    const s = createDefaultScenario();
    const baseLoan = loanAmount(s);
    s.finanzierung.disagioPct = 5;

    expect(loanAmount(s)).toBeCloseTo(baseLoan / 0.95, 2);
  });

  it('counts unfinanced KNK as required cash investment when equity is too low', () => {
    const s = createDefaultScenario();
    s.finanzierung.equityMode = 'percent';
    s.finanzierung.equityPct = 0;
    s.finanzierung.equityAbsolute = 0;
    s.knk.mitfinanzieren = false;

    expect(equityAmount(s)).toBe(0);
    expect(unfinancedKnkCashGap(s)).toBeCloseTo(knkAmount(s), 2);
    expect(cashInvestment(s)).toBeCloseTo(knkAmount(s), 2);
    expect(loanAmount(s)).toBeCloseTo(s.objekt.kaufpreis + s.objekt.sanierungskosten, 2);
  });

  it('explains additional cash for unfinanced KNK without double-counting entered equity', () => {
    const s = createDefaultScenario();
    s.finanzierung.equityMode = 'absolute';
    s.finanzierung.equityAbsolute = 10000;
    s.knk.mitfinanzieren = false;

    const breakdown = cashInvestmentBreakdown(s);

    expect(knkAmount(s)).toBeCloseTo(34710, 2);
    expect(breakdown.enteredEquity).toBe(10000);
    expect(breakdown.unfinancedKnkCash).toBeCloseTo(34710, 2);
    expect(breakdown.additionalCashForUnfinancedKnk).toBeCloseTo(24710, 2);
    expect(breakdown.totalCashInvestment).toBeCloseTo(34710, 2);
    expect(cashInvestment(s)).toBeCloseTo(34710, 2);
    expect(loanAmount(s)).toBeCloseTo(s.objekt.kaufpreis + s.objekt.sanierungskosten, 2);
  });
});
