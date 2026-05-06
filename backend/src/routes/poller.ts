import { type Request, type Response, Router } from "express";
import {
  getPollerStatus,
  runPollerOnce,
  startPoller,
  stopPoller,
} from "../services/pollerService";

const pollerRouter = Router();

pollerRouter.get("/status", (_req, res) => {
  res.json(getPollerStatus());
});

pollerRouter.post("/start", (req, res) => {
  try {
    const payload = req.body as
      | { interval_ms?: unknown; listing_urls?: unknown; keywords?: unknown }
      | undefined;
    const intervalMs =
      typeof payload?.interval_ms === "number" && Number.isFinite(payload.interval_ms)
        ? payload.interval_ms
        : undefined;
    const listingUrls = Array.isArray(payload?.listing_urls)
      ? payload?.listing_urls.filter((item): item is string => typeof item === "string")
      : undefined;
    const keywords = Array.isArray(payload?.keywords)
      ? payload?.keywords.filter((item): item is string => typeof item === "string")
      : undefined;
    const status = startPoller({
      interval_ms: intervalMs,
      listing_urls: listingUrls,
      keywords,
    });
    res.status(200).json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start poller";
    res.status(400).json({ error: message });
  }
});

pollerRouter.post("/stop", (_req, res) => {
  const status = stopPoller();
  res.status(200).json(status);
});

const runOnceHandler = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await runPollerOnce();
    res.status(200).json({
      ok: true,
      ...result,
      status: getPollerStatus(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run poller";
    res.status(500).json({ ok: false, error: message, status: getPollerStatus() });
  }
};

pollerRouter.post("/run-once", runOnceHandler);
pollerRouter.post("/runOnce", runOnceHandler);

export default pollerRouter;
