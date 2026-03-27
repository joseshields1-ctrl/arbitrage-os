import { Router } from "express";
import { Deal } from "../models/deal";
import { calculateTotalCostBasis } from "../services/costBasis";
import { computeCostBasis } from "../services/engine/costBasis";

const testCostRouter = Router();

testCostRouter.get("/", (_req, res) => {
  const mockDeal: Deal = {
    id: "deal-001",
    category: "vehicle_suv",
    stage: "acquired",
    stage_updated_at: new Date().toISOString(),
    acquisition_cost: 12000,
    buyer_premium_pct: 10,
    buyer_premium_overridden: false,
    tax: 900,
    transport_type: "auto_transport",
    transport_cost_actual: null,
    transport_cost_estimated: 650,
    transport_paid_by: "buyer",
    repair_cost: 1500,
    prep_cost: 300,
    condition_grade: "used_good",
    condition_notes: "Minor cosmetic wear; runs and drives.",
  };

  const legacy = calculateTotalCostBasis(mockDeal);
  const v33 = computeCostBasis({
    acquisition_cost: mockDeal.acquisition_cost,
    source_platform: "govdeals",
    acquisition_state: "TX",
    buyer_premium_pct: 0.1,
    buyer_premium_overridden: false,
    transport_type: mockDeal.transport_type,
    transport_cost_actual: mockDeal.transport_cost_actual,
    transport_cost_estimated: mockDeal.transport_cost_estimated,
    repair_cost: mockDeal.repair_cost,
    prep_cost: mockDeal.prep_cost,
    tax: mockDeal.tax,
    category: mockDeal.category,
  });

  res.json({
    legacy,
    v33,
  });
});

export default testCostRouter;
