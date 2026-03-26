import express from "express";
import healthRouter from "./routes/health";
import testCostRouter from "./routes/testCost";

const app = express();

app.use(express.json());
app.use("/health", healthRouter);
app.use("/test-cost", testCostRouter);

export default app;
