"""Unit tests for the ALE-183 Ollama embedding comparison backend."""

from __future__ import annotations

import pytest

from evals.collections import collection_name_for_model, resolve_model_name
from evals.ollama_embeddings import (
    dense_vector_size_for_ollama_model,
    format_ollama_embedding_input,
    is_ollama_embedding_model,
    note_for_ollama_model,
    ollama_model_tag,
)


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        ("nomic-embed-text", True),
        ("ollama:nomic-embed-text", True),
        ("bge-m3", True),
        ("snowflake-arctic-embed2", True),
        ("qwen3-embedding:0.6b", True),
        ("intfloat/multilingual-e5-small", False),
        ("all-MiniLM-L6-v2", False),
        ("sentence-transformers/all-MiniLM-L6-v2", False),
    ],
)
def test_is_ollama_embedding_model(model: str, expected: bool) -> None:
    assert is_ollama_embedding_model(model) is expected


def test_ollama_model_tag_strips_prefix() -> None:
    assert ollama_model_tag("ollama:qwen3-embedding:0.6b") == "qwen3-embedding:0.6b"
    assert ollama_model_tag("bge-m3") == "bge-m3"


@pytest.mark.parametrize(
    ("model", "dim"),
    [
        ("nomic-embed-text", 768),
        ("bge-m3", 1024),
        ("snowflake-arctic-embed2", 1024),
        ("qwen3-embedding:0.6b", 1024),
        ("ollama:nomic-embed-text", 768),
    ],
)
def test_dense_vector_size_for_known_models(model: str, dim: int) -> None:
    assert dense_vector_size_for_ollama_model(model) == dim


def test_dense_vector_size_rejects_unknown() -> None:
    with pytest.raises(ValueError, match="Unknown Ollama embedding model"):
        dense_vector_size_for_ollama_model("not-a-real-embedder")


def test_nomic_prefixes() -> None:
    assert (
        format_ollama_embedding_input("nomic-embed-text", "hello", is_query=True)
        == "search_query: hello"
    )
    assert (
        format_ollama_embedding_input("nomic-embed-text", "hello", is_query=False)
        == "search_document: hello"
    )
    already = "search_query: hello"
    assert (
        format_ollama_embedding_input("nomic-embed-text", already, is_query=True)
        == already
    )


def test_snowflake_query_prefix_only() -> None:
    assert (
        format_ollama_embedding_input("snowflake-arctic-embed2", "hello", is_query=True)
        == "query: hello"
    )
    assert (
        format_ollama_embedding_input(
            "snowflake-arctic-embed2", "hello", is_query=False
        )
        == "hello"
    )


def test_bge_m3_and_qwen_unprefixed() -> None:
    assert format_ollama_embedding_input("bge-m3", "hello", is_query=True) == "hello"
    assert (
        format_ollama_embedding_input("qwen3-embedding:0.6b", "hello", is_query=False)
        == "hello"
    )


def test_bge_m3_note_mentions_dense_only() -> None:
    note = note_for_ollama_model("bge-m3")
    assert note is not None
    assert "dense-only" in note


def test_ollama_embed_batch_size_is_batched() -> None:
    from evals.ollama_embeddings import OLLAMA_EMBED_BATCH_SIZE

    assert OLLAMA_EMBED_BATCH_SIZE >= 32


def test_collection_name_slugifies_colon() -> None:
    assert (
        collection_name_for_model("qwen3-embedding:0.6b")
        == "JOBS_COMPARE_QWEN3-EMBEDDING_0_6B"
    )


def test_resolve_model_name_strips_ollama_prefix() -> None:
    assert (
        resolve_model_name("ollama:nomic-embed-text", cloud_mode=True)
        == "nomic-embed-text"
    )
    assert resolve_model_name("bge-m3", cloud_mode=True) == "bge-m3"
