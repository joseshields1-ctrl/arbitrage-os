import type { DealView } from "../types";

interface DetailPanelProps {
  deal: DealView;
}

const DetailPanel = ({ deal }: DetailPanelProps) => {
  const unitBreakdown = deal.deal.unit_breakdown;
  const prepMetrics = deal.deal.prep_metrics;
  const mismatch = (deal.warnings ?? []).some((warning) =>
    warning.includes("Potential transport mismatch")
  );

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
          <div>Avg Time Per Unit: {prepMetrics.avg_time_per_unit.toFixed(2)} min</div>
          <div>
            Efficiency: {deal.calculations.efficiency_rating} (
            {(deal.calculations.efficiency_score ?? 0).toFixed(2)} min/unit)
          </div>
        </div>
      ) : null}
      {mismatch ? (
        <p className="warning-text">
          Potential mismatch: electronics_bulk usually fits local_pickup or freight.
        </p>
      ) : null}
    </div>
  );
};

export default DetailPanel;
