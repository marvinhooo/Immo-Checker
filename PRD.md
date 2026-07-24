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
- RLS = Row Level Security (datenbankseitige Zeilenrechte in Supabase/Postgres)
- RPC = Remote Procedure Call (hier: aufrufbare Supabase-Datenbankfunktion)
- MCP = Model Context Protocol (standardisierte Werkzeug-Schnittstelle fuer Agenten)
- OAuth = Open Authorization (standardisierte, nutzerbestaetigte Zugriffsfreigabe)
- PKCE = Proof Key for Code Exchange (Schutz des OAuth-Autorisierungscodes)
- JWT = JSON Web Token (signiertes Zugriffstoken mit Nutzer- und Client-Bindung)
- DCR = Dynamic Client Registration (automatische Registrierung eines MCP-Clients)
- CAS = Compare-and-Swap (Update nur auf Basis der zuletzt gelesenen Revision)
- Protected Resource Metadata = oeffentliches OAuth-Metadatendokument einer geschuetzten API
- Spekulationsfrist = Zeitraum von nicht mehr als zehn Jahren nach §23 EStG; im Jahresraster ist Jahr 10 noch innerhalb der Frist und der Exit ab Jahr 11 steuerfrei modelliert
- Grenzsteuersatz = Steuersatz auf den naechsten verdienten Euro (entscheidet ueber den Steuervorteil)

## Zielbild
- Eine schnelle, lokal laufende React-Web-App, mit der ein privater Kapitalanleger eine konkrete Immobilie (v. a. ETW/Mehrfamilienhaus, Bestand & Denkmal) ueber die gesamte Haltedauer durchrechnet: Finanzierung, Miete, laufende Kosten, AfA/Steuervorteile, Wertsteigerung und Verkauf - inkl. Cashflow- und Vermoegensprojektion und belastbaren Rendite-Kennzahlen (IRR, ROE, Netto-Mietrendite).
- Technische Leitplanken: 100 % client-seitige Berechnung; der Rechenkern bleibt als reine, unit-getestete TypeScript-Module von der UI getrennt. Lokale Nutzung und Export/Import bleiben moeglich; Anmeldung, Cloud-Synchronisation und die optionale Agent-/MCP-Anbindung nutzen Supabase, ohne Berechnungen in das Backend zu verlagern. Modernes, cleanes, frisches Design (React + Vite + TypeScript + TailwindCSS + Recharts).
- Betriebsmodus: Free-Tier-tauglich, offline lauffaehig, deterministische Berechnung (gleiche Eingaben -> gleiche Ergebnisse). Deutsche Lokalisierung (EUR, %, dt. Zahlenformat).

========================================
OUTPUT-ERWARTUNG AN DICH
========================================

- Implementiere alles direkt im Repository (Vite-Projekt im Repo-Root bzw. in `app/`).
- Arbeite Schritt fuer Schritt von Story 0 bis Story 14 bis zum Ende.
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
- V&V-Ergebnis = Kaltmiete nach Leerstand - Werbungskosten. Im Modell umfassen diese insbesondere Schuldzinsen, AfA, sofort abziehbare nicht umlagefaehige Kosten, leerstandsbedingt nicht erstattete umlagefaehige Kosten und modellierte WEG-Verwendungen. TILGUNG und die blosse WEG-Ruecklagenzufuehrung sind NICHT abziehbar.
- Ein V&V-Verlust mindert das zu versteuernde Einkommen -> Steuererstattung. Der Vorteil skaliert mit dem persoenlichen Grenzsteuersatz ("mehr Gehalt -> mehr Steuervorteil"): korrekt.
- Beste Modellierung: Steuereffekt = ESt(zvE inkl. V&V) - ESt(zvE ohne V&V) ueber den Einkommensteuertarif §32a EStG (erfasst Progression); tarifliche ESt wird auf volle EUR abgerundet. Vereinfachter Modus: flacher Grenzsteuersatz als Eingabe.
- ESt-Tarif 2026 (Single): Grundfreibetrag 12.348 EUR; Eingangssatz 14 %; 42 % ab ~69.879 EUR; 45 % (Reichensteuer) ab 277.826 EUR. Splitting (Verheiratet) als Option.
- Optionale Zuschlaege: Solidaritaetszuschlag (5,5 % auf ESt oberhalb Freigrenze - fuer die meisten 0) und Kirchensteuer (8-9 %), per Toggle.

### Verkauf / Exit
- Spekulationssteuer (§23 EStG): Verkauf bei einem Zeitraum von nicht mehr als zehn Jahren -> Gewinn (Verkaufspreis - Verkaufsnebenkosten - Vorfaelligkeitsentschaedigung - Kaufpreis - KNK - nachtraegliche Herstellungskosten + bereits genutzte AfA) mit persoenlichem Steuersatz versteuern, sofern der modellierte private Veraeusserungsgewinn mindestens 1.000 EUR erreicht; im Jahresraster ab Exit-Jahr 11 steuerfrei.
- Verkaufsnebenkosten (Makler, ggf. Vorfaelligkeitsentschaedigung bei vorzeitiger Abloesung) abziehen; Restschuld tilgen -> Netto-Verkaufserloes.

### Kennzahlen, die ein "lohnt sich?"-Urteil ermoeglichen
- Bruttomietrendite = Jahreskaltmiete / Kaufpreis.
- Nettomietrendite = (Netto-Kaltmiete nach modelliertem Leerstand - vollstaendiger Eigentuemer-Cashout des aktiven Kostenmodus) / (Kaufpreis + KNK). Im Wirtschaftsplanmodus umfasst der Cashout N + W + den leerstandsbedingt nicht erstatteten Anteil von U.
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
- Arbeite sequenziell von Story 0 bis Story 14.
- Nach jedem Schritt: kurze Zusammenfassung, geaenderte Dateien, Test-/Command-Ergebnis, dann naechster Schritt.
- Keine Schritte ueberspringen. Wenn etwas fehlt, implementiere sinnvollen Fallback statt zu stoppen.
- Schreibe sauberen, testbaren Code mit klaren Schnittstellen. Rechenkern bleibt UI-frei und deterministisch.
- Jede Engine-Story braucht Unit-Tests mit mind. einem von Hand nachgerechneten Referenzfall.

## Handover Naechster Thread (Stand: 2026-07-24)
- Implementiert und lokal verifiziert: Stories 0 bis 13 sowie die nachtraeglichen Produkt-Erweiterungen inklusive versioniertem Agent-Draft, Agent Edit Mode, accountgebundener Browser-Agent-API, Remote-MCP mit Supabase-OAuth, vorlaeufigem 30-%-Bodenfallback, expliziten Boden-/Kosten-Berechnungsarten, direktem Wirtschaftsplan-Kostenmodus und kohortenbasierter WEG-Ruecklagenverwendung. Das aktuelle Szenarioformat ist Version 3; Version 1 und 2 werden additiv migriert. `SQL_CHECKSUM.md` dokumentiert weiterhin den fuer Staging vorgesehenen SQL-Stand; den aktuellen Commit-/Pushstatus zeigt Git.
- Die fuenf Agent-Aktionen der Szenarioleiste sind in einem zugaenglichen Dropdown gebuendelt; die Funktionen bleiben unveraendert.
- Offener Fokus: Story 14 fuehrt die bereits vorhandene lokale Agent-/MCP-Schicht vollstaendig in eine produktive Supabase-Umgebung. Solange Migration, OAuth-Server/Hook, kanonisches Metadata-Routing, Rate-Limits und Live-E2E-Abnahme nicht nachgewiesen sind, ist der Agentenmodus nicht produktionsfertig.
- Startpunkt fuer den naechsten Thread:
  1. Bei neuen Aenderungen zuerst `activity.md`, `memory.md` und dieses `PRD.md` laden.
  2. Bei Deployment-Auftrag mit `supabase/functions/agent-mcp/README.md` beginnen und erst nach erfolgreichem Live-Isolationstest aktiv schalten.
- Verify-Setup: `cd app && npm run lint && npm run typecheck && npm run build && npm run test`.

## Wirtschaftsplan, Bodenfallback und WEG-Ruecklage (Stand: 2026-07-22)

- Der Nutzer waehlt die aktive Bodenwert-Berechnungsart explizit: Prozent vom Kaufpreis oder Bodenrichtwert mal anteilige Grundstuecksflaeche. Nur die aktive Methode fliesst in Bodenwert und AfA (Absetzung fuer Abnutzung) ein; beide Eingabesaetze bleiben gespeichert. Auch ein Agent-Draft darf den Modus nicht aus gelieferten Rohwerten ableiten oder still umschalten.
- Im Bodenrichtwertmodus verwendet die Engine die exakte Formel nur bei vollstaendigem Bodenrichtwert, Gesamtgrundstueck und gueltigem MEA (Miteigentumsanteil). Solange mindestens eine Angabe fehlt, gilt die vorlaeufige 30-%-Standardannahme am Kaufpreis. Sie ist nicht standortunabhaengig konservativ. Sind Kaufpreis, Bodenrichtwert und MEA vorhanden, zeigt die App die dazu implizite Gesamtgrundstuecksflaeche und warnt: Bei einer groesseren realen Flaeche liegt der rechnerische Bodenanteil ueber 30 %. Bodenrichtwert, Prozentwert, Grundstueck und MEA bleiben als unabhaengige Rohwerte gespeichert; Moduswechsel oder der Fallback ueberschreiben sie nicht. Sobald die Angaben vollstaendig sind, greift automatisch wieder die exakte Rechnung.
- Amtlicher Punktabgleich fuer Paul-Heyse-Strasse 3: Leipziger Bodenrichtwertzone 71300181, Stichtag 01.01.2026, 680 EUR/m2, Wohnbaufläche, geschlossene Bauweise, WGFZ 2,4. Bei 60.000 EUR Kaufpreis und MEA 57/1000 entsprechen 30 % einer Gesamtgrundstuecksflaeche von rund 464,4 m2. Ohne die echte Flaeche aus Grundbuch, Flurstuecksnachweis oder Teilungserklaerung bleibt die 30-%-Einordnung deshalb vorlaeufig.
- Der neue Kostenmodus `wirtschaftsplan` uebernimmt drei Jahressummen direkt: umlagefaehige Kosten, nicht umlagefaehige Kosten und Zufuehrung zur WEG-Erhaltungsruecklage. Automatisch werden geplante Kosten, geplante Vorschuesse/Hausgeld, Monats-Hausgeld, Eigentuemer-Cashout sowie sofort und nicht sofort steuerlich beruecksichtigte Betraege gezeigt. Bei Leerstand belastet der bestehende Leerstandsprozentsatz zusaetzlich den entsprechenden Anteil der sonst vom Mieter getragenen umlagefaehigen Kosten.
- Der alte Modus `detailliert` bleibt fuer Schaetzungen unveraendert erhalten. Die Berechnungsart fuer laufende Kosten wird explizit zwischen `wirtschaftsplan` und `detailliert` gewaehlt; innerhalb der Details wird die Instandhaltung explizit pro m2/Jahr, als Mietprozentsatz oder absolut erfasst. Moduswechsel bewahren alle Eingaben; nur der jeweils aktive Satz fliesst in die Projektion ein. Das Szenarioformat verlangt den Hauptkostenmodus ab Version 3 zwingend, Legacy-Versionen werden weiterhin auf `detailliert` migriert.
- Im Wirtschaftsplanmodus gilt als pauschale, editierbare Standardannahme: 50 % jeder einzelnen WEG-Jahreszufuehrung werden nach durchschnittlich 5 Jahren verwendet. Die Kohortenregel ist exitunabhaengig und damit fuer Haltedauervergleiche praefixstabil. Die spaetere Verwendung ist kein zweiter Cash-Abfluss; vereinfachend wird sie dann als Werbungskosten fuer sofort abziehbaren Erhaltungsaufwand beruecksichtigt. Reale WEG-Massnahmen koennen insbesondere Herstellungskosten sein und steuerlich anders wirken. Der alte gemischte Detailmodus loest keine automatischen Entnahmen aus.
- Der kumulierte Ruecklagenbestand entspricht Zufuehrungen abzueglich modellierter Verwendungen. Nur auf diesen verbleibenden Bestand wirkt die optionale Preiswirkungsquote; Default bleibt 0 %, weil kein separater Auszahlungsanspruch gegen die WEG besteht. Ein positiver Wert ist ausschliesslich eine geschaetzte Marktpreiswirkung: Er erhoeht den modellierten Immobilien-Verkaufspreis und damit prozentuale Verkaufskosten sowie gegebenenfalls den Gewinn nach § 23 EStG. Er wird nicht noch einmal als separates Guthaben zum Nettoerloes addiert und darf nicht bereits in der Wertentwicklung enthalten sein.
- Szenarioformat 3 fuegt die Kostenmodus-, Wirtschaftsplan- und Verwendungsfelder hinzu. Version-1- und Version-2-Szenarien migrieren in den unveraenderten Detailmodus mit 0-EUR-Wirtschaftsplanwerten und den Annahmen 50 %/5 Jahre; damit entstehen fuer alte Szenarien keine automatischen Entnahmen. Fuer die JSONB-Szenariodaten ist keine Tabellenschema-Migration noetig. Damit Remote-MCP-Drafts die neuen Felder setzen koennen, muss jedoch die aktualisierte Validatorfunktion aus `supabase-agent-mcp.sql` deployt werden; App, Edge und SQL erlauben denselben Satz von 68 Agent-Feldpfaden.

## Nachtraegliche Agenten-Anbindung (Stand: 2026-07-16)

- Ein versionierter Agent-Draft-Vertrag erlaubt Agenten, aus PDF-, Webseiten-, API- oder Textquellen nur freigegebene Szenariofelder vorzubelegen. Jede gesetzte Angabe kann Quelle, Fundstelle, kurze Evidenz, Herkunft und Konfidenz tragen; IDs, Schema-Versionen und berechnete Ergebnisse sind nicht schreibbar.
- Die App oder Edge Function ruft keine beliebigen, vom Agenten genannten URLs ab. PDF/Web-Auswertung geschieht beim verbundenen Agenten; die App nimmt anschliessend ausschliesslich den strukturierten Draft entgegen. Dadurch entstehen weder ein allgemeiner Crawler noch ein SSRF-Pfad (Server-Side Request Forgery, serverseitiger Abruf fremder Ziele).
- Ein importierter oder ueber MCP erstellter Draft ist immer nur ein sicherer Zwischenstand. Er ersetzt das sichtbare Szenario erst nach einer ausdruecklichen Rueckfrage und wird nie automatisch als finales Szenario gespeichert.
- Der Agent Edit Mode kennzeichnet fehlende und unsichere Pflichtangaben sanft pulsierend, Widersprueche statisch, zeigt Evidenz und Warnungen, springt zum naechsten offenen Eingabefeld und passt bedingte Pflichtfelder an Moduswechsel an. Bei reduzierter Bewegung werden Animationen deaktiviert.
- Im Bodenrichtwertmodus sind Grundstücksfläche sowie beide MEA-Werte (Miteigentumsanteil: Ihr Anteil / Objekt gesamt) bedingte Pflichtangaben. Beim Exit sind Modus und der jeweils aktive Prozent- oder Pauschalwert Pflichtangaben. Partielle Agent-Drafts bleiben dadurch sichtbar prüfbar, ohne stille fachliche Defaults als bestätigt auszugeben.
- Solange Pflichtangaben oder Widersprueche offen sind, bleiben Kennzahlen sichtbar, aber deutlich als vorlaeufig markiert. Speichern, Speichern unter, Duplizieren und das Ueberschreiben eines gespeicherten Draft-Szenarios erfordern eine bewusste Bestaetigung.
- Eine bewusst aktivierbare Browser-Tab-API bietet Agenten Lesezugriff auf eigene Szenarien und kann Drafts nur bereitstellen. Jede Methode prueft zur Laufzeit erneut, ob Login und `ownerUserId` noch zum beim Verbindungsaufbau gebundenen Konto gehoeren; kopierte API-Referenzen verlieren bei Account-Wechsel oder Abmeldung ihre Gueltigkeit.
- Die Remote-MCP-Schicht verwendet denselben Supabase-Login wie die App: OAuth 2.1 mit PKCE fuehrt zum Immo-Checker-Freigabedialog, der das konkrete angemeldete Konto anzeigt. Erst nach ausdruecklicher Zustimmung wird der konkrete OAuth-Client fuer genau diesen Nutzer in `agent_oauth_grants` freigegeben; dies funktioniert mit DCR und vorregistrierten Clients.
- Signatur, Ablauf, Aussteller, Audience, Nutzer-ID, Client-ID und der serverseitige MCP-Claim des JWT werden geprueft. Der Token-Hook behaelt `client_id` auch ohne MCP-Grant als OAuth-Herkunftsmarker; Audience und MCP-Claim bleiben an Konfiguration, genehmigtes Profil und aktuellen Grant gebunden. RLS bindet jede Zeile an `auth.uid()` und verlangt weiterhin ein genehmigtes Profil sowie den aktuellen Nutzer-Client-Grant. `approved=false` oder Grant-Entzug sperren auch noch nicht abgelaufene Remote-Tokens; Account-Wechsel oder Abmeldung entwerten zusaetzlich die lokale Browser-Tab-API.
- Die App verwaltet OAuth- und Immo-MCP-Grants gemeinsam unter `Agent-Verbindungen`. Beim Trennen wird zuerst der konto- und clientgebundene MCP-Grant geloescht und danach der OAuth-Grant widerrufen. Teilzustaende bleiben sichtbar, damit ein Reconnect erst nach bewusster Bereinigung und erneuter Zustimmung erfolgt.
- Remote-Werkzeuge: eigene Szenarien/Drafts auflisten, ein eigenes Szenario oder einen Draft lesen, einen eigenen Draft anlegen, einen eigenen Draft per CAS aktualisieren und eine bereits beim Speichern erzeugte Analyse lesen. Es gibt kein Werkzeug zum finalen Erstellen/Aendern/Loeschen eines Szenarios, keine Adminwerkzeuge und keinen Service-Role-Key.
- Supabase stellt aktuell nur technische Standard-Scopes bereit; die effektiven Datenrechte werden deshalb nicht aus angezeigten Scope-Namen abgeleitet, sondern durch OAuth-Client-Grant, JWT-Pruefung und RLS erzwungen.
- Beim Speichern eines finalen Szenarios wird zusaetzlich ein Analyse-Snapshot fuer spaetere Agent-Auswertungen abgelegt. Fehlt die neue Datenbankspalte vor der Migration, faellt die Web-App kompatibel auf das bisherige Szenario-Speicherformat zurueck.
- Beim Cloud-Pull bleiben gueltige Szenarien auch dann verfuegbar, wenn einzelne Zeilen den aktuellen Vertrag verletzen. Die Zahl ausgelassener Zeilen wird bis zur manuellen Bestaetigung als Warnung angezeigt; parallele Antworten desselben oder eines gewechselten Kontos duerfen neuere Daten nicht ueberschreiben.
- Die MCP-Inbox wird nur nach bewusster Nutzeraktion geladen. Ein lokaler Agent-Draft oder der Agent Edit Mode loest keine unnoetige Remote-Abfrage aus.
- Die RFC-9728-Metadatenadresse wird aus der MCP-Resource korrekt durch Einfuegen von `/.well-known/oauth-protected-resource` zwischen Origin und Resource-Pfad gebildet. Da der nackte Supabase-Functions-Pfad diese Root-Route nicht automatisch bereitstellt, muss Produktion beide Pfade ueber ein Gateway oder einen Reverse Proxy kontrolliert auf dieselbe Function routen.

Verify:
```bash
cd app
npx vitest run src/agent/draft.test.ts src/app/AgentFlow.test.tsx src/components/agent/AgentDraftDialog.test.tsx src/components/agent/AgentReviewPanel.test.tsx src/components/auth/OAuthConsent.test.tsx src/components/auth/AuthGate.oauth.test.tsx src/lib/sync.agent.test.ts
npm run lint
npm run typecheck
npm run test
npm run build

cd ..
deno check supabase/functions/agent-mcp/index.ts
deno lint supabase/functions/agent-mcp/index.ts
deno fmt --check supabase/functions/agent-mcp/index.ts
```

Ergebnis dieses manuellen Runs: App-Lint, Typecheck, 234/234 Tests und Build sind gruen; Agent-Feldparitaet ist statisch 61/61/61, der Edge-Code besteht den lokalen TypeScript-Syntaxcheck und `git diff --check` ist gruen. Ein vollstaendiger Deno-Check ist mangels verfuegbarer Deno-Laufzeit nicht wiederholbar. SQL-Migration, Live-Deployment, Aktivierung des Supabase-OAuth-Servers/Hooks, Gateway-Rate-Limits und der echte OAuth-/MCP-End-to-End-Test bleiben umgebungsgebundene Deploymentschritte.

## Abschlussreview-Korrekturen (Stand: 2026-07-16)

- Die Migration verwendet in sicherheitskritischen Funktionen nicht mehr das reservierte PostgreSQL-Schluesselwort `grant` als Tabellenalias. Ein frueherer, unbenutzter generischer JSON-Helper wird idempotent entfernt; der formatspezifische Draft-Validator bleibt aktiv.
- Wenn Supabase `client_id` nur als Hook-Event-Feld liefert, wird sie vor allen Rueckgaben auch in die Exception-Basis uebernommen. Dadurch bleibt jedes OAuth-Token von einer direkten Web-Session unterscheidbar, waehrend `aud` und `immo_checker_mcp` weiterhin nur mit aktivem, konto- und clientgebundenem Grant gesetzt werden.
- Cloud-Synchronisation liefert gueltige Teilresultate plus Anzahl invalider Zeilen. Ausgelassene Zeilen und fatale Pull-Fehler sind als persistente, schliessbare Warnung sichtbar; eine Request-ID verhindert, dass eine aeltere parallele Antwort neuere Kontodaten ueberschreibt.
- In diesem Review wurde das Szenarioformat auf Version 2 gehoben. Version-1-Daten wurden explizit migriert; partielle Zwischenformen mit nur einem neuen Verkaufsnebenkostenfeld wurden abgewiesen. Version-2-Daten mussten alle historisch migrierten Pflichtfelder enthalten; Wrapper und Zeilen mussten dieselbe Version tragen. Der aktuelle Stand mit Version 3 ist im Abschnitt vom 22.07.2026 dokumentiert.
- Der einmal gemeldete Testflake blieb in 18 zusaetzlichen Gesamtsuiten sowie im finalen Lauf nicht reproduzierbar. Statt eines spekulativen Produktfixes wurde der konkrete externe React-Testaufruf korrekt synchronisiert; zukuenftige Fehlschlaege sollen mit verbose Log, Testname und Seed gesichert werden.

Verify:
```bash
cd app
npm run lint
npm run typecheck
npm run test
npm run build

cd ..
git diff --check
```

Ergebnis: gezielte Regressionstests 79/79, Gesamtsuite 246/246 in 29 Testdateien, Lint, Typecheck, Build und Whitespace-Check gruen. Eine vollstaendige Ausfuehrung von `supabase-agent-mcp.sql` bleibt mangels lokaler PostgreSQL-/Supabase-Laufzeit Teil der Live-Deployment-Verifikation.

## Nachtraegliche Fachreview-Korrekturen (Stand: 2026-07-15)

- DSCR bankueblich korrigiert: Zaehler ist jetzt Nettokaltmiete abzueglich Bewirtschaftungskosten geteilt durch den planmaessigen Kapitaldienst (Zins plus Tilgung); vorher fehlte der Kostenabzug.
- Stufen-Mietsteigerungsregeln haben ein optionales Feld `wirksamAbMonat` (1 bis 12, Default 1): Die Erhoehung wirkt im Startjahr anteilig ab diesem Monat (§ 558b BGB), ab dem Folgejahr voll; Folgeraten verzinsen auf dem vollen Stufenwert. Die Regel-Anzeige zeigt weiterhin das volle neue Mietniveau fuer den Mietspiegel-Vergleich.
- Neues Kosten-Feld `ruecklagenAnteilPct`: Der Anteil der Instandhaltung, der auf die WEG-Erhaltungsruecklage plus die kalkulatorische Reserve fuer das Sondereigentum entfaellt, bleibt Cash-Abfluss, wird aber nicht sofort als Werbungskosten abgezogen. Die Quote addiert keine Kosten, sondern teilt den eingegebenen Gesamt-Cashout steuerlich auf; die UI weist Gesamtbetrag, sofort und nicht sofort abziehbaren Teil fuer Jahr 1 explizit aus. Reglerhinweis und eigene CSV-Spalten benennen beide Bestandteile. Dieser gemischte Detailmodus modelliert weiterhin keine Entnahmen und holt einen spaeteren Werbungskostenabzug nicht automatisch nach; die spaetere Wirtschaftsplan-Erweiterung bildet WEG-Zufuehrungen getrennt ab. Das additive Feld `ruecklagenRestwertPct` steuert konservativ, welchen Anteil des verbleibenden Modellbestands ein Kaeufer voraussichtlich ueber den Immobilienpreis honoriert; Default ist 0 %. Der Betrag ist kein Auszahlungsanspruch und kein separates Guthaben: Er erhoeht Verkaufspreis, prozentuale Verkaufskosten und gegebenenfalls den §23-Gewinn und wird nicht noch einmal zum Nettoerloes addiert.
- AfA-Satz-Ableitung aus dem Baujahr greift jetzt in allen AfA-Modi (vorher nur linear): Baujahr-Aenderung, Objekttyp-Wechsel und Verfahrenswechsel leiten `linearSatzPct` einheitlich ueber `linearAfaRateForYear` ab; der Denkmal-Infotext zeigt den angewandten Altbau-Satz. Behebt veraltete 2,0 % bei Denkmal-Objekten mit Baujahr vor 1925.
- Die additiven Eingabefelder sind optional mit rueckwaertskompatiblen Defaults; bestehende Szenarien laden unveraendert und setzen die neue Ruecklagen-Preiswirkung konservativ auf 0 %.

Verify:
```bash
cd app
npx vitest run src/engine/timeline.test.ts src/engine/projection.test.ts src/lib/io.test.ts src/app/App.test.tsx
npm run lint
npm run typecheck
npm run test
npm run build
```

Ergebnis: Gesamtsuite 178/178 gruen; Lint, Typecheck und Build gruen; UI-Verifikation im Browser mit nachgerechneten Referenzwerten.

## Nachtraegliche Sanierungsplanung (Stand: 2026-07-15)

- Ein eigener elfter Eingabeabschnitt verwaltet beliebig viele Sanierungen und Modernisierungen mit Bezeichnung, Projektjahr, Betrag und optionalem Hinweis auf eine gegebenenfalls moegliche Mieterhoehung.
- Steuerliche Rechenannahmen: Sofortabzug fuer Erhaltungsaufwand, gleichmaessige Verteilung ueber zwei bis fuenf Jahre nach § 82b EStDV, regulaere Gebaeude-AfA fuer Herstellungskosten, Denkmal-AfA nach § 7i EStG, Denkmal-Erhaltungsaufwand nach § 11b EStG oder keine Steuerwirkung bei offener Einordnung.
- Der volle Betrag ist im Massnahmenjahr ein unfinanzierter Cash-Abfluss. Werbungskosten und zusaetzliche AfA werden getrennt in das Ergebnis aus Vermietung und Verpachtung eingerechnet. Aktivierte und bis zum Exit ausgefuehrte Kosten werden fuer den Spekulationsgewinn als Herstellungskosten beruecksichtigt.
- Das Projektjahr gilt vereinfachend als Zahlungs- und Abschlussjahr; Abschreibungen starten mit einem vollen Jahresbetrag. Die App warnt vor der taggenauen Drei-Jahres-/15-%-Pruefung und den Abstimmungs-/Bescheinigungsvoraussetzungen fuer Denkmalfaelle, klassifiziert diese aber nicht automatisch.
- Sanierungen erhoehen weder Objektwert noch Miete automatisch. Markierte Modernisierungen erzeugen im Mietbereich einen Hinweis `nach Abschluss in Jahr X ggf. moeglich`; eine angenommene Erhoehung muss weiterhin ueber eine Mietsteigerungsregel eingetragen werden.
- Cashflow-Chart, ausgewaehltes Jahresdetail und CSV-Export weisen Sanierungsauszahlungen beziehungsweise ihre Steuerkomponenten aus. Alte Szenarien der Version 1 ohne `sanierungen` werden additiv mit einer leeren Liste geladen und auf Version 2 migriert; Supabase benoetigt wegen JSONB keine SQL-Migration.

Verify:
```bash
cd app
npx vitest run src/engine/renovation.test.ts src/engine/projection.test.ts src/engine/exit.test.ts src/lib/io.test.ts src/store/scenarioStore.test.ts src/app/App.test.tsx
npm run lint
npm run typecheck
npm run test
npm run build
```

Ergebnis: Zieltests 68/68 gruen; Gesamtsuite 169/169 gruen; Lint, Typecheck und Build gruen.

## Nachtraegliche Dashboard-Jahresauswahl (Stand: 2026-07-15)

- Der Cashflow-Bereich im Dashboard bietet eine Auswahl fuer jedes Jahr der aktuellen Haltedauer.
- Das gewaehlte Jahr steuert sowohl die obere Monats-Cashflow-Kachel als auch die Detailwerte fuer Cashflow vor und nach Steuern pro Monat.
- Beim Wechsel des Szenarios wird Jahr 1 vorausgewaehlt. Wird die Haltedauer verkuerzt, wird ein nicht mehr vorhandenes Auswahljahr auf das letzte Projektionsjahr begrenzt.
- Haltedauerbezogene Renditewerte und der Netto-Exit bleiben von der Auswahl unberuehrt.

Verify:
```bash
cd app
npx vitest run src/app/App.test.tsx
npm run lint
npm run typecheck
npm run test
npm run build
```

Ergebnis: Zieltest 1/1 gruen; Gesamtsuite 159/159 gruen; Lint, Typecheck und Build gruen.

## Nachtraegliche Speicher-UX-Erweiterung (Stand: 2026-07-11)

- Jeder der elf Eingabeabschnitte enthaelt am Abschnittsende einen eigenen Button `Szenario speichern`; die zentrale Speicheraktion in der Szenarioleiste bleibt zusaetzlich erhalten.
- Alle Speicherbuttons verwenden dieselbe bestehende Speicher- und Cloud-Synchronisationslogik inklusive Rueckfrage beim Ueberschreiben.
- Die Liste gespeicherter Szenarien fuehrt das zuletzt gespeicherte Szenario zuerst. Beim Cloud-Laden wird nach `updated_at` absteigend sortiert und das zuletzt gespeicherte Szenario automatisch aktiv vorausgewaehlt.

Verify:
```bash
cd app
npx vitest run src/store/scenarioStore.test.ts
npm run lint
npm run typecheck
npm run test
npm run build
```

Ergebnis: Zieltests 15/15 gruen; Gesamtsuite 158/158 gruen; Lint, Typecheck und Build gruen.

## Nachtraeglicher PWA-Update-Fix (Stand: 2026-07-11)

- Die PWA (Progressive Web App) registriert ihren Service Worker ueber `virtual:pwa-register/react` im Prompt-Modus statt ueber das zuvor automatisch injizierte Minimal-Skript.
- Sobald eine neue Version bereitsteht, zeigt die App einen festen Update-Hinweis mit den Aktionen `Spaeter` und `Jetzt neu laden`.
- Das Neuladen erfolgt bewusst erst nach Nutzerbestaetigung, damit nicht gespeicherte Formulareingaben nicht durch ein automatisches Neuladen verloren gehen.
- Bei Aktivierungsfehlern bleibt der Hinweis sichtbar und empfiehlt ein manuelles Neuladen.
- Der Produktions-Build enthaelt kein separates `registerSW.js` mehr. Der wartende Service Worker wird ueber `SKIP_WAITING` aktiviert und die Seite danach neu geladen.

Verify:
```bash
cd app
npx vitest run src/components/PwaUpdatePrompt.test.tsx
npm run lint
npm run typecheck
npm run test
npm run build
```

Ergebnis: Zieltests 4/4 gruen; Gesamtsuite 157/157 gruen; Lint, Typecheck und Build gruen.

## Nachtraegliche Auth/Admin-Erweiterung (Stand: 2026-06-21)
- Die Berechnungslogik bleibt client-seitig. Anmeldung, Profilstatus und optionale Cloud-Szenario-Synchronisation laufen ueber Supabase Auth, `profiles` und `scenarios`.
- Admins koennen User im Admin-Dashboard genehmigen, sperren, loeschen, Passwort-Reset-Mails senden und die globale Einstellung `Neue Accounts brauchen Admin-Freigabe` an-/ausschalten.
- Szenarien sind strikt accountgebunden: Der UI-State wird beim Account-Wechsel sofort auf den neuen `ownerUserId` umgestellt und fremde/in-flight Cloud-Antworten duerfen den aktuellen Account-State nicht ueberschreiben. Admins haben ueber normale Tabellenrechte keinen Lesezugriff auf fremde Szenario-Inhalte.
- Bestehende Supabase-Instanzen muessen fuer Auth/Admin-Fixes die idempotente Migration `supabase-auth-admin-migration.sql` ausfuehren; Neuinstallationen nutzen `supabase-setup.sql`.
- Auth-E-Mail-Links muessen auf die Vite-App-Basis zeigen, z. B. `/Immo-Checker/`, damit statische Hosts nicht mit 404 auf Unterrouten antworten.

## Nachtraegliche Mietspiegel-/Notizen-Erweiterung (Stand: 2026-07-10)

- Jedes Szenario enthaelt ein freies Notizenfeld. Die Notizen werden beim expliziten Speichern zusammen mit dem vollstaendigen Szenario uebernommen und bleiben in Cloud-Synchronisation sowie JSON-Export/-Import erhalten.
- Die Mietsektion enthaelt drei frei editierbare Mietspiegelwerte in EUR je m2 Wohnflaeche und Monat: unteren Spannwert, Mittelwert und oberen Spannwert.
- Die aktuell angesetzte, zwischen Monats-/Jahres-/m2-Eingabe synchronisierte Nettokaltmiete pro m2 wird live als `unterhalb`, `innerhalb` oder `oberhalb` des Spannbereichs eingeordnet. Untere und obere Grenze zaehlen inklusive zum Spannbereich.
- Einordnung und Anzeige verwenden dieselbe Cent-Genauigkeit. Zusaetzlich wird die absolute Abweichung vom Mittelwert ausgewiesen.
- Unvollstaendige Nullwerte erhalten keine Ampel-Einordnung; eine unplausible Reihenfolge ausserhalb `unterer Spannwert <= Mittelwert <= oberer Spannwert` wird als Eingabefehler angezeigt.
- Die Live-Ampel bewertet weiterhin nur die aktuell angesetzte Miete. Das Mietdiagramm legt den eingegebenen unteren Spannwert, Mittelwert und oberen Spannwert zusaetzlich als statische Orientierung ueber die projizierte Mietentwicklung: schattierter Spannbereich, drei Vergleichslinien, Legende und Tooltip jeweils in EUR/m2/Monat und gesamter Monatskaltmiete.
- Unter jeder Mietsteigerungsregel steht der mit derselben Zeitreihenlogik berechnete Mietstand in ihrem Startjahr, jeweils pro m2/Monat und gesamt/Monat. Dabei werden alle bis dahin wirksamen Regeln kombiniert; gleichjaehrige Regeln zeigen denselben Jahreswert.
- Regeln ausserhalb der Haltedauer werden weiter bis zu ihrem Startjahr berechnet, aber als nicht im Diagramm enthalten markiert. Bei doppelten Jahresraten im selben Startjahr wird die nach bestehender Zeitreihensemantik nicht wirksame spaetere Rate gekennzeichnet.
- Der Mietspiegel wird nicht automatisch fortgeschrieben. Die Visualisierung ist nur eine rechnerische Orientierung und keine rechtliche Pruefung einer Mieterhoehung.
- Bestehende Szenarien der Version 1 bleiben kompatibel: fehlende Notizen werden als leerer Text und fehlende Mietspiegelwerte als 0 migriert, anschliessend gilt Version 2. Es ist keine SQL-Migration erforderlich, da Supabase das Szenario als JSONB speichert.

Verify:
```bash
cd app
npx vitest run src/engine/rent.test.ts src/engine/defaults.test.ts src/store/scenarioStore.test.ts src/lib/io.test.ts
npm run lint
npm run typecheck
npm run test
npm run build
```

Ergebnis: Zieltests 56/56 gruen; Gesamtsuite 153/153 gruen; Lint, Typecheck und Build gruen.

## Story-Status-Uebersicht (Stand: 2026-07-24)
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
| 14 | Agentenmodus produktiv mit Supabase integrieren | TODO |

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
  - Objekt: Kaufpreis, Wohnflaeche m2, Baujahr/Fertigstellungsjahr, Bundesland, Objekttyp (Bestand/Neubau/Denkmal), Bodenwertanteil % oder Bodenrichtwert EUR/m2 mit Grundstücksflaeche und MEA (Miteigentumsanteil), Sanierungskosten (Denkmal-Topf).
  - Kaufnebenkosten: GrESt % (aus Bundesland vorbelegt, editierbar), Notar/Grundbuch %, Makler %, Flag "KNK fremdfinanzieren" (Default: nein) und optionaler fremdfinanzierter KNK-Anteil %.
  - Finanzierung: Eigenkapital (% ODER absolut, umschaltbar) fuer Kaufpreis + Sanierungskosten ohne KNK, Darlehensbetrag (abgeleitet), Sollzins %, anfaengliche Tilgung %, Zinsbindung (Jahre), Anschlusszins % (nach Zinsbindung), jaehrliche Sondertilgung (Betrag oder %), optional Disagio.
  - Miete: Kaltmiete (EUR/Monat oder EUR/m2), Leerstand/Mietausfallwagnis %, Mietsteigerungs-Szenario (flexible Zeitreihe, s. Story 3).
  - Laufende Kosten wahlweise als detaillierte Schaetzung (Instandhaltung EUR/m2/Jahr, % der Miete oder absolut; Verwaltung; sonstige Kosten) oder als drei direkte Wirtschaftsplan-Summen (umlagefaehig, nicht umlagefaehig, WEG-Ruecklagenzufuehrung); Kostensteigerung % p. a.
  - Steuer: Eingabemodus (Bruttojahresgehalt zvE ODER fester Grenzsteuersatz %), Veranlagung (Single/Splitting), Soli-Toggle, Kirchensteuer % (Toggle).
  - AfA: AfA-Modus (linear nach Baujahr / degressiv 5 % / Sonder-AfA §7b / Denkmal §7i), Gebaeude-AfA-Satz (abgeleitet, editierbar).
  - Wertentwicklung: Wertsteigerungs-Szenario (flexible Zeitreihe, s. Story 3).
  - Exit: Haltedauer (Jahre), Verkaufsnebenkosten wahlweise in % oder als EUR-Pauschale, optional vorzeitiger Verkauf vor Ablauf Zinsbindung (Vorfaelligkeit %).
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
- Bewirtschaftungskosten-Engine: Detailmodus mit Instandhaltung (EUR/m2/Jahr, % der Miete oder absolut), Verwaltung und sonstigen Kosten; Wirtschaftsplanmodus mit umlagefaehigen Kosten, nicht umlagefaehigen Kosten und WEG-Ruecklagenzufuehrung; jaehrliche Kostensteigerung als eigene Zeitreihe/Rate.
- Klare Trennung umlagefaehig vs. nicht umlagefaehig: Umlagefaehige Kosten belasten den Eigentuemer wirtschaftlich nur mit dem anhand der Leerstandsquote nicht erstatteten Anteil. WEG-Zufuehrungen sind Cash-out, aber erst bei modellierter bzw. tatsaechlicher Verwendung steuerlich zu klassifizieren.

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
- V&V-Ergebnis je Jahr = Kaltmiete nach Leerstand - Schuldzinsen - AfA - sofort abziehbare nicht umlagefaehige Kosten - leerstandsbedingt nicht erstattete umlagefaehige Kosten - modellierte WEG-Verwendungen - weitere Werbungskosten. Tilgung und blosse Ruecklagenzufuehrung sind nicht abziehbar.

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
- Spekulationssteuer (§23 EStG): wenn Haltedauer im Jahresraster <= 10 Jahre und Gewinn >= 1.000 EUR, Gewinn = Verkaufspreis - Verkaufsnebenkosten - Vorfaelligkeitsentschaedigung - Anschaffungs-/Herstellungskosten + kumulierte AfA, versteuert mit Grenzsteuersatz bzw. Tarifdelta; ab Exit-Jahr 11 sonst 0.
- Kennzahlen-Modul `src/engine/metrics.ts`:
  - Bruttomietrendite, Nettomietrendite, Kaufpreisfaktor.
  - Cash-on-Cash-Rendite (Jahr 1 und Durchschnitt), ROE.
  - IRR der Eigenkapital-Cashflows: -EK in t0, jaehrliche Cashflows nach Steuer, + Netto-Verkaufserloes im Exit-Jahr (`computeIRR`, robuster Solver).
  - Break-even-Kennzahlen: Break-even-Zins, Break-even-Miete (Cashflow nach Steuer = 0).
- Gesamturteil-Hilfen: Vergleich gegen Alternativrendite-Schwelle (Eingabe), Ampel/Score.

When complete:
- IRR-Solver verifiziert gegen bekannte Cashflow-Reihe (z. B. analytisch loesbarer Fall, Toleranz < 0,01 %).
- Spekulationssteuer ist bei Haltedauer 10 J. und Gewinn >= 1.000 EUR noch > 0; ab Exit-Jahr 11 ist sie 0 (Test).
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

Kontext: Story 6 berechnet EINEN gewaehlten Exit. Story 13 beantwortet explizit "Was kommt raus, wenn ich nach X Jahren verkaufe?" - fuer JEDES moegliche Verkaufsjahr bis zur maximal unterstuetzten Haltedauer (aktuell 40 Jahre), unabhaengig von der aktuell gewaehlten Haltedauer, inkl. des bis dahin (oft negativen) aufgelaufenen Cashflows. Dadurch kann der Nutzer die Haltedauer anhand des optimalen Exit-Jahrs auswaehlen.

Anforderungen:
- Funktion `analyzeHoldingPeriods(scenario)` in `src/engine/holding.ts`, die fuer jedes Jahr `t = 1..H` mit dem maximalen Vergleichshorizont `H = 40` einen Exit-an-diesem-Jahr durchrechnet und je `t` liefert:
  - **Netto-Verkaufserloes(t)** = projizierter Immobilienwert(t) - Verkaufsnebenkosten - Restschuld(t) - ggf. Vorfaelligkeit.
  - **Spekulationssteuer(t)** nach §23 EStG: im Jahresraster bei `t <= 10` und Gewinn >= 1.000 EUR Gewinn (Verkaufspreis - Verkaufsnebenkosten - Vorfaelligkeit - Anschaffungs-/Herstellungskosten + kumulierte AfA bis t) * Grenzsteuersatz bzw. Tarifdelta; ab `t >= 11` = 0 (steuerfrei).
  - **Kumulierter Cashflow nach Steuer(t)** = Summe der jaehrlichen Cashflows nach Steuer von Jahr 1..t (kann negativ sein und MUSS in den Gewinn einfliessen).
  - **Gesamtgewinn(t)** = kumulierter Cashflow nach Steuer(t) + Netto-Verkaufserloes(t) - Spekulationssteuer(t) - eingesetztes Eigenkapital(t0).
  - **EK-Profitabilitaet insgesamt(t)** = Gesamtgewinn(t) / eingesetztes Eigenkapital (Gesamt-Multiple bzw. Gesamtrendite ueber die Haltedauer).
  - **EK-Profitabilitaet p. a.(t)** = annualisierte Rendite: IRR der EK-Cashflows (-EK in t0, jaehrliche Cashflows nach Steuer, + Netto-Verkaufserloes - Spekulationssteuer in t) sowie alternativ CAGR auf Basis Gesamt-Multiple; beide ausweisen.
  - Zusatzspalten: Restschuld(t), Immobilienwert(t), enthaltene Spekulationssteuer ja/nein, Break-even-Jahr (erstes `t` mit Gesamtgewinn >= 0).
- Ableitung "lohnt sich?"-Hilfen: bestes Exit-Jahr nach IRR im gesamten Maximalhorizont, unabhaengig von der gewaehlten Haltedauer; Markierung der Steuerfreiheit ab Exit-Jahr 11; Vergleich der p.-a.-Rendite gegen eine eingegebene Zielrendite (Ampel).
- UI-Anbindung: Tabelle "Verkauf nach Jahr X" + Chart (Gesamtgewinn und IRR ueber alle 40 Exit-Jahre), Hervorhebung der Schwelle ab Jahr 11 und der aktuell gewaehlten Haltedauer. (Nutzt Story 9-Bausteine.)

When complete:
- `analyzeHoldingPeriods` liefert unabhaengig von der aktuell gewaehlten Haltedauer fuer alle `t = 1..40` konsistente Werte; das beste Exit-Jahr und seine IRR bleiben bei reiner Aenderung der gewaehlten Haltedauer identisch. Summen-/Identitaetscheck: Exit im gewaehlten Haltejahr stimmt mit Story 6 ueberein (Toleranz < 1 EUR).
- Negativer kumulierter Cashflow wird nachweislich vom Verkaufserloes abgezogen (Test mit unterdecktem Szenario).
- Spekulationssteuer ist bei `t = 10` mit Gewinn >= 1.000 EUR > 0 und ab `t = 11` = 0 (Test).
- EK-Profitabilitaet wird p. a. (IRR + CAGR) UND insgesamt (Multiple) ausgewiesen; Referenzfall plausibel.
- UI zeigt die Exit-Jahr-Tabelle + Chart bis Jahr 40, inkl. Markierung der Steuerfreiheit ab Jahr 11, der gewaehlten Haltedauer und des global besten Exit-Jahrs.
- Output: `<promise>COMPLETE</promise>`

Verify:
```bash
cd app && npx vitest run src/engine/holding.test.ts
npm run build
```

Abhaengigkeiten:
- Story 2-6 (Projektion, Exit, Metrics/IRR). UI nutzt Story 9.

Risiken/Tradeoffs:
- IRR pro Exit-Jahr ist rechenintensiv (H Loesungen) - akzeptabel beim festen Horizont H = 40; Ergebnisse memoizen. Bei sehr fruehen Exit-Jahren kann IRR mehrdeutig/instabil sein -> robusten Solver + Fallback auf CAGR.

---

## Story 14 - Agentenmodus produktiv mit Supabase integrieren
Prioritaet: Hoch | Status: TODO

Kontext:
- Der lokale Produktcode fuer Agent-Drafts, Agent Edit Mode, Browser-Agent-API, OAuth-Freigabedialog, Verbindungsverwaltung, MCP-Draft-Inbox, Analyse-Snapshots, SQL-Migration und Edge Function ist vorhanden.
- Produktiv unvollstaendig sind die umgebungsgebundenen Teile: echte Datenbankmigration, Supabase-OAuth- und Hook-Konfiguration, Function-Deployment, kanonisches RFC-9728-Metadatenrouting, externe Rate-Limits und Live-Abnahme mit getrennten Konten.
- MCP = Model Context Protocol (standardisierte Agenten-Werkzeugschnittstelle). RLS = Row Level Security (datenbankseitige Zeilenrechte). E2E = End-to-End (Pruefung des gesamten realen Ablaufs).

Umsetzungsreihenfolge / TODO:

1. **Staging-Preflight und Sicherung**
   - Ziel-Supabase-Projekt, App-Host und kanonischen MCP-Host festlegen; Staging zuerst, Produktion erst nach kompletter Abnahme.
   - Datenbanksicherung beziehungsweise getesteten Restore-Punkt erstellen und bestehende Tabellen, Funktionen, Hooks sowie permissive RLS-Policies inventarisieren.
   - `supabase-agent-mcp.sql` gegen `SQL_CHECKSUM.md` pruefen. Unbekannte permissive Policies fachlich pruefen; die Migration darf in diesem Fall bewusst abbrechen und wird nicht durch Abschalten der Schutzpruefung erzwungen.

2. **Datenbankmigration einspielen und pruefen**
   - Bei Bestandsinstallationen zuerst `supabase-auth-admin-migration.sql`, anschliessend die aktuelle `supabase-agent-mcp.sql` ausfuehren; bei Neuinstallationen `supabase-setup.sql` plus `supabase-agent-mcp.sql`.
   - Tabellen, Constraints, Trigger, RPCs (Remote Procedure Calls, aufrufbare Datenbankfunktionen), Grants und RLS-Policies fuer `scenarios`, `scenario_drafts`, `agent_oauth_grants`, `profiles` und `agent_mcp_config` pruefen.
   - Agent-Feldparitaet zwischen App, Edge Function und SQL-Validator fuer aktuell 68 Pfade pruefen. Erst danach `agent_mcp_config` mit exakt der kanonischen Audience aktivieren.

3. **Supabase OAuth und Token-Hook konfigurieren**
   - OAuth-Server aktivieren, Authorization Path auf den produktiven Immo-Checker-Freigabedialog setzen und Redirect-URLs fuer App und MCP-Clients erlauben.
   - Betriebsmodell entscheiden und dokumentieren: DCR (Dynamic Client Registration, dynamische Client-Registrierung) oder vorregistrierte Clients. Beide muessen denselben nutzer- und clientgebundenen Grant-Pfad verwenden.
   - Asymmetrischen JWT-Signaturschluessel (z. B. ES256/RS256) verwenden und den Custom Access Token Hook `public.custom_access_token_hook` aktivieren.
   - Positiv und negativ pruefen: Nur ein genehmigtes Konto-Client-Paar erhaelt `aud` und `immo_checker_mcp=true`; normale Web-Sessions, nicht genehmigte Profile und widerrufene Grants erhalten keinen MCP-Zugriff.

4. **Edge Function konfigurieren und deployen**
   - `MCP_RESOURCE_URI` auf die kanonische HTTPS-Resource und `MCP_ALLOWED_ORIGINS` auf die explizit erlaubten App-Origins setzen; keine Wildcards, Credentials, Querystrings oder Fragmente.
   - `agent-mcp` deployen. Die Function nutzt nur Publishable-/Anon-Key plus Nutzer-Bearer-Token, niemals einen Service-Role-Key.
   - Vor Deployment `deno check`, `deno lint` und `deno fmt --check` ausfuehren; CORS, Request-/Response-Groessen und die absichtlich oeffentliche Discovery-Antwort pruefen.

5. **Kanonisches Metadata-Routing bereitstellen**
   - MCP-Resource und die aus ihr abgeleitete RFC-9728-Route `/.well-known/oauth-protected-resource/...` ueber einen kontrollierten Custom Host, ein Gateway oder einen Reverse Proxy auf dieselbe Edge Function routen.
   - Oeffentliche Metadaten muessen die kanonische Resource und den richtigen Authorization Server ausweisen. Nicht authentifizierte MCP-Aufrufe muessen eine passende `401`-Antwort mit `WWW-Authenticate` liefern; ungueltige Tokens zusaetzlich `invalid_token`.

6. **Externe Schutzgrenzen und Betrieb einrichten**
   - Rate-Limits mindestens pro IP, nach Moeglichkeit zusaetzlich pro `client_id` und Konto am Gateway/Proxy/WAF (Web Application Firewall) konfigurieren.
   - Harte Request-Groessen, Timeouts und begrenzte Parallelitaet setzen. Logs und Alarme duerfen weder Bearer-Tokens noch Draft-/Szenario-Payloads enthalten.
   - Alarmierung fuer uebermaessige `401`/`403`/`429`, Function-Fehler und Datenbank-Constraint-Verletzungen sowie einen dokumentierten Rollback-/Grant-Revoke-Ablauf einrichten.

7. **App-Deployment verbinden**
   - Produktive Supabase-URL und Publishable-/Anon-Key ueber die vorhandenen Vite-Variablen setzen, ohne Secrets ins Repository zu schreiben.
   - Login, Freigabedialog, `Agent-Verbindungen`, manuelles Laden der MCP-Inbox und das Agent-Dropdown auf dem produktiven App-Host pruefen.
   - Sicherstellen, dass Auth-Mail-Redirects und der OAuth-Authorization-Path die reale App-Basis-URL treffen.

8. **Live-E2E-Abnahme mit mindestens zwei Konten**
   - Konto A und Konto B getrennt freigeben. Fuer Konto A einen MCP-Client verbinden, Consent anzeigen, Draft anlegen/aktualisieren/lesen und eine gespeicherte Analyse lesen.
   - Nachweisen, dass Konto B weder Szenarien, Drafts, Analysen noch Grants von Konto A auflisten oder lesen kann; manipulierte IDs und falsche `client_id` muessen mit `403`/nicht sichtbar enden.
   - Nachweisen, dass der MCP-Client keine finalen Szenarien erstellen, aendern oder loeschen und keine Admin-RPCs aufrufen kann.
   - CAS-Konflikt (Compare-and-Swap, revisionsgebundene Aktualisierung), ungueltige/zu grosse Drafts, unbekannte Origins, abgelaufene Tokens und Rate-Limit-Ueberschreitung negativ testen.
   - Grant in `Agent-Verbindungen` widerrufen und nachweisen, dass auch ein noch nicht abgelaufenes Token sofort gesperrt ist. Teilzustaende aus nur OAuth- oder nur MCP-Grant muessen sichtbar und bereinigbar bleiben.
   - Draft aus der MCP-Inbox erst nach Nutzeraktion laden, als sicheren Zwischenstand oeffnen, pruefen und erst ueber den normalen Speichern-Flow finalisieren.

9. **Gestufter Rollout und Abschlussnachweis**
   - Staging-Abnahmeprotokoll mit Migration, Konfiguration, anonymisierten Testresultaten und Rollback-Ergebnis ablegen.
   - Produktion zunaechst fuer wenige freigegebene Konten aktivieren; nach Beobachtungsphase Rate-Limits und Fehlerraten pruefen.
   - Erst wenn alle nachfolgenden Erfolgskriterien belegt sind, Story 14 auf `DONE` setzen und Deferred-Verify-Register, `activity.md`, `memory.md` sowie Betriebsdokumentation aktualisieren.

When complete:
- Migration und aktueller SQL-Checksum-Stand sind in Staging und Produktion nachvollziehbar angewendet; alle erwarteten Constraints/RLS-Policies sind aktiv.
- OAuth-Consent bindet sichtbar das richtige Konto an den richtigen Client. Direkte Web-Sessions bleiben funktionsfaehig, erhalten aber keine MCP-Claims.
- Kanonische Protected Resource Metadata, OAuth-Discovery und `401`-Challenge funktionieren ueber die produktive HTTPS-URL.
- Alle vorgesehenen MCP-Werkzeuge funktionieren fuer eigene Daten; finale Szenario-Schreib-/Loesch- und Admin-Zugriffe existieren nicht.
- Zwei-Konten-Isolation, Grant-Widerruf, Origin-Schutz, Eingabegrenzen, CAS-Konflikt und externe Rate-Limits sind live negativ getestet.
- Die produktive App zeigt Agent-Dropdown, Freigabedialog, Verbindungsverwaltung und MCP-Inbox ohne automatische Draft-Uebernahme.
- Keine Service-Role-Credentials im Function-Pfad, Browser-Bundle, Repository oder in Logs.
- Lokale App-Pruefkette, Deno-Pruefung und dokumentierter Live-E2E-Lauf sind gruen; Rollback und Monitoring sind dokumentiert.

Verify:
```bash
shasum -a 256 supabase-agent-mcp.sql

cd app
npm run lint
npm run typecheck
npm run test
npm run build

cd ..
deno check supabase/functions/agent-mcp/index.ts
deno lint supabase/functions/agent-mcp/index.ts
deno fmt --check supabase/functions/agent-mcp/index.ts
```

Live-Verify (gegen Staging, spaeter identisch gegen Produktion):
- Kanonische Metadata-URL per `curl -i` auf `200`, Inhalt und HTTPS pruefen.
- MCP-Resource ohne Token auf `401` plus `WWW-Authenticate`, mit falschem/entzogenem Token auf `401` oder `403` pruefen.
- Vollstaendige Zwei-Konten-Matrix fuer `list_scenarios`, `get_scenario`, `create_draft`, `update_draft` und `analyze_scenario` protokollieren.
- Gateway-Limit kontrolliert ausloesen und `429` ohne Token-/Payload-Leak im Log nachweisen.

Abhaengigkeiten:
- Supabase-Projektzugriff, SQL-Editor/CLI, OAuth-Server-Konfiguration, Hook-Aktivierung, asymmetrischer JWT-Key, Edge-Function-Deployment, DNS/Custom Host oder Reverse Proxy sowie zwei reale Testkonten.

Risiken/Tradeoffs:
- Diese Story ist sicherheits- und umgebungsgebunden. Lokale Tests ersetzen weder RLS-/OAuth-Isolation noch Gateway-Konfiguration.
- DCR erhoeht die Client-Kompatibilitaet, vergroessert aber die Zahl registrierter Clients; Vorregistrierung ist enger kontrollierbar, braucht jedoch Betreiberpflege.
- `verify_jwt = false` bleibt nur deshalb zulaessig, weil die Function Discovery oeffentlich bedienen und jeden geschuetzten Aufruf selbst kryptografisch plus per RLS/RPC pruefen muss.

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
