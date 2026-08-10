# ADR-0016: Marketing Site Topology and Waitlist/Contact Capture

* **Status:** Proposed
* **Date:** 2026-08-10
* **Related:** ALE-173 (landing-page parent), ALE-175 (this ADR), ALE-176 (landing Pages project), ALE-177 (capture Worker), ADR-0013 Decision 2 (revised here — single Pages project → apex marketing + `app.` chat), ADR-0004 Decision 1 (chat SPA deliberately single-view; multi-page routing named as a revisit trigger, not a current need), ADR-0005 (design tokens — accepted duplication cost across the two Pages projects)

## Context

ALE-173 (Bet 003 — build the Töökratt landing page from the Claude design handoff) surfaced two infrastructure questions before any implementation ticket could be scoped honestly: where the marketing site lives relative to the existing chat SPA, and how waitlist/contact form submissions are captured without inventing a persistence or product-API concern.

Both questions were resolved in ALE-173's pre-implementation rabbit-hole discussion. This ADR records those decisions so ALE-176 and ALE-177 can implement against a written decision rather than a Linear comment. Per project convention, revising ADR-0013 Decision 2 is done here as a follow-up ADR, not by silently rewriting Decision 2 in place — ADR-0013 carries a pointer; this file carries the decision.

## Decision 1: Landing page is its own Cloudflare Pages project on the apex; chat moves to `app.tookratt.com`

**Decision:** Ship the marketing landing page as a **separate** Cloudflare Pages project bound to the apex domain `tookratt.com` (+ `www`). Move the existing chat app's custom domain from the apex to the subdomain `app.tookratt.com`. No new domain purchase — a subdomain of the already-owned domain.

**Rationale:**

- ADR-0004 Decision 1 deliberately scoped the chat SPA to a single view; multi-page routing was named there as an explicit revisit trigger, not a current need. Folding a marketing site into `frontend/` would reopen that decision for a use case it was never meant to cover.
- A second static Pages project keeps marketing out of the chat Vite app's routing entirely, at the cost of a second deploy target — acceptable, and consistent with ADR-0013's "Cloudflare Pages is the clear pick for static frontends" finding applied twice rather than once.
- Apex for marketing / `app.` for the product is the conventional split; both share the same already-owned domain and the same free Cloudflare custom-domain + HTTPS surface.

**Accepted cost:** design-token duplication across the two Pages projects (already flagged in Bet 003's shape doc; ADR-0005 tokens live in the chat app and are not automatically shared).

**Cross-reference:** This revises ADR-0013 Decision 2, which scoped frontend hosting as a single Cloudflare Pages project. See the follow-up note on ADR-0013.

## Decision 2: Waitlist/contact capture is a Cloudflare Worker with Email Routing `send_email` — no persistence

**Decision:** A Cloudflare Worker receives waitlist/contact form submissions from the landing page and relays them to `hello@tookratt.com` via Cloudflare Email Routing's `send_email` binding. **No KV, no D1, no other persistence layer** — by design, not as deferred work. Kept to the smallest thing that works; Email Routing is already live (Bet 001).

**Rationale:**

- Reuses infra already in place rather than adding a new third-party form product or a new storage surface.
- Marketing capture is not a product-API concern; keeping it out of FastAPI avoids mixing waitlist/contact into the chat/jobs surface.

## Alternatives considered and rejected (for now)

- **Fold the landing page into the existing `frontend/` Vite SPA** (routing / multi-page) — rejected: would reopen ADR-0004 Decision 1 without the revisit condition that decision named (a second *product* view such as stats or human-eval tooling). Marketing is a different concern and a different deploy cadence.
- **Buy a separate marketing domain** — rejected: unnecessary cost; a subdomain of the already-owned domain is enough.
- **Formspree (or similar SaaS form backend)** — rejected: new third-party dependency for something already doable $0 in-stack via Email Routing.
- **Extend FastAPI with `/waitlist` / `/contact`** — rejected: mixes a marketing concern into the product API, explicitly named as a cost in Bet 003's shape doc.
- **Persist submissions in KV or D1 "just in case"** — rejected: no current need for stored submissions or analytics; adds a data surface to operate without a demonstrated requirement. See Revisit triggers.

## Consequences

**Positive:**

- Marketing and product stay independently deployable; ADR-0004's single-view chat SPA is left intact.
- Capture path reuses Email Routing already in place — no new vendor, no new storage.
- Apex / `app.` topology is conventional and does not require a second domain purchase.

**Negative / accepted risks:**

- Design-token duplication between the two Pages projects (Decision 1).
- No stored waitlist/contact submissions — if an email is missed or `hello@` is unreachable, the submission is gone. Accepted at current volume; see Revisit triggers.
- Two Cloudflare Pages projects and one Worker to configure and keep healthy instead of one Pages project — small operational surface growth, still within the free tier.

## Revisit triggers

- If landing-page traffic or waitlist volume ever justifies wanting stored submissions, analytics, or replay, revisit Decision 2's no-persistence choice then — not preemptively.
- If the marketing site and chat app ever need to share a single deployable (e.g. shared auth, deep-linked product entry from marketing under one origin), revisit Decision 1 and ADR-0004 Decision 1 together.
- If Email Routing or the `send_email` binding proves unreliable in practice, revisit Formspree or a thin FastAPI endpoint — preferring evidence of failure over preemptively adding a third party.

## Out of scope

* Any implementation: Pages project setup, DNS moves, Worker code, form UI — that is ALE-176 and ALE-177.
* Landing-page content, copy, or design-token sharing strategy beyond naming the duplication cost.
* Changing ADR-0004 Decision 1 itself — this ADR deliberately avoids that revisit.
