export const runtime = "nodejs";

const DEFAULT_API_BASE_URL = "http://localhost:8000";
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  process.env.API_BASE_URL ??
  DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    const response = await fetch(`${API_BASE_URL}/assistant/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payloadText = await response.text();
    return new Response(payloadText, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "assistant proxy failure";
    return new Response(
      JSON.stringify({
        ok: false,
        state: "api_failure",
        answer: null,
        reason: message,
        missing_fields: [],
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
