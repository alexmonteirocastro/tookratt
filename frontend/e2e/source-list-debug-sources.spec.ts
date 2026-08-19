import { expect, test } from "@playwright/test";
import {
  MOCK_CHAT_QUESTION,
  mockChat,
  openApp,
  seedApiKey,
  sourceListLocator,
  submitQuestion,
} from "./helpers";

test.describe("debug sources", { tag: "@visual" }, () => {
  // Pixel diffs will not pass on retry (local vs CI fonts). Don't burn CI minutes.
  test.describe.configure({ retries: 0 });

  test("source list debug variant", async ({ page }) => {
    await seedApiKey(page);
    await mockChat(page);
    await openApp(page, "/chat");
    await submitQuestion(page, MOCK_CHAT_QUESTION);

    const sources = sourceListLocator(page, "Retrieved sources");
    await expect(sources).toBeVisible();
    await expect(page.getByText(/acme · copenhagen · denmark/i)).toBeVisible();
    await expect(sources).toHaveScreenshot("source-list-debug.png");
  });
});
