import { Router } from "express";
import {
  listOpportunitiesFeed,
  replaceOpportunities,
  saveOpportunityDecision,
} from "../services/opportunityService";

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
