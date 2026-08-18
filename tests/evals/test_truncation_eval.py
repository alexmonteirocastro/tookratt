"""Unit tests for the ALE-183 truncation eval helpers (no Qdrant)."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from evals.truncation_eval import (
    TRUNCATION_EVAL_CASES,
    TruncationEvalCase,
    append_embed_cache,
    cache_path_for_model,
    hit_result_from_response,
    load_embed_cache,
    target_job_ids,
)


def test_truncation_eval_cases_are_ten_unique_hub_ids() -> None:
    ids = target_job_ids()
    assert len(ids) == 10
    assert len(set(ids)) == 10
    assert all(len(job_id) == 24 for job_id in ids)
    assert {case.query_id for case in TRUNCATION_EVAL_CASES} == {
        "teton-support",
        "coody-embedded",
        "voi-staff-embedded",
        "iqm-calibration",
        "light-bank-connectivity",
        "iqm-qec",
        "shine-payments",
        "tgtg-ml-lead",
        "clausal-cv-onboard",
        "hoxhunt-secops",
    }


def test_cache_path_for_model_slugs_colon_and_slash(tmp_path: Path) -> None:
    cache_dir = tmp_path
    assert cache_path_for_model(cache_dir, "qwen3-embedding:0.6b").name == (
        "qwen3-embedding_0_6b.jsonl"
    )
    assert cache_path_for_model(cache_dir, "intfloat/e5").name == "intfloat_e5.jsonl"


def test_embed_cache_roundtrip(tmp_path: Path) -> None:
    path = tmp_path / "nomic-embed-text.jsonl"
    append_embed_cache(path, [("job-a", [0.1, 0.2]), ("job-b", [0.3, 0.4])])
    loaded = load_embed_cache(path)
    assert loaded == {"job-a": [0.1, 0.2], "job-b": [0.3, 0.4]}
    append_embed_cache(path, [("job-c", [0.5, 0.6])])
    loaded = load_embed_cache(path)
    assert set(loaded) == {"job-a", "job-b", "job-c"}
    assert load_embed_cache(tmp_path / "missing.jsonl") == {}


def test_hit_result_from_response_records_rank_floor_and_noise() -> None:
    case = TruncationEvalCase(
        query_id="demo",
        job_id="target",
        title="T",
        company="C",
        country="DK",
        e5_tokens_draft=1000,
        query="q",
    )
    response = SimpleNamespace(
        points=[
            SimpleNamespace(
                score=0.91,
                payload={"job_url_identifier": "noise-1", "job_title": "N"},
            ),
            SimpleNamespace(
                score=0.86,
                payload={"job_url_identifier": "target", "job_title": "T"},
            ),
            SimpleNamespace(
                score=0.80,
                payload={"job_url_identifier": "noise-2", "job_title": "N2"},
            ),
        ]
    )
    hit = hit_result_from_response(
        case, "nomic-embed-text", response, floor=0.85, corpus_size=80
    )
    assert hit.rank == 2
    assert hit.score == 0.86
    assert hit.clears_floor is True
    assert hit.top_noise_score == 0.91
    assert hit.top_noise_job_id == "noise-1"
    assert hit.corpus_size == 80
    assert hit.missing_dense_sentinel is False


def test_hit_result_from_response_miss_and_sentinel() -> None:
    case = TruncationEvalCase(
        query_id="demo",
        job_id="target",
        title="T",
        company="C",
        country="DK",
        e5_tokens_draft=1000,
        query="q",
    )
    miss = hit_result_from_response(
        case,
        "e5",
        SimpleNamespace(
            points=[
                SimpleNamespace(
                    score=0.9,
                    payload={"job_url_identifier": "other", "job_title": "O"},
                )
            ]
        ),
        floor=0.85,
        corpus_size=1111,
    )
    assert miss.rank is None
    assert miss.score is None
    assert miss.clears_floor is False
    assert miss.top_noise_job_id == "other"

    sentinel = hit_result_from_response(
        case,
        "e5",
        SimpleNamespace(
            points=[
                SimpleNamespace(
                    score=-1.0,
                    payload={"job_url_identifier": "target", "job_title": "T"},
                )
            ]
        ),
        floor=0.85,
        corpus_size=1111,
    )
    assert sentinel.rank == 1
    assert sentinel.score == -1.0
    assert sentinel.clears_floor is False
    assert sentinel.missing_dense_sentinel is True
