import type { ConditionGrade } from "../models/dealV32";

export const DEMAND_WEIGHT_BY_CATEGORY = {
  vehicle_suv: 0.78,
  vehicle_police_fleet: 0.6,
  powersports: 0.72,
  electronics_bulk: 0.66,
  electronics_individual: 0.74,
} as const;

export const DEMAND_SIGNAL_WEIGHTS = {
  watchers: 0.1,
  bids: 1.0,
  inquiries: {
    weak_intent: 0.1,
    strong_intent: 0.9,
  },
} as const;

export const CONDITION_MULTIPLIER: Record<ConditionGrade, number> = {
  excellent: 1,
  used_good: 0.92,
  used: 0.84,
  used_cosmetic: 0.74,
  used_functional: 0.68,
  defective: 0.42,
  parts_only: 0.32,
};

export const DEFECTIVE_REVIEW_BIAS = {
  defective: 0.1,
  parts_only: 0.12,
} as const;

