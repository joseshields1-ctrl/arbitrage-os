import { Router } from "express";
import { runAssistantQuery } from "../services/assistantService";
import { getDealById, getOperatorDailySummary } from "../services/dealService";

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
    const beforeDeal = getDealById(targetDeal.id);
    if (!beforeDeal) {
      res.status(404).json({ error: "Target deal not found before assistant validation." });
      return;
    }
    const beforeUpdatedAt = beforeDeal.deal.stage_updated_at;
    const beforeWarnings = beforeDeal.warnings;
    const beforePostmortem = beforeDeal.engine.postmortem;

    const assistant = await runAssistantQuery({
      deal_id: targetDeal.id,
      question: sampleQuestion,
    });
    const afterDeal = getDealById(targetDeal.id);
    const afterUpdatedAt = afterDeal?.deal.stage_updated_at ?? null;
    const afterWarnings = afterDeal?.warnings ?? [];
    const afterPostmortem = afterDeal?.engine.postmortem ?? null;
    const noPersistenceDetected =
      beforeUpdatedAt === afterUpdatedAt &&
      JSON.stringify(beforeWarnings) === JSON.stringify(afterWarnings) &&
      JSON.stringify(beforePostmortem) === JSON.stringify(afterPostmortem);

    res.json({
      generated_at: new Date().toISOString(),
      sample_question: sampleQuestion,
      deal_id: targetDeal.id,
      used_context: {
        source: "deal_id",
        includes_assistant_context: true,
      },
      assistant_response: assistant,
      persistence_check: {
        no_assistant_output_persisted: noPersistenceDetected,
        compared_fields: [
          "deal.stage_updated_at",
          "warnings",
          "engine.postmortem",
        ],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run test assistant query";
    res.status(400).json({ error: message });
  }
});

export default testAssistantRouter;
