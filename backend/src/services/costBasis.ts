import { Deal } from "../models/deal";

export interface CostBasisBreakdown {
  acquisition_cost: number;
  buyer_premium: number;
  tax: number;
  transport: number;
  repair_cost: number;
  prep_cost: number;
}

export interface CostBasisResult {
  total_cost_basis: number;
  cost_basis_breakdown: CostBasisBreakdown;
  estimated_inputs: string[];
}

const toAmount = (value: number | null | undefined): number => value ?? 0;
const isCostTrackedTransportType = (transportType: Deal["transport_type"]): boolean =>
  transportType === "auto_transport" ||
  transportType === "freight" ||
  transportType === "parcel";

export const calculateTotalCostBasis = (deal: Deal): CostBasisResult => {
  const estimated_inputs: string[] = [];

  const acquisitionCost = toAmount(deal.acquisition_cost);
  // buyer_premium_pct is stored as decimal (0.10 = 10%, 0.125 = 12.5%).
  const buyerPremium = acquisitionCost * toAmount(deal.buyer_premium_pct);
  const tax = toAmount(deal.tax);

  let transport = 0;
  if (
    deal.transport_paid_by === "buyer" &&
    isCostTrackedTransportType(deal.transport_type)
  ) {
    if (deal.transport_cost_actual !== null) {
      transport = toAmount(deal.transport_cost_actual);
    } else if (deal.transport_cost_estimated !== null) {
      transport = toAmount(deal.transport_cost_estimated);
      estimated_inputs.push("transport_cost_estimated");
    }
  }

  const repairCost = toAmount(deal.repair_cost);
  const prepCost = toAmount(deal.prep_cost);

  const cost_basis_breakdown: CostBasisBreakdown = {
    acquisition_cost: acquisitionCost,
    buyer_premium: buyerPremium,
    tax,
    transport,
    repair_cost: repairCost,
    prep_cost: prepCost,
  };

  const total_cost_basis =
    cost_basis_breakdown.acquisition_cost +
    cost_basis_breakdown.buyer_premium +
    cost_basis_breakdown.tax +
    cost_basis_breakdown.transport +
    cost_basis_breakdown.repair_cost +
    cost_basis_breakdown.prep_cost;

  return {
    total_cost_basis,
    cost_basis_breakdown,
    estimated_inputs,
  };
};
