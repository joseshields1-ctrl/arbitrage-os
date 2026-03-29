import { Router } from "express";
import { previewDeal } from "../services/dealService";

const testEnrichRouter = Router();

testEnrichRouter.get("/", (_req, res) => {
  const now = new Date().toISOString();
  const preview = previewDeal({
    label: "Enrich Test Deal",
    category: "electronics_bulk",
    source_platform: "ebay",
    acquisition_state: "TX",
    status: "prep",
    stage_updated_at: now,
    discovered_date: now,
    purchase_date: now,
    listing_date: null,
    sale_date: null,
    completion_date: null,
    unit_count: 53,
    unit_breakdown: {
      units_total: 53,
      units_working: 41,
      units_minor_issue: 7,
      units_defective: 3,
      units_locked: 2,
    },
    prep_metrics: {
      total_units: 53,
      working_units: 41,
      cosmetic_units: 7,
      functional_units: 41,
      defective_units: 3,
      locked_units: 12,
      total_prep_time_minutes: 318,
    },
    financials: {
      acquisition_cost: 1000,
      buyer_premium_pct: 0.1,
      buyer_premium_overridden: false,
      tax_rate: null,
      transport_cost_actual: null,
      transport_cost_estimated: 120,
      repair_cost: 20,
      prep_cost: 30,
      estimated_market_value: 1600,
      sale_price_actual: null,
    },
    metadata: {
      condition_grade: "used_functional",
      condition_notes: "Mixed batch quality.",
      transport_type: "parcel",
      presentation_quality: "standard",
    },
  });

  res.json(preview);
});

testEnrichRouter.post("/", (req, res) => {
  try {
    const preview = previewDeal(req.body);
    res.status(200).json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to enrich input payload";
    res.status(400).json({ error: message });
  }
});

export default testEnrichRouter;
