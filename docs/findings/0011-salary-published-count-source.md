# ALE-225 Findings: roles that publish a salary

* **Ticket:** [ALE-225](https://linear.app/alex-projects/issue/ALE-225/count-roles-that-publish-a-salary-range-or-figure-per-country-for-the)
* **Related:** [findings 0010](0010-jobs-stats-remote-facet-not-country-scoped.md), [ALE-223](https://linear.app/alex-projects/issue/ALE-223/fix-remote-job-counts-so-they-follow-the-country), `GET /jobs/stats`
* **Date:** 2026-09-28
* **Status:** Confirmed. The count is `salary_published_jobs` on `/jobs/stats`, from the indexed `Salary Type`.

## Summary

**The Hub listing cannot count published pay.** `suggestions` has no salary facet, and each `docs[]` item omits `salary`. The field lives on `GET /api/jobs/single/{id}`. `suggestions.paid` still means paid versus unpaid, and a "competitive" listing counts as paid. Leave `paid_jobs` and `unpaid_jobs` as they are.

Checked live against `https://thehub.io` on 2026-09-28. No auth header.

| countryCode | total | suggestion keys | `docs[0]` has `salary` |
|---|---|---|---|
| DK | 380 | jobPositionTypes, jobRoles, paid, remote | no |
| IS | 1 | same four | no |
| EU | 339 | same four | no |
| SE | 287 | same four | no |

`?salary=range`, `?salary=competitive`, `?salary=fixed`, `?salaryType=range`, and `?salary=unpaid` all left Denmark's `total` at 380. They are not filters.

## Values of `salary`

The job form in `/_nuxt/435c65e.js` offers five values:

| `salary` | Form label | Where the figure is |
|---|---|---|
| `competitive` | Competitive | nowhere |
| `unpaid` | Unpaid | nowhere |
| `range` | Annual salary range | `salaryRange.min` / `max` |
| `monthly_range` | Monthly salary range | `monthlySalaryRange.min` / `max` (sometimes also `salaryRange`) |
| `hourly_rate` | Hourly salary range | `hourlyRateRange.min` / `max` |

A blank `salary` publishes nothing. Sampled single-job payloads on the same day also included one free-text figure outside the form enum: `50000 - 70000 DKK/Monthly`, with `salaryRange` at 0/0. The string itself is the figure. The form list above is the closed set the Hub offers, and any other non-blank value is treated as a published figure.

`range`, `monthly_range`, and `hourly_rate` count as publishing pay. `competitive`, `unpaid`, and blank do not.

## Why the count is the index

Counting from single-job fetches on the `/jobs/stats` request would walk every listing. Denmark alone is 26 pages, and a pass over the six country listings is about 1,300 unique jobs. Eight concurrent fetches started returning HTTP 429 after a few hundred. The app reads `/jobs/stats` live, and the marketing snapshot reads it six times per build. That walk does not belong on the request.

Qdrant already stores the raw `salary` string as `Salary Type`. `/jobs/stats` only counts points in the requested country whose `Salary Type` is not `competitive`, `unpaid`, blank, or missing. The keyword index is created by seed and sync, not by that read, so a read-only API key can still return the count. The country filter is the same one search uses, including `MatchExcept` for `EU`. The count can lag `total_jobs` until the next ingestion. When the tile shows it, the band says the number comes from the indexed listings and can lag the open-roles total. The band's "Updated" date is when the snapshot was read, not when the index was written.

The payload does not store `salaryRange` / `monthlySalaryRange` / `hourlyRateRange`, so the count trusts the type. A `range` whose bounds are both zero would still count. The free-text example above is the case that has to count anyway, because the figure is the string.

If Qdrant cannot be read, `/jobs/stats` still returns the Hub totals and omits `salary_published_jobs`. The marketing tile then shows `paid_jobs` as **Paid roles**. When the field is present, the tile says **Roles that publish pay**.
