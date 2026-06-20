# Immobilien-Investment-Checker

Lokale React-Web-App zur Bewertung einer Immobilie als Kapitalanlage: Finanzierung,
Miete, laufende Kosten, AfA/Steuervorteile, Wertsteigerung und Verkauf &mdash; mit
Cashflow-/Vermoegensprojektion und Rendite-Kennzahlen (IRR, ROE, Netto-Mietrendite).

## Stack
React + Vite + TypeScript (strict) + TailwindCSS (v4) + Recharts + Zustand + Vitest.
100 % client-seitig, kein Backend. Persistenz via localStorage.

## Setup
```bash
npm install
npm run dev        # Dev-Server
npm run build      # Typecheck + Production-Build
npm run test       # Unit-Tests (Vitest)
npm run typecheck  # nur Typpruefung
npm run lint       # ESLint
```

## Architektur
Strikte Trennung: reiner, UI-freier Rechenkern (`src/engine/*`, voll unit-getestet) vs. UI (`src/app`, `src/components`).

- `src/engine/*` &mdash; Rechenkern
  - `types.ts` Datenmodell, `constants.ts` Stammdaten (GrESt je Bundesland, lineare AfA nach Baujahr)
  - `derive.ts` abgeleitete Werte (KNK, Eigenkapital, Darlehen, Disagio), `defaults.ts` Default-Szenario
  - `financing.ts` Tilgungsplan (Annuität, Zinsbindung, Anschlusszins, Sondertilgung)
  - `timeline.ts` flexible Zeitreihen (Stufen + Raten), `rent.ts` Miet-/Bewirtschaftungsprojektion
  - `afa.ts` AfA (linear/degressiv/§7b/Denkmal §7i), `tax.ts` ESt-Tarif §32a + Steuereffekt
  - `projection.ts` Jahr-für-Jahr-Projektion, `exit.ts` Verkauf/Spekulationssteuer
  - `metrics.ts` Kennzahlen + IRR-Solver, `holding.ts` Haltedauer-/Exit-Jahr-Analyse
  - `compare.ts` Szenario-/Sensitivitäts-/ETF-Vergleich
- `src/store/*` &mdash; Zustand-Store + localStorage-Persistenz (mit Schema-Validierung bei Hydration)
- `src/lib/*` &mdash; `format.ts` (de-DE Zahlen/EUR/%), `io.ts` (JSON-Im-/Export, CSV, Validierung)
- `src/app/*`, `src/components/ui/*` &mdash; UI (Eingabeformular, Dashboard, Charts, Primitives)

## Fachliche Hinweise & Annahmen
Steuer-/AfA-Werte (ESt-Tarif, AfA-Sätze, Grunderwerbsteuer) liegen als **konfigurierbare Tabellen** vor
(Stand: Veranlagungsjahr **2026**) und sind in der UI editierbar. Wesentliche Vereinfachungen:
- Steuereffekt V&amp;V über Tarif-Delta `ESt(zvE+V&V) − ESt(zvE)` (oder fester Grenzsteuersatz). Nur Zinsen, AfA und nicht-umlagefähige Kosten sind abzugsfähig (Tilgung nicht).
- Spekulationssteuer §23 EStG: Grenzsteuersatz × Gewinn (inkl. genutzter AfA); ab 10 Jahren steuerfrei.
- Wert-/Mietentwicklung szenariobasiert (keine Marktprognose); Leerstand als pauschales Mietausfallwagnis.

Das Tool ist eine **Schätzung und ersetzt keine Steuer- oder Anlageberatung**.

## Steuer-/Tarif-Update (jährlich)
Die steuerlichen Kennzahlen sind bewusst zentral abgelegt, damit ein Jahres-Update trivial ist:
- **ESt-Tarif §32a** (Koeffizienten der Tarifzonen): `src/engine/tax.ts` → Funktion `incomeTax`.
- **Grunderwerbsteuer & lineare AfA-Sätze**: `src/engine/constants.ts` (`GREST_BY_BUNDESLAND`, `linearAfaRateForYear`).
- **Soli-Freigrenzen**: `src/engine/tax.ts` → `calculateTotalTax`.
Nach Anpassung die Referenzwerte in `src/engine/tax.test.ts` aktualisieren und `npm run test` ausführen.

Stories und Anforderungen: siehe `../PRD.md`.
