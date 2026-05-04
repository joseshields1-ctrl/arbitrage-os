import type { FeedSocketMessage } from "./types";

export type FeedConnectionState = "Live" | "Offline" | "Reconnecting" | "Error";

type FeedHandlers = {
  onMessage: (message: FeedSocketMessage) => void;
  onState: (state: FeedConnectionState) => void;
};

const DEFAULT_WS_URL = "ws://localhost:8000/ws/feed";
const MAX_BACKOFF_MS = 30000;

export class FeedSocketClient {
  private readonly wsUrl: string;
  private readonly handlers: FeedHandlers;
  private websocket: WebSocket | null = null;
  private retryCount = 0;
  private reconnectTimeoutId: number | null = null;
  private manuallyClosed = false;

  constructor(wsUrl: string | undefined, handlers: FeedHandlers) {
    this.wsUrl = wsUrl && wsUrl.trim().length > 0 ? wsUrl : DEFAULT_WS_URL;
    this.handlers = handlers;
  }

  connect(): void {
    this.manuallyClosed = false;
    this.handlers.onState("Reconnecting");
    this.websocket = new WebSocket(this.wsUrl);
    this.websocket.onopen = () => {
      this.retryCount = 0;
      this.handlers.onState("Live");
    };
    this.websocket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as FeedSocketMessage;
        this.handlers.onMessage(payload);
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
    this.handlers.onState("Offline");
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
  wsUrl: string,
  onMessage: (message: FeedSocketMessage) => void,
  onState: (state: FeedConnectionState) => void,
  onHeartbeat: (timestamp: string) => void
) => {
  const client = new FeedSocketClient(wsUrl, {
    onMessage: (message) => {
      if (message.type === "heartbeat") {
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
