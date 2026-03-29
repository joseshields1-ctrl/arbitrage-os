import type { ConditionGrade, DealCategory, DealStatus } from "../../models/dealV32";
import {
  CONDITION_MULTIPLIER,
  DEFECTIVE_REVIEW_BIAS,
  DEMAND_SIGNAL_WEIGHTS,
  DEMAND_WEIGHT_BY_CATEGORY,
} from "../../config/scoringConfig";

export type DealClassification =
  | "LIKELY WIN"
  | "WORTH REVIEW"
  | "MARGINAL"
  | "PASS"
  | "BEST WIN"
  | "ACCEPTABLE WIN"
  | "BAD DEAL";

export interface ScoringInput {
  category: DealCategory;
  condition_grade: ConditionGrade;
  projected_profit: number;
  realized_profit?: number | null;
  status?: DealStatus;
  total_cost_basis: number;
  watchers_count?: number | null;
  bids_count?: number | null;
  inquiries_weak_intent_count?: number | null;
  inquiries_strong_intent_count?: number | null;
  force_liquidation?: boolean;
}

export interface ScoringResult {
  acquisition_score: number;
  exit_score: number;
  classification: DealClassification;
  defective_review_bias: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const roundScore = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const toCount = (value: number | null | undefined): number => {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count)) {
    return 0;
  }
  return Math.max(0, count);
};

const classify = (acquisitionScore: number, exitScore: number): DealClassification => {
  const avg = (acquisitionScore + exitScore) / 2;
  if (avg >= 75) return "LIKELY WIN";
  if (avg >= 55) return "WORTH REVIEW";
  if (avg >= 40) return "MARGINAL";
  return "PASS";
};

const classifyHistorical = (
  realizedProfit: number | null | undefined,
  totalCostBasis: number
): DealClassification => {
  if (realizedProfit === null || realizedProfit === undefined) {
    return "MARGINAL";
  }
  const roi = totalCostBasis > 0 ? realizedProfit / totalCostBasis : 0;
  if (roi >= 0.2) return "BEST WIN";
  if (roi >= 0.05) return "ACCEPTABLE WIN";
  if (roi >= 0) return "MARGINAL";
  return "BAD DEAL";
};

export const computeScoring = (input: ScoringInput): ScoringResult => {
  if (input.force_liquidation) {
    const acquisitionScore = 0;
    const exitScore = 0;
    const classification = input.status === "completed" ? "BAD DEAL" : "PASS";
    return {
      acquisition_score: roundScore(acquisitionScore),
      exit_score: roundScore(exitScore),
      classification,
      defective_review_bias: 0,
    };
  }

  const demandWeight = DEMAND_WEIGHT_BY_CATEGORY[input.category];
  const watcherSignal = toCount(input.watchers_count) * DEMAND_SIGNAL_WEIGHTS.watchers;
  const bidsSignal = toCount(input.bids_count) * DEMAND_SIGNAL_WEIGHTS.bids;
  const weakInquirySignal =
    toCount(input.inquiries_weak_intent_count) * DEMAND_SIGNAL_WEIGHTS.inquiries.weak_intent;
  const strongInquirySignal =
    toCount(input.inquiries_strong_intent_count) * DEMAND_SIGNAL_WEIGHTS.inquiries.strong_intent;
  const totalSignal = watcherSignal + bidsSignal + weakInquirySignal + strongInquirySignal;
  const normalizedSignal = clamp(totalSignal / 10, 0, 1);
  const blendedDemand = clamp(demandWeight * 0.7 + normalizedSignal * 0.3, 0, 1);
  const conditionMultiplier = CONDITION_MULTIPLIER[input.condition_grade];
  const defectiveReviewBias =
    input.condition_grade === "defective"
      ? DEFECTIVE_REVIEW_BIAS.defective
      : input.condition_grade === "parts_only"
        ? DEFECTIVE_REVIEW_BIAS.parts_only
        : 0;

  const roiRaw =
    input.total_cost_basis > 0 ? input.projected_profit / input.total_cost_basis : 0;
  const roiScore = clamp(50 + roiRaw * 100, 0, 100);

  const acquisitionScore = clamp(
    roiScore * 0.5 + blendedDemand * 100 * 0.3 + conditionMultiplier * 100 * 0.2,
    0,
    100
  );

  const exitScore = clamp(
    blendedDemand * 100 * 0.45 +
      conditionMultiplier * 100 * 0.45 -
      defectiveReviewBias * 100 * 0.1,
    0,
    100
  );

  const baseClassification = classify(acquisitionScore, exitScore);
  const classification =
    input.status === "completed"
      ? classifyHistorical(input.realized_profit ?? null, input.total_cost_basis)
      : baseClassification;

  return {
    acquisition_score: roundScore(acquisitionScore),
    exit_score: roundScore(exitScore),
    classification,
    defective_review_bias: roundScore(defectiveReviewBias),
  };
};

