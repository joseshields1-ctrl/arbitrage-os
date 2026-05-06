import express from "express";
import cors from "cors";
import healthRouter from "./routes/health";
import testCostRouter from "./routes/testCost";
import testConfigRouter from "./routes/testConfig";
import testEnrichRouter from "./routes/testEnrich";
import testEngineValidationRouter from "./routes/testEngineValidation";
import testOperatorRouter from "./routes/testOperator";
import testAssistantRouter from "./routes/testAssistant";
import testDecisionLoopRouter from "./routes/testDecisionLoop";
import assistantRouter from "./routes/assistant";
import aiRouter from "./routes/ai";
import dealsRouter from "./routes/deals";
import dashboardRouter from "./routes/dashboard";
import opportunitiesRouter from "./routes/opportunities";
import streamRouter from "./routes/stream";
import auctionsRouter from "./routes/auctions";
import pollerRouter from "./routes/poller";

const app = express();

const configuredCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

const defaultDevOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const allowedOrigins = configuredCorsOrigins.length > 0 ? configuredCorsOrigins : defaultDevOrigins;

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use("/health", healthRouter);
app.use("/test-cost", testCostRouter);
app.use("/test-config", testConfigRouter);
app.use("/test-enrich", testEnrichRouter);
app.use("/test-engine-validation", testEngineValidationRouter);
app.use("/test-operator", testOperatorRouter);
app.use("/test-assistant", testAssistantRouter);
app.use("/test-decision-loop", testDecisionLoopRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/ai", aiRouter);
app.use("/api/deals", dealsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/opportunities", opportunitiesRouter);
app.use("/api/auctions", auctionsRouter);
app.use("/api/poller", pollerRouter);
app.use("/api/stream", streamRouter);

export default app;
