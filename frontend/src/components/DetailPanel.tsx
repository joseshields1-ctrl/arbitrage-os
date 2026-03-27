import type { DealView } from "../types";

interface DetailPanelProps {
  deal: DealView;
}

const DetailPanel = ({ deal }: DetailPanelProps) => {
  const unitBreakdown = deal.deal.unit_breakdown;
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
      {mismatch ? (
        <p className="warning-text">
          Potential mismatch: electronics_bulk usually fits local_pickup or freight.
        </p>
      ) : null}
    </div>
  );
};

export default DetailPanel;
