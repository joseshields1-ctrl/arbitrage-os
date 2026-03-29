import type { SourcePlatform as SourcePlatformType } from "../config/buyerPremiumConfig";
import type {
  ConditionGrade as ConditionGradeType,
  DealCategory as DealCategoryType,
  TransportType as TransportTypeType,
} from "./deal";

export type SourcePlatform = SourcePlatformType;
export type DealCategory = DealCategoryType;
export type ConditionGrade = ConditionGradeType;
export type TransportType = TransportTypeType;

export const DEAL_LIFECYCLE_STAGES = [
  "sourced",
  "acquired",
  "prep",
  "listed",
  "sold",
  "completed",
] as const;

export type DealStatus = (typeof DEAL_LIFECYCLE_STAGES)[number];
export type DealStageInput = DealStatus;

export interface UnitBreakdown {
  units_total: number;
  units_working: number;
  units_minor_issue: number;
  units_defective: number;
  units_locked: number;
}

export interface PrepMetrics {
  total_units: number;
  working_units: number;
  cosmetic_units: number;
  functional_units: number;
  defective_units: number;
  locked_units: number;
  total_prep_time_minutes: number;
}

export interface DealRow {
  id: string;
  label: string;
  category: DealCategory;
  source_platform: SourcePlatform;
  acquisition_state: string;
  status: DealStatus;
  stage_updated_at: string;
  discovered_date: string | null;
  purchase_date: string | null;
  listing_date: string | null;
  sale_date: string | null;
  completion_date: string | null;
  unit_count?: number | null;
  unit_breakdown?: UnitBreakdown | null;
  prep_metrics?: PrepMetrics | null;
}

export interface FinancialInput {
  acquisition_cost: number;
  // Decimal format: 0.10 means 10%, 0.125 means 12.5%.
  buyer_premium_pct?: number;
  buyer_premium_overridden?: boolean;
  tax_rate?: number | null;
  transport_cost_actual?: number | null;
  transport_cost_estimated?: number | null;
  repair_cost?: number | null;
  prep_cost?: number | null;
  estimated_market_value: number;
  sale_price_actual?: number | null;
}

export interface FinancialRow {
  deal_id: string;
  acquisition_cost: number;
  buyer_premium_pct: number;
  buyer_premium_overridden: boolean;
  tax_rate: number | null;
  tax: number | null;
  transport_cost_actual: number | null;
  transport_cost_estimated: number | null;
  repair_cost: number | null;
  prep_cost: number | null;
  estimated_market_value: number;
  sale_price_actual: number | null;
  projected_profit: number;
  realized_profit: number | null;
}

export interface MetadataInput {
  condition_grade: ConditionGrade;
  condition_notes: string;
  transport_type: TransportType;
  presentation_quality: string;
}

export interface MetadataRow {
  deal_id: string;
  condition_grade: ConditionGrade;
  condition_notes: string;
  transport_type: TransportType;
  presentation_quality: string;
}

export interface DealComputedMetrics {
  total_cost_basis: number;
  projected_profit: number;
  realized_profit: number | null;
  days_in_stage: number;
  days_in_current_stage: number;
  stage_alert: "OK" | "WARNING" | "CRITICAL";
  data_confidence: number;
  efficiency_score: number | null;
  efficiency_rating: "GOOD" | "WARNING" | "BAD" | null;
  avg_time_per_unit: number | null;
  locked_ratio: number | null;
  source_quality_flag: "LOW_QUALITY_SOURCE" | null;
}

export interface AiRecommendation {
  suggested_action: "buy" | "pass" | "investigate";
  confidence: number;
  reasoning: string;
  key_factors: string[];
}

export interface OperatorDecisionRecord {
  id: string;
  deal_id: string;
  decision: "approved" | "rejected";
  reason: string;
  decided_at: string;
  ai_recommendation_snapshot: AiRecommendation;
}

export interface DealView {
  deal: DealRow;
  financials: FinancialRow;
  metadata: MetadataRow;
  calculations: DealComputedMetrics;
  ai_recommendation: AiRecommendation;
  operator_decision_history: OperatorDecisionRecord[];
  warnings?: string[];
}

