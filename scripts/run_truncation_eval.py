"""ALE-183 phase 5: compare e5-small vs Ollama models on the truncation eval set.

10 production jobs whose matching signal sits past e5-small's 512-token cut.
e5-small queries live JOBS_ON_THE_HUB (read-only). Ollama candidates embed a
~80-doc stratified pool into disposable JOBS_COMPARE_* collections, with
dense vectors cached under tmp/ale-183-embed-cache/.

Usage:

    uv run python scripts/run_truncation_eval.py --tokenizer-check-only
    uv run python scripts/run_truncation_eval.py
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from evals.embeddings import PRODUCTION_BASELINE_MODEL  # noqa: E402
from evals.truncation_eval import (  # noqa: E402
    CANDIDATE_TOKENIZER_SPECS,
    DEFAULT_EMBED_CACHE_DIR,
    DEFAULT_OLLAMA_CANDIDATES,
    TokenizerWindowRow,
    TruncationEvalResult,
    TruncationHitResult,
    run_truncation_eval,
)


def _fmt_hit(hit: TruncationHitResult | None) -> str:
    if hit is None:
        return "—"
    if hit.missing_dense_sentinel:
        rank = f"#{hit.rank}" if hit.rank is not None else "miss"
        return f"{rank} −1.0 N"
    if hit.rank is None:
        return "miss"
    floor = "Y" if hit.clears_floor else "N"
    score = "n/a" if hit.score is None else f"{hit.score:.3f}"
    return f"#{hit.rank} {score} {floor}"


def _print_tokenizer_table(result: TruncationEvalResult) -> None:
    print("\n" + "=" * 100)
    print("TOKENIZER WINDOW CHECK (own tokenizer + same prefixes as embed)")
    print("=" * 100)
    specs = list(CANDIDATE_TOKENIZER_SPECS)
    header = f"{'job':<28} {'e5':>5}  " + "  ".join(
        f"{spec.model[:16]:>16}" for spec in specs
    )
    print(header)
    print("-" * len(header))
    by_job: dict[str, dict[str, TokenizerWindowRow]] = {}
    for row in result.tokenizer_rows:
        by_job.setdefault(row.job_id, {})[row.model] = row
    seen: set[str] = set()
    for case in result.cases:
        if case.job_id in seen:
            continue
        seen.add(case.job_id)
        models = by_job.get(case.job_id, {})
        e5 = ""
        cells: list[str] = []
        for spec in specs:
            model_row = models.get(spec.model)
            if model_row is None:
                cells.append(f"{'—':>16}")
                continue
            e5 = str(model_row.e5_tokens)
            flag = " TRUNC" if model_row.truncates else ""
            cells.append(f"{str(model_row.token_count) + flag:>16}")
        label = f"{case.company} {case.title}"[:28]
        print(f"{label:<28} {e5:>5}  " + "  ".join(cells))
    print()
    print("Windows: " + ", ".join(f"{s.model}={s.window}" for s in specs))
    for spec in specs:
        if spec.notes:
            print(f"  {spec.model}: {spec.notes}")


def _print_sample_stats(result: TruncationEvalResult) -> None:
    stats = result.sample_stats
    if stats is None:
        return
    print("\n" + "=" * 100)
    print("STRATIFIED POOL")
    print("=" * 100)
    print(f"Production corpus size: {stats.corpus_size}")
    print(f"Sample size: {stats.sample_size}")
    print(f"Guaranteed targets found: {len(stats.guaranteed_found)}")
    print(f"Guaranteed targets missing: {stats.guaranteed_missing or 'none'}")
    print(f"  {'bucket':<16} {'available':>10} {'sampled':>10}")
    for bucket, available in stats.bucket_available.items():
        sampled = stats.bucket_sampled[bucket]
        print(f"  {bucket:<16} {available:10d} {sampled:10d}")
    print(f"Embed cache: {result.cache_dir}")


def _print_summary_table(result: TruncationEvalResult) -> None:
    models = [PRODUCTION_BASELINE_MODEL, *DEFAULT_OLLAMA_CANDIDATES]
    present = [m for m in models if m in result.results_by_model]
    if not present:
        return
    print("\n" + "=" * 100)
    print(f"TRUNCATION EVAL (rank / dense score / clears floor {result.floor:.2f})")
    print("=" * 100)
    short = {
        PRODUCTION_BASELINE_MODEL: "e5-small",
        "nomic-embed-text": "nomic",
        "bge-m3": "bge-m3",
        "snowflake-arctic-embed2": "arctic",
        "qwen3-embedding:0.6b": "qwen0.6b",
    }
    header = f"{'query':<24}" + "".join(f" {short.get(m, m):>18}" for m in present)
    print(header)
    print("-" * len(header))
    for index, case in enumerate(result.cases):
        cells = []
        for model in present:
            hits = result.results_by_model[model]
            hit = hits[index] if index < len(hits) else None
            cells.append(f" {_fmt_hit(hit):>18}")
        label = case.query_id[:24]
        print(f"{label:<24}" + "".join(cells))

    print("\nPer-query noise (highest non-target dense score):")
    noise_header = f"{'query':<24}" + "".join(
        f" {short.get(m, m):>18}" for m in present
    )
    print(noise_header)
    print("-" * len(noise_header))
    for index, case in enumerate(result.cases):
        cells = []
        for model in present:
            hits = result.results_by_model[model]
            hit = hits[index] if index < len(hits) else None
            if hit is None or hit.top_noise_score is None:
                cells.append(f" {'—':>18}")
            else:
                cells.append(f" {hit.top_noise_score:>18.3f}")
        print(f"{case.query_id[:24]:<24}" + "".join(cells))


def _print_notes(result: TruncationEvalResult) -> None:
    if not result.notes:
        return
    print("\n" + "=" * 100)
    print("FLAGS")
    print("=" * 100)
    for note in result.notes:
        print(f"- {note}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tokenizer-check-only",
        action="store_true",
        help="Tokenize the 10 targets with each candidate tokenizer and exit.",
    )
    parser.add_argument(
        "--keep-collections",
        action="store_true",
        help="Keep JOBS_COMPARE_* collections after the Ollama queries.",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=DEFAULT_EMBED_CACHE_DIR,
        help=f"Dense-vector cache directory (default: {DEFAULT_EMBED_CACHE_DIR})",
    )
    parser.add_argument(
        "--models",
        nargs="+",
        default=list(DEFAULT_OLLAMA_CANDIDATES),
        metavar="MODEL",
        help="Ollama candidates to embed (e5-small is always queried live).",
    )
    args = parser.parse_args()

    print(
        "TRUNCATION EVAL: e5-small queries JOBS_ON_THE_HUB read-only. "
        "Ollama candidates embed a stratified pool into disposable "
        "JOBS_COMPARE_* only. Production is never written. "
        "golden_queries.json is not used."
    )
    try:
        result = run_truncation_eval(
            tokenizer_check_only=args.tokenizer_check_only,
            keep_collections=args.keep_collections,
            cache_dir=args.cache_dir,
            ollama_models=args.models,
            progress=print,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    _print_tokenizer_table(result)
    if args.tokenizer_check_only:
        _print_notes(result)
        return 0
    _print_sample_stats(result)
    _print_summary_table(result)
    _print_notes(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
