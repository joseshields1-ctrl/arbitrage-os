import type { DealStatus } from "../models/dealV32";

export const STAGE_ALERT_DAYS: Record<DealStatus, number> = {
  sourced: 7,
  acquired: 10,
  prep: 14,
  listed: 21,
  sold: 7,
  completed: Number.POSITIVE_INFINITY,
};

