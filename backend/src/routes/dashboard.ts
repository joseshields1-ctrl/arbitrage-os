import { Router } from "express";
import { getDashboard, getOperatorDailySummary } from "../services/dealService";

const dashboardRouter = Router();

dashboardRouter.get("/", (_req, res) => {
  const summary = getDashboard();
  res.json(summary);
});

dashboardRouter.get("/operator-summary", (_req, res) => {
  const summary = getOperatorDailySummary();
  res.json(summary);
});

export default dashboardRouter;
