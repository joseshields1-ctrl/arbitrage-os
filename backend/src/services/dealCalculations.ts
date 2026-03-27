import { DealCategory, DealStatus, TransportType } from "../models/dealV32";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const toNumber = (value: number | null): number => (value === null ? 0 : value);

export interface CalculationInput {
  status: DealStatus;
  stage_updated_at: string;
  acquisition_cost: number;
  buyer_premium_pct: number;
  category: DealCategory;
  transport_type: TransportType;
  transport_cost_actual: number | null;
  transport_cost_estimated: number | null;
  repair_cost: number | null;
  prep_cost: number | null;
  estimated_market_value: number;
}

export const calculateTotalCostBasis = (input: CalculationInput): number => {
  // V3.2: buyer_premium_pct is stored as a decimal (0.10 = 10%).
  const buyerPremium =
    toNumber(input.acquisition_cost) * toNumber(input.buyer_premium_pct);

  const normalizedTransportActual =
    input.transport_type === "local_pickup" || input.transport_type === "none"
      ? 0
      : input.transport_cost_actual;
  const normalizedTransportEstimated =
    input.transport_type === "local_pickup" || input.transport_type === "none"
      ? 0
      : input.transport_cost_estimated;
  const includeTransport =
    input.transport_type !== "local_pickup" && input.transport_type !== "none";
  const transportCost = includeTransport
    ? normalizedTransportActual ?? normalizedTransportEstimated ?? 0
    : 0;

  const total =
    toNumber(input.acquisition_cost) +
    buyerPremium +
    transportCost +
    toNumber(input.repair_cost) +
    toNumber(input.prep_cost);

  return roundCurrency(total);
};

export const calculateProjectedProfit = (
  estimatedMarketValue: number,
  totalCostBasis: number
): number => {
  const projected = toNumber(estimatedMarketValue) - totalCostBasis;
  return roundCurrency(projected);
};

export const calculateRealizedProfit = (
  estimatedMarketValue: number,
  totalCostBasis: number,
  status: DealStatus
): number => {
  if (status !== "completed") {
    return 0;
  }

  return roundCurrency(estimatedMarketValue - totalCostBasis);
};

export const calculateDaysInStage = (stageUpdatedAt: string): number => {
  const updatedAtMs = new Date(stageUpdatedAt).getTime();
  const nowMs = Date.now();
  const diffMs = Math.max(0, nowMs - updatedAtMs);
  return Math.floor(diffMs / MS_PER_DAY);
};

export const calculateDealMetrics = (input: CalculationInput) => {
  const total_cost_basis = calculateTotalCostBasis(input);
  const projected_profit = calculateProjectedProfit(
    input.estimated_market_value,
    total_cost_basis
  );
  const realized_profit = calculateRealizedProfit(
    input.estimated_market_value,
    total_cost_basis,
    input.status
  );
  const days_in_stage = calculateDaysInStage(input.stage_updated_at);

  return {
    total_cost_basis,
    projected_profit,
    realized_profit,
    days_in_stage,
  };
};

export const hasTransportCategoryMismatch = (
  category: DealCategory,
  transportType: TransportType
): boolean => category === "electronics_bulk" && transportType === "parcel";

export const isAgingAlert = (daysInStage: number, status: DealStatus): boolean => {
  if (status === "completed") {
    return false;
  }
  return daysInStage >= 14;
};
