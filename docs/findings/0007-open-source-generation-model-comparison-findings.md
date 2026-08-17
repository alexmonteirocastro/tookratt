# ALE-150 Findings: Open-Source Generation Model Comparison — `qwen3:8b` & `gpt-oss:20b-cloud` vs Gemini

* **Ticket:** ALE-150 (child of ALE-148)
* **Related:** ADR-0007 (local Ollama fallback), ADR-0001 Decision 5 (generation eval separation), ALE-147 (comparison harness), ALE-149 / [`0004-...md`](0004-ollama-cloud-generation-hosting-spike-findings.md) (Cloud spike, candidate shortlist), ALE-110 / [`0005-...md`](0005-ollama-qwen3-generation-quality-eval-findings.md) (`qwen3:8b` first eval), ALE-180 / [`0006-...md`](0006-qwen3-4b-think-false-noop-findings.md) (`qwen3:4b` leak, default reverted to `qwen3:8b`), ALE-181 (Cloud auth plumbing that makes this run possible without a throwaway script)
* **Date:** 2026-08-17
* **Status:** Complete. Golden generation set run against `gemini`, `ollama:qwen3:8b`, and `ollama:gpt-oss:20b-cloud` via `scripts/compare_generators.py` (ALE-147, extended in this same PR with per-call `duration_seconds` instrumentation).

## Summary

**`qwen3:8b` continues to hold up as the accepted local fallback**: clean, correctly grounded, matches Gemini's conclusion on the one case with retrieval coverage — consistent with ALE-110 and no CoT leak (confirms ALE-180's fix). No change to ADR-0007.

**`gpt-oss:20b-cloud`'s latency is genuinely competitive with Gemini** (6.8s vs. 4.4–6.4s), confirming ALE-149's original observation and far ahead of local `qwen3:8b` (16.3s). But this run also surfaces a **precision gap not previously observed**: on `backend_copenhagen`, `gpt-oss:20b-cloud` states *"The only listing that matches... is Platform Engineer at Remote First Co."* — asserting a match that both Gemini and `qwen3:8b` correctly declined. The harness's ungrounded-URL/ungrounded-phrase checks do not flag this, because the cited job and URL are genuinely present in the retrieved context; the failure is a semantic overclaim (a "this matches" judgment call), not a hallucinated fact. This tempers, rather than reverses, ALE-149's earlier "correctly grounded" finding — that check was about link/fact fidelity on different cases, not match-precision, and this is the first time match-precision specifically has been checked against this model.

## Methodology

Local and Cloud legs need different `OLLAMA_BASE_URL`/auth and cannot share one process, so this ran as two separate invocations of `scripts/compare_generators.py` (ALE-147's tooling), both against the full `tests/fixtures/golden_generation.json` (2 cases) and the disposable `JOBS_COMPARE_GENERATION` collection (14 jobs).

**Run 1** — local `qwen3:8b` (preloaded via `ollama run qwen3:8b` first, to avoid cold-start load time skewing the new per-call timing):
```
OLLAMA_BASE_URL=http://localhost:11434/v1 OLLAMA_TIMEOUT_SECONDS=180 \
  uv run python scripts/compare_generators.py --providers gemini ollama:qwen3:8b --top-k 5
```

**Run 2** — Ollama Cloud `gpt-oss:20b-cloud`:
```
OLLAMA_BASE_URL=https://ollama.com OLLAMA_API_KEY=<key> \
OLLAMA_NUM_PREDICT=1024 OLLAMA_TIMEOUT_SECONDS=180 \
  uv run python scripts/compare_generators.py --providers gemini ollama:gpt-oss:20b-cloud --top-k 5
```

This is the first run to use the per-call `duration_seconds` instrumentation added in this ticket's own PR (`evals/generation.py`, `evals/types.py`, `scripts/compare_generators.py`) — previously only aggregate command wall-clock was available (ALE-110), which mixed retrieval/ingestion time in with generation time.

## Results

| Case | `gemini` | `ollama:qwen3:8b` | `ollama:gpt-oss:20b-cloud` |
|---|---|---|---|
| `backend_copenhagen` | Generated (6.4s Run 1 / 4.4s Run 2). Correctly declines a match; cites `Platform Engineer` as the closest listing without claiming it matches. | **Generated (16.3s). Clean and correct** — matches Gemini's conclusion exactly (*"There are no job listings for a remote backend engineer building APIs in Copenhagen, Denmark."*), no chain-of-thought leak. | **Generated (6.8s), but overclaims a match** — *"The only listing that matches a remote backend-engineer role focused on building APIs is: Platform Engineer at Remote First Co."* No ungrounded-URL/phrase flag (the citation is real), but the conclusion itself is incorrect where Gemini and `qwen3:8b` both correctly declined. |
| `product_manager_stockholm` | Not generated — zero retrieval coverage (`sources: []`). | Not generated — same. | Not generated — same. Now the fourth/fifth consecutive occurrence across ALE-149/ALE-110/ALE-150 — confirmed fixture gap (ALE-110's `0005-...md`), unrelated to provider, out of scope here. |

### Latency

| Generator | `duration_seconds` (`backend_copenhagen`) |
|---|---|
| `gemini` (Run 1) | 6.4s |
| `gemini` (Run 2) | 4.4s |
| `ollama:qwen3:8b` | 16.3s |
| `ollama:gpt-oss:20b-cloud` | 6.8s |

`gpt-oss:20b-cloud` is roughly 2.4x faster than local `qwen3:8b` and within the same range as Gemini's own run-to-run variance. Single timed call per generator (n=1) — a point estimate, not a distribution.

## Interpretation

**`qwen3:8b`**: no new evidence to revisit ADR-0007. Correctly grounded across two independent evals now (ALE-110, this ticket), but ~2.5–3.7x slower than Gemini — the known trade-off the ADR already accepted.

**`gpt-oss:20b-cloud`**: the latency case for it is strong and now has real measured data behind it, not just ALE-149's qualitative "tied with Gemini" observation. The grounding case is weaker than ALE-149 suggested: the one case that actually tests *declining a non-match* (rather than just avoiding hallucinated links/facts) is where it fails, and existing automated checks can't catch this class of failure. With n=1 on the only discriminating case available, this isn't strong enough to call it a systematic failure mode — but it's strong enough that "correctly grounded" from ALE-149 should not be read as "matches Gemini's judgment," which are different bars.

## Known limitation

Same `golden_generation.json` 2-case / 1-with-coverage limitation carried since ALE-149 and ALE-110 (ALE-145 territory to expand, out of scope here). Latency figures are single-call point estimates, not repeated-trial averages — the new instrumentation makes that measurement possible going forward, but this run doesn't exercise it.

## Acceptance criteria check

* [x] Comparison table/write-up covering all tested candidates vs. Gemini baseline — this document.
* [x] Clear recommendation on viability and capacity — below.

## Recommendation

* **`qwen3:8b` (local):** confirmed viable dev-only/offline fallback, correctly grounded and consistent with ADR-0007's original evaluation. Not latency-competitive with Gemini for anything beyond that role.
* **`gpt-oss:20b-cloud`:** latency is genuinely competitive with Gemini — the strongest point in its favor. Recommend keeping it in the dev/eval-comparison role ALE-149 already scoped (model comparison, spot-checking), but **not** promoting it to fallback or primary yet — the one case that specifically tests match-precision is where it currently fails, and a single case is not enough evidence either way. A dedicated eval expansion (ALE-145 territory: more near-miss / non-matching golden cases) should precede any stronger claim about this model.
* No open-source model is recommended to replace Gemini as the default/primary provider at this time. `qwen3:8b` remains the accepted local fallback (ADR-0007, unchanged). `gpt-oss:20b-cloud` remains dev/eval-only pending a precision-focused eval.
* **Revisit trigger** (for a future ticket/ADR, not filed now): before considering Ollama Cloud as a production fallback, expand `golden_generation.json` with additional near-miss/non-matching cases and re-run this comparison — match-precision, not just latency or link/fact grounding, needs to clear the bar.
