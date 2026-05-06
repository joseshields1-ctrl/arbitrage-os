import { load } from "cheerio";
import { parseGovDealsListingForReview } from "./govDealsImportService";
import { confirmOpportunityImport } from "./opportunityService";

export interface GovDealsImportResult {
  imported: number;
  errors: string[];
  processed_urls: number;
  discovered_listing_urls: number;
}

const GOVDEALS_HOST_RE = /(^|\.)govdeals\.com$/i;
const FETCH_TIMEOUT_MS = 12_000;
const FETCH_RETRIES = 2;
const DEFAULT_MAX_LISTING_LINKS = 80;

const parseCsvEnv = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

export const getGovDealsUrlsFromEnv = (): string[] =>
  parseCsvEnv(process.env.GOVDEALS_LISTING_URLS ?? process.env.POLLER_LISTING_URLS);

const normalizeGovDealsUrl = (rawUrl: string): string | null => {
  try {
    const parsed = new URL(rawUrl.trim());
    if (!GOVDEALS_HOST_RE.test(parsed.hostname)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const isLikelyListingUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get("itemid")) {
      return true;
    }
    const path = parsed.pathname.toLowerCase();
    return (
      path.includes("/asset/") ||
      path.includes("/listing/") ||
      path.includes("/auction/") ||
      path.includes("/item/")
    );
  } catch {
    return false;
  }
};

const fetchHtmlWithRetry = async (url: string): Promise<string> => {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "ArbitrageOS/1.0 (+govdeals-import)",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://www.govdeals.com/",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      lastError = new Error(`attempt ${attempt}/${FETCH_RETRIES}: ${message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw new Error(
    `Failed to fetch GovDeals page after ${FETCH_RETRIES} attempts: ${lastError?.message ?? "unknown"}`
  );
};

const discoverListingUrls = async (categoryUrl: string): Promise<string[]> => {
  const html = await fetchHtmlWithRetry(categoryUrl);
  const $ = load(html);
  const maxLinks = Math.max(
    10,
    Number(process.env.GOVDEALS_MAX_LISTING_LINKS ?? DEFAULT_MAX_LISTING_LINKS) || DEFAULT_MAX_LISTING_LINKS
  );

  const rawLinks = new Set<string>();
  $(
    [
      "a[href*='itemid=']",
      ".auction-card a[href]",
      ".listing-card a[href]",
      ".search-results a[href]",
      ".card a[href]",
      "a[href*='/asset/']",
    ].join(",")
  ).each((_idx, element) => {
    const href = String($(element).attr("href") ?? "").trim();
    if (!href) {
      return;
    }
    try {
      const absolute = new URL(href, categoryUrl).toString();
      rawLinks.add(absolute);
    } catch {
      // ignore malformed href
    }
  });

  return Array.from(rawLinks)
    .map((link) => normalizeGovDealsUrl(link))
    .filter((link): link is string => Boolean(link))
    .filter((link) => isLikelyListingUrl(link))
    .slice(0, maxLinks);
};

export const importGovDealsUrls = async (inputUrls?: string[]): Promise<GovDealsImportResult> => {
  const normalizedInput = (inputUrls ?? getGovDealsUrlsFromEnv())
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (normalizedInput.length === 0) {
    return {
      imported: 0,
      errors: ["No GovDeals URLs configured. Set GOVDEALS_LISTING_URLS."],
      processed_urls: 0,
      discovered_listing_urls: 0,
    };
  }

  const listingQueue = new Set<string>();
  const errors: string[] = [];
  let discoveredListingUrls = 0;

  for (const rawUrl of normalizedInput) {
    const normalized = normalizeGovDealsUrl(rawUrl);
    if (!normalized) {
      errors.push(`${rawUrl}: URL must be a valid govdeals.com URL`);
      continue;
    }
    if (isLikelyListingUrl(normalized)) {
      listingQueue.add(normalized);
      continue;
    }
    try {
      const discovered = await discoverListingUrls(normalized);
      discoveredListingUrls += discovered.length;
      if (discovered.length === 0) {
        errors.push(`${normalized}: no listing links discovered`);
        continue;
      }
      discovered.forEach((url) => listingQueue.add(url));
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed to parse category page";
      errors.push(`${normalized}: ${message}`);
      console.error("[govdeals.import] discovery failed:", normalized, message);
    }
  }

  let imported = 0;
  for (const listingUrl of listingQueue) {
    try {
      const review = await parseGovDealsListingForReview({ listing_url: listingUrl });
      confirmOpportunityImport({
        review,
        source: "url_import",
      });
      imported += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown import error";
      errors.push(`${listingUrl}: ${message}`);
      console.error("[govdeals.import] listing import failed:", listingUrl, message);
    }
  }

  return {
    imported,
    errors,
    processed_urls: listingQueue.size,
    discovered_listing_urls: discoveredListingUrls,
  };
};
