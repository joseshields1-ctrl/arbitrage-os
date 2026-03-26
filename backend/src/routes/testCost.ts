import { Router } from "express";
import { Deal } from "../models/deal";
import { calculateTotalCostBasis } from "../services/costBasis";

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

  const result = calculateTotalCostBasis(mockDeal);
  res.json(result);
});

export default testCostRouter;
