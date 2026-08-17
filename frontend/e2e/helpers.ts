import { type Page, type Route } from "@playwright/test";
import { API_KEY_STORAGE_KEY } from "../src/api/authStorage";
import type { ChatResponse } from "../src/api/types";

export const MOCK_CHAT_QUESTION = "backend engineer in Denmark";

export const MOCK_CHAT_RESPONSE: ChatResponse = {
  question: MOCK_CHAT_QUESTION,
  answer:
    "Here are **backend** roles in Denmark:\n\n- [Senior Backend Developer](https://thehub.io/jobs/job-1) at Acme",
  generated: true,
  sources: [
    {
      score: 0.91,
      job_id: "job-1",
      job_url: "https://thehub.io/jobs/job-1",
      job_role: "Backend Developer",
      job_title: "Senior Backend Developer",
      company: "Acme",
      country: "Denmark",
      location: "Copenhagen",
      document_text: "Job details…",
    },
  ],
};

export function createGate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

export async function seedApiKey(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    sessionStorage.setItem(key, "e2e-test-key");
  }, API_KEY_STORAGE_KEY);
}

export async function mockChat(
  page: Page,
  options?: { holdUntil?: Promise<void> },
): Promise<void> {
  await page.route("**/api/chat", async (route: Route) => {
    if (options?.holdUntil) {
      await options.holdUntil;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: MOCK_CHAT_RESPONSE,
    });
  });
}

export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("heading", { name: "töökratt" }).waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].map((img) => {
        if (img.complete) {
          return Promise.resolve();
        }
        return new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        });
      }),
    );
  });
}

export async function submitQuestion(page: Page, question: string): Promise<void> {
  await page.getByLabel(/ask a question about jobs/i).fill(question);
  await page.getByRole("button", { name: /^ask$/i }).click();
}

export function sourceListLocator(page: Page, heading: "Sources" | "Retrieved sources") {
  return page.getByText(heading, { exact: true }).locator("xpath=..");
}
