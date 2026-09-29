import { expect, test, type Page } from "@playwright/test";

import { contentSecurityPolicy } from "../securityHeaders.ts";
import { PENDING_PASSWORD_TYPE_KEY } from "../src/api/authHash";
import {
  MOCK_CHAT_QUESTION,
  mockChat,
  mockJobsStats,
  openApp,
  seedSession,
  submitQuestion,
} from "./helpers";

const ADMIN_USERS = [
  {
    id: "e2e-user",
    email: "alex@example.com",
    status: "active",
    role: "admin",
    created_at: "2026-01-15T00:00:00Z",
    last_sign_in_at: "2026-03-02T00:00:00Z",
  },
];

async function installCspProbe(page: Page): Promise<string[]> {
  const consoleHits: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("Content Security Policy")) {
      consoleHits.push(text);
    }
  });
  await page.addInitScript(() => {
    const target = window as Window & { __cspViolations?: string[] };
    target.__cspViolations = [];
    window.addEventListener("securitypolicyviolation", (event) => {
      target.__cspViolations?.push(
        `${event.disposition} ${event.violatedDirective} ${event.blockedURI}`,
      );
    });
  });
  return consoleHits;
}

async function expectNoCspViolations(page: Page, consoleHits: string[]): Promise<void> {
  const violations = await page.evaluate(
    () => (window as Window & { __cspViolations?: string[] }).__cspViolations ?? [],
  );
  expect(violations, violations.join("\n")).toEqual([]);
  expect(consoleHits, consoleHits.join("\n")).toEqual([]);
}

async function mockAdminUsers(page: Page): Promise<void> {
  await page.route("**/api/admin/users**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: { page: 1, users: ADMIN_USERS },
    });
  });
}

test("preview sends the enforcing policy and frame denial", async ({ request }) => {
  const policy = contentSecurityPolicy(["https://example.supabase.co"]);
  for (const path of ["/", "/login"]) {
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
    const headers = response.headers();
    expect(headers["content-security-policy"]).toBe(policy);
    expect(headers["content-security-policy-report-only"]).toBeUndefined();
    expect(headers["x-frame-options"]).toBe("DENY");
  }
});

test("login page stays within the enforcing policy", async ({ page }) => {
  const consoleHits = await installCspProbe(page);
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
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();

  await page.getByLabel("Email").fill("sara@example.com");
  await page.getByLabel("Password").fill("long-enough");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("link", { name: "Job market" })).toHaveAttribute("aria-current", "page");

  await expectNoCspViolations(page, consoleHits);
});

test("set-password page stays within the enforcing policy", async ({ page }) => {
  const consoleHits = await installCspProbe(page);
  await mockJobsStats(page);
  await seedSession(page);
  await page.addInitScript((key: string) => {
    sessionStorage.setItem(key, "invite");
  }, PENDING_PASSWORD_TYPE_KEY);
  await page.route("**/auth/v1/user**", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        id: "e2e-user",
        email: "alex@example.com",
        aud: "authenticated",
        role: "authenticated",
        app_metadata: { role: "member" },
        user_metadata: {},
      },
    });
  });
  await openApp(page, "/");
  await expect(page.getByRole("heading", { name: "Welcome to Töökratt" })).toBeVisible();

  await page.getByLabel("Password").fill("long-enough");
  await page.getByLabel("Type it again").fill("long-enough");
  await page.getByRole("button", { name: "Set password and continue" }).click();
  await expect(page.getByRole("link", { name: "Job market" })).toHaveAttribute("aria-current", "page");

  await expectNoCspViolations(page, consoleHits);
});

test("chat stays within the enforcing policy", async ({ page }) => {
  const consoleHits = await installCspProbe(page);
  await seedSession(page);
  await mockChat(page);
  await openApp(page, "/chat");
  await expect(page.getByRole("heading", { name: "Ask about the market." })).toBeVisible();

  await submitQuestion(page, MOCK_CHAT_QUESTION);
  await expect(page.getByRole("article", { name: "Assistant reply" })).toBeVisible();

  await expectNoCspViolations(page, consoleHits);
});

test("job market bars stay within the enforcing policy", async ({ page }) => {
  const consoleHits = await installCspProbe(page);
  await seedSession(page);
  await mockJobsStats(page);
  await openApp(page, "/market");
  await expect(page.getByRole("rowheader", { name: "Backend developer" })).toBeVisible();

  await expectNoCspViolations(page, consoleHits);
});

test("admin stays within the enforcing policy", async ({ page }) => {
  const consoleHits = await installCspProbe(page);
  await seedSession(page, "admin");
  await mockAdminUsers(page);
  await openApp(page, "/admin");
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();

  await expectNoCspViolations(page, consoleHits);
});
