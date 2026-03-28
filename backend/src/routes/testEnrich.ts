import { Router } from "express";
import { enrichDeal } from "../services/engine/enrichDeal";
import type { DealRow, FinancialRow, MetadataRow } from "../models/dealV32";

const testEnrichRouter = Router();

testEnrichRouter.get("/", (_req, res) => {
  const now = new Date().toISOString();
  const mockDeal: DealRow = {
    id: "enrich-001",
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
  };

  const mockFinancials: FinancialRow = {
    deal_id: mockDeal.id,
    acquisition_cost: 1000,
    buyer_premium_pct: 0.1,
    buyer_premium_overridden: false,
    tax_rate: null,
    tax_amount: null,
    transport_cost_actual: null,
    transport_cost_estimated: 120,
    repair_cost: 20,
    prep_cost: 30,
    estimated_market_value: 1600,
    sale_price_actual: null,
    projected_profit: 0,
    realized_profit: null,
  };

  const mockMetadata: MetadataRow = {
    deal_id: mockDeal.id,
    condition_grade: "used_functional",
    condition_notes: "Mixed batch quality.",
    transport_type: "parcel",
    presentation_quality: "standard",
  };

  const enriched = enrichDeal({
    deal: mockDeal,
    financials: mockFinancials,
    metadata: mockMetadata,
  });

  res.json(enriched);
});

export default testEnrichRouter;
