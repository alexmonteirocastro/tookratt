import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

/**
 * Enforcing CSP against a production preview (ALE-218, enforced in ALE-249).
 * Kept off the dev servers in playwright.config.ts: Vite's React refresh
 * preamble is an inline script that production never ships.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /csp\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["list"], ["github"]] : [["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      VITE_API_BASE_URL: "/api",
      VITE_SHOW_SOURCES: "true",
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_e2e",
      CSP_PREVIEW_EXTRA_CONNECT_SRC: "https://example.supabase.co",
    },
  },
});
