import { Router } from "express";
import { buildAuctionAssistantSnapshot } from "../services/auctionService";
import { runAssistantQuery } from "../services/assistantService";

const aiRouter = Router();

const normalizeQuestion = (value: unknown): string =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : "Analyze this auction opportunity for resale potential and key risks.";

const toResaleRange = (snapshot: Record<string, unknown> | null): { low: number | null; high: number | null } => {
  const opportunity =
    snapshot && snapshot.opportunity && typeof snapshot.opportunity === "object"
      ? (snapshot.opportunity as Record<string, unknown>)
      : null;
  const estimate = opportunity ? Number(opportunity.estimated_resale_value) : Number.NaN;
  if (!Number.isFinite(estimate) || estimate <= 0) {
    return { low: null, high: null };
  }
  return {
    low: Number((estimate * 0.8).toFixed(2)),
    high: Number((estimate * 1.1).toFixed(2)),
  };
};

aiRouter.post("/analyze", async (req, res) => {
  try {
    const payload = (req.body ?? {}) as {
      auction_id?: unknown;
      auction?: unknown;
      question?: unknown;
    };

    let snapshot: Record<string, unknown> | null = null;
    if (typeof payload.auction_id === "string" && payload.auction_id.trim()) {
      snapshot = buildAuctionAssistantSnapshot(payload.auction_id.trim());
      if (!snapshot) {
        res.status(404).json({ ok: false, error: "Auction not found" });
        return;
      }
    } else if (payload.auction && typeof payload.auction === "object") {
      snapshot = {
        opportunity: payload.auction as Record<string, unknown>,
      };
    }

    if (!snapshot) {
      res.status(400).json({ ok: false, error: "auction_id or auction payload is required" });
      return;
    }

    const response = await runAssistantQuery({
      mode: "preview_opportunity",
      snapshot,
      question: normalizeQuestion(payload.question),
    });

    res.json({
      ok: true,
      analysis: {
        summary: response.response,
        key_points: response.key_points,
        risk_factors: response.key_points.filter((point) => /risk|missing|warning|alert/i.test(point)),
        risk_level: response.risk_level,
        suggested_action: response.suggested_action,
        resale_value_range: toResaleRange(snapshot),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI analyze failed";
    console.error("[ai.analyze] request failed:", message);
    res.status(400).json({
      ok: false,
      error: "AI analysis is currently unavailable. Please try again.",
    });
  }
});

export default aiRouter;
