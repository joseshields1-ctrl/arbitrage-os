import { Router } from "express";
import { categoryProfiles } from "../config/categoryProfiles";
import { transportAssumptions } from "../config/transportAssumptions";
import { resolveBuyerPremium } from "../services/buyerPremiumResolver";
import {
  PREP_EFFICIENCY_THRESHOLDS,
  SOURCE_QUALITY_THRESHOLDS,
} from "../config/executionThresholds";
import {
  SELL_THROUGH_FACTORS,
  ELECTRONICS_RETURN_RATE_BUFFER,
  PLATFORM_FEE_PCT,
} from "../config/profitConfig";

const testConfigRouter = Router();

testConfigRouter.get("/", (_req, res) => {
  const buyerPremiumExample = resolveBuyerPremium("govdeals", "TX");
  const categoryProfileExample = categoryProfiles.vehicle_suv;
  const transportAssumptionExample = transportAssumptions.auto_transport;

  res.json({
    buyer_premium_example: buyerPremiumExample,
    category_profile_example: categoryProfileExample,
    transport_assumption_example: transportAssumptionExample,
    prep_efficiency_thresholds: PREP_EFFICIENCY_THRESHOLDS,
    source_quality_thresholds: SOURCE_QUALITY_THRESHOLDS,
    sell_through_factors: SELL_THROUGH_FACTORS,
    electronics_return_rate_buffer: ELECTRONICS_RETURN_RATE_BUFFER,
    platform_fee_pct: PLATFORM_FEE_PCT,
  });
});

export default testConfigRouter;
