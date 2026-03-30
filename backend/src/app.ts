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
import dealsRouter from "./routes/deals";
import dashboardRouter from "./routes/dashboard";

const app = express();

app.use(cors());
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
app.use("/api/deals", dealsRouter);
app.use("/api/dashboard", dashboardRouter);

export default app;
