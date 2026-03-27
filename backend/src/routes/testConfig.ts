import { Router } from "express";
import { categoryProfiles } from "../config/categoryProfiles";
import { transportAssumptions } from "../config/transportAssumptions";
import { resolveBuyerPremium } from "../services/buyerPremiumResolver";

const testConfigRouter = Router();

testConfigRouter.get("/", (_req, res) => {
  const buyerPremiumExample = resolveBuyerPremium("govdeals", "TX");
  const categoryProfileExample = categoryProfiles.vehicle_suv;
  const transportAssumptionExample = transportAssumptions.auto_transport;

  res.json({
    buyer_premium_example: buyerPremiumExample,
    category_profile_example: categoryProfileExample,
    transport_assumption_example: transportAssumptionExample,
  });
});

export default testConfigRouter;
