import type { DealView, ReconditioningRecord } from "../types";

const RECON_STORAGE_KEY = "arbitrage_os_reconditioning_v1";
const DAY_MS = 24 * 60 * 60 * 1000;

export type TimeDisciplineState =
  | "recon_window"
  | "recon_delay"
  | "sales_window"
  | "sales_delay"
  | "urgent_attention"
  | "unknown";

export interface TimeDisciplineSnapshot {
  days_since_arrival: number | null;
  state: TimeDisciplineState;
  label: string;
  warning: string | null;
  effective_urgent_threshold_days: number;
}

export interface ReconditioningSummary {
  total_recon_cost: number;
  profit_after_recon: number;
  status: ReconditioningRecord["status"];
}

export const createEmptyReconditioningRecord = (
  arrivalDate: string | null = null
): ReconditioningRecord => ({
  arrival_date: arrivalDate,
  extension_days: 0,
  status: "not_started",
  entries: [],
});

export const normalizeReconditioning = (
  input?: ReconditioningRecord | null
): ReconditioningRecord => ({
  arrival_date: input?.arrival_date ?? null,
  extension_days: input?.extension_days === 14 ? 14 : 0,
  status: input?.status ?? "not_started",
  entries: Array.isArray(input?.entries)
    ? input.entries.filter(
        (entry) =>
          typeof entry.id === "string" &&
          typeof entry.category === "string" &&
          typeof entry.description === "string" &&
          Number.isFinite(entry.cost) &&
          typeof entry.date === "string" &&
          typeof entry.paid_by === "string"
      )
    : [],
});

export const loadReconditioningMap = (): Record<string, ReconditioningRecord> => {
  try {
    const raw = localStorage.getItem(RECON_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, ReconditioningRecord>;
    const normalized: Record<string, ReconditioningRecord> = {};
    Object.entries(parsed).forEach(([dealId, record]) => {
      normalized[dealId] = normalizeReconditioning(record);
    });
    return normalized;
  } catch {
    return {};
  }
};

export const saveReconditioningMap = (map: Record<string, ReconditioningRecord>): void => {
  localStorage.setItem(RECON_STORAGE_KEY, JSON.stringify(map));
};

export const inferReconditioningForDeal = (
  deal: DealView,
  map?: Record<string, ReconditioningRecord>
): ReconditioningRecord => {
  const fromMap = map?.[deal.deal.id];
  const fallbackArrival =
    deal.deal.purchase_date ?? deal.deal.discovered_date ?? deal.deal.stage_updated_at;
  return normalizeReconditioning(fromMap ?? createEmptyReconditioningRecord(fallbackArrival));
};

export const computeReconTotal = (record: ReconditioningRecord): number =>
  record.entries.reduce((sum, entry) => sum + entry.cost, 0);

export const computeProfitAfterRecon = (deal: DealView, totalReconCost: number): number => {
  const baseProfit =
    deal.deal.status === "completed"
      ? deal.calculations.realized_profit ?? 0
      : deal.calculations.projected_profit;
  return baseProfit - totalReconCost;
};

export const computeReconditioningSummary = (
  deal: DealView,
  record: ReconditioningRecord
): ReconditioningSummary => {
  const total = computeReconTotal(record);
  return {
    total_recon_cost: total,
    profit_after_recon: computeProfitAfterRecon(deal, total),
    status: record.status,
  };
};

export const computeTimeDiscipline = (
  deal: DealView,
  record: ReconditioningRecord
): TimeDisciplineSnapshot => {
  const arrivalTimestamp = record.arrival_date ? Date.parse(record.arrival_date) : Number.NaN;
  const daysSinceArrival = Number.isFinite(arrivalTimestamp)
    ? Math.max(0, Math.floor((Date.now() - arrivalTimestamp) / DAY_MS))
    : null;

  if (daysSinceArrival === null) {
    return {
      days_since_arrival: null,
      state: "unknown",
      label: "Arrival date missing",
      warning: "Arrival date is required to enforce recon/sales discipline.",
      effective_urgent_threshold_days: 14 + record.extension_days,
    };
  }

  const urgentThreshold = 14 + record.extension_days;
  const isMarketReady = ["listed", "sold", "completed"].includes(deal.deal.status);

  if (daysSinceArrival <= 7) {
    return {
      days_since_arrival: daysSinceArrival,
      state: "recon_window",
      label: "Recon window (0-7 days)",
      warning: null,
      effective_urgent_threshold_days: urgentThreshold,
    };
  }

  if (daysSinceArrival > 7 && record.status !== "completed") {
    return {
      days_since_arrival: daysSinceArrival,
      state: "recon_delay",
      label: "Recon delay (>7 days)",
      warning: "Recon delay detected. Unit has crossed 7 days without completed recon.",
      effective_urgent_threshold_days: urgentThreshold,
    };
  }

  if (daysSinceArrival <= 14) {
    if (isMarketReady) {
      return {
        days_since_arrival: daysSinceArrival,
        state: "sales_window",
        label: "Sales window (7-14 days)",
        warning: null,
        effective_urgent_threshold_days: urgentThreshold,
      };
    }
    return {
      days_since_arrival: daysSinceArrival,
      state: "sales_delay",
      label: "Sales delay (7-14 days)",
      warning: "Vehicle is in sales window but not listed/sold yet.",
      effective_urgent_threshold_days: urgentThreshold,
    };
  }

  if (daysSinceArrival > urgentThreshold && deal.deal.status !== "completed") {
    return {
      days_since_arrival: daysSinceArrival,
      state: "urgent_attention",
      label: "URGENT ATTENTION REQUIRED",
      warning: `Vehicle is past ${urgentThreshold} days since arrival. Escalate now.`,
      effective_urgent_threshold_days: urgentThreshold,
    };
  }

  return {
    days_since_arrival: daysSinceArrival,
    state: "sales_delay",
    label: "Sales delay",
    warning: "Vehicle has not exited in expected time window.",
    effective_urgent_threshold_days: urgentThreshold,
  };
};

