"""ALE-183 phase 5: truncation eval on 10 production jobs past e5's 512-token cut.

Does not write production. Does not touch ``golden_queries.json``. Ollama
candidates embed a small stratified noise pool into disposable ``JOBS_COMPARE_*``
collections; e5-small queries live ``JOBS_ON_THE_HUB`` read-only.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

from huggingface_hub import hf_hub_download
from qdrant_client import QdrantClient
from qdrant_client.http.models import QueryResponse
from tokenizers import Tokenizer  # type: ignore[import-untyped]

from db import query_jobs_in_qdrant
from db.settings import DEFAULT_CHAT_SOURCE_MIN_SCORE, MISSING_DENSE_SCORE, get_settings
from evals.collections import (
    collection_name_for_model,
    delete_collections,
    embedding_model_override,
    get_comparison_client,
    load_production_stored_jobs,
    seed_collection_for_model,
    validate_qdrant_config,
)
from evals.corpus_sample import (
    DEFAULT_SAMPLE_RNG_SEED,
    count_e5_tokens,
    stratified_production_sample,
)
from evals.embeddings import (
    PRODUCTION_BASELINE_MODEL,
    _query_jobs_with_ollama_dense,
    _query_result_from_response,
)
from evals.ollama_embeddings import (
    dense_vector_size_for_ollama_model,
    embed_texts_with_ollama_batched,
    format_ollama_embedding_input,
    is_ollama_embedding_model,
)
from evals.types import CorpusSampleStats, StoredJob

_REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_EMBED_CACHE_DIR = _REPO_ROOT / "tmp" / "ale-183-embed-cache"
TRUNCATION_SAMPLE_PER_BUCKET = 14
E5_PRODUCTION_QUERY_LIMIT = 200
OLLAMA_EMBED_TIMEOUT_SECONDS = 600.0

ProgressCallback = Callable[[str], None]


@dataclass(frozen=True)
class TruncationEvalCase:
    """One conversational /chat query whose matching signal sits past e5 token 512."""

    query_id: str
    job_id: str
    title: str
    company: str
    country: str
    e5_tokens_draft: int
    query: str


@dataclass(frozen=True)
class CandidateTokenizerSpec:
    model: str
    tokenizer_repo: str
    window: int
    notes: str = ""
    tokenizer_filename: str = "tokenizer.json"


@dataclass
class TokenizerWindowRow:
    job_id: str
    query_id: str
    title: str
    company: str
    e5_tokens: int
    e5_tokens_draft: int
    model: str
    tokenizer_repo: str
    token_count: int
    window: int
    truncates: bool
    notes: str = ""


@dataclass
class TruncationHitResult:
    """Per-query retrieval outcome for one model."""

    model: str
    query_id: str
    job_id: str
    rank: int | None
    score: float | None
    clears_floor: bool
    top_noise_score: float | None
    top_noise_job_id: str | None
    returned: int
    corpus_size: int
    missing_dense_sentinel: bool = False


@dataclass
class TruncationEvalResult:
    cases: list[TruncationEvalCase]
    tokenizer_rows: list[TokenizerWindowRow]
    sample_stats: CorpusSampleStats | None
    results_by_model: dict[str, list[TruncationHitResult]]
    collection_names: dict[str, str]
    cache_dir: Path
    floor: float
    notes: list[str] = field(default_factory=list)


# Canvas source of truth (phase 4 review pass 2). Do not copy into golden_queries.json.
TRUNCATION_EVAL_CASES: tuple[TruncationEvalCase, ...] = (
    TruncationEvalCase(
        query_id="teton-support",
        job_id="6a3102321f1c3f395d056434",
        title="Support Engineer",
        company="Teton",
        country="Denmark",
        e5_tokens_draft=1007,
        query=(
            "looking for a support role that actually debugs devices and "
            "local networks in care homes, not just ticket triage"
        ),
    ),
    TruncationEvalCase(
        query_id="coody-embedded",
        job_id="6a0f9d79f9b8a7bd4c7fc03c",
        title="Embedded Software Engineer",
        company="COODY",
        country="Sweden",
        e5_tokens_draft=1054,
        query=(
            "looking for an embedded role doing Linux driver development, "
            "ideally with I2C/SPI experience"
        ),
    ),
    TruncationEvalCase(
        query_id="voi-staff-embedded",
        job_id="6a2c9e33f7fd1a2ebcfdbc95",
        title="Staff Embedded",
        company="Voi",
        country="Sweden",
        e5_tokens_draft=1307,
        query=(
            "is there a senior embedded firmware job working on GNSS and "
            "geofencing, including recovering bricked devices?"
        ),
    ),
    TruncationEvalCase(
        query_id="iqm-calibration",
        job_id="69ded618c14e3e7a51f7b1ae",
        title="Quantum Engineer, Calibration",
        company="IQM",
        country="Finland",
        e5_tokens_draft=1308,
        query=(
            "any quantum hardware roles that include writing calibration "
            "software and automated QPU tune-up, not just lab work?"
        ),
    ),
    TruncationEvalCase(
        query_id="light-bank-connectivity",
        job_id="6a2a7fd070291b341084904e",
        title="Bank Connectivity",
        company="Light",
        country="United Kingdom",
        e5_tokens_draft=1317,
        query=(
            "not a pure SWE role — more like keeping host-to-host bank "
            "connections healthy and debugging payment file formats"
        ),
    ),
    TruncationEvalCase(
        query_id="iqm-qec",
        job_id="69b89a52e88221d14bc43ed7",
        title="QEC Engineer",
        company="IQM",
        country="Germany",
        e5_tokens_draft=1446,
        query=(
            "quantum error correction role where I'd actually implement "
            "decoders, ideally on FPGA or in Rust"
        ),
    ),
    TruncationEvalCase(
        query_id="shine-payments",
        job_id="6a5ac21dfb0d306cbef8c56c",
        title="Staff Engineer - Payment",
        company="Shine",
        country="Denmark",
        e5_tokens_draft=1722,
        query=(
            "staff-level payments engineer who has to stay PCI DSS compliant "
            "and care about reconciliation, not just feature work"
        ),
    ),
    TruncationEvalCase(
        query_id="tgtg-ml-lead",
        job_id="6a3c737d0ddf507f87b1e792",
        title="CoE Lead DS/ML",
        company="Too Good To Go",
        country="Denmark",
        e5_tokens_draft=1727,
        query=(
            "looking for an ML lead on a marketplace, working on "
            "personalisation and pricing rather than just analytics"
        ),
    ),
    TruncationEvalCase(
        query_id="clausal-cv-onboard",
        job_id="6a7490a21ade78ca493e379f",
        title="CV Onboard Autonomy",
        company="Clausal",
        country="Finland",
        e5_tokens_draft=2278,
        query=(
            "computer vision job doing terrain-referenced navigation that "
            "has to run on small microcontroller hardware"
        ),
    ),
    TruncationEvalCase(
        query_id="hoxhunt-secops",
        job_id="6a4675ff12b0d2ec8e70d083",
        title="SecOps",
        company="Hoxhunt",
        country="Finland",
        e5_tokens_draft=2613,
        query=(
            "SecOps role that knows HIPAA and helps turn customer "
            "compliance requirements into product features"
        ),
    ),
)

DEFAULT_OLLAMA_CANDIDATES: tuple[str, ...] = (
    "nomic-embed-text",
    "bge-m3",
    "snowflake-arctic-embed2",
    "qwen3-embedding:0.6b",
)

CANDIDATE_TOKENIZER_SPECS: tuple[CandidateTokenizerSpec, ...] = (
    CandidateTokenizerSpec(
        model="nomic-embed-text",
        tokenizer_repo="nomic-ai/nomic-embed-text-v1.5",
        window=2048,
        notes="effective Ollama GGUF window; advertised 8192 is not honoured",
    ),
    CandidateTokenizerSpec(
        model="bge-m3",
        tokenizer_repo="BAAI/bge-m3",
        window=8192,
    ),
    CandidateTokenizerSpec(
        model="snowflake-arctic-embed2",
        tokenizer_repo="Snowflake/snowflake-arctic-embed-l-v2.0",
        window=8192,
        notes=(
            "HF tokenizer.json ships truncation=512; counting disables it. "
            "Ollama window is 8192."
        ),
    ),
    CandidateTokenizerSpec(
        model="qwen3-embedding:0.6b",
        tokenizer_repo="Qwen/Qwen3-Embedding-0.6B",
        window=32768,
    ),
)

_LONGEST_QUERY_IDS = frozenset({"clausal-cv-onboard", "hoxhunt-secops"})


def target_job_ids(cases: Sequence[TruncationEvalCase] | None = None) -> list[str]:
    chosen = cases if cases is not None else TRUNCATION_EVAL_CASES
    return [case.job_id for case in chosen]


def cache_path_for_model(cache_dir: Path, model: str) -> Path:
    safe = model.replace("/", "_").replace(":", "_").replace(".", "_")
    return cache_dir / f"{safe}.jsonl"


def load_embed_cache(path: Path) -> dict[str, list[float]]:
    if not path.exists():
        return {}
    cached: dict[str, list[float]] = {}
    with path.open() as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped:
                continue
            row = json.loads(stripped)
            job_id = str(row["job_id"])
            cached[job_id] = [float(x) for x in row["vector"]]
    return cached


def append_embed_cache(path: Path, rows: Sequence[tuple[str, list[float]]]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as handle:
        for job_id, vector in rows:
            handle.write(json.dumps({"job_id": job_id, "vector": vector}) + "\n")


@lru_cache(maxsize=8)
def _load_hf_tokenizer(repo: str, filename: str) -> Tokenizer:
    tokenizer = Tokenizer.from_file(hf_hub_download(repo, filename))
    # snowflake-arctic-embed-l-v2.0 ships tokenizer.json with truncation
    # max_length=512 (base-model leftover). Disable so counts reflect the
    # real document, not the baked-in encode cap.
    tokenizer.no_truncation()
    return tokenizer


def count_candidate_tokens(model: str, document_text: str, tokenizer: Tokenizer) -> int:
    prefixed = format_ollama_embedding_input(model, document_text, is_query=False)
    return len(tokenizer.encode(prefixed).ids)


def hit_result_from_response(
    case: TruncationEvalCase,
    model: str,
    response: QueryResponse,
    *,
    floor: float,
    corpus_size: int,
) -> TruncationHitResult:
    query_result = _query_result_from_response(
        {
            "id": case.query_id,
            "query": case.query,
            "expected_job_ids": [case.job_id],
        },
        response,
    )
    rank: int | None = None
    for index, hit in enumerate(query_result.ranked_hits, start=1):
        if hit.job_id == case.job_id:
            rank = index
            break
    score = query_result.expected_scores.get(case.job_id)
    missing_dense = score is not None and score == MISSING_DENSE_SCORE
    clears = score is not None and score >= floor
    return TruncationHitResult(
        model=model,
        query_id=case.query_id,
        job_id=case.job_id,
        rank=rank,
        score=score,
        clears_floor=clears,
        top_noise_score=query_result.top_noise_score,
        top_noise_job_id=_top_noise_job_id(query_result.ranked_hits, case.job_id),
        returned=len(query_result.ranked_hits),
        corpus_size=corpus_size,
        missing_dense_sentinel=missing_dense,
    )


def _top_noise_job_id(ranked_hits: Sequence[Any], target_id: str) -> str | None:
    best_id: str | None = None
    best_score: float | None = None
    for hit in ranked_hits:
        if hit.job_id == target_id:
            continue
        if best_score is None or hit.score > best_score:
            best_score = hit.score
            best_id = hit.job_id
    return best_id


def embed_pool_cached(
    model: str,
    jobs: Sequence[StoredJob],
    cache_dir: Path,
    *,
    progress: ProgressCallback | None = None,
) -> list[list[float]]:
    """Return dense vectors for ``jobs``, embedding only cache misses."""
    path = cache_path_for_model(cache_dir, model)
    expected_dim = dense_vector_size_for_ollama_model(model)
    cached = load_embed_cache(path)
    usable: dict[str, list[float]] = {}
    stale_ids: list[str] = []
    for job_id, vector in cached.items():
        if len(vector) == expected_dim:
            usable[job_id] = vector
        else:
            stale_ids.append(job_id)
    if stale_ids and progress is not None:
        progress(f"  cache {path.name}: ignoring {len(stale_ids)} rows with wrong dim")

    missing = [job for job in jobs if job.job_id not in usable]
    if progress is not None:
        progress(
            f"  cache {path.name}: {len(jobs) - len(missing)}/{len(jobs)} hits, "
            f"{len(missing)} to embed"
        )
    if missing:
        prefixed = [
            format_ollama_embedding_input(model, job.document_text, is_query=False)
            for job in missing
        ]
        vectors = embed_texts_with_ollama_batched(
            model,
            prefixed,
            progress=progress,
            timeout_seconds=OLLAMA_EMBED_TIMEOUT_SECONDS,
        )
        append_embed_cache(
            path,
            list(zip((job.job_id for job in missing), vectors, strict=True)),
        )
        for job, vector in zip(missing, vectors, strict=True):
            usable[job.job_id] = vector
    return [usable[job.job_id] for job in jobs]


def check_tokenizer_windows(
    jobs_by_id: dict[str, StoredJob],
    cases: Sequence[TruncationEvalCase],
    specs: Sequence[CandidateTokenizerSpec] = CANDIDATE_TOKENIZER_SPECS,
) -> list[TokenizerWindowRow]:
    missing = [case.job_id for case in cases if case.job_id not in jobs_by_id]
    if missing:
        raise ValueError(f"Target job ids missing from production scroll: {missing}")

    rows: list[TokenizerWindowRow] = []
    for spec in specs:
        tokenizer = _load_hf_tokenizer(spec.tokenizer_repo, spec.tokenizer_filename)
        for case in cases:
            job = jobs_by_id[case.job_id]
            e5_tokens = count_e5_tokens(job.document_text)
            token_count = count_candidate_tokens(
                spec.model, job.document_text, tokenizer
            )
            rows.append(
                TokenizerWindowRow(
                    job_id=case.job_id,
                    query_id=case.query_id,
                    title=case.title,
                    company=case.company,
                    e5_tokens=e5_tokens,
                    e5_tokens_draft=case.e5_tokens_draft,
                    model=spec.model,
                    tokenizer_repo=spec.tokenizer_repo,
                    token_count=token_count,
                    window=spec.window,
                    truncates=token_count > spec.window,
                    notes=spec.notes,
                )
            )
    return rows


def _query_one(
    client: QdrantClient,
    collection_name: str,
    model: str,
    case: TruncationEvalCase,
    *,
    limit: int,
    floor: float,
    corpus_size: int,
) -> TruncationHitResult:
    if is_ollama_embedding_model(model):
        response = _query_jobs_with_ollama_dense(
            client,
            collection_name,
            model,
            case.query,
            limit=limit,
            country=None,
        )
    else:
        with embedding_model_override(model):
            response = query_jobs_in_qdrant(
                db_client=client,
                collection_name=collection_name,
                query_text=case.query,
                limit=limit,
                country=None,
            )
    return hit_result_from_response(
        case, model, response, floor=floor, corpus_size=corpus_size
    )


def run_truncation_eval(
    *,
    tokenizer_check_only: bool = False,
    keep_collections: bool = False,
    cache_dir: Path | None = None,
    per_bucket: int = TRUNCATION_SAMPLE_PER_BUCKET,
    rng_seed: int = DEFAULT_SAMPLE_RNG_SEED,
    e5_query_limit: int = E5_PRODUCTION_QUERY_LIMIT,
    floor: float = DEFAULT_CHAT_SOURCE_MIN_SCORE,
    ollama_models: Sequence[str] | None = None,
    client: QdrantClient | None = None,
    progress: ProgressCallback | None = None,
    stored_jobs: list[StoredJob] | None = None,
) -> TruncationEvalResult:
    """Tokenizer-check the 10 targets, then compare e5-small vs Ollama candidates."""

    def _progress(message: str) -> None:
        if progress is not None:
            progress(message)

    validate_qdrant_config()
    cache = cache_dir if cache_dir is not None else DEFAULT_EMBED_CACHE_DIR
    cache.mkdir(parents=True, exist_ok=True)
    cases = list(TRUNCATION_EVAL_CASES)
    candidates = (
        list(ollama_models)
        if ollama_models is not None
        else list(DEFAULT_OLLAMA_CANDIDATES)
    )
    qdrant = client if client is not None else get_comparison_client()
    prod_name = get_settings().qdrant_collection_name
    notes: list[str] = []

    if stored_jobs is None:
        _progress(f"Loading production corpus from {prod_name!r} (read-only)...")
        stored_jobs = load_production_stored_jobs(qdrant, prod_name, progress=_progress)
        if not stored_jobs:
            raise ValueError(f"No usable points in {prod_name!r} (need document_text).")
        _progress(f"Loaded {len(stored_jobs)} production jobs (read-only).")

    jobs_by_id = {job.job_id: job for job in stored_jobs}
    _progress("Tokenizing the 10 target jobs with each candidate's own tokenizer...")
    tokenizer_rows = check_tokenizer_windows(jobs_by_id, cases)
    notes.extend(_tokenizer_notes(tokenizer_rows))
    notes.extend(_e5_count_drift_notes(tokenizer_rows))

    collection_names: dict[str, str] = {
        PRODUCTION_BASELINE_MODEL: prod_name,
        **{model: collection_name_for_model(model) for model in candidates},
    }
    results_by_model: dict[str, list[TruncationHitResult]] = {}
    if tokenizer_check_only:
        return TruncationEvalResult(
            cases=cases,
            tokenizer_rows=tokenizer_rows,
            sample_stats=None,
            results_by_model=results_by_model,
            collection_names=collection_names,
            cache_dir=cache,
            floor=floor,
            notes=notes,
        )

    _progress(
        f"Querying live {prod_name!r} read-only for {PRODUCTION_BASELINE_MODEL!r} "
        f"(limit={e5_query_limit}, no re-embed)..."
    )
    e5_results: list[TruncationHitResult] = []
    for case in cases:
        e5_results.append(
            _query_one(
                qdrant,
                prod_name,
                PRODUCTION_BASELINE_MODEL,
                case,
                limit=e5_query_limit,
                floor=floor,
                corpus_size=len(stored_jobs),
            )
        )
        _progress(
            f"  e5 {case.query_id}: rank={e5_results[-1].rank} "
            f"score={e5_results[-1].score}"
        )
    results_by_model[PRODUCTION_BASELINE_MODEL] = e5_results

    guaranteed = target_job_ids(cases)
    _progress(
        f"Building stratified ~80-doc pool (per_bucket={per_bucket}, "
        f"rng_seed={rng_seed}, guaranteed={len(guaranteed)} targets)..."
    )
    sample, sample_stats = stratified_production_sample(
        stored_jobs,
        guaranteed_ids=guaranteed,
        per_bucket=per_bucket,
        rng_seed=rng_seed,
    )
    _progress(
        f"Sample size: {sample_stats.sample_size} "
        f"(of {sample_stats.corpus_size} production docs)."
    )
    if sample_stats.guaranteed_missing:
        raise ValueError(
            f"Target ids missing from sample source: {sample_stats.guaranteed_missing}"
        )
    sample_ids_path = cache / "sample_ids.json"
    sample_ids_path.write_text(
        json.dumps([job.job_id for job in sample], indent=2) + "\n"
    )
    notes.append(
        "e5-small ranks are among the live production corpus "
        f"({len(stored_jobs)} jobs); candidate ranks are among the "
        f"{sample_stats.sample_size}-doc stratified pool. Dense score and "
        f"clears-floor ({floor}) are the comparable columns."
    )

    seeded_names: list[str] = []
    try:
        for model in candidates:
            collection_name = collection_names[model]
            _progress(
                f"Embedding pool for {model!r} "
                f"(cache={cache_path_for_model(cache, model)})..."
            )
            vectors = embed_pool_cached(model, sample, cache, progress=_progress)
            if qdrant.collection_exists(collection_name):
                _progress(
                    f"Dropping pre-existing {collection_name!r} before reseeding..."
                )
                delete_collections(qdrant, [collection_name])
            _progress(f"Seeding {collection_name!r} from cache (no re-embed)...")
            seed_collection_for_model(
                qdrant,
                collection_name,
                model,
                stored_jobs=list(sample),
                progress=_progress,
                dense_vectors=vectors,
            )
            seeded_names.append(collection_name)
            model_results: list[TruncationHitResult] = []
            query_limit = len(sample)
            for case in cases:
                model_results.append(
                    _query_one(
                        qdrant,
                        collection_name,
                        model,
                        case,
                        limit=query_limit,
                        floor=floor,
                        corpus_size=len(sample),
                    )
                )
                hit = model_results[-1]
                _progress(
                    f"  {model} {case.query_id}: rank={hit.rank} score={hit.score} "
                    f"floor={'Y' if hit.clears_floor else 'N'}"
                )
            results_by_model[model] = model_results
            if not keep_collections:
                _progress(f"Dropping {collection_name!r} after queries...")
                delete_collections(qdrant, [collection_name])
                seeded_names.remove(collection_name)
    finally:
        if not keep_collections and seeded_names:
            _progress("Cleaning up disposable comparison collections...")
            delete_collections(qdrant, seeded_names)

    return TruncationEvalResult(
        cases=cases,
        tokenizer_rows=tokenizer_rows,
        sample_stats=sample_stats,
        results_by_model=results_by_model,
        collection_names=collection_names,
        cache_dir=cache,
        floor=floor,
        notes=notes,
    )


def _tokenizer_notes(rows: Sequence[TokenizerWindowRow]) -> list[str]:
    notes: list[str] = []
    nomic_long = [
        row
        for row in rows
        if row.model == "nomic-embed-text"
        and row.query_id in _LONGEST_QUERY_IDS
        and row.truncates
    ]
    if nomic_long:
        labels = ", ".join(
            f"{row.company} {row.title} ({row.token_count} nomic-tokens > {row.window})"
            for row in nomic_long
        )
        notes.append(
            "nomic-embed-text's effective 2048-token window still truncates: " + labels
        )
    else:
        nomic_checked = [
            row
            for row in rows
            if row.model == "nomic-embed-text" and row.query_id in _LONGEST_QUERY_IDS
        ]
        if nomic_checked:
            labels = ", ".join(
                f"{row.company} {row.title} ({row.token_count} nomic-tokens)"
                for row in nomic_checked
            )
            notes.append(
                "nomic-embed-text's 2048-token window covers the two longest "
                "jobs under its own tokenizer: " + labels
            )
    other_trunc = [
        row for row in rows if row.model != "nomic-embed-text" and row.truncates
    ]
    if other_trunc:
        notes.append(
            "Unexpected truncation under a non-nomic candidate: "
            + ", ".join(
                f"{row.model}/{row.query_id}={row.token_count}" for row in other_trunc
            )
        )
    return notes


def _e5_count_drift_notes(rows: Sequence[TokenizerWindowRow]) -> list[str]:
    seen: set[str] = set()
    notes: list[str] = []
    for row in rows:
        if row.job_id in seen:
            continue
        seen.add(row.job_id)
        if row.e5_tokens != row.e5_tokens_draft:
            notes.append(
                f"e5 token count drifted for {row.company} {row.title}: "
                f"draft {row.e5_tokens_draft} vs live {row.e5_tokens}"
            )
    return notes
