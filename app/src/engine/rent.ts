import { MieteInput, KostenInput } from './types';
import { projectSeries } from './timeline';

export interface RentYearProjection {
  jahr: number;
  bruttoKaltmiete: number; // projected yearly cold rent before vacancy
  nettoKaltmiete: number;  // projected yearly cold rent after vacancy
  mietausfall: number;     // vacancy loss (brutto - netto)
}

export interface CostYearProjection {
  jahr: number;
  instandhaltung: number;
  verwaltung: number;
  sonstigeKosten: number;
  summeKosten: number;     // non-apportionable total costs (Werbungskosten)
}

/**
 * Calculates the year-by-year rent projection.
 */
export function projectRent(
  mieteInput: MieteInput,
  wohnflaeche: number,
  years: number
): RentYearProjection[] {
  const result: RentYearProjection[] = [];
  if (years <= 0) return result;

  const baseRentYear = (() => {
    switch (mieteInput.rentMode) {
      case 'perSqm':
        return mieteInput.kaltmieteProSqm * wohnflaeche * 12;
      case 'perYear':
        return mieteInput.kaltmieteProJahr;
      case 'perMonth':
      default:
        return mieteInput.kaltmieteProMonat * 12;
    }
  })();

  // Generate the brutto rent series
  const bruttoRentSeries = projectSeries(baseRentYear, mieteInput.steigerungen, years);

  for (let t = 1; t <= years; t++) {
    const bruttoKaltmiete = bruttoRentSeries[t - 1];
    const mietausfall = bruttoKaltmiete * (mieteInput.leerstandPct / 100);
    const nettoKaltmiete = bruttoKaltmiete - mietausfall;

    result.push({
      jahr: t,
      bruttoKaltmiete,
      nettoKaltmiete,
      mietausfall,
    });
  }

  return result;
}

/**
 * Calculates the year-by-year non-apportionable costs.
 */
export function projectCosts(
  kostenInput: KostenInput,
  wohnflaeche: number,
  projectedBruttoRent: number[],
  years: number
): CostYearProjection[] {
  const result: CostYearProjection[] = [];
  if (years <= 0) return result;

  const costGrowthRate = kostenInput.kostensteigerungPctPa;

  let currentInstandhaltung: number;
  if (kostenInput.maintenanceMode === 'perSqm') {
    currentInstandhaltung = kostenInput.instandhaltungProSqm * wohnflaeche;
  } else if (kostenInput.maintenanceMode === 'absolute') {
    currentInstandhaltung = kostenInput.instandhaltungAbsolut;
  } else {
    // percentRent: calculated dynamically per year
    currentInstandhaltung = (kostenInput.instandhaltungPctRent / 100) * (projectedBruttoRent[0] || 0);
  }

  let currentVerwaltung = kostenInput.verwaltungProJahr;
  let currentSonstige = kostenInput.sonstigeKostenProJahr;

  for (let t = 1; t <= years; t++) {
    if (t > 1) {
      // Apply annual cost growth rate for non-percentRent items
      if (kostenInput.maintenanceMode !== 'percentRent') {
        currentInstandhaltung = currentInstandhaltung * (1 + costGrowthRate / 100);
      } else {
        // percentRent is recalculated from current year's rent
        currentInstandhaltung = (kostenInput.instandhaltungPctRent / 100) * (projectedBruttoRent[t - 1] || 0);
      }
      currentVerwaltung = currentVerwaltung * (1 + costGrowthRate / 100);
      currentSonstige = currentSonstige * (1 + costGrowthRate / 100);
    } else {
      // In Year 1, we make sure percentRent uses Year 1 rent
      if (kostenInput.maintenanceMode === 'percentRent') {
        currentInstandhaltung = (kostenInput.instandhaltungPctRent / 100) * (projectedBruttoRent[0] || 0);
      }
    }

    const summeKosten = currentInstandhaltung + currentVerwaltung + currentSonstige;

    result.push({
      jahr: t,
      instandhaltung: currentInstandhaltung,
      verwaltung: currentVerwaltung,
      sonstigeKosten: currentSonstige,
      summeKosten,
    });
  }

  return result;
}
