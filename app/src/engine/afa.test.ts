import { describe, it, expect } from 'vitest';
import { projectAfa } from './afa';
import { createDefaultScenario } from './defaults';

describe('afa engine - projectAfa', () => {
  it('should return empty array for 0 or negative years', () => {
    const scenario = createDefaultScenario();
    expect(projectAfa(scenario, 0)).toEqual([]);
    expect(projectAfa(scenario, -3)).toEqual([]);
  });

  it('should calculate linear AfA correctly', () => {
    // Setup: Kaufpreis 300,000. KNK: 5% grest, 1.5% notar, 3.5% makler = 10% = 30,000.
    // Total cost = 330,000.
    // Bodenwertanteil: 20% -> Building share: 80%
    // Building Basis = 330,000 * 0.8 = 264,000.
    // Linear rate: 2% (0.02)
    // expected yearly AfA: 264,000 * 0.02 = 5,280.
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 300000,
        wohnflaeche: 70,
        fertigstellungsjahr: 1995,
        bundesland: 'NW',
        objektTyp: 'bestand',
        bodenwertAnteilPct: 20,
        sanierungskosten: 0,
      },
      knk: {
        grestPct: 5,
        notarPct: 1.5,
        maklerPct: 3.5,
        mitfinanzieren: false,
      },
      afa: {
        modus: 'linear',
        linearSatzPct: 2.0,
      }
    });

    const projection = projectAfa(scenario, 15);
    expect(projection.length).toBe(15);
    
    // Year 1
    expect(projection[0].jahr).toBe(1);
    expect(projection[0].afaAmount).toBeCloseTo(5280, 2);
    expect(projection[0].cumulativeAfa).toBeCloseTo(5280, 2);
    expect(projection[0].restwert).toBeCloseTo(264000 - 5280, 2);

    // Year 10
    expect(projection[9].jahr).toBe(10);
    expect(projection[9].afaAmount).toBeCloseTo(5280, 2);
    expect(projection[9].cumulativeAfa).toBeCloseTo(5280 * 10, 2);
    expect(projection[9].restwert).toBeCloseTo(264000 - 5280 * 10, 2);
  });

  it('should calculate degressive AfA with switch to linear correctly', () => {
    // Building basis = 264,000. Total lifetime = 50. Degressive rate = 5%.
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 300000,
        wohnflaeche: 70,
        fertigstellungsjahr: 1995,
        bundesland: 'NW',
        objektTyp: 'bestand',
        bodenwertAnteilPct: 20,
        sanierungskosten: 0,
      },
      knk: {
        grestPct: 5,
        notarPct: 1.5,
        maklerPct: 3.5,
        mitfinanzieren: false,
      },
      afa: {
        modus: 'degressiv',
        linearSatzPct: 2.0,
      }
    });

    const projection = projectAfa(scenario, 40);
    
    // Year 1: degressive is 264,000 * 0.05 = 13,200.
    // Linear if switch would be 264,000 / 50 = 5,280.
    // 13,200 > 5,280 -> stays degressive.
    expect(projection[0].afaAmount).toBeCloseTo(13200, 2);
    expect(projection[0].restwert).toBeCloseTo(264000 - 13200, 2); // 250,800

    // Year 2: degressive is 250,800 * 0.05 = 12,540.
    // Linear if switch is 250,800 / 49 = 5,118.37.
    // stays degressive.
    expect(projection[1].afaAmount).toBeCloseTo(12540, 2);

    // Let's verify it switches eventually (specifically when remaining life < 20, which is after Year 31)
    // Once switched, AfA remains constant (except when remaining restwert is less than the rate)
    const afa33 = projection[32].afaAmount;
    const afa34 = projection[33].afaAmount;
    
    expect(afa33).toBeCloseTo(afa34, 1);
  });

  it('should calculate Sonder-AfA §7b correctly', () => {
    // Building basis = 264,000. Linear rate: 2%. Sonder-AfA: +5% for Years 1-4.
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 300000,
        wohnflaeche: 70,
        fertigstellungsjahr: 1995,
        bundesland: 'NW',
        objektTyp: 'bestand',
        bodenwertAnteilPct: 20,
        sanierungskosten: 0,
      },
      knk: {
        grestPct: 5,
        notarPct: 1.5,
        maklerPct: 3.5,
        mitfinanzieren: false,
      },
      afa: {
        modus: 'sonder7b',
        linearSatzPct: 2.0,
      }
    });

    const projection = projectAfa(scenario, 50);
    
    // Years 1-4: regular 5,280 + sonder 13,200 = 18,480
    for (let t = 0; t < 4; t++) {
      expect(projection[t].afaAmount).toBeCloseTo(18480, 2);
    }
    
    // After Sonder-AfA, the remaining book value is spread over the remaining useful life.
    const restwertAfterYear4 = 264000 - 18480 * 4;
    const adjustedLinearAfa = restwertAfterYear4 / 46;
    expect(projection[4].afaAmount).toBeCloseTo(adjustedLinearAfa, 2);
    expect(projection[5].afaAmount).toBeCloseTo(adjustedLinearAfa, 2);
    expect(projection[49].restwert).toBeCloseTo(0, 2);
  });

  it('caps Sonder-AfA §7b basis at 4,000 EUR per square meter', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 700000,
        wohnflaeche: 100,
        fertigstellungsjahr: 2024,
        bundesland: 'NW',
        objektTyp: 'neubau',
        bodenwertAnteilPct: 0,
        sanierungskosten: 0,
      },
      knk: {
        grestPct: 0,
        notarPct: 0,
        maklerPct: 0,
        mitfinanzieren: false,
      },
      afa: {
        modus: 'sonder7b',
        linearSatzPct: 2.0,
      }
    });

    const projection = projectAfa(scenario, 1);

    // Regular linear AfA = 700,000 * 2%; Sonder-AfA basis is capped at 100 m2 * 4,000 EUR.
    expect(projection[0].afaAmount).toBeCloseTo(14000 + 20000, 2);
  });

  it('should calculate Denkmal-AfA §7i correctly', () => {
    // Altbausubstanz basis = 264,000. Linear rate: 2%.
    // Sanierungskosten basis = 200,000.
    // Denkmal rate: 9% for years 1-8, 7% for years 9-12.
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 300000,
        wohnflaeche: 70,
        fertigstellungsjahr: 1995,
        bundesland: 'NW',
        objektTyp: 'denkmal',
        bodenwertAnteilPct: 20,
        sanierungskosten: 200000,
      },
      knk: {
        grestPct: 5,
        notarPct: 1.5,
        maklerPct: 3.5,
        mitfinanzieren: false,
      },
      afa: {
        modus: 'denkmal7i',
        linearSatzPct: 2.0,
      }
    });

    const projection = projectAfa(scenario, 15);
    
    // Year 1-8: Altbau 5,280 + Sanierung 200,000 * 0.09 (18,000) = 23,280
    expect(projection[0].afaAmount).toBeCloseTo(23280, 2);
    expect(projection[7].afaAmount).toBeCloseTo(23280, 2);

    // Year 9-12: Altbau 5,280 + Sanierung 200,000 * 0.07 (14,000) = 19,280
    expect(projection[8].afaAmount).toBeCloseTo(19280, 2);
    expect(projection[11].afaAmount).toBeCloseTo(19280, 2);

    // Year 13-15: Altbau 5,280 + Sanierung 0 = 5,280
    expect(projection[12].afaAmount).toBeCloseTo(5280, 2);
    expect(projection[14].afaAmount).toBeCloseTo(5280, 2);
  });
});
