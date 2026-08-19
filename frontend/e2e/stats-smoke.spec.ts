import { expect, test } from "@playwright/test";
import { MOCK_JOBS_STATS, mockJobsStats, openApp, seedApiKey } from "./helpers";

test("stats page shows country selector and jobs_per_role", { tag: "@smoke" }, async ({
  page,
}) => {
  await seedApiKey(page);
  await mockJobsStats(page);
  await openApp(page);

  await page.getByRole("link", { name: "Stats" }).click();

  await expect(page.getByRole("link", { name: "Stats" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("radio", { name: "Denmark" })).toBeChecked();
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
