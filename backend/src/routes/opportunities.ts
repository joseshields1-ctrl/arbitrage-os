import { Router } from "express";
import {
  confirmOpportunityImport,
  listOpportunitiesFeed,
  overrideOpportunityValues,
  replaceOpportunities,
  saveOpportunityDecision,
  updateOpportunityInterest,
} from "../services/opportunityService";
import { parseGovDealsListingForReview } from "../services/govDealsImportService";

const opportunitiesRouter = Router();

opportunitiesRouter.get("/feed", (_req, res) => {
  try {
    const feed = listOpportunitiesFeed();
    res.json(feed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load opportunities feed";
    res.status(500).json({
      status: "backend_error",
      feed_mode: "manual_persisted",
      last_polled_at: null,
      generated_at: new Date().toISOString(),
      opportunities: [],
      decisions: [],
      message: "Unable to load opportunities feed.",
      error: message,
    });
  }
});

opportunitiesRouter.post("/sync", (req, res) => {
  try {
    const result = replaceOpportunities(req.body);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync opportunities";
    res.status(400).json({ error: message });
  }
});

opportunitiesRouter.post("/parse-govdeals", async (req, res) => {
  try {
    const payload = req.body as { listing_url?: unknown; keyword_hint?: unknown };
    if (!payload || typeof payload !== "object") {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    if (typeof payload.listing_url !== "string" || !payload.listing_url.trim()) {
      res.status(400).json({ error: "listing_url is required" });
      return;
    }
    const review = await parseGovDealsListingForReview({
      listing_url: payload.listing_url,
      keyword_hint: typeof payload.keyword_hint === "string" ? payload.keyword_hint : undefined,
    });
    res.status(200).json(review);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse GovDeals listing";
    res.status(400).json({ error: message });
  }
});

opportunitiesRouter.post("/confirm-import", (req, res) => {
  try {
    const result = confirmOpportunityImport(req.body);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm import";
    res.status(400).json({ error: message });
  }
});

opportunitiesRouter.patch("/:id/override", (req, res) => {
  try {
    const result = overrideOpportunityValues(req.params.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to override opportunity values";
    const status = message === "Opportunity not found" ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

opportunitiesRouter.patch("/:id/interest", (req, res) => {
  try {
    const result = updateOpportunityInterest(req.params.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update opportunity interest";
    const status = message === "Opportunity not found" ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

opportunitiesRouter.post("/:id/decision", (req, res) => {
  try {
    const result = saveOpportunityDecision(req.params.id, req.body);
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save opportunity decision";
    const status = message === "Opportunity not found" ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

export default opportunitiesRouter;
