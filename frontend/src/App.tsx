import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  createDeal,
  fetchDashboard,
  fetchDeals,
  updateDealStage,
} from "./api";
import {
  CATEGORY_OPTIONS,
  CONDITION_GRADE_OPTIONS,
  DEAL_STAGES,
  SOURCE_PLATFORM_OPTIONS,
  TRANSPORT_TYPE_OPTIONS,
} from "./types";
import type {
  DashboardSummary,
  DealCategory,
  DealStage,
  DealView,
  SourcePlatform,
  ConditionGrade,
  TransportType,
} from "./types";
import "./App.css";

const nextStage = (status: DealStage): DealStage | null => {
  const index = DEAL_STAGES.indexOf(status);
  if (index < 0 || index === DEAL_STAGES.length - 1) {
    return null;
  }
  return DEAL_STAGES[index + 1];
};

const toNullableNumber = (value: string): number | null =>
  value.trim() === "" ? null : Number(value);

interface DealFormState {
  label: string;
  category: DealCategory;
  source_platform: SourcePlatform;
  acquisition_state: string;
  condition_grade: ConditionGrade;
  condition_notes: string;
  transport_type: TransportType;
  presentation_quality: string;
  acquisition_cost: string;
  buyer_premium_pct: string;
  transport_cost_actual: string;
  transport_cost_estimated: string;
  repair_cost: string;
  prep_cost: string;
  estimated_market_value: string;
}

function App() {
  const [deals, setDeals] = useState<DealView[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [updatingDealId, setUpdatingDealId] = useState<string | null>(null);

  const [formData, setFormData] = useState<DealFormState>({
    label: "",
    category: "vehicle_suv",
    source_platform: "govdeals",
    acquisition_state: "TX",
    condition_grade: "used_good",
    condition_notes: "",
    transport_type: "auto_transport",
    presentation_quality: "standard",
    acquisition_cost: "",
    buyer_premium_pct: "10",
    transport_cost_actual: "",
    transport_cost_estimated: "",
    repair_cost: "",
    prep_cost: "",
    estimated_market_value: "",
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dealsResponse, dashboardResponse] = await Promise.all([
        fetchDeals(),
        fetchDashboard(),
      ]);
      setDeals(dealsResponse);
      setDashboard(dashboardResponse);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Failed to load data";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createDeal({
        label: formData.label,
        category: formData.category,
        source_platform: formData.source_platform,
        acquisition_state: formData.acquisition_state,
        financials: {
          acquisition_cost: Number(formData.acquisition_cost),
          buyer_premium_pct: Number(formData.buyer_premium_pct),
          transport_cost_actual: toNullableNumber(formData.transport_cost_actual),
          transport_cost_estimated: toNullableNumber(formData.transport_cost_estimated),
          repair_cost: toNullableNumber(formData.repair_cost),
          prep_cost: toNullableNumber(formData.prep_cost),
          estimated_market_value: Number(formData.estimated_market_value),
        },
        metadata: {
          condition_grade: formData.condition_grade,
          condition_notes: formData.condition_notes,
          transport_type: formData.transport_type,
          presentation_quality: formData.presentation_quality,
        },
      });

      setFormData((prev) => ({
        ...prev,
        label: "",
        condition_notes: "",
        acquisition_cost: "",
        transport_cost_actual: "",
        transport_cost_estimated: "",
        repair_cost: "",
        prep_cost: "",
        estimated_market_value: "",
      }));

      await loadData();
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Failed to create deal";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStageAdvance = async (deal: DealView) => {
    const stage = nextStage(deal.deal.status);
    if (!stage) {
      return;
    }

    setUpdatingDealId(deal.deal.id);
    setError(null);
    try {
      await updateDealStage(deal.deal.id, stage);
      await loadData();
    } catch (updateError) {
      const message =
        updateError instanceof Error ? updateError.message : "Failed to update stage";
      setError(message);
    } finally {
      setUpdatingDealId(null);
    }
  };

  const completedDeals = useMemo(
    () => deals.filter((item) => item.deal.status === "completed"),
    [deals]
  );
  const activeDeals = useMemo(
    () => deals.filter((item) => item.deal.status !== "completed"),
    [deals]
  );

  return (
    <main className="app">
      <h1>Arbitrage OS</h1>
      <h2>Phase 1 Dashboard</h2>

      {error ? <p className="error">{error}</p> : null}

      <section className="cards">
        <article className="card">
          <div className="card-title">Active Deals</div>
          <div className="card-value">{dashboard?.active_deals ?? 0}</div>
        </article>
        <article className="card">
          <div className="card-title">Completed Deals</div>
          <div className="card-value">{dashboard?.completed_deals ?? 0}</div>
        </article>
        <article className="card">
          <div className="card-title">Projected Profit</div>
          <div className="card-value">
            ${(dashboard?.projected_profit_total ?? 0).toFixed(2)}
          </div>
        </article>
        <article className="card">
          <div className="card-title">Realized Profit</div>
          <div className="card-value">
            ${(dashboard?.realized_profit_total ?? 0).toFixed(2)}
          </div>
        </article>
      </section>

      {dashboard && dashboard.aging_alerts.length > 0 ? (
        <ul className="alerts">
          {dashboard.aging_alerts.map((alert) => (
            <li key={alert.id}>
              {alert.label} ({alert.status}) - {alert.days_in_stage} days in stage
            </li>
          ))}
        </ul>
      ) : null}

      <section className="section">
        <h3>Deal Entry</h3>
        <form className="grid" onSubmit={handleSubmit}>
          <label className="field">
            Label
            <input
              required
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
            />
          </label>

          <label className="field">
            Category
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  category: e.target.value as (typeof CATEGORY_OPTIONS)[number],
                })
              }
            >
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Source Platform
            <select
              value={formData.source_platform}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  source_platform: e.target.value as (typeof SOURCE_PLATFORM_OPTIONS)[number],
                })
              }
            >
              {SOURCE_PLATFORM_OPTIONS.map((platform) => (
                <option key={platform} value={platform}>
                  {platform}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Acquisition State
            <input
              required
              value={formData.acquisition_state}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  acquisition_state: e.target.value.toUpperCase(),
                })
              }
            />
          </label>

          <label className="field">
            Acquisition Cost
            <input
              required
              type="number"
              step="0.01"
              value={formData.acquisition_cost}
              onChange={(e) =>
                setFormData({ ...formData, acquisition_cost: e.target.value })
              }
            />
          </label>

          <label className="field">
            Buyer Premium %
            <input
              required
              type="number"
              step="0.01"
              value={formData.buyer_premium_pct}
              onChange={(e) =>
                setFormData({ ...formData, buyer_premium_pct: e.target.value })
              }
            />
          </label>

          <label className="field">
            Transport Type
            <select
              value={formData.transport_type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  transport_type: e.target.value as (typeof TRANSPORT_TYPE_OPTIONS)[number],
                })
              }
            >
              {TRANSPORT_TYPE_OPTIONS.map((transportType) => (
                <option key={transportType} value={transportType}>
                  {transportType}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Transport Cost Actual
            <input
              type="number"
              step="0.01"
              value={formData.transport_cost_actual}
              onChange={(e) =>
                setFormData({ ...formData, transport_cost_actual: e.target.value })
              }
            />
          </label>

          <label className="field">
            Transport Cost Estimated
            <input
              type="number"
              step="0.01"
              value={formData.transport_cost_estimated}
              onChange={(e) =>
                setFormData({ ...formData, transport_cost_estimated: e.target.value })
              }
            />
          </label>

          <label className="field">
            Repair Cost
            <input
              type="number"
              step="0.01"
              value={formData.repair_cost}
              onChange={(e) => setFormData({ ...formData, repair_cost: e.target.value })}
            />
          </label>

          <label className="field">
            Prep Cost
            <input
              type="number"
              step="0.01"
              value={formData.prep_cost}
              onChange={(e) => setFormData({ ...formData, prep_cost: e.target.value })}
            />
          </label>

          <label className="field">
            Estimated Market Value
            <input
              required
              type="number"
              step="0.01"
              value={formData.estimated_market_value}
              onChange={(e) =>
                setFormData({ ...formData, estimated_market_value: e.target.value })
              }
            />
          </label>

          <label className="field">
            Condition Grade
            <select
              value={formData.condition_grade}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  condition_grade: e.target.value as (typeof CONDITION_GRADE_OPTIONS)[number],
                })
              }
            >
              {CONDITION_GRADE_OPTIONS.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>

          <label className="field full">
            Condition Notes
            <textarea
              rows={2}
              value={formData.condition_notes}
              onChange={(e) =>
                setFormData({ ...formData, condition_notes: e.target.value })
              }
            />
          </label>

          <label className="field">
            Presentation Quality
            <input
              value={formData.presentation_quality}
              onChange={(e) =>
                setFormData({ ...formData, presentation_quality: e.target.value })
              }
            />
          </label>

          <label className="field">
            &nbsp;
            <button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Create Deal"}
            </button>
          </label>
        </form>
      </section>

      <section className="section">
        <h3>Deal Tracking</h3>
        {loading ? <p>Loading...</p> : null}
        {!loading && deals.length === 0 ? <p>No deals yet.</p> : null}

        <div className="deals">
          {deals.map((item) => {
            const next = nextStage(item.deal.status);
            return (
              <article className="deal" key={item.deal.id}>
                <div className="deal-head">
                  <h4>{item.deal.label}</h4>
                  <strong>{item.deal.status}</strong>
                </div>
                <p className="deal-meta">
                  {item.deal.category} · {item.deal.source_platform} ·{" "}
                  {item.deal.acquisition_state}
                </p>
                <div className="deal-metrics">
                  <div>
                    <div className="card-title">Cost Basis</div>
                    <div>${item.calculations.total_cost_basis.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="card-title">Projected</div>
                    <div>${item.calculations.projected_profit.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="card-title">Realized</div>
                    <div>${item.calculations.realized_profit.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="card-title">Days In Stage</div>
                    <div>{item.calculations.days_in_stage}</div>
                  </div>
                </div>
                <div className="next-stage">
                  <button
                    disabled={!next || updatingDealId === item.deal.id}
                    onClick={() => void handleStageAdvance(item)}
                  >
                    {next ? `Advance to ${next}` : "Completed"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section">
        <h3>Totals</h3>
        <p>Active deals: {activeDeals.length}</p>
        <p>Completed deals: {completedDeals.length}</p>
        <p>
          Realized vs Projected: $
          {(dashboard?.realized_profit_total ?? 0).toFixed(2)} / $
          {(dashboard?.projected_profit_total ?? 0).toFixed(2)}
        </p>
      </section>
    </main>
  );
}

export default App;
