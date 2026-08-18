"""ALE-138 / ALE-147: Compare candidate embedding models against the golden set.

Thin CLI over ``evals.embeddings.compare_embedding_models``. Seeds disposable
``JOBS_COMPARE_*`` collections — safe against production. See scripts/README.md.

Usage:

    uv run python scripts/compare_embedding_models.py
    uv run python scripts/compare_embedding_models.py --keep-collections
    uv run python scripts/compare_embedding_models.py \\
        --models BAAI/bge-small-en-v1.5 intfloat/multilingual-e5-small
    uv run python scripts/compare_embedding_models.py \\
        --models intfloat/multilingual-e5-small nomic-embed-text \\
        bge-m3 snowflake-arctic-embed2 qwen3-embedding:0.6b
    uv run python scripts/compare_embedding_models.py --production-sample \\
        --models intfloat/multilingual-e5-small nomic-embed-text \\
        bge-m3 snowflake-arctic-embed2 qwen3-embedding:0.6b
    uv run python scripts/compare_embedding_models.py --production-corpus \\
        --models intfloat/multilingual-e5-small nomic-embed-text \\
        bge-m3 snowflake-arctic-embed2 qwen3-embedding:0.6b
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from evals.embeddings import DEFAULT_MODELS, compare_embedding_models  # noqa: E402
from evals.ollama_embeddings import note_for_ollama_model  # noqa: E402
from evals.types import EmbeddingComparisonResult, QueryResult  # noqa: E402


def _print_pair(
    model_a: str,
    model_b: str,
    results_a: list[QueryResult],
    results_b: list[QueryResult],
) -> None:
    print("\n" + "=" * 100)
    print(f"COMPARISON: {model_a}  vs  {model_b}")
    print("=" * 100)

    by_id_b = {r.query_id: r for r in results_b}
    for r_a in results_a:
        r_b = by_id_b.get(r_a.query_id)
        print(f"\n--- Query [{r_a.query_id}]: {r_a.query_text!r} ---")
        print(f"Expected job(s): {r_a.expected_job_ids}")

        for job_id in r_a.expected_job_ids:
            score_a = r_a.expected_scores.get(job_id)
            score_b = r_b.expected_scores.get(job_id) if r_b else None
            print(
                f"  job={job_id:<20} "
                f"{model_a}={score_a if score_a is not None else 'MISSING':<10} "
                f"{model_b}={score_b if score_b is not None else 'MISSING'}"
            )

        noise_a = r_a.top_noise_score
        noise_b = r_b.top_noise_score if r_b else None
        print(f"  top noise score:  {model_a}={noise_a}   {model_b}={noise_b}")
        print(
            f"  top hit:  {model_a}={r_a.top_hit_job_id} "
            f"({r_a.top_hit_score})   "
            f"{model_b}={r_b.top_hit_job_id if r_b else None} "
            f"({r_b.top_hit_score if r_b else None})"
        )

        if r_a.all_missing:
            print(f"  ⚠️  {model_a} MISSED: {r_a.all_missing}")
        if r_b and r_b.all_missing:
            print(f"  ⚠️  {model_b} MISSED: {r_b.all_missing}")


def _print_comparison_table(result: EmbeddingComparisonResult) -> None:
    if len(result.models) < 2:
        return
    baseline = result.models[0]
    baseline_results = result.results_by_model[baseline]
    for candidate in result.models[1:]:
        _print_pair(
            baseline,
            candidate,
            baseline_results,
            result.results_by_model[candidate],
        )

    print("\n" + "=" * 100)
    print("SUMMARY")
    print("=" * 100)
    for model in result.models:
        summary = result.summaries[model]
        note = note_for_ollama_model(model)
        print(f"\n{model}:")
        if note:
            print(f"  Note: {note}")
        print(f"  Missed expected hits: {summary.missed_count}")
        print(
            f"  Min expected-hit score (CHAT_SOURCE_MIN_SCORE floor): "
            f"{summary.min_expected_score}"
        )
        print(
            f"  Max noise-hit score (should sit below the floor above): "
            f"{summary.max_noise_score}"
        )
        if summary.separation_margin is not None:
            verdict = (
                "✅ clean separation"
                if summary.separation_margin > 0
                else "⚠️  OVERLAP — recalibration will be lossy"
            )
            print(f"  Separation margin: {summary.separation_margin:.4f} {verdict}")
        else:
            print("  Separation margin: N/A (no expected hits in top-k)")


def _print_ranked_hits(result: EmbeddingComparisonResult, *, limit: int = 5) -> None:
    print("\n" + "=" * 100)
    print("TOP HITS (fused rank; scores are dense cosine)")
    print("=" * 100)
    for model in result.models:
        print(f"\n### {model}")
        for qr in result.results_by_model[model]:
            print(f"\n--- Query [{qr.query_id}]: {qr.query_text!r} ---")
            if not qr.ranked_hits:
                print("  (no hits)")
                continue
            for rank, hit in enumerate(qr.ranked_hits[:limit], start=1):
                print(
                    f"  #{rank}  score={hit.score:.4f}  "
                    f"{hit.job_title} @ {hit.company} ({hit.country})  "
                    f"id={hit.job_id}"
                )


def _print_sample_stats(result: EmbeddingComparisonResult) -> None:
    stats = result.sample_stats
    if stats is None:
        return
    print("\n" + "=" * 100)
    print("STRATIFIED SAMPLE")
    print("=" * 100)
    print(f"Production corpus size: {stats.corpus_size}")
    print(f"Sample size: {stats.sample_size}")
    print(f"Guaranteed expected ids found: {stats.guaranteed_found or 'none'}")
    print(f"Guaranteed expected ids missing: {stats.guaranteed_missing or 'none'}")
    print("\nToken-length buckets (e5-small tokenizer, passage: prefix):")
    print(f"  {'bucket':<16} {'available':>10} {'sampled':>10}")
    for bucket, available in stats.bucket_available.items():
        sampled = stats.bucket_sampled[bucket]
        print(f"  {bucket:<16} {available:10d} {sampled:10d}")

    print("\n" + "=" * 100)
    print("TRUNCATION SANITY — golden expected_job_ids vs e5 512-token window")
    print("=" * 100)
    truncated_queries = 0
    production_hits = 0
    print(f"  {'query':<36} {'expected':<12} {'where':<14} {'e5 tok':>7} {'>512'}")
    for row in stats.expected_truncation:
        tokens = "?" if row.e5_tokens is None else str(row.e5_tokens)
        over = "?" if row.over_512 is None else ("yes" if row.over_512 else "no")
        print(
            f"  {row.query_id:<36} {row.job_id:<12} {row.location:<14} "
            f"{tokens:>7} {over}"
        )
        if row.location == "production":
            production_hits += 1
            if row.over_512:
                truncated_queries += 1
    print(
        f"\nExpected ids present in production: {production_hits}/"
        f"{len(stats.expected_truncation)}"
    )
    print(f"Of those, truncated under e5-small (>512 tokens): {truncated_queries}")
    if production_hits == 0:
        print(
            "None of the golden expected_job_ids exist in production. This run "
            "does not exercise truncation on the expected hits for these queries."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--models",
        nargs="+",
        default=DEFAULT_MODELS,
        metavar="MODEL",
        help=f"Embedding models to compare (2+). Default: {DEFAULT_MODELS}",
    )
    parser.add_argument(
        "--keep-collections",
        action="store_true",
        help="Keep comparison collections after running (default: delete).",
    )
    parser.add_argument(
        "--production-corpus",
        action="store_true",
        help=(
            "Seed throwaway JOBS_COMPARE_* collections from the full "
            "production corpus (read-only scroll). Never writes production."
        ),
    )
    parser.add_argument(
        "--production-sample",
        action="store_true",
        help=(
            "Stratified ~250-doc sample from production. e5-small queries "
            "JOBS_ON_THE_HUB in place (no re-embed). Ollama candidates embed "
            "the sample into JOBS_COMPARE_* only."
        ),
    )
    args = parser.parse_args()

    if len(args.models) < 2:
        print("Error: provide at least two --models", file=sys.stderr)
        return 1
    if args.production_corpus and args.production_sample:
        print(
            "Error: pass only one of --production-sample / --production-corpus",
            file=sys.stderr,
        )
        return 1

    if args.production_sample:
        print(
            "PRODUCTION-SAMPLE MODE: e5-small queries JOBS_ON_THE_HUB read-only "
            "(existing vectors). Ollama candidates embed a stratified sample "
            "into disposable JOBS_COMPARE_* collections. Production is never "
            "written. Golden expected_job_ids are fixture IDs — if they are "
            "not in production, missed-hit / margin will not isolate truncation."
        )
    elif args.production_corpus:
        print(
            "PRODUCTION-CORPUS MODE: source is QDRANT_COLLECTION_NAME "
            "(read-only). Golden expected_job_ids are synthetic fixtures and "
            "are not Hub ids — missed-hit / min-expected / margin vs those "
            "IDs will not isolate truncation."
        )

    try:
        result = compare_embedding_models(
            args.models,
            keep_collections=args.keep_collections,
            production_corpus=args.production_corpus,
            production_sample=args.production_sample,
            progress=print,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if args.production_sample:
        _print_sample_stats(result)
    _print_comparison_table(result)
    if args.production_corpus or args.production_sample:
        _print_ranked_hits(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
