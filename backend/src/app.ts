import express from "express";
import healthRouter from "./routes/health";
import testCostRouter from "./routes/testCost";
import testConfigRouter from "./routes/testConfig";

const app = express();

app.use(express.json());
app.use("/health", healthRouter);
app.use("/test-cost", testCostRouter);
app.use("/test-config", testConfigRouter);

export default app;
