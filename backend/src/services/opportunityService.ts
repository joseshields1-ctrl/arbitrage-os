import { db } from "../db/sqlite";
import type {
  OpportunitiesFeedResponse,
  OpportunityDecisionAction,
  OpportunityDecisionRecord,
  OpportunityInterest,
  OpportunityRecord,
  OpportunityStatus,
  OpportunityTitleStatus,
} from "../models/opportunities";

const nowIso = (): string => new Date().toISOString();
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

const mapOpportunityRow = (row: Record<string, unknown>): OpportunityRecord => {
  const auctionEnd = typeof row.auction_end === "string" ? row.auction_end : "";
  const auctionEndTs = Date.parse(auctionEnd);
  const timeLeftHours =
    Number.isFinite(auctionEndTs) ? (auctionEndTs - Date.now()) / (1000 * 60 * 60) : null;
  const isEnded = timeLeftHours !== null && timeLeftHours <= 0;
  return {
    id: String(row.id),
    source:
      row.source === "url_import" || row.source === "keyword_search" || row.source === "manual_import"
        ? row.source
        : "manual_import",
    listing_url: String(row.listing_url ?? ""),
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
    buyer_premium_pct: Number(row.buyer_premium_pct ?? 0),
    removal_window_days: Number(row.removal_window_days ?? 0),
    title_status:
      row.title_status === "on_site" ||
      row.title_status === "delayed" ||
      row.title_status === "unknown"
        ? (row.title_status as OpportunityTitleStatus)
        : "unknown",
    relisted: Boolean(Number(row.relisted ?? 0)),
    condition_raw: String(row.condition_raw ?? ""),
    estimated_resale_value: Number(row.estimated_resale_value ?? 0),
    estimated_repair_cost: Number(row.estimated_repair_cost ?? 0),
    quantity_purchased:
      row.quantity_purchased === null || row.quantity_purchased === undefined
        ? null
        : Number(row.quantity_purchased),
    quantity_broken:
      row.quantity_broken === null || row.quantity_broken === undefined
        ? null
        : Number(row.quantity_broken),
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
      listing_url: "",
      title: "Unknown opportunity",
      category: "other",
      current_bid: 0,
      auction_end: nowIso(),
      auction_state: "unknown",
      time_left_hours: null,
      location: "",
      seller_agency: "",
      seller_type: "unknown",
      buyer_premium_pct: 0,
      removal_window_days: 0,
      title_status: "unknown",
      relisted: false,
      condition_raw: "",
      estimated_resale_value: 0,
      estimated_repair_cost: 0,
      quantity_purchased: null,
      quantity_broken: null,
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
        id, source, listing_url, title, category, current_bid, auction_end, location, seller_agency,
        seller_type, buyer_premium_pct, removal_window_days, title_status, relisted, condition_raw,
        estimated_resale_value, estimated_repair_cost, quantity_purchased, quantity_broken, status, interest, created_at
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

const normalizeOpportunityPayload = (raw: unknown): OpportunityRecord => {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid opportunity payload item");
  }
  const parsed = raw as Record<string, unknown>;
  const idRaw = coerceString(parsed.id).trim();
  if (!idRaw) {
    throw new Error("Opportunity id is required");
  }
  const sourceRaw = parsed.source;
  const source =
    sourceRaw === "url_import" || sourceRaw === "keyword_search" || sourceRaw === "manual_import"
      ? sourceRaw
      : "manual_import";
  const categoryRaw = parsed.category;
  const category = categoryRaw === "vehicle" || categoryRaw === "electronics" || categoryRaw === "other"
    ? categoryRaw
    : "other";
  const sellerTypeRaw = parsed.seller_type;
  const sellerType =
    sellerTypeRaw === "government" || sellerTypeRaw === "commercial" || sellerTypeRaw === "unknown"
      ? sellerTypeRaw
      : "unknown";
  const titleStatusRaw = parsed.title_status;
  const titleStatus =
    titleStatusRaw === "on_site" || titleStatusRaw === "delayed" || titleStatusRaw === "unknown"
      ? titleStatusRaw
      : "unknown";
  const createdAtRaw = coerceString(parsed.created_at).trim();
  const createdAt = createdAtRaw && Number.isFinite(Date.parse(createdAtRaw)) ? createdAtRaw : nowIso();

  return {
    id: idRaw,
    source,
    listing_url: coerceString(parsed.listing_url),
    title: coerceString(parsed.title),
    category,
    current_bid: Math.max(0, coerceNumber(parsed.current_bid)),
    auction_end: coerceString(parsed.auction_end) || nowIso(),
    auction_state: "unknown",
    time_left_hours: null,
    location: coerceString(parsed.location),
    seller_agency: coerceString(parsed.seller_agency),
    seller_type: sellerType,
    buyer_premium_pct: Math.max(0, coerceNumber(parsed.buyer_premium_pct)),
    removal_window_days: Math.max(1, Math.floor(coerceNumber(parsed.removal_window_days, 3))),
    title_status: titleStatus,
    relisted: coerceBoolean(parsed.relisted),
    condition_raw: coerceString(parsed.condition_raw),
    estimated_resale_value: Math.max(0, coerceNumber(parsed.estimated_resale_value)),
    estimated_repair_cost: Math.max(0, coerceNumber(parsed.estimated_repair_cost)),
    quantity_purchased: normalizeNullableInteger(parsed.quantity_purchased),
    quantity_broken: normalizeNullableInteger(parsed.quantity_broken),
    status: coerceOpportunityStatus(parsed.status),
    interest: coerceOpportunityInterest(parsed.interest),
    created_at: createdAt,
  };
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
        id, source, listing_url, title, category, current_bid, auction_end, location, seller_agency,
        seller_type, buyer_premium_pct, removal_window_days, title_status, relisted, condition_raw,
        estimated_resale_value, estimated_repair_cost, quantity_purchased, quantity_broken, status, interest, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    normalized.forEach((opportunity) => {
      insert.run(
        opportunity.id,
        opportunity.source,
        opportunity.listing_url,
        opportunity.title,
        opportunity.category,
        opportunity.current_bid,
        opportunity.auction_end,
        opportunity.location,
        opportunity.seller_agency,
        opportunity.seller_type,
        opportunity.buyer_premium_pct,
        opportunity.removal_window_days,
        opportunity.title_status,
        opportunity.relisted ? 1 : 0,
        opportunity.condition_raw,
        opportunity.estimated_resale_value,
        opportunity.estimated_repair_cost,
        opportunity.quantity_purchased,
        opportunity.quantity_broken,
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
        id, source, listing_url, title, category, current_bid, auction_end, location, seller_agency,
        seller_type, buyer_premium_pct, removal_window_days, title_status, relisted, condition_raw,
        estimated_resale_value, estimated_repair_cost, quantity_purchased, quantity_broken, status, interest, created_at
       FROM opportunities
       WHERE id = ?`
    )
    .get(opportunityId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error("Opportunity not found");
  }

  const opportunity = mapOpportunityRow(row);
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
