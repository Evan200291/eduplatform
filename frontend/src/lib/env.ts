/**
 * Single place the app reads environment from. Nothing else should touch
 * `import.meta.env`, so swapping a value or adding a default is a one-file change.
 */
export const env = {
  /** Mounted at `/api/v1` on the backend. Kept relative in dev via the Vite proxy. */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;
