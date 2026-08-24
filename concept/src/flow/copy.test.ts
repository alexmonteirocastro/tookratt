import { describe, expect, it } from "vitest";
import type { JobOpenings, JobSearchHit } from "../api/types";
import { insightsIntro, matchTurn, noMatchesTurn, profileReveal, whyThisFits } from "./copy";

const stats: JobOpenings = {
  total_jobs: 487,
  number_of_pages: 25,
  jobs_per_page: 20,
  remote_jobs: 142,
  paid_jobs: 451,
  unpaid_jobs: 36,
  jobs_per_role: { backend_developer: 47 },
};

const hit: JobSearchHit = {
  score: 0.91,
  job_id: "concept-job-1",
  job_url: "https://thehub.io/jobs/concept-job-1",
  job_title: "Founding Engineer",
  company: "Nordic Ledger",
  job_role: "full_stack_developer",
  country: "Denmark",
  location: "Copenhagen",
  remote: true,
  salary_type: "paid",
  salary: "Competitive",
  equity: "Yes",
};

describe("copy", () => {
  it("puts live-corpus totals in the insights intro and flags skills as illustrative", () => {
    const text = insightsIntro(stats);
    expect(text).toContain("**487 open roles**");
    expect(text).toContain("**142 remote**");
    expect(text).toContain("**451 paid**");
    expect(text).toMatch(/illustrative/i);
  });

  it("states the profile is not parsed from the file", () => {
    expect(profileReveal()).toMatch(/not parsed from the file/i);
    expect(profileReveal()).toContain("Python");
    expect(profileReveal()).toContain("Founding engineer");
  });

  it("explains empty live search instead of stalling", () => {
    expect(noMatchesTurn()).toMatch(/no live matches right now/i);
    expect(noMatchesTurn()).toMatch(/replay/i);
  });

  it("renders a match turn with percent, listing link, and canned why-bullets", () => {
    const bullets = whyThisFits(hit, 0);
    const text = matchTurn(hit, 94, bullets);
    expect(text).toContain("**94% match**");
    expect(text).toContain("[Founding Engineer](https://thehub.io/jobs/concept-job-1)");
    expect(text).toContain("Nordic Ledger");
    expect(text).toContain("Remote");
    expect(bullets).toHaveLength(3);
  });
});
