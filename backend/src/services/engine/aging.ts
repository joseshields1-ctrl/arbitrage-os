import { STAGE_ALERT_DAYS } from "../../config/agingConfig";
import type { DealStatus } from "../../models/dealV32";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface AgingResult {
  days_in_current_stage: number;
  stage_alert: boolean;
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

  return {
    days_in_current_stage: days,
    stage_alert: days >= threshold,
  };
};

