import { useState } from "react";
import { queryAssistant } from "../api";
import type { AssistantQueryResponse, DealView } from "../types";

interface DetailPanelProps {
  deal: DealView;
}

const DetailPanel = ({ deal }: DetailPanelProps) => {
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantResponse, setAssistantResponse] = useState<AssistantQueryResponse | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const unitBreakdown = deal.deal.unit_breakdown;
  const prepMetrics = deal.deal.prep_metrics;
  const mismatch = (deal.warnings ?? []).some((warning) =>
    warning.includes("Potential transport mismatch")
  );
  const qualityFlag = deal.calculations.source_quality_flag;
  const efficiencyClass =
    deal.calculations.efficiency_rating === "GOOD"
      ? "efficiency-good"
      : deal.calculations.efficiency_rating === "WARNING"
        ? "efficiency-warning"
        : deal.calculations.efficiency_rating === "BAD"
          ? "efficiency-bad"
          : undefined;

  const handleAssistantQuery = async () => {
    const trimmed = assistantQuestion.trim();
    if (!trimmed) {
      return;
    }
    setAssistantLoading(true);
    setAssistantError(null);
    try {
      const result = await queryAssistant({
        deal_id: deal.deal.id,
        assistant_context: deal.assistant_context,
        question: trimmed,
      });
      setAssistantResponse(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Assistant query failed";
      setAssistantError(message);
    } finally {
      setAssistantLoading(false);
    }
  };

  return (
    <div className="detail-panel">
      <p className="deal-meta">
        {deal.deal.category} · {deal.deal.source_platform} · {deal.deal.acquisition_state}
      </p>
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
      <div className="unit-breakdown">
        <div className="card-title">Ask about this deal</div>
        <textarea
          rows={2}
          value={assistantQuestion}
          onChange={(event) => setAssistantQuestion(event.target.value)}
          placeholder="Ask for risk summary or next step..."
        />
        <button type="button" onClick={() => void handleAssistantQuery()} disabled={assistantLoading}>
          {assistantLoading ? "Asking..." : "Ask"}
        </button>
        {assistantError ? <p className="warning-text">{assistantError}</p> : null}
        {assistantResponse ? (
          <div>
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
    </div>
  );
};

export default DetailPanel;
