/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Runtime API base. Relative by default so refresh cookies stay same-origin. */
  readonly VITE_API_BASE_URL?: string;
  /** Backend origin the dev server proxies to. Build-time only. */
  readonly VITE_DEV_API_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
