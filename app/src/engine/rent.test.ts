import { describe, it, expect } from 'vitest';
import {
  assessRentAgainstMietspiegel,
  calculateRentRuleResults,
  projectRent,
  projectCosts,
} from './rent';
import { MieteInput, KostenInput } from './types';

const emptyMietspiegel = {
  untererSpannwertProSqm: 0,
  mittelwertProSqm: 0,
  obererSpannwertProSqm: 0,
};

describe('rent engine - projectRent', () => {
  it('should project rent in monthly mode', () => {
    const input: MieteInput = {
      rentMode: 'perMonth',
      kaltmieteProMonat: 1000,
      kaltmieteProJahr: 12000,
      kaltmieteProSqm: 0,
      leerstandPct: 5,
      mietspiegel: emptyMietspiegel,
      steigerungen: [{ id: 'r1', kind: 'rate', fromYear: 1, percentPerYear: 2 }]
    };

    const projection = projectRent(input, 100, 3);
    expect(projection.length).toBe(3);

    // Year 1: 1000 * 12 = 12000
    expect(projection[0].jahr).toBe(1);
    expect(projection[0].bruttoKaltmiete).toBeCloseTo(12000, 4);
    expect(projection[0].mietausfall).toBeCloseTo(12000 * 0.05, 4);
    expect(projection[0].nettoKaltmiete).toBeCloseTo(12000 * 0.95, 4);

    // Year 2: 12000 * 1.02 = 12240
    expect(projection[1].jahr).toBe(2);
    expect(projection[1].bruttoKaltmiete).toBeCloseTo(12240, 4);
    expect(projection[1].mietausfall).toBeCloseTo(12240 * 0.05, 4);
    expect(projection[1].nettoKaltmiete).toBeCloseTo(12240 * 0.95, 4);
  });

  it('should project rent in sqm mode', () => {
    const input: MieteInput = {
      rentMode: 'perSqm',
      kaltmieteProMonat: 0,
      kaltmieteProJahr: 14400,
      kaltmieteProSqm: 15,
      leerstandPct: 0,
      mietspiegel: emptyMietspiegel,
      steigerungen: []
    };

    const projection = projectRent(input, 80, 2);
    // Base: 15 * 80 * 12 = 14400
    expect(projection[0].bruttoKaltmiete).toBe(14400);
    expect(projection[1].bruttoKaltmiete).toBe(14400);
  });

  it('should project rent in yearly mode', () => {
    const input: MieteInput = {
      rentMode: 'perYear',
      kaltmieteProMonat: 1000,
      kaltmieteProJahr: 12000,
      kaltmieteProSqm: 10,
      leerstandPct: 10,
      mietspiegel: emptyMietspiegel,
      steigerungen: []
    };

    const projection = projectRent(input, 100, 1);
    expect(projection[0].bruttoKaltmiete).toBe(12000);
    expect(projection[0].nettoKaltmiete).toBe(10800);
  });
});

describe('rent engine - Mietspiegel assessment', () => {
  const mietspiegel = {
    untererSpannwertProSqm: 8,
    mittelwertProSqm: 10,
    obererSpannwertProSqm: 12,
  };

  it('treats the lower and upper boundaries as inside the range', () => {
    expect(assessRentAgainstMietspiegel(8, mietspiegel).status).toBe('within');
    expect(assessRentAgainstMietspiegel(12, mietspiegel).status).toBe('within');
  });

  it('classifies rents below and above the range', () => {
    expect(assessRentAgainstMietspiegel(7.99, mietspiegel).status).toBe('below');
    expect(assessRentAgainstMietspiegel(12.01, mietspiegel).status).toBe('above');
  });

  it('reports the deviation from the mean', () => {
    expect(assessRentAgainstMietspiegel(11.25, mietspiegel)).toEqual({
      status: 'within',
      abweichungZumMittelwert: 1.25,
    });
  });

  it('uses the displayed cent precision for boundary comparisons', () => {
    expect(assessRentAgainstMietspiegel(12.004, mietspiegel).status).toBe('within');
    expect(assessRentAgainstMietspiegel(12.006, mietspiegel).status).toBe('above');
    expect(assessRentAgainstMietspiegel(10.08, {
      untererSpannwertProSqm: 8,
      mittelwertProSqm: 9,
      obererSpannwertProSqm: 10.075,
    }).status).toBe('within');
  });

  it('does not classify incomplete or incorrectly ordered values', () => {
    expect(assessRentAgainstMietspiegel(10, emptyMietspiegel).status).toBe('incomplete');
    expect(assessRentAgainstMietspiegel(10, {
      untererSpannwertProSqm: 12,
      mittelwertProSqm: 10,
      obererSpannwertProSqm: 8,
    }).status).toBe('invalid');
  });
});

describe('rent engine - rule results', () => {
  it('uses the full timeline result in each rule start year', () => {
    const rules = [
      { id: 'rate', kind: 'rate' as const, fromYear: 1, percentPerYear: 2 },
      { id: 'step', kind: 'step' as const, fromYear: 3, percent: 10 },
    ];

    const results = calculateRentRuleResults(1000, 100, rules);

    expect(results[0]).toEqual({
      ruleId: 'rate',
      jahr: 1,
      kaltmieteProMonat: 1000,
      kaltmieteProSqm: 10,
      istWirksam: true,
    });
    expect(results[1].ruleId).toBe('step');
    expect(results[1].jahr).toBe(3);
    expect(results[1].kaltmieteProMonat).toBeCloseTo(1144.44, 5);
    expect(results[1].kaltmieteProSqm).toBeCloseTo(11.4444, 5);
  });

  it('calculates rules beyond the chart horizon and handles missing area', () => {
    const results = calculateRentRuleResults(800, 0, [
      { id: 'late', kind: 'step', fromYear: 20, percent: 25 },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].jahr).toBe(20);
    expect(results[0].kaltmieteProMonat).toBe(1000);
    expect(results[0].kaltmieteProSqm).toBeNull();
  });

  it('shows the same combined result for rules sharing a start year', () => {
    const results = calculateRentRuleResults(1000, 100, [
      { id: 'base-rate', kind: 'rate', fromYear: 1, percentPerYear: 1 },
      { id: 'new-rate', kind: 'rate', fromYear: 3, percentPerYear: 3 },
      { id: 'same-year-step', kind: 'step', fromYear: 3, percent: 10 },
      { id: 'second-step', kind: 'step', fromYear: 3, percent: 5 },
    ]);

    expect(results[1].kaltmieteProMonat).toBeCloseTo(1201.5465, 5);
    expect(results[2].kaltmieteProMonat).toBeCloseTo(1201.5465, 5);
    expect(results[3].kaltmieteProMonat).toBeCloseTo(1201.5465, 5);
    expect(results[1].kaltmieteProSqm).toBeCloseTo(12.015465, 5);
    expect(results.slice(1).every((result) => result.istWirksam)).toBe(true);
  });

  it('marks a duplicate annual rate in the same start year as ineffective', () => {
    const results = calculateRentRuleResults(1000, 100, [
      { id: 'first-rate', kind: 'rate', fromYear: 2, percentPerYear: 2 },
      { id: 'ignored-rate', kind: 'rate', fromYear: 2, percentPerYear: 10 },
    ]);

    expect(results[0].kaltmieteProMonat).toBe(1020);
    expect(results[1].kaltmieteProMonat).toBe(1020);
    expect(results[0].istWirksam).toBe(true);
    expect(results[1].istWirksam).toBe(false);
  });
});

describe('rent engine - projectCosts', () => {
  it('should project costs with perSqm maintenance', () => {
    const input: KostenInput = {
      kostenErfassungMode: 'detailliert',
      maintenanceMode: 'perSqm',
      instandhaltungProSqm: 10, // 10 EUR / sqm / year
      instandhaltungPctRent: 0,
      instandhaltungAbsolut: 0,
      ruecklagenAnteilPct: 0,
      verwaltungProJahr: 300,
      sonstigeKostenProJahr: 200,
      kostensteigerungPctPa: 2
    };

    // Year 1:
    // Instandhaltung = 10 * 50 = 500
    // Verwaltung = 300
    // Sonstige = 200
    // Summe = 1000
    const projection = projectCosts(input, 50, [12000, 12240], 2);
    expect(projection.length).toBe(2);
    expect(projection[0].jahr).toBe(1);
    expect(projection[0].instandhaltung).toBe(500);
    expect(projection[0].verwaltung).toBe(300);
    expect(projection[0].sonstigeKosten).toBe(200);
    expect(projection[0].summeKosten).toBe(1000);

    // Year 2: +2%
    expect(projection[1].jahr).toBe(2);
    expect(projection[1].instandhaltung).toBeCloseTo(510, 4);
    expect(projection[1].verwaltung).toBeCloseTo(306, 4);
    expect(projection[1].sonstigeKosten).toBeCloseTo(204, 4);
    expect(projection[1].summeKosten).toBeCloseTo(1020, 4);
  });

  it('should project costs with percentRent maintenance', () => {
    const input: KostenInput = {
      kostenErfassungMode: 'detailliert',
      maintenanceMode: 'percentRent',
      instandhaltungProSqm: 0,
      instandhaltungPctRent: 10, // 10% of rent
      instandhaltungAbsolut: 0,
      ruecklagenAnteilPct: 0,
      verwaltungProJahr: 200,
      sonstigeKostenProJahr: 100,
      kostensteigerungPctPa: 3
    };

    // Year 1:
    // Rent = 12000 -> Instandhaltung = 1200
    // Verwaltung = 200, Sonstige = 100
    // Summe = 1500
    const projection = projectCosts(input, 50, [12000, 13000], 2);
    expect(projection[0].instandhaltung).toBe(1200);
    expect(projection[0].summeKosten).toBe(1500);

    // Year 2:
    // Rent = 13000 -> Instandhaltung = 1300 (no cost growth rate applied directly to this)
    // Verwaltung = 200 * 1.03 = 206
    // Sonstige = 100 * 1.03 = 103
    // Summe = 1300 + 206 + 103 = 1609
    expect(projection[1].instandhaltung).toBe(1300);
    expect(projection[1].verwaltung).toBeCloseTo(206, 4);
    expect(projection[1].sonstigeKosten).toBeCloseTo(103, 4);
    expect(projection[1].summeKosten).toBeCloseTo(1609, 4);
  });

  it('ignores Wirtschaftsplan values when the detailed method is active', () => {
    const input: KostenInput = {
      kostenErfassungMode: 'detailliert',
      umlagefaehigeKostenProJahr: 99999,
      nichtUmlagefaehigeKostenProJahr: 99999,
      wegRuecklageProJahr: 99999,
      maintenanceMode: 'absolute',
      instandhaltungProSqm: 0,
      instandhaltungPctRent: 0,
      instandhaltungAbsolut: 500,
      ruecklagenAnteilPct: 20,
      verwaltungProJahr: 300,
      sonstigeKostenProJahr: 200,
      kostensteigerungPctPa: 0,
    };

    const [year1] = projectCosts(input, 40, [3600], 1, 10);

    expect(year1.summeKosten).toBe(1000);
    expect(year1.instandhaltung).toBe(500);
    expect(year1.verwaltung).toBe(300);
    expect(year1.sonstigeKosten).toBe(200);
    expect(year1.umlagefaehigeKosten).toBe(0);
    expect(year1.nichtUmlagefaehigeKosten).toBe(900);
    expect(year1.wegRuecklage).toBe(100);
  });

  it('maps Wirtschaftsplan sums and charges the vacancy share of apportionable costs', () => {
    const input: KostenInput = {
      kostenErfassungMode: 'wirtschaftsplan',
      umlagefaehigeKostenProJahr: 1194.99,
      nichtUmlagefaehigeKostenProJahr: 554.06,
      wegRuecklageProJahr: 456,
      ruecklagenVerwendungPct: 50,
      ruecklagenVerzoegerungJahre: 5,
      maintenanceMode: 'absolute',
      instandhaltungProSqm: 0,
      instandhaltungPctRent: 0,
      instandhaltungAbsolut: 9999,
      ruecklagenAnteilPct: 85,
      verwaltungProJahr: 9999,
      sonstigeKostenProJahr: 9999,
      kostensteigerungPctPa: 2,
    };

    const projection = projectCosts(input, 40.55, [3600, 3600], 2, 3);
    const year1 = projection[0];

    expect(year1.umlagefaehigeKosten).toBeCloseTo(1194.99, 6);
    expect(year1.leerstandsbedingteUmlagekosten).toBeCloseTo(35.8497, 6);
    expect(year1.nichtUmlagefaehigeKosten).toBeCloseTo(554.06, 6);
    expect(year1.wegRuecklage).toBeCloseTo(456, 6);
    expect(year1.sofortAbziehbareKosten).toBeCloseTo(589.9097, 6);
    expect(year1.summeKosten).toBeCloseTo(1045.9097, 6);
    // Inaktive Detailwerte werden im Wirtschaftsplan-Modus nicht mitgerechnet.
    expect(year1.instandhaltung).toBe(0);
    expect(year1.verwaltung).toBe(0);
    expect(year1.sonstigeKosten).toBe(0);

    expect(projection[1].umlagefaehigeKosten).toBeCloseTo(1194.99 * 1.02, 6);
    expect(projection[1].nichtUmlagefaehigeKosten).toBeCloseTo(554.06 * 1.02, 6);
    expect(projection[1].wegRuecklage).toBeCloseTo(456 * 1.02, 6);
    expect(projection[1].summeKosten).toBeCloseTo(1045.9097 * 1.02, 6);
  });

  it('adds SEV as a deductible owner cost and grows it in the detailed mode', () => {
    const input: KostenInput = {
      kostenErfassungMode: 'detailliert',
      maintenanceMode: 'absolute',
      instandhaltungProSqm: 0,
      instandhaltungPctRent: 0,
      instandhaltungAbsolut: 0,
      ruecklagenAnteilPct: 0,
      verwaltungProJahr: 0,
      sonstigeKostenProJahr: 0,
      sevProJahr: 300,
      kostensteigerungPctPa: 2,
    };

    const projection = projectCosts(input, 50, [12000, 12240], 2);
    // Jahr 1: SEV ist sofort abziehbar und Teil des Cashouts.
    expect(projection[0].sev).toBe(300);
    expect(projection[0].sofortAbziehbareKosten).toBe(300);
    expect(projection[0].summeKosten).toBe(300);
    // Jahr 2: waechst mit der allgemeinen Kostensteigerung.
    expect(projection[1].sev).toBeCloseTo(306, 6);
    expect(projection[1].sofortAbziehbareKosten).toBeCloseTo(306, 6);
  });

  it('adds SEV on top of the Wirtschaftsplan sums without polluting the non-apportionable sum', () => {
    const input: KostenInput = {
      kostenErfassungMode: 'wirtschaftsplan',
      umlagefaehigeKostenProJahr: 0,
      nichtUmlagefaehigeKostenProJahr: 500,
      wegRuecklageProJahr: 100,
      ruecklagenVerwendungPct: 50,
      ruecklagenVerzoegerungJahre: 5,
      maintenanceMode: 'absolute',
      instandhaltungProSqm: 0,
      instandhaltungPctRent: 0,
      instandhaltungAbsolut: 0,
      ruecklagenAnteilPct: 0,
      verwaltungProJahr: 0,
      sonstigeKostenProJahr: 0,
      sevProJahr: 240,
      kostensteigerungPctPa: 2,
    };

    const projection = projectCosts(input, 50, [12000, 12240], 2, 0);
    // SEV bleibt aus der Wirtschaftsplansumme heraus, ist aber sofort abziehbar.
    expect(projection[0].sev).toBe(240);
    expect(projection[0].nichtUmlagefaehigeKosten).toBe(500);
    expect(projection[0].sofortAbziehbareKosten).toBe(740); // 500 + 0 Leerstand + 240 SEV
    expect(projection[0].summeKosten).toBe(840); // 740 + 100 Ruecklage
    expect(projection[1].sev).toBeCloseTo(244.8, 6);
  });

  it('defaults SEV to zero when the field is absent', () => {
    const input: KostenInput = {
      kostenErfassungMode: 'detailliert',
      maintenanceMode: 'absolute',
      instandhaltungProSqm: 0,
      instandhaltungPctRent: 0,
      instandhaltungAbsolut: 400,
      ruecklagenAnteilPct: 0,
      verwaltungProJahr: 0,
      sonstigeKostenProJahr: 0,
      kostensteigerungPctPa: 0,
    };

    const [year1] = projectCosts(input, 50, [12000], 1);
    expect(year1.sev).toBe(0);
    expect(year1.summeKosten).toBe(400);
  });
});
