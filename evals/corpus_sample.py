"""Stratified production-corpus sampling for embedding comparison (ALE-183).

Token counts use the e5-small tokenizer with the Cloud Inference ``passage: ``
prefix — same measurement as ``scripts/check_e5_document_token_lengths.py``.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from functools import lru_cache
from random import Random
from typing import Any

from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer  # type: ignore[import-untyped]

from evals.types import (
    CorpusSampleStats,
    ExpectedTruncationRow,
    StoredJob,
)

E5_MODEL = "intfloat/multilingual-e5-small"
E5_MAX_TOKENS = 512
E5_PASSAGE_PREFIX = "passage: "
DEFAULT_SAMPLE_PER_BUCKET = 50
DEFAULT_SAMPLE_RNG_SEED = 183

# (name, low inclusive, high exclusive). Last bucket has high=None (no cap).
TOKEN_BUCKETS: tuple[tuple[str, int, int | None], ...] = (
    ("under_512", 0, 512),
    ("512_1024", 512, 1024),
    ("1024_2048", 1024, 2048),
    ("2048_2493", 2048, 2493),
    ("2493_3094", 2493, None),
)


@dataclass(frozen=True)
class JobTokenCount:
    job: StoredJob
    e5_tokens: int
    bucket: str


def bucket_for_token_count(token_count: int) -> str:
    if token_count < 0:
        raise ValueError(f"token_count must be >= 0, got {token_count}")
    for name, low, high in TOKEN_BUCKETS:
        if token_count < low:
            continue
        if high is None or token_count < high:
            return name
    raise ValueError(f"No bucket for token_count={token_count}")


@lru_cache(maxsize=1)
def _load_e5_tokenizer() -> Tokenizer:
    return Tokenizer.from_file(hf_hub_download(E5_MODEL, "tokenizer.json"))


def e5_embedding_input(document_text: str) -> str:
    if document_text.startswith(E5_PASSAGE_PREFIX):
        return document_text
    return f"{E5_PASSAGE_PREFIX}{document_text}"


def count_e5_tokens(document_text: str) -> int:
    return len(_load_e5_tokenizer().encode(e5_embedding_input(document_text)).ids)


def annotate_jobs(
    jobs: Sequence[StoredJob],
    *,
    token_count: Callable[[str], int] | None = None,
) -> list[JobTokenCount]:
    counter = token_count or count_e5_tokens
    annotated: list[JobTokenCount] = []
    for job in jobs:
        tokens = counter(job.document_text)
        annotated.append(
            JobTokenCount(
                job=job, e5_tokens=tokens, bucket=bucket_for_token_count(tokens)
            )
        )
    return annotated


def expected_job_ids_from_queries(queries: Sequence[dict[str, Any]]) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for case in queries:
        for job_id in case.get("expected_job_ids", []):
            if job_id not in seen:
                seen.add(job_id)
                ids.append(str(job_id))
    return ids


def truncation_rows_for_queries(
    queries: Sequence[dict[str, Any]],
    annotated_by_id: dict[str, JobTokenCount],
    *,
    fixture_tokens: dict[str, int] | None = None,
) -> list[ExpectedTruncationRow]:
    """Per-query expected-id location + e5 token count.

    Production hits use corpus token counts. Fixture-only ids fall back to
    ``fixture_tokens`` when provided so the sanity check can still show length.
    """
    rows: list[ExpectedTruncationRow] = []
    fixtures = fixture_tokens or {}
    for case in queries:
        query_id = str(case["id"])
        for job_id in case.get("expected_job_ids", []):
            job_id = str(job_id)
            hit = annotated_by_id.get(job_id)
            if hit is not None:
                rows.append(
                    ExpectedTruncationRow(
                        query_id=query_id,
                        job_id=job_id,
                        location="production",
                        e5_tokens=hit.e5_tokens,
                        over_512=hit.e5_tokens > E5_MAX_TOKENS,
                    )
                )
                continue
            if job_id in fixtures:
                tokens = fixtures[job_id]
                rows.append(
                    ExpectedTruncationRow(
                        query_id=query_id,
                        job_id=job_id,
                        location="fixture-only",
                        e5_tokens=tokens,
                        over_512=tokens > E5_MAX_TOKENS,
                    )
                )
                continue
            rows.append(
                ExpectedTruncationRow(
                    query_id=query_id,
                    job_id=job_id,
                    location="missing",
                    e5_tokens=None,
                    over_512=None,
                )
            )
    return rows


def stratified_production_sample(
    jobs: Sequence[StoredJob],
    *,
    guaranteed_ids: Sequence[str],
    per_bucket: int = DEFAULT_SAMPLE_PER_BUCKET,
    rng_seed: int = DEFAULT_SAMPLE_RNG_SEED,
    token_count: Callable[[str], int] | None = None,
    queries: Sequence[dict[str, Any]] | None = None,
    fixture_tokens: dict[str, int] | None = None,
) -> tuple[list[StoredJob], CorpusSampleStats]:
    """Pick guaranteed ids (if present) plus up to ``per_bucket`` random docs.

    Returns the sample in stable job_id order plus accounting stats.
    """
    if per_bucket < 1:
        raise ValueError("per_bucket must be >= 1")

    annotated = annotate_jobs(jobs, token_count=token_count)
    by_id = {row.job.job_id: row for row in annotated}

    available: dict[str, int] = {name: 0 for name, _low, _high in TOKEN_BUCKETS}
    by_bucket: dict[str, list[JobTokenCount]] = {
        name: [] for name, _low, _high in TOKEN_BUCKETS
    }
    for row in annotated:
        available[row.bucket] += 1
        by_bucket[row.bucket].append(row)

    selected: dict[str, StoredJob] = {}
    found: list[str] = []
    missing: list[str] = []
    for job_id in guaranteed_ids:
        hit = by_id.get(job_id)
        if hit is None:
            missing.append(job_id)
            continue
        found.append(job_id)
        selected[job_id] = hit.job

    rng = Random(rng_seed)
    sampled_counts: dict[str, int] = {name: 0 for name, _low, _high in TOKEN_BUCKETS}
    for name, _low, _high in TOKEN_BUCKETS:
        remaining = [row for row in by_bucket[name] if row.job.job_id not in selected]
        take = min(per_bucket, len(remaining))
        if take:
            picked = rng.sample(remaining, take)
            for row in picked:
                selected[row.job.job_id] = row.job
        sampled_counts[name] = sum(
            1 for job in selected.values() if by_id[job.job_id].bucket == name
        )

    sample = [selected[job_id] for job_id in sorted(selected)]
    truncation = truncation_rows_for_queries(
        queries or [],
        by_id,
        fixture_tokens=fixture_tokens,
    )
    stats = CorpusSampleStats(
        sample_size=len(sample),
        corpus_size=len(jobs),
        guaranteed_found=found,
        guaranteed_missing=missing,
        bucket_available=available,
        bucket_sampled=sampled_counts,
        expected_truncation=truncation,
    )
    return sample, stats
