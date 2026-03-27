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
}

export interface FinancialInput {
  acquisition_cost: number;
  // Whole percent format: 10 means 10%, 12.5 means 12.5%.
  buyer_premium_pct?: number;
  transport_cost_actual?: number | null;
  transport_cost_estimated?: number | null;
  repair_cost?: number | null;
  prep_cost?: number | null;
  estimated_market_value: number;
}

export interface FinancialRow {
  deal_id: string;
  acquisition_cost: number;
  buyer_premium_pct: number;
  transport_cost_actual: number | null;
  transport_cost_estimated: number | null;
  repair_cost: number | null;
  prep_cost: number | null;
  estimated_market_value: number;
  projected_profit: number;
  realized_profit: number;
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
  realized_profit: number;
  days_in_stage: number;
}

export interface DealView {
  deal: DealRow;
  financials: FinancialRow;
  metadata: MetadataRow;
  calculations: DealComputedMetrics;
}

