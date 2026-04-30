import { db } from "../db/sqlite";
import type {
  OpportunitiesFeedResponse,
  OpportunityCriticalField,
  OpportunityDecisionAction,
  OpportunityDecisionRecord,
  OpportunityEditableFields,
  OpportunityImportReviewResponse,
  OpportunityImportStatus,
  OpportunityInterest,
  OpportunityRecord,
  OpportunityRawImportFields,
  OpportunitySource,
  OpportunityStatus,
  OpportunityTitleStatus,
  OpportunityValueLayer,
  OpportunityValueLayers,
} from "../models/opportunities";

const nowIso = (): string => new Date().toISOString();

class OpportunityValidationError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(message: string, code: string, details: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

interface ConfirmImportPayload {
  source: OpportunityImportReviewResponse["source"];
  listing_url: string;
  canonical_url: string;
  account_id: string | null;
  item_id: string | null;
  listing_id: string | null;
  raw_fields: OpportunityRawImportFields | null;
  parsed_fields: OpportunityImportReviewResponse["parsed_fields"];
  missing_fields: OpportunityCriticalField[];
  import_status: OpportunityImportStatus;
  import_confidence: number | null;
  blocked_reason: string | null;
  parser_error: string | null;
  operator_overrides: Partial<OpportunityEditableFields> | null;
}

const OPPORTUNITY_SELECT_COLUMNS = `id, source, account_id, item_id, listing_id, listing_url, canonical_url, title, category, current_bid, auction_end,
  location, seller_agency, seller_type, buyer_premium_pct, buyer_premium_explicit, removal_window_days, title_status, relisted, condition_raw,
  description, attachment_links, seller_contact, estimated_resale_value, estimated_transport_override, estimated_repair_cost, quantity_purchased,
  quantity_broken, import_status, import_confidence, import_missing_fields, raw_import_data, operator_overrides, value_layers, blocked_reason,
  parser_error, imported_at, status, interest, created_at`;

const CRITICAL_IMPORT_FIELDS: OpportunityCriticalField[] = [
  "identity",
  "title",
  "current_bid",
  "auction_end",
  "location",
  "seller_agency",
];

const EDITABLE_KEYS: Array<keyof OpportunityEditableFields> = [
  "title",
  "current_bid",
  "buyer_premium_pct",
  "estimated_resale_value",
  "estimated_transport_override",
  "estimated_repair_cost",
  "quantity_purchased",
  "quantity_broken",
  "condition_raw",
  "title_status",
  "removal_window_days",
  "seller_agency",
  "seller_type",
  "location",
  "auction_end",
];

const VALUE_LAYER_KEYS = [
  "current_bid",
  "buyer_premium_pct",
  "estimated_resale_value",
  "estimated_transport_override",
  "estimated_repair_cost",
  "quantity_purchased",
  "quantity_broken",
  "title_status",
  "seller_agency",
  "location",
  "condition_raw",
] as const;

const normalizeNullableString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseNumeric = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeNonNegativeNumber = (value: unknown): number | null => {
  const parsed = parseNumeric(value);
  if (parsed === null) {
    return null;
  }
  return parsed >= 0 ? parsed : null;
};

const normalizeNullableInteger = (value: unknown): number | null => {
  const parsed = normalizeNonNegativeNumber(value);
  if (parsed === null) {
    return null;
  }
  return Math.floor(parsed);
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    return [];
  }
  return [];
};

const parseJsonRecord = (value: unknown): Record<string, unknown> | null => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
};

const normalizeBuyerPremiumPct = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.includes("$")) {
      return null;
    }
    const parsed = Number(trimmed.replace(/%/g, "").replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed > 1 ? Math.min(parsed / 100, 1) : parsed;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed > 1 ? Math.min(parsed / 100, 1) : parsed;
};

const parseImportStatus = (value: unknown): OpportunityImportStatus => {
  if (value === "valid" || value === "needs_review" || value === "blocked") {
    return value;
  }
  if (value === "active") {
    return "valid";
  }
  return "needs_review";
};

const parseSource = (value: unknown): OpportunitySource => {
  if (value === "govdeals" || value === "url_import" || value === "keyword_search") {
    return "govdeals";
  }
  return "manual";
};

const parseStatus = (value: unknown): OpportunityStatus => {
  if (value === "draft" || value === "new" || value === "watch" || value === "passed" || value === "converted") {
    return value;
  }
  return "draft";
};

const parseSellerType = (value: unknown): OpportunityRecord["seller_type"] =>
  value === "government" || value === "commercial" || value === "unknown" ? value : "unknown";

const parseCategory = (value: unknown): OpportunityRecord["category"] =>
  value === "vehicle" || value === "electronics" || value === "other" ? value : "other";

const parseTitleStatus = (value: unknown): OpportunityTitleStatus =>
  value === "on_site" || value === "delayed" || value === "unknown" ? value : "unknown";

const normalizeIso = (value: unknown): string | null => {
  const text = normalizeNullableString(value);
  if (!text) {
    return null;
  }
  return Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null;
};

const parseMissingFields = (value: unknown): OpportunityCriticalField[] =>
  parseStringArray(value).filter(
    (field): field is OpportunityCriticalField =>
      CRITICAL_IMPORT_FIELDS.includes(field as OpportunityCriticalField)
  );

const parseRawImportData = (value: unknown): OpportunityRawImportFields | null => {
  const record = parseJsonRecord(value);
  if (!record) {
    return null;
  }
  return {
    account_id: normalizeNullableString(record.account_id),
    item_id: normalizeNullableString(record.item_id),
    listing_id: normalizeNullableString(record.listing_id),
    title: normalizeNullableString(record.title),
    current_bid_text: normalizeNullableString(record.current_bid_text),
    bid_increment_text: normalizeNullableString(record.bid_increment_text),
    auction_end_text: normalizeNullableString(record.auction_end_text),
    time_remaining_text: normalizeNullableString(record.time_remaining_text),
    location_text: normalizeNullableString(record.location_text),
    seller_agency_text: normalizeNullableString(record.seller_agency_text),
    seller_contact_text: normalizeNullableString(record.seller_contact_text),
    category_text: normalizeNullableString(record.category_text),
    buyer_premium_text: normalizeNullableString(record.buyer_premium_text),
    description_text: normalizeNullableString(record.description_text),
    vin_text: normalizeNullableString(record.vin_text),
    condition_text: normalizeNullableString(record.condition_text),
    quantity_text: normalizeNullableString(record.quantity_text),
    terms_text: normalizeNullableString(record.terms_text),
    attachment_links_text: normalizeNullableString(record.attachment_links_text),
  };
};

const parseEditableOverrides = (value: unknown): Partial<OpportunityEditableFields> | null => {
  const record = parseJsonRecord(value);
  if (!record) {
    return null;
  }
  const parsed: Partial<OpportunityEditableFields> = {};
  const title = normalizeNullableString(record.title);
  if (title !== null) parsed.title = title;
  if ("current_bid" in record) parsed.current_bid = normalizeNonNegativeNumber(record.current_bid);
  if ("buyer_premium_pct" in record) parsed.buyer_premium_pct = normalizeBuyerPremiumPct(record.buyer_premium_pct);
  if ("estimated_resale_value" in record) {
    parsed.estimated_resale_value = normalizeNonNegativeNumber(record.estimated_resale_value);
  }
  if ("estimated_transport_override" in record) {
    parsed.estimated_transport_override =
      record.estimated_transport_override === null
        ? null
        : normalizeNonNegativeNumber(record.estimated_transport_override);
  }
  if ("estimated_repair_cost" in record) {
    parsed.estimated_repair_cost = normalizeNonNegativeNumber(record.estimated_repair_cost);
  }
  if ("quantity_purchased" in record) parsed.quantity_purchased = normalizeNullableInteger(record.quantity_purchased);
  if ("quantity_broken" in record) parsed.quantity_broken = normalizeNullableInteger(record.quantity_broken);
  if ("condition_raw" in record) parsed.condition_raw = normalizeNullableString(record.condition_raw);
  if ("title_status" in record) parsed.title_status = parseTitleStatus(record.title_status);
  if ("removal_window_days" in record) {
    parsed.removal_window_days = normalizeNullableInteger(record.removal_window_days);
  }
  if ("seller_agency" in record) parsed.seller_agency = normalizeNullableString(record.seller_agency);
  if ("seller_type" in record) parsed.seller_type = parseSellerType(record.seller_type);
  if ("location" in record) parsed.location = normalizeNullableString(record.location);
  if ("auction_end" in record) parsed.auction_end = normalizeIso(record.auction_end);
  return Object.keys(parsed).length > 0 ? parsed : null;
};

const parseNumericFromValueLayer = (
  layerValue: unknown,
  importer: (value: unknown) => number | null
): number | null => {
  if (!layerValue || typeof layerValue !== "object") {
    return null;
  }
  const layerRecord = layerValue as Record<string, unknown>;
  return importer(layerRecord.imported_value);
};

const parseStringFromValueLayer = (layerValue: unknown): string | null => {
  if (!layerValue || typeof layerValue !== "object") {
    return null;
  }
  const layerRecord = layerValue as Record<string, unknown>;
  return normalizeNullableString(layerRecord.imported_value);
};

const buildValueLayer = <T>(importedValue: T | null, operatorOverride: T | null): OpportunityValueLayer<T> => ({
  imported_value: importedValue,
  operator_override: operatorOverride,
  effective_value: operatorOverride ?? importedValue,
});

const buildValueLayers = (
  imported: Partial<OpportunityEditableFields>,
  overrides: Partial<OpportunityEditableFields> | null
): OpportunityValueLayers => ({
  title: buildValueLayer(imported.title ?? null, overrides?.title ?? null),
  current_bid: buildValueLayer(imported.current_bid ?? null, overrides?.current_bid ?? null),
  buyer_premium_pct: buildValueLayer(imported.buyer_premium_pct ?? null, overrides?.buyer_premium_pct ?? null),
  estimated_resale_value: buildValueLayer(
    imported.estimated_resale_value ?? null,
    overrides?.estimated_resale_value ?? null
  ),
  estimated_transport_override: buildValueLayer(
    imported.estimated_transport_override ?? null,
    overrides?.estimated_transport_override ?? null
  ),
  estimated_repair_cost: buildValueLayer(
    imported.estimated_repair_cost ?? null,
    overrides?.estimated_repair_cost ?? null
  ),
  quantity_purchased: buildValueLayer(imported.quantity_purchased ?? null, overrides?.quantity_purchased ?? null),
  quantity_broken: buildValueLayer(imported.quantity_broken ?? null, overrides?.quantity_broken ?? null),
  removal_window_days: buildValueLayer(
    imported.removal_window_days ?? null,
    overrides?.removal_window_days ?? null
  ),
  title_status: buildValueLayer(imported.title_status ?? null, overrides?.title_status ?? null),
  seller_type: buildValueLayer(imported.seller_type ?? null, overrides?.seller_type ?? null),
  seller_agency: buildValueLayer(imported.seller_agency ?? null, overrides?.seller_agency ?? null),
  location: buildValueLayer(imported.location ?? null, overrides?.location ?? null),
  condition_raw: buildValueLayer(imported.condition_raw ?? null, overrides?.condition_raw ?? null),
  auction_end: buildValueLayer(imported.auction_end ?? null, overrides?.auction_end ?? null),
});

const parseValueLayers = (
  value: unknown,
  imported: Partial<OpportunityEditableFields>,
  overrides: Partial<OpportunityEditableFields> | null
): OpportunityValueLayers => {
  const record = parseJsonRecord(value);
  if (!record) {
    return buildValueLayers(imported, overrides);
  }
  const fromLayer = <T>(key: string, fallback: OpportunityValueLayer<T>): OpportunityValueLayer<T> => {
    const item = record[key];
    if (!item || typeof item !== "object") {
      return fallback;
    }
    const raw = item as Record<string, unknown>;
    return {
      imported_value: (raw.imported_value as T | null) ?? null,
      operator_override: (raw.operator_override as T | null) ?? null,
      effective_value: (raw.effective_value as T | null) ?? null,
    };
  };
  const fallback = buildValueLayers(imported, overrides);
  return {
    title: fromLayer("title", fallback.title),
    current_bid: fromLayer("current_bid", fallback.current_bid),
    buyer_premium_pct: fromLayer("buyer_premium_pct", fallback.buyer_premium_pct),
    estimated_resale_value: fromLayer("estimated_resale_value", fallback.estimated_resale_value),
    estimated_transport_override: fromLayer(
      "estimated_transport_override",
      fallback.estimated_transport_override
    ),
    estimated_repair_cost: fromLayer("estimated_repair_cost", fallback.estimated_repair_cost),
    quantity_purchased: fromLayer("quantity_purchased", fallback.quantity_purchased),
    quantity_broken: fromLayer("quantity_broken", fallback.quantity_broken),
    removal_window_days: fromLayer("removal_window_days", fallback.removal_window_days),
    title_status: fromLayer("title_status", fallback.title_status),
    seller_type: fromLayer("seller_type", fallback.seller_type),
    seller_agency: fromLayer("seller_agency", fallback.seller_agency),
    location: fromLayer("location", fallback.location),
    condition_raw: fromLayer("condition_raw", fallback.condition_raw),
    auction_end: fromLayer("auction_end", fallback.auction_end),
  };
};

const parseInterest = (value: unknown): OpportunityInterest =>
  value === "undecided" || value === "interested" || value === "not_interested"
    ? value
    : "undecided";

const parseImportSourceFromRequest = (value: unknown): OpportunityImportReviewResponse["source"] => {
  if (value === "url_import" || value === "pasted_text" || value === "manual_draft") {
    return value;
  }
  if (value === "manual_import") {
    return "manual_draft";
  }
  return "url_import";
};

const getIdentity = (record: {
  account_id: string | null;
  item_id: string | null;
  listing_id: string | null;
}): boolean =>
  Boolean(
    record.account_id &&
      record.item_id &&
      record.listing_id &&
      /^govdeals_\d+_\d+$/.test(record.listing_id)
  );

const buildMissingFields = (
  editable: Partial<OpportunityEditableFields>,
  requireIdentity: boolean,
  hasIdentity: boolean
): OpportunityCriticalField[] => {
  const missing: OpportunityCriticalField[] = [];
  if (requireIdentity && !hasIdentity) {
    missing.push("identity");
  }
  if (!editable.title) {
    missing.push("title");
  }
  if (editable.current_bid === null || editable.current_bid === undefined || editable.current_bid <= 0) {
    missing.push("current_bid");
  }
  if (!editable.auction_end || !Number.isFinite(Date.parse(editable.auction_end))) {
    missing.push("auction_end");
  }
  if (!editable.location) {
    missing.push("location");
  }
  if (!editable.seller_agency) {
    missing.push("seller_agency");
  }
  return missing;
};

const resolveImportStatus = (input: {
  requested: OpportunityImportStatus;
  blocked_reason: string | null;
  parser_error: string | null;
  hasIdentity: boolean;
  requireIdentity: boolean;
  missing_fields: OpportunityCriticalField[];
}): OpportunityImportStatus => {
  if (input.requested === "blocked" || input.blocked_reason || input.parser_error) {
    return "blocked";
  }
  if (input.requireIdentity && !input.hasIdentity) {
    return "blocked";
  }
  if (input.missing_fields.length > 0) {
    return "needs_review";
  }
  return "valid";
};

const computeImportConfidence = (
  status: OpportunityImportStatus,
  missingFields: OpportunityCriticalField[],
  hasAttachments: boolean
): number | null => {
  if (status === "blocked") {
    return null;
  }
  return Math.max(0, 100 - missingFields.length * 16 - (hasAttachments ? 0 : 4));
};

const mapOpportunityRow = (row: Record<string, unknown>): OpportunityRecord => {
  const auctionEnd = normalizeIso(row.auction_end);
  const auctionEndTs = auctionEnd ? Date.parse(auctionEnd) : Number.NaN;
  const timeLeftHours =
    Number.isFinite(auctionEndTs) ? (auctionEndTs - Date.now()) / (1000 * 60 * 60) : null;
  const imported: Partial<OpportunityEditableFields> = {
    title: normalizeNullableString(row.title),
    current_bid: normalizeNonNegativeNumber(row.current_bid),
    buyer_premium_pct: normalizeBuyerPremiumPct(row.buyer_premium_pct),
    estimated_resale_value: normalizeNonNegativeNumber(row.estimated_resale_value),
    estimated_transport_override: normalizeNonNegativeNumber(row.estimated_transport_override),
    estimated_repair_cost: normalizeNonNegativeNumber(row.estimated_repair_cost),
    quantity_purchased: normalizeNullableInteger(row.quantity_purchased),
    quantity_broken: normalizeNullableInteger(row.quantity_broken),
    condition_raw: normalizeNullableString(row.condition_raw),
    title_status: parseTitleStatus(row.title_status),
    removal_window_days: normalizeNullableInteger(row.removal_window_days),
    seller_agency: normalizeNullableString(row.seller_agency),
    seller_type: parseSellerType(row.seller_type),
    location: normalizeNullableString(row.location),
    auction_end: auctionEnd,
  };
  const overrides = parseEditableOverrides(row.operator_overrides);
  return {
    id: String(row.id),
    source: parseSource(row.source),
    account_id: normalizeNullableString(row.account_id),
    item_id: normalizeNullableString(row.item_id),
    listing_id: normalizeNullableString(row.listing_id),
    listing_url: normalizeNullableString(row.listing_url),
    canonical_url: normalizeNullableString(row.canonical_url),
    title: imported.title ?? null,
    category: parseCategory(row.category),
    current_bid: imported.current_bid,
    auction_end: auctionEnd,
    auction_state:
      timeLeftHours === null ? "unknown" : timeLeftHours <= 0 ? "ended" : "active",
    time_left_hours: timeLeftHours,
    location: imported.location ?? null,
    seller_agency: imported.seller_agency ?? null,
    seller_type: parseSellerType(row.seller_type),
    buyer_premium_pct: imported.buyer_premium_pct,
    buyer_premium_explicit: Boolean(Number(row.buyer_premium_explicit ?? 0)),
    removal_window_days: imported.removal_window_days,
    title_status: parseTitleStatus(row.title_status),
    relisted: Boolean(Number(row.relisted ?? 0)),
    condition_raw: imported.condition_raw ?? null,
    description: normalizeNullableString(row.description),
    attachment_links: parseStringArray(row.attachment_links),
    seller_contact: normalizeNullableString(row.seller_contact),
    estimated_resale_value: imported.estimated_resale_value,
    estimated_transport_override: imported.estimated_transport_override,
    estimated_repair_cost: imported.estimated_repair_cost,
    quantity_purchased: imported.quantity_purchased,
    quantity_broken: imported.quantity_broken,
    import_status: parseImportStatus(row.import_status),
    import_confidence: normalizeNonNegativeNumber(row.import_confidence),
    import_missing_fields: parseMissingFields(row.import_missing_fields),
    raw_import_data: parseRawImportData(row.raw_import_data),
    operator_overrides: overrides,
    value_layers: parseValueLayers(row.value_layers, imported, overrides),
    blocked_reason: normalizeNullableString(row.blocked_reason),
    parser_error: normalizeNullableString(row.parser_error),
    imported_at: normalizeIso(row.imported_at),
    status: parseStatus(row.status),
    interest: parseInterest(row.interest),
    created_at: normalizeIso(row.created_at) ?? nowIso(),
  };
};

const fallbackSnapshot = (opportunityId: string): OpportunityRecord => ({
  id: opportunityId,
  source: "manual",
  account_id: null,
  item_id: null,
  listing_id: null,
  listing_url: null,
  canonical_url: null,
  title: null,
  category: "other",
  current_bid: null,
  auction_end: null,
  auction_state: "unknown",
  time_left_hours: null,
  location: null,
  seller_agency: null,
  seller_type: "unknown",
  buyer_premium_pct: null,
  buyer_premium_explicit: false,
  removal_window_days: null,
  title_status: "unknown",
  relisted: false,
  condition_raw: null,
  description: null,
  attachment_links: [],
  seller_contact: null,
  estimated_resale_value: null,
  estimated_transport_override: null,
  estimated_repair_cost: null,
  quantity_purchased: null,
  quantity_broken: null,
  import_status: "needs_review",
  import_confidence: null,
  import_missing_fields: [...CRITICAL_IMPORT_FIELDS],
  raw_import_data: null,
  operator_overrides: null,
  value_layers: null,
  blocked_reason: "Missing snapshot record",
  parser_error: null,
  imported_at: null,
  status: "draft",
  interest: "undecided",
  created_at: nowIso(),
});

const mapDecisionRow = (row: Record<string, unknown>): OpportunityDecisionRecord => {
  let parsedSnapshot: OpportunityRecord | null = null;
  if (typeof row.opportunity_snapshot === "string") {
    try {
      parsedSnapshot = JSON.parse(row.opportunity_snapshot) as OpportunityRecord;
    } catch {
      parsedSnapshot = null;
    }
  }
  return {
    id: String(row.id),
    opportunity_id: String(row.opportunity_id),
    action: row.action === "watch" || row.action === "must_buy" || row.action === "pass" ? row.action : "watch",
    reason: normalizeNullableString(row.reason),
    note: normalizeNullableString(row.note),
    decided_at: normalizeIso(row.decided_at) ?? nowIso(),
    opportunity_snapshot: parsedSnapshot ?? fallbackSnapshot(String(row.opportunity_id)),
  };
};

const selectOpportunityRowById = (id: string): Record<string, unknown> | undefined =>
  db
    .prepare(`SELECT ${OPPORTUNITY_SELECT_COLUMNS} FROM opportunities WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;

const findExistingOpportunityByListingId = (listingId: string): Record<string, unknown> | undefined =>
  db
    .prepare(
      `SELECT ${OPPORTUNITY_SELECT_COLUMNS}
       FROM opportunities
       WHERE listing_id = ?
       ORDER BY datetime(imported_at) DESC, datetime(created_at) DESC
       LIMIT 1`
    )
    .get(listingId) as Record<string, unknown> | undefined;

const normalizeReviewPayload = (raw: unknown): ConfirmImportPayload => {
  if (!raw || typeof raw !== "object") {
    throw new OpportunityValidationError("Invalid import payload", "INVALID_IMPORT_PAYLOAD");
  }
  const parsed = raw as Record<string, unknown>;
  const reviewRecord = parsed.review as OpportunityImportReviewResponse | undefined;
  if (!reviewRecord || typeof reviewRecord !== "object") {
    throw new OpportunityValidationError("review object is required", "MISSING_REVIEW");
  }
  return {
    source: parseImportSourceFromRequest(reviewRecord.source ?? parsed.source),
    listing_url: normalizeNullableString(reviewRecord.listing_url) ?? "",
    canonical_url: normalizeNullableString(reviewRecord.canonical_url) ?? "",
    account_id: normalizeNullableString(reviewRecord.account_id),
    item_id: normalizeNullableString(reviewRecord.item_id),
    listing_id: normalizeNullableString(reviewRecord.listing_id),
    raw_fields: reviewRecord.raw_fields ?? null,
    parsed_fields: reviewRecord.parsed_fields ?? ({} as OpportunityImportReviewResponse["parsed_fields"]),
    missing_fields: Array.isArray(reviewRecord.missing_fields) ? reviewRecord.missing_fields : [],
    import_status: parseImportStatus(reviewRecord.import_status),
    import_confidence:
      reviewRecord.import_confidence === null ? null : normalizeNonNegativeNumber(reviewRecord.import_confidence),
    blocked_reason: normalizeNullableString(reviewRecord.blocked_reason),
    parser_error: normalizeNullableString(reviewRecord.parser_error),
    operator_overrides: parseEditableOverrides(parsed.operator_overrides),
  };
};

const composeEditableImported = (
  parsed: OpportunityImportReviewResponse["parsed_fields"]
): Partial<OpportunityEditableFields> => ({
  title: normalizeNullableString(parsed.title),
  current_bid: normalizeNonNegativeNumber(parsed.current_bid),
  buyer_premium_pct: normalizeBuyerPremiumPct(parsed.buyer_premium_pct),
  estimated_resale_value: normalizeNonNegativeNumber(parsed.estimated_resale_value),
  estimated_transport_override: normalizeNonNegativeNumber(parsed.estimated_transport_override),
  estimated_repair_cost: normalizeNonNegativeNumber(parsed.estimated_repair_cost),
  quantity_purchased: normalizeNullableInteger(parsed.quantity_purchased),
  quantity_broken: normalizeNullableInteger(parsed.quantity_broken),
  condition_raw: normalizeNullableString(parsed.condition_raw),
  title_status: parseTitleStatus(parsed.title_status),
  removal_window_days: normalizeNullableInteger(parsed.removal_window_days),
  seller_agency: normalizeNullableString(parsed.seller_agency),
  seller_type: parseSellerType(parsed.seller_type),
  location: normalizeNullableString(parsed.location),
  auction_end: normalizeIso(parsed.auction_end),
});

const resolveEditableEffective = (
  imported: Partial<OpportunityEditableFields>,
  overrides: Partial<OpportunityEditableFields> | null
): Partial<OpportunityEditableFields> => {
  const resolved: Partial<OpportunityEditableFields> = {};
  EDITABLE_KEYS.forEach((key) => {
    resolved[key] = (overrides?.[key] ?? imported[key] ?? null) as never;
  });
  return resolved;
};

const parseSourceToStored = (
  source: ConfirmImportPayload["source"],
  hasIdentity: boolean
): OpportunitySource => {
  if (source === "manual_draft") {
    return "manual";
  }
  return hasIdentity ? "govdeals" : "manual";
};

const assertGovDealsIdentity = (payload: ConfirmImportPayload): void => {
  if (!payload.account_id || !payload.item_id || !payload.listing_id) {
    throw new OpportunityValidationError(
      "GovDeals identity is required (account_id, item_id, listing_id)",
      "IDENTITY_REQUIRED",
      {
        missing_fields: ["account_id", "item_id", "listing_id"],
      }
    );
  }
  const expectedListingId = `govdeals_${payload.account_id}_${payload.item_id}`;
  if (payload.listing_id !== expectedListingId) {
    throw new OpportunityValidationError(
      "listing_id must match govdeals_<account_id>_<item_id>",
      "LISTING_ID_MISMATCH",
      { expected: expectedListingId, received: payload.listing_id }
    );
  }
  if (!payload.listing_url || !payload.canonical_url) {
    throw new OpportunityValidationError(
      "listing_url and canonical_url are required for GovDeals imports",
      "MISSING_URL_IDENTITY",
      {
        missing_fields: [
          ...(!payload.listing_url ? ["listing_url"] : []),
          ...(!payload.canonical_url ? ["canonical_url"] : []),
        ],
      }
    );
  }
};

export const listOpportunitiesFeed = (): OpportunitiesFeedResponse => {
  const polledAt = nowIso();
  const opportunities = (
    db
      .prepare(`SELECT ${OPPORTUNITY_SELECT_COLUMNS} FROM opportunities ORDER BY datetime(created_at) DESC`)
      .all() as Array<Record<string, unknown>>
  ).map(mapOpportunityRow);
  const decisions = (
    db
      .prepare(
        `SELECT id, opportunity_id, action, reason, note, decided_at, opportunity_snapshot
         FROM opportunity_decisions
         ORDER BY datetime(decided_at) DESC`
      )
      .all() as Array<Record<string, unknown>>
  ).map(mapDecisionRow);
  return {
    status: opportunities.length === 0 ? "valid_empty" : "feed_offline",
    feed_mode: "manual_persisted",
    last_polled_at: polledAt,
    generated_at: polledAt,
    opportunities,
    decisions,
    message:
      opportunities.length === 0
        ? "No opportunities stored yet."
        : "Manual opportunity feed is available from persisted backend records.",
    error: null,
  };
};

export const replaceOpportunities = (
  payload: unknown
): { feed: OpportunitiesFeedResponse; saved_count: number } => {
  if (!payload || typeof payload !== "object") {
    throw new OpportunityValidationError("Invalid opportunities sync payload", "INVALID_SYNC_PAYLOAD");
  }
  const parsed = payload as { opportunities?: unknown };
  if (!Array.isArray(parsed.opportunities)) {
    throw new OpportunityValidationError("opportunities must be an array", "INVALID_SYNC_ARRAY");
  }
  db.transaction(() => {
    db.prepare("DELETE FROM opportunities").run();
    parsed.opportunities?.forEach((raw) => {
      if (!raw || typeof raw !== "object") {
        return;
      }
      const record = mapOpportunityRow(raw as Record<string, unknown>);
      db.prepare(
        `INSERT INTO opportunities (
          id, source, account_id, item_id, listing_id, listing_url, canonical_url, title, category, current_bid, auction_end,
          location, seller_agency, seller_type, buyer_premium_pct, buyer_premium_explicit, removal_window_days, title_status, relisted,
          condition_raw, description, attachment_links, seller_contact, estimated_resale_value, estimated_transport_override, estimated_repair_cost,
          quantity_purchased, quantity_broken, import_status, import_confidence, import_missing_fields, raw_import_data, operator_overrides,
          value_layers, blocked_reason, parser_error, imported_at, status, interest, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        record.id,
        record.source,
        record.account_id,
        record.item_id,
        record.listing_id,
        record.listing_url,
        record.canonical_url,
        record.title,
        record.category,
        record.current_bid,
        record.auction_end,
        record.location,
        record.seller_agency,
        record.seller_type,
        record.buyer_premium_pct,
        record.buyer_premium_explicit ? 1 : 0,
        record.removal_window_days,
        record.title_status,
        record.relisted ? 1 : 0,
        record.condition_raw,
        record.description,
        JSON.stringify(record.attachment_links),
        record.seller_contact,
        record.estimated_resale_value,
        record.estimated_transport_override,
        record.estimated_repair_cost,
        record.quantity_purchased,
        record.quantity_broken,
        record.import_status,
        record.import_confidence,
        JSON.stringify(record.import_missing_fields),
        record.raw_import_data ? JSON.stringify(record.raw_import_data) : null,
        record.operator_overrides ? JSON.stringify(record.operator_overrides) : null,
        record.value_layers ? JSON.stringify(record.value_layers) : null,
        record.blocked_reason,
        record.parser_error,
        record.imported_at,
        record.status,
        record.interest,
        record.created_at
      );
    });
  })();
  return {
    saved_count: parsed.opportunities.length,
    feed: listOpportunitiesFeed(),
  };
};

export const confirmOpportunityImport = (
  payload: unknown
): {
  stored_opportunity: OpportunityRecord;
  dedupe_action: "created" | "updated_existing";
  feed: OpportunitiesFeedResponse;
} => {
  const normalized = normalizeReviewPayload(payload);
  const hasIdentity = getIdentity({
    account_id: normalized.account_id,
    item_id: normalized.item_id,
    listing_id: normalized.listing_id,
  });
  const storedSource = parseSourceToStored(normalized.source, hasIdentity);
  const isGovDealsImport = storedSource === "govdeals";
  if (isGovDealsImport) {
    assertGovDealsIdentity(normalized);
  }

  const importedEditable = composeEditableImported(normalized.parsed_fields);
  const effectiveEditable = resolveEditableEffective(importedEditable, normalized.operator_overrides);
  const missingFields = buildMissingFields(effectiveEditable, isGovDealsImport, hasIdentity);
  const computedStatus = resolveImportStatus({
    requested: normalized.import_status,
    blocked_reason: normalized.blocked_reason,
    parser_error: normalized.parser_error,
    hasIdentity,
    requireIdentity: isGovDealsImport,
    missing_fields: missingFields,
  });
  if (computedStatus === "blocked") {
    throw new OpportunityValidationError(
      "Blocked import cannot be confirmed. Fix identity/critical fields or use manual draft.",
      "IMPORT_BLOCKED",
      {
        missing_fields: missingFields,
        blocked_reason: normalized.blocked_reason ?? "blocked",
      }
    );
  }

  const listingIdForDedupe = normalized.listing_id;
  const existingRow =
    isGovDealsImport && listingIdForDedupe
      ? findExistingOpportunityByListingId(listingIdForDedupe)
      : undefined;
  const existing = existingRow ? mapOpportunityRow(existingRow) : null;
  const valueLayers = buildValueLayers(importedEditable, normalized.operator_overrides);
  const importStatus: OpportunityImportStatus =
    storedSource === "manual" ? "needs_review" : computedStatus;
  const recordStatus: OpportunityStatus =
    storedSource === "manual" ? "draft" : existing?.status ?? "new";
  const buyerPremiumExplicit = Boolean(
    normalized.parsed_fields.buyer_premium_explicit ||
      (normalized.raw_fields?.buyer_premium_text && /%/.test(normalized.raw_fields.buyer_premium_text))
  );
  const importConfidence =
    normalized.import_confidence ??
    computeImportConfidence(importStatus, missingFields, (normalized.parsed_fields.attachment_links ?? []).length > 0);

  const record: OpportunityRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    source: storedSource,
    account_id: normalized.account_id,
    item_id: normalized.item_id,
    listing_id: normalized.listing_id,
    listing_url: normalizeNullableString(normalized.listing_url),
    canonical_url: normalizeNullableString(normalized.canonical_url),
    title: effectiveEditable.title ?? null,
    category: parseCategory(normalized.parsed_fields.category),
    current_bid: valueLayers.current_bid.effective_value,
    auction_end: valueLayers.auction_end?.effective_value ?? effectiveEditable.auction_end ?? null,
    auction_state: "unknown",
    time_left_hours: null,
    location: valueLayers.location.effective_value,
    seller_agency: valueLayers.seller_agency.effective_value,
    seller_type: parseSellerType(effectiveEditable.seller_type),
    buyer_premium_pct: valueLayers.buyer_premium_pct.effective_value,
    buyer_premium_explicit: buyerPremiumExplicit,
    removal_window_days: normalizeNullableInteger(effectiveEditable.removal_window_days),
    title_status: parseTitleStatus(effectiveEditable.title_status),
    relisted: existing?.relisted ?? false,
    condition_raw: valueLayers.condition_raw.effective_value,
    description: normalizeNullableString(normalized.parsed_fields.description),
    attachment_links: (normalized.parsed_fields.attachment_links ?? []).filter(
      (item): item is string => typeof item === "string"
    ),
    seller_contact: normalizeNullableString(normalized.parsed_fields.seller_contact),
    estimated_resale_value: valueLayers.estimated_resale_value.effective_value,
    estimated_transport_override: valueLayers.estimated_transport_override.effective_value,
    estimated_repair_cost: valueLayers.estimated_repair_cost.effective_value,
    quantity_purchased: valueLayers.quantity_purchased.effective_value,
    quantity_broken: valueLayers.quantity_broken.effective_value,
    import_status: importStatus,
    import_confidence: importConfidence,
    import_missing_fields: missingFields,
    raw_import_data: normalized.raw_fields,
    operator_overrides: normalized.operator_overrides,
    value_layers: valueLayers,
    blocked_reason: normalized.blocked_reason,
    parser_error: normalized.parser_error,
    imported_at: nowIso(),
    status: recordStatus,
    interest: existing?.interest ?? "undecided",
    created_at: existing?.created_at ?? nowIso(),
  };

  db.transaction(() => {
    if (existing) {
      db.prepare(
        `UPDATE opportunities
         SET source = ?, account_id = ?, item_id = ?, listing_id = ?, listing_url = ?, canonical_url = ?, title = ?, category = ?, current_bid = ?,
             auction_end = ?, location = ?, seller_agency = ?, seller_type = ?, buyer_premium_pct = ?, buyer_premium_explicit = ?,
             removal_window_days = ?, title_status = ?, relisted = ?, condition_raw = ?, description = ?, attachment_links = ?, seller_contact = ?,
             estimated_resale_value = ?, estimated_transport_override = ?, estimated_repair_cost = ?, quantity_purchased = ?, quantity_broken = ?,
             import_status = ?, import_confidence = ?, import_missing_fields = ?, raw_import_data = ?, operator_overrides = ?, value_layers = ?,
             blocked_reason = ?, parser_error = ?, imported_at = ?, status = ?, interest = ?
         WHERE id = ?`
      ).run(
        record.source,
        record.account_id,
        record.item_id,
        record.listing_id,
        record.listing_url,
        record.canonical_url,
        record.title,
        record.category,
        record.current_bid,
        record.auction_end,
        record.location,
        record.seller_agency,
        record.seller_type,
        record.buyer_premium_pct,
        record.buyer_premium_explicit ? 1 : 0,
        record.removal_window_days,
        record.title_status,
        record.relisted ? 1 : 0,
        record.condition_raw,
        record.description,
        JSON.stringify(record.attachment_links),
        record.seller_contact,
        record.estimated_resale_value,
        record.estimated_transport_override,
        record.estimated_repair_cost,
        record.quantity_purchased,
        record.quantity_broken,
        record.import_status,
        record.import_confidence,
        JSON.stringify(record.import_missing_fields),
        record.raw_import_data ? JSON.stringify(record.raw_import_data) : null,
        record.operator_overrides ? JSON.stringify(record.operator_overrides) : null,
        record.value_layers ? JSON.stringify(record.value_layers) : null,
        record.blocked_reason,
        record.parser_error,
        record.imported_at,
        record.status,
        record.interest,
        record.id
      );
      return;
    }

    db.prepare(
      `INSERT INTO opportunities (
        id, source, account_id, item_id, listing_id, listing_url, canonical_url, title, category, current_bid, auction_end, location, seller_agency,
        seller_type, buyer_premium_pct, buyer_premium_explicit, removal_window_days, title_status, relisted, condition_raw, description, attachment_links,
        seller_contact, estimated_resale_value, estimated_transport_override, estimated_repair_cost, quantity_purchased, quantity_broken, import_status,
        import_confidence, import_missing_fields, raw_import_data, operator_overrides, value_layers, blocked_reason, parser_error, imported_at, status,
        interest, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      record.id,
      record.source,
      record.account_id,
      record.item_id,
      record.listing_id,
      record.listing_url,
      record.canonical_url,
      record.title,
      record.category,
      record.current_bid,
      record.auction_end,
      record.location,
      record.seller_agency,
      record.seller_type,
      record.buyer_premium_pct,
      record.buyer_premium_explicit ? 1 : 0,
      record.removal_window_days,
      record.title_status,
      record.relisted ? 1 : 0,
      record.condition_raw,
      record.description,
      JSON.stringify(record.attachment_links),
      record.seller_contact,
      record.estimated_resale_value,
      record.estimated_transport_override,
      record.estimated_repair_cost,
      record.quantity_purchased,
      record.quantity_broken,
      record.import_status,
      record.import_confidence,
      JSON.stringify(record.import_missing_fields),
      record.raw_import_data ? JSON.stringify(record.raw_import_data) : null,
      record.operator_overrides ? JSON.stringify(record.operator_overrides) : null,
      record.value_layers ? JSON.stringify(record.value_layers) : null,
      record.blocked_reason,
      record.parser_error,
      record.imported_at,
      record.status,
      record.interest,
      record.created_at
    );
  })();

  const storedRow = selectOpportunityRowById(record.id);
  if (!storedRow) {
    throw new OpportunityValidationError("Failed to store imported opportunity", "STORE_FAILED");
  }
  return {
    stored_opportunity: mapOpportunityRow(storedRow),
    dedupe_action: existing ? "updated_existing" : "created",
    feed: listOpportunitiesFeed(),
  };
};

export const overrideOpportunityValues = (
  opportunityId: string,
  payload: unknown
): { stored_opportunity: OpportunityRecord; feed: OpportunitiesFeedResponse } => {
  if (!payload || typeof payload !== "object") {
    throw new OpportunityValidationError("Invalid override payload", "INVALID_OVERRIDE_PAYLOAD");
  }
  const parsed = payload as { overrides?: unknown };
  const overrides = parseEditableOverrides(parsed.overrides ?? payload);
  if (!overrides || Object.keys(overrides).length === 0) {
    throw new OpportunityValidationError("At least one override field is required", "EMPTY_OVERRIDE");
  }

  const row = selectOpportunityRowById(opportunityId);
  if (!row) {
    throw new OpportunityValidationError("Opportunity not found", "OPPORTUNITY_NOT_FOUND");
  }
  const existing = mapOpportunityRow(row);
  const mergedOverrides = {
    ...(existing.operator_overrides ?? {}),
    ...overrides,
  };
  const importedEditable: Partial<OpportunityEditableFields> = {
    title: existing.value_layers?.title?.imported_value ?? existing.title,
    current_bid: existing.value_layers?.current_bid.imported_value ?? existing.current_bid,
    buyer_premium_pct: existing.value_layers?.buyer_premium_pct.imported_value ?? existing.buyer_premium_pct,
    estimated_resale_value:
      existing.value_layers?.estimated_resale_value.imported_value ?? existing.estimated_resale_value,
    estimated_transport_override:
      existing.value_layers?.estimated_transport_override.imported_value ?? existing.estimated_transport_override,
    estimated_repair_cost:
      existing.value_layers?.estimated_repair_cost.imported_value ?? existing.estimated_repair_cost,
    quantity_purchased: existing.value_layers?.quantity_purchased.imported_value ?? existing.quantity_purchased,
    quantity_broken: existing.value_layers?.quantity_broken.imported_value ?? existing.quantity_broken,
    condition_raw: existing.value_layers?.condition_raw.imported_value ?? existing.condition_raw,
    title_status: existing.value_layers?.title_status.imported_value ?? existing.title_status,
    removal_window_days: existing.removal_window_days,
    seller_agency: existing.value_layers?.seller_agency.imported_value ?? existing.seller_agency,
    seller_type: existing.seller_type,
    location: existing.value_layers?.location.imported_value ?? existing.location,
    auction_end: existing.auction_end,
  };
  const effective = resolveEditableEffective(importedEditable, mergedOverrides);
  const identityOk = getIdentity(existing);
  const missingFields = buildMissingFields(effective, existing.source === "govdeals", identityOk);
  const importStatus = resolveImportStatus({
    requested: existing.import_status,
    blocked_reason: existing.blocked_reason,
    parser_error: existing.parser_error,
    hasIdentity: identityOk,
    requireIdentity: existing.source === "govdeals",
    missing_fields: missingFields,
  });
  const confidence = computeImportConfidence(importStatus, missingFields, existing.attachment_links.length > 0);
  const valueLayers = buildValueLayers(importedEditable, mergedOverrides);

  db.prepare(
    `UPDATE opportunities
     SET title = ?, current_bid = ?, buyer_premium_pct = ?, estimated_resale_value = ?, estimated_transport_override = ?,
         estimated_repair_cost = ?, quantity_purchased = ?, quantity_broken = ?, condition_raw = ?, title_status = ?, removal_window_days = ?,
         seller_agency = ?, seller_type = ?, location = ?, auction_end = ?, operator_overrides = ?, value_layers = ?, import_status = ?,
         import_confidence = ?, import_missing_fields = ?
     WHERE id = ?`
  ).run(
    effective.title,
    valueLayers.current_bid.effective_value,
    valueLayers.buyer_premium_pct.effective_value,
    valueLayers.estimated_resale_value.effective_value,
    valueLayers.estimated_transport_override.effective_value,
    valueLayers.estimated_repair_cost.effective_value,
    valueLayers.quantity_purchased.effective_value,
    valueLayers.quantity_broken.effective_value,
    valueLayers.condition_raw.effective_value,
    valueLayers.title_status.effective_value,
    effective.removal_window_days,
    valueLayers.seller_agency.effective_value,
    effective.seller_type,
    valueLayers.location.effective_value,
    effective.auction_end,
    JSON.stringify(mergedOverrides),
    JSON.stringify(valueLayers),
    importStatus,
    confidence,
    JSON.stringify(missingFields),
    opportunityId
  );

  const storedRow = selectOpportunityRowById(opportunityId);
  if (!storedRow) {
    throw new OpportunityValidationError("Failed to store opportunity override", "OVERRIDE_STORE_FAILED");
  }
  return {
    stored_opportunity: mapOpportunityRow(storedRow),
    feed: listOpportunitiesFeed(),
  };
};

const parseInterestInput = (value: unknown): OpportunityInterest => {
  if (value === "undecided" || value === "interested" || value === "not_interested") {
    return value;
  }
  throw new OpportunityValidationError(
    "interest must be one of: undecided, interested, not_interested",
    "INVALID_INTEREST"
  );
};

export const updateOpportunityInterest = (
  opportunityId: string,
  payload: unknown
): { stored_opportunity: OpportunityRecord; feed: OpportunitiesFeedResponse } => {
  if (!payload || typeof payload !== "object") {
    throw new OpportunityValidationError("Invalid interest payload", "INVALID_INTEREST_PAYLOAD");
  }
  const parsed = payload as { interest?: unknown };
  const interest = parseInterestInput(parsed.interest);
  const row = selectOpportunityRowById(opportunityId);
  if (!row) {
    throw new OpportunityValidationError("Opportunity not found", "OPPORTUNITY_NOT_FOUND");
  }
  db.prepare(`UPDATE opportunities SET interest = ? WHERE id = ?`).run(interest, opportunityId);
  const stored = selectOpportunityRowById(opportunityId);
  if (!stored) {
    throw new OpportunityValidationError("Failed to update opportunity interest", "INTEREST_UPDATE_FAILED");
  }
  return {
    stored_opportunity: mapOpportunityRow(stored),
    feed: listOpportunitiesFeed(),
  };
};

const parseStatusInput = (value: unknown): OpportunityStatus => {
  if (value === "draft" || value === "new" || value === "watch" || value === "passed" || value === "converted") {
    return value;
  }
  throw new OpportunityValidationError(
    "status must be one of: draft, new, watch, passed, converted",
    "INVALID_STATUS"
  );
};

export const updateOpportunityStatus = (
  opportunityId: string,
  payload: unknown
): { stored_opportunity: OpportunityRecord; feed: OpportunitiesFeedResponse } => {
  if (!payload || typeof payload !== "object") {
    throw new OpportunityValidationError("Invalid status payload", "INVALID_STATUS_PAYLOAD");
  }
  const parsed = payload as { status?: unknown };
  const status = parseStatusInput(parsed.status);
  const row = selectOpportunityRowById(opportunityId);
  if (!row) {
    throw new OpportunityValidationError("Opportunity not found", "OPPORTUNITY_NOT_FOUND");
  }
  db.prepare(`UPDATE opportunities SET status = ? WHERE id = ?`).run(status, opportunityId);
  const stored = selectOpportunityRowById(opportunityId);
  if (!stored) {
    throw new OpportunityValidationError("Failed to update opportunity status", "STATUS_UPDATE_FAILED");
  }
  return {
    stored_opportunity: mapOpportunityRow(stored),
    feed: listOpportunitiesFeed(),
  };
};

const parseDecisionAction = (value: unknown): OpportunityDecisionAction => {
  if (value === "watch" || value === "must_buy" || value === "pass") {
    return value;
  }
  throw new OpportunityValidationError("action must be one of: watch, must_buy, pass", "INVALID_DECISION_ACTION");
};

export const saveOpportunityDecision = (
  opportunityId: string,
  payload: unknown
): { stored_decision: OpportunityDecisionRecord; feed: OpportunitiesFeedResponse } => {
  if (!payload || typeof payload !== "object") {
    throw new OpportunityValidationError("Invalid decision payload", "INVALID_DECISION_PAYLOAD");
  }
  const parsed = payload as { action?: unknown; reason?: unknown; note?: unknown };
  const action = parseDecisionAction(parsed.action);
  const reason = normalizeNullableString(parsed.reason);
  const note = normalizeNullableString(parsed.note);
  if (action === "pass" && !reason) {
    throw new OpportunityValidationError("reason is required when action=pass", "MISSING_PASS_REASON");
  }

  const row = selectOpportunityRowById(opportunityId);
  if (!row) {
    throw new OpportunityValidationError("Opportunity not found", "OPPORTUNITY_NOT_FOUND");
  }
  const opportunity = mapOpportunityRow(row);
  if (opportunity.import_status !== "valid") {
    throw new OpportunityValidationError(
      "Opportunity must be valid before actions",
      "OPPORTUNITY_NOT_VALID",
      {
        import_status: opportunity.import_status,
        missing_fields: opportunity.import_missing_fields,
      }
    );
  }

  const decisionId = crypto.randomUUID();
  const decidedAt = nowIso();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO opportunity_decisions
       (id, opportunity_id, action, reason, note, decided_at, opportunity_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(decisionId, opportunityId, action, reason, note, decidedAt, JSON.stringify(opportunity));
    const nextStatus: OpportunityStatus = action === "pass" ? "passed" : "watch";
    db.prepare(`UPDATE opportunities SET status = ? WHERE id = ?`).run(nextStatus, opportunityId);
  })();

  return {
    stored_decision: {
      id: decisionId,
      opportunity_id: opportunityId,
      action,
      reason,
      note,
      decided_at: decidedAt,
      opportunity_snapshot: opportunity,
    },
    feed: listOpportunitiesFeed(),
  };
};

export const isOpportunityValidationError = (value: unknown): value is OpportunityValidationError =>
  value instanceof OpportunityValidationError;

export const getOpportunityAssistantSnapshotByListingId = (
  listingId: string
): OpportunityRecord | null => {
  const normalizedListingId = normalizeNullableString(listingId);
  if (!normalizedListingId) {
    return null;
  }
  const row = findExistingOpportunityByListingId(normalizedListingId);
  if (!row) {
    return null;
  }
  return mapOpportunityRow(row);
};
