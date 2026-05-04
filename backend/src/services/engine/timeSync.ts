interface ServerTimeSyncState {
  offset_ms: number;
  source_url: string | null;
  synced_at: string | null;
  last_error: string | null;
}

interface SyncServerClockResult {
  ok: boolean;
  offset_ms: number;
  source_url: string;
  synced_at: string;
  last_error: string | null;
}

const DEFAULT_GOVDEALS_TIME_URL = "https://www.govdeals.com";
const MIN_HEADER_LENGTH = 8;

const state: ServerTimeSyncState = {
  offset_ms: 0,
  source_url: null,
  synced_at: null,
  last_error: null,
};

const parseServerDateHeader = (value: string | null): number | null => {
  if (!value || value.trim().length < MIN_HEADER_LENGTH) {
    return null;
  }
  const parsed = Date.parse(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveTimeSourceUrl = (inputUrl?: string): string => {
  if (typeof inputUrl === "string" && inputUrl.trim().length > 0) {
    return inputUrl.trim();
  }
  if (typeof process.env.GOVDEALS_TIME_SYNC_URL === "string" && process.env.GOVDEALS_TIME_SYNC_URL.trim()) {
    return process.env.GOVDEALS_TIME_SYNC_URL.trim();
  }
  return DEFAULT_GOVDEALS_TIME_URL;
};

export const getServerTimeOffsetMs = (): number => state.offset_ms;

export const getActualNowMs = (): number => Date.now() + getServerTimeOffsetMs();

export const getTimeSyncSnapshot = (): ServerTimeSyncState => ({ ...state });

export const syncGovDealsServerClock = async (inputUrl?: string): Promise<SyncServerClockResult> => {
  const sourceUrl = resolveTimeSourceUrl(inputUrl);
  const localStart = Date.now();
  try {
    const response = await fetch(sourceUrl, { method: "HEAD" });
    const localEnd = Date.now();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const headerDate = parseServerDateHeader(response.headers.get("date"));
    if (headerDate === null) {
      throw new Error("Missing Date header from GovDeals response");
    }
    const midpoint = Math.round((localStart + localEnd) / 2);
    const offsetMs = headerDate - midpoint;
    state.offset_ms = offsetMs;
    state.source_url = sourceUrl;
    state.synced_at = new Date().toISOString();
    state.last_error = null;
    return {
      ok: true,
      offset_ms: offsetMs,
      source_url: sourceUrl,
      synced_at: state.synced_at,
      last_error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown time sync failure";
    state.last_error = message;
    if (!state.synced_at) {
      state.source_url = sourceUrl;
    }
    return {
      ok: false,
      offset_ms: state.offset_ms,
      source_url: sourceUrl,
      synced_at: state.synced_at ?? new Date().toISOString(),
      last_error: message,
    };
  }
};

