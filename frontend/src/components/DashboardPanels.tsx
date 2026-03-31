import type { DealView, ReconditioningRecord } from "../types";
import {
  buildMarketLinks,
  calculateRoiPct,
  computeBlendedMarketValue,
  computeCompConfidence,
  computeEffectiveHourlyRate,
  computeRiskFlags,
  inferVehicleMarketIntel,
} from "../utils/marketIntel";
import {
  computeReconditioningSummary,
  computeTimeDiscipline,
  inferReconditioningForDeal,
} from "../utils/reconditioning";

interface CapitalPanelData {
  liquid_cash: number;
  locked_capital: number;
  available_capital: number;
  pct_locked: number;
}

interface DecisionQueueItem {
  id: string;
  label: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

interface BurnEnhancementItem {
  id: string;
  label: string;
  days_live: number;
  projected_profit: number;
  price_vs_market_delta: number;
  suggested_price_drop: number;
}

interface RoiVelocitySummary {
  avg_roi_pct: number;
  avg_days_to_cash_back: number;
  avg_effective_hourly_rate: number;
  fastest_payback: { id: string; label: string; days: number } | null;
  slowest_payback: { id: string; label: string; days: number } | null;
}

interface MonthlyVelocityPoint {
  month_key: string;
  month_label: string;
  avg_roi_pct: number;
  avg_days_to_cash_back: number;
}

interface DashboardPanelsProps {
  deals: DealView[];
  reconditioningMap: Record<string, ReconditioningRecord>;
}

const formatCurrency = (value: number): string => `$${value.toFixed(2)}`;

export function computeCapitalPanel(deals: DealView[], baselineCash = 100000): CapitalPanelData {
  const lockedCapital = deals
    .filter((item) => item.deal.status !== "completed")
    .reduce((sum, item) => sum + item.calculations.total_cost_basis, 0);
  const availableCapital = Math.max(0, baselineCash - lockedCapital);
  const pctLocked = baselineCash > 0 ? (lockedCapital / baselineCash) * 100 : 0;
  return {
    liquid_cash: baselineCash,
    locked_capital: lockedCapital,
    available_capital: availableCapital,
    pct_locked: pctLocked,
  };
}

export function computeDecisionQueue(deals: DealView[]): DecisionQueueItem[] {
  const now = Date.now();
  const queue: DecisionQueueItem[] = [];
  deals.forEach((deal) => {
    if (deal.deal.status === "completed") {
      return;
    }
    const endingSoon =
      deal.deal.discovered_date !== null
        ? Date.parse(deal.deal.discovered_date) - now < 12 * 60 * 60 * 1000
        : false;
    if (endingSoon) {
      queue.push({
        id: `${deal.deal.id}-ending-soon`,
        label: deal.deal.label,
        reason: "Auction ending in <12h",
        priority: "high",
      });
    }
    if (deal.ai_recommendation.confidence >= 70 && deal.operator_decision_history.length === 0) {
      queue.push({
        id: `${deal.deal.id}-high-confidence-no-action`,
        label: deal.deal.label,
        reason: "High-confidence recommendation not acted on",
        priority: "high",
      });
    }
    const missingCritical = [
      deal.metadata.condition_notes.trim().length === 0,
      deal.financials.estimated_market_value <= 0,
      deal.financials.acquisition_cost <= 0,
    ].some(Boolean);
    if (missingCritical) {
      queue.push({
        id: `${deal.deal.id}-missing-critical`,
        label: deal.deal.label,
        reason: "Missing critical data",
        priority: "medium",
      });
    }
  });
  return queue.slice(0, 12);
}

export function computeBurnEnhancements(deals: DealView[]): BurnEnhancementItem[] {
  return deals
    .filter((deal) => deal.deal.status !== "completed")
    .map((deal) => {
      const marketIntel = inferVehicleMarketIntel(deal);
      const blended = computeBlendedMarketValue(marketIntel, deal.financials.estimated_market_value);
      const projectedResale = blended ?? deal.financials.estimated_market_value;
      const priceVsMarketDelta = projectedResale - deal.financials.acquisition_cost;
      const suggestedPriceDrop =
        deal.calculations.projected_profit < 0
          ? Math.abs(deal.calculations.projected_profit) * 0.35
          : Math.max(0, projectedResale * 0.03);
      return {
        id: deal.deal.id,
        label: deal.deal.label,
        days_live: deal.calculations.days_in_current_stage,
        projected_profit: deal.calculations.projected_profit,
        price_vs_market_delta: priceVsMarketDelta,
        suggested_price_drop: suggestedPriceDrop,
      };
    })
    .sort((a, b) => b.days_live - a.days_live)
    .slice(0, 8);
}

export function computeRoiVelocitySummary(deals: DealView[]): RoiVelocitySummary {
  const completedDeals = deals.filter((item) => item.deal.status === "completed");
  if (completedDeals.length === 0) {
    return {
      avg_roi_pct: 0,
      avg_days_to_cash_back: 0,
      avg_effective_hourly_rate: 0,
      fastest_payback: null,
      slowest_payback: null,
    };
  }
  const roiValues = completedDeals.map((item) =>
    calculateRoiPct(item.calculations.realized_profit, item.calculations.total_cost_basis)
  );
  const daysToCashBack = completedDeals.map((item) => {
    const start = item.deal.purchase_date ?? item.deal.discovered_date ?? item.deal.stage_updated_at;
    const end = item.deal.completion_date ?? item.deal.sale_date ?? item.deal.stage_updated_at;
    const startTs = Date.parse(start);
    const endTs = Date.parse(end);
    const days =
      Number.isFinite(startTs) && Number.isFinite(endTs)
        ? Math.max(0, (endTs - startTs) / (24 * 60 * 60 * 1000))
        : 0;
    return {
      id: item.deal.id,
      label: item.deal.label,
      days,
    };
  });

  const avgRoi = roiValues.reduce((sum, value) => sum + value, 0) / roiValues.length;
  const avgDays = daysToCashBack.reduce((sum, item) => sum + item.days, 0) / daysToCashBack.length;
  const hourlyRates = completedDeals
    .map((item) => computeEffectiveHourlyRate(item))
    .filter((value): value is number => value !== null);
  const avgEhr =
    hourlyRates.length > 0
      ? hourlyRates.reduce((sum, value) => sum + value, 0) / hourlyRates.length
      : 0;
  const sortedByDays = [...daysToCashBack].sort((a, b) => a.days - b.days);

  return {
    avg_roi_pct: avgRoi,
    avg_days_to_cash_back: avgDays,
    avg_effective_hourly_rate: avgEhr,
    fastest_payback: sortedByDays[0] ?? null,
    slowest_payback: sortedByDays[sortedByDays.length - 1] ?? null,
  };
}

export function computeMonthlyVelocity(deals: DealView[]): MonthlyVelocityPoint[] {
  const monthFormatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  });
  const buckets = new Map<string, { month_label: string; roi_sum: number; days_sum: number; count: number }>();
  deals
    .filter((item) => item.deal.status === "completed")
    .forEach((item) => {
      const completedAt = item.deal.completion_date ?? item.deal.sale_date ?? item.deal.stage_updated_at;
      const ts = Date.parse(completedAt);
      if (!Number.isFinite(ts)) {
        return;
      }
      const date = new Date(ts);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
      const start = item.deal.purchase_date ?? item.deal.discovered_date ?? item.deal.stage_updated_at;
      const startTs = Date.parse(start);
      const days =
        Number.isFinite(startTs) && Number.isFinite(ts)
          ? Math.max(0, (ts - startTs) / (24 * 60 * 60 * 1000))
          : 0;
      const roi = calculateRoiPct(item.calculations.realized_profit, item.calculations.total_cost_basis);
      if (!buckets.has(key)) {
        buckets.set(key, {
          month_label: monthFormatter.format(monthStart),
          roi_sum: 0,
          days_sum: 0,
          count: 0,
        });
      }
      const bucket = buckets.get(key);
      if (!bucket) {
        return;
      }
      bucket.roi_sum += roi;
      bucket.days_sum += days;
      bucket.count += 1;
    });

  return Array.from(buckets.entries())
    .map(([monthKey, bucket]) => ({
      month_key: monthKey,
      month_label: bucket.month_label,
      avg_roi_pct: bucket.count > 0 ? bucket.roi_sum / bucket.count : 0,
      avg_days_to_cash_back: bucket.count > 0 ? bucket.days_sum / bucket.count : 0,
    }))
    .sort((a, b) => a.month_key.localeCompare(b.month_key))
    .slice(-8);
}

const priorityClass = (priority: DecisionQueueItem["priority"]): string => {
  if (priority === "high") {
    return "queue-item high";
  }
  if (priority === "medium") {
    return "queue-item medium";
  }
  return "queue-item low";
};

export default function DashboardPanels({ deals, reconditioningMap }: DashboardPanelsProps) {
  const capital = computeCapitalPanel(deals);
  const queue = computeDecisionQueue(deals);
  const burnEnhancements = computeBurnEnhancements(deals);
  const velocitySummary = computeRoiVelocitySummary(deals);
  const monthlyVelocity = computeMonthlyVelocity(deals);

  const manualReviewDeals = deals.filter((deal) => {
    const intel = inferVehicleMarketIntel(deal);
    const confidence = computeCompConfidence(intel.manual_comps);
    return confidence === "MANUAL_REVIEW_REQUIRED";
  });
  const lowConfidenceCompDeals = deals.filter((deal) => {
    const intel = inferVehicleMarketIntel(deal);
    const confidence = computeCompConfidence(intel.manual_comps);
    return confidence === "LOW";
  });
  const highestUpsideDeals = [...deals]
    .sort((a, b) => b.calculations.projected_profit - a.calculations.projected_profit)
    .slice(0, 5);
  const incompleteBlockingDeals = deals.filter((deal) => {
    const intel = inferVehicleMarketIntel(deal);
    return (
      deal.financials.estimated_market_value <= 0 ||
      deal.metadata.condition_notes.trim().length === 0 ||
      computeCompConfidence(intel.manual_comps) === "MANUAL_REVIEW_REQUIRED"
    );
  });
  const reconDelayDeals = deals.filter((deal) => {
    if (!deal.deal.category.startsWith("vehicle")) {
      return false;
    }
    const discipline = computeTimeDiscipline(deal, inferReconditioningForDeal(deal, reconditioningMap));
    return discipline.state === "recon_delay";
  });
  const salesDelayDeals = deals.filter((deal) => {
    if (!deal.deal.category.startsWith("vehicle")) {
      return false;
    }
    const discipline = computeTimeDiscipline(deal, inferReconditioningForDeal(deal, reconditioningMap));
    return discipline.state === "sales_delay";
  });
  const urgentVehicleDeals = deals.filter((deal) => {
    if (!deal.deal.category.startsWith("vehicle")) {
      return false;
    }
    const discipline = computeTimeDiscipline(deal, inferReconditioningForDeal(deal, reconditioningMap));
    return discipline.state === "urgent_attention";
  });
  const reconNotStartedDeals = deals.filter((deal) => {
    if (!deal.deal.category.startsWith("vehicle")) {
      return false;
    }
    const record = inferReconditioningForDeal(deal, reconditioningMap);
    return record.status === "not_started";
  });
  const highestReconCostDeals = deals
    .filter((deal) => deal.deal.category.startsWith("vehicle"))
    .map((deal) => {
      const summary = computeReconditioningSummary(
        deal,
        inferReconditioningForDeal(deal, reconditioningMap)
      );
      return {
        id: deal.deal.id,
        label: deal.deal.label,
        total_recon_cost: summary.total_recon_cost,
      };
    })
    .sort((a, b) => b.total_recon_cost - a.total_recon_cost)
    .slice(0, 5);

  return (
    <>
      <div className="capital-panel">
        <h3>Capital Panel</h3>
        <div className="capital-grid">
          <article>
            <span>Liquid Cash</span>
            <strong>{formatCurrency(capital.liquid_cash)}</strong>
          </article>
          <article>
            <span>Locked Capital</span>
            <strong>{formatCurrency(capital.locked_capital)}</strong>
          </article>
          <article>
            <span>Available Capital</span>
            <strong>{formatCurrency(capital.available_capital)}</strong>
          </article>
          <article>
            <span>% Capital Locked</span>
            <strong>{capital.pct_locked.toFixed(1)}%</strong>
          </article>
        </div>
      </div>

      <div className="decision-queue-card">
        <h3>Decision Queue</h3>
        {queue.length === 0 ? (
          <p>No urgent queued decisions.</p>
        ) : (
          <ul>
            {queue.map((item) => (
              <li key={item.id} className={priorityClass(item.priority)}>
                <strong>{item.label}</strong> — {item.reason}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="burn-enhanced-card">
        <h3>Burn List Enhancements</h3>
        {burnEnhancements.length === 0 ? (
          <p>No active burn candidates.</p>
        ) : (
          <ul>
            {burnEnhancements.map((item) => (
              <li key={item.id}>
                <strong>{item.label}</strong> · {item.days_live}d live · Delta{" "}
                {formatCurrency(item.price_vs_market_delta)} · Suggested drop{" "}
                {formatCurrency(item.suggested_price_drop)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="risk-flag-card">
        <h3>Risk Flags</h3>
        <ul>
          {deals.slice(0, 8).map((deal) => {
            const flags = computeRiskFlags(deal);
            return (
              <li key={`${deal.deal.id}-risk`}>
                <strong>{deal.deal.label}</strong>: {flags.length > 0 ? flags.join(", ") : "none"}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="velocity-kpi-grid">
        <article>
          <span>Average ROI %</span>
          <strong>{velocitySummary.avg_roi_pct.toFixed(1)}%</strong>
        </article>
        <article>
          <span>Average Days to Cash Back</span>
          <strong>{velocitySummary.avg_days_to_cash_back.toFixed(1)}d</strong>
        </article>
        <article>
          <span>Average EHR</span>
          <strong>{formatCurrency(velocitySummary.avg_effective_hourly_rate)}/hr</strong>
        </article>
        <article>
          <span>Fastest Payback Deal</span>
          <strong>
            {velocitySummary.fastest_payback
              ? `${velocitySummary.fastest_payback.label} (${velocitySummary.fastest_payback.days.toFixed(
                  1
                )}d)`
              : "N/A"}
          </strong>
        </article>
        <article>
          <span>Slowest Payback Deal</span>
          <strong>
            {velocitySummary.slowest_payback
              ? `${velocitySummary.slowest_payback.label} (${velocitySummary.slowest_payback.days.toFixed(
                  1
                )}d)`
              : "N/A"}
          </strong>
        </article>
      </div>

      <div className="velocity-graph-card">
        <h3>Monthly ROI % vs Days to Cash Back</h3>
        {monthlyVelocity.length === 0 ? (
          <p>No completed-deal velocity data yet.</p>
        ) : (
          <div className="velocity-bars">
            {monthlyVelocity.map((point) => {
              const roiHeight = Math.max(6, Math.round(Math.abs(point.avg_roi_pct) * 2));
              const dayHeight = Math.max(6, Math.round(point.avg_days_to_cash_back));
              return (
                <div className="velocity-month" key={point.month_key}>
                  <div className="velocity-bar-wrap">
                    <div
                      className={`velocity-bar roi ${point.avg_roi_pct < 0 ? "negative" : ""}`}
                      style={{ height: `${Math.min(120, roiHeight)}px` }}
                      title={`Avg ROI: ${point.avg_roi_pct.toFixed(1)}%`}
                    />
                    <div
                      className="velocity-bar days"
                      style={{ height: `${Math.min(120, dayHeight)}px` }}
                      title={`Avg Days to Cash Back: ${point.avg_days_to_cash_back.toFixed(1)}d`}
                    />
                  </div>
                  <span>{point.month_label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="dashboard-alert-sections">
        <article>
          <h4>Deals requiring manual market review</h4>
          {manualReviewDeals.length === 0 ? (
            <p>None.</p>
          ) : (
            <ul>
              {manualReviewDeals.map((deal) => (
                <li key={`${deal.deal.id}-manual-review`}>{deal.deal.label}</li>
              ))}
            </ul>
          )}
        </article>
        <article>
          <h4>Deals with LOW confidence comps</h4>
          {lowConfidenceCompDeals.length === 0 ? (
            <p>None.</p>
          ) : (
            <ul>
              {lowConfidenceCompDeals.map((deal) => (
                <li key={`${deal.deal.id}-low-comp`}>{deal.deal.label}</li>
              ))}
            </ul>
          )}
        </article>
        <article>
          <h4>Highest upside deals</h4>
          <ul>
            {highestUpsideDeals.map((deal) => {
              const links = buildMarketLinks(deal.deal.label);
              return (
                <li key={`${deal.deal.id}-upside`}>
                  {deal.deal.label} · {formatCurrency(deal.calculations.projected_profit)} ·{" "}
                  <a href={links.ebaySold} target="_blank" rel="noreferrer">
                    eBay sold
                  </a>
                </li>
              );
            })}
          </ul>
        </article>
        <article>
          <h4>Incomplete deals blocking decisions</h4>
          {incompleteBlockingDeals.length === 0 ? (
            <p>None.</p>
          ) : (
            <ul>
              {incompleteBlockingDeals.map((deal) => (
                <li key={`${deal.deal.id}-incomplete`}>{deal.deal.label}</li>
              ))}
            </ul>
          )}
        </article>
        <article className="time-discipline-alerts">
          <h4>Time discipline alerts</h4>
          <ul>
            <li>Recon delay: {reconDelayDeals.length}</li>
            <li>Sales delay: {salesDelayDeals.length}</li>
            <li>Urgent (&gt;14d / extension): {urgentVehicleDeals.length}</li>
            <li>Recon not started: {reconNotStartedDeals.length}</li>
          </ul>
        </article>
        <article>
          <h4>Highest recon cost units</h4>
          {highestReconCostDeals.length === 0 ? (
            <p>None.</p>
          ) : (
            <ul>
              {highestReconCostDeals.map((item) => (
                <li key={`${item.id}-recon-cost`}>
                  {item.label}: {formatCurrency(item.total_recon_cost)}
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </>
  );
}
