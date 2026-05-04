import { Router } from "express";
import {
  createDeal,
  getAvailableLiquiditySnapshot,
  listDeals,
  overrideDealValues,
  previewDeal,
  recordDealDecision,
  scheduleDealBid,
  updateDealStage,
} from "../services/dealService";
import { DealStatus } from "../models/dealV32";
import { getTimeSyncSnapshot, syncGovDealsServerClock } from "../services/engine/timeSync";

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

dealsRouter.get("/liquidity", (_req, res) => {
  const snapshot = getAvailableLiquiditySnapshot();
  res.status(200).json(snapshot);
});

dealsRouter.post("/time-sync", async (req, res) => {
  try {
    const inputUrl =
      typeof req.body?.listing_url === "string" && req.body.listing_url.trim()
        ? req.body.listing_url.trim()
        : undefined;
    const result = await syncGovDealsServerClock(inputUrl);
    const snapshot = getTimeSyncSnapshot();
    res.status(result.ok ? 200 : 202).json({
      ...result,
      snapshot,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync GovDeals server clock";
    res.status(400).json({ error: message });
  }
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

dealsRouter.post("/:id/schedule-bid", async (req, res) => {
  try {
    const id = req.params.id;
    const auctionEndTime = typeof req.body?.auction_end_time === "string" ? req.body.auction_end_time : "";
    const targetBid = Number(req.body?.target_bid);
    const currentBid = Number(req.body?.current_bid);
    const estimatedFees = Number(req.body?.estimated_fees ?? 0);
    const result = await scheduleDealBid({
      deal_id: id,
      listing_id: typeof req.body?.listing_id === "string" ? req.body.listing_id : null,
      auction_end_time: auctionEndTime,
      target_bid: targetBid,
      current_bid: currentBid,
      estimated_fees: estimatedFees,
    });
    const statusCode = result.ok ? 201 : result.status === "invalid" ? 400 : 409;
    res.status(statusCode).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to schedule bid";
    const status = message === "Deal not found" ? 404 : 400;
    res.status(status).json({ error: message });
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
