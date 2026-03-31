import { useEffect, useMemo, useState } from "react";
import {
  createDeal,
  fetchDashboard,
  fetchDeals,
  previewDeal,
  queryAssistant,
  submitDealDecision,
  updateDealStage,
} from "./api";
import DashboardPanels, { computeCapitalPanel, computeDecisionQueue } from "./components/DashboardPanels";
import DealCard from "./components/DealCard";
import DetailPanel from "./components/DetailPanel";
import GovDealsScannerPanel from "./components/GovDealsScannerPanel";
import PreBidSanityModal from "./components/PreBidSanityModal";
import {
  CONDITION_GRADE_OPTIONS,
  DEAL_STAGES,
  SOURCE_PLATFORM_OPTIONS,
  TRANSPORT_TYPE_OPTIONS,
} from "./types";
import type {
  AssistantQueryResponse,
  CreateDealRequest,
  DashboardSummary,
  DealCategory,
  DealStage,
  DealView,
  IntakeCategory,
  ReconditioningRecord,
  TitleStatus,
  VehicleMarketIntel,
} from "./types";
import {
  computeEffectiveHourlyRate,
  createEmptyVehicleIntel,
  inferVehicleMarketIntel,
  loadMarketIntelMap,
  saveMarketIntelMap,
} from "./utils/marketIntel";
import {
  createEmptyReconditioningRecord,
  inferReconditioningForDeal,
  loadReconditioningMap,
  saveReconditioningMap,
} from "./utils/reconditioning";
import {
  buildCreateDealRequestFromOpportunity,
  buildCreateDealRequestFromWonIntake,
  buildKeywordOpportunities,
  buildManualOpportunity,
  buildOpportunityFromUrl,
  buildSniperAIPicks,
  computeSniperDashboardSummary,
  createInterestSignalRecord,
  createSniperDecisionRecord,
  DEFAULT_OPPORTUNITY_SORT_MODE,
  DEFAULT_SCANNER_FILTERS,
  setOpportunityInterest,
  setOpportunityStatus,
  toPreviewSnapshot,
  upsertOpportunities,
} from "./utils/govDealsScanner";
import type {
  GovDealsOpportunity,
  InterestSignalRecord,
  ManualOpportunityInput,
  OpportunityFilters,
  OpportunityPreviewSnapshot,
  OpportunitySortMode,
  SniperDecisionRecord,
  SniperPassReason,
  WonDealIntakeInput,
} from "./utils/govDealsScanner";
import "./App.css";

const INTAKE_QUEUE_STORAGE_KEY = "arbitrage_os_intake_queue_v1";
const GOVDEALS_OPPORTUNITIES_STORAGE_KEY = "arbitrage_os_govdeals_opportunities_v1";
const GOVDEALS_SCANNER_META_STORAGE_KEY = "arbitrage_os_govdeals_scanner_meta_v1";
const SNIPER_DECISIONS_STORAGE_KEY = "arbitrage_os_sniper_decisions_v1";
const INTEREST_SIGNALS_STORAGE_KEY = "arbitrage_os_interest_signals_v1";

type ActivePage =
  | "dashboard"
  | "opportunities"
  | "pipeline"
  | "intake"
  | "alerts"
  | "archive";
type OperatorMode = "manage" | "hunt" | "analyze";
type RightPanelDetailTab = "decision" | "market" | "recon";
type PipelineAlertFilter = "all" | "critical" | "warning" | "none";
type IntakeStep = 1 | 2 | 3;

const QUICK_ASSISTANT_PROMPTS = [
  "Explain this deal",
  "What should I do next?",
  "Why is this risky?",
] as const;

const CATEGORY_GROUP_OPTIONS: Record<IntakeCategory, DealCategory[]> = {
  vehicle: ["vehicle_suv", "vehicle_police_fleet"],
  electronics: ["electronics_bulk", "electronics_individual"],
  other: ["powersports"],
};

const getOperatorModeForPage = (page: ActivePage): OperatorMode => {
  if (page === "pipeline") {
    return "analyze";
  }
  if (page === "opportunities" || page === "intake") {
    return "hunt";
  }
  return "manage";
};

interface MonthlyPerformancePoint {
  month_key: string;
  month_label: string;
  revenue_confirmed: number;
  realized_net_confirmed: number;
  projected_net_estimated: number;
  effective_hourly_rate: number;
}

interface IntakeFormState {
  listing_url: string;
  title: string;
  source_platform: CreateDealRequest["source_platform"];
  category: DealCategory;
  acquisition_state: string;
  seller_type: "government" | "commercial" | "unknown";
  acquisition_cost: string;
  buyer_premium_pct: string;
  current_bid: string;
  auction_end: string;
  transport_type: CreateDealRequest["metadata"]["transport_type"];
  transport_cost_actual: string;
  transport_cost_estimated: string;
  repair_cost: string;
  prep_cost: string;
  estimated_market_value: string;
  condition_grade: CreateDealRequest["metadata"]["condition_grade"];
  condition_notes: string;
  title_status: TitleStatus;
  removal_deadline: string;
  quantity_purchased: string;
  quantity_broken: string;
  unit_count: string;
  units_total: string;
  units_working: string;
  units_minor_issue: string;
  units_defective: string;
  units_locked: string;
  prep_total_units: string;
  prep_working_units: string;
  prep_cosmetic_units: string;
  prep_functional_units: string;
  prep_defective_units: string;
  prep_locked_units: string;
  prep_total_prep_time_minutes: string;
  market_kbb_value: string;
  market_nada_value: string;
  market_carfax_status: string;
}

interface IntakeQueueEntry {
  id: string;
  created_at: string;
  listing_url: string;
  title: string;
  current_bid: string;
  auction_end: string;
  payload: CreateDealRequest;
}

const DEFAULT_INTAKE_FORM: IntakeFormState = {
  listing_url: "",
  title: "",
  source_platform: "govdeals",
  category: "vehicle_suv",
  acquisition_state: "TX",
  seller_type: "government",
  acquisition_cost: "",
  buyer_premium_pct: "0.1",
  current_bid: "",
  auction_end: "",
  transport_type: "auto_transport",
  transport_cost_actual: "",
  transport_cost_estimated: "",
  repair_cost: "",
  prep_cost: "",
  estimated_market_value: "",
  condition_grade: "used_good",
  condition_notes: "",
  title_status: "unknown",
  removal_deadline: "",
  quantity_purchased: "",
  quantity_broken: "",
  unit_count: "",
  units_total: "",
  units_working: "",
  units_minor_issue: "",
  units_defective: "",
  units_locked: "",
  prep_total_units: "",
  prep_working_units: "",
  prep_cosmetic_units: "",
  prep_functional_units: "",
  prep_defective_units: "",
  prep_locked_units: "",
  prep_total_prep_time_minutes: "",
  market_kbb_value: "",
  market_nada_value: "",
  market_carfax_status: "",
};

const nextStage = (status: DealStage): DealStage | null => {
  const index = DEAL_STAGES.indexOf(status);
  if (index < 0 || index === DEAL_STAGES.length - 1) {
    return null;
  }
  return DEAL_STAGES[index + 1];
};

const getCategoryGroup = (category: DealCategory): IntakeCategory => {
  if (category.startsWith("vehicle")) {
    return "vehicle";
  }
  if (category.startsWith("electronics")) {
    return "electronics";
  }
  return "other";
};

const toIsoOrNull = (value: string): string | null => {
  if (!value.trim()) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

const toOptionalNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const toOptionalInteger = (value: string): number | null => {
  const parsed = toOptionalNumber(value);
  if (parsed === null) {
    return null;
  }
  return Math.max(0, Math.floor(parsed));
};

const toDateTimeLocalInput = (value: string | null | undefined): string => {
  if (!value) {
    return "";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  return new Date(timestamp).toISOString().slice(0, 16);
};

const toVehicleIntelFromForm = (form: IntakeFormState): VehicleMarketIntel | null => {
  const kbb = toOptionalNumber(form.market_kbb_value);
  const nada = toOptionalNumber(form.market_nada_value);
  const carfax = form.market_carfax_status.trim();
  if (kbb === null && nada === null && !carfax) {
    return null;
  }
  return {
    kbb_value: kbb,
    nada_value: nada,
    carfax_status: carfax || null,
    manual_comps: [],
  };
};

function App() {
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [rightPanelMode, setRightPanelMode] = useState<"detail" | "assistant">("detail");
  const [rightPanelDetailTab, setRightPanelDetailTab] = useState<RightPanelDetailTab>("decision");
  const [pipelineAlertFilter, setPipelineAlertFilter] = useState<PipelineAlertFilter>("all");
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [intakeStep, setIntakeStep] = useState<IntakeStep>(1);
  const [intakeCategory, setIntakeCategory] = useState<IntakeCategory>("vehicle");
  const [deals, setDeals] = useState<DealView[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingDealId, setUpdatingDealId] = useState<string | null>(null);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantResponse, setAssistantResponse] = useState<AssistantQueryResponse | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [intakeStatusMessage, setIntakeStatusMessage] = useState<string | null>(null);
  const [intakePreviewDeal, setIntakePreviewDeal] = useState<DealView | null>(null);
  const [savedForLaterIntake, setSavedForLaterIntake] = useState<IntakeQueueEntry[]>([]);
  const [intakeForm, setIntakeForm] = useState<IntakeFormState>(DEFAULT_INTAKE_FORM);
  const [marketIntelMap, setMarketIntelMap] = useState<Record<string, VehicleMarketIntel>>({});
  const [reconditioningMap, setReconditioningMap] = useState<Record<string, ReconditioningRecord>>({});
  const [pendingApprovalDealId, setPendingApprovalDealId] = useState<string | null>(null);
  const [govDealsOpportunities, setGovDealsOpportunities] = useState<GovDealsOpportunity[]>([]);
  const [scannerFilters, setScannerFilters] = useState<OpportunityFilters>(DEFAULT_SCANNER_FILTERS);
  const [scannerSortMode, setScannerSortMode] =
    useState<OpportunitySortMode>(DEFAULT_OPPORTUNITY_SORT_MODE);
  const [operatorBaseState, setOperatorBaseState] = useState("TX");
  const [scannerPreviewsByOpportunityId, setScannerPreviewsByOpportunityId] = useState<
    Record<string, OpportunityPreviewSnapshot | undefined>
  >({});
  const [scannerBusyOpportunityId, setScannerBusyOpportunityId] = useState<string | null>(null);
  const [scannerStatusMessage, setScannerStatusMessage] = useState<string | null>(null);
  const [scannerErrorMessage, setScannerErrorMessage] = useState<string | null>(null);
  const [sniperDecisionHistory, setSniperDecisionHistory] = useState<SniperDecisionRecord[]>([]);
  const [interestSignalHistory, setInterestSignalHistory] = useState<InterestSignalRecord[]>([]);

  const isElectronicsCategory = intakeCategory === "electronics";
  const isVehicleCategory = intakeCategory === "vehicle";
  const quantityPurchased = toOptionalInteger(intakeForm.quantity_purchased) ?? 0;
  const quantityBroken = toOptionalInteger(intakeForm.quantity_broken) ?? 0;
  const autoWorkingUnits = Math.max(0, quantityPurchased - quantityBroken);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dealsResponse, dashboardResponse] = await Promise.all([fetchDeals(), fetchDashboard()]);
      setDeals(dealsResponse);
      setDashboard(dashboardResponse);
      if (!selectedDealId && dealsResponse.length > 0) {
        setSelectedDealId(dealsResponse[0].deal.id);
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load data";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    setMarketIntelMap(loadMarketIntelMap());
    setReconditioningMap(loadReconditioningMap());
  }, []);

  useEffect(() => {
    saveMarketIntelMap(marketIntelMap);
  }, [marketIntelMap]);

  useEffect(() => {
    saveReconditioningMap(reconditioningMap);
  }, [reconditioningMap]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(INTAKE_QUEUE_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as IntakeQueueEntry[];
      if (Array.isArray(parsed)) {
        setSavedForLaterIntake(
          parsed.filter(
            (entry) =>
              typeof entry?.id === "string" &&
              typeof entry?.created_at === "string" &&
              typeof entry?.title === "string" &&
              typeof entry?.listing_url === "string" &&
              typeof entry?.current_bid === "string" &&
              typeof entry?.auction_end === "string" &&
              entry?.payload &&
              typeof entry.payload === "object"
          )
        );
      }
    } catch {
      setSavedForLaterIntake([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(INTAKE_QUEUE_STORAGE_KEY, JSON.stringify(savedForLaterIntake));
  }, [savedForLaterIntake]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GOVDEALS_OPPORTUNITIES_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as GovDealsOpportunity[];
      if (Array.isArray(parsed)) {
        setGovDealsOpportunities(parsed);
      }
    } catch {
      setGovDealsOpportunities([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      GOVDEALS_OPPORTUNITIES_STORAGE_KEY,
      JSON.stringify(govDealsOpportunities)
    );
  }, [govDealsOpportunities]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(GOVDEALS_SCANNER_META_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        operator_base_state?: string;
        filters?: OpportunityFilters;
        sort_mode?: OpportunitySortMode;
      };
      if (typeof parsed.operator_base_state === "string" && parsed.operator_base_state.trim()) {
        setOperatorBaseState(parsed.operator_base_state.trim().toUpperCase().slice(0, 2));
      }
      if (parsed.filters && typeof parsed.filters === "object") {
        setScannerFilters(parsed.filters);
      }
      if (typeof parsed.sort_mode === "string") {
        setScannerSortMode(parsed.sort_mode);
      }
    } catch {
      // ignore malformed scanner meta
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      GOVDEALS_SCANNER_META_STORAGE_KEY,
      JSON.stringify({
        operator_base_state: operatorBaseState,
        filters: scannerFilters,
        sort_mode: scannerSortMode,
      })
    );
  }, [operatorBaseState, scannerFilters, scannerSortMode]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SNIPER_DECISIONS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as SniperDecisionRecord[];
      if (Array.isArray(parsed)) {
        setSniperDecisionHistory(parsed);
      }
    } catch {
      setSniperDecisionHistory([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SNIPER_DECISIONS_STORAGE_KEY, JSON.stringify(sniperDecisionHistory));
  }, [sniperDecisionHistory]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(INTEREST_SIGNALS_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as InterestSignalRecord[];
      if (Array.isArray(parsed)) {
        setInterestSignalHistory(parsed);
      }
    } catch {
      setInterestSignalHistory([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(INTEREST_SIGNALS_STORAGE_KEY, JSON.stringify(interestSignalHistory));
  }, [interestSignalHistory]);

  const selectedDeal =
    deals.find((deal) => deal.deal.id === selectedDealId) ??
    (selectedDealId?.startsWith("preview-") ? intakePreviewDeal : null) ??
    deals[0] ??
    null;

  const selectedDealMarketIntel = selectedDeal
    ? inferVehicleMarketIntel(selectedDeal, marketIntelMap)
    : createEmptyVehicleIntel();

  const selectedDealReconditioning = selectedDeal
    ? inferReconditioningForDeal(selectedDeal, reconditioningMap)
    : createEmptyReconditioningRecord();

  const pendingApprovalDeal = deals.find((item) => item.deal.id === pendingApprovalDealId) ?? null;
  const pendingApprovalReconditioning = pendingApprovalDeal
    ? inferReconditioningForDeal(pendingApprovalDeal, reconditioningMap)
    : createEmptyReconditioningRecord();

  const activeDealsCount =
    dashboard?.active_deals ?? deals.filter((item) => item.deal.status !== "completed").length;
  const completedDealsCount =
    dashboard?.completed_deals ?? deals.filter((item) => item.deal.status === "completed").length;
  const alertsCount = useMemo(
    () => deals.reduce((sum, item) => sum + (item.alerts?.length ?? 0), 0),
    [deals]
  );
  const criticalAlertsCount = useMemo(
    () =>
      deals.reduce(
        (sum, item) => sum + (item.alerts?.filter((alert) => alert.severity === "critical").length ?? 0),
        0
      ),
    [deals]
  );
  const availableLiquidCash = useMemo(() => computeCapitalPanel(deals).available_capital, [deals]);
  const capitalPanelSnapshot = useMemo(() => computeCapitalPanel(deals), [deals]);
  const decisionQueue = useMemo(() => computeDecisionQueue(deals), [deals]);
  const burnListUrgentCount = useMemo(() => {
    return deals.filter((deal) => {
      if (deal.deal.status === "completed") {
        return false;
      }
      if (deal.deal.category.startsWith("vehicle")) {
        return deal.calculations.days_in_current_stage > 14;
      }
      if (deal.deal.category.startsWith("electronics")) {
        return deal.calculations.days_in_current_stage > 7;
      }
      return deal.calculations.days_in_current_stage > 10;
    }).length;
  }, [deals]);
  const capitalLockWarningCount = useMemo(
    () =>
      deals.filter((deal) => {
        const warnings = deal.warnings ?? [];
        return warnings.includes("TITLE_DELAY") || warnings.includes("CAPITAL_LOCK");
      }).length,
    [deals]
  );
  const operatorMode = getOperatorModeForPage(activePage);
  const sniperPicks = useMemo(
    () =>
      buildSniperAIPicks(
        govDealsOpportunities,
        operatorBaseState,
        scannerPreviewsByOpportunityId,
        sniperDecisionHistory,
        availableLiquidCash
      ),
    [
      govDealsOpportunities,
      operatorBaseState,
      scannerPreviewsByOpportunityId,
      sniperDecisionHistory,
      availableLiquidCash,
    ]
  );
  const sniperDashboardSummary = useMemo(
    () => computeSniperDashboardSummary(sniperPicks, govDealsOpportunities, sniperDecisionHistory),
    [sniperPicks, govDealsOpportunities, sniperDecisionHistory]
  );

  const pipelineDeals = useMemo(() => {
    if (pipelineAlertFilter === "all") {
      return deals;
    }
    if (pipelineAlertFilter === "critical") {
      return deals.filter((deal) => deal.alerts?.some((alert) => alert.severity === "critical"));
    }
    if (pipelineAlertFilter === "warning") {
      return deals.filter((deal) => {
        const hasCritical = deal.alerts?.some((alert) => alert.severity === "critical") ?? false;
        const hasWarning = deal.alerts?.some((alert) => alert.severity === "warning") ?? false;
        return !hasCritical && hasWarning;
      });
    }
    return deals.filter((deal) => (deal.alerts?.length ?? 0) === 0);
  }, [deals, pipelineAlertFilter]);

  const monthlyPerformance = useMemo<MonthlyPerformancePoint[]>(() => {
    const monthFormatter = new Intl.DateTimeFormat(undefined, {
      month: "short",
      year: "numeric",
    });
    const monthBuckets = new Map<
      string,
      MonthlyPerformancePoint & { ehr_sum: number; ehr_count: number }
    >();
    const upsertMonth = (iso: string) => {
      const timestamp = Date.parse(iso);
      if (!Number.isFinite(timestamp)) {
        return null;
      }
      const date = new Date(timestamp);
      const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
      if (!monthBuckets.has(monthKey)) {
        monthBuckets.set(monthKey, {
          month_key: monthKey,
          month_label: monthFormatter.format(monthStart),
          revenue_confirmed: 0,
          realized_net_confirmed: 0,
          projected_net_estimated: 0,
          effective_hourly_rate: 0,
          ehr_sum: 0,
          ehr_count: 0,
        });
      }
      return monthBuckets.get(monthKey) ?? null;
    };

    deals.forEach((item) => {
      const monthIso =
        item.deal.status === "completed"
          ? item.deal.completion_date ?? item.deal.sale_date ?? item.deal.stage_updated_at
          : item.deal.stage_updated_at;
      const bucket = upsertMonth(monthIso);
      if (!bucket) {
        return;
      }

      if (item.deal.status === "completed") {
        bucket.revenue_confirmed += Math.max(0, item.financials.sale_price_actual ?? 0);
        bucket.realized_net_confirmed += item.calculations.realized_profit ?? 0;
      } else {
        bucket.projected_net_estimated += item.calculations.projected_profit;
      }

      const ehr = computeEffectiveHourlyRate(item);
      if (ehr !== null) {
        bucket.ehr_sum += ehr;
        bucket.ehr_count += 1;
      }
    });

    return Array.from(monthBuckets.values())
      .map((item) => ({
        month_key: item.month_key,
        month_label: item.month_label,
        revenue_confirmed: item.revenue_confirmed,
        realized_net_confirmed: item.realized_net_confirmed,
        projected_net_estimated: item.projected_net_estimated,
        effective_hourly_rate: item.ehr_count > 0 ? item.ehr_sum / item.ehr_count : 0,
      }))
      .sort((a, b) => a.month_key.localeCompare(b.month_key))
      .slice(-8);
  }, [deals]);

  const monthlyChartScale = useMemo(() => {
    const maxAbsValue = monthlyPerformance.reduce((max, item) => {
      const localMaxAbs = Math.max(
        Math.abs(item.revenue_confirmed),
        Math.abs(item.realized_net_confirmed),
        Math.abs(item.projected_net_estimated)
      );
      return Math.max(max, localMaxAbs);
    }, 0);
    return maxAbsValue > 0 ? maxAbsValue : 1;
  }, [monthlyPerformance]);

  const monthlyEhrScale = useMemo(() => {
    const maxAbs = monthlyPerformance.reduce(
      (max, item) => Math.max(max, Math.abs(item.effective_hourly_rate)),
      0
    );
    return maxAbs > 0 ? maxAbs : 1;
  }, [monthlyPerformance]);

  const updateForm = <K extends keyof IntakeFormState>(field: K, value: IntakeFormState[K]) => {
    setIntakeForm((prev) => ({ ...prev, [field]: value }));
  };

  const buildIntakePayload = (): CreateDealRequest => {
    const currentBid = toOptionalNumber(intakeForm.current_bid) ?? 0;
    const acquisitionCost = toOptionalNumber(intakeForm.acquisition_cost) ?? currentBid;
    const estimatedMarketValue =
      toOptionalNumber(intakeForm.estimated_market_value) ?? Math.max(0, acquisitionCost * 1.35);
    const hasUnitBreakdown = [
      intakeForm.units_total,
      intakeForm.units_working,
      intakeForm.units_minor_issue,
      intakeForm.units_defective,
      intakeForm.units_locked,
    ].some((value) => value.trim().length > 0);
    const hasPrepMetrics = [
      intakeForm.prep_total_units,
      intakeForm.prep_working_units,
      intakeForm.prep_cosmetic_units,
      intakeForm.prep_functional_units,
      intakeForm.prep_defective_units,
      intakeForm.prep_locked_units,
      intakeForm.prep_total_prep_time_minutes,
    ].some((value) => value.trim().length > 0);
    const conditionNotes = intakeForm.condition_notes.trim();
    const sourceLine = intakeForm.listing_url.trim()
      ? `Source: ${intakeForm.listing_url.trim()}`
      : "";
    const mergedConditionNotes = [conditionNotes || "No condition notes provided.", sourceLine]
      .filter(Boolean)
      .join("\n");
    const intakeIntel = toVehicleIntelFromForm(intakeForm);
    const computedWorkingUnits =
      toOptionalInteger(intakeForm.units_working) ??
      (isElectronicsCategory ? autoWorkingUnits : 0);

    return {
      label: intakeForm.title.trim() || "GovDeals Intake",
      category: intakeForm.category,
      source_platform: intakeForm.source_platform,
      seller_type: intakeForm.seller_type,
      acquisition_state: intakeForm.acquisition_state.trim().toUpperCase(),
      discovered_date: toIsoOrNull(intakeForm.auction_end),
      quantity_purchased: toOptionalInteger(intakeForm.quantity_purchased),
      quantity_broken: toOptionalInteger(intakeForm.quantity_broken),
      financials: {
        acquisition_cost: acquisitionCost,
        buyer_premium_pct: toOptionalNumber(intakeForm.buyer_premium_pct) ?? 0.1,
        transport_cost_actual: toOptionalNumber(intakeForm.transport_cost_actual),
        transport_cost_estimated: toOptionalNumber(intakeForm.transport_cost_estimated),
        repair_cost: toOptionalNumber(intakeForm.repair_cost),
        prep_cost: toOptionalNumber(intakeForm.prep_cost),
        estimated_market_value: estimatedMarketValue,
      },
      metadata: {
        condition_grade: intakeForm.condition_grade,
        condition_notes: mergedConditionNotes,
        transport_type: intakeForm.transport_type,
        presentation_quality: "standard",
        removal_deadline: toIsoOrNull(intakeForm.removal_deadline),
        title_status: intakeForm.title_status,
      },
      unit_count: toOptionalInteger(intakeForm.unit_count),
      unit_breakdown: hasUnitBreakdown
        ? {
            units_total: toOptionalInteger(intakeForm.units_total) ?? 0,
            units_working: computedWorkingUnits,
            units_minor_issue: toOptionalInteger(intakeForm.units_minor_issue) ?? 0,
            units_defective: toOptionalInteger(intakeForm.units_defective) ?? 0,
            units_locked: toOptionalInteger(intakeForm.units_locked) ?? 0,
          }
        : undefined,
      prep_metrics: hasPrepMetrics
        ? {
            total_units: toOptionalInteger(intakeForm.prep_total_units) ?? 0,
            working_units: toOptionalInteger(intakeForm.prep_working_units) ?? 0,
            cosmetic_units: toOptionalInteger(intakeForm.prep_cosmetic_units) ?? 0,
            functional_units: toOptionalInteger(intakeForm.prep_functional_units) ?? 0,
            defective_units: toOptionalInteger(intakeForm.prep_defective_units) ?? 0,
            locked_units: toOptionalInteger(intakeForm.prep_locked_units) ?? 0,
            total_prep_time_minutes: toOptionalNumber(intakeForm.prep_total_prep_time_minutes) ?? 0,
          }
        : undefined,
      market_intel: intakeIntel,
    };
  };

  const resetIntakeForm = (): void => {
    setIntakeForm(DEFAULT_INTAKE_FORM);
    setIntakeCategory(getCategoryGroup(DEFAULT_INTAKE_FORM.category));
    setIntakeStep(1);
    setShowAdvancedFields(false);
  };

  const saveIntelForDeal = (dealId: string, intel: VehicleMarketIntel | null): void => {
    if (!intel) {
      return;
    }
    setMarketIntelMap((prev) => ({
      ...prev,
      [dealId]: intel,
    }));
  };

  const handleIntakePreview = async () => {
    setSubmitting(true);
    setError(null);
    setIntakeStatusMessage(null);
    try {
      const payload = buildIntakePayload();
      const preview = await previewDeal(payload);
      setIntakePreviewDeal(preview);
      setSelectedDealId(preview.deal.id);
      setRightPanelMode("detail");
      setIntakeStatusMessage("Preview ready. This is not yet a created deal.");
      saveIntelForDeal(preview.deal.id, payload.market_intel ?? null);
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : "Failed intake preview";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleIntakeCreateDeal = async () => {
    setSubmitting(true);
    setError(null);
    setIntakeStatusMessage(null);
    try {
      const payload = buildIntakePayload();
      const created = await createDeal(payload);
      setSelectedDealId(created.deal.id);
      setIntakePreviewDeal(null);
      setActivePage("pipeline");
      setRightPanelMode("detail");
      setRightPanelDetailTab("decision");
      setIntakeStatusMessage("Deal created from intake.");
      saveIntelForDeal(created.deal.id, payload.market_intel ?? null);
      resetIntakeForm();
      await loadData();
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Failed to create intake deal";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleIntakePass = () => {
    setIntakeStatusMessage("Intake item passed.");
    setIntakePreviewDeal(null);
    if (selectedDealId?.startsWith("preview-")) {
      setSelectedDealId(deals[0]?.deal.id ?? null);
    }
  };

  const handleIntakeSaveForLater = () => {
    const payload = buildIntakePayload();
    const queueItem: IntakeQueueEntry = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      listing_url: intakeForm.listing_url,
      title: intakeForm.title,
      current_bid: intakeForm.current_bid,
      auction_end: intakeForm.auction_end,
      payload,
    };
    setSavedForLaterIntake((prev) => [queueItem, ...prev].slice(0, 100));
    setIntakeStatusMessage("Saved for later review (persisted locally).");
  };

  const handleLoadQueueEntry = async (entry: IntakeQueueEntry) => {
    setSubmitting(true);
    setError(null);
    setIntakeStatusMessage(null);
    try {
      const preview = await previewDeal(entry.payload);
      setIntakePreviewDeal(preview);
      setSelectedDealId(preview.deal.id);
      setRightPanelMode("detail");
      setIntakeStatusMessage("Queue item loaded into preview.");

      const group = getCategoryGroup(entry.payload.category);
      setIntakeCategory(group);
      setIntakeStep(3);

      setIntakeForm((prev) => ({
        ...prev,
        listing_url: entry.listing_url,
        title: entry.title,
        source_platform: entry.payload.source_platform,
        current_bid: entry.current_bid,
        auction_end: entry.auction_end,
        category: entry.payload.category,
        acquisition_state: entry.payload.acquisition_state,
        seller_type: entry.payload.seller_type ?? "unknown",
        acquisition_cost: String(entry.payload.financials.acquisition_cost),
        buyer_premium_pct:
          entry.payload.financials.buyer_premium_pct !== undefined
            ? String(entry.payload.financials.buyer_premium_pct)
            : "",
        transport_type: entry.payload.metadata.transport_type,
        transport_cost_actual:
          entry.payload.financials.transport_cost_actual !== null &&
          entry.payload.financials.transport_cost_actual !== undefined
            ? String(entry.payload.financials.transport_cost_actual)
            : "",
        transport_cost_estimated:
          entry.payload.financials.transport_cost_estimated !== null &&
          entry.payload.financials.transport_cost_estimated !== undefined
            ? String(entry.payload.financials.transport_cost_estimated)
            : "",
        repair_cost:
          entry.payload.financials.repair_cost !== null &&
          entry.payload.financials.repair_cost !== undefined
            ? String(entry.payload.financials.repair_cost)
            : "",
        prep_cost:
          entry.payload.financials.prep_cost !== null && entry.payload.financials.prep_cost !== undefined
            ? String(entry.payload.financials.prep_cost)
            : "",
        estimated_market_value: String(entry.payload.financials.estimated_market_value),
        condition_grade: entry.payload.metadata.condition_grade,
        condition_notes: entry.payload.metadata.condition_notes,
        title_status: entry.payload.metadata.title_status ?? "unknown",
        removal_deadline: toDateTimeLocalInput(entry.payload.metadata.removal_deadline),
        quantity_purchased:
          entry.payload.quantity_purchased !== null && entry.payload.quantity_purchased !== undefined
            ? String(entry.payload.quantity_purchased)
            : "",
        quantity_broken:
          entry.payload.quantity_broken !== null && entry.payload.quantity_broken !== undefined
            ? String(entry.payload.quantity_broken)
            : "",
        unit_count:
          entry.payload.unit_count !== null && entry.payload.unit_count !== undefined
            ? String(entry.payload.unit_count)
            : "",
        units_total: entry.payload.unit_breakdown ? String(entry.payload.unit_breakdown.units_total) : "",
        units_working: entry.payload.unit_breakdown ? String(entry.payload.unit_breakdown.units_working) : "",
        units_minor_issue: entry.payload.unit_breakdown
          ? String(entry.payload.unit_breakdown.units_minor_issue)
          : "",
        units_defective: entry.payload.unit_breakdown ? String(entry.payload.unit_breakdown.units_defective) : "",
        units_locked: entry.payload.unit_breakdown ? String(entry.payload.unit_breakdown.units_locked) : "",
        prep_total_units: entry.payload.prep_metrics ? String(entry.payload.prep_metrics.total_units) : "",
        prep_working_units: entry.payload.prep_metrics ? String(entry.payload.prep_metrics.working_units) : "",
        prep_cosmetic_units: entry.payload.prep_metrics ? String(entry.payload.prep_metrics.cosmetic_units) : "",
        prep_functional_units: entry.payload.prep_metrics
          ? String(entry.payload.prep_metrics.functional_units)
          : "",
        prep_defective_units: entry.payload.prep_metrics ? String(entry.payload.prep_metrics.defective_units) : "",
        prep_locked_units: entry.payload.prep_metrics ? String(entry.payload.prep_metrics.locked_units) : "",
        prep_total_prep_time_minutes: entry.payload.prep_metrics
          ? String(entry.payload.prep_metrics.total_prep_time_minutes)
          : "",
        market_kbb_value:
          entry.payload.market_intel?.kbb_value !== null &&
          entry.payload.market_intel?.kbb_value !== undefined
            ? String(entry.payload.market_intel.kbb_value)
            : "",
        market_nada_value:
          entry.payload.market_intel?.nada_value !== null &&
          entry.payload.market_intel?.nada_value !== undefined
            ? String(entry.payload.market_intel.nada_value)
            : "",
        market_carfax_status: entry.payload.market_intel?.carfax_status ?? "",
      }));
      setShowAdvancedFields(Boolean(entry.payload.prep_metrics || entry.payload.unit_breakdown));
      if (entry.payload.market_intel) {
        saveIntelForDeal(preview.deal.id, entry.payload.market_intel);
      }
    } catch (queueError) {
      const message = queueError instanceof Error ? queueError.message : "Failed to load queue item";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveQueueEntry = (id: string): void => {
    setSavedForLaterIntake((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleRequestApproveDecision = (dealId: string): void => {
    setPendingApprovalDealId(dealId);
  };

  const handleApproveWithSanityCheck = async (dealId: string): Promise<void> => {
    const targetDeal = deals.find((item) => item.deal.id === dealId);
    if (!targetDeal) {
      setError("Deal not found for approval.");
      return;
    }
    try {
      await submitDealDecision(dealId, {
        decision: "approved",
        reason: "Approved after pre-bid sanity check acknowledgement.",
      });
      await loadData();
      setPendingApprovalDealId(null);
    } catch (approvalError) {
      const message =
        approvalError instanceof Error ? approvalError.message : "Failed to approve after sanity check";
      setError(message);
    }
  };

  const handleReconditioningChange = (dealId: string, record: ReconditioningRecord): void => {
    setReconditioningMap((prev) => ({
      ...prev,
      [dealId]: record,
    }));
  };

  const handleStageAdvance = async (deal: DealView) => {
    const stage = nextStage(deal.deal.status);
    if (!stage) {
      return;
    }
    setUpdatingDealId(deal.deal.id);
    setError(null);
    try {
      if (stage === "completed") {
        const saleInput = window.prompt(
          `Enter sale_price_actual for ${deal.deal.label}`,
          deal.financials.estimated_market_value.toString()
        );
        const completionInput = window.prompt(
          `Enter completion_date (YYYY-MM-DD) for ${deal.deal.label}`,
          new Date().toISOString().slice(0, 10)
        );
        if (!saleInput || !completionInput) {
          setError("Completion requires sale price and completion date.");
          return;
        }
        const saleValue = Number(saleInput);
        if (Number.isNaN(saleValue) || saleValue <= 0) {
          setError("sale_price_actual must be a positive number.");
          return;
        }
        await updateDealStage(deal.deal.id, stage, {
          sale_price_actual: saleValue,
          completion_date: completionInput,
        });
      } else {
        await updateDealStage(deal.deal.id, stage);
      }
      await loadData();
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Failed to update stage";
      setError(message);
    } finally {
      setUpdatingDealId(null);
    }
  };

  const handleAssistantSubmit = async () => {
    if (!selectedDeal) {
      setAssistantError("Select a deal first.");
      return;
    }
    const trimmedQuestion = assistantQuestion.trim();
    if (!trimmedQuestion) {
      return;
    }
    setAssistantLoading(true);
    setAssistantError(null);
    try {
      const response = await queryAssistant({
        deal_id: selectedDeal.deal.id,
        question: trimmedQuestion,
      });
      setAssistantResponse(response);
    } catch (assistantQueryError) {
      const message =
        assistantQueryError instanceof Error ? assistantQueryError.message : "Assistant query failed";
      setAssistantError(message);
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleMarketIntelChange = (dealId: string, intel: VehicleMarketIntel) => {
    setMarketIntelMap((prev) => ({
      ...prev,
      [dealId]: intel,
    }));
  };

  const clearScannerMessages = (): void => {
    setScannerStatusMessage(null);
    setScannerErrorMessage(null);
  };

  const handleScannerImportUrl = (listingUrl: string, keywordHint: string): void => {
    clearScannerMessages();
    const trimmed = listingUrl.trim();
    if (!trimmed) {
      setScannerErrorMessage("Listing URL is required.");
      return;
    }
    const opportunity = buildOpportunityFromUrl(trimmed, keywordHint);
    setGovDealsOpportunities((prev) => upsertOpportunities(prev, [opportunity]));
    setScannerStatusMessage("URL imported into opportunities.");
  };

  const handleScannerKeywordSearch = (keyword: string): void => {
    clearScannerMessages();
    const trimmed = keyword.trim();
    if (!trimmed) {
      setScannerErrorMessage("Keyword is required.");
      return;
    }
    const results = buildKeywordOpportunities(trimmed);
    setGovDealsOpportunities((prev) => upsertOpportunities(prev, results));
    setScannerStatusMessage(`Keyword search added ${results.length} opportunity result(s).`);
  };

  const handleScannerManualImport = (input: ManualOpportunityInput): void => {
    clearScannerMessages();
    if (!input.title.trim()) {
      setScannerErrorMessage("Manual import requires a title.");
      return;
    }
    const manual = buildManualOpportunity(input);
    setGovDealsOpportunities((prev) => upsertOpportunities(prev, [manual]));
    setScannerStatusMessage("Manual listing imported.");
  };

  const handleScannerPreview = async (opportunity: GovDealsOpportunity): Promise<void> => {
    setScannerBusyOpportunityId(opportunity.id);
    clearScannerMessages();
    try {
      const payload = buildCreateDealRequestFromOpportunity(opportunity, operatorBaseState);
      const preview = await previewDeal(payload);
      setScannerPreviewsByOpportunityId((prev) => ({
        ...prev,
        [opportunity.id]: toPreviewSnapshot(preview),
      }));
      setIntakePreviewDeal(preview);
      setSelectedDealId(preview.deal.id);
      setRightPanelMode("detail");
      setScannerStatusMessage("Opportunity preview computed using backend enrichment.");
    } catch (previewError) {
      const message = previewError instanceof Error ? previewError.message : "Failed opportunity preview";
      setScannerErrorMessage(message);
    } finally {
      setScannerBusyOpportunityId(null);
    }
  };

  const handleScannerWatch = (opportunityId: string): void => {
    clearScannerMessages();
    setGovDealsOpportunities((prev) => setOpportunityStatus(prev, opportunityId, "watch"));
    setScannerStatusMessage("Opportunity added to watch.");
  };

  const handleScannerPass = (opportunityId: string): void => {
    clearScannerMessages();
    setGovDealsOpportunities((prev) => setOpportunityStatus(prev, opportunityId, "passed"));
    setScannerStatusMessage("Opportunity passed.");
  };

  const handleScannerCreateDeal = async (opportunity: GovDealsOpportunity): Promise<void> => {
    setScannerBusyOpportunityId(opportunity.id);
    clearScannerMessages();
    try {
      const payload = buildCreateDealRequestFromOpportunity(opportunity, operatorBaseState);
      const created = await createDeal(payload);
      setSelectedDealId(created.deal.id);
      setIntakePreviewDeal(null);
      setActivePage("pipeline");
      setRightPanelMode("detail");
      setRightPanelDetailTab("decision");
      setGovDealsOpportunities((prev) => setOpportunityStatus(prev, opportunity.id, "converted"));
      await loadData();
      setScannerStatusMessage("Deal created from opportunity.");
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Failed to create deal from opportunity";
      setScannerErrorMessage(message);
    } finally {
      setScannerBusyOpportunityId(null);
    }
  };

  const handleScannerSetInterest = (
    opportunityId: string,
    interest: "interested" | "not_interested" | "undecided"
  ): void => {
    clearScannerMessages();
    const priorSnapshot = govDealsOpportunities.find((item) => item.id === opportunityId) ?? null;
    setGovDealsOpportunities((prev) => {
      return setOpportunityInterest(prev, opportunityId, interest);
    });
    if (priorSnapshot) {
      setInterestSignalHistory((prev) => [createInterestSignalRecord(priorSnapshot, interest), ...prev]);
    }
    setScannerStatusMessage(
      interest === "interested"
        ? "Marked as interested for pattern tracking."
        : interest === "not_interested"
          ? "Marked as not interested for pattern tracking."
          : "Interest reset to undecided."
    );
  };

  const handleScannerCreateFromWonDeal = async (
    opportunity: GovDealsOpportunity,
    intake: WonDealIntakeInput
  ): Promise<void> => {
    setScannerBusyOpportunityId(opportunity.id);
    clearScannerMessages();
    try {
      const payload = buildCreateDealRequestFromWonIntake(opportunity, intake, operatorBaseState);
      const created = await createDeal(payload);
      setSelectedDealId(created.deal.id);
      setIntakePreviewDeal(null);
      setActivePage("pipeline");
      setRightPanelMode("detail");
      setRightPanelDetailTab("decision");
      setGovDealsOpportunities((prev) => setOpportunityStatus(prev, opportunity.id, "converted"));
      await loadData();
      setScannerStatusMessage("Won deal imported and calculated using final numbers.");
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Failed to import won deal details";
      setScannerErrorMessage(message);
    } finally {
      setScannerBusyOpportunityId(null);
    }
  };

  const handleSniperDecision = (
    opportunity: GovDealsOpportunity,
    score: number,
    decision: "approved" | "passed",
    passReason: SniperPassReason | null,
    note: string | null
  ): void => {
    clearScannerMessages();
    const nextRecord = createSniperDecisionRecord(opportunity, score, decision, passReason, note);
    setSniperDecisionHistory((prev) => [nextRecord, ...prev]);
    if (decision === "approved") {
      setGovDealsOpportunities((prev) => setOpportunityStatus(prev, opportunity.id, "watch"));
      setScannerStatusMessage("Sniper pick approved.");
    } else {
      setGovDealsOpportunities((prev) => setOpportunityStatus(prev, opportunity.id, "passed"));
      setScannerStatusMessage(`Sniper pick passed (${passReason ?? "unspecified"}).`);
    }
  };

  const step2Ready =
    intakeForm.title.trim().length > 0 &&
    intakeForm.acquisition_state.trim().length > 0 &&
    (toOptionalNumber(intakeForm.acquisition_cost) ?? 0) > 0;
  const step3Ready = (toOptionalNumber(intakeForm.estimated_market_value) ?? 0) > 0;

  return (
    <main className={`operator-shell mode-${operatorMode}`}>
      <header className="top-bar">
        <div className="top-bar-title">
          <h2>Operator Command Surface</h2>
          <div className="mode-switcher">
            <span className={`mode-pill ${operatorMode === "hunt" ? "active" : ""}`}>Hunt Mode</span>
            <span className={`mode-pill ${operatorMode === "analyze" ? "active" : ""}`}>
              Analyze Mode
            </span>
            <span className={`mode-pill ${operatorMode === "manage" ? "active" : ""}`}>Manage Mode</span>
          </div>
        </div>
        <div className="kpi-card primary">
          <span>Realized Profit</span>
          <strong>${(dashboard?.realized_profit_total ?? 0).toFixed(2)}</strong>
        </div>
        <div className="kpi-card">
          <span>Projected Profit (estimate)</span>
          <strong>${(dashboard?.projected_profit_total ?? 0).toFixed(2)}</strong>
        </div>
        <div className="kpi-card">
          <span>Active Deals</span>
          <strong>{activeDealsCount}</strong>
        </div>
        <div className={`kpi-card alerts ${criticalAlertsCount > 0 ? "critical" : ""}`}>
          <span>Alerts</span>
          <strong>{alertsCount}</strong>
        </div>
        <div className="kpi-card">
          <span>Sniper AI Picks</span>
          <strong>{sniperDashboardSummary.picks_count}</strong>
        </div>
        <div className="kpi-card">
          <span>Approved Not Acted On</span>
          <strong>{sniperDashboardSummary.approved_not_acted_on}</strong>
        </div>
        <div className="kpi-card">
          <span>Passed: Distance / Funds</span>
          <strong>
            {sniperDashboardSummary.passed_breakdown.distance} /{" "}
            {sniperDashboardSummary.passed_breakdown.funds}
          </strong>
        </div>
        <div className="kpi-card">
          <span>Passed: Coordination / Risk</span>
          <strong>
            {sniperDashboardSummary.passed_breakdown.coordination} /{" "}
            {sniperDashboardSummary.passed_breakdown.risk}
          </strong>
        </div>
      </header>
      <section className="next-action-bar">
        <div className="next-action-mode">
          <span>Mode</span>
          <strong>
            {operatorMode === "manage"
              ? "Manage Mode"
              : operatorMode === "hunt"
                ? "Hunt Mode"
                : "Analyze Mode"}
          </strong>
        </div>
        <div className="next-action-item priority-high">
          <span>Deals needing decision</span>
          <strong>{decisionQueue.length}</strong>
        </div>
        <div className="next-action-item priority-high">
          <span>Burn list alerts</span>
          <strong>{burnListUrgentCount}</strong>
        </div>
        <div className="next-action-item priority-medium">
          <span>Capital locked warnings</span>
          <strong>{capitalLockWarningCount}</strong>
        </div>
        <div className="next-action-item priority-low">
          <span>Available capital</span>
          <strong>${capitalPanelSnapshot.available_capital.toFixed(0)}</strong>
        </div>
      </section>

      <div className="workspace-layout">
        <aside className="left-nav">
          <h1>Arbitrage OS</h1>
          <p>Operator Console</p>
          <p className="mode-chip">
            {operatorMode === "manage"
              ? "Manage Mode"
              : operatorMode === "hunt"
                ? "Hunt Mode"
                : "Analyze Mode"}
          </p>
          <button
            type="button"
            className={activePage === "dashboard" ? "active" : ""}
            onClick={() => setActivePage("dashboard")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={activePage === "opportunities" ? "active" : ""}
            onClick={() => setActivePage("opportunities")}
          >
            Opportunities
          </button>
          <button
            type="button"
            className={activePage === "pipeline" ? "active" : ""}
            onClick={() => setActivePage("pipeline")}
          >
            Pipeline
          </button>
          <button
            type="button"
            className={activePage === "intake" ? "active" : ""}
            onClick={() => setActivePage("intake")}
          >
            Intake
          </button>
          <button
            type="button"
            className={activePage === "alerts" ? "active" : ""}
            onClick={() => setActivePage("alerts")}
          >
            Alerts
          </button>
          <button
            type="button"
            className={activePage === "archive" ? "active" : ""}
            onClick={() => setActivePage("archive")}
          >
            Archive
          </button>
        </aside>

        <section className="main-area">
          {error ? <p className="error-banner">{error}</p> : null}

          {activePage === "dashboard" ? (
            <section className="panel priority-low">
              <h2 className="page-title">Decision Dashboard</h2>
              <div className="dashboard-grid">
                <article className="dashboard-stat-card">
                  <h3>Active Deals</h3>
                  <p>{activeDealsCount}</p>
                </article>
                <article className="dashboard-stat-card">
                  <h3>Completed Deals</h3>
                  <p>{completedDealsCount}</p>
                </article>
                <article className="dashboard-stat-card">
                  <h3>Projected Profit (estimate)</h3>
                  <p>${(dashboard?.projected_profit_total ?? 0).toFixed(2)}</p>
                </article>
                <article className="dashboard-stat-card">
                  <h3>Realized Profit</h3>
                  <p>${(dashboard?.realized_profit_total ?? 0).toFixed(2)}</p>
                </article>
              </div>

              <DashboardPanels deals={deals} reconditioningMap={reconditioningMap} />

              <div className="dashboard-chart-card low-emphasis">
                <h3>Monthly Revenue + Net + EHR</h3>
                <p className="chart-subtitle">
                  Revenue/net from completed deals, projected net from active deals, EHR from prep
                  time when available.
                </p>
                {monthlyPerformance.length === 0 ? (
                  <p>No monthly data yet.</p>
                ) : (
                  <>
                    <div className="chart-legend">
                      <span className="legend-chip revenue">Revenue (confirmed)</span>
                      <span className="legend-chip realized">Realized Net (confirmed)</span>
                      <span className="legend-chip projected">Projected Net (estimated)</span>
                      <span className="legend-chip ehr">Effective Hourly Rate</span>
                    </div>
                    <div className="monthly-chart-grid">
                      {monthlyPerformance.map((point) => {
                        const revenueHeight = Math.max(
                          4,
                          Math.round((Math.abs(point.revenue_confirmed) / monthlyChartScale) * 64)
                        );
                        const realizedHeight = Math.max(
                          4,
                          Math.round((Math.abs(point.realized_net_confirmed) / monthlyChartScale) * 64)
                        );
                        const projectedHeight = Math.max(
                          4,
                          Math.round((Math.abs(point.projected_net_estimated) / monthlyChartScale) * 64)
                        );
                        const ehrHeight = Math.max(
                          4,
                          Math.round((Math.abs(point.effective_hourly_rate) / monthlyEhrScale) * 64)
                        );
                        return (
                          <div className="month-column" key={point.month_key}>
                            <div className="bars bars-four">
                              <div className="bar-slot">
                                <div
                                  className="bar revenue"
                                  style={{ height: `${revenueHeight}px`, bottom: "50%" }}
                                  title={`Revenue: $${point.revenue_confirmed.toFixed(2)}`}
                                />
                              </div>
                              <div className="bar-slot">
                                <div
                                  className={`bar realized ${
                                    point.realized_net_confirmed < 0 ? "negative" : ""
                                  }`}
                                  style={
                                    point.realized_net_confirmed >= 0
                                      ? { height: `${realizedHeight}px`, bottom: "50%" }
                                      : { height: `${realizedHeight}px`, top: "50%" }
                                  }
                                  title={`Realized Net: $${point.realized_net_confirmed.toFixed(2)}`}
                                />
                              </div>
                              <div className="bar-slot">
                                <div
                                  className={`bar projected ${
                                    point.projected_net_estimated < 0 ? "negative" : ""
                                  }`}
                                  style={
                                    point.projected_net_estimated >= 0
                                      ? { height: `${projectedHeight}px`, bottom: "50%" }
                                      : { height: `${projectedHeight}px`, top: "50%" }
                                  }
                                  title={`Projected Net: $${point.projected_net_estimated.toFixed(2)}`}
                                />
                              </div>
                              <div className="bar-slot">
                                <div
                                  className={`bar ehr ${
                                    point.effective_hourly_rate < 0 ? "negative" : ""
                                  }`}
                                  style={
                                    point.effective_hourly_rate >= 0
                                      ? { height: `${ehrHeight}px`, bottom: "50%" }
                                      : { height: `${ehrHeight}px`, top: "50%" }
                                  }
                                  title={`EHR: $${point.effective_hourly_rate.toFixed(2)}/hr`}
                                />
                              </div>
                            </div>
                            <span className="month-label">{point.month_label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </section>
          ) : null}

          {activePage === "opportunities" ? (
            <GovDealsScannerPanel
              opportunities={govDealsOpportunities}
              operatorBaseState={operatorBaseState}
              filters={scannerFilters}
              sortMode={scannerSortMode}
              previewsByOpportunityId={scannerPreviewsByOpportunityId}
              busyOpportunityId={scannerBusyOpportunityId}
              statusMessage={scannerStatusMessage}
              errorMessage={scannerErrorMessage}
              onOperatorBaseStateChange={setOperatorBaseState}
              onFiltersChange={setScannerFilters}
              onSortModeChange={setScannerSortMode}
              onImportUrl={handleScannerImportUrl}
              onKeywordSearch={handleScannerKeywordSearch}
              onManualImport={handleScannerManualImport}
              onPreview={handleScannerPreview}
              onWatch={handleScannerWatch}
              onCreateDeal={handleScannerCreateDeal}
              onPass={handleScannerPass}
              onSetInterest={handleScannerSetInterest}
              onCreateFromWonDeal={handleScannerCreateFromWonDeal}
              sniperPicks={sniperPicks}
              sniperDashboardSummary={sniperDashboardSummary}
              onSniperApprove={(pick) =>
                handleSniperDecision(pick.opportunity, pick.score, "approved", null, null)
              }
              onSniperPass={(pick, reason, note) =>
                handleSniperDecision(pick.opportunity, pick.score, "passed", reason, note)
              }
            />
          ) : null}

          {activePage === "pipeline" ? (
            <section className="panel">
              <h2 className="page-title">Pipeline</h2>
              <div className="pipeline-filter-row">
                <span>Alert Filter:</span>
                {(["all", "critical", "warning", "none"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={pipelineAlertFilter === filter ? "active" : ""}
                    onClick={() => setPipelineAlertFilter(filter)}
                  >
                    {filter[0].toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>
              {loading ? <p>Loading...</p> : null}
              {!loading && pipelineDeals.length === 0 ? <p>No deals for this filter.</p> : null}
              <div className="deals">
                {pipelineDeals.map((item) => {
                  const next = nextStage(item.deal.status);
                  return (
                    <DealCard
                      key={item.deal.id}
                      deal={item}
                      selected={selectedDeal?.deal.id === item.deal.id}
                      nextStage={next}
                      disabled={!next || updatingDealId === item.deal.id}
                      onAdvance={() => void handleStageAdvance(item)}
                      onSelect={() => {
                        setSelectedDealId(item.deal.id);
                        setRightPanelMode("detail");
                        setAssistantResponse(null);
                      }}
                    />
                  );
                })}
              </div>
            </section>
          ) : null}

          {activePage === "intake" ? (
            <section className="panel">
              <h2 className="page-title">Adaptive Intake Flow</h2>
              <p className="section-subtitle">
                Step-based intake for speed and decision quality. Shared fields first, category
                specifics next.
              </p>

              <div className="intake-stepper">
                <span className={intakeStep === 1 ? "active" : ""}>Step 1: Category</span>
                <span className={intakeStep === 2 ? "active" : ""}>Step 2: Shared Fields</span>
                <span className={intakeStep === 3 ? "active" : ""}>Step 3: Category Fields + Review</span>
              </div>

              {intakeStep === 1 ? (
                <section className="form-section-card">
                  <h3>Select Category</h3>
                  <div className="intake-category-grid">
                    {(["vehicle", "electronics", "other"] as const).map((group) => (
                      <button
                        key={group}
                        type="button"
                        className={`intake-category-card ${intakeCategory === group ? "active" : ""}`}
                        onClick={() => {
                          setIntakeCategory(group);
                          updateForm("category", CATEGORY_GROUP_OPTIONS[group][0]);
                        }}
                      >
                        <strong>{group[0].toUpperCase() + group.slice(1)}</strong>
                        <span>{CATEGORY_GROUP_OPTIONS[group].join(" / ")}</span>
                      </button>
                    ))}
                  </div>
                  <div className="form-grid-two">
                    <label>
                      Specific Category
                      <select
                        value={intakeForm.category}
                        onChange={(event) => updateForm("category", event.target.value as DealCategory)}
                      >
                        {CATEGORY_GROUP_OPTIONS[intakeCategory].map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="entry-actions">
                    <button type="button" className="primary-button" onClick={() => setIntakeStep(2)}>
                      Continue
                    </button>
                  </div>
                </section>
              ) : null}

              {intakeStep === 2 ? (
                <section className="form-section-card">
                  <h3>Shared Fields</h3>
                  <div className="form-grid-two">
                    <label>
                      Label
                      <input
                        required
                        value={intakeForm.title}
                        onChange={(event) => updateForm("title", event.target.value)}
                      />
                    </label>
                    <label>
                      Source Platform
                      <select
                        value={intakeForm.source_platform}
                        onChange={(event) =>
                          updateForm(
                            "source_platform",
                            event.target.value as CreateDealRequest["source_platform"]
                          )
                        }
                      >
                        {SOURCE_PLATFORM_OPTIONS.map((platform) => (
                          <option key={platform} value={platform}>
                            {platform}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Acquisition State
                      <input
                        required
                        value={intakeForm.acquisition_state}
                        onChange={(event) => updateForm("acquisition_state", event.target.value.toUpperCase())}
                      />
                    </label>
                    <label>
                      Listing URL
                      <input
                        value={intakeForm.listing_url}
                        onChange={(event) => updateForm("listing_url", event.target.value)}
                      />
                    </label>
                    <label>
                      Seller Type
                      <select
                        value={intakeForm.seller_type}
                        onChange={(event) =>
                          updateForm("seller_type", event.target.value as IntakeFormState["seller_type"])
                        }
                      >
                        <option value="government">government</option>
                        <option value="commercial">commercial</option>
                        <option value="unknown">unknown</option>
                      </select>
                    </label>
                    <label>
                      Acquisition Cost
                      <input
                        type="number"
                        step="0.01"
                        value={intakeForm.acquisition_cost}
                        onChange={(event) => updateForm("acquisition_cost", event.target.value)}
                      />
                    </label>
                    <label>
                      Buyer Premium (decimal)
                      <input
                        type="number"
                        step="0.001"
                        value={intakeForm.buyer_premium_pct}
                        onChange={(event) => updateForm("buyer_premium_pct", event.target.value)}
                      />
                    </label>
                    <label>
                      Current Bid
                      <input
                        type="number"
                        step="0.01"
                        value={intakeForm.current_bid}
                        onChange={(event) => updateForm("current_bid", event.target.value)}
                      />
                    </label>
                    <label>
                      Auction End
                      <input
                        type="datetime-local"
                        value={intakeForm.auction_end}
                        onChange={(event) => updateForm("auction_end", event.target.value)}
                      />
                    </label>
                    <label>
                      Estimated Market Value
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={intakeForm.estimated_market_value}
                        onChange={(event) => updateForm("estimated_market_value", event.target.value)}
                      />
                    </label>
                  </div>
                  <div className="entry-actions">
                    <button type="button" className="ghost-button" onClick={() => setIntakeStep(1)}>
                      Back
                    </button>
                    <button
                      type="button"
                      className="primary-button"
                      disabled={!step2Ready}
                      onClick={() => setIntakeStep(3)}
                    >
                      Continue
                    </button>
                  </div>
                </section>
              ) : null}

              {intakeStep === 3 ? (
                <form
                  className="modern-entry-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleIntakePreview();
                  }}
                >
                  {isElectronicsCategory ? (
                    <section className="form-section-card prioritized-electronics-section">
                      <h3>Electronics Units (Top Priority)</h3>
                      <div className="form-grid-two">
                        <label>
                          Quantity Purchased
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={intakeForm.quantity_purchased}
                            onChange={(event) => updateForm("quantity_purchased", event.target.value)}
                          />
                        </label>
                        <label>
                          Quantity Broken
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={intakeForm.quantity_broken}
                            onChange={(event) => updateForm("quantity_broken", event.target.value)}
                          />
                        </label>
                        <label>
                          Auto Working Units
                          <input value={String(autoWorkingUnits)} disabled />
                        </label>
                        <label>
                          Unit Count (Fallback)
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.unit_count}
                            onChange={(event) => updateForm("unit_count", event.target.value)}
                          />
                        </label>
                      </div>
                    </section>
                  ) : null}

                  <section className="form-section-card">
                    <h3>{isVehicleCategory ? "Vehicle Fields" : "Category Fields"}</h3>
                    <div className="form-grid-two">
                      <label>
                        Transport Type
                        <select
                          value={intakeForm.transport_type}
                          onChange={(event) =>
                            updateForm(
                              "transport_type",
                              event.target.value as CreateDealRequest["metadata"]["transport_type"]
                            )
                          }
                        >
                          {TRANSPORT_TYPE_OPTIONS.map((transportType) => (
                            <option key={transportType} value={transportType}>
                              {transportType}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Transport Cost (Actual)
                        <input
                          type="number"
                          step="0.01"
                          value={intakeForm.transport_cost_actual}
                          onChange={(event) => updateForm("transport_cost_actual", event.target.value)}
                        />
                      </label>
                      <label>
                        Transport Cost (Estimated)
                        <input
                          type="number"
                          step="0.01"
                          value={intakeForm.transport_cost_estimated}
                          onChange={(event) => updateForm("transport_cost_estimated", event.target.value)}
                        />
                      </label>
                      <label>
                        Repair Cost
                        <input
                          type="number"
                          step="0.01"
                          value={intakeForm.repair_cost}
                          onChange={(event) => updateForm("repair_cost", event.target.value)}
                        />
                      </label>
                      <label>
                        Prep Cost
                        <input
                          type="number"
                          step="0.01"
                          value={intakeForm.prep_cost}
                          onChange={(event) => updateForm("prep_cost", event.target.value)}
                        />
                      </label>
                      <label>
                        Condition Grade
                        <select
                          value={intakeForm.condition_grade}
                          onChange={(event) =>
                            updateForm(
                              "condition_grade",
                              event.target.value as CreateDealRequest["metadata"]["condition_grade"]
                            )
                          }
                        >
                          {CONDITION_GRADE_OPTIONS.map((grade) => (
                            <option key={grade} value={grade}>
                              {grade}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Title Status
                        <select
                          value={intakeForm.title_status}
                          onChange={(event) => updateForm("title_status", event.target.value as TitleStatus)}
                        >
                          <option value="on_site">on_site</option>
                          <option value="delayed">delayed</option>
                          <option value="unknown">unknown</option>
                        </select>
                      </label>
                      <label>
                        Removal Deadline
                        <input
                          type="datetime-local"
                          value={intakeForm.removal_deadline}
                          onChange={(event) => updateForm("removal_deadline", event.target.value)}
                        />
                      </label>
                      <label className="span-two">
                        Condition Notes
                        <textarea
                          rows={3}
                          value={intakeForm.condition_notes}
                          onChange={(event) => updateForm("condition_notes", event.target.value)}
                        />
                      </label>
                    </div>
                  </section>

                  {isVehicleCategory ? (
                    <section className="form-section-card">
                      <h3>Vehicle Market Inputs</h3>
                      <div className="form-grid-two">
                        <label>
                          KBB Value
                          <input
                            type="number"
                            step="0.01"
                            value={intakeForm.market_kbb_value}
                            onChange={(event) => updateForm("market_kbb_value", event.target.value)}
                          />
                        </label>
                        <label>
                          J.D. Power / NADA Value
                          <input
                            type="number"
                            step="0.01"
                            value={intakeForm.market_nada_value}
                            onChange={(event) => updateForm("market_nada_value", event.target.value)}
                          />
                        </label>
                        <label className="span-two">
                          CARFAX Status
                          <input
                            value={intakeForm.market_carfax_status}
                            onChange={(event) => updateForm("market_carfax_status", event.target.value)}
                            placeholder="e.g. clean title, minor damage, unknown"
                          />
                        </label>
                      </div>
                    </section>
                  ) : null}

                  <div className="advanced-toggle-row">
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setShowAdvancedFields((value) => !value)}
                    >
                      {showAdvancedFields ? "Hide Advanced Fields" : "Show Advanced Fields"}
                    </button>
                  </div>

                  {showAdvancedFields ? (
                    <section className="form-section-card">
                      <h3>Advanced Ops Fields</h3>
                      <div className="form-grid-two">
                        <label>
                          Units Total
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.units_total}
                            onChange={(event) => updateForm("units_total", event.target.value)}
                          />
                        </label>
                        <label>
                          Units Working
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.units_working}
                            onChange={(event) => updateForm("units_working", event.target.value)}
                          />
                        </label>
                        <label>
                          Units Minor Issue
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.units_minor_issue}
                            onChange={(event) => updateForm("units_minor_issue", event.target.value)}
                          />
                        </label>
                        <label>
                          Units Defective
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.units_defective}
                            onChange={(event) => updateForm("units_defective", event.target.value)}
                          />
                        </label>
                        <label>
                          Units Locked
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.units_locked}
                            onChange={(event) => updateForm("units_locked", event.target.value)}
                          />
                        </label>
                        <label>
                          Prep Total Units
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.prep_total_units}
                            onChange={(event) => updateForm("prep_total_units", event.target.value)}
                          />
                        </label>
                        <label>
                          Prep Working Units
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.prep_working_units}
                            onChange={(event) => updateForm("prep_working_units", event.target.value)}
                          />
                        </label>
                        <label>
                          Prep Cosmetic Units
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.prep_cosmetic_units}
                            onChange={(event) => updateForm("prep_cosmetic_units", event.target.value)}
                          />
                        </label>
                        <label>
                          Prep Functional Units
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.prep_functional_units}
                            onChange={(event) => updateForm("prep_functional_units", event.target.value)}
                          />
                        </label>
                        <label>
                          Prep Defective Units
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.prep_defective_units}
                            onChange={(event) => updateForm("prep_defective_units", event.target.value)}
                          />
                        </label>
                        <label>
                          Prep Locked Units
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.prep_locked_units}
                            onChange={(event) => updateForm("prep_locked_units", event.target.value)}
                          />
                        </label>
                        <label>
                          Total Prep Time (minutes)
                          <input
                            type="number"
                            step="1"
                            value={intakeForm.prep_total_prep_time_minutes}
                            onChange={(event) => updateForm("prep_total_prep_time_minutes", event.target.value)}
                          />
                        </label>
                      </div>
                    </section>
                  ) : null}

                  <div className="entry-actions intake-primary-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setIntakeStep(2)}
                    >
                      Back
                    </button>
                    <button type="submit" disabled={submitting || !step3Ready} className="secondary-button">
                      {submitting ? "Working..." : "Preview"}
                    </button>
                    <button
                      type="button"
                      disabled={submitting || !step3Ready}
                      onClick={() => void handleIntakeCreateDeal()}
                      className="primary-button"
                    >
                      Create Deal
                    </button>
                    <button type="button" disabled={submitting} onClick={handleIntakePass} className="ghost-button">
                      Pass
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleIntakeSaveForLater}
                      className="ghost-button"
                    >
                      Save for later
                    </button>
                  </div>
                </form>
              ) : null}

              {intakeStatusMessage ? <p className="decision-confirmation">{intakeStatusMessage}</p> : null}

              {intakePreviewDeal ? (
                <div className="preview-box preview-pending">
                  <p className="preview-banner">Preview — Not Yet Created</p>
                  <h3>Intake Preview</h3>
                  <p>
                    ACQ score: {intakePreviewDeal.engine.scoring.acquisition_score} · Estimated spread: $
                    {intakePreviewDeal.calculations.projected_profit.toFixed(2)} · Data confidence:{" "}
                    {intakePreviewDeal.calculations.data_confidence}
                  </p>
                  <p>
                    Title status: {intakePreviewDeal.metadata.title_status} · Removal deadline:{" "}
                    {intakePreviewDeal.metadata.removal_deadline
                      ? new Date(intakePreviewDeal.metadata.removal_deadline).toLocaleString()
                      : "not provided"}
                  </p>
                  {(intakePreviewDeal.deal.quantity_purchased !== null &&
                    intakePreviewDeal.deal.quantity_purchased !== undefined) ||
                  (intakePreviewDeal.deal.quantity_broken !== null &&
                    intakePreviewDeal.deal.quantity_broken !== undefined) ? (
                    <p>
                      Quantity Purchased: {intakePreviewDeal.deal.quantity_purchased ?? "N/A"} · Quantity Broken:{" "}
                      {intakePreviewDeal.deal.quantity_broken ?? "N/A"}
                    </p>
                  ) : null}
                  {(intakePreviewDeal.warnings ?? []).includes("REMOVAL_URGENT") ? (
                    <p className="warning-text">REMOVAL_URGENT — deadline is near.</p>
                  ) : null}
                </div>
              ) : null}

              {savedForLaterIntake.length > 0 ? (
                <div className="preview-box">
                  <h3>Saved for Later (Local Queue)</h3>
                  <ul>
                    {savedForLaterIntake.map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.title}</strong> · Bid {entry.current_bid || "0"} ·{" "}
                        {entry.payload.acquisition_state} · {entry.payload.seller_type ?? "unknown"} · Saved{" "}
                        {new Date(entry.created_at).toLocaleString()}
                        <div className="entry-actions">
                          <button
                            type="button"
                            onClick={() => void handleLoadQueueEntry(entry)}
                            className="secondary-button"
                          >
                            Load Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveQueueEntry(entry.id)}
                            className="ghost-button"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}

          {activePage === "alerts" ? (
            <section className="panel">
              <h2 className="page-title">Alerts</h2>
              <p className="alerts-reference-note">Reference only. Action queue is in Dashboard Burn List.</p>
              <div className="entry-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setActivePage("dashboard");
                    setRightPanelMode("detail");
                    setRightPanelDetailTab("decision");
                  }}
                >
                  Go to Burn List
                </button>
              </div>
              {deals.filter((item) => (item.alerts?.length ?? 0) > 0).length === 0 ? (
                <p>No alerts.</p>
              ) : (
                deals
                  .filter((item) => (item.alerts?.length ?? 0) > 0)
                  .map((item) => (
                    <div className="preview-box" key={item.deal.id}>
                      <p>
                        <strong>{item.deal.label}</strong>
                      </p>
                      <ul>
                        {item.alerts?.map((alert) => (
                          <li key={`${item.deal.id}-${alert.code}-${alert.message}`}>
                            <span className={alert.severity === "critical" ? "alert-critical" : ""}>
                              [{alert.severity.toUpperCase()}]
                            </span>{" "}
                            {alert.code}: {alert.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
              )}
            </section>
          ) : null}

          {activePage === "archive" ? (
            <section className="panel">
              <h2 className="page-title">Archive</h2>
              {deals.filter((item) => item.deal.status === "completed").length === 0 ? (
                <p>No archived deals.</p>
              ) : (
                deals
                  .filter((item) => item.deal.status === "completed")
                  .map((item) => (
                    <div className="preview-box" key={item.deal.id}>
                      <p>
                        <strong>{item.deal.label}</strong> · Realized $
                        {(item.calculations.realized_profit ?? 0).toFixed(2)}
                      </p>
                    </div>
                  ))
              )}
            </section>
          ) : null}
        </section>

        <aside className="right-panel">
          <div className="right-panel-toggle">
            <button
              type="button"
              className={rightPanelMode === "detail" ? "active" : ""}
              onClick={() => setRightPanelMode("detail")}
            >
              Deal Detail
            </button>
            <button
              type="button"
              className={rightPanelMode === "assistant" ? "active" : ""}
              onClick={() => setRightPanelMode("assistant")}
            >
              AI Assistant
            </button>
          </div>

          {rightPanelMode === "detail" ? (
            selectedDeal ? (
              <>
                {selectedDeal.deal.id.startsWith("preview-") ? (
                  <div className="preview-box preview-pending">
                    <p className="preview-banner">Preview — Not Yet Created</p>
                  </div>
                ) : null}
                <div className="detail-tab-row">
                  <button
                    type="button"
                    className={rightPanelDetailTab === "decision" ? "active" : ""}
                    onClick={() => setRightPanelDetailTab("decision")}
                  >
                    Decision
                  </button>
                  <button
                    type="button"
                    className={rightPanelDetailTab === "market" ? "active" : ""}
                    onClick={() => setRightPanelDetailTab("market")}
                  >
                    Market
                  </button>
                  <button
                    type="button"
                    className={rightPanelDetailTab === "recon" ? "active" : ""}
                    onClick={() => setRightPanelDetailTab("recon")}
                  >
                    Recon
                  </button>
                </div>
                <DetailPanel
                  deal={selectedDeal}
                  marketIntel={selectedDealMarketIntel}
                  reconditioning={selectedDealReconditioning}
                  activeTab={rightPanelDetailTab}
                  onMarketIntelChange={handleMarketIntelChange}
                  onReconditioningChange={handleReconditioningChange}
                  onRequestApproveDecision={handleRequestApproveDecision}
                />
              </>
            ) : (
              <p>Select a deal in Pipeline.</p>
            )
          ) : (
            <div className="assistant-panel">
              <p>
                Selected deal:{" "}
                {selectedDeal ? `${selectedDeal.deal.label} (${selectedDeal.deal.id})` : "None selected"}
              </p>
              <div className="quick-prompts">
                {QUICK_ASSISTANT_PROMPTS.map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    disabled={!selectedDeal || assistantLoading}
                    onClick={() => {
                      setAssistantQuestion(prompt);
                      setAssistantResponse(null);
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <label>
                Ask about this deal
                <textarea
                  rows={3}
                  value={assistantQuestion}
                  onChange={(event) => setAssistantQuestion(event.target.value)}
                  placeholder="What are the top risks and next action?"
                />
              </label>
              <div className="entry-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={assistantLoading || !selectedDeal}
                  onClick={() => void handleAssistantSubmit()}
                >
                  {assistantLoading ? "Asking..." : "Ask Assistant"}
                </button>
              </div>
              {assistantError ? <p className="warning-banner">{assistantError}</p> : null}
              {assistantResponse ? (
                <div className="preview-box">
                  <p>
                    <strong>Response:</strong> {assistantResponse.response}
                  </p>
                  <p>
                    <strong>Risk:</strong> {assistantResponse.risk_level}
                  </p>
                  <p>
                    <strong>Suggested Action:</strong> {assistantResponse.suggested_action}
                  </p>
                  {assistantResponse.key_points.length > 0 ? (
                    <ul>
                      {assistantResponse.key_points.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>
      <PreBidSanityModal
        deal={pendingApprovalDeal}
        reconditioning={pendingApprovalReconditioning}
        isOpen={Boolean(pendingApprovalDeal)}
        onClose={() => setPendingApprovalDealId(null)}
        onAcknowledgeAndApprove={() =>
          pendingApprovalDeal ? void handleApproveWithSanityCheck(pendingApprovalDeal.deal.id) : undefined
        }
      />
    </main>
  );
}

export default App;
