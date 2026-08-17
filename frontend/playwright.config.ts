import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
/**
 * PLAYWRIGHT_VISUAL is a Playwright-process toggle (this file): "0" drops the
 * debug-sources project and its :5174 Vite server so the CI smoke step does
 * not boot an unused server. Distinct from the ci.yml input `run_visual_tests`,
 * which decides whether the visual job step runs at all (frontend/ path filter).
 */
const runVisual = process.env.PLAYWRIGHT_VISUAL !== "0";

/**
 * Chromium-only E2E + visual regression (ADR-0017).
 * Debug-sources snapshots need VITE_SHOW_DEBUG_SOURCES at Vite startup, so they
 * run against a second dev server on 5174.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI
    ? [["list"], ["github"], ["html", { open: "never" }]]
    : [["list"], ["html"]],
  timeout: 30_000,
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{-projectName}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "UTC",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /debug-sources/,
      use: { ...devices["Desktop Chrome"] },
    },
    ...(runVisual
      ? [
          {
            name: "chromium-debug-sources",
            testMatch: /debug-sources/,
            use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5174" },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        VITE_SHOW_SOURCES: "true",
        VITE_SHOW_DEBUG_SOURCES: "false",
      },
    },
    ...(runVisual
      ? [
          {
            command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
            url: "http://127.0.0.1:5174",
            reuseExistingServer: !isCI,
            timeout: 120_000,
            env: {
              VITE_SHOW_SOURCES: "true",
              VITE_SHOW_DEBUG_SOURCES: "true",
            },
          },
        ]
      : []),
  ],
});
