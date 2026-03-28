import type { ConditionGrade, DealCategory } from "../../models/dealV32";
import {
  CONDITION_MULTIPLIER,
  DEFECTIVE_REVIEW_BIAS,
  DEMAND_SIGNAL_WEIGHTS,
  DEMAND_WEIGHT_BY_CATEGORY,
} from "../../config/scoringConfig";

export type DealClassification = "STRONG" | "MODERATE" | "WEAK";

export interface ScoringInput {
  category: DealCategory;
  condition_grade: ConditionGrade;
  projected_profit: number;
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
  if (avg >= 75) {
    return "STRONG";
  }
  if (avg >= 50) {
    return "MODERATE";
  }
  return "WEAK";
};

export const computeScoring = (input: ScoringInput): ScoringResult => {
  if (input.force_liquidation) {
    const acquisitionScore = 0;
    const exitScore = 0;
    return {
      acquisition_score: roundScore(acquisitionScore),
      exit_score: roundScore(exitScore),
      classification: classify(acquisitionScore, exitScore),
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

  return {
    acquisition_score: roundScore(acquisitionScore),
    exit_score: roundScore(exitScore),
    classification: classify(acquisitionScore, exitScore),
    defective_review_bias: roundScore(defectiveReviewBias),
  };
};

