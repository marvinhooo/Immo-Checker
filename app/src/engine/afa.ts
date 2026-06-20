import { Scenario } from './types';
import { knkAmount } from './derive';

export interface AfaYearProjection {
  jahr: number;
  afaAmount: number;
  cumulativeAfa: number;
  restwert: number;
}

/**
 * Calculates the year-by-year AfA (depreciation) projection.
 *
 * @param scenario The active scenario input
 * @param years Number of years to project
 */
export function projectAfa(scenario: Scenario, years: number): AfaYearProjection[] {
  const result: AfaYearProjection[] = [];
  if (years <= 0) return result;

  const knk = knkAmount(scenario);
  const buildingPct = 1 - scenario.objekt.bodenwertAnteilPct / 100;
  
  // Altbausubstanz / building basis (purchase price + side costs allocated by building share)
  const buildingBasis = (scenario.objekt.kaufpreis + knk) * buildingPct;
  const sonder7bBasis = Math.min(buildingBasis, Math.max(0, scenario.objekt.wohnflaeche) * 4000);
  const linearRate = scenario.afa.linearSatzPct / 100;

  let altbauRestwert = buildingBasis;
  let sanierungRestwert = scenario.objekt.sanierungskosten; // Denkmal-Topf (§7i)
  
  let cumulativeAfa = 0;
  
  // State for degressive to linear switch
  let hasSwitchedToLinear = false;
  let linearAfaRateAfterSwitch = 0;
  const totalLifetime = scenario.afa.linearSatzPct > 0 ? 100 / scenario.afa.linearSatzPct : 50;

  for (let t = 1; t <= years; t++) {
    let afaAmount = 0;

    if (scenario.afa.modus === 'denkmal7i') {
      // Denkmal-AfA: Altbausubstanz linear + Sanierungskosten (9% years 1-8, 7% years 9-12)
      const altbauAfa = Math.min(altbauRestwert, buildingBasis * linearRate);
      
      let sanierungAfa = 0;
      if (t <= 8) {
        sanierungAfa = Math.min(sanierungRestwert, scenario.objekt.sanierungskosten * 0.09);
      } else if (t <= 12) {
        sanierungAfa = Math.min(sanierungRestwert, scenario.objekt.sanierungskosten * 0.07);
      }
      
      afaAmount = altbauAfa + sanierungAfa;
      
      altbauRestwert = Math.max(0, altbauRestwert - altbauAfa);
      sanierungRestwert = Math.max(0, sanierungRestwert - sanierungAfa);
    } else if (scenario.afa.modus === 'linear') {
      // Regular linear depreciation
      afaAmount = Math.min(altbauRestwert, buildingBasis * linearRate);
      altbauRestwert = Math.max(0, altbauRestwert - afaAmount);
    } else if (scenario.afa.modus === 'degressiv') {
      // Degressive depreciation (5% p.a.) with optional switch to linear when linear is higher
      const degressiveRate = 0.05;
      const remainingLifetime = totalLifetime - t + 1;

      if (hasSwitchedToLinear) {
        afaAmount = Math.min(altbauRestwert, linearAfaRateAfterSwitch);
      } else {
        const degressiveAfa = altbauRestwert * degressiveRate;
        const linearAfaIfSwitch = remainingLifetime > 0 ? altbauRestwert / remainingLifetime : altbauRestwert;
        
        if (linearAfaIfSwitch > degressiveAfa) {
          hasSwitchedToLinear = true;
          linearAfaRateAfterSwitch = linearAfaIfSwitch;
          afaAmount = Math.min(altbauRestwert, linearAfaIfSwitch);
        } else {
          afaAmount = Math.min(altbauRestwert, degressiveAfa);
        }
      }
      altbauRestwert = Math.max(0, altbauRestwert - afaAmount);
    } else if (scenario.afa.modus === 'sonder7b') {
      // Sonder-AfA: linear + 5% additional for the first 4 years, capped by §7b basis.
      if (t <= 4) {
        const regularAfa = Math.min(altbauRestwert, buildingBasis * linearRate);
        const sonderAfa = Math.min(altbauRestwert - regularAfa, sonder7bBasis * 0.05);
        afaAmount = regularAfa + sonderAfa;
      } else {
        const remainingLifetime = totalLifetime - t + 1;
        afaAmount = remainingLifetime > 0 ? altbauRestwert / remainingLifetime : altbauRestwert;
      }

      afaAmount = Math.min(altbauRestwert, afaAmount);
      altbauRestwert = Math.max(0, altbauRestwert - afaAmount);
    }

    cumulativeAfa += afaAmount;
    
    // Remaining book value is altbau restwert plus sanierung restwert (if in Denkmal mode)
    const restwert = altbauRestwert + (scenario.afa.modus === 'denkmal7i' ? sanierungRestwert : 0);

    result.push({
      jahr: t,
      afaAmount,
      cumulativeAfa,
      restwert,
    });
  }

  return result;
}
