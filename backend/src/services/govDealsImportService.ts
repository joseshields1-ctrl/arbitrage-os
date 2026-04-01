import { load } from "cheerio";
import type {
  OpportunityCategory,
  OpportunityCriticalField,
  OpportunityEditableFields,
  OpportunityImportReviewResponse,
  OpportunityRawImportFields,
} from "../models/opportunities";

const GOVDEALS_HOST_RE = /(^|\.)govdeals\.com$/i;

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim();

const parseNumber = (value: string | null): number | null => {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) {
    return null;
  }
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsePercentDecimal = (value: string | null): number | null => {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return null;
  }
  if (parsed > 1) {
    return parsed / 100;
  }
  return parsed;
};

const parseDate = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString();
};

const canonicalizeGovDealsUrl = (rawUrl: string): string => {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname.replace(/\/+$/, "");
  const itemId = parsed.searchParams.get("itemid")?.trim() ?? "";
  if (itemId) {
    return `https://${host}${pathname}?itemid=${encodeURIComponent(itemId)}`;
  }
  return `https://${host}${pathname}`;
};

const inferCategory = (raw: string | null, title: string | null): OpportunityCategory => {
  const haystack = `${raw ?? ""} ${title ?? ""}`.toLowerCase();
  if (
    haystack.includes("ipad") ||
    haystack.includes("laptop") ||
    haystack.includes("tablet") ||
    haystack.includes("electronics")
  ) {
    return "electronics";
  }
  if (
    haystack.includes("motorcycle") ||
    haystack.includes("atv") ||
    haystack.includes("powersport") ||
    haystack.includes("trailer")
  ) {
    return "other";
  }
  return "vehicle";
};

const pickFirstText = (
  $: ReturnType<typeof load>,
  selectors: string[],
  selectorHits: Record<string, string[]>,
  key: string
): string | null => {
  for (const selector of selectors) {
    const node = $(selector).first();
    if (!node || node.length === 0) {
      continue;
    }
    const text = normalizeText(node.text());
    if (text) {
      selectorHits[key] = [...(selectorHits[key] ?? []), selector];
      return text;
    }
    const attrContent = normalizeText(String(node.attr("content") ?? ""));
    if (attrContent) {
      selectorHits[key] = [...(selectorHits[key] ?? []), `${selector}@content`];
      return attrContent;
    }
  }
  return null;
};

const pickByRegex = (
  haystack: string,
  patterns: RegExp[],
  selectorHits: Record<string, string[]>,
  key: string
): string | null => {
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (match?.[1]) {
      selectorHits[key] = [...(selectorHits[key] ?? []), `regex:${pattern.source}`];
      return normalizeText(match[1]);
    }
    if (match?.[2]) {
      selectorHits[key] = [...(selectorHits[key] ?? []), `regex:${pattern.source}`];
      return normalizeText(match[2]);
    }
  }
  return null;
};

const parseListingIdFromUrl = (listingUrl: string): string | null => {
  try {
    const parsed = new URL(listingUrl);
    const itemId = parsed.searchParams.get("itemid");
    if (itemId && /^\d{2,}$/.test(itemId.trim())) {
      return itemId.trim();
    }
    return null;
  } catch {
    return null;
  }
};

const buildMissingFields = (
  parsedFields: Partial<OpportunityEditableFields>
): OpportunityCriticalField[] => {
  const missing: OpportunityCriticalField[] = [];
  if (!parsedFields.title || !parsedFields.title.trim()) {
    missing.push("title");
  }
  if (!Number.isFinite(parsedFields.current_bid ?? Number.NaN) || (parsedFields.current_bid ?? 0) <= 0) {
    missing.push("current_bid");
  }
  if (!parsedFields.auction_end || !Number.isFinite(Date.parse(parsedFields.auction_end))) {
    missing.push("auction_end");
  }
  if (!parsedFields.location || !parsedFields.location.trim()) {
    missing.push("location");
  }
  if (!parsedFields.seller_agency || !parsedFields.seller_agency.trim()) {
    missing.push("seller_agency");
  }
  return missing;
};

export interface ParseGovDealsInput {
  listing_url: string;
  keyword_hint?: string;
}

export const parseGovDealsListingForReview = async (
  payload: ParseGovDealsInput
): Promise<OpportunityImportReviewResponse> => {
  const listingUrl = payload.listing_url.trim();
  if (!listingUrl) {
    throw new Error("listing_url is required");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(listingUrl);
  } catch {
    throw new Error("listing_url must be a valid URL");
  }
  if (!GOVDEALS_HOST_RE.test(parsedUrl.hostname)) {
    throw new Error("listing_url must be a govdeals.com URL");
  }

  const canonicalUrl = canonicalizeGovDealsUrl(listingUrl);
  const selectorHits: Record<string, string[]> = {};
  const extractionNotes: string[] = [];

  let html = "";
  try {
    const response = await fetch(listingUrl, {
      headers: {
        "User-Agent": "ArbitrageOS/1.0 (+opportunity-import)",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    html = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Failed to fetch GovDeals listing page: ${message}`);
  }

  const $ = load(html);
  const pageText = normalizeText($("body").text());

  const listingId =
    parseListingIdFromUrl(listingUrl) ??
    pickByRegex(pageText, [/(?:Lot|Listing|Item)\s*(?:ID|#)?\s*[:#]?\s*([0-9]{2,})/i], selectorHits, "listing_id");
  const title =
    pickFirstText(
      $,
      ["h1", ".item-title", ".auction-title", ".listing-title", "meta[property='og:title']"],
      selectorHits,
      "title"
    ) ??
    pickByRegex(pageText, [/(?:Title)\s*:\s*([^|]{5,140})/i], selectorHits, "title");
  const currentBidText =
    pickFirstText(
      $,
      ["#lblCurrentBid", ".currentBid", ".current-bid", "[data-testid='current-bid']"],
      selectorHits,
      "current_bid"
    ) ??
    pickByRegex(
      pageText,
      [/(?:Current\s*Bid|Bid)\s*[:\s]\s*(\$[0-9,]+(?:\.[0-9]{1,2})?)/i],
      selectorHits,
      "current_bid"
    );
  const closeDateText =
    pickFirstText(
      $,
      ["#lblEndDate", ".closing-date", ".auction-end", "[data-testid='closing-date']"],
      selectorHits,
      "auction_end"
    ) ??
    pickByRegex(
      pageText,
      [
        /(?:Closing\s*Date|Close\s*Date|Auction\s*Ends?)\s*[:\s]\s*([A-Za-z]{3,10}\s+\d{1,2},\s+\d{4}[^|]{0,30})/i,
      ],
      selectorHits,
      "auction_end"
    );
  const timeRemainingText =
    pickFirstText(
      $,
      [".time-remaining", ".countdown", "[data-testid='time-remaining']"],
      selectorHits,
      "time_remaining"
    ) ??
    pickByRegex(
      pageText,
      [/(?:Time\s*Remaining|Time\s*Left)\s*[:\s]\s*([^|]{2,60})/i],
      selectorHits,
      "time_remaining"
    );
  const locationText =
    pickFirstText(
      $,
      [".location", ".asset-location", "[data-testid='asset-location']"],
      selectorHits,
      "location"
    ) ??
    pickByRegex(
      pageText,
      [/(?:Asset\s*Location|Location)\s*[:\s]\s*([^|]{3,120})/i],
      selectorHits,
      "location"
    );
  const sellerAgencyText =
    pickFirstText(
      $,
      [".seller", ".agency", ".seller-agency", "[data-testid='seller']"],
      selectorHits,
      "seller_agency"
    ) ??
    pickByRegex(
      pageText,
      [/(?:Seller|Agency|Department|Selling\s*Agency)\s*[:\s]\s*([^|]{3,140})/i],
      selectorHits,
      "seller_agency"
    );
  const categoryText =
    pickFirstText($, [".category", "[data-testid='category']"], selectorHits, "category") ??
    pickByRegex(pageText, [/(?:Category)\s*[:\s]\s*([^|]{3,80})/i], selectorHits, "category");
  const buyerPremiumText =
    pickFirstText(
      $,
      [".buyer-premium", "[data-testid='buyer-premium']"],
      selectorHits,
      "buyer_premium"
    ) ??
    pickByRegex(
      pageText,
      [/(?:Buyer(?:'s)?\s*Premium)\s*[:\s]\s*([0-9]{1,2}(?:\.[0-9]+)?\s*%)/i],
      selectorHits,
      "buyer_premium"
    );
  const descriptionText =
    pickFirstText(
      $,
      ["#description", ".description", ".item-description", "[data-testid='description']"],
      selectorHits,
      "description"
    ) ??
    null;
  const quantityText =
    pickByRegex(
      `${descriptionText ?? ""} ${pageText}`,
      [/(?:Quantity|Units?)\s*[:\s]\s*([0-9]{1,5})/i],
      selectorHits,
      "quantity"
    ) ?? null;

  const attachmentLinks = Array.from(
    new Set(
      $("a[href]")
        .map((_idx, element) => String($(element).attr("href") ?? "").trim())
        .get()
        .filter((href) =>
          /attachment|download|photo|image|pdf|doc|xls|zip/i.test(href)
        )
        .map((href) => {
          try {
            return new URL(href, listingUrl).toString();
          } catch {
            return "";
          }
        })
        .filter((href) => href.length > 0)
    )
  );
  if (attachmentLinks.length > 0) {
    selectorHits.attachment_links = ["a[href*=attachment|download|photo|image|pdf|doc|xls|zip]"];
  }

  const sellerContactText =
    pickByRegex(
      pageText,
      [
        /(?:Contact|Phone|Email)\s*[:\s]\s*([^|]{4,180})/i,
        /(?:Seller\s*Contact)\s*[:\s]\s*([^|]{4,180})/i,
      ],
      selectorHits,
      "seller_contact"
    ) ?? null;

  const closeIso = parseDate(closeDateText);
  const parsedCurrentBid = parseNumber(currentBidText);
  const parsedBuyerPremium = parsePercentDecimal(buyerPremiumText);
  const parsedQuantity = (() => {
    const value = parseNumber(quantityText);
    if (value === null) {
      return null;
    }
    return Math.max(0, Math.floor(value));
  })();
  const parsedFields: OpportunityImportReviewResponse["parsed_fields"] = {
    listing_id: listingId,
    canonical_url: canonicalUrl,
    title: title ?? "",
    current_bid: parsedCurrentBid ?? 0,
    auction_end: closeIso ?? "",
    location: locationText ?? "",
    seller_agency: sellerAgencyText ?? "",
    category: inferCategory(categoryText, title),
    buyer_premium_pct: parsedBuyerPremium ?? 0.1,
    estimated_resale_value: 0,
    estimated_transport_override: null,
    estimated_repair_cost: 0,
    quantity_purchased: parsedQuantity,
    quantity_broken: null,
    condition_raw: descriptionText ?? "",
    title_status: "unknown",
    removal_window_days: 3,
    seller_type: "government",
    description: descriptionText,
    attachment_links: attachmentLinks,
    seller_contact: sellerContactText,
  };

  const missingFields = buildMissingFields(parsedFields);
  const importConfidence = Math.max(0, 100 - missingFields.length * 18 - (attachmentLinks.length === 0 ? 4 : 0));
  const importStatus = missingFields.length > 0 ? "needs_review" : "active";

  if (payload.keyword_hint?.trim()) {
    extractionNotes.push(`Keyword hint provided: ${payload.keyword_hint.trim()}`);
  }
  if (!closeIso && closeDateText) {
    extractionNotes.push(`Close time text found but not parseable: ${closeDateText}`);
  }
  if (!timeRemainingText && closeIso) {
    const timeLeftHours = (Date.parse(closeIso) - Date.now()) / (1000 * 60 * 60);
    extractionNotes.push(`Time remaining derived from close datetime: ${Math.max(0, timeLeftHours).toFixed(1)}h`);
  }
  if (missingFields.length > 0) {
    extractionNotes.push(`Critical fields missing: ${missingFields.join(", ")}`);
  }

  const rawFields: OpportunityRawImportFields = {
    listing_id: listingId,
    title,
    current_bid_text: currentBidText,
    auction_end_text: closeDateText,
    time_remaining_text: timeRemainingText,
    location_text: locationText,
    seller_agency_text: sellerAgencyText,
    category_text: categoryText,
    buyer_premium_text: buyerPremiumText,
    description_text: descriptionText,
    quantity_text: quantityText,
    attachment_links_text: attachmentLinks.join(", "),
    seller_contact_text: sellerContactText,
  };

  return {
    listing_url: listingUrl,
    canonical_url: canonicalUrl,
    listing_id: listingId,
    raw_fields: rawFields,
    parsed_fields: parsedFields,
    missing_fields: missingFields,
    import_status: importStatus,
    import_confidence: importConfidence,
    extraction_notes: extractionNotes,
    selector_hits: selectorHits,
  };
};

