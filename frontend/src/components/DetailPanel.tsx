import { useState } from "react";
import { submitDealDecision } from "../api";
import type { DealView } from "../types";

interface DetailPanelProps {
  deal: DealView;
  onDecisionRecorded: (updatedDeal: DealView) => void;
}

const DetailPanel = ({ deal, onDecisionRecorded }: DetailPanelProps) => {
  const unitBreakdown = deal.deal.unit_breakdown;
  const prepMetrics = deal.deal.prep_metrics;
  const mismatch = (deal.warnings ?? []).some((warning) =>
    warning.includes("Potential transport mismatch")
  );
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionConfirmation, setDecisionConfirmation] = useState<string | null>(null);
  const [showPreviousDecisions, setShowPreviousDecisions] = useState(false);
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

  const handleDecision = async (decision: "approved" | "rejected") => {
    const trimmedReason = decisionReason.trim();
    if (!trimmedReason) {
      setDecisionError("Reason is required.");
      setDecisionConfirmation(null);
      return;
    }
    setDecisionSubmitting(true);
    setDecisionError(null);
    setDecisionConfirmation(null);
    try {
      const response = await submitDealDecision(deal.deal.id, {
        decision,
        reason: trimmedReason,
      });
      onDecisionRecorded(response.deal);
      setDecisionReason("");
      setDecisionConfirmation(
        `Saved decision: ${response.stored_decision.decision} at ${new Date(
          response.stored_decision.decided_at
        ).toLocaleString()}`
      );
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
      {mismatch ? (
        <p className="warning-text">
          Potential mismatch: electronics_bulk usually fits local_pickup or freight.
        </p>
      ) : null}
      {deal.warnings?.includes("TRANSPORT_ESTIMATED") ? (
        <p className="warning-text">Estimated Transport (Estimated) — transport value is not actual.</p>
      ) : null}
      <div className="decision-section">
        <h4>Intake / Ops Fields</h4>
        <p>
          <strong>Title Status:</strong> {deal.metadata.title_status}
        </p>
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
            onClick={() => void handleDecision("approved")}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={decisionSubmitting}
            onClick={() => void handleDecision("rejected")}
          >
            Reject
          </button>
        </div>
        {decisionError ? <p className="warning-text">{decisionError}</p> : null}
        {decisionConfirmation ? (
          <p className="decision-confirmation">{decisionConfirmation}</p>
        ) : null}
      </div>
    </div>
  );
};

export default DetailPanel;
