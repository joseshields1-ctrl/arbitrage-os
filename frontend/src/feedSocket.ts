export type FeedConnectionState = "Live" | "Offline" | "Reconnecting" | "Error";

export interface FeedSocketMessage {
  type:
    | "DEAL_HEARTBEAT"
    | "LIQUIDITY_CRITICAL"
    | "heartbeat"
    | "feed_update"
    | "sniper_pick"
    | "error";
  timestamp: string;
  payload: Record<string, unknown>;
}

type FeedHandlers = {
  onMessage: (message: FeedSocketMessage) => void;
  onState: (state: FeedConnectionState) => void;
};

const DEFAULT_FEED_URL = "http://localhost:3000/api/stream/feed";
const MAX_BACKOFF_MS = 30000;

const normalizeFeedUrl = (value: string | undefined): string => {
  if (!value || !value.trim()) {
    return DEFAULT_FEED_URL;
  }
  return value.trim();
};

const isWebSocketUrl = (value: string): boolean =>
  value.startsWith("ws://") || value.startsWith("wss://");

const normalizeIncomingMessage = (value: unknown): FeedSocketMessage | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Record<string, unknown>;
  const typeRaw = parsed.type ?? parsed.event;
  if (typeof typeRaw !== "string") {
    return null;
  }
  const timestampRaw = parsed.timestamp;
  const timestamp =
    typeof timestampRaw === "string" && timestampRaw.trim().length > 0
      ? timestampRaw
      : new Date().toISOString();
  const payloadRaw = parsed.payload;
  const payload =
    payloadRaw && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)
      ? (payloadRaw as Record<string, unknown>)
      : {};
  return {
    type: typeRaw as FeedSocketMessage["type"],
    timestamp,
    payload,
  };
};

export class FeedSocketClient {
  private readonly feedUrl: string;
  private readonly handlers: FeedHandlers;
  private websocket: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private retryCount = 0;
  private reconnectTimeoutId: number | null = null;
  private manuallyClosed = false;

  constructor(feedUrl: string | undefined, handlers: FeedHandlers) {
    this.feedUrl = normalizeFeedUrl(feedUrl);
    this.handlers = handlers;
  }

  connect(): void {
    this.manuallyClosed = false;
    this.handlers.onState("Reconnecting");
    if (isWebSocketUrl(this.feedUrl)) {
      this.connectWebSocket();
      return;
    }
    this.connectEventSource();
  }

  disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimeoutId !== null) {
      window.clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.handlers.onState("Offline");
  }

  private connectWebSocket(): void {
    this.websocket = new WebSocket(this.feedUrl);
    this.websocket.onopen = () => {
      this.retryCount = 0;
      this.handlers.onState("Live");
    };
    this.websocket.onmessage = (event) => {
      try {
        const parsed = normalizeIncomingMessage(JSON.parse(event.data));
        if (!parsed) {
          this.handlers.onState("Error");
          return;
        }
        this.handlers.onMessage(parsed);
      } catch {
        this.handlers.onState("Error");
      }
    };
    this.websocket.onerror = () => {
      this.handlers.onState("Error");
    };
    this.websocket.onclose = () => {
      if (this.manuallyClosed) {
        this.handlers.onState("Offline");
        return;
      }
      this.handlers.onState("Reconnecting");
      this.scheduleReconnect();
    };
  }

  private connectEventSource(): void {
    this.eventSource = new EventSource(this.feedUrl);
    this.eventSource.onopen = () => {
      this.retryCount = 0;
      this.handlers.onState("Live");
    };
    this.eventSource.onerror = () => {
      if (this.manuallyClosed) {
        this.handlers.onState("Offline");
        return;
      }
      this.handlers.onState("Reconnecting");
      if (this.eventSource) {
        this.eventSource.close();
        this.eventSource = null;
      }
      this.scheduleReconnect();
    };

    const eventHandler = (event: MessageEvent<string>): void => {
      try {
        const parsed = normalizeIncomingMessage(JSON.parse(event.data));
        if (!parsed) {
          this.handlers.onState("Error");
          return;
        }
        this.handlers.onMessage(parsed);
      } catch {
        this.handlers.onState("Error");
      }
    };

    this.eventSource.onmessage = eventHandler;
    this.eventSource.addEventListener("DEAL_HEARTBEAT", eventHandler as EventListener);
    this.eventSource.addEventListener("LIQUIDITY_CRITICAL", eventHandler as EventListener);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.retryCount);
    this.retryCount += 1;
    this.reconnectTimeoutId = window.setTimeout(() => {
      this.connect();
    }, delay);
  }
}

export const createFeedSocketClient = (
  feedUrl: string,
  onMessage: (message: FeedSocketMessage) => void,
  onState: (state: FeedConnectionState) => void,
  onHeartbeat: (timestamp: string) => void
) => {
  const client = new FeedSocketClient(feedUrl, {
    onMessage: (message) => {
      if (message.type === "heartbeat" || message.type === "DEAL_HEARTBEAT") {
        onHeartbeat(message.timestamp);
      }
      onMessage(message);
    },
    onState,
  });

  return {
    start: () => client.connect(),
    stop: () => client.disconnect(),
  };
};
