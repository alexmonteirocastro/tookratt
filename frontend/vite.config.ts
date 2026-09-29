import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { previewHeaders } from "./securityHeaders.ts";

/** Dev-only proxy timeout — local Ollama generation can exceed 3 minutes on CPU (ALE-111). */
const DEV_PROXY_TIMEOUT_MS = 600_000;

/**
 * Playwright's production preview adds the dummy Supabase host.
 * Unset for a normal `vite preview`, and never written into public/_headers.
 */
const previewExtraConnectSrc = (process.env.CSP_PREVIEW_EXTRA_CONNECT_SRC ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

export default defineConfig({
  plugins: [react()],
  preview: {
    headers: previewHeaders(previewExtraConnectSrc),
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
        timeout: DEV_PROXY_TIMEOUT_MS,
      },
    },
  },
});
