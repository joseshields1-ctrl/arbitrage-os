import { db } from "../db/sqlite";
import type { OpportunityCategory, OpportunityRecord } from "../models/opportunities";
import {
  confirmOpportunityImport,
  deleteOpportunityById,
  getOpportunityById,
  listOpportunitiesFeed,
  overrideOpportunityValues,
} from "./opportunityService";

export type AuctionVerdict = "good" | "bad" | "neutral";

export interface AuctionRecord {
  id: string;
  source: "govdeals" | "manual";
  title: string | null;
  bid_amount: number | null;
  bid_increment: number | null;
  end_time: string | null;
  time_left_seconds: number | null;
  seller_name: string | null;
  seller_location: string | null;
  auction_url: string | null;
  category: OpportunityCategory;
  tags: string[];
  notes: string | null;
  verdict: AuctionVerdict;
  created_at: string;
  updated_at: string;
}

export interface ManualAuctionInput {
  title: string;
  bid_amount?: number | null;
  bid_increment?: number | null;
  end_time?: string | null;
  seller_name?: string | null;
  seller_location?: string | null;
  auction_url: string;
  category?: OpportunityCategory;
  tags?: string[];
  notes?: string | null;
  verdict?: AuctionVerdict;
}

export interface UpdateAuctionInput {
  title?: string | null;
  bid_amount?: number | null;
  bid_increment?: number | null;
  end_time?: string | null;
  seller_name?: string | null;
  seller_location?: string | null;
  auction_url?: string | null;
  tags?: string[];
  notes?: string | null;
  verdict?: AuctionVerdict;
}

interface AuctionLabelRow {
  opportunity_id: string;
  verdict: AuctionVerdict;
  tags: string;
  notes: string | null;
  updated_at: string;
}

const nowIso = (): string => new Date().toISOString();

const normalizeVerdict = (value: unknown): AuctionVerdict => {
  if (value === "good" || value === "bad" || value === "neutral") {
    return value;
  }
  return "neutral";
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, 24);
};

const normalizeNullableString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed >= 0 ? parsed : null;
};

const parseBidIncrementFromRaw = (opportunity: OpportunityRecord): number | null => {
  if (typeof opportunity.bid_increment === "number" && Number.isFinite(opportunity.bid_increment)) {
    return opportunity.bid_increment;
  }
  const text = opportunity.raw_import_data?.bid_increment_text;
  if (!text) {
    return null;
  }
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const readLabels = (): Map<string, AuctionLabelRow> => {
  const rows = db
    .prepare(
      `SELECT opportunity_id, verdict, tags, notes, updated_at
       FROM auction_labels`
    )
    .all() as Array<Record<string, unknown>>;
  const map = new Map<string, AuctionLabelRow>();
  rows.forEach((row) => {
    map.set(String(row.opportunity_id), {
      opportunity_id: String(row.opportunity_id),
      verdict: normalizeVerdict(row.verdict),
      tags: typeof row.tags === "string" ? row.tags : "[]",
      notes: normalizeNullableString(row.notes),
      updated_at: normalizeNullableString(row.updated_at) ?? nowIso(),
    });
  });
  return map;
};

const parseTagsJson = (value: string): string[] => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return normalizeTags(parsed);
  } catch {
    return [];
  }
};

const mapOpportunityToAuction = (
  opportunity: OpportunityRecord,
  labelsByOpportunityId: Map<string, AuctionLabelRow>
): AuctionRecord => {
  const endTs = opportunity.auction_end ? Date.parse(opportunity.auction_end) : Number.NaN;
  const timeLeftSeconds = Number.isFinite(endTs)
    ? Math.max(0, Math.floor((endTs - Date.now()) / 1000))
    : null;
  const label = labelsByOpportunityId.get(opportunity.id);
  const tags = label ? parseTagsJson(label.tags) : [];
  return {
    id: opportunity.id,
    source: opportunity.source,
    title: opportunity.title,
    bid_amount: opportunity.current_bid,
    bid_increment: parseBidIncrementFromRaw(opportunity),
    end_time: opportunity.auction_end,
    time_left_seconds: timeLeftSeconds,
    seller_name: opportunity.seller_agency,
    seller_location: opportunity.location,
    auction_url: opportunity.listing_url,
    category: opportunity.category,
    tags,
    notes: label?.notes ?? null,
    verdict: label?.verdict ?? "neutral",
    created_at: opportunity.created_at,
    updated_at: label?.updated_at ?? opportunity.imported_at ?? opportunity.created_at,
  };
};

const upsertAuctionLabel = (opportunityId: string, input: UpdateAuctionInput | ManualAuctionInput): void => {
  const existing = db
    .prepare(
      `SELECT verdict, tags, notes
       FROM auction_labels
       WHERE opportunity_id = ?`
    )
    .get(opportunityId) as
    | {
        verdict: unknown;
        tags: unknown;
        notes: unknown;
      }
    | undefined;
  const existingVerdict = normalizeVerdict(existing?.verdict);
  const existingTags =
    typeof existing?.tags === "string" ? parseTagsJson(existing.tags) : [];
  const existingNotes = normalizeNullableString(existing?.notes);
  const verdict = input.verdict === undefined ? existingVerdict : normalizeVerdict(input.verdict);
  const tags = input.tags === undefined ? existingTags : normalizeTags(input.tags);
  const notes = input.notes === undefined ? existingNotes : normalizeNullableString(input.notes);
  db.prepare(
    `INSERT INTO auction_labels (opportunity_id, verdict, tags, notes, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(opportunity_id) DO UPDATE SET
       verdict = excluded.verdict,
       tags = excluded.tags,
       notes = excluded.notes,
       updated_at = excluded.updated_at`
  ).run(opportunityId, verdict, JSON.stringify(tags), notes, nowIso());
};

const updateUrlFields = (opportunityId: string, auctionUrl: string | null | undefined): void => {
  if (auctionUrl === undefined) {
    return;
  }
  const normalized = normalizeNullableString(auctionUrl);
  db.prepare(`UPDATE opportunities SET listing_url = ?, canonical_url = ? WHERE id = ?`).run(
    normalized,
    normalized,
    opportunityId
  );
};

const updateBidIncrementField = (opportunityId: string, bidIncrement: number | null | undefined): void => {
  if (bidIncrement === undefined) {
    return;
  }
  db.prepare(`UPDATE opportunities SET bid_increment = ? WHERE id = ?`).run(
    normalizeNullableNumber(bidIncrement),
    opportunityId
  );
};

export const listAuctions = (): AuctionRecord[] => {
  const labelsByOpportunityId = readLabels();
  return listOpportunitiesFeed().opportunities.map((item) =>
    mapOpportunityToAuction(item, labelsByOpportunityId)
  );
};

export const getAuctionById = (auctionId: string): AuctionRecord | null => {
  const opportunity = getOpportunityById(auctionId);
  if (!opportunity) {
    return null;
  }
  return mapOpportunityToAuction(opportunity, readLabels());
};

export const createManualAuction = (input: ManualAuctionInput): AuctionRecord => {
  const title = normalizeNullableString(input.title);
  const auctionUrl = normalizeNullableString(input.auction_url);
  if (!title) {
    throw new Error("title is required");
  }
  if (!auctionUrl) {
    throw new Error("auction_url is required");
  }
  const endTime = normalizeNullableString(input.end_time);
  const review = {
    source: "manual_draft" as const,
    listing_url: auctionUrl,
    canonical_url: auctionUrl,
    account_id: null,
    item_id: null,
    listing_id: null,
    raw_fields: {
      account_id: null,
      item_id: null,
      listing_id: null,
      title,
      current_bid_text:
        input.bid_amount === null || input.bid_amount === undefined ? null : String(input.bid_amount),
      bid_increment_text:
        input.bid_increment === null || input.bid_increment === undefined
          ? null
          : String(input.bid_increment),
      auction_end_text: endTime,
      time_remaining_text: null,
      location_text: normalizeNullableString(input.seller_location),
      seller_agency_text: normalizeNullableString(input.seller_name),
      seller_contact_text: null,
      category_text: input.category ?? "other",
      buyer_premium_text: null,
      description_text: normalizeNullableString(input.notes),
      vin_text: null,
      condition_text: null,
      quantity_text: null,
      terms_text: null,
      attachment_links_text: null,
    },
    parsed_fields: {
      listing_id: null,
      canonical_url: auctionUrl,
      title,
      current_bid: normalizeNullableNumber(input.bid_amount),
      bid_increment: normalizeNullableNumber(input.bid_increment),
      auction_end: endTime,
      location: normalizeNullableString(input.seller_location),
      seller_agency: normalizeNullableString(input.seller_name),
      category: input.category ?? "other",
      buyer_premium_pct: null,
      estimated_resale_value: null,
      estimated_transport_override: null,
      estimated_repair_cost: null,
      quantity_purchased: null,
      quantity_broken: null,
      condition_raw: normalizeNullableString(input.notes),
      title_status: "unknown",
      removal_window_days: null,
      seller_type: "unknown",
      description: normalizeNullableString(input.notes),
      attachment_links: [],
      seller_contact: null,
      buyer_premium_explicit: false,
    },
    missing_fields: [],
    import_status: "needs_review" as const,
    import_confidence: 70,
    blocked_reason: null,
    parser_error: null,
    extraction_notes: ["manual auction entry"],
    selector_hits: {},
  };
  const result = confirmOpportunityImport({
    review,
    source: "manual_import",
  });
  upsertAuctionLabel(result.stored_opportunity.id, input);
  const auction = getAuctionById(result.stored_opportunity.id);
  if (!auction) {
    throw new Error("Failed to create manual auction");
  }
  return auction;
};

export const updateAuction = (auctionId: string, input: UpdateAuctionInput): AuctionRecord => {
  const existing = getOpportunityById(auctionId);
  if (!existing) {
    throw new Error("Auction not found");
  }
  const overrides = {
    ...(input.title !== undefined ? { title: normalizeNullableString(input.title) } : {}),
    ...(input.bid_amount !== undefined ? { current_bid: normalizeNullableNumber(input.bid_amount) } : {}),
    ...(input.bid_increment !== undefined
      ? { bid_increment: normalizeNullableNumber(input.bid_increment) }
      : {}),
    ...(input.end_time !== undefined ? { auction_end: normalizeNullableString(input.end_time) } : {}),
    ...(input.seller_name !== undefined ? { seller_agency: normalizeNullableString(input.seller_name) } : {}),
    ...(input.seller_location !== undefined
      ? { location: normalizeNullableString(input.seller_location) }
      : {}),
  };
  if (Object.keys(overrides).length > 0) {
    overrideOpportunityValues(auctionId, { overrides });
  }
  updateUrlFields(auctionId, input.auction_url);
  updateBidIncrementField(auctionId, input.bid_increment);
  if (
    input.tags !== undefined ||
    input.notes !== undefined ||
    input.verdict !== undefined
  ) {
    upsertAuctionLabel(auctionId, input);
  }
  const updated = getAuctionById(auctionId);
  if (!updated) {
    throw new Error("Failed to update auction");
  }
  return updated;
};

export const deleteAuction = (auctionId: string): boolean => {
  db.prepare(`DELETE FROM auction_labels WHERE opportunity_id = ?`).run(auctionId);
  return deleteOpportunityById(auctionId);
};

export const buildAuctionAssistantSnapshot = (auctionId: string): Record<string, unknown> | null => {
  const opportunity = getOpportunityById(auctionId);
  if (!opportunity) {
    return null;
  }
  return {
    opportunity: {
      id: opportunity.id,
      title: opportunity.title,
      current_bid: opportunity.current_bid,
      bid_increment: opportunity.bid_increment,
      auction_end: opportunity.auction_end,
      location: opportunity.location,
      seller_agency: opportunity.seller_agency,
      estimated_resale_value: opportunity.estimated_resale_value,
      estimated_transport_override: opportunity.estimated_transport_override,
      estimated_repair_cost: opportunity.estimated_repair_cost,
      condition_raw: opportunity.condition_raw,
      import_confidence: opportunity.import_confidence,
      import_missing_fields: opportunity.import_missing_fields,
      blocked_reason: opportunity.blocked_reason,
      listing_url: opportunity.listing_url,
    },
  };
};
