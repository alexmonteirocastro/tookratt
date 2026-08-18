"""Ollama embedding backend for disposable comparison collections (ALE-183).

Eval-only: local Ollama computes dense vectors; Qdrant stores them in
``JOBS_COMPARE_*`` collections. Does not change production Cloud Inference.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import requests
from dotenv import dotenv_values

from llm_client.ollama import native_ollama_base_url

_REPO_ROOT = Path(__file__).resolve().parent.parent

# Dims confirmed via `ollama show` during ALE-183 setup verification.
_OLLAMA_EMBEDDING_DIMS: dict[str, int] = {
    "nomic-embed-text": 768,
    "nomic-embed-text:latest": 768,
    "nomic-embed-text:v1.5": 768,
    "nomic-embed-text:137m-v1.5-fp16": 768,
    "bge-m3": 1024,
    "bge-m3:latest": 1024,
    "bge-m3:567m": 1024,
    "snowflake-arctic-embed2": 1024,
    "snowflake-arctic-embed2:latest": 1024,
    "snowflake-arctic-embed2:568m": 1024,
    "qwen3-embedding": 4096,  # library default tag is 8b
    "qwen3-embedding:latest": 4096,
    "qwen3-embedding:0.6b": 1024,
    "qwen3-embedding:4b": 2560,
    "qwen3-embedding:8b": 4096,
}

_KNOWN_OLLAMA_EMBEDDING_TAGS = frozenset(_OLLAMA_EMBEDDING_DIMS)

OLLAMA_MODEL_NOTES: dict[str, str] = {
    "bge-m3": "dense-only via Ollama; sparse/multi-vector not available",
    "nomic-embed-text": (
        "v1.5; Ollama truncates at 2048 tokens even with num_ctx=8192"
    ),
    "qwen3-embedding:0.6b": "0.6b first pass — 32K/1024, not the 8b 40K/4096 tag",
}

_DEFAULT_EMBED_TIMEOUT_SECONDS = 180.0
# /api/embed accepts a list; 32 keeps payloads reasonable for long docs on CPU.
OLLAMA_EMBED_BATCH_SIZE = 32


def ollama_model_tag(model: str) -> str:
    """Strip an optional ``ollama:`` prefix from a comparison model id."""
    if model.startswith("ollama:"):
        return model[len("ollama:") :]
    return model


def is_ollama_embedding_model(model: str) -> bool:
    """True when this comparison id should use the Ollama embedding backend."""
    if model.startswith("ollama:"):
        return True
    return ollama_model_tag(model) in _KNOWN_OLLAMA_EMBEDDING_TAGS


def dense_vector_size_for_ollama_model(model: str) -> int:
    """Return the dense output size for a known Ollama embedding tag."""
    tag = ollama_model_tag(model)
    try:
        return _OLLAMA_EMBEDDING_DIMS[tag]
    except KeyError as exc:
        raise ValueError(
            f"Unknown Ollama embedding model {model!r}. "
            f"Known tags: {sorted(_KNOWN_OLLAMA_EMBEDDING_TAGS)}. "
            "Pass ollama:<tag> for an explicit Ollama backend."
        ) from exc


def format_ollama_embedding_input(model: str, text: str, *, is_query: bool) -> str:
    """Apply documented task prefixes; leave unknown models unprefixed."""
    tag = ollama_model_tag(model)
    if tag.startswith("nomic-embed-text"):
        prefix = "search_query: " if is_query else "search_document: "
        if text.startswith(prefix):
            return text
        return f"{prefix}{text}"
    if tag.startswith("snowflake-arctic-embed"):
        if is_query and not text.startswith("query: "):
            return f"query: {text}"
        return text
    return text


def note_for_ollama_model(model: str) -> str | None:
    tag = ollama_model_tag(model)
    if tag in OLLAMA_MODEL_NOTES:
        return OLLAMA_MODEL_NOTES[tag]
    # latest / aliases share the untagged note when present
    base = tag.split(":", 1)[0]
    return OLLAMA_MODEL_NOTES.get(base)


def _env_value(name: str, default: str) -> str:
    raw = os.environ.get(name, "").strip()
    if raw:
        return raw
    values = dotenv_values(_REPO_ROOT / ".env")
    file_val = values.get(name)
    if file_val and str(file_val).strip():
        return str(file_val).strip()
    return default


def _ollama_base_url() -> str:
    """Resolve Ollama root for host-side eval scripts.

    ``.env`` often sets ``host.docker.internal`` so the API container can reach
    the host daemon; this rewrite maps that back to loopback when the harness
    itself runs on the host (ALE-149 Compose footgun).
    """
    raw = _env_value("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    return raw.replace("host.docker.internal", "127.0.0.1")


def _ollama_embed_session(base_url: str) -> requests.Session:
    session = requests.Session()
    root = native_ollama_base_url(base_url)
    if "ollama.com" in root:
        api_key = _env_value("OLLAMA_API_KEY", "")
        if api_key:
            session.headers["Authorization"] = f"Bearer {api_key}"
    return session


def embed_texts_with_ollama(
    model: str,
    texts: list[str],
    *,
    options: dict[str, Any] | None = None,
    timeout_seconds: float = _DEFAULT_EMBED_TIMEOUT_SECONDS,
) -> tuple[list[list[float]], dict[str, Any]]:
    """Embed ``texts`` via Ollama ``/api/embed``. Returns vectors + raw JSON body."""
    if not texts:
        return [], {}
    tag = ollama_model_tag(model)
    base_url = _ollama_base_url()
    url = f"{native_ollama_base_url(base_url)}/api/embed"
    payload: dict[str, Any] = {"model": tag, "input": texts}
    if options:
        payload["options"] = options
    session = _ollama_embed_session(base_url)
    try:
        response = session.post(url, json=payload, timeout=timeout_seconds)
        response.raise_for_status()
    except requests.ConnectionError as exc:
        raise ValueError(
            f"Cannot reach Ollama at {url} for embedding model {tag!r}. "
            "Start the daemon with `ollama serve`."
        ) from exc
    except requests.Timeout as exc:
        raise ValueError(
            f"Ollama embed timed out after {timeout_seconds}s for {tag!r}."
        ) from exc
    except requests.HTTPError as exc:
        body = exc.response.text[:400] if exc.response is not None else ""
        raise ValueError(
            f"Ollama embed failed for {tag!r}: HTTP "
            f"{exc.response.status_code if exc.response is not None else '?'}: {body}"
        ) from exc

    data = response.json()
    embeddings = data.get("embeddings")
    got = len(embeddings) if isinstance(embeddings, list) else "no"
    if not isinstance(embeddings, list) or len(embeddings) != len(texts):
        raise ValueError(
            f"Ollama embed for {tag!r} returned {got} vectors; expected {len(texts)}."
        )
    vectors = [[float(x) for x in row] for row in embeddings]
    return vectors, data


def embed_texts_with_ollama_batched(
    model: str,
    texts: list[str],
    *,
    batch_size: int = OLLAMA_EMBED_BATCH_SIZE,
    options: dict[str, Any] | None = None,
    timeout_seconds: float = _DEFAULT_EMBED_TIMEOUT_SECONDS,
    progress: Any | None = None,
) -> list[list[float]]:
    """Embed ``texts`` in batches so a full production corpus fits in one run."""
    if batch_size < 1:
        raise ValueError("batch_size must be >= 1")
    vectors: list[list[float]] = []
    total = len(texts)
    for start in range(0, total, batch_size):
        batch = texts[start : start + batch_size]
        batch_vectors, _raw = embed_texts_with_ollama(
            model,
            batch,
            options=options,
            timeout_seconds=timeout_seconds,
        )
        vectors.extend(batch_vectors)
        if progress is not None:
            progress(f"  ollama embedded {min(start + len(batch), total)}/{total}")
    return vectors
