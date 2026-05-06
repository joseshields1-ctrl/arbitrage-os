import { Router } from "express";
import {
  createManualAuction,
  deleteAuction,
  getAuctionById,
  listAuctions,
  updateAuction,
} from "../services/auctionService";

const auctionsRouter = Router();

auctionsRouter.get("/", (_req, res) => {
  try {
    const auctions = listAuctions();
    res.json({ auctions, count: auctions.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list auctions";
    res.status(500).json({ error: message });
  }
});

auctionsRouter.get("/:id", (req, res) => {
  try {
    const auction = getAuctionById(req.params.id);
    if (!auction) {
      res.status(404).json({ error: "Auction not found" });
      return;
    }
    res.json(auction);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load auction";
    res.status(500).json({ error: message });
  }
});

auctionsRouter.post("/", (req, res) => {
  try {
    const auction = createManualAuction(req.body);
    res.status(201).json(auction);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create auction";
    res.status(400).json({ error: message });
  }
});

auctionsRouter.patch("/:id", (req, res) => {
  try {
    const auction = updateAuction(req.params.id, req.body);
    res.json(auction);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update auction";
    const status = message === "Auction not found" ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

auctionsRouter.delete("/:id", (req, res) => {
  try {
    const deleted = deleteAuction(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Auction not found" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete auction";
    res.status(500).json({ error: message });
  }
});

export default auctionsRouter;
