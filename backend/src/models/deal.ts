export type DealCategory =
  | "vehicle_suv"
  | "vehicle_police_fleet"
  | "powersports"
  | "electronics_bulk"
  | "electronics_individual";

export type DealStage =
  | "sourced"
  | "acquired"
  | "prep"
  | "listed"
  | "sold"
  | "completed";

export type TransportType =
  | "auto_transport"
  | "freight"
  | "parcel"
  | "local_pickup"
  | "none";

export type TransportPaidBy = "buyer" | "seller";

export type ConditionGrade =
  | "excellent"
  | "used_good"
  | "used"
  | "used_cosmetic"
  | "used_functional"
  | "defective"
  | "parts_only";

export interface Deal {
  id: string;
  category: DealCategory;
  stage: DealStage;
  stage_updated_at: string;
  acquisition_cost: number;
  buyer_premium_pct: number;
  buyer_premium_overridden: boolean;
  tax: number;
  transport_type: TransportType;
  transport_cost_actual: number | null;
  transport_cost_estimated: number | null;
  transport_paid_by: TransportPaidBy;
  repair_cost: number | null;
  prep_cost: number | null;
  condition_grade: ConditionGrade;
  condition_notes: string;
}
