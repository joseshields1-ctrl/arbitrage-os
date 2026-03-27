import type {
  DealCategory,
  DealRow,
  DealStatus,
  FinancialRow,
  MetadataRow,
  PrepMetrics,
} from "../../models/dealV32";
import { computeCostBasis } from "./costBasis";
import { computeProfit } from "./profit";
import { computeScoring } from "./scoring";
import { computeAging } from "./aging";
import { computeLiquidation } from "./liquidation";
import { computePostmortem } from "./postmortem";
import { calculateExecutionMetrics } from "../dealCalculations";

export interface EnrichedDeal {
  deal: DealRow;
  financials: FinancialRow;
  metadata: MetadataRow;
  calculations: {
    total_cost_basis: number;
    projected_profit: number;
    realized_profit: number;
    days_in_stage: number;
    days_in_current_stage: number;
    stage_alert: boolean;
    avg_time_per_unit: number | null;
    efficiency_score: number | null;
    efficiency_rating: "GOOD" | "WARNING" | "BAD" | null;
    locked_ratio: number | null;
    source_quality_flag: "LOW_QUALITY_SOURCE" | null;
  };
  engine: {
    cost_basis: ReturnType<typeof computeCostBasis>;
    profit: ReturnType<typeof computeProfit>;
    scoring: ReturnType<typeof computeScoring>;
    aging: ReturnType<typeof computeAging>;
    liquidation: ReturnType<typeof computeLiquidation>;
    postmortem: ReturnType<typeof computePostmortem>;
  };
  warnings: string[];
}

const normalizePrepMetrics = (value: PrepMetrics | null | undefined): PrepMetrics | null => {
  if (!value) {
    return null;
  }
  return {
    total_units: Math.max(0, Math.floor(Number(value.total_units ?? 0))),
    working_units: Math.max(0, Math.floor(Number(value.working_units ?? 0))),
    cosmetic_units: Math.max(0, Math.floor(Number(value.cosmetic_units ?? 0))),
    functional_units: Math.max(0, Math.floor(Number(value.functional_units ?? 0))),
    defective_units: Math.max(0, Math.floor(Number(value.defective_units ?? 0))),
    locked_units: Math.max(0, Math.floor(Number(value.locked_units ?? 0))),
    total_prep_time_minutes: Math.max(0, Number(value.total_prep_time_minutes ?? 0)),
  };
};

const buildWarnings = (
  category: DealCategory,
  transportType: MetadataRow["transport_type"],
  sourceQualityFlag: "LOW_QUALITY_SOURCE" | null
): string[] => {
  const warnings: string[] = [];
  if (category === "electronics_bulk" && transportType === "parcel") {
    warnings.push(
      "Potential transport mismatch: electronics_bulk usually fits local_pickup or freight."
    );
  }
  if (sourceQualityFlag) {
    warnings.push(sourceQualityFlag);
  }
  return warnings;
};

const normalizeOptionalCount = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = Math.max(0, Math.floor(Number(value)));
  return normalized > 0 ? normalized : null;
};

export interface EnrichDealInput {
  deal: DealRow;
  financials: FinancialRow;
  metadata: MetadataRow;
}

export const enrichDeal = ({ deal, financials, metadata }: EnrichDealInput): EnrichedDeal => {
  const normalizedPrepMetrics = normalizePrepMetrics(deal.prep_metrics ?? null);
  const normalizedUnitCount = normalizeOptionalCount(deal.unit_count ?? null);

  const costBasis = computeCostBasis({
    acquisition_cost: financials.acquisition_cost,
    source_platform: deal.source_platform,
    acquisition_state: deal.acquisition_state,
    buyer_premium_pct: financials.buyer_premium_pct,
    buyer_premium_overridden: financials.buyer_premium_overridden,
    transport_type: metadata.transport_type,
    transport_cost_actual: financials.transport_cost_actual,
    transport_cost_estimated: financials.transport_cost_estimated,
    repair_cost: financials.repair_cost,
    prep_cost: financials.prep_cost,
    tax: 0,
    category: deal.category,
  });

  const profit = computeProfit({
    category: deal.category,
    source_platform: deal.source_platform,
    status: deal.status as DealStatus,
    estimated_market_value: financials.estimated_market_value,
    total_cost_basis: costBasis.total_cost_basis,
  });

  const scoring = computeScoring({
    category: deal.category,
    condition_grade: metadata.condition_grade,
    projected_profit: profit.projected_profit,
    total_cost_basis: costBasis.total_cost_basis,
  });

  const aging = computeAging(deal.stage_updated_at, deal.status);
  const liquidation = computeLiquidation(deal.category, aging.days_in_current_stage);
  const execution = calculateExecutionMetrics(normalizedPrepMetrics, normalizedUnitCount);
  const postmortem = computePostmortem({
    projected_profit: profit.projected_profit,
    realized_profit: profit.realized_profit,
    total_cost_basis: costBasis.total_cost_basis,
    conservative_revenue_projection: profit.breakdown.conservative_revenue_projection,
  });

  return {
    deal: {
      ...deal,
      unit_count: normalizedPrepMetrics ? null : normalizedUnitCount,
      prep_metrics: normalizedPrepMetrics,
    },
    financials: {
      ...financials,
      buyer_premium_pct: costBasis.buyer_premium_pct,
      projected_profit: profit.projected_profit,
      realized_profit: profit.realized_profit,
    },
    metadata,
    calculations: {
      total_cost_basis: costBasis.total_cost_basis,
      projected_profit: profit.projected_profit,
      realized_profit: profit.realized_profit,
      days_in_stage: aging.days_in_current_stage,
      days_in_current_stage: aging.days_in_current_stage,
      stage_alert: aging.stage_alert,
      avg_time_per_unit: execution.avg_time_per_unit,
      efficiency_score: execution.efficiency_score,
      efficiency_rating: execution.efficiency_rating,
      locked_ratio: execution.locked_ratio,
      source_quality_flag: execution.source_quality_flag,
    },
    engine: {
      cost_basis: costBasis,
      profit,
      scoring,
      aging,
      liquidation,
      postmortem,
    },
    warnings: buildWarnings(deal.category, metadata.transport_type, execution.source_quality_flag),
  };
};

