import { expect, test } from "@playwright/test";
import {
  MOCK_JOBS_STATS,
  createGate,
  mockJobsStats,
  openApp,
  seedApiKey,
} from "./helpers";

test("stats page shows country selector and jobs_per_role", { tag: "@smoke" }, async ({
  page,
}) => {
  const gate = createGate();
  await seedApiKey(page);
  await mockJobsStats(page, { holdUntil: gate.promise });
  await openApp(page, "/stats");

  await expect(page.getByRole("link", { name: "Stats" })).toHaveAttribute("aria-current", "page");
  const loading = page.getByRole("status");
  await expect(loading).toBeVisible();
  await expect(loading).toContainText(/loading job stats/i);

  gate.release();

  await expect(page.getByRole("radio", { name: "Denmark" })).toBeChecked();
  for (const name of ["Denmark", "Sweden", "Norway", "Finland", "Iceland", "Europe"]) {
    await expect(page.getByRole("radio", { name })).toBeVisible();
  }
  await expect(page.getByText("Total jobs")).toBeVisible();
  await expect(page.getByText(String(MOCK_JOBS_STATS.total_jobs), { exact: true })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Backend developer" })).toBeVisible();
  await expect(page.getByRole("button", { name: /new conversation/i })).toHaveCount(0);

  await mockJobsStats(page, {
    country: "SE",
    response: { ...MOCK_JOBS_STATS, total_jobs: 21 },
  });
  await page.getByTitle("Sweden").click();
  await expect(page.getByText("21", { exact: true })).toBeVisible();
});

test("stats page shows an error when jobs/stats fails", { tag: "@smoke" }, async ({ page }) => {
  await seedApiKey(page);
  await page.route("**/api/jobs/stats**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      json: { detail: "boom" },
    }),
  );
  await openApp(page, "/stats");

  await expect(page.getByRole("alert")).toHaveText("boom");
  await expect(page.getByText("Jobs per role")).toHaveCount(0);
});
