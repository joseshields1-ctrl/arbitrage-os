import type { AssistantQueryRequest } from "./types";

const DEFAULT_CHAT_PROXY_BASE =
  (import.meta.env.NEXT_PUBLIC_API_BASE_URL as string | undefined) ??
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

const CHAT_PROXY_BASE = DEFAULT_CHAT_PROXY_BASE.replace(/\/+$/, "");

export const postAssistantQueryViaProxy = async (
  payload: AssistantQueryRequest
): Promise<Response> =>
  fetch(`${CHAT_PROXY_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
