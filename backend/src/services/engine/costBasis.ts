import type { DealCategory, SourcePlatform, TransportType } from "../../models/dealV32";
import { resolveBuyerPremium } from "../buyerPremiumResolver";

export interface CostBasisInput {
  acquisition_cost: number;
  source_platform: SourcePlatform;
  acquisition_state: string;
  buyer_premium_pct?: number | null;
  buyer_premium_overridden?: boolean;
  transport_type: TransportType;
  transport_cost_actual?: number | null;
  transport_cost_estimated?: number | null;
  repair_cost?: number | null;
  prep_cost?: number | null;
  tax?: number | null;
  category: DealCategory;
}

export interface CostBasisBreakdown {
  acquisition_cost: number;
  buyer_premium: number;
  tax: number;
  transport: number;
  repair_cost: number;
  prep_cost: number;
  vehicle_mechanical_contingency: number;
}

export interface CostBasisResult {
  total_cost_basis: number;
  cost_basis_breakdown: CostBasisBreakdown;
  estimated_inputs: string[];
  buyer_premium_pct: number;
  buyer_premium_overridden: boolean;
}

const VEHICLE_MECHANICAL_CONTINGENCY_PCT: Record<
  Extract<DealCategory, "vehicle_suv" | "vehicle_police_fleet" | "powersports">,
  number
> = {
  vehicle_suv: 0.04,
  vehicle_police_fleet: 0.06,
  powersports: 0.05,
};

const toAmount = (value: number | null | undefined): number => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const computeTransportCost = (
  transportType: TransportType,
  actual: number | null | undefined,
  estimated: number | null | undefined,
  estimatedInputs: string[]
): number => {
  if (transportType === "local_pickup" || transportType === "none") {
    return 0;
  }
  if (actual !== null && actual !== undefined) {
    return toAmount(actual);
  }
  if (estimated !== null && estimated !== undefined) {
    estimatedInputs.push("transport_cost_estimated");
    return toAmount(estimated);
  }
  estimatedInputs.push("transport_cost_estimated");
  return 0;
};

const computeVehicleMechanicalContingency = (
  category: DealCategory,
  acquisitionCost: number
): number => {
  if (
    category !== "vehicle_suv" &&
    category !== "vehicle_police_fleet" &&
    category !== "powersports"
  ) {
    return 0;
  }
  return roundCurrency(acquisitionCost * VEHICLE_MECHANICAL_CONTINGENCY_PCT[category]);
};

export const computeCostBasis = (input: CostBasisInput): CostBasisResult => {
  const estimatedInputs: string[] = [];
  const acquisitionCost = toAmount(input.acquisition_cost);
  const tax = toAmount(input.tax);
  const repairCost = toAmount(input.repair_cost);
  const prepCost = toAmount(input.prep_cost);

  const premiumResolution = resolveBuyerPremium(
    input.source_platform,
    input.acquisition_state,
    input.buyer_premium_overridden ? input.buyer_premium_pct ?? 0 : undefined
  );
  const buyerPremium = roundCurrency(acquisitionCost * premiumResolution.buyer_premium_pct);
  const transport = computeTransportCost(
    input.transport_type,
    input.transport_cost_actual,
    input.transport_cost_estimated,
    estimatedInputs
  );
  const mechanicalContingency = computeVehicleMechanicalContingency(
    input.category,
    acquisitionCost
  );

  const cost_basis_breakdown: CostBasisBreakdown = {
    acquisition_cost: roundCurrency(acquisitionCost),
    buyer_premium: buyerPremium,
    tax: roundCurrency(tax),
    transport: roundCurrency(transport),
    repair_cost: roundCurrency(repairCost),
    prep_cost: roundCurrency(prepCost),
    vehicle_mechanical_contingency: mechanicalContingency,
  };

  const total_cost_basis = roundCurrency(
    cost_basis_breakdown.acquisition_cost +
      cost_basis_breakdown.buyer_premium +
      cost_basis_breakdown.tax +
      cost_basis_breakdown.transport +
      cost_basis_breakdown.repair_cost +
      cost_basis_breakdown.prep_cost +
      cost_basis_breakdown.vehicle_mechanical_contingency
  );

  return {
    total_cost_basis,
    cost_basis_breakdown,
    estimated_inputs: estimatedInputs,
    buyer_premium_pct: premiumResolution.buyer_premium_pct,
    buyer_premium_overridden: premiumResolution.buyer_premium_overridden,
  };
};

