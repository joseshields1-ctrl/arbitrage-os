import { getGovDealsUrlsFromEnv, importGovDealsUrls } from "./govDealsScraperService";

export interface PollerStatusSnapshot {
  running: boolean;
  interval_ms: number;
  last_poll_at: string | null;
  last_error: string | null;
  total_imported: number;
  poll_count: number;
  keywords: string[];
}

interface PollCycleResult {
  imported: number;
  errors: string[];
  processed_urls: number;
  discovered_listing_urls: number;
}

const DEFAULT_INTERVAL_MS = 20 * 60 * 1000;

let pollerTimer: NodeJS.Timeout | null = null;
let activePollCycle: Promise<PollCycleResult> | null = null;
let pollerStatus: PollerStatusSnapshot = {
  running: false,
  interval_ms: DEFAULT_INTERVAL_MS,
  last_poll_at: null,
  last_error: null,
  total_imported: 0,
  poll_count: 0,
  keywords: [],
};
let configuredListingUrls: string[] = [];

const nowIso = (): string => new Date().toISOString();

const parseCsvEnv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const getEnvListingUrls = (): string[] => getGovDealsUrlsFromEnv();

const getEnvKeywords = (): string[] => parseCsvEnv(process.env.POLLER_KEYWORDS);

const performPollCycle = async (): Promise<PollCycleResult> => {
  if (configuredListingUrls.length === 0) {
    return {
      imported: 0,
      errors: ["No GovDeals URLs configured. Set GOVDEALS_LISTING_URLS."],
      processed_urls: 0,
      discovered_listing_urls: 0,
    };
  }
  return importGovDealsUrls(configuredListingUrls);
};

const runPollCycle = async (): Promise<PollCycleResult> => {
  if (activePollCycle) {
    return activePollCycle;
  }
  activePollCycle = (async () => {
    const result = await performPollCycle();
    pollerStatus = {
      ...pollerStatus,
      last_poll_at: nowIso(),
      poll_count: pollerStatus.poll_count + 1,
      total_imported: pollerStatus.total_imported + result.imported,
      last_error: result.errors.length > 0 ? result.errors.join(" | ") : null,
    };
    return result;
  })();
  try {
    return await activePollCycle;
  } finally {
    activePollCycle = null;
  }
};

export const getPollerStatus = (): PollerStatusSnapshot => ({ ...pollerStatus });

export const startPoller = (options?: {
  interval_ms?: number;
  listing_urls?: string[];
  keywords?: string[];
}): PollerStatusSnapshot => {
  const intervalMs =
    typeof options?.interval_ms === "number" && Number.isFinite(options.interval_ms)
      ? Math.max(30_000, Math.floor(options.interval_ms))
      : Number(process.env.POLLER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  configuredListingUrls =
    options?.listing_urls?.filter((item) => item.trim().length > 0) ?? getEnvListingUrls();
  pollerStatus = {
    ...pollerStatus,
    interval_ms: Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_INTERVAL_MS,
    keywords: options?.keywords ?? getEnvKeywords(),
    running: true,
  };

  if (pollerTimer) {
    clearInterval(pollerTimer);
  }
  pollerTimer = setInterval(() => {
    void runPollCycle();
  }, pollerStatus.interval_ms);

  void runPollCycle();
  return getPollerStatus();
};

export const stopPoller = (): PollerStatusSnapshot => {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
  pollerStatus = {
    ...pollerStatus,
    running: false,
  };
  return getPollerStatus();
};

export const runPollerOnce = async (): Promise<PollCycleResult> => runPollCycle();

export const initializePollerFromEnv = (): void => {
  const enabled = (process.env.ENABLE_POLLER ?? "").toLowerCase() === "true";
  if (!enabled) {
    return;
  }
  startPoller();
};

