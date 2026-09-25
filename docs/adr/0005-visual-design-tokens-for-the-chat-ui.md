# ADR-0005: Visual Design Tokens for the Chat UI (Töökratt dashboard)

* **Status:** Accepted
* **Date:** 2026-07-07 (original); superseded palette/type 2026-08-10 (ALE-174 / ALE-172); Baltic palette/type recorded 2026-09-25 (ALE-201 / ALE-210)
* **Related:** ADR-0004 (frontend architecture), ALE-74 (initial implementation), ALE-172 (dashboard redesign handoff), ALE-174 (this rewrite), ALE-192 (stats dashboard patterns), ALE-201 (Baltic palette, Ö mark, type — landed in the token files), ALE-210 (this follow-up)

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

ALE-201 (2026-09-25) replaced the ALE-172 palette and type with the Baltic
set. Decisions 2 and 3 and the contrast audit below stay as the ALE-174
record. The live decisions are the follow-up note at the end of this ADR.

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
| `--color-error` | `#9B2C2C` | error message text |
| `--color-error-bg` | `#FCE8E6` | error bubble background |
| `--color-error-border` | `rgba(155, 44, 44, 0.35)` | error bubble border |

**Supersedes:** indigo `#4338CA` / white `#FFFFFF` / gray band palette from the
2026-07-07 revision.

**Rationale:** ALE-172 high-fidelity handoff is the product brand for the
dashboard; tokens track that brief rather than the earlier sibling-site mood.

**Follow-up (ALE-201 / ALE-210):** Superseded for the live UI. The table
above remains the ALE-174 record. The Baltic palette is in the follow-up
note at the end of this ADR.

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

**Follow-up (ALE-201 / ALE-210):** Superseded for the live UI. Sora and Karla
remain the ALE-174 record. Space Grotesk and IBM Plex Sans are in the
follow-up note at the end of this ADR.

## Decision 4: Spacing, radius, and layout scale

**Decision:**

- Spacing: 4px-based scale `--space-1` … `--space-10`, plus handoff-specific
  pads (`--space-input-pad-y`, `--space-bubble-pad-x`, `--space-empty-gap`, …)
- Radii: `--radius-sm: 12px` (lock), `--radius-md: 14px` (banner),
  `--radius-lg: 16px`, `--radius-xl: 18px` (input bar), `--radius-pill: 100px`
  (Ask), asymmetric `--radius-bubble-user` / `--radius-bubble-assistant`
- Layout: `--max-width-chat: 980px`; `--size-chart-label: 11rem` (ALE-192
  `jobs_per_role` label column); `--min-height-conversation: 420px`;
  mascot `--size-mascot-header: 56px`, `--size-mascot-empty: 120px`;
  `--size-lock-button: 44px`

**Supersedes:** `--radius-sm: 6px`, `--shadow-card`, and the narrower
`--max-width-chat: 48rem` card-on-gray grammar. Soft card shadows are no longer
part of the live language (bubbles / bordered cream panels instead).

## Decision 5: Application to the chat UI specifically

- **Header** — mascot + lowercase Sora wordmark "töökratt", subtitle, cream lock
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

## Decision 6: Application to the stats dashboard (ALE-192)

Bet 004 adds a second real view (`/market`) without a new brand or token
system. The three new patterns apply Decision 1–4 in code; ALE-193 wires
routing and `GET /jobs/stats`. Presentational components live in
`frontend/src/components/` (`AppNav`, `CountrySelector`, `JobsPerRoleChart`)
with shared labels in `frontend/src/utils/statsLabels.ts`.

**Chart (`jobs_per_role`) — CSS horizontal bars, no chart library.** Cream
`--color-surface` panel, parchment `--color-surface-alt` track, `--color-teal`
fill, `--radius-sm` on the bar. Role labels are `--color-ink` to the left;
counts are `--color-accent` *text on cream*, never navy-on-amber on the fill
(does not extend the accepted-risk pair below to small figures). Sort
descending; omit zero-count roles; bar width is percent of the current
country's max role, not of `total_jobs`. Markup is a `<table>` so the numbers
are available without the visual bar.

**Country selector — pill radios, not a dropdown.** The six codes (`DK`,
`SE`, `NO`, `FI`, `IS`, `EU`) are equally weighted and always visible.
`--radius-pill`, `--space-2`/`--space-4` padding, wrap on small viewports.
Unselected: cream + ink + `--color-border`. Selected: `--color-teal` fill +
`--color-surface` label (same 5.62:1 pair as the banner icon, AA pass). Native
`<input type="radio">` for arrow-key behaviour; visible label is the code,
accessible name is the country (`Denmark`, …, `Europe`).

**Nav — two text tabs under the wordmark.** `Job market` / `Chat` in Karla
`--font-size-sm`, Job market first (left) as the landing view. Active: `--font-weight-heading`, `--color-ink`, 2px
`--color-teal` underline. Inactive: `--color-text-secondary`. Not amber
pills, not a sidebar. Place in a brand column *below* the wordmark/subtitle so
header actions (new conversation, API key) stay un-squeezed. Chat-only chrome
(memory banner, new-conversation control) stays off `/market`.

**KPI tiles (handoff, not a fourth invention):** total / remote / paid /
unpaid reuse the same cream `--color-surface` panel as the chart. Figure in
Sora `--font-size-xl`; uppercase Karla `--font-size-xs` muted label (same
grammar as `SourceList` section headings). No new card shadow or accent fill.

**Rejected:** chart-library defaults (rainbow palettes, axes chrome);
dropdown country control; amber-filled active tabs or bar labels at small
text sizes; a design-system library for this second view (ADR-0005 revisit
trigger considered and declined — three patterns, existing tokens enough).

## Contrast audit (ALE-174)

Computed relative-luminance contrast (WCAG 2.x formula) against the live
tokens:

| Pair | Ratio | AA normal (4.5:1) | Notes |
|---|---|---|---|
| `--color-ink` / `--color-accent-text` on `--color-accent` / `--color-bubble-user` (`#1B2A4A` on `#C97D2E`) | **4.37:1** | Fail | Applicable bar for live UI — see below |
| Parchment on navy (assistant text) | 12.42:1 | Pass | |
| Ink on parchment / cream (page text) | 12.42:1 / 13.42:1 | Pass | |
| Teal on cream (banner icon) | 5.62:1 | Pass | |

The navy-on-amber ratio (4.37:1) would clear WCAG’s **large-text** AA floor
(3:1) if the glyphs qualified as large text (≥24px regular or ≥18.66px /
14pt bold). They do not in the shipped UI: the Ask label is 16px bold and
user-bubble body is ~17px regular — so the large-text allowance does **not**
apply, and the relevant criterion is AA normal (4.5:1), which fails.

**Accepted risk:** navy-on-amber for Ask label and user-bubble body sits
**0.13 below** AA for normal text. Adjusting either color would diverge from
the signed-off handoff for a marginal gain; leave as shipped.

**Revisit trigger:** before treating Ask / user-bubble copy as long-form body
text (or if a formal a11y gate is added to CI), darken ink toward ~`#192746`
or lighten amber slightly until ≥ 4.5:1 — both ~3% nudges were enough in a
spot check.

**Follow-up (ALE-201 / ALE-210):** This accepted risk is closed. Navy on
amber is no longer a live pair. See the follow-up note.

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
intentional extensions of the prototype. `/market` (Decision 6) reuses the
same seam rather than introducing a second visual system.

**Negative / accepted risks:** navy-on-amber contrast shortfall (see above);
token set is larger than the 2026-07 indigo palette (more semantic aliases for
opacity and on-navy surfaces) — still one file.

**Follow-up (ALE-210):** the navy-on-amber shortfall named above is closed.
Decision 1’s seam is unchanged: the live values are still one token file.

## Revisit triggers

- Contrast nudge for navy-on-amber (see Contrast audit). **Closed (ALE-201 /
  ALE-210):** that pair is gone; see the follow-up note.
- **Open (ALE-210):** `--color-text-faint` (Ink at 45%) is 2.95:1 on Paper
  and fails AA. See the accepted risk in the follow-up note. Revisit if a
  formal accessibility gate lands in CI, or before that text is the only cue
  for an action the user must take.
- **Addressed in part (ALE-192):** the second view (`/market`) stays on
  hand-rolled tokens — see Decision 6. Dark mode, or a third distinct
  surface, still revisits whether a design-system library beats this file
  (same trigger as ADR-0004 for routing).
- If a simplified monochrome mark is designed, prefer it for 16×16 favicon
  only (smile is illegible at that size with the current art — accepted under
  ALE-172). **Closed for the app favicon (ALE-201 / ALE-205):** the Kratt
  mascot is replaced by the Ö mark, including a 16px drawing with no
  connector. Marketing still uses the mascot until ALE-202.

## Follow-up notes (post-acceptance)

### Baltic palette, Ö mark, and type (ALE-201 / ALE-210)

ALE-201 replaced the ALE-172 navy / amber / parchment / teal palette and the
Sora + Karla pairing. The decisions above are left in place so that record
stays readable. Live values are canonical in
`frontend/src/styles/tokens.css`. `marketing/src/styles/tokens.css` duplicates
the palette and type by hand (ADR-0016). This note does not change token
values.

**Palette.** Ink `#12151B`, Paper `#F6F7F9`, Baltic Blue `#16407A`, amber
signal `#C68A2E`.

| Token | Value | Use |
|---|---|---|
| `--color-ink` | `#12151B` | primary text, wordmark |
| `--color-surface-alt` | `#F6F7F9` (Paper) | page background |
| `--color-surface` | `#FFFFFF` | panels, input bar, assistant bubble |
| `--color-accent` | `#16407A` (Baltic Blue) | Ask button, links, user bubble, chart fill, selected country |
| `--color-accent-hover` | `#10325F` | blue control hover |
| `--color-accent-text` | `#F6F7F9` (Paper) | text on blue controls and user bubbles |
| `--color-signal` | `#C68A2E` | non-text amber: nav underline, Ö mark dots |
| `--color-accent-on-ink` | `#7FA3D6` | blue on Ink. Defined in the token files; no component references it yet |
| `--color-text-secondary` | Ink at 65% | subtitle |
| `--color-text-muted` | Ink at 60%, `rgba(18, 21, 27, 0.6)` | muted copy. **4.69:1 on Paper.** Not the ALE-174 mapping of navy at 55% |
| `--color-text-soft` | Ink at 75%, `rgba(18, 21, 27, 0.75)` | memory banner. **7.8:1 on Paper** (AA pass) |
| `--color-text-faint` | Ink at 45%, `rgba(18, 21, 27, 0.45)` | counter, placeholders, marketing "(optional)". **2.95:1 on Paper** (AA fail). Accepted risk below |
| `--color-border-accent` | `rgba(22, 64, 122, 0.2)` | replaces `--color-border-teal` |

`--color-teal` is removed. Chart fill and the selected country pill use
`--color-accent`. The active nav underline uses `--color-signal`, not accent.
Assistant bubbles are white with ink text and a 1px border, not parchment on
navy. User bubbles are Baltic Blue with Paper text. In the frontend token
file, `--color-on-navy-*` is renamed `--color-on-assistant-*`. Marketing
keeps `--color-on-navy` and `--color-on-navy-muted` until ALE-202.

**Type.** Display is Space Grotesk (`--font-family-display`), weights 500 /
600 / 700 loaded. Body is IBM Plex Sans (`--font-family`), weights 400 / 500
/ 600 / 700 loaded. Space Grotesk has no 800; headings use 700. Hosting stays
`@fontsource` imported from `frontend/src/main.tsx` and `marketing/src/main.ts`,
not a Google Fonts CDN. This supersedes Sora + Karla the same way Decision 3
superseded Inter.

**Ö mark.** `--size-mascot-header` / `--size-mascot-empty` become
`--size-mark-header: 40px` and `--size-mark-empty: 72px` in the frontend
file. ALE-205 uses that mark in the app header, empty state, and favicons.
The mark takes its colours from `--color-accent` (ring) and `--color-signal`
(dots and connector) in `frontend/src/components/Mark.module.css`, so a later
dark lockup swaps those two variables. Marketing `--size-mascot-*` stays
until ALE-202.

**Mobile breakpoint.** The app layout switches at `max-width: 640px`. A
custom property cannot be used inside a media query, so the value is a
shared convention rather than a token in `tokens.css`. `ChatInput.tsx`
mirrors the same query for the short placeholder. Do not drift it to 600px
or 768px.

**Contrast.** Paper on Baltic Blue (`#F6F7F9` on `#16407A`) is **9.6:1**,
which passes AA for normal text. That is the Ask label and the user-bubble
body, so the navy-on-amber pair (4.37:1) and its accepted risk are **closed**.
`--color-text-muted` is Ink at 60% and measures **4.69:1 on Paper**, also an
AA pass for normal text. `--color-text-soft` (Ink at 75%) is **7.8:1 on
Paper**, an AA pass; the memory banner uses it. The ALE-174 audit above is
historical.

**Accepted risk (ALE-210):** `--color-text-faint` is Ink at 45% and measures
**2.95:1 on Paper**, which fails AA for normal text. It is real text: the
character counter at 14px (`ChatInput.module.css`), every input placeholder
(`frontend/src/styles/global.css`), and the marketing waitlist "(optional)"
label. Left as shipped. This note does not change token values.

**Revisit trigger:** if a formal accessibility gate is added to CI, or before
this text is the only cue for an action the user must take. Clearing 4.5:1
means raising faint toward the 60% muted mix, or pointing the counter and
placeholders at `--color-text-muted`.

**Why not edit Decisions 2 and 3 silently:** project convention is
revision-via-follow-up when a later ticket changes a prior decision, so
readers of this file still see what ALE-174 decided and where the Baltic
change lives. The change is recorded here, in the ADR whose decisions moved,
rather than in a new ADR.
