export type OpportunityCategory = "vehicle" | "electronics" | "other";
export type OpportunityStatus = "new" | "watch" | "passed" | "converted";
export type OpportunityInterest = "undecided" | "interested" | "not_interested";
export type OpportunitySellerType = "government" | "commercial" | "unknown";
export type OpportunityTitleStatus = "on_site" | "delayed" | "unknown";
export type OpportunityAuctionState = "active" | "ended" | "unknown";

export interface OpportunityRecord {
  id: string;
  source: "url_import" | "keyword_search" | "manual_import";
  listing_url: string;
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
  estimated_resale_value: number;
  estimated_repair_cost: number;
  quantity_purchased: number | null;
  quantity_broken: number | null;
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
