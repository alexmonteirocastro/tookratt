import { expect, test } from "@playwright/test";
import {
  MOCK_CHAT_QUESTION,
  MOCK_CHAT_RESPONSE,
  createGate,
  mockChat,
  openApp,
  seedApiKey,
  submitQuestion,
} from "./helpers";

test("chat flow shows loading, markdown answer, and sources", { tag: "@smoke" }, async ({
  page,
}) => {
  const gate = createGate();
  await seedApiKey(page);
  await mockChat(page, { holdUntil: gate.promise });
  await openApp(page);

  await expect(page.getByRole("dialog")).toHaveCount(0);

  await submitQuestion(page, MOCK_CHAT_QUESTION);

  const loading = page.getByRole("status");
  await expect(loading).toBeVisible();
  await expect(loading).toContainText(/searching jobs/i);

  gate.release();

  const answer = page.getByRole("article", { name: "Assistant reply" });
  await expect(answer.getByRole("strong")).toHaveText("backend");
  const jobLinks = answer.getByRole("link", { name: "Senior Backend Developer" });
  await expect(jobLinks).toHaveCount(2);
  await expect(jobLinks.first()).toHaveAttribute("href", "https://thehub.io/jobs/job-1");
  await expect(page.getByText("Sources", { exact: true })).toBeVisible();
  await expect(loading).toHaveCount(0);
});

test("multi-turn follow-up sends session_id and keeps the scoped sources", { tag: "@smoke" }, async ({
  page,
}) => {
  const posts: Record<string, unknown>[] = [];
  await seedApiKey(page);
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push(body);
    const sessionId =
      typeof body.session_id === "string" ? body.session_id : MOCK_CHAT_RESPONSE.session_id;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        ...MOCK_CHAT_RESPONSE,
        question: body.question,
        session_id: sessionId,
        applied_country: "DK",
        applied_remote: null,
      },
    });
  });
  await openApp(page);

  await submitQuestion(page, MOCK_CHAT_QUESTION);
  const firstAnswer = page.getByRole("article", { name: "Assistant reply" });
  await expect(firstAnswer.getByRole("link", { name: "Senior Backend Developer" })).toHaveCount(2);

  await submitQuestion(page, "any others?");
  await expect(page.getByRole("article", { name: "Your message" })).toHaveCount(2);
  const followUpAnswer = page.getByRole("article", { name: "Assistant reply" }).nth(1);
  await expect(followUpAnswer.getByRole("link", { name: "Senior Backend Developer" })).toHaveCount(
    2,
  );

  expect(posts).toHaveLength(2);
  expect(posts[0]).toEqual({ question: MOCK_CHAT_QUESTION });
  expect(posts[0]).not.toHaveProperty("session_id");
  expect(posts[1]).toEqual({
    question: "any others?",
    session_id: MOCK_CHAT_RESPONSE.session_id,
  });
});

test("new conversation and a page refresh both omit session_id on the next ask", { tag: "@smoke" }, async ({
  page,
}) => {
  const posts: Record<string, unknown>[] = [];
  await seedApiKey(page);
  await page.route("**/api/chat", async (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    posts.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      json: {
        ...MOCK_CHAT_RESPONSE,
        question: body.question,
        session_id: MOCK_CHAT_RESPONSE.session_id,
      },
    });
  });
  await openApp(page);

  await submitQuestion(page, MOCK_CHAT_QUESTION);
  await expect(page.getByRole("article", { name: "Assistant reply" })).toBeVisible();

  await page.getByRole("button", { name: /new conversation/i }).click();
  await expect(page.getByText(/ask about nordic and european startup jobs/i)).toBeVisible();

  await submitQuestion(page, "frontend roles in Sweden");
  await expect(page.getByRole("article", { name: "Your message" })).toHaveText(
    "frontend roles in Sweden",
  );

  await page.reload();
  await page.getByRole("heading", { name: "töökratt" }).waitFor();
  await expect(page.getByLabel(/ask a question about jobs/i)).toBeVisible();
  await submitQuestion(page, "after refresh");
  await expect(page.getByRole("article", { name: "Your message" })).toHaveText("after refresh");

  expect(posts).toHaveLength(3);
  expect(posts[0]).not.toHaveProperty("session_id");
  expect(posts[1]).toEqual({ question: "frontend roles in Sweden" });
  expect(posts[1]).not.toHaveProperty("session_id");
  expect(posts[2]).toEqual({ question: "after refresh" });
  expect(posts[2]).not.toHaveProperty("session_id");
});
