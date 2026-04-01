import { db } from "../db/sqlite";
import type {
  OpportunitiesFeedResponse,
  OpportunityCriticalField,
  OpportunityDecisionAction,
  OpportunityDecisionRecord,
  OpportunityEditableFields,
  OpportunityGuardrailFlag,
  OpportunityImportReviewResponse,
  OpportunityImportStatus,
  OpportunityInterest,
  OpportunityRecord,
  OpportunityRawImportFields,
  OpportunityStatus,
  OpportunityTitleStatus,
  OpportunityValueLayer,
  OpportunityValueLayers,
} from "../models/opportunities";

const nowIso = (): string => new Date().toISOString();

type OpportunityImportSource = OpportunityRecord["source"];

interface ConfirmImportPayload {
  source?: OpportunityImportSource;
  account_id?: string | null;
  item_id?: string | null;
  listing_url?: string;
  canonical_url?: string;
  listing_id?: string | null;
  raw_fields?: OpportunityRawImportFields;
  parsed_fields?: OpportunityImportReviewResponse["parsed_fields"];
  missing_fields?: OpportunityCriticalField[];
  import_status?: OpportunityImportStatus;
  parse_status?: OpportunityImportStatus;
  import_confidence?: number | null;
  guardrail_flags?: OpportunityGuardrailFlag[];
  blocked_reason?: string | null;
  parser_error?: string | null;
  operator_overrides?: Partial<OpportunityEditableFields>;
}

const OPPORTUNITY_SELECT_COLUMNS = `id, source, account_id, item_id, listing_id, listing_url, canonical_url, title, category, current_bid, auction_end, location, seller_agency,
        seller_type, buyer_premium_pct, removal_window_days, title_status, relisted, condition_raw, description, attachment_links, seller_contact,
        estimated_resale_value, estimated_transport_override, estimated_repair_cost, quantity_purchased, quantity_broken, import_status,
        import_confidence, import_missing_fields, raw_import_data, operator_overrides, value_layers, parse_status, guardrail_flags,
        blocked_reason, parser_error, buyer_premium_explicit, imported_at, status, interest, created_at`;

const CRITICAL_IMPORT_FIELDS: OpportunityCriticalField[] = [
  "title",
  "current_bid",
  "auction_end",
  "location",
  "seller_agency",
];

const GUARDRAIL_FLAGS: OpportunityGuardrailFlag[] = [
  "MISSING_TITLE",
  "MISSING_CURRENT_BID",
  "MISSING_AUCTION_END",
  "MISSING_LOCATION",
  "MISSING_SELLER_AGENCY",
  "MALFORMED_AUCTION_END",
  "BID_PARSE_MISMATCH",
  "BUYER_PREMIUM_NOT_EXPLICIT",
  "DUPLICATE_LISTING_ID_COLLISION",
  "PARTIAL_PARSE_NOT_ACTIONABLE",
  "IMPORT_BLOCKED",
  "IMPORT_FETCH_FAILED",
];

const normalizeNullableInteger = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor(parsed));
};

const normalizeNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseJsonRecord = (value: unknown): Record<string, unknown> | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
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
    return null;
  } catch {
    return null;
  }
};

const parseStringArray = (value: unknown): string[] => {
  if (value === null || value === undefined) {
    return [];
  }
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
    // Ignore malformed JSON arrays and fall through.
  }
  return [];
};

const parseMissingFields = (value: unknown): OpportunityCriticalField[] =>
  parseStringArray(value)
    .filter((item): item is OpportunityCriticalField => CRITICAL_IMPORT_FIELDS.includes(item as OpportunityCriticalField));

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
    auction_end_text: normalizeNullableString(record.auction_end_text),
    time_remaining_text: normalizeNullableString(record.time_remaining_text),
    location_text: normalizeNullableString(record.location_text),
    seller_agency_text: normalizeNullableString(record.seller_agency_text),
    category_text: normalizeNullableString(record.category_text),
    buyer_premium_text: normalizeNullableString(record.buyer_premium_text),
    description_text: normalizeNullableString(record.description_text),
    quantity_text: normalizeNullableString(record.quantity_text),
    attachment_links_text: normalizeNullableString(record.attachment_links_text),
    seller_contact_text: normalizeNullableString(record.seller_contact_text),
  };
};

const parseEditableOverrides = (value: unknown): Partial<OpportunityEditableFields> | null => {
  const record = parseJsonRecord(value);
  if (!record) {
    return null;
  }
  const parsed: Partial<OpportunityEditableFields> = {};
  if (typeof record.title === "string") parsed.title = record.title;
  if (Number.isFinite(Number(record.current_bid))) parsed.current_bid = Math.max(0, Number(record.current_bid));
  if (record.buyer_premium_pct === null || Number.isFinite(Number(record.buyer_premium_pct))) {
    parsed.buyer_premium_pct =
      record.buyer_premium_pct === null ? null : Math.max(0, Number(record.buyer_premium_pct));
  }
  if (Number.isFinite(Number(record.estimated_resale_value))) {
    parsed.estimated_resale_value = Math.max(0, Number(record.estimated_resale_value));
  }
  if (record.estimated_transport_override === null || Number.isFinite(Number(record.estimated_transport_override))) {
    parsed.estimated_transport_override =
      record.estimated_transport_override === null ? null : Math.max(0, Number(record.estimated_transport_override));
  }
  if (Number.isFinite(Number(record.estimated_repair_cost))) {
    parsed.estimated_repair_cost = Math.max(0, Number(record.estimated_repair_cost));
  }
  if (record.quantity_purchased === null || Number.isFinite(Number(record.quantity_purchased))) {
    parsed.quantity_purchased =
      record.quantity_purchased === null ? null : normalizeNullableInteger(record.quantity_purchased);
  }
  if (record.quantity_broken === null || Number.isFinite(Number(record.quantity_broken))) {
    parsed.quantity_broken =
      record.quantity_broken === null ? null : normalizeNullableInteger(record.quantity_broken);
  }
  if (typeof record.condition_raw === "string") parsed.condition_raw = record.condition_raw;
  if (typeof record.title_status === "string") {
    parsed.title_status =
      record.title_status === "on_site" || record.title_status === "delayed" || record.title_status === "unknown"
        ? record.title_status
        : "unknown";
  }
  if (Number.isFinite(Number(record.removal_window_days))) {
    parsed.removal_window_days = Math.max(1, Math.floor(Number(record.removal_window_days)));
  }
  if (typeof record.seller_agency === "string") parsed.seller_agency = record.seller_agency;
  if (typeof record.seller_type === "string") {
    parsed.seller_type =
      record.seller_type === "government" || record.seller_type === "commercial" || record.seller_type === "unknown"
        ? record.seller_type
        : "unknown";
  }
  if (typeof record.location === "string") parsed.location = record.location;
  if (typeof record.auction_end === "string") parsed.auction_end = record.auction_end;
  return Object.keys(parsed).length > 0 ? parsed : null;
};

const parseImportStatus = (value: unknown): OpportunityImportStatus => {
  if (
    value === "valid" ||
    value === "needs_review" ||
    value === "blocked" ||
    value === "partial" ||
    value === "failed"
  ) {
    return value;
  }
  return "failed";
};

const parseBuyerPremiumExplicit = (value: unknown, buyerPremiumPct: number | null): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === 1 || value === "1") {
    return true;
  }
  if (value === 0 || value === "0") {
    return false;
  }
  return buyerPremiumPct !== null;
};

const parseGuardrailFlags = (value: unknown): OpportunityGuardrailFlag[] =>
  parseStringArray(value).filter((item): item is OpportunityGuardrailFlag =>
    GUARDRAIL_FLAGS.includes(item as OpportunityGuardrailFlag)
  );

const parseValueLayer = <T>(record: Record<string, unknown>): OpportunityValueLayer<T> | null => {
  const source = record.source;
  if (source !== "imported" && source !== "override" && source !== "missing") {
    return null;
  }
  return {
    imported_value: (record.imported_value as T | null) ?? null,
    operator_override: (record.operator_override as T | null) ?? null,
    effective_value: (record.effective_value as T | null) ?? null,
    source,
  };
};

const parseValueLayers = (value: unknown): OpportunityValueLayers | null => {
  const record = parseJsonRecord(value);
  if (!record) {
    return null;
  }
  const currentBid = parseValueLayer<number>((record.current_bid as Record<string, unknown>) ?? {});
  const buyerPremium = parseValueLayer<number>((record.buyer_premium_pct as Record<string, unknown>) ?? {});
  const estimatedResale = parseValueLayer<number>((record.estimated_resale_value as Record<string, unknown>) ?? {});
  const estimatedTransport = parseValueLayer<number>(
    (record.estimated_transport_override as Record<string, unknown>) ?? {}
  );
  const estimatedRepair = parseValueLayer<number>((record.estimated_repair_cost as Record<string, unknown>) ?? {});
  const quantityPurchased = parseValueLayer<number>((record.quantity_purchased as Record<string, unknown>) ?? {});
  const quantityBroken = parseValueLayer<number>((record.quantity_broken as Record<string, unknown>) ?? {});
  const titleStatus = parseValueLayer<OpportunityTitleStatus>(
    (record.title_status as Record<string, unknown>) ?? {}
  );
  const sellerAgency = parseValueLayer<string>((record.seller_agency as Record<string, unknown>) ?? {});
  const location = parseValueLayer<string>((record.location as Record<string, unknown>) ?? {});
  const conditionRaw = parseValueLayer<string>((record.condition_raw as Record<string, unknown>) ?? {});
  if (
    !currentBid ||
    !buyerPremium ||
    !estimatedResale ||
    !estimatedTransport ||
    !estimatedRepair ||
    !quantityPurchased ||
    !quantityBroken ||
    !titleStatus ||
    !sellerAgency ||
    !location ||
    !conditionRaw
  ) {
    return null;
  }
  return {
    current_bid: currentBid,
    buyer_premium_pct: buyerPremium,
    estimated_resale_value: estimatedResale,
    estimated_transport_override: estimatedTransport,
    estimated_repair_cost: estimatedRepair,
    quantity_purchased: quantityPurchased,
    quantity_broken: quantityBroken,
    title_status: titleStatus,
    seller_agency: sellerAgency,
    location,
    condition_raw: conditionRaw,
  };
};

const buildValueLayer = <T>(input: {
  importedValue: T | null;
  operatorOverride: T | null;
}): OpportunityValueLayer<T> => {
  const hasOverride = input.operatorOverride !== null && input.operatorOverride !== undefined;
  const hasImported = input.importedValue !== null && input.importedValue !== undefined;
  return {
    imported_value: input.importedValue,
    operator_override: input.operatorOverride,
    effective_value: hasOverride ? input.operatorOverride : hasImported ? input.importedValue : null,
    source: hasOverride ? "override" : hasImported ? "imported" : "missing",
  };
};

const buildValueLayers = (
  imported: Partial<OpportunityEditableFields>,
  overrides: Partial<OpportunityEditableFields> | null
): OpportunityValueLayers => ({
  current_bid: buildValueLayer<number>({
    importedValue:
      imported.current_bid === undefined || imported.current_bid === null ? null : Number(imported.current_bid),
    operatorOverride:
      overrides?.current_bid === undefined || overrides.current_bid === null ? null : Number(overrides.current_bid),
  }),
  buyer_premium_pct: buildValueLayer<number>({
    importedValue:
      imported.buyer_premium_pct === undefined || imported.buyer_premium_pct === null
        ? null
        : Number(imported.buyer_premium_pct),
    operatorOverride:
      overrides?.buyer_premium_pct === undefined || overrides.buyer_premium_pct === null
        ? null
        : Number(overrides.buyer_premium_pct),
  }),
  estimated_resale_value: buildValueLayer<number>({
    importedValue:
      imported.estimated_resale_value === undefined || imported.estimated_resale_value === null
        ? null
        : Number(imported.estimated_resale_value),
    operatorOverride:
      overrides?.estimated_resale_value === undefined || overrides.estimated_resale_value === null
        ? null
        : Number(overrides.estimated_resale_value),
  }),
  estimated_transport_override: buildValueLayer<number>({
    importedValue:
      imported.estimated_transport_override === undefined || imported.estimated_transport_override === null
        ? null
        : Number(imported.estimated_transport_override),
    operatorOverride:
      overrides?.estimated_transport_override === undefined || overrides.estimated_transport_override === null
        ? null
        : Number(overrides.estimated_transport_override),
  }),
  estimated_repair_cost: buildValueLayer<number>({
    importedValue:
      imported.estimated_repair_cost === undefined || imported.estimated_repair_cost === null
        ? null
        : Number(imported.estimated_repair_cost),
    operatorOverride:
      overrides?.estimated_repair_cost === undefined || overrides.estimated_repair_cost === null
        ? null
        : Number(overrides.estimated_repair_cost),
  }),
  quantity_purchased: buildValueLayer<number>({
    importedValue:
      imported.quantity_purchased === undefined || imported.quantity_purchased === null
        ? null
        : Number(imported.quantity_purchased),
    operatorOverride:
      overrides?.quantity_purchased === undefined || overrides.quantity_purchased === null
        ? null
        : Number(overrides.quantity_purchased),
  }),
  quantity_broken: buildValueLayer<number>({
    importedValue:
      imported.quantity_broken === undefined || imported.quantity_broken === null
        ? null
        : Number(imported.quantity_broken),
    operatorOverride:
      overrides?.quantity_broken === undefined || overrides.quantity_broken === null
        ? null
        : Number(overrides.quantity_broken),
  }),
  title_status: buildValueLayer<OpportunityTitleStatus>({
    importedValue: (imported.title_status as OpportunityTitleStatus | undefined) ?? null,
    operatorOverride: (overrides?.title_status as OpportunityTitleStatus | undefined) ?? null,
  }),
  seller_agency: buildValueLayer<string>({
    importedValue: imported.seller_agency ?? null,
    operatorOverride: overrides?.seller_agency ?? null,
  }),
  location: buildValueLayer<string>({
    importedValue: imported.location ?? null,
    operatorOverride: overrides?.location ?? null,
  }),
  condition_raw: buildValueLayer<string>({
    importedValue: imported.condition_raw ?? null,
    operatorOverride: overrides?.condition_raw ?? null,
  }),
});

const hasDuplicateListingCollision = (
  listingId: string,
  existingId: string | null
): boolean => {
  const row = db
    .prepare(
      `SELECT COUNT(*) as count
       FROM opportunities
       WHERE listing_id = ?
         AND (? IS NULL OR id != ?)`
    )
    .get(listingId, existingId, existingId) as { count?: number } | undefined;
  const count = Number(row?.count ?? 0);
  return count > 0;
};

const normalizeImportStateFromMissing = (
  missingFields: OpportunityCriticalField[]
): OpportunityImportStatus => {
  if (missingFields.length === 0) {
    return "valid";
  }
  return "needs_review";
};

const mapOpportunityRow = (row: Record<string, unknown>): OpportunityRecord => {
  const auctionEnd = typeof row.auction_end === "string" ? row.auction_end : "";
  const auctionEndTs = Date.parse(auctionEnd);
  const timeLeftHours =
    Number.isFinite(auctionEndTs) ? (auctionEndTs - Date.now()) / (1000 * 60 * 60) : null;
  const isEnded = timeLeftHours !== null && timeLeftHours <= 0;
  const parsedMissingFields = parseMissingFields(row.import_missing_fields);
  const rawImportData = parseRawImportData(row.raw_import_data);
  const operatorOverrides = parseEditableOverrides(row.operator_overrides);
  const valueLayers = parseValueLayers(row.value_layers);

  return {
    id: String(row.id),
    source:
      row.source === "url_import" || row.source === "keyword_search" || row.source === "manual_import"
        ? row.source
        : "manual_import",
    account_id: normalizeNullableString(row.account_id),
    item_id: normalizeNullableString(row.item_id),
    listing_id: normalizeNullableString(row.listing_id),
    listing_url: String(row.listing_url ?? ""),
    canonical_url: String(row.canonical_url ?? row.listing_url ?? ""),
    title: String(row.title ?? ""),
    category:
      row.category === "vehicle" || row.category === "electronics" || row.category === "other"
        ? row.category
        : "other",
    current_bid: Number(row.current_bid ?? 0),
    auction_end: auctionEnd,
    auction_state: isEnded ? "ended" : "active",
    time_left_hours: timeLeftHours,
    location: String(row.location ?? ""),
    seller_agency: String(row.seller_agency ?? ""),
    seller_type:
      row.seller_type === "government" || row.seller_type === "commercial" || row.seller_type === "unknown"
        ? row.seller_type
        : "unknown",
    buyer_premium_pct:
      row.buyer_premium_pct === null || row.buyer_premium_pct === undefined
        ? null
        : Number(row.buyer_premium_pct),
    buyer_premium_explicit: Boolean(Number(row.buyer_premium_explicit ?? 0)),
    removal_window_days: Number(row.removal_window_days ?? 0),
    title_status:
      row.title_status === "on_site" ||
      row.title_status === "delayed" ||
      row.title_status === "unknown"
        ? (row.title_status as OpportunityTitleStatus)
        : "unknown",
    relisted: Boolean(Number(row.relisted ?? 0)),
    condition_raw: String(row.condition_raw ?? ""),
    description: normalizeNullableString(row.description),
    attachment_links: parseStringArray(row.attachment_links),
    seller_contact: normalizeNullableString(row.seller_contact),
    estimated_resale_value: Number(row.estimated_resale_value ?? 0),
    estimated_transport_override:
      row.estimated_transport_override === null || row.estimated_transport_override === undefined
        ? null
        : Number(row.estimated_transport_override),
    estimated_repair_cost: Number(row.estimated_repair_cost ?? 0),
    quantity_purchased:
      row.quantity_purchased === null || row.quantity_purchased === undefined
        ? null
        : Number(row.quantity_purchased),
    quantity_broken:
      row.quantity_broken === null || row.quantity_broken === undefined
        ? null
        : Number(row.quantity_broken),
    import_status: parseImportStatus(row.import_status),
    import_confidence:
      row.import_confidence === null || row.import_confidence === undefined
        ? null
        : Math.max(0, Math.min(100, Number(row.import_confidence))),
    import_missing_fields: parsedMissingFields,
    raw_import_data: rawImportData,
    operator_overrides: operatorOverrides,
    value_layers: valueLayers,
    parse_status: parseImportStatus(row.parse_status),
    guardrail_flags: parseGuardrailFlags(row.guardrail_flags),
    blocked_reason: normalizeNullableString(row.blocked_reason),
    parser_error: normalizeNullableString(row.parser_error),
    imported_at: normalizeNullableString(row.imported_at),
    status:
      row.status === "new" || row.status === "watch" || row.status === "passed" || row.status === "converted"
        ? (row.status as OpportunityStatus)
        : "new",
    interest:
      row.interest === "undecided" ||
      row.interest === "interested" ||
      row.interest === "not_interested"
        ? (row.interest as OpportunityInterest)
        : "undecided",
    created_at: String(row.created_at ?? nowIso()),
  };
};

const mapDecisionRow = (row: Record<string, unknown>): OpportunityDecisionRecord => {
  let snapshot: OpportunityRecord | null = null;
  const snapshotRaw = row.opportunity_snapshot;
  if (typeof snapshotRaw === "string") {
    try {
      snapshot = JSON.parse(snapshotRaw) as OpportunityRecord;
    } catch {
      snapshot = null;
    }
  }
  return {
    id: String(row.id),
    opportunity_id: String(row.opportunity_id),
    action: row.action === "watch" || row.action === "must_buy" || row.action === "pass" ? row.action : "watch",
    reason: typeof row.reason === "string" ? row.reason : null,
    note: typeof row.note === "string" ? row.note : null,
    decided_at: String(row.decided_at ?? nowIso()),
    opportunity_snapshot: snapshot ?? {
      id: String(row.opportunity_id),
      source: "manual_import",
      account_id: null,
      item_id: null,
      listing_id: null,
      listing_url: "",
      canonical_url: "",
      title: "Unknown opportunity",
      category: "other",
      current_bid: 0,
      auction_end: nowIso(),
      auction_state: "unknown",
      time_left_hours: null,
      location: "",
      seller_agency: "",
      seller_type: "unknown",
      buyer_premium_pct: null,
      buyer_premium_explicit: false,
      removal_window_days: 0,
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
      import_status: "failed",
      import_confidence: null,
      import_missing_fields: [...CRITICAL_IMPORT_FIELDS],
      raw_import_data: null,
      operator_overrides: null,
      value_layers: null,
      parse_status: "failed",
      guardrail_flags: ["IMPORT_FETCH_FAILED"],
      blocked_reason: null,
      parser_error: "Decision snapshot fallback generated from missing source opportunity.",
      imported_at: null,
      status: "new",
      interest: "undecided",
      created_at: nowIso(),
    },
  };
};

export const listOpportunitiesFeed = (): OpportunitiesFeedResponse => {
  const opportunityRows = db
    .prepare(
      `SELECT
        ${OPPORTUNITY_SELECT_COLUMNS}
       FROM opportunities
       ORDER BY datetime(created_at) DESC`
    )
    .all() as Array<Record<string, unknown>>;
  const decisionRows = db
    .prepare(
      `SELECT id, opportunity_id, action, reason, note, decided_at, opportunity_snapshot
       FROM opportunity_decisions
       ORDER BY datetime(decided_at) DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const opportunities = opportunityRows.map(mapOpportunityRow);
  const decisions = decisionRows.map(mapDecisionRow);

  return {
    status: opportunities.length === 0 ? "valid_empty" : "feed_offline",
    feed_mode: "manual_persisted",
    last_polled_at: null,
    generated_at: nowIso(),
    opportunities,
    decisions,
    message:
      opportunities.length === 0
        ? "No opportunities stored yet."
        : "Manual opportunity feed is available from persisted backend records.",
    error: null,
  };
};

const coerceString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const coerceNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const coerceBoolean = (value: unknown): boolean => value === true || value === 1 || value === "1";

const coerceOpportunityStatus = (value: unknown): OpportunityStatus =>
  value === "new" || value === "watch" || value === "passed" || value === "converted" ? value : "new";

const coerceOpportunityInterest = (value: unknown): OpportunityInterest =>
  value === "undecided" || value === "interested" || value === "not_interested" ? value : "undecided";

const coerceOpportunitySource = (value: unknown): OpportunityImportSource =>
  value === "url_import" || value === "keyword_search" || value === "manual_import"
    ? value
    : "manual_import";

const coerceOpportunityCategory = (value: unknown): OpportunityRecord["category"] =>
  value === "vehicle" || value === "electronics" || value === "other" ? value : "other";

const coerceSellerType = (value: unknown): OpportunityRecord["seller_type"] =>
  value === "government" || value === "commercial" || value === "unknown" ? value : "unknown";

const coerceTitleStatus = (value: unknown): OpportunityTitleStatus =>
  value === "on_site" || value === "delayed" || value === "unknown" ? value : "unknown";

const coerceNullableIso = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return Number.isFinite(Date.parse(trimmed)) ? trimmed : null;
};

const sanitizeOverrides = (raw: unknown): Partial<OpportunityEditableFields> | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  return parseEditableOverrides(raw);
};

const buildMissingFields = (
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

const computeImportConfidence = (missingFields: OpportunityCriticalField[], attachmentLinksCount = 0): number => {
  const attachmentPenalty = attachmentLinksCount > 0 ? 0 : 4;
  return Math.max(0, Math.min(100, 100 - missingFields.length * 18 - attachmentPenalty));
};

const resolveParsedBuyerPremium = (
  parsedBuyerPremium: number | null | undefined,
  buyerPremiumExplicit: boolean
): number | null => {
  if (!buyerPremiumExplicit) {
    return null;
  }
  if (parsedBuyerPremium === null || parsedBuyerPremium === undefined) {
    return null;
  }
  return Math.max(0, Number(parsedBuyerPremium));
};

const isFiniteNumberish = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeReviewPayload = (raw: unknown): ConfirmImportPayload => {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid import confirmation payload");
  }
  const parsed = raw as Record<string, unknown>;
  if (parsed.review && typeof parsed.review === "object") {
    const review = parsed.review as OpportunityImportReviewResponse;
    return {
      source: coerceOpportunitySource(parsed.source),
      account_id: normalizeNullableString(review.account_id),
      item_id: normalizeNullableString(review.item_id),
      listing_url: review.listing_url,
      canonical_url: review.canonical_url,
      listing_id: review.listing_id,
      raw_fields: review.raw_fields,
      parsed_fields: review.parsed_fields,
      missing_fields: review.missing_fields,
      import_status: review.import_status,
      parse_status: review.parse_status,
      import_confidence: review.import_confidence,
      guardrail_flags: review.guardrail_flags,
      blocked_reason: normalizeNullableString(review.blocked_reason),
      parser_error: normalizeNullableString(review.parser_error),
      operator_overrides: sanitizeOverrides(parsed.operator_overrides) ?? undefined,
    };
  }
  return {
    source: coerceOpportunitySource(parsed.source),
    account_id: normalizeNullableString(parsed.account_id),
    item_id: normalizeNullableString(parsed.item_id),
    listing_url: typeof parsed.listing_url === "string" ? parsed.listing_url : undefined,
    canonical_url: typeof parsed.canonical_url === "string" ? parsed.canonical_url : undefined,
    listing_id: normalizeNullableString(parsed.listing_id),
    raw_fields: parsed.raw_fields as OpportunityRawImportFields | undefined,
    parsed_fields: parsed.parsed_fields as OpportunityImportReviewResponse["parsed_fields"] | undefined,
    missing_fields: parseMissingFields(parsed.missing_fields),
    import_status: parseImportStatus(parsed.import_status),
    parse_status: parseImportStatus(parsed.parse_status),
    import_confidence: Number.isFinite(Number(parsed.import_confidence))
      ? Number(parsed.import_confidence)
      : null,
    guardrail_flags: parseGuardrailFlags(parsed.guardrail_flags),
    blocked_reason: normalizeNullableString(parsed.blocked_reason),
    parser_error: normalizeNullableString(parsed.parser_error),
    operator_overrides: sanitizeOverrides(parsed.operator_overrides) ?? undefined,
  };
};

const applyOverridesToEditable = (
  base: Partial<OpportunityEditableFields>,
  overrides: Partial<OpportunityEditableFields> | null
): Partial<OpportunityEditableFields> => {
  if (!overrides) {
    return { ...base };
  }
  return {
    ...base,
    ...overrides,
  };
};

const normalizeOpportunityPayload = (raw: unknown): OpportunityRecord => {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid opportunity payload item");
  }
  const parsed = raw as Record<string, unknown>;
  const idRaw = coerceString(parsed.id).trim();
  if (!idRaw) {
    throw new Error("Opportunity id is required");
  }
  const source = coerceOpportunitySource(parsed.source);
  const category = coerceOpportunityCategory(parsed.category);
  const sellerType = coerceSellerType(parsed.seller_type);
  const titleStatus = coerceTitleStatus(parsed.title_status);
  const createdAtRaw = coerceString(parsed.created_at).trim();
  const createdAt = createdAtRaw && Number.isFinite(Date.parse(createdAtRaw)) ? createdAtRaw : nowIso();
  const canonicalUrl = coerceString(parsed.canonical_url, "").trim() || coerceString(parsed.listing_url, "").trim();
  const rawImportData = parseRawImportData(parsed.raw_import_data);
  const operatorOverrides = parseEditableOverrides(parsed.operator_overrides);
  const attachmentLinks = parseStringArray(parsed.attachment_links);

  const buyerPremiumExplicit = coerceBoolean(parsed.buyer_premium_explicit);
  const resolvedBuyerPremium = buyerPremiumExplicit
    ? parsed.buyer_premium_pct === null || parsed.buyer_premium_pct === undefined
      ? null
      : Math.max(0, coerceNumber(parsed.buyer_premium_pct))
    : null;

  const normalized: OpportunityRecord = {
    id: idRaw,
    source,
    account_id: normalizeNullableString(parsed.account_id),
    item_id: normalizeNullableString(parsed.item_id),
    listing_id: normalizeNullableString(parsed.listing_id),
    listing_url: coerceString(parsed.listing_url),
    canonical_url: canonicalUrl,
    title: coerceString(parsed.title),
    category,
    current_bid: Math.max(0, coerceNumber(parsed.current_bid)),
    auction_end: coerceString(parsed.auction_end) || nowIso(),
    auction_state: "unknown",
    time_left_hours: null,
    location: coerceString(parsed.location),
    seller_agency: coerceString(parsed.seller_agency),
    seller_type: sellerType,
    buyer_premium_pct: resolvedBuyerPremium,
    buyer_premium_explicit: buyerPremiumExplicit,
    removal_window_days: Math.max(1, Math.floor(coerceNumber(parsed.removal_window_days, 3))),
    title_status: titleStatus,
    relisted: coerceBoolean(parsed.relisted),
    condition_raw: coerceString(parsed.condition_raw),
    description: normalizeNullableString(parsed.description),
    attachment_links: attachmentLinks,
    seller_contact: normalizeNullableString(parsed.seller_contact),
    estimated_resale_value: Math.max(0, coerceNumber(parsed.estimated_resale_value)),
    estimated_transport_override:
      parsed.estimated_transport_override === null || parsed.estimated_transport_override === undefined
        ? null
        : Math.max(0, coerceNumber(parsed.estimated_transport_override)),
    estimated_repair_cost: Math.max(0, coerceNumber(parsed.estimated_repair_cost)),
    quantity_purchased: normalizeNullableInteger(parsed.quantity_purchased),
    quantity_broken: normalizeNullableInteger(parsed.quantity_broken),
    import_status: parseImportStatus(parsed.import_status),
    import_confidence:
      parsed.import_confidence === null || parsed.import_confidence === undefined
        ? null
        : Math.max(0, Math.min(100, coerceNumber(parsed.import_confidence, 100))),
    import_missing_fields: parseMissingFields(parsed.import_missing_fields),
    raw_import_data: rawImportData,
    operator_overrides: operatorOverrides,
    value_layers: parseValueLayers(parsed.value_layers),
    parse_status: parseImportStatus(parsed.parse_status),
    guardrail_flags: parseGuardrailFlags(parsed.guardrail_flags),
    blocked_reason: normalizeNullableString(parsed.blocked_reason),
    parser_error: normalizeNullableString(parsed.parser_error),
    imported_at: coerceNullableIso(parsed.imported_at),
    status: coerceOpportunityStatus(parsed.status),
    interest: coerceOpportunityInterest(parsed.interest),
    created_at: createdAt,
  };
  const missingFields = buildMissingFields(normalized);
  if (missingFields.length > 0) {
    normalized.import_missing_fields = missingFields;
    normalized.import_status = "needs_review";
    normalized.import_confidence = computeImportConfidence(missingFields, normalized.attachment_links.length);
  }
  if (!normalized.buyer_premium_explicit) {
    if (!normalized.guardrail_flags.includes("BUYER_PREMIUM_NOT_EXPLICIT")) {
      normalized.guardrail_flags = [...normalized.guardrail_flags, "BUYER_PREMIUM_NOT_EXPLICIT"];
    }
    normalized.buyer_premium_pct = null;
    normalized.import_status = normalized.import_status === "valid" ? "needs_review" : normalized.import_status;
  }
  if (!normalized.value_layers) {
    normalized.value_layers = buildValueLayers(normalized, normalized.operator_overrides);
  }
  return normalized;
};

export const replaceOpportunities = (
  payload: unknown
): { feed: OpportunitiesFeedResponse; saved_count: number } => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid opportunities sync payload");
  }
  const parsed = payload as { opportunities?: unknown };
  if (!Array.isArray(parsed.opportunities)) {
    throw new Error("opportunities must be an array");
  }
  const normalized = parsed.opportunities.map(normalizeOpportunityPayload);

  db.transaction(() => {
    db.prepare(`DELETE FROM opportunities`).run();
    const insert = db.prepare(
      `INSERT INTO opportunities (
        id, source, account_id, item_id, listing_id, listing_url, canonical_url, title, category, current_bid, auction_end, location, seller_agency,
        seller_type, buyer_premium_pct, buyer_premium_explicit, removal_window_days, title_status, relisted, condition_raw, description, attachment_links,
        seller_contact, estimated_resale_value, estimated_transport_override, estimated_repair_cost, quantity_purchased, quantity_broken,
        import_status, import_confidence, import_missing_fields, raw_import_data, operator_overrides, value_layers, parse_status, guardrail_flags,
        blocked_reason, parser_error, imported_at, status, interest, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    normalized.forEach((opportunity) => {
      insert.run(
        opportunity.id,
        opportunity.source,
        opportunity.account_id,
        opportunity.item_id,
        opportunity.listing_id,
        opportunity.listing_url,
        opportunity.canonical_url,
        opportunity.title,
        opportunity.category,
        opportunity.current_bid,
        opportunity.auction_end,
        opportunity.location,
        opportunity.seller_agency,
        opportunity.seller_type,
        opportunity.buyer_premium_pct,
        opportunity.buyer_premium_explicit ? 1 : 0,
        opportunity.removal_window_days,
        opportunity.title_status,
        opportunity.relisted ? 1 : 0,
        opportunity.condition_raw,
        opportunity.description,
        JSON.stringify(opportunity.attachment_links),
        opportunity.seller_contact,
        opportunity.estimated_resale_value,
        opportunity.estimated_transport_override,
        opportunity.estimated_repair_cost,
        opportunity.quantity_purchased,
        opportunity.quantity_broken,
        opportunity.import_status,
        opportunity.import_confidence,
        JSON.stringify(opportunity.import_missing_fields),
        opportunity.raw_import_data ? JSON.stringify(opportunity.raw_import_data) : null,
        opportunity.operator_overrides ? JSON.stringify(opportunity.operator_overrides) : null,
        opportunity.value_layers ? JSON.stringify(opportunity.value_layers) : null,
        opportunity.parse_status,
        JSON.stringify(opportunity.guardrail_flags),
        opportunity.blocked_reason,
        opportunity.parser_error,
        opportunity.imported_at,
        opportunity.status,
        opportunity.interest,
        opportunity.created_at
      );
    });
  })();

  return {
    saved_count: normalized.length,
    feed: listOpportunitiesFeed(),
  };
};

const findExistingOpportunityByListing = (listingId: string | null): Record<string, unknown> | undefined => {
  if (listingId) {
    const byListingId = db
      .prepare(
        `SELECT ${OPPORTUNITY_SELECT_COLUMNS}
         FROM opportunities
         WHERE listing_id = ?
         ORDER BY datetime(created_at) DESC
         LIMIT 1`
      )
      .get(listingId) as Record<string, unknown> | undefined;
    if (byListingId) {
      return byListingId;
    }
  }
  return undefined;
};

export const confirmOpportunityImport = (
  payload: unknown
): {
  stored_opportunity: OpportunityRecord;
  dedupe_action: "created" | "updated_existing";
  feed: OpportunitiesFeedResponse;
} => {
  const normalizedPayload = normalizeReviewPayload(payload);
  const listingUrl = (normalizedPayload.listing_url ?? "").trim();
  if (!listingUrl) {
    throw new Error("listing_url is required");
  }
  const listingId = normalizeNullableString(normalizedPayload.listing_id);
  if (!listingId || !/^govdeals_\d+_\d+$/.test(listingId)) {
    throw new Error("listing_id must be govdeals_<account_id>_<item_id> for import dedupe");
  }
  const parsedFields = normalizedPayload.parsed_fields ?? ({} as OpportunityImportReviewResponse["parsed_fields"]);
  const rawFields = normalizedPayload.raw_fields ?? null;
  const source = normalizedPayload.source ?? "url_import";
  const operatorOverrides = normalizedPayload.operator_overrides ?? null;

  const buyerPremiumExplicit = Boolean(parsedFields.buyer_premium_explicit);
  const resolvedParsedBuyerPremium = resolveParsedBuyerPremium(
    parsedFields.buyer_premium_pct,
    buyerPremiumExplicit
  );
  const editableBase: Partial<OpportunityEditableFields> = {
    title: coerceString(parsedFields.title),
    current_bid: Number(parsedFields.current_bid ?? 0),
    buyer_premium_pct: resolvedParsedBuyerPremium,
    estimated_resale_value: Number(parsedFields.estimated_resale_value ?? 0),
    estimated_transport_override:
      parsedFields.estimated_transport_override === null || parsedFields.estimated_transport_override === undefined
        ? null
        : Number(parsedFields.estimated_transport_override),
    estimated_repair_cost: Number(parsedFields.estimated_repair_cost ?? 0),
    quantity_purchased: normalizeNullableInteger(parsedFields.quantity_purchased),
    quantity_broken: normalizeNullableInteger(parsedFields.quantity_broken),
    condition_raw: coerceString(parsedFields.condition_raw),
    title_status: coerceTitleStatus(parsedFields.title_status),
    removal_window_days: Math.max(1, Math.floor(Number(parsedFields.removal_window_days ?? 3))),
    seller_agency: coerceString(parsedFields.seller_agency),
    seller_type: coerceSellerType(parsedFields.seller_type),
    location: coerceString(parsedFields.location),
    auction_end: coerceString(parsedFields.auction_end),
  };
  const resolvedEditable = applyOverridesToEditable(editableBase, operatorOverrides);
  const missingFields = buildMissingFields(resolvedEditable);
  const importStatus: OpportunityImportStatus =
    normalizedPayload.parse_status === "blocked" ||
    normalizedPayload.parse_status === "failed" ||
    normalizedPayload.parse_status === "partial"
      ? normalizedPayload.parse_status
      : missingFields.length > 0
        ? "needs_review"
        : "valid";
  const importConfidence =
    importStatus === "blocked" || importStatus === "failed"
      ? null
      : Number.isFinite(normalizedPayload.import_confidence)
        ? Math.max(0, Math.min(100, Number(normalizedPayload.import_confidence)))
        : computeImportConfidence(missingFields, parsedFields.attachment_links?.length ?? 0);
  const createdAt = nowIso();
  const importedAt = nowIso();
  const existingRow = findExistingOpportunityByListing(listingId);
  const existing = existingRow ? mapOpportunityRow(existingRow) : null;
  const resolvedId = existing?.id ?? crypto.randomUUID();
  const category =
    parsedFields.category === "vehicle" || parsedFields.category === "electronics" || parsedFields.category === "other"
      ? parsedFields.category
      : "other";

  const record: OpportunityRecord = {
    id: resolvedId,
    source,
    account_id: normalizeNullableString(normalizedPayload.account_id),
    item_id: normalizeNullableString(normalizedPayload.item_id),
    listing_id: listingId,
    listing_url: listingUrl,
    canonical_url: (normalizedPayload.canonical_url ?? listingUrl).trim(),
    title: resolvedEditable.title ?? "",
    category,
    current_bid: Math.max(0, Number(resolvedEditable.current_bid ?? 0)),
    auction_end: resolvedEditable.auction_end ?? "",
    auction_state: "unknown",
    time_left_hours: null,
    location: resolvedEditable.location ?? "",
    seller_agency: resolvedEditable.seller_agency ?? "",
    seller_type: coerceSellerType(resolvedEditable.seller_type),
    buyer_premium_pct:
      resolvedEditable.buyer_premium_pct === null || resolvedEditable.buyer_premium_pct === undefined
        ? null
        : Math.max(0, Number(resolvedEditable.buyer_premium_pct)),
    buyer_premium_explicit: buyerPremiumExplicit,
    removal_window_days: Math.max(1, Math.floor(Number(resolvedEditable.removal_window_days ?? 3))),
    title_status: coerceTitleStatus(resolvedEditable.title_status),
    relisted: existing?.relisted ?? false,
    condition_raw: resolvedEditable.condition_raw ?? "",
    description: normalizeNullableString(parsedFields.description),
    attachment_links: Array.isArray(parsedFields.attachment_links)
      ? parsedFields.attachment_links.filter((item): item is string => typeof item === "string")
      : [],
    seller_contact: normalizeNullableString(parsedFields.seller_contact),
    estimated_resale_value: Math.max(0, Number(resolvedEditable.estimated_resale_value ?? 0)),
    estimated_transport_override:
      resolvedEditable.estimated_transport_override === null || resolvedEditable.estimated_transport_override === undefined
        ? null
        : Math.max(0, Number(resolvedEditable.estimated_transport_override)),
    estimated_repair_cost: Math.max(0, Number(resolvedEditable.estimated_repair_cost ?? 0)),
    quantity_purchased: normalizeNullableInteger(resolvedEditable.quantity_purchased),
    quantity_broken: normalizeNullableInteger(resolvedEditable.quantity_broken),
    import_status: importStatus,
    import_confidence: importConfidence,
    import_missing_fields: missingFields,
    raw_import_data: rawFields,
    operator_overrides: operatorOverrides,
    value_layers: buildValueLayers(editableBase, operatorOverrides),
    parse_status:
      normalizedPayload.parse_status === "blocked" ||
      normalizedPayload.parse_status === "failed" ||
      normalizedPayload.parse_status === "partial"
        ? normalizedPayload.parse_status
        : importStatus,
    guardrail_flags: normalizedPayload.guardrail_flags ?? [],
    blocked_reason: normalizedPayload.blocked_reason ?? null,
    parser_error: normalizedPayload.parser_error ?? null,
    imported_at: importedAt,
    status: existing?.status ?? "new",
    interest: existing?.interest ?? "undecided",
    created_at: existing?.created_at ?? createdAt,
  };

  db.transaction(() => {
    if (existing) {
      db.prepare(
        `UPDATE opportunities
         SET source = ?, account_id = ?, item_id = ?, listing_id = ?, listing_url = ?, canonical_url = ?, title = ?, category = ?, current_bid = ?, auction_end = ?,
             location = ?, seller_agency = ?, seller_type = ?, buyer_premium_pct = ?, buyer_premium_explicit = ?, removal_window_days = ?, title_status = ?, relisted = ?,
             condition_raw = ?, description = ?, attachment_links = ?, seller_contact = ?, estimated_resale_value = ?,
             estimated_transport_override = ?, estimated_repair_cost = ?, quantity_purchased = ?, quantity_broken = ?, import_status = ?, parse_status = ?,
             import_confidence = ?, import_missing_fields = ?, raw_import_data = ?, operator_overrides = ?, value_layers = ?, guardrail_flags = ?,
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
        record.parse_status,
        record.import_confidence,
        JSON.stringify(record.import_missing_fields),
        record.raw_import_data ? JSON.stringify(record.raw_import_data) : null,
        record.operator_overrides ? JSON.stringify(record.operator_overrides) : null,
        record.value_layers ? JSON.stringify(record.value_layers) : null,
        JSON.stringify(record.guardrail_flags),
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
        seller_type, buyer_premium_pct, buyer_premium_explicit, removal_window_days, title_status, relisted, condition_raw, description, attachment_links, seller_contact,
        estimated_resale_value, estimated_transport_override, estimated_repair_cost, quantity_purchased, quantity_broken, import_status, parse_status,
        import_confidence, import_missing_fields, raw_import_data, operator_overrides, value_layers, guardrail_flags, blocked_reason, parser_error,
        imported_at, status, interest, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      record.parse_status,
      record.import_confidence,
      JSON.stringify(record.import_missing_fields),
      record.raw_import_data ? JSON.stringify(record.raw_import_data) : null,
      record.operator_overrides ? JSON.stringify(record.operator_overrides) : null,
      record.value_layers ? JSON.stringify(record.value_layers) : null,
      JSON.stringify(record.guardrail_flags),
      record.blocked_reason,
      record.parser_error,
      record.imported_at,
      record.status,
      record.interest,
      record.created_at
    );
  })();

  const stored = db
    .prepare(
      `SELECT ${OPPORTUNITY_SELECT_COLUMNS}
       FROM opportunities
       WHERE id = ?`
    )
    .get(record.id) as Record<string, unknown> | undefined;

  if (!stored) {
    throw new Error("Failed to store imported opportunity");
  }

  return {
    stored_opportunity: mapOpportunityRow(stored),
    dedupe_action: existing ? "updated_existing" : "created",
    feed: listOpportunitiesFeed(),
  };
};

export const overrideOpportunityValues = (
  opportunityId: string,
  payload: unknown
): {
  stored_opportunity: OpportunityRecord;
  feed: OpportunitiesFeedResponse;
} => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid override payload");
  }
  const parsed = payload as { overrides?: unknown };
  const overrides = sanitizeOverrides(parsed.overrides ?? payload);
  if (!overrides || Object.keys(overrides).length === 0) {
    throw new Error("At least one override field is required");
  }

  const row = db
    .prepare(
      `SELECT ${OPPORTUNITY_SELECT_COLUMNS}
       FROM opportunities
       WHERE id = ?`
    )
    .get(opportunityId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error("Opportunity not found");
  }

  const existing = mapOpportunityRow(row);
  const editableBase: Partial<OpportunityEditableFields> = {
    title: existing.title,
    current_bid: existing.current_bid,
    buyer_premium_pct: existing.buyer_premium_pct ?? null,
    estimated_resale_value: existing.estimated_resale_value,
    estimated_transport_override: existing.estimated_transport_override,
    estimated_repair_cost: existing.estimated_repair_cost,
    quantity_purchased: existing.quantity_purchased,
    quantity_broken: existing.quantity_broken,
    condition_raw: existing.condition_raw,
    title_status: existing.title_status,
    removal_window_days: existing.removal_window_days,
    seller_agency: existing.seller_agency,
    seller_type: existing.seller_type,
    location: existing.location,
    auction_end: existing.auction_end,
  };
  const nextEditable = applyOverridesToEditable(editableBase, overrides);
  const missingFields = buildMissingFields(nextEditable);
  const mergedOverrides = {
    ...(existing.operator_overrides ?? {}),
    ...overrides,
  };
  const nextImportStatus: OpportunityImportStatus = missingFields.length > 0 ? "needs_review" : "valid";
  const nextImportConfidence = computeImportConfidence(missingFields, existing.attachment_links.length);
  const nextValueLayers = buildValueLayers(editableBase, mergedOverrides);

  db.prepare(
    `UPDATE opportunities
     SET title = ?, current_bid = ?, buyer_premium_pct = ?, estimated_resale_value = ?, estimated_transport_override = ?, estimated_repair_cost = ?,
         quantity_purchased = ?, quantity_broken = ?, condition_raw = ?, title_status = ?, removal_window_days = ?, seller_agency = ?, seller_type = ?,
         location = ?, auction_end = ?, operator_overrides = ?, value_layers = ?, import_status = ?, parse_status = ?, import_confidence = ?, import_missing_fields = ?
     WHERE id = ?`
  ).run(
    nextEditable.title ?? existing.title,
    Math.max(0, Number(nextEditable.current_bid ?? existing.current_bid)),
    nextEditable.buyer_premium_pct === null || nextEditable.buyer_premium_pct === undefined
      ? null
      : Math.max(0, Number(nextEditable.buyer_premium_pct)),
    Math.max(0, Number(nextEditable.estimated_resale_value ?? existing.estimated_resale_value)),
    nextEditable.estimated_transport_override === null || nextEditable.estimated_transport_override === undefined
      ? null
      : Math.max(0, Number(nextEditable.estimated_transport_override)),
    Math.max(0, Number(nextEditable.estimated_repair_cost ?? existing.estimated_repair_cost)),
    normalizeNullableInteger(nextEditable.quantity_purchased),
    normalizeNullableInteger(nextEditable.quantity_broken),
    nextEditable.condition_raw ?? existing.condition_raw,
    coerceTitleStatus(nextEditable.title_status),
    Math.max(1, Math.floor(Number(nextEditable.removal_window_days ?? existing.removal_window_days))),
    nextEditable.seller_agency ?? existing.seller_agency,
    coerceSellerType(nextEditable.seller_type),
    nextEditable.location ?? existing.location,
    nextEditable.auction_end ?? existing.auction_end,
    JSON.stringify(mergedOverrides),
    JSON.stringify(nextValueLayers),
    nextImportStatus,
    nextImportStatus,
    nextImportConfidence,
    JSON.stringify(missingFields),
    opportunityId
  );

  const storedRow = db
    .prepare(
      `SELECT ${OPPORTUNITY_SELECT_COLUMNS}
       FROM opportunities
       WHERE id = ?`
    )
    .get(opportunityId) as Record<string, unknown> | undefined;
  if (!storedRow) {
    throw new Error("Failed to store opportunity override");
  }

  return {
    stored_opportunity: mapOpportunityRow(storedRow),
    feed: listOpportunitiesFeed(),
  };
};

const coerceOpportunityInterestInput = (value: unknown): OpportunityInterest => {
  if (value === "undecided" || value === "interested" || value === "not_interested") {
    return value;
  }
  throw new Error("interest must be one of: undecided, interested, not_interested");
};

export const updateOpportunityInterest = (
  opportunityId: string,
  payload: unknown
): {
  stored_opportunity: OpportunityRecord;
  feed: OpportunitiesFeedResponse;
} => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid interest payload");
  }
  const parsed = payload as { interest?: unknown };
  const interest = coerceOpportunityInterestInput(parsed.interest);
  const row = db
    .prepare(
      `SELECT ${OPPORTUNITY_SELECT_COLUMNS}
       FROM opportunities
       WHERE id = ?`
    )
    .get(opportunityId) as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error("Opportunity not found");
  }
  db.prepare(`UPDATE opportunities SET interest = ? WHERE id = ?`).run(interest, opportunityId);
  const storedRow = db
    .prepare(
      `SELECT ${OPPORTUNITY_SELECT_COLUMNS}
       FROM opportunities
       WHERE id = ?`
    )
    .get(opportunityId) as Record<string, unknown> | undefined;
  if (!storedRow) {
    throw new Error("Failed to store opportunity interest");
  }
  return {
    stored_opportunity: mapOpportunityRow(storedRow),
    feed: listOpportunitiesFeed(),
  };
};

const coerceOpportunityStatusInput = (value: unknown): OpportunityStatus => {
  if (value === "new" || value === "watch" || value === "passed" || value === "converted") {
    return value;
  }
  throw new Error("status must be one of: new, watch, passed, converted");
};

export const updateOpportunityStatus = (
  opportunityId: string,
  payload: unknown
): {
  stored_opportunity: OpportunityRecord;
  feed: OpportunitiesFeedResponse;
} => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid status payload");
  }
  const parsed = payload as { status?: unknown };
  const status = coerceOpportunityStatusInput(parsed.status);
  const row = db
    .prepare(
      `SELECT ${OPPORTUNITY_SELECT_COLUMNS}
       FROM opportunities
       WHERE id = ?`
    )
    .get(opportunityId) as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error("Opportunity not found");
  }
  db.prepare(`UPDATE opportunities SET status = ? WHERE id = ?`).run(status, opportunityId);
  const storedRow = db
    .prepare(
      `SELECT ${OPPORTUNITY_SELECT_COLUMNS}
       FROM opportunities
       WHERE id = ?`
    )
    .get(opportunityId) as Record<string, unknown> | undefined;
  if (!storedRow) {
    throw new Error("Failed to store opportunity status");
  }
  return {
    stored_opportunity: mapOpportunityRow(storedRow),
    feed: listOpportunitiesFeed(),
  };
};

const coerceDecisionAction = (value: unknown): OpportunityDecisionAction => {
  if (value === "watch" || value === "must_buy" || value === "pass") {
    return value;
  }
  throw new Error("action must be one of: watch, must_buy, pass");
};

export const saveOpportunityDecision = (
  opportunityId: string,
  payload: unknown
): { stored_decision: OpportunityDecisionRecord; feed: OpportunitiesFeedResponse } => {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid decision payload");
  }
  const parsed = payload as {
    action?: unknown;
    reason?: unknown;
    note?: unknown;
  };
  const action = coerceDecisionAction(parsed.action);
  const reason = typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : null;
  const note = typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : null;

  if (action === "pass" && !reason) {
    throw new Error("reason is required when action=pass");
  }

  const row = db
    .prepare(
      `SELECT
        ${OPPORTUNITY_SELECT_COLUMNS}
       FROM opportunities
       WHERE id = ?`
    )
    .get(opportunityId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error("Opportunity not found");
  }

  const opportunity = mapOpportunityRow(row);
  if (opportunity.import_status !== "valid") {
    throw new Error("Opportunity needs review before actions");
  }
  const decisionId = crypto.randomUUID();
  const decidedAt = nowIso();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO opportunity_decisions
        (id, opportunity_id, action, reason, note, decided_at, opportunity_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(decisionId, opportunityId, action, reason, note, decidedAt, JSON.stringify(opportunity));

    const nextStatus: OpportunityStatus = action === "watch" ? "watch" : action === "must_buy" ? "watch" : "passed";
    db.prepare(`UPDATE opportunities SET status = ? WHERE id = ?`).run(nextStatus, opportunityId);
  })();

  const storedDecision: OpportunityDecisionRecord = {
    id: decisionId,
    opportunity_id: opportunityId,
    action,
    reason,
    note,
    decided_at: decidedAt,
    opportunity_snapshot: opportunity,
  };

  return {
    stored_decision: storedDecision,
    feed: listOpportunitiesFeed(),
  };
};
