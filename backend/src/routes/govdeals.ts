import { Router } from "express";
import { getGovDealsUrlsFromEnv, importGovDealsUrls } from "../services/govDealsScraperService";

const govdealsRouter = Router();

govdealsRouter.post("/import", async (req, res) => {
  try {
    const payload = (req.body ?? {}) as { urls?: unknown };
    const urls = Array.isArray(payload.urls)
      ? payload.urls.filter((item): item is string => typeof item === "string")
      : undefined;
    const result = await importGovDealsUrls(urls ?? getGovDealsUrlsFromEnv());
    res.status(200).json({
      imported: result.imported,
      errors: result.errors,
      processed_urls: result.processed_urls,
      discovered_listing_urls: result.discovered_listing_urls,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to import GovDeals auctions";
    console.error("[govdeals.import] route error:", message);
    res.status(500).json({
      imported: 0,
      errors: [message],
    });
  }
});

export default govdealsRouter;
