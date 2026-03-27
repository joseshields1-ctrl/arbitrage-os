import { Router } from "express";
import { getDashboard } from "../services/dealService";

const dashboardRouter = Router();

dashboardRouter.get("/", (_req, res) => {
  const summary = getDashboard();
  res.json(summary);
});

export default dashboardRouter;
