import { useEffect, useMemo, useState } from "react";
import type { TitleStatus } from "../types";
import type {
  GovDealsOpportunity,
  ManualOpportunityInput,
  OpportunityCategory,
  OpportunityFilters,
  OpportunityPreviewSnapshot,
  OpportunitySortMode,
  WonDealIntakeInput,
} from "../utils/govDealsScanner";
import {
  OPPORTUNITY_SORT_OPTIONS,
  DEFAULT_SCANNER_FILTERS,
  rankAndFilterOpportunities,
} from "../utils/govDealsScanner";

interface GovDealsScannerPanelProps {
  opportunities: GovDealsOpportunity[];
  operatorBaseState: string;
  filters: OpportunityFilters;
  sortMode: OpportunitySortMode;
  previewsByOpportunityId: Record<string, OpportunityPreviewSnapshot | undefined>;
  busyOpportunityId: string | null;
  statusMessage: string | null;
  errorMessage: string | null;
  onOperatorBaseStateChange: (value: string) => void;
  onFiltersChange: (next: OpportunityFilters) => void;
  onSortModeChange: (next: OpportunitySortMode) => void;
  onImportUrl: (listingUrl: string, keywordHint: string) => void;
  onKeywordSearch: (keyword: string) => void;
  onManualImport: (input: ManualOpportunityInput) => void;
  onPreview: (opportunity: GovDealsOpportunity) => Promise<void>;
  onWatch: (opportunityId: string) => void;
  onCreateDeal: (opportunity: GovDealsOpportunity) => Promise<void>;
  onPass: (opportunityId: string) => void;
  onSetInterest: (
    opportunityId: string,
    interest: "interested" | "not_interested" | "undecided"
  ) => void;
  onCreateFromWonDeal: (
    opportunity: GovDealsOpportunity,
    intake: WonDealIntakeInput
  ) => Promise<void>;
}

const formatCurrency = (value: number | null): string =>
  value === null ? "N/A" : `$${value.toFixed(2)}`;

const formatHours = (value: number | null): string =>
  value === null ? "N/A" : `${Math.max(0, value).toFixed(1)}h`;

const toNumberOrNull = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const toDateTimeLocalInput = (value: string | null | undefined): string => {
  if (!value) {
    return "";
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  return new Date(timestamp).toISOString().slice(0, 16);
};

const toIsoOrNull = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
};

const createDefaultManualInput = (): ManualOpportunityInput => ({
  listing_url: "",
  title: "",
  category: "vehicle",
  current_bid: 0,
  auction_end: "",
  location: "",
  seller_agency: "",
  seller_type: "government",
  buyer_premium_pct: 0.1,
  removal_window_days: 3,
  title_status: "unknown",
  relisted: false,
  condition_raw: "",
  estimated_resale_value: 0,
  estimated_repair_cost: 0,
  quantity_purchased: null,
  quantity_broken: null,
});

const createWonIntakeFromOpportunity = (opportunity: GovDealsOpportunity): WonDealIntakeInput => ({
  label: opportunity.title,
  acquisition_state: "",
  final_bid: opportunity.current_bid,
  buyer_premium_pct: opportunity.buyer_premium_pct,
  transport_cost_actual: null,
  transport_cost_estimated: null,
  repair_cost: opportunity.estimated_repair_cost,
  prep_cost: null,
  estimated_market_value: opportunity.estimated_resale_value,
  title_status: opportunity.title_status,
  removal_deadline: null,
  condition_notes: opportunity.condition_raw,
  quantity_purchased: opportunity.quantity_purchased,
  quantity_broken: opportunity.quantity_broken,
});

function GovDealsScannerPanel({
  opportunities,
  operatorBaseState,
  filters,
  sortMode,
  previewsByOpportunityId,
  busyOpportunityId,
  statusMessage,
  errorMessage,
  onOperatorBaseStateChange,
  onFiltersChange,
  onSortModeChange,
  onImportUrl,
  onKeywordSearch,
  onManualImport,
  onPreview,
  onWatch,
  onCreateDeal,
  onPass,
  onSetInterest,
  onCreateFromWonDeal,
}: GovDealsScannerPanelProps) {
  const [urlInput, setUrlInput] = useState("");
  const [urlKeywordHint, setUrlKeywordHint] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
  const [manualInput, setManualInput] = useState<ManualOpportunityInput>(createDefaultManualInput());
  const [expandedOpportunityId, setExpandedOpportunityId] = useState<string | null>(null);
  const [wonDealIntakeMap, setWonDealIntakeMap] = useState<Record<string, WonDealIntakeInput>>({});

  const ranked = useMemo(
    () =>
      rankAndFilterOpportunities(
        opportunities,
        operatorBaseState,
        filters,
        sortMode,
        previewsByOpportunityId
      ),
    [opportunities, operatorBaseState, filters, sortMode, previewsByOpportunityId]
  );
  const interestedCount = useMemo(
    () => opportunities.filter((item) => item.interest === "interested").length,
    [opportunities]
  );
  const notInterestedCount = useMemo(
    () => opportunities.filter((item) => item.interest === "not_interested").length,
    [opportunities]
  );

  const updateManualField = <K extends keyof ManualOpportunityInput>(
    field: K,
    value: ManualOpportunityInput[K]
  ) => {
    setManualInput((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleManualImport = () => {
    onManualImport(manualInput);
    setManualInput(createDefaultManualInput());
  };

  useEffect(() => {
    setWonDealIntakeMap((prev) => {
      const next = { ...prev };
      ranked.forEach(({ opportunity }) => {
        if (!next[opportunity.id]) {
          next[opportunity.id] = createWonIntakeFromOpportunity(opportunity);
        }
      });
      return next;
    });
  }, [ranked]);

  const updateWonIntakeField = <K extends keyof WonDealIntakeInput>(
    opportunityId: string,
    opportunity: GovDealsOpportunity,
    field: K,
    value: WonDealIntakeInput[K]
  ) => {
    setWonDealIntakeMap((prev) => ({
      ...prev,
      [opportunityId]: {
        ...(prev[opportunityId] ?? createWonIntakeFromOpportunity(opportunity)),
        [field]: value,
      },
    }));
  };

  return (
    <section className="panel scanner-panel">
      <h2 className="page-title">GovDeals Opportunity Scanner</h2>
      <p className="section-subtitle">
        Search/import opportunities, rank by upside-risk-distance, then preview/create with the existing
        backend deal engine.
      </p>

      <div className="scanner-layout">
        <article className="scanner-card">
          <h3>Search / Intake</h3>
          <div className="form-grid-two">
            <label>
              Operator Base State
              <input
                value={operatorBaseState}
                maxLength={2}
                onChange={(event) => onOperatorBaseStateChange(event.target.value.toUpperCase())}
              />
            </label>
          </div>

          <div className="scanner-subsection">
            <h4>Paste GovDeals URL</h4>
            <div className="form-grid-two">
              <label className="span-two">
                Listing URL
                <input
                  value={urlInput}
                  placeholder="https://www.govdeals.com/..."
                  onChange={(event) => setUrlInput(event.target.value)}
                />
              </label>
              <label>
                Keyword Hint (optional)
                <input
                  value={urlKeywordHint}
                  placeholder="Tahoe, iPad lot, etc."
                  onChange={(event) => setUrlKeywordHint(event.target.value)}
                />
              </label>
            </div>
            <div className="entry-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!urlInput.trim()}
                onClick={() => {
                  onImportUrl(urlInput, urlKeywordHint);
                  setUrlInput("");
                  setUrlKeywordHint("");
                }}
              >
                Import URL
              </button>
            </div>
          </div>

          <div className="scanner-subsection">
            <h4>Keyword Search</h4>
            <div className="form-grid-two">
              <label>
                Keyword
                <input
                  value={keywordInput}
                  placeholder="police tahoe, iPad lot, ranger, etc."
                  onChange={(event) => setKeywordInput(event.target.value)}
                />
              </label>
            </div>
            <div className="entry-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={!keywordInput.trim()}
                onClick={() => onKeywordSearch(keywordInput)}
              >
                Search
              </button>
            </div>
          </div>

          <div className="scanner-subsection">
            <h4>Manual Listing Import</h4>
            <div className="form-grid-two">
              <label>
                Title
                <input
                  value={manualInput.title}
                  onChange={(event) => updateManualField("title", event.target.value)}
                />
              </label>
              <label>
                Listing URL
                <input
                  value={manualInput.listing_url}
                  onChange={(event) => updateManualField("listing_url", event.target.value)}
                />
              </label>
              <label>
                Category
                <select
                  value={manualInput.category}
                  onChange={(event) =>
                    updateManualField("category", event.target.value as OpportunityCategory)
                  }
                >
                  <option value="vehicle">vehicle</option>
                  <option value="electronics">electronics</option>
                  <option value="other">other</option>
                </select>
              </label>
              <label>
                Current Bid
                <input
                  type="number"
                  step="0.01"
                  value={manualInput.current_bid}
                  onChange={(event) =>
                    updateManualField("current_bid", Math.max(0, Number(event.target.value) || 0))
                  }
                />
              </label>
              <label>
                Auction End
                <input
                  type="datetime-local"
                  value={manualInput.auction_end}
                  onChange={(event) => updateManualField("auction_end", event.target.value)}
                />
              </label>
              <label>
                Location
                <input
                  value={manualInput.location}
                  placeholder="City, ST"
                  onChange={(event) => updateManualField("location", event.target.value)}
                />
              </label>
              <label>
                Seller / Agency
                <input
                  value={manualInput.seller_agency}
                  onChange={(event) => updateManualField("seller_agency", event.target.value)}
                />
              </label>
              <label>
                Seller Type
                <select
                  value={manualInput.seller_type}
                  onChange={(event) =>
                    updateManualField("seller_type", event.target.value as ManualOpportunityInput["seller_type"])
                  }
                >
                  <option value="government">government</option>
                  <option value="commercial">commercial</option>
                  <option value="unknown">unknown</option>
                </select>
              </label>
              <label>
                Buyer Premium (decimal)
                <input
                  type="number"
                  step="0.001"
                  value={manualInput.buyer_premium_pct}
                  onChange={(event) =>
                    updateManualField("buyer_premium_pct", Math.max(0, Number(event.target.value) || 0))
                  }
                />
              </label>
              <label>
                Removal Window (days)
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={manualInput.removal_window_days}
                  onChange={(event) =>
                    updateManualField(
                      "removal_window_days",
                      Math.max(1, Math.floor(Number(event.target.value) || 1))
                    )
                  }
                />
              </label>
              <label>
                Title Status
                <select
                  value={manualInput.title_status}
                  onChange={(event) =>
                    updateManualField("title_status", event.target.value as TitleStatus)
                  }
                >
                  <option value="on_site">on_site</option>
                  <option value="delayed">delayed</option>
                  <option value="unknown">unknown</option>
                </select>
              </label>
              <label>
                Relisted
                <select
                  value={manualInput.relisted ? "yes" : "no"}
                  onChange={(event) => updateManualField("relisted", event.target.value === "yes")}
                >
                  <option value="no">no</option>
                  <option value="yes">yes</option>
                </select>
              </label>
              <label>
                Estimated Resale Value
                <input
                  type="number"
                  step="0.01"
                  value={manualInput.estimated_resale_value}
                  onChange={(event) =>
                    updateManualField("estimated_resale_value", Math.max(0, Number(event.target.value) || 0))
                  }
                />
              </label>
              <label>
                Estimated Repair Cost
                <input
                  type="number"
                  step="0.01"
                  value={manualInput.estimated_repair_cost}
                  onChange={(event) =>
                    updateManualField("estimated_repair_cost", Math.max(0, Number(event.target.value) || 0))
                  }
                />
              </label>
              <label className="span-two">
                Condition (raw text)
                <textarea
                  rows={2}
                  value={manualInput.condition_raw}
                  onChange={(event) => updateManualField("condition_raw", event.target.value)}
                />
              </label>
              {manualInput.category === "electronics" ? (
                <>
                  <label>
                    Quantity Purchased
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={manualInput.quantity_purchased ?? ""}
                      onChange={(event) =>
                        updateManualField("quantity_purchased", toNumberOrNull(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    Quantity Broken
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={manualInput.quantity_broken ?? ""}
                      onChange={(event) =>
                        updateManualField("quantity_broken", toNumberOrNull(event.target.value))
                      }
                    />
                  </label>
                </>
              ) : null}
            </div>
            <div className="entry-actions">
              <button type="button" className="secondary-button" onClick={handleManualImport}>
                Import Manual Listing
              </button>
            </div>
          </div>

          <div className="scanner-subsection">
            <h4>Future-ready Live Search Structure</h4>
            <p className="muted">
              Adapter shell is in place for live multi-listing search provider integration. Current phase
              uses URL import + keyword seed results + manual import.
            </p>
          </div>
        </article>

        <article className="scanner-card">
          <h3>Ranking + Filters</h3>
          <div className="form-grid-two">
            <label>
              Sort By
              <select
                value={sortMode}
                onChange={(event) => onSortModeChange(event.target.value as OpportunitySortMode)}
              >
                {OPPORTUNITY_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={filters.category}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    category: event.target.value as OpportunityFilters["category"],
                  })
                }
              >
                <option value="all">all</option>
                <option value="vehicle">vehicle</option>
                <option value="electronics">electronics</option>
                <option value="other">other</option>
              </select>
            </label>
            <label>
              Distance Radius (miles)
              <input
                type="number"
                step="1"
                min="0"
                value={filters.distance_radius_miles ?? ""}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    distance_radius_miles: toNumberOrNull(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Minimum ROI %
              <input
                type="number"
                step="0.1"
                value={filters.minimum_roi_pct ?? ""}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    minimum_roi_pct: toNumberOrNull(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Max Current Bid
              <input
                type="number"
                step="0.01"
                value={filters.max_current_bid ?? ""}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    max_current_bid: toNumberOrNull(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Seller Type
              <select
                value={filters.seller_type}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    seller_type: event.target.value as OpportunityFilters["seller_type"],
                  })
                }
              >
                <option value="all">all</option>
                <option value="government">government</option>
                <option value="commercial">commercial</option>
                <option value="unknown">unknown</option>
              </select>
            </label>
            <label>
              Title Status
              <select
                value={filters.title_status}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    title_status: event.target.value as OpportunityFilters["title_status"],
                  })
                }
              >
                <option value="all">all</option>
                <option value="on_site">on_site</option>
                <option value="delayed">delayed</option>
                <option value="unknown">unknown</option>
              </select>
            </label>
            <label>
              Relisted
              <select
                value={filters.relisted}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    relisted: event.target.value as OpportunityFilters["relisted"],
                  })
                }
              >
                <option value="all">all</option>
                <option value="relisted">relisted</option>
                <option value="not_relisted">not_relisted</option>
              </select>
            </label>
            <label>
              Include Passed
              <select
                value={filters.include_passed ? "yes" : "no"}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    include_passed: event.target.value === "yes",
                  })
                }
              >
                <option value="no">no</option>
                <option value="yes">yes</option>
              </select>
            </label>
          </div>
          <div className="entry-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() => onFiltersChange(DEFAULT_SCANNER_FILTERS)}
            >
              Reset Filters
            </button>
          </div>
          {statusMessage ? <p className="decision-confirmation">{statusMessage}</p> : null}
          {errorMessage ? <p className="warning-text">{errorMessage}</p> : null}
        </article>
      </div>

      <div className="scanner-results-header">
        <h3>Opportunities ({ranked.length})</h3>
        <div className="interest-summary">
          <span className="risk-chip">Interested: {interestedCount}</span>
          <span className="risk-chip warning">Not Interested: {notInterestedCount}</span>
        </div>
      </div>

      <div className="manual-surf-card">
        <h4>Manual Surf (Live GovDeals)</h4>
        <p className="muted">
          Open GovDeals live, watch real closing timers, and import/paste listings you want to evaluate.
          Use Interested / Not Interested to train your scanner signal patterns.
        </p>
        <div className="entry-actions">
          <a
            className="secondary-button scanner-live-link"
            href="https://www.govdeals.com"
            target="_blank"
            rel="noreferrer"
          >
            Open GovDeals Live
          </a>
        </div>
      </div>

      {ranked.length === 0 ? (
        <p>No opportunities match current filters.</p>
      ) : (
        <div className="opportunity-grid">
          {ranked.map(({ opportunity, metrics }) => {
            const preview = previewsByOpportunityId[opportunity.id];
            const isBusy = busyOpportunityId === opportunity.id;
            const statusClass =
              opportunity.status === "watch"
                ? "watch"
                : opportunity.status === "passed"
                  ? "passed"
                  : "new";
            const wonIntake = wonDealIntakeMap[opportunity.id] ?? createWonIntakeFromOpportunity(opportunity);
            const isExpanded = expandedOpportunityId === opportunity.id;
            const interestClass =
              opportunity.interest === "interested"
                ? "interested"
                : opportunity.interest === "not_interested"
                  ? "not-interested"
                  : "undecided";
            return (
              <article className="opportunity-card" key={opportunity.id}>
                <div className="opportunity-head">
                  <h4>{opportunity.title}</h4>
                  <div className="opportunity-head-badges">
                    <span className={`status-badge opportunity-status ${statusClass}`}>
                      {opportunity.status}
                    </span>
                    <span className={`status-badge interest-badge ${interestClass}`}>
                      {opportunity.interest}
                    </span>
                  </div>
                </div>
                <p className="muted">
                  {opportunity.seller_agency} · {opportunity.location}
                </p>
                <div className="entry-actions">
                  {opportunity.listing_url.trim() ? (
                    <a
                      href={opportunity.listing_url}
                      target="_blank"
                      rel="noreferrer"
                      className="secondary-button scanner-live-link"
                    >
                      Open Actual Listing
                    </a>
                  ) : (
                    <span className="muted">No listing URL yet (import/paste URL to enable).</span>
                  )}
                </div>
                <div className="opportunity-grid-fields">
                  <div>
                    <span>Current Bid</span>
                    <strong>{formatCurrency(opportunity.current_bid)}</strong>
                  </div>
                  <div>
                    <span>Auction End</span>
                    <strong>{new Date(opportunity.auction_end).toLocaleString()}</strong>
                  </div>
                  <div>
                    <span>Time Left</span>
                    <strong>{formatHours(metrics.time_left_hours)}</strong>
                  </div>
                  <div>
                    <span>Buyer Premium</span>
                    <strong>{(opportunity.buyer_premium_pct * 100).toFixed(1)}%</strong>
                  </div>
                  <div>
                    <span>Removal Window</span>
                    <strong>{opportunity.removal_window_days} days</strong>
                  </div>
                  <div>
                    <span>Estimated Distance</span>
                    <strong>
                      {metrics.estimated_distance_miles === null
                        ? "N/A"
                        : `${metrics.estimated_distance_miles} mi`}
                    </strong>
                  </div>
                  <div>
                    <span>Estimated Transport</span>
                    <strong>{formatCurrency(metrics.estimated_transport_cost)}</strong>
                  </div>
                  <div>
                    <span>Estimated Resale</span>
                    <strong>{formatCurrency(opportunity.estimated_resale_value)}</strong>
                  </div>
                  <div>
                    <span>Projected Upside</span>
                    <strong>{formatCurrency(metrics.projected_upside)}</strong>
                  </div>
                  <div>
                    <span>Projected ROI</span>
                    <strong>{metrics.projected_roi_pct.toFixed(1)}%</strong>
                  </div>
                  <div>
                    <span>Confidence</span>
                    <strong>{metrics.confidence}</strong>
                  </div>
                  <div>
                    <span>Title Status</span>
                    <strong>{opportunity.title_status}</strong>
                  </div>
                </div>
                <p className="muted">
                  Seller: {opportunity.seller_type} · Relisted: {opportunity.relisted ? "yes" : "no"} ·
                  Source: {opportunity.source}
                </p>
                {metrics.risk_flags.length > 0 ? (
                  <div className="pipeline-risk-flags">
                    {metrics.risk_flags.map((flag) => (
                      <span key={`${opportunity.id}-${flag}`} className="risk-chip warning">
                        {flag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Risk Flags: none</p>
                )}
                {preview ? (
                  <div className="preview-box">
                    <p>
                      <strong>Preview Snapshot:</strong> Profit {formatCurrency(preview.projected_profit)} ·
                      ROI {preview.projected_roi_pct.toFixed(1)}% · Confidence {preview.data_confidence}
                    </p>
                  </div>
                ) : null}
                <div className="interest-controls">
                  <button
                    type="button"
                    className={opportunity.interest === "interested" ? "active" : ""}
                    disabled={isBusy}
                    onClick={() => onSetInterest(opportunity.id, "interested")}
                  >
                    Interested
                  </button>
                  <button
                    type="button"
                    className={opportunity.interest === "not_interested" ? "active" : ""}
                    disabled={isBusy}
                    onClick={() => onSetInterest(opportunity.id, "not_interested")}
                  >
                    Not Interested
                  </button>
                  <button
                    type="button"
                    className={opportunity.interest === "undecided" ? "active" : ""}
                    disabled={isBusy}
                    onClick={() => onSetInterest(opportunity.id, "undecided")}
                  >
                    Clear
                  </button>
                </div>
                <div className="entry-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={isBusy}
                    onClick={() => void onPreview(opportunity)}
                  >
                    {isBusy ? "Working..." : "Preview"}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={isBusy}
                    onClick={() => onWatch(opportunity.id)}
                  >
                    Add to Watch
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={isBusy}
                    onClick={() => void onCreateDeal(opportunity)}
                  >
                    Create Deal
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={isBusy}
                    onClick={() => onPass(opportunity.id)}
                  >
                    Pass
                  </button>
                </div>
                <div className="won-intake-panel">
                  <div className="entry-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setExpandedOpportunityId(isExpanded ? null : opportunity.id)}
                    >
                      {isExpanded ? "Hide Won Deal Intake" : "I Won This — Add Final Numbers"}
                    </button>
                  </div>
                  {isExpanded ? (
                    <div className="form-grid-two">
                      <label>
                        Deal Label
                        <input
                          value={wonIntake.label}
                          onChange={(event) =>
                            updateWonIntakeField(opportunity.id, opportunity, "label", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Acquisition State
                        <input
                          value={wonIntake.acquisition_state}
                          maxLength={2}
                          onChange={(event) =>
                            updateWonIntakeField(
                              opportunity.id,
                              opportunity,
                              "acquisition_state",
                              event.target.value.toUpperCase()
                            )
                          }
                        />
                      </label>
                      <label>
                        Final Bid (won)
                        <input
                          type="number"
                          step="0.01"
                          value={wonIntake.final_bid}
                          onChange={(event) =>
                            updateWonIntakeField(
                              opportunity.id,
                              opportunity,
                              "final_bid",
                              Math.max(0, Number(event.target.value) || 0)
                            )
                          }
                        />
                      </label>
                      <label>
                        Buyer Premium (decimal)
                        <input
                          type="number"
                          step="0.001"
                          value={wonIntake.buyer_premium_pct}
                          onChange={(event) =>
                            updateWonIntakeField(
                              opportunity.id,
                              opportunity,
                              "buyer_premium_pct",
                              Math.max(0, Number(event.target.value) || 0)
                            )
                          }
                        />
                      </label>
                      <label>
                        Transport Cost (Actual)
                        <input
                          type="number"
                          step="0.01"
                          value={wonIntake.transport_cost_actual ?? ""}
                          onChange={(event) =>
                            updateWonIntakeField(
                              opportunity.id,
                              opportunity,
                              "transport_cost_actual",
                              toNumberOrNull(event.target.value)
                            )
                          }
                        />
                      </label>
                      <label>
                        Transport Cost (Estimated)
                        <input
                          type="number"
                          step="0.01"
                          value={wonIntake.transport_cost_estimated ?? ""}
                          onChange={(event) =>
                            updateWonIntakeField(
                              opportunity.id,
                              opportunity,
                              "transport_cost_estimated",
                              toNumberOrNull(event.target.value)
                            )
                          }
                        />
                      </label>
                      <label>
                        Repair Cost
                        <input
                          type="number"
                          step="0.01"
                          value={wonIntake.repair_cost ?? ""}
                          onChange={(event) =>
                            updateWonIntakeField(
                              opportunity.id,
                              opportunity,
                              "repair_cost",
                              toNumberOrNull(event.target.value)
                            )
                          }
                        />
                      </label>
                      <label>
                        Prep Cost
                        <input
                          type="number"
                          step="0.01"
                          value={wonIntake.prep_cost ?? ""}
                          onChange={(event) =>
                            updateWonIntakeField(
                              opportunity.id,
                              opportunity,
                              "prep_cost",
                              toNumberOrNull(event.target.value)
                            )
                          }
                        />
                      </label>
                      <label>
                        Estimated Market Value
                        <input
                          type="number"
                          step="0.01"
                          value={wonIntake.estimated_market_value}
                          onChange={(event) =>
                            updateWonIntakeField(
                              opportunity.id,
                              opportunity,
                              "estimated_market_value",
                              Math.max(0, Number(event.target.value) || 0)
                            )
                          }
                        />
                      </label>
                      <label>
                        Title Status
                        <select
                          value={wonIntake.title_status}
                          onChange={(event) =>
                            updateWonIntakeField(
                              opportunity.id,
                              opportunity,
                              "title_status",
                              event.target.value as TitleStatus
                            )
                          }
                        >
                          <option value="on_site">on_site</option>
                          <option value="delayed">delayed</option>
                          <option value="unknown">unknown</option>
                        </select>
                      </label>
                      <label>
                        Removal Deadline
                        <input
                          type="datetime-local"
                          value={toDateTimeLocalInput(wonIntake.removal_deadline)}
                          onChange={(event) =>
                            updateWonIntakeField(
                              opportunity.id,
                              opportunity,
                              "removal_deadline",
                              toIsoOrNull(event.target.value)
                            )
                          }
                        />
                      </label>
                      {opportunity.category === "electronics" ? (
                        <>
                          <label>
                            Quantity Purchased
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={wonIntake.quantity_purchased ?? ""}
                              onChange={(event) =>
                                updateWonIntakeField(
                                  opportunity.id,
                                  opportunity,
                                  "quantity_purchased",
                                  toNumberOrNull(event.target.value)
                                )
                              }
                            />
                          </label>
                          <label>
                            Quantity Broken
                            <input
                              type="number"
                              step="1"
                              min="0"
                              value={wonIntake.quantity_broken ?? ""}
                              onChange={(event) =>
                                updateWonIntakeField(
                                  opportunity.id,
                                  opportunity,
                                  "quantity_broken",
                                  toNumberOrNull(event.target.value)
                                )
                              }
                            />
                          </label>
                        </>
                      ) : null}
                      <label className="span-two">
                        Condition Notes
                        <textarea
                          rows={3}
                          value={wonIntake.condition_notes}
                          onChange={(event) =>
                            updateWonIntakeField(
                              opportunity.id,
                              opportunity,
                              "condition_notes",
                              event.target.value
                            )
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                  {isExpanded ? (
                    <div className="entry-actions">
                      <button
                        type="button"
                        className="primary-button"
                        disabled={isBusy}
                        onClick={() => void onCreateFromWonDeal(opportunity, wonIntake)}
                      >
                        {isBusy ? "Working..." : "Create Won Deal + Auto Calculate"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default GovDealsScannerPanel;
