import type { DealView, ReconditioningRecord } from "../types";
import { calculateRoiPct, computeDaysToCashBack, getCapitalVelocityLabel } from "../utils/marketIntel";
import { computeReconditioningSummary, computeTimeDiscipline } from "../utils/reconditioning";

interface PreBidSanityModalProps {
  deal: DealView | null;
  reconditioning: ReconditioningRecord;
  isOpen: boolean;
  onClose: () => void;
  onAcknowledgeAndApprove: () => void;
}

const transportGuidance = "Standard transport is usually $0.60-$0.80/mi. Urgent runs can reach $1.00/mi.";

const PreBidSanityModal = ({
  deal,
  reconditioning,
  isOpen,
  onClose,
  onAcknowledgeAndApprove,
}: PreBidSanityModalProps) => {
  if (!isOpen || !deal) {
    return null;
  }

  const reconditioningSummary = computeReconditioningSummary(deal, reconditioning);
  const timeDiscipline = computeTimeDiscipline(deal, reconditioning);
  const estimatedTransport = deal.financials.transport_cost_estimated;
  const actualTransport = deal.financials.transport_cost_actual;
  const hasEstimatedTransport = actualTransport === null && estimatedTransport !== null;
  const hasMissingKeyWarning = deal.metadata.condition_notes.toLowerCase().includes("missing key");
  const nonRunnerWarning = deal.metadata.condition_notes.toLowerCase().includes("non-runner");
  const ehr =
    (deal.deal.prep_metrics?.total_prep_time_minutes ?? 0) > 0
      ? deal.calculations.projected_profit /
        ((deal.deal.prep_metrics?.total_prep_time_minutes ?? 1) / 60)
      : null;
  const ehrWarning = ehr !== null && ehr < 25;
  const projectedRoi = calculateRoiPct(deal.calculations.projected_profit, deal.calculations.total_cost_basis);
  const daysToCashBack = computeDaysToCashBack(deal);
  const bidCapGuidance = Math.max(
    0,
    (deal.financials.estimated_market_value * 0.78) -
      (deal.financials.repair_cost ?? 0) -
      (deal.financials.prep_cost ?? 0) -
      (actualTransport ?? estimatedTransport ?? 0)
  );
  const warningList =
    deal.warnings && deal.warnings.length > 0 ? deal.warnings : ["No explicit warning codes returned."];

  return (
    <div className="prebid-modal-backdrop" role="dialog" aria-modal="true">
      <div className="prebid-modal">
        <header className="prebid-header">
          <h3>Pre-Bid Sanity Check</h3>
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
        </header>

        <p className="prebid-intro">
          Direct check before approval. Confirm these risks now to avoid locking bad capital.
        </p>

        <div className="prebid-grid">
          <article>
            <h4>Title + Capital Lock</h4>
            <p>
              <strong>Status:</strong> {deal.metadata.title_status}
            </p>
            {deal.metadata.title_status !== "on_site" ? (
              <p className="warning-text">
                Pending title can lock capital and delay exit. Confirm margin still justifies this.
              </p>
            ) : (
              <p>Title appears on-site.</p>
            )}
          </article>

          <article>
            <h4>GovDeals Timing</h4>
            <p>
              <strong>Removal deadline:</strong>{" "}
              {deal.metadata.removal_deadline
                ? new Date(deal.metadata.removal_deadline).toLocaleString()
                : "Not provided"}
            </p>
            {timeDiscipline.state !== "recon_window" ? (
              <p className="warning-text">{timeDiscipline.warning}</p>
            ) : (
              <p>{timeDiscipline.label}</p>
            )}
          </article>

          <article>
            <h4>Transport Risk</h4>
            <p>{transportGuidance}</p>
            <p>
              <strong>Actual:</strong>{" "}
              {actualTransport === null ? "Not entered" : `$${actualTransport.toFixed(2)}`}
            </p>
            <p>
              <strong>Estimated:</strong>{" "}
              {estimatedTransport === null ? "Not entered" : `$${estimatedTransport.toFixed(2)}`}
            </p>
            {hasEstimatedTransport ? (
              <p className="warning-text">Estimated Transport + TRANSPORT_ESTIMATED warning active.</p>
            ) : null}
          </article>

          <article>
            <h4>Mechanical/Access Risk</h4>
            {hasMissingKeyWarning || nonRunnerWarning ? (
              <p className="warning-text">
                {hasMissingKeyWarning ? "Missing key risk. " : ""}
                {nonRunnerWarning ? "Non-runner risk." : ""}
                Plan additional recon buffer before approval.
              </p>
            ) : (
              <p>No explicit missing-key/non-runner warning in notes.</p>
            )}
          </article>

          <article>
            <h4>EHR + Velocity</h4>
            <p>
              <strong>EHR:</strong> {ehr === null ? "N/A" : `$${ehr.toFixed(2)}/hr`}
            </p>
            <p>
              <strong>ROI:</strong> {projectedRoi.toFixed(1)}%
            </p>
            <p>
              <strong>Days to Cash Back:</strong> {daysToCashBack}d (
              {getCapitalVelocityLabel(daysToCashBack)})
            </p>
            {ehrWarning ? (
              <p className="warning-text">EHR warning: low return for operator time.</p>
            ) : null}
          </article>

          <article>
            <h4>Bid Cap Guidance</h4>
            <p>
              <strong>Suggested max bid (directional):</strong> ${bidCapGuidance.toFixed(2)}
            </p>
            <p className="muted">
              Uses current market estimate minus transport/recon expectations. Do not bid above this
              without a documented reason.
            </p>
          </article>
        </div>

        <div className="decision-section">
          <h4>Risk Summary</h4>
          <ul>
            {warningList.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
            {reconditioningSummary.total_recon_cost > 0 ? (
              <li>Recon loaded: ${reconditioningSummary.total_recon_cost.toFixed(2)}</li>
            ) : (
              <li>Recon not started.</li>
            )}
          </ul>
        </div>

        <p className="prebid-verse">
          Be strong and courageous. Do not be afraid or discouraged, for the Lord your God will be
          with you wherever you go. — Joshua 1:9
        </p>

        <div className="entry-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Back
          </button>
          <button type="button" className="primary-button" onClick={onAcknowledgeAndApprove}>
            Acknowledge Risks + Approve
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreBidSanityModal;
