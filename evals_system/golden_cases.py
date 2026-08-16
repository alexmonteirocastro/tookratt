"""Flatten golden query fixtures into walkthrough cases (no Streamlit)."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from evals.fixtures import load_golden_jobs, load_golden_queries
from the_hub_client.models import JobOpportunity

WALKTHROUGH_GROUPS: tuple[str, ...] = (
    "queries",
    "role_confusion_cases",
    "tech_stack_adversarial_cases",
)

FIXTURE_COLLECTION_NAME = "JOBS_DEV"


@dataclass(frozen=True)
class GoldenJobSummary:
    job_id: str
    job_title: str
    company: str
    country: str
    locality: str
    remote: bool
    job_description: str


@dataclass(frozen=True)
class GoldenWalkthroughCase:
    id: str
    query: str
    country: str | None
    expected_job_ids: tuple[str, ...]
    confuser_job_ids: tuple[str, ...]
    group: str
    notes: str | None
    expected_jobs: tuple[GoldenJobSummary, ...]
    confuser_jobs: tuple[GoldenJobSummary, ...]


def _job_summary(job: JobOpportunity) -> GoldenJobSummary:
    return GoldenJobSummary(
        job_id=job.job_id,
        job_title=job.job_title,
        company=job.company,
        country=job.country,
        locality=job.locality,
        remote=job.remote,
        job_description=job.job_description,
    )


def _lookup_jobs(
    job_ids: list[str],
    jobs_by_id: dict[str, JobOpportunity],
) -> tuple[GoldenJobSummary, ...]:
    found: list[GoldenJobSummary] = []
    for job_id in job_ids:
        job = jobs_by_id.get(job_id)
        if job is not None:
            found.append(_job_summary(job))
    return tuple(found)


def _str_ids(raw: Any) -> tuple[str, ...]:
    if not isinstance(raw, list):
        return ()
    return tuple(str(item) for item in raw)


@lru_cache(maxsize=1)
def walkthrough_top_k() -> int:
    """Retrieval depth for walkthrough runs (golden_queries.json ``top_k``)."""
    raw = load_golden_queries().get("top_k", 5)
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 5


@lru_cache(maxsize=1)
def load_walkthrough_cases() -> tuple[GoldenWalkthroughCase, ...]:
    """Load every golden query group, joined to ``golden_jobs.json`` rows."""
    golden_set = load_golden_queries()
    jobs_by_id = {job.job_id: job for job in load_golden_jobs()}
    cases: list[GoldenWalkthroughCase] = []
    for group in WALKTHROUGH_GROUPS:
        raw_cases = golden_set.get(group, [])
        if not isinstance(raw_cases, list):
            continue
        for raw in raw_cases:
            if not isinstance(raw, dict):
                continue
            expected_ids = _str_ids(raw.get("expected_job_ids"))
            confuser_ids = _str_ids(raw.get("confuser_job_ids"))
            country_raw = raw.get("country")
            country = str(country_raw) if country_raw else None
            notes_raw = raw.get("notes")
            notes = str(notes_raw) if notes_raw else None
            cases.append(
                GoldenWalkthroughCase(
                    id=str(raw["id"]),
                    query=str(raw["query"]),
                    country=country,
                    expected_job_ids=expected_ids,
                    confuser_job_ids=confuser_ids,
                    group=group,
                    notes=notes,
                    expected_jobs=_lookup_jobs(list(expected_ids), jobs_by_id),
                    confuser_jobs=_lookup_jobs(list(confuser_ids), jobs_by_id),
                )
            )
    return tuple(cases)
