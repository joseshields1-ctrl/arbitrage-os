import type { Request, Response } from "express";
import type { OpportunityRecord } from "../../models/opportunities";

export type DealHeartbeatType = "price_change" | "final_15_minutes" | "liquidity_critical";

export interface DealHeartbeatPayload {
  listing_id: string | null;
  deal_id?: string | null;
  source: "govdeals";
  type: DealHeartbeatType;
  message: string;
  time_left_ms?: number | null;
  current_bid?: number | null;
  previous_bid?: number | null;
}

type FeedEventType = "DEAL_HEARTBEAT" | "LIQUIDITY_CRITICAL";

interface FeedEvent {
  event: FeedEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

type FeedClient = {
  id: string;
  write: (chunk: string) => void;
  close: () => void;
};

const clients = new Map<string, FeedClient>();

const nowIso = (): string => new Date().toISOString();

const serializeSse = (event: FeedEvent): string =>
  `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`;

const pushEvent = (event: FeedEvent): void => {
  const serialized = serializeSse(event);
  for (const [, client] of clients) {
    try {
      client.write(serialized);
    } catch {
      try {
        client.close();
      } catch {
        // ignore close errors
      }
    }
  }
};

export const publishDealHeartbeat = (payload: DealHeartbeatPayload): void => {
  pushEvent({
    event: "DEAL_HEARTBEAT",
    timestamp: nowIso(),
    payload,
  });
};

export const publishLiquidityCritical = (payload: {
  deal_id: string | null;
  listing_id: string | null;
  available_liquidity: number;
  required_liquidity: number;
  reason: string;
}): void => {
  pushEvent({
    event: "LIQUIDITY_CRITICAL",
    timestamp: nowIso(),
    payload,
  });
};

const computeTimeLeftMs = (auctionEnd: string | null): number | null => {
  if (!auctionEnd) {
    return null;
  }
  const endTs = Date.parse(auctionEnd);
  if (!Number.isFinite(endTs)) {
    return null;
  }
  return endTs - Date.now();
};

export const emitOpportunityHeartbeatIfNeeded = (
  nextOpportunity: OpportunityRecord,
  previousOpportunity?: OpportunityRecord | null
): void => {
  if (nextOpportunity.source !== "govdeals") {
    return;
  }
  const timeLeftMs = computeTimeLeftMs(nextOpportunity.auction_end ?? null);
  if (previousOpportunity?.current_bid !== null && nextOpportunity.current_bid !== null) {
    if (previousOpportunity.current_bid !== nextOpportunity.current_bid) {
      publishDealHeartbeat({
        listing_id: nextOpportunity.listing_id,
        source: "govdeals",
        type: "price_change",
        message: "GovDeals price change detected.",
        current_bid: nextOpportunity.current_bid,
        previous_bid: previousOpportunity.current_bid,
        time_left_ms: timeLeftMs,
      });
    }
  }
  if (timeLeftMs !== null && timeLeftMs > 0 && timeLeftMs <= 15 * 60 * 1000) {
    publishDealHeartbeat({
      listing_id: nextOpportunity.listing_id,
      source: "govdeals",
      type: "final_15_minutes",
      message: "Deal entered final 15-minute auction window.",
      current_bid: nextOpportunity.current_bid ?? null,
      previous_bid: previousOpportunity?.current_bid ?? null,
      time_left_ms: timeLeftMs,
    });
  }
};

export const streamGatewayHandler = (_req: Request, res: Response): void => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders?.();

  const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const client: FeedClient = {
    id: clientId,
    write: (chunk) => res.write(chunk),
    close: () => res.end(),
  };
  clients.set(clientId, client);

  res.write(
    serializeSse({
      event: "DEAL_HEARTBEAT",
      timestamp: nowIso(),
      payload: {
        source: "govdeals",
        type: "final_15_minutes",
        message: "Feed connection established.",
      },
    })
  );

  const heartbeatInterval = setInterval(() => {
    res.write(
      serializeSse({
        event: "DEAL_HEARTBEAT",
        timestamp: nowIso(),
        payload: {
          source: "govdeals",
          type: "final_15_minutes",
          message: "heartbeat",
        },
      })
    );
  }, 30_000);

  const cleanup = () => {
    clearInterval(heartbeatInterval);
    clients.delete(clientId);
    try {
      res.end();
    } catch {
      // ignore
    }
  };

  res.on("close", cleanup);
  res.on("error", cleanup);
};

