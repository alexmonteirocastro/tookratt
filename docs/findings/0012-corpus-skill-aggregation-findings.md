# ALE-190 Findings: corpus-level skill aggregation

* **Ticket:** [ALE-190](https://linear.app/alex-projects/issue/ALE-190/spike-evaluate-corpus-level-skill-aggregation-approach-tier-3-in)
* **Related:** [PRODUCT_VISION](../PRODUCT_VISION.md) tier 3, [findings 0001](0001-keyword-tech-stack-retrieval-gap-findings.md), [ADR-0015](../adr/0015-observability-logging-and-alerting.md), [ADR-0019](../adr/0019-accounts-and-access-control-on-supabase-auth.md) Decision 5, [ALE-188](https://linear.app/alex-projects/issue/ALE-188/spike-quantify-filter-extraction-miss-rate-for-job-rolecompanyjob), [ALE-199](https://linear.app/alex-projects/issue/ALE-199/spike-discover-freecodecamp-catalog-access-video-coverage-and-skill), [ALE-256](https://linear.app/alex-projects/issue/ALE-256/start-daily-skill-count-snapshots-before-a-trend-can-be-shown)
* **Date:** 2026-09-29
* **Status:** Spike complete for extraction, counts, the trend design, and the day-2 date compare (2026-09-30).

## Summary

**A curated dictionary, counted in code at sync, can answer “what is in demand right now.” It cannot yet answer “what is rising.”** Start a daily snapshot as its own ticket before the dictionary is finished. History of skill counts cannot be backfilled.

Checked read-only on 2026-09-29 against the live Qdrant collection (1,310 points) and `https://thehub.io` with no auth header. The probe is `scripts/analyze_skill_aggregation.py`. Listing text stayed under `tmp/ale190/` (gitignored). Gemini calls used temperature 0 and `gemini-3.8-flash`. The project default `gemini-2.5-flash` returned HTTP 404 (“no longer available to new users”). `llm_client/settings.py` still defaults to that name unless `GEMINI_MODEL` is set. This spike did not check the Render env, and it did not check whether `/chat` still answers on a grandfathered key. That check should not wait on this write-up. Raw model output is cached under `tmp/ale190/llm_cache/`.

The headline count is document frequency: jobs whose text mentions the skill, with the slice size next to it. Both numbers come from Qdrant. A passing mention is not the same claim as a requirement. On the non-gold corpus (1,286 postings), Python is a requirement-window or repeated hit on 61 postings and a single passing mention on 102. Report the mention count, and say how many of those look like requirements. Do not let the model invent either number.

## 1. What skills look like

`job_role` is `N/A` on 1,210 of 1,310 indexed points. That is the scraper, not the Hub. `scrape_job_offer_by_id` reads `jobRole` and stores `"N/A"` when the key is missing. The listing facet is still a role breakdown. On 2026-09-29, Denmark `suggestions.jobRoles` had 24 non-zero keys, including `frontenddeveloper` 10, `engineer` 77, and `sales` 95.

A current Denmark listing (`6a845c504e28ffd17c6419c4`) has no `jobRole`. It has `jobRoles`, an array of ids. Of the 15 jobs on Denmark page 1, 14 had only that array. One (`6a9aada5…`, Student Python Developer) still had both: `jobRole` `"backenddeveloper"` and `jobRoles` `["69b0f2e6b33a4d0fe9e5b0ec"]`. An older design listing (`681aa98bd6c53613bf8b4a8a`) still returns `jobRole` `"design"` and no `jobRoles`. The catalogue routes tried (`/api/jobRoles`, `/api/v2/jobRoles`, `/api/job-roles`, `/api/roles`, `/api/v2/roles`) returned 404, so those ids are not mapped to the slug vocabulary yet.

The populated payload values (`sales` 27, `other` 20, `engineer` 12, and a handful of others) are the listings whose response still includes the old string. “For a frontend engineer” cannot be a filter on today’s payload. The role group should start from the Hub’s own classification once the scraper keeps `jobRoles` and the ids resolve, with the title as the fallback when neither field is present. Titles were the sampling key in this spike because the payload is empty. Fixing the scraper is its own bug.

A skill, for the labels below, is a named tool, technology, method, or durable competence the posting asks the person to bring. The job title, the city, the seniority, and a vague trait (“communication”, “drive”, “team player”) do not count. Language does count when the posting requires it (Swedish, Danish, German), because an expat question is about that.

Frontend postings name tools in a list: React, TypeScript, Angular, Playwright. Design, marketing, and sales name phrases: product design, user research, cold calling, field marketing, sales enablement. One Danish listing is three internships in one text (marketing, design, and frontend), so a single point can belong to more than one skill story. Non-English wording showed up inside this sample (Swedish, Danish). That is an extraction problem of aliases and phrasing. It is not the translation spike (ALE-129).

## 2. Extraction

### Labels

The rubric above was written first. Twenty-four postings were labeled before either extractor ran: six frontend, six design, six marketing, six sales, chosen with seed 190 from title (because `job_role` is empty) after dropping a second country copy of the same All Gravy text. Those 24 ids were held out of n-gram mining, the curator, and the Go/R/Spark/Swift rules. Labels were not edited after the scores.

| Group | Posting | Skills labeled |
|---|---|---|
| frontend | Senior Front-End Engineer, Performativ | React, TypeScript, Next.js, TanStack Query, Playwright, Testing Library; mentions Vitest, Jest, Radix, shadcn/ui, AG Grid, accessibility |
| frontend | Senior Frontend Engineer, Six Robotics | React, TypeScript; mentions GIS, Electron, CI/CD |
| frontend | Front-end Engineer, DBtune | React, TypeScript, Vitest, Playwright; mention accessibility |
| frontend | Senior Frontend Engineer, Relesys | TypeScript, React, Angular; mentions AngularJS, accessibility, design systems |
| frontend | Frontend Software Engineer, Waitwhile | TypeScript, Angular; mentions React, Vue, JavaScript, Nx, RxJS |
| frontend | Frontend Engineer, Planima | JavaScript, TypeScript, React; mentions Ruby, HTML, CSS, Cursor, Claude Code |
| design | Senior Product Designer, All Gravy | product design, user research, design systems, prototyping |
| design | AI Creative Director, Superside | Figma, Adobe Creative Suite, generative AI |
| design | Lead Service Designer, Volumental | service design, service blueprints, field research; mention AI agents |
| design | DX Designer, Verda | UX design, API design, Kubernetes; mention CLI design |
| design | Product Designer, Flatpay | Figma, UI design, user research; mention prototyping |
| design | Staff/Lead Product Designer, ICEYE | Figma, design systems, React, CSS; mentions accessibility, design tokens |
| marketing | Bolig Boost intern, Digital Partners | Google Ads, SEO, Figma, Adobe, HTML, CSS, JavaScript, social media; mention Umbraco |
| marketing | Marketing Intern, Carla | social media, copywriting, CRM, Instagram, TikTok, LinkedIn, influencer marketing; mentions Adobe, Canva, CapCut, Premiere Pro, Figma, SEO |
| marketing | Head of Marketing & Communications, RoyalHacks | content strategy, SEO, LinkedIn; mentions Instagram, email marketing |
| marketing | Product Marketing Manager, Tandem Health | product marketing, sales enablement, competitive intelligence, positioning |
| marketing | Brand Ambassador, Rebl Eats | Swedish; mentions TikTok, Instagram, event management |
| marketing | Field Marketing Manager, ICEYE | field marketing, event management, B2B marketing |
| sales | SDR DACH, Tandem Health | cold calling, Attio, German; mentions HubSpot, Salesforce |
| sales | SDR, Integrator | cold calling, LinkedIn, Danish; mentions HubSpot, Lemlist, Sales Navigator |
| sales | Account Manager, No Isolation | enterprise sales, HubSpot; mentions MEDDPICC, SPIN selling, Challenger sale |
| sales | Senior Enterprise AE, Smartly | enterprise sales, consultative selling; mention digital advertising |
| sales | Mødebooker, WebrinQ | cold calling, Danish, CRM |
| sales | Account Executive, Flowbox | Swedish, cold calling, B2B sales; mention HubSpot |

132 labeled skills in total.

### Seed dictionary

The seed is the stack list in `scripts/analyze_e5_truncation_signal_positions.py`: Python, React, Kubernetes, Terraform, Django, FastAPI, Golang, Go. Role words in that file are not skills.

Scored on the 24 labels, micro-averaged inside the whole gold set and then by group:

| | Precision | Recall | tp | fp | fn |
|---|---|---|---|---|---|
| All 24 | 1.000 | 0.061 | 8 | 0 | 124 |
| frontend | 1.000 | 0.140 | 6 | 0 | 37 |
| design | 1.000 | 0.080 | 2 | 0 | 23 |
| marketing | 0 | 0 | 0 | 0 | 38 |
| sales | 0 | 0 | 0 | 0 | 26 |

Precision is perfect because the seed almost never fires on these postings. Recall is the frontend tools the seed happens to contain (React, and Kubernetes on the DX designer). Marketing and sales are invisible to it.

### Ambiguity rules, written from the other 1,286 postings

* **Go.** A capitalized `Go` still matches “Go deep” in a values block copied across many ICEYE listings, and “Too Good To Go”. Before the rule, Go hit 234 of 1,286 postings. After rejecting a following deep/to/through/beyond/live/ahead/back/out/on/for/into/home, and the “Good To Go” name, it hit 58. 21 of those 58 look like a requirement or a repeat; 37 are a single mention.
* **R.** A bare `R` matches `R2`, dotted acronyms, and ordinary initials. The rule counts `R` only next to “R language”, “RStudio”, or “tidyverse”. Bare R is not a skill.
* **Spark.** Count it next to Apache, Databricks, Flink, or PySpark. Do not count TikTok Spark Ads.
* **Swift.** Count it next to SwiftUI, iOS, Kotlin, UIKit, or Xcode. Do not count SEPA/Swift payments.

### ESCO

ESCO may be reused free of charge under Commission Decision 2011/833/EU, with the acknowledgement “This publication uses the ESCO classification of the European Commission.” The skills-pillar copyright note also points at CC BY 4.0 for Commission content on europa.eu. Any adapted list has to be marked as adapted.

It is a poor seed for this corpus. On the public search API (`type=skill`, language `en`) on 2026-09-29: TypeScript is an ESCO skill. “React” returns “react to emergency situations”, not the library. Figma, Kubernetes, and HubSpot returned no skill hits. “Next.js” returned unrelated phrases. “Cold calling” landed on telemarketing. Use ESCO for generic competences and for the acknowledgement path. Do not expect it to name the tools these listings use.

### Curator and the maintenance loop

Ordinary n-grams of the non-gold text are English (“across”, “build”, “strong”). Capitalized tokens are still mostly sentence starts (“Please”, “Strong”) plus real names (“AI” on 632 postings, “TypeScript” on 100, “AWS” on 121, “SQL” on 79, “HubSpot” on 73). Acronyms and camelCase are the useful cut: they surface TypeScript and miss Figma, because Figma is sentence case. The maintenance report has to include sentence-case names, or the design tools never get proposed.

An offline curator (`gemini-3.8-flash`, temperature 0) labeled the top 60 acronym/camelCase tokens. It correctly dropped company and place tokens (ICEYE, SUPO, UK, EU, DACH). It wrongly called `CV` “computer vision”; in these postings CV is a résumé. It split CI/CD into two skills and treated `DR` as disaster recovery. A human accepts or rejects that diff in a PR. The model does not write the dictionary. Nothing here calls a model at query time.

A human-accepted extension of the seed, taken from those tokens and not by adding gold-only misses (TypeScript, SQL, AWS, HubSpot, Node.js, PostgreSQL, GCP, GitHub, BigQuery, LinkedIn, CRM, API, GDPR, LLM, machine learning, DevOps, UX), scores below. Whoever accepted the list had already seen the gold labels, so the acceptance was not blind.

| | Precision | Recall |
|---|---|---|
| All 24 | 0.511 | 0.174 |
| frontend | 0.545 | 0.279 |
| design | 0.286 | 0.080 |
| marketing | 0.500 | 0.079 |
| sales | 0.600 | 0.231 |

Recall moves a little. Marketing phrases and Figma stay missed. Precision falls because short tokens (`UX`, `API`, `CRM`, `SQL`) match in passing. A longer list is not a substitute for phrases and for the ambiguity rules.

### LLM extraction on 100 postings

One hundred postings, including the 24 labels, were extracted in batches of eight. Same model, temperature 0. Against the labels:

| | Precision | Recall |
|---|---|---|
| All 24 | 0.380 | 0.803 |
| frontend | 0.488 | 0.953 |
| design | 0.273 | 0.720 |
| marketing | 0.338 | 0.605 |
| sales | 0.393 | 0.923 |

All 24 labeled postings disagreed with the seed dictionary, so the hand check covered every labeled disagreement rather than a sample of 30 drawn from a larger differing set. Three patterns:

* The model recalls the tools. It also emits phrases the rubric excludes: communication, mentoring, English, stakeholder management, leadership.
* Strict string match punishes aliases. “Generative AI” versus “generative AI tools”, “Sales Navigator” versus “LinkedIn Sales Navigator”, “prototyping” versus “rapid prototyping”.
* The model also misses. Kubernetes is a labeled requirement on the DX Designer posting and was not in that extraction.

Those precision numbers are a lower bound. The extraction prompt did not include the labeling rubric, so phrases the rubric excludes were scored as false positives. Scoring is a casefold string match, so an alias is both a false positive and a false negative.

That is why the LLM is a judge and a curator, not the counter. When the dictionary and the model agree, they can still both be wrong; the labels are what catch that. When they disagree, the model is the noisier list.

### NER

No NER model was run. Frontend skills are names a dictionary can hold. The miss on design, marketing, and sales is missing phrases, not a failure to spot a token boundary. A phrase dictionary maintained by the curator loop covers that. A named-entity model would still need the same inventory, and it would not fix CV-versus-computer-vision by itself.

## 3. Where the counts live

`facet` on this cluster accepts `exact=True` and `limit=50`. On `Country` (already a keyword index), exact and approximate returned the same 23 values, and the exact counts sum to 1,310. The default `limit` of 10 hides 13 countries. Approximate happened to match exact on a collection this small. The trust bar still wants `exact=True`, because the default is an approximation and this spike did not find a case where the approximation was wrong. It also did not prove the approximation is always right.

`facet` on `job_role` with `exact=True` returns HTTP 400: “No appropriate index for faceting.” A filtered count needs a keyword index. Index an ingestion-time `role_group` plus a `skills` array. Fill `role_group` from the Hub classification when `jobRoles` resolves, and from the title when it does not. Today’s `job_role` payload is the wrong field to index: it is unindexed, and it is `N/A` wherever the scraper missed `jobRoles`.

Use the facet, or an equivalent exact count, inside the sync job to build the number. Serve the stored number from an endpoint with the same caching shape as `GET /jobs/stats`: fresh until the next ingestion, country in the query, the count and the slice size in the body. Both of those integers come from Qdrant. `/jobs/stats` today mixes the Hub’s live total with a Qdrant salary count, and findings 0010 records that those drift. A skills response should not do that.

Do not count by asking a model to read a wide retrieval window. The 100-posting extraction already added skills the rubric rejects and dropped a named requirement. A top-k window cannot see 1,310 listings. The model narrates a count it was given.

## 4. Refresh

Piggyback on `sync_qdrant_db`. The collection is already reconciled daily. The skill array is written on the same upsert. A dictionary change bumps `skills_version` on the payload and backfills open points, which still have their text. Old snapshot rows keep the version they were counted with. A skill added in version 2 trends from the day version 2 is deployed. It does not get a rewritten history. Closed listings are not backfilled: the tombstone has no text.

## 5. Time

### What The Hub sends

Listing `docs[0]` on `/api/v2/jobs`, for DK, SE, NO, FI, IS, and EU, has no date-like field. Keys seen: `id`, `key`, `title`, `location`, `isRemote`, `jobPositionTypes`, `isFeatured`, `views`, `company`, `saved`.

`GET /api/jobs/single/{id}` does. On 19 jobs taken from page 1 of each country, with no sort parameter (4 from DK, SE, NO, FI; 2 from IS and EU; IS had a single listing on that page):

| Field | Present | What it did on this day |
|---|---|---|
| `createdAt` | 19/19 | ISO timestamp. Earliest step. |
| `approvedAt` | 19/19 | Often the same moment as `publishedAt`, sometimes a day later. |
| `publishedAt` | 16/19 | Missing on 3 Norway listings. When present, age from 4 days to 140 days (median 16) as of 2026-09-29. On several Sweden listings it equals `approvedAt` and is weeks after `createdAt`. |
| `pumpedAt` | 5/19 | Later than `publishedAt`, and several values are `03:05:00Z`. That is a renew/bump clock, not a publish time. |
| `expirationDate` | 19/19 | A date, often months out (`2027-03-29` appears more than once). |

`publishedAt` is the only candidate for “when this listing was published,” and it is missing on some jobs and tied to approval on others. `pumpedAt` moves when the employer bumps the listing. A trend built on `pumpedAt` would treat a renewal as a new listing.

The median age of 16 days describes this page-1 set, not the corpus. Denmark page 1 that evening was 15 cards, 5 of them featured. A job on the last Denmark page (page 27 of 27) had `publishedAt` on 2026-09-29, so page order is not an age ranking. If featured cards are over-represented on page 1, this median leans young.

### Day-2 stability (2026-09-30)

The 19 ids in `tmp/ale190/dates-2026-09-29.json` were fetched again on 2026-09-30 with `GET /api/jobs/single/{id}`. Today’s date-like fields are in `tmp/ale190/dates-2026-09-30.json`. All 19 responses were HTTP 200. No listing closed or moved. This is 19 page-1 jobs over one day.

| Field | Unchanged | Jobs that have it |
|---|---|---|
| `createdAt` | 19 | 19 |
| `approvedAt` | 19 | 19 |
| `publishedAt` | 16 | 16. Still missing on the same 3 Norway listings. |
| `pumpedAt` | 5 | 5. Still absent on the other 14. |
| `expirationDate` | 13 | 19 |

`publishedAt` did not move. `pumpedAt` did not move on the 5 jobs that have it, and it did not appear on the other 14. This window has no bump.

The only field that moved is `expirationDate`, and only where the day-1 value was `2027-03-29`. Each of those six is now `2027-03-30`:

| Country | Job | 2026-09-29 | 2026-09-30 |
|---|---|---|---|
| SE | `6a84f2d13fa22e5cfd593edf` | `2027-03-29` | `2027-03-30` |
| NO | `6a728411650cb842b85b505e` | `2027-03-29` | `2027-03-30` |
| NO | `6a7bb9536cd84825d6ab518f` | `2027-03-29` | `2027-03-30` |
| NO | `6a767345ca7c9e16fa8771b7` | `2027-03-29` | `2027-03-30` |
| IS | `6ab074668b9ad34a03baa559` | `2027-03-29` | `2027-03-30` |
| EU | `69fe7a04e71953e82dea3674` | `2027-03-29` | `2027-03-30` |

`2027-03-29` is six months after 2026-09-29, and `2027-03-30` is six months after 2026-09-30. The other 13 expiration dates stayed put, including `2027-03-15`, `2027-03-21`, and `2027-03-22`. Company `createdAt`, company `approvedAt`, and `activeCommunityProgramDeadline` were unchanged on every job.

For these six the value looks computed at request time (fetch date + 6 months), not stored. `expirationDate` is not a reliable closing date and must not feed `closed_at` or listing-lifetime estimates.

### Decision

Use `publishedAt` for “new listings in this period” where it is present. It was unchanged on all 16 jobs that carry it (16 of 19 in this sample). One day is a short window. Keep collecting snapshots either way.

No bump happened in this window, so this does not show that a bump leaves `publishedAt` alone. Revisit trigger: the first time snapshots or sync logs show a `pumpedAt` change, check `publishedAt` on that job.

### Survivorship, from the sync logs

One pass over open listings shows how old the jobs in this page-1 set are (median published age 16 days among the 16 that have `publishedAt`). It does not show how long a listing stays open, and it does not show the age of the corpus.

`New jobs to add` and `Stale jobs to remove` are `print`s. They are in GitHub Actions logs only. Loki does not have them. Thirty-five consecutive successful scheduled runs, 2026-08-26 through 2026-09-29:

* Live corpus moved between 1,160 and 1,313.
* New jobs: min 6, median 37, max 80, mean 36.4.
* Stale jobs removed: min 12, median 33, max 55, mean 32.6.
* No failed or skipped run in this window, so no day here is two days piled together. The longest gap was about 30 hours of cron drift. The rule still stands for later gaps: mark or drop a day that follows a missed run.
* The lines are totals for every country together. Per-country and per-role churn is not in the logs. A per-slice honesty threshold still needs the new snapshots.
* The series stops at this pull (35 days), not at the 90-day log retention, and not at the first day the cron existed. Skill counts are not in it. Turnover totals for these 35 days are recoverable. Skill history is not.

About 33 listings leave and about 36 arrive each day, on a corpus of roughly 1,300. That is the noise floor of the whole corpus. It is not a threshold for a smaller slice.

### Snapshots

Start capture as its own ticket, before the rest of the dictionary work. That ticket is [ALE-256](https://linear.app/alex-projects/issue/ALE-256/start-daily-skill-count-snapshots-before-a-trend-can-be-shown). Every day without a row is a day that cannot be rebuilt.

Row: date, country, role group, skill, job count, slice total, `skills_version`. Weekly buckets for anything shown to a person. Daily rows are the store.

Also store, on each open point: `first_seen_at`, `last_seen_at`, `closed_at` (null while open), the extracted skills, and `skills_version`. `first_seen_at` is our publish proxy when `publishedAt` is missing. On close, write a tombstone (id, country, role group, skills, `skills_version`, `first_seen_at`, `closed_at`) and delete the point, which is what sync does today. Do not keep the closed listing text.

[The Hub terms](https://thehub.io/terms) (last updated 08.08.2024) allow viewing and printing for personal, non-commercial use, and say the contents may not otherwise be copied, saved, or reproduced without prior written consent. Closed text is also unnecessary on size: a year of closures at ~33 a day and ~5 KB of text is on the order of 60 MB. The terms are the reason to drop it. The same sentence covers the open listing text already stored as `document_text`. This spike does not treat that current ingestion as cleared. Storing Hub listing text is an open risk for the ADR. [ALE-198](https://linear.app/alex-projects/issue/ALE-198/spike-discover-justjoinit-data-access-tos-corpus-size-and-schema) asks the same question for justjoin.it.

The tombstone stores the skill names and the `skills_version` in use when the listing closed. A later dictionary has nothing to re-extract from, so a closed listing stays counted with that version. That is the cost of dropping the text. It also cannot invent the days before capture starts.

Keeping closed points in the live collection would force an open-only filter onto every current read. The product paths are `query_jobs_in_qdrant` (`/chat` and search in `api/main.py`, plus the evals and the CLI), `count_salary_published_jobs` (`/jobs/stats`), and `get_indexed_job_ids` (sync would delete the closed points again unless the diff learned about them). The backfill scrolls in `db/backfill.py` would rewrite them too. A tombstone outside the live collection leaves those reads alone. That is the recommendation.

Where the rows live: a `public` table is the eventual store, and it is the moment ADR-0019 Decision 5 opens a SQL connection. Bet 012 needs that connection too. The full cross product is about 80 skills × 23 countries × 15 role groups, 27,600 rows a day, about 10 million rows a year. The 23 is the `Country` facet on this collection, not the six listing `countryCode` values. That is an upper bound. Empty cells are not worth storing, so a few thousand non-zero rows a day is about a million rows a year. Do not block the first snapshots on that connection. Until the table exists, write the same rows to a dedicated R2 bucket or prefix with no expiration lifecycle. GitHub Actions artifacts are deleted after 90 days, and objects in `tookratt-supabase-dumps` expire after 30. Either one would delete the history the snapshots exist to keep. If that bucket is not available on the first day, commit the files to the repo. Move them into Postgres when the first `public` table lands. A Qdrant collection is a poor fit for a daily table.

`snapshot_captured` is the line an absence rule can watch. It is not the first structured ingest event: `load_jobs_into_qdrant` already emits `injection_detected` through `log_injection_detected`, and `main.py` already calls `configure_logging()` (`LokiQueueHandler`). `injection_detected` only fires when a pattern matches, so an absence rule cannot watch it. The heartbeat is a separate `curl` in `ingest.yml` because that rule needs a line on every successful scheduled run. The heartbeat does not come from the sync script. A manual `workflow_dispatch` does not refresh the 36-hour window.

Sketch `snapshot_captured` as `log_snapshot_captured(row_count=…)` beside `log_injection_detected`, using `_emit_structured`. The client and the credentials are already on the ingest job. Do not point the 36-hour rule at it until two things are true. `LokiQueueHandler` listens on a background thread, and the only `listener.stop()` in the repo is `reset_logging_config_for_tests`. A record emitted at the end of the process is the one most likely to die on exit, which would look like a missed snapshot and page on a success. Stop the listener in `main()` before exit. Then one scheduled run has to show the line in Loki. Until that run exists, keep the absence rule on `schedule_heartbeat`. The workflow-step alternative (write the row count to `$GITHUB_OUTPUT`, `curl` it the way the heartbeat is curled) does not have the exit race, and it is the fallback if that run never shows the line.

### Honesty threshold, from the numbers above

* Show a current count when the slice has at least 30 open listings. Iceland-scale slices stay on “too few listings to call this demand.”
* Show a rise or fall only after 8 weekly snapshots, and only when the change in share is large next to that slice’s own week-to-week variation. Aggregate by week. The corpus-wide turnover above (about 33 listings leaving and 36 arriving each day, on about 1,300) is not that bar. A frontend slice of 40 listings cannot move by 30. Until per-slice snapshots exist, the variation is unknown, so this bar is provisional.
* Before that history exists, the answer is the current count and the date of the corpus, plus one sentence: a rise or fall needs about two months of snapshots, and those start when capture starts. Do not fill the gap with `publishedAt`.

## 6. How `/chat` would say it

Extend the ALE-188 structured-output call with a route: lookup, single-listing question, or aggregate. An aggregate question does not take its numbers from retrieval. It calls the stats endpoint and the prompt receives the counts, the slice size, the dictionary version, and the instruction to repeat those figures and to decline a trend when the history flag is false. Links to example listings can still come from ordinary retrieval. The examples are illustrations. They are not the denominator.

Persona-shaped questions and what the corpus can support today:

* A new graduate or a prospective student asking which skills show up for frontend work can be answered once `role_group` is tagged. If a `jobRoles` id maps to `frontenddeveloper`, that tag is the Hub’s. The title is the fallback when neither field is present. The tools are in the text.
* An expat asking about Sweden hits the country filter that already exists, and the dictionary has to keep language requirements (Swedish, in this gold set) or the answer hides a real bar.
* A pivoter asking what Swedish listings want for a move into design is the phrase problem. Product design, Figma, and user research are the labeled skills. The tech seed does not see them. The route is the same aggregate path. The dictionary is what has to grow.

No extra retrieval ranker is required for the count. The missing piece for “frontend engineer” is that ingestion drops `jobRoles`. Today’s `job_role` payload will not supply it. Titles are the fallback, not the only source.

## What the ADR should be asked to decide

The ADR is not written here. The evidence above asks it to decide four things: a versioned phrase-and-tool dictionary edited by PR, exact counts computed in the sync job, daily snapshots started immediately ([ALE-256](https://linear.app/alex-projects/issue/ALE-256/start-daily-skill-count-snapshots-before-a-trend-can-be-shown)), and closed listings recorded as tombstones without their text, knowing a tombstone cannot be re-extracted under a later dictionary. It also has to face the open risk that the terms clause used here already covers the open text stored today. The model narrates. It does not count.
