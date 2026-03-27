export interface PostmortemInput {
  projected_profit: number;
  realized_profit: number;
  total_cost_basis: number;
  conservative_revenue_projection: number;
}

export interface PostmortemResult {
  profit_delta: number;
  variance_pct: number | null;
  revenue_variance: number;
}

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const roundPct = (value: number): number =>
  Math.round((value + Number.EPSILON) * 10000) / 10000;

export const computePostmortem = (input: PostmortemInput): PostmortemResult => {
  const profitDelta = roundCurrency(input.realized_profit - input.projected_profit);
  const variancePct =
    input.projected_profit === 0 ? null : roundPct(profitDelta / input.projected_profit);

  // Using projected conservative revenue as baseline for variance tracking.
  const realizedRevenue = input.realized_profit + input.total_cost_basis;
  const revenueVariance = roundCurrency(realizedRevenue - input.conservative_revenue_projection);

  return {
    profit_delta: profitDelta,
    variance_pct: variancePct,
    revenue_variance: revenueVariance,
  };
};
