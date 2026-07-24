import { MieteInput, KostenInput, MietspiegelInput, IncreaseRule } from './types';
import { projectSeries } from './timeline';

export type MietspiegelStatus = 'incomplete' | 'invalid' | 'below' | 'within' | 'above';

export interface MietspiegelAssessment {
  status: MietspiegelStatus;
  abweichungZumMittelwert: number | null;
}

export interface RentRuleResult {
  ruleId: string;
  jahr: number;
  kaltmieteProMonat: number;
  kaltmieteProSqm: number | null;
  istWirksam: boolean;
}

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
  umlagefaehigeKosten: number;
  leerstandsbedingteUmlagekosten: number;
  nichtUmlagefaehigeKosten: number;
  sev: number;             // Sondereigentumsverwaltung, nicht umlagefaehig, sofort abziehbar (beide Modi)
  wegRuecklage: number;
  sofortAbziehbareKosten: number;
  summeKosten: number;     // gesamter Eigentuemer-Cashout inkl. Ruecklage und Leerstandsanteil
}

export function rentPerSqmInCents(value: number): number {
  return Math.round(
    (value + Number.EPSILON * Math.max(1, Math.abs(value))) * 100
  );
}

/**
 * Ordnet die aktuell angesetzte Nettokaltmiete pro m2/Monat in einen
 * nutzerseitig erfassten Mietspiegel-Spannbereich ein.
 */
export function assessRentAgainstMietspiegel(
  rentProSqm: number,
  mietspiegel: MietspiegelInput
): MietspiegelAssessment {
  const {
    untererSpannwertProSqm,
    mittelwertProSqm,
    obererSpannwertProSqm,
  } = mietspiegel;
  const values = [
    rentProSqm,
    untererSpannwertProSqm,
    mittelwertProSqm,
    obererSpannwertProSqm,
  ];

  if (!values.every(Number.isFinite) || values.some((value) => value < 0)) {
    return { status: 'invalid', abweichungZumMittelwert: null };
  }

  // Mietspiegelwerte werden in Cent je m2 angezeigt und eingegeben. Die
  // Einordnung nutzt dieselbe Genauigkeit, damit nicht z. B. 12,00 als
  // oberhalb eines ebenfalls angezeigten Werts von 12,00 erscheint.
  const rentCents = rentPerSqmInCents(rentProSqm);
  const lowerCents = rentPerSqmInCents(untererSpannwertProSqm);
  const meanCents = rentPerSqmInCents(mittelwertProSqm);
  const upperCents = rentPerSqmInCents(obererSpannwertProSqm);

  const abweichungZumMittelwert = meanCents > 0
    ? (rentCents - meanCents) / 100
    : null;

  if (
    lowerCents <= 0 ||
    meanCents <= 0 ||
    upperCents <= 0
  ) {
    return { status: 'incomplete', abweichungZumMittelwert };
  }

  if (
    lowerCents > meanCents ||
    meanCents > upperCents
  ) {
    return { status: 'invalid', abweichungZumMittelwert };
  }

  if (rentCents < lowerCents) {
    return { status: 'below', abweichungZumMittelwert };
  }
  if (rentCents > upperCents) {
    return { status: 'above', abweichungZumMittelwert };
  }
  return { status: 'within', abweichungZumMittelwert };
}

/**
 * Berechnet fuer jede Mietsteigerungsregel den Stand der monatlichen Kaltmiete
 * in ihrem Startjahr. Alle bis zu diesem Jahr wirksamen Regeln werden dabei
 * genauso kombiniert wie in der Mietprojektion.
 */
export function calculateRentRuleResults(
  baseRentProMonat: number,
  wohnflaeche: number,
  rules: IncreaseRule[]
): RentRuleResult[] {
  if (rules.length === 0) return [];

  const maxRuleYear = Math.max(...rules.map((rule) => rule.fromYear));
  // Anzeige des Mietniveaus NACH einer Stufe: wirksamAbMonat nicht anteilig einrechnen.
  const rentSeries = projectSeries(baseRentProMonat, rules, maxRuleYear, { ignoreStepMonths: true });

  const firstRateIndexByYear = new Map<number, number>();
  rules.forEach((rule, index) => {
    if (rule.kind === 'rate' && !firstRateIndexByYear.has(rule.fromYear)) {
      firstRateIndexByYear.set(rule.fromYear, index);
    }
  });

  return rules.map((rule, index) => {
    const jahr = rule.fromYear;
    const kaltmieteProMonat = rentSeries[jahr - 1] ?? baseRentProMonat;

    return {
      ruleId: rule.id,
      jahr,
      kaltmieteProMonat,
      kaltmieteProSqm: wohnflaeche > 0 ? kaltmieteProMonat / wohnflaeche : null,
      istWirksam: rule.kind === 'step' || firstRateIndexByYear.get(rule.fromYear) === index,
    };
  });
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
  years: number,
  leerstandPct: number = 0,
): CostYearProjection[] {
  const result: CostYearProjection[] = [];
  if (years <= 0) return result;

  const costGrowthRate = kostenInput.kostensteigerungPctPa;
  const wirtschaftsplanMode = kostenInput.kostenErfassungMode === 'wirtschaftsplan';

  let currentUmlagefaehig = Math.max(0, kostenInput.umlagefaehigeKostenProJahr ?? 0);
  let currentNichtUmlagefaehig = Math.max(0, kostenInput.nichtUmlagefaehigeKostenProJahr ?? 0);
  let currentWegRuecklage = Math.max(0, kostenInput.wegRuecklageProJahr ?? 0);

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
  // Sondereigentumsverwaltung: in beiden Erfassungsmodi ein separater, sofort abziehbarer
  // Eigentuemer-Cashout, der mit der allgemeinen Kostensteigerung waechst.
  let currentSev = Math.max(0, kostenInput.sevProJahr ?? 0);

  for (let t = 1; t <= years; t++) {
    if (t > 1) {
      currentSev *= 1 + costGrowthRate / 100;
      if (wirtschaftsplanMode) {
        currentUmlagefaehig *= 1 + costGrowthRate / 100;
        currentNichtUmlagefaehig *= 1 + costGrowthRate / 100;
        currentWegRuecklage *= 1 + costGrowthRate / 100;
      }
      // Apply annual cost growth rate for non-percentRent items
      if (!wirtschaftsplanMode && kostenInput.maintenanceMode !== 'percentRent') {
        currentInstandhaltung = currentInstandhaltung * (1 + costGrowthRate / 100);
      } else if (!wirtschaftsplanMode) {
        // percentRent is recalculated from current year's rent
        currentInstandhaltung = (kostenInput.instandhaltungPctRent / 100) * (projectedBruttoRent[t - 1] || 0);
      }
      if (!wirtschaftsplanMode) {
        currentVerwaltung = currentVerwaltung * (1 + costGrowthRate / 100);
        currentSonstige = currentSonstige * (1 + costGrowthRate / 100);
      }
    } else {
      // In Year 1, we make sure percentRent uses Year 1 rent
      if (!wirtschaftsplanMode && kostenInput.maintenanceMode === 'percentRent') {
        currentInstandhaltung = (kostenInput.instandhaltungPctRent / 100) * (projectedBruttoRent[0] || 0);
      }
    }

    const umlagefaehigeKosten = wirtschaftsplanMode ? currentUmlagefaehig : 0;
    const leerstandsbedingteUmlagekosten = wirtschaftsplanMode
      ? currentUmlagefaehig * (Math.min(100, Math.max(0, leerstandPct)) / 100)
      : 0;
    const detailedTotal = currentInstandhaltung + currentVerwaltung + currentSonstige;
    const detailedReserve = currentInstandhaltung
      * (Math.min(100, Math.max(0, kostenInput.ruecklagenAnteilPct ?? 0)) / 100);
    const nichtUmlagefaehigeKosten = wirtschaftsplanMode
      ? currentNichtUmlagefaehig
      : detailedTotal - detailedReserve;
    const wegRuecklage = wirtschaftsplanMode ? currentWegRuecklage : detailedReserve;
    const sev = currentSev;
    const sofortAbziehbareKosten = nichtUmlagefaehigeKosten + leerstandsbedingteUmlagekosten + sev;
    const summeKosten = sofortAbziehbareKosten + wegRuecklage;

    result.push({
      jahr: t,
      instandhaltung: wirtschaftsplanMode ? 0 : currentInstandhaltung,
      verwaltung: wirtschaftsplanMode ? 0 : currentVerwaltung,
      // Im Wirtschaftsplanmodus steht die direkte Summe ausschliesslich im
      // separaten Feld; sonst wuerde sie z. B. im CSV doppelt erscheinen.
      sonstigeKosten: wirtschaftsplanMode ? 0 : currentSonstige,
      umlagefaehigeKosten,
      leerstandsbedingteUmlagekosten,
      nichtUmlagefaehigeKosten,
      sev,
      wegRuecklage,
      sofortAbziehbareKosten,
      summeKosten,
    });
  }

  return result;
}
