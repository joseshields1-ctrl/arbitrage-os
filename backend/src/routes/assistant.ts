import { Router } from "express";
import { runAssistantQuery } from "../services/assistantService";

const assistantRouter = Router();

assistantRouter.post("/query", async (req, res) => {
  try {
    const response = await runAssistantQuery(req.body);
    res.json({
      ok: true,
      state: "success",
      answer: response.response,
      reason: null,
      missing_fields: [],
      response: response.response,
      key_points: response.key_points,
      risk_level: response.risk_level,
      suggested_action: response.suggested_action,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Assistant query failed";
    const lower = rawMessage.toLowerCase();
    const isNotFound = rawMessage === "Deal not found";
    const friendlyMessage = isNotFound
      ? "No matching deal was found for this assistant request."
      : lower.includes("no selected record")
        ? "Select a deal with complete context before asking the assistant."
        : lower.includes("question is required")
          ? "Enter a question before sending to the assistant."
          : "Assistant is temporarily unavailable. Please try again.";
    // Keep non-2xx semantics so callers can branch on failure while still receiving a clear payload.
    const status = isNotFound ? 404 : 400;
    console.error("[assistant.query] request failed:", rawMessage);
    res.status(status).json({
      ok: false,
      state: isNotFound ? "deal_not_found" : "api_failure",
      answer: null,
      reason: friendlyMessage,
      missing_fields: [],
      error: friendlyMessage,
    });
  }
});

export default assistantRouter;
