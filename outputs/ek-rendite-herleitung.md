# Herleitung der Eigenkapitalrendite

Stand: 2026-06-21

Quelle: `/Users/martin/Downloads/beispiel__etw_300.000_eur_scenario.json`

## Kurzdefinitionen

- EK = Eigenkapital.
- KNK = Kaufnebenkosten, also Grunderwerbsteuer, Notar/Grundbuch und Makler.
- IRR = Internal Rate of Return, in der App als annualisierte Eigenkapitalrendite verwendet.
- CoC = Cash-on-Cash-Rendite, laufender Cashflow geteilt durch baren Kapitaleinsatz.
- ROE = Return on Equity, Eigenkapitalrendite.

## Korrigierte Finanzierungslogik

Die App trennt jetzt vier Dinge:

1. Eigenkapital fuer Kaufpreis und Sanierung.
2. Bar gezahlte KNK.
3. Fremdfinanzierter KNK-Anteil.
4. Gesamter barer Kapitaleinsatz.

Die zentrale Formel lautet:

```text
Finanzierungsbasis = Kaufpreis + Sanierungskosten

EK fuer Kaufpreis/Sanierung =
  bei Prozentmodus: Finanzierungsbasis * Eigenkapital-% / 100
  bei Absolutmodus: eingegebener EUR-Betrag, maximal Finanzierungsbasis

Fremdfinanzierte KNK =
  wenn "KNK fremdfinanzieren?" aus: 0
  wenn aktiv: KNK * KNK-Fremdfinanzierungs-% / 100

Bar gezahlte KNK = KNK - fremdfinanzierte KNK

Darlehen = Finanzierungsbasis - EK fuer Kaufpreis/Sanierung + fremdfinanzierte KNK

Barer Kapitaleinsatz = EK fuer Kaufpreis/Sanierung + bar gezahlte KNK
```

Damit reduziert Eigenkapital den Kaufpreis/Sanierungsanteil direkt. KNK verbrauchen dieses Eigenkapital nicht mehr.

## Beispiel: ETW 300.000 EUR

```text
Kaufpreis                         = 300.000 EUR
Sanierungskosten                   = 0 EUR
KNK-Satz                           = 6,50 % + 1,50 % + 3,57 %
                                   = 11,57 %
KNK                                = 300.000 EUR * 11,57 %
                                   = 34.710 EUR
Eigenkapital                       = 20,00 % von Kaufpreis + Sanierung
KNK-Fremdfinanzierung              = aus, also 0 %
```

```text
Finanzierungsbasis = 300.000 EUR + 0 EUR
                   = 300.000 EUR

EK fuer Kaufpreis/Sanierung = 300.000 EUR * 20,00 %
                            = 60.000 EUR

Fremdfinanzierte KNK = 0 EUR
Bar gezahlte KNK     = 34.710 EUR

Darlehen             = 300.000 EUR - 60.000 EUR + 0 EUR
                     = 240.000 EUR

Barer Kapitaleinsatz = 60.000 EUR + 34.710 EUR
                     = 94.710 EUR
```

## Anfangsannuitaet

```text
Jahresannuitaet = Darlehen * (Sollzins + Tilgung)
                = 240.000 EUR * (3,80 % + 2,00 %)
                = 240.000 EUR * 5,80 %
                = 13.920 EUR p. a.

Monatsrate      = 13.920 EUR / 12
                = 1.160 EUR
```

Die App simuliert monatlich. Im ersten Monat:

```text
Zins Monat 1    = 240.000 EUR * 3,80 % / 12
                = 760 EUR

Tilgung Monat 1 = 1.160 EUR - 760 EUR
                = 400 EUR
```

## Cashflow-Formel

Fuer jedes Jahr gilt:

```text
V&V-Ergebnis = Netto-Kaltmiete - Zinsen - AfA - nicht umlagefaehige Kosten

Cashflow vor Steuer = Netto-Kaltmiete - Zinsen - Tilgung - Sondertilgung - nicht umlagefaehige Kosten

Cashflow nach Steuer = Cashflow vor Steuer - Steuereffekt
```

Wichtig: Tilgung ist nicht steuerlich abziehbar, aber sie ist eine echte Liquiditaetsausgabe. Deshalb steht sie im Cashflow, nicht im V&V-Ergebnis.

## Verkauf und IRR

Beim Verkauf nach der Haltedauer:

```text
Verkaufspreis = Kaufpreis * (1 + Wertsteigerung)^Haltedauer

Nettoverkaufserloes =
  Verkaufspreis
  - Verkaufsnebenkosten
  - Restschuld
  - Vorfaelligkeitsentschaedigung
  - Spekulationssteuer
```

Die Eigenkapitalrendite der App ist die IRR. Gesucht ist der Zinssatz `r`, bei dem der Kapitalwert der Eigenkapital-Cashflows null ist:

```text
0 =
- barer Kapitaleinsatz
+ Cashflow Jahr 1 / (1+r)^1
+ Cashflow Jahr 2 / (1+r)^2
+ ...
+ (Cashflow letztes Jahr + Nettoverkaufserloes) / (1+r)^Haltedauer
```

## Dein 115.000-EUR-Beispiel

```text
Kaufpreis                         = 115.000 EUR
Sanierungskosten                  = 1.500 EUR
KNK                               = 12.156 EUR
EK fuer Kaufpreis/Sanierung       = 12.866 EUR
KNK-Fremdfinanzierung             = aus, also 0 %
```

Korrekt ist:

```text
Finanzierungsbasis = 115.000 EUR + 1.500 EUR
                   = 116.500 EUR

Fremdfinanzierte KNK = 0 EUR
Bar gezahlte KNK     = 12.156 EUR

Darlehen             = 116.500 EUR - 12.866 EUR + 0 EUR
                     = 103.634 EUR

Barer Kapitaleinsatz = 12.866 EUR + 12.156 EUR
                     = 25.022 EUR
```

Die alte falsche Rechnung war:

```text
EK nach KNK = 12.866 EUR - 12.156 EUR
            = 710 EUR

Altes Darlehen = 116.500 EUR - 710 EUR
               = 115.790 EUR
```

Das war falsch, weil die KNK das Eigenkapital fuer den Kaufpreis aufgezehrt haben.

## Dein Beispiel mit 50 % KNK-Fremdfinanzierung

```text
Fremdfinanzierte KNK = 12.156 EUR * 50 %
                     = 6.078 EUR

Bar gezahlte KNK     = 12.156 EUR - 6.078 EUR
                     = 6.078 EUR

Darlehen             = 116.500 EUR - 12.866 EUR + 6.078 EUR
                     = 109.712 EUR

Barer Kapitaleinsatz = 12.866 EUR + 6.078 EUR
                     = 18.944 EUR
```

## Plausibilitaetsregel

Wenn KNK nicht fremdfinanziert werden:

```text
Darlehen = Kaufpreis + Sanierungskosten - EK fuer Kaufpreis/Sanierung
```

Wenn KNK teilweise fremdfinanziert werden:

```text
Darlehen = Kaufpreis + Sanierungskosten - EK fuer Kaufpreis/Sanierung + fremdfinanzierte KNK
```

Das Darlehen darf also nur durch fremdfinanzierte KNK wieder steigen, nicht durch bar gezahlte KNK.
