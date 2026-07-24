# Paul-Heyse-Straße 3: Kosten- und IRR-Audit

Stand: 22.07.2026

## Ergebnis in einem Satz

Die Originalunterlagen belegen für den Wirtschaftsplan 2025/2026 1.194,99 EUR umlagefähige Kosten, 554,06 EUR nicht umlagefähige Kosten und 456,00 EUR WEG-Erhaltungsrücklage. Im neuen Wirtschaftsplanmodus ergibt das bei 3 % Leerstand 1.045,91 EUR jährlichen Eigentümer-Cashout und in der transparent rekonstruierten Basisrechnung rund 3,00 % IRR. Werden 1.000 EUR Instandhaltung zusätzlich zu Verwaltung und sonstigen Kosten eingegeben, entsteht eine Doppelzählung; dann fällt die rekonstruierte IRR auf rund 0,29 %.

Der Kaufpreis bleibt wie vom Nutzer gewünscht bei 60.000 EUR. Der Angebotspreis von 70.000 EUR wird nicht in das Szenario übernommen.

## Bestätigte Objektdaten

Die fünf Originalunterlagen bestätigen das konkrete Objekt und die Einheit:

- Paul-Heyse-Straße 3, 04347 Leipzig
- Wohnung Nr. 4 im 1. Obergeschoss, zwei Zimmer
- 57/1.000 Miteigentumsanteile; zwölf Wohnungen in der Gemeinschaft
- Mietbeginn 01.06.2015
- vertragliche Kaltmiete 211,00 EUR pro Monat beziehungsweise 2.532,00 EUR pro Jahr
- Nebenkostenvorauszahlung 112,00 EUR pro Monat; die OCR-Zahl 412,00 EUR ist wegen der Gesamtforderung von 323,00 EUR offensichtlich ein Erkennungsfehler

Die Unterlagen enthalten keine spätere Mieterhöhung. Ob 211,00 EUR auch heute tatsächlich gezahlt werden, sollte zusätzlich mit dem letzten Mietkonto oder der letzten Mieterhöhung bestätigt werden.

## Wirtschaftsplan 2025/2026: korrekte Kostentrennung

| Kostenblock | Betrag p. a. | Einordnung im Modell |
|---|---:|---|
| umlagefähige Betriebskosten | 1.194,99 EUR | grundsätzlich vom Mieter getragen; nicht als dauerhafte Eigentümerkosten nochmals abziehen |
| laufende Reparaturen | 114,00 EUR | Instandhaltung, sofort abziehbarer Anteil |
| WEG-Erhaltungsrücklage | 456,00 EUR | echter Cash-Abfluss, aber bei Einzahlung nicht sofort steuerlich abziehbar |
| Verwaltervergütung | 300,00 EUR | Verwaltung |
| sonstige Verwaltungskosten | 12,50 EUR | Verwaltung |
| sonstige Kosten | 11,40 EUR | sonstige Eigentümerkosten |
| Kontogebühren | 6,16 EUR | sonstige Eigentümerkosten |
| Rechtsschutzversicherung | 110,00 EUR | sonstige Eigentümerkosten |
| **nicht umlagefähig ohne Rücklage** | **554,06 EUR** | Eigentümerkosten, grundsätzlich sofort abziehbar vorbehaltlich Einzelfallprüfung |
| **Eigentümerkosten inklusive Rücklage** | **1.010,06 EUR** | vollständiger jährlicher Eigentümer-Cashout laut Plan |

Das gesamte Hausgeld beträgt 2.205,05 EUR pro Jahr beziehungsweise gerundet 184,00 EUR pro Monat. Davon entfallen rechnerisch monatlich 99,58 EUR auf umlagefähige Kosten, 46,17 EUR auf nicht umlagefähige laufende Kosten und 38,00 EUR auf die Rücklage.

## Empfohlene App-Eingaben aus dem Wirtschaftsplan

| App-Feld | Dokumentbasierter Wert | Herleitung |
|---|---:|---|
| Kaufpreis | **60.000 EUR** | bewusst gewählter Kaufpreis; 70.000 EUR ist nur der Angebotspreis |
| Kaltmiete pro Monat | **211,00 EUR** | Mietvertrag; aktuelle Zahlung noch separat bestätigen |
| Kosten-Erfassung | **Direkt aus Wirtschaftsplan** | die drei dokumentierten Summen werden ohne manuelle Unterteilung übernommen |
| Summe umlagefähige Kosten | **1.194,99 EUR p. a.** | Wirtschaftsplan |
| Summe nicht umlagefähige Kosten | **554,06 EUR p. a.** | Wirtschaftsplan; enthält hier Reparaturen, Verwaltung und sonstige nicht umlagefähige Kosten |
| Summe Zuführung Erhaltungsrücklage | **456,00 EUR p. a.** | Wirtschaftsplan |
| Erwartete Rücklagenverwendung | **50 % je Jahreszuführung nach 5 Jahren** | pauschale, editierbare Modellannahme, keine Aussage über einen einzelnen Beschluss |
| Rücklagen-Preiswirkung beim Exit | **0 % im Basisfall** | kein separates Guthaben; positive Werte nur als geschätzter Immobilienpreiseffekt |

Die App berechnet daraus bei der im Szenario verwendeten Leerstandsquote von 3 % automatisch:

```text
Summe geplante Kosten (U + N)             1.749,05 EUR
Summe geplante Vorschüsse / Hausgeld      2.205,05 EUR
Hausgeld pro Monat                           183,75 EUR
Leerstandsanteil U (1.194,99 × 3 %)           35,85 EUR
Eigentümer-Cashout (N + W + Leerstand-U)  1.045,91 EUR
davon sofort berücksichtigt                 589,91 EUR
davon nicht sofort berücksichtigt           456,00 EUR
```

Bei 0 % Leerstand bleiben Eigentümer-Cashout 1.010,06 EUR und sofort berücksichtigter Anteil 554,06 EUR. Der Leerstand kostet nicht nur Kaltmiete: Für den unvermieteten Anteil muss der Eigentümer vereinfachend auch die sonst umlagefähigen Betriebskosten selbst tragen.

Der alte Detailmodus kann dieselben 1.010,06 EUR weiterhin über 570 EUR Instandhaltung, 80 % Rücklagenanteil, 312,50 EUR Verwaltung und 127,56 EUR sonstige Kosten abbilden. Für das direkte Übertragen eines Wirtschaftsplans ist diese Zerlegung aber unnötig und fehleranfälliger; außerdem modelliert nur der neue Wirtschaftsplanmodus die spätere WEG-Rücklagenverwendung.

Wichtig: Wenn in der App bereits 1.000 EUR Instandhaltung **plus** 312,50 EUR Verwaltung **plus** 127,56 EUR sonstige Kosten stehen, werden 1.440,06 EUR statt 1.010,06 EUR angesetzt. Die Überhöhung beträgt 430,00 EUR beziehungsweise 42,6 %.

Falls die 1.000 EUR dagegen als pauschaler **Gesamtbetrag aller Eigentümerkosten** eingetragen wurden und Verwaltung/sonstige Kosten auf null stehen, ist der Cashout fast richtig. Dann ist aber die steuerliche Aufteilung falsch: 850 EUR nicht sofort abziehbare Rücklage stehen dokumentierten 456 EUR gegenüber. Im alten Detailmodus werden zudem keine späteren WEG-Verwendungen modelliert.

Die 85-%-Quote ist nicht völlig unplausibel, wenn zusätzlich eine private Reserve für das Sondereigentum angespart werden soll. Sie ist aber nicht die Quote des vorliegenden Wirtschaftsplans. Der Plan belegt 456 EUR Rücklage bei insgesamt 570 EUR Reparatur plus Rücklage, also exakt 80 %.

## Historische Plausibilität

| Abrechnungszeitraum | nicht umlagefähige Kosten | Rücklagenzuführung | Rücklagenentnahme | wirtschaftlicher Eigentümer-Cashout |
|---|---:|---:|---:|---:|
| 2022/2023 | 876,02 EUR | 456,00 EUR | im gelieferten Auszug keine ausgewiesen | **1.332,02 EUR** |
| 2024/2025 | 549,71 EUR | 456,00 EUR | 45,32 EUR | **960,39 EUR** |
| Plan 2025/2026 | 554,06 EUR | 456,00 EUR | keine geplant | **1.010,06 EUR** |

Der Zweijahresdurchschnitt der beiden Ist-Abrechnungen liegt bei rund 1.146,21 EUR. Damit ist der Planwert von 1.010,06 EUR plausibel, aber eher am unteren Rand der jüngeren Historie. Ein vorsichtiger Basisfall kann deshalb mit ungefähr 1.050 bis 1.150 EUR gesamten Eigentümerkosten arbeiten. 1.440 EUR sind als Stressfall vertretbar, aber nicht durch den aktuellen Wirtschaftsplan als Basisfall belegt.

Der Rücklagenbestand zum 31.05.2025 beträgt für die gesamte Gemeinschaft 62.450,25 EUR und rechnerisch für die Einheit 3.559,66 EUR. Dieser Bestand gehört der WEG und ist kein frei auszahlbares Guthaben des Eigentümers. Er spricht zugleich gegen die Annahme, dass bei Verkauf zusätzlich jeder nominale Euro eins zu eins auf den Verkaufserlös aufgeschlagen werden kann.

## Beschlüsse und erkennbare Maßnahmen

- Die Fahrradständer im Gesamtwert von 795,16 EUR wurden nachträglich aus der Rücklage finanziert; auf die Einheit entfielen 45,32 EUR.
- Es wurde keine Sonderumlage beschlossen.
- Weitere konkrete größere Erhaltungsmaßnahmen wurden im Protokoll nicht beschlossen.
- Eine Fernwärmeumstellung wurde geprüft, wegen Kosten von mehr als dem Doppelten der bestehenden Gas-Zentralheizung aber derzeit als nicht sinnvoll angesehen.

Aus diesen Unterlagen folgt derzeit kein gesondertes Sanierungsereignis für die Projektion. Die Heizungsfrage bleibt ein langfristiger Risikopunkt und gehört eher in einen Stressfall als als bereits feststehende Ausgabe in den Basisfall.

## Modellierte Rücklagenverwendung

Die 50-%-Annahme gilt für jede einzelne Jahreszuführung, nicht als sofortige Entnahme von 50 % des gesamten Kontos. Bei 2 % jährlicher Kostensteigerung passiert im Basisszenario deshalb Folgendes:

- Jahre 1 bis 5: keine modellierte Verwendung, weil noch keine Zuführung fünf Jahre alt ist.
- Jahr 6: 228,00 EUR Verwendung, also 50 % der Zuführung aus Jahr 1 von 456,00 EUR.
- Die Verwendung ist kein zweiter Cash-Abfluss. Das Geld ist bereits bei der ursprünglichen Zuführung abgeflossen.
- Vereinfachend entsteht im Verwendungsjahr ein Werbungskostenabzug. Eine echte Maßnahme kann steuerlich stattdessen Herstellungsaufwand oder anders einzuordnen sein.
- Über 15 Jahre werden 7.885,80 EUR zugeführt und 2.496,54 EUR verwendet; 5.389,26 EUR bleiben modelliert bestehen. Dass erst 31,66 % aller Zuführungen verwendet sind, ist logisch: Die letzten fünf Jahreskohorten haben ihre Verzögerung am Exit noch nicht erreicht.

Der verbleibende Bestand wird im Basisfall nicht zum Erlös addiert. Eine positive Exit-Quote erhöht ausschließlich den geschätzten Immobilien-Verkaufspreis; sie erhöht damit auch prozentuale Verkaufskosten und gegebenenfalls den Gewinn nach § 23 EStG. Selbst 100 % wären nur eine extreme Preis-Sensitivität, keine Auszahlung der WEG.

## Quantitative IRR-Brücke

Mangels Zugriff auf das eingeloggte Cloud-Szenario wurde die frühere transparente Rekonstruktion beibehalten: 60.000 EUR Kaufpreis, 100-%-Finanzierung des Kaufpreises, Kaufnebenkosten bar, 4 % Soll- und Anschlusszins, 2 % Anfangstilgung, 15 Jahre Haltedauer, 1,5 % Miet- und Wertsteigerung, 2 % Kostensteigerung, Einzelveranlagung bei 80.000 EUR Einkommen, 80 % Gebäudeanteil, 2,5 % lineare AfA und 3 % Verkaufskosten.

| Variante | IRR p. a. | Cashflow Jahr 1 | Eigentümerkosten Jahr 1 |
|---|---:|---:|---:|
| 1.000 EUR Instandhaltung, 85 %, ohne weitere Kosten (alter Detailmodus) | 1,79 % | -1.556 EUR | 1.000,00 EUR |
| **Wirtschaftsplan direkt, 3 % Leerstand, 50 %/5 Jahre** | **3,00 %** | **-1.417 EUR** | **1.045,91 EUR** |
| 1.000 EUR Instandhaltung **plus** Plan-Verwaltung/sonstige Kosten | **0,29 %** | **-1.811 EUR** | **1.440,06 EUR** |
| historischer Ist-Block 1.146,21 EUR plus 3 % Leerstandsanteil U | 2,51 % | -1.496 EUR | 1.182,06 EUR |
| Wirtschaftsplan, aber 3 % Wertsteigerung | 7,15 % | -1.417 EUR | 1.045,91 EUR |
| Wirtschaftsplan, aber 3 % Soll-/Anschlusszins | 4,71 % | -1.067 EUR | 1.045,91 EUR |
| Wirtschaftsplan und extreme 100-%-Rücklagen-Preiswirkung | 4,41 % | -1.417 EUR | 1.045,91 EUR |

Damit ist das beobachtete Niveau von etwa 0,x % sehr gut erklärbar, falls die 1.000 EUR zusammen mit Verwaltung und sonstigen Kosten eingegeben wurden. Mit den direkt übernommenen Plankosten sind in dieser Rekonstruktion dagegen rund 3,00 % plausibel. Die zuvor genannte Basis-IRR von 4,02 % ist nach der nun konsistenten Leerstands- und Rücklagenmodellierung nicht mehr reproduzierbar und wird hiermit ersetzt. Die frühere Erwartung von 8–11 % setzt deutlich optimistischere Annahmen oder eine Kombination daraus voraus; allein 3 % jährliche Wertsteigerung ergeben hier rund 7,15 %.

Diese IRR-Werte sind weiterhin eine Sensitivitätsrechnung und kein Abbild des unbekannten Cloud-Szenarios. Der exakte Abgleich benötigt den JSON-Export oder eine Anmeldung in der geöffneten App.

## Rechen- und Steuerlogik

- Die Rücklagenzuführung von 456 EUR ist ein echter Cash-Abfluss.
- Sie ist bei Einzahlung nicht sofort als Werbungskosten abziehbar; der Abzug entsteht grundsätzlich erst, wenn die WEG die Mittel für eine steuerlich entsprechend einzuordnende Maßnahme verausgabt.
- Der einzelne Eigentümer hat keinen frei veräußerbaren oder auszahlbaren Anteil am Rücklagenkonto.
- Ein wirtschaftlicher Kaufpreiseffekt kann bestehen, ist aber nicht automatisch identisch mit dem nominalen Bestand. Deshalb ist eine Rücklagen-Preiswirkung von 0 % im Basisfall konsistent.
- Ein positiver Wert ist nur als Sensitivität sinnvoll. Er wird in der App in den Immobilien-Verkaufspreis integriert und nicht separat zum Nettoerlös addiert; dieselbe Wirkung darf nicht zusätzlich über eine höhere Wertsteigerung erfasst werden.

Steuerquelle: [BFH, Urteil IX R 19/24 vom 14.01.2025](https://www.bundesfinanzhof.de/de/entscheidung/entscheidungen-online/detail/STRE202510025/).

## Noch offen für die finale Szenarioprüfung

1. JSON-Export des Paul-Heyse-Szenarios oder Zugriff nach Anmeldung, damit alle aktuellen App-Felder exakt verglichen werden können.
2. Letztes Mietkonto oder letzte Mieterhöhung zur Bestätigung der heutigen Kaltmiete.
3. Darlehensangebot mit Sollzins, Tilgung, Zinsbindung und Eigenkapital.
4. Eventuelle separate Sondereigentumsverwaltung; sie ist im Wirtschaftsplan nicht erkennbar und wäre zusätzlich anzusetzen.
5. Kaufpreisaufteilung Gebäude/Boden für die AfA.
