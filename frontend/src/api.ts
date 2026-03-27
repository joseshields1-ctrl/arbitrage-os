import type {
  CreateDealRequest,
  DashboardResponse,
  DealStage,
  DealView,
} from "./types";

const API_BASE = "http://localhost:3000";

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error ?? "Request failed");
  }
  return response.json() as Promise<T>;
};

export const createDeal = async (payload: CreateDealRequest): Promise<DealView> => {
  const response = await fetch(`${API_BASE}/api/deals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<DealView>(response);
};

export const fetchDeals = async (): Promise<DealView[]> => {
  const response = await fetch(`${API_BASE}/api/deals`);
  const body = await handleResponse<{ deals: DealView[] }>(response);
  return body.deals;
};

export const updateDealStage = async (
  dealId: string,
  stage: DealStage
): Promise<DealView> => {
  const response = await fetch(`${API_BASE}/api/deals/${dealId}/stage`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage }),
  });
  return handleResponse<DealView>(response);
};

export const fetchDashboard = async (): Promise<DashboardResponse> => {
  const response = await fetch(`${API_BASE}/api/dashboard`);
  return handleResponse<DashboardResponse>(response);
};
