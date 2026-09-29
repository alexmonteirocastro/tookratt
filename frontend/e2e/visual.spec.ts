import { expect, test } from "@playwright/test";
import {
  MOCK_CHAT_QUESTION,
  mockChat,
  mockJobsStats,
  openApp,
  seedSession,
  sourceListLocator,
  submitQuestion,
} from "./helpers";
import { PENDING_PASSWORD_TYPE_KEY } from "../src/api/authHash";

test.describe("visual snapshots", { tag: "@visual" }, () => {
  // Pixel diffs will not pass on retry (local vs CI fonts). Don't burn CI minutes.
  test.describe.configure({ retries: 0 });
  test("empty chat view", async ({ page }) => {
    await seedSession(page);
    await openApp(page, "/chat");

    await expect(page.getByRole("heading", { name: "Ask about the market." })).toBeVisible();
    await expect(page).toHaveScreenshot("chat-empty.png", { fullPage: true });
  });

  test("source list compact variant", async ({ page }) => {
    await seedSession(page);
    await mockChat(page);
    await openApp(page, "/chat");
    await submitQuestion(page, MOCK_CHAT_QUESTION);

    const sources = sourceListLocator(page, "Sources");
    await expect(sources).toBeVisible();
    await expect(sources).toHaveScreenshot("source-list-compact.png");
  });

  test("source list compact mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSession(page);
    await mockChat(page);
    await openApp(page, "/chat");
    await submitQuestion(page, MOCK_CHAT_QUESTION);

    const sources = sourceListLocator(page, "Sources");
    await expect(sources).toBeVisible();
    await expect(sources.getByText("Acme · Copenhagen")).toBeVisible();
    await expect(sources).toHaveScreenshot("source-list-compact-mobile.png");
  });

  test("login", async ({ page }) => {
    await openApp(page, "/login");

    await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    await expect(page).toHaveScreenshot("login.png", { fullPage: true });
  });

  test("set password", async ({ page }) => {
    await seedSession(page);
    await page.addInitScript((key: string) => {
      sessionStorage.setItem(key, "invite");
    }, PENDING_PASSWORD_TYPE_KEY);
    await openApp(page, "/");

    await expect(page.getByRole("heading", { name: "Welcome to Töökratt" })).toBeVisible();
    await expect(page).toHaveScreenshot("set-password.png", { fullPage: true });
  });

  test("admin", async ({ page }) => {
    await seedSession(page, "admin");
    await page.route("**/api/admin/users**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        json: {
          page: 1,
          users: [
            {
              id: "e2e-user",
              email: "alex@example.com",
              status: "active",
              role: "admin",
              created_at: "2026-01-15T00:00:00Z",
              last_sign_in_at: "2026-03-02T00:00:00Z",
            },
            {
              id: "22222222-2222-2222-2222-222222222222",
              email: "sara@example.com",
              status: "invited",
              role: null,
              created_at: "2026-02-02T00:00:00Z",
              last_sign_in_at: null,
            },
            {
              id: "33333333-3333-3333-3333-333333333333",
              email: "jonas@example.com",
              status: "revoked",
              role: "member",
              created_at: "2026-01-02T00:00:00Z",
              last_sign_in_at: "2026-01-20T00:00:00Z",
            },
          ],
        },
      });
    });
    await openApp(page, "/admin");

    await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
    await expect(page.getByText("sara@example.com")).toBeVisible();
    await expect(page).toHaveScreenshot("admin.png", { fullPage: true });
  });

  test("paused project", async ({ page }) => {
    await page.route("**/auth/v1/token**", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        json: { message: "Project is paused", error_code: "project_paused" },
      });
    });
    await openApp(page, "/login");
    await page.getByLabel("Email").fill("sara@example.com");
    await page.getByLabel("Password").fill("long-enough");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByRole("heading", { name: "Paused right now" })).toBeVisible();
    await expect(page).toHaveScreenshot("paused.png", { fullPage: true });
  });

  test("job market", async ({ page }) => {
    await seedSession(page);
    await mockJobsStats(page);
    await openApp(page, "/market");

    await expect(page.getByRole("link", { name: "Job market" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("rowheader", { name: "Backend developer" })).toBeVisible();
    await expect(page).toHaveScreenshot("job-market.png", { fullPage: true });
  });

  test("job market mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSession(page);
    await mockJobsStats(page);
    await openApp(page, "/market");

    await expect(page.getByRole("rowheader", { name: "Backend developer" })).toBeVisible();
    await expect(page).toHaveScreenshot("job-market-mobile.png", { fullPage: true });
  });

  test("empty chat mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedSession(page);
    await openApp(page, "/chat");

    await expect(page.getByRole("heading", { name: "Ask about the market." })).toBeVisible();
    await expect(page.getByPlaceholder("Ask about the market")).toBeVisible();
    await expect(page).toHaveScreenshot("chat-empty-mobile.png", { fullPage: true });
  });
});
