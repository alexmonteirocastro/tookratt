# ALE-180 Findings: Local `qwen3:4b` leaking chain-of-thought despite `think: false`

* **Ticket:** ALE-180
* **Related:** ADR-0007 (local Ollama fallback; Decision 2 chose `qwen3:8b`, ALE-111 later defaulted code to `qwen3:4b`), ALE-101 (`OllamaGenerator`), ALE-111 (native `/api/chat` + `think: false` + 4b default), ALE-149 / [`0004-...md`](0004-ollama-cloud-generation-hosting-spike-findings.md) (first observation), ALE-110 / [`0005-...md`](0005-ollama-qwen3-generation-quality-eval-findings.md) (4b vs 8b split on the same daemon)
* **Date:** 2026-08-16
* **Status:** Complete. Root cause identified; default model reverted to `qwen3:8b`.

## Summary

**Root cause is the model tag, not an Ollama-version regression and not a bug in this project's request parameters.** The current `qwen3:4b` tag is Ollama's 2507 **thinking-only** weights (`qwen3:4b-thinking`, digest `359d7dd4bcda`). Its chat template always opens `<think>` and has no `/no_think` branch, so `think: false` on native `POST /api/chat` is a no-op. Reasoning is emitted as `message.content` — which `OllamaGenerator._collect_streamed_content` correctly concatenates — and `/chat` surfaces a scratchpad instead of an answer.

`qwen3:8b` still uses the original hybrid template (`/think` vs `/no_think` when `IsThinkSet`) and honors `think: false`. Same local daemon (`ollama` 0.31.1), same `OllamaGenerator` payload. ALE-110 already showed this split on a live generation eval.

**Fix:** restore the code default to `qwen3:8b` (ADR-0007 Decision 2). Do not chase a request-parameter workaround for a template that cannot disable thinking. `qwen3:4b` remains a supported `OLLAMA_MODEL` override with a known CoT leak.

## Evidence

### 1. Same daemon, only `4b` leaks (rules out Ollama-version as the cause)

ALE-149 run #3 and ALE-110 both observed the leak on `qwen3:4b` with `think: false`. ALE-110 ran `qwen3:8b` and `qwen3:4b` back-to-back against `backend_copenhagen`; only `4b` leaked. This ticket inspected the same machine: `ollama` 0.31.1, both models loaded.

### 2. `qwen3:4b` is the thinking-only 2507 retag

Local `ollama show` + [ollama.com/library/qwen3/tags](https://ollama.com/library/qwen3/tags) (fetched 2026-08-16):

| Tag | Digest | Context | What it actually is |
|---|---|---|---|
| `qwen3:4b` (this project's previous default) | `359d7dd4bcda` | 256K | **Alias of `qwen3:4b-thinking` / `qwen3:4b-thinking-2507-q4_K_M`** |
| `qwen3:4b-instruct` | `0edcdef34593` | 256K | Non-thinking 2507 instruct sibling (unevaluated here) |
| `qwen3:4b-q4_K_M` | `2bfd38a7daaf` | 40K | Original hybrid 4B, still on the library page, **not** what `ollama pull qwen3:4b` resolves to |
| `qwen3:8b` | `500a1f067a9f` | 40K | Original hybrid 8B — unchanged |

The 4B/30B/235B 2507 update split those sizes into separate instruct vs thinking weights and pointed the short tags at thinking. Confirmed independently by [ollama/ollama#12438](https://github.com/ollama/ollama/issues/12438) and [ollama/ollama#12917](https://github.com/ollama/ollama/issues/12917): `qwen3:4b` cannot turn thinking off; use the instruct tag. `qwen3:8b` was never split that way.

### 3. Chat templates: `think: false` has nothing to bind to on `4b`

`ollama show qwen3:8b --modelfile` (hybrid — this is why ADR-0007's `think: false` works):

```
{{- if and $.IsThinkSet (eq $i $lastUserIdx) }}
   {{- if $.Think -}} /think
   {{- else -}} /no_think
   {{- end -}}
{{- end }}
…
{{ if and $.IsThinkSet (not $.Think) -}}
<think>

</think>
{{ end -}}
```

`ollama show qwen3:4b --modelfile` (thinking-only — always starts a think block, no `/no_think`):

```
{{- if and (ne .Role "assistant") $last }}<|im_start|>assistant
<think>
{{ end }}
```

`OllamaGenerator` already sends `think` as a top-level field on native `/api/chat` (not inside `options`, not via the OpenAI-compat `/v1` endpoint). The request shape ADR-0007's implementation notes adopted is correct; this tag simply has no off switch for it.

## Fix considered and chosen

| Option | Verdict |
|---|---|
| Change request parameters (`think` placement, `/no_think` in the user prompt, higher `num_predict`) | Rejected. The 4b template never consults `$.Think`. Prompt-level `/no_think` is the 8b hybrid mechanism, not this tag's. More tokens would only lengthen the leaked scratchpad. |
| Ollama upgrade | Rejected. 0.31.1 already honors `think: false` for `qwen3:8b`. The 4b template is model-side. |
| Default to `qwen3:4b-instruct` | Rejected as the *default*. Would keep ALE-111's CPU-latency goal, but that tag has no generation-quality eval on this project's golden set. Named as a revisit trigger instead. |
| Keep `qwen3:4b`, document accepted risk | Rejected. The dev-fallback path's core promise is a usable, gradeable answer. Silent or "known broken" default is not acceptable. |
| **Default back to `qwen3:8b`** | **Chosen.** Matches ADR-0007 Decision 2, already shown clean and correctly grounded in findings 0005. Accepts the larger/slower model ALE-111 was trying to avoid. |

## Regression tests

**No new unit test for "content is a final answer, not reasoning."** That property is a live-model behavior, not plumbing:

* `tests/llm_client/test_ollama.py` already asserts the request sends `think: false` and concatenates `message.content`. The leak arrives *in* `content`, so a collector test cannot distinguish a scratchpad from an answer without a running Ollama model.
* CI's `unit-test` job has no Ollama daemon and no `GEMINI_API_KEY`. `tests/db/test_generation.py` scripts a fake `Generator` even on the `@pytest.mark.generation` path.
* Live regression coverage is `scripts/compare_generators.py` against `tests/fixtures/golden_generation.json` (findings 0005). Re-run that if the default Ollama tag changes again.

Default-model assertions in `tests/llm_client/test_base.py` and `tests/llm_client/test_ollama.py` now expect `qwen3:8b`.

## Revisit trigger (also recorded on ADR-0007)

If CPU latency of `qwen3:8b` is too painful for local `/chat`, evaluate `qwen3:4b-instruct` (not `qwen3:4b`) against the generation-quality eval set before considering it as the default. Do not re-default to `qwen3:4b` unless that tag's template honors `think: false`.
