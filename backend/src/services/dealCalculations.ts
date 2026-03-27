import {
  PREP_EFFICIENCY_THRESHOLDS,
  SOURCE_QUALITY_THRESHOLDS,
} from "../config/executionThresholds";
import type { PrepMetrics } from "../models/dealV32";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const toNumber = (value: number | null): number => (value === null ? 0 : value);

export type EfficiencyRating = "GOOD" | "WARNING" | "BAD";
export type SourceQualityFlag = "LOW_QUALITY_SOURCE";

export const getEfficiencyRating = (
  efficiencyScore: number | null
): EfficiencyRating | null => {
  if (efficiencyScore === null) {
    return null;
  }
  if (efficiencyScore < PREP_EFFICIENCY_THRESHOLDS.good) {
    return "GOOD";
  }
  if (efficiencyScore <= PREP_EFFICIENCY_THRESHOLDS.warning) {
    return "WARNING";
  }
  return "BAD";
};

export const calculateEfficiency = (
  prepMetrics: Pick<PrepMetrics, "total_units" | "total_prep_time_minutes"> | null | undefined
): { efficiency_score: number | null; rating: EfficiencyRating | null } => {
  if (!prepMetrics || prepMetrics.total_units <= 0) {
    return { efficiency_score: null, rating: null };
  }

  const score =
    Math.round(
      ((prepMetrics.total_prep_time_minutes / prepMetrics.total_units) + Number.EPSILON) * 100
    ) / 100;
  return {
    efficiency_score: score,
    rating: getEfficiencyRating(score),
  };
};

export const isLowQualitySource = (
  prepMetrics: Pick<PrepMetrics, "total_units" | "locked_units"> | null | undefined
): boolean => {
  if (!prepMetrics || prepMetrics.total_units <= 0) {
    return false;
  }
  return (
    prepMetrics.locked_units / prepMetrics.total_units >
    SOURCE_QUALITY_THRESHOLDS.locked_ratio_alert
  );
};

const roundRatio = (value: number): number =>
  Math.round((value + Number.EPSILON) * 10000) / 10000;

const normalizeUnitCount = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = Math.max(0, Math.floor(Number(value)));
  return normalized > 0 ? normalized : null;
};

export interface ExecutionMetrics {
  avg_time_per_unit: number | null;
  efficiency_score: number | null;
  efficiency_rating: EfficiencyRating | null;
  locked_ratio: number | null;
  source_quality_flag: SourceQualityFlag | null;
}

export const calculateExecutionMetrics = (
  prepMetrics: PrepMetrics | null | undefined,
  unitCount: number | null | undefined
): ExecutionMetrics => {
  // V3.3 unit rule: when prep_metrics exists, unit_count is ignored.
  const fallbackUnitCount = prepMetrics ? null : normalizeUnitCount(unitCount);

  if (prepMetrics && prepMetrics.total_units > 0) {
    const avgTimePerUnit = roundCurrency(
      prepMetrics.total_prep_time_minutes / prepMetrics.total_units
    );
    const lockedRatio = roundRatio(prepMetrics.locked_units / prepMetrics.total_units);

    return {
      avg_time_per_unit: avgTimePerUnit,
      efficiency_score: avgTimePerUnit,
      efficiency_rating: getEfficiencyRating(avgTimePerUnit),
      locked_ratio: lockedRatio,
      source_quality_flag:
        lockedRatio > SOURCE_QUALITY_THRESHOLDS.locked_ratio_alert
          ? "LOW_QUALITY_SOURCE"
          : null,
    };
  }

  if (fallbackUnitCount !== null) {
    return {
      avg_time_per_unit: null,
      efficiency_score: null,
      efficiency_rating: null,
      locked_ratio: null,
      source_quality_flag: null,
    };
  }

  return {
    avg_time_per_unit: null,
    efficiency_score: null,
    efficiency_rating: null,
    locked_ratio: null,
    source_quality_flag: null,
  };
};

// Legacy helper module now only contains execution protocol utilities.
