import { Scenario } from './types';
import { runProjection, ProjectionResult } from './projection';
import { knkAmount } from './derive';
import { applyFlatTaxSurchargesWithSoliFreigrenze, calculateTotalTax } from './tax';
import { activatedRenovationCostsThroughYear } from './renovation';

export interface ExitResult {
  verkaufspreis: number;
  verkaufsnebenkosten: number;
  restschuld: number;
  vorfaelligkeitsEntschaedigung: number;
  ruecklagenRestwert: number;
  nettoVerkaufserloes: number; // vor Spekulationssteuer; Ruecklagen-Preiswirkung steckt ggf. im Verkaufspreis
  aktivierteSanierungskosten: number;
  spekulationsGewinn: number;
  spekulationssteuer: number;
  nettoVerkaufserloesNachSteuer: number; // nettoVerkaufserloes - spekulationssteuer
}

/**
 * Berechnet den Verkaufserlös, die Spekulationssteuer und den Netto-Verkaufserlös
 * am Ende der Haltedauer.
 *
 * @param scenario Das aktive Szenario
 * @param projection Optionale, bereits berechnete Projektion
 */
export function calculateExit(scenario: Scenario, projection?: ProjectionResult): ExitResult {
  const h = Math.max(1, scenario.exit.haltedauerJahre);
  const proj = projection || runProjection(scenario, h);

  // Finde das Jahr h (oder das letzte verfügbare Jahr der Projektion)
  const yearData = proj.years.find(y => y.jahr === h) || proj.years[proj.years.length - 1];

  const restschuld = yearData.restschuld;
  // Die Projektion liefert den nach etwaigen modellierten Verwendungen verbleibenden Bestand.
  // Ein positiver konfigurierter Anteil ist nur eine geschaetzte Marktpreiswirkung:
  // Es gibt keinen separaten Auszahlungsanspruch gegen die WEG. Deshalb wird die Wirkung
  // in den Verkaufspreis einbezogen und ist auch Basis prozentualer Verkaufskosten sowie
  // eines etwaigen Gewinns nach § 23 EStG.
  const ruecklagenRestwertPct = Math.min(100, Math.max(0, scenario.kosten.ruecklagenRestwertPct ?? 0));
  const ruecklagenRestwert = yearData.kumulierteRuecklage * (ruecklagenRestwertPct / 100);
  const verkaufspreis = yearData.immobilienwert + ruecklagenRestwert;

  const verkaufsnebenkosten = scenario.exit.verkaufsnebenkostenMode === 'absolute'
    ? Math.max(0, scenario.exit.verkaufsnebenkostenAbsolut)
    : (verkaufspreis * scenario.exit.verkaufsnebenkostenPct) / 100;

  // Vorfälligkeitsentschädigung, falls vor Ende der Zinsbindung verkauft wird
  const vorfaelligkeitsEntschaedigung = h < scenario.finanzierung.zinsbindungJahre
    ? (restschuld * scenario.exit.vorfaelligkeitPct) / 100
    : 0;

  const nettoVerkaufserloes = verkaufspreis
    - verkaufsnebenkosten
    - restschuld
    - vorfaelligkeitsEntschaedigung;

  // Spekulationssteuer nach § 23 Abs. 1 Nr. 1 EStG: steuerpflichtig, wenn der Zeitraum
  // zwischen Anschaffung und Veraeusserung nicht mehr als zehn Jahre betraegt.
  // Im Jahresraster heisst das: Exit am Ende von Jahr h ist bis einschliesslich h = 10
  // steuerpflichtig; steuerfrei erst ab h >= 11.
  const kumulierteAfa = proj.years.slice(0, h).reduce((sum, y) => sum + y.afa, 0);
  const kaufpreis = scenario.objekt.kaufpreis;
  const knk = knkAmount(scenario);
  const aktivierteSanierungskosten = activatedRenovationCostsThroughYear(scenario, h);
  const anschaffungsUndHerstellungskosten = kaufpreis
    + knk
    + scenario.objekt.sanierungskosten
    + aktivierteSanierungskosten;

  // Gewinn = Verkaufspreis - Verkaufskosten - Vorfaelligkeit - (Kaufpreis + KNK + Herstellungskosten) + kumulierte AfA
  const spekulationsGewinn = Math.max(
    0,
    verkaufspreis
      - verkaufsnebenkosten
      - vorfaelligkeitsEntschaedigung
      - anschaffungsUndHerstellungskosten
      + kumulierteAfa
  );

  const steuerpflichtigerSpekulationsGewinn = h <= 10 && spekulationsGewinn >= 1000 ? spekulationsGewinn : 0;

  let spekulationssteuer = 0;
  if (steuerpflichtigerSpekulationsGewinn > 0) {
    const { taxMode, bruttoJahresEinkommen, grenzsteuersatzPct, veranlagung, soli, kirchensteuerPct } = scenario.steuer;
    if (taxMode === 'marginalRate') {
      spekulationssteuer = applyFlatTaxSurchargesWithSoliFreigrenze(
        steuerpflichtigerSpekulationsGewinn * (grenzsteuersatzPct / 100),
        soli,
        kirchensteuerPct,
        veranlagung === 'splitting'
      );
    } else {
      const zvEAfterSaleYearVv = bruttoJahresEinkommen + yearData.vvErgebnis;
      const t1 = calculateTotalTax(Math.max(0, zvEAfterSaleYearVv), veranlagung === 'splitting', soli, kirchensteuerPct);
      const t2 = calculateTotalTax(Math.max(0, zvEAfterSaleYearVv + steuerpflichtigerSpekulationsGewinn), veranlagung === 'splitting', soli, kirchensteuerPct);
      spekulationssteuer = t2 - t1;
    }
  }

  const nettoVerkaufserloesNachSteuer = nettoVerkaufserloes - spekulationssteuer;

  return {
    verkaufspreis,
    verkaufsnebenkosten,
    restschuld,
    vorfaelligkeitsEntschaedigung,
    ruecklagenRestwert,
    nettoVerkaufserloes,
    aktivierteSanierungskosten,
    spekulationsGewinn,
    spekulationssteuer,
    nettoVerkaufserloesNachSteuer,
  };
}
