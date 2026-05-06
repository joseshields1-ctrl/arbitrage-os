export type OpportunityCategory = "vehicle" | "electronics" | "other";
export type OpportunitySource = "govdeals" | "manual";
export type OpportunityStatus = "draft" | "new" | "watch" | "passed" | "converted";
export type OpportunityInterest = "undecided" | "interested" | "not_interested";
export type OpportunitySellerType = "government" | "commercial" | "unknown";
export type OpportunityTitleStatus = "on_site" | "delayed" | "unknown";
export type OpportunityAuctionState = "active" | "ended" | "unknown";
export type OpportunityImportStatus = "valid" | "needs_review" | "blocked";
export type OpportunityCriticalField =
  | "identity"
  | "title"
  | "current_bid"
  | "auction_end"
  | "location"
  | "seller_agency";

export interface OpportunityEditableFields {
  title: string | null;
  current_bid: number | null;
  bid_increment: number | null;
  buyer_premium_pct: number | null;
  estimated_resale_value: number | null;
  estimated_transport_override: number | null;
  estimated_repair_cost: number | null;
  quantity_purchased: number | null;
  quantity_broken: number | null;
  condition_raw: string | null;
  title_status: OpportunityTitleStatus | null;
  removal_window_days: number | null;
  seller_agency: string | null;
  seller_type: OpportunitySellerType | null;
  location: string | null;
  auction_end: string | null;
}

export interface OpportunityValueLayer<T> {
  imported_value: T | null;
  operator_override: T | null;
  effective_value: T | null;
}

export interface OpportunityValueLayers {
  title: OpportunityValueLayer<string>;
  current_bid: OpportunityValueLayer<number>;
  bid_increment: OpportunityValueLayer<number>;
  buyer_premium_pct: OpportunityValueLayer<number>;
  estimated_resale_value: OpportunityValueLayer<number>;
  estimated_transport_override: OpportunityValueLayer<number>;
  estimated_repair_cost: OpportunityValueLayer<number>;
  quantity_purchased: OpportunityValueLayer<number>;
  quantity_broken: OpportunityValueLayer<number>;
  removal_window_days: OpportunityValueLayer<number>;
  title_status: OpportunityValueLayer<OpportunityTitleStatus>;
  seller_type: OpportunityValueLayer<OpportunitySellerType>;
  seller_agency: OpportunityValueLayer<string>;
  location: OpportunityValueLayer<string>;
  condition_raw: OpportunityValueLayer<string>;
  auction_end: OpportunityValueLayer<string>;
}

export interface OpportunityRawImportFields {
  account_id: string | null;
  item_id: string | null;
  listing_id: string | null;
  title: string | null;
  current_bid_text: string | null;
  bid_increment_text: string | null;
  auction_end_text: string | null;
  time_remaining_text: string | null;
  location_text: string | null;
  seller_agency_text: string | null;
  seller_contact_text: string | null;
  category_text: string | null;
  buyer_premium_text: string | null;
  description_text: string | null;
  vin_text: string | null;
  condition_text: string | null;
  quantity_text: string | null;
  terms_text: string | null;
  attachment_links_text: string | null;
}

export interface OpportunityRecord {
  id: string;
  source: OpportunitySource;
  account_id: string | null;
  item_id: string | null;
  listing_id: string | null;
  listing_url: string | null;
  canonical_url: string | null;
  title: string | null;
  category: OpportunityCategory;
  current_bid: number | null;
  bid_increment: number | null;
  auction_end: string | null;
  auction_state: OpportunityAuctionState;
  time_left_hours: number | null;
  location: string | null;
  seller_agency: string | null;
  seller_type: OpportunitySellerType;
  buyer_premium_pct: number | null;
  buyer_premium_explicit: boolean;
  removal_window_days: number | null;
  title_status: OpportunityTitleStatus;
  relisted: boolean;
  condition_raw: string | null;
  description: string | null;
  attachment_links: string[];
  seller_contact: string | null;
  estimated_resale_value: number | null;
  estimated_transport_override: number | null;
  estimated_repair_cost: number | null;
  quantity_purchased: number | null;
  quantity_broken: number | null;
  import_status: OpportunityImportStatus;
  import_confidence: number | null;
  import_missing_fields: OpportunityCriticalField[];
  raw_import_data: OpportunityRawImportFields | null;
  operator_overrides: Partial<OpportunityEditableFields> | null;
  value_layers: OpportunityValueLayers | null;
  blocked_reason: string | null;
  parser_error: string | null;
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
  ai_recommendation_snapshot?: {
    suggested_action: "buy" | "pass" | "investigate";
    confidence: number;
    reasoning: string;
    key_factors: string[];
  } | null;
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
  source: "url_import" | "pasted_text" | "manual_draft";
  listing_url: string;
  canonical_url: string;
  account_id: string | null;
  item_id: string | null;
  listing_id: string | null;
  raw_fields: OpportunityRawImportFields;
  parsed_fields: Partial<OpportunityEditableFields> & {
    listing_id: string | null;
    canonical_url: string;
    category: OpportunityCategory;
    description: string | null;
    attachment_links: string[];
    seller_contact: string | null;
    bid_increment?: number | null;
    vin?: string | null;
    buyer_premium_explicit?: boolean;
  };
  missing_fields: OpportunityCriticalField[];
  import_status: OpportunityImportStatus;
  import_confidence: number | null;
  blocked_reason: string | null;
  parser_error: string | null;
  request_headers?: {
    "User-Agent": string;
    "Accept-Language": string;
    Referer: string;
  };
  extraction_notes: string[];
  selector_hits: Record<string, string[]>;
}
