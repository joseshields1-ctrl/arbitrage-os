import { useEffect, useMemo, useState } from "react";
import {
  createDeal,
  fetchDashboard,
  fetchDeals,
  previewDeal,
  queryAssistant,
  updateDealStage,
} from "./api";
import DealCard from "./components/DealCard";
import DetailPanel from "./components/DetailPanel";
import {
  CATEGORY_OPTIONS,
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
  TitleStatus,
} from "./types";
import "./App.css";

const INTAKE_QUEUE_STORAGE_KEY = "arbitrage_os_intake_queue_v1";

type ActivePage = "dashboard" | "pipeline" | "intake" | "alerts" | "archive";
type PipelineAlertFilter = "all" | "critical" | "warning" | "none";

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

const QUICK_ASSISTANT_PROMPTS = [
  "Explain this deal",
  "What should I do next?",
  "Why is this risky?",
] as const;

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
};

const nextStage = (status: DealStage): DealStage | null => {
  const index = DEAL_STAGES.indexOf(status);
  if (index < 0 || index === DEAL_STAGES.length - 1) {
    return null;
  }
  return DEAL_STAGES[index + 1];
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

function App() {
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [rightPanelMode, setRightPanelMode] = useState<"detail" | "assistant">("detail");
  const [pipelineAlertFilter, setPipelineAlertFilter] = useState<PipelineAlertFilter>("all");
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
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

  const selectedDeal =
    deals.find((deal) => deal.deal.id === selectedDealId) ??
    (selectedDealId?.startsWith("preview-") ? intakePreviewDeal : null) ??
    deals[0] ??
    null;

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

    return {
      label: intakeForm.title.trim() || "GovDeals Intake",
      category: intakeForm.category,
      source_platform: intakeForm.source_platform,
      seller_type: intakeForm.seller_type,
      acquisition_state: intakeForm.acquisition_state.trim().toUpperCase(),
      discovered_date: toIsoOrNull(intakeForm.auction_end),
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
            units_working: toOptionalInteger(intakeForm.units_working) ?? 0,
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
    };
  };

  const resetIntakeForm = (): void => {
    setIntakeForm(DEFAULT_INTAKE_FORM);
    setShowAdvancedFields(false);
  };

  const handleIntakePreview = async () => {
    setSubmitting(true);
    setError(null);
    setIntakeStatusMessage(null);
    try {
      const preview = await previewDeal(buildIntakePayload());
      setIntakePreviewDeal(preview);
      setSelectedDealId(preview.deal.id);
      setRightPanelMode("detail");
      setIntakeStatusMessage("Preview ready. This is not yet a created deal.");
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
      const created = await createDeal(buildIntakePayload());
      setSelectedDealId(created.deal.id);
      setIntakePreviewDeal(null);
      setActivePage("pipeline");
      setRightPanelMode("detail");
      setIntakeStatusMessage("Deal created from intake.");
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
      }));
      setShowAdvancedFields(Boolean(entry.payload.prep_metrics || entry.payload.unit_breakdown || entry.payload.unit_count));
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

  return (
    <main className="operator-shell">
      <header className="top-bar">
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
      </header>

      <div className="workspace-layout">
        <aside className="left-nav">
          <h1>Arbitrage OS</h1>
          <p>Operator Console</p>
          <button type="button" className={activePage === "dashboard" ? "active" : ""} onClick={() => setActivePage("dashboard")}>Dashboard</button>
          <button type="button" className={activePage === "pipeline" ? "active" : ""} onClick={() => setActivePage("pipeline")}>Pipeline</button>
          <button type="button" className={activePage === "intake" ? "active" : ""} onClick={() => setActivePage("intake")}>Intake</button>
          <button type="button" className={activePage === "alerts" ? "active" : ""} onClick={() => setActivePage("alerts")}>Alerts</button>
          <button type="button" className={activePage === "archive" ? "active" : ""} onClick={() => setActivePage("archive")}>Archive</button>
        </aside>

        <section className="main-area">
          {error ? <p className="error-banner">{error}</p> : null}

          {activePage === "dashboard" ? (
            <section className="panel">
              <h2 className="page-title">Dashboard</h2>
              <div className="dashboard-grid">
                <article className="dashboard-stat-card"><h3>Active Deals</h3><p>{activeDealsCount}</p></article>
                <article className="dashboard-stat-card"><h3>Completed Deals</h3><p>{completedDealsCount}</p></article>
                <article className="dashboard-stat-card"><h3>Projected Profit (estimate)</h3><p>${(dashboard?.projected_profit_total ?? 0).toFixed(2)}</p></article>
                <article className="dashboard-stat-card"><h3>Realized Profit</h3><p>${(dashboard?.realized_profit_total ?? 0).toFixed(2)}</p></article>
              </div>
              <div className="burn-list">
                <h3>Burn List <span className="action-required">Action Required</span></h3>
                {(dashboard?.burn_list?.length ?? 0) === 0 ? (
                  <p>No stuck deals right now.</p>
                ) : (
                  <ul>
                    {dashboard?.burn_list.map((item) => (
                      <li key={item.id}>
                        <strong>{item.label}</strong> · {item.days_in_stage} days in stage · Projected ${item.projected_profit.toFixed(2)} · Action: {item.recommended_action ?? "completed"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}

          {activePage === "pipeline" ? (
            <section className="panel">
              <h2 className="page-title">Pipeline</h2>
              <div className="pipeline-filter-row">
                <span>Alert Filter:</span>
                {(["all", "critical", "warning", "none"] as const).map((filter) => (
                  <button key={filter} type="button" className={pipelineAlertFilter === filter ? "active" : ""} onClick={() => setPipelineAlertFilter(filter)}>
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
              <h2 className="page-title">Deal Entry / Intake</h2>
              <p className="section-subtitle">Structured deal intake for faster, lower-error operator review.</p>
              <form
                className="modern-entry-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleIntakePreview();
                }}
              >
                <section className="form-section-card">
                  <h3>Basic Info</h3>
                  <div className="form-grid-two">
                    <label>Label<input required value={intakeForm.title} onChange={(event) => setIntakeForm((prev) => ({ ...prev, title: event.target.value }))} /></label>
                    <label>Category<select value={intakeForm.category} onChange={(event) => setIntakeForm((prev) => ({ ...prev, category: event.target.value as DealCategory }))}>{CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
                    <label>Source Platform<select value={intakeForm.source_platform} onChange={(event) => setIntakeForm((prev) => ({ ...prev, source_platform: event.target.value as CreateDealRequest["source_platform"] }))}>{SOURCE_PLATFORM_OPTIONS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select></label>
                    <label>Acquisition State<input required value={intakeForm.acquisition_state} onChange={(event) => setIntakeForm((prev) => ({ ...prev, acquisition_state: event.target.value.toUpperCase() }))} /></label>
                    <label>Listing URL<input value={intakeForm.listing_url} onChange={(event) => setIntakeForm((prev) => ({ ...prev, listing_url: event.target.value }))} /></label>
                    <label>Seller Type<select value={intakeForm.seller_type} onChange={(event) => setIntakeForm((prev) => ({ ...prev, seller_type: event.target.value as IntakeFormState["seller_type"] }))}><option value="government">government</option><option value="commercial">commercial</option><option value="unknown">unknown</option></select></label>
                  </div>
                </section>

                <section className="form-section-card">
                  <h3>Acquisition</h3>
                  <div className="form-grid-two">
                    <label>Acquisition Cost<input type="number" step="0.01" value={intakeForm.acquisition_cost} onChange={(event) => setIntakeForm((prev) => ({ ...prev, acquisition_cost: event.target.value }))} /></label>
                    <label>Buyer Premium (decimal)<input type="number" step="0.001" value={intakeForm.buyer_premium_pct} onChange={(event) => setIntakeForm((prev) => ({ ...prev, buyer_premium_pct: event.target.value }))} /></label>
                    <label>Current Bid (intake)<input type="number" step="0.01" value={intakeForm.current_bid} onChange={(event) => setIntakeForm((prev) => ({ ...prev, current_bid: event.target.value }))} /></label>
                    <label>Auction End<input type="datetime-local" value={intakeForm.auction_end} onChange={(event) => setIntakeForm((prev) => ({ ...prev, auction_end: event.target.value }))} /></label>
                  </div>
                </section>

                <section className="form-section-card">
                  <h3>Transport & Costs</h3>
                  <div className="form-grid-two">
                    <label>Transport Type<select value={intakeForm.transport_type} onChange={(event) => setIntakeForm((prev) => ({ ...prev, transport_type: event.target.value as CreateDealRequest["metadata"]["transport_type"] }))}>{TRANSPORT_TYPE_OPTIONS.map((transportType) => <option key={transportType} value={transportType}>{transportType}</option>)}</select></label>
                    <label>Transport Cost (Actual)<input type="number" step="0.01" value={intakeForm.transport_cost_actual} onChange={(event) => setIntakeForm((prev) => ({ ...prev, transport_cost_actual: event.target.value }))} /></label>
                    <label>Transport Cost (Estimated)<input type="number" step="0.01" value={intakeForm.transport_cost_estimated} onChange={(event) => setIntakeForm((prev) => ({ ...prev, transport_cost_estimated: event.target.value }))} /></label>
                    <label>Repair Cost<input type="number" step="0.01" value={intakeForm.repair_cost} onChange={(event) => setIntakeForm((prev) => ({ ...prev, repair_cost: event.target.value }))} /></label>
                    <label>Prep Cost<input type="number" step="0.01" value={intakeForm.prep_cost} onChange={(event) => setIntakeForm((prev) => ({ ...prev, prep_cost: event.target.value }))} /></label>
                  </div>
                </section>

                <section className="form-section-card">
                  <h3>Market</h3>
                  <div className="form-grid-two">
                    <label>Estimated Market Value<input required type="number" step="0.01" value={intakeForm.estimated_market_value} onChange={(event) => setIntakeForm((prev) => ({ ...prev, estimated_market_value: event.target.value }))} /></label>
                  </div>
                </section>

                <section className="form-section-card">
                  <h3>Condition</h3>
                  <div className="form-grid-two">
                    <label>Condition Grade<select value={intakeForm.condition_grade} onChange={(event) => setIntakeForm((prev) => ({ ...prev, condition_grade: event.target.value as CreateDealRequest["metadata"]["condition_grade"] }))}>{CONDITION_GRADE_OPTIONS.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select></label>
                    <label>Title Status<select value={intakeForm.title_status} onChange={(event) => setIntakeForm((prev) => ({ ...prev, title_status: event.target.value as TitleStatus }))}><option value="on_site">on_site</option><option value="delayed">delayed</option><option value="unknown">unknown</option></select></label>
                    <label>Removal Deadline<input type="datetime-local" value={intakeForm.removal_deadline} onChange={(event) => setIntakeForm((prev) => ({ ...prev, removal_deadline: event.target.value }))} /></label>
                    <label className="span-two">Condition Notes<textarea rows={3} value={intakeForm.condition_notes} onChange={(event) => setIntakeForm((prev) => ({ ...prev, condition_notes: event.target.value }))} /></label>
                  </div>
                </section>

                <div className="advanced-toggle-row">
                  <button type="button" className="link-button" onClick={() => setShowAdvancedFields((value) => !value)}>
                    {showAdvancedFields ? "Hide Advanced Fields" : "Show Advanced Fields"}
                  </button>
                </div>

                {showAdvancedFields ? (
                  <section className="form-section-card">
                    <h3>Advanced Fields</h3>
                    <div className="form-grid-two">
                      <label>Unit Count<input type="number" step="1" value={intakeForm.unit_count} onChange={(event) => setIntakeForm((prev) => ({ ...prev, unit_count: event.target.value }))} /></label>
                      <label>Units Total<input type="number" step="1" value={intakeForm.units_total} onChange={(event) => setIntakeForm((prev) => ({ ...prev, units_total: event.target.value }))} /></label>
                      <label>Units Working<input type="number" step="1" value={intakeForm.units_working} onChange={(event) => setIntakeForm((prev) => ({ ...prev, units_working: event.target.value }))} /></label>
                      <label>Units Minor Issue<input type="number" step="1" value={intakeForm.units_minor_issue} onChange={(event) => setIntakeForm((prev) => ({ ...prev, units_minor_issue: event.target.value }))} /></label>
                      <label>Units Defective<input type="number" step="1" value={intakeForm.units_defective} onChange={(event) => setIntakeForm((prev) => ({ ...prev, units_defective: event.target.value }))} /></label>
                      <label>Units Locked<input type="number" step="1" value={intakeForm.units_locked} onChange={(event) => setIntakeForm((prev) => ({ ...prev, units_locked: event.target.value }))} /></label>
                      <label>Prep Total Units<input type="number" step="1" value={intakeForm.prep_total_units} onChange={(event) => setIntakeForm((prev) => ({ ...prev, prep_total_units: event.target.value }))} /></label>
                      <label>Prep Working Units<input type="number" step="1" value={intakeForm.prep_working_units} onChange={(event) => setIntakeForm((prev) => ({ ...prev, prep_working_units: event.target.value }))} /></label>
                      <label>Prep Cosmetic Units<input type="number" step="1" value={intakeForm.prep_cosmetic_units} onChange={(event) => setIntakeForm((prev) => ({ ...prev, prep_cosmetic_units: event.target.value }))} /></label>
                      <label>Prep Functional Units<input type="number" step="1" value={intakeForm.prep_functional_units} onChange={(event) => setIntakeForm((prev) => ({ ...prev, prep_functional_units: event.target.value }))} /></label>
                      <label>Prep Defective Units<input type="number" step="1" value={intakeForm.prep_defective_units} onChange={(event) => setIntakeForm((prev) => ({ ...prev, prep_defective_units: event.target.value }))} /></label>
                      <label>Prep Locked Units<input type="number" step="1" value={intakeForm.prep_locked_units} onChange={(event) => setIntakeForm((prev) => ({ ...prev, prep_locked_units: event.target.value }))} /></label>
                      <label>Total Prep Time (minutes)<input type="number" step="1" value={intakeForm.prep_total_prep_time_minutes} onChange={(event) => setIntakeForm((prev) => ({ ...prev, prep_total_prep_time_minutes: event.target.value }))} /></label>
                    </div>
                  </section>
                ) : null}

                <div className="entry-actions intake-primary-actions">
                  <button type="submit" disabled={submitting} className="secondary-button">
                    {submitting ? "Working..." : "Preview"}
                  </button>
                  <button type="button" disabled={submitting} onClick={() => void handleIntakeCreateDeal()} className="primary-button">
                    Create Deal
                  </button>
                  <button type="button" disabled={submitting} onClick={handleIntakePass} className="ghost-button">
                    Pass
                  </button>
                  <button type="button" disabled={submitting} onClick={handleIntakeSaveForLater} className="ghost-button">
                    Save for later
                  </button>
                </div>
              </form>

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
                        <strong>{entry.title}</strong> · Bid {entry.current_bid || "0"} · {entry.payload.acquisition_state} · {entry.payload.seller_type ?? "unknown"} · Saved {new Date(entry.created_at).toLocaleString()}
                        <div className="entry-actions">
                          <button type="button" onClick={() => void handleLoadQueueEntry(entry)} className="secondary-button">Load Preview</button>
                          <button type="button" onClick={() => handleRemoveQueueEntry(entry.id)} className="ghost-button">Remove</button>
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
                      <p><strong>{item.deal.label}</strong></p>
                      <ul>
                        {item.alerts?.map((alert) => (
                          <li key={`${item.deal.id}-${alert.code}-${alert.message}`}>
                            <span className={alert.severity === "critical" ? "alert-critical" : ""}>[{alert.severity.toUpperCase()}]</span>{" "}
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
                      <p><strong>{item.deal.label}</strong> · Realized ${(item.calculations.realized_profit ?? 0).toFixed(2)}</p>
                    </div>
                  ))
              )}
            </section>
          ) : null}
        </section>

        <aside className="right-panel">
          <div className="right-panel-toggle">
            <button type="button" className={rightPanelMode === "detail" ? "active" : ""} onClick={() => setRightPanelMode("detail")}>Deal Detail</button>
            <button type="button" className={rightPanelMode === "assistant" ? "active" : ""} onClick={() => setRightPanelMode("assistant")}>AI Assistant</button>
          </div>

          {rightPanelMode === "detail" ? (
            selectedDeal ? (
              <>
                {selectedDeal.deal.id.startsWith("preview-") ? (
                  <div className="preview-box preview-pending">
                    <p className="preview-banner">Preview — Not Yet Created</p>
                  </div>
                ) : null}
                <DetailPanel
                  deal={selectedDeal}
                  onDecisionRecorded={(updatedDeal) => {
                    setDeals((prev) =>
                      prev.map((current) => (current.deal.id === updatedDeal.deal.id ? updatedDeal : current))
                    );
                    if (intakePreviewDeal && intakePreviewDeal.deal.id === updatedDeal.deal.id) {
                      setIntakePreviewDeal(updatedDeal);
                    }
                  }}
                />
              </>
            ) : (
              <p>Select a deal in Pipeline.</p>
            )
          ) : (
            <div className="assistant-panel">
              <p>Selected deal: {selectedDeal ? `${selectedDeal.deal.label} (${selectedDeal.deal.id})` : "None selected"}</p>
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
                <textarea rows={3} value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} placeholder="What are the top risks and next action?" />
              </label>
              <div className="entry-actions">
                <button type="button" className="secondary-button" disabled={assistantLoading || !selectedDeal} onClick={() => void handleAssistantSubmit()}>
                  {assistantLoading ? "Asking..." : "Ask Assistant"}
                </button>
              </div>
              {assistantError ? <p className="warning-banner">{assistantError}</p> : null}
              {assistantResponse ? (
                <div className="preview-box">
                  <p><strong>Response:</strong> {assistantResponse.response}</p>
                  <p><strong>Risk:</strong> {assistantResponse.risk_level}</p>
                  <p><strong>Suggested Action:</strong> {assistantResponse.suggested_action}</p>
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
    </main>
  );
}

export default App;
