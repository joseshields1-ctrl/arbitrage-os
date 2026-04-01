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
}: DetailPanelProps) => {
  const unitBreakdown = deal.deal.unit_breakdown;
  const prepMetrics = deal.deal.prep_metrics;
  const mismatch = (deal.warnings ?? []).some((warning) =>
    warning.includes("Potential transport mismatch")
  );
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
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
