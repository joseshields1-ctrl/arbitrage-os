const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

export const API_BASE_URL = trimTrailingSlash(
  import.meta.env.NEXT_PUBLIC_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
);

export const WS_FEED_URL = trimTrailingSlash(
  import.meta.env.NEXT_PUBLIC_WS_FEED_URL ||
    import.meta.env.VITE_WS_FEED_URL ||
    "ws://localhost:8000/ws/feed"
);
