import { STAGE_ALERT_DAYS } from "../../config/agingConfig";
import type { DealStatus } from "../../models/dealV32";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface AgingResult {
  days_in_current_stage: number;
  stage_alert: "OK" | "WARNING" | "CRITICAL";
}

export const computeDaysInCurrentStage = (stageUpdatedAt: string): number => {
  const updatedAtMs = new Date(stageUpdatedAt).getTime();
  const nowMs = Date.now();
  const diffMs = Math.max(0, nowMs - updatedAtMs);
  return Math.floor(diffMs / MS_PER_DAY);
};

export const computeAging = (
  stageUpdatedAt: string,
  status: DealStatus
): AgingResult => {
  const days = computeDaysInCurrentStage(stageUpdatedAt);
  const threshold = STAGE_ALERT_DAYS[status];
  const warningThreshold = Number.isFinite(threshold) ? threshold : Number.POSITIVE_INFINITY;
  const criticalThreshold =
    Number.isFinite(threshold) && threshold > 0 ? threshold * 2 : Number.POSITIVE_INFINITY;

  const stageAlert: AgingResult["stage_alert"] =
    days >= criticalThreshold ? "CRITICAL" : days >= warningThreshold ? "WARNING" : "OK";

  return {
    days_in_current_stage: days,
    stage_alert: stageAlert,
  };
};

