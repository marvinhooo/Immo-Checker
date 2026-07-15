import { describe, expect, it } from 'vitest';
import { createDefaultScenario } from './defaults';
import { activatedRenovationCostsThroughYear, projectRenovations } from './renovation';

describe('planned renovation projection', () => {
  it('projects payouts, direct/distributed expenses and additional AfA by measure year', () => {
    const scenario = createDefaultScenario({
      afa: { modus: 'linear', linearSatzPct: 2 },
      sanierungen: [
        {
          id: 'direct',
          bezeichnung: 'Malerarbeiten',
          jahr: 2,
          betrag: 1200,
          steuerart: 'sofort',
          verteilungsJahre: 2,
          mieterhoehungMoeglich: false,
        },
        {
          id: 'distributed',
          bezeichnung: 'Erhaltungsaufwand',
          jahr: 2,
          betrag: 6000,
          steuerart: 'verteilt',
          verteilungsJahre: 3,
          mieterhoehungMoeglich: true,
        },
        {
          id: 'denkmal-expense',
          bezeichnung: 'Bescheinigter Erhaltungsaufwand',
          jahr: 3,
          betrag: 10000,
          steuerart: 'denkmal11b',
          verteilungsJahre: 5,
          mieterhoehungMoeglich: false,
        },
        {
          id: 'manufacturing',
          bezeichnung: 'Nachtraegliche Herstellungskosten',
          jahr: 2,
          betrag: 10000,
          steuerart: 'herstellung',
          verteilungsJahre: 2,
          mieterhoehungMoeglich: true,
        },
        {
          id: 'monument',
          bezeichnung: 'Denkmal-Sanierung',
          jahr: 2,
          betrag: 10000,
          steuerart: 'denkmal7i',
          verteilungsJahre: 2,
          mieterhoehungMoeglich: true,
        },
        {
          id: 'none',
          bezeichnung: 'Ohne Steuerwirkung',
          jahr: 2,
          betrag: 500,
          steuerart: 'keine',
          verteilungsJahre: 2,
          mieterhoehungMoeglich: false,
        },
      ],
    });

    const projection = projectRenovations(scenario, 14);

    expect(projection[0]).toMatchObject({ auszahlung: 0, werbungskosten: 0, afa: 0 });
    expect(projection[1]).toMatchObject({
      auszahlung: 27700,
      sofortWerbungskosten: 1200,
      verteilteWerbungskosten: 2000,
      werbungskosten: 3200,
      herstellungsAfa: 200,
      denkmalAfa: 900,
      afa: 1100,
    });
    expect(projection[2].auszahlung).toBe(10000);
    expect(projection[2].verteilteWerbungskosten).toBe(4000); // 2.000 EUR + §11b 2.000 EUR
    expect(projection[4].verteilteWerbungskosten).toBe(2000); // nur §11b
    expect(projection[6].verteilteWerbungskosten).toBe(2000); // letztes §11b-Jahr
    expect(projection[7].verteilteWerbungskosten).toBe(0);
    expect(projection[8].denkmalAfa).toBe(900); // relatives Denkmal-Jahr 8
    expect(projection[9].denkmalAfa).toBeCloseTo(700, 8); // relatives Denkmal-Jahr 9
    expect(projection[12].denkmalAfa).toBeCloseTo(700, 8); // relatives Denkmal-Jahr 12
    expect(projection[13].denkmalAfa).toBe(0);
    expect(projection.reduce((sum, year) => sum + year.denkmalAfa, 0)).toBeCloseTo(10000, 8);
  });

  it('caps linear manufacturing-cost AfA at the measure amount', () => {
    const scenario = createDefaultScenario({
      afa: { modus: 'linear', linearSatzPct: 40 },
      sanierungen: [
        {
          id: 'linear-cap',
          bezeichnung: 'Herstellung',
          jahr: 3,
          betrag: 1000,
          steuerart: 'herstellung',
          verteilungsJahre: 2,
          mieterhoehungMoeglich: false,
        },
      ],
    });

    const projection = projectRenovations(scenario, 6);
    expect(projection.map((year) => year.herstellungsAfa)).toEqual([
      0,
      0,
      400,
      400,
      200,
      0,
    ]);
    expect(projection.reduce((sum, year) => sum + year.herstellungsAfa, 0)).toBe(1000);
  });

  it('includes only executed and activated measures in the exit cost basis', () => {
    const scenario = createDefaultScenario({
      sanierungen: [
        {
          id: 'direct', bezeichnung: 'Sofort', jahr: 2, betrag: 3000,
          steuerart: 'sofort', verteilungsJahre: 2, mieterhoehungMoeglich: false,
        },
        {
          id: 'manufacturing', bezeichnung: 'Herstellung', jahr: 3, betrag: 10000,
          steuerart: 'herstellung', verteilungsJahre: 2, mieterhoehungMoeglich: false,
        },
        {
          id: 'monument', bezeichnung: 'Denkmal', jahr: 5, betrag: 20000,
          steuerart: 'denkmal7i', verteilungsJahre: 2, mieterhoehungMoeglich: false,
        },
        {
          id: 'future', bezeichnung: 'Zukunft', jahr: 8, betrag: 40000,
          steuerart: 'herstellung', verteilungsJahre: 2, mieterhoehungMoeglich: false,
        },
      ],
    });

    expect(activatedRenovationCostsThroughYear(scenario, 2)).toBe(0);
    expect(activatedRenovationCostsThroughYear(scenario, 3)).toBe(10000);
    expect(activatedRenovationCostsThroughYear(scenario, 5)).toBe(30000);
    expect(activatedRenovationCostsThroughYear(scenario, 8)).toBe(70000);
  });
});
