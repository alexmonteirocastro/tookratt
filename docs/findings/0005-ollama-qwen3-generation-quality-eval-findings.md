# ALE-110 Findings: Generation-Quality Eval — Ollama `qwen3:8b` vs Gemini (vs `qwen3:4b`)

* **Ticket:** ALE-110 (child of ALE-148)
* **Related:** ADR-0007 (local Ollama fallback, revisit trigger this ticket checks), ADR-0001 Decision 5 (generation eval separation), ALE-101 (`OllamaGenerator` implementation), ALE-147 (comparison harness used here), ALE-149 (`docs/findings/0004-...md`, first observed the `qwen3:4b` reasoning-leak this run corroborates), ALE-180 (tracking that leak), ALE-102 (ADR-0007 landing ticket, revisit-trigger result posted there)
* **Date:** 2026-08-16
* **Status:** Complete. `tests/fixtures/golden_generation.json`'s full 2-case set run against `gemini`, `ollama:qwen3:8b`, and `ollama:qwen3:4b` via `scripts/compare_generators.py` (ALE-147) — no new code, no CI changes.

## Summary

**ADR-0007's revisit trigger is checked and does not fire for `qwen3:8b`: it produced a clean, correctly-grounded answer matching Gemini's conclusion, with no failures beyond what Gemini itself showed.** That resolves ALE-110's core question — the model ADR-0007 actually evaluated and chose holds up.

**But `qwen3:4b` — this project's actual shipped default (`OLLAMA_MODEL`, chosen post-ADR "for faster CPU inference" per ADR-0007's implementation notes, not the model the ADR's Decision 2 rationale evaluated) — again leaked raw chain-of-thought into its answer instead of a clean response, on the same case, under the same code and `think: false` request.** This is the second independent observation of the same failure mode (first seen in ALE-149's spot-check, run #3), now reproduced on a different day, different script, different Ollama daemon session. **This strongly narrows ALE-180's root cause toward model-size-specific, not an Ollama-version regression** — `qwen3:8b` and `qwen3:4b` ran back-to-back, same daemon, same version, and only the smaller model leaked.

## Methodology

`uv run python scripts/compare_generators.py --providers gemini ollama:qwen3:8b ollama:qwen3:4b --top-k 5`, `OLLAMA_BASE_URL=http://localhost:11434/v1` (explicit override — same host-resolution footgun as ALE-149 when running outside Docker), `OLLAMA_TIMEOUT_SECONDS=180` (raised from the 60s default; `qwen3:4b` took 42s for one case in ALE-149's spike, and `qwen3:8b` is a larger model). Both models preloaded (`ollama run <model>` once) before the run. Full run against the disposable `JOBS_COMPARE_GENERATION` collection (14 golden jobs), both cases in `golden_generation.json`. Total wall-clock for the whole comparison command: 68.1s (ingestion + retrieval + 3 real generation calls — no per-call timing from this harness, unlike the throwaway ALE-149 script).

## Results

| Case | `gemini` | `ollama:qwen3:8b` | `ollama:qwen3:4b` |
|---|---|---|---|
| `backend_copenhagen` | Generated. Correct: no remote-backend-in-Copenhagen match among the 4 retrieved sources (`stu345`, `cph001`, `ts001`, `mno456`); cites `Platform Engineer` as the closest. | **Generated. Clean and correct** — *"There are no job listings for a remote backend engineer building APIs in Copenhagen, Denmark."* Same conclusion as Gemini, same retrieved sources, no hallucination. | **Generated, but not a clean answer.** Same sources retrieved, but the response is raw reasoning: *"We are given a question: 'remote backend engineer building APIs in Copenhagen Denmark' We have 4 job listings. We must check each one to see if it matches the description. The question asks for: - r…"* — chain-of-thought leaking into `content`, not a final answer, despite `think: false`. |
| `product_manager_stockholm` | Not generated — zero usable retrieval hits (`sources: []`, expected `def456`). | Not generated — same. | Not generated — same. |

`product_manager_stockholm` has now returned zero retrieval coverage in **three consecutive runs** across two different tickets (ALE-149 spot-check x2, this ALE-110 run) — this is a fixture/corpus gap (no job in the 14-job golden set scores above the retrieval floor for this query), reproducible and unrelated to generation quality or provider. Per ALE-110's own scope, rewriting the golden set is out of scope here; flagging for visibility rather than silently omitting, consistent with this project's convention. Worth a note in a future ALE-145/golden-set-maintenance pass.

## Interpretation

**`qwen3:8b` passes the check ADR-0007's revisit trigger describes.** The trigger reads: *"If the ADR-0001 Decision 5 generation-quality eval set is run against `qwen3:8b` and shows grounding failures beyond what's seen with Gemini, consider a larger local model (`qwen3:14b`)."* On the one case with retrieval coverage, `qwen3:8b` did not show any failure Gemini didn't also show — both correctly declined to claim a match, both cited the same closest job, neither hallucinated a source. **No grounding failure beyond Gemini observed → the trigger does not fire → no evidence here to justify moving to `qwen3:14b`.** (Caveat: sample size is one case, the same limitation ALE-149 already flagged for this fixture — see "Known limitation" below.)

**The more consequential finding is about `qwen3:4b`, not `qwen3:8b`.** ADR-0007's Decision 2 rationale is entirely about `qwen3:8b` — RAM headroom, Apache 2.0, instruction-following benchmarks, the "~5–12 tok/s" latency estimate. `qwen3:4b` only enters the picture in ADR-0007's post-acceptance **implementation notes**, as a default chosen "for faster CPU inference" — a change made without the same grounding-quality evaluation Decision 2 gave to `8b`. This eval is the first time that gap has been checked with real evidence, and it shows the substitution wasn't quality-neutral: `qwen3:8b` (the evaluated model) is clean, `qwen3:4b` (the shipped default) is not.

**For ALE-180:** this is strong corroborating evidence, not just a repeat of the same single observation. Two independent runs (different day, different script, different daemon session, same underlying `OllamaGenerator` code) both show `qwen3:4b` leaking reasoning and `qwen3:8b`/other models not leaking. That shifts ALE-180's open question from "is this reproducible at all" to "why does `4b` specifically not honor `think: false` as reliably as `8b`" — a narrower, more tractable investigation. It does not yet rule out an Ollama-version-related contribution (both runs happened on whatever Ollama version is currently installed locally; ADR-0007's original testing was five weeks earlier on a possibly different version), but the size-based split within the *same* Ollama installation is the stronger signal.

## Known limitation

`golden_generation.json` currently has only 2 cases, and only one (`backend_copenhagen`) has retrieval coverage — so this is a single data point per generator, not a statistically meaningful sample. Same caveat ALE-149 already carried forward. Acceptable for checking ADR-0007's binary revisit-trigger condition (any failure vs. none), but not strong enough evidence to declare `qwen3:8b` broadly production-ready without a larger golden set (ALE-145 territory, out of scope here).

## Acceptance criteria check (against ALE-110's own list)

* [x] Ran the generation eval against live Ollama (`qwen3:8b`) compared to Gemini — via `scripts/compare_generators.py` (ALE-147's tooling, which postdates this ticket's original text and supersedes the "manual `@pytest.mark.generation` + `LLM_PROVIDER=ollama`" approach it originally proposed) rather than a CI-integrated pytest run — same underlying `OllamaGenerator`/prompt/retrieval path, no CI change either way.
* [x] Documented pass/fail per case and the systematic failure mode found (this document).
* [x] Compared qualitatively to Gemini baseline (above).
* [x] Failure is model-specific (`qwen3:4b`, not `qwen3:8b`) — already filed as its own ticket, ALE-180, before this run; this document adds corroborating evidence rather than opening a new one.
* [x] CI unchanged — no workflow files touched, no Ollama dependency added to CI.

## Recommendation

* ADR-0007's guidance stands as originally evaluated: `qwen3:8b` is a viable local model on the grounding-fidelity criterion that matters most, per this (small) eval. No action needed on the ADR itself.
* The real gap is between what ADR-0007 evaluated (`qwen3:8b`) and what the code actually defaults to (`qwen3:4b`) — **resolved in ALE-180** ([findings 0006](0006-qwen3-4b-think-false-noop-findings.md)): default restored to `qwen3:8b`. The leak was the 2507 thinking-only retag of `qwen3:4b`, not a `think: false` plumbing bug.
* No change recommended to ALE-150's shortlist (`gpt-oss:20b-cloud` per ALE-149) — this ticket is about the local model, not Cloud.
