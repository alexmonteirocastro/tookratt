# ALE-183 Spike Findings: Ollama-Hosted Embedding Models with Larger Context Windows

* **Ticket:** [ALE-183](https://linear.app/alex-projects/issue/ALE-183/spike-evaluate-ollama-hosted-embedding-models-with-larger-context)
* **Related:** [ADR-0014](../adr/0014-embedding-model-migration.md) (e5-small + Cloud Inference; 512-token fit concern this spike quantified), [ADR-0010](../adr/0010-sparse-bm25-hybrid-search.md) Decision 7 (`CHAT_SOURCE_MIN_SCORE` floors on dense cosine, not RRF), ALE-138 (e5-small vs MiniLM; floor calibrated to 0.85), [ALE-186](https://linear.app/alex-projects/issue/ALE-186/hybrid-search-rrf-fusion-returns-10-dense-score-sentinel-for-some) (Decision 7 floor / `-1.0` dense sentinel — cheaper alternative to a model swap), [ALE-141](0003-e5-truncation-retrieval-correlation-findings.md) (truncation did not explain ALE-92 keyword-precision misses)
* **Date:** 2026-08-18
* **Status:** Spike complete — recommendation below is final for this spike's scope. No production writes. Evidence is the ALE-183 comment thread (phases 1–5).

## Summary

**Recommendation: NO-GO on switching the production dense embedding model.** Truncation under e5-small is nearly corpus-wide (98.56% of `document_text` exceeds 512 tokens), and `/chat` sourcing floors on dense cosine, so BM25 cannot admit a job whose dense vector never saw the tail. That mechanism is real. What it does **not** produce, on the 10 real-document eval pairs built to exercise it, is missed retrieval: e5-small already ranks all 10 in the production top-4 (6 at rank #1). It produces **under-score / floor exclusion** — 6/10 well-ranked jobs fail `CHAT_SOURCE_MIN_SCORE=0.85` and are dropped from `/chat` sources.

None of the four Ollama candidates (`nomic-embed-text`, `bge-m3`, `snowflake-arctic-embed2`, `qwen3-embedding:0.6b`) is a drop-in: scores live in different spaces, none clear 0.85, and any swap needs a newly-calibrated floor (the same work ALE-138 did for e5-small). They generally widen target-vs-noise dense margin on this set, but **that gain does not correlate with document length** — arctic's single largest margin (+0.268) is IQM QEC at 1446 e5-tokens, bigger than either genuinely long document. The data does not isolate "bigger context recovers truncated content" from "these models are simply better job-posting embedders than e5-small." Hosting is independently NO-GO on the current $0/month path.

A higher-leverage follow-up than a model swap: stop flooring `/chat` exclusively on dense cosine so RRF-ranked jobs are not dropped for an under-score the sparse leg already compensated for. That is the same Decision 7 mechanism as the `-1.0` dense sentinel, tracked on [ALE-186](https://linear.app/alex-projects/issue/ALE-186/hybrid-search-rrf-fusion-returns-10-dense-score-sentinel-for-some).

## 1. Motivation recap — ADR-0014 flagged 512-token risk and never quantified it

ADR-0014 picked `intfloat/multilingual-e5-small` over MiniLM in part because 512 tokens "better fits `document_text`'s length (title + company + company description + job description), reducing truncation risk" — implying residual risk, not a measured one. The hosting constraint was separate (move embed compute off Render's 512MB container onto Qdrant Cloud Inference). This spike measured the length question on live `JOBS_ON_THE_HUB`.

Read-only scroll, e5-small tokenizer, Cloud Inference `passage: ` prefix, 1111 points (`scripts/check_e5_document_token_lengths.py`):

| metric | tokens |
|---|---:|
| min | 220 |
| p50 | 1232 |
| p90 | 1877 |
| p99 | 2493 |
| max | 3094 |

**Over 512 (the production E5 window): 1095 / 1111 = 98.56%.**

Same e5-tokenizer counts as a proxy against candidate windows (phase 2; nomic's *effective* window is 2048, not the advertised 8192 — see §3):

| window | over | share |
|---|---:|---:|
| 2048 (nomic's real Ollama GGUF window) | 56 / 1111 | 5.04% |
| 8192 (bge-m3 / arctic-embed2) | 0 / 1111 | 0% |
| 32768 (qwen3-embedding:0.6b) | 0 / 1111 | 0% |

Truncation is nearly corpus-wide under e5-small. An 8K+ model would cover today's max (3094). nomic-at-2K would still clip the long tail.

This does not reverse [ALE-141 / findings 0003](0003-e5-truncation-retrieval-correlation-findings.md). That spike asked whether truncation explained the ALE-92 keyword-precision misses, and found the distinguishing terms already inside the first 512 tokens. This spike built a different eval set: conversational `/chat` queries whose matching signal was chosen to sit *past* the cut. Complementary questions, complementary answers.

## 2. The real mechanism — under-score / floor exclusion, not missed retrieval

**BM25 indexes full `document_text`. Dense e5-small does not.** Hubster never truncates in Python. `load_jobs_into_qdrant` (and `--backfill-sparse`) upserts both named vectors from the same sanitized string:

- dense: `Document(text=doc_text, model=intfloat/multilingual-e5-small)` — Cloud Inference truncates at e5-small's **512-token** window
- sparse: `Document(text=doc_text, model=qdrant/bm25)` — lexical BM25; no neural window. Qdrant's `max_token_len` is per-term length, not document length.

Query time sends the user question to both legs. Ranking is hybrid RRF (ADR-0010). **Sourcing is not.** ADR-0010 Decision 7 still floors `/chat` on **pre-fusion dense cosine** (`CHAT_SOURCE_MIN_SCORE=0.85`, calibrated by ALE-138 against e5-small). A BM25-only RRF hit missing from the dense companion top-k gets sentinel `-1.0` (`MISSING_DENSE_SCORE`) and is dropped. Full-text BM25 can reshuffle rank among jobs dense already retrieved; it cannot by itself admit a job whose dense vector never saw the tail.

On the 10-job real-document eval set (phase 4 canvas, phase 5 live queries against `JOBS_ON_THE_HUB`, limit 200, no country filter), that mechanism does **not** look like missed retrieval:

| query | e5 tokens | fused rank (of 1111) | dense score | clears 0.85 |
|---|---:|---:|---:|---|
| teton-support | 1007 | 2 | 0.852 | **Y** |
| coody-embedded | 1054 | 4 | 0.856 | **Y** |
| voi-staff-embedded | 1307 | 3 | 0.845 | N |
| iqm-calibration | 1308 | 1 | 0.873 | **Y** |
| light-bank-connectivity | 1317 | 1 | 0.834 | N |
| iqm-qec | 1446 | 1 | 0.879 | **Y** |
| shine-payments | 1722 | 1 | 0.839 | N |
| tgtg-ml-lead | 1727 | 2 | 0.841 | N |
| clausal-cv-onboard | 2278 | 1 | 0.842 | N |
| hoxhunt-secops | 2613 | 1 | 0.831 | N |

All 10 are in the production top-4; 6 are rank #1. **6/10 fail the 0.85 floor** (Light 0.834, Shine 0.839, TGTG 0.841, Clausal 0.842, Voi 0.845, Hoxhunt 0.831) and would be omitted from `/chat` sources even when RRF ranked them correctly. Only Teton, COODY, and the two IQM roles survive. On 7/10 queries the highest non-target dense score beats the target — BM25/RRF is carrying rank; dense cosine is not separating.

**Reframe:** truncation is an under-score / floor-exclusion problem for `/chat`, not a "e5 never retrieves the long job" problem.

## 3. Candidate comparison — better margins, length confound unresolved

Candidates, via local Ollama into disposable `JOBS_COMPARE_*` (correct dense dim + the same BM25 sparse leg so ranking stays hybrid RRF). Production was never written. e5-small was **not** re-embedded — phase 5 queried live `JOBS_ON_THE_HUB`. Ollama candidates embedded a stratified 77-doc pool (seed 183, e5 length buckets, all 10 target IDs guaranteed); vectors cached under `tmp/ale-183-embed-cache/`.

### Golden-set separation margin (14 short fixtures / 6 queries — not a truncation test)

All fixtures are well under 512 tokens. Missed-hit counts are 0. Absolute scores are not comparable across embedding spaces; **separation margin** (`min expected − max noise`) is.

| model | missed | min expected | max noise | separation |
|---|---:|---:|---:|---:|
| `intfloat/multilingual-e5-small` (prod) | 0 | 0.826 | 0.877 | **−0.051** |
| `nomic-embed-text` (v1.5, effectively 2K) | 0 | 0.653 | 0.726 | −0.073 |
| `bge-m3` (dense-only via Ollama) | 0 | 0.592 | 0.697 | −0.105 |
| `snowflake-arctic-embed2` | 0 | 0.492 | 0.613 | −0.121 |
| `qwen3-embedding:0.6b` (32K / 1024) | 0 | 0.533 | 0.701 | **−0.167** |

None of the four beat e5-small's margin on short docs. This is a quality/calibration bake-off, not the context-window question. It already shows a production swap cannot copy `CHAT_SOURCE_MIN_SCORE=0.85`.

### Real-document dense margin (target − max noise)

Phase 5. Candidate ranks are among 77 docs; e5 ranks among 1111 — **ranks are not comparable**. Scores and the 0.85 Y/N column are not comparable across models either (different spaces). The comparable number is dense margin.

| query | e5 tok | e5 | nomic | bge-m3 | arctic | qwen 0.6b |
|---|---:|---:|---:|---:|---:|---:|
| teton-support | 1007 | −0.010 | +0.074 | +0.026 | +0.104 | +0.137 |
| coody-embedded | 1054 | −0.021 | −0.021 | −0.017 | +0.034 | +0.055 |
| voi-staff-embedded | 1307 | −0.022 | −0.003 | −0.027 | +0.098 | −0.010 |
| iqm-calibration | 1308 | +0.015 | +0.026 | +0.059 | +0.079 | +0.170 |
| light-bank-connectivity | 1317 | +0.001 | +0.027 | +0.041 | +0.102 | +0.113 |
| iqm-qec | 1446 | +0.020 | +0.097 | +0.125 | **+0.268** | +0.206 |
| shine-payments | 1722 | −0.005 | −0.024 | −0.017 | +0.033 | +0.044 |
| tgtg-ml-lead | 1727 | −0.021 | −0.027 | +0.002 | +0.038 | +0.053 |
| clausal-cv-onboard | 2278 | −0.005 | +0.094 | +0.057 | +0.122 | +0.186 |
| hoxhunt-secops | 2613 | −0.002 | +0.082 | +0.059 | +0.143 | +0.085 |
| **positive rows** | | **3/10** | **6/10** | **7/10** | **10/10** | **9/10** |

No Ollama candidate clears 0.85 (scores ~0.47–0.80). Almost every candidate ranked the target #1 in the 77-doc pool; qwen's Voi at rank 2 is the only exception. That is not "recovered from miss."

**Open limitation — do not treat this as a resolved context-window win.** Candidates generally widen dense margin vs e5-small on this set, but the gain does **not** correlate with how much text sits past 512. Arctic's single biggest margin (+0.268) is IQM QEC at 1446 e5-tokens — a document every 8K+ candidate fully covers, and which nomic also covers (1290 nomic-tokens). That is larger than Clausal (+0.122 at 2278) or Hoxhunt (+0.143 at 2613), the two jobs that actually sit past ~2k. Both effects are plausible and entangled here: (a) extra context recovering truncated tail signal, (b) these models simply being better general-purpose embedders for job postings than e5-small. This dataset cannot separate them.

### Per-candidate notes

| candidate | window (real) | dims | GO/NO-GO | caveat |
|---|---|---:|---|---|
| `nomic-embed-text` v1.5 | **2048**, not 8192 | 768 | **NO-GO** | `scripts/probe_nomic_embed_context.py`: even with `num_ctx=8192`, `prompt_eval_count=2048` and cosine(full, first-2048)=1.0. Still truncates Hoxhunt (2455 nomic-tokens). Cloud Inference has `nomic-ai/nomic-embed-text-v1.5` on **paid tier only**. Golden-set margin worse than e5. |
| `bge-m3` | 8192 | 1024 | **NO-GO** | Ollama exposes **dense only** — no sparse / multi-vector. The ticket's original rationale (ADR-0010 synergy) does not apply via this route; it is a plain dense 8K option. Not in Cloud Inference's native catalog. |
| `snowflake-arctic-embed2` | 8192 | 1024 | **NO-GO** | Least-caveated quality of the four (10/10 positive real-doc margins; no candidate-specific quality asterisk). Still needs a new floor and has no $0 hosting path — not in Cloud Inference native catalog (`l-v2.0` unsupported; older arctic tags are paid-gated and not this model). HF `tokenizer.json` ships `truncation.max_length=512` (base-model leftover); counting disabled that cap. Embedding used Ollama, not that tokenizer. |
| `qwen3-embedding:0.6b` | 32768 | 1024 | **NO-GO** | Weakest golden-set margin (−0.167). 0.6b understates the family the ticket cited: 32K/1024 vs the **8b** tag's 40K/4096, which is the MTEB-leading variant. 8b was not run (vectors for the 77-doc pool are cached if a follow-up wants it). 0.6b's 32K already exceeds corpus max, so 8b would be a quality/margin question, not a coverage one. |

Tokenizer check (phase 5, each model's own tokenizer + the same prefixes as embed) before any Ollama embedding of the pool: Clausal fits nomic (2034 < 2048); Hoxhunt does not (2455). bge-m3 / arctic / qwen 0.6b cover every target. e5 vs nomic counts differ by hundreds — phase-4 e5 figures are not a safe proxy for another model's window.

## 4. GO / NO-GO

**NO-GO on switching the production dense embedding model right now.** Per-candidate NO-GO in the table above. Reasons, stacked:

1. **No unconditional quality win once the length confound is named.** Better dense margins on N=10 are real and worth recording; they are not a clean demonstration that larger context recovers truncated content.
2. **Any switch needs a newly-calibrated floor.** Copying 0.85 would drop every candidate hit in this eval. That is the same class of work ALE-138 already did for e5-small.
3. **No $0/month hosting path today.** Qdrant Cloud Inference free tier still only offers e5-small and MiniLM (live probe, phase 1). Paid-tier nomic-embed-text-v1.5 exists and was not available when ADR-0014 was written; it does not help the current free cluster, and nomic's *effective* 2048 window still clips ~5% of this corpus. bge-m3, arctic-embed2 v2, and Qwen3-Embedding are not in the native catalog. Ollama Cloud still does not offer embedding models. Running these models in the Render API process would reintroduce the ADR-0014 memory problem, likely worse. Self-hosted Ollama is new infra and reopens ADR-0013's $0/month constraint.

**Higher-leverage finding, independent of which embedder wins:** recalibrating or redesigning `CHAT_SOURCE_MIN_SCORE` so `/chat` sourcing can honour BM25/RRF rank instead of flooring exclusively on dense cosine may fix more of the observed exclusion — 6/10 well-ranked real jobs dropped despite RRF — more cheaply than any embedding swap. That is ADR-0010 Decision 7. The `-1.0` sentinel on BM25-only fused hits is the same mechanism. Tracked on [ALE-186](https://linear.app/alex-projects/issue/ALE-186/hybrid-search-rrf-fusion-returns-10-dense-score-sentinel-for-some).

## 5. Eval methodology limitations

- **`golden_queries.json` cannot test truncation.** The 6 golden retrieval queries' expected IDs (`abc123`, `def456`, `ghi789`, `jkl012`, `mno456` — 5 unique) are synthetic fixtures, all well under 40 e5-tokens, and **none exist in production**. Phase 2's missed-hit / margin table is short-fixture quality only. Phase 3's production-sample missed-6/6 row was this ID mismatch, not retrieval failure, and was discarded. The 10-job set lives in `evals/truncation_eval.py` / `scripts/run_truncation_eval.py` and was **not** written into `golden_queries.json`.
- **N=10 is small**, and the set was designed so matching signal sits past e5's cut — not to hold model quality constant while varying only context window. A follow-up that wanted to isolate the window effect would need matched-quality models that differ only in context, or a length-stratified analysis across many more real query/job pairs.
- **Corpus-size confound on rank.** e5 was queried against 1111 live points; candidates against a 77-doc pool. Report scores/margins, not "everyone is #1."
- **nomic's advertised 8K is false in Ollama.** Treat as ~2K. Clausal (2278 e5 / 2034 nomic) is a near-miss under nomic; Hoxhunt is a real clip.
- **Qwen 0.6b is not the ticket's MTEB citation.** Do not read 0.6b's weakest golden-set margin as a verdict on `qwen3-embedding:8b`.

## 6. Links

| | |
|---|---|
| This spike | [ALE-183](https://linear.app/alex-projects/issue/ALE-183/spike-evaluate-ollama-hosted-embedding-models-with-larger-context) (phases 1–5 in the comment thread) |
| Dense-floor / `-1.0` sentinel | [ALE-186](https://linear.app/alex-projects/issue/ALE-186/hybrid-search-rrf-fusion-returns-10-dense-score-sentinel-for-some) |
| e5-small adoption + 0.85 floor | [ADR-0014](../adr/0014-embedding-model-migration.md), ALE-138 |
| Hybrid RRF; floor stays dense cosine | [ADR-0010](../adr/0010-sparse-bm25-hybrid-search.md) Decision 7 |
| Truncation vs ALE-92 precision misses | [findings 0003](0003-e5-truncation-retrieval-correlation-findings.md) (ALE-141) |

## Decision

| Question | Answer |
|---|---|
| How much of production `document_text` exceeds e5-small's 512-token window? | **98.56% (1095/1111)**; p50 1232, p90 1877, p99 2493, max 3094. |
| Does BM25 compensate for dense truncation on `/chat`? | **No.** Sparse sees the full string; sourcing still floors on dense cosine (Decision 7). |
| Does e5-small *miss* the 10 long real-document targets? | **No** — all in production top-4, 6 at rank #1. |
| What does truncation actually do here? | **Under-score / floor exclusion** — 6/10 well-ranked jobs fail 0.85 and never reach `/chat` sources. |
| Do the four Ollama candidates beat e5-small on short-fixture separation margin? | **No.** e5 −0.051; nomic −0.073; bge-m3 −0.105; arctic −0.121; qwen 0.6b −0.167. |
| Do they widen dense margin on the 10-job real set? | **Generally yes** (arctic 10/10 positive, qwen 9/10, bge 7/10, nomic 6/10 vs e5's 3/10) — **not isolated to longer documents.** |
| Switch production dense embedder now? | **NO-GO** — confound + new-floor work + no $0 hosting path. |
| Per candidate? | **All NO-GO** for a production swap. Arctic is the least-caveated quality signal; nomic still truncates; bge-m3 loses its sparse rationale via Ollama; qwen 0.6b understates the 8b family. |
| Cheaper lever than a model swap? | **Yes — Decision 7 / ALE-186:** stop dropping RRF-ranked hits solely because dense cosine sits under 0.85 (including the `-1.0` sentinel). |

## Open items

1. **ALE-186** — Decision 7 floor behaviour (`-1.0` sentinel and, more broadly, dense-only sourcing that drops well-ranked under-scored hits). Higher leverage for the exclusion pattern in §2 than an embedding swap.
2. **Not this spike:** `qwen3-embedding:8b` quality/margin vs 0.6b (pool embeddings are cached). A clean context-window isolation study (matched models, or a much larger length-stratified real-query set). Paid-tier Cloud Inference nomic, if this project ever leaves $0/month.
3. This document is in a state ready to close ALE-183 against, once the content is reviewed. No production ingest/query change follows from it.

## Out of scope (unchanged from ticket)

* No production embedding-model swap, no `CHAT_SOURCE_MIN_SCORE` change, no ADR.
* No writes to `JOBS_ON_THE_HUB`. Disposable `JOBS_COMPARE_*` collections used in phases 2–5 were deleted.
* `golden_queries.json` was not modified; the 10-job real-document set is eval-only (`evals/truncation_eval.py`).
