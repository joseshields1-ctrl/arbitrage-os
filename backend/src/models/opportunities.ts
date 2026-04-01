export type OpportunityCategory = "vehicle" | "electronics" | "other";
export type OpportunityStatus = "new" | "watch" | "passed" | "converted";
export type OpportunityInterest = "undecided" | "interested" | "not_interested";
export type OpportunitySellerType = "government" | "commercial" | "unknown";
export type OpportunityTitleStatus = "on_site" | "delayed" | "unknown";
export type OpportunityAuctionState = "active" | "ended" | "unknown";
export type OpportunityImportStatus = "active" | "needs_review";
export type OpportunityCriticalField =
  | "title"
  | "current_bid"
  | "auction_end"
  | "location"
  | "seller_agency";

export interface OpportunityEditableFields {
  title: string;
  current_bid: number;
  buyer_premium_pct: number;
  estimated_resale_value: number;
  estimated_transport_override: number | null;
  estimated_repair_cost: number;
  quantity_purchased: number | null;
  quantity_broken: number | null;
  condition_raw: string;
  title_status: OpportunityTitleStatus;
  removal_window_days: number;
  seller_agency: string;
  seller_type: OpportunitySellerType;
  location: string;
  auction_end: string;
}

export interface OpportunityRawImportFields {
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

export interface OpportunityRecord {
  id: string;
  source: "url_import" | "keyword_search" | "manual_import";
  listing_id: string | null;
  listing_url: string;
  canonical_url: string;
  title: string;
  category: OpportunityCategory;
  current_bid: number;
  auction_end: string;
  auction_state: OpportunityAuctionState;
  time_left_hours: number | null;
  location: string;
  seller_agency: string;
  seller_type: OpportunitySellerType;
  buyer_premium_pct: number;
  removal_window_days: number;
  title_status: OpportunityTitleStatus;
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
  import_confidence: number;
  import_missing_fields: OpportunityCriticalField[];
  raw_import_data: OpportunityRawImportFields | null;
  operator_overrides: Partial<OpportunityEditableFields> | null;
  imported_at: string | null;
  status: OpportunityStatus;
  interest: OpportunityInterest;
  created_at: string;
}

export type OpportunityDecisionAction = "watch" | "must_buy" | "pass";

export interface OpportunityDecisionRecord {
  id: string;
  opportunity_id: string;
  action: OpportunityDecisionAction;
  reason: string | null;
  note: string | null;
  decided_at: string;
  opportunity_snapshot: OpportunityRecord;
}

export type OpportunitiesFeedStatus =
  | "loading"
  | "valid_empty"
  | "backend_error"
  | "timeout"
  | "feed_offline";

export interface OpportunitiesFeedResponse {
  status: "valid_empty" | "feed_offline";
  feed_mode: "manual_persisted";
  last_polled_at: string | null;
  generated_at: string;
  opportunities: OpportunityRecord[];
  decisions: OpportunityDecisionRecord[];
  message: string;
  error: null;
}

export interface OpportunityImportReviewResponse {
  listing_url: string;
  canonical_url: string;
  listing_id: string | null;
  raw_fields: OpportunityRawImportFields;
  parsed_fields: Partial<OpportunityEditableFields> & {
    listing_id: string | null;
    canonical_url: string;
    category: OpportunityCategory;
    description: string | null;
    attachment_links: string[];
    seller_contact: string | null;
  };
  missing_fields: OpportunityCriticalField[];
  import_status: OpportunityImportStatus;
  import_confidence: number;
  extraction_notes: string[];
  selector_hits: Record<string, string[]>;
}
