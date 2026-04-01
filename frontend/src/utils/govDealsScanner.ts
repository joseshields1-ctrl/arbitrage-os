import type { CreateDealRequest, DealCategory, TitleStatus } from "../types";
import type { DealView } from "../types";

export type OpportunityCategory = "vehicle" | "electronics" | "other";
export type OpportunityStatus = "new" | "watch" | "passed" | "converted";
export type OpportunityInterest = "undecided" | "interested" | "not_interested";
export type OpportunityImportStatus = "valid" | "needs_review" | "blocked" | "partial" | "failed";
export type OpportunityCriticalField =
  | "title"
  | "current_bid"
  | "auction_end"
  | "location"
  | "seller_agency";
export type OpportunityGuardrailFlag =
  | "MISSING_TITLE"
  | "MISSING_CURRENT_BID"
  | "MISSING_AUCTION_END"
  | "MISSING_LOCATION"
  | "MISSING_SELLER_AGENCY"
  | "MALFORMED_AUCTION_END"
  | "BID_PARSE_MISMATCH"
  | "BUYER_PREMIUM_NOT_EXPLICIT"
  | "DUPLICATE_LISTING_ID_COLLISION"
  | "PARTIAL_PARSE_NOT_ACTIONABLE"
  | "IMPORT_BLOCKED"
  | "IMPORT_FETCH_FAILED";

export interface OpportunityValueLayer<T> {
  imported_value: T | null;
  operator_override: T | null;
  effective_value: T | null;
  source: "imported" | "override" | "missing";
}

export interface OpportunityValueLayers {
  current_bid: OpportunityValueLayer<number>;
  buyer_premium_pct: OpportunityValueLayer<number>;
  estimated_resale_value: OpportunityValueLayer<number>;
  estimated_transport_override: OpportunityValueLayer<number>;
  estimated_repair_cost: OpportunityValueLayer<number>;
  quantity_purchased: OpportunityValueLayer<number>;
  quantity_broken: OpportunityValueLayer<number>;
  title_status: OpportunityValueLayer<TitleStatus>;
  seller_agency: OpportunityValueLayer<string>;
  location: OpportunityValueLayer<string>;
  condition_raw: OpportunityValueLayer<string>;
}
export type SniperPassReason = "distance" | "funds" | "coordination" | "risk" | "other";
export type OpportunitySortMode =
  | "best_deal"
  | "highest_upside"
  | "highest_roi"
  | "transport_economics"
  | "lowest_risk"
  | "time_left";

export interface OpportunityEditableFields {
  title: string;
  current_bid: number;
  buyer_premium_pct: number | null;
  estimated_resale_value: number;
  estimated_transport_override: number | null;
  estimated_repair_cost: number;
  quantity_purchased: number | null;
  quantity_broken: number | null;
  condition_raw: string;
  title_status: TitleStatus;
  removal_window_days: number;
  seller_agency: string;
  seller_type: "government" | "commercial" | "unknown";
  location: string;
  auction_end: string;
}

export interface OpportunityRawImportFields {
  account_id: string | null;
  item_id: string | null;
  listing_id: string | null;
  title: string | null;
  current_bid_text: string | null;
  auction_end_text: string | null;
  time_remaining_text: string | null;
  location_text: string | null;
  seller_agency_text: string | null;
  category_text: string | null;
  buyer_premium_text: string | null;
  description_text: string | null;
  quantity_text: string | null;
  attachment_links_text: string | null;
  seller_contact_text: string | null;
}

export interface OpportunityImportReviewResponse {
  listing_url: string;
  canonical_url: string;
  account_id: string | null;
  item_id: string | null;
  listing_id: string | null;
  raw_fields: OpportunityRawImportFields;
  parsed_fields: Partial<OpportunityEditableFields> & {
    account_id?: string | null;
    item_id?: string | null;
    listing_id: string | null;
    canonical_url: string;
    category: OpportunityCategory;
    buyer_premium_explicit: boolean;
    description: string | null;
    attachment_links: string[];
    seller_contact: string | null;
  };
  missing_fields: OpportunityCriticalField[];
  import_status: OpportunityImportStatus;
  parse_status: OpportunityImportStatus;
  import_confidence: number | null;
  guardrail_flags: OpportunityGuardrailFlag[];
  blocked_reason: string | null;
  parser_error: string | null;
  request_headers: {
    "User-Agent": string;
    "Accept-Language": string;
    Referer: string;
  };
  extraction_notes: string[];
  selector_hits: Record<string, string[]>;
}

export interface GovDealsOpportunity {
  id: string;
  source: "url_import" | "keyword_search" | "manual_import";
  account_id: string | null;
  item_id: string | null;
  listing_id: string | null;
  listing_url: string;
  canonical_url: string;
  title: string;
  category: OpportunityCategory;
  current_bid: number;
  auction_end: string;
  auction_state?: "active" | "ended" | "unknown";
  time_left_hours?: number | null;
  location: string;
  seller_agency: string;
  seller_type: "government" | "commercial" | "unknown";
  buyer_premium_pct: number | null;
  buyer_premium_explicit: boolean;
  removal_window_days: number;
  title_status: TitleStatus;
  relisted: boolean;
  condition_raw: string;
  description: string | null;
  attachment_links: string[];
  seller_contact: string | null;
  estimated_resale_value: number;
  estimated_transport_override: number | null;
  estimated_repair_cost: number;
  quantity_purchased: number | null;
  quantity_broken: number | null;
  import_status: OpportunityImportStatus;
  import_confidence: number | null;
  import_missing_fields: OpportunityCriticalField[];
  raw_import_data: OpportunityRawImportFields | null;
  operator_overrides: Partial<OpportunityEditableFields> | null;
  value_layers: OpportunityValueLayers | null;
  parse_status: OpportunityImportStatus;
  guardrail_flags: OpportunityGuardrailFlag[];
  blocked_reason: string | null;
  parser_error: string | null;
  imported_at: string | null;
  status: OpportunityStatus;
  interest: OpportunityInterest;
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

export interface WonDealIntakeInput {
  label: string;
  acquisition_state: string;
  final_bid: number;
  buyer_premium_pct: number;
  transport_cost_actual: number | null;
  transport_cost_estimated: number | null;
  repair_cost: number | null;
  prep_cost: number | null;
  estimated_market_value: number;
  title_status: TitleStatus;
  removal_deadline: string | null;
  condition_notes: string;
  quantity_purchased: number | null;
  quantity_broken: number | null;
}

export interface SniperDecisionRecord {
  id: string;
  opportunity_id: string;
  decision: "approved" | "passed";
  pass_reason: SniperPassReason | null;
  note: string | null;
  decided_at: string;
  score_at_decision: number;
  opportunity_snapshot: GovDealsOpportunity;
}

export interface InterestSignalRecord {
  id: string;
  opportunity_id: string;
  interest: OpportunityInterest;
  decided_at: string;
  opportunity_snapshot: GovDealsOpportunity;
}

export interface SniperAIPick {
  opportunity: GovDealsOpportunity;
  metrics: OpportunityDerivedMetrics;
  score: number;
  explanation: string;
  quality_signals: string[];
  scoring_breakdown: {
    profit_score: number;
    roi_score: number;
    transport_score: number;
    confidence_score: number;
    ehr_score: number;
    urgency_boost: number;
    interest_adjustment: number;
    behavior_adjustment: number;
    risk_penalty: number;
    real_world_penalty: number;
    capital_penalty: number;
    final_score: number;
  };
}

export interface SniperDashboardSummary {
  picks_count: number;
  approved_not_acted_on: number;
  passed_breakdown: {
    distance: number;
    funds: number;
    coordination: number;
    risk: number;
    other: number;
  };
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
  estimated_total_cost: number;
  projected_upside: number;
  projected_roi_pct: number;
  confidence: number;
  time_left_hours: number | null;
  estimated_ehr: number | null;
  capital_blocked: boolean;
  risk_flags: string[];
  applied_penalties: string[];
}

export interface SniperBehaviorProfile {
  distance_pass_rate: number;
  funds_pass_rate: number;
  coordination_pass_rate: number;
  risk_pass_rate: number;
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

const withNewId = (
  item: Partial<Omit<GovDealsOpportunity, "id" | "created_at">>
): GovDealsOpportunity => ({
  source: "manual_import",
  account_id: null,
  item_id: null,
  listing_id: null,
  listing_url: "",
  canonical_url: "",
  title: "Imported opportunity",
  category: "other",
  current_bid: 0,
  auction_end: "",
  auction_state: "unknown",
  time_left_hours: null,
  location: "",
  seller_agency: "",
  seller_type: "unknown",
  buyer_premium_pct: null,
  buyer_premium_explicit: false,
  removal_window_days: 3,
  title_status: "unknown",
  relisted: false,
  condition_raw: "",
  description: null,
  attachment_links: [],
  seller_contact: null,
  estimated_resale_value: 0,
  estimated_transport_override: null,
  estimated_repair_cost: 0,
  quantity_purchased: null,
  quantity_broken: null,
  import_status: "needs_review",
  import_confidence: null,
  import_missing_fields: ["title", "current_bid", "auction_end", "location", "seller_agency"],
  raw_import_data: null,
  operator_overrides: null,
  value_layers: null,
  parse_status: "needs_review",
  guardrail_flags: [],
  blocked_reason: null,
  parser_error: null,
  imported_at: null,
  status: "new",
  interest: "undecided",
  ...item,
  id: `op-${crypto.randomUUID()}`,
  created_at: new Date().toISOString(),
});

export const emptyRawImportFields = (): OpportunityRawImportFields => ({
  account_id: null,
  item_id: null,
  listing_id: null,
  title: null,
  current_bid_text: null,
  auction_end_text: null,
  time_remaining_text: null,
  location_text: null,
  seller_agency_text: null,
  category_text: null,
  buyer_premium_text: null,
  description_text: null,
  quantity_text: null,
  attachment_links_text: null,
  seller_contact_text: null,
});

export const computeImportMissingFields = (
  editable: Partial<OpportunityEditableFields>
): OpportunityCriticalField[] => {
  const missing: OpportunityCriticalField[] = [];
  if (!editable.title || !editable.title.trim()) {
    missing.push("title");
  }
  if (!Number.isFinite(editable.current_bid ?? Number.NaN) || (editable.current_bid ?? 0) <= 0) {
    missing.push("current_bid");
  }
  if (!editable.auction_end || !Number.isFinite(Date.parse(editable.auction_end))) {
    missing.push("auction_end");
  }
  if (!editable.location || !editable.location.trim()) {
    missing.push("location");
  }
  if (!editable.seller_agency || !editable.seller_agency.trim()) {
    missing.push("seller_agency");
  }
  return missing;
};

export const buildImportReviewDraftOverrides = (
  review: OpportunityImportReviewResponse
): Partial<OpportunityEditableFields> => ({
  title: review.parsed_fields.title ?? "",
  current_bid: Number(review.parsed_fields.current_bid ?? 0),
  buyer_premium_pct:
    review.parsed_fields.buyer_premium_pct === undefined || review.parsed_fields.buyer_premium_pct === null
      ? null
      : Number(review.parsed_fields.buyer_premium_pct),
  estimated_resale_value: Number(review.parsed_fields.estimated_resale_value ?? 0),
  estimated_transport_override:
    review.parsed_fields.estimated_transport_override === undefined
      ? null
      : review.parsed_fields.estimated_transport_override,
  estimated_repair_cost: Number(review.parsed_fields.estimated_repair_cost ?? 0),
  quantity_purchased:
    review.parsed_fields.quantity_purchased === undefined ? null : review.parsed_fields.quantity_purchased,
  quantity_broken: review.parsed_fields.quantity_broken === undefined ? null : review.parsed_fields.quantity_broken,
  condition_raw: review.parsed_fields.condition_raw ?? "",
  title_status: review.parsed_fields.title_status ?? "unknown",
  removal_window_days: Number(review.parsed_fields.removal_window_days ?? 3),
  seller_agency: review.parsed_fields.seller_agency ?? "",
  seller_type: review.parsed_fields.seller_type ?? "unknown",
  location: review.parsed_fields.location ?? "",
  auction_end: review.parsed_fields.auction_end ?? "",
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

export const SNIPER_CONFIDENCE_THRESHOLD = 62;
const KEY_NONRUNNER_COST_PENALTY = 450;
const MAJOR_EXCLUDED_RISK_FLAGS = new Set([
  "FORCE_LIQUIDATION",
  "ESTIMATION_FAILURE",
  "LOW_CONFIDENCE",
]);

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

export const estimateTransportCost = (
  distanceMiles: number | null,
  category: OpportunityCategory,
  timeLeftHours: number | null
): number | null => {
  if (distanceMiles === null) {
    return null;
  }
  if (category === "other") {
    return Math.round(Math.max(90, distanceMiles * 0.45));
  }
  const urgentRate = timeLeftHours !== null && timeLeftHours <= 24 ? 1.0 : 0.7;
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
  if (typeof opportunity.buyer_premium_pct === "number" && opportunity.buyer_premium_pct > 0) {
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
  preview?: OpportunityPreviewSnapshot,
  availableLiquidCash = Number.POSITIVE_INFINITY
): OpportunityDerivedMetrics => {
  const backendTimeLeft =
    typeof opportunity.time_left_hours === "number" && Number.isFinite(opportunity.time_left_hours)
      ? opportunity.time_left_hours
      : null;
  const estimatedDistance = estimateDistanceMiles(operatorBaseState, opportunity.location);
  const estimatedTransportCost = estimateTransportCost(
    estimatedDistance,
    opportunity.category,
    backendTimeLeft
  );
  const conditionLower = opportunity.condition_raw.toLowerCase();
  const missingKey = conditionLower.includes("missing key") || conditionLower.includes("no key");
  const nonRunner =
    conditionLower.includes("non-runner") ||
    conditionLower.includes("non runner") ||
    conditionLower.includes("does not run");
  const keyNonRunnerCost = missingKey || nonRunner ? KEY_NONRUNNER_COST_PENALTY : 0;
  const premiumRate =
    opportunity.buyer_premium_pct === null || opportunity.buyer_premium_pct === undefined
      ? 0
      : opportunity.buyer_premium_pct;
  const premiumCost = opportunity.current_bid * premiumRate;
  const estimatedTotalInvestment =
    opportunity.current_bid +
    premiumCost +
    (estimatedTransportCost ?? 0) +
    opportunity.estimated_repair_cost +
    keyNonRunnerCost;
  const rawUpside = opportunity.estimated_resale_value - estimatedTotalInvestment;
  const rawRoi = estimatedTotalInvestment > 0 ? (rawUpside / estimatedTotalInvestment) * 100 : 0;
  const timeLeft = backendTimeLeft;
  const confidence = preview?.data_confidence ?? estimateConfidence(opportunity, estimatedDistance);
  const riskFlags = new Set<string>();
  if (opportunity.title_status !== "on_site") {
    riskFlags.add("TITLE_DELAY");
  }
  if (opportunity.relisted) {
    riskFlags.add("RELISTED_ASSET");
  }
  if (opportunity.title_status !== "on_site") {
    riskFlags.add("CAPITAL_LOCK");
  }
  if (timeLeft !== null && timeLeft < 12) {
    riskFlags.add("ENDING_SOON");
  }
  if (opportunity.removal_window_days <= 2) {
    riskFlags.add("REMOVAL_RISK");
  }
  if (timeLeft !== null && timeLeft <= 36) {
    const auctionEndTs = Date.parse(opportunity.auction_end);
    const removalDeadlineTs =
      Number.isFinite(auctionEndTs) && opportunity.removal_window_days > 0
        ? auctionEndTs + opportunity.removal_window_days * 24 * 60 * 60 * 1000
        : Number.NaN;
    const removalDay = Number.isFinite(removalDeadlineTs) ? new Date(removalDeadlineTs).getDay() : null;
    if (removalDay === 0 || removalDay === 6) {
      riskFlags.add("WEEKEND_REMOVAL");
      riskFlags.add("REMOVAL_RISK");
    }
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
  if (missingKey || nonRunner) {
    riskFlags.add("KEY_NONRUNNER");
    riskFlags.add("KEY_NONRUNNER_PENALTY");
  }
  if (opportunity.relisted) {
    riskFlags.add("POSSIBLE_DOG");
  }
  if (conditionLower.includes("bad listing") || conditionLower.includes("repeat issue")) {
    riskFlags.add("SELLER_REPUTATION_RISK");
  }
  const capitalBlocked = estimatedTotalInvestment > availableLiquidCash;
  if (capitalBlocked) {
    riskFlags.add("CAPITAL_BLOCKED");
  }
  if (preview) {
    preview.warnings.forEach((warning) => riskFlags.add(warning));
  }
  const appliedPenalties = [
    riskFlags.has("CAPITAL_LOCK") ? "CAPITAL_LOCK" : null,
    riskFlags.has("REMOVAL_RISK") ? "REMOVAL_RISK" : null,
    riskFlags.has("KEY_NONRUNNER_PENALTY") ? "KEY_NONRUNNER_PENALTY" : null,
    riskFlags.has("POSSIBLE_DOG") ? "POSSIBLE_DOG" : null,
    riskFlags.has("SELLER_REPUTATION_RISK") ? "SELLER_REPUTATION_RISK" : null,
    riskFlags.has("CAPITAL_BLOCKED") ? "CAPITAL_BLOCKED" : null,
  ].filter((item): item is string => item !== null);
  const estimatedEhr =
    metricsProjectedHours(opportunity, estimatedDistance) > 0
      ? rawUpside / metricsProjectedHours(opportunity, estimatedDistance)
      : null;

  return {
    estimated_distance_miles: estimatedDistance,
    estimated_transport_cost: estimatedTransportCost,
    estimated_total_cost: estimatedTotalInvestment,
    projected_upside: preview?.projected_profit ?? rawUpside,
    projected_roi_pct: preview?.projected_roi_pct ?? rawRoi,
    confidence,
    time_left_hours: timeLeft,
    estimated_ehr: estimatedEhr,
    capital_blocked: capitalBlocked,
    risk_flags: Array.from(riskFlags),
    applied_penalties: appliedPenalties,
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
      buyer_premium_pct: opportunity.buyer_premium_pct ?? 0,
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

export const buildCreateDealRequestFromWonIntake = (
  opportunity: GovDealsOpportunity,
  intake: WonDealIntakeInput,
  operatorBaseState: string
): CreateDealRequest => {
  const inferredState = extractStateCode(opportunity.location) ?? operatorBaseState.toUpperCase();
  const acquisitionState = intake.acquisition_state.trim().toUpperCase() || inferredState;
  const conditionNotes = [
    intake.condition_notes.trim() || opportunity.condition_raw || "No condition notes provided.",
    `GovDeals URL: ${opportunity.listing_url || "not provided"}`,
    `Agency: ${opportunity.seller_agency || "unknown"}`,
    `Location: ${opportunity.location || "unknown"}`,
    `Auction End: ${opportunity.auction_end || "unknown"}`,
  ].join("\n");

  return {
    label: intake.label.trim() || opportunity.title,
    category: mapCategoryToDealCategory(opportunity),
    source_platform: "govdeals",
    seller_type: opportunity.seller_type,
    acquisition_state: acquisitionState,
    discovered_date: new Date().toISOString(),
    quantity_purchased: intake.quantity_purchased,
    quantity_broken: intake.quantity_broken,
    financials: {
      acquisition_cost: Math.max(0, intake.final_bid),
      buyer_premium_pct: Math.max(0, intake.buyer_premium_pct),
      transport_cost_actual: intake.transport_cost_actual,
      transport_cost_estimated: intake.transport_cost_estimated,
      repair_cost: intake.repair_cost,
      prep_cost: intake.prep_cost,
      estimated_market_value: Math.max(0, intake.estimated_market_value),
    },
    metadata: {
      condition_grade: mapConditionGrade(intake.condition_notes || opportunity.condition_raw),
      condition_notes: conditionNotes,
      transport_type: opportunity.category === "vehicle" ? "auto_transport" : "freight",
      presentation_quality: "standard",
      removal_deadline: intake.removal_deadline,
      title_status: intake.title_status,
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
    account_id: "1001",
    item_id: "11221",
    listing_id: "govdeals_11221_11221",
    listing_url: "https://govdeals.example/listing/11221",
    canonical_url: "https://govdeals.example/listing/11221",
    title: "2018 Ford Explorer Police Interceptor - 132k miles",
    category: "vehicle",
    current_bid: 5400,
    auction_end: new Date(Date.now() + 13 * 60 * 60 * 1000).toISOString(),
    auction_state: "unknown",
    time_left_hours: null,
    location: "Austin, TX",
    seller_agency: "City of Austin Fleet",
    seller_type: "government",
    buyer_premium_pct: 0.1,
    removal_window_days: 5,
    title_status: "on_site",
    relisted: false,
    condition_raw: "Runs, minor cosmetic wear, fleet maintained.",
    description: "Runs, minor cosmetic wear, fleet maintained.",
    attachment_links: [],
    seller_contact: null,
    estimated_resale_value: 10950,
    estimated_transport_override: null,
    estimated_repair_cost: 650,
    quantity_purchased: null,
    quantity_broken: null,
    import_status: "valid",
    import_confidence: 88,
    import_missing_fields: [],
    raw_import_data: null,
    operator_overrides: null,
    value_layers: null,
    parse_status: "valid",
    guardrail_flags: [],
    blocked_reason: null,
    parser_error: null,
    buyer_premium_explicit: true,
    imported_at: new Date().toISOString(),
    status: "new",
    interest: "undecided",
  },
  {
    source: "keyword_search",
    account_id: "1002",
    item_id: "22911",
    listing_id: "govdeals_22911_22911",
    listing_url: "https://govdeals.example/listing/22911",
    canonical_url: "https://govdeals.example/listing/22911",
    title: "Mixed iPad Lot (36 Units) - untested mix",
    category: "electronics",
    current_bid: 3250,
    auction_end: new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString(),
    auction_state: "unknown",
    time_left_hours: null,
    location: "Baton Rouge, LA",
    seller_agency: "Parish IT Department",
    seller_type: "government",
    buyer_premium_pct: 0.12,
    removal_window_days: 4,
    title_status: "unknown",
    relisted: true,
    condition_raw: "Mixed condition, some locked units expected.",
    description: "Mixed condition, some locked units expected.",
    attachment_links: [],
    seller_contact: null,
    estimated_resale_value: 8450,
    estimated_transport_override: null,
    estimated_repair_cost: 420,
    quantity_purchased: 36,
    quantity_broken: 6,
    import_status: "valid",
    import_confidence: 80,
    import_missing_fields: [],
    raw_import_data: null,
    operator_overrides: null,
    value_layers: null,
    parse_status: "valid",
    guardrail_flags: [],
    blocked_reason: null,
    parser_error: null,
    buyer_premium_explicit: true,
    imported_at: new Date().toISOString(),
    status: "new",
    interest: "undecided",
  },
  {
    source: "keyword_search",
    account_id: "1003",
    item_id: "37770",
    listing_id: "govdeals_37770_37770",
    listing_url: "https://govdeals.example/listing/37770",
    canonical_url: "https://govdeals.example/listing/37770",
    title: "2017 Chevy Tahoe - Utility Unit",
    category: "vehicle",
    current_bid: 6900,
    auction_end: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    auction_state: "unknown",
    time_left_hours: null,
    location: "Tulsa, OK",
    seller_agency: "County Asset Disposal",
    seller_type: "government",
    buyer_premium_pct: 0.1,
    removal_window_days: 3,
    title_status: "delayed",
    relisted: false,
    condition_raw: "Starts and drives, check transmission response.",
    description: "Starts and drives, check transmission response.",
    attachment_links: [],
    seller_contact: null,
    estimated_resale_value: 13200,
    estimated_transport_override: null,
    estimated_repair_cost: 1200,
    quantity_purchased: null,
    quantity_broken: null,
    import_status: "valid",
    import_confidence: 82,
    import_missing_fields: [],
    raw_import_data: null,
    operator_overrides: null,
    value_layers: null,
    parse_status: "valid",
    guardrail_flags: [],
    blocked_reason: null,
    parser_error: null,
    buyer_premium_explicit: true,
    imported_at: new Date().toISOString(),
    status: "new",
    interest: "undecided",
  },
  {
    source: "keyword_search",
    account_id: "1004",
    item_id: "49005",
    listing_id: "govdeals_49005_49005",
    listing_url: "https://govdeals.example/listing/49005",
    canonical_url: "https://govdeals.example/listing/49005",
    title: "2020 Polaris Ranger 1000",
    category: "other",
    current_bid: 4700,
    auction_end: new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString(),
    auction_state: "unknown",
    time_left_hours: null,
    location: "Raleigh, NC",
    seller_agency: "State Parks Division",
    seller_type: "government",
    buyer_premium_pct: 0.1,
    removal_window_days: 7,
    title_status: "on_site",
    relisted: false,
    condition_raw: "Operational, deep detail needed.",
    description: "Operational, deep detail needed.",
    attachment_links: [],
    seller_contact: null,
    estimated_resale_value: 9400,
    estimated_transport_override: null,
    estimated_repair_cost: 550,
    quantity_purchased: null,
    quantity_broken: null,
    import_status: "valid",
    import_confidence: 85,
    import_missing_fields: [],
    raw_import_data: null,
    operator_overrides: null,
    value_layers: null,
    parse_status: "valid",
    guardrail_flags: [],
    blocked_reason: null,
    parser_error: null,
    buyer_premium_explicit: true,
    imported_at: new Date().toISOString(),
    status: "new",
    interest: "undecided",
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
      auction_state: "unknown",
      time_left_hours: null,
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
      interest: "undecided",
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
    auction_state: "unknown",
    time_left_hours: null,
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
    interest: "undecided",
  });
};

export const buildManualOpportunity = (input: ManualOpportunityInput): GovDealsOpportunity =>
  withNewId({
    source: "manual_import",
    listing_url: input.listing_url.trim(),
    title: input.title.trim() || "Manual GovDeals Listing",
    category: input.category,
    current_bid: Math.max(0, input.current_bid),
    auction_end: input.auction_end || "",
    auction_state: "unknown",
    time_left_hours: null,
    location: input.location.trim(),
    seller_agency: input.seller_agency.trim(),
    seller_type: input.seller_type,
    buyer_premium_pct:
      input.buyer_premium_pct === null || input.buyer_premium_pct === undefined
        ? null
        : Math.max(0, input.buyer_premium_pct),
    buyer_premium_explicit: input.buyer_premium_pct !== null && input.buyer_premium_pct !== undefined,
    removal_window_days: Math.max(1, Math.round(input.removal_window_days || 3)),
    title_status: input.title_status,
    relisted: input.relisted,
    condition_raw: input.condition_raw.trim(),
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
    import_status: "valid",
    parse_status: "valid",
    import_confidence: 100,
    import_missing_fields: [],
    value_layers: null,
    guardrail_flags: [],
    blocked_reason: null,
    parser_error: null,
    status: "new",
    interest: "undecided",
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

export const setOpportunityInterest = (
  opportunities: GovDealsOpportunity[],
  id: string,
  interest: OpportunityInterest
): GovDealsOpportunity[] =>
  opportunities.map((item) => (item.id === id ? { ...item, interest } : item));

export const normalizeOpportunities = (
  opportunities: GovDealsOpportunity[]
): GovDealsOpportunity[] =>
  opportunities.map((item) => ({
    ...item,
    status:
      item.status === "new" ||
      item.status === "watch" ||
      item.status === "passed" ||
      item.status === "converted"
        ? item.status
        : "new",
    interest:
      item.interest === "interested" ||
      item.interest === "not_interested" ||
      item.interest === "undecided"
        ? item.interest
        : "undecided",
  }));

const normalizeScore = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const hasMajorExcludedRisk = (riskFlags: string[]): boolean =>
  riskFlags.some((flag) => MAJOR_EXCLUDED_RISK_FLAGS.has(flag));

const hasReasonableTransportEconomics = (metrics: OpportunityDerivedMetrics): boolean => {
  if (metrics.estimated_transport_cost === null || metrics.estimated_distance_miles === null) {
    return true;
  }
  if (metrics.estimated_distance_miles > 700) {
    return false;
  }
  if (metrics.projected_upside <= 0) {
    return false;
  }
  return metrics.estimated_transport_cost <= metrics.projected_upside * 0.65;
};

const metricsProjectedHours = (
  opportunity: GovDealsOpportunity,
  distanceMiles: number | null
): number => {
  const pickupHours = opportunity.category === "vehicle" ? 2.5 : 1.5;
  const transportHours = distanceMiles === null ? 2 : Math.max(1, distanceMiles / 55);
  const units = opportunity.quantity_purchased ?? (opportunity.category === "electronics" ? 20 : 1);
  const broken = opportunity.quantity_broken ?? 0;
  const prepPerUnit = opportunity.category === "electronics" ? 0.2 : 0.8;
  const reworkHours = broken * 0.35;
  return pickupHours + transportHours + units * prepPerUnit + reworkHours;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const computeBehaviorProfileFromDecisions = (decisions: SniperDecisionRecord[]): SniperBehaviorProfile => {
  const passed = decisions.filter((item) => item.decision === "passed");
  const totalPassed = Math.max(1, passed.length);
  const countReason = (reason: SniperPassReason): number =>
    passed.filter((item) => item.pass_reason === reason).length;
  return {
    distance_pass_rate: countReason("distance") / totalPassed,
    funds_pass_rate: countReason("funds") / totalPassed,
    coordination_pass_rate: countReason("coordination") / totalPassed,
    risk_pass_rate: countReason("risk") / totalPassed,
  };
};

const computeRealWorldPenalty = (
  opportunity: GovDealsOpportunity,
  metrics: OpportunityDerivedMetrics
): { penalty: number; flags: string[] } => {
  let penalty = 0;
  const flags: string[] = [];
  if (opportunity.title_status !== "on_site") {
    penalty += 12;
    flags.push("CAPITAL_LOCK");
  }
  const weekendRemoval = metrics.risk_flags.includes("WEEKEND_REMOVAL");
  const shortRemoval = opportunity.removal_window_days <= 2;
  if (shortRemoval || weekendRemoval) {
    penalty += shortRemoval ? 8 : 5;
    flags.push("REMOVAL_RISK");
  }
  if (metrics.risk_flags.includes("KEY_NONRUNNER")) {
    penalty += 10;
    flags.push("KEY_NONRUNNER_PENALTY");
  }
  if (opportunity.relisted) {
    penalty += 14;
    flags.push("POSSIBLE_DOG");
  }
  if (metrics.risk_flags.includes("SELLER_REPUTATION_RISK")) {
    penalty += 7;
    flags.push("SELLER_REPUTATION_RISK");
  }
  return { penalty, flags };
};

const computeBehaviorAdjustment = (
  metrics: OpportunityDerivedMetrics,
  profile: SniperBehaviorProfile
): number => {
  let adjustment = 0;
  const distanceFactor = clamp(profile.distance_pass_rate * 18, 0, 18);
  const fundsFactor = clamp(profile.funds_pass_rate * 18, 0, 18);
  const coordinationFactor = clamp(profile.coordination_pass_rate * 16, 0, 16);
  const riskFactor = clamp(profile.risk_pass_rate * 20, 0, 20);
  if ((metrics.estimated_distance_miles ?? 0) > 350) {
    adjustment -= distanceFactor;
  }
  if (metrics.estimated_total_cost > 6000) {
    adjustment -= fundsFactor;
  }
  if ((metrics.estimated_distance_miles ?? 0) > 250 && metrics.risk_flags.includes("REMOVAL_RISK")) {
    adjustment -= coordinationFactor;
  }
  if (metrics.risk_flags.length >= 3) {
    adjustment -= riskFactor;
  }
  return adjustment;
};

const buildQualitySignals = (metrics: OpportunityDerivedMetrics): string[] => {
  const signals: string[] = [];
  if (metrics.projected_upside >= 1200) {
    signals.push("HIGH UPSIDE");
  }
  if ((metrics.time_left_hours ?? 999) <= 16 && metrics.projected_roi_pct >= 15) {
    signals.push("FAST FLIP");
  }
  if ((metrics.risk_flags.length <= 1 && (metrics.estimated_distance_miles ?? 0) <= 180) || metrics.confidence >= 82) {
    signals.push("LOW EFFORT");
  }
  if (metrics.estimated_total_cost >= 7000 || metrics.capital_blocked) {
    signals.push("CAPITAL HEAVY");
  }
  if (metrics.risk_flags.length >= 3 || metrics.confidence < 65) {
    signals.push("HIGH RISK");
  }
  if (
    metrics.estimated_transport_cost !== null &&
    metrics.estimated_transport_cost >= 900
  ) {
    signals.push("TRANSPORT SENSITIVE");
  }
  return signals;
};

export const computeSniperScore = (
  opportunity: GovDealsOpportunity,
  metrics: OpportunityDerivedMetrics,
  behaviorProfile: SniperBehaviorProfile,
  availableLiquidCash: number
): SniperAIPick["scoring_breakdown"] => {
  const profitScore = Math.min(35, Math.max(0, (metrics.projected_upside / 2000) * 35));
  const roiScore = Math.min(20, Math.max(0, (metrics.projected_roi_pct / 35) * 20));
  const transportDistancePenalty =
    (metrics.estimated_distance_miles ?? 200) * 0.015 +
    (metrics.estimated_transport_cost ?? 250) * 0.004;
  const transportScore = Math.max(0, 16 - transportDistancePenalty);
  const confidenceScore = Math.min(18, Math.max(0, (metrics.confidence / 100) * 18));
  const riskPenalty = metrics.risk_flags.length * 6;
  const ehrScore =
    metrics.estimated_ehr === null
      ? 0
      : clamp(((metrics.estimated_ehr - 45) / 45) * 12, -8, 12);
  const urgencyBoost =
    metrics.time_left_hours === null
      ? 0
      : metrics.time_left_hours <= 12
        ? 8
        : metrics.time_left_hours <= 24
          ? 5
          : metrics.time_left_hours <= 48
            ? 2
            : 0;
  const interestBoost =
    opportunity.interest === "interested"
      ? 5
      : opportunity.interest === "not_interested"
        ? -20
        : 0;
  const behaviorAdjustment = computeBehaviorAdjustment(metrics, behaviorProfile);
  const realWorldPenalty = computeRealWorldPenalty(opportunity, metrics).penalty;
  const capitalPenalty =
    metrics.estimated_total_cost > availableLiquidCash ? clamp((metrics.estimated_total_cost - availableLiquidCash) / 450, 6, 18) : 0;

  const finalScore = normalizeScore(
    profitScore +
      roiScore +
      transportScore +
      confidenceScore +
      ehrScore +
      urgencyBoost +
      interestBoost -
      realWorldPenalty +
      behaviorAdjustment -
      capitalPenalty -
      riskPenalty
  );

  return {
    profit_score: Number(profitScore.toFixed(2)),
    roi_score: Number(roiScore.toFixed(2)),
    transport_score: Number(transportScore.toFixed(2)),
    confidence_score: Number(confidenceScore.toFixed(2)),
    ehr_score: Number(ehrScore.toFixed(2)),
    urgency_boost: Number(urgencyBoost.toFixed(2)),
    interest_adjustment: Number(interestBoost.toFixed(2)),
    behavior_adjustment: Number(behaviorAdjustment.toFixed(2)),
    risk_penalty: Number(riskPenalty.toFixed(2)),
    real_world_penalty: Number(realWorldPenalty.toFixed(2)),
    capital_penalty: Number(capitalPenalty.toFixed(2)),
    final_score: finalScore,
  };
};

export const buildSniperExplanation = (
  opportunity: GovDealsOpportunity,
  metrics: OpportunityDerivedMetrics,
  scoring: SniperAIPick["scoring_breakdown"]
): string => {
  const parts: string[] = [
    `Ranked with ${formatUsd(metrics.projected_upside)} projected profit`,
    `${metrics.projected_roi_pct.toFixed(1)}% ROI`,
    metrics.estimated_ehr === null ? "EHR pending" : `EHR est. ${formatUsd(metrics.estimated_ehr)}/hr`,
    metrics.estimated_transport_cost === null
      ? "transport pending confirmation"
      : `distance ${metrics.estimated_distance_miles ?? "N/A"} mi / transport ${formatUsd(
            metrics.estimated_transport_cost
          )}`,
    `confidence ${metrics.confidence}`,
  ];
  const appliedPenaltyFlags = [
    metrics.risk_flags.includes("CAPITAL_LOCK") ? "CAPITAL_LOCK" : null,
    metrics.risk_flags.includes("REMOVAL_RISK") ? "REMOVAL_RISK" : null,
    metrics.risk_flags.includes("KEY_NONRUNNER_PENALTY") ? "KEY_NONRUNNER_PENALTY" : null,
    metrics.risk_flags.includes("POSSIBLE_DOG") ? "POSSIBLE_DOG" : null,
    metrics.risk_flags.includes("SELLER_REPUTATION_RISK") ? "SELLER_REPUTATION_RISK" : null,
    metrics.risk_flags.includes("CAPITAL_BLOCKED") ? "CAPITAL_BLOCKED" : null,
  ].filter((item): item is string => item !== null);
  const riskText =
    metrics.risk_flags.length > 0 ? `Risk: ${metrics.risk_flags.join(", ")}` : "Risk: none flagged";
  const penaltyText =
    appliedPenaltyFlags.length > 0
      ? `Penalty drivers: ${appliedPenaltyFlags.join(", ")}.`
      : "No major operator penalties applied.";
  const scoreText = `Score drivers → profit ${scoring.profit_score.toFixed(1)}, ROI ${scoring.roi_score.toFixed(
    1
  )}, EHR ${scoring.ehr_score.toFixed(1)}, risk -${scoring.risk_penalty.toFixed(
    1
  )}, real-world -${scoring.real_world_penalty.toFixed(1)}.`;
  if (opportunity.interest === "interested") {
    parts.push("prior interest signal detected");
  }
  return `${parts.join(", ")}. ${riskText}. ${penaltyText} ${scoreText}`;
};

const formatUsd = (value: number): string => `$${value.toFixed(0)}`;

export const buildSniperAIPicks = (
  opportunities: GovDealsOpportunity[],
  operatorBaseState: string,
  previewsById: Record<string, OpportunityPreviewSnapshot | undefined>,
  decisions: SniperDecisionRecord[] = [],
  availableLiquidCash = Number.POSITIVE_INFINITY
): SniperAIPick[] =>
  (() => {
    const behaviorProfile = computeBehaviorProfileFromDecisions(decisions);
    const sellerRiskCounts = opportunities.reduce<Record<string, number>>((acc, opportunity) => {
      const key = opportunity.seller_agency.trim().toLowerCase();
      if (!key) {
        return acc;
      }
      const conditionLower = opportunity.condition_raw.toLowerCase();
      const isBadSignal =
        opportunity.relisted ||
        conditionLower.includes("bad listing") ||
        conditionLower.includes("repeat issue");
      if (isBadSignal) {
        acc[key] = (acc[key] ?? 0) + 1;
      }
      return acc;
    }, {});

    return opportunities
    .map((opportunity) => {
      const rawMetrics = computeOpportunityDerivedMetrics(
        opportunity,
        operatorBaseState,
        previewsById[opportunity.id],
        availableLiquidCash
      );
      const sellerKey = opportunity.seller_agency.trim().toLowerCase();
      const sellerReputationRisk = sellerKey ? (sellerRiskCounts[sellerKey] ?? 0) >= 2 : false;
      const metrics: OpportunityDerivedMetrics = sellerReputationRisk
        ? {
            ...rawMetrics,
            risk_flags: rawMetrics.risk_flags.includes("SELLER_REPUTATION_RISK")
              ? rawMetrics.risk_flags
              : [...rawMetrics.risk_flags, "SELLER_REPUTATION_RISK"],
          }
        : rawMetrics;
      const scoring = computeSniperScore(opportunity, metrics, behaviorProfile, availableLiquidCash);
      return {
        opportunity,
        metrics,
        score: scoring.final_score,
        explanation: buildSniperExplanation(opportunity, metrics, scoring),
        quality_signals: buildQualitySignals(metrics),
        scoring_breakdown: scoring,
      };
    })
    .filter(({ opportunity, metrics }) => {
      if (opportunity.interest === "not_interested") {
        return false;
      }
      if (opportunity.status === "converted") {
        return false;
      }
      if (metrics.projected_upside < 500) {
        return false;
      }
      if (metrics.confidence < SNIPER_CONFIDENCE_THRESHOLD) {
        return false;
      }
      if (hasMajorExcludedRisk(metrics.risk_flags)) {
        return false;
      }
      if (!hasReasonableTransportEconomics(metrics)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.score - a.score);
  })();

export const createSniperDecisionRecord = (
  opportunity: GovDealsOpportunity,
  score: number,
  decision: "approved" | "passed",
  passReason: SniperPassReason | null,
  note: string | null
): SniperDecisionRecord => ({
  id: `sniper-${crypto.randomUUID()}`,
  opportunity_id: opportunity.id,
  decision,
  pass_reason: passReason,
  note: note?.trim() ? note.trim() : null,
  decided_at: new Date().toISOString(),
  score_at_decision: score,
  opportunity_snapshot: { ...opportunity },
});

export const createInterestSignalRecord = (
  opportunity: GovDealsOpportunity,
  interest: OpportunityInterest
): InterestSignalRecord => ({
  id: `interest-${crypto.randomUUID()}`,
  opportunity_id: opportunity.id,
  interest,
  decided_at: new Date().toISOString(),
  opportunity_snapshot: { ...opportunity, interest },
});

const getLatestDecisionByOpportunity = (
  decisions: SniperDecisionRecord[]
): Record<string, SniperDecisionRecord> => {
  const latest: Record<string, SniperDecisionRecord> = {};
  decisions.forEach((decision) => {
    const current = latest[decision.opportunity_id];
    if (!current || Date.parse(decision.decided_at) >= Date.parse(current.decided_at)) {
      latest[decision.opportunity_id] = decision;
    }
  });
  return latest;
};

export const computeSniperDashboardSummary = (
  picks: SniperAIPick[],
  opportunities: GovDealsOpportunity[],
  decisions: SniperDecisionRecord[]
): SniperDashboardSummary => {
  const latestByOpportunity = getLatestDecisionByOpportunity(decisions);
  let approvedNotActedOn = 0;
  const passedBreakdown = {
    distance: 0,
    funds: 0,
    coordination: 0,
    risk: 0,
    other: 0,
  };

  Object.entries(latestByOpportunity).forEach(([opportunityId, decision]) => {
    const opportunity = opportunities.find((item) => item.id === opportunityId);
    if (!opportunity) {
      return;
    }
    if (decision.decision === "approved" && opportunity.status !== "converted") {
      approvedNotActedOn += 1;
      return;
    }
    if (decision.decision === "passed" && decision.pass_reason) {
      passedBreakdown[decision.pass_reason] += 1;
    }
  });

  return {
    picks_count: picks.length,
    approved_not_acted_on: approvedNotActedOn,
    passed_breakdown: passedBreakdown,
  };
};
