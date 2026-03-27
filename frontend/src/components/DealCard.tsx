import type { DealStage, DealView } from "../types";

interface DealCardProps {
  deal: DealView;
  nextStage: DealStage | null;
  disabled: boolean;
  onAdvance: () => void;
}

const formatCurrency = (value: number): string => `$${value.toFixed(2)}`;

function DealCard({
  deal,
  nextStage,
  disabled,
  onAdvance,
}: DealCardProps) {
  const { calculations } = deal;
  const unitBreakdown = deal.deal.unit_breakdown;

  return (
    <article className="deal" key={deal.deal.id}>
      <div className="deal-head">
        <h4>{deal.deal.label}</h4>
        <strong>{deal.deal.status}</strong>
      </div>
      <p className="deal-meta">
        {deal.deal.category} · {deal.deal.source_platform} · {deal.deal.acquisition_state}
      </p>
      <div className="deal-metrics">
        <div>
          <div className="card-title">Cost Basis</div>
          <div>{formatCurrency(calculations.total_cost_basis)}</div>
        </div>
        <div>
          <div className="card-title">Projected</div>
          <div>{formatCurrency(calculations.projected_profit)}</div>
        </div>
        <div>
          <div className="card-title">Realized</div>
          <div>{formatCurrency(calculations.realized_profit)}</div>
        </div>
        <div>
          <div className="card-title">Days In Stage</div>
          <div>{calculations.days_in_stage}</div>
        </div>
      </div>

      {unitBreakdown ? (
        <div className="unit-breakdown">
          <div className="card-title">Units</div>
          <div>Total: {unitBreakdown.units_total}</div>
          <div>
            Working: {unitBreakdown.units_working} · Minor:{" "}
            {unitBreakdown.units_minor_issue}
          </div>
          <div>
            Defective: {unitBreakdown.units_defective} · Locked:{" "}
            {unitBreakdown.units_locked}
          </div>
        </div>
      ) : null}

      {(deal.warnings?.length ?? 0) > 0 ? (
        <ul className="warning-flags">
          {deal.warnings?.map((warning: string) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="next-stage">
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
