import type {
  AiRecommendation,
  DealCategory,
  DealRow,
  DealStatus,
  FinancialRow,
  MetadataRow,
  OperatorDecisionRecord,
  PrepMetrics,
} from "../../models/dealV32";
import { computeCostBasis } from "./costBasis";
import { computeProfit } from "./profit";
import { computeScoring } from "./scoring";
import { computeAging } from "./aging";
import { computeLiquidation } from "./liquidation";
import { computePostmortem } from "./postmortem";
import { calculateExecutionMetrics } from "../dealCalculations";
import { computeDataConfidence } from "./dataConfidence";

export type EngineRecommendedAction =
  | "pass"
  | "review_only"
  | "do_not_acquire"
  | "reduce_price"
  | "liquidate_now"
  | null;

export type OperatorAlertCode =
  | "FORCE_LIQUIDATION"
  | "STAGE_CRITICAL"
  | "TITLE_DELAY"
  | "PROFIT_DRIFT_HIGH"
  | "COST_OVERRUN"
  | "ESTIMATION_FAILURE"
  | "POSTMORTEM_INCOMPLETE"
  | "LOW_DATA_CONFIDENCE";

export interface OperatorAlert {
  code: OperatorAlertCode;
  severity: "critical" | "warning" | "info";
  message: string;
}

export interface EnrichedDeal {
  deal: DealRow;
  financials: FinancialRow;
  metadata: MetadataRow;
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
  engine: {
    cost_basis: ReturnType<typeof computeCostBasis>;
    profit: ReturnType<typeof computeProfit>;
    scoring: ReturnType<typeof computeScoring>;
    aging: ReturnType<typeof computeAging>;
    liquidation: ReturnType<typeof computeLiquidation>;
    data_confidence: number;
    postmortem: ReturnType<typeof computePostmortem>;
    recommended_action: EngineRecommendedAction;
  };
  ai_recommendation: AiRecommendation;
  operator_decision_history: OperatorDecisionRecord[];
  alerts: OperatorAlert[];
  warnings: string[];
  operator_recommendation: string;
  assistant_context: {
    current_deal: {
      deal: DealRow;
      financials: FinancialRow;
      metadata: MetadataRow;
    };
    calculations: EnrichedDeal["calculations"];
    engine: EnrichedDeal["engine"];
    warnings: string[];
    postmortem: ReturnType<typeof computePostmortem>;
    recommendation_summary: string;
    ai_recommendation: AiRecommendation;
    operator_decision_history: OperatorDecisionRecord[];
  };
}

const LOW_DATA_CONFIDENCE_THRESHOLD = 60;
const TITLE_DELAY_DAYS = 14;
const TITLE_DELAY_CATEGORIES: ReadonlySet<DealCategory> = new Set([
  "vehicle_suv",
  "vehicle_police_fleet",
  "powersports",
]);

const normalizePrepMetrics = (value: PrepMetrics | null | undefined): PrepMetrics | null => {
  if (!value) {
    return null;
  }
  return {
    total_units: Math.max(0, Math.floor(Number(value.total_units ?? 0))),
    working_units: Math.max(0, Math.floor(Number(value.working_units ?? 0))),
    cosmetic_units: Math.max(0, Math.floor(Number(value.cosmetic_units ?? 0))),
    functional_units: Math.max(0, Math.floor(Number(value.functional_units ?? 0))),
    defective_units: Math.max(0, Math.floor(Number(value.defective_units ?? 0))),
    locked_units: Math.max(0, Math.floor(Number(value.locked_units ?? 0))),
    total_prep_time_minutes: Math.max(0, Number(value.total_prep_time_minutes ?? 0)),
  };
};

const buildAlerts = (input: {
  deal: DealRow;
  stage_alert: "OK" | "WARNING" | "CRITICAL";
  liquidation: ReturnType<typeof computeLiquidation>;
  postmortem: ReturnType<typeof computePostmortem>;
  estimated_inputs: string[];
  data_confidence: number;
}): OperatorAlert[] => {
  const alerts: OperatorAlert[] = [];

  if (input.liquidation.force_liquidation) {
    alerts.push({
      code: "FORCE_LIQUIDATION",
      severity: "critical",
      message: "Liquidation trigger is active for this deal.",
    });
  }
  if (input.stage_alert === "CRITICAL") {
    alerts.push({
      code: "STAGE_CRITICAL",
      severity: "critical",
      message: "Deal is in a critical stage-aging state.",
    });
  }
  if (
    TITLE_DELAY_CATEGORIES.has(input.deal.category) &&
    (input.deal.status === "acquired" || input.deal.status === "prep" || input.deal.status === "listed") &&
    input.deal.purchase_date
  ) {
    const purchaseTs = Date.parse(input.deal.purchase_date);
    if (Number.isFinite(purchaseTs)) {
      const daysSincePurchase = (Date.now() - purchaseTs) / (1000 * 60 * 60 * 24);
      if (daysSincePurchase > TITLE_DELAY_DAYS) {
        alerts.push({
          code: "TITLE_DELAY",
          severity: "warning",
          message: "Deal may be delayed by title/registration timeline.",
        });
      }
    }
  }
  if (input.postmortem.profit_drift_flag === "HIGH_NEGATIVE") {
    alerts.push({
      code: "PROFIT_DRIFT_HIGH",
      severity: "critical",
      message: "Postmortem shows high negative profit drift.",
    });
  }
  if (input.postmortem.cost_overrun_flag) {
    alerts.push({
      code: "COST_OVERRUN",
      severity: "warning",
      message: "Actual cost basis materially exceeded projected baseline.",
    });
  }
  if (
    (input.postmortem.profit_drift_flag === "HIGH_NEGATIVE" ||
      input.postmortem.profit_drift_flag === "NEGATIVE") &&
    input.estimated_inputs.length >= 2
  ) {
    alerts.push({
      code: "ESTIMATION_FAILURE",
      severity: "warning",
      message: "Multiple estimated inputs likely contributed to drift.",
    });
  }
  if (input.deal.status === "completed" && input.postmortem.postmortem_incomplete) {
    alerts.push({
      code: "POSTMORTEM_INCOMPLETE",
      severity: "warning",
      message: "Completed deal is missing required data for full postmortem.",
    });
  }
  if (input.data_confidence <= LOW_DATA_CONFIDENCE_THRESHOLD) {
    alerts.push({
      code: "LOW_DATA_CONFIDENCE",
      severity: "warning",
      message: "Data confidence is below the operator threshold.",
    });
  }

  return alerts;
};

const buildWarnings = (
  category: DealCategory,
  transportType: MetadataRow["transport_type"],
  sourceQualityFlag: "LOW_QUALITY_SOURCE" | null,
  alerts: OperatorAlert[],
  sellerType: DealRow["seller_type"]
): string[] => {
  const warnings: string[] = [];
  if (sellerType === "unknown") {
    warnings.push("UNKNOWN_SELLER_TYPE");
  }
  if (sellerType === "commercial") {
    warnings.push("REVIEW_MARGIN");
  }
  if (category === "electronics_bulk" && transportType === "parcel") {
    warnings.push(
      "Potential transport mismatch: electronics_bulk usually fits local_pickup or freight."
    );
  }
  if (sourceQualityFlag) {
    warnings.push(sourceQualityFlag);
  }
  for (const alert of alerts) {
    warnings.push(alert.code);
  }
  return Array.from(new Set(warnings));
};

const normalizeOptionalCount = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = Math.max(0, Math.floor(Number(value)));
  return normalized > 0 ? normalized : null;
};

const buildOperatorRecommendationSummary = (input: {
  status: DealStatus;
  recommended_action: EngineRecommendedAction;
  projected_profit: number;
  scoring: ReturnType<typeof computeScoring>;
  liquidation: ReturnType<typeof computeLiquidation>;
  data_confidence: number;
  postmortem: ReturnType<typeof computePostmortem>;
}): string => {
  const actionText = input.recommended_action ?? "completed";
  const reasons: string[] = [];
  if (input.liquidation.force_liquidation) {
    reasons.push("Liquidation trigger is active due to category/stage thresholds.");
  }
  if (input.status !== "completed" && input.projected_profit < 0) {
    reasons.push("Projected profit is negative.");
  }
  if (input.scoring.acquisition_score < 40 || input.scoring.exit_score < 40) {
    reasons.push("Acquisition/exit scoring is weak.");
  }
  if (input.data_confidence <= LOW_DATA_CONFIDENCE_THRESHOLD) {
    reasons.push("Data confidence is low, so operator review is recommended.");
  }
  if (input.postmortem.profit_drift_flag === "HIGH_NEGATIVE") {
    reasons.push("Postmortem indicates high negative profit drift.");
  }
  if (input.status === "completed" && input.postmortem.postmortem_incomplete) {
    reasons.push("Postmortem is incomplete due to missing settlement context.");
  }
  if (reasons.length === 0) {
    reasons.push("No major operator risks detected.");
  }
  return `Action: ${actionText}. ${reasons.join(" ")}`;
};

const clampConfidence = (value: number): number => {
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return Math.round(value);
};

const buildAiRecommendation = (input: {
  projected_profit: number;
  data_confidence: number;
  alerts: OperatorAlert[];
  recommended_action: EngineRecommendedAction;
}): AiRecommendation => {
  let suggestedAction: AiRecommendation["suggested_action"] = "investigate";
  if (input.recommended_action === "pass") {
    suggestedAction = "buy";
  } else if (
    input.recommended_action === "do_not_acquire" ||
    input.recommended_action === "liquidate_now" ||
    input.recommended_action === "reduce_price"
  ) {
    suggestedAction = "pass";
  }

  const criticalAlerts = input.alerts.filter((alert) => alert.severity === "critical").length;
  const warningAlerts = input.alerts.filter((alert) => alert.severity === "warning").length;
  let confidence = input.data_confidence;
  confidence -= criticalAlerts * 20;
  confidence -= warningAlerts * 8;
  if (input.projected_profit < 0) {
    confidence -= 15;
  } else if (input.projected_profit > 0) {
    confidence += 5;
  }

  const keyFactors: string[] = [
    `Projected profit: ${input.projected_profit.toFixed(2)}`,
    `Data confidence: ${input.data_confidence}`,
  ];
  if (criticalAlerts > 0 || warningAlerts > 0) {
    keyFactors.push(
      `Alerts: ${input.alerts.map((alert) => alert.code).join(", ")}`
    );
  } else {
    keyFactors.push("Alerts: none");
  }
  keyFactors.push(
    `Engine action basis: ${input.recommended_action ?? "completed"}`
  );

  const reasoning = `Suggested ${suggestedAction} based on projected profit, operator alerts, and data confidence from existing engine outputs.`;

  return {
    suggested_action: suggestedAction,
    confidence: clampConfidence(confidence),
    reasoning,
    key_factors: keyFactors,
  };
};

export interface EnrichDealInput {
  deal: DealRow;
  financials: FinancialRow;
  metadata: MetadataRow;
  operator_decision_history?: EnrichedDeal["operator_decision_history"];
}

export const enrichDeal = ({
  deal,
  financials,
  metadata,
  operator_decision_history = [],
}: EnrichDealInput): EnrichedDeal => {
  const normalizedPrepMetrics = normalizePrepMetrics(deal.prep_metrics ?? null);
  const normalizedUnitCount = normalizeOptionalCount(deal.unit_count ?? null);

  const costBasis = computeCostBasis({
    acquisition_cost: financials.acquisition_cost,
    source_platform: deal.source_platform,
    acquisition_state: deal.acquisition_state,
    buyer_premium_pct: financials.buyer_premium_pct,
    buyer_premium_overridden: financials.buyer_premium_overridden,
    tax_rate: financials.tax_rate,
    transport_type: metadata.transport_type,
    transport_cost_actual: financials.transport_cost_actual,
    transport_cost_estimated: financials.transport_cost_estimated,
    repair_cost: financials.repair_cost,
    prep_cost: financials.prep_cost,
    category: deal.category,
  });

  const profit = computeProfit({
    category: deal.category,
    source_platform: deal.source_platform,
    status: deal.status as DealStatus,
    estimated_market_value: financials.estimated_market_value,
    sale_price_actual: financials.sale_price_actual,
    total_cost_basis: costBasis.total_cost_basis,
  });

  const aging = computeAging(deal.stage_updated_at, deal.status);
  const liquidation = computeLiquidation(deal.category, aging.days_in_current_stage);
  const dataConfidence = computeDataConfidence({
    estimated_inputs: costBasis.estimated_inputs,
    repair_cost: financials.repair_cost,
    condition_grade: metadata.condition_grade,
    condition_notes: metadata.condition_notes,
  });
  const execution = calculateExecutionMetrics(normalizedPrepMetrics, normalizedUnitCount);
  const postmortem = computePostmortem({
    projected_profit: profit.projected_profit,
    realized_profit: profit.realized_profit,
    total_cost_basis: costBasis.total_cost_basis,
    conservative_revenue_projection: profit.breakdown.conservative_revenue_projection,
    estimated_inputs: costBasis.estimated_inputs,
    cost_basis_breakdown: costBasis.cost_basis_breakdown,
    transport_cost_actual: financials.transport_cost_actual,
    transport_cost_estimated: financials.transport_cost_estimated,
    sale_price_actual: financials.sale_price_actual,
    return_rate_buffer: profit.breakdown.return_rate_buffer,
  });
  const shouldReduceConfidenceForDrift =
    postmortem.profit_drift_flag === "HIGH_NEGATIVE" && costBasis.estimated_inputs.length >= 2;
  const adjustedDataConfidence = shouldReduceConfidenceForDrift
    ? Math.max(0, dataConfidence - 15)
    : dataConfidence;

  const scoring = computeScoring({
    category: deal.category,
    condition_grade: metadata.condition_grade,
    projected_profit: profit.projected_profit,
    realized_profit: profit.realized_profit,
    status: deal.status,
    total_cost_basis: costBasis.total_cost_basis,
    force_liquidation: liquidation.force_liquidation,
  });

  const weakScores = scoring.acquisition_score < 40 || scoring.exit_score < 40;
  const recommendedAction: EngineRecommendedAction =
    deal.status === "completed"
      ? null
      : liquidation.force_liquidation
        ? "liquidate_now"
        : profit.projected_profit < 0 && deal.status === "sourced"
          ? "do_not_acquire"
          : profit.projected_profit < 0
            ? "reduce_price"
            : weakScores
              ? "review_only"
              : "pass";
  const stageAlert: EnrichedDeal["calculations"]["stage_alert"] = liquidation.force_liquidation
    ? "CRITICAL"
    : aging.stage_alert;
  const alerts = buildAlerts({
    deal,
    stage_alert: stageAlert,
    liquidation,
    postmortem,
    estimated_inputs: costBasis.estimated_inputs,
    data_confidence: adjustedDataConfidence,
  });
  const warnings = buildWarnings(
    deal.category,
    metadata.transport_type,
    execution.source_quality_flag,
    alerts,
    deal.seller_type
  );
  const operatorRecommendation = buildOperatorRecommendationSummary({
    status: deal.status,
    recommended_action: recommendedAction,
    projected_profit: profit.projected_profit,
    scoring,
    liquidation,
    data_confidence: adjustedDataConfidence,
    postmortem,
  });
  const aiRecommendation = buildAiRecommendation({
    projected_profit: profit.projected_profit,
    data_confidence: adjustedDataConfidence,
    alerts,
    recommended_action: recommendedAction,
  });

  return {
    deal: {
      ...deal,
      unit_count: normalizedPrepMetrics ? null : normalizedUnitCount,
      prep_metrics: normalizedPrepMetrics,
    },
    financials: {
      ...financials,
      buyer_premium_pct: costBasis.buyer_premium_pct,
      buyer_premium_overridden: costBasis.buyer_premium_overridden,
      tax_rate: costBasis.tax_rate,
      tax: costBasis.tax,
      projected_profit: profit.projected_profit,
      realized_profit: profit.realized_profit,
    },
    metadata,
    calculations: {
      total_cost_basis: costBasis.total_cost_basis,
      projected_profit: profit.projected_profit,
      realized_profit: profit.realized_profit,
      days_in_stage: aging.days_in_current_stage,
      days_in_current_stage: aging.days_in_current_stage,
      stage_alert: stageAlert,
      data_confidence: adjustedDataConfidence,
      avg_time_per_unit: execution.avg_time_per_unit,
      efficiency_score: execution.efficiency_score,
      efficiency_rating: execution.efficiency_rating,
      locked_ratio: execution.locked_ratio,
      source_quality_flag: execution.source_quality_flag,
    },
    engine: {
      cost_basis: costBasis,
      profit,
      scoring,
      aging,
      liquidation,
      data_confidence: adjustedDataConfidence,
      postmortem,
      recommended_action: recommendedAction,
    },
    ai_recommendation: aiRecommendation,
    operator_decision_history,
    alerts,
    warnings,
    operator_recommendation: operatorRecommendation,
    assistant_context: {
      current_deal: {
        deal: {
          ...deal,
          unit_count: normalizedPrepMetrics ? null : normalizedUnitCount,
          prep_metrics: normalizedPrepMetrics,
        },
        financials: {
          ...financials,
          buyer_premium_pct: costBasis.buyer_premium_pct,
          buyer_premium_overridden: costBasis.buyer_premium_overridden,
          tax_rate: costBasis.tax_rate,
          tax: costBasis.tax,
          projected_profit: profit.projected_profit,
          realized_profit: profit.realized_profit,
        },
        metadata,
      },
      calculations: {
        total_cost_basis: costBasis.total_cost_basis,
        projected_profit: profit.projected_profit,
        realized_profit: profit.realized_profit,
        days_in_stage: aging.days_in_current_stage,
        days_in_current_stage: aging.days_in_current_stage,
        stage_alert: stageAlert,
        data_confidence: adjustedDataConfidence,
        avg_time_per_unit: execution.avg_time_per_unit,
        efficiency_score: execution.efficiency_score,
        efficiency_rating: execution.efficiency_rating,
        locked_ratio: execution.locked_ratio,
        source_quality_flag: execution.source_quality_flag,
      },
      engine: {
        cost_basis: costBasis,
        profit,
        scoring,
        aging,
        liquidation,
        data_confidence: adjustedDataConfidence,
        postmortem,
        recommended_action: recommendedAction,
      },
      warnings,
      postmortem,
      recommendation_summary: operatorRecommendation,
      ai_recommendation: aiRecommendation,
      operator_decision_history,
    },
  };
};

