import type { SourcePlatform } from "../../models/dealV32";
import { assertLiquidityAvailable, getAvailableLiquidity, LiquidityCriticalError } from "./capital";
import { getActualNowMs, syncGovDealsServerClock } from "./timeSync";
import { publishDealHeartbeat, publishLiquidityCritical } from "./streamGateway";

const PRE_END_EXECUTION_OFFSET_MS = 12_000;

export interface ScheduleBidInput {
  deal_id: string;
  listing_id: string | null;
  source_platform: SourcePlatform;
  auction_end_time: string;
  target_bid: number;
  current_bid: number;
  estimated_fees: number;
  reserve_capital: (amount: number, reason: string) => void;
  release_reserved_capital?: (amount: number, reason: string) => void;
  execute_bid: () => Promise<{ ok: boolean; message?: string }>;
}

export interface ScheduledBidInfo {
  deal_id: string;
  listing_id: string | null;
  execute_at: string;
  auction_end_time: string;
  target_bid: number;
  reserved_amount: number;
}

export interface ScheduleBidResult {
  ok: boolean;
  status: "scheduled" | "aborted" | "invalid";
  reason: string | null;
  scheduled_bid: ScheduledBidInfo | null;
}

interface InternalScheduledBid {
  info: ScheduledBidInfo;
  timer: NodeJS.Timeout;
}

const scheduledBids = new Map<string, InternalScheduledBid>();

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundCurrency = (value: number): number =>
  Math.round((Math.max(0, value) + Number.EPSILON) * 100) / 100;

export const listScheduledBids = (): ScheduledBidInfo[] =>
  Array.from(scheduledBids.values()).map((entry) => entry.info);

export const cancelScheduledBid = (dealId: string): boolean => {
  const scheduled = scheduledBids.get(dealId);
  if (!scheduled) {
    return false;
  }
  clearTimeout(scheduled.timer);
  scheduledBids.delete(dealId);
  return true;
};

export const scheduleBid = async (input: ScheduleBidInput): Promise<ScheduleBidResult> => {
  if (input.source_platform !== "govdeals") {
    return {
      ok: false,
      status: "invalid",
      reason: "Bid scheduler is restricted to GovDeals deals.",
      scheduled_bid: null,
    };
  }

  const auctionEndTs = Date.parse(input.auction_end_time);
  const targetBid = toFiniteNumber(input.target_bid);
  const currentBid = toFiniteNumber(input.current_bid);
  const estimatedFees = toFiniteNumber(input.estimated_fees);
  if (!Number.isFinite(auctionEndTs) || targetBid === null || currentBid === null || estimatedFees === null) {
    return {
      ok: false,
      status: "invalid",
      reason: "Invalid auction_end_time/target_bid/current_bid/estimated_fees values.",
      scheduled_bid: null,
    };
  }
  if (targetBid <= 0 || currentBid < 0 || estimatedFees < 0) {
    return {
      ok: false,
      status: "invalid",
      reason: "target_bid must be > 0 and bid/fees must be non-negative.",
      scheduled_bid: null,
    };
  }

  await syncGovDealsServerClock();
  const executeAtTs = auctionEndTs - PRE_END_EXECUTION_OFFSET_MS;
  const delayMs = executeAtTs - getActualNowMs();
  if (delayMs <= 0) {
    return {
      ok: false,
      status: "aborted",
      reason: "Auction execution window already passed.",
      scheduled_bid: null,
    };
  }

  const reserveAmount = roundCurrency(targetBid + estimatedFees);
  try {
    assertLiquidityAvailable(reserveAmount);
  } catch (error) {
    if (error instanceof LiquidityCriticalError) {
      publishLiquidityCritical({
        deal_id: input.deal_id,
        listing_id: input.listing_id,
        available_liquidity: Number(error.details.available_liquidity ?? 0),
        required_liquidity: Number(error.details.required_capital ?? reserveAmount),
        reason: error.message,
      });
      publishDealHeartbeat({
        listing_id: input.listing_id,
        deal_id: input.deal_id,
        source: "govdeals",
        type: "liquidity_critical",
        message: error.message,
        current_bid: currentBid,
      });
      return {
        ok: false,
        status: "aborted",
        reason: error.message,
        scheduled_bid: null,
      };
    }
    throw error;
  }

  if (scheduledBids.has(input.deal_id)) {
    cancelScheduledBid(input.deal_id);
  }
  input.reserve_capital(reserveAmount, "scheduled_bid");

  const info: ScheduledBidInfo = {
    deal_id: input.deal_id,
    listing_id: input.listing_id,
    execute_at: new Date(executeAtTs).toISOString(),
    auction_end_time: new Date(auctionEndTs).toISOString(),
    target_bid,
    reserved_amount: reserveAmount,
  };

  const timer = setTimeout(async () => {
    try {
      const runtimeRequired = roundCurrency(currentBid + estimatedFees);
      const runtimeLiquidity = getAvailableLiquidity();
      if (runtimeLiquidity.available_liquidity < runtimeRequired) {
        const reason = "LIQUIDITY_CRITICAL: runtime liquidity below bid + estimated fees.";
        publishLiquidityCritical({
          deal_id: input.deal_id,
          listing_id: input.listing_id,
          available_liquidity: runtimeLiquidity.available_liquidity,
          required_liquidity: runtimeRequired,
          reason,
        });
        publishDealHeartbeat({
          listing_id: input.listing_id,
          deal_id: input.deal_id,
          source: "govdeals",
          type: "liquidity_critical",
          message: reason,
          current_bid: currentBid,
        });
        input.release_reserved_capital?.(reserveAmount, "liquidity_critical_abort");
        return;
      }

      const executed = await input.execute_bid();
      if (!executed.ok) {
        input.release_reserved_capital?.(reserveAmount, "bid_execution_failed");
      }
    } catch {
      input.release_reserved_capital?.(reserveAmount, "bid_execution_exception");
    } finally {
      scheduledBids.delete(input.deal_id);
    }
  }, delayMs);

  scheduledBids.set(input.deal_id, { info, timer });
  return {
    ok: true,
    status: "scheduled",
    reason: null,
    scheduled_bid: info,
  };
};

