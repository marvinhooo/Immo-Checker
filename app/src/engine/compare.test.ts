import { describe, expect, it } from 'vitest';
import { createDefaultScenario } from './defaults';
import { runSensitivity, generateTornadoData, calculateEtfComparison, calculateEtfYearlyHistory } from './compare';

describe('Compare Engine', () => {
  it('runs sensitivity mutations correctly', () => {
    const scenario = createDefaultScenario();
    
    // Test base sollzins mutation
    const baseSollzins = scenario.finanzierung.sollzinsPct;
    const { metrics: sensitivityMetrics } = runSensitivity(scenario, { sollzinsPct: baseSollzins + 1 });
    
    // Increased interest rate should lead to a lower IRR
    const { metrics: baseMetrics } = runSensitivity(scenario, {});
    expect(sensitivityMetrics.irr).toBeLessThan(baseMetrics.irr);
  });

  it('applies value-growth sensitivity even when no rate rule exists', () => {
    const scenario = createDefaultScenario({
      wertentwicklung: {
        szenario: [
          { id: 'step-only', kind: 'step', fromYear: 3, percent: 5 },
        ],
      },
    });

    const base = runSensitivity(scenario, {}).projection;
    const stressed = runSensitivity(scenario, { wertsteigerungPct: 3 }).projection;

    expect(stressed.years[0].immobilienwert).toBeGreaterThan(base.years[0].immobilienwert);
    expect(stressed.years[2].immobilienwert).toBeGreaterThan(base.years[2].immobilienwert);
  });

  it('generates tornado data points', () => {
    const scenario = createDefaultScenario();
    const data = generateTornadoData(scenario);
    
    expect(data).toHaveLength(4);
    expect(data.map(p => p.parameter)).toContain('sollzinsPct');
    expect(data.map(p => p.parameter)).toContain('leerstandPct');
    expect(data.map(p => p.parameter)).toContain('wertsteigerungPct');
    expect(data.map(p => p.parameter)).toContain('anschlusszinsPct');
    
    // Low interest rate should yield higher IRR than high interest rate
    const sollzinsPoint = data.find(p => p.parameter === 'sollzinsPct')!;
    expect(sollzinsPoint.lowIrr).toBeGreaterThan(sollzinsPoint.highIrr);
  });

  it('uses zero value growth baseline in tornado data when no rate rule exists', () => {
    const scenario = createDefaultScenario({
      wertentwicklung: {
        szenario: [
          { id: 'step-only', kind: 'step', fromYear: 3, percent: 5 },
        ],
      },
    });

    const data = generateTornadoData(scenario);
    const wertsteigerungPoint = data.find(p => p.parameter === 'wertsteigerungPct')!;

    expect(wertsteigerungPoint.baseVal).toBe(0);
    expect(wertsteigerungPoint.lowVal).toBe(0);
    expect(wertsteigerungPoint.highVal).toBe(1);
  });

  it('calculates etf comparison correctly', () => {
    const scenario = createDefaultScenario();
    
    // Run comparison with 5% ETF yield
    const comparison = calculateEtfComparison(scenario, 5.0);
    
    expect(comparison.totalInvested).toBeGreaterThanOrEqual(comparison.immoEndvermoegen * 0.05); // just sanity check
    expect(comparison.etfEndvermoegen).toBeGreaterThan(0);
    expect(comparison.immoEndvermoegen).toBeDefined();
    expect(comparison.difference).toBe(comparison.immoEndvermoegen - comparison.etfEndvermoegen);
  });

  it('calculates yearly etf and immo history correctly', () => {
    const scenario = createDefaultScenario();
    const history = calculateEtfYearlyHistory(scenario, 5.0);
    
    expect(history.length).toBe(scenario.exit.haltedauerJahre);
    expect(history[0].jahr).toBe(1);
    expect(history[0].immoVermoegen).toBeDefined();
    expect(history[0].etfVermoegen).toBeGreaterThan(0);
  });

  it('does not subtract negative immo cashflows twice in ETF comparison', () => {
    const scenario = createDefaultScenario({
      objekt: {
        kaufpreis: 100000,
        wohnflaeche: 50,
        fertigstellungsjahr: 2000,
        bundesland: 'BY',
        objektTyp: 'bestand',
        bodenwertAnteilPct: 20,
        sanierungskosten: 0,
      },
      knk: {
        grestPct: 0,
        notarPct: 0,
        maklerPct: 0,
        mitfinanzieren: false,
      },
      finanzierung: {
        equityMode: 'absolute',
        equityPct: 100,
        equityAbsolute: 100000,
        sollzinsPct: 0,
        tilgungPct: 0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 0,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
      miete: {
        rentMode: 'perMonth',
        kaltmieteProMonat: 0,
        kaltmieteProSqm: 0,
        leerstandPct: 0,
        steigerungen: [],
      },
      kosten: {
        maintenanceMode: 'absolute',
        instandhaltungProSqm: 0,
        instandhaltungPctRent: 0,
        instandhaltungAbsolut: 10000,
        verwaltungProJahr: 0,
        sonstigeKostenProJahr: 0,
        kostensteigerungPctPa: 0,
      },
      steuer: {
        taxMode: 'marginalRate',
        bruttoJahresEinkommen: 0,
        grenzsteuersatzPct: 0,
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      },
      afa: {
        modus: 'linear',
        linearSatzPct: 0,
      },
      wertentwicklung: {
        szenario: [],
      },
      exit: {
        haltedauerJahre: 2,
        verkaufsnebenkostenPct: 0,
        vorfaelligkeitPct: 0,
      },
    });

    const comparison = calculateEtfComparison(scenario, 0);

    expect(comparison.totalInvested).toBeCloseTo(120000, 2);
    expect(comparison.etfEndvermoegen).toBeCloseTo(120000, 2);
    expect(comparison.immoEndvermoegen).toBeCloseTo(100000, 2);
    expect(comparison.difference).toBeCloseTo(-20000, 2);
  });
});
