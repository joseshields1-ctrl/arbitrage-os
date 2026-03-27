import type { DealCategory, SourcePlatform } from "../models/dealV32";

export const SELL_THROUGH_FACTORS: Record<DealCategory, number> = {
  vehicle_suv: 0.96,
  vehicle_police_fleet: 0.93,
  powersports: 0.95,
  electronics_bulk: 0.88,
  electronics_individual: 0.92,
};

export const ELECTRONICS_RETURN_RATE_BUFFER: Record<
  Extract<DealCategory, "electronics_bulk" | "electronics_individual">,
  number
> = {
  electronics_bulk: 0.08,
  electronics_individual: 0.05,
};

export const PLATFORM_FEE_PCT: Record<SourcePlatform, number> = {
  govdeals: 0,
  publicsurplus: 0,
  ebay: 0.13,
  facebook: 0,
  other: 0.03,
};
