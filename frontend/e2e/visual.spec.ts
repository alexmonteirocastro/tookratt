import { expect, test } from "@playwright/test";
import {
  MOCK_CHAT_QUESTION,
  mockChat,
  mockJobsStats,
  openApp,
  seedApiKey,
  sourceListLocator,
  submitQuestion,
} from "./helpers";

test.describe("visual snapshots", { tag: "@visual" }, () => {
  // Pixel diffs will not pass on retry (local vs CI fonts). Don't burn CI minutes.
  test.describe.configure({ retries: 0 });
  test("empty chat view", async ({ page }) => {
    await seedApiKey(page);
    await openApp(page, "/chat");

    await expect(
      page.getByText(/ask about nordic and european startup jobs/i),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("chat-empty.png", { fullPage: true });
  });

  test("source list compact variant", async ({ page }) => {
    await seedApiKey(page);
    await mockChat(page);
    await openApp(page, "/chat");
    await submitQuestion(page, MOCK_CHAT_QUESTION);

    const sources = sourceListLocator(page, "Sources");
    await expect(sources).toBeVisible();
    await expect(sources).toHaveScreenshot("source-list-compact.png");
  });

  test("api-key auth modal", async ({ page }) => {
    await openApp(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "API access" })).toBeVisible();
    await expect(page).toHaveScreenshot("api-key-modal.png", { fullPage: true });
  });

  test("job market", async ({ page }) => {
    await seedApiKey(page);
    await mockJobsStats(page);
    await openApp(page, "/market");

    await expect(page.getByRole("link", { name: "Job market" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("rowheader", { name: "Backend developer" })).toBeVisible();
    await expect(page).toHaveScreenshot("job-market.png", { fullPage: true });
  });
});
