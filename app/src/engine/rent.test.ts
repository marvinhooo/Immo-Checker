import { describe, it, expect } from 'vitest';
import { projectRent, projectCosts } from './rent';
import { MieteInput, KostenInput } from './types';

describe('rent engine - projectRent', () => {
  it('should project rent in monthly mode', () => {
    const input: MieteInput = {
      rentMode: 'perMonth',
      kaltmieteProMonat: 1000,
      kaltmieteProSqm: 0,
      leerstandPct: 5,
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
      kaltmieteProSqm: 15,
      leerstandPct: 0,
      steigerungen: []
    };

    const projection = projectRent(input, 80, 2);
    // Base: 15 * 80 * 12 = 14400
    expect(projection[0].bruttoKaltmiete).toBe(14400);
    expect(projection[1].bruttoKaltmiete).toBe(14400);
  });
});

describe('rent engine - projectCosts', () => {
  it('should project costs with perSqm maintenance', () => {
    const input: KostenInput = {
      maintenanceMode: 'perSqm',
      instandhaltungProSqm: 10, // 10 EUR / sqm / year
      instandhaltungPctRent: 0,
      instandhaltungAbsolut: 0,
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
      maintenanceMode: 'percentRent',
      instandhaltungProSqm: 0,
      instandhaltungPctRent: 10, // 10% of rent
      instandhaltungAbsolut: 0,
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
});
