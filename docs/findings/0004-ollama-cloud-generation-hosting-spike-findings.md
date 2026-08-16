# ALE-149 Spike Findings: Ollama Cloud as a Generation-Hosting Option

* **Ticket:** ALE-149 (child of ALE-148)
* **Related:** ADR-0007 (local Ollama fallback), ADR-0001 Decision 2b (provider-agnostic `Generator` seam), ALE-101 (`OllamaGenerator` implementation), ALE-146 (eval review UI), ALE-147 (comparison harness), ALE-150 (next: broader model comparison)
* **Date:** 2026-08-16
* **Status:** Desk research complete — live latency/quality spot-check pending (script prepared, not yet run; see "Open item" below). Recommendation below is **provisional** pending that result.

## Summary

**Provisional recommendation: viable for dev/eval use, not a drop-in for the project's existing model, not recommended for production without further cost modeling.**

The auth/API question resolves cleanly — Ollama Cloud fits the existing `Generator` seam with a small, additive change (an authenticated `requests.Session`, not a new endpoint or a new `Generator` implementation). But the model-catalog question surfaces a real complication: **`qwen3:4b`/`qwen3:8b` — the exact model ADR-0007 already validated for local use — is not offered on Ollama Cloud under any tag.** Cloud only hosts a different, larger tier of models. Evaluating Cloud therefore means evaluating a different model, not "the same model, hosted," which changes the shape of the question ALE-148 is actually asking.

Free-tier limits are directionally usable for this project's traffic (Free is explicitly pitched at "chatting, evaluating larger models" — a description matching golden-set-sized eval runs) but Ollama does not publish concrete numbers the way Gemini's pricing page did for ADR-0001 — session/weekly resets exist, but "does a full run fit in one session" is unverified until the spot-check runs.

## Scope point 1: Free-tier fit

Source: [ollama.com/pricing](https://ollama.com/pricing) (official FAQ, fetched 2026-08-16).

* Every plan (Free, Pro, Max) has **session limits that reset every 5 hours** and **weekly limits that reset every 7 days**. Ollama does not publish the underlying numeric caps (RPM/RPD/tokens) for any plan — a meaningfully more opaque quota than Gemini's ADR-0001 pricing table, which at least stated approximate RPM/RPD even while calling them unstable.
* Usage is metered by **GPU time across input/cached-input/output tokens**, weighted by a per-model "usage level" (1 = light, e.g. `gpt-oss:20b-cloud`; 4 = extra heavy, e.g. `deepseek-v4-pro`) — not a flat token count. Heavier models burn the same session/weekly budget faster.
* **Free tier: 1 concurrent cloud model**, explicitly scoped by Ollama's own FAQ to "light usage" — their named example use cases are "chatting with models, evaluating larger models, coding/AI assistants with smaller models." That description is a reasonable match for this project's eval-set-sized traffic (2 cases today in `golden_generation.json`; ALE-150 will add more), but is explicitly *not* pitched at sustained/production traffic.
* Pro ($20/mo or $200/yr): 50x Free's usage, 3 concurrent models. Max ($100/mo): 5x Pro's usage (250x Free), 10 concurrent — **but new Max sign-ups are paused** (capacity constraints per Ollama's FAQ, as of this writing) even if this project wanted to pay for it.
* **Unverified:** whether a full golden-generation-set run fits inside one 5-hour session. Given the current fixture is only 2 cases, almost certainly yes; this matters more once ALE-150 broadens the set. This is exactly what the spot-check script (below) is built to observe empirically rather than assume.

## Scope point 2: Auth/API compatibility

Source: `llm_client/ollama.py`, `llm_client/settings.py` (this repo, read at HEAD) + [docs.ollama.com/api/authentication](https://docs.ollama.com/api/authentication), [docs.ollama.com/cloud](https://docs.ollama.com/cloud) (fetched 2026-08-16).

**This is the strongest finding of the spike: it fits ADR-0001 Decision 2b's stated promise almost exactly.**

* Ollama Cloud's direct API (`https://ollama.com/api`) uses `Authorization: Bearer $OLLAMA_API_KEY`, created at `ollama.com/settings/keys`. Local Ollama (`http://localhost:11434`) sends no auth at all — this is genuinely optional, not a required field that would have to be threaded everywhere.
* Ollama Cloud's native endpoints are the **same shapes** `OllamaGenerator` already calls: `POST /api/chat` with the same streaming, `messages`, and `options.num_predict` fields ADR-0007's implementation notes describe. There is no need to switch to the OpenAI-compatible `/v1/chat/completions` surface (which ADR-0007 already rejected for local, for `think: false` and streaming reasons that plausibly still apply on Cloud — untested here, flagged as an open question below).
* `OllamaGenerator.native_ollama_base_url()` already derives the correct root from `OLLAMA_BASE_URL` without any code change: pointing it at `https://ollama.com` (no `/v1` suffix) resolves to `https://ollama.com/api/chat` — exactly Ollama's documented cURL example.
* The **only** gap is that `OllamaGenerator` never sends an `Authorization` header, and `LLMSettings` has no API-key field for it. But `OllamaGenerator.__init__` already accepts an injectable `requests.Session` — so the missing piece can be supplied via composition (a session with the header pre-set), with **zero changes to `llm_client/ollama.py` itself**. The spot-check script below does exactly this as proof.
* If ALE-149 recommends moving forward, the real (out-of-scope-for-this-ticket) implementation is small: one optional `ollama_api_key: str` field on `LLMSettings` (mirroring how `gemini_api_key` is conditionally required per ADR-0007 Decision 4), threaded into whatever constructs the production `OllamaGenerator`, to build that same authenticated session. **No new `Generator` implementation needed** — this resolves the ticket's own open question in favor of "fits the existing interface."
* **Open/untested:** whether `think: false` and streaming behave the same against Cloud's reasoning-capable models (`gpt-oss`, `qwen3.5` are both "thinking" models per their Ollama library tags) as they do against local `qwen3:4b`. ADR-0007's implementation notes specifically called out `think: false` being unreliable on the OpenAI-compat endpoint for Qwen3 — worth confirming Cloud's native endpoint doesn't have an analogous quirk, since the models involved are different this time (`gpt-oss`, not `qwen3`).

## Scope point 3: Model catalog

Source: [ollama.com/search?c=cloud](https://ollama.com/search?c=cloud), [ollama.com/library/gpt-oss](https://ollama.com/library/gpt-oss), [ollama.com/library/qwen3.5/tags](https://ollama.com/library/qwen3.5/tags), [ollama.com/library/qwen3](https://ollama.com/library/qwen3), [ollama.com/blog/cloud-models](https://ollama.com/blog/cloud-models), [docs.ollama.com/cloud](https://docs.ollama.com/cloud) (retirement table) — all fetched 2026-08-16, not assumed from `qwen3:8b` alone per the ticket's own instruction.

**Headline finding: `qwen3` (the family ADR-0007 chose) has zero cloud-tagged models.** The `qwen3` library page lists only local sizes (0.6b–235b), no `-cloud` variant. The only Qwen-family cloud SKU is `qwen3.5:cloud`, which resolves to **`qwen3.5:397b-cloud`** — a ~400B-parameter MoE model, nothing like the 4B/8B dense model this project runs locally. `qwen3-coder:480b-cloud` (an earlier possible match) was retired July 15, 2026 in favor of that same `qwen3.5:397b-cloud`.

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

**Recommendation for ALE-150 (sub-issue 3):** lead with `gpt-oss:20b-cloud` — lightest free-tier usage level, permissive license matching ADR-0007 Decision 2's Apache-2.0 preference, and a genuinely different architecture/provider worth comparing against Qwen. Include `qwen3.5:cloud` as a second data point only if session budget allows, understanding it's a much larger model than local `qwen3:4b` and not a same-family scaling comparison.

## Scope point 4: Latency/quality spot-check

**Status: not yet run.** A throwaway comparison script (`scripts/ale149_ollama_cloud_spotcheck.py`) is ready: it reuses `evals.generation.compare_generators` (ALE-147) against `tests/fixtures/golden_generation.json`, running Gemini, local `qwen3:4b`, `gpt-oss:20b-cloud`, and `qwen3.5:cloud` side by side, with per-call wall-clock timing added. It stays out of ALE-149's "don't wire up Cloud as a configurable provider" boundary — the Cloud auth is composed via an injected `requests.Session` in the throwaway script itself, not added to `llm_client/`.

To run it: sign up at ollama.com, create an API key, set `OLLAMA_API_KEY` in the repo-root `.env`, make sure local Ollama (`qwen3:4b`) and `.env` (`QDRANT_URL`/`QDRANT_API_KEY`/`GEMINI_API_KEY`) are already set up per `CONTRIBUTING.md`, then `uv run python scripts/ale149_ollama_cloud_spotcheck.py` from the repo root. The script is spike scaffolding — it is not a production provider.

**This document should be updated (or a Linear comment appended to ALE-149) with the actual results before ALE-149 is closed out**, per this project's "nothing silently deferred" convention. Until then, treat every recommendation above involving latency or answer quality as unverified.

## Scope point 5: Cost/limits at production scale

Source: [ollama.com/pricing](https://ollama.com/pricing), fetched 2026-08-16.

* Explicitly named per the ticket's instruction, even though the answer is "not now": Ollama Cloud's Free tier is not positioned as a production tier by Ollama's own docs (their example use cases stop at "coding and AI assistants with smaller models"). Using it for the `/chat` path in production would mean at minimum Pro ($20/mo or $200/yr), and Max ($100/mo) is currently closed to new sign-ups regardless.
* Unlike Gemini (ADR-0001's pricing table gave $/1M-token input/output figures), **Ollama Cloud publishes no per-token or per-request rate for paid usage** — Pro/Max are flat monthly fees with an opaque "extra usage balance," and the rate that balance draws down at is not stated anywhere in the pricing FAQ. This makes it structurally harder to project cost at a given traffic volume than it was for Gemini in ADR-0001 — there's no formula to plug real numbers into, only "50x more than Free" and "5x more than Pro," which are relative, not absolute.
* On privacy: Ollama states prompt/response data is "never logged or trained on" for Cloud, a stronger stance than Gemini's free tier (which ADR-0001 flagged as usable for product improvement). If this project's `/chat` inputs are ever considered sensitive, that's a point in Cloud's favor independent of cost — though hosting is "primarily United States," so it doesn't resolve the EEA/UK/Switzerland regional question ADR-0001 raised for Gemini's paid tier either (Cloud carries no equivalent stated restriction today, but also no explicit EU hosting guarantee).
* **Bottom line, named explicitly per the ticket's scope:** if this project ever wants Cloud in the production `/chat` path, that decision needs (a) a paid plan, (b) real observed token/GPU consumption from actual traffic to estimate what "extra usage" would cost (since no rate is published), and (c) a fresh look at whether `qwen3.5:397b-cloud`/`gpt-oss:120b-cloud`-class models are worth their cost versus just paying for Gemini's already-metered paid tier (ADR-0001's own "revisit trigger" list already covers that comparison for Gemini specifically). None of that is resolved by this spike — dev/eval only for now, matching this document's overall recommendation.

## Decision

**Provisional GO for dev/eval use of Ollama Cloud, contingent on the pending spot-check; NO-GO on treating it as a substitute for local `qwen3:4b`; NO-GO on production use without a follow-up cost/traffic-modeling pass.**

| Question | Answer |
|---|---|
| Does Cloud fit the existing `Generator` interface? | **Yes** — small additive change (auth header via session composition), no new `Generator` implementation. |
| Does Cloud host this project's validated model (`qwen3:4b`/`8b`)? | **No** — Qwen family's only cloud SKU is a ~400B model. |
| Is free-tier usage plausible for eval traffic? | **Directionally yes** (Ollama's own "evaluating larger models" framing), **unverified** in absolute terms — no published numeric caps, spot-check pending. |
| Ready for production `/chat` traffic? | **No** — Free tier is explicitly not positioned for it, and paid tiers have no published $/token rate to model cost against. |

## Open item

Run `scripts/ale149_ollama_cloud_spotcheck.py`, fold the latency/quality results into this document (or a follow-up Linear comment on ALE-149), and only then finalize the recommendation and hand the model shortlist to ALE-150.

## Out of scope (unchanged from ticket)

* No code changes to `llm_client/` or `evals/` — the spot-check script proves the auth approach via composition in a throwaway file, not a repo change.
* No production traffic routing decision.
* No ADR — if this spike's findings (once the spot-check completes) support giving Ollama Cloud a larger role than "dev/eval option," that's ALE-148's stated follow-up ADR, not decided here.