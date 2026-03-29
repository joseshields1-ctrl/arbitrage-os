export const DEAL_STAGES = [
  "sourced",
  "acquired",
  "prep",
  "listed",
  "sold",
  "completed",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];
export type DealStatus = DealStage;

export type DealCategory =
  | "vehicle_suv"
  | "vehicle_police_fleet"
  | "powersports"
  | "electronics_bulk"
  | "electronics_individual";

export type SourcePlatform = "govdeals" | "publicsurplus" | "ebay" | "facebook" | "other";

export type TransportType =
  | "auto_transport"
  | "freight"
  | "parcel"
  | "local_pickup"
  | "none";

export type ConditionGrade =
  | "excellent"
  | "used_good"
  | "used"
  | "used_cosmetic"
  | "used_functional"
  | "defective"
  | "parts_only";

export interface DealRecord {
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
  unit_breakdown?: {
    units_total: number;
    units_working: number;
    units_minor_issue: number;
    units_defective: number;
    units_locked: number;
  } | null;
  prep_metrics?: {
    total_units: number;
    working_units: number;
    cosmetic_units: number;
    functional_units: number;
    defective_units: number;
    locked_units: number;
    total_prep_time_minutes: number;
  } | null;
}

export interface FinancialRecord {
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

export interface MetadataRecord {
  deal_id: string;
  condition_grade: ConditionGrade;
  condition_notes: string;
  transport_type: TransportType;
  presentation_quality: string;
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
  deal: DealRecord;
  financials: FinancialRecord;
  metadata: MetadataRecord;
  alerts?: Array<{
    code:
      | "FORCE_LIQUIDATION"
      | "STAGE_CRITICAL"
      | "TITLE_DELAY"
      | "PROFIT_DRIFT_HIGH"
      | "COST_OVERRUN"
      | "ESTIMATION_FAILURE"
      | "POSTMORTEM_INCOMPLETE"
      | "LOW_DATA_CONFIDENCE";
    severity: "critical" | "warning" | "info";
    message: string;
  }>;
  operator_recommendation?: string;
  ai_recommendation: AiRecommendation;
  operator_decision_history: OperatorDecisionRecord[];
  warnings?: string[];
  engine: {
    cost_basis: {
      total_cost_basis: number;
      cost_basis_breakdown: {
        acquisition_cost: number;
        buyer_premium: number;
        tax: number;
        transport: number;
        repair_cost: number;
        prep_cost: number;
        vehicle_mechanical_contingency: number;
      };
      estimated_inputs: string[];
      buyer_premium_pct: number;
      buyer_premium_overridden: boolean;
      tax_rate: number | null;
      tax: number;
    };
    profit: {
      projected_profit: number;
      realized_profit: number | null;
      breakdown: {
        gross_value_projection: number;
        sell_through_factor: number;
        platform_fee_pct: number;
        platform_fees: number;
        return_rate_buffer_pct: number;
        return_rate_buffer: number;
        conservative_revenue_projection: number;
      };
    };
    scoring: {
      acquisition_score: number;
      exit_score: number;
      classification:
        | "LIKELY WIN"
        | "WORTH REVIEW"
        | "MARGINAL"
        | "PASS"
        | "BEST WIN"
        | "ACCEPTABLE WIN"
        | "BAD DEAL";
      defective_review_bias: number;
    };
    aging: {
      days_in_current_stage: number;
      stage_alert: "OK" | "WARNING" | "CRITICAL";
    };
    liquidation: {
      warning: boolean;
      trigger: boolean;
      force_liquidation: boolean;
      recommended_action:
        | "pass"
        | "review_only"
        | "do_not_acquire"
        | "reduce_price"
        | "liquidate_now";
    };
    data_confidence: number;
    postmortem: {
      profit_delta: number | null;
      variance_pct: number | null;
      revenue_variance: number | null;
      profit_drift_flag: "HIGH_NEGATIVE" | "NEGATIVE" | "STABLE" | "POSITIVE" | null;
      cost_overrun_flag: boolean;
      drift_sources: string[];
      postmortem_incomplete: boolean;
    };
    recommended_action:
      | "pass"
      | "review_only"
      | "do_not_acquire"
      | "reduce_price"
      | "liquidate_now"
      | null;
  };
  assistant_context: {
    current_deal: {
      deal: DealRecord;
      financials: FinancialRecord;
      metadata: MetadataRecord;
    };
    calculations: DealView["calculations"];
    engine: DealView["engine"];
    warnings: string[];
    postmortem: DealView["engine"]["postmortem"];
    recommendation_summary: string;
    ai_recommendation: AiRecommendation;
    operator_decision_history: OperatorDecisionRecord[];
  };
  calculations: {
    total_cost_basis: number;
    projected_profit: number;
    realized_profit: number | null;
    days_in_stage: number;
    days_in_current_stage: number;
    stage_alert: "OK" | "WARNING" | "CRITICAL";
    data_confidence: number;
    avg_time_per_unit: number | null;
    efficiency_score: number | null;
    efficiency_rating: "GOOD" | "WARNING" | "BAD" | null;
    locked_ratio: number | null;
    source_quality_flag: "LOW_QUALITY_SOURCE" | null;
  };
}

export interface CreateDealRequest {
  label: string;
  category: DealCategory;
  source_platform: SourcePlatform;
  acquisition_state: string;
  status?: DealStatus;
  stage_updated_at?: string;
  discovered_date?: string | null;
  purchase_date?: string | null;
  listing_date?: string | null;
  sale_date?: string | null;
  completion_date?: string | null;
  financials: {
    acquisition_cost: number;
    buyer_premium_pct?: number;
    transport_cost_actual?: number | null;
    transport_cost_estimated?: number | null;
    repair_cost?: number | null;
    prep_cost?: number | null;
    estimated_market_value: number;
  };
  metadata: {
    condition_grade: ConditionGrade;
    condition_notes: string;
    transport_type: TransportType;
    presentation_quality: string;
  };
  unit_breakdown?: {
    units_total: number;
    units_working: number;
    units_minor_issue: number;
    units_defective: number;
    units_locked: number;
  };
  unit_count?: number | null;
  prep_metrics?: {
    total_units: number;
    working_units: number;
    cosmetic_units: number;
    functional_units: number;
    defective_units: number;
    locked_units: number;
    total_prep_time_minutes: number;
  };
}

export interface DashboardSummary {
  active_deals: number;
  completed_deals: number;
  realized_profit_total: number;
  projected_profit_total: number;
  aging_alerts: Array<{
    id: string;
    label: string;
    status: DealStatus;
    days_in_stage: number;
  }>;
}

export type DashboardResponse = DashboardSummary;

export interface AssistantQueryRequest {
  deal_id?: string;
  assistant_context?: DealView["assistant_context"];
  question: string;
}

export interface AssistantQueryResponse {
  response: string;
  key_points: string[];
  risk_level: "low" | "medium" | "high";
  suggested_action: string;
}

export interface DealDecisionRequest {
  decision: "approved" | "rejected";
  reason: string;
}

export interface DealDecisionResponse {
  deal: DealView;
  stored_decision: OperatorDecisionRecord;
}

export const CATEGORY_OPTIONS: DealCategory[] = [
  "vehicle_suv",
  "vehicle_police_fleet",
  "powersports",
  "electronics_bulk",
  "electronics_individual",
];

export const SOURCE_PLATFORM_OPTIONS: SourcePlatform[] = [
  "govdeals",
  "publicsurplus",
  "ebay",
  "facebook",
  "other",
];

export const CONDITION_GRADE_OPTIONS: ConditionGrade[] = [
  "excellent",
  "used_good",
  "used",
  "used_cosmetic",
  "used_functional",
  "defective",
  "parts_only",
];

export const TRANSPORT_TYPE_OPTIONS: TransportType[] = [
  "auto_transport",
  "freight",
  "parcel",
  "local_pickup",
  "none",
];
