# PRD_v1 - Immobilien-Investment-Checker

## Kurzdefinitionen
- PRD = Product Requirements Document (Anforderungsdokument)
- UI = User Interface (Benutzeroberflaeche)
- KPI = Key Performance Indicator (Kennzahl)
- AfA = Absetzung fuer Abnutzung (steuerliche Gebaeudeabschreibung)
- V&V = Einkuenfte aus Vermietung und Verpachtung (steuerliche Einkunftsart)
- GrESt = Grunderwerbsteuer
- KNK = Kaufnebenkosten (Grunderwerbsteuer, Notar/Grundbuch, Makler)
- ETW = Eigentumswohnung
- LTV = Loan-to-Value (Beleihungsauslauf = Fremdkapital / Wert)
- DSCR = Debt Service Coverage Ratio (Mieteinnahmen / Kapitaldienst)
- IRR = Internal Rate of Return (interner Zinsfuss der Eigenkapital-Cashflows)
- ROE = Return on Equity (Eigenkapitalrendite)
- CoC = Cash-on-Cash-Rendite (Netto-Cashflow / eingesetztes Eigenkapital)
- Spekulationsfrist = 10-Jahres-Frist, nach der ein privater Immobilienverkaufsgewinn steuerfrei ist (§23 EStG)
- Grenzsteuersatz = Steuersatz auf den naechsten verdienten Euro (entscheidet ueber den Steuervorteil)

## Zielbild
- Eine schnelle, lokal laufende React-Web-App, mit der ein privater Kapitalanleger eine konkrete Immobilie (v. a. ETW/Mehrfamilienhaus, Bestand & Denkmal) ueber die gesamte Haltedauer durchrechnet: Finanzierung, Miete, laufende Kosten, AfA/Steuervorteile, Wertsteigerung und Verkauf - inkl. Cashflow- und Vermoegensprojektion und belastbaren Rendite-Kennzahlen (IRR, ROE, Netto-Mietrendite).
- Technische Leitplanken: 100 % Client-seitige Berechnung (kein Backend, keine Anmeldung), Rechenkern als reine, unit-getestete TypeScript-Module getrennt von der UI; Persistenz der Szenarien im Browser (localStorage) + Export/Import. Modernes, cleanes, frisches Design (React + Vite + TypeScript + TailwindCSS + Recharts).
- Betriebsmodus: Free-Tier-tauglich, offline lauffaehig, deterministische Berechnung (gleiche Eingaben -> gleiche Ergebnisse). Deutsche Lokalisierung (EUR, %, dt. Zahlenformat).

========================================
OUTPUT-ERWARTUNG AN DICH
========================================

- Implementiere alles direkt im Repository (Vite-Projekt im Repo-Root bzw. in `app/`).
- Arbeite Schritt fuer Schritt von Story 0 bis Story 13 bis zum Ende.
- Zeige bei jedem Schritt konkrete Dateipfade und Testergebnisse (`npm run test`, `npm run build`).
- Trenne strikt: Rechenkern (`src/engine/*`, pure Funktionen, voll getestet) vs. UI (`src/components/*`, `src/app/*`).
- Bei Tradeoffs entscheide pragmatisch im Sinne von: `fachlich korrekt und nachvollziehbar bei minimaler Komplexitaet`.
- Wo eine steuerliche Vereinfachung gewaehlt wird, dokumentiere sie sichtbar (Tooltip/Annahmen-Block) - das Tool ersetzt keine Steuerberatung.

========================================
FACHLICHE GRUNDLAGEN (Research-Stand 2026)
========================================

Diese Werte sind Default-Annahmen und MUESSEN in der UI konfigurierbar/ueberschreibbar sein (keine Hardcodes in der Logik).

### Kaufnebenkosten (nicht finanziert per Default, erhoehen i. d. R. die AfA-Basis des Gebaeudeanteils)
- Grunderwerbsteuer: 3,5 % - 6,5 % je Bundesland (z. B. Bayern 3,5 %; Sachsen/Bremen 5,5 %; NRW/Brandenburg/Saarland/Schleswig-Holstein 6,5 %). -> Bundesland-Auswahl mit Default-Tabelle, frei editierbar.
- Notar + Grundbuch: ca. 1,5 - 2,0 % vom Kaufpreis.
- Maklerprovision: 0 - 3,57 % inkl. USt (Kaeuferanteil), frei einstellbar.
- Summe KNK typ. ~ 9 - 12 % des Kaufpreises.

### Kaufpreisaufteilung (entscheidend fuer AfA)
- Nur der Gebaeudeanteil ist abschreibbar, NICHT Grund und Boden.
- Eingabe als Bodenwert-Anteil (%) oder absolute Aufteilung; KNK anteilig auf Gebaeude erhoehen die AfA-Bemessungsgrundlage.

### AfA (lineare/degressive/Sonder/Denkmal)
- Lineare Gebaeude-AfA Wohnimmobilie: 2,5 % (Fertigstellung vor 1925), 2,0 % (1925-2022), 3,0 % (Fertigstellung ab 01.01.2023).
- Degressive AfA (Neubau): 5 % degressiv vom Restwert, befristet fuer Baubeginn 01.10.2023 - 30.09.2029 (Wechsel auf linear erlaubt).
- Sonder-AfA §7b (Mietwohnungsneubau, energieeffizient): bis zu 5 % p. a. zusaetzlich fuer 4 Jahre, mit Bemessungsgrundlage max. 4.000 EUR/m2 Wohnflaeche und weiteren Kosten-/Foerdervoraussetzungen; danach wird der Restbuchwert ueber die verbleibende Nutzungsdauer verteilt.
- Denkmal-AfA §7i (Kapitalanleger): Sanierungs-/Modernisierungskosten zu 100 % ueber 12 Jahre -> 9 % p. a. Jahr 1-8, 7 % p. a. Jahr 9-12. Zusaetzlich Altbausubstanz (Gebaeude-Kaufpreis) linear (i. d. R. 2 %/2,5 %).
- Denkmal §10f (Eigennutzer, nachrichtlich/optional): 90 % der Sanierungskosten ueber 10 Jahre (9 % p. a.).
- Hinweis: Denkmal-AfA erfordert Behoerden-Bescheinigung; Modellierung als "Sanierungskosten-Topf" mit eigenem Abschreibungsplan.

### Steuerwirkung (der eigentliche "Steuervorteil")
- V&V-Ergebnis = Mieteinnahmen (kalt) - Werbungskosten (Schuldzinsen, AfA, nicht-umlagefaehige Bewirtschaftungskosten, Instandhaltung, Verwaltung). TILGUNG ist NICHT abziehbar (nur Zinsen).
- Ein V&V-Verlust mindert das zu versteuernde Einkommen -> Steuererstattung. Der Vorteil skaliert mit dem persoenlichen Grenzsteuersatz ("mehr Gehalt -> mehr Steuervorteil"): korrekt.
- Beste Modellierung: Steuereffekt = ESt(zvE inkl. V&V) - ESt(zvE ohne V&V) ueber den Einkommensteuertarif §32a EStG (erfasst Progression); tarifliche ESt wird auf volle EUR abgerundet. Vereinfachter Modus: flacher Grenzsteuersatz als Eingabe.
- ESt-Tarif 2026 (Single): Grundfreibetrag 12.348 EUR; Eingangssatz 14 %; 42 % ab ~69.879 EUR; 45 % (Reichensteuer) ab 277.826 EUR. Splitting (Verheiratet) als Option.
- Optionale Zuschlaege: Solidaritaetszuschlag (5,5 % auf ESt oberhalb Freigrenze - fuer die meisten 0) und Kirchensteuer (8-9 %), per Toggle.

### Verkauf / Exit
- Spekulationssteuer (§23 EStG): Verkauf innerhalb 10 Jahre -> Gewinn (Verkaufspreis - Verkaufsnebenkosten - Vorfaelligkeitsentschaedigung - Kaufpreis - KNK - nachtraegliche Herstellungskosten + bereits genutzte AfA) mit persoenlichem Steuersatz versteuern, sofern der modellierte private Veraeusserungsgewinn mindestens 1.000 EUR erreicht; nach 10 Jahren steuerfrei.
- Verkaufsnebenkosten (Makler, ggf. Vorfaelligkeitsentschaedigung bei vorzeitiger Abloesung) abziehen; Restschuld tilgen -> Netto-Verkaufserloes.

### Kennzahlen, die ein "lohnt sich?"-Urteil ermoeglichen
- Bruttomietrendite = Jahreskaltmiete / Kaufpreis.
- Nettomietrendite = (Jahreskaltmiete - nicht-umlagefaehige Bewirtschaftungskosten) / (Kaufpreis + KNK).
- Kaufpreisfaktor (Vervielfaeltiger) = Kaufpreis / Jahreskaltmiete.
- Cashflow vor/nach Steuer p. a. (inkl. Tilgung als Ausgabe), monatliche Liquiditaet.
- Cash-on-Cash-Rendite = Netto-Cashflow / eingesetztes Eigenkapital.
- Eigenkapitalrendite (ROE) inkl. Tilgungsanteil (Vermoegensaufbau) und Steuer.
- IRR der Eigenkapital-Cashflows ueber die Haltedauer inkl. Verkaufserloes (Gesamturteil).
- Vermoegensentwicklung = Immobilienwert - Restschuld ueber Zeit; Vergleich vs. Alternativanlage (z. B. ETF mit gleichem EK + gleicher monatlicher Sparrate) = Opportunitaetskosten.
- Risiko-Kennzahlen: LTV-Verlauf, DSCR, Restschuld am Ende der Zinsbindung, Break-even-Miete/-Zins.

========================================
ARBEITSAUFTRAG: SCHRITT-FUER-SCHRITT UMSETZEN
========================================

Allgemeine Arbeitsregeln:
- Arbeite sequenziell von Story 0 bis Story 13.
- Nach jedem Schritt: kurze Zusammenfassung, geaenderte Dateien, Test-/Command-Ergebnis, dann naechster Schritt.
- Keine Schritte ueberspringen. Wenn etwas fehlt, implementiere sinnvollen Fallback statt zu stoppen.
- Schreibe sauberen, testbaren Code mit klaren Schnittstellen. Rechenkern bleibt UI-frei und deterministisch.
- Jede Engine-Story braucht Unit-Tests mit mind. einem von Hand nachgerechneten Referenzfall.

## Handover Naechster Thread (Stand: 2026-06-20)
- Implementiert und verifiziert: Stories 0 bis 13. `npm run lint && npm run typecheck && npm run build && npm run test` alle gruen (118/118 Tests).
- Offener Fokus: Keine offenen Stories.
- Startpunkt fuer den naechsten Thread:
  1. Bei neuen Aenderungen zuerst `activity.md`, `memory.md` und dieses `PRD.md` laden.
  2. Naechster sinnvoller Fokus ist gezielter UX-/Fachreview mit realen Objektbeispielen.
- Verify-Setup: `cd app && npm run lint && npm run typecheck && npm run build && npm run test`.

## Story-Status-Uebersicht (Stand: 2026-06-20)
| Story | Thema | Status |
|---|---|---|
| 0 | Projekt-Setup & Tech-Foundation | DONE |
| 1 | Datenmodell, Default-Szenario & Store | DONE |
| 2 | Finanzierungs-/Tilgungsplan-Engine | DONE |
| 3 | Miet- & Bewirtschaftungs-Engine (flexible Zeitreihen) | DONE |
| 4 | AfA- & Steuer-Engine (inkl. Denkmal & ESt-Tarif) | DONE |
| 5 | Cashflow- & Vermoegens-Projektion (Jahr fuer Jahr) | DONE |
| 6 | Verkauf/Exit & Rendite-Kennzahlen (IRR/ROE) | DONE |
| 7 | UI - App-Shell, Layout & Design-System | DONE |
| 8 | UI - Eingabeformular inkl. flexibler Szenario-Editoren | DONE |
| 9 | UI - Ergebnis-Dashboard & Visualisierungen | DONE |
| 10 | Szenario-Vergleich, Sensitivitaet & ETF-Vergleich | DONE |
| 11 | Persistenz, Import/Export (JSON/PDF/Excel) | DONE |
| 12 | Validierung, Annahmen/Disclaimer, Doku & Polish | DONE |
| 13 | Haltedauer- & Verkaufsanalyse (Exit-Jahr-Matrix, EK-Profitabilitaet) | DONE |

---

## Story 0 - Projekt-Setup & Tech-Foundation
Prioritaet: Hoch | Status: DONE (2026-06-20)

Anforderungen:
- Vite-Projekt mit React + TypeScript (strict) aufsetzen (Root oder `app/`).
- TailwindCSS einrichten (Design-Tokens fuer Farben/Spacing, Inter/Sans-Font, Light- als Default, Dark-Mode vorbereitbar).
- Abhaengigkeiten: `recharts` (Charts), `zustand` (State), `vitest` + `@testing-library/react` (Tests), Icon-Set (z. B. `lucide-react`).
- NPM-Scripts: `dev`, `build`, `preview`, `test`, `lint`, `typecheck`.
- Ordnerstruktur anlegen: `src/engine/`, `src/store/`, `src/components/`, `src/app/`, `src/lib/` (Formatierung/Locale).
- `.gitignore` (node_modules, dist, .env), README-Stub.

When complete (Erfolgskriterien):
- `npm run build` laeuft fehlerfrei durch (Exit 0).
- `npm run test` fuehrt mind. einen Platzhaltertest gruen aus.
- `npm run typecheck` ohne Fehler.
- Dev-Server startet und zeigt eine leere App-Shell.
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npm install
npm run typecheck
npm run build
npm run test
```

Risiken/Tradeoffs:
- Tailwind v4 vs. v3 Setup-Unterschiede - die jeweils aktuelle stabile Version verwenden und Setup an deren Doku ausrichten.

---

## Story 1 - Datenmodell, Default-Szenario & Store
Prioritaet: Hoch | Status: DONE (2026-06-20)

Anforderungen:
- Vollstaendiges Eingabe-Datenmodell als TypeScript-Typen in `src/engine/types.ts`. Mindestens:
  - Objekt: Kaufpreis, Wohnflaeche m2, Baujahr/Fertigstellungsjahr, Bundesland, Objekttyp (Bestand/Neubau/Denkmal), Bodenwertanteil %, Sanierungskosten (Denkmal-Topf).
  - Kaufnebenkosten: GrESt % (aus Bundesland vorbelegt, editierbar), Notar/Grundbuch %, Makler %, Flag "KNK mitfinanzieren" (Default: nein).
  - Finanzierung: Eigenkapital (% ODER absolut, umschaltbar), Darlehensbetrag (abgeleitet), Sollzins %, anfaengliche Tilgung %, Zinsbindung (Jahre), Anschlusszins % (nach Zinsbindung), jaehrliche Sondertilgung (Betrag oder %), optional Disagio.
  - Miete: Kaltmiete (EUR/Monat oder EUR/m2), Leerstand/Mietausfallwagnis %, Mietsteigerungs-Szenario (flexible Zeitreihe, s. Story 3).
  - Laufende Kosten: Instandhaltungsruecklage (EUR/m2/Jahr ODER % der Miete ODER absolut), Verwaltungskosten (nicht-umlagefaehig), sonstige nicht-umlagefaehige Kosten; Kostensteigerung % p. a.
  - Steuer: Eingabemodus (Bruttojahresgehalt zvE ODER fester Grenzsteuersatz %), Veranlagung (Single/Splitting), Soli-Toggle, Kirchensteuer % (Toggle).
  - AfA: AfA-Modus (linear nach Baujahr / degressiv 5 % / Sonder-AfA §7b / Denkmal §7i), Gebaeude-AfA-Satz (abgeleitet, editierbar).
  - Wertentwicklung: Wertsteigerungs-Szenario (flexible Zeitreihe, s. Story 3).
  - Exit: Haltedauer (Jahre), Verkaufsnebenkosten %, optional vorzeitiger Verkauf vor Ablauf Zinsbindung (Vorfaelligkeit %).
- Realistisches Default-Szenario (z. B. 300.000 EUR ETW), das sofort sinnvolle Ergebnisse liefert.
- Zustand-Store (`src/store/scenarioStore.ts`) mit Aktionen zum Setzen/Reset; abgeleitete Felder (Darlehensbetrag, EUR<->% Umrechnung) zentral.
- Persistenz: aktives Szenario + benannte Szenarien in localStorage (Versionsfeld fuer spaetere Migration).

When complete:
- Typen decken alle oben genannten Parameter ab und kompilieren strikt.
- Default-Szenario laedt; Store-Aktionen aendern State nachweisbar (Test).
- localStorage-Persistenz: Reload behaelt Eingaben.
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npm run typecheck
npx vitest run src/store/scenarioStore.test.ts
```

Abhaengigkeiten/Keys: keine.

---

## Story 2 - Finanzierungs-/Tilgungsplan-Engine
Prioritaet: Hoch | Status: DONE (2026-06-20)

Anforderungen:
- Pure Funktion `buildAmortizationSchedule(input)` in `src/engine/financing.ts`, die einen Jahres-(und intern Monats-)Tilgungsplan liefert: pro Periode Zins, Tilgung, Annuitaet, Restschuld.
- Annuitaetendarlehen: Annuitaet = Darlehen * (Sollzins + anfaengliche Tilgung); monatliche Verzinsung, Tilgung steigt, Zinsanteil sinkt.
- Zinsbindung beruecksichtigen: nach Ablauf Anschlusszins anwenden (Annuitaet neu / oder Tilgung beibehalten - Designentscheidung dokumentieren).
- Jaehrliche Sondertilgung korrekt einrechnen (verkuerzt Laufzeit, senkt Restschuld).
- Ausgabe von Kennwerten: Restschuld am Ende der Zinsbindung, Restschuld am Ende der Haltedauer, kumulierte Zinsen, Gesamtlaufzeit bis Volltilgung.
- Robuste Randfaelle: 0 % Tilgung (endfaellig-aehnlich, Warnung), 100 % EK (kein Darlehen), Sondertilgung > Restschuld.

When complete:
- Mind. 1 von Hand nachgerechneter Referenzfall stimmt (Restschuld nach Jahr 1 und Jahr 10 mit Toleranz < 1 EUR).
- Sondertilgung verkuerzt Laufzeit nachweisbar (Test).
- 100 % EK -> leerer/0-Plan ohne Crash.
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npx vitest run src/engine/financing.test.ts
```

Risiken/Tradeoffs:
- Monatlich vs. jaehrlich rechnen: monatlich ist genauer (Banklogik), Aggregation auf Jahresebene fuer die Projektion. Konsistent eine Konvention waehlen.

---

## Story 3 - Miet- & Bewirtschaftungs-Engine (flexible Zeitreihen)
Prioritaet: Hoch | Status: DONE (2026-06-20)

Anforderungen:
- Generischer Zeitreihen-Mechanismus fuer "flexible Szenarien" in `src/engine/timeline.ts`: Eine Reihe von Regeln vom Typ
  - "ab Jahr N: +X % einmalig" (Stufe) und/oder
  - "ab Jahr N: Y % p. a." (laufende Rate, gilt bis zur naechsten Regel),
  sodass z. B. "nach 3 J. +10 %, nach 15 J. +25 %, sonst 1,5 % p. a." abbildbar ist. Funktion `projectSeries(base, rules, years)` liefert den Wert je Jahr.
- Mieteinnahmen-Engine `src/engine/rent.ts`: Jahres-Kaltmiete je Jahr aus Basismiete + Mietsteigerungs-Zeitreihe; abzueglich Leerstand/Mietausfallwagnis %.
- Bewirtschaftungskosten-Engine: Instandhaltung (EUR/m2/Jahr, % der Miete oder absolut - umschaltbar), nicht-umlagefaehige Verwaltung, sonstige Kosten; jaehrliche Kostensteigerung als eigene Zeitreihe/Rate.
- Klare Trennung umlagefaehig vs. nicht-umlagefaehig (nur nicht-umlagefaehige Kosten belasten den Eigentuemer-Cashflow und sind Werbungskosten).

When complete:
- `projectSeries` bildet kombinierte Stufen + laufende Raten korrekt ab (Test mit dem 3J/15J-Beispiel).
- Mietreihe inkl. Leerstand und Bewirtschaftungskosten je Jahr berechenbar; Referenzfall geprueft.
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npx vitest run src/engine/timeline.test.ts src/engine/rent.test.ts
```

---

## Story 4 - AfA- & Steuer-Engine (inkl. Denkmal & ESt-Tarif)
Prioritaet: Hoch | Status: DONE (2026-06-20)

Anforderungen:
- `src/engine/afa.ts`:
  - AfA-Bemessungsgrundlage: Gebaeudeanteil des Kaufpreises + anteilige KNK (Boden nicht abschreibbar).
  - Lineare AfA nach Baujahr (2,0 / 2,5 / 3,0 %).
  - Degressive AfA 5 % vom Restwert (mit optionalem Wechsel auf linear, wenn vorteilhafter).
  - Sonder-AfA §7b (5 % p. a. * 4 Jahre, Bemessungsgrundlage max. 4.000 EUR/m2) additiv; ab Jahr 5 Restbuchwert ueber die verbleibende Nutzungsdauer verteilen.
  - Denkmal-AfA §7i: separater Sanierungskosten-Topf -> 9 % p. a. Jahr 1-8, 7 % p. a. Jahr 9-12; PLUS lineare AfA auf Altbausubstanz.
  - Ausgabe: AfA-Betrag je Jahr + kumulierte AfA (fuer Spekulationsgewinn relevant).
- `src/engine/tax.ts`:
  - Einkommensteuertarif §32a EStG (parametriert je Jahr; Default 2026) als Funktion `incomeTax(zvE, {splitting})`; tarifliche ESt auf volle EUR abrunden.
  - Steuereffekt der Immobilie = `incomeTax(zvE + V&V) - incomeTax(zvE)` (V&V kann negativ sein -> Erstattung). Erfasst Progression korrekt.
  - Vereinfachter Modus: fester Grenzsteuersatz * V&V-Ergebnis.
  - Optional Soli (5,5 % auf ESt > Freigrenze) und Kirchensteuer (% auf ESt).
  - `marginalRate(zvE)` zur Anzeige des effektiven Grenzsteuersatzes.
- V&V-Ergebnis je Jahr = Kaltmiete (nach Leerstand) - Schuldzinsen - AfA - nicht-umlagefaehige Bewirtschaftungskosten/Instandhaltung. (Tilgung NICHT abziehbar.)

When complete:
- Lineare/degressive/Denkmal-AfA-Plaene stimmen mit Referenzrechnung (z. B. Denkmal 200.000 EUR -> 18.000 EUR/J. J1-8, 14.000 EUR/J. J9-12).
- `incomeTax` reproduziert bekannte Tarif-Stuetzstellen 2026 (Grundfreibetrag 0; Sprungpunkte 42 %/45 %) mit Toleranz.
- Steuereffekt skaliert nachweisbar mit dem Gehalt (hoeheres zvE -> groesserer Vorteil bei Verlust).
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npx vitest run src/engine/afa.test.ts src/engine/tax.test.ts
```

Risiken/Tradeoffs:
- ESt-Tarif-Koeffizienten aendern sich jaehrlich -> als Datentabelle je Jahr ablegen, nicht hart in der Formel. Tool ist Schaetzung, keine Steuerberatung (Disclaimer in Story 12).

---

## Story 5 - Cashflow- & Vermoegens-Projektion (Jahr fuer Jahr)
Prioritaet: Hoch | Status: DONE (2026-06-20)

Anforderungen:
- Orchestrierende Funktion `runProjection(scenario)` in `src/engine/projection.ts`, die Story 2-4 zusammenfuehrt und je Jahr liefert:
  - Mieteinnahmen, Bewirtschaftungskosten, Zins, Tilgung, Annuitaet,
  - AfA, V&V-Ergebnis, Steuereffekt,
  - Cashflow vor Steuer und Cashflow nach Steuer (monatlich & jaehrlich),
  - Immobilienwert (Wertsteigerungs-Zeitreihe), Restschuld, Eigenkapital/Nettovermoegen (Wert - Restschuld), LTV, DSCR.
- Kumulierte Groessen: eingesetztes Eigenkapital, kumulierter Cashflow nach Steuer, kumulierte Steuerersparnis.
- Konsistente Vorzeichen-Konvention (Einzahlungen +, Auszahlungen -) und ein dokumentiertes Periodenmodell.

When complete:
- Projektion ueber n Jahre liefert pro Jahr ein vollstaendiges, in sich konsistentes Ergebnisobjekt (Summen-Checks im Test).
- End-to-end Referenz-Szenario: Werte plausibel und reproduzierbar (Snapshot-Test).
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npx vitest run src/engine/projection.test.ts
```

---

## Story 6 - Verkauf/Exit & Rendite-Kennzahlen (IRR/ROE)
Prioritaet: Hoch | Status: DONE (2026-06-20)

Anforderungen:
- Exit-Berechnung in `src/engine/exit.ts`: Verkaufspreis (= projizierter Wert im Exit-Jahr), abzgl. Verkaufsnebenkosten, abzgl. Restschuld (+ ggf. Vorfaelligkeit) = Netto-Verkaufserloes.
- Spekulationssteuer (§23 EStG): wenn Haltedauer < 10 Jahre und Gewinn >= 1.000 EUR, Gewinn = Verkaufspreis - Verkaufsnebenkosten - Vorfaelligkeitsentschaedigung - Anschaffungs-/Herstellungskosten + kumulierte AfA, versteuert mit Grenzsteuersatz bzw. Tarifdelta; sonst 0.
- Kennzahlen-Modul `src/engine/metrics.ts`:
  - Bruttomietrendite, Nettomietrendite, Kaufpreisfaktor.
  - Cash-on-Cash-Rendite (Jahr 1 und Durchschnitt), ROE.
  - IRR der Eigenkapital-Cashflows: -EK in t0, jaehrliche Cashflows nach Steuer, + Netto-Verkaufserloes im Exit-Jahr (`computeIRR`, robuster Solver).
  - Break-even-Kennzahlen: Break-even-Zins, Break-even-Miete (Cashflow nach Steuer = 0).
- Gesamturteil-Hilfen: Vergleich gegen Alternativrendite-Schwelle (Eingabe), Ampel/Score.

When complete:
- IRR-Solver verifiziert gegen bekannte Cashflow-Reihe (z. B. analytisch loesbarer Fall, Toleranz < 0,01 %).
- Spekulationssteuer schaltet bei Haltedauer >= 10 J. auf 0; bei < 10 J. und Gewinn >= 1.000 EUR > 0 (Test).
- Alle Kennzahlen am Referenz-Szenario plausibel.
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npx vitest run src/engine/exit.test.ts src/engine/metrics.test.ts
```

Risiken/Tradeoffs:
- IRR kann bei Vorzeichenwechseln mehrdeutig sein -> robusten numerischen Solver (Bisektion/Newton mit Fallback) + Plausibilitaetsgrenzen.

---

## Story 7 - UI - App-Shell, Layout & Design-System
Prioritaet: Hoch | Status: DONE (2026-06-20)

Anforderungen:
- Cleanes, modernes, frisches Design: ruhige Farbpalette mit 1 Akzentfarbe, viel Whitespace, abgerundete Cards, dezente Schatten, klare Typo-Hierarchie (Inter o. ae.), konsistente Spacing-Skala.
- Zwei-Spalten-Layout auf Desktop: links Eingaben (scrollbar, in Sektionen/Accordion), rechts/oben Ergebnis-Dashboard; auf Mobile gestapelt und responsiv.
- Wiederverwendbare UI-Primitives (`src/components/ui/`): Card, NumberInput (mit EUR/%/Suffix, dt. Formatierung), Slider, Select, Toggle, Tabs, Tooltip, KPI-Card.
- Locale-/Formatierungs-Helfer (`src/lib/format.ts`): `formatEUR`, `formatPercent`, `formatNumber` (de-DE), Parser fuer Eingaben.
- Live-Recalculation: Eingabeaenderung -> sofortige Neuberechnung der Projektion (debounced).

When complete:
- App-Shell rendert mit Beispiel-Szenario, Eingaben links / Ergebnisse rechts, responsiv (Desktop + Mobile-Breakpoint).
- Zahlen erscheinen im dt. Format (z. B. 1.234,56 EUR / 3,5 %).
- `npm run build` fehlerfrei.
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npm run build
npx vitest run src/lib/format.test.ts
```

---

## Story 8 - UI - Eingabeformular inkl. flexibler Szenario-Editoren
Prioritaet: Hoch | Status: DONE (2026-06-20)

Anforderungen:
- Eingabe-Sektionen: (1) Objekt & Kaufpreis, (2) Kaufnebenkosten (mit Bundesland-Auswahl -> GrESt-Vorbelegung), (3) Finanzierung, (4) Miete, (5) Laufende Kosten, (6) Steuer, (7) AfA, (8) Wertentwicklung, (9) Exit.
- EK als % <-> EUR umschaltbar; abgeleitete Werte (Darlehensbetrag, KNK-Summe, Gesamtinvest) live angezeigt.
- Flexible Szenario-Editoren fuer Mietsteigerung UND Wertsteigerung: Tabelle, in der Regeln hinzugefuegt werden ("ab Jahr __ : __ % einmalig" und/oder "ab Jahr __ : __ % p. a."); Live-Vorschau der resultierenden Reihe als Mini-Chart.
- AfA-Auswahl steuert automatisch passende Felder (z. B. Denkmal -> Sanierungskosten-Feld sichtbar).
- Steuer-Sektion: Umschalter Bruttogehalt(zvE) vs. fester Grenzsteuersatz; Anzeige des resultierenden Grenzsteuersatzes.
- Inline-Hilfen/Tooltips mit Kurz-Erklaerung je Parameter; sinnvolle Min/Max + Validierung.

When complete:
- Alle Parameter aus Story 1 sind ueber die UI editierbar und wirken sofort auf die Ergebnisse.
- Flexible Mietsteigerung "nach 3 J. +10 %, nach 15 J. +25 %" ist per UI eingebbar und im Vorschau-Chart sichtbar.
- Ungueltige Eingaben werden abgefangen (keine NaN/Crash).
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npm run build
npx vitest run src/components
```

---

## Story 9 - UI - Ergebnis-Dashboard & Visualisierungen
Prioritaet: Hoch | Status: DONE (2026-06-20)

Anforderungen:
- KPI-Leiste oben: Cashflow/Monat (vor & nach Steuer), Nettomietrendite, IRR, Eigenkapital nach Haltedauer, Kaufpreisfaktor - mit Ampel/Trend.
- Charts (Recharts):
  - Cashflow je Jahr (vor/nach Steuer, gestapelt: Miete vs. Zins/Tilgung/Kosten).
  - Vermoegensaufbau: Immobilienwert vs. Restschuld vs. Nettovermoegen ueber Zeit.
  - Steuerersparnis je Jahr (und kumuliert).
  - Tilgungsverlauf (Zins vs. Tilgung).
- Jahr-fuer-Jahr-Tabelle (aufklappbar) mit allen Kernspalten; horizontal scrollbar/exportierbar.
- Annahmen-/Ergebnis-Zusammenfassung als Klartext ("Bei diesen Annahmen ... monatlicher Cashflow nach Steuer X EUR, IRR Y %, Vermoegen nach Z Jahren ...").

When complete:
- Alle vier Charts rendern aus der echten Projektion und aktualisieren live bei Eingabeaenderung.
- Jahrestabelle stimmt mit der Engine ueberein (Stichproben-Test).
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npm run build
```

---

## Story 10 - Szenario-Vergleich, Sensitivitaet & ETF-Vergleich
Prioritaet: Mittel | Status: COMPLETE

Anforderungen:
- Szenarien benennen, speichern, duplizieren, nebeneinander vergleichen (z. B. pessimistisch/realistisch/optimistisch) - Vergleichstabelle der Kern-KPIs.
- Sensitivitaets-Ansicht: Slider/Schnellvariation fuer Sollzins, Leerstand, Wertsteigerung, Anschlusszins -> sofortige KPI-Reaktion; optional Tornado-/Mini-Heatmap.
- Opportunitaetskosten-Vergleich: Alternativanlage (z. B. ETF) mit gleichem Eigenkapital + gleicher monatlicher Sparrate (= negativer Immo-Cashflow), konfigurierbare erwartete Rendite; Endvermoegen Immo vs. ETF gegenuebergestellt.

When complete:
- Mind. 2 Szenarien koennen gespeichert und in einer Tabelle verglichen werden.
- Sensitivitaets-Slider veraendert KPIs live.
- ETF-Vergleich zeigt Endvermoegen beider Wege + Differenz.
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npm run build
npx vitest run src/engine/compare.test.ts
```

---

## Story 11 - Persistenz, Import/Export (JSON/PDF/Excel)
Prioritaet: Mittel | Status: DONE (2026-06-20)

Anforderungen:
- Szenarien aus localStorage laden/speichern/loeschen (aus Story 1) ueber UI verwaltbar.
- Export/Import einzelner oder aller Szenarien als JSON (mit Schema-Version).
- Export der Ergebnisse: PDF (druckbare Zusammenfassung inkl. KPIs + Charts, z. B. via Druckansicht/`react-to-print` oder `jspdf`) und Excel/CSV der Jahrestabelle (z. B. `xlsx`/CSV).

When complete:
- JSON-Roundtrip (Export -> Import) stellt ein Szenario identisch wieder her (Test).
- PDF- und CSV/Excel-Export erzeugen valide Dateien mit den aktuellen Ergebnissen.
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npx vitest run src/lib/io.test.ts
npm run build
```

---

## Story 12 - Validierung, Annahmen/Disclaimer, Doku & Polish
Prioritaet: Mittel | Status: DONE (2026-06-20)

Anforderungen:
- Durchgaengige Eingabe-Validierung & sinnvolle Defaults; keine NaN/Infinity in der UI; Warnhinweise bei kritischen Konstellationen (negativer Cashflow, hohe Restschuld nach Zinsbindung, LTV > 100 %).
- Sichtbarer Annahmen-/Disclaimer-Block: "Schaetzung, keine Steuer-/Anlageberatung", Liste der getroffenen Vereinfachungen + Tarif-/AfA-Stand (Jahr).
- README: Zweck, Setup, Scripts, Architektur (Engine vs. UI), fachliche Annahmen, Update-Hinweis fuer ESt-Tarif/Steuerwerte.
- Polish: Leerzustaende, Ladezustaende, sinnvolle Min/Max, Tastatur-/Fokus-Zugaenglichkeit, optional Dark-Mode.

When complete:
- Keine unbehandelten Eingaben fuehren zu NaN/Crash (Tests fuer Randfaelle).
- Disclaimer + Annahmen sichtbar in der App.
- README vollstaendig; `npm run build`, `npm run typecheck`, `npm run test` alle Exit 0.
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npm run typecheck && npm run build && npm run test
```

---

## Story 13 - Haltedauer- & Verkaufsanalyse (Exit-Jahr-Matrix, EK-Profitabilitaet)
Prioritaet: Hoch | Status: DONE (2026-06-20)

Kontext: Story 6 berechnet EINEN gewaehlten Exit. Story 13 beantwortet explizit "Was kommt raus, wenn ich nach X Jahren verkaufe?" - fuer JEDES moegliche Verkaufsjahr, inkl. des bis dahin (oft negativen) aufgelaufenen Cashflows, und uebersetzt das in EK-Profitabilitaet p. a. UND insgesamt.

Anforderungen:
- Funktion `analyzeHoldingPeriods(scenario)` in `src/engine/holding.ts`, die fuer jedes Jahr `t = 1..N` einen Exit-an-diesem-Jahr durchrechnet und je `t` liefert:
  - **Netto-Verkaufserloes(t)** = projizierter Immobilienwert(t) - Verkaufsnebenkosten - Restschuld(t) - ggf. Vorfaelligkeit.
  - **Spekulationssteuer(t)** nach §23 EStG: bei `t < 10` Jahren und Gewinn >= 1.000 EUR Gewinn (Verkaufspreis - Verkaufsnebenkosten - Vorfaelligkeit - Anschaffungs-/Herstellungskosten + kumulierte AfA bis t) * Grenzsteuersatz bzw. Tarifdelta; ab `t >= 10` = 0 (steuerfrei).
  - **Kumulierter Cashflow nach Steuer(t)** = Summe der jaehrlichen Cashflows nach Steuer von Jahr 1..t (kann negativ sein und MUSS in den Gewinn einfliessen).
  - **Gesamtgewinn(t)** = kumulierter Cashflow nach Steuer(t) + Netto-Verkaufserloes(t) - Spekulationssteuer(t) - eingesetztes Eigenkapital(t0).
  - **EK-Profitabilitaet insgesamt(t)** = Gesamtgewinn(t) / eingesetztes Eigenkapital (Gesamt-Multiple bzw. Gesamtrendite ueber die Haltedauer).
  - **EK-Profitabilitaet p. a.(t)** = annualisierte Rendite: IRR der EK-Cashflows (-EK in t0, jaehrliche Cashflows nach Steuer, + Netto-Verkaufserloes - Spekulationssteuer in t) sowie alternativ CAGR auf Basis Gesamt-Multiple; beide ausweisen.
  - Zusatzspalten: Restschuld(t), Immobilienwert(t), enthaltene Spekulationssteuer ja/nein, Break-even-Jahr (erstes `t` mit Gesamtgewinn >= 0).
- Ableitung "lohnt sich?"-Hilfen: bestes Exit-Jahr nach IRR; Markierung des 10-Jahres-Punkts (Steuerfreiheit); Vergleich der p.-a.-Rendite gegen eine eingegebene Zielrendite (Ampel).
- UI-Anbindung: Tabelle "Verkauf nach Jahr X" + Chart (Gesamtgewinn und IRR ueber das Exit-Jahr), Hervorhebung des 10-Jahres-Schwellenwerts. (Nutzt Story 9-Bausteine.)

When complete:
- `analyzeHoldingPeriods` liefert fuer alle `t = 1..N` konsistente Werte; Summen-/Identitaetscheck: Exit im gewaehlten Haltejahr stimmt mit Story 6 ueberein (Toleranz < 1 EUR).
- Negativer kumulierter Cashflow wird nachweislich vom Verkaufserloes abgezogen (Test mit unterdecktem Szenario).
- Spekulationssteuer ist bei `t = 9` mit Gewinn >= 1.000 EUR > 0 und bei `t = 10` = 0 (Test).
- EK-Profitabilitaet wird p. a. (IRR + CAGR) UND insgesamt (Multiple) ausgewiesen; Referenzfall plausibel.
- UI zeigt Exit-Jahr-Tabelle + Chart, inkl. 10-Jahres-Markierung und bestem Exit-Jahr.
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npx vitest run src/engine/holding.test.ts
npm run build
```

Abhaengigkeiten:
- Story 2-6 (Projektion, Exit, Metrics/IRR). UI nutzt Story 9.

Risiken/Tradeoffs:
- IRR pro Exit-Jahr ist rechenintensiv (N Loesungen) - akzeptabel bei N <= 50; Ergebnisse memoizen. Bei sehr fruehen Exit-Jahren kann IRR mehrdeutig/instabil sein -> robusten Solver + Fallback auf CAGR.

---

## Was das Tool bewusst NICHT (vollstaendig) abbildet
1. Verbindliche Steuerberechnung/-beratung: ESt-Tarif, AfA-Regeln und Spekulationssteuer sind Schaetzungen; Sonderfaelle (Werbungskosten-Details, gewerblicher Handel, GbR/GmbH, USt-Option) bleiben aussen vor.
2. Reale Marktdynamik: tatsaechliche Miet-/Wertentwicklung, Leerstandsphasen, Zinsentwicklung der Anschlussfinanzierung sind szenariobasiert, nicht prognostiziert.
3. Objektspezifische Risiken: Sanierungsstau, Sonderumlagen der WEG, Mietnomaden, regionale Regulierung (Mietendeckel etc.) nur grob ueber Annahmen erfassbar.
4. Liquiditaets-/Bonitaetspruefung der Bank, KfW-/Foerderdarlehen-Spezifika und individuelle Disagio-/Bereitstellungszins-Details vereinfacht.

## Beispiel fuer klare Erfolgskriterien
Beispielstory: `AfA-Engine fuer Denkmalimmobilie.`

When complete:
- Denkmal-Plan: 9 % p. a. Jahr 1-8, 7 % p. a. Jahr 9-12 auf Sanierungskosten + lineare Altbau-AfA
- Referenzfall (200.000 EUR Sanierung) -> 18.000 EUR/J. (J1-8), 14.000 EUR/J. (J9-12)
- Unit-Tests gruen (Toleranz < 1 EUR)
- Output: `<promise>COMPLETE</promise>`

## COMPLETE-Kriterien
- Alle relevanten Stories auf `DONE` oder bewusst auf `DEFERRED` mit Nachweis.
- Alle Verify-Commands der `DONE`-Stories mit Exit-Code `0`.
- Rechenkern voll unit-getestet; UI build- und typecheck-sauber.
- Keine offenen kritischen Blocker.
- Handover-Abschnitt fuer den naechsten Thread aktualisiert.
