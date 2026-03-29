export interface PostmortemInput {
  projected_profit: number;
  realized_profit: number | null;
  total_cost_basis: number;
  conservative_revenue_projection: number;
  estimated_inputs: string[];
  cost_basis_breakdown: {
    acquisition_cost: number;
    buyer_premium: number;
    tax: number;
    transport: number;
    repair_cost: number;
    prep_cost: number;
    vehicle_mechanical_contingency: number;
  };
  transport_cost_actual: number | null;
  transport_cost_estimated: number | null;
  sale_price_actual: number | null;
  return_rate_buffer: number;
}

export type ProfitDriftFlag = "HIGH_NEGATIVE" | "NEGATIVE" | "STABLE" | "POSITIVE" | null;
export type DriftSource =
  | "tax_miscalculation"
  | "transport_underestimated"
  | "repair_overrun"
  | "prep_overrun"
  | "return_loss"
  | "pricing_error"
  | "demand_overestimation";

export interface PostmortemResult {
  profit_delta: number | null;
  variance_pct: number | null;
  revenue_variance: number | null;
  profit_drift_flag: ProfitDriftFlag;
  cost_overrun_flag: boolean;
  drift_sources: DriftSource[];
  postmortem_incomplete: boolean;
}

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const roundPct = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const getProfitDriftFlag = (variancePct: number | null): ProfitDriftFlag => {
  if (variancePct === null) {
    return null;
  }
  if (variancePct < -20) {
    return "HIGH_NEGATIVE";
  }
  if (variancePct < -5) {
    return "NEGATIVE";
  }
  if (variancePct <= 5) {
    return "STABLE";
  }
  return "POSITIVE";
};

export const computePostmortem = (input: PostmortemInput): PostmortemResult => {
  if (input.realized_profit === null) {
    return {
      profit_delta: null,
      variance_pct: null,
      revenue_variance: null,
      profit_drift_flag: null,
      cost_overrun_flag: false,
      drift_sources: [],
      postmortem_incomplete: true,
    };
  }

  const profitDelta = roundCurrency(input.realized_profit - input.projected_profit);
  const variancePct =
    input.projected_profit === 0
      ? null
      : roundPct((profitDelta / Math.abs(input.projected_profit)) * 100);

  // Using projected conservative revenue as baseline for variance tracking.
  const realizedRevenue = input.realized_profit + input.total_cost_basis;
  const revenueVariance = roundCurrency(realizedRevenue - input.conservative_revenue_projection);
  const profitDriftFlag = getProfitDriftFlag(variancePct);
  const projectedTransport =
    input.transport_cost_estimated ?? input.transport_cost_actual ?? input.cost_basis_breakdown.transport;
  const projectedTotalCostBasis = roundCurrency(
    input.cost_basis_breakdown.acquisition_cost +
      input.cost_basis_breakdown.buyer_premium +
      input.cost_basis_breakdown.tax +
      projectedTransport +
      input.cost_basis_breakdown.repair_cost +
      input.cost_basis_breakdown.prep_cost +
      input.cost_basis_breakdown.vehicle_mechanical_contingency
  );
  const costOverrunFlag = input.total_cost_basis > projectedTotalCostBasis * 1.1;

  const driftSources = new Set<DriftSource>();
  if (profitDriftFlag === "HIGH_NEGATIVE" || profitDriftFlag === "NEGATIVE") {
    const estimatedInputs = new Set(input.estimated_inputs);
    if (estimatedInputs.has("tax_rate") || estimatedInputs.has("tax_estimated")) {
      driftSources.add("tax_miscalculation");
    }
    if (
      input.transport_cost_estimated !== null &&
      input.transport_cost_actual !== null &&
      input.transport_cost_actual > input.transport_cost_estimated * 1.1
    ) {
      driftSources.add("transport_underestimated");
    }
    if (input.cost_basis_breakdown.repair_cost > input.cost_basis_breakdown.acquisition_cost * 0.15) {
      driftSources.add("repair_overrun");
    }
    if (input.cost_basis_breakdown.prep_cost > input.cost_basis_breakdown.acquisition_cost * 0.1) {
      driftSources.add("prep_overrun");
    }
    if (input.return_rate_buffer > 0) {
      driftSources.add("return_loss");
    }
    if (input.sale_price_actual !== null && input.conservative_revenue_projection > 0) {
      const realizedRevenueRatio = realizedRevenue / input.conservative_revenue_projection;
      if (realizedRevenueRatio < 0.95) {
        driftSources.add("pricing_error");
      }
      if (realizedRevenueRatio < 0.8) {
        driftSources.add("demand_overestimation");
      }
    }
  }

  return {
    profit_delta: profitDelta,
    variance_pct: variancePct,
    revenue_variance: revenueVariance,
    profit_drift_flag: profitDriftFlag,
    cost_overrun_flag: costOverrunFlag,
    drift_sources: Array.from(driftSources),
    postmortem_incomplete: variancePct === null,
  };
};
