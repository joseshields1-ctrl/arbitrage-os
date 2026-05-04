import { useEffect, useMemo, useRef, useState } from "react";
import type { FeedSocketMessage } from "../feedSocket";
import { createFeedSocketClient } from "../feedSocket";

type FeedState = "Live" | "Offline" | "Reconnecting" | "Error";

interface FeedHeartbeatProps {
  wsUrl: string;
  onMessage?: (message: FeedSocketMessage) => void;
}

const LIVE_WINDOW_MS = 60_000;

export default function FeedHeartbeat({ wsUrl, onMessage }: FeedHeartbeatProps) {
  const [state, setState] = useState<FeedState>("Offline");
  const [sourceName, setSourceName] = useState("backend");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [sniperPicksCount, setSniperPicksCount] = useState(0);
  const clientRef = useRef<ReturnType<typeof createFeedSocketClient> | null>(null);

  useEffect(() => {
    const client = createFeedSocketClient(
      wsUrl,
      (message) => {
        if (
          message.type === "heartbeat" ||
          message.type === "feed_update" ||
          message.type === "DEAL_HEARTBEAT" ||
          message.type === "LIQUIDITY_CRITICAL"
        ) {
          setLastSyncAt(message.timestamp);
          if (
            message.payload &&
            typeof message.payload === "object" &&
            "source" in message.payload &&
            typeof (message.payload as Record<string, unknown>).source === "string"
          ) {
            setSourceName((message.payload as Record<string, string>).source);
          }
        }
        if (message.type === "sniper_pick") {
          setSniperPicksCount((current) => current + 1);
        }
        onMessage?.(message);
      },
      (nextState) => setState(nextState),
      (timestamp) => setLastSyncAt(timestamp)
    );
    clientRef.current = client;
    client.start();
    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, [onMessage, wsUrl]);

  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const syncAgeMs = useMemo(
    () => (lastSyncAt ? tick - Date.parse(lastSyncAt) : Number.POSITIVE_INFINITY),
    [lastSyncAt, tick]
  );
  const isLive = state === "Live" && Number.isFinite(syncAgeMs) && syncAgeMs < LIVE_WINDOW_MS;
  const freshnessLabel = isLive ? `LIVE - ${sourceName}` : state;

  return (
    <section className="preview-box">
      <p>
        <strong>Feed Freshness:</strong> {freshnessLabel}
      </p>
      <p>
        <strong>Last Sync:</strong>{" "}
        {lastSyncAt ? `${Math.max(0, Math.floor(syncAgeMs / 1000))}s ago` : "never"}
      </p>
      <p>
        <strong>Sniper AI Picks (WS):</strong> {sniperPicksCount}
      </p>
      <div className="entry-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={() => {
            clientRef.current?.stop();
            clientRef.current?.start();
          }}
        >
          Reconnect Feed
        </button>
      </div>
    </section>
  );
}
