"""Unit tests for stratified production sampling (no Qdrant)."""

from __future__ import annotations

import pytest

from evals.corpus_sample import (
    JobTokenCount,
    bucket_for_token_count,
    expected_job_ids_from_queries,
    stratified_production_sample,
    truncation_rows_for_queries,
)
from evals.types import StoredJob


def _job(job_id: str, text: str = "x") -> StoredJob:
    return StoredJob(job_id=job_id, document_text=text)


@pytest.mark.parametrize(
    ("tokens", "bucket"),
    [
        (0, "under_512"),
        (511, "under_512"),
        (512, "512_1024"),
        (1023, "512_1024"),
        (1024, "1024_2048"),
        (2047, "1024_2048"),
        (2048, "2048_2493"),
        (2492, "2048_2493"),
        (2493, "2493_3094"),
        (3094, "2493_3094"),
        (10_000, "2493_3094"),
    ],
)
def test_bucket_for_token_count(tokens: int, bucket: str) -> None:
    assert bucket_for_token_count(tokens) == bucket


def test_expected_job_ids_from_queries_dedupes_in_order() -> None:
    queries = [
        {"id": "a", "expected_job_ids": ["abc123"]},
        {"id": "b", "expected_job_ids": ["def456"]},
        {"id": "c", "expected_job_ids": ["abc123"]},
    ]
    assert expected_job_ids_from_queries(queries) == ["abc123", "def456"]


def test_stratified_sample_guarantees_ids_and_caps_buckets() -> None:
    jobs: list[StoredJob] = []
    for i in range(10):
        jobs.append(_job(f"u{i}", "under"))
    for i in range(60):
        jobs.append(_job(f"m{i}", "mid"))
    for i in range(8):
        jobs.append(_job(f"t{i}", "tail"))

    def tokens(text: str) -> int:
        return {"under": 100, "mid": 800, "tail": 2600}[text]

    sample, stats = stratified_production_sample(
        jobs,
        guaranteed_ids=["u0", "missing-id"],
        per_bucket=5,
        rng_seed=183,
        token_count=tokens,
        queries=[{"id": "q1", "expected_job_ids": ["u0", "missing-id"]}],
    )
    ids = {job.job_id for job in sample}
    assert "u0" in ids
    assert "missing-id" not in ids
    assert stats.guaranteed_found == ["u0"]
    assert stats.guaranteed_missing == ["missing-id"]
    assert stats.bucket_available["under_512"] == 10
    assert stats.bucket_available["512_1024"] == 60
    assert stats.bucket_available["2493_3094"] == 8
    assert stats.bucket_sampled["under_512"] == 6
    assert stats.bucket_sampled["512_1024"] == 5
    assert stats.bucket_sampled["2493_3094"] == 5
    assert stats.sample_size == 16
    assert stats.bucket_sampled["1024_2048"] == 0
    assert stats.bucket_sampled["2048_2493"] == 0
    sample2, stats2 = stratified_production_sample(
        jobs,
        guaranteed_ids=["u0", "missing-id"],
        per_bucket=5,
        rng_seed=183,
        token_count=tokens,
    )
    assert [job.job_id for job in sample2] == [job.job_id for job in sample]
    assert stats2.sample_size == stats.sample_size


def test_truncation_rows_fixture_only_vs_production() -> None:
    prod = JobTokenCount(
        job=_job("hub1", "long"),
        e5_tokens=900,
        bucket="512_1024",
    )
    rows = truncation_rows_for_queries(
        [
            {"id": "q1", "expected_job_ids": ["hub1"]},
            {"id": "q2", "expected_job_ids": ["abc123"]},
        ],
        {"hub1": prod},
        fixture_tokens={"abc123": 31},
    )
    assert rows[0].location == "production"
    assert rows[0].over_512 is True
    assert rows[1].location == "fixture-only"
    assert rows[1].e5_tokens == 31
    assert rows[1].over_512 is False
