import { Fragment, useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useScenarioStore, useSyncedSave, useSyncedDelete } from '../store/scenarioStore';
import { useAuthStore } from '../store/authStore';
import { AdminPanel } from '../components/admin/AdminPanel';
import {
  deleteRemoteAgentDraft,
  pullAgentDrafts,
  pushScenarios,
  type RemoteAgentDraft,
} from '../lib/sync';
import {
  knkAmount,
  totalInvest,
  cashInvestmentBreakdown,
  effectiveBodenwertAnteilPct,
  bodenwertFlaeche,
  hasCompleteBodenrichtwertInputs,
  CONSERVATIVE_BODENWERT_ANTEIL_PCT,
  landValueAmount,
  loanAmount,
  annualBaseRent,
} from '../engine/derive';
import { runProjection } from '../engine/projection';
import { buildAmortizationSchedule } from '../engine/financing';
import { calculateMetrics } from '../engine/metrics';
import { calculateExit } from '../engine/exit';
import { analyzeHoldingPeriods } from '../engine/holding';
import {
  assessRentAgainstMietspiegel,
  calculateRentRuleResults,
  rentPerSqmInCents,
} from '../engine/rent';
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
  parseNumber,
} from '../lib/format';
import {
  exportScenario,
  exportAllScenarios,
  importScenarios,
  exportToCSV,
} from '../lib/io';
import {
  confirmAgentField,
  getAgentCapabilities,
  getAgentCompleteness,
  reconcileAgentReview,
} from '../agent/contract';
import {
  isAgentDraft,
  materializeAgentDraft,
} from '../agent/draft';
import { createAgentSnapshot } from '../agent/snapshot';

// UI Primitives
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { NumberInput } from '../components/ui/NumberInput';
import { Slider } from '../components/ui/Slider';
import { Select } from '../components/ui/Select';
import { Toggle } from '../components/ui/Toggle';
import { Tabs } from '../components/ui/Tabs';
import { Tooltip } from '../components/ui/Tooltip';
import { KPICard } from '../components/ui/KPICard';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Toast } from '../components/ui/Toast';
import { AgentDraftDialog } from '../components/agent/AgentDraftDialog';
import { AgentEditProvider } from '../components/agent/AgentEditContext';
import { AgentFieldFrame } from '../components/agent/AgentFieldFrame';
import { AgentReviewPanel } from '../components/agent/AgentReviewPanel';
import { AgentConnectionsDialog } from '../components/auth/AgentConnectionsDialog';

// Constants and Helpers
import { BUNDESLAND_LABELS, GREST_BY_BUNDESLAND, linearAfaRateForYear } from '../engine/constants';
import type {
  Scenario,
  BodenwertMode,
  VerkaufsnebenkostenMode,
  Bundesland,
  ObjektTyp,
  AfaModus,
  EquityMode,
  RentMode,
  MaintenanceMode,
  KostenErfassungMode,
  TaxMode,
  Veranlagung,
  IncreaseRule,
  Sanierungsmassnahme,
  SanierungSteuerart,
} from '../engine/types';
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
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import { Plus, Trash2, Download, AlertTriangle, CheckCircle, Info, Building2, ChevronDown, Copy, Upload, FileSpreadsheet, Printer } from 'lucide-react';

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

function rentPerSqmFromMonthly(monthlyRent: number, wohnflaeche: number): number {
  return wohnflaeche > 0 ? monthlyRent / wohnflaeche : 0;
}

function updateRentFromMonthly(d: Scenario, monthlyRent: number): void {
  const rent = Math.max(0, monthlyRent);
  d.miete.rentMode = 'perMonth';
  d.miete.kaltmieteProMonat = rent;
  d.miete.kaltmieteProJahr = rent * 12;
  d.miete.kaltmieteProSqm = rentPerSqmFromMonthly(rent, d.objekt.wohnflaeche);
}

function updateRentFromYear(d: Scenario, yearlyRent: number): void {
  const rent = Math.max(0, yearlyRent);
  const monthlyRent = rent / 12;
  d.miete.rentMode = 'perYear';
  d.miete.kaltmieteProJahr = rent;
  d.miete.kaltmieteProMonat = monthlyRent;
  d.miete.kaltmieteProSqm = rentPerSqmFromMonthly(monthlyRent, d.objekt.wohnflaeche);
}

function updateRentFromSqm(d: Scenario, rentPerSqm: number): void {
  const rent = Math.max(0, rentPerSqm);
  const monthlyRent = rent * Math.max(0, d.objekt.wohnflaeche);
  d.miete.rentMode = 'perSqm';
  d.miete.kaltmieteProSqm = rent;
  d.miete.kaltmieteProMonat = monthlyRent;
  d.miete.kaltmieteProJahr = monthlyRent * 12;
}

function syncRentForMode(d: Scenario, mode: RentMode): void {
  if (mode === 'perYear') {
    updateRentFromYear(d, d.miete.kaltmieteProJahr);
  } else if (mode === 'perSqm') {
    updateRentFromSqm(d, d.miete.kaltmieteProSqm);
  } else {
    updateRentFromMonthly(d, d.miete.kaltmieteProMonat);
  }
}

function formatLoanTerm(months: number): string {
  if (months === 0) return 'kein Darlehen';
  if (!Number.isFinite(months)) return 'keine Volltilgung im Modellzeitraum';

  const roundedMonths = Math.max(0, Math.round(months));
  const years = Math.floor(roundedMonths / 12);
  const remainingMonths = roundedMonths % 12;

  if (remainingMonths === 0) return `${formatNumber(years, 0)} Jahre`;
  if (years === 0) return `${formatNumber(remainingMonths, 0)} Monate`;
  return `${formatNumber(years, 0)} Jahre ${formatNumber(remainingMonths, 0)} Monate`;
}

function sanierungSteuerInfo(steuerart: SanierungSteuerart, linearSatzPct: number): string {
  switch (steuerart) {
    case 'sofort':
      return 'Als echter Erhaltungsaufwand mindert der Betrag das Ergebnis aus Vermietung und Verpachtung vollständig im Maßnahmenjahr.';
    case 'verteilt':
      return 'Größerer Erhaltungsaufwand wird ab dem Maßnahmenjahr gleichmäßig verteilt. § 82b setzt hier Privatvermögen und ein Gebäude mit überwiegender Wohnnutzung voraus.';
    case 'herstellung':
      return `Aktivierte Herstellungs- oder anschaffungsnahe Kosten werden ab dem Maßnahmenjahr mit ${formatPercent(linearSatzPct)} pro Jahr abgeschrieben.`;
    case 'denkmal7i':
      return 'Bei erfüllten Voraussetzungen: 9 % in den ersten acht Jahren und 7 % in den folgenden vier Jahren ab Abschluss der Maßnahme.';
    case 'denkmal11b':
      return 'Bescheinigter Denkmal-Erhaltungsaufwand wird ab dem Maßnahmenjahr gleichmäßig auf zwei bis fünf Jahre verteilt.';
    case 'keine':
    default:
      return 'Die Auszahlung beeinflusst den Cashflow, wird steuerlich aber noch nicht berücksichtigt.';
  }
}

function formatRuleInputValue(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

function constrainRuleInput(value: number, min?: number, max?: number): number {
  let constrained = Number.isFinite(value) ? value : 0;
  if (min !== undefined && constrained < min) constrained = min;
  if (max !== undefined && constrained > max) constrained = max;
  return constrained;
}

interface RuleNumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  className: string;
  ariaLabel: string;
}

function RuleNumberInput({
  value,
  onChange,
  min,
  max,
  inputMode = 'decimal',
  className,
  ariaLabel,
}: RuleNumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState(formatRuleInputValue(value));

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(formatRuleInputValue(value));
    }
  }, [isFocused, value]);

  const commit = (raw: string) => {
    const next = raw.trim() === ''
      ? (min ?? 0)
      : constrainRuleInput(parseNumber(raw), min, max);
    onChange(next);
    return next;
  };

  return (
    <input
      type="text"
      inputMode={inputMode}
      aria-label={ariaLabel}
      value={localValue}
      onFocus={(e) => {
        setIsFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setLocalValue(raw);
        if (raw.trim() === '' || /[-.,]$/.test(raw.trim())) return;
        onChange(constrainRuleInput(parseNumber(raw), min, max));
      }}
      onBlur={() => {
        const next = commit(localValue);
        setIsFocused(false);
        setLocalValue(formatRuleInputValue(next));
      }}
      className={className}
    />
  );
}

function InfoTooltip({ content }: { content: string }) {
  return (
    <Tooltip content={content} position="top">
      <button
        type="button"
        className="inline-flex rounded-full text-slate-400 transition hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        aria-label="Begriff erklaeren"
      >
        <Info size={13} />
      </button>
    </Tooltip>
  );
}

function SectionSaveButton({ onSave }: { onSave: () => void | Promise<void> }) {
  return (
    <div className="flex justify-end border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={() => void onSave()}
        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-500/20"
      >
        Szenario speichern
      </button>
    </div>
  );
}

export function App() {
  const active = useScenarioStore((s) => s.active);
  const saved = useScenarioStore((s) => s.saved);
  const updateActive = useScenarioStore((s) => s.updateActive);
  const setActive = useScenarioStore((s) => s.setActive);
  const resetActive = useScenarioStore((s) => s.resetActive);
  const loadSaved = useScenarioStore((s) => s.loadSaved);
  const scenarioOwnerUserId = useScenarioStore((s) => s.ownerUserId);
  const isSyncing = useScenarioStore((s) => s.isSyncing);
  const syncError = useScenarioStore((s) => s.syncError);
  const loadFromCloud = useScenarioStore((s) => s.loadFromCloud);

  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const syncedSave = useSyncedSave(user?.id);
  const syncedDelete = useSyncedDelete(user?.id);

  const [showAdmin, setShowAdmin] = useState(false);
  const [showAgentDraftDialog, setShowAgentDraftDialog] = useState(false);
  const [showAgentConnections, setShowAgentConnections] = useState(false);
  const [pendingAgentScenario, setPendingAgentScenario] = useState<Scenario | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    tone: 'primary' | 'danger';
    resolve: (confirmed: boolean) => void;
  } | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [agentEditEnabled, setAgentEditEnabled] = useState(false);
  const [browserAgentApiEnabled, setBrowserAgentApiEnabled] = useState(false);
  const [remoteAgentDrafts, setRemoteAgentDrafts] = useState<RemoteAgentDraft[]>([]);
  const [isLoadingAgentDrafts, setIsLoadingAgentDrafts] = useState(false);
  const [agentDraftInboxError, setAgentDraftInboxError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) loadFromCloud(user.id);
  }, [user?.id, loadFromCloud]);

  // UI state
  const [openSection, setOpenSection] = useState<string>('objekt');
  const [activeChartTab, setActiveChartTab] = useState<string>('cashflow');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'compare' | 'sensitivity' | 'etf' | 'holding'>('dashboard');
  const [dashboardYear, setDashboardYear] = useState<number>(1);
  const agentCompleteness = useMemo(
    () => getAgentCompleteness(active.agentReview),
    [active.agentReview],
  );
  const hasAgentReview = Boolean(active.agentReview);

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
    setDashboardYear(1);
    setAgentEditEnabled(Boolean(active.agentReview));
  }, [active.id]);

  useEffect(() => {
    if (!hasAgentReview) return;
    updateActive((draft) => reconcileAgentReview(draft));
  }, [
    active.finanzierung.equityMode,
    active.kosten.kostenErfassungMode,
    active.kosten.maintenanceMode,
    active.miete.rentMode,
    active.objekt.bodenwertMode,
    active.steuer.taxMode,
    hasAgentReview,
    updateActive,
  ]);

  // Compute live calculations
  const proj = useMemo(() => runProjection(active), [active]);
  const kostenErfassungMode = active.kosten.kostenErfassungMode ?? 'detailliert';
  const wpUmlagefaehig = Math.max(0, active.kosten.umlagefaehigeKostenProJahr ?? 0);
  const wpNichtUmlagefaehig = Math.max(0, active.kosten.nichtUmlagefaehigeKostenProJahr ?? 0);
  const wpWegRuecklage = Math.max(0, active.kosten.wegRuecklageProJahr ?? 0);
  const wpGeplanteKosten = wpUmlagefaehig + wpNichtUmlagefaehig;
  const wpGeplanteVorschuesse = wpGeplanteKosten + wpWegRuecklage;
  const wpLeerstandsanteil = wpUmlagefaehig
    * (Math.min(100, Math.max(0, active.miete.leerstandPct)) / 100);
  const wpSofortAbziehbar = wpNichtUmlagefaehig + wpLeerstandsanteil;
  const wpEigentuemerCashout = wpSofortAbziehbar + wpWegRuecklage;
  const visibleDashboardYear = Math.min(Math.max(dashboardYear, 1), proj.years.length);
  const selectedProjectionYear = proj.years[visibleDashboardYear - 1];

  useEffect(() => {
    setDashboardYear(visibleDashboardYear);
  }, [visibleDashboardYear]);

  const cashBreakdown = useMemo(() => cashInvestmentBreakdown(active), [active]);
  const financingSchedule = useMemo(() => buildAmortizationSchedule({
    loanAmount: loanAmount(active),
    sollzinsPct: active.finanzierung.sollzinsPct,
    tilgungPct: active.finanzierung.tilgungPct,
    zinsbindungJahre: active.finanzierung.zinsbindungJahre,
    anschlusszinsPct: active.finanzierung.anschlusszinsPct,
    anschlussTilgungPct: active.finanzierung.anschlussTilgungPct,
    sondertilgungProJahr: active.finanzierung.sondertilgungProJahr,
    haltedauerJahre: active.exit.haltedauerJahre,
  }), [active]);
  const anschlussRateFloor = useMemo(() => {
    const initialLoan = loanAmount(active);
    const previousMonthlyRate = (initialLoan * (active.finanzierung.sollzinsPct + active.finanzierung.tilgungPct)) / 100 / 12;
    const debtAtRefinancing = financingSchedule.restschuldZinsbindungEnde;

    if (initialLoan <= 0 || previousMonthlyRate <= 0 || debtAtRefinancing <= 0) return null;

    const thresholdPct = ((previousMonthlyRate * 12) / debtAtRefinancing) * 100 - active.finanzierung.anschlusszinsPct;
    if (!Number.isFinite(thresholdPct) || thresholdPct <= 0) return null;

    const activeAnschlussTilgungPct = active.finanzierung.anschlussTilgungPct ?? active.finanzierung.tilgungPct;
    return {
      thresholdPct,
      previousMonthlyRate,
      isFloorActive: activeAnschlussTilgungPct <= thresholdPct,
    };
  }, [active, financingSchedule.restschuldZinsbindungEnde]);
  const effectiveBodenwertPct = useMemo(() => effectiveBodenwertAnteilPct(active), [active]);
  const effectiveBodenwert = useMemo(() => landValueAmount(active), [active]);
  const hasValidPlotShare = bodenwertFlaeche(active) > 0;
  const hasCompleteBodenrichtwert = hasCompleteBodenrichtwertInputs(active);
  const usesConservativeBodenFallback = active.objekt.bodenwertMode === 'perSqm' && !hasCompleteBodenrichtwert;
  const currentSollzins = sensSollzins !== null ? sensSollzins : active.finanzierung.sollzinsPct;
  const currentLeerstand = sensLeerstand !== null ? sensLeerstand : active.miete.leerstandPct;
  const baseWertRule = active.wertentwicklung.szenario.find(r => r.kind === 'rate');
  const baseWert = baseWertRule ? baseWertRule.percentPerYear : 0;
  const currentWert = sensWert !== null ? sensWert : baseWert;
  const currentAnschluss = sensAnschluss !== null ? sensAnschluss : active.finanzierung.anschlusszinsPct;
  const metrics = useMemo(() => calculateMetrics(active, proj), [active, proj]);
  const exitRes = useMemo(() => calculateExit(active, proj), [active, proj]);
  const holdingAnalysis = useMemo(
    () => activeTab === 'holding' || activeTab === 'dashboard'
      ? analyzeHoldingPeriods(active)
      : {
          initialEquity: proj.initialEquity,
          years: [],
          breakEvenJahr: null,
          besteExitJahrNachIrr: null,
          steuerfreiAbJahr: 11,
        },
    [active, activeTab, proj.initialEquity]
  );
  const bestIrrExitYear = useMemo(
    () => holdingAnalysis.years.find((y) => y.jahr === holdingAnalysis.besteExitJahrNachIrr) ?? null,
    [holdingAnalysis]
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
          const wirksamAbMonat = 'wirksamAbMonat' in updatedFields
            ? updatedFields.wirksamAbMonat
            : ('wirksamAbMonat' in current ? current.wirksamAbMonat : undefined);
          d.miete.steigerungen[idx] = {
            id,
            kind: 'step',
            fromYear: clampTimelineYear(updatedFields.fromYear ?? current.fromYear),
            percent: clampTimelinePercent(percent ?? 1.0),
            ...(wirksamAbMonat !== undefined
              ? { wirksamAbMonat: clampIntegerInRange(wirksamAbMonat, 1, 12) }
              : {}),
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

  const handleAddSanierung = () => {
    updateActive((d) => {
      const maxYear = d.sanierungen.reduce((max, massnahme) => Math.max(max, massnahme.jahr), 0);
      d.sanierungen.push({
        id: crypto.randomUUID(),
        bezeichnung: 'Neue Sanierung',
        jahr: clampIntegerInRange(maxYear > 0 ? maxYear + 1 : 1, 1, 40),
        betrag: 0,
        steuerart: 'keine',
        verteilungsJahre: 2,
        mieterhoehungMoeglich: false,
      });
    });
  };

  const handleUpdateSanierung = (id: string, fields: Partial<Sanierungsmassnahme>) => {
    updateActive((d) => {
      const massnahme = d.sanierungen.find((item) => item.id === id);
      if (!massnahme) return;

      Object.assign(massnahme, fields);
      massnahme.jahr = clampIntegerInRange(massnahme.jahr, 1, 40);
      massnahme.betrag = Math.max(0, massnahme.betrag);
      massnahme.verteilungsJahre = clampIntegerInRange(massnahme.verteilungsJahre, 2, 5);
    });
  };

  const handleDeleteSanierung = (id: string) => {
    updateActive((d) => {
      d.sanierungen = d.sanierungen.filter((massnahme) => massnahme.id !== id);
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
  const rentBase = annualBaseRent(active) / 12;
  
  const rentChartData = useMemo(() => {
    const rentSeries = projectSeries(rentBase, active.miete.steigerungen, active.exit.haltedauerJahre);
    return rentSeries.map((val, idx) => ({
      Jahr: idx + 1,
      Miete: val,
    }));
  }, [rentBase, active.miete.steigerungen, active.exit.haltedauerJahre]);

  const rentRuleResults = useMemo(
    () => calculateRentRuleResults(
      rentBase,
      active.objekt.wohnflaeche,
      active.miete.steigerungen
    ),
    [rentBase, active.objekt.wohnflaeche, active.miete.steigerungen]
  );

  const sanierungsSumme = useMemo(
    () => active.sanierungen.reduce((sum, massnahme) => sum + massnahme.betrag, 0),
    [active.sanierungen]
  );

  const mieterhoehungsHinweise = useMemo(
    () => active.sanierungen
      .filter((massnahme) => massnahme.mieterhoehungMoeglich)
      .sort((a, b) => a.jahr - b.jahr || a.bezeichnung.localeCompare(b.bezeichnung, 'de')),
    [active.sanierungen]
  );

  const mietspiegelAssessment = useMemo(
    () => assessRentAgainstMietspiegel(
      active.miete.kaltmieteProSqm,
      active.miete.mietspiegel
    ),
    [active.miete.kaltmieteProSqm, active.miete.mietspiegel]
  );

  const mietspiegelChartValues = useMemo(() => {
    if (
      mietspiegelAssessment.status === 'incomplete' ||
      mietspiegelAssessment.status === 'invalid' ||
      !Number.isFinite(active.objekt.wohnflaeche) ||
      active.objekt.wohnflaeche <= 0
    ) {
      return null;
    }

    const createValue = (label: string, proSqm: number, color: string) => {
      const roundedProSqm = rentPerSqmInCents(proSqm) / 100;
      return {
        label,
        proSqm: roundedProSqm,
        totalProMonat: roundedProSqm * active.objekt.wohnflaeche,
        color,
      };
    };

    return {
      lower: createValue(
        'Unterer Spannwert',
        active.miete.mietspiegel.untererSpannwertProSqm,
        '#0f766e'
      ),
      mean: createValue(
        'Mittelwert',
        active.miete.mietspiegel.mittelwertProSqm,
        '#7c3aed'
      ),
      upper: createValue(
        'Oberer Spannwert',
        active.miete.mietspiegel.obererSpannwertProSqm,
        '#e11d48'
      ),
    };
  }, [active.objekt.wohnflaeche, active.miete.mietspiegel, mietspiegelAssessment.status]);

  const mietspiegelStatusView = useMemo(() => {
    const rent = formatNumber(active.miete.kaltmieteProSqm, 2);
    const lower = formatNumber(active.miete.mietspiegel.untererSpannwertProSqm, 2);
    const upper = formatNumber(active.miete.mietspiegel.obererSpannwertProSqm, 2);

    switch (mietspiegelAssessment.status) {
      case 'within':
        return {
          title: 'Im Spannbereich',
          description: `${rent} €/m² liegt innerhalb von ${lower} bis ${upper} €/m².`,
          className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
          icon: 'success',
        };
      case 'below':
        return {
          title: 'Unterhalb des Spannbereichs',
          description: `${rent} €/m² liegt unter dem unteren Spannwert von ${lower} €/m².`,
          className: 'border-sky-200 bg-sky-50 text-sky-800',
          icon: 'info',
        };
      case 'above':
        return {
          title: 'Oberhalb des Spannbereichs',
          description: `${rent} €/m² liegt über dem oberen Spannwert von ${upper} €/m².`,
          className: 'border-rose-200 bg-rose-50 text-rose-800',
          icon: 'warning',
        };
      case 'invalid':
        return {
          title: 'Mietspiegelwerte prüfen',
          description: 'Erwartete Reihenfolge: unterer Spannwert ≤ Mittelwert ≤ oberer Spannwert.',
          className: 'border-amber-200 bg-amber-50 text-amber-800',
          icon: 'warning',
        };
      case 'incomplete':
      default:
        return {
          title: 'Mietspiegelwerte vervollständigen',
          description: 'Bitte unteren Spannwert, Mittelwert und oberen Spannwert eingeben.',
          className: 'border-slate-200 bg-slate-50 text-slate-700',
          icon: 'info',
        };
    }
  }, [active.miete.kaltmieteProSqm, active.miete.mietspiegel, mietspiegelAssessment.status]);

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
    const list: Array<{ message: string; severity: 'warning' | 'danger' }> = [];
    const firstYearCf = proj.years[0]?.cashflowNachSteuerMonatlich ?? 0;
    if (firstYearCf < 0) {
      list.push({
        message: `Monatlicher Cashflow ist im ersten Jahr negativ (${formatEUR(firstYearCf)}/Monat). Sie müssen monatlich Geld zuschießen.`,
        severity: 'danger',
      });
    }
    const maxLtv = Math.max(...proj.years.map(y => y.ltv));
    if (maxLtv > 100) {
      list.push({
        message: `Sehr hohe Fremdkapitalquote (LTV max. ${formatPercent(maxLtv)}). Das Risiko für eine Zinsänderung oder Unterdeckung ist erhöht.`,
        severity: 'danger',
      });
    }
    if (active.exit.haltedauerJahre <= 10) {
      list.push({
        message: `Haltedauer von ${active.exit.haltedauerJahre} J. wird im vereinfachten Jahresraster innerhalb der 10-Jahres-Frist behandelt (§23 EStG: „nicht mehr als zehn Jahre"). ${exitRes.spekulationssteuer > 0 ? `Die geschätzte Spekulationssteuer beträgt hier ${formatEUR(exitRes.spekulationssteuer)}.` : 'Im aktuellen Szenario fällt dennoch keine geschätzte Spekulationssteuer an.'} Im konservativen Jahresraster ist der Exit ab Jahr 11 steuerfrei; exakte Kauf- und Verkaufsvertragsdaten bitte separat prüfen.`,
        severity: 'warning',
      });
    }
    const firstYearReserve = proj.years[0]?.ruecklagenZufuehrung ?? 0;
    if (
      firstYearReserve > 0
      && (active.kosten.ruecklagenRestwertPct ?? 0) === 0
      && kostenErfassungMode === 'detailliert'
    ) {
      list.push({
        message: `Von den Instandhaltungskosten werden im ersten Jahr ${formatEUR(firstYearReserve)} als nicht sofort abziehbare Rücklage/Reserve behandelt. Die Quote erhöht den Cash-Abfluss nicht zusätzlich. Mit 0 % Rücklagen-Preiswirkung und ohne modellierte Entnahmen unterstellt die Rechnung konservativ weder einen Preisaufschlag beim Exit noch einen späteren Steuerabzug.`,
        severity: 'warning',
      });
    }
    const endRestschuld = exitRes.restschuld;
    if (endRestschuld > 0 && active.exit.haltedauerJahre >= active.finanzierung.zinsbindungJahre) {
      list.push({
        message: `Restschuld nach Zinsbindung (${formatEUR(endRestschuld)}) ist vom Anschlusszins abhängig. Ein Anstieg der Zinsen erhöht die Annuität.`,
        severity: 'warning',
      });
    }
    return list;
  }, [proj, active, active.exit.haltedauerJahre, active.finanzierung.zinsbindungJahre, exitRes, kostenErfassungMode]);

  // Chart data mappings for Recharts
  const cashflowChartData = useMemo(() => {
    return proj.years.map(y => {
      const costsVal = -y.bewirtschaftungskosten;
      const taxVal = -y.steuereffekt; // positive means savings, negative means payment
      return {
        Jahr: `J. ${y.jahr}`,
        Miete: Math.round(y.nettoKaltmiete),
        Zins: Math.round(-y.zins),
        Tilgung: Math.round(-y.tilgung),
        Kosten: Math.round(costsVal),
        Sanierung: Math.round(-y.sanierungsauszahlung),
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
        bundesland: 'SN',
        objektTyp: 'bestand',
        bodenwertMode: 'perSqm',
        bodenwertAnteilPct: 0,
        bodenrichtwertProSqm: 1500,
        sanierungskosten: 0,
      },
      finanzierung: {
        equityMode: 'percent',
        equityPct: 0,
        equityAbsolute: 0,
        sollzinsPct: 4.0,
        tilgungPct: 2.0,
        zinsbindungJahre: 10,
        anschlusszinsPct: 4.0,
        anschlussTilgungPct: null,
        sondertilgungProJahr: 0,
        disagioPct: 0,
      },
      miete: {
        rentMode: 'perMonth',
        kaltmieteProMonat: 0,
        kaltmieteProJahr: 0,
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

  const dismissSaveToast = useCallback(() => setSaveToast(null), []);
  const dismissSyncError = useCallback(() => {
    useScenarioStore.setState({ syncError: null });
  }, []);

  const requestConfirm = (options: {
    title: string;
    message: string;
    confirmLabel: string;
    tone?: 'primary' | 'danger';
  }) =>
    new Promise<boolean>((resolve) => {
      setConfirmRequest({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        tone: options.tone ?? 'primary',
        resolve,
      });
    });

  const confirmProvisionalAgentSave = async () => {
    if (agentCompleteness.provisional) {
      const proceed = await requestConfirm({
        title: 'Agent-Auswertung noch vorläufig',
        message: `Es gibt noch ${agentCompleteness.requiredOpen} offene Pflichtangaben und ${agentCompleteness.conflicts} Widersprüche. Trotzdem als Szenario speichern?`,
        confirmLabel: 'Trotzdem speichern',
      });
      if (!proceed) return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!await confirmProvisionalAgentSave()) return;
    const overwritesExisting = saved.some((scenario) => scenario.id === active.id);
    if (overwritesExisting) {
      const proceed = await requestConfirm({
        title: 'Szenario überschreiben?',
        message: `Das gespeicherte Szenario "${active.name}" wird mit den aktuellen Eingaben überschrieben. Alle Abschnitte werden dabei gemeinsam gespeichert.`,
        confirmLabel: 'Überschreiben',
        tone: 'danger',
      });
      if (!proceed) return;
    }
    await syncedSave();
    setSaveToast(`Szenario "${active.name}" gespeichert.`);
  };

  const handleSaveAs = async () => {
    const name = prompt('Name für die neue Szenario-Kopie:', `${active.name} (Variante)`);
    if (!name || !name.trim()) return;
    if (!await confirmProvisionalAgentSave()) return;
    updateActive((d) => {
      d.id = crypto.randomUUID();
      d.name = name.trim();
    });
    await syncedSave(name.trim());
    setSaveToast(`Szenario "${name.trim()}" gespeichert.`);
  };

  const handleResetActive = () => {
    if (confirm('Möchten Sie die aktuellen Eingaben wirklich auf das Default-Szenario zurücksetzen?')) {
      resetActive();
    }
  };

  const handleDuplicate = async () => {
    if (!await confirmProvisionalAgentSave()) return;
    updateActive((d) => {
      d.id = crypto.randomUUID();
      d.name = `${d.name} (Kopie)`;
    });
    await syncedSave();
    setSaveToast('Szenario-Kopie gespeichert.');
  };

  const handleRename = async () => {
    const newName = prompt('Geben Sie einen neuen Namen für das Szenario ein:', active.name);
    if (newName && newName.trim() !== '') {
      const isAlreadySaved = saved.some((scenario) => scenario.id === active.id);
      if (isAlreadySaved && !await confirmProvisionalAgentSave()) return;
      updateActive((d) => {
        d.name = newName.trim();
      });
      if (isAlreadySaved) {
        await syncedSave(newName.trim());
        setSaveToast(`Szenario in "${newName.trim()}" umbenannt.`);
      }
    }
  };

  const handleDelete = async () => {
    if (saved.length === 0) {
      alert('Es gibt keine gespeicherten Szenarien zum Löschen.');
      return;
    }
    if (confirm(`Möchten Sie das Szenario "${active.name}" wirklich löschen?`)) {
      await syncedDelete(active.id);
      const remaining = useScenarioStore.getState().saved;
      if (remaining.length > 0) {
        loadSaved(remaining[0].id);
      } else {
        resetActive();
      }
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const stageAgentDraft = useCallback((draft: unknown) => {
    const scenario = materializeAgentDraft(draft);
    setPendingAgentScenario(scenario);
    return {
      scenarioId: scenario.id,
      name: scenario.name,
      completeness: getAgentCompleteness(scenario.agentReview),
      status: 'staged' as const,
    };
  }, []);

  const refreshRemoteAgentDrafts = useCallback(async () => {
    const boundUserId = user?.id;
    if (!boundUserId || scenarioOwnerUserId !== boundUserId) {
      setRemoteAgentDrafts([]);
      return;
    }

    setIsLoadingAgentDrafts(true);
    setAgentDraftInboxError(null);
    try {
      const drafts = await pullAgentDrafts(boundUserId);
      const authUserId = useAuthStore.getState().user?.id;
      const ownerUserId = useScenarioStore.getState().ownerUserId;
      if (authUserId === boundUserId && ownerUserId === boundUserId) {
        setRemoteAgentDrafts(drafts);
      }
    } catch {
      if (
        useAuthStore.getState().user?.id === boundUserId
        && useScenarioStore.getState().ownerUserId === boundUserId
      ) {
        setRemoteAgentDrafts([]);
        setAgentDraftInboxError('Die MCP-Draft-Inbox ist noch nicht eingerichtet oder momentan nicht erreichbar.');
      }
    } finally {
      if (useAuthStore.getState().user?.id === boundUserId) {
        setIsLoadingAgentDrafts(false);
      }
    }
  }, [scenarioOwnerUserId, user?.id]);

  useEffect(() => {
    setRemoteAgentDrafts([]);
    setAgentDraftInboxError(null);
  }, [scenarioOwnerUserId, user?.id]);

  const handleRemoveRemoteAgentDraft = async (draft: RemoteAgentDraft) => {
    if (!user?.id || scenarioOwnerUserId !== user.id) return;
    const confirmed = await requestConfirm({
      title: 'Agent-Draft aus Inbox entfernen?',
      message: 'Der Entwurf wird nur aus Ihrer MCP-Inbox gelöscht. Bereits gespeicherte Szenarien bleiben unverändert.',
      confirmLabel: 'Draft entfernen',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteRemoteAgentDraft(user.id, draft.id);
      setRemoteAgentDrafts((current) => current.filter((item) => item.id !== draft.id));
    } catch {
      setAgentDraftInboxError('Der Agent-Draft konnte nicht entfernt werden.');
    }
  };

  const handleOpenAgentDraft = async () => {
    if (!pendingAgentScenario) return;
    const confirmed = await requestConfirm({
      title: 'Agent-Entwurf öffnen?',
      message: `Der Entwurf "${pendingAgentScenario.name}" ersetzt die aktuell sichtbaren, möglicherweise noch nicht gespeicherten Eingaben. Der Entwurf selbst wird dabei noch nicht gespeichert.`,
      confirmLabel: 'Entwurf öffnen',
    });
    if (!confirmed) return;
    setActive(pendingAgentScenario);
    setPendingAgentScenario(null);
    setAgentEditEnabled(true);
    setOpenSection('objekt');
  };

  const handleConfirmAgentField = (path: string) => {
    updateActive((draft) => confirmAgentField(draft, path));
  };

  const handleNavigateToAgentField = (path: string, section?: string) => {
    if (section) setOpenSection(section);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const frame = document.querySelector<HTMLElement>(`[data-agent-path="${path}"]`);
      const sectionElement = section
        ? document.querySelector<HTMLElement>(`[data-agent-section="${section}"]`)
        : null;
      const target = frame ?? sectionElement;
      target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      const control = frame?.querySelector<HTMLElement>('input, select, textarea, button')
        ?? sectionElement?.querySelector<HTMLElement>('.border-t input, .border-t select, .border-t textarea, .border-t button');
      control?.focus();
    }));
  };

  const handleExportAgentSnapshot = () => {
    const json = JSON.stringify(createAgentSnapshot(active), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${active.name.toLowerCase().replace(/\s+/g, '_')}_agent_snapshot.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!browserAgentApiEnabled || !user?.id || scenarioOwnerUserId !== user.id) {
      delete window.immoCheckerAgent;
      return;
    }

    const boundUserId = user.id;
    const assertBoundAccount = () => {
      const currentUserId = useAuthStore.getState().user?.id;
      const ownerUserId = useScenarioStore.getState().ownerUserId;
      if (currentUserId !== boundUserId || ownerUserId !== boundUserId) {
        throw new Error('Agent-Verbindung ist nicht mehr für das angemeldete Konto gültig.');
      }
    };
    const api = {
      getCapabilities: () => {
        assertBoundAccount();
        return getAgentCapabilities();
      },
      listScenarios: () => {
        assertBoundAccount();
        const state = useScenarioStore.getState();
        return [state.active, ...state.saved.filter((scenario) => scenario.id !== state.active.id)]
          .map((scenario) => ({ id: scenario.id, name: scenario.name }));
      },
      getScenario: (scenarioId: string) => {
        assertBoundAccount();
        const state = useScenarioStore.getState();
        const scenario = scenarioId === state.active.id
          ? state.active
          : state.saved.find((candidate) => candidate.id === scenarioId);
        if (!scenario) throw new Error('Szenario ist in diesem angemeldeten Konto nicht verfügbar.');
        return createAgentSnapshot(scenario);
      },
      stageDraft: (draft: unknown) => {
        assertBoundAccount();
        return stageAgentDraft(draft);
      },
    };
    window.immoCheckerAgent = api;
    window.dispatchEvent(new CustomEvent('immo-checker-agent-ready'));

    return () => {
      if (window.immoCheckerAgent === api) delete window.immoCheckerAgent;
    };
  }, [browserAgentApiEnabled, scenarioOwnerUserId, stageAgentDraft, user?.id]);

  if (!user?.id || scenarioOwnerUserId !== user.id || isSyncing) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-500">Szenarien werden geladen...</p>
        </div>
      </div>
    );
  }

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
        const raw = JSON.parse(text) as unknown;
        if (isAgentDraft(raw)) {
          const staged = stageAgentDraft(text);
          alert(`Agent-Entwurf "${staged.name}" wurde geprüft und bereitgestellt. Er ist noch nicht gespeichert.`);
          return;
        }
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
            if (user?.id) pushScenarios(user.id, imported).catch(() => {});
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
          if (user?.id) pushScenarios(user.id, [imported]).catch(() => {});
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
    <div className="min-h-screen bg-slate-100 text-slate-800 antialiased">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-md no-print">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
              <Building2 size={20} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                Immobilien-Investment-Checker
              </h1>
              <p className="text-xs font-medium text-slate-500">
                Kapitalanlage-Rechner für private Anleger in Deutschland
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
            {isSyncing && (
              <span className="text-xs font-semibold text-blue-700 animate-pulse">Sync...</span>
            )}
            <span className="text-[11px] font-medium text-slate-400 hidden sm:inline truncate max-w-[160px]">
              {user?.email}
            </span>
            {profile?.is_admin && (
              <button
                onClick={() => setShowAdmin(true)}
                className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer shadow-2xs"
              >
                Admin
              </button>
            )}
            <button
              onClick={handleResetActive}
              className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer shadow-2xs"
            >
              Zurücksetzen
            </button>
            <button
              onClick={signOut}
              className="whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer shadow-2xs"
            >
              Abmelden
            </button>
          </div>
        </div>
      </header>

      {showAdmin && profile?.is_admin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}

      <AgentDraftDialog
        open={showAgentDraftDialog}
        onClose={() => setShowAgentDraftDialog(false)}
        onDraftReady={stageAgentDraft}
      />

      {user?.id && (
        <AgentConnectionsDialog
          open={showAgentConnections}
          userId={user.id}
          onClose={() => setShowAgentConnections(false)}
        />
      )}

      {confirmRequest && (
        <ConfirmDialog
          open
          title={confirmRequest.title}
          message={confirmRequest.message}
          confirmLabel={confirmRequest.confirmLabel}
          tone={confirmRequest.tone}
          onConfirm={() => {
            confirmRequest.resolve(true);
            setConfirmRequest(null);
          }}
          onCancel={() => {
            confirmRequest.resolve(false);
            setConfirmRequest(null);
          }}
        />
      )}

      {saveToast ? (
        <Toast message={saveToast} onDismiss={dismissSaveToast} />
      ) : syncError ? (
        <Toast
          message={syncError}
          onDismiss={dismissSyncError}
          durationMs={null}
          tone="warning"
        />
      ) : null}

      {/* Main Grid */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8 space-y-6">
        
        {/* Scenario Toolbar */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xs no-print">
          {/* Row 1: Scenario name + selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 shrink-0">Szenario:</span>
              <span className="font-extrabold text-slate-800 text-sm truncate">{active.name}</span>
              <button
                onClick={handleRename}
                className="text-[11px] text-slate-500 hover:text-slate-800 underline font-semibold transition cursor-pointer shrink-0"
              >
                Umbenennen
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-500 cursor-pointer min-w-0"
              >
                <option value={active.id}>{active.name} (Aktuell)</option>
                {saved.filter(s => s.id !== active.id).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                <option value="new">+ Neues Szenario anlegen</option>
              </select>
              <button
                onClick={handleSave}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white transition cursor-pointer shadow-2xs shrink-0"
              >
                Speichern
              </button>
              <button
                onClick={handleSaveAs}
                className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs shrink-0"
              >
                Speichern unter...
              </button>
            </div>
          </div>
          {/* Row 2: Actions */}
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
            <button
              onClick={handleDuplicate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
            >
              <Copy size={13} className="text-slate-400" />
              Duplizieren
            </button>
            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-100 bg-rose-50/50 hover:bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition cursor-pointer"
            >
              <Trash2 size={13} className="text-rose-400" />
              Löschen
            </button>

            <div className="h-4 w-[1px] bg-slate-200 mx-0.5"></div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={handleImportClick}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
              title="Szenario(s) aus JSON-Datei importieren"
            >
              <Upload size={13} className="text-slate-400" />
              Import
            </button>
            <button
              onClick={() => setShowAgentDraftDialog(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700 transition cursor-pointer"
              title="Strukturierten Agent-Entwurf prüfen und zunächst nur bereitstellen"
            >
              <Upload size={13} className="text-blue-500" />
              Agent-Entwurf
            </button>
            <button
              type="button"
              onClick={() => void refreshRemoteAgentDrafts()}
              disabled={isLoadingAgentDrafts}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 text-xs font-bold text-violet-800 transition cursor-pointer disabled:cursor-wait disabled:opacity-60"
              title="Eigene, über MCP erstellte Agent-Drafts dieses Kontos abrufen"
            >
              <Download size={13} className="text-violet-500" />
              {isLoadingAgentDrafts ? 'MCP-Inbox lädt…' : `MCP-Inbox${remoteAgentDrafts.length > 0 ? ` (${remoteAgentDrafts.length})` : ''}`}
            </button>
            <button
              type="button"
              onClick={() => setShowAgentConnections(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white hover:bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-800 transition cursor-pointer"
              title="OAuth- und Immo-MCP-Verbindungen dieses Kontos verwalten"
            >
              Agent-Verbindungen
            </button>
            <button
              onClick={handleExportAgentSnapshot}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
              title="Eingaben und berechnete Auswertung als Agent-Snapshot exportieren"
            >
              <Download size={13} className="text-slate-400" />
              Agent-Snapshot
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={browserAgentApiEnabled}
              aria-label="Browser-Agent-Verbindung"
              onClick={() => setBrowserAgentApiEnabled((enabled) => !enabled)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${browserAgentApiEnabled ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              title="Kontogebundene Browser-Agent-API nur für diesen angemeldeten Tab aktivieren"
            >
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${browserAgentApiEnabled ? 'bg-violet-500' : 'bg-slate-300'}`} />
              Browser-Agent
            </button>
            <button
              onClick={handleExportJSON}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
              title="Aktuelles Szenario als JSON-Datei exportieren"
            >
              <Download size={13} className="text-slate-400" />
              Export
            </button>
            {saved.length > 0 && (
              <button
                onClick={handleExportAllJSON}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
                title="Alle gespeicherten Szenarien als JSON-Bulk exportieren"
              >
                <Download size={13} className="text-slate-400" />
                Alle exportieren
              </button>
            )}

            <div className="h-4 w-[1px] bg-slate-200 mx-0.5"></div>

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
              title="Jahrestabelle als CSV (Excel-kompatibel) exportieren"
            >
              <FileSpreadsheet size={13} className="text-slate-400" />
              CSV
            </button>
            <button
              onClick={handlePrintPDF}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
              title="Ergebnisse als PDF drucken / speichern"
            >
              <Printer size={13} className="text-slate-400" />
              PDF drucken
            </button>
          </div>
        </div>

        {(remoteAgentDrafts.length > 0 || agentDraftInboxError) && (
          <section className="no-print rounded-xl border border-violet-200 bg-white px-4 py-3 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Eigene MCP-Draft-Inbox</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Nur Entwürfe des aktuell angemeldeten Kontos. Prüfen öffnet zunächst den sicheren Zwischenstand.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshRemoteAgentDrafts()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Aktualisieren
              </button>
            </div>
            {agentDraftInboxError && (
              <p role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                {agentDraftInboxError}
              </p>
            )}
            {remoteAgentDrafts.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100" aria-label="MCP-Agent-Drafts">
                {remoteAgentDrafts.map((draft) => {
                  const data = draft.data && typeof draft.data === 'object'
                    ? draft.data as Record<string, unknown>
                    : null;
                  const name = typeof data?.name === 'string' ? data.name : 'Unbenannter Agent-Draft';
                  return (
                    <li key={draft.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">Revision {draft.revision} · zuletzt aktualisiert {new Date(draft.updatedAt).toLocaleString('de-DE')}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              stageAgentDraft(draft.data);
                              setAgentDraftInboxError(null);
                            } catch {
                              setAgentDraftInboxError('Dieser Agent-Draft ist ungültig und kann nicht bereitgestellt werden.');
                            }
                          }}
                          className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800"
                        >
                          Prüfen
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRemoveRemoteAgentDraft(draft)}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                        >
                          Entfernen
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {pendingAgentScenario && (
          <section
            role="status"
            className="no-print rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 shadow-2xs"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-bold text-blue-950">Agent-Entwurf bereit: {pendingAgentScenario.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-blue-800">
                  Der Entwurf wurde validiert, aber noch nicht geöffnet oder gespeichert. Ihr aktuelles Szenario bleibt unverändert.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPendingAgentScenario(null)}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100"
                >
                  Verwerfen
                </button>
                <button
                  type="button"
                  onClick={handleOpenAgentDraft}
                  className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800"
                >
                  Entwurf öffnen
                </button>
              </div>
            </div>
          </section>
        )}

        <AgentEditProvider
          enabled={agentEditEnabled}
          review={active.agentReview}
          onEnabledChange={setAgentEditEnabled}
          onConfirmField={handleConfirmAgentField}
          onNavigateToField={handleNavigateToAgentField}
        >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          
          {/* Left Column: Inputs (9 Sektionen Accordion) */}
          <div className="lg:col-span-5 space-y-4 no-print">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Parameter & Eingaben</h2>
            <AgentReviewPanel />

            {/* SEKTION 1: Objekt & Kaufpreis */}
            <div data-agent-section="objekt" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('objekt')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                  <span className={`row-span-2 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-colors ${openSection === 'objekt' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>1</span>
                  <span>Objekt & Kaufpreis</span>
                  {openSection !== 'objekt' && active.objekt.kaufpreis > 0 && (
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {formatEUR(active.objekt.kaufpreis)} · {formatNumber(active.objekt.wohnflaeche, 0)} m² · {active.objekt.fertigstellungsjahr}
                    </span>
                  )}
                </div>
                <span className={`transform transition-transform duration-200 ${openSection === 'objekt' ? 'rotate-180' : ''}`}>
                  <ChevronDown size={16} className="text-slate-400" />
                </span>
              </button>
              {openSection === 'objekt' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <AgentFieldFrame path="/objekt/kaufpreis">
                  <NumberInput
                    label="Kaufpreis (€)"
                    value={active.objekt.kaufpreis}
                    suffix="EUR"
                    min={1}
                    onChange={(val) => updateActive((d) => {
                      d.objekt.kaufpreis = val;
                    })}
                  />
                  </AgentFieldFrame>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AgentFieldFrame path="/objekt/wohnflaeche">
                    <NumberInput
                      label="Wohnfläche (m²)"
                      value={active.objekt.wohnflaeche}
                      min={1}
                      onChange={(val) => updateActive((d) => {
                        d.objekt.wohnflaeche = val;
                        syncRentForMode(d, d.miete.rentMode);
                      })}
                    />
                    </AgentFieldFrame>
                    <AgentFieldFrame path="/objekt/fertigstellungsjahr">
                    <NumberInput
                      label="Baujahr / Fertigstellung"
                      value={active.objekt.fertigstellungsjahr}
                      suffix="plain"
                      min={1}
                      max={2100}
                      onChange={(val) => updateActive((d) => {
                        const year = clampIntegerInRange(val, 1, 2100);
                        d.objekt.fertigstellungsjahr = year;
                        // Der lineare Satz ist Basis aller AfA-Modi (auch Denkmal-Altbau,
                        // Degressiv-Wechsel und §7b), daher immer aus dem Baujahr ableiten.
                        d.afa.linearSatzPct = linearAfaRateForYear(year);
                      })}
                    />
                    </AgentFieldFrame>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AgentFieldFrame path="/objekt/objektTyp">
                    <Select
                      id="objekt-typ"
                      label="Objekttyp"
                      value={active.objekt.objektTyp}
                      onChange={(e) => {
                        const t = e.target.value as ObjektTyp;
                        updateActive((d) => {
                          d.objekt.objektTyp = t;
                          if (t === 'denkmal') {
                            d.afa.modus = 'denkmal7i';
                            d.afa.linearSatzPct = linearAfaRateForYear(d.objekt.fertigstellungsjahr);
                          } else if (d.afa.modus === 'denkmal7i') {
                            d.afa.modus = 'linear';
                            d.afa.linearSatzPct = linearAfaRateForYear(d.objekt.fertigstellungsjahr);
                          }
                        });
                      }}
                      options={[
                        { value: 'bestand', label: 'Bestand' },
                        { value: 'neubau', label: 'Neubau' },
                        { value: 'denkmal', label: 'Denkmal' },
                      ]}
                    />
                    </AgentFieldFrame>
                    <div className="flex flex-col justify-end space-y-2">
                      <AgentFieldFrame path="/objekt/bodenwertMode">
                      <Tabs
                        activeTab={active.objekt.bodenwertMode}
                        onChange={(id) => updateActive((d) => {
                          d.objekt.bodenwertMode = id as BodenwertMode;
                        })}
                        tabs={[
                          { id: 'percent', label: 'Boden %' },
                          { id: 'perSqm', label: 'EUR/m²' },
                        ]}
                      />
                      </AgentFieldFrame>
                      {active.objekt.bodenwertMode === 'percent' ? (
                        <AgentFieldFrame path="/objekt/bodenwertAnteilPct">
                        <Slider
                          label="Bodenwertanteil (%)"
                          value={active.objekt.bodenwertAnteilPct}
                          onChange={(val) => updateActive((d) => { d.objekt.bodenwertAnteilPct = val; })}
                          min={0}
                          max={100}
                          suffix="%"
                        />
                        </AgentFieldFrame>
                      ) : (
                        <>
                        <AgentFieldFrame path="/objekt/bodenrichtwertProSqm">
                        <NumberInput
                          label="Bodenrichtwert (€/m²)"
                          value={active.objekt.bodenrichtwertProSqm}
                          suffix="EUR/m²"
                          min={0}
                          onChange={(val) => updateActive((d) => { d.objekt.bodenrichtwertProSqm = val; })}
                        />
                        </AgentFieldFrame>
                        <AgentFieldFrame path="/objekt/grundstuecksflaeche">
                        <NumberInput
                          label="Grundstück gesamt (m²)"
                          value={active.objekt.grundstuecksflaeche}
                          min={0}
                          onChange={(val) => updateActive((d) => { d.objekt.grundstuecksflaeche = val; })}
                        />
                        </AgentFieldFrame>
                        <div className="grid grid-cols-2 gap-2">
                          <AgentFieldFrame path="/objekt/miteigentumsanteilZaehler">
                          <NumberInput
                            label="MEA – Ihr Anteil"
                            value={active.objekt.miteigentumsanteilZaehler}
                            suffix="plain"
                            min={0}
                            onChange={(val) => updateActive((d) => {
                              d.objekt.miteigentumsanteilZaehler = Math.max(0, val);
                            })}
                          />
                          </AgentFieldFrame>
                          <AgentFieldFrame path="/objekt/miteigentumsanteilNenner">
                          <NumberInput
                            label="MEA – Objekt gesamt"
                            value={active.objekt.miteigentumsanteilNenner}
                            suffix="plain"
                            min={0}
                            onChange={(val) => updateActive((d) => {
                              d.objekt.miteigentumsanteilNenner = Math.max(0, val);
                            })}
                          />
                          </AgentFieldFrame>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-snug">
                          Maßgeblich für den <strong>MEA (Miteigentumsanteil)</strong> sind Teilungserklärung und
                          Grundbuchauszug (Bestandsverzeichnis). Häufig steht er zusätzlich in der Hausgeld-/WEG-Abrechnung
                          unter „Verteilungsbasis Miteigentumsanteile“: „Ihr Anteil“ / „Objekt“ (z. B. 57 / 1.000).
                        </p>
                        {hasValidPlotShare ? (
                          <p className="text-[10px] text-slate-500 leading-snug">
                            Anteilige Grundstücksfläche: <strong className="text-slate-700">{formatNumber(bodenwertFlaeche(active), 1)} m²</strong>
                            {' '}(Grundstück × MEA {formatNumber(active.objekt.miteigentumsanteilZaehler, 0)}/{formatNumber(active.objekt.miteigentumsanteilNenner, 0)}).
                            {active.objekt.miteigentumsanteilZaehler === 1 && active.objekt.miteigentumsanteilNenner === 1
                              ? ' 1/1 bedeutet Alleineigentum; bei einer Eigentumswohnung bitte durch den tatsächlichen MEA ersetzen.'
                              : ''}
                          </p>
                        ) : active.objekt.grundstuecksflaeche > 0 ? (
                          <p className="text-[10px] font-medium text-amber-600 leading-snug">
                            Der MEA muss größer als 0 sein und darf „Objekt gesamt“ nicht überschreiten.
                          </p>
                        ) : null}
                        {usesConservativeBodenFallback && (
                          <p className="text-[10px] font-medium text-amber-600 leading-snug">
                            Solange Bodenrichtwert, Grundstücksfläche oder MEA unvollständig sind, rechnet die App
                            konservativ mit <strong>{CONSERVATIVE_BODENWERT_ANTEIL_PCT} % Bodenanteil</strong>. Bereits
                            erfasste Werte bleiben gespeichert und werden automatisch verwendet, sobald alle Angaben vollständig sind.
                          </p>
                        )}
                        </>
                      )}
                      <div className="rounded-lg bg-slate-50 px-3 py-2 text-[10px] font-medium text-slate-500">
                        Bodenwert: <strong className="text-slate-700">{formatEUR(effectiveBodenwert)}</strong>
                        {' '}= <strong className="text-slate-700">{formatPercent(effectiveBodenwertPct, 2)}</strong> vom Kaufpreis.
                        {usesConservativeBodenFallback ? ' (konservativer Fallback)' : ''}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                        Anteil des Grundstückswerts am Kaufpreis — nur das Gebäude ist abschreibbar (AfA).
                        Im EUR/m²-Modus: Bodenwert = Bodenrichtwert × anteilige Grundstücksfläche (Grundstück × MEA).
                      </p>
                      <p className="text-[10px] text-slate-400 leading-snug">
                        <strong>So ermitteln Sie den Bodenrichtwert genau:</strong> Kostenlos im BORIS-Portal Ihres
                        Bundeslandes (zentral: bodenrichtwerte-boris.de, für Sachsen: boris.sachsen.de) — Adresse suchen,
                        die Bodenrichtwertzone für Wohnbaufläche (W) anklicken und den zum <strong>Kauf- bzw.
                        Bewertungsstichtag passenden Wert</strong> übernehmen. Grundstücksfläche und Miteigentumsanteil (MEA, z. B. 57/1000)
                        stehen im <strong>Grundbuchauszug</strong> bzw. in der <strong>Teilungserklärung</strong>.
                        Noch genauer: BMF-Arbeitshilfe „Kaufpreisaufteilung" oder Auskunft des örtlichen Gutachterausschusses.
                      </p>
                    </div>
                  </div>
                  {active.objekt.objektTyp === 'denkmal' && (
                    <>
                      <NumberInput
                        label="Initiale Denkmal-Sanierung beim Kauf"
                        value={active.objekt.sanierungskosten}
                        suffix="EUR"
                        min={0}
                        onChange={(val) => updateActive((d) => { d.objekt.sanierungskosten = val; })}
                      />
                      <p className="text-[10px] text-slate-400 mt-1 leading-snug">
                        Dieser Topf gehört zum Erwerb und zur anfänglichen Finanzierung. Spätere Maßnahmen bitte ausschließlich im Abschnitt „Sanierungen &amp; Modernisierungen“ erfassen, damit Kosten nicht doppelt angesetzt werden.<br />
                        Kosten für denkmalgerechte Sanierung, die nach §7i EStG abgeschrieben werden können (9 % × 8 Jahre + 7 % × 4 Jahre).
                        Hierzu zählen z. B. Dach, Fassade, Fenster, Heizung, Elektrik — sofern von der Denkmalschutzbehörde bescheinigt.
                        Nicht absetzbar: Kaufpreis, Grundstücksanteil, Eigenleistungen, reine Modernisierung ohne Denkmal-Bezug.
                      </p>
                    </>
                  )}
                  <SectionSaveButton onSave={handleSave} />
                </div>
              )}
            </div>

            {/* SEKTION 2: Kaufnebenkosten */}
            <div data-agent-section="knk" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('knk')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                  <span className={`row-span-2 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-colors ${openSection === 'knk' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>2</span>
                  <span>Kaufnebenkosten (KNK)</span>
                  {openSection !== 'knk' && (
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {formatEUR(knkAmount(active))} ({formatPercent(active.knk.grestPct + active.knk.notarPct + active.knk.maklerPct, 2)})
                    </span>
                  )}
                </div>
                <span className={`transform transition-transform duration-200 ${openSection === 'knk' ? 'rotate-180' : ''}`}>
                  <ChevronDown size={16} className="text-slate-400" />
                </span>
              </button>
              {openSection === 'knk' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <AgentFieldFrame path="/objekt/bundesland">
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
                  </AgentFieldFrame>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                    label="KNK fremdfinanzieren?"
                    description="Wenn aktiv, wird der gewählte Anteil der Kaufnebenkosten ins Darlehen aufgenommen"
                    checked={active.knk.mitfinanzieren}
                    onChange={(val) => updateActive((d) => {
                      d.knk.mitfinanzieren = val;
                      d.knk.finanzierungsPct = val ? (d.knk.finanzierungsPct > 0 ? d.knk.finanzierungsPct : 100) : 0;
                    })}
                  />
                  {active.knk.mitfinanzieren && (
                    <Slider
                      label="KNK-Fremdfinanzierung (%)"
                      value={active.knk.finanzierungsPct}
                      onChange={(val) => updateActive((d) => { d.knk.finanzierungsPct = val; })}
                      min={0}
                      max={100}
                      step={1}
                      suffix="%"
                    />
                  )}
                  <div className="rounded-xl bg-slate-50 p-3.5 text-xs text-slate-500 space-y-1 font-medium">
                    <div className="flex justify-between">
                      <span>Kaufnebenkosten gesamt:</span>
                      <span className="font-bold text-slate-700">{formatEUR(knkAmount(active))} ({formatPercent(active.knk.grestPct + active.knk.notarPct + active.knk.maklerPct, 2)})</span>
                    </div>
                    {active.knk.mitfinanzieren && (
                      <div className="flex justify-between">
                        <span>Davon fremdfinanziert:</span>
                        <span className="font-bold text-slate-700">{formatEUR(cashBreakdown.financedKnk)} ({formatPercent(active.knk.finanzierungsPct)})</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Gesamtinvestitionskosten:</span>
                      <span className="font-bold text-slate-700">{formatEUR(totalInvest(active))}</span>
                    </div>
                  </div>
                  <SectionSaveButton onSave={handleSave} />
                </div>
              )}
            </div>

            {/* SEKTION 3: Finanzierung */}
            <div data-agent-section="finanzierung" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('finanzierung')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                  <span className={`row-span-2 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-colors ${openSection === 'finanzierung' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>3</span>
                  <span>Finanzierung</span>
                  {openSection !== 'finanzierung' && (
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {formatEUR(loanAmount(active))} · {formatPercent(active.finanzierung.sollzinsPct)} Zins · {formatPercent(active.finanzierung.tilgungPct)} Tilgung
                    </span>
                  )}
                </div>
                <span className={`transform transition-transform duration-200 ${openSection === 'finanzierung' ? 'rotate-180' : ''}`}>
                  <ChevronDown size={16} className="text-slate-400" />
                </span>
              </button>
              {openSection === 'finanzierung' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <AgentFieldFrame path="/finanzierung/equityMode">
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
                  </AgentFieldFrame>
                  {active.finanzierung.equityMode === 'percent' ? (
                    <AgentFieldFrame path="/finanzierung/equityPct">
                    <Slider
                      label="Eigenkapital auf Kaufpreis + Sanierung (%)"
                      value={active.finanzierung.equityPct}
                      onChange={(val) => updateActive((d) => { d.finanzierung.equityPct = val; })}
                      min={0}
                      max={100}
                      suffix="%"
                    />
                    </AgentFieldFrame>
                  ) : (
                    <AgentFieldFrame path="/finanzierung/equityAbsolute">
                    <NumberInput
                      label="Eigenkapital für Kaufpreis + Sanierung (€)"
                      value={active.finanzierung.equityAbsolute}
                      suffix="EUR"
                      min={0}
                      onChange={(val) => updateActive((d) => { d.finanzierung.equityAbsolute = val; })}
                    />
                    </AgentFieldFrame>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AgentFieldFrame path="/finanzierung/sollzinsPct">
                    <Slider
                      label="Sollzins p. a."
                      value={active.finanzierung.sollzinsPct}
                      onChange={(val) => updateActive((d) => { d.finanzierung.sollzinsPct = val; })}
                      min={0}
                      max={10}
                      step={0.05}
                      suffix="%"
                    />
                    </AgentFieldFrame>
                    <AgentFieldFrame path="/finanzierung/tilgungPct">
                    <Slider
                      label="Anf. Tilgung p. a."
                      value={active.finanzierung.tilgungPct}
                      onChange={(val) => updateActive((d) => { d.finanzierung.tilgungPct = val; })}
                      min={0}
                      max={10}
                      step={0.1}
                      suffix="%"
                    />
                    </AgentFieldFrame>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AgentFieldFrame path="/finanzierung/zinsbindungJahre">
                    <Slider
                      label="Zinsbindung (Jahre)"
                      value={active.finanzierung.zinsbindungJahre}
                      onChange={(val) => updateActive((d) => { d.finanzierung.zinsbindungJahre = val; })}
                      min={1}
                      max={30}
                      step={1}
                    />
                    </AgentFieldFrame>
                    <AgentFieldFrame path="/finanzierung/anschlusszinsPct">
                    <Slider
                      label="Anschlusszins p. a."
                      value={active.finanzierung.anschlusszinsPct}
                      onChange={(val) => updateActive((d) => { d.finanzierung.anschlusszinsPct = val; })}
                      min={0}
                      max={10}
                      step={0.1}
                      suffix="%"
                    />
                    </AgentFieldFrame>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Slider
                      label={`Anschlusstilgung p. a.: ${active.finanzierung.anschlussTilgungPct !== null ? formatPercent(active.finanzierung.anschlussTilgungPct) : 'wie Anfangstilgung'}`}
                      value={active.finanzierung.anschlussTilgungPct ?? active.finanzierung.tilgungPct}
                      onChange={(val) => updateActive((d) => { d.finanzierung.anschlussTilgungPct = val; })}
                      min={0}
                      max={10}
                      step={0.1}
                      suffix="%"
                    />
                    <div className="flex items-end pb-1">
                      {active.finanzierung.anschlussTilgungPct !== null && (
                        <button
                          onClick={() => updateActive((d) => { d.finanzierung.anschlussTilgungPct = null; })}
                          className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 transition cursor-pointer shadow-2xs"
                        >
                          Auf Anfangstilgung zurücksetzen
                        </button>
                      )}
                    </div>
                  </div>
                  {anschlussRateFloor && (
                    <div className={`rounded-lg border px-3 py-2 text-[11px] font-medium leading-snug ${
                      anschlussRateFloor.isFloorActive
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}>
                      {anschlussRateFloor.isFloorActive ? 'Aktuell greift' : 'Unterhalb von'}{' '}
                      <strong>{formatPercent(anschlussRateFloor.thresholdPct, 2)}</strong> Anschlusstilgung bleibt die
                      Anschlussrate mindestens bei der bisherigen Rate von{' '}
                      <strong>{formatEUR(anschlussRateFloor.previousMonthlyRate)}</strong>/Monat. Deshalb ändern niedrigere
                      Werte die Cashflows, Restschuld und Eigenkapitalrendite (IRR) nicht; erst oberhalb dieser Schwelle
                      steigt die Rate.
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      <span>EK für Kaufpreis/Sanierung:</span>
                      <span className="font-bold text-slate-700">{formatEUR(cashBreakdown.enteredEquity)}</span>
                    </div>
                    {cashBreakdown.unfinancedKnkCash > 0 && (
                      <div className="flex justify-between gap-4">
                        <span>Bar gezahlte Kaufnebenkosten:</span>
                        <span className="font-bold text-slate-700 text-right">{formatEUR(cashBreakdown.unfinancedKnkCash)}</span>
                      </div>
                    )}
                    {cashBreakdown.financedKnk > 0 && (
                      <div className="flex justify-between gap-4">
                        <span>Fremdfinanzierte Kaufnebenkosten:</span>
                        <span className="font-bold text-slate-700 text-right">{formatEUR(cashBreakdown.financedKnk)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-4 border-t border-slate-200 pt-1.5 mt-1.5">
                      <span>Barer Kapitaleinsatz:</span>
                      <span className="font-bold text-slate-700 text-right">{formatEUR(cashBreakdown.totalCashInvestment)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Darlehensbetrag:</span>
                      <span className="font-bold text-slate-700">{formatEUR(loanAmount(active))}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span>Darlehenslaufzeit:</span>
                      <span className="font-bold text-slate-700 text-right">{formatLoanTerm(financingSchedule.laufzeitMonate)}</span>
                    </div>
                    <p className="pt-1 text-[10px] leading-snug text-slate-400">
                      Eigenkapital reduziert Kaufpreis und Sanierung direkt. Kaufnebenkosten werden separat bar gezahlt oder anteilig fremdfinanziert.
                    </p>
                  </div>
                  <SectionSaveButton onSave={handleSave} />
                </div>
              )}
            </div>

            {/* SEKTION 4: Miete */}
            <div data-agent-section="miete" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('miete')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                  <span className={`row-span-2 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-colors ${openSection === 'miete' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>4</span>
                  <span>Miete</span>
                  {openSection !== 'miete' && (
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {formatEUR(active.miete.kaltmieteProMonat)}/Monat · {formatEUR(active.miete.kaltmieteProJahr)}/Jahr · {formatNumber(active.miete.kaltmieteProSqm, 2)} €/m²
                      {' · '}{formatPercent(active.miete.leerstandPct)} Leerstand
                    </span>
                  )}
                </div>
                <span className={`transform transition-transform duration-200 ${openSection === 'miete' ? 'rotate-180' : ''}`}>
                  <ChevronDown size={16} className="text-slate-400" />
                </span>
              </button>
              {openSection === 'miete' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <AgentFieldFrame path="/miete/rentMode">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AgentFieldFrame path="/miete/kaltmieteProMonat">
                    <NumberInput
                      label="Monatliche Kaltmiete"
                      value={active.miete.kaltmieteProMonat}
                      suffix="EUR"
                      min={0}
                      fractionDigits={2}
                      onChange={(val) => updateActive((d) => { updateRentFromMonthly(d, val); })}
                    />
                    </AgentFieldFrame>
                    <AgentFieldFrame path="/miete/kaltmieteProJahr">
                    <NumberInput
                      label="Kaltmiete p. a. (Jahr)"
                      value={active.miete.kaltmieteProJahr}
                      suffix="EUR"
                      min={0}
                      fractionDigits={2}
                      onChange={(val) => updateActive((d) => { updateRentFromYear(d, val); })}
                    />
                    </AgentFieldFrame>
                    <AgentFieldFrame path="/miete/kaltmieteProSqm">
                    <NumberInput
                      label="Miete pro m²/Monat"
                      value={active.miete.kaltmieteProSqm}
                      suffix="EUR/m²"
                      min={0}
                      fractionDigits={2}
                      onChange={(val) => updateActive((d) => { updateRentFromSqm(d, val); })}
                    />
                    </AgentFieldFrame>
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
                  </AgentFieldFrame>

                  <hr className="border-slate-100" />

                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                        <span>Mietspiegel</span>
                        <InfoTooltip content="Die Einordnung vergleicht die aktuell angesetzte Nettokaltmiete je m² und Monat mit dem eingegebenen Spannbereich." />
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        Werte in EUR je m² Wohnfläche und Monat aus dem für das Objekt geltenden Mietspiegel.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <NumberInput
                        label="Unterer Spannwert"
                        value={active.miete.mietspiegel.untererSpannwertProSqm}
                        suffix="EUR/m²"
                        min={0}
                        step={0.01}
                        fractionDigits={2}
                        onChange={(val) => updateActive((d) => {
                          d.miete.mietspiegel.untererSpannwertProSqm = val;
                        })}
                      />
                      <NumberInput
                        label="Mittelwert"
                        value={active.miete.mietspiegel.mittelwertProSqm}
                        suffix="EUR/m²"
                        min={0}
                        step={0.01}
                        fractionDigits={2}
                        onChange={(val) => updateActive((d) => {
                          d.miete.mietspiegel.mittelwertProSqm = val;
                        })}
                      />
                      <NumberInput
                        label="Oberer Spannwert"
                        value={active.miete.mietspiegel.obererSpannwertProSqm}
                        suffix="EUR/m²"
                        min={0}
                        step={0.01}
                        fractionDigits={2}
                        onChange={(val) => updateActive((d) => {
                          d.miete.mietspiegel.obererSpannwertProSqm = val;
                        })}
                      />
                    </div>

                    <div
                      role="status"
                      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${mietspiegelStatusView.className}`}
                    >
                      {mietspiegelStatusView.icon === 'success' ? (
                        <CheckCircle size={17} className="mt-0.5 shrink-0" />
                      ) : mietspiegelStatusView.icon === 'warning' ? (
                        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                      ) : (
                        <Info size={17} className="mt-0.5 shrink-0" />
                      )}
                      <div>
                        <div className="text-sm font-bold">{mietspiegelStatusView.title}</div>
                        <div className="mt-0.5 text-xs leading-relaxed">{mietspiegelStatusView.description}</div>
                        {mietspiegelAssessment.abweichungZumMittelwert !== null &&
                          mietspiegelAssessment.status !== 'incomplete' &&
                          mietspiegelAssessment.status !== 'invalid' && (
                            <div className="mt-1 text-[11px] font-semibold">
                              Abweichung vom Mittelwert:{' '}
                              {mietspiegelAssessment.abweichungZumMittelwert > 0 ? '+' : ''}
                              {formatNumber(mietspiegelAssessment.abweichungZumMittelwert, 2)} €/m²
                            </div>
                          )}
                      </div>
                    </div>

                    <p className="text-[10px] leading-relaxed text-slate-400">
                      Der Mittelwert ist der Ausgangspunkt. Wohnwerterhöhende oder wohnwertmindernde Merkmale können eine Abweichung innerhalb der Spanne begründen. Die Anzeige ist eine rechnerische Orientierung und keine rechtliche Prüfung einer Mieterhöhung.
                    </p>
                  </div>

                  {mieterhoehungsHinweise.length > 0 && (
                    <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-amber-900">
                      <div className="flex items-start gap-2.5">
                        <Info size={17} className="mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-bold">Mieterhöhung nach Modernisierung ggf. prüfen</div>
                          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed">
                            {mieterhoehungsHinweise.map((massnahme) => (
                              <li key={massnahme.id}>
                                <strong>{massnahme.bezeichnung}</strong>: nach Abschluss in Jahr {massnahme.jahr} ggf. möglich
                                {massnahme.jahr > active.exit.haltedauerJahre ? ' (außerhalb der Haltedauer)' : ''}.
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-[10px] leading-relaxed text-amber-800">
                            Keine automatische Mietanpassung: Nach § 559 BGB kommen nur bestimmte Modernisierungen in Betracht. Erhaltungsanteile, Fördermittel, Ankündigung, Härtefälle und Kappungsgrenzen müssen gesondert geprüft werden.
                            Eine angenommene Erhöhung tragen Sie anschließend separat als Mietsteigerungs-Regel ein.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

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
                            <th className="px-3 py-2 w-16">Ab Monat</th>
                            <th className="px-3 py-2 text-right w-10">Aktion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                          {active.miete.steigerungen.map((rule, ruleIndex) => {
                            const ruleResult = rentRuleResults[ruleIndex];
                            return (
                              <Fragment key={`${rule.id}-${ruleIndex}`}>
                                <tr className="hover:bg-slate-50/50">
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
                                  <td className="px-3 py-1.5">
                                    {rule.kind === 'step' ? (
                                      <input
                                        type="number"
                                        min="1"
                                        max="12"
                                        value={rule.wirksamAbMonat ?? 1}
                                        onChange={(e) => handleUpdateMieteRule(rule.id, { wirksamAbMonat: parseInt(e.target.value) || 1 })}
                                        title="Wirksam ab Monat (§ 558b BGB: frühestens ab Beginn des 3. Monats nach Zugang). Das Jahr wird anteilig gerechnet."
                                        className="w-full rounded border border-slate-200 px-1 py-0.5 text-xs text-center focus:border-blue-500 focus:outline-none"
                                      />
                                    ) : (
                                      <span className="block text-center text-slate-300">–</span>
                                    )}
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
                                {ruleResult && (
                                  <tr className="bg-slate-50/70">
                                    <td colSpan={5} className="px-3 py-1.5 text-[10px] leading-relaxed text-slate-500">
                                      <span className="font-semibold text-slate-600">
                                        Ergebnis in Jahr {ruleResult.jahr} gemäß allen bis dahin wirksamen Regeln:
                                      </span>{' '}
                                      <span className="font-bold text-blue-700">
                                        {ruleResult.kaltmieteProSqm === null
                                          ? 'pro m² nicht berechenbar'
                                          : `${formatNumber(ruleResult.kaltmieteProSqm, 2)} €/m²/Monat`}
                                      </span>
                                      {' · '}
                                      <span className="font-bold text-slate-700">
                                        {formatEUR(ruleResult.kaltmieteProMonat, 2)} gesamt/Monat
                                      </span>
                                      {ruleResult.jahr > active.exit.haltedauerJahre && (
                                        <span className="ml-1 text-amber-700">
                                          (außerhalb der Haltedauer, nicht im Diagramm)
                                        </span>
                                      )}
                                      {!ruleResult.istWirksam && (
                                        <span className="ml-1 text-rose-700">
                                          (nicht wirksam: Eine frühere Jahresrate im selben Startjahr hat Vorrang)
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                          {active.miete.steigerungen.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-3 py-3 text-center text-slate-400 italic">
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
                    <div className="w-full mt-4 bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Mietentwicklung & Mietspiegel (monatliche Kaltmiete)
                      </span>
                      {!mietspiegelChartValues && (
                        <p className="mt-1 text-[10px] text-slate-400">
                          Vollständige und plausible Mietspiegelwerte blenden Spannbereich und Vergleichslinien ein.
                        </p>
                      )}
                      <div className="mt-2 h-40 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={rentChartData} margin={{ top: 8, right: 8, left: 0, bottom: 2 }}>
                            <defs>
                              <linearGradient id="colorMiete" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                            <XAxis dataKey="Jahr" fontSize={9} stroke="#94a3b8" />
                            <YAxis
                              width={38}
                              fontSize={9}
                              stroke="#94a3b8"
                              tickFormatter={(value) => formatNumber(Number(value), 0)}
                            />
                            {mietspiegelChartValues && (
                              <>
                                <ReferenceArea
                                  y1={mietspiegelChartValues.lower.totalProMonat}
                                  y2={mietspiegelChartValues.upper.totalProMonat}
                                  ifOverflow="extendDomain"
                                  fill="#10b981"
                                  fillOpacity={0.08}
                                  stroke="none"
                                  zIndex={50}
                                />
                                <ReferenceLine
                                  y={mietspiegelChartValues.lower.totalProMonat}
                                  ifOverflow="extendDomain"
                                  stroke={mietspiegelChartValues.lower.color}
                                  strokeWidth={1.25}
                                />
                                <ReferenceLine
                                  y={mietspiegelChartValues.mean.totalProMonat}
                                  ifOverflow="extendDomain"
                                  stroke={mietspiegelChartValues.mean.color}
                                  strokeWidth={1.5}
                                  strokeDasharray="5 4"
                                />
                                <ReferenceLine
                                  y={mietspiegelChartValues.upper.totalProMonat}
                                  ifOverflow="extendDomain"
                                  stroke={mietspiegelChartValues.upper.color}
                                  strokeWidth={1.25}
                                />
                              </>
                            )}
                            <RechartsTooltip
                              formatter={(rawValue) => {
                                const monthlyRent = Number(rawValue ?? 0);
                                const perSqm = active.objekt.wohnflaeche > 0
                                  ? monthlyRent / active.objekt.wohnflaeche
                                  : null;
                                return [
                                  perSqm === null
                                    ? formatEUR(monthlyRent, 2)
                                    : `${formatEUR(monthlyRent, 2)} · ${formatNumber(perSqm, 2)} €/m²`,
                                  'Kaltmiete',
                                ];
                              }}
                              labelFormatter={(label) => `Jahr ${label}`}
                            />
                            <Area
                              type="stepAfter"
                              dataKey="Miete"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              fillOpacity={1}
                              fill="url(#colorMiete)"
                              zIndex={100}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      {mietspiegelChartValues && (
                        <>
                          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                            {[
                              mietspiegelChartValues.lower,
                              mietspiegelChartValues.mean,
                              mietspiegelChartValues.upper,
                            ].map((value) => (
                              <div key={value.label} className="rounded-lg border border-slate-200 bg-white/80 px-2.5 py-2">
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                                  <span className="h-0.5 w-3 rounded" style={{ backgroundColor: value.color }} />
                                  {value.label}
                                </div>
                                <div className="mt-0.5 text-[10px] text-slate-500">
                                  {formatNumber(value.proSqm, 2)} €/m² · {formatEUR(value.totalProMonat, 2)}/Monat
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                            Der hinterlegte Mietspiegel bleibt als statische Orientierung über alle Projektionsjahre unverändert.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  <SectionSaveButton onSave={handleSave} />
                </div>
              )}
            </div>

            {/* SEKTION 5: Laufende Kosten */}
            <div data-agent-section="kosten" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('kosten')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                  <span className={`row-span-2 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-colors ${openSection === 'kosten' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>5</span>
                  <span>Laufende Kosten</span>
                  {openSection !== 'kosten' && (
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {kostenErfassungMode === 'wirtschaftsplan'
                        ? `${formatEUR(wpGeplanteVorschuesse / 12)}/Monat Hausgeld · ${formatEUR(wpEigentuemerCashout)}/Jahr Eigentümer`
                        : `${formatEUR(proj.years[0]?.bewirtschaftungskosten ?? 0)}/Jahr Eigentümer`}
                    </span>
                  )}
                </div>
                <span className={`transform transition-transform duration-200 ${openSection === 'kosten' ? 'rotate-180' : ''}`}>
                  <ChevronDown size={16} className="text-slate-400" />
                </span>
              </button>
              {openSection === 'kosten' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <AgentFieldFrame path="/kosten/kostenErfassungMode">
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Kostenerfassung</span>
                      <Tabs
                        activeTab={kostenErfassungMode}
                        onChange={(id) => updateActive((d) => {
                          d.kosten.kostenErfassungMode = id as KostenErfassungMode;
                        })}
                        tabs={[
                          { id: 'wirtschaftsplan', label: 'Direkt aus Wirtschaftsplan' },
                          { id: 'detailliert', label: 'Detaillierte Schätzung' },
                        ]}
                      />
                      <p className="text-[10px] leading-relaxed text-slate-500">
                        Beim Wechsel bleiben die Eingaben des jeweils anderen Modus gespeichert. Berechnet wird nur der aktive Modus.
                      </p>
                    </div>
                  </AgentFieldFrame>
                  {kostenErfassungMode === 'wirtschaftsplan' ? (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <AgentFieldFrame path="/kosten/umlagefaehigeKostenProJahr">
                          <NumberInput
                            label="Summe umlagefähige Kosten"
                            value={wpUmlagefaehig}
                            suffix="EUR"
                            min={0}
                            fractionDigits={2}
                            onChange={(val) => updateActive((d) => { d.kosten.umlagefaehigeKostenProJahr = val; })}
                          />
                        </AgentFieldFrame>
                        <AgentFieldFrame path="/kosten/nichtUmlagefaehigeKostenProJahr">
                          <NumberInput
                            label="Summe nicht umlagefähige Kosten"
                            value={wpNichtUmlagefaehig}
                            suffix="EUR"
                            min={0}
                            fractionDigits={2}
                            onChange={(val) => updateActive((d) => { d.kosten.nichtUmlagefaehigeKostenProJahr = val; })}
                          />
                        </AgentFieldFrame>
                        <AgentFieldFrame path="/kosten/wegRuecklageProJahr">
                          <NumberInput
                            label="Summe Zuführung Erhaltungsrücklage"
                            value={wpWegRuecklage}
                            suffix="EUR"
                            min={0}
                            fractionDigits={2}
                            onChange={(val) => updateActive((d) => { d.kosten.wegRuecklageProJahr = val; })}
                          />
                        </AgentFieldFrame>
                      </div>
                      <p className="text-[10px] leading-relaxed text-slate-500">
                        Die drei Jahressummen können direkt aus dem Wirtschaftsplan übernommen werden. Die Rücklagenzuführung
                        steht dort regelmäßig zusätzlich zu den geplanten Kosten und ist noch kein sofortiger Werbungskostenabzug.
                      </p>
                      <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2.5 text-[10px] text-blue-950 space-y-1.5">
                        <div className="flex justify-between gap-4">
                          <span>Summe geplante Kosten</span>
                          <strong>{formatEUR(wpGeplanteKosten, 2)}</strong>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Summe geplante Vorschüsse / Hausgeld p. a.</span>
                          <strong>{formatEUR(wpGeplanteVorschuesse, 2)}</strong>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Hausgeld pro Monat</span>
                          <strong>{formatEUR(wpGeplanteVorschuesse / 12, 2)}</strong>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-blue-100 pt-1.5">
                          <span>Nicht umlegbar wegen {formatPercent(active.miete.leerstandPct)} Leerstand</span>
                          <strong>{formatEUR(wpLeerstandsanteil, 2)}</strong>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Eigentümer-Cashout p. a.</span>
                          <strong>{formatEUR(wpEigentuemerCashout, 2)}</strong>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>davon sofort steuerlich berücksichtigt (Modell)</span>
                          <strong>{formatEUR(wpSofortAbziehbar, 2)}</strong>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>davon nicht sofort berücksichtigt</span>
                          <strong>{formatEUR(wpWegRuecklage, 2)}</strong>
                        </div>
                        <p className="border-t border-blue-100 pt-1.5 leading-relaxed">
                          Umlagefähige Kosten trägt der Eigentümer im Modell nur insoweit dauerhaft selbst, wie sie wegen
                          Leerstands nicht vom Mieter erstattet werden. Die App verwendet dafür automatisch die bereits
                          erfasste Leerstandsquote.
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-3">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                          Erwartete Verwendung der WEG-Rücklage
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <AgentFieldFrame path="/kosten/ruecklagenVerwendungPct">
                            <Slider
                              label="Verwendung je Jahreszuführung (%)"
                              value={active.kosten.ruecklagenVerwendungPct ?? 50}
                              onChange={(val) => updateActive((d) => { d.kosten.ruecklagenVerwendungPct = val; })}
                              min={0}
                              max={100}
                              step={1}
                              suffix="%"
                            />
                          </AgentFieldFrame>
                          <AgentFieldFrame path="/kosten/ruecklagenVerzoegerungJahre">
                            <NumberInput
                              label="Durchschnittliche Verzögerung"
                              value={active.kosten.ruecklagenVerzoegerungJahre ?? 5}
                              suffix="Jahre"
                              min={1}
                              max={40}
                              step={1}
                              onChange={(val) => updateActive((d) => {
                                d.kosten.ruecklagenVerzoegerungJahre = clampIntegerInRange(val, 1, 40);
                              })}
                            />
                          </AgentFieldFrame>
                        </div>
                        <p className="text-[10px] leading-relaxed text-slate-500">
                          Pauschale, editierbare Standardannahme: <strong>50 % jeder einzelnen Jahreszuführung</strong> werden
                          nach durchschnittlich <strong>5 Jahren</strong> durch die WEG verwendet. Die Verwendung ist kein
                          zweiter Cash-Abfluss; vereinfachend wird sie dann als sofort abziehbarer Erhaltungsaufwand
                          behandelt. Tatsächliche Maßnahmen können später, früher oder als Herstellungskosten steuerlich
                          anders wirken. Junge Zuführungen, deren Verzögerung beim Verkauf noch nicht abgelaufen ist,
                          bleiben im modellierten Bestand.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AgentFieldFrame path="/kosten/maintenanceMode">
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
                      </AgentFieldFrame>
                      {active.kosten.maintenanceMode === 'perSqm' && (
                        <AgentFieldFrame path="/kosten/instandhaltungProSqm">
                          <NumberInput
                            label="Instandhaltung pro m²/Jahr"
                            value={active.kosten.instandhaltungProSqm}
                            min={0}
                            onChange={(val) => updateActive((d) => { d.kosten.instandhaltungProSqm = val; })}
                          />
                        </AgentFieldFrame>
                      )}
                      {active.kosten.maintenanceMode === 'percentRent' && (
                        <AgentFieldFrame path="/kosten/instandhaltungPctRent">
                          <Slider
                            label="Instandhaltung (% der Kaltmiete)"
                            value={active.kosten.instandhaltungPctRent}
                            onChange={(val) => updateActive((d) => { d.kosten.instandhaltungPctRent = val; })}
                            min={0}
                            max={20}
                            suffix="%"
                          />
                        </AgentFieldFrame>
                      )}
                      {active.kosten.maintenanceMode === 'absolute' && (
                        <AgentFieldFrame path="/kosten/instandhaltungAbsolut">
                          <NumberInput
                            label="Instandhaltung pro Jahr"
                            value={active.kosten.instandhaltungAbsolut}
                            suffix="EUR"
                            min={0}
                            onChange={(val) => updateActive((d) => { d.kosten.instandhaltungAbsolut = val; })}
                          />
                        </AgentFieldFrame>
                      )}
                      <div className="space-y-1.5">
                        <Slider
                          label="davon Rücklage + kalkulatorische Reserve (%)"
                          value={active.kosten.ruecklagenAnteilPct}
                          onChange={(val) => updateActive((d) => { d.kosten.ruecklagenAnteilPct = val; })}
                          min={0}
                          max={100}
                          step={1}
                          suffix="%"
                        />
                        <p className="text-[10px] leading-relaxed text-slate-500">
                          Anteil der Instandhaltung, der <strong>nicht sofort abziehbar</strong> ist: die
                          Erhaltungsrücklage der WEG und die kalkulatorische Reserve für das Sondereigentum. Beides bindet
                          Liquidität, aber mindert noch nicht das V&amp;V-Ergebnis. In diesem gemischten Schätzmodus werden
                          keine späteren Entnahmen modelliert; wie viel des Bestands ein Käufer über den Immobilienpreis
                          honoriert, steuert die separate Preiswirkungsquote. Für die saubere WEG-Steuerlogik bitte den
                          Wirtschaftsplan-Modus nutzen.
                        </p>
                        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-[10px] text-blue-900 space-y-1">
                          <div className="flex justify-between gap-4">
                            <span>Cash-Abfluss Jahr 1 insgesamt</span>
                            <strong>{formatEUR(proj.years[0]?.instandhaltung ?? 0)}</strong>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>davon nicht sofort abziehbar</span>
                            <strong>{formatEUR(proj.years[0]?.ruecklagenZufuehrung ?? 0)}</strong>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>davon im Jahr sofort abziehbar</span>
                            <strong>{formatEUR(
                              (proj.years[0]?.instandhaltung ?? 0) - (proj.years[0]?.ruecklagenZufuehrung ?? 0)
                            )}</strong>
                          </div>
                          <p className="border-t border-blue-100 pt-1 leading-relaxed">
                            Die Prozentquote teilt den oben eingegebenen Gesamtbetrag nur auf; sie addiert keine Kosten.
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    </>
                  )}
                  <AgentFieldFrame path="/kosten/ruecklagenRestwertPct">
                  <div className="space-y-1.5">
                    <Slider
                      label={kostenErfassungMode === 'wirtschaftsplan'
                        ? 'WEG-Rücklage: Preiswirkung beim Exit (%)'
                        : 'Reserve: Preiswirkung beim Exit (%)'}
                      value={active.kosten.ruecklagenRestwertPct ?? 0}
                      onChange={(val) => updateActive((d) => { d.kosten.ruecklagenRestwertPct = val; })}
                      min={0}
                      max={100}
                      step={1}
                      suffix="%"
                    />
                    {kostenErfassungMode === 'wirtschaftsplan' ? (
                      <p className="text-[10px] leading-relaxed text-slate-500">
                        <strong>Preiswirkung konservativ wählen:</strong> 0 %, solange nicht belastbar abschätzbar ist, wie
                        stark ein Käufer den verbleibenden Bestand honoriert. Die Rücklage wird nicht separat ausgezahlt.
                        Ein positiver Wert erhöht den modellierten Immobilienpreis und damit auch prozentuale Verkaufskosten
                        sowie gegebenenfalls den Gewinn nach § 23 EStG.
                      </p>
                    ) : (
                      <p className="text-[10px] leading-relaxed text-slate-500">
                        <strong>Preiswirkung konservativ wählen:</strong> Da dieser Schätzmodus WEG-Zuführung und private
                        Reserve nicht trennt, sollte die Quote grundsätzlich 0 % bleiben. Ein positiver Ansatz darf nur den
                        tatsächlich WEG-gebundenen Anteil abbilden, den ein Käufer über den Immobilienpreis honoriert; eine
                        private Reserve bleibt Vermögen des Verkäufers und ist keine Käufer-Preiswirkung. Eine bereits in der
                        Wertsteigerung enthaltene Wirkung darf nicht noch einmal angesetzt werden.
                      </p>
                    )}
                  </div>
                  </AgentFieldFrame>
                  <Slider
                    label="Kostensteigerung (% p. a.)"
                    value={active.kosten.kostensteigerungPctPa}
                    onChange={(val) => updateActive((d) => { d.kosten.kostensteigerungPctPa = val; })}
                    min={0}
                    max={5}
                    step={0.1}
                    suffix="%"
                  />
                  <SectionSaveButton onSave={handleSave} />
                </div>
              )}
            </div>

            {/* SEKTION 6: Steuer */}
            <div data-agent-section="steuer" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('steuer')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                  <span className={`row-span-2 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-colors ${openSection === 'steuer' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>6</span>
                  <span>Steuer</span>
                  {openSection !== 'steuer' && (
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {active.steuer.taxMode === 'income'
                        ? `${formatEUR(active.steuer.bruttoJahresEinkommen)} Einkommen`
                        : `${formatPercent(active.steuer.grenzsteuersatzPct)} Grenzsteuersatz`}
                      {' · '}{active.steuer.veranlagung === 'splitting' ? 'Splitting' : 'Einzel'}
                    </span>
                  )}
                </div>
                <span className={`transform transition-transform duration-200 ${openSection === 'steuer' ? 'rotate-180' : ''}`}>
                  <ChevronDown size={16} className="text-slate-400" />
                </span>
              </button>
              {openSection === 'steuer' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <AgentFieldFrame path="/steuer/taxMode">
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
                  </AgentFieldFrame>
                  {active.steuer.taxMode === 'income' ? (
                    <div className="space-y-4">
                      <AgentFieldFrame path="/steuer/bruttoJahresEinkommen">
                      <NumberInput
                        label="zu versteuerndes Einkommen (€)"
                        value={active.steuer.bruttoJahresEinkommen}
                        suffix="EUR"
                        min={0}
                        onChange={(val) => updateActive((d) => { d.steuer.bruttoJahresEinkommen = val; })}
                      />
                      </AgentFieldFrame>
                      <AgentFieldFrame path="/steuer/veranlagung">
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
                      </AgentFieldFrame>
                    </div>
                  ) : (
                    <AgentFieldFrame path="/steuer/grenzsteuersatzPct">
                    <Slider
                      label="Fester Grenzsteuersatz (%)"
                      value={active.steuer.grenzsteuersatzPct}
                      onChange={(val) => updateActive((d) => { d.steuer.grenzsteuersatzPct = val; })}
                      min={0}
                      max={50}
                      step={1}
                      suffix="%"
                    />
                    </AgentFieldFrame>
                  )}
                  <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg text-xs font-medium text-slate-600">
                    <span>{active.steuer.taxMode === 'income' ? 'Berechneter Grenzsteuersatz:' : 'Grenzsteuersatz:'}</span>
                    <span className="font-bold text-slate-700">
                      {formatPercent(computedMarginalRate)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <SectionSaveButton onSave={handleSave} />
                </div>
              )}
            </div>

            {/* SEKTION 7: AfA (Abschreibung) */}
            <div data-agent-section="afa" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('afa')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                  <span className={`row-span-2 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-colors ${openSection === 'afa' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>7</span>
                  <span>Abschreibung (AfA)</span>
                  {openSection !== 'afa' && (
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {active.afa.modus === 'linear' ? `Linear ${formatPercent(active.afa.linearSatzPct)}` : active.afa.modus === 'degressiv' ? 'Degressiv 5 %' : active.afa.modus === 'denkmal7i' ? 'Denkmal §7i' : 'Sonder §7b'}
                    </span>
                  )}
                </div>
                <span className={`transform transition-transform duration-200 ${openSection === 'afa' ? 'rotate-180' : ''}`}>
                  <ChevronDown size={16} className="text-slate-400" />
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
                        d.afa.linearSatzPct = linearAfaRateForYear(d.objekt.fertigstellungsjahr);
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
                        <strong>100% über 12 Jahre</strong> (9,0% in J. 1-8, 7,0% in J. 9-12). Die Altbausubstanz (Anteil Gebäude-Kaufpreis) wird parallel linear mit{' '}
                        <strong>{active.afa.linearSatzPct}% p. a.</strong> abgeschrieben (abgeleitet aus dem Baujahr).
                      </p>
                    )}
                  </div>
                  <SectionSaveButton onSave={handleSave} />
                </div>
              )}
            </div>

            {/* SEKTION 8: Geplante Sanierungen */}
            <div data-agent-section="sanierungen" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('sanierungen')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                  <span className={`row-span-2 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-colors ${openSection === 'sanierungen' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>8</span>
                  <span>Sanierungen &amp; Modernisierungen</span>
                  {openSection !== 'sanierungen' && (
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {active.sanierungen.length === 0
                        ? 'Keine Maßnahmen geplant'
                        : `${active.sanierungen.length} ${active.sanierungen.length === 1 ? 'Maßnahme' : 'Maßnahmen'} · ${formatEUR(sanierungsSumme)}`}
                    </span>
                  )}
                </div>
                <span className={`transform transition-transform duration-200 ${openSection === 'sanierungen' ? 'rotate-180' : ''}`}>
                  <ChevronDown size={16} className="text-slate-400" />
                </span>
              </button>
              {openSection === 'sanierungen' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-xs leading-relaxed text-blue-900">
                    <strong>Modellannahme:</strong> Das Projektjahr gilt vereinfachend als Zahlungs- und Abschlussjahr; Abschreibungen werden ab dann mit einem vollen Jahresbetrag angesetzt. Der Betrag fließt vollständig ab und wird nicht automatisch finanziert. Eine Wert- oder Mieterhöhung wird nicht automatisch angesetzt. Die steuerliche Auswahl ist eine Rechenannahme und muss insbesondere bei der 15-%-Grenze, Herstellungskosten und Denkmalmaßnahmen fachlich geprüft werden.
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Maßnahmenplan</div>
                      <p className="mt-0.5 text-[11px] text-slate-400">Projektjahr, Auszahlung und steuerliche Behandlung je Maßnahme.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddSanierung}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-100"
                    >
                      <Plus size={13} /> Maßnahme
                    </button>
                  </div>

                  <div className="space-y-3">
                    {active.sanierungen.map((massnahme, index) => (
                      <div key={massnahme.id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-4">
                        <div className="flex items-end gap-3">
                          <div className="min-w-0 flex-1">
                            <label htmlFor={`sanierung-name-${massnahme.id}`} className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                              Bezeichnung der Maßnahme {index + 1}
                            </label>
                            <input
                              id={`sanierung-name-${massnahme.id}`}
                              type="text"
                              value={massnahme.bezeichnung}
                              onChange={(event) => handleUpdateSanierung(massnahme.id, { bezeichnung: event.target.value })}
                              onBlur={(event) => {
                                if (!event.target.value.trim()) {
                                  handleUpdateSanierung(massnahme.id, { bezeichnung: 'Sanierung' });
                                }
                              }}
                              placeholder="z. B. Heizung, Bad oder Fassade"
                              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-xs transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteSanierung(massnahme.id)}
                            aria-label={`${massnahme.bezeichnung || 'Sanierung'} löschen`}
                            className="mb-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <NumberInput
                            id={`sanierung-jahr-${massnahme.id}`}
                            label="Projektjahr"
                            value={massnahme.jahr}
                            min={1}
                            max={40}
                            step={1}
                            fractionDigits={0}
                            inputMode="numeric"
                            onChange={(value) => handleUpdateSanierung(massnahme.id, { jahr: value })}
                          />
                          <NumberInput
                            id={`sanierung-betrag-${massnahme.id}`}
                            label="Betrag"
                            value={massnahme.betrag}
                            suffix="EUR"
                            min={0}
                            fractionDigits={2}
                            onChange={(value) => handleUpdateSanierung(massnahme.id, { betrag: value })}
                          />
                          <Select
                            id={`sanierung-steuerart-${massnahme.id}`}
                            label="Steuerliche Behandlung"
                            value={massnahme.steuerart}
                            onChange={(event) => handleUpdateSanierung(massnahme.id, {
                              steuerart: event.target.value as SanierungSteuerart,
                            })}
                            options={[
                              { value: 'sofort', label: 'Sofortabzug (Erhaltungsaufwand)' },
                              { value: 'verteilt', label: 'Verteilung nach § 82b EStDV' },
                              { value: 'herstellung', label: 'Gebäude-AfA (Herstellungskosten)' },
                              { value: 'denkmal7i', label: 'Denkmal-AfA nach § 7i' },
                              { value: 'denkmal11b', label: 'Denkmal-Erhaltungsaufwand § 11b' },
                              { value: 'keine', label: 'Steuerlich noch offen' },
                            ]}
                          />
                        </div>

                        {(massnahme.steuerart === 'verteilt' || massnahme.steuerart === 'denkmal11b') && (
                          <Select
                            id={`sanierung-verteilung-${massnahme.id}`}
                            label="Gleichmäßig verteilen über"
                            value={massnahme.verteilungsJahre}
                            onChange={(event) => handleUpdateSanierung(massnahme.id, {
                              verteilungsJahre: Number(event.target.value),
                            })}
                            options={[2, 3, 4, 5].map((years) => ({
                              value: years,
                              label: `${years} Jahre`,
                            }))}
                            className="sm:max-w-xs"
                          />
                        )}

                        <Toggle
                          id={`sanierung-mieterhoehung-${massnahme.id}`}
                          label="Modernisierung: Mieterhöhung ggf. möglich"
                          description="Blendet im Mietbereich einen rechtlichen Prüfhinweis für das Maßnahmenjahr ein; die Miete selbst bleibt unverändert."
                          checked={massnahme.mieterhoehungMoeglich}
                          onChange={(checked) => handleUpdateSanierung(massnahme.id, { mieterhoehungMoeglich: checked })}
                        />

                        <div className="rounded-lg bg-white px-3 py-2.5 text-[11px] leading-relaxed text-slate-500">
                          {sanierungSteuerInfo(massnahme.steuerart, active.afa.linearSatzPct)}
                        </div>

                        {massnahme.jahr <= 3 && massnahme.steuerart !== 'herstellung' && (
                          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-700">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            Die gesetzliche Drei-Jahres-Frist läuft taggenau ab dem Übergang des wirtschaftlichen Eigentums. Relevante Nettoaufwendungen können zusammen mehr als 15 % der Gebäude-Anschaffungskosten erreichen und dadurch als anschaffungsnahe Herstellungskosten gelten. Die App klassifiziert dies nicht automatisch um.
                          </p>
                        )}
                        {(massnahme.steuerart === 'denkmal7i' || massnahme.steuerart === 'denkmal11b') && (
                          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-amber-700">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            Die Denkmalbegünstigung setzt unter anderem Denkmaleigenschaft, vorherige Abstimmung und eine Bescheinigung der zuständigen Stelle voraus; Zuschüsse mindern die begünstigten Kosten.
                          </p>
                        )}
                        {massnahme.jahr > active.exit.haltedauerJahre && (
                          <p className="text-[10px] font-semibold text-slate-500">
                            Außerhalb der aktuellen Haltedauer: Auszahlung und Steuerwirkung erscheinen nicht in der Projektion.
                          </p>
                        )}
                      </div>
                    ))}

                    {active.sanierungen.length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs text-slate-400">
                        Noch keine Sanierung oder Modernisierung geplant.
                      </div>
                    )}
                  </div>

                  <SectionSaveButton onSave={handleSave} />
                </div>
              )}
            </div>

            {/* SEKTION 9: Wertentwicklung */}
            <div data-agent-section="wertentwicklung" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('wertentwicklung')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                  <span className={`row-span-2 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-colors ${openSection === 'wertentwicklung' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>9</span>
                  <span>Wertentwicklung</span>
                  {openSection !== 'wertentwicklung' && active.wertentwicklung.szenario.length > 0 && (
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {active.wertentwicklung.szenario.map(r => r.kind === 'rate' ? `${formatPercent(r.percentPerYear)}/Jahr` : `${formatPercent(r.percent)} Sprung`).join(', ')}
                    </span>
                  )}
                </div>
                <span className={`transform transition-transform duration-200 ${openSection === 'wertentwicklung' ? 'rotate-180' : ''}`}>
                  <ChevronDown size={16} className="text-slate-400" />
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
                                <RuleNumberInput
                                  value={rule.fromYear}
                                  min={1}
                                  max={50}
                                  inputMode="numeric"
                                  ariaLabel="Wertentwicklung ab Jahr"
                                  onChange={(val) => handleUpdateWertRule(rule.id, { fromYear: val })}
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
                                  <RuleNumberInput
                                    value={rule.kind === 'rate' ? rule.percentPerYear : rule.percent}
                                    min={-100}
                                    max={100}
                                    inputMode="decimal"
                                    ariaLabel="Wertentwicklung Prozentwert"
                                    onChange={(val) => {
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
                        <AreaChart data={valueChartData} margin={{ top: 2, right: 5, left: 0, bottom: 2 }}>
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
                  <SectionSaveButton onSave={handleSave} />
                </div>
              )}
            </div>

            {/* SEKTION 10: Exit (Verkauf) */}
            <div data-agent-section="exit" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('exit')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                  <span className={`row-span-2 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-colors ${openSection === 'exit' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>10</span>
                  <span>Verkauf (Exit)</span>
                  {openSection !== 'exit' && (
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {active.exit.haltedauerJahre} Jahre Haltedauer
                    </span>
                  )}
                </div>
                <span className={`transform transition-transform duration-200 ${openSection === 'exit' ? 'rotate-180' : ''}`}>
                  <ChevronDown size={16} className="text-slate-400" />
                </span>
              </button>
              {openSection === 'exit' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <AgentFieldFrame path="/exit/haltedauerJahre">
                    <Slider
                      label="Haltedauer (Jahre)"
                      value={active.exit.haltedauerJahre}
                      onChange={(val) => updateActive((d) => { d.exit.haltedauerJahre = val; })}
                      min={1}
                      max={40}
                      step={1}
                    />
                    </AgentFieldFrame>
                    <div className="flex flex-col justify-end space-y-2">
                      <AgentFieldFrame path="/exit/verkaufsnebenkostenMode">
                      <Tabs
                        activeTab={active.exit.verkaufsnebenkostenMode}
                        onChange={(id) => updateActive((d) => {
                          d.exit.verkaufsnebenkostenMode = id as VerkaufsnebenkostenMode;
                        })}
                        tabs={[
                          { id: 'percent', label: '% vom Preis' },
                          { id: 'absolute', label: 'EUR pauschal' },
                        ]}
                      />
                      </AgentFieldFrame>
                      {active.exit.verkaufsnebenkostenMode === 'percent' ? (
                        <AgentFieldFrame path="/exit/verkaufsnebenkostenPct">
                        <Slider
                          label="Verkaufsnebenkosten (%)"
                          value={active.exit.verkaufsnebenkostenPct}
                          onChange={(val) => updateActive((d) => { d.exit.verkaufsnebenkostenPct = val; })}
                          min={0}
                          max={10}
                          step={0.1}
                          suffix="%"
                        />
                        </AgentFieldFrame>
                      ) : (
                        <AgentFieldFrame path="/exit/verkaufsnebenkostenAbsolut">
                        <NumberInput
                          label="Verkaufsnebenkosten (Pauschale)"
                          value={active.exit.verkaufsnebenkostenAbsolut}
                          suffix="EUR"
                          min={0}
                          onChange={(val) => updateActive((d) => { d.exit.verkaufsnebenkostenAbsolut = val; })}
                        />
                        </AgentFieldFrame>
                      )}
                    </div>
                    <AgentFieldFrame path="/exit/vorfaelligkeitPct">
                    <Slider
                      label="Vorfälligkeit vor Zinsbindungsende (%)"
                      value={active.exit.vorfaelligkeitPct}
                      onChange={(val) => updateActive((d) => { d.exit.vorfaelligkeitPct = val; })}
                      min={0}
                      max={5}
                      step={0.1}
                      suffix="%"
                    />
                    </AgentFieldFrame>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug">
                    Sinnvolle Pauschale ohne Makler: ca. 1.500–3.000 € (Energieausweis, Unterlagen,
                    Löschung der Grundschuld, ggf. Rechtsberatung). Mit Verkäufer-Makler eher 3–4 %
                    des Verkaufspreises — dann den %-Modus nutzen. Aktuell angesetzt:{' '}
                    <strong className="text-slate-600">{formatEUR(exitRes.verkaufsnebenkosten)}</strong>.
                  </p>
                  <SectionSaveButton onSave={handleSave} />
                </div>
              )}
            </div>

            {/* SEKTION 11: Notizen */}
            <div data-agent-section="notizen" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <button
                onClick={() => toggleSection('notizen')}
                className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-slate-800 hover:bg-slate-50/50 transition duration-150 cursor-pointer"
              >
                <div className="grid grid-cols-[auto_1fr] items-center gap-x-3">
                  <span className={`row-span-2 flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold tabular-nums transition-colors ${openSection === 'notizen' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>11</span>
                  <span>Notizen</span>
                  {openSection !== 'notizen' && (
                    <span className="text-[11px] font-medium text-slate-400 mt-0.5">
                      {active.notizen.trim() ? 'Notizen vorhanden' : 'Keine Notizen'}
                    </span>
                  )}
                </div>
                <span className={`transform transition-transform duration-200 ${openSection === 'notizen' ? 'rotate-180' : ''}`}>
                  <ChevronDown size={16} className="text-slate-400" />
                </span>
              </button>
              {openSection === 'notizen' && (
                <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                  <label
                    htmlFor="scenario-notizen"
                    className="text-xs font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Freie Notizen zum Objekt und Szenario
                  </label>
                  <textarea
                    id="scenario-notizen"
                    value={active.notizen}
                    onChange={(event) => updateActive((d) => { d.notizen = event.target.value; })}
                    rows={7}
                    placeholder="Zum Beispiel: Zustand, Besichtigungspunkte, offene Fragen oder Besonderheiten …"
                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-relaxed text-slate-800 shadow-xs transition-all duration-200 placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 focus:outline-hidden"
                  />
                  <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
                    Wird mit dem Szenario gespeichert und bei JSON-Exporten übernommen.
                  </p>
                  <SectionSaveButton onSave={handleSave} />
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Results & Dashboard */}
          <div className="lg:col-span-7 space-y-6">
            {agentCompleteness.provisional && (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 shadow-2xs">
                <p className="text-sm font-bold">Vorläufige Agent-Auswertung</p>
                <p className="mt-1 text-xs leading-relaxed">
                  {agentCompleteness.requiredOpen} Pflichtangaben sind noch offen und {agentCompleteness.conflicts} Widersprüche ungeklärt. Kennzahlen basieren bis zur Prüfung teilweise auf App-Standards.
                </p>
              </div>
            )}
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KPICard
                label="IRR p. a."
                value={formatPercent(metrics.irr)}
                trend={metrics.rating === 'green' ? 'positive' : metrics.rating === 'red' ? 'negative' : 'neutral'}
                subtext={bestIrrExitYear ? `Bestes Jahr: ${bestIrrExitYear.jahr} (${formatPercent(bestIrrExitYear.irrPct)})` : 'Interner Zinsfuss'}
                tooltip="IRR ist der interne Zinsfuss der Eigenkapital-Cashflows inklusive laufender Cashflows und Verkaufserloes. Eine positive Ruecklagen-Preiswirkungsquote wirkt nur ueber einen entsprechend hoeher angesetzten Immobilienpreis."
              />
              <KPICard
                label={`Cashflow Monat · Jahr ${selectedProjectionYear.jahr}`}
                value={formatEUR(selectedProjectionYear.cashflowNachSteuerMonatlich)}
                trend={selectedProjectionYear.cashflowNachSteuerMonatlich >= 0 ? 'positive' : 'negative'}
                subtext={selectedProjectionYear.cashflowNachSteuerMonatlich >= 0 ? 'Ueberschuss nach Steuer' : 'Zuzahlung nach Steuer'}
                tooltip="Monatlicher Netto-Cashflow im ausgewählten Jahr nach Zinsen, Tilgung, nicht umlagefähigen Kosten, Sanierungsauszahlungen und Steuereffekt. Einmalige Jahresauszahlungen werden für diese Kennzahl durch zwölf geteilt."
              />
              <KPICard
                label="Netto-Exit"
                value={formatEUR(exitRes.nettoVerkaufserloesNachSteuer)}
                trend={exitRes.nettoVerkaufserloesNachSteuer >= cashBreakdown.totalCashInvestment ? 'positive' : 'negative'}
                subtext={`nach ${active.exit.haltedauerJahre} Jahren`}
                tooltip="Verkaufserloes nach Verkaufskosten, Restschuld, Vorfaelligkeit und Spekulationssteuer. Eine positive Ruecklagen-Preiswirkungsquote ist bereits im angezeigten Verkaufspreis enthalten und wird nicht separat addiert."
              />
            </div>

            <Card>
              <CardContent className="pt-5 space-y-1">
                {/* Cashflow */}
                <div className="flex items-center justify-between gap-3 pb-1">
                  <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cashflow</h3>
                  <Select
                    id="dashboard-cashflow-year"
                    aria-label="Jahr für Cashflow auswählen"
                    value={visibleDashboardYear}
                    onChange={(event) => setDashboardYear(Number(event.target.value))}
                    options={proj.years.map((year) => ({
                      value: year.jahr,
                      label: `Jahr ${year.jahr}`,
                    }))}
                    className="w-32 shrink-0"
                  />
                </div>
                <div className="divide-y divide-slate-100">
                  {[
                    {
                      label: 'Cashflow nach Steuern / Monat',
                      value: formatEUR(selectedProjectionYear.cashflowNachSteuerMonatlich),
                      color: selectedProjectionYear.cashflowNachSteuerMonatlich >= 0 ? 'text-emerald-700' : 'text-rose-700',
                      desc: 'Monatlicher Überschuss bzw. Zuzahlungsbedarf nach Steuern',
                      tooltip: 'Liquiditaet nach Steuereffekt. Tilgung ist ein Cash-Out, aber keine Werbungskosten.',
                    },
                    {
                      label: 'Cashflow vor Steuern / Monat',
                      value: formatEUR(selectedProjectionYear.cashflowVorSteuerMonatlich),
                      color: selectedProjectionYear.cashflowVorSteuerMonatlich >= 0 ? 'text-emerald-700' : 'text-rose-700',
                      desc: 'Monatlicher Überschuss bzw. Zuzahlungsbedarf vor Steuern',
                    },
                  ].map((kpi) => (
                    <div key={kpi.label} className="flex items-baseline justify-between py-2.5">
                      <div className="pr-4">
                        <div className="flex items-center gap-1 text-sm font-semibold text-slate-700">
                          <span>{kpi.label}</span>
                          {'tooltip' in kpi && kpi.tooltip && <InfoTooltip content={kpi.tooltip} />}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{kpi.desc}</div>
                      </div>
                      <span className={`text-base font-extrabold tabular-nums whitespace-nowrap ${kpi.color}`}>{kpi.value}</span>
                    </div>
                  ))}
                  {selectedProjectionYear.sanierungsauszahlung > 0 && (
                    <div className="flex items-baseline justify-between py-2.5">
                      <div className="pr-4">
                        <div className="text-sm font-semibold text-slate-700">Sanierungsauszahlung / Jahr</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Einmaliger Abfluss; davon {formatEUR(selectedProjectionYear.sanierungsWerbungskosten + selectedProjectionYear.sanierungsAfa)} im Jahr steuerlich berücksichtigt
                        </div>
                      </div>
                      <span className="whitespace-nowrap text-base font-extrabold tabular-nums text-rose-700">
                        {formatEUR(-selectedProjectionYear.sanierungsauszahlung)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Rendite */}
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-3 pb-1">Rendite</h3>
                <div className="divide-y divide-slate-100">
                  {[
                    {
                      label: 'Eigenkapitalrendite (IRR) p. a.',
                      value: formatPercent(metrics.irr),
                      color: metrics.rating === 'green' ? 'text-emerald-700' : metrics.rating === 'red' ? 'text-rose-700' : 'text-amber-600',
                      desc: 'Interner Zinsfuß auf den baren Kapitaleinsatz inkl. Verkauf',
                      tooltip: 'IRR annualisiert alle Eigenkapital-Zahlungsstroeme: Start-Einsatz, laufende Cashflows und Netto-Verkaufserloes.',
                    },
                    {
                      label: 'Max. Profitabilität (IRR)',
                      value: bestIrrExitYear ? `Jahr ${bestIrrExitYear.jahr} · ${formatPercent(bestIrrExitYear.irrPct)}` : '–',
                      color: bestIrrExitYear && bestIrrExitYear.irrPct >= metrics.irr ? 'text-emerald-700' : 'text-slate-700',
                      desc: bestIrrExitYear
                        ? `Bester Verkauf innerhalb der Haltedauer: ${formatPercent(bestIrrExitYear.irrPct)} p. a.`
                        : 'Kein bestes Verkaufsjahr ermittelbar',
                      tooltip: 'Das Exit-Jahr mit dem hoechsten IRR innerhalb der aktuell gewaehlten Haltedauer.',
                    },
                    {
                      label: 'Netto-Mietrendite',
                      value: formatPercent(metrics.nettomietrendite),
                      color: metrics.nettomietrendite >= 3.5 ? 'text-emerald-700' : 'text-slate-700',
                      desc: 'Jahresnettomiete abzgl. Bewirtschaftungskosten / Gesamterwerbskosten',
                      tooltip: 'Netto-Kaltmiete nach Leerstand abzüglich des vollständigen Eigentümer-Cashouts geteilt durch Kaufpreis plus Kaufnebenkosten.',
                    },
                    {
                      label: 'Brutto-Mietrendite',
                      value: formatPercent(metrics.bruttomietrendite),
                      color: 'text-slate-700',
                      desc: 'Jahreskaltmiete / Kaufpreis',
                    },
                    {
                      label: 'Cash-on-Cash Rendite p. a. (Ø)',
                      value: formatPercent(metrics.cocAverage),
                      color: metrics.cocAverage >= 4.0 ? 'text-emerald-700' : 'text-slate-700',
                      desc: 'Ø jährlicher Cashflow nach Steuern / barer Kapitaleinsatz',
                    },
                  ].map((kpi) => (
                    <div key={kpi.label} className="flex items-baseline justify-between py-2.5">
                      <div className="pr-4">
                        <div className="flex items-center gap-1 text-sm font-semibold text-slate-700">
                          <span>{kpi.label}</span>
                          {'tooltip' in kpi && kpi.tooltip && <InfoTooltip content={kpi.tooltip} />}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{kpi.desc}</div>
                      </div>
                      <span className={`text-base font-extrabold tabular-nums whitespace-nowrap ${kpi.color}`}>{kpi.value}</span>
                    </div>
                  ))}
                </div>

                {/* Bewertung & Vermögen */}
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-3 pb-1">Bewertung & Vermögen</h3>
                <div className="divide-y divide-slate-100">
                  {[
                    {
                      label: 'Kaufpreisfaktor',
                      value: `${formatNumber(metrics.kaufpreisfaktor, 1)}x`,
                      color: 'text-slate-700',
                      desc: 'Kaufpreis / Jahreskaltmiete',
                      tooltip: 'Vervielfaeltiger: Kaufpreis geteilt durch Jahreskaltmiete. Niedriger ist bei sonst gleichen Annahmen guenstiger.',
                    },
                    {
                      label: `Nettovermögen (nach ${active.exit.haltedauerJahre} J.)`,
                      value: formatEUR(proj.years[proj.years.length - 1]?.eigenkapital ?? 0),
                      color: 'text-blue-700',
                      desc: 'Immobilienwert abzüglich Restschuld am Ende der Haltedauer',
                    },
                  ].map((kpi) => (
                    <div key={kpi.label} className="flex items-baseline justify-between py-2.5">
                      <div className="pr-4">
                        <div className="flex items-center gap-1 text-sm font-semibold text-slate-700">
                          <span>{kpi.label}</span>
                          {'tooltip' in kpi && kpi.tooltip && <InfoTooltip content={kpi.tooltip} />}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{kpi.desc}</div>
                      </div>
                      <span className={`text-base font-extrabold tabular-nums whitespace-nowrap ${kpi.color}`}>{kpi.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Warnings Alert Box */}
            {warnings.length > 0 && (
              <div className={`rounded-xl border p-4 text-xs font-medium space-y-2 ${
                warnings.some((w) => w.severity === 'danger')
                  ? 'border-rose-100 bg-rose-50/40 text-rose-800'
                  : 'border-amber-100 bg-amber-50/40 text-amber-800'
              }`}>
                <div className={`flex items-center gap-1.5 font-bold ${
                  warnings.some((w) => w.severity === 'danger') ? 'text-rose-900' : 'text-amber-900'
                }`}>
                  <AlertTriangle size={15} />
                  <span>Hinweise & Risiken</span>
                </div>
                <ul className="list-disc pl-4 space-y-1">
                  {warnings.map((w, idx) => (
                    <li key={idx} className={w.severity === 'danger' ? 'font-semibold' : ''}>{w.message}</li>
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
                    <strong className="text-slate-900">{formatEUR(cashBreakdown.totalCashInvestment)}</strong> barem Kapitaleinsatz erzielen Sie im ersten Jahr eine Netto-Mietrendite von{' '}
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
                    Am Ende der Haltedauer von <strong className="text-slate-900">{active.exit.haltedauerJahre} Jahren</strong> beträgt der prognostizierte Verkaufspreis einschließlich einer angesetzten Rücklagen-Preiswirkung{' '}
                    <strong className="text-slate-900">{formatEUR(exitRes.verkaufspreis)}</strong> bei einer verbleibenden Restschuld von{' '}
                    <strong className="text-slate-900">{formatEUR(exitRes.restschuld)}</strong>. Die darin enthaltene geschätzte Rücklagen-Preiswirkung beträgt{' '}
                    <strong className="text-slate-900">{formatEUR(exitRes.ruecklagenRestwert)}</strong>. Nach Abzug aller Nebenkosten und Steuern verbleibt ein Netto-Erlös von{' '}
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
                    <ComposedChart data={cashflowChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
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
                      <Bar dataKey="Sanierung" stackId="neg" fill="#64748b" name="Sanierung" />
                      <Line type="monotone" dataKey="Cashflow" stroke="#0f172a" strokeWidth={2.5} name="Netto-Cashflow" dot={{ r: 2 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}

                {activeChartTab === 'wealth' && (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={wealthChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
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
                    <ComposedChart data={taxChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
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
                    <BarChart data={amortizationChartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verkaufspreis</span>
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{formatEUR(exitRes.verkaufspreis)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Restschuld</span>
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{formatEUR(exitRes.restschuld)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Rücklagen-Preiswirkung
                      <InfoTooltip content="Geschätzter Anteil des verbleibenden modellierten WEG-Rücklagenbestands, den ein Käufer über einen höheren Immobilienpreis honoriert. Standard sind konservative 0 %. Es ist kein separates Guthaben oder Auszahlungsrecht; bei positivem Ansatz steigen Verkaufspreis, prozentuale Verkaufskosten und gegebenenfalls der Gewinn nach § 23 EStG." />
                    </span>
                    <p className="text-sm font-bold text-slate-800 tabular-nums">{formatEUR(exitRes.ruecklagenRestwert)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Spekulationssteuer
                      <InfoTooltip content="Steuer auf private Veraeusserungsgewinne innerhalb der 10-Jahres-Frist nach §23 EStG; im Einkommensteuer-Modus als Tarifdifferenz inklusive Ergebnis aus Vermietung und Verpachtung (V&V) des Verkaufsjahrs." />
                    </span>
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
                        <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3">Jahr</th>
                        <th className="px-4 py-3">Kaltmiete (netto)</th>
                        <th className="px-4 py-3">Annuität</th>
                        <th className="px-4 py-3">Zinsen</th>
                        <th className="px-4 py-3">Steuereffekt</th>
                        <th className="px-4 py-3">Netto-CF p. a.</th>
                        <th className="px-4 py-3">WEG-Verwendung</th>
                        <th className="px-4 py-3">Rücklage/Reserve kum.</th>
                        <th className="px-4 py-3">Immobilienwert</th>
                        <th className="px-4 py-3">Restschuld</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium tabular-nums text-slate-700">
                      {proj.years.map((year) => (
                        <tr key={year.jahr} className="hover:bg-slate-50/50">
                          <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-900">{year.jahr}</td>
                          <td className="px-4 py-3">{formatEUR(year.nettoKaltmiete)}</td>
                          <td className="px-4 py-3">{formatEUR(year.annuitaet)}</td>
                          <td className="px-4 py-3 text-rose-600">{formatEUR(year.zins)}</td>
                          <td className={`px-4 py-3 ${year.steuereffekt < 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {year.steuereffekt < 0 ? `+${formatEUR(Math.abs(year.steuereffekt))}` : `-${formatEUR(year.steuereffekt)}`}
                          </td>
                          <td className={`px-4 py-3 font-semibold ${year.cashflowNachSteuer >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {formatEUR(year.cashflowNachSteuer)}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{formatEUR(year.ruecklagenEntnahme)}</td>
                          <td className="px-4 py-3 text-slate-700">{formatEUR(year.kumulierteRuecklage)}</td>
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
                            <th className="sticky left-0 z-20 min-w-[180px] bg-slate-50 px-4 py-3">Metrik</th>
                            {comparisonData.map(d => (
                              <th key={d.id} className={`px-4 py-3 text-right min-w-[140px] ${d.id === active.id ? 'bg-blue-50/50 text-blue-800 font-extrabold' : ''}`}>
                                {d.name} {d.id === active.id ? '(Aktiv)' : ''}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 tabular-nums">
                          <tr className="hover:bg-slate-50/50">
                            <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-700">Kaufpreis</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20 font-bold' : ''}`}>
                                {formatEUR(d.kaufpreis)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-700">Gesamterwerbskosten</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20' : ''}`}>
                                {formatEUR(d.totalInvest)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-700">Eigenkapitaleinsatz</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20 font-bold' : ''}`}>
                                {formatEUR(d.equity)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-700">Darlehenssumme</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20' : ''}`}>
                                {formatEUR(d.loan)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-700">Sollzins p. a.</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20' : ''}`}>
                                {formatPercent(d.sollzins)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-700">Zinsbindung</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20' : ''}`}>
                                {d.zinsbindung} Jahre
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-700">CF n. St. / Monat (J. 1)</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right font-semibold ${d.id === active.id ? 'bg-blue-50/20' : ''} ${d.cf1 >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {formatEUR(d.cf1)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-700">Netto-Mietrendite</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20 font-bold' : ''}`}>
                                {formatPercent(d.nettoMietrendite)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50 bg-slate-50/30">
                            <td className="sticky left-0 bg-slate-50 px-4 py-3 font-bold text-slate-800">Gesamtrendite (IRR)</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-blue-700 font-extrabold ${d.id === active.id ? 'bg-blue-50/30 text-base' : ''}`}>
                                {formatPercent(d.irr)} p. a.
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-700">Nettovermögen (Exit-Jahr)</td>
                            {comparisonData.map(d => (
                              <td key={d.id} className={`px-4 py-3 text-right text-slate-900 ${d.id === active.id ? 'bg-blue-50/20 font-bold' : ''}`}>
                                {formatEUR(d.netWealth)}
                              </td>
                            ))}
                          </tr>
                          <tr className="hover:bg-slate-50/50">
                            <td className="sticky left-0 bg-white px-4 py-3 font-semibold text-slate-700">Netto-Exit-Erlös n. St.</td>
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                          margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                          <XAxis type="number" domain={['auto', 'auto']} tickFormatter={(v) => `${v.toFixed(1)}%`} fontSize={10} />
                          <YAxis type="category" dataKey="label" fontSize={10} width={96} />
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                        <AreaChart data={etfHistoryData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
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
                        <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Im Jahresraster steuerfrei ab</div>
                        <div className="text-lg font-extrabold text-blue-700 tabular-nums">Jahr {holdingAnalysis.steuerfreiAbJahr}</div>
                        <div className="text-xs text-blue-600/80">Modellgrenze; exakte Vertragsdaten separat prüfen</div>
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
                          margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
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
                            x={holdingAnalysis.steuerfreiAbJahr}
                            stroke="#3b82f6"
                            strokeDasharray="4 4"
                            label={{ value: 'Modell: steuerfrei', position: 'top', fill: '#2563eb', fontSize: 10 }}
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
                              <th className="sticky left-0 z-20 bg-white py-2 pr-3 font-semibold">Jahr</th>
                              <th className="py-2 px-3 font-semibold text-right">Immobilienwert</th>
                              <th className="py-2 px-3 font-semibold text-right">Restschuld</th>
                              <th className="py-2 px-3 font-semibold text-right">Netto-Erlös</th>
                              <th className="py-2 px-3 font-semibold text-right">Spek.-Steuer</th>
                              <th className="py-2 px-3 font-semibold text-right">Kum. Cashflow</th>
                              <th className="py-2 px-3 font-semibold text-right">Gesamtgewinn</th>
                              <th className="py-2 px-3 font-semibold text-right">EK-Rendite Start-EK</th>
                              <th className="py-2 px-3 font-semibold text-right">EK-Rendite inkl. Nachschuss</th>
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
                                  <td className={`sticky left-0 py-1.5 pr-3 ${isChosen ? 'bg-blue-50' : 'bg-white'}`}>
                                    {y.jahr}
                                    {y.jahr === holdingAnalysis.steuerfreiAbJahr && <span className="ml-1 text-[9px] text-blue-500">(Modell: steuerfrei)</span>}
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
                                  <td className="py-1.5 px-3 text-right">{formatPercent(y.ekRenditeGesamteinsatzPct)}</td>
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
                        ({formatEUR(holdingAnalysis.initialEquity)}). EK-Rendite Gesamteinsatz nutzt als Nenner Start-EK plus alle
                        negativen laufenden Cashflows als weitere EK-Nachschüsse.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Disclaimer Block */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 font-medium space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-1 font-bold text-slate-700 uppercase tracking-wider">
                <Info size={14} />
                <span>Disclaimer / Haftungsausschluss</span>
              </div>
              <p>
                Diese Anwendung dient ausschließlich zu Simulations- und Informationszwecken. Die berechneten Werte stellen keine steuerliche, rechtliche oder finanzielle Beratung dar. Gesetzliche Regelungen (wie EStG, Spekulationssteuer oder Abschreibungen) basieren auf den gesetzlichen Rahmenbedingungen für das Steuerjahr 2026. Eine Gewähr für die Richtigkeit, Aktualität oder Vollständigkeit der Daten wird nicht übernommen. Investitionsentscheidungen sollten immer unabhängig geprüft werden.
              </p>
              <div className="pt-1 font-bold text-slate-700 uppercase tracking-wider">Annahmen &amp; Vereinfachungen</div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Steuer-/AfA-Stand: Veranlagungsjahr 2026 (ESt-Tarif §32a, Grunderwerbsteuer je Bundesland, AfA-Sätze). Alle Werte in der UI editierbar.</li>
                <li>Steuereffekt aus Vermietung &amp; Verpachtung über den Tarif-Unterschied (mit/ohne V&amp;V) bzw. wahlweise über einen festen Grenzsteuersatz. Im Modell zählen insbesondere Schuldzinsen, AfA, sofort abziehbare nicht umlagefähige Kosten, leerstandsbedingt nicht erstattete umlagefähige Kosten und modellierte WEG-Verwendungen als Werbungskosten; Tilgung und die bloße Rücklagenzuführung nicht.</li>
                <li>Spekulationssteuer (§23 EStG) wird mit dem Grenzsteuersatz auf den Gewinn (inkl. Wiederaufnahme genutzter AfA) geschätzt; im Jahresraster ist Jahr 10 noch innerhalb der Frist, steuerfrei wird der Exit ab Jahr 11 modelliert.</li>
                <li>Im Wirtschaftsplan-Modus wird die eingestellte Quote jeder WEG-Jahreszuführung nach der gewählten Verzögerung als Verwendung für sofort abziehbaren Erhaltungsaufwand modelliert – ohne zweiten Cash-Abfluss. Reale Maßnahmen können insbesondere Herstellungskosten sein und dann steuerlich anders wirken. Im gemischten Detail-Schätzmodus werden weiterhin keine Entnahmen modelliert.</li>
                <li>Die verbleibende Rücklage hat standardmäßig 0 % Preiswirkung beim Exit. Eine höhere Quote bildet nur eine geschätzte Marktpreiswirkung ab, ist kein Auszahlungsanspruch gegen die WEG und darf nicht bereits in der Wertentwicklung beziehungsweise im Immobilienwert vor dieser Preiswirkung enthalten sein.</li>
                <li>Wert- und Mietentwicklung sind szenariobasiert (frei einstellbare Stufen/Raten), keine Marktprognose. Leerstand wirkt als Mietausfall und im Wirtschaftsplan-Modus zusätzlich auf den nicht erstatteten Anteil umlagefähiger Kosten.</li>
                <li>Nicht abgebildet: WEG-Sonderumlagen, individuelle Förderdarlehen, Umsatzsteuer-Option, gewerblicher Grundstückshandel, Bonitäts-/Liquiditätsprüfung der Bank.</li>
              </ul>
            </div>

          </div>

        </div>
        </AgentEditProvider>
      </main>
    </div>
  );
}
