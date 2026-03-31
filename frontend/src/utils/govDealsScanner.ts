import type { CreateDealRequest, DealCategory, TitleStatus } from "../types";
import type { DealView } from "../types";

export type OpportunityCategory = "vehicle" | "electronics" | "other";
export type OpportunityStatus = "new" | "watch" | "passed";
export type OpportunitySortMode =
  | "best_deal"
  | "highest_upside"
  | "highest_roi"
  | "transport_economics"
  | "lowest_risk"
  | "time_left";

export interface GovDealsOpportunity {
  id: string;
  source: "url_import" | "keyword_search" | "manual_import";
  listing_url: string;
  title: string;
  category: OpportunityCategory;
  current_bid: number;
  auction_end: string;
  location: string;
  seller_agency: string;
  seller_type: "government" | "commercial" | "unknown";
  buyer_premium_pct: number;
  removal_window_days: number;
  title_status: TitleStatus;
  relisted: boolean;
  condition_raw: string;
  estimated_resale_value: number;
  estimated_repair_cost: number;
  quantity_purchased: number | null;
  quantity_broken: number | null;
  status: OpportunityStatus;
  created_at: string;
}

export interface ManualOpportunityInput {
  listing_url: string;
  title: string;
  category: OpportunityCategory;
  current_bid: number;
  auction_end: string;
  location: string;
  seller_agency: string;
  seller_type: "government" | "commercial" | "unknown";
  buyer_premium_pct: number;
  removal_window_days: number;
  title_status: TitleStatus;
  relisted: boolean;
  condition_raw: string;
  estimated_resale_value: number;
  estimated_repair_cost: number;
  quantity_purchased?: number | null;
  quantity_broken?: number | null;
}

export interface OpportunityPreviewSnapshot {
  projected_profit: number;
  total_cost_basis: number;
  projected_roi_pct: number;
  data_confidence: number;
  warnings: string[];
}

export interface OpportunityDerivedMetrics {
  estimated_distance_miles: number | null;
  estimated_transport_cost: number | null;
  projected_upside: number;
  projected_roi_pct: number;
  confidence: number;
  time_left_hours: number | null;
  risk_flags: string[];
}

export interface OpportunityFilters {
  category: "all" | OpportunityCategory;
  distance_radius_miles: number | null;
  minimum_roi_pct: number | null;
  max_current_bid: number | null;
  seller_type: "all" | "government" | "commercial" | "unknown";
  title_status: "all" | TitleStatus;
  relisted: "all" | "relisted" | "not_relisted";
  include_passed: boolean;
}

const EARTH_RADIUS_MILES = 3958.8;

const degToRad = (value: number): number => (value * Math.PI) / 180;

const haversineMiles = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): number => {
  const dLat = degToRad(b.lat - a.lat);
  const dLon = degToRad(b.lon - a.lon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(degToRad(a.lat)) * Math.cos(degToRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(x));
};

const STATE_COORDS: Record<string, { lat: number; lon: number }> = {
  AL: { lat: 32.806671, lon: -86.79113 },
  AK: { lat: 61.370716, lon: -152.404419 },
  AZ: { lat: 33.729759, lon: -111.431221 },
  AR: { lat: 34.969704, lon: -92.373123 },
  CA: { lat: 36.116203, lon: -119.681564 },
  CO: { lat: 39.059811, lon: -105.311104 },
  CT: { lat: 41.597782, lon: -72.755371 },
  DE: { lat: 39.318523, lon: -75.507141 },
  FL: { lat: 27.766279, lon: -81.686783 },
  GA: { lat: 33.040619, lon: -83.643074 },
  HI: { lat: 21.094318, lon: -157.498337 },
  ID: { lat: 44.240459, lon: -114.478828 },
  IL: { lat: 40.349457, lon: -88.986137 },
  IN: { lat: 39.849426, lon: -86.258278 },
  IA: { lat: 42.011539, lon: -93.210526 },
  KS: { lat: 38.5266, lon: -96.726486 },
  KY: { lat: 37.66814, lon: -84.670067 },
  LA: { lat: 31.169546, lon: -91.867805 },
  ME: { lat: 44.693947, lon: -69.381927 },
  MD: { lat: 39.063946, lon: -76.802101 },
  MA: { lat: 42.230171, lon: -71.530106 },
  MI: { lat: 43.326618, lon: -84.536095 },
  MN: { lat: 45.694454, lon: -93.900192 },
  MS: { lat: 32.741646, lon: -89.678696 },
  MO: { lat: 38.456085, lon: -92.288368 },
  MT: { lat: 46.921925, lon: -110.454353 },
  NE: { lat: 41.12537, lon: -98.268082 },
  NV: { lat: 38.313515, lon: -117.055374 },
  NH: { lat: 43.452492, lon: -71.563896 },
  NJ: { lat: 40.298904, lon: -74.521011 },
  NM: { lat: 34.840515, lon: -106.248482 },
  NY: { lat: 42.165726, lon: -74.948051 },
  NC: { lat: 35.630066, lon: -79.806419 },
  ND: { lat: 47.528912, lon: -99.784012 },
  OH: { lat: 40.388783, lon: -82.764915 },
  OK: { lat: 35.565342, lon: -96.928917 },
  OR: { lat: 44.572021, lon: -122.070938 },
  PA: { lat: 40.590752, lon: -77.209755 },
  RI: { lat: 41.680893, lon: -71.51178 },
  SC: { lat: 33.856892, lon: -80.945007 },
  SD: { lat: 44.299782, lon: -99.438828 },
  TN: { lat: 35.747845, lon: -86.692345 },
  TX: { lat: 31.054487, lon: -97.563461 },
  UT: { lat: 40.150032, lon: -111.862434 },
  VT: { lat: 44.045876, lon: -72.710686 },
  VA: { lat: 37.769337, lon: -78.169968 },
  WA: { lat: 47.400902, lon: -121.490494 },
  WV: { lat: 38.491226, lon: -80.954453 },
  WI: { lat: 44.268543, lon: -89.616508 },
  WY: { lat: 42.755966, lon: -107.30249 },
  DC: { lat: 38.897438, lon: -77.026817 },
};

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

const withNewId = (item: Omit<GovDealsOpportunity, "id" | "created_at">): GovDealsOpportunity => ({
  ...item,
  id: `op-${crypto.randomUUID()}`,
  created_at: new Date().toISOString(),
});

export const DEFAULT_SCANNER_FILTERS: OpportunityFilters = {
  category: "all",
  distance_radius_miles: null,
  minimum_roi_pct: null,
  max_current_bid: null,
  seller_type: "all",
  title_status: "all",
  relisted: "all",
  include_passed: false,
};

export const DEFAULT_OPPORTUNITY_SORT_MODE: OpportunitySortMode = "best_deal";

export const OPPORTUNITY_SORT_OPTIONS: Array<{ value: OpportunitySortMode; label: string }> = [
  { value: "best_deal", label: "Best Deal (blended)" },
  { value: "highest_upside", label: "Highest Upside" },
  { value: "highest_roi", label: "Highest ROI %" },
  { value: "transport_economics", label: "Best Transport Economics" },
  { value: "lowest_risk", label: "Lowest Risk" },
  { value: "time_left", label: "Ending Soonest" },
];

export const extractStateCode = (location: string): string | null => {
  const trimmed = location.trim();
  if (!trimmed) {
    return null;
  }
  const codeMatch = trimmed.match(/(?:,\s*|\s)([A-Z]{2})(?:\s|$)/);
  if (codeMatch && STATE_COORDS[codeMatch[1]]) {
    return codeMatch[1];
  }
  const lowered = trimmed.toLowerCase();
  const foundByName = Object.entries(STATE_NAME_TO_CODE).find(([name]) => lowered.includes(name));
  return foundByName ? foundByName[1] : null;
};

export const estimateDistanceMiles = (operatorBaseState: string, location: string): number | null => {
  const origin = STATE_COORDS[operatorBaseState.toUpperCase()];
  const destinationCode = extractStateCode(location);
  const destination = destinationCode ? STATE_COORDS[destinationCode] : null;
  if (!origin || !destination) {
    return null;
  }
  return Math.round(haversineMiles(origin, destination));
};

const hoursUntil = (iso: string): number | null => {
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return (timestamp - Date.now()) / (1000 * 60 * 60);
};

export const estimateTransportCost = (
  distanceMiles: number | null,
  category: OpportunityCategory,
  auctionEndIso: string
): number | null => {
  if (distanceMiles === null) {
    return null;
  }
  if (category === "other") {
    return Math.round(Math.max(90, distanceMiles * 0.45));
  }
  const hoursLeft = hoursUntil(auctionEndIso);
  const urgentRate = hoursLeft !== null && hoursLeft <= 24 ? 1.0 : 0.7;
  const minimum = category === "vehicle" ? 150 : 90;
  return Math.round(Math.max(minimum, distanceMiles * urgentRate));
};

const mapCategoryToDealCategory = (opportunity: GovDealsOpportunity): DealCategory => {
  if (opportunity.category === "electronics") {
    return "electronics_bulk";
  }
  if (opportunity.category === "other") {
    return "powersports";
  }
  const lowered = opportunity.title.toLowerCase();
  if (lowered.includes("police") || lowered.includes("sheriff") || lowered.includes("interceptor")) {
    return "vehicle_police_fleet";
  }
  return "vehicle_suv";
};

const mapConditionGrade = (rawCondition: string): CreateDealRequest["metadata"]["condition_grade"] => {
  const lowered = rawCondition.toLowerCase();
  if (lowered.includes("parts") || lowered.includes("as-is")) {
    return "parts_only";
  }
  if (lowered.includes("defect") || lowered.includes("non-runner")) {
    return "defective";
  }
  if (lowered.includes("cosmetic")) {
    return "used_cosmetic";
  }
  if (lowered.includes("functional")) {
    return "used_functional";
  }
  if (lowered.includes("excellent")) {
    return "excellent";
  }
  if (lowered.includes("good")) {
    return "used_good";
  }
  return "used";
};

const buildRemovalDeadline = (days: number): string | null => {
  if (!Number.isFinite(days) || days <= 0) {
    return null;
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
};

const estimateConfidence = (opportunity: GovDealsOpportunity, distanceMiles: number | null): number => {
  let score = 45;
  if (opportunity.listing_url.trim()) {
    score += 10;
  }
  if (opportunity.auction_end) {
    score += 8;
  }
  if (opportunity.current_bid > 0) {
    score += 8;
  }
  if (opportunity.estimated_resale_value > 0) {
    score += 16;
  }
  if (opportunity.buyer_premium_pct > 0) {
    score += 8;
  }
  if (opportunity.seller_type !== "unknown") {
    score += 6;
  }
  if (opportunity.title_status !== "unknown") {
    score += 5;
  }
  if (distanceMiles !== null) {
    score += 5;
  }
  if (opportunity.relisted) {
    score -= 12;
  }
  return Math.max(0, Math.min(100, score));
};

export const computeOpportunityDerivedMetrics = (
  opportunity: GovDealsOpportunity,
  operatorBaseState: string,
  preview?: OpportunityPreviewSnapshot
): OpportunityDerivedMetrics => {
  const estimatedDistance = estimateDistanceMiles(operatorBaseState, opportunity.location);
  const estimatedTransportCost = estimateTransportCost(estimatedDistance, opportunity.category, opportunity.auction_end);
  const premiumCost = opportunity.current_bid * opportunity.buyer_premium_pct;
  const estimatedTotalInvestment =
    opportunity.current_bid + premiumCost + (estimatedTransportCost ?? 0) + opportunity.estimated_repair_cost;
  const rawUpside = opportunity.estimated_resale_value - estimatedTotalInvestment;
  const rawRoi = estimatedTotalInvestment > 0 ? (rawUpside / estimatedTotalInvestment) * 100 : 0;
  const timeLeft = hoursUntil(opportunity.auction_end);
  const confidence = preview?.data_confidence ?? estimateConfidence(opportunity, estimatedDistance);
  const riskFlags = new Set<string>();
  if (opportunity.title_status !== "on_site") {
    riskFlags.add("TITLE_DELAY");
  }
  if (opportunity.relisted) {
    riskFlags.add("RELISTED_ASSET");
  }
  if (timeLeft !== null && timeLeft < 12) {
    riskFlags.add("ENDING_SOON");
  }
  if (estimatedDistance !== null && estimatedDistance > 450) {
    riskFlags.add("LONG_DISTANCE");
  }
  if (estimatedTransportCost !== null && estimatedTransportCost > 1400) {
    riskFlags.add("TRANSPORT_HIGH");
  }
  if (confidence < 60) {
    riskFlags.add("LOW_CONFIDENCE");
  }
  if (opportunity.seller_type === "commercial") {
    riskFlags.add("REVIEW_MARGIN");
  }
  if (opportunity.seller_type === "unknown") {
    riskFlags.add("UNKNOWN_SELLER_TYPE");
  }
  if (preview) {
    preview.warnings.forEach((warning) => riskFlags.add(warning));
  }

  return {
    estimated_distance_miles: estimatedDistance,
    estimated_transport_cost: estimatedTransportCost,
    projected_upside: preview?.projected_profit ?? rawUpside,
    projected_roi_pct: preview?.projected_roi_pct ?? rawRoi,
    confidence,
    time_left_hours: timeLeft,
    risk_flags: Array.from(riskFlags),
  };
};

export const buildCreateDealRequestFromOpportunity = (
  opportunity: GovDealsOpportunity,
  operatorBaseState: string
): CreateDealRequest => {
  const derived = computeOpportunityDerivedMetrics(opportunity, operatorBaseState);
  const stateCode = extractStateCode(opportunity.location) ?? operatorBaseState.toUpperCase();
  const conditionNotes = [
    opportunity.condition_raw || "No raw condition provided.",
    `GovDeals URL: ${opportunity.listing_url || "not provided"}`,
    `Agency: ${opportunity.seller_agency || "unknown"}`,
    `Location: ${opportunity.location || "unknown"}`,
    `Removal window: ${opportunity.removal_window_days} days`,
    `Relisted: ${opportunity.relisted ? "yes" : "no"}`,
  ].join("\n");

  return {
    label: opportunity.title,
    category: mapCategoryToDealCategory(opportunity),
    source_platform: "govdeals",
    seller_type: opportunity.seller_type,
    acquisition_state: stateCode,
    discovered_date: new Date().toISOString(),
    quantity_purchased: opportunity.quantity_purchased,
    quantity_broken: opportunity.quantity_broken,
    financials: {
      acquisition_cost: opportunity.current_bid,
      buyer_premium_pct: opportunity.buyer_premium_pct,
      transport_cost_actual: null,
      transport_cost_estimated: derived.estimated_transport_cost,
      repair_cost: opportunity.estimated_repair_cost,
      prep_cost: null,
      estimated_market_value: opportunity.estimated_resale_value,
    },
    metadata: {
      condition_grade: mapConditionGrade(opportunity.condition_raw),
      condition_notes: conditionNotes,
      transport_type: opportunity.category === "vehicle" ? "auto_transport" : "freight",
      presentation_quality: "standard",
      removal_deadline: buildRemovalDeadline(opportunity.removal_window_days),
      title_status: opportunity.title_status,
    },
  };
};

export const toPreviewSnapshot = (previewDeal: DealView): OpportunityPreviewSnapshot => ({
  projected_profit: previewDeal.calculations.projected_profit,
  total_cost_basis: previewDeal.calculations.total_cost_basis,
  projected_roi_pct:
    previewDeal.calculations.total_cost_basis > 0
      ? (previewDeal.calculations.projected_profit / previewDeal.calculations.total_cost_basis) * 100
      : 0,
  data_confidence: previewDeal.calculations.data_confidence,
  warnings: previewDeal.warnings ?? [],
});

const opportunityMatchesFilter = (
  opportunity: GovDealsOpportunity,
  metrics: OpportunityDerivedMetrics,
  filters: OpportunityFilters
): boolean => {
  if (!filters.include_passed && opportunity.status === "passed") {
    return false;
  }
  if (filters.category !== "all" && opportunity.category !== filters.category) {
    return false;
  }
  if (filters.seller_type !== "all" && opportunity.seller_type !== filters.seller_type) {
    return false;
  }
  if (filters.title_status !== "all" && opportunity.title_status !== filters.title_status) {
    return false;
  }
  if (filters.relisted === "relisted" && !opportunity.relisted) {
    return false;
  }
  if (filters.relisted === "not_relisted" && opportunity.relisted) {
    return false;
  }
  if (filters.max_current_bid !== null && opportunity.current_bid > filters.max_current_bid) {
    return false;
  }
  if (
    filters.distance_radius_miles !== null &&
    metrics.estimated_distance_miles !== null &&
    metrics.estimated_distance_miles > filters.distance_radius_miles
  ) {
    return false;
  }
  if (filters.minimum_roi_pct !== null && metrics.projected_roi_pct < filters.minimum_roi_pct) {
    return false;
  }
  return true;
};

const toInfinity = (value: number | null | undefined): number =>
  value === null || value === undefined ? Number.POSITIVE_INFINITY : value;

const bySortMode = (
  left: { opportunity: GovDealsOpportunity; metrics: OpportunityDerivedMetrics },
  right: { opportunity: GovDealsOpportunity; metrics: OpportunityDerivedMetrics },
  mode: OpportunitySortMode
): number => {
  if (mode === "highest_upside") {
    return right.metrics.projected_upside - left.metrics.projected_upside;
  }
  if (mode === "highest_roi") {
    return right.metrics.projected_roi_pct - left.metrics.projected_roi_pct;
  }
  if (mode === "transport_economics") {
    const transportDelta =
      toInfinity(left.metrics.estimated_transport_cost) - toInfinity(right.metrics.estimated_transport_cost);
    if (transportDelta !== 0) {
      return transportDelta;
    }
    return toInfinity(left.metrics.estimated_distance_miles) - toInfinity(right.metrics.estimated_distance_miles);
  }
  if (mode === "lowest_risk") {
    const riskDelta = left.metrics.risk_flags.length - right.metrics.risk_flags.length;
    if (riskDelta !== 0) {
      return riskDelta;
    }
    return right.metrics.confidence - left.metrics.confidence;
  }
  if (mode === "time_left") {
    return toInfinity(left.metrics.time_left_hours) - toInfinity(right.metrics.time_left_hours);
  }
  const leftScore =
    left.metrics.projected_upside +
    left.metrics.projected_roi_pct * 120 -
    left.metrics.risk_flags.length * 260 -
    toInfinity(left.metrics.estimated_distance_miles) * 0.35 +
    left.metrics.confidence * 18 -
    Math.max(0, (left.metrics.time_left_hours ?? 48) - 36) * 2;
  const rightScore =
    right.metrics.projected_upside +
    right.metrics.projected_roi_pct * 120 -
    right.metrics.risk_flags.length * 260 -
    toInfinity(right.metrics.estimated_distance_miles) * 0.35 +
    right.metrics.confidence * 18 -
    Math.max(0, (right.metrics.time_left_hours ?? 48) - 36) * 2;
  return rightScore - leftScore;
};

export const rankAndFilterOpportunities = (
  opportunities: GovDealsOpportunity[],
  operatorBaseState: string,
  filters: OpportunityFilters,
  sortMode: OpportunitySortMode,
  previewsById: Record<string, OpportunityPreviewSnapshot | undefined>
): Array<{ opportunity: GovDealsOpportunity; metrics: OpportunityDerivedMetrics }> =>
  opportunities
    .map((opportunity) => ({
      opportunity,
      metrics: computeOpportunityDerivedMetrics(opportunity, operatorBaseState, previewsById[opportunity.id]),
    }))
    .filter((item) => opportunityMatchesFilter(item.opportunity, item.metrics, filters))
    .sort((left, right) => bySortMode(left, right, sortMode));

const inferCategoryFromText = (value: string): OpportunityCategory => {
  const lowered = value.toLowerCase();
  if (
    lowered.includes("ipad") ||
    lowered.includes("tablet") ||
    lowered.includes("laptop") ||
    lowered.includes("electronics")
  ) {
    return "electronics";
  }
  if (
    lowered.includes("motorcycle") ||
    lowered.includes("atv") ||
    lowered.includes("jet ski") ||
    lowered.includes("powersport")
  ) {
    return "other";
  }
  return "vehicle";
};

const SAMPLE_OPPORTUNITIES: Array<Omit<GovDealsOpportunity, "id" | "created_at">> = [
  {
    source: "keyword_search",
    listing_url: "https://govdeals.example/listing/11221",
    title: "2018 Ford Explorer Police Interceptor - 132k miles",
    category: "vehicle",
    current_bid: 5400,
    auction_end: new Date(Date.now() + 13 * 60 * 60 * 1000).toISOString(),
    location: "Austin, TX",
    seller_agency: "City of Austin Fleet",
    seller_type: "government",
    buyer_premium_pct: 0.1,
    removal_window_days: 5,
    title_status: "on_site",
    relisted: false,
    condition_raw: "Runs, minor cosmetic wear, fleet maintained.",
    estimated_resale_value: 10950,
    estimated_repair_cost: 650,
    quantity_purchased: null,
    quantity_broken: null,
    status: "new",
  },
  {
    source: "keyword_search",
    listing_url: "https://govdeals.example/listing/22911",
    title: "Mixed iPad Lot (36 Units) - untested mix",
    category: "electronics",
    current_bid: 3250,
    auction_end: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
    location: "Baton Rouge, LA",
    seller_agency: "Parish IT Department",
    seller_type: "government",
    buyer_premium_pct: 0.12,
    removal_window_days: 4,
    title_status: "unknown",
    relisted: true,
    condition_raw: "Mixed condition, some locked units expected.",
    estimated_resale_value: 8450,
    estimated_repair_cost: 420,
    quantity_purchased: 36,
    quantity_broken: 6,
    status: "new",
  },
  {
    source: "keyword_search",
    listing_url: "https://govdeals.example/listing/37770",
    title: "2017 Chevy Tahoe - Utility Unit",
    category: "vehicle",
    current_bid: 6900,
    auction_end: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    location: "Tulsa, OK",
    seller_agency: "County Asset Disposal",
    seller_type: "government",
    buyer_premium_pct: 0.1,
    removal_window_days: 3,
    title_status: "delayed",
    relisted: false,
    condition_raw: "Starts and drives, check transmission response.",
    estimated_resale_value: 13200,
    estimated_repair_cost: 1200,
    quantity_purchased: null,
    quantity_broken: null,
    status: "new",
  },
  {
    source: "keyword_search",
    listing_url: "https://govdeals.example/listing/49005",
    title: "2020 Polaris Ranger 1000",
    category: "other",
    current_bid: 4700,
    auction_end: new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString(),
    location: "Raleigh, NC",
    seller_agency: "State Parks Division",
    seller_type: "government",
    buyer_premium_pct: 0.1,
    removal_window_days: 7,
    title_status: "on_site",
    relisted: false,
    condition_raw: "Operational, deep detail needed.",
    estimated_resale_value: 9400,
    estimated_repair_cost: 550,
    quantity_purchased: null,
    quantity_broken: null,
    status: "new",
  },
];

export const buildKeywordOpportunities = (keyword: string): GovDealsOpportunity[] => {
  const lowered = keyword.trim().toLowerCase();
  if (!lowered) {
    return [];
  }
  const matching = SAMPLE_OPPORTUNITIES.filter((opportunity) => {
    const haystack = [
      opportunity.title,
      opportunity.location,
      opportunity.seller_agency,
      opportunity.condition_raw,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(lowered);
  });
  if (matching.length > 0) {
    return matching.map((item) => withNewId(item));
  }
  return [
    withNewId({
      source: "keyword_search",
      listing_url: "",
      title: `${keyword.trim()} - manual verify needed`,
      category: inferCategoryFromText(keyword),
      current_bid: 0,
      auction_end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      location: "Unknown, TX",
      seller_agency: "Unknown agency",
      seller_type: "unknown",
      buyer_premium_pct: 0.1,
      removal_window_days: 3,
      title_status: "unknown",
      relisted: false,
      condition_raw: "Keyword import skeleton. Add listing details before execution.",
      estimated_resale_value: 0,
      estimated_repair_cost: 0,
      quantity_purchased: null,
      quantity_broken: null,
      status: "new",
    }),
  ];
};

export const buildOpportunityFromUrl = (listingUrl: string, keywordHint = ""): GovDealsOpportunity => {
  const safeUrl = listingUrl.trim();
  let titleFromUrl = "GovDeals Listing";
  try {
    const parsed = new URL(safeUrl);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const last = parts.at(-1) ?? "listing";
    titleFromUrl = decodeURIComponent(last).replace(/[-_]+/g, " ");
  } catch {
    titleFromUrl = "GovDeals Listing";
  }
  const now = Date.now();
  return withNewId({
    source: "url_import",
    listing_url: safeUrl,
    title: `${titleFromUrl} ${keywordHint ? `(${keywordHint.trim()})` : ""}`.trim(),
    category: inferCategoryFromText(`${titleFromUrl} ${keywordHint}`),
    current_bid: 0,
    auction_end: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    location: "Unknown, TX",
    seller_agency: "Unknown agency",
    seller_type: "unknown",
    buyer_premium_pct: 0.1,
    removal_window_days: 3,
    title_status: "unknown",
    relisted: false,
    condition_raw: "URL imported. Fill missing listing details before creating deal.",
    estimated_resale_value: 0,
    estimated_repair_cost: 0,
    quantity_purchased: null,
    quantity_broken: null,
    status: "new",
  });
};

export const buildManualOpportunity = (input: ManualOpportunityInput): GovDealsOpportunity =>
  withNewId({
    source: "manual_import",
    listing_url: input.listing_url.trim(),
    title: input.title.trim() || "Manual GovDeals Listing",
    category: input.category,
    current_bid: Math.max(0, input.current_bid),
    auction_end: input.auction_end || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    location: input.location.trim() || "Unknown, TX",
    seller_agency: input.seller_agency.trim() || "Unknown agency",
    seller_type: input.seller_type,
    buyer_premium_pct: Math.max(0, input.buyer_premium_pct),
    removal_window_days: Math.max(1, Math.round(input.removal_window_days || 3)),
    title_status: input.title_status,
    relisted: input.relisted,
    condition_raw: input.condition_raw.trim() || "No condition details provided.",
    estimated_resale_value: Math.max(0, input.estimated_resale_value),
    estimated_repair_cost: Math.max(0, input.estimated_repair_cost),
    quantity_purchased:
      input.quantity_purchased === null || input.quantity_purchased === undefined
        ? null
        : Math.max(0, Math.round(input.quantity_purchased)),
    quantity_broken:
      input.quantity_broken === null || input.quantity_broken === undefined
        ? null
        : Math.max(0, Math.round(input.quantity_broken)),
    status: "new",
  });

export const upsertOpportunities = (
  existing: GovDealsOpportunity[],
  incoming: GovDealsOpportunity[]
): GovDealsOpportunity[] => {
  const map = new Map<string, GovDealsOpportunity>();
  existing.forEach((item) => map.set(item.id, item));
  incoming.forEach((item) => {
    const existingByUrl = Array.from(map.values()).find(
      (candidate) =>
        candidate.listing_url &&
        item.listing_url &&
        candidate.listing_url.trim().toLowerCase() === item.listing_url.trim().toLowerCase()
    );
    if (existingByUrl) {
      map.set(existingByUrl.id, {
        ...existingByUrl,
        ...item,
        id: existingByUrl.id,
        created_at: existingByUrl.created_at,
      });
      return;
    }
    map.set(item.id, item);
  });
  return Array.from(map.values()).sort(
    (a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || "")
  );
};

export const setOpportunityStatus = (
  opportunities: GovDealsOpportunity[],
  id: string,
  status: OpportunityStatus
): GovDealsOpportunity[] =>
  opportunities.map((item) => (item.id === id ? { ...item, status } : item));
