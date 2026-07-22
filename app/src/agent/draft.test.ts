import { describe, expect, it } from 'vitest';
import { confirmAgentField, getAgentCompleteness, reconcileAgentReview } from './contract';
import { createAgentDraftExample, materializeAgentDraft, parseAgentDraft } from './draft';
import { createAgentSnapshot } from './snapshot';

describe('Agent-Draft-Vertrag', () => {
  it('materialisiert partielle Quelldaten und markiert fehlende Pflichtangaben explizit', () => {
    const scenario = materializeAgentDraft(createAgentDraftExample());

    expect(scenario.name).toBe('Objekt Musterstrasse');
    expect(scenario.objekt.kaufpreis).toBe(275000);
    expect(scenario.objekt.wohnflaeche).toBe(68);
    expect(scenario.agentReview?.fields['/objekt/kaufpreis']).toMatchObject({
      status: 'uncertain',
      origin: 'extracted',
      required: true,
      confidence: 0.98,
    });
    expect(scenario.agentReview?.fields['/finanzierung/sollzinsPct']).toMatchObject({
      status: 'missing',
      origin: 'assumption',
      required: true,
    });
    expect(scenario.agentReview?.fields['/objekt/grundstuecksflaeche']).toMatchObject({
      status: 'missing',
      origin: 'assumption',
      required: true,
    });
    expect(scenario.agentReview?.fields['/objekt/miteigentumsanteilZaehler']).toMatchObject({
      status: 'missing',
      required: true,
    });
    expect(scenario.agentReview?.fields['/objekt/miteigentumsanteilNenner']).toMatchObject({
      status: 'missing',
      required: true,
    });
    expect(scenario.agentReview?.fields['/exit/verkaufsnebenkostenMode']).toMatchObject({
      status: 'missing',
      required: true,
    });
    expect(scenario.agentReview?.fields['/exit/verkaufsnebenkostenPct']).toMatchObject({
      status: 'missing',
      required: true,
    });
    expect(getAgentCompleteness(scenario.agentReview).provisional).toBe(true);
  });

  it('leitet den Pauschalmodus aus allein gelieferten absoluten Verkaufskosten ab', () => {
    const draft = createAgentDraftExample();
    draft.operations.push({
      op: 'set',
      path: '/exit/verkaufsnebenkostenAbsolut',
      value: 4200,
      origin: 'extracted',
      confidence: 0.9,
    });

    const scenario = materializeAgentDraft(draft);

    expect(scenario.exit.verkaufsnebenkostenMode).toBe('absolute');
    expect(scenario.exit.verkaufsnebenkostenAbsolut).toBe(4200);
    expect(scenario.agentReview?.fields['/exit/verkaufsnebenkostenMode']).toMatchObject({
      status: 'uncertain',
      origin: 'derived',
      required: true,
    });
    expect(scenario.agentReview?.fields['/exit/verkaufsnebenkostenAbsolut']).toMatchObject({
      status: 'uncertain',
      required: true,
    });
  });

  it('leitet den Wirtschaftsplan-Modus aus direkt gelieferten Kostensummen ab', () => {
    const draft = createAgentDraftExample();
    draft.operations.push(
      { op: 'set', path: '/kosten/umlagefaehigeKostenProJahr', value: 1194.99, origin: 'extracted' },
      { op: 'set', path: '/kosten/nichtUmlagefaehigeKostenProJahr', value: 554.06, origin: 'extracted' },
      { op: 'set', path: '/kosten/wegRuecklageProJahr', value: 456, origin: 'extracted' },
    );

    const scenario = materializeAgentDraft(draft);

    expect(scenario.kosten.kostenErfassungMode).toBe('wirtschaftsplan');
    expect(scenario.agentReview?.fields['/kosten/kostenErfassungMode']).toMatchObject({
      status: 'uncertain',
      origin: 'derived',
      required: true,
    });
    expect(scenario.agentReview?.fields['/kosten/umlagefaehigeKostenProJahr']?.required).toBe(true);
    expect(scenario.agentReview?.fields['/kosten/maintenanceMode']).toBeUndefined();
  });

  it('bewahrt den inaktiven Prozentwert bei Bodenrichtwert, Grundstück und MEA', () => {
    const draft = createAgentDraftExample();
    draft.operations.push(
      { op: 'set', path: '/objekt/bodenrichtwertProSqm', value: 620, origin: 'extracted' },
      { op: 'set', path: '/objekt/grundstuecksflaeche', value: 550, origin: 'extracted' },
      { op: 'set', path: '/objekt/miteigentumsanteilZaehler', value: 57, origin: 'extracted' },
      { op: 'set', path: '/objekt/miteigentumsanteilNenner', value: 1000, origin: 'extracted' },
    );

    const scenario = materializeAgentDraft(draft);

    expect(scenario.objekt.bodenwertMode).toBe('perSqm');
    expect(scenario.objekt.bodenwertAnteilPct).toBe(30);
    expect(scenario.objekt.bodenrichtwertProSqm).toBe(620);
    expect(scenario.objekt.grundstuecksflaeche).toBe(550);
  });

  it('ueberschreibt explizit gelieferte Bodenwert-Rohangaben nicht gegenseitig', () => {
    const draft = createAgentDraftExample();
    draft.operations.push(
      { op: 'set', path: '/objekt/bodenwertMode', value: 'perSqm', origin: 'extracted' },
      { op: 'set', path: '/objekt/bodenwertAnteilPct', value: 17, origin: 'extracted' },
      { op: 'set', path: '/objekt/bodenrichtwertProSqm', value: 10000, origin: 'extracted' },
      { op: 'set', path: '/objekt/grundstuecksflaeche', value: 1000, origin: 'extracted' },
      { op: 'set', path: '/objekt/miteigentumsanteilZaehler', value: 1, origin: 'extracted' },
      { op: 'set', path: '/objekt/miteigentumsanteilNenner', value: 1, origin: 'extracted' },
    );

    const scenario = materializeAgentDraft(draft);
    expect(scenario.objekt.bodenwertAnteilPct).toBe(17);
    expect(scenario.objekt.bodenrichtwertProSqm).toBe(10000);
  });

  it('haelt einen allein gelieferten MEA-Zaehler als partiellen Entwurf offen', () => {
    const draft = createAgentDraftExample();
    draft.operations.push({
      op: 'set',
      path: '/objekt/miteigentumsanteilZaehler',
      value: 57,
      origin: 'extracted',
    });

    const scenario = materializeAgentDraft(draft);

    expect(scenario.objekt.miteigentumsanteilZaehler).toBe(57);
    expect(scenario.objekt.miteigentumsanteilNenner).toBe(0);
    expect(scenario.agentReview?.fields['/objekt/miteigentumsanteilNenner']).toMatchObject({
      status: 'missing',
      required: true,
    });
  });

  it('verlangt bei zwei gelieferten Verkaufskosten einen expliziten Modus', () => {
    const draft = createAgentDraftExample();
    draft.operations.push(
      { op: 'set', path: '/exit/verkaufsnebenkostenPct', value: 3, origin: 'extracted' },
      { op: 'set', path: '/exit/verkaufsnebenkostenAbsolut', value: 2500, origin: 'extracted' },
    );

    expect(() => materializeAgentDraft(draft)).toThrow(
      'Mehrere Verkaufsnebenkosten benoetigen eine explizite Operation'
    );
  });

  it('leitet Mietmodus und synchronisierte Mietwerte deterministisch ab', () => {
    const draft = createAgentDraftExample();
    draft.operations.push({
      op: 'set',
      path: '/miete/kaltmieteProJahr',
      value: 14400,
      origin: 'extracted',
      confidence: 0.9,
    });

    const scenario = materializeAgentDraft(draft);

    expect(scenario.miete.rentMode).toBe('perYear');
    expect(scenario.miete.kaltmieteProMonat).toBe(1200);
    expect(scenario.miete.kaltmieteProSqm).toBeCloseTo(1200 / 68, 8);
    expect(scenario.agentReview?.fields['/miete/rentMode']).toMatchObject({
      status: 'uncertain',
      origin: 'derived',
      required: true,
    });
  });

  it('weist unbekannte, doppelte und reservierte Schreibpfade ab', () => {
    const draft = createAgentDraftExample();
    draft.operations.push({
      op: 'set',
      path: '/id',
      value: 'fremde-id',
      origin: 'extracted',
    });
    expect(() => parseAgentDraft(draft)).toThrow('ist nicht schreibbar');

    const duplicate = createAgentDraftExample();
    duplicate.operations.push({ ...duplicate.operations[0] });
    expect(() => parseAgentDraft(duplicate)).toThrow('kommt mehrfach vor');
  });

  it('validiert Belegquellen, Konfidenz und fachliche Werte', () => {
    const unknownSource = createAgentDraftExample();
    unknownSource.operations[0].evidence = [{ sourceId: 'unbekannt', page: 1 }];
    expect(() => parseAgentDraft(unknownSource)).toThrow('Unbekannte Quelle');

    const invalidConfidence = createAgentDraftExample();
    invalidConfidence.operations[0].confidence = 1.5;
    expect(() => parseAgentDraft(invalidConfidence)).toThrow('zwischen 0 und 1');

    const invalidPrice = createAgentDraftExample();
    invalidPrice.operations[0].value = -1;
    expect(() => materializeAgentDraft(invalidPrice)).toThrow('kaufpreis muss eine Zahl zwischen');
  });

  it('validiert Quellen-Hashes und Abrufzeitpunkte eindeutig', () => {
    const invalidHash = createAgentDraftExample();
    invalidHash.sources[0].sha256 = 'kein-hash';
    expect(() => parseAgentDraft(invalidHash)).toThrow('64 Hex-Zeichen');

    const invalidTimestamp = createAgentDraftExample();
    invalidTimestamp.sources[0].retrievedAt = 'irgendwann';
    expect(() => parseAgentDraft(invalidTimestamp)).toThrow('ISO-Zeitstempel');

    const timestampWithoutTimezone = createAgentDraftExample();
    timestampWithoutTimezone.sources[0].retrievedAt = '2026-07-16T12:00:00';
    expect(() => parseAgentDraft(timestampWithoutTimezone)).toThrow('ISO-Zeitstempel');

    const valid = createAgentDraftExample();
    valid.sources[0].sha256 = 'A'.repeat(64);
    valid.sources[0].retrievedAt = '2026-07-16T12:00:00.000Z';
    expect(parseAgentDraft(valid).sources[0]).toMatchObject({
      sha256: 'a'.repeat(64),
      retrievedAt: '2026-07-16T12:00:00.000Z',
    });
  });

  it('weist unerlaubte Envelope-Felder und unbeschraenkt tiefe JSON-Werte ab', () => {
    const extraKey = {
      ...createAgentDraftExample(),
      user_id: 'anderes-konto',
    };
    expect(() => parseAgentDraft(extraKey)).toThrow('unerlaubte Felder: user_id');

    const deeplyNested = createAgentDraftExample();
    deeplyNested.operations.push({
      op: 'set',
      path: '/sanierungen',
      value: [[[[[[[[[[[[]]]]]]]]]]]],
      origin: 'extracted',
    });
    expect(() => parseAgentDraft(deeplyNested)).toThrow('zu tief verschachtelt');
  });

  it('validiert strukturierte Regel- und Sanierungslisten bereits am Draft-Vertrag', () => {
    const invalidRule = createAgentDraftExample();
    invalidRule.operations.push({
      op: 'set',
      path: '/miete/steigerungen',
      value: [{ id: 'miete-1', kind: 'rate', fromYear: 0, percentPerYear: 2 }],
      origin: 'extracted',
    });
    expect(() => parseAgentDraft(invalidRule)).toThrow('fromYear');

    const invalidRenovation = createAgentDraftExample();
    invalidRenovation.operations.push({
      op: 'set',
      path: '/sanierungen',
      value: [{
        id: 'bad-1',
        bezeichnung: 'Dach',
        jahr: 2,
        betrag: 10000,
        steuerart: 'unbekannt',
        verteilungsJahre: 3,
        mieterhoehungMoeglich: false,
      }],
      origin: 'extracted',
    });
    expect(() => parseAgentDraft(invalidRenovation)).toThrow('steuerart');

    const valid = createAgentDraftExample();
    valid.operations.push({
      op: 'set',
      path: '/wertentwicklung/szenario',
      value: [{ id: 'wert-1', kind: 'step', fromYear: 3, percent: 5, wirksamAbMonat: 7 }],
      origin: 'extracted',
    });
    expect(parseAgentDraft(valid).operations.at(-1)?.value).toEqual(valid.operations.at(-1)?.value);
  });

  it('begrenzt Belege und Warnungen wie Remote-MCP und SQL', () => {
    const tooManyEvidence = createAgentDraftExample();
    tooManyEvidence.operations[0].evidence = Array.from({ length: 21 }, () => ({
      sourceId: tooManyEvidence.sources[0].id,
    }));
    expect(() => parseAgentDraft(tooManyEvidence)).toThrow('maximal 20');

    const tooManyWarnings = createAgentDraftExample();
    tooManyWarnings.warnings = Array.from({ length: 51 }, (_, index) => `Hinweis ${index + 1}`);
    expect(() => parseAgentDraft(tooManyWarnings)).toThrow('maximal 50');
  });

  it('bestaetigt ein Feld ohne Quellenbelege zu verlieren', () => {
    const scenario = materializeAgentDraft(createAgentDraftExample());
    const evidence = structuredClone(scenario.agentReview?.fields['/objekt/kaufpreis'].evidence);

    confirmAgentField(scenario, '/objekt/kaufpreis', '2026-07-16T12:00:00.000Z');

    expect(scenario.agentReview?.fields['/objekt/kaufpreis']).toMatchObject({
      status: 'confirmed',
      origin: 'user',
      reviewedAt: '2026-07-16T12:00:00.000Z',
      evidence,
    });
  });

  it('gleicht bedingte Pflichtfelder nach einem Moduswechsel ab', () => {
    const scenario = materializeAgentDraft(createAgentDraftExample());
    expect(scenario.agentReview?.fields['/finanzierung/equityPct']?.status).toBe('missing');

    scenario.finanzierung.equityMode = 'absolute';
    reconcileAgentReview(scenario, '2026-07-16T12:00:00.000Z');

    expect(scenario.agentReview?.fields['/finanzierung/equityPct']).toMatchObject({
      status: 'not_applicable',
      required: false,
    });
    expect(scenario.agentReview?.fields['/finanzierung/equityAbsolute']).toMatchObject({
      status: 'missing',
      required: true,
    });
  });

  it('begrenzt auch Objekt-Eingaben auf ein MB und bewahrt Agent-Warnungen', () => {
    const oversized = createAgentDraftExample();
    oversized.warnings = ['x'.repeat(1_000_001)];
    expect(() => parseAgentDraft(oversized)).toThrow('maximal 1 MB');

    const draft = createAgentDraftExample();
    draft.warnings = ['Wohnungsnummer im Exposé nicht eindeutig.'];
    const scenario = materializeAgentDraft(draft);
    expect(scenario.agentReview?.warnings).toEqual(draft.warnings);
  });

  it('exportiert eine agentenlesbare Auswertung mit Rohwerten und Einheiten', () => {
    const scenario = materializeAgentDraft(createAgentDraftExample());
    const snapshot = createAgentSnapshot(scenario);

    expect(snapshot.format).toBe('immo-checker-agent-snapshot');
    expect(snapshot.analysis.units.currency).toBe('EUR');
    expect(snapshot.analysis.metrics.irr).toEqual(expect.any(Number));
    expect(snapshot.analysis.firstYear?.monthlyCashflowAfterTax).toEqual(expect.any(Number));
    expect(snapshot.completeness.provisional).toBe(true);
    expect(snapshot.capabilities.tools.map((tool) => tool.name)).toEqual([
      'listScenarios',
      'getScenario',
      'stageDraft',
    ]);
  });
});
