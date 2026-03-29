import { Router } from "express";
import { runAssistantQuery } from "../services/assistantService";

const assistantRouter = Router();

assistantRouter.post("/query", async (req, res) => {
  try {
    const response = await runAssistantQuery(req.body);
    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assistant query failed";
    const status = message === "Deal not found" ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

export default assistantRouter;
