"""ALE-183: Probe whether nomic-embed-text honors num_ctx 8192 or truncates at 2048.

Sends ~4000 and ~7000 token inputs (nomic tokenizer) under default options and
with ``num_ctx=8192``. Compares the long-input embedding to the embedding of the
same text truncated to 2048 tokens. Cosine ≈ 1.0 means the extra tokens were
ignored.

Usage:

    uv run python scripts/probe_nomic_embed_context.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from huggingface_hub import hf_hub_download  # noqa: E402
from tokenizers import Tokenizer  # type: ignore[import-untyped]  # noqa: E402

from evals.ollama_embeddings import (  # noqa: E402
    embed_texts_with_ollama,
    format_ollama_embedding_input,
)

NOMIC_MODEL = "nomic-embed-text"
NOMIC_TOKENIZER_REPO = "nomic-ai/nomic-embed-text-v1.5"
GGUF_CONTEXT = 2048
TARGETS = (4000, 7000)
FILLER = (
    "The Nordic startup is hiring a backend engineer to build APIs in "
    "Copenhagen Denmark for a remote-first product team. "
)


def _cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    norm_l = math.sqrt(sum(a * a for a in left))
    norm_r = math.sqrt(sum(b * b for b in right))
    if norm_l == 0 or norm_r == 0:
        return 0.0
    return dot / (norm_l * norm_r)


def _load_tokenizer() -> Tokenizer:
    path = hf_hub_download(NOMIC_TOKENIZER_REPO, "tokenizer.json")
    return Tokenizer.from_file(path)


def _text_with_token_count(tokenizer: Tokenizer, target: int) -> tuple[str, int]:
    chunks: list[str] = []
    while True:
        candidate = "".join(chunks) + FILLER
        count = len(tokenizer.encode(candidate).ids)
        if count >= target:
            return candidate, count
        chunks.append(FILLER)


def _truncate_to_tokens(tokenizer: Tokenizer, text: str, limit: int) -> str:
    encoded = tokenizer.encode(text)
    if len(encoded.ids) <= limit:
        return text
    return tokenizer.decode(encoded.ids[:limit])


def _probe(
    tokenizer: Tokenizer,
    text: str,
    token_count: int,
    *,
    options: dict[str, int] | None,
) -> None:
    prefixed = format_ollama_embedding_input(NOMIC_MODEL, text, is_query=False)
    truncated = _truncate_to_tokens(tokenizer, prefixed, GGUF_CONTEXT)
    label = "default" if options is None else f"options={options}"
    print(f"\n--- {token_count} tokenizer tokens, {label} ---")
    full_vecs, full_meta = embed_texts_with_ollama(
        NOMIC_MODEL, [prefixed], options=options
    )
    trunc_vecs, trunc_meta = embed_texts_with_ollama(
        NOMIC_MODEL, [truncated], options=options
    )
    cosine = _cosine(full_vecs[0], trunc_vecs[0])
    print(f"  prompt_eval_count (full): {full_meta.get('prompt_eval_count')}")
    truncated_count = trunc_meta.get("prompt_eval_count")
    print(f"  prompt_eval_count (first {GGUF_CONTEXT}): {truncated_count}")
    print(f"  embedding dim: {len(full_vecs[0])}")
    print(f"  cosine(full, first-{GGUF_CONTEXT}-tokens): {cosine:.6f}")
    if cosine > 0.999:
        print("  verdict: extra tokens ignored — treating as ~2048 context")
    elif cosine > 0.99:
        print("  verdict: near-identical; likely truncated or pooled the same")
    else:
        print("  verdict: full input changed the embedding — context > 2048")


def main() -> int:
    print(
        f"Probing {NOMIC_MODEL} context (GGUF={GGUF_CONTEXT}, Modelfile num_ctx=8192)"
    )
    tokenizer = _load_tokenizer()
    for target in TARGETS:
        text, count = _text_with_token_count(tokenizer, target)
        print(f"\nBuilt filler text: {count} nomic tokens (target {target})")
        _probe(tokenizer, text, count, options=None)
        _probe(tokenizer, text, count, options={"num_ctx": 8192})
    return 0


if __name__ == "__main__":
    sys.exit(main())
