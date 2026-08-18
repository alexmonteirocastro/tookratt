"""Structured result types for comparison / sweep tooling (ALE-147).

Designed for CLI printers and UI consumers (ALE-146) alike — avoid print-only
APIs in the library layer.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class StoredJob:
    """A job already stored in Qdrant, keyed by Hub id + document_text.

    Used to re-embed the production corpus into disposable JOBS_COMPARE_*
    collections without rebuilding ``document_text`` from structured fields.
    """

    job_id: str
    document_text: str
    job_title: str = ""
    company: str = ""
    job_role: str = ""
    country: str = "N/A"
    locality: str = "N/A"
    remote: bool = False
    salary_type: str = ""
    salary: str = "N/A"
    equity: str = "N/A"


@dataclass
class RankedHit:
    """One retrieval hit, in fused rank order."""

    job_id: str
    score: float
    job_title: str = ""
    company: str = ""
    country: str = ""


@dataclass
class QueryResult:
    """Per-query embedding retrieval outcome against golden expectations."""

    query_id: str
    query_text: str
    expected_job_ids: list[str]
    expected_scores: dict[str, float | None] = field(default_factory=dict)
    top_noise_score: float | None = None
    all_missing: list[str] = field(default_factory=list)
    top_hit_job_id: str | None = None
    top_hit_score: float | None = None
    ranked_hits: list[RankedHit] = field(default_factory=list)


@dataclass
class ModelSummary:
    """Aggregate metrics for one embedding model over a golden query set."""

    model: str
    missed_count: int
    min_expected_score: float | None
    max_noise_score: float | None
    separation_margin: float | None


@dataclass
class ExpectedTruncationRow:
    """Whether a golden expected_job_id is a truncated production document."""

    query_id: str
    job_id: str
    location: str
    e5_tokens: int | None
    over_512: bool | None


@dataclass
class CorpusSampleStats:
    """Stratified production-sample accounting (ALE-183 phase 3)."""

    sample_size: int
    corpus_size: int
    guaranteed_found: list[str]
    guaranteed_missing: list[str]
    bucket_available: dict[str, int]
    bucket_sampled: dict[str, int]
    expected_truncation: list[ExpectedTruncationRow]


@dataclass
class EmbeddingComparisonResult:
    """Side-by-side embedding model comparison against the golden set."""

    models: list[str]
    results_by_model: dict[str, list[QueryResult]]
    summaries: dict[str, ModelSummary]
    collection_names: dict[str, str]
    sample_stats: CorpusSampleStats | None = None


@dataclass
class GenerationCaseResult:
    """One golden_generation case run through one Generator."""

    case_id: str
    query: str
    generator_label: str
    answer: str
    source_job_ids: list[str]
    expected_source_job_ids: list[str]
    missing_expected_source_ids: list[str]
    ungrounded_urls: list[str]
    ungrounded_phrases: list[str]
    generated: bool
    error: str | None = None
    duration_seconds: float | None = None


@dataclass
class GenerationComparisonResult:
    """Side-by-side generation comparison against golden_generation.json.

    Note: ``mock_answer_substring`` from the fixture is intentionally omitted —
    that field only applies to ScriptedGenerator in pytest, not live models.
    """

    generator_labels: list[str]
    results: list[GenerationCaseResult]
    collection_name: str


@dataclass
class MinScoreSweepRow:
    """One CHAT_SOURCE_MIN_SCORE candidate evaluated against retrieval scores."""

    threshold: float
    expected_survivors: int
    expected_total: int
    missed_expected: int
    confuser_survivors: int
    confuser_total: int


@dataclass
class MinScoreSweepResult:
    """Grid of CHAT_SOURCE_MIN_SCORE candidates with a suggested safe band."""

    rows: list[MinScoreSweepRow]
    suggested_max_safe_threshold: float | None
    collection_name: str


@dataclass
class ScoredHit:
    """Lightweight retrieval hit used by the min-score sweep (no Qdrant deps)."""

    job_id: str
    score: float


@dataclass
class SweepCaseScores:
    """Precomputed per-case hit scores for threshold application."""

    case_id: str
    query_text: str
    expected_job_ids: list[str]
    confuser_job_ids: list[str]
    hits: list[ScoredHit]
