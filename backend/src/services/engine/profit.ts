import type { DealCategory, DealStatus, SourcePlatform } from "../../models/dealV32";
import {
  ELECTRONICS_RETURN_RATE_BUFFER,
  PLATFORM_FEE_PCT,
  SELL_THROUGH_FACTORS,
} from "../../config/profitConfig";

export interface ProfitInput {
  category: DealCategory;
  source_platform: SourcePlatform;
  status: DealStatus;
  estimated_market_value: number;
  sale_price_actual?: number | null;
  total_cost_basis: number;
}

export interface ProfitBreakdown {
  gross_value_projection: number;
  sell_through_factor: number;
  platform_fee_pct: number;
  platform_fees: number;
  return_rate_buffer_pct: number;
  return_rate_buffer: number;
  conservative_revenue_projection: number;
}

export interface ProfitResult {
  projected_profit: number;
  realized_profit: number;
  breakdown: ProfitBreakdown;
}

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const toAmount = (value: number | null | undefined): number => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const getReturnBufferPct = (category: DealCategory): number => {
  if (category === "electronics_bulk" || category === "electronics_individual") {
    return ELECTRONICS_RETURN_RATE_BUFFER[category];
  }
  return 0;
};

export const computeProjectedProfit = (
  input: Omit<ProfitInput, "status" | "sale_price_actual">
): { projected_profit: number; breakdown: ProfitBreakdown } => {
  const grossValueProjection = toAmount(input.estimated_market_value);
  const sellThroughFactor = SELL_THROUGH_FACTORS[input.category];
  const platformFeePct = PLATFORM_FEE_PCT[input.source_platform];
  const returnRateBufferPct = getReturnBufferPct(input.category);

  const sellThroughAdjusted = grossValueProjection * sellThroughFactor;
  const platformFees = sellThroughAdjusted * platformFeePct;
  const returnBuffer = sellThroughAdjusted * returnRateBufferPct;
  const conservativeRevenueProjection = sellThroughAdjusted - platformFees - returnBuffer;

  const projectedProfit = roundCurrency(conservativeRevenueProjection - input.total_cost_basis);

  return {
    projected_profit: projectedProfit,
    breakdown: {
      gross_value_projection: roundCurrency(grossValueProjection),
      sell_through_factor: sellThroughFactor,
      platform_fee_pct: platformFeePct,
      platform_fees: roundCurrency(platformFees),
      return_rate_buffer_pct: returnRateBufferPct,
      return_rate_buffer: roundCurrency(returnBuffer),
      conservative_revenue_projection: roundCurrency(conservativeRevenueProjection),
    },
  };
};

export const computeRealizedProfit = (input: ProfitInput): number => {
  if (input.status !== "completed") {
    return 0;
  }
  const settledRevenueBase =
    input.sale_price_actual !== null && input.sale_price_actual !== undefined
      ? toAmount(input.sale_price_actual)
      : toAmount(input.estimated_market_value);

  const platformFeePct = PLATFORM_FEE_PCT[input.source_platform];
  const returnRateBufferPct = getReturnBufferPct(input.category);

  const netSettledRevenue =
    settledRevenueBase -
    settledRevenueBase * platformFeePct -
    settledRevenueBase * returnRateBufferPct;

  return roundCurrency(netSettledRevenue - input.total_cost_basis);
};

export const computeProfit = (input: ProfitInput): ProfitResult => {
  const projected = computeProjectedProfit({
    category: input.category,
    source_platform: input.source_platform,
    estimated_market_value: input.estimated_market_value,
    total_cost_basis: input.total_cost_basis,
  });

  const realized = computeRealizedProfit(input);

  return {
    projected_profit: projected.projected_profit,
    realized_profit: realized,
    breakdown: projected.breakdown,
  };
};
