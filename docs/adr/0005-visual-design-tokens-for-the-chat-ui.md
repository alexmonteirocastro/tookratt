# ADR-0005: Visual Design Tokens for the Chat UI (Töökratt dashboard)

* **Status:** Accepted
* **Date:** 2026-07-07 (original); superseded palette/type 2026-08-10 (ALE-174 / ALE-172)
* **Related:** ADR-0004 (frontend architecture), ALE-74 (initial implementation), ALE-172 (dashboard redesign handoff), ALE-174 (this rewrite)

## Context

ALE-74 scoped the React chat UI's data flow and testing but not its visual
language. The first version of this ADR (2026-07-07) defined an original
**thehub.io-inspired** token set: Inter Variable, indigo accent (`#4338CA`),
white/gray surfaces — derived from a screenshot mood board, not copied brand
assets.

ALE-172 shipped a Claude Design handoff for the Töökratt rebrand: navy / amber
/ parchment / cream / teal, Sora + Karla, mascot, and a single-dashboard
layout. `frontend/src/styles/tokens.css` was updated to match. This ADR is
rewritten so the documented decisions match the live tokens (ALE-174).

The earlier Inter / indigo decisions are **superseded**, not deleted from
history: they remain the rationale for *having* a CSS-variable token seam
(Decision 1 is unchanged in spirit).

## Decision 1: Token system lives in CSS custom properties, not inline/magic values

**Decision:** All colors, spacing, radii, type sizes, and layout constants are
defined once as CSS custom properties in `frontend/src/styles/tokens.css` and
consumed everywhere else by reference — never a hardcoded hex or px value
inside a component stylesheet (beyond unavoidable CSS keywords like `transparent`).

**Rationale:** Unchanged from the original ADR — isolate the volatile visual
values behind one seam so a rebrand is a single-file edit. ALE-172 proved
that path: the redesign was largely a `tokens.css` + component restyle, not a
repo-wide hex hunt.

## Decision 2: Palette — navy / amber / parchment (Töökratt handoff)

**Decision:** Live values in `tokens.css` (canonical). Primary mapping:

| Token | Value | Use |
|---|---|---|
| `--color-ink` | `#1B2A4A` | primary text, wordmark, lock icon stroke |
| `--color-text-secondary` | `rgba(27, 42, 74, 0.65)` | subtitle |
| `--color-text-muted` / `--color-text-faint` / `--color-text-soft` | navy at 55% / 45% / 75% | empty-state, counter, banner copy |
| `--color-surface` | `#FBF8F2` (cream) | panels, input bar, lock button, modal |
| `--color-surface-alt` | `#F4EFE6` (parchment) | page background |
| `--color-border` | `rgba(27, 42, 74, 0.15)` | input / lock borders |
| `--color-border-teal` | `rgba(46, 110, 98, 0.2)` | info banner border |
| `--color-accent` | `#C97D2E` (amber) | Ask button, links |
| `--color-accent-hover` | `#b56f28` | Ask / link hover |
| `--color-accent-text` | `#1B2A4A` | text on amber CTAs |
| `--color-teal` | `#2E6E62` | info-banner icon |
| `--color-bubble-user` | `#C97D2E` | user message bubble |
| `--color-bubble-assistant` | `#1B2A4A` | assistant / loading bubble |
| `--color-bubble-assistant-text` | `#F4EFE6` | text on navy bubbles |
| `--color-error` / `--color-error-bg` / `--color-error-border` | `#9B2C2C` / `#FCE8E6` / … | production error bubbles (not in the design prototype) |

**Supersedes:** indigo `#4338CA` / white `#FFFFFF` / gray band palette from the
2026-07-07 revision.

**Rationale:** ALE-172 high-fidelity handoff is the product brand for the
dashboard; tokens track that brief rather than the earlier sibling-site mood.

## Decision 3: Display / body pairing — Sora + Karla (self-hosted)

**Decision:**

- Display / headings: `--font-family-display: "Sora", …` (weights 400 / 700
  loaded)
- Body / UI: `--font-family: "Karla", …` (weights 400 / 500 / 700 loaded)
- Hosting: `@fontsource/sora` and `@fontsource/karla` (OFL-1.1), imported from
  `main.tsx` — **not** Google Fonts CDN (free-tier / privacy / offline-friendly,
  consistent with the previous Inter Variable self-host choice)

**Supersedes:** single-family Inter Variable with weight-only hierarchy.

**Rationale:** The handoff specifies a deliberate display/body pairing. Both
families are OFL-licensed for web embedding; self-hosting avoids a runtime CDN
dependency.

## Decision 4: Spacing, radius, and layout scale

**Decision:**

- Spacing: 4px-based scale `--space-1` … `--space-10`, plus handoff-specific
  pads (`--space-input-pad-y`, `--space-bubble-pad-x`, `--space-empty-gap`, …)
- Radii: `--radius-sm: 12px` (lock), `--radius-md: 14px` (banner),
  `--radius-lg: 16px`, `--radius-xl: 18px` (input bar), `--radius-pill: 100px`
  (Ask), asymmetric `--radius-bubble-user` / `--radius-bubble-assistant`
- Layout: `--max-width-chat: 980px`; `--min-height-conversation: 420px`;
  mascot `--size-mascot-header: 56px`, `--size-mascot-empty: 120px`;
  `--size-lock-button: 44px`

**Supersedes:** `--radius-sm: 6px`, `--shadow-card`, and the narrower
`--max-width-chat: 48rem` card-on-gray grammar. Soft card shadows are no longer
part of the live language (bubbles / bordered cream panels instead).

## Decision 5: Application to the chat UI specifically

- **Header** — mascot + lowercase Sora wordmark “töökratt”, subtitle, cream lock
  button (API key modal trigger).
- **Info banner** — cream surface, teal border/icon, stateless-question copy.
- **Conversation** — empty state with large mascot; user bubbles amber/navy text;
  assistant bubbles navy/parchment text; loading indicator matches assistant
  bubble chrome; error messages use the dedicated error tokens (production
  addition beyond the prototype’s canned replies).
- **Input bar** — cream bordered panel, transparent textarea, live `N/500`
  counter, pill Ask button disabled when empty.
- **Sources** — when shown, chips/cards sit on navy assistant bubbles using
  `--color-on-navy-*` tokens (no `--shadow-card`).
- **Favicons / apple-touch** — sized mascot crops in `frontend/public/`
  (resolved under ALE-172; opaque parchment background).

## Contrast audit (ALE-174)

Computed relative-luminance contrast (WCAG 2.x formula) against the live
tokens:

| Pair | Ratio | AA normal (4.5:1) | AA large (3:1) |
|---|---|---|---|
| `--color-ink` / `--color-accent-text` on `--color-accent` / `--color-bubble-user` (`#1B2A4A` on `#C97D2E`) | **4.37:1** | Fail | Pass |
| Parchment on navy (assistant text) | 12.42:1 | Pass | Pass |
| Ink on parchment / cream (page text) | 12.42:1 / 13.42:1 | Pass | Pass |
| Teal on cream (banner icon) | 5.62:1 | Pass | Pass |

**Accepted risk:** navy-on-amber for Ask label and user-bubble body sits
**0.13 below** AA for normal text. Large-text AA passes. Adjusting either
color would diverge from the signed-off handoff for a marginal gain; leave as
shipped.

**Revisit trigger:** before treating Ask / user-bubble copy as long-form body
text (or if a formal a11y gate is added to CI), darken ink toward ~`#192746`
or lighten amber slightly until ≥ 4.5:1 — both ~3% nudges were enough in a
spot check.

## Alternatives considered and rejected

- **Keep Inter / indigo and only rename Hubster → Töökratt in copy** —
  rejected: ALE-172 handoff is the brand direction.
- **Google Fonts CDN for Sora/Karla** — rejected: OFL self-host via
  `@fontsource` matches free-tier / offline constraints and the prior Inter
  approach.
- **Adjust amber/navy now to force AA 4.5:1** — deferred per contrast section;
  handoff fidelity preferred for ALE-174.
- **Full design-system library (Tailwind default theme, MUI)** — still
  rejected: one dashboard view; hand-rolled tokens remain enough.

## Consequences

**Positive:** docs match `tokens.css`; rebrand is documented; Decision 1’s
seam remains the change vehicle; production loading/error states are named as
intentional extensions of the prototype.

**Negative / accepted risks:** navy-on-amber contrast shortfall (see above);
token set is larger than the 2026-07 indigo palette (more semantic aliases for
opacity and on-navy surfaces) — still one file.

## Revisit triggers

- Contrast nudge for navy-on-amber (see Contrast audit).
- If a second real view or dark mode appears, revisit whether a design-system
  library beats hand-rolled tokens (same trigger as ADR-0004 for routing).
- If a simplified monochrome mark is designed, prefer it for 16×16 favicon
  only (smile is illegible at that size with the current art — accepted under
  ALE-172).
