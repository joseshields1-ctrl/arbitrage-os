import type { DealStage, DealView } from "../types";

interface DealCardProps {
  deal: DealView;
  selected: boolean;
  nextStage: DealStage | null;
  disabled: boolean;
  onAdvance: () => void;
  onSelect: () => void;
}

const formatCurrency = (value: number | null): string =>
  value === null ? "N/A" : `$${value.toFixed(2)}`;

function DealCard({
  deal,
  selected,
  nextStage,
  disabled,
  onAdvance,
  onSelect,
}: DealCardProps) {
  const { calculations } = deal;
  const sellerTypeIcon =
    deal.deal.seller_type === "government"
      ? "🏛️"
      : deal.deal.seller_type === "commercial"
        ? "⚠️"
        : "❓";
  const profitLabel = deal.deal.status === "completed" ? "Realized Profit" : "Projected Profit (est.)";
  const profitValue =
    deal.deal.status === "completed"
      ? calculations.realized_profit
      : calculations.projected_profit;
  const alertCount = deal.alerts?.length ?? 0;
  const criticalAlertCount =
    deal.alerts?.filter((alert) => alert.severity === "critical").length ?? 0;
  const hasTitleDelay = (deal.warnings ?? []).includes("TITLE_DELAY");
  const hasLowConfidence = (deal.warnings ?? []).includes("LOW_DATA_CONFIDENCE");
  const hasTransportEstimated = (deal.warnings ?? []).includes("TRANSPORT_ESTIMATED");

  return (
    <article className={`deal-card pipeline-card${selected ? " selected" : ""}`} key={deal.deal.id}>
      <div className="deal-card-head">
        <h4>
          {sellerTypeIcon} {deal.deal.label}{" "}
          <span className="deal-card-category">({deal.deal.category})</span>
        </h4>
        <strong className={`status-badge status-${deal.deal.status}`}>{deal.deal.status}</strong>
      </div>
      <div className="deal-card-metrics">
        <div>
          <div className="card-title">Cost Basis</div>
          <div>{formatCurrency(calculations.total_cost_basis)}</div>
        </div>
        <div>
          <div className="card-title">{profitLabel}</div>
          <div>{formatCurrency(profitValue)}</div>
        </div>
        <div>
          <div className="card-title">Scores</div>
          <div className="score-strip">
            ACQ {deal.engine.scoring.acquisition_score} / EXIT {deal.engine.scoring.exit_score} /
            CONF {deal.calculations.data_confidence}
          </div>
        </div>
        <div>
          <div className="card-title">Alerts</div>
          <div className={criticalAlertCount > 0 ? "alert-badge critical" : "alert-badge"}>
            {alertCount}
          </div>
        </div>
      </div>
      <div className="pipeline-risk-flags">
        {hasTitleDelay ? <span className="risk-chip warning">TITLE_DELAY</span> : null}
        {hasLowConfidence ? <span className="risk-chip warning">LOW_DATA_CONFIDENCE</span> : null}
        {hasTransportEstimated ? <span className="risk-chip">Estimated Transport</span> : null}
      </div>
      <div className="deal-card-actions">
        <button type="button" onClick={onSelect}>
          Open
        </button>
        <button
          disabled={!nextStage || disabled}
          onClick={onAdvance}
        >
          {nextStage ? `Advance to ${nextStage}` : "Completed"}
        </button>
      </div>
    </article>
  );
}

export default DealCard;
