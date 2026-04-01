import { useMemo, useState } from "react";
import { submitDealDecision } from "../api";
import type { DealView, ReconditioningRecord, VehicleMarketIntel } from "../types";
import {
  buildMarketLinks,
  calculateRoiPct,
  computeBlendedMarketValue,
  computeDaysToCashBack,
  getCapitalVelocityLabel,
  normalizeVehicleIntel,
} from "../utils/marketIntel";
import VehicleMarketPanel from "./VehicleMarketPanel";
import ReconditioningPanel from "./ReconditioningPanel";

interface DetailPanelProps {
  deal: DealView;
  marketIntel: VehicleMarketIntel;
  reconditioning: ReconditioningRecord;
  activeTab: "decision" | "market" | "recon";
  onMarketIntelChange: (dealId: string, intel: VehicleMarketIntel) => void;
  onReconditioningChange: (dealId: string, next: ReconditioningRecord) => void;
  onRequestApproveDecision: (dealId: string) => void;
  onOverrideDeal: (
    dealId: string,
    payload: {
      deal?: {
        acquisition_state?: string;
        seller_type?: "government" | "commercial" | "unknown";
        quantity_purchased?: number | null;
        quantity_broken?: number | null;
      };
      financials?: {
        acquisition_cost?: number;
        buyer_premium_pct?: number;
        tax_rate?: number | null;
        transport_cost_actual?: number | null;
        transport_cost_estimated?: number | null;
        repair_cost?: number | null;
        prep_cost?: number | null;
        estimated_market_value?: number;
        sale_price_actual?: number | null;
      };
      metadata?: {
        condition_grade?: import("../types").ConditionGrade;
        condition_notes?: string;
        transport_type?: import("../types").TransportType;
        presentation_quality?: string;
        removal_deadline?: string | null;
        title_status?: import("../types").TitleStatus;
      };
    }
  ) => Promise<void>;
}

const formatCurrency = (value: number | null): string =>
  value === null ? "N/A" : `$${value.toFixed(2)}`;

const DetailPanel = ({
  deal,
  marketIntel,
  reconditioning,
  activeTab,
  onMarketIntelChange,
  onReconditioningChange,
  onRequestApproveDecision,
  onOverrideDeal,
}: DetailPanelProps) => {
  const unitBreakdown = deal.deal.unit_breakdown;
  const prepMetrics = deal.deal.prep_metrics;
  const mismatch = (deal.warnings ?? []).some((warning) =>
    warning.includes("Potential transport mismatch")
  );
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideForm, setOverrideForm] = useState({
    acquisition_state: deal.deal.acquisition_state ?? "",
    seller_type: deal.deal.seller_type ?? "unknown",
    current_bid: String(deal.financials.acquisition_cost ?? ""),
    buyer_premium_pct: String(deal.financials.buyer_premium_pct ?? ""),
    estimated_resale_value: String(deal.financials.estimated_market_value ?? ""),
    transport_cost_estimated:
      deal.financials.transport_cost_estimated === null ? "" : String(deal.financials.transport_cost_estimated),
    repair_cost: deal.financials.repair_cost === null ? "" : String(deal.financials.repair_cost),
    quantity_purchased:
      deal.deal.quantity_purchased === null || deal.deal.quantity_purchased === undefined
        ? ""
        : String(deal.deal.quantity_purchased),
    quantity_broken:
      deal.deal.quantity_broken === null || deal.deal.quantity_broken === undefined
        ? ""
        : String(deal.deal.quantity_broken),
    condition_notes: deal.metadata.condition_notes ?? "",
    title_status: deal.metadata.title_status ?? "unknown",
  });
  const [showPreviousDecisions, setShowPreviousDecisions] = useState(false);
  const normalizedIntel = useMemo(() => normalizeVehicleIntel(marketIntel), [marketIntel]);
  const qualityFlag = deal.calculations.source_quality_flag;
  const latestDecision = deal.operator_decision_history[0] ?? null;
  const previousDecisions = deal.operator_decision_history.slice(1);
  const keyWarnings = Array.from(
    new Set(
      (deal.warnings ?? []).filter((warning) =>
        [
          "TITLE_DELAY",
          "LOW_DATA_CONFIDENCE",
          "TRANSPORT_ESTIMATED",
          "REMOVAL_URGENT",
          "REVIEW_MARGIN",
          "UNKNOWN_SELLER_TYPE",
          "FORCE_LIQUIDATION",
          "STAGE_CRITICAL",
        ].includes(warning)
      )
    )
  );
  const efficiencyClass =
    deal.calculations.efficiency_rating === "GOOD"
      ? "efficiency-good"
      : deal.calculations.efficiency_rating === "WARNING"
        ? "efficiency-warning"
        : deal.calculations.efficiency_rating === "BAD"
          ? "efficiency-bad"
          : undefined;
  const categoryGroup = deal.deal.category.startsWith("vehicle") ? "vehicle" : "other";
  const blendedMarketValue = computeBlendedMarketValue(
    normalizedIntel,
    deal.financials.estimated_market_value
  );
  const marketLinks = buildMarketLinks(deal.deal.label);
  const totalInvestment =
    deal.calculations.total_cost_basis + (deal.financials.repair_cost ?? 0) + (deal.financials.prep_cost ?? 0);
  const projectedResale = blendedMarketValue ?? deal.financials.estimated_market_value;
  const projectedNet = projectedResale - totalInvestment;
  const projectedRoiPct = calculateRoiPct(projectedNet, totalInvestment);
  const reconTotal = reconditioning.entries.reduce((sum, entry) => sum + entry.cost, 0);
  const projectedAfterRecon = projectedNet - reconTotal;
  const cycleStart = deal.deal.discovered_date ?? deal.deal.purchase_date ?? deal.deal.stage_updated_at;
  const cycleEnd = deal.deal.completion_date ?? deal.deal.sale_date ?? deal.deal.stage_updated_at;
  const daysToSell =
    deal.deal.sale_date && cycleStart
      ? Math.max(
          0,
          Math.floor((Date.parse(deal.deal.sale_date) - Date.parse(cycleStart)) / (1000 * 60 * 60 * 24))
        )
      : null;
  const totalCycleTime =
    cycleEnd
      ? Math.max(
          0,
          Math.floor((Date.parse(cycleEnd) - Date.parse(cycleStart)) / (1000 * 60 * 60 * 24))
        )
      : null;
  const daysToCashBack = computeDaysToCashBack(deal);
  const capitalVelocityLabel = getCapitalVelocityLabel(daysToCashBack);
  const realizedRoiPct = calculateRoiPct(deal.calculations.realized_profit, deal.calculations.total_cost_basis);

  const handleRejectDecision = async () => {
    const trimmedReason = decisionReason.trim();
    if (!trimmedReason) {
      setDecisionError("Reason is required.");
      return;
    }
    setDecisionSubmitting(true);
    setDecisionError(null);
    try {
      await submitDealDecision(deal.deal.id, {
        decision: "rejected",
        reason: trimmedReason,
      });
      setDecisionReason("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save decision";
      setDecisionError(message);
    } finally {
      setDecisionSubmitting(false);
    }
  };

  const parseNullableNumber = (value: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleDealOverrideSave = async () => {
    setOverrideError(null);
    setOverrideMessage(null);
    const acquisitionCost = parseNullableNumber(overrideForm.current_bid);
    const buyerPremium = parseNullableNumber(overrideForm.buyer_premium_pct);
    const estimatedResale = parseNullableNumber(overrideForm.estimated_resale_value);
    const transportEstimated = parseNullableNumber(overrideForm.transport_cost_estimated);
    const repairCost = parseNullableNumber(overrideForm.repair_cost);
    const quantityPurchased = parseNullableNumber(overrideForm.quantity_purchased);
    const quantityBroken = parseNullableNumber(overrideForm.quantity_broken);
    if (acquisitionCost === null || acquisitionCost < 0) {
      setOverrideError("Current bid must be a valid non-negative number.");
      return;
    }
    if (buyerPremium === null || buyerPremium < 0) {
      setOverrideError("Buyer premium must be a valid non-negative number.");
      return;
    }
    if (estimatedResale === null || estimatedResale < 0) {
      setOverrideError("Estimated resale must be a valid non-negative number.");
      return;
    }
    setOverrideBusy(true);
    try {
      await onOverrideDeal(deal.deal.id, {
        deal: {
          acquisition_state: overrideForm.acquisition_state.trim() || deal.deal.acquisition_state,
          seller_type: overrideForm.seller_type,
          quantity_purchased: quantityPurchased === null ? null : Math.max(0, Math.floor(quantityPurchased)),
          quantity_broken: quantityBroken === null ? null : Math.max(0, Math.floor(quantityBroken)),
        },
        financials: {
          acquisition_cost: Math.max(0, acquisitionCost),
          buyer_premium_pct: Math.max(0, buyerPremium),
          estimated_market_value: Math.max(0, estimatedResale),
          transport_cost_estimated: transportEstimated === null ? null : Math.max(0, transportEstimated),
          repair_cost: repairCost === null ? null : Math.max(0, repairCost),
        },
        metadata: {
          condition_notes: overrideForm.condition_notes,
          title_status: overrideForm.title_status,
        },
      });
      setOverrideMessage("Numbers updated.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update numbers.";
      setOverrideError(message);
    } finally {
      setOverrideBusy(false);
    }
  };

  return (
    <div className="detail-panel">
      <p className="deal-card-meta">
        {deal.deal.category} · {deal.deal.source_platform} · {deal.deal.acquisition_state}
      </p>
      <div className="decision-section risk-summary">
        <h4>Risk Summary</h4>
        <p>
          <strong>Seller Type:</strong> {deal.deal.seller_type}
        </p>
        <p>
          <strong>Data Confidence:</strong> {deal.calculations.data_confidence}
        </p>
        <p>
          <strong>Stage Alert:</strong> {deal.calculations.stage_alert}
        </p>
        <p>
          <strong>Key Warnings:</strong>{" "}
          {keyWarnings.length > 0 ? keyWarnings.join(", ") : "none"}
        </p>
      </div>
      <div className="decision-section">
        <h4>Upside Snapshot</h4>
        <p>
          <strong>Blended Market Value:</strong>{" "}
          {formatCurrency(blendedMarketValue)}
        </p>
        <p>
          <strong>Acquisition Cost:</strong> {formatCurrency(deal.financials.acquisition_cost)}
        </p>
        <p>
          <strong>Estimated Repairs:</strong>{" "}
          {formatCurrency((deal.financials.repair_cost ?? 0) + (deal.financials.prep_cost ?? 0))}
        </p>
        <p>
          <strong>Total Investment:</strong> {formatCurrency(totalInvestment)}
        </p>
        <p>
          <strong>Projected Resale:</strong> {formatCurrency(projectedResale)}
        </p>
        <p>
          <strong>Net Profit:</strong> {formatCurrency(projectedNet)}
        </p>
        <p>
          <strong>ROI %:</strong>{" "}
          {deal.deal.status === "completed" ? realizedRoiPct.toFixed(1) : projectedRoiPct.toFixed(1)}%
        </p>
      </div>
      {activeTab === "decision" ? (
        <div className="detail-tab-content">
          <div className="decision-hero-metrics">
            <div className="hero-metric">
              <span>Profit</span>
              <strong>{formatCurrency(projectedNet)}</strong>
            </div>
            <div className="hero-metric">
              <span>ROI</span>
              <strong>{projectedRoiPct.toFixed(1)}%</strong>
            </div>
            <div className="hero-metric">
              <span>Distance</span>
              <strong>
                {(deal.engine?.cost_basis?.cost_basis_breakdown?.transport ??
                  deal.financials.transport_cost_estimated ??
                  deal.financials.transport_cost_actual ??
                  0) > 0
                  ? formatCurrency(
                      deal.engine?.cost_basis?.cost_basis_breakdown?.transport ??
                        deal.financials.transport_cost_estimated ??
                        deal.financials.transport_cost_actual ??
                        0
                    )
                  : "N/A"}
              </strong>
            </div>
          </div>
          <div className="decision-section">
            <h4>Capital Velocity</h4>
            <p>
              <strong>ROI %:</strong> {projectedRoiPct.toFixed(1)}%
            </p>
            <p>
              <strong>Days to Sell:</strong> {daysToSell === null ? "N/A" : daysToSell}
            </p>
            <p>
              <strong>Total Cycle Time:</strong> {totalCycleTime === null ? "N/A" : totalCycleTime}
            </p>
            <p>
              <strong>Days to Cash Back:</strong> {daysToCashBack}
            </p>
            <p>
              <strong>Capital Velocity:</strong> {capitalVelocityLabel}
            </p>
          </div>
          {unitBreakdown ? (
            <div className="unit-breakdown">
              <div>
                <div className="card-title">Total Units</div>
                <div>{unitBreakdown.units_total}</div>
              </div>
              <div>
                <div className="card-title">Working</div>
                <div>{unitBreakdown.units_working}</div>
              </div>
              <div>
                <div className="card-title">Minor Issue</div>
                <div>{unitBreakdown.units_minor_issue}</div>
              </div>
              <div>
                <div className="card-title">Defective</div>
                <div>{unitBreakdown.units_defective}</div>
              </div>
              <div>
                <div className="card-title">Locked</div>
                <div>{unitBreakdown.units_locked}</div>
              </div>
            </div>
          ) : null}
          {prepMetrics ? (
            <div className="unit-breakdown">
              <div className="card-title">Prep Metrics</div>
              <div>Total Units: {prepMetrics.total_units}</div>
              <div>
                Working: {prepMetrics.working_units} · Cosmetic: {prepMetrics.cosmetic_units}
              </div>
              <div>
                Functional: {prepMetrics.functional_units} · Defective:{" "}
                {prepMetrics.defective_units}
              </div>
              <div>
                Locked: {prepMetrics.locked_units} · Total Prep Minutes:{" "}
                {prepMetrics.total_prep_time_minutes}
              </div>
              <div>
                Avg Time / Unit:{" "}
                {deal.calculations.avg_time_per_unit === null
                  ? "N/A"
                  : `${deal.calculations.avg_time_per_unit.toFixed(2)} min`}
              </div>
              {deal.calculations.efficiency_rating ? (
                <div className={efficiencyClass}>
                  Efficiency Rating: {deal.calculations.efficiency_rating}
                </div>
              ) : (
                <div>Efficiency Rating: N/A</div>
              )}
              {qualityFlag ? (
                <p className="warning-text">Source Quality Flag: {qualityFlag}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {activeTab === "market" && categoryGroup === "vehicle" ? (
        <div className="detail-tab-content">
          <VehicleMarketPanel
            intel={normalizedIntel}
            marketLinks={marketLinks}
            onIntelChange={(next) => onMarketIntelChange(deal.deal.id, next)}
          />
          <div className="decision-section">
            <h4>Transport Cost Realism</h4>
            <p>
              Standard transport usually ranges from <strong>$0.60-$0.80/mile</strong>.
              Urgent moves can run up to <strong>$1.00/mile</strong>.
            </p>
            <p>
              <strong>Actual Transport:</strong>{" "}
              {deal.financials.transport_cost_actual === null
                ? "Not entered"
                : formatCurrency(deal.financials.transport_cost_actual)}
            </p>
            <p>
              <strong>Estimated Transport:</strong>{" "}
              {deal.financials.transport_cost_estimated === null
                ? "Not entered"
                : `${formatCurrency(deal.financials.transport_cost_estimated)} (Estimated Transport)`}
            </p>
            {deal.warnings?.includes("TRANSPORT_ESTIMATED") ? (
              <p className="warning-text">TRANSPORT_ESTIMATED</p>
            ) : null}
          </div>
        </div>
      ) : null}
      {activeTab === "recon" && categoryGroup === "vehicle" ? (
        <div className="detail-tab-content">
          <ReconditioningPanel
            deal={deal}
            value={reconditioning}
            onChange={onReconditioningChange}
          />
          <div className="decision-section">
            <h4>Recon Impact</h4>
            <p>
              <strong>Total Recon Cost:</strong> {formatCurrency(reconTotal)}
            </p>
            <p>
              <strong>Profit After Recon:</strong> {formatCurrency(projectedAfterRecon)}
            </p>
          </div>
        </div>
      ) : null}
      {mismatch ? (
        <p className="warning-text">
          Potential mismatch: electronics_bulk usually fits local_pickup or freight.
        </p>
      ) : null}
      {deal.warnings?.includes("TRANSPORT_ESTIMATED") ? (
        <p className="warning-text">Estimated Transport (Estimated) — transport value is not actual.</p>
      ) : null}
      {activeTab === "decision" ? (
        <div className="detail-tab-content">
          {categoryGroup === "vehicle" ? (
            <div className="decision-section">
              <h4>Tab Focus</h4>
              <p>Market and recon fields are grouped in their tabs for faster operator review.</p>
            </div>
          ) : null}
          <div className="decision-section">
            <h4>Intake / Ops Fields</h4>
            <p>
              <strong>Title Status:</strong> {deal.metadata.title_status}
            </p>
            {(deal.deal.quantity_purchased !== null && deal.deal.quantity_purchased !== undefined) ||
            (deal.deal.quantity_broken !== null && deal.deal.quantity_broken !== undefined) ? (
              <p>
                <strong>Quantity Purchased:</strong> {deal.deal.quantity_purchased ?? "N/A"} ·{" "}
                <strong>Quantity Broken:</strong> {deal.deal.quantity_broken ?? "N/A"}
              </p>
            ) : null}
            <p className={deal.warnings?.includes("REMOVAL_URGENT") ? "warning-text" : undefined}>
              <strong>Removal Deadline:</strong>{" "}
              {deal.metadata.removal_deadline
                ? new Date(deal.metadata.removal_deadline).toLocaleString()
                : "Not provided"}
            </p>
            {deal.warnings?.includes("REMOVAL_URGENT") ? (
              <p className="warning-text">REMOVAL_URGENT — deadline is near, prioritize execution.</p>
            ) : null}
          </div>
          <div className="decision-section">
            <h4>Edit Numbers</h4>
            <div className="form-grid-two">
              <label>
                Acquisition State
                <input
                  value={overrideForm.acquisition_state}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({ ...prev, acquisition_state: event.target.value.toUpperCase() }))
                  }
                />
              </label>
              <label>
                Seller Type
                <select
                  value={overrideForm.seller_type}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({
                      ...prev,
                      seller_type: event.target.value as "government" | "commercial" | "unknown",
                    }))
                  }
                >
                  <option value="government">government</option>
                  <option value="commercial">commercial</option>
                  <option value="unknown">unknown</option>
                </select>
              </label>
              <label>
                Current Bid
                <input
                  type="number"
                  step="0.01"
                  value={overrideForm.current_bid}
                  onChange={(event) => setOverrideForm((prev) => ({ ...prev, current_bid: event.target.value }))}
                />
              </label>
              <label>
                Buyer Premium (decimal)
                <input
                  type="number"
                  step="0.001"
                  value={overrideForm.buyer_premium_pct}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({ ...prev, buyer_premium_pct: event.target.value }))
                  }
                />
              </label>
              <label>
                Estimated Resale
                <input
                  type="number"
                  step="0.01"
                  value={overrideForm.estimated_resale_value}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({ ...prev, estimated_resale_value: event.target.value }))
                  }
                />
              </label>
              <label>
                Transport (estimated)
                <input
                  type="number"
                  step="0.01"
                  value={overrideForm.transport_cost_estimated}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({ ...prev, transport_cost_estimated: event.target.value }))
                  }
                />
              </label>
              <label>
                Repair
                <input
                  type="number"
                  step="0.01"
                  value={overrideForm.repair_cost}
                  onChange={(event) => setOverrideForm((prev) => ({ ...prev, repair_cost: event.target.value }))}
                />
              </label>
              <label>
                Title Status
                <select
                  value={overrideForm.title_status}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({
                      ...prev,
                      title_status: event.target.value as "on_site" | "delayed" | "unknown",
                    }))
                  }
                >
                  <option value="on_site">on_site</option>
                  <option value="delayed">delayed</option>
                  <option value="unknown">unknown</option>
                </select>
              </label>
              <label>
                Quantity Purchased
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={overrideForm.quantity_purchased}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({ ...prev, quantity_purchased: event.target.value }))
                  }
                />
              </label>
              <label>
                Quantity Broken
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={overrideForm.quantity_broken}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({ ...prev, quantity_broken: event.target.value }))
                  }
                />
              </label>
              <label className="span-two">
                Condition Assumptions
                <textarea
                  rows={3}
                  value={overrideForm.condition_notes}
                  onChange={(event) =>
                    setOverrideForm((prev) => ({ ...prev, condition_notes: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="entry-actions">
              <button type="button" disabled={overrideBusy} onClick={() => void handleDealOverrideSave()}>
                {overrideBusy ? "Saving..." : "Save Numbers"}
              </button>
            </div>
            {overrideMessage ? <p className="decision-confirmation">{overrideMessage}</p> : null}
            {overrideError ? <p className="warning-text">{overrideError}</p> : null}
          </div>
          {deal.alerts && deal.alerts.length > 0 ? (
            <div className="decision-section">
              <h4>Alerts</h4>
              <ul>
                {deal.alerts.map((alert) => (
                  <li key={`${alert.code}-${alert.message}`}>
                    <strong className={alert.severity === "critical" ? "alert-critical" : ""}>
                      [{alert.severity.toUpperCase()}]
                    </strong>{" "}
                    {alert.code}: {alert.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="decision-section">
            <h4>AI Recommendation</h4>
            <p className="ai-primary">
              <strong>Suggested Action:</strong>{" "}
              <span className="ai-action-pill">{deal.ai_recommendation.suggested_action}</span>
            </p>
            <p>
              <strong>Confidence:</strong>{" "}
              <span className="confidence-badge">{deal.ai_recommendation.confidence}</span>
            </p>
            <p>
              <strong>Reasoning:</strong> {deal.ai_recommendation.reasoning}
            </p>
            {deal.ai_recommendation.key_factors.length > 0 ? (
              <ul>
                {deal.ai_recommendation.key_factors.map((factor) => (
                  <li key={factor}>{factor}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="decision-section">
            <h4>Your Decision</h4>
            {latestDecision ? (
              <div className="preview-box">
                <p>
                  <strong>Latest:</strong> {latestDecision.decision} at{" "}
                  {new Date(latestDecision.decided_at).toLocaleString()}
                </p>
                <p>
                  <strong>Reason:</strong> {latestDecision.reason}
                </p>
                <p>
                  <strong>AI Snapshot:</strong> {latestDecision.ai_recommendation_snapshot.suggested_action} (
                  {latestDecision.ai_recommendation_snapshot.confidence})
                </p>
              </div>
            ) : null}
            {deal.operator_decision_history.length > 1 ? (
              <div className="preview-box">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setShowPreviousDecisions((value) => !value)}
                >
                  {showPreviousDecisions
                    ? `Hide history (${previousDecisions.length})`
                    : `Show history (${previousDecisions.length})`}
                </button>
                {showPreviousDecisions ? (
                  <ul>
                    {previousDecisions.map((decision) => (
                      <li key={decision.id}>
                        {new Date(decision.decided_at).toLocaleString()} - {decision.decision}:{" "}
                        {decision.reason} (AI: {decision.ai_recommendation_snapshot.suggested_action}/
                        {decision.ai_recommendation_snapshot.confidence})
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <label>
              Why? (required)
              <textarea
                rows={2}
                value={decisionReason}
                onChange={(event) => setDecisionReason(event.target.value)}
                placeholder="Enter operator reasoning..."
              />
            </label>
            <div className="entry-actions">
              <button
                type="button"
                disabled={decisionSubmitting}
                onClick={() => onRequestApproveDecision(deal.deal.id)}
              >
                Approve
              </button>
              <button
                type="button"
                disabled={decisionSubmitting}
                onClick={() => void handleRejectDecision()}
              >
                Reject
              </button>
            </div>
            {decisionError ? <p className="warning-text">{decisionError}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DetailPanel;
