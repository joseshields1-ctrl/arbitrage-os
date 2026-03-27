import type { DealCategory } from "../models/dealV32";

export interface LiquidationRule {
  warning_days: number;
  trigger_days: number;
  recommended_action: string;
}

export const LIQUIDATION_RULES: Record<DealCategory, LiquidationRule> = {
  vehicle_suv: {
    warning_days: 45,
    trigger_days: 60,
    recommended_action: "Lower ask and route to wholesale channel.",
  },
  vehicle_police_fleet: {
    warning_days: 40,
    trigger_days: 55,
    recommended_action: "Bundle units and push to fleet buyer network.",
  },
  powersports: {
    warning_days: 35,
    trigger_days: 50,
    recommended_action: "Reduce pricing and relist with seasonal keywords.",
  },
  electronics_bulk: {
    warning_days: 21,
    trigger_days: 30,
    recommended_action: "Shift to liquidation lot pricing and bulk-offload.",
  },
  electronics_individual: {
    warning_days: 21,
    trigger_days: 35,
    recommended_action: "Run markdown ladder and move to faster marketplace.",
  },
};
