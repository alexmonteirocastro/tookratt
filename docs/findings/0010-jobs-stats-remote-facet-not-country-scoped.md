# ALE-211 Findings: Hub `suggestions.remote` ignores the country

* **Ticket:** [ALE-211](https://linear.app/alex-projects/issue/ALE-211/bug-jobsstats-remote-jobs-and-paid-jobs-not-scoped-to-country-likely)
* **Related:** [ALE-223](https://linear.app/alex-projects/issue/ALE-223/fix-remote-job-counts-so-they-follow-the-country) (the fix), `the_hub_client/utils.py` (`get_full_jobs_picture_by_country`), `GET /jobs/stats`
* **Date:** 2026-09-27
* **Status:** Confirmed. The data-source change is ALE-223, not this ticket.

## Summary

**`suggestions.remote` is not scoped to `countryCode`. `suggestions.paid` is.** `GET /jobs/stats` copies both straight off the listing response, so `remote_jobs` shows the same number for every country and `paid_jobs` does not.

Checked live against `https://thehub.io/api/v2/jobs` on 2026-09-27. No auth header. Counts only.

| countryCode | total | suggestions.remote | suggestions.paid |
|---|---|---|---|
| IS | 1 | 43 | 1 |
| DK | 381 | 43 | 337 |
| SE | 287 | 43 | 284 |
| NO | 98 | 43 | 96 |
| FI | 205 | 43 | 204 |
| EU | 339 | 43 | 338 |
| (none) | 43 | 43 | 42 |

Iceland is the report: one listing, and `suggestions.remote` is still 43. That listing's `isRemote` is `false`. The unfiltered listing's `total` is also 43, the same number the facet returns for every country.

`paid` moves with the country (Iceland 1 of 1, Denmark 337 of 381). `jobRoles` moves too (engineer is 76 in Denmark, 72 in Sweden, 99 in Finland). Only `remote` stays put. Do not change how `paid_jobs` is read. `unpaid_jobs` is `total - paid`, so it follows the country as long as `paid` does.

`suggestions.jobPositionTypes` also follows `countryCode`, checked the same day for all six codes. Internship (`5b8e46b3853f039706b6ea73`) and Student (`5b8e46b3853f039706b6ea72`) were DK 36 and 42, SE 7 and 12, NO 4 and 2, FI 1 and 1, IS 0 and 0, EU 6 and 0. [ALE-224](https://linear.app/alex-projects/issue/ALE-224/tookrattcom-market-band-swap-remote-for-internships-and-student-jobs) reads those two ids. A missing id inside the facet is a real zero. A missing `jobPositionTypes` object is logged, because that would zero every country at once.

`?remote=true` and `?isRemote=true` do not change `total` or the facet. Each item in `docs` does carry `isRemote`. Denmark's first page was 0 remote out of 15, while the facet still said 43.

## What a mapper test would miss

`tests/the_hub_client/test_utils.py` maps one fixture. A second fixture with a different `suggestions.remote` would still pass, because the function copies that field. The bug is the value Hub sends, not a dropped query parameter. The regression that catches it needs two countries that share one `suggestions.remote` and differ in `docs[].isRemote`. That test belongs with the fix.

## Fix, recorded on ALE-223

Count `isRemote` on the country-filtered listing, the same source as `total`. Denmark is 26 pages of 15, so `/jobs/stats` stops being one Hub request. Qdrant already stores `Remote`, but a Qdrant count would drift from the live `total_jobs` whenever ingestion lags. Stay on the listing.

The app reads `/jobs/stats` live. The marketing market card copies the same endpoint at build time, so the next marketing build picks up the corrected number.
