import { useMemo, useState } from "react";
import type { CompSourceType, ManualCompEntry, VehicleMarketIntel } from "../types";
import {
  computeBlendedMarketValue,
  computeCompConfidence,
  computeManualCompAverage,
  detectOutlierIds,
} from "../utils/marketIntel";

interface VehicleMarketPanelProps {
  intel: VehicleMarketIntel;
  marketLinks: {
    ebaySold: string;
    ebayActive: string;
    facebookSearch: string;
    craigslistSearch: string;
  };
  onIntelChange: (next: VehicleMarketIntel) => void;
}

interface DraftCompForm {
  price: string;
  source: CompSourceType;
  date: string;
  notes: string;
}

const SOURCE_LABELS: Record<CompSourceType, string> = {
  facebook: "Facebook",
  craigslist: "Craigslist",
  dealer: "Dealer",
  auction: "Auction",
  other: "Other",
};

const clampCurrency = (value: string): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100) / 100;
};

const formatCurrency = (value: number | null): string => {
  if (value === null) {
    return "N/A";
  }
  return `$${value.toFixed(2)}`;
};

const toInputDate = (value: string): string => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  return new Date(timestamp).toISOString().slice(0, 10);
};

const VehicleMarketPanel = ({ intel, marketLinks, onIntelChange }: VehicleMarketPanelProps) => {
  const [compForm, setCompForm] = useState<DraftCompForm>({
    price: "",
    source: "dealer",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const outlierIds = useMemo(() => detectOutlierIds(intel.manual_comps), [intel.manual_comps]);
  const compConfidence = useMemo(() => computeCompConfidence(intel.manual_comps), [intel.manual_comps]);
  const manualCompAverage = useMemo(() => computeManualCompAverage(intel.manual_comps), [intel.manual_comps]);
  const blendedMarketValue = useMemo(() => computeBlendedMarketValue(intel), [intel]);

  const addComp = (): void => {
    const price = clampCurrency(compForm.price);
    if (price === null) {
      return;
    }
    const dateIso = compForm.date ? `${compForm.date}T00:00:00.000Z` : new Date().toISOString();
    const nextComp: ManualCompEntry = {
      id: crypto.randomUUID(),
      price,
      source: compForm.source,
      notes: compForm.notes.trim(),
      date: dateIso,
    };
    onIntelChange({
      ...intel,
      manual_comps: [nextComp, ...intel.manual_comps],
    });
    setCompForm((prev) => ({
      ...prev,
      price: "",
      notes: "",
    }));
  };

  const removeComp = (compId: string): void => {
    onIntelChange({
      ...intel,
      manual_comps: intel.manual_comps.filter((comp) => comp.id !== compId),
    });
  };

  return (
    <section className="decision-section market-intel-panel">
      <h4>Vehicle Market Intelligence</h4>
      <p className="section-subtitle">
        API-ready valuation fields + manual comps only. No restricted scraping.
      </p>

      <div className="detail-panel-grid">
        <label>
          KBB Value
          <input
            type="number"
            step="0.01"
            value={intel.kbb_value ?? ""}
            onChange={(event) =>
              onIntelChange({
                ...intel,
                kbb_value: clampCurrency(event.target.value),
              })
            }
          />
        </label>
        <label>
          J.D. Power / NADA Value
          <input
            type="number"
            step="0.01"
            value={intel.nada_value ?? ""}
            onChange={(event) =>
              onIntelChange({
                ...intel,
                nada_value: clampCurrency(event.target.value),
              })
            }
          />
        </label>
        <label className="span-two">
          CARFAX Status / Reference
          <input
            value={intel.carfax_status ?? ""}
            onChange={(event) =>
              onIntelChange({
                ...intel,
                carfax_status: event.target.value.trim() || null,
              })
            }
            placeholder="e.g. clean title, accident reported, unknown"
          />
        </label>
      </div>

      <div className="market-links-row">
        <a href={marketLinks.ebaySold} target="_blank" rel="noreferrer">
          eBay sold (30d)
        </a>
        <a href={marketLinks.ebayActive} target="_blank" rel="noreferrer">
          eBay active
        </a>
        <a href={marketLinks.facebookSearch} target="_blank" rel="noreferrer">
          Facebook search
        </a>
        <a href={marketLinks.craigslistSearch} target="_blank" rel="noreferrer">
          Craigslist search
        </a>
      </div>

      <div className="manual-comp-editor">
        <h5>Manual Comps</h5>
        <div className="detail-panel-grid">
          <label>
            Price
            <input
              type="number"
              step="0.01"
              value={compForm.price}
              onChange={(event) => setCompForm((prev) => ({ ...prev, price: event.target.value }))}
            />
          </label>
          <label>
            Source
            <select
              value={compForm.source}
              onChange={(event) =>
                setCompForm((prev) => ({ ...prev, source: event.target.value as CompSourceType }))
              }
            >
              <option value="facebook">Facebook</option>
              <option value="craigslist">Craigslist</option>
              <option value="dealer">Dealer</option>
              <option value="auction">Auction</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Date
            <input
              type="date"
              value={compForm.date}
              onChange={(event) => setCompForm((prev) => ({ ...prev, date: event.target.value }))}
            />
          </label>
          <label>
            Notes
            <input
              value={compForm.notes}
              onChange={(event) => setCompForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>
        </div>
        <div className="entry-actions">
          <button type="button" className="secondary-button" onClick={addComp}>
            Add Comp
          </button>
        </div>
      </div>

      <div className="manual-comp-list">
        {intel.manual_comps.length === 0 ? (
          <p>No manual comps added yet.</p>
        ) : (
          <ul>
            {intel.manual_comps.map((comp) => (
              <li key={comp.id}>
                <strong>{formatCurrency(comp.price)}</strong> · {SOURCE_LABELS[comp.source]} ·{" "}
                {toInputDate(comp.date)} {comp.notes ? `· ${comp.notes}` : ""}
                {outlierIds.has(comp.id) ? <span className="risk-chip warning">Outlier</span> : null}
                <button type="button" className="link-button" onClick={() => removeComp(comp.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="valuation-summary-grid">
        <div>
          <span>Blended Market Value</span>
          <strong>{formatCurrency(blendedMarketValue)}</strong>
        </div>
        <div>
          <span>Comp Confidence</span>
          <strong className={`comp-confidence-badge ${compConfidence.toLowerCase()}`}>
            {compConfidence}
          </strong>
        </div>
        <div>
          <span>Manual Comp Average</span>
          <strong>{formatCurrency(manualCompAverage)}</strong>
        </div>
      </div>
    </section>
  );
};

export default VehicleMarketPanel;
