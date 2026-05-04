import { Router } from "express";
import { streamGatewayHandler } from "../services/engine/streamGateway";

const streamRouter = Router();

streamRouter.get("/feed", (req, res) => {
  streamGatewayHandler(req, res);
});

export default streamRouter;
