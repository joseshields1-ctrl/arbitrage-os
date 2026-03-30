import { Router } from "express";
import { createDeal, listDeals, recordDealDecision } from "../services/dealService";
import { getOperatorDailySummary } from "../services/dealService";

const testDecisionLoopRouter = Router();

testDecisionLoopRouter.get("/", (_req, res) => {
  try {
    let targetDeal = listDeals()[0];
    if (!targetDeal) {
      targetDeal = createDeal({
        label: "Decision Loop Validation Deal",
        category: "vehicle_suv",
        source_platform: "govdeals",
        acquisition_state: "TX",
        financials: {
          acquisition_cost: 6200,
          buyer_premium_pct: 0.1,
          transport_cost_estimated: 450,
          repair_cost: 350,
          prep_cost: 200,
          estimated_market_value: 9800,
        },
        metadata: {
          condition_grade: "used_good",
          condition_notes: "Runs and drives, light cosmetic wear.",
          transport_type: "auto_transport",
          presentation_quality: "standard",
          removal_deadline: null,
          title_status: "on_site",
        },
      });
    }

    const decisionResponse = recordDealDecision(targetDeal.deal.id, {
      decision: "approved",
      reason: "Projected upside is acceptable with current risk profile.",
    });
    const summary = getOperatorDailySummary();

    res.json({
      generated_at: new Date().toISOString(),
      sample_deal: {
        id: decisionResponse.deal.deal.id,
        label: decisionResponse.deal.deal.label,
        status: decisionResponse.deal.deal.status,
      },
      ai_recommendation: decisionResponse.deal.ai_recommendation,
      stored_operator_decision: decisionResponse.stored_decision,
      decision_history_count: decisionResponse.deal.operator_decision_history.length,
      operator_summary_snapshot: {
        active_deals_count: summary.active_deals_count,
        deals_requiring_action_today: summary.deals_requiring_action_today,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run decision loop test";
    res.status(400).json({ error: message });
  }
});

export default testDecisionLoopRouter;
