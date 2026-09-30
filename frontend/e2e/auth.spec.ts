import { expect, test } from "@playwright/test";
import { mockJobsStats, mockSetPassword, openApp, seedSession } from "./helpers";

test("login failure stays on the form", { tag: "@smoke" }, async ({ page }) => {
  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      json: {
        error: "invalid_grant",
        error_code: "invalid_credentials",
        msg: "Invalid login credentials",
      },
    });
  });
  await openApp(page, "/login");
  await page.getByLabel("Email").fill("sara@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "That email and password don't match. Try again, or ask us for a reset link.",
  );
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("login success opens the job market", { tag: "@smoke" }, async ({ page }) => {
  await mockJobsStats(page);
  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        access_token: "e2e-access-token",
        refresh_token: "e2e-refresh-token",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: {
          id: "e2e-user",
          aud: "authenticated",
          role: "authenticated",
          email: "sara@example.com",
          app_metadata: { role: "member" },
          user_metadata: {},
          created_at: "2026-01-01T00:00:00.000Z",
        },
      },
    });
  });
  await openApp(page, "/login");
  await page.getByLabel("Email").fill("sara@example.com");
  await page.getByLabel("Password").fill("long-enough");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("link", { name: "Job market" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("sara@example.com")).toBeVisible();
});

test("paused project replaces the login form", { tag: "@smoke" }, async ({ page }) => {
  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", json: { message: "down" } });
  });
  await openApp(page, "/login");
  await page.getByLabel("Email").fill("sara@example.com");
  await page.getByLabel("Password").fill("long-enough");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("heading", { name: "Paused right now" })).toBeVisible();
});

test("set-password page accepts a new password", { tag: "@smoke" }, async ({ page }) => {
  await mockJobsStats(page);
  await mockSetPassword(page);
  await openApp(page, "/set-password#token_hash=e2e-token&type=invite");
  await expect(page.getByRole("heading", { name: "Welcome to Töökratt" })).toBeVisible();
  await expect(page).toHaveURL(/\/set-password$/);
  expect(page.url()).not.toContain("token_hash");
  await page.getByLabel("Password").fill("long-enough");
  await page.getByLabel("Type it again").fill("long-enough");
  await page.getByRole("button", { name: "Set password and continue" }).click();

  await expect(page.getByRole("link", { name: "Job market" })).toHaveAttribute("aria-current", "page");
});

test("logout returns to login without the session note", { tag: "@smoke" }, async ({ page }) => {
  await page.route("**/auth/v1/logout**", async (route) => {
    await route.fulfill({ status: 204 });
  });
  await mockJobsStats(page);
  await seedSession(page);
  await openApp(page, "/market");
  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(page.getByText(/you've been logged out/i)).toHaveCount(0);
});

test("admin is hidden from a member", { tag: "@smoke" }, async ({ page }) => {
  await mockJobsStats(page);
  await seedSession(page, "member");
  await openApp(page, "/market");

  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admins only" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Job market", exact: true })).toBeVisible();
});
