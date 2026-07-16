# Immobilien-Investment-Checker

Lokale React-Web-App zur Bewertung einer Immobilie als Kapitalanlage: Finanzierung,
Miete, laufende Kosten, AfA/Steuervorteile, Wertsteigerung und Verkauf &mdash; mit
Cashflow-/Vermoegensprojektion und Rendite-Kennzahlen (IRR, ROE, Netto-Mietrendite).

## Stack
React + Vite + TypeScript (strict) + TailwindCSS (v4) + Recharts + Zustand + Vitest.
Der Rechenkern bleibt 100 % client-seitig. Persistenz erfolgt lokal; Anmeldung und
optionale Cloud-Synchronisation verwenden Supabase.

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

## Agenten-Anbindung und MCP

MCP (Model Context Protocol) ist die standardisierte Remote-Schnittstelle für Agenten.
Die Umsetzung trennt finale Szenarien strikt von Agent-Drafts:

- Agenten dürfen im authentifizierten Konto eigene Szenarien und gespeicherte Analysen lesen.
- Agenten dürfen nur eigene Drafts anlegen und revisionsgesichert aktualisieren. Es gibt kein
  Tool zum finalen Speichern, Löschen eines Szenarios oder für Adminaktionen.
- Ein Draft enthält eine Pfad-Allowlist, Konfidenz, Quellen und Belege. PDF- oder Web-Inhalte
  werden vom verbundenen Agenten gelesen; der Immo-Checker ruft keine gelieferten URLs selbst ab.
- Die App validiert einen Draft und stellt ihn zuerst nur bereit. `Entwurf öffnen` wechselt in den
  Zwischenstand; ein finaler Cloud-Write erfolgt erst über einen normalen Speicherklick.
- Im `Agent Edit Mode` werden `fehlt`, `bitte prüfen` und `Widerspruch` getrennt angezeigt.
  Die Auswertung bleibt sichtbar als vorläufig markiert, solange Pflichtangaben offen sind.

Die Remote-Verbindung nutzt OAuth 2.1 (Open Authorization, standardisierte Zugriffsfreigabe) mit PKCE
(Proof Key for Code Exchange). Das resultierende JWT (JSON Web Token) ist an die beim Login
gewählte Nutzer-ID, die MCP-Resource und den konkret freigegebenen OAuth-Client gebunden. RLS
(Row Level Security, datenbankseitige Zeilenrechte) erzwingt zusätzlich `auth.uid() = user_id`,
ein genehmigtes Profil und den weiterhin bestehenden Nutzer-Client-Grant.

Unter `Agent-Verbindungen` führt die App die OAuth-Freigaben und die eigenen Immo-MCP-Grants
zusammen. Beim Trennen wird zuerst der Immo-MCP-Grant entfernt, sodass auch bereits ausgegebene
Tokens sofort blockiert sind; anschließend widerruft die App den OAuth-Grant und damit zugehörige
Sessions und Refresh-Tokens. Ein unvollständiger alter Verbindungszustand wird sichtbar und kann
vor einem ausdrücklich bestätigten Reconnect bereinigt werden.

Einrichtung:

1. Basisdatenbank mit `../supabase-setup.sql` einrichten beziehungsweise bestehende Installation
   beibehalten; danach `../supabase-agent-mcp.sql` ausführen.
2. Den Supabase OAuth Server aktivieren und den Authorization Path auf die bereitgestellte App
   legen. Je nach Connector DCR (Dynamic Client Registration, dynamische Client-Registrierung)
   aktivieren oder den Client vorregistrieren.
3. Die feste MCP-Resource-URI als Audience in SQL und Edge Function identisch konfigurieren, den
   `custom_access_token_hook` aktivieren und `agent-mcp` deployen. Eine feste Client-ID ist nicht
   erforderlich; die App genehmigt beim OAuth-Dialog genau das aktuelle Konto-Client-Paar.
4. Vollständige Commands, Rechte und Protokolltest:
   `../supabase/functions/agent-mcp/README.md`.

Zusätzlich gibt es eine bewusst zuschaltbare Browser-Agent-API für den angemeldeten Tab sowie
JSON-Import/Export. Eine kopierte Browser-API verliert bei Logout oder Kontowechsel sofort ihre
Berechtigung. Remote-Drafts erscheinen in der eigenen `MCP-Draft-Inbox` und werden nie automatisch
als finales Szenario übernommen.

## Fachliche Hinweise & Annahmen
Steuer-/AfA-Werte (ESt-Tarif, AfA-Sätze, Grunderwerbsteuer) liegen als **konfigurierbare Tabellen** vor
(Stand: Veranlagungsjahr **2026**) und sind in der UI editierbar. Wesentliche Vereinfachungen:
- Steuereffekt V&amp;V über Tarif-Delta `ESt(zvE+V&V) − ESt(zvE)` (oder fester Grenzsteuersatz). Nur Zinsen, AfA und nicht-umlagefähige Kosten sind abzugsfähig (Tilgung nicht).
- Spekulationssteuer §23 EStG: Grenzsteuersatz × Gewinn (inkl. genutzter AfA); im Jahresraster ist Jahr 10 noch innerhalb der Frist, steuerfrei wird der Exit ab Jahr 11 modelliert.
- Wert-/Mietentwicklung szenariobasiert (keine Marktprognose); Leerstand als pauschales Mietausfallwagnis.

Das Tool ist eine **Schätzung und ersetzt keine Steuer- oder Anlageberatung**.

## Steuer-/Tarif-Update (jährlich)
Die steuerlichen Kennzahlen sind bewusst zentral abgelegt, damit ein Jahres-Update trivial ist:
- **ESt-Tarif §32a** (Koeffizienten der Tarifzonen): `src/engine/tax.ts` → Funktion `incomeTax`.
- **Grunderwerbsteuer & lineare AfA-Sätze**: `src/engine/constants.ts` (`GREST_BY_BUNDESLAND`, `linearAfaRateForYear`).
- **Soli-Freigrenzen**: `src/engine/tax.ts` → `calculateTotalTax`.
Nach Anpassung die Referenzwerte in `src/engine/tax.test.ts` aktualisieren und `npm run test` ausführen.

Stories und Anforderungen: siehe `../PRD.md`.
