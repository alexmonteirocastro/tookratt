# ADR-0017: Frontend E2E and Visual Regression Testing — Playwright over Cypress

* **Status:** Accepted
* **Date:** 2026-07-16
* **Related:** ALE-153 (this ADR), ALE-154 (implementation), ADR-0004 (frontend architecture for the chat interface), ADR-0005 (visual design tokens for the chat UI), ADR-0013 (deployment strategy — $0/month constraint), existing Vitest + React Testing Library component-test layer (`frontend/src/**/*.test.tsx`, `frontend-test` CI job)

## Context

The frontend has component-level test coverage (Vitest + React Testing Library: `App.test.tsx`, `SourceList.test.tsx`, `client.test.ts`) but nothing exercises the app end-to-end in a real browser, and there is no visual regression coverage at all — a UI regression (broken layout, a CSS token misapplied, a design-token change breaking spacing) would currently only be caught by manual eyeballing. This is a real gap given ADR-0005 explicitly formalized a design-token system worth protecting, and given the chat flow (input → API call → rendered markdown answer → sources list → auth modal) is the entire product surface.

Two realistic options: Playwright and Cypress. Both are mature, well-supported E2E frameworks with active ecosystems; the decision comes down to fit with this project's specific constraints — solo maintenance, ADR-0013's explicit $0/month cost ceiling, and an existing TypeScript/Vite stack.

## Decision 1: Adopt Playwright, not Cypress

**Decision:** Use Playwright (`@playwright/test`) for the new E2E + visual regression layer.

**Rationale:**

- **Visual regression is native to the test runner** (`expect(page).toHaveScreenshot()` with baseline management and CI diffing built in). Cypress's equivalent capability lives behind Cypress Cloud (paid) or third-party plugins (`cypress-image-snapshot`, Percy), either of which adds ongoing cost or an extra dependency to maintain — directly in tension with ADR-0013's $0/month constraint.
- **No overlap with the existing Vitest + RTL layer.** Cypress's component-testing mode would partly duplicate what Vitest + RTL already covers (rendering/interaction at the component level); Playwright cleanly occupies the layer above (real browser, real network, real pixels) instead.
- **Simpler, cheaper CI fit.** `npx playwright install --with-deps` plus the official GitHub Action gives headless Chromium/Firefox/WebKit runs with no dashboard dependency. Cypress works in CI too, but its ergonomics (parallelization, run recording, retries) are built around Cypress Cloud; usable for free but working against the tool's grain for a project with no dashboard need.
- **Matches the existing TypeScript/Vite stack** more natively; auto-waiting and retrying assertions reduce the flake-related maintenance burden for a single maintainer, versus Cypress's more manual `cy.wait()` patterns.

## Decision 2: Scope to a chat-flow smoke test plus visual snapshots of key screens — not a full browser/device matrix

**Decision:** Initial coverage is (a) one E2E smoke test exercising the real chat flow (ask a question → see loading state → see rendered answer → see sources) against the running dev server, and (b) visual snapshots of the main chat view, the `SourceList` (compact and debug variants), and the API-key auth modal. Chromium only for now.

**Rationale:**

- A single, well-chosen smoke path plus targeted visual snapshots catches the failure modes that actually matter (broken flow, broken layout) without paying for a cross-browser matrix that has no evidence of being necessary — consistent with this project's recurring "don't pay for capability the current evidence doesn't call for" posture (see ADR-0001, ADR-0009).
- Chromium-only keeps CI runtime and maintenance minimal; this repo is public so Actions minutes aren't a hard constraint (ADR-0013 Decision 5), but maintainer time reviewing multi-browser flakes is a real cost regardless.

## Decision 3: New `playwright` CI job, separate from `frontend-test` — non-blocking on visual diffs initially

**Decision:** Add a new `playwright` job to `.github/workflows/ci.yml`, distinct from the existing `frontend-test` (Vitest + oxlint) job. The E2E smoke test gates merges (failure blocks CI). Visual snapshot diffs are surfaced as a CI artifact and reviewed manually before approving a baseline update; they do not auto-fail the build in this first iteration.

**Rationale:**

- Keeps unit/component tests (fast, deterministic) separate from browser-driven tests (slower, more prone to environment-specific rendering differences) — mirrors the existing separation between `unit-test` and `retrieval-test` in the same workflow.
- Hard-failing on any visual diff from day one risks false-positive noise (font rendering/anti-aliasing differences between local and CI environments) discouraging use of the suite entirely. Starting permissive and tightening once the baseline is proven stable is lower-risk than the reverse.

## Alternatives considered and rejected (for now)

- **Cypress** — rejected primarily on visual-regression cost/complexity fit; see Decision 1.
- **Percy or Chromatic for visual regression, framework-agnostic** — both are strong dedicated visual-testing products, but both are paid services beyond small free tiers, in direct tension with ADR-0013. Playwright's built-in screenshot testing achieves most of the same value at zero cost.
- **Skipping visual regression entirely, E2E smoke tests only** — considered, but ADR-0005 explicitly formalized a design-token system worth protecting from silent regression; visual snapshots are cheap to add given Playwright already supports them natively, so there's no real reason to leave that coverage on the table.

## Consequences

**Positive:**

- Closes a real, previously-unaddressed gap: no browser-level coverage of the actual user-facing product surface existed before this.
- Zero added cost, consistent with ADR-0013.
- Visual regression protects ADR-0005's design-token investment going forward.
- Clean separation from the existing Vitest + RTL layer — no duplicated effort, no tooling overlap.

**Negative / accepted risks:**

- Chromium-only coverage means Firefox/WebKit-specific rendering bugs won't be caught. Accepted for now; no evidence yet that Töökratt's user base needs multi-browser guarantees.
- Visual snapshot baselines will need periodic, deliberate maintenance (re-recording after intentional UI changes) — a new small recurring task that didn't exist before.
- Non-blocking visual diffs (Decision 3) mean a real regression could theoretically merge if not manually reviewed. Accepted as a deliberate first-iteration trade-off, not a permanent stance.

## Revisit triggers

- If visual snapshot false positives (environment-specific rendering noise) prove rare in practice, consider promoting visual diffs to a blocking CI check.
- If the project gains real multi-browser usage signal (once ALE-127/ALE-128's observability work lands), revisit expanding beyond Chromium.
- If Percy/Chromatic's free tier becomes a better fit than self-maintained baselines (e.g. baseline review overhead becomes a real maintenance burden), revisit Decision 1's alternatives — this ADR's choice is evidence-based, not permanent.
