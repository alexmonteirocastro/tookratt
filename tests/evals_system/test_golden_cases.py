"""Unit tests for golden-set walkthrough case loading (no Streamlit)."""

from __future__ import annotations

from evals.fixtures import load_golden_queries
from evals_system.golden_cases import (
    FIXTURE_COLLECTION_NAME,
    WALKTHROUGH_GROUPS,
    load_walkthrough_cases,
    walkthrough_top_k,
)


def test_load_walkthrough_cases_includes_all_groups() -> None:
    cases = load_walkthrough_cases()
    ids = {case.id: case for case in cases}

    assert "backend-copenhagen" in ids
    assert "frontend-copenhagen" in ids
    assert "python-fastapi" in ids
    assert {case.group for case in cases} == set(WALKTHROUGH_GROUPS)


def test_walkthrough_case_joins_expected_jobs_from_golden_jobs() -> None:
    cases = load_walkthrough_cases()
    backend = next(case for case in cases if case.id == "backend-copenhagen")
    assert backend.query.startswith("remote backend engineer")
    assert backend.expected_job_ids == ("abc123",)
    assert backend.expected_jobs[0].company == "Acme Corp"
    assert backend.expected_jobs[0].job_title == "Backend Engineer"
    assert backend.country is None
    assert FIXTURE_COLLECTION_NAME == "JOBS_DEV"


def test_walkthrough_case_keeps_country_filter_and_confusers() -> None:
    cases = load_walkthrough_cases()
    filtered = next(
        case for case in cases if case.id == "backend-python-denmark-filtered"
    )
    assert filtered.country == "DK"

    confusion = next(case for case in cases if case.id == "frontend-copenhagen")
    assert confusion.confuser_job_ids == ("cph002", "cph003")
    assert {job.job_id for job in confusion.confuser_jobs} == {"cph002", "cph003"}
    assert confusion.notes is not None


def test_walkthrough_top_k_reads_golden_queries_fixture() -> None:
    assert walkthrough_top_k() == 8


def test_walkthrough_loads_every_case_in_golden_queries() -> None:
    golden_set = load_golden_queries()
    expected = sum(len(golden_set[group]) for group in WALKTHROUGH_GROUPS)
    assert len(load_walkthrough_cases()) == expected
