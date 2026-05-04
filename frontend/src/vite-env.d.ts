/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NEXT_PUBLIC_API_BASE_URL?: string;
  readonly NEXT_PUBLIC_WS_FEED_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_FEED_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
