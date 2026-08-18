"""Disposable JOBS_COMPARE_* collection helpers for eval comparison tooling.

Safe against production: never writes to QDRANT_COLLECTION_NAME. Seeding may
temporarily mutate the cached Settings.embedding_model — that pattern is
documented as embeddings-only and must not spread to Generator construction.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from urllib.parse import urlparse

from fastembed import TextEmbedding
from qdrant_client import QdrantClient, models

from db import (
    create_collection,
    drop_db,
    get_qdrant_client,
    get_settings,
)
from db.database import _build_document_text, get_dense_vector_name, job_id_to_point_id
from db.settings import BM25_SPARSE_MODEL, BM25_SPARSE_VECTOR_NAME, uses_cloud_inference
from evals.fixtures import load_golden_jobs
from evals.ollama_embeddings import (
    dense_vector_size_for_ollama_model,
    embed_texts_with_ollama_batched,
    format_ollama_embedding_input,
    is_ollama_embedding_model,
    ollama_model_tag,
)
from evals.types import StoredJob
from prompt_injection import sanitize_document_text
from the_hub_client import JobOpportunity

# Shorthand / ticket names -> local FastEmbed registry name.
_FASTEMBED_ALIASES: dict[str, str] = {
    "all-minilm-l6-v2": "sentence-transformers/all-MiniLM-L6-v2",
    "sentence-transformers/all-minilm-l6-v2": "sentence-transformers/all-MiniLM-L6-v2",
}

# Shorthand / ticket names -> Qdrant Cloud Inference API name.
# Cloud rejects bare `all-MiniLM-L6-v2`; use sentence-transformers/... instead.
_CLOUD_INFERENCE_ALIASES: dict[str, str] = {
    "all-minilm-l6-v2": "sentence-transformers/all-MiniLM-L6-v2",
    "sentence-transformers/all-minilm-l6-v2": "sentence-transformers/all-MiniLM-L6-v2",
}

GENERATION_COMPARE_COLLECTION = "JOBS_COMPARE_GENERATION"
MIN_SCORE_SWEEP_COLLECTION = "JOBS_COMPARE_MIN_SCORE_SWEEP"
PRODUCTION_SCROLL_BATCH_SIZE = 100
CLOUD_UPSERT_BATCH_SIZE = 25


def collection_name_for_model(model: str) -> str:
    """Build a disposable collection name from an embedding model id.

    Single slugifier for JOBS_COMPARE_* naming: ``/`` and ``.`` → ``_``, then
    uppercased. Do not reimplement elsewhere.
    """
    safe = model.replace("/", "_").replace(".", "_").replace(":", "_")
    return f"JOBS_COMPARE_{safe.upper()}"


def is_local_qdrant() -> bool:
    settings = get_settings()
    host = urlparse(settings.qdrant_url).hostname or ""
    return settings.qdrant_api_key is None and host in {"localhost", "127.0.0.1", "::1"}


def validate_qdrant_config() -> None:
    settings = get_settings()
    if uses_cloud_inference(settings) or is_local_qdrant():
        return
    raise ValueError(
        f"QDRANT_URL points at Qdrant Cloud ({settings.qdrant_url}) but "
        "QDRANT_API_KEY is not set. Add your cluster API key to .env, or "
        "point QDRANT_URL at local Qdrant (http://localhost:6333) for "
        "FastEmbed-only comparison."
    )


def get_comparison_client() -> QdrantClient:
    """Return a Qdrant client configured for embedding comparison paths."""
    settings = get_settings()
    if uses_cloud_inference(settings):
        return QdrantClient(
            url=settings.qdrant_url,
            api_key=settings.qdrant_api_key,
            cloud_inference=True,
            check_compatibility=False,
        )
    return get_qdrant_client()


def fastembed_supported_models() -> set[str]:
    return {entry["model"] for entry in TextEmbedding.list_supported_models()}


def resolve_model_name(model: str, *, cloud_mode: bool) -> str:
    if is_ollama_embedding_model(model):
        return ollama_model_tag(model)

    if cloud_mode:
        alias = _CLOUD_INFERENCE_ALIASES.get(model.lower())
        return alias if alias else model

    supported = fastembed_supported_models()
    if model in supported:
        return model

    alias = _FASTEMBED_ALIASES.get(model.lower())
    if alias and alias in supported:
        return alias

    raise ValueError(
        f"Model {model!r} is not available in local FastEmbed. "
        f"Supported locally: {sorted(supported)}. "
        "Point QDRANT_URL/QDRANT_API_KEY at Qdrant Cloud to use "
        "intfloat/multilingual-e5-small and other Cloud Inference models."
    )


@contextmanager
def embedding_model_override(model: str) -> Iterator[None]:
    """Temporarily mutate cached Settings.embedding_model for seeding/querying.

    NOTE: get_settings() is an lru_cache'd singleton. This is a deliberate,
    narrow hack for disposable comparison tooling — do not reuse inside the
    application itself, and do not use for Generator / LLMSettings.
    """
    settings = get_settings()
    original_model = settings.embedding_model
    settings.embedding_model = model
    try:
        yield
    finally:
        settings.embedding_model = original_model


def _create_ollama_comparison_collection(
    client: QdrantClient, collection_name: str, model: str
) -> int:
    """Create a JOBS_COMPARE_* collection sized for an Ollama embedding model.

    Dense size comes from ``ollama show``-confirmed dims. BM25 sparse is still
    attached so ranking matches production hybrid RRF (dense from Ollama, sparse
    from Cloud Inference ``qdrant/bm25``).
    """
    dim = dense_vector_size_for_ollama_model(model)
    client.create_collection(
        collection_name=collection_name,
        vectors_config={
            "dense": models.VectorParams(size=dim, distance=models.Distance.COSINE)
        },
        sparse_vectors_config={
            BM25_SPARSE_VECTOR_NAME: models.SparseVectorParams(
                modifier=models.Modifier.IDF
            )
        },
    )
    client.create_payload_index(
        collection_name=collection_name,
        field_name="Country",
        field_schema=models.PayloadSchemaType.KEYWORD,
    )
    client.create_payload_index(
        collection_name=collection_name,
        field_name="Remote",
        field_schema=models.PayloadSchemaType.BOOL,
    )
    return dim


def _chunks(items: list[StoredJob], size: int) -> Iterator[list[StoredJob]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _vector_chunks(items: list[list[float]], size: int) -> Iterator[list[list[float]]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _stored_job_payload(job: StoredJob) -> dict[str, object]:
    return {
        "job_url_identifier": job.job_id,
        "job_title": job.job_title,
        "company": job.company,
        "job_role": job.job_role,
        "Country": job.country,
        "location": job.locality,
        "Remote": job.remote,
        "Salary Type": job.salary_type,
        "Salary": job.salary,
        "Equity": job.equity,
        "document_text": job.document_text,
    }


def stored_jobs_from_opportunities(jobs: list[JobOpportunity]) -> list[StoredJob]:
    """Build StoredJob rows from fixture JobOpportunity objects (golden set)."""
    from logging_config import log_injection_detected

    stored: list[StoredJob] = []
    for job in jobs:
        doc_text, matched_patterns = sanitize_document_text(_build_document_text(job))
        if matched_patterns:
            for pattern in matched_patterns:
                log_injection_detected(
                    source="ingestion",
                    pattern=pattern,
                    job_id=job.job_id,
                )
        stored.append(
            StoredJob(
                job_id=job.job_id,
                document_text=doc_text,
                job_title=job.job_title,
                company=job.company,
                job_role=job.job_role,
                country=job.country,
                locality=job.locality,
                remote=job.remote,
                salary_type=job.salary_type,
                salary=job.salary,
                equity=job.equity,
            )
        )
    return stored


def load_production_stored_jobs(
    client: QdrantClient,
    collection_name: str,
    *,
    progress: Callable[[str], None] | None = None,
) -> list[StoredJob]:
    """READ-ONLY scroll of a Qdrant collection into StoredJob rows."""

    def _progress(message: str) -> None:
        if progress is not None:
            progress(message)

    _progress(f"Scrolling {collection_name!r} (read-only)...")
    jobs: list[StoredJob] = []
    next_offset = None
    while True:
        batch, next_offset = client.scroll(
            collection_name=collection_name,
            limit=PRODUCTION_SCROLL_BATCH_SIZE,
            offset=next_offset,
            with_payload=True,
            with_vectors=False,
        )
        for point in batch:
            payload = point.payload or {}
            job_id = payload.get("job_url_identifier")
            doc_text = payload.get("document_text")
            if not job_id or not doc_text:
                continue
            jobs.append(
                StoredJob(
                    job_id=str(job_id),
                    document_text=str(doc_text),
                    job_title=str(payload.get("job_title") or ""),
                    company=str(payload.get("company") or ""),
                    job_role=str(payload.get("job_role") or ""),
                    country=str(payload.get("Country") or "N/A"),
                    locality=str(payload.get("location") or "N/A"),
                    remote=bool(payload.get("Remote")),
                    salary_type=str(payload.get("Salary Type") or ""),
                    salary=str(payload.get("Salary") or "N/A"),
                    equity=str(payload.get("Equity") or "N/A"),
                )
            )
        _progress(f"  scrolled {len(jobs)} points so far...")
        if next_offset is None:
            break
    _progress(f"Done: {len(jobs)} points pulled (read-only).")
    return jobs


def _assert_disposable_collection(collection_name: str) -> None:
    """Refuse to create/seed anything that is not a JOBS_COMPARE_* throwaway."""
    if not collection_name.startswith("JOBS_COMPARE_"):
        raise ValueError(
            f"Refusing to seed {collection_name!r}; comparison collections "
            "must be named JOBS_COMPARE_*."
        )
    prod = get_settings().qdrant_collection_name
    if collection_name == prod:
        raise ValueError(f"Refusing to seed production collection {prod!r}.")


def _seed_ollama_collection(
    client: QdrantClient,
    collection_name: str,
    model: str,
    jobs: list[StoredJob],
    *,
    progress: Callable[[str], None] | None = None,
    vectors: list[list[float]] | None = None,
) -> None:
    def _progress(message: str) -> None:
        if progress is not None:
            progress(message)

    if vectors is None:
        prefixed = [
            format_ollama_embedding_input(model, job.document_text, is_query=False)
            for job in jobs
        ]
        vectors = embed_texts_with_ollama_batched(
            model,
            prefixed,
            progress=_progress,
            timeout_seconds=600.0,
        )
    if len(vectors) != len(jobs):
        raise ValueError(
            f"Expected {len(jobs)} dense vectors for {model!r}, got {len(vectors)}."
        )
    expected_dim = dense_vector_size_for_ollama_model(model)
    for index, vector in enumerate(vectors):
        if len(vector) != expected_dim:
            raise ValueError(
                f"Ollama model {model!r} returned dim {len(vector)} for document "
                f"{index}; expected {expected_dim}."
            )

    dense_vector_name = get_dense_vector_name(client, collection_name)
    upserted = 0
    for batch_jobs, batch_vectors in zip(
        _chunks(jobs, CLOUD_UPSERT_BATCH_SIZE),
        _vector_chunks(vectors, CLOUD_UPSERT_BATCH_SIZE),
        strict=True,
    ):
        points = [
            models.PointStruct(
                id=job_id_to_point_id(job.job_id),
                vector={
                    dense_vector_name: vector,
                    BM25_SPARSE_VECTOR_NAME: models.Document(
                        text=job.document_text, model=BM25_SPARSE_MODEL
                    ),
                },
                payload=_stored_job_payload(job),
            )
            for job, vector in zip(batch_jobs, batch_vectors, strict=True)
        ]
        client.upsert(collection_name=collection_name, points=points)
        upserted += len(points)
        _progress(f"  upserted {upserted}/{len(jobs)}")
    print(f"{len(jobs)} jobs ingested into the vector database")


def _seed_cloud_collection(
    client: QdrantClient,
    collection_name: str,
    model: str,
    jobs: list[StoredJob],
    *,
    progress: Callable[[str], None] | None = None,
) -> None:
    def _progress(message: str) -> None:
        if progress is not None:
            progress(message)

    dense_vector_name = get_dense_vector_name(client, collection_name)
    upserted = 0
    for batch in _chunks(jobs, CLOUD_UPSERT_BATCH_SIZE):
        points = [
            models.PointStruct(
                id=job_id_to_point_id(job.job_id),
                vector={
                    dense_vector_name: models.Document(
                        text=job.document_text, model=model
                    ),
                    BM25_SPARSE_VECTOR_NAME: models.Document(
                        text=job.document_text, model=BM25_SPARSE_MODEL
                    ),
                },
                payload=_stored_job_payload(job),
            )
            for job in batch
        ]
        client.upsert(collection_name=collection_name, points=points)
        upserted += len(points)
        _progress(f"  upserted {upserted}/{len(jobs)}")
    print(f"{len(jobs)} jobs ingested into the vector database")


def seed_collection_for_model(
    client: QdrantClient,
    collection_name: str,
    model: str,
    *,
    jobs: list[JobOpportunity] | None = None,
    stored_jobs: list[StoredJob] | None = None,
    progress: Callable[[str], None] | None = None,
    dense_vectors: list[list[float]] | None = None,
) -> None:
    """Create + seed a throwaway collection using ``model`` for embedding."""
    _assert_disposable_collection(collection_name)
    if stored_jobs is None:
        corpus = jobs if jobs is not None else load_golden_jobs()
        stored_jobs = stored_jobs_from_opportunities(corpus)

    if dense_vectors is not None and not is_ollama_embedding_model(model):
        raise ValueError("dense_vectors is only supported for Ollama models")

    drop_db(client, collection_name)
    if is_ollama_embedding_model(model):
        dim = _create_ollama_comparison_collection(client, collection_name, model)
        print(
            f"Created {collection_name!r} for Ollama model {model!r} (dense dim={dim})."
        )
        _seed_ollama_collection(
            client,
            collection_name,
            model,
            stored_jobs,
            progress=progress,
            vectors=dense_vectors,
        )
        return

    with embedding_model_override(model):
        create_collection(client, collection_name)
        _seed_cloud_collection(
            client, collection_name, model, stored_jobs, progress=progress
        )


def delete_collections(
    client: QdrantClient,
    collection_names: list[str],
) -> None:
    prod = get_settings().qdrant_collection_name
    for name in collection_names:
        if name == prod or not name.startswith("JOBS_COMPARE_"):
            raise ValueError(f"Refusing to delete {name!r}")
        if client.collection_exists(name):
            client.delete_collection(name)
