"""Embedding model comparison against the golden retrieval set (ALE-147)."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from qdrant_client import QdrantClient, models
from qdrant_client.http.models import QueryResponse

from db import query_jobs_in_qdrant
from db.database import (
    _attach_dense_scores_to_fused_hits,
    _build_country_remote_filter,
    get_dense_vector_name,
)
from db.settings import (
    BM25_SPARSE_MODEL,
    BM25_SPARSE_VECTOR_NAME,
    get_settings,
    uses_cloud_inference,
)
from evals.collections import (
    collection_name_for_model,
    delete_collections,
    embedding_model_override,
    get_comparison_client,
    load_production_stored_jobs,
    resolve_model_name,
    seed_collection_for_model,
    stored_jobs_from_opportunities,
    validate_qdrant_config,
)
from evals.corpus_sample import (
    DEFAULT_SAMPLE_PER_BUCKET,
    DEFAULT_SAMPLE_RNG_SEED,
    count_e5_tokens,
    expected_job_ids_from_queries,
    stratified_production_sample,
)
from evals.fixtures import load_golden_jobs, load_golden_queries
from evals.ollama_embeddings import (
    dense_vector_size_for_ollama_model,
    embed_texts_with_ollama,
    format_ollama_embedding_input,
    is_ollama_embedding_model,
)
from evals.types import (
    EmbeddingComparisonResult,
    ModelSummary,
    QueryResult,
    RankedHit,
    StoredJob,
)
from the_hub_client import CountryCode

DEFAULT_MODELS: list[str] = [
    "all-MiniLM-L6-v2",
    "intfloat/multilingual-e5-small",
]
PRODUCTION_BASELINE_MODEL = "intfloat/multilingual-e5-small"

ProgressCallback = Callable[[str], None]


def _uses_live_production_vectors(model: str, *, production_sample: bool) -> bool:
    """True when this model should query JOBS_ON_THE_HUB in place (no re-embed)."""
    return production_sample and model == PRODUCTION_BASELINE_MODEL


def summarize_query_results(model: str, results: list[QueryResult]) -> ModelSummary:
    """Compute missed-hit / margin summary for one model's QueryResult list."""
    all_expected_scores = [
        score
        for result in results
        for score in result.expected_scores.values()
        if score is not None
    ]
    all_noise_scores = [
        result.top_noise_score
        for result in results
        if result.top_noise_score is not None
    ]
    missed_count = sum(len(result.all_missing) for result in results)
    min_expected = min(all_expected_scores) if all_expected_scores else None
    max_noise = max(all_noise_scores) if all_noise_scores else None
    margin: float | None = None
    if min_expected is not None and max_noise is not None:
        margin = min_expected - max_noise
    return ModelSummary(
        model=model,
        missed_count=missed_count,
        min_expected_score=min_expected,
        max_noise_score=max_noise,
        separation_margin=margin,
    )


def _query_jobs_with_ollama_dense(
    client: QdrantClient,
    collection_name: str,
    model: str,
    query_text: str,
    *,
    limit: int,
    country: CountryCode | None,
) -> QueryResponse:
    """Hybrid RRF like production, but dense leg is a precomputed Ollama vector."""
    prefixed = format_ollama_embedding_input(model, query_text, is_query=True)
    vectors, _raw = embed_texts_with_ollama(model, [prefixed])
    dense_query = vectors[0]
    dense_vector_name = get_dense_vector_name(client, collection_name)
    sparse_query = models.Document(text=query_text, model=BM25_SPARSE_MODEL)
    query_filter = _build_country_remote_filter(country, None)
    prefetch_limit = max(limit * 4, 20)

    fused_request = models.QueryRequest(
        prefetch=[
            models.Prefetch(
                query=dense_query,
                using=dense_vector_name,
                filter=query_filter,
                limit=prefetch_limit,
            ),
            models.Prefetch(
                query=sparse_query,
                using=BM25_SPARSE_VECTOR_NAME,
                filter=query_filter,
                limit=prefetch_limit,
            ),
        ],
        query=models.FusionQuery(fusion=models.Fusion.RRF),
        filter=query_filter,
        limit=limit,
        with_payload=True,
    )
    companion_request = models.QueryRequest(
        query=dense_query,
        using=dense_vector_name,
        filter=query_filter,
        limit=limit,
        with_payload=True,
    )
    fused_response, companion_response = client.query_batch_points(
        collection_name=collection_name,
        requests=[fused_request, companion_request],
    )
    dense_scores_by_id = {
        point.id: float(point.score) for point in companion_response.points
    }
    merged_points = _attach_dense_scores_to_fused_hits(
        list(fused_response.points),
        dense_scores_by_id,
    )
    return QueryResponse(points=merged_points)


def _query_result_from_response(
    case: dict[str, Any],
    response: QueryResponse,
) -> QueryResult:
    ranked_hits: list[RankedHit] = []
    hits_by_id: dict[str, float] = {}
    for hit in response.points:
        if not hit.payload:
            continue
        job_id = str(hit.payload.get("job_url_identifier") or "")
        score = float(hit.score)
        ranked_hits.append(
            RankedHit(
                job_id=job_id,
                score=score,
                job_title=str(hit.payload.get("job_title") or ""),
                company=str(hit.payload.get("company") or ""),
                country=str(hit.payload.get("Country") or ""),
            )
        )
        if job_id:
            hits_by_id[job_id] = score

    result = QueryResult(
        query_id=case["id"],
        query_text=case["query"],
        expected_job_ids=list(case["expected_job_ids"]),
        ranked_hits=ranked_hits,
    )
    if ranked_hits:
        result.top_hit_job_id = ranked_hits[0].job_id
        result.top_hit_score = ranked_hits[0].score

    for job_id in case["expected_job_ids"]:
        result.expected_scores[job_id] = hits_by_id.get(job_id)
        if job_id not in hits_by_id:
            result.all_missing.append(job_id)

    noise_scores = [
        score
        for job_id, score in hits_by_id.items()
        if job_id not in case["expected_job_ids"]
    ]
    result.top_noise_score = max(noise_scores) if noise_scores else None
    return result


def run_golden_queries_against(
    client: QdrantClient,
    collection_name: str,
    model: str,
    golden_set: dict[str, Any],
) -> list[QueryResult]:
    """Run golden queries against one seeded collection; return structured results."""
    results: list[QueryResult] = []
    top_k = int(golden_set["top_k"])
    use_ollama = is_ollama_embedding_model(model)

    for case in golden_set["queries"]:
        country_filter = case.get("country")
        country_code = CountryCode(country_filter) if country_filter else None
        if use_ollama:
            response = _query_jobs_with_ollama_dense(
                client,
                collection_name,
                model,
                case["query"],
                limit=top_k,
                country=country_code,
            )
        else:
            with embedding_model_override(model):
                response = query_jobs_in_qdrant(
                    db_client=client,
                    collection_name=collection_name,
                    query_text=case["query"],
                    limit=top_k,
                    country=country_code,
                )
        results.append(_query_result_from_response(case, response))
    return results


def compare_embedding_models(
    models: list[str] | None = None,
    *,
    keep_collections: bool = False,
    client: QdrantClient | None = None,
    progress: ProgressCallback | None = None,
    stored_jobs: list[StoredJob] | None = None,
    production_corpus: bool = False,
    production_sample: bool = False,
    sample_per_bucket: int = DEFAULT_SAMPLE_PER_BUCKET,
    sample_rng_seed: int = DEFAULT_SAMPLE_RNG_SEED,
) -> EmbeddingComparisonResult:
    """Seed disposable collections and compare models on the golden query set.

    Returns structured results suitable for CLIs and UI (ALE-146). Creates
    ``JOBS_COMPARE_*`` collections and deletes them unless ``keep_collections``.

    ``progress``, when provided, receives human-readable status lines (CLI
    progress); the library itself does not print.

    When ``production_corpus`` is true, collections are seeded from a read-only
    scroll of ``QDRANT_COLLECTION_NAME`` (stored ``document_text`` as-is). The
    production collection is never written. Golden ``expected_job_ids`` are
    fixture IDs and typically will not match production Hub ids.

    When ``production_sample`` is true, Ollama candidates are seeded from a
    stratified subset of that corpus; ``intfloat/multilingual-e5-small`` queries
    the live production collection (existing vectors, read-only).
    """

    def _progress(message: str) -> None:
        if progress is not None:
            progress(message)

    validate_qdrant_config()
    cloud_mode = uses_cloud_inference()
    if cloud_mode:
        _progress("Qdrant Cloud detected — using Cloud Inference.")
    else:
        _progress("Local / non-Cloud Qdrant — resolving via FastEmbed aliases.")

    chosen = list(models) if models is not None else list(DEFAULT_MODELS)
    if len(chosen) < 2:
        raise ValueError("compare_embedding_models requires at least two models")

    resolved: list[str] = []
    for name in chosen:
        resolved_name = resolve_model_name(name, cloud_mode=cloud_mode)
        if resolved_name != name:
            _progress(f"Resolved model alias: {name!r} -> {resolved_name!r}")
        resolved.append(resolved_name)

    ollama_models = [m for m in resolved if is_ollama_embedding_model(m)]
    if ollama_models:
        _progress(
            "Ollama embedding backend for: "
            + ", ".join(
                f"{m} (dim={dense_vector_size_for_ollama_model(m)})"
                for m in ollama_models
            )
        )

    qdrant = client if client is not None else get_comparison_client()
    golden_set = load_golden_queries()
    prod_name = get_settings().qdrant_collection_name
    if production_sample and production_corpus:
        raise ValueError("Use either production_sample or production_corpus, not both.")

    query_collections: dict[str, str] = {}
    for model in resolved:
        if _uses_live_production_vectors(model, production_sample=production_sample):
            query_collections[model] = prod_name
        else:
            query_collections[model] = collection_name_for_model(model)

    corpus = stored_jobs
    sample_stats = None
    if production_corpus or production_sample:
        if corpus is None:
            _progress(f"Loading production corpus from {prod_name!r} (read-only)...")
            corpus = load_production_stored_jobs(qdrant, prod_name, progress=_progress)
            if not corpus:
                raise ValueError(
                    f"No usable points in {prod_name!r} (need document_text)."
                )
            _progress(f"Loaded {len(corpus)} production jobs (read-only).")
        else:
            _progress(f"Using {len(corpus)} stored jobs as the production source.")
        if production_sample:
            fixture_tokens = {
                job.job_id: count_e5_tokens(job.document_text)
                for job in stored_jobs_from_opportunities(load_golden_jobs())
            }
            guaranteed = expected_job_ids_from_queries(golden_set["queries"])
            _progress(
                "Building stratified sample "
                f"(per_bucket={sample_per_bucket}, rng_seed={sample_rng_seed})..."
            )
            corpus, sample_stats = stratified_production_sample(
                corpus,
                guaranteed_ids=guaranteed,
                per_bucket=sample_per_bucket,
                rng_seed=sample_rng_seed,
                queries=golden_set["queries"],
                fixture_tokens=fixture_tokens,
            )
            _progress(
                f"Stratified sample size: {sample_stats.sample_size} "
                f"(of {sample_stats.corpus_size} production docs)."
            )
            _progress(
                "Guaranteed expected ids found: "
                f"{sample_stats.guaranteed_found or 'none'}; "
                f"missing: {sample_stats.guaranteed_missing or 'none'}."
            )
            for bucket, available in sample_stats.bucket_available.items():
                sampled = sample_stats.bucket_sampled[bucket]
                _progress(f"  bucket {bucket}: available={available} sampled={sampled}")
    elif corpus is not None:
        _progress(f"Seeding from {len(corpus)} stored jobs.")

    results_by_model: dict[str, list[QueryResult]] = {}
    summaries: dict[str, ModelSummary] = {}
    seeded_names: list[str] = []

    try:
        for model, collection_name in query_collections.items():
            if _uses_live_production_vectors(
                model, production_sample=production_sample
            ):
                _progress(
                    f"Querying production {collection_name!r} read-only for "
                    f"{model!r} (existing vectors, no re-embed)..."
                )
                results = run_golden_queries_against(
                    qdrant, collection_name, model, golden_set
                )
                results_by_model[model] = results
                summaries[model] = summarize_query_results(model, results)
                continue

            if qdrant.collection_exists(collection_name):
                _progress(
                    f"Dropping pre-existing {collection_name!r} before reseeding..."
                )
                delete_collections(qdrant, [collection_name])
            if is_ollama_embedding_model(model):
                dim = dense_vector_size_for_ollama_model(model)
                _progress(
                    f"Seeding {collection_name!r} with Ollama model {model!r} "
                    f"(dense dim={dim}, docs={len(corpus) if corpus else 'golden'})..."
                )
            else:
                _progress(f"Seeding {collection_name!r} with model {model!r}...")
            seed_collection_for_model(
                qdrant,
                collection_name,
                model,
                stored_jobs=corpus,
                progress=_progress,
            )
            seeded_names.append(collection_name)
            info = qdrant.get_collection(collection_name)
            _progress(
                f"Collection {collection_name!r}: status={info.status}, "
                f"points={info.points_count}"
            )
            _progress(f"Running golden queries against {collection_name!r}...")
            results = run_golden_queries_against(
                qdrant, collection_name, model, golden_set
            )
            results_by_model[model] = results
            summaries[model] = summarize_query_results(model, results)
            if (production_corpus or production_sample) and not keep_collections:
                _progress(f"Dropping {collection_name!r} after queries...")
                delete_collections(qdrant, [collection_name])
                seeded_names.remove(collection_name)
    finally:
        if not keep_collections and seeded_names:
            _progress("Cleaning up disposable comparison collections...")
            delete_collections(qdrant, seeded_names)
        elif keep_collections:
            kept = [
                f"{model!r}->{name!r}"
                for model, name in query_collections.items()
                if name != prod_name
            ]
            _progress("Keeping collections: " + (", ".join(kept) if kept else "none"))

    return EmbeddingComparisonResult(
        models=resolved,
        results_by_model=results_by_model,
        summaries=summaries,
        collection_names=query_collections,
        sample_stats=sample_stats,
    )
