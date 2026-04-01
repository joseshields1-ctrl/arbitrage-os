import type {
  AssistantQueryRequest,
  AssistantQueryResponse,
  CreateDealRequest,
  DashboardResponse,
  DealDecisionRequest,
  DealDecisionResponse,
  DealStage,
  DealView,
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
  payload: AssistantQueryRequest
): Promise<AssistantQueryResponse> => {
  const response = await fetch(apiUrl("/api/assistant/query"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
