import type { Scenario, Sanierungsmassnahme } from './types';

export interface RenovationYearProjection {
  jahr: number;
  auszahlung: number;
  sofortWerbungskosten: number;
  verteilteWerbungskosten: number;
  werbungskosten: number;
  herstellungsAfa: number;
  denkmalAfa: number;
  afa: number;
}

function linearAfaForYear(
  massnahme: Sanierungsmassnahme,
  jahr: number,
  linearRate: number,
): number {
  const relativeYear = jahr - massnahme.jahr + 1;
  if (relativeYear < 1 || linearRate <= 0 || massnahme.betrag <= 0) return 0;

  const annualAfa = massnahme.betrag * linearRate;
  const alreadyDepreciated = Math.min(massnahme.betrag, annualAfa * (relativeYear - 1));
  return Math.min(massnahme.betrag - alreadyDepreciated, annualAfa);
}

function denkmalAfaForYear(massnahme: Sanierungsmassnahme, jahr: number): number {
  const relativeYear = jahr - massnahme.jahr + 1;
  if (relativeYear >= 1 && relativeYear <= 8) return massnahme.betrag * 0.09;
  if (relativeYear >= 9 && relativeYear <= 12) return massnahme.betrag * 0.07;
  return 0;
}

/**
 * Projiziert geplante Sanierungen ohne Seiteneffekte. Die Auszahlung erfolgt vollstaendig
 * im Massnahmenjahr; steuerliche Abzuege folgen der je Massnahme gewaehlten Steuerart.
 */
export function projectRenovations(scenario: Scenario, years: number): RenovationYearProjection[] {
  if (years <= 0) return [];

  const massnahmen = scenario.sanierungen ?? [];
  const linearRate = Math.max(0, scenario.afa.linearSatzPct) / 100;

  return Array.from({ length: years }, (_, index) => {
    const jahr = index + 1;
    let auszahlung = 0;
    let sofortWerbungskosten = 0;
    let verteilteWerbungskosten = 0;
    let herstellungsAfa = 0;
    let denkmalAfa = 0;

    for (const massnahme of massnahmen) {
      if (massnahme.jahr === jahr) auszahlung += massnahme.betrag;

      if (massnahme.steuerart === 'sofort' && massnahme.jahr === jahr) {
        sofortWerbungskosten += massnahme.betrag;
      }

      if (massnahme.steuerart === 'verteilt' || massnahme.steuerart === 'denkmal11b') {
        const relativeYear = jahr - massnahme.jahr + 1;
        if (relativeYear >= 1 && relativeYear <= massnahme.verteilungsJahre) {
          verteilteWerbungskosten += massnahme.betrag / massnahme.verteilungsJahre;
        }
      }

      if (massnahme.steuerart === 'herstellung') {
        herstellungsAfa += linearAfaForYear(massnahme, jahr, linearRate);
      } else if (massnahme.steuerart === 'denkmal7i') {
        denkmalAfa += denkmalAfaForYear(massnahme, jahr);
      }
    }

    const werbungskosten = sofortWerbungskosten + verteilteWerbungskosten;
    const afa = herstellungsAfa + denkmalAfa;

    return {
      jahr,
      auszahlung,
      sofortWerbungskosten,
      verteilteWerbungskosten,
      werbungskosten,
      herstellungsAfa,
      denkmalAfa,
      afa,
    };
  });
}

/** Aktivierte, bis einschliesslich Exitjahr ausgefuehrte Sanierungskosten. */
export function activatedRenovationCostsThroughYear(scenario: Scenario, exitYear: number): number {
  return (scenario.sanierungen ?? []).reduce((sum, massnahme) => {
    const activated = massnahme.steuerart === 'herstellung' || massnahme.steuerart === 'denkmal7i';
    return activated && massnahme.jahr <= exitYear ? sum + massnahme.betrag : sum;
  }, 0);
}
