import { Router } from "express";
import { getOperatorDailySummary, listDeals } from "../services/dealService";

const testOperatorRouter = Router();

testOperatorRouter.get("/", (_req, res) => {
  const deals = listDeals();
  const summary = getOperatorDailySummary();

  const sampleAssistantContexts = deals.slice(0, 3).map((deal) => ({
    deal_id: deal.deal.id,
    label: deal.deal.label,
    alerts: deal.alerts,
    operator_recommendation: deal.operator_recommendation,
    assistant_context: deal.assistant_context,
  }));

  res.json({
    generated_at: new Date().toISOString(),
    alerts_preview: deals.map((deal) => ({
      deal_id: deal.deal.id,
      label: deal.deal.label,
      status: deal.deal.status,
      alerts: deal.alerts,
      warnings: deal.warnings,
    })),
    operator_summary: summary,
    assistant_context_preview: sampleAssistantContexts,
  });
});

export default testOperatorRouter;
