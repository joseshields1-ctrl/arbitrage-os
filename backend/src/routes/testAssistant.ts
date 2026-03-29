import { Router } from "express";
import { runAssistantQuery } from "../services/assistantService";
import { getOperatorDailySummary } from "../services/dealService";

const testAssistantRouter = Router();

testAssistantRouter.get("/", async (_req, res) => {
  try {
    const summary = getOperatorDailySummary();
    const targetDeal = summary.top_risk_deals[0];

    if (!targetDeal) {
      res.status(400).json({ error: "No deals available for assistant validation." });
      return;
    }

    const sampleQuestion =
      "What are the top risks for this deal and what should the operator do next?";
    const assistant = await runAssistantQuery({
      deal_id: targetDeal.id,
      question: sampleQuestion,
    });

    res.json({
      generated_at: new Date().toISOString(),
      sample_question: sampleQuestion,
      deal_id: targetDeal.id,
      used_context: {
        source: "deal_id",
        includes_assistant_context: true,
      },
      assistant_response: assistant,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run test assistant query";
    res.status(400).json({ error: message });
  }
});

export default testAssistantRouter;
