import type {
  AssistantQueryRequest,
  AssistantQueryResponse,
  CreateDealRequest,
  DashboardResponse,
  DealDecisionRequest,
  DealDecisionResponse,
  DealStage,
  DealView,
  OpportunitiesFeedContract,
  OpportunityDecisionAction,
} from "./types";

const PROD_API_FALLBACK = "https://arbitrage-os-backend.onrender.com";
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.PROD ? PROD_API_FALLBACK : "")
).replace(/\/+$/, "");
const apiUrl = (path: string): string => {
  if (!API_BASE) {
    return path;
  }

  if (API_BASE.endsWith("/api") && path.startsWith("/api/")) {
    return `${API_BASE}${path.slice(4)}`;
  }

  return `${API_BASE}${path}`;
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error ?? "Request failed");
  }
  return response.json() as Promise<T>;
};

export const createDeal = async (payload: CreateDealRequest): Promise<DealView> => {
  const response = await fetch(apiUrl("/api/deals"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<DealView>(response);
};

export const fetchDeals = async (): Promise<DealView[]> => {
  const response = await fetch(apiUrl("/api/deals"));
  const body = await handleResponse<{ deals: DealView[] }>(response);
  return body.deals;
};

export const updateDealStage = async (
  dealId: string,
  stage: DealStage,
  completionData?: { sale_price_actual: number; completion_date: string }
): Promise<DealView> => {
  const response = await fetch(apiUrl(`/api/deals/${dealId}/stage`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      completionData
        ? { stage, completion_data: completionData }
        : { stage }
    ),
  });
  return handleResponse<DealView>(response);
};

export const fetchDashboard = async (): Promise<DashboardResponse> => {
  const response = await fetch(apiUrl("/api/dashboard"));
  return handleResponse<DashboardResponse>(response);
};

export const queryAssistant = async (
  payload: AssistantQueryRequest,
  signal?: AbortSignal
): Promise<AssistantQueryResponse> => {
  const response = await fetch(apiUrl("/api/assistant/query"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  return handleResponse<AssistantQueryResponse>(response);
};

export const previewDeal = async (payload: CreateDealRequest): Promise<DealView> => {
  const response = await fetch(apiUrl("/api/deals/preview"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<DealView>(response);
};

export const submitDealDecision = async (
  dealId: string,
  payload: DealDecisionRequest
): Promise<DealDecisionResponse> => {
  const response = await fetch(apiUrl(`/api/deals/${dealId}/decision`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<DealDecisionResponse>(response);
};

export const fetchOpportunitiesFeed = async (
  signal?: AbortSignal
): Promise<OpportunitiesFeedContract> => {
  const response = await fetch(apiUrl("/api/opportunities/feed"), { signal });
  return handleResponse<OpportunitiesFeedContract>(response);
};

export const syncOpportunities = async (
  opportunities: OpportunitiesFeedContract["opportunities"]
): Promise<{ saved_count: number; feed: OpportunitiesFeedContract }> => {
  const response = await fetch(apiUrl("/api/opportunities/sync"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opportunities }),
  });
  return handleResponse<{ saved_count: number; feed: OpportunitiesFeedContract }>(response);
};

export const saveOpportunityDecision = async (
  opportunityId: string,
  payload: { action: OpportunityDecisionAction; reason?: string | null; note?: string | null }
): Promise<{
  stored_decision: OpportunitiesFeedContract["decisions"][number];
  feed: OpportunitiesFeedContract;
}> => {
  const response = await fetch(apiUrl(`/api/opportunities/${opportunityId}/decision`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<{
    stored_decision: OpportunitiesFeedContract["decisions"][number];
    feed: OpportunitiesFeedContract;
  }>(response);
};

export const parseGovDealsListing = async (payload: {
  listing_url: string;
  keyword_hint?: string;
}): Promise<import("./utils/govDealsScanner").OpportunityImportReviewResponse> => {
  const response = await fetch(apiUrl("/api/opportunities/parse-govdeals"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<import("./utils/govDealsScanner").OpportunityImportReviewResponse>(response);
};

export const confirmOpportunityImport = async (payload: {
  review: import("./utils/govDealsScanner").OpportunityImportReviewResponse;
  operator_overrides?: Partial<import("./utils/govDealsScanner").OpportunityEditableFields>;
  source?: "url_import" | "keyword_search" | "manual_import";
}): Promise<{
  stored_opportunity: import("./utils/govDealsScanner").GovDealsOpportunity;
  dedupe_action: "created" | "updated_existing";
  feed: OpportunitiesFeedContract;
}> => {
  const response = await fetch(apiUrl("/api/opportunities/confirm-import"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<{
    stored_opportunity: import("./utils/govDealsScanner").GovDealsOpportunity;
    dedupe_action: "created" | "updated_existing";
    feed: OpportunitiesFeedContract;
  }>(response);
};

export const overrideOpportunityValues = async (
  opportunityId: string,
  overrides: Partial<import("./utils/govDealsScanner").OpportunityEditableFields>
): Promise<{
  stored_opportunity: import("./utils/govDealsScanner").GovDealsOpportunity;
  feed: OpportunitiesFeedContract;
}> => {
  const response = await fetch(apiUrl(`/api/opportunities/${opportunityId}/override`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overrides }),
  });
  return handleResponse<{
    stored_opportunity: import("./utils/govDealsScanner").GovDealsOpportunity;
    feed: OpportunitiesFeedContract;
  }>(response);
};

export const updateOpportunityInterest = async (
  opportunityId: string,
  interest: "undecided" | "interested" | "not_interested"
): Promise<{
  stored_opportunity: import("./utils/govDealsScanner").GovDealsOpportunity;
  feed: OpportunitiesFeedContract;
}> => {
  const response = await fetch(apiUrl(`/api/opportunities/${opportunityId}/interest`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interest }),
  });
  return handleResponse<{
    stored_opportunity: import("./utils/govDealsScanner").GovDealsOpportunity;
    feed: OpportunitiesFeedContract;
  }>(response);
};

export const overrideDealValues = async (
  dealId: string,
  payload: {
    deal?: {
      acquisition_state?: string;
      seller_type?: "government" | "commercial" | "unknown";
      quantity_purchased?: number | null;
      quantity_broken?: number | null;
    };
    financials?: {
      acquisition_cost?: number;
      buyer_premium_pct?: number;
      tax_rate?: number | null;
      transport_cost_actual?: number | null;
      transport_cost_estimated?: number | null;
      repair_cost?: number | null;
      prep_cost?: number | null;
      estimated_market_value?: number;
      sale_price_actual?: number | null;
    };
    metadata?: {
      condition_grade?: import("./types").ConditionGrade;
      condition_notes?: string;
      transport_type?: import("./types").TransportType;
      presentation_quality?: string;
      removal_deadline?: string | null;
      title_status?: import("./types").TitleStatus;
    };
  }
): Promise<DealView> => {
  const response = await fetch(apiUrl(`/api/deals/${dealId}/override`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<DealView>(response);
};
