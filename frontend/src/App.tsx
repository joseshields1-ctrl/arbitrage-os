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
import { CATEGORY_OPTIONS, DEAL_STAGES } from "./types";
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
  current_bid: string;
  auction_end: string;
  acquisition_state: string;
  category: DealCategory;
  condition_raw_text: string;
  seller_type: "government" | "commercial" | "unknown";
  removal_deadline: string;
  title_status: TitleStatus;
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

const mapConditionTextToGrade = (text: string): CreateDealRequest["metadata"]["condition_grade"] => {
  const normalized = text.toLowerCase();
  if (normalized.includes("parts")) return "parts_only";
  if (normalized.includes("defect") || normalized.includes("non-running")) return "defective";
  if (normalized.includes("cosmetic")) return "used_cosmetic";
  if (normalized.includes("excellent") || normalized.includes("clean")) return "excellent";
  if (normalized.includes("functional")) return "used_functional";
  if (normalized.includes("used")) return "used";
  return "used_good";
};

function App() {
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [rightPanelMode, setRightPanelMode] = useState<"detail" | "assistant">("detail");
  const [pipelineAlertFilter, setPipelineAlertFilter] = useState<PipelineAlertFilter>("all");
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
  const [intakeForm, setIntakeForm] = useState<IntakeFormState>({
    listing_url: "",
    title: "",
    current_bid: "",
    auction_end: "",
    acquisition_state: "TX",
    category: "vehicle_suv",
    condition_raw_text: "",
    seller_type: "government",
    removal_deadline: "",
    title_status: "unknown",
  });

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
    const currentBid = Number(intakeForm.current_bid || "0");
    const estimatedMarketValue = Math.max(0, currentBid * 1.35);
    return {
      label: intakeForm.title.trim() || "GovDeals Intake",
      category: intakeForm.category,
      source_platform: "govdeals",
      seller_type: intakeForm.seller_type,
      acquisition_state: intakeForm.acquisition_state.trim().toUpperCase(),
      discovered_date: toIsoOrNull(intakeForm.auction_end),
      financials: {
        acquisition_cost: currentBid,
        buyer_premium_pct: 0.1,
        transport_cost_estimated: null,
        repair_cost: null,
        prep_cost: null,
        estimated_market_value: estimatedMarketValue,
      },
      metadata: {
        condition_grade: mapConditionTextToGrade(intakeForm.condition_raw_text),
        condition_notes: `${intakeForm.condition_raw_text}\nSource: ${intakeForm.listing_url}`.trim(),
        transport_type: "auto_transport",
        presentation_quality: "standard",
        removal_deadline: toIsoOrNull(intakeForm.removal_deadline),
        title_status: intakeForm.title_status,
      },
    };
  };

  const resetIntakeForm = (): void => {
    setIntakeForm({
      listing_url: "",
      title: "",
      current_bid: "",
      auction_end: "",
      acquisition_state: "TX",
      category: "vehicle_suv",
      condition_raw_text: "",
      seller_type: "government",
      removal_deadline: "",
      title_status: "unknown",
    });
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
        current_bid: entry.current_bid,
        auction_end: entry.auction_end,
        acquisition_state: entry.payload.acquisition_state,
        category: entry.payload.category,
        condition_raw_text: entry.payload.metadata.condition_notes,
        seller_type: entry.payload.seller_type ?? "unknown",
        removal_deadline: entry.payload.metadata.removal_deadline
          ? new Date(entry.payload.metadata.removal_deadline).toISOString().slice(0, 16)
          : "",
        title_status: entry.payload.metadata.title_status ?? "unknown",
      }));
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
          <button
            type="button"
            className={activePage === "dashboard" ? "active" : ""}
            onClick={() => setActivePage("dashboard")}
          >
            Dashboard
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
            <section className="panel">
              <h2>Dashboard</h2>
              <div className="dashboard-grid">
                <article>
                  <h3>Active Deals</h3>
                  <p>{activeDealsCount}</p>
                </article>
                <article>
                  <h3>Completed Deals</h3>
                  <p>{completedDealsCount}</p>
                </article>
                <article>
                  <h3>Projected Profit (estimate)</h3>
                  <p>${(dashboard?.projected_profit_total ?? 0).toFixed(2)}</p>
                </article>
                <article>
                  <h3>Realized Profit</h3>
                  <p>${(dashboard?.realized_profit_total ?? 0).toFixed(2)}</p>
                </article>
              </div>
              <div className="burn-list">
                <h3>Burn List</h3>
                {(dashboard?.burn_list?.length ?? 0) === 0 ? (
                  <p>No stuck deals right now.</p>
                ) : (
                  <ul>
                    {dashboard?.burn_list.map((item) => (
                      <li key={item.id}>
                        <strong>{item.label}</strong> · {item.days_in_stage} days in stage · Projected $
                        {item.projected_profit.toFixed(2)} · Action: {item.recommended_action ?? "completed"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}

          {activePage === "pipeline" ? (
            <section className="panel">
              <h2>Pipeline</h2>
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
              <h2>Intake (Manual GovDeals)</h2>
              <form
                className="deal-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleIntakePreview();
                }}
              >
                <label>
                  Listing URL
                  <input
                    required
                    value={intakeForm.listing_url}
                    onChange={(event) =>
                      setIntakeForm((prev) => ({ ...prev, listing_url: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Title
                  <input
                    required
                    value={intakeForm.title}
                    onChange={(event) =>
                      setIntakeForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Current Bid
                  <input
                    required
                    type="number"
                    step="0.01"
                    value={intakeForm.current_bid}
                    onChange={(event) =>
                      setIntakeForm((prev) => ({ ...prev, current_bid: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Auction End
                  <input
                    required
                    type="datetime-local"
                    value={intakeForm.auction_end}
                    onChange={(event) =>
                      setIntakeForm((prev) => ({ ...prev, auction_end: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Location / State
                  <input
                    required
                    value={intakeForm.acquisition_state}
                    onChange={(event) =>
                      setIntakeForm((prev) => ({
                        ...prev,
                        acquisition_state: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>
                <label>
                  Category
                  <select
                    value={intakeForm.category}
                    onChange={(event) =>
                      setIntakeForm((prev) => ({ ...prev, category: event.target.value as DealCategory }))
                    }
                  >
                    {CATEGORY_OPTIONS.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Seller Type
                  <select
                    value={intakeForm.seller_type}
                    onChange={(event) =>
                      setIntakeForm((prev) => ({
                        ...prev,
                        seller_type: event.target.value as IntakeFormState["seller_type"],
                      }))
                    }
                  >
                    <option value="government">government</option>
                    <option value="commercial">commercial</option>
                    <option value="unknown">unknown</option>
                  </select>
                </label>
                <label>
                  Title Status
                  <select
                    value={intakeForm.title_status}
                    onChange={(event) =>
                      setIntakeForm((prev) => ({
                        ...prev,
                        title_status: event.target.value as TitleStatus,
                      }))
                    }
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
                    onChange={(event) =>
                      setIntakeForm((prev) => ({ ...prev, removal_deadline: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Condition (raw text)
                  <textarea
                    rows={2}
                    value={intakeForm.condition_raw_text}
                    onChange={(event) =>
                      setIntakeForm((prev) => ({ ...prev, condition_raw_text: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Actions
                  <div className="entry-actions">
                    <button type="submit" disabled={submitting}>
                      {submitting ? "Working..." : "Preview"}
                    </button>
                    <button type="button" disabled={submitting} onClick={() => void handleIntakeCreateDeal()}>
                      Create Deal
                    </button>
                    <button type="button" disabled={submitting} onClick={handleIntakePass}>
                      Pass
                    </button>
                    <button type="button" disabled={submitting} onClick={handleIntakeSaveForLater}>
                      Save for later
                    </button>
                  </div>
                </label>
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
                </div>
              ) : null}

              {savedForLaterIntake.length > 0 ? (
                <div className="preview-box">
                  <h3>Saved for Later (Local Queue)</h3>
                  <ul>
                    {savedForLaterIntake.map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.title}</strong> · Bid {entry.current_bid || "0"} ·{" "}
                        {entry.payload.acquisition_state} ·{" "}
                        {entry.payload.seller_type ?? "unknown"} · Saved{" "}
                        {new Date(entry.created_at).toLocaleString()}
                        <div className="entry-actions">
                          <button type="button" onClick={() => void handleLoadQueueEntry(entry)}>
                            Load Preview
                          </button>
                          <button type="button" onClick={() => handleRemoveQueueEntry(entry.id)}>
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
              <h2>Alerts</h2>
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
              <h2>Archive</h2>
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
                <DetailPanel
                  deal={selectedDeal}
                  onDecisionRecorded={(updatedDeal) => {
                    setDeals((prev) =>
                      prev.map((current) =>
                        current.deal.id === updatedDeal.deal.id ? updatedDeal : current
                      )
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
    </main>
  );
}

export default App;
