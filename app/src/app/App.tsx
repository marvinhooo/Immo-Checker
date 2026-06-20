import { useState, useMemo, useEffect, useRef } from 'react';
import { useScenarioStore } from '../store/scenarioStore';
import {
  knkAmount,
  totalInvest,
  cashInvestment,
  unfinancedKnkCashGap,
  loanAmount,
} from '../engine/derive';
import { runProjection } from '../engine/projection';
import { calculateMetrics } from '../engine/metrics';
import { calculateExit } from '../engine/exit';
import { analyzeHoldingPeriods } from '../engine/holding';
import {
  runSensitivity,
  generateTornadoData,
  calculateEtfComparison,
  calculateEtfYearlyHistory,
} from '../engine/compare';
import {
  formatEUR,
  formatPercent,
  formatNumber,
} from '../lib/format';
import {
  exportScenario,
  exportAllScenarios,
  importScenarios,
  exportToCSV,
} from '../lib/io';

// UI Primitives
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { NumberInput } from '../components/ui/NumberInput';
import { Slider } from '../components/ui/Slider';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Tabs } from '../components/ui/Tabs';

// Constants and Helpers
import { BUNDESLAND_LABELS, GREST_BY_BUNDESLAND } from '../engine/constants';
import type { Bundesland, ObjektTyp, AfaModus, EquityMode, RentMode, MaintenanceMode, TaxMode, Veranlagung, IncreaseRule } from '../engine/types';
import { marginalRate } from '../engine/tax';
import { projectSeries } from '../engine/timeline';
import { createDefaultScenario } from '../engine/defaults';

// Recharts components for visualisations
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  Legend,
  ComposedChart,
  ReferenceLine,
} from 'recharts';
import { Plus, Trash2, Download, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const TIMELINE_RULE_MIN_YEAR = 1;
const TIMELINE_RULE_MAX_YEAR = 50;

function clampTimelineYear(year: number): number {
  if (!Number.isFinite(year)) return TIMELINE_RULE_MIN_YEAR;
  return Math.min(TIMELINE_RULE_MAX_YEAR, Math.max(TIMELINE_RULE_MIN_YEAR, Math.trunc(year)));
}

function clampTimelinePercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(-100, percent));
}

function clampIntegerInRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function App() {
  const active = useScenarioStore((s) => s.active);
  const saved = useScenarioStore((s) => s.saved);
  const updateActive = useScenarioStore((s) => s.updateActive);
  const resetActive = useScenarioStore((s) => s.resetActive);
  const loadSaved = useScenarioStore((s) => s.loadSaved);

  // UI state
  const [openSection, setOpenSection] = useState<string>('objekt');
  const [activeChartTab, setActiveChartTab] = useState<string>('cashflow');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'compare' | 'sensitivity' | 'etf' | 'holding'>('dashboard');

  // Sensitivity analysis overrides
  const [sensSollzins, setSensSollzins] = useState<number | null>(null);
  const [sensLeerstand, setSensLeerstand] = useState<number | null>(null);
  const [sensWert, setSensWert] = useState<number | null>(null);
  const [sensAnschluss, setSensAnschluss] = useState<number | null>(null);

  // ETF comparison overrides
  const [etfReturnPct, setEtfReturnPct] = useState<number>(7.0);

  // Reset overrides when active scenario changes
  useEffect(() => {
    setSensSollzins(null);
    setSensLeerstand(null);
    setSensWert(null);
    setSensAnschluss(null);
  }, [active.id]);

  // Compute live calculations
  const proj = useMemo(() => runProjection(active), [active]);
  const currentSollzins = sensSollzins !== null ? sensSollzins : active.finanzierung.sollzinsPct;
  const currentLeerstand = sensLeerstand !== null ? sensLeerstand : active.miete.leerstandPct;
  const baseWertRule = active.wertentwicklung.szenario.find(r => r.kind === 'rate');
  const baseWert = baseWertRule ? baseWertRule.percentPerYear : 0;
  const currentWert = sensWert !== null ? sensWert : baseWert;
  const currentAnschluss = sensAnschluss !== null ? sensAnschluss : active.finanzierung.anschlusszinsPct;
  const metrics = useMemo(() => calculateMetrics(active, proj), [active, proj]);
  const exitRes = useMemo(() => calculateExit(active, proj), [active, proj]);
  const holdingAnalysis = useMemo(
    () => activeTab === 'holding'
      ? analyzeHoldingPeriods(active)
      : {
          initialEquity: proj.initialEquity,
          years: [],
          breakEvenJahr: null,
          besteExitJahrNachIrr: null,
          steuerfreiAbJahr: 10,
        },
    [active, activeTab, proj.initialEquity]
  );
  const sensitivityResult = useMemo(() => {
    return runSensitivity(active, {
      sollzinsPct: sensSollzins !== null ? sensSollzins : undefined,
      leerstandPct: sensLeerstand !== null ? sensLeerstand : undefined,
      wertsteigerungPct: sensWert !== null ? sensWert : undefined,
      anschlusszinsPct: sensAnschluss !== null ? sensAnschluss : undefined,
    });
  }, [active, sensSollzins, sensLeerstand, sensWert, sensAnschluss]);
  const sensProj = sensitivityResult.projection;
  const sensMetrics = sensitivityResult.metrics;

  const comparisonData = useMemo(() => {
    const list = [active, ...saved.filter(s => s.id !== active.id)];
    return list.map(sc => {
      const p = runProjection(sc);
      const m = calculateMetrics(sc, p);
      const ex = calculateExit(sc, p);
      return {
        id: sc.id,
        name: sc.name,
        kaufpreis: sc.objekt.kaufpreis,
        totalInvest: totalInvest(sc),
        equity: p.initialEquity,
        loan: loanAmount(sc),
        cf1: p.years[0]?.cashflowNachSteuerMonatlich ?? 0,
        nettoMietrendite: m.nettomietrendite,
        irr: m.irr,
        netWealth: p.years[p.years.length - 1]?.eigenkapital ?? 0,
        netExit: ex.nettoVerkaufserloesNachSteuer,
        zinsbindung: sc.finanzierung.zinsbindungJahre,
        sollzins: sc.finanzierung.sollzinsPct,
      };
    });
  }, [active, saved]);

  const tornadoChartData = useMemo(() => {
    const raw = generateTornadoData(active);
    return raw.map(p => {
      const minIrr = Math.min(p.lowIrr, p.highIrr);
      const maxIrr = Math.max(p.lowIrr, p.highIrr);
      return {
        label: p.label,
        // IRR-Werte sind bereits in Prozent (computeIRR liefert r * 100) -> nicht erneut skalieren.
        range: [minIrr, maxIrr],
        minIrr,
        maxIrr,
        baseIrr: p.baseIrr,
        lowValStr: `${p.parameter === 'leerstandPct' ? 'Wenig Leerstand' : 'Niedriger'} (${formatPercent(p.lowVal)})`,
        highValStr: `${p.parameter === 'leerstandPct' ? 'Viel Leerstand' : 'Höher'} (${formatPercent(p.highVal)})`,
      };
    });
  }, [active]);

  const etfComparison = useMemo(() => {
    return calculateEtfComparison(active, etfReturnPct, proj);
  }, [active, etfReturnPct, proj]);

  const etfHistoryData = useMemo(() => {
    const raw = calculateEtfYearlyHistory(active, etfReturnPct, proj);
    return raw.map(h => ({
      Jahr: `J. ${h.jahr}`,
      Immobilie: Math.round(h.immoVermoegen),
      'ETF-Depot': Math.round(h.etfVermoegen),
    }));
  }, [active, etfReturnPct, proj]);

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? '' : section);
  };

  // Rule management helpers (Miete)
  const handleUpdateMieteRule = (id: string, updatedFields: Partial<IncreaseRule>) => {
    updateActive((d) => {
      const idx = d.miete.steigerungen.findIndex((r) => r.id === id);
      if (idx !== -1) {
        const current = d.miete.steigerungen[idx];
        const nextKind = updatedFields.kind ?? current.kind;
        if (nextKind === 'step') {
          const percent = 'percent' in updatedFields 
            ? updatedFields.percent 
            : ('percentPerYear' in current ? current.percentPerYear : 1.0);
          d.miete.steigerungen[idx] = {
            id,
            kind: 'step',
            fromYear: clampTimelineYear(updatedFields.fromYear ?? current.fromYear),
            percent: clampTimelinePercent(percent ?? 1.0),
          };
        } else {
          const percentPerYear = 'percentPerYear' in updatedFields 
            ? updatedFields.percentPerYear 
            : ('percent' in current ? current.percent : 1.0);
          d.miete.steigerungen[idx] = {
            id,
            kind: 'rate',
            fromYear: clampTimelineYear(updatedFields.fromYear ?? current.fromYear),
            percentPerYear: clampTimelinePercent(percentPerYear ?? 1.0),
          };
        }
      }
    });
  };

  const handleDeleteMieteRule = (id: string) => {
    updateActive((d) => {
      d.miete.steigerungen = d.miete.steigerungen.filter((r) => r.id !== id);
    });
  };

  const handleAddMieteRule = () => {
    updateActive((d) => {
      const maxYear = d.miete.steigerungen.reduce((max, r) => Math.max(max, r.fromYear), 0);
      d.miete.steigerungen.push({
        id: crypto.randomUUID(),
        kind: 'rate',
        fromYear: clampTimelineYear(maxYear > 0 ? maxYear + 1 : 1),
        percentPerYear: 1.5,
      });
    });
  };

  // Rule management helpers (Wertentwicklung)
  const handleUpdateWertRule = (id: string, updatedFields: Partial<IncreaseRule>) => {
    updateActive((d) => {
      const idx = d.wertentwicklung.szenario.findIndex((r) => r.id === id);
      if (idx !== -1) {
        const current = d.wertentwicklung.szenario[idx];
        const nextKind = updatedFields.kind ?? current.kind;
        if (nextKind === 'step') {
          const percent = 'percent' in updatedFields 
            ? updatedFields.percent 
            : ('percentPerYear' in current ? current.percentPerYear : 1.0);
          d.wertentwicklung.szenario[idx] = {
            id,
            kind: 'step',
            fromYear: clampTimelineYear(updatedFields.fromYear ?? current.fromYear),
            percent: clampTimelinePercent(percent ?? 1.0),
          };
        } else {
          const percentPerYear = 'percentPerYear' in updatedFields 
            ? updatedFields.percentPerYear 
            : ('percent' in current ? current.percent : 1.0);
          d.wertentwicklung.szenario[idx] = {
            id,
            kind: 'rate',
            fromYear: clampTimelineYear(updatedFields.fromYear ?? current.fromYear),
            percentPerYear: clampTimelinePercent(percentPerYear ?? 1.0),
          };
        }
      }
    });
  };

  const handleDeleteWertRule = (id: string) => {
    updateActive((d) => {
      d.wertentwicklung.szenario = d.wertentwicklung.szenario.filter((r) => r.id !== id);
    });
  };

  const handleAddWertRule = () => {
    updateActive((d) => {
      const maxYear = d.wertentwicklung.szenario.reduce((max, r) => Math.max(max, r.fromYear), 0);
      d.wertentwicklung.szenario.push({
        id: crypto.randomUUID(),
        kind: 'rate',
        fromYear: clampTimelineYear(maxYear > 0 ? maxYear + 1 : 1),
        percentPerYear: 1.5,
      });
    });
  };

  // Helper calculations for preview charts
  const rentBase = active.miete.rentMode === 'perMonth' 
    ? active.miete.kaltmieteProMonat 
    : active.miete.kaltmieteProSqm * active.objekt.wohnflaeche;
  
  const rentChartData = useMemo(() => {
    const rentSeries = projectSeries(rentBase, active.miete.steigerungen, active.exit.haltedauerJahre);
    return rentSeries.map((val, idx) => ({
      Jahr: idx + 1,
      Miete: Math.round(val),
    }));
  }, [rentBase, active.miete.steigerungen, active.exit.haltedauerJahre]);

  const valueBase = active.objekt.kaufpreis;
  
  const valueChartData = useMemo(() => {
    const valueSeries = projectSeries(valueBase, active.wertentwicklung.szenario, active.exit.haltedauerJahre + 1);
    return valueSeries.slice(1).map((val, idx) => ({
      Jahr: idx + 1,
      Wert: Math.round(val),
    }));
  }, [valueBase, active.wertentwicklung.szenario, active.exit.haltedauerJahre]);

  const computedMarginalRate = useMemo(() => {
    return active.steuer.taxMode === 'marginalRate'
      ? active.steuer.grenzsteuersatzPct
      : marginalRate(active.steuer.bruttoJahresEinkommen, active.steuer.veranlagung);
  }, [active.steuer.taxMode, active.steuer.grenzsteuersatzPct, active.steuer.bruttoJahresEinkommen, active.steuer.veranlagung]);

  // Validation Warnings
  const warnings = useMemo(() => {
    const list: string[] = [];
    const firstYearCf = proj.years[0]?.cashflowNachSteuerMonatlich ?? 0;
    if (firstYearCf < 0) {
      list.push(`Monatlicher Cashflow ist im ersten Jahr negativ (${formatEUR(firstYearCf)}/Monat). Sie müssen monatlich Geld zuschießen.`);
    }
    const knkGap = unfinancedKnkCashGap(active);
    if (knkGap > 0) {
      list.push(`Das Eigenkapital deckt die nicht mitfinanzierten Kaufnebenkosten nicht vollständig. Es fehlen ${formatEUR(knkGap)} Barliquidität.`);
    }
    const maxLtv = Math.max(...proj.years.map(y => y.ltv));
    if (maxLtv > 100) {
      list.push(`Sehr hohe Fremdkapitalquote (LTV max. ${formatPercent(maxLtv)}). Das Risiko für eine Zinsänderung oder Unterdeckung ist erhöht.`);
    }
    if (active.exit.haltedauerJahre < 10) {
      list.push(`Haltedauer liegt unter 10 Jahren (${active.exit.haltedauerJahre} J.). Gewinne unterliegen der Spekulationssteuer gemäß §23 EStG.`);
    }
    const endRestschuld = exitRes.restschuld;
    if (endRestschuld > 0 && active.exit.haltedauerJahre >= active.finanzierung.zinsbindungJahre) {
      list.push(`Restschuld nach Zinsbindung (${formatEUR(endRestschuld)}) ist vom Anschlusszins abhängig. Ein Anstieg der Zinsen erhöht die Annuität.`);
    }
    return list;
  }, [proj, active, active.exit.haltedauerJahre, active.finanzierung.zinsbindungJahre, exitRes]);

  // Chart data mappings for Recharts
  const cashflowChartData = useMemo(() => {
    return proj.years.map(y => {
      const costsVal = -(y.instandhaltung + y.verwaltung + y.sonstigeKosten);
      const taxVal = -y.steuereffekt; // positive means savings, negative means payment
      return {
        Jahr: `J. ${y.jahr}`,
        Miete: Math.round(y.nettoKaltmiete),
        Zins: Math.round(-y.zins),
        Tilgung: Math.round(-y.tilgung),
        Kosten: Math.round(costsVal),
        Steuereffekt: Math.round(taxVal),
        Cashflow: Math.round(y.cashflowNachSteuer),
      };
    });
  }, [proj]);

  const wealthChartData = useMemo(() => {
    return proj.years.map(y => ({
      Jahr: `J. ${y.jahr}`,
      Restschuld: Math.round(y.restschuld),
      Nettovermoegen: Math.round(y.eigenkapital),
      Immobilienwert: Math.round(y.immobilienwert),
    }));
  }, [proj]);

  const taxChartData = useMemo(() => {
    return proj.years.map(y => ({
      Jahr: `J. ${y.jahr}`,
      'Steuereffekt (jährl.)': Math.round(-y.steuereffekt),
      'Steuerersparnis (kum.)': Math.round(y.kumulierteSteuerersparnis),
    }));
  }, [proj]);

  const amortizationChartData = useMemo(() => {
    return proj.years.map(y => ({
      Jahr: `J. ${y.jahr}`,
      Zins: Math.round(y.zins),
      Tilgung: Math.round(y.tilgung),
      Sondertilgung: Math.round(y.sondertilgung),
    }));
  }, [proj]);

  const handleNewScenario = () => {
    const name = prompt('Name für das neue Szenario:');
    if (!name || !name.trim()) return;
    const fresh = createDefaultScenario({
      name: name.trim(),
      objekt: {
        kaufpreis: 0,
        wohnflaeche: 0,
        fertigstellungsjahr: 2000,
        bundesland: 'NW',
        objektTyp: 'bestand',
        bodenwertAnteilPct: 20,
        sanierungskosten: 0,
      },
      finanzierung: {
        equityMode: 'percent',
        equityPct: 20,
        equityAbsolute: 0,
        sollzinsPct: 3.8,
        tilgungPct: 2.0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 4.5,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
      miete: {
        rentMode: 'perMonth',
        kaltmieteProMonat: 0,
        kaltmieteProSqm: 0,
        leerstandPct: 3,
        steigerungen: [
          { id: crypto.randomUUID(), kind: 'rate', fromYear: 1, percentPerYear: 1.5 },
        ],
      },
      steuer: {
        taxMode: 'income',
        bruttoJahresEinkommen: 0,
        grenzsteuersatzPct: 42,
        veranlagung: 'single',
        soli: false,
        kirchensteuerPct: 0,
      },
    });
    useScenarioStore.getState().setActive(fresh);
  };

  const handleSave = () => {
    useScenarioStore.getState().saveCurrent();
    alert(`Szenario "${active.name}" gespeichert.`);
  };

  const handleDuplicate = () => {
    updateActive((d) => {
      d.id = crypto.randomUUID();
      d.name = `${d.name} (Kopie)`;
    });
    setTimeout(() => {
      useScenarioStore.getState().saveCurrent();
    }, 0);
  };

  const handleRename = () => {
    const newName = prompt('Geben Sie einen neuen Namen für das Szenario ein:', active.name);
    if (newName && newName.trim() !== '') {
      updateActive((d) => {
        d.name = newName.trim();
      });
      setTimeout(() => {
        useScenarioStore.getState().saveCurrent(newName.trim());
      }, 0);
    }
  };

  const handleDelete = () => {
    if (saved.length === 0) {
      alert('Es gibt keine gespeicherten Szenarien zum Löschen.');
      return;
    }
    if (confirm(`Möchten Sie das Szenario "${active.name}" wirklich löschen?`)) {
      useScenarioStore.getState().deleteSaved(active.id);
      const remaining = useScenarioStore.getState().saved;
      if (remaining.length > 0) {
        loadSaved(remaining[0].id);
      } else {
        resetActive();
      }
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const imported = importScenarios(text);

        const store = useScenarioStore.getState();
        const currentSaved = store.saved;

        if (Array.isArray(imported)) {
          if (imported.length > 0) {
            const conflicts = imported.filter((imp) => currentSaved.some((x) => x.id === imp.id));
            if (
              conflicts.length > 0 &&
              !confirm(`${conflicts.length} Szenario(s) existieren bereits. Möchten Sie sie überschreiben?`)
            ) {
              return;
            }
            const nextSaved = [...currentSaved];
            for (const imp of imported) {
              const idx = nextSaved.findIndex((x) => x.id === imp.id);
              if (idx >= 0) {
                nextSaved[idx] = imp;
              } else {
                nextSaved.push(imp);
              }
            }
            useScenarioStore.setState({ saved: nextSaved });
            store.loadSaved(imported[0].id);
            alert(`${imported.length} Szenarien erfolgreich importiert.`);
          }
        } else {
          const idx = currentSaved.findIndex((x) => x.id === imported.id);
          if (idx >= 0) {
            if (confirm(`Ein Szenario mit der ID "${imported.id}" existiert bereits. Möchten Sie es überschreiben?`)) {
              const nextSaved = [...currentSaved];
              nextSaved[idx] = imported;
              useScenarioStore.setState({ saved: nextSaved });
            } else {
              return;
            }
          } else {
            useScenarioStore.setState({ saved: [...currentSaved, imported] });
          }
          store.setActive(imported);
          alert(`Szenario "${imported.name}" erfolgreich importiert.`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        alert(`Fehler beim Import: ${msg}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportJSON = () => {
    const json = exportScenario(active);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.name.toLowerCase().replace(/\s+/g, '_')}_scenario.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportAllJSON = () => {
    if (saved.length === 0) {
      alert('Es gibt keine gespeicherten Szenarien zum Exportieren.');
      return;
    }
    const json = exportAllScenarios(saved);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `all_scenarios_export.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const csv = exportToCSV(proj.years);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.name.toLowerCase().replace(/\s+/g, '_')}_jahrestabelle.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-800 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-md no-print">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Immobilien-Investment-Checker
            </h1>
            <p className="text-xs font-medium text-slate-500 sm:text-sm">
              Kapitalanlage-Rechner für private Anleger in Deutschland
            </p>
          </div>
          <button
            onClick={resetActive}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition duration-150 cursor-pointer shadow-2xs"
          >
            Zurücksetzen
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8 space-y-6">
        
        {/* Scenario Toolbar */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Aktives Szenario:</span>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-800 text-sm">{active.name}</span>
              <button
                onClick={handleRename}
                className="text-[11px] text-slate-500 hover:text-slate-800 underline font-semibold transition cursor-pointer"
              >
                Umbenennen
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Scenario Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500">Wechseln zu:</span>
              <select
                value={active.id}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'new') {
                    handleNewScenario();
                  } else {
                    loadSaved(val);
                  }
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value={active.id}>{active.name} (Aktuell)</option>
                {saved.filter(s => s.id !== active.id).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                <option value="new">+ Neues Szenario anlegen</option>
              </select>
            </div>

            <div className="h-4 w-[1px] bg-slate-200 hidden sm:block"></div>

            <button
              onClick={handleSave}
              className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white transition cursor-pointer shadow-2xs"
            >
              Speichern
            </button>
            <button
              onClick={handleDuplicate}
              className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
            >
              Duplizieren
            </button>
            <button
              onClick={handleDelete}
              className="rounded-lg border border-rose-100 bg-rose-50/50 hover:bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-700 transition cursor-pointer"
            >
              Löschen
            </button>

            <div className="h-4 w-[1px] bg-slate-200 hidden sm:block"></div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={handleImportClick}
              className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
              title="Szenario(s) aus JSON-Datei importieren"
            >
              JSON Import
            </button>
            <button
              onClick={handleExportJSON}
              className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
              title="Aktuelles Szenario als JSON-Datei exportieren"
            >
              JSON Export
            </button>
            {saved.length > 0 && (
              <button
                onClick={handleExportAllJSON}
                className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
                title="Alle gespeicherten Szenarien als JSON-Bulk exportieren"
              >
                Alle exportieren
              </button>
            )}

            <div className="h-4 w-[1px] bg-slate-200 hidden sm:block"></div>

            <button
              onClick={handleExportCSV}
              className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
              title="Jahrestabelle als CSV (Excel-kompatibel) exportieren"
            >
              CSV Export
            </button>
            <button
              onClick={handlePrintPDF}
              className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
              title="Ergebnisse als PDF drucken / speichern"
            >
              PDF drucken
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          
          {/* Left Column: Inputs (9 Sektionen Accordion) */}
          <div className="lg:col-span-5 space-y-4 no-print">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Parameter & Eingaben</h2>

            {/* SEKTION 1: Objekt & Kaufpreis */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('objekt')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <span>1. Objekt & Kaufpreis</span>
                <span className={`transform transition-transform duration-200 ${openSection === 'objekt' ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {openSection === 'objekt' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <NumberInput
                    label="Kaufpreis (€)"
                    value={active.objekt.kaufpreis}
                    suffix="EUR"
                    min={1}
                    onChange={(val) => updateActive((d) => { d.objekt.kaufpreis = val; })}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <NumberInput
                      label="Wohnfläche (m²)"
                      value={active.objekt.wohnflaeche}
                      min={1}
                      onChange={(val) => updateActive((d) => { d.objekt.wohnflaeche = val; })}
                    />
                    <NumberInput
                      label="Baujahr / Fertigstellung"
                      value={active.objekt.fertigstellungsjahr}
                      suffix="plain"
                      min={1}
                      max={2100}
                      onChange={(val) => updateActive((d) => {
                        const year = clampIntegerInRange(val, 1, 2100);
                        d.objekt.fertigstellungsjahr = year;
                        if (d.afa.modus === 'linear') {
                          d.afa.linearSatzPct = year >= 2023 ? 3.0 : year < 1925 ? 2.5 : 2.0;
                        }
                      })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Select
                      label="Objekttyp"
                      value={active.objekt.objektTyp}
                      onChange={(e) => {
                        const t = e.target.value as ObjektTyp;
                        updateActive((d) => {
                          d.objekt.objektTyp = t;
                          if (t === 'denkmal') {
                            d.afa.modus = 'denkmal7i';
                          } else if (d.afa.modus === 'denkmal7i') {
                            d.afa.modus = 'linear';
                          }
                        });
                      }}
                      options={[
                        { value: 'bestand', label: 'Bestand' },
                        { value: 'neubau', label: 'Neubau' },
                        { value: 'denkmal', label: 'Denkmal' },
                      ]}
                    />
                    <div className="flex flex-col justify-end">
                      <Slider
                        label="Bodenwertanteil (%)"
                        value={active.objekt.bodenwertAnteilPct}
                        onChange={(val) => updateActive((d) => { d.objekt.bodenwertAnteilPct = val; })}
                        min={0}
                        max={100}
                        suffix="%"
                      />
                      <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                        Anteil des Grundstückswerts am Kaufpreis — nur das Gebäude ist abschreibbar (AfA).
                        Nachschlagen im <strong>Bodenrichtwert-Informationssystem (BORIS)</strong> Ihres Bundeslandes
                        oder im Kaufvertrag. Richtwerte: Großstadt 30–50 %, Stadtrand 20–30 %, ländlich 10–20 %.
                      </p>
                    </div>
                  </div>
                  {active.objekt.objektTyp === 'denkmal' && (
                    <NumberInput
                      label="Sanierungskosten (Denkmal-Topf €)"
                      value={active.objekt.sanierungskosten}
                      suffix="EUR"
                      min={0}
                      onChange={(val) => updateActive((d) => { d.objekt.sanierungskosten = val; })}
                    />
                  )}
                </div>
              )}
            </div>

            {/* SEKTION 2: Kaufnebenkosten */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('knk')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <span>2. Kaufnebenkosten (KNK)</span>
                <span className={`transform transition-transform duration-200 ${openSection === 'knk' ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {openSection === 'knk' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <Select
                    label="Bundesland (für GrESt-Satz)"
                    value={active.objekt.bundesland}
                    onChange={(e) => {
                      const bl = e.target.value as Bundesland;
                      updateActive((d) => {
                        d.objekt.bundesland = bl;
                        d.knk.grestPct = GREST_BY_BUNDESLAND[bl];
                      });
                    }}
                    options={Object.entries(BUNDESLAND_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <NumberInput
                      label="Grunderwerbsteuer"
                      value={active.knk.grestPct}
                      suffix="%"
                      min={0}
                      max={100}
                      onChange={(val) => updateActive((d) => { d.knk.grestPct = val; })}
                    />
                    <NumberInput
                      label="Notar & Grundbuch"
                      value={active.knk.notarPct}
                      suffix="%"
                      min={0}
                      max={100}
                      onChange={(val) => updateActive((d) => { d.knk.notarPct = val; })}
                    />
                    <NumberInput
                      label="Maklerprovision"
                      value={active.knk.maklerPct}
                      suffix="%"
                      min={0}
                      max={100}
                      onChange={(val) => updateActive((d) => { d.knk.maklerPct = val; })}
                    />
                  </div>
                  <Toggle
                    label="Kaufnebenkosten mitfinanzieren"
                    description="Wenn aktiv, werden KNK in das Darlehen aufgenommen"
                    checked={active.knk.mitfinanzieren}
                    onChange={(val) => updateActive((d) => { d.knk.mitfinanzieren = val; })}
                  />
                  <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-500 space-y-1 font-medium">
                    <div className="flex justify-between">
                      <span>Kaufnebenkosten gesamt:</span>
                      <span className="font-bold text-slate-700">{formatEUR(knkAmount(active))} ({formatPercent(active.knk.grestPct + active.knk.notarPct + active.knk.maklerPct, 2)})</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Gesamtinvestitionskosten:</span>
                      <span className="font-bold text-slate-700">{formatEUR(totalInvest(active))}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SEKTION 3: Finanzierung */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('finanzierung')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <span>3. Finanzierung</span>
                <span className={`transform transition-transform duration-200 ${openSection === 'finanzierung' ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {openSection === 'finanzierung' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Eigenkapital Modus</span>
                    <Tabs
                      activeTab={active.finanzierung.equityMode}
                      onChange={(id) => updateActive((d) => { d.finanzierung.equityMode = id as EquityMode; })}
                      tabs={[
                        { id: 'percent', label: 'Prozent (%)' },
                        { id: 'absolute', label: 'Absolut (€)' },
                      ]}
                    />
                  </div>
                  {active.finanzierung.equityMode === 'percent' ? (
                    <Slider
                      label="Eigenkapital (%)"
                      value={active.finanzierung.equityPct}
                      onChange={(val) => updateActive((d) => { d.finanzierung.equityPct = val; })}
                      min={0}
                      max={100}
                      suffix="%"
                    />
                  ) : (
                    <NumberInput
                      label="Eigenkapital (€)"
                      value={active.finanzierung.equityAbsolute}
                      suffix="EUR"
                      min={0}
                      onChange={(val) => updateActive((d) => { d.finanzierung.equityAbsolute = val; })}
                    />
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <Slider
                      label="Sollzins p. a."
                      value={active.finanzierung.sollzinsPct}
                      onChange={(val) => updateActive((d) => { d.finanzierung.sollzinsPct = val; })}
                      min={0}
                      max={10}
                      step={0.05}
                      suffix="%"
                    />
                    <Slider
                      label="Anf. Tilgung p. a."
                      value={active.finanzierung.tilgungPct}
                      onChange={(val) => updateActive((d) => { d.finanzierung.tilgungPct = val; })}
                      min={0}
                      max={10}
                      step={0.1}
                      suffix="%"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Slider
                      label="Zinsbindung (Jahre)"
                      value={active.finanzierung.zinsbindungJahre}
                      onChange={(val) => updateActive((d) => { d.finanzierung.zinsbindungJahre = val; })}
                      min={1}
                      max={30}
                      step={1}
                    />
                    <Slider
                      label="Anschlusszins p. a."
                      value={active.finanzierung.anschlusszinsPct}
                      onChange={(val) => updateActive((d) => { d.finanzierung.anschlusszinsPct = val; })}
                      min={0}
                      max={10}
                      step={0.1}
                      suffix="%"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <NumberInput
                      label="Sondertilgung pro Jahr (€)"
                      value={active.finanzierung.sondertilgungProJahr}
                      suffix="EUR"
                      min={0}
                      onChange={(val) => updateActive((d) => { d.finanzierung.sondertilgungProJahr = val; })}
                    />
                    <Slider
                      label="Disagio (%)"
                      value={active.finanzierung.disagioPct}
                      onChange={(val) => updateActive((d) => { d.finanzierung.disagioPct = val; })}
                      min={0}
                      max={10}
                      step={0.1}
                      suffix="%"
                    />
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-500 space-y-1 font-medium">
                    <div className="flex justify-between">
                      <span>Eigenkapital benötigt:</span>
                      <span className="font-bold text-slate-700">{formatEUR(cashInvestment(active))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Darlehensbetrag:</span>
                      <span className="font-bold text-slate-700">{formatEUR(loanAmount(active))}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* SEKTION 4: Miete */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('miete')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <span>4. Miete</span>
                <span className={`transform transition-transform duration-200 ${openSection === 'miete' ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {openSection === 'miete' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Miete Modus</span>
                    <Tabs
                      activeTab={active.miete.rentMode}
                      onChange={(id) => updateActive((d) => { d.miete.rentMode = id as RentMode; })}
                      tabs={[
                        { id: 'perMonth', label: 'Pro Monat (€)' },
                        { id: 'perSqm', label: 'Pro m² (€)' },
                      ]}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {active.miete.rentMode === 'perMonth' ? (
                      <NumberInput
                        label="Monatliche Kaltmiete"
                        value={active.miete.kaltmieteProMonat}
                        suffix="EUR"
                        min={0}
                        onChange={(val) => updateActive((d) => { d.miete.kaltmieteProMonat = val; })}
                      />
                    ) : (
                      <NumberInput
                        label="Miete pro m²"
                        value={active.miete.kaltmieteProSqm}
                        suffix="EUR"
                        min={0}
                        onChange={(val) => updateActive((d) => { d.miete.kaltmieteProSqm = val; })}
                      />
                    )}
                    <Slider
                      label="Leerstandsquote"
                      value={active.miete.leerstandPct}
                      onChange={(val) => updateActive((d) => { d.miete.leerstandPct = val; })}
                      min={0}
                      max={15}
                      step={0.5}
                      suffix="%"
                    />
                  </div>

                  <hr className="border-slate-100" />

                  {/* Flexible Miete-Rules */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Mietsteigerungs-Regeln</span>
                      <button
                        type="button"
                        onClick={handleAddMieteRule}
                        className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-100 transition cursor-pointer"
                      >
                        <Plus size={12} /> Regel
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full border-collapse text-left text-xs font-medium text-slate-600">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase text-slate-500">
                            <th className="px-3 py-2 w-16">Ab Jahr</th>
                            <th className="px-3 py-2">Typ</th>
                            <th className="px-3 py-2 w-20">Wert</th>
                            <th className="px-3 py-2 text-right w-10">Aktion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {active.miete.steigerungen.map((rule) => (
                            <tr key={rule.id} className="hover:bg-slate-50/50">
                              <td className="px-3 py-1.5">
                                <input
                                  type="number"
                                  min="1"
                                  max="50"
                                  value={rule.fromYear}
                                  onChange={(e) => handleUpdateMieteRule(rule.id, { fromYear: parseInt(e.target.value) || 1 })}
                                  className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs text-center focus:border-blue-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-3 py-1.5">
                                <select
                                  value={rule.kind}
                                  onChange={(e) => {
                                    const k = e.target.value as 'step' | 'rate';
                                    if (k === 'step') {
                                      handleUpdateMieteRule(rule.id, { kind: k, percent: 1.0 });
                                    } else {
                                      handleUpdateMieteRule(rule.id, { kind: k, percentPerYear: 1.0 });
                                    }
                                  }}
                                  className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs focus:border-blue-500 focus:outline-none"
                                >
                                  <option value="rate">jährlich (p. a.)</option>
                                  <option value="step">einmalig (Stufe)</option>
                                </select>
                              </td>
                              <td className="px-3 py-1.5">
                                <div className="relative flex items-center">
                                  <input
                                    type="number"
                                    min="-100"
                                    max="100"
                                    step="0.1"
                                    value={rule.kind === 'rate' ? rule.percentPerYear : rule.percent}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      if (rule.kind === 'rate') {
                                        handleUpdateMieteRule(rule.id, { percentPerYear: val });
                                      } else {
                                        handleUpdateMieteRule(rule.id, { percent: val });
                                      }
                                    }}
                                    className="w-full rounded border border-slate-200 pl-1 pr-4 py-0.5 text-xs text-right focus:border-blue-500 focus:outline-none"
                                  />
                                  <span className="absolute right-1 text-[10px] text-slate-400 font-bold">%</span>
                                </div>
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMieteRule(rule.id)}
                                  className="text-slate-400 hover:text-rose-600 transition cursor-pointer inline-flex justify-center items-center"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {active.miete.steigerungen.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-3 text-center text-slate-400 italic">
                                Keine Steigerungsregeln definiert (0% p.a.)
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Rent mini chart */}
                  {rentChartData.length > 0 && (
                    <div className="h-32 w-full mt-4 bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Vorschau Miete (monatlich €)</span>
                      <ResponsiveContainer width="100%" height="90%">
                        <AreaChart data={rentChartData} margin={{ top: 2, right: 5, left: -25, bottom: 2 }}>
                          <defs>
                            <linearGradient id="colorMiete" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="Jahr" fontSize={8} stroke="#94a3b8" />
                          <YAxis fontSize={8} stroke="#94a3b8" />
                          <RechartsTooltip formatter={(v) => [`${v} €`, 'Kaltmiete']} labelFormatter={(l) => `Jahr ${l}`} />
                          <Area type="monotone" dataKey="Miete" stroke="#3b82f6" strokeWidth={1.5} fillOpacity={1} fill="url(#colorMiete)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SEKTION 5: Laufende Kosten */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('kosten')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <span>5. Laufende Kosten</span>
                <span className={`transform transition-transform duration-200 ${openSection === 'kosten' ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {openSection === 'kosten' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Instandhaltung Modus</span>
                    <Tabs
                      activeTab={active.kosten.maintenanceMode}
                      onChange={(id) => updateActive((d) => { d.kosten.maintenanceMode = id as MaintenanceMode; })}
                      tabs={[
                        { id: 'perSqm', label: 'Pro m²/Jahr' },
                        { id: 'percentRent', label: '% der Miete' },
                        { id: 'absolute', label: 'Absolut p. a.' },
                      ]}
                    />
                  </div>
                  {active.kosten.maintenanceMode === 'perSqm' && (
                    <NumberInput
                      label="Instandhaltung pro m²/Jahr"
                      value={active.kosten.instandhaltungProSqm}
                      min={0}
                      onChange={(val) => updateActive((d) => { d.kosten.instandhaltungProSqm = val; })}
                    />
                  )}
                  {active.kosten.maintenanceMode === 'percentRent' && (
                    <Slider
                      label="Instandhaltung (% der Kaltmiete)"
                      value={active.kosten.instandhaltungPctRent}
                      onChange={(val) => updateActive((d) => { d.kosten.instandhaltungPctRent = val; })}
                      min={0}
                      max={20}
                      suffix="%"
                    />
                  )}
                  {active.kosten.maintenanceMode === 'absolute' && (
                    <NumberInput
                      label="Instandhaltung pro Jahr"
                      value={active.kosten.instandhaltungAbsolut}
                      suffix="EUR"
                      min={0}
                      onChange={(val) => updateActive((d) => { d.kosten.instandhaltungAbsolut = val; })}
                    />
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <NumberInput
                      label="Verwaltungskosten p. a."
                      value={active.kosten.verwaltungProJahr}
                      suffix="EUR"
                      min={0}
                      onChange={(val) => updateActive((d) => { d.kosten.verwaltungProJahr = val; })}
                    />
                    <NumberInput
                      label="Sonstige nicht-umlagef. Kosten p. a."
                      value={active.kosten.sonstigeKostenProJahr}
                      suffix="EUR"
                      min={0}
                      onChange={(val) => updateActive((d) => { d.kosten.sonstigeKostenProJahr = val; })}
                    />
                  </div>
                  <Slider
                    label="Kostensteigerung (% p. a.)"
                    value={active.kosten.kostensteigerungPctPa}
                    onChange={(val) => updateActive((d) => { d.kosten.kostensteigerungPctPa = val; })}
                    min={0}
                    max={5}
                    step={0.1}
                    suffix="%"
                  />
                </div>
              )}
            </div>

            {/* SEKTION 6: Steuer */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('steuer')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <span>6. Steuer</span>
                <span className={`transform transition-transform duration-200 ${openSection === 'steuer' ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {openSection === 'steuer' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Steuer Modus</span>
                    <Tabs
                      activeTab={active.steuer.taxMode}
                      onChange={(id) => updateActive((d) => { d.steuer.taxMode = id as TaxMode; })}
                      tabs={[
                        { id: 'income', label: 'Jahreseinkommen (zvE)' },
                        { id: 'marginalRate', label: 'Grenzsteuersatz (%)' },
                      ]}
                    />
                  </div>
                  {active.steuer.taxMode === 'income' ? (
                    <div className="space-y-4">
                      <NumberInput
                        label="zu versteuerndes Einkommen (€)"
                        value={active.steuer.bruttoJahresEinkommen}
                        suffix="EUR"
                        min={0}
                        onChange={(val) => updateActive((d) => { d.steuer.bruttoJahresEinkommen = val; })}
                      />
                      <Select
                        label="Veranlagung"
                        value={active.steuer.veranlagung}
                        onChange={(e) => {
                          const v = e.target.value as Veranlagung;
                          updateActive((d) => { d.steuer.veranlagung = v; });
                        }}
                        options={[
                          { value: 'single', label: 'Einzelveranlagung' },
                          { value: 'splitting', label: 'Ehegattensplitting' },
                        ]}
                      />
                    </div>
                  ) : (
                    <Slider
                      label="Fester Grenzsteuersatz (%)"
                      value={active.steuer.grenzsteuersatzPct}
                      onChange={(val) => updateActive((d) => { d.steuer.grenzsteuersatzPct = val; })}
                      min={0}
                      max={50}
                      step={1}
                      suffix="%"
                    />
                  )}
                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg text-xs font-medium text-slate-600">
                    <span>{active.steuer.taxMode === 'income' ? 'Berechneter Grenzsteuersatz:' : 'Grenzsteuersatz:'}</span>
                    <span className="font-bold text-slate-700">
                      {formatPercent(computedMarginalRate)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Toggle
                      label="Soli einbeziehen"
                      checked={active.steuer.soli}
                      onChange={(val) => updateActive((d) => { d.steuer.soli = val; })}
                    />
                    <Select
                      label="Kirchensteuer"
                      value={active.steuer.kirchensteuerPct}
                      onChange={(e) => {
                        const ki = parseInt(e.target.value);
                        updateActive((d) => { d.steuer.kirchensteuerPct = ki; });
                      }}
                      options={[
                        { value: '0', label: '0 %' },
                        { value: '8', label: '8 %' },
                        { value: '9', label: '9 %' },
                      ]}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* SEKTION 7: AfA (Abschreibung) */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('afa')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <span>7. Abschreibung (AfA)</span>
                <span className={`transform transition-transform duration-200 ${openSection === 'afa' ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {openSection === 'afa' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <Select
                    label="Abschreibungsverfahren (AfA)"
                    value={active.afa.modus}
                    onChange={(e) => {
                      const m = e.target.value as AfaModus;
                      updateActive((d) => {
                        d.afa.modus = m;
                        if (m === 'linear') {
                          d.afa.linearSatzPct = d.objekt.fertigstellungsjahr >= 2023 ? 3.0 : d.objekt.fertigstellungsjahr < 1925 ? 2.5 : 2.0;
                        }
                      });
                    }}
                    options={[
                      { value: 'linear', label: 'Linear nach Baujahr' },
                      { value: 'degressiv', label: 'Degressiv 5% (Neubau)' },
                      { value: 'sonder7b', label: 'Sonder-AfA §7b' },
                      { value: 'denkmal7i', label: 'Denkmal-AfA §7i' },
                    ]}
                  />
                  {active.afa.modus === 'linear' && (
                    <Slider
                      label="Linearer AfA-Satz (%)"
                      value={active.afa.linearSatzPct}
                      onChange={(val) => updateActive((d) => { d.afa.linearSatzPct = val; })}
                      min={0}
                      max={5}
                      step={0.1}
                      suffix="%"
                    />
                  )}

                  {/* AfA Explanatory Text */}
                  <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-500 font-medium">
                    {active.afa.modus === 'linear' && (
                      <p>
                        ℹ️ <strong>Lineare AfA:</strong> Gebäude-Abschreibung von{' '}
                        <strong>{active.afa.linearSatzPct}% p. a.</strong> auf die Bemessungsgrundlage (Gebäudeanteil inkl. KNK).
                      </p>
                    )}
                    {active.afa.modus === 'degressiv' && (
                      <p>
                        ℹ️ <strong>Degressive AfA:</strong> Gebäude-Abschreibung von{' '}
                        <strong>5,0% p. a. vom Restwert</strong>. Die App wechselt automatisch zur linearen Abschreibung, sobald diese höher ist.
                      </p>
                    )}
                    {active.afa.modus === 'sonder7b' && (
                      <p>
                        ℹ️ <strong>Sonder-AfA §7b:</strong> Additive Sonderabschreibung von{' '}
                        <strong>+5,0% p. a. in den ersten 4 Jahren</strong> auf die gekappte Bemessungsgrundlage (max. 4.000 EUR/m²), zusätzlich zur regulären linearen Abschreibung. Ab Jahr 5 wird der Restbuchwert über die verbleibende Nutzungsdauer verteilt.
                      </p>
                    )}
                    {active.afa.modus === 'denkmal7i' && (
                      <p>
                        ℹ️ <strong>Denkmal-AfA §7i:</strong> Abschreibung der Sanierungskosten zu{' '}
                        <strong>100% über 12 Jahre</strong> (9,0% in J. 1-8, 7,0% in J. 9-12). Die Altbausubstanz (Anteil Gebäude-Kaufpreis) wird parallel linear abgeschrieben.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SEKTION 8: Wertentwicklung */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('wertentwicklung')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <span>8. Wertentwicklung</span>
                <span className={`transform transition-transform duration-200 ${openSection === 'wertentwicklung' ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {openSection === 'wertentwicklung' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  {/* Flexible Wertentwicklung-Rules */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Regeln für Wertentwicklung</span>
                      <button
                        type="button"
                        onClick={handleAddWertRule}
                        className="flex items-center gap-1 rounded bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-600 hover:bg-violet-100 transition cursor-pointer"
                      >
                        <Plus size={12} /> Regel
                      </button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full border-collapse text-left text-xs font-medium text-slate-600">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase text-slate-500">
                            <th className="px-3 py-2 w-16">Ab Jahr</th>
                            <th className="px-3 py-2">Typ</th>
                            <th className="px-3 py-2 w-20">Wert</th>
                            <th className="px-3 py-2 text-right w-10">Aktion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {active.wertentwicklung.szenario.map((rule) => (
                            <tr key={rule.id} className="hover:bg-slate-50/50">
                              <td className="px-3 py-1.5">
                                <input
                                  type="number"
                                  min="1"
                                  max="50"
                                  value={rule.fromYear}
                                  onChange={(e) => handleUpdateWertRule(rule.id, { fromYear: parseInt(e.target.value) || 1 })}
                                  className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs text-center focus:border-violet-500 focus:outline-none"
                                />
                              </td>
                              <td className="px-3 py-1.5">
                                <select
                                  value={rule.kind}
                                  onChange={(e) => {
                                    const k = e.target.value as 'step' | 'rate';
                                    if (k === 'step') {
                                      handleUpdateWertRule(rule.id, { kind: k, percent: 1.0 });
                                    } else {
                                      handleUpdateWertRule(rule.id, { kind: k, percentPerYear: 1.0 });
                                    }
                                  }}
                                  className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs focus:border-violet-500 focus:outline-none"
                                >
                                  <option value="rate">jährlich (p. a.)</option>
                                  <option value="step">einmalig (Stufe)</option>
                                </select>
                              </td>
                              <td className="px-3 py-1.5">
                                <div className="relative flex items-center">
                                  <input
                                    type="number"
                                    min="-100"
                                    max="100"
                                    step="0.1"
                                    value={rule.kind === 'rate' ? rule.percentPerYear : rule.percent}
                                    onChange={(e) => {
                                      const val = parseFloat(e.target.value) || 0;
                                      if (rule.kind === 'rate') {
                                        handleUpdateWertRule(rule.id, { percentPerYear: val });
                                      } else {
                                        handleUpdateWertRule(rule.id, { percent: val });
                                      }
                                    }}
                                    className="w-full rounded border border-slate-200 pl-1 pr-4 py-0.5 text-xs text-right focus:border-violet-500 focus:outline-none"
                                  />
                                  <span className="absolute right-1 text-[10px] text-slate-400 font-bold">%</span>
                                </div>
                              </td>
                              <td className="px-3 py-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteWertRule(rule.id)}
                                  className="text-slate-400 hover:text-rose-600 transition cursor-pointer inline-flex justify-center items-center"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {active.wertentwicklung.szenario.length === 0 && (
                            <tr>
                              <td colSpan={4} className="px-3 py-3 text-center text-slate-400 italic">
                                Keine Steigerungsregeln definiert (0% p.a.)
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Value appreciation mini chart */}
                  {valueChartData.length > 0 && (
                    <div className="h-32 w-full mt-4 bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Vorschau Immobilienwert (€)</span>
                      <ResponsiveContainer width="100%" height="90%">
                        <AreaChart data={valueChartData} margin={{ top: 2, right: 5, left: -15, bottom: 2 }}>
                          <defs>
                            <linearGradient id="colorWert" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                          <XAxis dataKey="Jahr" fontSize={8} stroke="#94a3b8" />
                          <YAxis fontSize={8} stroke="#94a3b8" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                          <RechartsTooltip formatter={(v) => [`${formatEUR(v as number)}`, 'Wert']} labelFormatter={(l) => `Jahr ${l}`} />
                          <Area type="monotone" dataKey="Wert" stroke="#8b5cf6" strokeWidth={1.5} fillOpacity={1} fill="url(#colorWert)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SEKTION 9: Exit (Verkauf) */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('exit')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <span>9. Verkauf (Exit)</span>
                <span className={`transform transition-transform duration-200 ${openSection === 'exit' ? 'rotate-180' : ''}`}>
                  ▼
                </span>
              </button>
              {openSection === 'exit' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Slider
                      label="Haltedauer (Jahre)"
                      value={active.exit.haltedauerJahre}
                      onChange={(val) => updateActive((d) => { d.exit.haltedauerJahre = val; })}
                      min={1}
                      max={40}
                      step={1}
                    />
                    <Slider
                      label="Verkaufsnebenkosten (%)"
                      value={active.exit.verkaufsnebenkostenPct}
                      onChange={(val) => updateActive((d) => { d.exit.verkaufsnebenkostenPct = val; })}
                      min={0}
                      max={10}
                      step={0.1}
                      suffix="%"
                    />
                    <Slider
                      label="Vorfälligkeit (%)"
                      value={active.exit.vorfaelligkeitPct}
                      onChange={(val) => updateActive((d) => { d.exit.vorfaelligkeitPct = val; })}
                      min={0}
                      max={5}
                      step={0.1}
                      suffix="%"
                    />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Results & Dashboard */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/60 pb-4">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Auswertung & Analyse</h2>
              <div className="w-full sm:w-auto">
                <Tabs
                  activeTab={activeTab}
                  onChange={(id) => setActiveTab(id as 'dashboard' | 'compare' | 'sensitivity' | 'etf' | 'holding')}
                  tabs={[
                    { id: 'dashboard', label: 'Dashboard' },
                    { id: 'holding', label: 'Verkauf' },
                    { id: 'compare', label: 'Vergleich' },
                    { id: 'sensitivity', label: 'Sensitivität' },
                    { id: 'etf', label: 'ETF-Vergleich' },
                  ]}
                />
              </div>
            </div>

            {activeTab === 'dashboard' && (
              <>

            {/* KPI Metrics Panel */}
            <Card>
              <CardContent className="pt-5 divide-y divide-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 pb-3">Kennzahlen (Jahr 1)</h3>
                {[
                  {
                    label: 'Cashflow nach Steuern pro Monat',
                    value: formatEUR(proj.years[0]?.cashflowNachSteuerMonatlich ?? 0),
                    color: (proj.years[0]?.cashflowNachSteuerMonatlich ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700',
                    desc: 'Monatlicher Überschuss bzw. Zuzahlungsbedarf im ersten Jahr nach Steuern',
                  },
                  {
                    label: 'Cashflow vor Steuern pro Monat',
                    value: formatEUR(proj.years[0]?.cashflowVorSteuerMonatlich ?? 0),
                    color: (proj.years[0]?.cashflowVorSteuerMonatlich ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700',
                    desc: 'Monatlicher Überschuss bzw. Zuzahlungsbedarf im ersten Jahr vor Steuern',
                  },
                  {
                    label: 'Eigenkapitalrendite (IRR) p. a.',
                    value: formatPercent(metrics.irr),
                    color: metrics.rating === 'green' ? 'text-emerald-700' : metrics.rating === 'red' ? 'text-rose-700' : 'text-amber-600',
                    desc: 'Interner Zinsfuß der Eigenkapital-Cashflows inkl. Verkauf über die gesamte Haltedauer',
                  },
                  {
                    label: 'Netto-Mietrendite',
                    value: formatPercent(metrics.nettomietrendite),
                    color: metrics.nettomietrendite >= 3.5 ? 'text-emerald-700' : 'text-slate-700',
                    desc: 'Jahresnettomiete abzüglich Bewirtschaftungskosten, geteilt durch die Gesamterwerbskosten',
                  },
                  {
                    label: 'Brutto-Mietrendite',
                    value: formatPercent(metrics.bruttomietrendite),
                    color: 'text-slate-700',
                    desc: 'Jahreskaltmiete geteilt durch den reinen Kaufpreis',
                  },
                  {
                    label: 'Kaufpreisfaktor',
                    value: `${formatNumber(metrics.kaufpreisfaktor, 1)}x`,
                    color: 'text-slate-700',
                    desc: 'Kaufpreis geteilt durch die Jahreskaltmiete — wie viele Jahresmieten kostet die Immobilie',
                  },
                  {
                    label: `Nettovermögen (nach ${active.exit.haltedauerJahre} Jahren)`,
                    value: formatEUR(proj.years[proj.years.length - 1]?.eigenkapital ?? 0),
                    color: 'text-blue-700',
                    desc: 'Immobilienwert abzüglich Restschuld am Ende der Haltedauer',
                  },
                  {
                    label: 'Durchschnittliche Cash-on-Cash Rendite p. a.',
                    value: formatPercent(metrics.cocAverage),
                    color: metrics.cocAverage >= 4.0 ? 'text-emerald-700' : 'text-slate-700',
                    desc: 'Durchschnittlicher jährlicher Cashflow nach Steuern im Verhältnis zum eingesetzten Eigenkapital',
                  },
                ].map((kpi) => (
                  <div key={kpi.label} className="flex items-baseline justify-between py-3">
                    <div className="pr-4">
                      <div className="text-sm font-semibold text-slate-700">{kpi.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{kpi.desc}</div>
                    </div>
                    <span className={`text-base font-extrabold tabular-nums whitespace-nowrap ${kpi.color}`}>{kpi.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Warnings Alert Box */}
            {warnings.length > 0 && (
              <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-4 text-xs font-medium text-amber-800 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle size={15} />
                  <span>Hinweise & Risiken</span>
                </div>
                <ul className="list-disc pl-4 space-y-1">
                  {warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cleartext Summary Block */}
            <Card className="border-blue-100 bg-blue-50/20">
              <CardContent className="pt-5 space-y-3 text-sm text-slate-700 leading-relaxed font-medium">
                <div className="flex items-start gap-2.5">
                  <CheckCircle className="text-blue-600 shrink-0 mt-0.5" size={18} />
                  <div>
                    Bei einem Kaufpreis von <strong className="text-slate-900">{formatEUR(active.objekt.kaufpreis)}</strong> und{' '}
                    <strong className="text-slate-900">{formatEUR(cashInvestment(active))}</strong> Eigenkapitaleinsatz erzielen Sie im ersten Jahr eine Netto-Mietrendite von{' '}
                    <strong className="text-slate-900">{formatPercent(metrics.nettomietrendite)}</strong>.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle className="text-blue-600 shrink-0 mt-0.5" size={18} />
                  <div>
                    Unter Berücksichtigung der Steigerungsregeln wächst der monatliche Cashflow nach Steuern von anfänglich{' '}
                    <strong className={`font-bold ${proj.years[0]?.cashflowNachSteuerMonatlich >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatEUR(proj.years[0]?.cashflowNachSteuerMonatlich ?? 0)}
                    </strong>{' '}
                    auf{' '}
                    <strong className={`font-bold ${proj.years[proj.years.length - 1]?.cashflowNachSteuerMonatlich >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {formatEUR(proj.years[proj.years.length - 1]?.cashflowNachSteuerMonatlich ?? 0)}
                    </strong>{' '}
                    im letzten Jahr.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle className="text-blue-600 shrink-0 mt-0.5" size={18} />
                  <div>
                    Am Ende der Haltedauer von <strong className="text-slate-900">{active.exit.haltedauerJahre} Jahren</strong> beträgt der prognostizierte Immobilienwert{' '}
                    <strong className="text-slate-900">{formatEUR(exitRes.verkaufspreis)}</strong> bei einer verbleibenden Restschuld von{' '}
                    <strong className="text-slate-900">{formatEUR(exitRes.restschuld)}</strong>. Nach Abzug aller Nebenkosten und Steuern verbleibt ein Netto-Erlös von{' '}
                    <strong className="text-slate-900">{formatEUR(exitRes.nettoVerkaufserloesNachSteuer)}</strong>.
                  </div>
                </div>
                <div className="flex items-start gap-2.5 border-t border-blue-100 pt-3">
                  <div className="text-slate-900">
                    📈 Dies entspricht einer <strong>Gesamtrendite (IRR)</strong> auf Ihr eingesetztes Eigenkapital von{' '}
                    <span className="font-extrabold text-blue-700 text-base">{formatPercent(metrics.irr)} p. a.</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Visualisations / Charts Panel */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Entwicklung & Projektions-Visualisierung</CardTitle>
                <CardDescription>Interaktive grafische Auswertung über {active.exit.haltedauerJahre} Jahre</CardDescription>
                <div className="pt-2">
                  <Tabs
                    activeTab={activeChartTab}
                    onChange={(tab) => setActiveChartTab(tab)}
                    tabs={[
                      { id: 'cashflow', label: 'Cashflows' },
                      { id: 'wealth', label: 'Vermögensaufbau' },
                      { id: 'taxes', label: 'Steuereffekte' },
                      { id: 'amortization', label: 'Zins/Tilgung' },
                    ]}
                  />
                </div>
              </CardHeader>
              <CardContent className="h-80 min-h-[320px] pt-1">
                {activeChartTab === 'cashflow' && (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={cashflowChartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="Jahr" fontSize={10} stroke="#94a3b8" />
                      <YAxis fontSize={10} stroke="#94a3b8" />
                      <RechartsTooltip />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="Miete" stackId="pos" fill="#3b82f6" name="Nettomiete" />
                      <Bar dataKey="Steuereffekt" stackId="pos" fill="#10b981" name="Steuereffekt" />
                      <Bar dataKey="Zins" stackId="neg" fill="#f43f5e" name="Zinsen" />
                      <Bar dataKey="Tilgung" stackId="neg" fill="#8b5cf6" name="Tilgung" />
                      <Bar dataKey="Kosten" stackId="neg" fill="#f59e0b" name="Kosten" />
                      <Line type="monotone" dataKey="Cashflow" stroke="#0f172a" strokeWidth={2.5} name="Netto-Cashflow" dot={{ r: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}

                {activeChartTab === 'wealth' && (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={wealthChartData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="Jahr" fontSize={10} stroke="#94a3b8" />
                      <YAxis fontSize={10} stroke="#94a3b8" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <RechartsTooltip formatter={(v) => [`${formatEUR(v as number)}`, undefined]} />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                      <Area type="monotone" dataKey="Restschuld" stackId="1" stroke="#f43f5e" fill="#ffe4e6" name="Restschuld" />
                      <Area type="monotone" dataKey="Nettovermoegen" stackId="1" stroke="#10b981" fill="#d1fae5" name="Nettovermögen" />
                      <Line type="monotone" dataKey="Immobilienwert" stroke="#6366f1" strokeWidth={2} dot={false} name="Immobilienwert" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}

                {activeChartTab === 'taxes' && (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={taxChartData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="Jahr" fontSize={10} stroke="#94a3b8" />
                      <YAxis fontSize={10} stroke="#94a3b8" />
                      <RechartsTooltip formatter={(v) => [`${formatEUR(v as number)}`, undefined]} />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="Steuereffekt (jährl.)" fill="#3b82f6" name="Steuereffekt p.a. (Ersparnis)" />
                      <Line type="monotone" dataKey="Steuerersparnis (kum.)" stroke="#8b5cf6" strokeWidth={2.5} name="Kumulierte Steuerersparnis" dot={{ r: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}

                {activeChartTab === 'amortization' && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={amortizationChartData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="Jahr" fontSize={10} stroke="#94a3b8" />
                      <YAxis fontSize={10} stroke="#94a3b8" />
                      <RechartsTooltip formatter={(v) => [`${formatEUR(Math.abs(v as number))}`, undefined]} />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="Zins" stackId="1" fill="#f43f5e" name="Zins" />
                      <Bar dataKey="Tilgung" stackId="1" fill="#8b5cf6" name="Reguläre Tilgung" />
                      <Bar dataKey="Sondertilgung" stackId="1" fill="#f59e0b" name="Sondertilgung" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Exit/Verkauf Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Exit-Analyse nach {active.exit.haltedauerJahre} Jahren</CardTitle>
                <CardDescription>Projektion des Verkaufs und eventueller Steuerlasten</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verkaufspreis</span>
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{formatEUR(exitRes.verkaufspreis)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Restschuld</span>
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{formatEUR(exitRes.restschuld)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Spekulationssteuer</span>
                    <p className={`text-sm font-bold tabular-nums ${exitRes.spekulationssteuer > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                      {formatEUR(exitRes.spekulationssteuer)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Netto-Erlös (n. St.)</span>
                    <p className="text-sm font-bold text-slate-700 tabular-nums">{formatEUR(exitRes.nettoVerkaufserloesNachSteuer)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Projection Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle>Projektionsverlauf</CardTitle>
                  <CardDescription>Jahr-für-Jahr Detailübersicht (Haltedauer: {active.exit.haltedauerJahre} Jahre)</CardDescription>
                </div>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1 rounded bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition cursor-pointer"
                >
                  <Download size={14} /> Export (CSV)
                </button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-96">
                  <table className="w-full border-collapse text-left text-xs font-medium text-slate-600">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                      <tr className="text-slate-500">
                        <th className="px-4 py-3">Jahr</th>
                        <th className="px-4 py-3">Kaltmiete (netto)</th>
                        <th className="px-4 py-3">Annuität</th>
                        <th className="px-4 py-3">Zinsen</th>
                        <th className="px-4 py-3">Steuereffekt</th>
                        <th className="px-4 py-3">Netto-CF p. a.</th>
                        <th className="px-4 py-3">Immobilienwert</th>
                        <th className="px-4 py-3">Restschuld</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium tabular-nums text-slate-700">
                      {proj.years.map((year) => (
                        <tr key={year.jahr} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-900">{year.jahr}</td>
                          <td className="px-4 py-3">{formatEUR(year.nettoKaltmiete)}</td>
                          <td className="px-4 py-3">{formatEUR(year.annuitaet)}</td>
                          <td className="px-4 py-3 text-rose-600">{formatEUR(year.zins)}</td>
                          <td className={`px-4 py-3 ${year.steuereffekt < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {year.steuereffekt < 0 ? `+${formatEUR(Math.abs(year.steuereffekt))}` : `-${formatEUR(year.steuereffekt)}`}
                          </td>
                          <td className={`px-4 py-3 font-semibold ${year.cashflowNachSteuer >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {formatEUR(year.cashflowNachSteuer)}
                          </td>
                          <td className="px-4 py-3 text-slate-900">{formatEUR(year.immobilienwert)}</td>
                          <td className="px-4 py-3 text-slate-500">{formatEUR(year.restschuld)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            </>
            )}

            {/* Scenario Comparison View */}
            {activeTab === 'compare' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Szenarien-Vergleich</CardTitle>
                    <CardDescription>Vergleich aller gespeicherten Szenarien auf einen Blick</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full border-collapse text-left text-xs font-medium text-slate-600">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                            <th className="px-4 py-3 min-w-[180px]">Metrik</th>
                            {comparisonData.map(d => (
                              <th key={d.id} className={`px-4 py-3 text-right min-w-[140px] ${d.id === active.id ? 'bg-blue-50/50 text-blue-800 font-extrabold' : ''}`}>
                                {d.name} {d.id === active.id ? '(Aktiv)' : ''}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 tabular-nums">
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-700">Kaufpreis</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20 font-bold' : ''}`}>
                                {formatEUR(d.kaufpreis)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-700">Gesamterwerbskosten</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20' : ''}`}>
                                {formatEUR(d.totalInvest)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-700">Eigenkapitaleinsatz</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20 font-bold' : ''}`}>
                                {formatEUR(d.equity)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-700">Darlehenssumme</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20' : ''}`}>
                                {formatEUR(d.loan)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-700">Sollzins p. a.</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20' : ''}`}>
                                {formatPercent(d.sollzins)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-700">Zinsbindung</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20' : ''}`}>
                                {d.zinsbindung} Jahre
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-700">CF n. St. / Monat (J. 1)</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right font-semibold ${d.id === active.id ? 'bg-blue-50/20' : ''} ${d.cf1 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {formatEUR(d.cf1)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-700">Netto-Mietrendite</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20 font-bold' : ''}`}>
                                {formatPercent(d.nettoMietrendite)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50 bg-slate-50/30">
                            <td className="px-4 py-3 font-bold text-slate-800">Gesamtrendite (IRR)</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-blue-700 font-extrabold ${d.id === active.id ? 'bg-blue-50/30 text-base' : ''}`}>
                                {formatPercent(d.irr)} p. a.
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-700">Nettovermögen (Exit-Jahr)</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20 font-bold' : ''}`}>
                                {formatEUR(d.netWealth)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-semibold text-slate-700">Netto-Exit-Erlös n. St.</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20' : ''}`}>
                                {formatEUR(d.netExit)}
                              </td>
                            ))}
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {saved.length === 0 && (
                      <div className="mt-4 rounded-lg bg-blue-50/70 p-4 text-xs font-semibold text-blue-800 flex items-start gap-2.5">
                        <Info size={16} className="shrink-0 mt-0.5" />
                        <span>Tipp: Klicken Sie oben auf "Speichern" oder "Duplizieren", um weitere Varianten dieser Immobilie zu erstellen und direkt nebeneinander zu vergleichen.</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Sensitivity Analysis View */}
            {activeTab === 'sensitivity' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Sensitivitätsanalyse & Stresstest</CardTitle>
                    <CardDescription>Simulieren Sie Abweichungen wichtiger Annahmen live und sehen Sie die Auswirkungen auf Rendite und Cashflow.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Live Comparison KPI Cards */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cashflow n. St. / Monat (J. 1)</span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className={`text-base font-extrabold tabular-nums ${sensProj.years[0]?.cashflowNachSteuerMonatlich >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {formatEUR(sensProj.years[0]?.cashflowNachSteuerMonatlich ?? 0)}
                          </span>
                          {(sensSollzins !== null || sensLeerstand !== null || sensWert !== null || sensAnschluss !== null) && (
                            <span className="text-xs text-slate-400 font-medium line-through">
                              ({formatEUR(proj.years[0]?.cashflowNachSteuerMonatlich ?? 0)})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Eigenkapitalrendite (IRR)</span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-base font-extrabold text-blue-700 tabular-nums">
                            {formatPercent(sensMetrics.irr)}
                          </span>
                          {(sensSollzins !== null || sensLeerstand !== null || sensWert !== null || sensAnschluss !== null) && (
                            <span className="text-xs text-slate-400 font-medium line-through">
                              ({formatPercent(metrics.irr)})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Sliders Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Slider
                        label={`Sollzins p. a.: ${formatPercent(currentSollzins)}`}
                        value={currentSollzins}
                        onChange={(v) => setSensSollzins(v)}
                        min={0}
                        max={10}
                        step={0.05}
                        suffix="%"
                      />
                      <Slider
                        label={`Leerstandsquote: ${formatPercent(currentLeerstand)}`}
                        value={currentLeerstand}
                        onChange={(v) => setSensLeerstand(v)}
                        min={0}
                        max={20}
                        step={0.5}
                        suffix="%"
                      />
                      <Slider
                        label={`Wertsteigerung p. a.: ${formatPercent(currentWert)}`}
                        value={currentWert}
                        onChange={(v) => setSensWert(v)}
                        min={0}
                        max={5}
                        step={0.1}
                        suffix="%"
                      />
                      <Slider
                        label={`Anschlusszins: ${formatPercent(currentAnschluss)}`}
                        value={currentAnschluss}
                        onChange={(v) => setSensAnschluss(v)}
                        min={0}
                        max={10}
                        step={0.05}
                        suffix="%"
                      />
                    </div>

                    {/* Reset Button */}
                    {(sensSollzins !== null || sensLeerstand !== null || sensWert !== null || sensAnschluss !== null) && (
                      <div className="flex justify-end">
                        <button
                          onClick={() => {
                            setSensSollzins(null);
                            setSensLeerstand(null);
                            setSensWert(null);
                            setSensAnschluss(null);
                          }}
                          className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
                        >
                          Simulation zurücksetzen
                        </button>
                      </div>
                    )}

                    <div className="border-t border-slate-100 pt-6">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Tornado-Diagramm (Auswirkung auf IRR)</h4>
                      <p className="text-xs text-slate-500 mb-4">
                        Zeigt die Sensitivität der Eigenkapitalrendite (IRR) bei Einzeländerung eines Parameters. Die blaue Linie markiert das Basisszenario.
                      </p>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                          data={tornadoChartData}
                          layout="vertical"
                          margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                          <XAxis type="number" domain={['auto', 'auto']} tickFormatter={(v) => `${v.toFixed(1)}%`} fontSize={10} />
                          <YAxis type="category" dataKey="label" fontSize={10} width={130} />
                          <RechartsTooltip
                            formatter={(value: unknown) => {
                              const range = value as number[];
                              return [
                                `${range[0].toFixed(2)}% bis ${range[1].toFixed(2)}%`,
                                'IRR-Bereich'
                              ];
                            }}
                          />
                          <ReferenceLine x={metrics.irr} stroke="#3b82f6" strokeWidth={1.5} label={{ value: `Basis: ${formatPercent(metrics.irr)}`, position: 'top', fill: '#2563eb', fontSize: 10 }} />
                          <Bar dataKey="range" fill="#818cf8" radius={[4, 4, 4, 4]} barSize={16} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ETF Comparison View */}
            {activeTab === 'etf' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>ETF-Vergleich & Opportunitätskosten</CardTitle>
                    <CardDescription>
                      Vergleichen Sie die Rendite Ihrer Immobilie mit einer alternativen Investition in einen Aktien-ETF. 
                      Wir nehmen an, dass Sie das Eigenkapital und jeden monatlichen Zuzahlungsbedarf (negativen Cashflow) stattdessen in den ETF investieren.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* ETF Return Slider */}
                    <Slider
                      label={`Angenommene ETF-Rendite p. a.: ${formatPercent(etfReturnPct)}`}
                      value={etfReturnPct}
                      onChange={(v) => setEtfReturnPct(v)}
                      min={0}
                      max={12}
                      step={0.1}
                      suffix="%"
                    />

                    {/* KPI Comparison Cards */}
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Eigenkapital + Zuzahlung</span>
                        <p className="text-sm font-bold text-slate-800 mt-1 tabular-nums">{formatEUR(etfComparison.totalInvested)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Immobilie (Endvermögen)</span>
                        <p className="text-sm font-extrabold text-blue-700 mt-1 tabular-nums">{formatEUR(etfComparison.immoEndvermoegen)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ETF Sparplan (Endwert)</span>
                        <p className="text-sm font-bold text-slate-800 mt-1 tabular-nums">{formatEUR(etfComparison.etfEndvermoegen)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Differenz (Immo vs. ETF)</span>
                        <p className={`text-sm font-extrabold mt-1 tabular-nums ${etfComparison.difference >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {etfComparison.difference >= 0 ? '+' : ''}{formatEUR(etfComparison.difference)}
                        </p>
                      </div>
                    </div>

                    {/* Summary box */}
                    <div className={`rounded-xl border p-4 text-xs font-medium ${etfComparison.difference >= 0 ? 'border-emerald-100 bg-emerald-50/30 text-emerald-800' : 'border-rose-100 bg-rose-50/30 text-rose-800'}`}>
                      {etfComparison.difference >= 0 ? (
                        <div className="flex gap-2">
                          <CheckCircle className="text-emerald-600 shrink-0" size={18} />
                          <div>
                            <strong>Die Immobilie schlägt den ETF!</strong> Am Ende der Haltedauer erzielen Sie mit der Immobilie ein um <strong>{formatEUR(etfComparison.difference)}</strong> höheres Vermögen als bei einem ETF mit {etfReturnPct.toFixed(1)}% p.a. Rendite. Grund dafür ist primär der Hebeleffekt des Fremdkapitals.
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <AlertTriangle className="text-rose-600 shrink-0" size={18} />
                          <div>
                            <strong>Der ETF schlägt die Immobilie!</strong> Am Ende der Haltedauer erzielen Sie mit dem ETF-Sparplan ein um <strong>{formatEUR(Math.abs(etfComparison.difference))}</strong> höheres Vermögen als mit der Immobilie. Der ETF ist zudem liquider und erfordert keinen Verwaltungsaufwand.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Line Chart */}
                    <div className="border-t border-slate-100 pt-6">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Entwicklungsvergleich (Immobilie vs. ETF)</h4>
                      <ResponsiveContainer width="100%" height={260}>
                        <AreaChart data={etfHistoryData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="Jahr" fontSize={10} stroke="#94a3b8" />
                          <YAxis fontSize={10} stroke="#94a3b8" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                          <RechartsTooltip formatter={(v) => [`${formatEUR(v as number)}`, undefined]} />
                          <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                          <Area type="monotone" dataKey="Immobilie" stroke="#3b82f6" fill="#eff6ff" name="Immobilie (Netto-Erlös + Cashflow)" />
                          <Area type="monotone" dataKey="ETF-Depot" stroke="#8b5cf6" fill="#f5f3ff" name="ETF Sparplan" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'holding' && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Verkauf &amp; Haltedauer</CardTitle>
                    <CardDescription>
                      Was bleibt unterm Strich, wenn Sie nach X Jahren verkaufen? Gesamtgewinn (inkl. des bis dahin
                      aufgelaufenen, ggf. negativen Cashflows und der Spekulationssteuer) sowie die Eigenkapital-Rendite
                      p.&nbsp;a. (IRR/CAGR) und insgesamt. Zielrendite-Vergleich: {formatPercent(etfReturnPct)} (aus ETF-Tab).
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {/* Summary chips */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Bestes Exit-Jahr (IRR)</div>
                        <div className="text-lg font-extrabold text-emerald-700 tabular-nums">
                          {holdingAnalysis.besteExitJahrNachIrr !== null
                            ? `Jahr ${holdingAnalysis.besteExitJahrNachIrr}`
                            : '–'}
                        </div>
                        <div className="text-xs text-emerald-600/80">
                          {(() => {
                            const best = holdingAnalysis.years.find((y) => y.jahr === holdingAnalysis.besteExitJahrNachIrr);
                            return best ? `${formatPercent(best.irrPct)} p. a.` : '';
                          })()}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Break-even (Gesamtgewinn ≥ 0)</div>
                        <div className="text-lg font-extrabold text-slate-700 tabular-nums">
                          {holdingAnalysis.breakEvenJahr !== null ? `ab Jahr ${holdingAnalysis.breakEvenJahr}` : 'nicht erreicht'}
                        </div>
                        <div className="text-xs text-slate-400">erstes Jahr mit positivem Gesamtergebnis</div>
                      </div>
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Spekulationsfrei ab</div>
                        <div className="text-lg font-extrabold text-blue-700 tabular-nums">Jahr {holdingAnalysis.steuerfreiAbJahr}</div>
                        <div className="text-xs text-blue-600/80">ab dann kein §23-EStG-Gewinn versteuert</div>
                      </div>
                    </div>

                    {/* Chart: Gesamtgewinn (Bar) + IRR (Line) je Exit-Jahr */}
                    <div className="border-t border-slate-100 pt-6">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Gesamtgewinn &amp; IRR je Verkaufsjahr</h4>
                      <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart
                          data={holdingAnalysis.years.map((y) => ({
                            jahr: y.jahr,
                            gesamtgewinn: y.gesamtgewinn,
                            irr: y.irrPct,
                          }))}
                          margin={{ top: 10, right: 10, left: -5, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="jahr" fontSize={10} stroke="#94a3b8" />
                          <YAxis yAxisId="left" fontSize={10} stroke="#94a3b8" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                          <YAxis yAxisId="right" orientation="right" fontSize={10} stroke="#94a3b8" tickFormatter={(v) => `${v.toFixed(0)}%`} />
                          <RechartsTooltip
                            formatter={(value, name) => {
                              const num = Number(value);
                              if (String(name).includes('IRR')) return [`${num.toFixed(2)} %`, name];
                              return [formatEUR(num), name];
                            }}
                            labelFormatter={(l) => `Verkauf nach Jahr ${l}`}
                          />
                          <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                          <ReferenceLine yAxisId="left" y={0} stroke="#cbd5e1" />
                          <ReferenceLine
                            yAxisId="left"
                            x={10}
                            stroke="#3b82f6"
                            strokeDasharray="4 4"
                            label={{ value: 'steuerfrei', position: 'top', fill: '#2563eb', fontSize: 10 }}
                          />
                          <Bar yAxisId="left" dataKey="gesamtgewinn" name="Gesamtgewinn (€)" fill="#a5b4fc" radius={[3, 3, 0, 0]} />
                          <Line yAxisId="right" type="monotone" dataKey="irr" name="IRR p. a. (%)" stroke="#059669" strokeWidth={2} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Table: Verkauf nach Jahr X */}
                    <div className="border-t border-slate-100 pt-6 mt-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Verkauf nach Jahr X</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs tabular-nums">
                          <thead>
                            <tr className="text-left text-slate-400 border-b border-slate-200">
                              <th className="py-2 pr-3 font-semibold">Jahr</th>
                              <th className="py-2 px-3 font-semibold text-right">Immobilienwert</th>
                              <th className="py-2 px-3 font-semibold text-right">Restschuld</th>
                              <th className="py-2 px-3 font-semibold text-right">Netto-Erlös</th>
                              <th className="py-2 px-3 font-semibold text-right">Spek.-Steuer</th>
                              <th className="py-2 px-3 font-semibold text-right">Kum. Cashflow</th>
                              <th className="py-2 px-3 font-semibold text-right">Gesamtgewinn</th>
                              <th className="py-2 px-3 font-semibold text-right">EK-Rendite ges.</th>
                              <th className="py-2 px-3 font-semibold text-right">IRR p. a.</th>
                              <th className="py-2 pl-3 font-semibold text-right">CAGR p. a.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {holdingAnalysis.years.map((y) => {
                              const isChosen = y.jahr === active.exit.haltedauerJahre;
                              const irrColor =
                                y.irrPct >= etfReturnPct
                                  ? 'text-emerald-600'
                                  : y.irrPct >= 0
                                    ? 'text-amber-600'
                                    : 'text-rose-600';
                              return (
                                <tr
                                  key={y.jahr}
                                  className={`border-b border-slate-50 ${isChosen ? 'bg-blue-50/70 font-semibold' : ''}`}
                                >
                                  <td className="py-1.5 pr-3">
                                    {y.jahr}
                                    {y.jahr === 10 && <span className="ml-1 text-[9px] text-blue-500">(steuerfrei)</span>}
                                  </td>
                                  <td className="py-1.5 px-3 text-right">{formatEUR(y.immobilienwert)}</td>
                                  <td className="py-1.5 px-3 text-right text-slate-500">{formatEUR(y.restschuld)}</td>
                                  <td className="py-1.5 px-3 text-right">{formatEUR(y.nettoVerkaufserloesNachSteuer)}</td>
                                  <td className="py-1.5 px-3 text-right text-rose-500">
                                    {y.spekulationssteuer > 0 ? `-${formatEUR(y.spekulationssteuer)}` : '–'}
                                  </td>
                                  <td className={`py-1.5 px-3 text-right ${y.kumulierterCashflowNachSteuer < 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                                    {formatEUR(y.kumulierterCashflowNachSteuer)}
                                  </td>
                                  <td className={`py-1.5 px-3 text-right font-semibold ${y.gesamtgewinn >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                    {formatEUR(y.gesamtgewinn)}
                                  </td>
                                  <td className="py-1.5 px-3 text-right">{formatPercent(y.ekRenditeGesamtPct)}</td>
                                  <td className={`py-1.5 px-3 text-right font-semibold ${irrColor}`}>{formatPercent(y.irrPct)}</td>
                                  <td className="py-1.5 pl-3 text-right text-slate-500">{formatPercent(y.cagrPct)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-3">
                        Blaue Zeile = aktuell gewählte Haltedauer ({active.exit.haltedauerJahre} Jahre). Gesamtgewinn = kumulierter
                        Cashflow nach Steuer + Netto-Verkaufserlös nach Spekulationssteuer − eingesetztes Eigenkapital
                        ({formatEUR(holdingAnalysis.initialEquity)}).
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Disclaimer Block */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-[10px] text-slate-400 font-medium space-y-1 shadow-2xs">
              <div className="flex items-center gap-1 font-bold text-slate-500 uppercase tracking-wider">
                <Info size={12} />
                <span>Disclaimer / Haftungsausschluss</span>
              </div>
              <p>
                Diese Anwendung dient ausschließlich zu Simulations- und Informationszwecken. Die berechneten Werte stellen keine steuerliche, rechtliche oder finanzielle Beratung dar. Gesetzliche Regelungen (wie EStG, Spekulationssteuer oder Abschreibungen) basieren auf den gesetzlichen Rahmenbedingungen für das Steuerjahr 2026. Eine Gewähr für die Richtigkeit, Aktualität oder Vollständigkeit der Daten wird nicht übernommen. Investitionsentscheidungen sollten immer unabhängig geprüft werden.
              </p>
              <div className="pt-1 font-bold text-slate-500 uppercase tracking-wider">Annahmen &amp; Vereinfachungen</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Steuer-/AfA-Stand: Veranlagungsjahr 2026 (ESt-Tarif §32a, Grunderwerbsteuer je Bundesland, AfA-Sätze). Alle Werte in der UI editierbar.</li>
                <li>Steuereffekt aus Vermietung &amp; Verpachtung über den Tarif-Unterschied (mit/ohne V&amp;V) bzw. wahlweise über einen festen Grenzsteuersatz; nur Schuldzinsen, AfA und nicht-umlagefähige Kosten sind Werbungskosten (Tilgung nicht).</li>
                <li>Spekulationssteuer (§23 EStG) wird mit dem Grenzsteuersatz auf den Gewinn (inkl. Wiederaufnahme genutzter AfA) geschätzt; ab 10 Jahren Haltedauer steuerfrei.</li>
                <li>Wert- und Mietentwicklung sind szenariobasiert (frei einstellbare Stufen/Raten), keine Marktprognose. Leerstand pauschal als Mietausfallwagnis.</li>
                <li>Nicht abgebildet: WEG-Sonderumlagen, individuelle Förderdarlehen, Umsatzsteuer-Option, gewerblicher Grundstückshandel, Bonitäts-/Liquiditätsprüfung der Bank.</li>
              </ul>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
