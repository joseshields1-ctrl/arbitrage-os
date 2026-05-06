import { Router } from "express";
import { getDashboard, getOperatorDailySummary } from "../services/dealService";

const dashboardRouter = Router();

dashboardRouter.get("/", (_req, res) => {
  try {
    const summary = getDashboard();
    res.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load dashboard";
    res.status(500).json({ error: message });
  }
});

dashboardRouter.get("/operator-summary", (_req, res) => {
  try {
    const summary = getOperatorDailySummary();
    res.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load operator summary";
    res.status(500).json({ error: message });
  }
});

export default dashboardRouter;
