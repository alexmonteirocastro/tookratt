import { expect, test } from "@playwright/test";
import {
  MOCK_CHAT_QUESTION,
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
