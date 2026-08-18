# ADR-0008: Multi-Turn Conversation Memory for `/chat`

* **Status:** Proposed
* **Date:** 2026-08-18
* **Related:** ALE-103 (spike, this ADR's deliverable), ALE-184 (backend implementation), ALE-185 (frontend implementation), ADR-0001 Decision 4 (statelessness — the revisit trigger this ADR fires), ADR-0002 Decision 3 (deterministic filter extraction — precedent this ADR extends), ADR-0004 Decision 3 (frontend history is display-only — superseded by this ADR once implemented), ADR-0006 (in-memory rate limiting — same multi-worker caveat applies here), ADR-0009/ADR-0012 (prompt structuring precedent for untrusted content), ADR-0011 (API key auth — no per-user identity today), ADR-0014 (Render memory-crash precedent), ALE-183 (embedding-model context-window spike — related but not a dependency), PRODUCT_VISION.md (Phase 2 candidate profile)

## Context

ADR-0001 Decision 4 scoped `/chat` as single-turn and stateless for v1, with an explicit revisit trigger ("if/when it's actually needed"). ADR-0004 Decision 3 followed suit on the frontend: conversation history is kept client-side for display only and never sent back, with its own revisit trigger ("if `/chat` gains multi-turn/session support"). ALE-103 is that revisit, scoped as a discovery spike per this project's established spike → ADR → implementation-ticket pattern (ALE-73 → ADR-0001 is the precedent). Implementation is split the same way as the original generation layer: [ALE-184](https://linear.app/alex-projects/issue/ALE-184/add-server-side-multi-turn-conversation-memory-to-chat-backend) (backend) then [ALE-185](https://linear.app/alex-projects/issue/ALE-185/wire-session-id-bounded-conversation-memory-into-the-chat-ui-frontend) (frontend), matching ALE-76 / ALE-74.

Three things anchor the design below, all confirmed by reading the current implementation rather than assumed:

1. **There is no session or user concept anywhere in the system today.** `require_api_key` (`api/auth.py`) checks a bearer token against a *shared, group-wide* set of keys (ADR-0011) — it identifies "an approved caller," not an individual person, and several collaborators can hold independent keys. A session identity for conversation history cannot be derived from the API key; it needs its own mechanism.
2. **The backend runs as a single Render instance today** (ADR-0013 Decision 3: "Render defaults to a single instance — matching ADR-0006's in-memory rate-limiter assumption with zero extra configuration"). This is the same condition that already justified in-memory rate limiting in ADR-0006, and it justifies the same choice here — with the same revisit trigger.
3. **This project has already paid for one memory-pressure lesson on this exact host.** ADR-0014 exists because unbounded in-process compute crashed Render's 512MB container. An in-memory session store is a new unbounded-growth surface on the same constrained container if it isn't explicitly bounded. This ADR treats that as a design constraint, not an afterthought.

**Scope decision carried over from discussion, not re-litigated here:** this ADR covers server-side history storage, a minimal session identifier, and deterministic filter carry-forward only. LLM-based query condensation and intent-driven filter inference (the "agentic-like" upgrade path) are explicitly deferred — see Decision 8 and Revisit triggers. Retrieval is unchanged, which means this design has no dependency on the embedding model or on ALE-183's outcome; see Decision 4.

## Decision 1: History lives server-side, in-memory, scoped to a session — not client-resent, not persisted to a database

**Decision:** `/chat` gains a server-side, per-session store of prior question/answer turns, held in a process-local in-memory structure (a `dict[str, SessionState]`, guarded by the same singleton pattern as `get_settings()`/`get_qdrant_client()`). Nothing is written to disk or to Qdrant.

**Rationale:**

- Matches ADR-0006's existing in-memory precedent exactly, for the same reason: the current deployment is single-instance, so no distributed store is needed to make this correct today (see Context, point 2).
- No database exists in this architecture to persist to — Qdrant is a vector store for job data, not a general-purpose relational store — and introducing one solely for ephemeral chat history would be a large, unjustified infrastructure addition for a prototype-stage feature.
- Keeping history out of any persistence layer is also the more honest privacy posture while ALE-103's retention question remains genuinely open: data that is never written to disk cannot leak from a disk. See Decision 6 for how "ephemeral" is bounded and enforced, not just asserted.
- ADR-0004 Decision 3's client-side-only history was already an accepted, *visible* limitation — the frontend keeping its own display copy is unaffected and unrelated to this decision; that data was always for rendering, never state the server relied on.

## Decision 2: Session identity is a server-issued opaque ID carried in the typed request/response contract — not a cookie, not derived from the API key

**Decision:** `ChatRequest` gains `session_id: str | None = None`. When omitted or unrecognized, the handler mints a new one (`uuid.uuid4().hex`, stdlib, no new dependency) and treats the request as the start of a fresh session. `ChatResponse` gains `session_id: str`, always populated with the ID the caller should send on the next turn.

**Rationale:**

- Confirmed in Context: the API key (ADR-0011) is shared across a small group, not a per-user identity, and there is no cookie or auth-session mechanism anywhere in the stack today. Reusing the API key as a session key would silently merge every key-holder's conversations together — wrong, not just imprecise.
- A typed request/response field keeps this consistent with the project's established preference for explicit contract fields over implicit transport (the same reasoning ADR-0002 Decision 3 used for `country`/`remote`: explicit parameter first, inference second). A cookie would also reintroduce the cross-origin complexity ADR-0004 Decision 5 already had to solve once for `VITE_API_BASE_URL` (Cloudflare Pages frontend, Render backend — different origins), for no benefit over a field the frontend already parses from every response.
- Server-issued (not client-generated) avoids trusting an unauthenticated caller to supply a well-formed, unpredictable, non-colliding ID — the server is the only party that needs to guarantee uniqueness.
- This ID is intentionally *not* an auth mechanism — it is never checked against anything, only used as a lookup key into the session store, scoped by construction to whichever session-store bucket the ID happens to hit. Guessing another session's ID would only be possible if it leaked (see Consequences).

## Decision 3: `Generator.generate()` gains an optional `history` parameter — history is not folded into `context`

**Decision:** Extend the `Generator` ABC (`llm_client/base.py`) to `generate(self, context: str, question: str, history: Sequence[ChatTurn] | None = None) -> str`, with a small `ChatTurn` (question, answer) type defined alongside it. `build_generation_prompt` (`llm_client/context.py`) — the single choke point already shared by `GeminiGenerator` and `OllamaGenerator` — gains the same parameter and assembles a new, clearly delimited "prior conversation" section, structurally separate from the `<<JOB_DATA>>` blocks `format_job_context` builds.

**Rationale:**

- This is exactly the seam ALE-103 itself flagged as the open question, and exactly the placement precedent ADR-0009 Decision 3 and ADR-0012 Decision 1 already established: extend the shared prompt-building layer once, and every `Generator` implementation (`GeminiGenerator`, `OllamaGenerator`, `StubGenerator`, and test doubles like `FakeGenerator`) inherits the behavior without an endpoint rewrite.
- Folding history into the existing `context` string was considered and rejected: `context` today means "retrieved job data" specifically, and both the grounding check (ADR-0009 Decision 4 / ADR-0012 Decision 2) and the prompt-injection delimiting (ADR-0012 Decision 1) reason about that string *as job data*. Silently widening its meaning to include conversation history would weaken both checks' precision for no benefit — keeping them as separate parameters keeps each concern legible.
- `history` defaults to `None`/empty, so every existing call site that doesn't pass it keeps working — the required mechanical update (three concrete `Generator` implementations plus the test doubles in `tests/api/test_chat.py`, `tests/llm_client/test_base.py`, `tests/db/test_generation.py`, and `tests/evals/test_comparison_helpers.py`) is additive, not a behavioral change for anyone who doesn't opt in.
- Conversation history re-entering the prompt is untrusted content by the same logic ADR-0012 already applied to job postings — a user's own prior turns, and the model's own prior outputs, are text that will be interpreted by the model again. The new "prior conversation" section uses the same "this is data, not instructions" delimiting principle as `<<JOB_DATA>>`, not a bare string concatenation. This does not fully resolve ADR-0012's threat model (see Consequences) but keeps this feature consistent with the mitigation already in place rather than opening a parallel, undelimited surface.

## Decision 4: Retrieval is unchanged — only the current turn's question is embedded and filtered; no query condensation in phase 1

**Decision:** `query_jobs_in_qdrant` and `resolve_chat_filters` continue to receive only `chat_request.question` for the current request. Prior turns are never concatenated into the text that gets embedded or matched against the alias/keyword filter tables.

**Rationale:**

- This is the direct, deliberate choice that keeps this feature "still simple RAG" rather than a step toward an agentic pipeline: retrieval remains one deterministic call per request, exactly as it is today. Nothing about adding history changes the shape of the retrieve-then-generate pipeline.
- It is also what makes this ADR fully decoupled from the embedding model and from ALE-183's outcome. A follow-up query like "any others?" only carries useful semantic content when combined with prior turns — but this ADR does not attempt that combination at the retrieval layer at all (see Decision 5 for the one piece of prior-turn signal that *does* carry forward, which is deterministic and doesn't touch embeddings). ALE-183 remains free to proceed on its own timeline; nothing here blocks or is blocked by it.
- ADR-0001 Decision 3's anti-hallucination guardrail is unaffected for the same reason: `usable_points` is computed fresh from the current turn's retrieval, exactly as today. History changes what the *generator* sees, never what retrieval returns or whether generation is skipped.

## Decision 5: The last-resolved country/remote filter is carried forward per session when the current turn resolves nothing — explicit params and current-turn text extraction still take precedence

**Decision:** After `resolve_chat_filters(question, explicit_country=..., explicit_remote=...)` runs (unchanged, per Decision 4), a new pure function merges in the session's last-applied filter *only* for whichever of `country`/`remote` the current call resolved to `None`. The result is what's used for retrieval and stored back as the session's new "last filter," so a chain of follow-ups keeps inheriting scope turn over turn.

Precedence, per field, highest to lowest:

| Priority | Source |
|---|---|
| 1 | Explicit `ChatRequest.country`/`remote` on this request |
| 2 | This turn's deterministic text extraction (`extract_filters_from_question`) |
| 3 | Session's last-applied filter (this decision) |
| 4 | No filter |

**Rationale:**

- Directly closes the gap named in this project's own docs: ADR-0004's Context section already identified "any others?" as a follow-up with no access to what "others" refers to, and PRODUCT_VISION's tier-4 framing names exactly this class of question. This is the cheapest fix that closes it without an LLM call.
- Precedence is a natural extension of ADR-0002 Decision 3's existing rule ("an explicitly supplied filter always overrides anything derived from the question text") — this decision just adds one more, lower-priority fallback rung beneath the two that already exist, rather than inventing a new precedence model.
- Keeping this fully deterministic (no LLM, no fuzzy matching) preserves the same property ADR-0002 Decision 3 and ADR-0012 both already lean on: retrieval scoping stays a place where the system cannot be *wrong* in a hard-to-attribute way, only *unfiltered* in a way that degrades gracefully to today's behavior.
- `ChatResponse.applied_country`/`applied_remote` (ALE-84, unchanged schema) already exists specifically to make "what filter actually applied" visible to callers — carried-forward filters flow through the same fields, so this doesn't introduce a new opaque state for the frontend to reason about.

**Known, accepted gap:** there is no phrase yet for "clear the filter and broaden back out" (e.g., after "jobs in Sweden" → "any others in Denmark too?" resolves a new explicit country and correctly overrides, but "actually show me everywhere" has no recognized phrase and would fall through to the carried-forward filter, not to "no filter"). This degrades gracefully — the user gets an over-scoped result, not a wrong or crashing one — and is named as a revisit trigger rather than solved here, consistent with how ADR-0002 already treats alias-table gaps.

## Decision 6: Session store is bounded by a per-session TTL and a hard ceiling on concurrent sessions — not unbounded, not Redis

**Decision:** `Settings` (`db/settings.py`) gains three new fields following the existing `chat_*` convention: `CHAT_SESSION_TTL_SECONDS` (default 1800 — 30 minutes of inactivity), `CHAT_HISTORY_MAX_TURNS` (default 5 — the sliding window of turns actually sent to the `Generator`; older turns are dropped from the prompt but the design does not need to distinguish "dropped from prompt" vs. "evicted from memory," since both happen together), and `CHAT_MAX_SESSIONS` (default 1000 — a hard ceiling; once reached, the least-recently-touched session is evicted to make room for a new one). Eviction is lazy (checked on access), not a background thread — no new concurrency primitive.

**Rationale:**

- This is the direct, explicit mitigation for the risk named in Context, point 3. ADR-0014's Render crash happened because embedding compute had no bound relative to the container's memory; this decision makes sure conversation history can't repeat that failure mode, by construction, rather than by hoping traffic stays low.
- A client that never supplies `session_id` would otherwise mint a new session on every single request — `CHAT_MAX_SESSIONS` bounds the worst case to a fixed, small memory footprint regardless of how a caller behaves. ADR-0006's existing per-IP rate limit (`10/minute`) already throttles how fast one client can do this; this decision adds a second, independent backstop rather than relying on the rate limiter alone to prevent an unrelated failure mode.
- TTL-based eviction is what makes "ephemeral" in Decision 1 an enforced property, not just a description — a session that goes quiet is reclaimed, not held indefinitely.
- Follows the exact settings pattern already used everywhere else in this codebase (`pydantic-settings`, `validation_alias`, a documented default) — no new configuration mechanism.

## Decision 7: Session store lives in a new `session/` package, mirroring `llm_client/` and `the_hub_client/`

**Decision:** New top-level package `session/`: `session/models.py` (`SessionState` — `turns: list[ChatTurn]`, `last_filters: ExtractedFilters`, `last_seen`) and `session/store.py` (the bounded in-memory store from Decision 6, exposed via a `get_session_store()` singleton following the `@lru_cache` pattern already used by `get_settings()`/`get_qdrant_client()`, overridable in tests the same way `app.dependency_overrides[get_chat_generator]` already works today).

**Rationale:**

- Matches this project's consistent pattern of isolating a cross-cutting concern behind its own package boundary (`the_hub_client` for the Hub API, `llm_client` for generation) rather than growing `api/main.py` or reaching into `db/` for something `db/` has no reason to know about — `db/query_filters.py` stays retrieval-focused and gains no session awareness; the carry-forward merge from Decision 5 is a small pure function called from `api/main.py`, independently unit-testable the same way `tests/db/test_query_filters.py` already tests extraction in isolation.
- Reuses `ExtractedFilters` from `db/query_filters.py` directly rather than inventing a parallel filter type — one less concept to keep in sync.
- This package is deliberately the natural future home for Phase 2's session-scoped candidate profile (PRODUCT_VISION Phase 2) — extending `SessionState` with profile fields later reuses this exact session identity and store rather than requiring a second, parallel mechanism. Worth naming now so Phase 2 doesn't have to re-derive it.

## Decision 8: LLM-based query condensation and intent-driven filter inference are explicitly out of scope for this ADR

**Decision:** This ADR does not add any LLM call to the retrieval-scoping path. Rewriting a follow-up question into a standalone query before embedding it, and inferring filters from conversational intent via an LLM rather than the deterministic lookup table, are both named here as a deferred, separately-evaluated future decision — not designed in this document.

**Rationale:**

- This is the same reasoning ADR-0002 Decision 3 already used to reject LLM-based filter extraction for single-turn phrasing gaps (Option B, never built): don't add a probabilistic step to a path whose entire value proposition is structural correctness, without evidence a deterministic fix is insufficient.
- Keeps this feature "still simple RAG" per the explicit scoping decision this ADR is built on: one new optional `Generator` parameter and one new deterministic carry-forward rule, no new reasoning step, no tool-calling, no agent loop. The pipeline shape (one retrieval call, one generation call, per request) is unchanged from today.
- Should this be picked up later, it is a bounded LLM reasoning step inserted into an otherwise-fixed pipeline (history + question → condensed query/filters → one retrieval call → one generation call) — not an open-ended agent with tool choice. Worth stating that distinction now so a future ADR doesn't overshoot the actual need. See Revisit triggers.

## Consequences

**Positive:**

- Closes ADR-0001 Decision 4's and ADR-0004 Decision 3's revisit triggers with a design that adds no new infrastructure, no new per-request cost beyond a bounded history window, and no agentic surface.
- Fully decoupled from the embedding model and from ALE-183 — retrieval is untouched (Decision 4), so this ADR can ship independently of that spike's outcome in either direction.
- The filter carry-forward (Decision 5) directly answers a gap this project's own docs already named (ADR-0004's Context, PRODUCT_VISION's tier-4 framing) using the same deterministic, evidence-first posture as every prior filtering decision.
- The session-store bound (Decision 6) is a direct, explicit application of the lesson ADR-0014 already paid for — bounded by construction, not by hoping traffic stays low.
- `session/` (Decision 7) is designed to be Phase 2's candidate-profile carrier, not a throwaway mechanism that gets replaced when that phase starts.

**Negative / accepted risks:**

- In-memory storage does not survive a process restart (Render redeploy, or a cold start after the documented 15-minute spin-down, ADR-0013 Decision 3) — a live conversation silently loses its history mid-session. Accepted for a prototype; same trade-off class as ADR-0006's in-memory rate limiter.
- Breaks under multiple workers/instances/replicas exactly like ADR-0006's rate limiter — same revisit trigger, now duplicated across two subsystems. If that trigger ever fires, both should move to Redis together, not independently, to avoid fixing one and leaving the other silently broken.
- No "clear the filter" phrase exists yet (Decision 5) — accepted as a graceful, non-erroring gap, not solved here.
- A client that omits `session_id` on every request creates a new session each time; `CHAT_MAX_SESSIONS` and the existing per-IP rate limit bound the damage but don't eliminate the pattern.
- Conversation history re-entering the prompt is new untrusted-content surface layered on top of ADR-0012's existing threat model (a user's own prior turns, and the model's own prior outputs, are both attacker-influenceable if the API key is shared with anyone untrusted). Decision 3's delimiting mitigates but does not fully resolve this — ADR-0012's mitigations were scoped to job `document_text` specifically and haven't been evaluated against conversational history as an injection vector.
- Every `Generator` implementation and its test doubles need a mechanical signature update (Decision 3) — small, but real, non-zero-diff work across `GeminiGenerator`, `OllamaGenerator`, `StubGenerator`, and the fakes in `tests/api/test_chat.py`, `tests/llm_client/test_base.py`, `tests/db/test_generation.py`, and `tests/evals/test_comparison_helpers.py`.

## Revisit triggers

- If the backend ever moves to multiple workers, instances, or replicas, move the session store to Redis — identical trigger and remedy as ADR-0006; revisit both together.
- If real usage shows the missing "clear the filter" phrase (Decision 5) causing bad experiences, extend `db/query_filters.py` with an explicit phrase list (mirroring `REMOTE_NEUTRAL_PHRASES`) before reaching for anything probabilistic.
- If real transcripts show follow-up questions that deterministic filter carry-forward can't resolve (pronoun/ellipsis resolution genuinely requiring semantic reformulation, not just missing filter scope), revisit LLM-based query condensation and intent-driven filter inference — Decision 8's deferred phase 2. Evaluate with real transcripts first, the same evidentiary bar ADR-0002 already set for its own Option B, not assumed necessary in advance.
- If phase 2's query condensation is eventually built and folds prior-turn text into the embedding query, revisit the embedding model's context window at that point — this is where ALE-183's findings become directly relevant; they are not relevant to this ADR as written.
- ADR-0004 Decision 3 is superseded by this ADR once implemented — the frontend implementation ticket (ALE-185) must start sending `session_id` and stop treating history as display-only. Recorded here as a revision-via-follow-up per this project's existing convention (see ADR-0013's own note on why Decision 2 was revised via ADR-0016 rather than edited in place), not edited into ADR-0004 directly.
- If Phase 2's candidate profile (PRODUCT_VISION) is scheduled, extend `SessionState` (Decision 7) rather than building a second, parallel session mechanism.
- If ADR-0012's injection logging (once implemented) shows conversation history being used as an injection vector, extend its delimiting/stripping approach to history specifically, not just job `document_text`.

## Alternatives considered and rejected (for now)

- **Redis-backed session store from the start** — rejected on the same grounds ADR-0006 already rejected it for rate limiting: the current single-instance deployment doesn't need it, and it would be new infrastructure against a $0/month posture (ADR-0013) with no evidence it's required yet. Not rejected permanently — same revisit trigger as ADR-0006.
- **A persistent (database-backed) history table** — rejected: no relational store exists in this architecture today, persisting conversation content raises the still-open privacy/retention questions ALE-103 flagged, and a prototype-stage feature doesn't yet justify that commitment. Revisit if cross-session persistence becomes a real product requirement (Phase 2/3).
- **Folding history into the existing `context` string instead of a new `Generator.generate()` parameter** — rejected: blurs the job-data/history distinction that ADR-0009's and ADR-0012's grounding and injection checks both currently rely on `context` meaning "retrieved job data, specifically."
- **Cookie-based session identification** — rejected: reintroduces cross-origin cookie complexity (SameSite/secure-flag handling across the Cloudflare Pages ↔ Render origin split, ADR-0004 Decision 5) for no benefit over a field already carried in the typed JSON contract the frontend already parses on every response.
- **LLM-based query condensation / intent-driven filter inference now, bundled into this ADR** — rejected per Decision 8; the explicit scoping decision behind this ADR is to ship the deterministic version first and defer the probabilistic upgrade until evidence calls for it, mirroring ADR-0002 Decision 3's Option B precedent exactly.
- **Deriving session identity from the shared API key (ADR-0011)** — rejected: the key identifies an approved caller, not an individual, and multiple collaborators can hold independent keys; using it as a session key would merge unrelated conversations together.
