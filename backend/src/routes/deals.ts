import { Router } from "express";
import {
  createDeal,
  listDeals,
  overrideDealValues,
  previewDeal,
  recordDealDecision,
  updateDealStage,
} from "../services/dealService";
import { DealStatus } from "../models/dealV32";

const dealsRouter = Router();

dealsRouter.post("/", (req, res) => {
  try {
    const result = createDeal(req.body);
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create deal";
    res.status(400).json({ error: message });
  }
});

dealsRouter.post("/preview", (req, res) => {
  try {
    const result = previewDeal(req.body);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to preview deal";
    res.status(400).json({ error: message });
  }
});

dealsRouter.get("/", (_req, res) => {
  const deals = listDeals();
  res.json({ deals });
});

dealsRouter.patch("/:id/stage", (req, res) => {
  try {
    const id = req.params.id;
    const stage = req.body?.stage as DealStatus | undefined;
    const completionData = req.body?.completion_data as
      | { sale_price_actual: number; completion_date?: string }
      | undefined;

    if (!stage) {
      res.status(400).json({ error: "stage is required" });
      return;
    }

    const updated = updateDealStage(id, stage, completionData);
    if (!updated) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }

    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update stage";
    res.status(400).json({ error: message });
  }
});

dealsRouter.post("/:id/decision", (req, res) => {
  try {
    const id = req.params.id;
    const result = recordDealDecision(id, req.body);
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record decision";
    const status = message === "Deal not found" ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

dealsRouter.patch("/:id/override", (req, res) => {
  try {
    const id = req.params.id;
    const updated = overrideDealValues(id, req.body);
    res.status(200).json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to override deal values";
    const status = message === "Deal not found" ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

export default dealsRouter;
