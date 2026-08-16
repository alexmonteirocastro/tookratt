# ALE-149 Spike Findings: Ollama Cloud as a Generation-Hosting Option

* **Ticket:** ALE-149 (child of ALE-148)
* **Related:** ADR-0007 (local Ollama fallback), ADR-0001 Decision 2b (provider-agnostic `Generator` seam), ALE-101 (`OllamaGenerator` implementation), ALE-146 (eval review UI), ALE-147 (comparison harness), ALE-150 (next: broader model comparison), ALE-180 (local `qwen3:4b` reasoning leak, filed from run #3)
* **Date:** 2026-08-16
* **Status:** Spot-check complete — all three generators (Gemini, local `qwen3:4b`, `gpt-oss:20b-cloud`) ran successfully in run #3. Recommendation below is final for this spike's scope. One finding (local `qwen3:4b` reasoning-leak, see run #3) is **out of scope for ALE-149 to fix** but should not be silently dropped — filed as ALE-180.

## Summary

**Recommendation: GO for dev/eval use of `gpt-oss:20b-cloud` — confirmed working, correctly grounded, latency essentially tied with Gemini (5.0s vs 5.1s) and ~8x faster than local CPU inference (42.0s) on the one case tested. Not a drop-in for the project's existing local model (different model family), and not recommended for production without further cost modeling. Unplanned but notable: run #3 also surfaced a live quality issue in the current production local-Ollama path, unrelated to Cloud — see "Unplanned finding" below.**

The auth/API question resolves cleanly — Ollama Cloud fits the existing `Generator` seam with a small, additive change (an authenticated `requests.Session`, not a new endpoint or a new `Generator` implementation). But the model-catalog question surfaces a real complication: **`qwen3:4b`/`qwen3:8b` — the exact model ADR-0007 already validated for local use — is not offered on Ollama Cloud under any tag.** Cloud only hosts a different, larger tier of models. Evaluating Cloud therefore means evaluating a different model, not "the same model, hosted," which changes the shape of the question ALE-148 is actually asking.

Free-tier limits are directionally usable for this project's traffic (Free is explicitly pitched at "chatting, evaluating larger models" — a description matching golden-set-sized eval runs) but Ollama does not publish concrete numbers the way Gemini's pricing page did for ADR-0001 — session/weekly resets exist, but "does a full run fit in one session" is unverified until the spot-check runs.

## Scope point 1: Free-tier fit

Source: [ollama.com/pricing](https://ollama.com/pricing) (official FAQ, fetched 2026-08-16).

* Every plan (Free, Pro, Max) has **session limits that reset every 5 hours** and **weekly limits that reset every 7 days**. Ollama does not publish the underlying numeric caps (RPM/RPD/tokens) for any plan — a meaningfully more opaque quota than Gemini's ADR-0001 pricing table, which at least stated approximate RPM/RPD even while calling them unstable.
* Usage is metered by **GPU time across input/cached-input/output tokens**, weighted by a per-model "usage level" (1 = light, e.g. `gpt-oss:20b-cloud`; 4 = extra heavy, e.g. `deepseek-v4-pro`) — not a flat token count. Heavier models burn the same session/weekly budget faster.
* **Free tier: 1 concurrent cloud model**, explicitly scoped by Ollama's own FAQ to "light usage" — their named example use cases are "chatting with models, evaluating larger models, coding/AI assistants with smaller models." That description is a reasonable match for this project's eval-set-sized traffic (2 cases today in `golden_generation.json`; ALE-150 will add more), but is explicitly *not* pitched at sustained/production traffic.
* Pro ($20/mo or $200/yr): 50x Free's usage, 3 concurrent models. Max ($100/mo): 5x Pro's usage (250x Free), 10 concurrent — **but new Max sign-ups are paused** (capacity constraints per Ollama's FAQ, as of this writing) even if this project wanted to pay for it.
* **Unverified:** whether a full golden-generation-set run fits inside one 5-hour session. Given the current fixture is only 2 cases, almost certainly yes; this matters more once ALE-150 broadens the set. This is exactly what the spot-check (below) is built to observe empirically rather than assume.

## Scope point 2: Auth/API compatibility

Source: `llm_client/ollama.py`, `llm_client/settings.py` (this repo, read at HEAD) + [docs.ollama.com/api/authentication](https://docs.ollama.com/api/authentication), [docs.ollama.com/cloud](https://docs.ollama.com/cloud) (fetched 2026-08-16).

**This is the strongest finding of the spike: it fits ADR-0001 Decision 2b's stated promise almost exactly.**

* Ollama Cloud's direct API (`https://ollama.com/api`) uses `Authorization: Bearer $OLLAMA_API_KEY`, created at `ollama.com/settings/keys`. Local Ollama (`http://localhost:11434`) sends no auth at all — this is genuinely optional, not a required field that would have to be threaded everywhere.
* Ollama Cloud's native endpoints are the **same shapes** `OllamaGenerator` already calls: `POST /api/chat` with the same streaming, `messages`, and `options.num_predict` fields ADR-0007's implementation notes describe. There is no need to switch to the OpenAI-compatible `/v1/chat/completions` surface (which ADR-0007 already rejected for local, for `think: false` and streaming reasons that plausibly still apply on Cloud — untested here, flagged as an open question below).
* `OllamaGenerator.native_ollama_base_url()` already derives the correct root from `OLLAMA_BASE_URL` without any code change: pointing it at `https://ollama.com` (no `/v1` suffix) resolves to `https://ollama.com/api/chat` — exactly Ollama's documented cURL example.
* The **only** gap is that `OllamaGenerator` never sends an `Authorization` header, and `LLMSettings` has no API-key field for it. But `OllamaGenerator.__init__` already accepts an injectable `requests.Session` — so the missing piece can be supplied via composition (a session with the header pre-set), with **zero changes to `llm_client/ollama.py` itself**. The spot-check did exactly this as proof.
* If ALE-149 recommends moving forward, the real (out-of-scope-for-this-ticket) implementation is small: one optional `ollama_api_key: str` field on `LLMSettings` (mirroring how `gemini_api_key` is conditionally required per ADR-0007 Decision 4), threaded into whatever constructs the production `OllamaGenerator`, to build that same authenticated session. **No new `Generator` implementation needed** — this resolves the ticket's own open question in favor of "fits the existing interface."
* **Confirmed by spot-check run #1, not just a theoretical risk:** `gpt-oss:20b-cloud` returned HTTP 200 and streamed a response, but `message.content` was empty across the entire stream — `OllamaGenerator`'s own empty-response guard fired. No auth/connectivity problem; this is a request-shape mismatch. Working hypothesis: `gpt-oss` is a reasoning model whose chain-of-thought and final answer arrive as separate fields, and with this project's local-tuned defaults (`think: false`, `num_predict: 256`) the model spends its entire token budget on hidden reasoning before any `content` token is ever emitted — the same *class* of quirk ADR-0007 already documented for Qwen3 on the OpenAI-compat endpoint, just showing up here on gpt-oss's native endpoint instead, with different parameters. **Auth compatibility is clean; per-model request/response-shape compatibility is not guaranteed and needs verifying per model**, same caveat as the model-catalog gating finding below. Run #2 (diagnostics added, higher `num_predict`) should confirm or rule this out.

## Scope point 3: Model catalog

Source: [ollama.com/search?c=cloud](https://ollama.com/search?c=cloud), [ollama.com/library/gpt-oss](https://ollama.com/library/gpt-oss), [ollama.com/library/qwen3.5/tags](https://ollama.com/library/qwen3.5/tags), [ollama.com/library/qwen3](https://ollama.com/library/qwen3), [ollama.com/blog/cloud-models](https://ollama.com/blog/cloud-models), [docs.ollama.com/cloud](https://docs.ollama.com/cloud) (retirement table) — all fetched 2026-08-16, not assumed from `qwen3:8b` alone per the ticket's own instruction.

**Headline finding: `qwen3` (the family ADR-0007 chose) has zero cloud-tagged models.** The `qwen3` library page lists only local sizes (0.6b–235b), no `-cloud` variant. The only Qwen-family cloud SKU is `qwen3.5:cloud`, which resolves to `qwen3.5:397b-cloud` — a ~400B-parameter MoE model, nothing like the 4B/8B dense model this project runs locally. `qwen3-coder:480b-cloud` (an earlier possible match) was retired July 15, 2026 in favor of that same `qwen3.5:397b-cloud`.

Broader cloud catalog, by usage level (from `ollama.com/pricing` FAQ + individual model pages):

| Model | Usage level | License / notes |
|---|---|---|
| `gpt-oss:20b-cloud` | **Low** (level 1) | Apache 2.0, OpenAI, reasoning-capable, 128K context. Best free-tier fit. |
| `gpt-oss:120b-cloud` | Medium | Apache 2.0, OpenAI, same family as above at ~6x the params. |
| `qwen3.5:cloud` (= `qwen3.5:397b-cloud`) | Medium | Only Qwen-family cloud option; far larger than local `qwen3:4b`. |
| `glm-5.1` / `glm-5.2` | — (not leveled in fetched data) | Z.ai flagship, agentic/coding-focused. |
| `deepseek-v4-flash` / `deepseek-v4-pro` | — / **Heavy (level 4)** | `deepseek-v4-pro` is Ollama's own example of the heaviest tier. |
| `kimi-k2.6` / `kimi-k2.7-code` | — | Moonshot AI, agentic/coding. |
| `nemotron-3-nano` / `-super` / `-ultra` | — | NVIDIA, efficiency-to-throughput spread. |
| `mistral-large-3`, `minimax-m2.7`/`m3` | — | General-purpose / agentic. |

Model availability is not static: Ollama's retirement table lists two upcoming (`minimax-m2.5`, `kimi-k2.5`, both July 31, 2026) and a longer list of already-retired cloud models (including two prior Qwen cloud SKUs). **Any model chosen for ALE-150 should be re-checked against the live catalog at that time, not locked in from this document.**

**Correction from spot-check run #1 (2026-08-16):** `qwen3.5:cloud` returned `HTTP 403: this model requires a subscription, upgrade for access` on Alex's Free-plan account. The catalog page's "Medium Usage" label does **not** mean "accessible on Free at a higher quota cost" — some cloud-tagged models are Pro/Max-gated outright, and the model list/tags pages give no visible signal of that gating. `gpt-oss:20b-cloud` did not 403, confirming it really is Free-tier reachable. **Practical implication: don't trust a model's presence in the `c=cloud` search filter as confirmation it's usable on Free — each candidate needs an actual authenticated call to confirm, the same way this spike just did.**

**Recommendation for ALE-150 (sub-issue 3):** lead with `gpt-oss:20b-cloud` — the only cloud model confirmed reachable on Free so far, permissive license matching ADR-0007 Decision 2's Apache-2.0 preference, and a genuinely different architecture/provider worth comparing against Qwen. Drop `qwen3.5:cloud` from the free-tier shortlist entirely unless this project upgrades to Pro. Before ALE-150 invests further, spot-check any additional candidate model with a real authenticated call first — don't plan a comparison sweep around catalog listings alone.

## Scope point 4: Latency/quality spot-check

**Status: complete (2026-08-16, run #3). All three generators produced results on `backend_copenhagen` — full three-way comparison achieved.**

Run #1 result summary — inconclusive, but diagnostic (`top_k=3`):

| Generator | `backend_copenhagen` | `product_manager_stockholm` | Latency |
|---|---|---|---|
| `gemini` | Generated (no source match — golden fixture uses placeholder IDs, expected) | No usable retrieval hits (all generators) — golden-set/top-k limitation | 2.4s |
| `ollama-local-qwen3:4b` | `GenerationUnavailableError` — DNS failure on `host.docker.internal` (script bug) | — | invalid |
| `ollama-cloud-gpt-oss-20b` | `GenerationUnavailableError` — empty response | — | 3.1s, no real answer |
| `ollama-cloud-qwen3.5` | `HTTP 403` — subscription required | — | rejected |

Run #2 result summary — script fixed (explicit `localhost:11434` override for the local leg, `qwen3.5:cloud` dropped, `num_predict` raised to 1024 + stream diagnostics for the cloud call), `top_k=5`:

| Generator | `backend_copenhagen` | `product_manager_stockholm` | Latency |
|---|---|---|---|
| `gemini` | Generated — correctly says no exact match, cites `Platform Engineer` (`stu345`) as the closest listed role, no hallucinated links | No usable retrieval hits (still, even at `top_k=5` — the 14-job golden fixture appears to have no job scoring above the floor for this query; a fixture/corpus gap, not a generation or Cloud issue) | **3.9s** |
| `ollama-local-qwen3:4b` | `GenerationUnavailableError` — `Connection refused` on `localhost:11434`: the Ollama daemon simply wasn't running this round (`ollama serve` not started) | — | invalid |
| `ollama-cloud-gpt-oss-20b` | **Generated** — same conclusion as Gemini: no exact match, cites the same `Platform Engineer` (`stu345`) job, no hallucinated links | — | **3.4s** |

**The reasoning-budget hypothesis from run #1 is confirmed as the root cause**, not just a plausible guess: raising `ollama_num_predict` from this project's local-CPU-tuned default (256) to 1024 for the Cloud call was the only change between "empty response" and a real, well-grounded answer. `think: false` did not need to change — the fix was giving the model enough token budget to get past hidden reasoning to actual content, not a `think` flag problem. **Practical implication for any future implementation ticket:** `OLLAMA_NUM_PREDICT=256` is tuned for CPU-latency reasons specific to local `qwen3:4b` (ADR-0007 Decision 4) and does not transfer to Cloud/`gpt-oss` — a Cloud-specific override (or a per-provider default) would be needed, not a shared constant.

**Quality, on this one case:** `gpt-oss:20b-cloud`'s answer matched Gemini's in substance — same correct "no exact match" conclusion, same cited job, same clean grounding (no fabricated links or job details). One case is not a quality verdict, but it's a genuinely positive signal on the property ADR-0001 named as the one that matters most (reliably following "answer only from context, admit uncertainty").

**Latency, on this one case:** Cloud (3.4s) was competitive with Gemini (3.9s) — not the "~5–12 tok/s, noticeably slower than Gemini" profile ADR-0007 established for local CPU inference. This is a meaningfully different latency story than local Ollama's.

### Run #3 (2026-08-16) — complete three-way comparison

`ollama serve` started locally, same script, same case:

| Generator | `backend_copenhagen` answer | Latency |
|---|---|---|
| `gemini` | Clean, correct — no exact match for remote-backend-in-Copenhagen among the listings | **5.1s** |
| `ollama-local-qwen3:4b` | **Not a clean answer** — raw chain-of-thought leaked into `content`: *"We are given a question... We have 4 job listings. We need to check which job listings match the description. Let's break down the question: - 'remote': ... - 'backend engineer': ..."* despite `think: false` on the request | **42.0s** |
| `ollama-cloud-gpt-oss-20b` | Clean, correct — no exact match, cites `Platform Engineer`/`stu345` as the closest role, explicitly notes it isn't in Copenhagen | **5.0s** |

`product_manager_stockholm` remained empty for all three generators across all three runs — confirmed reproducible, and confirmed a retrieval/fixture-coverage gap (no job in the 14-job golden set scores above the floor for that query), not a generation or Cloud issue.

**Latency, now fully three-way:** Cloud (5.0s) and Gemini (5.1s) are effectively tied. Local CPU inference (42.0s) is ~8x slower than either — worse than ADR-0007's "~5–12 tok/s, noticeably slower" framing suggested in the abstract, though part of that gap here is inflated by the extra reasoning tokens local `qwen3:4b` emitted as content (see below) rather than a clean final answer.

### Unplanned finding: local `qwen3:4b` is leaking reasoning into `/chat` answers (out of scope for ALE-149, flagged here per "nothing silently deferred")

This is **not** a Cloud finding — it reproduced against the current, unmodified `OllamaGenerator` pointed at local Ollama, on the exact request shape (`/api/chat`, `think: false`) ADR-0007 Decision 3's implementation notes describe as the fix for exactly this class of problem (there, on the OpenAI-compat endpoint for Qwen3; the native endpoint was adopted specifically because it was expected to respect `think: false`). Seeing the same failure mode on the native endpoint now — five weeks after ADR-0007 was accepted, and specifically on `qwen3:4b` rather than the `qwen3:8b` ADR-0007's own decision rationale discusses — means one of two things: either local Ollama's handling of `think: false` for Qwen3-family models has regressed/changed since ADR-0007 shipped, or `qwen3:4b` specifically (vs. `8b`) doesn't honor it as reliably. Either way, this affects the current production dev-fallback path today, independent of anything to do with Ollama Cloud.

**Follow-up is ALE-180** (Local `qwen3:4b` leaking chain-of-thought into `/chat` answers despite `think: false`), not folded into ALE-149/ALE-148/ALE-150. It's a correctness regression in a path this project already ships, and deserves its own investigation rather than being a footnote in a Cloud-hosting spike.

## Scope point 5: Cost/limits at production scale

Source: [ollama.com/pricing](https://ollama.com/pricing), fetched 2026-08-16.

* Explicitly named per the ticket's instruction, even though the answer is "not now": Ollama Cloud's Free tier is not positioned as a production tier by Ollama's own docs (their example use cases stop at "coding and AI assistants with smaller models"). Using it for the `/chat` path in production would mean at minimum Pro ($20/mo or $200/yr), and Max ($100/mo) is currently closed to new sign-ups regardless.
* Unlike Gemini (ADR-0001's pricing table gave $/1M-token input/output figures), **Ollama Cloud publishes no per-token or per-request rate for paid usage** — Pro/Max are flat monthly fees with an opaque "extra usage balance," and the rate that balance draws down at is not stated anywhere in the pricing FAQ. This makes it structurally harder to project cost at a given traffic volume than it was for Gemini in ADR-0001 — there's no formula to plug real numbers into, only "50x more than Free" and "5x more than Pro," which are relative, not absolute.
* On privacy: Ollama states prompt/response data is "never logged or trained on" for Cloud, a stronger stance than Gemini's free tier (which ADR-0001 flagged as usable for product improvement). If this project's `/chat` inputs are ever considered sensitive, that's a point in Cloud's favor independent of cost — though hosting is "primarily United States," so it doesn't resolve the EEA/UK/Switzerland regional question ADR-0001 raised for Gemini's paid tier either (Cloud carries no equivalent stated restriction today, but also no explicit EU hosting guarantee).
* **Bottom line, named explicitly per the ticket's scope:** if this project ever wants Cloud in the production `/chat` path, that decision needs (a) a paid plan, (b) real observed token/GPU consumption from actual traffic to estimate what "extra usage" would cost (since no rate is published), and (c) a fresh look at whether `qwen3.5:397b-cloud`/`gpt-oss:120b-cloud`-class models are worth their cost versus just paying for Gemini's already-metered paid tier (ADR-0001's own "revisit trigger" list already covers that comparison for Gemini specifically). None of that is resolved by this spike — dev/eval only for now, matching this document's overall recommendation.

## Decision

**GO for dev/eval use of `gpt-oss:20b-cloud` — confirmed working across two independent runs, correctly grounded both times, latency essentially tied with Gemini and ~8x faster than local CPU inference on the one case tested.** NO-GO on treating Cloud as a substitute for the *model* validated in ADR-0007 (`qwen3:4b`/`8b` isn't offered on Cloud at all). NO-GO on production use without a follow-up cost/traffic-modeling pass. Separately: local `qwen3:4b` has a live quality issue (reasoning leaking into answers) that this spike surfaced but is not scoped to fix — see ALE-180.

| Question | Answer |
|---|---|
| Does Cloud fit the existing `Generator` interface? | **Yes** — small additive change (auth header via session composition), no new `Generator` implementation. Confirmed across all three runs; auth was never the failure mode. |
| Does Cloud host this project's validated model (`qwen3:4b`/`8b`)? | **No** — Qwen family's only cloud SKU is a ~400B model, and it's Pro/Max-gated on top of that (confirmed via live 403). |
| Which free-tier model actually works, end to end? | `gpt-oss:20b-cloud` — confirmed reachable on Free and, once `num_predict` is raised past this project's CPU-tuned default, produces a real, correctly-grounded answer, reproducibly (two successful runs). |
| Is free-tier usage plausible for eval traffic? | **Yes for a handful of manual queries** (three runs, well within session/weekly limits); a full ALE-150-scale sweep's session-limit headroom is still unverified — no published numeric caps to check against ahead of time. |
| How does Cloud's quality/latency compare to Gemini? | **Comparable** — same correct grounded conclusion both times it ran, 5.0s vs Gemini's 5.1s in the full three-way run. Two data points, same direction; still not a statistically large sample. |
| How does Cloud compare to local `qwen3:4b`? | **Cloud wins decisively on latency** (5.0s vs. 42.0s, ~8x) **and on answer cleanliness** (correctly-grounded final answer vs. leaked chain-of-thought) in the one head-to-head run completed. |
| Ready for production `/chat` traffic? | **No** — Free tier is explicitly not positioned for it, and paid tiers have no published $/token rate to model cost against. |

This result meaningfully sharpens ALE-148's parent question ("should Ollama play a bigger role than dev fallback only"): the honest answer per this spike is "not local Ollama as currently configured" (latency and now a quality regression both count against it) but **"Ollama Cloud's `gpt-oss:20b-cloud`, yes, worth a real place in the dev/eval rotation"** — a different and more specific claim than ALE-148 originally posed.

## Open items

1. **ALE-150 model shortlist:** lead with `gpt-oss:20b-cloud`, drop `qwen3.5:cloud` (Pro/Max-gated). Re-verify any additional candidate with a live authenticated call before committing to it in the sweep — catalog listings alone weren't a reliable signal in this spike.
2. **ALE-180:** local `qwen3:4b` leaking chain-of-thought into `/chat` answers despite `think: false` — a correctness regression in the current production dev-fallback path, found as a byproduct of this spike.
3. This document is in a state ready to close ALE-149 against — no further spot-check runs needed unless new questions come up.

## Out of scope (unchanged from ticket)

* No code changes to `llm_client/` or `evals/` — the spot-check proved the auth approach via composition in a throwaway script, not a repo change.
* No production traffic routing decision.
* No ADR — if this spike's findings (once the spot-check completes) support giving Ollama Cloud a larger role than "dev/eval option," that's ALE-148's stated follow-up ADR, not decided here.
