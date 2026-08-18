# ADR-0018: `/chat` Sourcing Follows Fused RRF Rank — Dense Cosine Is Display-Only

* **Status:** Accepted
* **Date:** 2026-08-18
* **Related:** ALE-186 (this ADR), [ADR-0010](0010-sparse-bm25-hybrid-search.md) Decision 7 (reversed here — dense cosine no longer gates `/chat`), [ADR-0002](0002-retrieval-filtering-strategy.md) Decision 4 (hard-omit cosine floor — no longer gates `/chat`; still used for evals/sweep), [ADR-0014](0014-embedding-model-migration.md) / ALE-138 (E5 score space and `0.85` calibration), [ADR-0015](0015-observability-logging-and-alerting.md) (`log_chat_request` per-source scores), [docs/findings/0008-ollama-hosted-embedding-models-larger-context-findings.md](../findings/0008-ollama-hosted-embedding-models-larger-context-findings.md) (ALE-183 evidence)

## Context

ADR-0010 Decision 7 ranked `/chat` with dense+BM25 RRF but floored sources on **pre-fusion dense cosine** (`CHAT_SOURCE_MIN_SCORE=0.85`). Hits in the fused ranking but missing from the companion dense top-k received `MISSING_DENSE_SCORE = -1.0` and were omitted. The companion query's `limit` was intentionally not padded, so that missing-dense rule would hold.

ALE-183's production-corpus eval found this is an under-score / floor-exclusion problem, not missed retrieval. On 10 real long-document `/chat` queries against `JOBS_ON_THE_HUB`, e5-small ranked all 10 in the fused top-4 (6 at rank #1), yet **6/10 failed the 0.85 floor** (dense scores ~0.831–0.845) and would never reach `/chat` sources. The original ALE-186 observation — fused rank-1 `backend-copenhagen` attached `-1.0` — is the same mechanism: a BM25-strong hit with no dense companion.

## Decision 1: `/chat` eligibility is fused RRF top-k + usable `document_text`

**Decision:** After hybrid RRF retrieval, include every fused hit that has non-empty `document_text` in `ChatResponse.sources` and generation context. Do **not** omit on dense cosine or on `MISSING_DENSE_SCORE`. `NO_MATCHING_JOBS_MESSAGE` only when nothing usable remains.

Dense cosine remains attached to `hit.score` for display (`/chat` sources, `/jobs/search`) and for eval/sweep tooling. `CHAT_SOURCE_MIN_SCORE` stays in settings as an eval-only knob; `POST /chat` does not read it.

**Rationale:**

- Ranking already works. The 6/10 ALE-183 misses were correctly RRF-ranked; the dense floor dropped them.
- Recalibrating the dense number cannot close the original BM25-only rank-1 case: once that hit gets a real dense score, it may still sit under any cosine floor (that is why it was missing from the unpadded companion).
- Country/remote payload filtering (ADR-0002 Decision 1) and RRF ranking (ADR-0010 Decision 3) are unchanged.

## Decision 2: Pad the companion dense query to `prefetch_limit`

**Decision:** In the same `query_batch_points` batch as the fused query, set the companion dense `limit` to `prefetch_limit` (`max(limit * 4, 20)`), matching the dense/sparse prefetch width. Residual `-1.0` remains possible for a fused hit still outside that window; it is a display fallback, not an omit.

**Rationale:** Display scores should be real cosine for BM25-promoted hits whenever the companion can see them. Padding stays in-batch — no extra round trip. A sequential HasId follow-up would guarantee every fused ID a score at the cost of another free-tier RTT; not taken.

## Alternatives considered and rejected (for now)

- **Sentinel-only (pad companion, keep `0.85`)** — leaves the 6/10 under-scores. The ticket's widened scope named this explicitly as insufficient.
- **Recalibrate the dense floor (~0.75–0.83)** — the ALE-91 noise band (0.55–0.63) is **BGE-era** (ADR-0002, 2026-07-06). E5 scores overlap around 0.83–0.87 with a negative margin (ALE-138). The ALE-183 false negatives (0.831–0.845) sit **inside that E5 overlap**, not above a clean gap over 0.55–0.63. A 0.75–0.80 E5 floor sits below both signal and noise, and still would not guarantee BM25-only fused hits once they acquire a real dense score.
- **Dual-gate (admit missing-dense, keep `0.85` for scored hits)** — fixes the `-1.0` sentinel, not the 6/10.

## Consequences

**Positive:**

- Well-ranked RRF hits reach `/chat` sources even when dense cosine is under 0.85 or missing.
- Companion padding makes `-1.0` in the API rare without a second request. Residual negative scores are omitted from `SourceList` (compact chips and debug cards) so they do not render as `-1.00`.
- Eval/sweep tooling can still apply a floor when explicitly requested.

**Negative / accepted risks:**

- Retires the ALE-91 cosine omit-gate. A fused hit at BGE-era 0.62 with `document_text` **will** become a `/chat` source. Under production E5, off-topic top-k is unlikely to live at 0.62; the live analogue is high-scoring confusers (findings 0002, ~0.85), which already passed today's 0.85 floor. Role-confusion (ALE-151) is unchanged.
- `/chat` may now return a full `limit` of sources for weak queries instead of the no-match fallback.

This accepted risk is **monitored**, not hope-based. `log_chat_request` already emits per-source dense scores on every `/chat` call (`retrieved_jobs[].score`, ADR-0015). Restoring a floor can be decided from existing Loki logs; no new instrumentation.

## Revisit triggers

- If Loki `/chat` logs show off-topic queries citing misleading sources (the original ALE-91 failure, in E5 score space), restore a floor then — do not guess a new number in this ticket.
- Role/topic confusion (ALE-151) remains a distinct failure mode; this ADR does not address it.

## Out of scope

* Embedding-model swap (ALE-183 NO-GO).
* Recalibrating a numeric RRF or dense floor.
* Fixing role-confusion (ALE-151).
