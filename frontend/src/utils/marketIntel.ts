import type { CompConfidence, DealView, ManualCompEntry, VehicleMarketIntel } from "../types";

const MARKET_INTEL_STORAGE_KEY = "arbitrage_os_market_intel_v1";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface MarketIntelSummary {
  manualCompAverage: number | null;
  outlierIds: Set<string>;
  blendedValue: number | null;
  compConfidence: CompConfidence;
  freshestCompDays: number | null;
}

export const createEmptyVehicleIntel = (): VehicleMarketIntel => ({
  kbb_value: null,
  nada_value: null,
  carfax_status: null,
  manual_comps: [],
});

export const normalizeVehicleIntel = (intel?: VehicleMarketIntel | null): VehicleMarketIntel => ({
  kbb_value: intel?.kbb_value ?? null,
  nada_value: intel?.nada_value ?? null,
  carfax_status: intel?.carfax_status ?? null,
  manual_comps: Array.isArray(intel?.manual_comps) ? intel.manual_comps : [],
});

const safeDateDaysAgo = (dateIso: string): number | null => {
  const timestamp = Date.parse(dateIso);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - timestamp) / DAY_MS));
};

const median = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

export const detectOutlierIds = (comps: ManualCompEntry[]): Set<string> => {
  if (comps.length < 3) {
    return new Set<string>();
  }
  const prices = comps.map((comp) => comp.price).filter((price) => Number.isFinite(price) && price > 0);
  const center = median(prices);
  if (center === null || center <= 0) {
    return new Set<string>();
  }
  const outlierIds = new Set<string>();
  comps.forEach((comp) => {
    const deviation = Math.abs(comp.price - center) / center;
    if (deviation > 0.25) {
      outlierIds.add(comp.id);
    }
  });
  return outlierIds;
};

export const computeCompConfidence = (comps: ManualCompEntry[]): CompConfidence => {
  const ages = comps
    .map((comp) => safeDateDaysAgo(comp.date))
    .filter((days): days is number => days !== null);
  if (ages.length === 0) {
    return "MANUAL_REVIEW_REQUIRED";
  }
  const freshest = Math.min(...ages);
  if (freshest <= 14) {
    return "HIGH";
  }
  if (freshest <= 30) {
    return "MEDIUM";
  }
  if (freshest <= 60) {
    return "LOW";
  }
  return "MANUAL_REVIEW_REQUIRED";
};

export const computeManualCompAverage = (comps: ManualCompEntry[]): number | null => {
  const outlierIds = detectOutlierIds(comps);
  const values = comps
    .filter((comp) => !outlierIds.has(comp.id))
    .map((comp) => comp.price)
    .filter((price) => Number.isFinite(price) && price > 0);
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const isOutlierPrice = (price: number, comps: ManualCompEntry[]): boolean => {
  const outlierIds = detectOutlierIds(comps);
  return comps.some((comp) => comp.price === price && outlierIds.has(comp.id));
};

export const computeBlendedMarketValue = (
  intel: VehicleMarketIntel,
  fallbackValue?: number
): number | null => {
  const manualAverage = computeManualCompAverage(intel.manual_comps);
  const sources = [intel.kbb_value, intel.nada_value, manualAverage, fallbackValue ?? null].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
  );
  if (sources.length === 0) {
    return null;
  }
  return sources.reduce((sum, value) => sum + value, 0) / sources.length;
};

export const computeMarketIntelSummary = (intel: VehicleMarketIntel): MarketIntelSummary => {
  const normalized = normalizeVehicleIntel(intel);
  const outlierIds = detectOutlierIds(normalized.manual_comps);
  const manualCompAverage = computeManualCompAverage(normalized.manual_comps);
  const blendedValue = computeBlendedMarketValue(normalized);
  const compConfidence = computeCompConfidence(normalized.manual_comps);
  const freshestCompDays =
    normalized.manual_comps
      .map((comp) => safeDateDaysAgo(comp.date))
      .filter((days): days is number => days !== null)
      .sort((a, b) => a - b)[0] ?? null;
  return {
    manualCompAverage,
    outlierIds,
    blendedValue,
    compConfidence,
    freshestCompDays,
  };
};

export const buildMarketLinks = (title: string): {
  ebaySold: string;
  ebayActive: string;
  facebookSearch: string;
  craigslistSearch: string;
} => {
  const query = encodeURIComponent(title.trim() || "auction listing");
  return {
    ebaySold: `https://www.ebay.com/sch/i.html?_nkw=${query}&LH_Sold=1&LH_Complete=1`,
    ebayActive: `https://www.ebay.com/sch/i.html?_nkw=${query}`,
    facebookSearch: `https://www.facebook.com/marketplace/search/?query=${query}`,
    craigslistSearch: `https://www.craigslist.org/search/sss?query=${query}`,
  };
};

export const loadMarketIntelMap = (): Record<string, VehicleMarketIntel> => {
  try {
    const raw = localStorage.getItem(MARKET_INTEL_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, VehicleMarketIntel>;
    const result: Record<string, VehicleMarketIntel> = {};
    Object.entries(parsed).forEach(([dealId, intel]) => {
      result[dealId] = normalizeVehicleIntel(intel);
    });
    return result;
  } catch {
    return {};
  }
};

export const saveMarketIntelMap = (map: Record<string, VehicleMarketIntel>): void => {
  localStorage.setItem(MARKET_INTEL_STORAGE_KEY, JSON.stringify(map));
};

export const inferVehicleMarketIntel = (
  deal: DealView,
  map?: Record<string, VehicleMarketIntel>
): VehicleMarketIntel => {
  const fromMap = map?.[deal.deal.id];
  return normalizeVehicleIntel(fromMap ?? deal.deal.market_intel ?? null);
};

export const computeRiskFlags = (deal: DealView): string[] => {
  const flags: string[] = [];
  const notes = deal.metadata.condition_notes.toLowerCase();
  if (notes.includes("missing key")) {
    flags.push("Missing key");
  }
  if (deal.metadata.title_status !== "on_site" || (deal.warnings ?? []).includes("TITLE_DELAY")) {
    flags.push("Title delay");
  }
  if (
    deal.deal.status === "listed" &&
    deal.calculations.days_in_current_stage > 30
  ) {
    flags.push("Relisted asset");
  }
  if (["defective", "parts_only", "used_functional"].includes(deal.metadata.condition_grade)) {
    flags.push("Mechanical uncertainty");
  }
  return flags;
};

export const calculateRoiPct = (profit: number | null, costBasis: number): number => {
  if (profit === null || !Number.isFinite(costBasis) || costBasis <= 0) {
    return 0;
  }
  return (profit / costBasis) * 100;
};

export const computeDaysToCashBack = (deal: DealView): number => {
  const start =
    deal.deal.purchase_date ?? deal.deal.discovered_date ?? deal.deal.stage_updated_at;
  const end =
    deal.deal.completion_date ?? deal.deal.sale_date ?? deal.deal.stage_updated_at;
  const startTs = Date.parse(start);
  const endTs = Date.parse(end);
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
    return deal.calculations.days_in_current_stage;
  }
  return Math.max(0, Math.floor((endTs - startTs) / DAY_MS));
};

export const getCapitalVelocityLabel = (daysToCashBack: number): "Fast" | "Medium" | "Slow" => {
  if (daysToCashBack <= 14) {
    return "Fast";
  }
  if (daysToCashBack <= 35) {
    return "Medium";
  }
  return "Slow";
};

export const computeEffectiveHourlyRate = (deal: DealView): number | null => {
  const prepMinutes = deal.deal.prep_metrics?.total_prep_time_minutes ?? 0;
  const profit =
    deal.deal.status === "completed"
      ? deal.calculations.realized_profit
      : deal.calculations.projected_profit;
  if (prepMinutes <= 0 || profit === null) {
    return null;
  }
  const hours = prepMinutes / 60;
  if (hours <= 0) {
    return null;
  }
  return profit / hours;
};

