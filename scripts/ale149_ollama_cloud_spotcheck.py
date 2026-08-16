"""ALE-149 spike: throwaway spot-check of Ollama Cloud vs local Ollama vs Gemini.

NOT part of the llm_client/ or evals/ packages, and not meant to be committed.
ALE-149 explicitly scopes out "wiring up Cloud as a configurable provider" —
that is a follow-up implementation ticket if this spike recommends it. This
script stays on the right side of that line: it proves Cloud fits the
existing Generator seam via composition (a Session with an Authorization
header, injected through OllamaGenerator's existing constructor param) rather
than modifying llm_client/ollama.py or llm_client/settings.py.

Lives under scripts/ (same as the other eval CLIs). Delete it when done —
it is spike scaffolding, not a permanent script (compare to
scripts/compare_generators.py, which is the permanent ALE-147 tool this
borrows from).

Setup:
    1. Sign up at https://ollama.com and create an API key at
       https://ollama.com/settings/keys
    2. Set OLLAMA_API_KEY in the repo-root .env (loaded by this script;
       not an LLMSettings field — ALE-149 does not wire Cloud into
       llm_client/).
    3. Make sure local Ollama is running with qwen3:4b pulled (per
       CONTRIBUTING.md "Local Ollama generation" section) — `ollama serve`
       and `ollama run qwen3:4b` once to preload.
    4. Make sure .env also has QDRANT_URL / QDRANT_API_KEY (Cloud Inference,
       required by evals/collections.py) and GEMINI_API_KEY.

Usage (from repo root):
    uv run python scripts/ale149_ollama_cloud_spotcheck.py

What it does:
    Runs every case in tests/fixtures/golden_generation.json (currently 2
    cases) through four generators — Gemini (production baseline), local
    qwen3:4b (ADR-0007's validated model), and two Ollama Cloud free-tier
    candidates (gpt-oss:20b-cloud, qwen3.5:cloud) — via evals.generation's
    real comparison harness (ALE-147), so results include the same
    grounding/ungrounded-link checks production and CI already trust. Prints
    per-generator wall-clock timing so latency is comparable, not just
    answer text.

Model picks, and why (see docs/findings/0004-ollama-cloud-generation-hosting-
spike-findings.md for the full write-up):
    - qwen3:4b / qwen3:8b (this project's validated local model) has NO
      Ollama Cloud tag at all — Cloud does not host it under any name.
    - gpt-oss:20b-cloud is Ollama's lowest usage tier ("Low Usage" / level 1)
      among cloud models, Apache 2.0 licensed, and reasoning-capable — the
      best fit for Free plan's "light usage" framing.
    - qwen3.5:cloud resolves to qwen3.5:397b-cloud ("Medium Usage") — the
      only Qwen-family model Cloud offers, included for continuity with the
      project's existing Qwen preference, at a much larger size than local
      qwen3:4b.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

load_dotenv(_REPO_ROOT / ".env")

import requests

from evals.generation import build_generator, compare_generators
from evals.types import GenerationComparisonResult
from llm_client.base import Generator
from llm_client.ollama import OllamaGenerator
from llm_client.settings import LLMSettings, get_llm_settings

OLLAMA_CLOUD_BASE_URL = "https://ollama.com"

# (label, cloud model tag)
CLOUD_CANDIDATES: list[tuple[str, str]] = [
    ("ollama-cloud-gpt-oss-20b", "gpt-oss:20b-cloud"),
    ("ollama-cloud-qwen3.5", "qwen3.5:cloud"),
]


class OllamaCloudGenerator(OllamaGenerator):
    """OllamaGenerator + Bearer auth, pointed at ollama.com.

    Spike-only proof that Cloud fits the existing Generator seam through
    composition: the only thing OllamaGenerator is missing for Cloud is an
    Authorization header, which its existing `session` constructor param
    already supports. If ALE-149 recommends Cloud, the real follow-up
    implementation likely just needs an optional `ollama_api_key` field on
    LLMSettings threaded into this same session-header pattern — not a new
    Generator subclass, and not a new endpoint/transport.
    """

    def __init__(self, settings: LLMSettings, api_key: str):
        session = requests.Session()
        session.headers.update({"Authorization": f"Bearer {api_key}"})
        super().__init__(settings, session=session)


class TimedGenerator(Generator):
    """Wraps a Generator to record wall-clock latency per call."""

    def __init__(self, inner: Generator):
        self._inner = inner
        self.timings_seconds: list[float] = []

    def generate(self, context: str, question: str) -> str:
        start = time.monotonic()
        try:
            return self._inner.generate(context=context, question=question)
        finally:
            self.timings_seconds.append(time.monotonic() - start)

    def max_chars_per_job(self) -> int | None:
        return self._inner.max_chars_per_job()


def build_cloud_generator(model: str, api_key: str) -> OllamaCloudGenerator:
    base_settings = get_llm_settings()
    settings = base_settings.model_copy(
        update={
            "llm_provider": "ollama",
            "ollama_model": model,
            "ollama_base_url": OLLAMA_CLOUD_BASE_URL,
            # Cloud is datacenter GPU-backed; local's 60s CPU-tuned default
            # is a needlessly tight ceiling here but harmless to keep as a
            # safety net rather than removing it for a one-off spike.
            "ollama_timeout_seconds": 90.0,
        }
    )
    return OllamaCloudGenerator(settings, api_key)


def _print_results(
    result: GenerationComparisonResult, timed: dict[str, TimedGenerator]
) -> None:
    print("\n" + "=" * 100)
    print("ALE-149 OLLAMA CLOUD SPOT-CHECK")
    print("=" * 100)
    print(f"Collection: {result.collection_name}")
    print(f"Generators: {', '.join(result.generator_labels)}")

    for case_result in result.results:
        print(
            f"\n--- [{case_result.case_id}] {case_result.generator_label} "
            f"(generated={case_result.generated}) ---"
        )
        print(f"  query: {case_result.query!r}")
        if case_result.missing_expected_source_ids:
            print(
                "  ⚠️  missing expected sources: "
                f"{case_result.missing_expected_source_ids}"
            )
        if case_result.error:
            print(f"  ⚠️  error: {case_result.error}")
        if case_result.ungrounded_urls:
            print(f"  ⚠️  ungrounded urls: {case_result.ungrounded_urls}")
        if case_result.ungrounded_phrases:
            print(f"  ⚠️  ungrounded phrases: {case_result.ungrounded_phrases}")
        preview = case_result.answer.replace("\n", " ")[:300]
        print(f"  answer: {preview}{'…' if len(case_result.answer) > 300 else ''}")

    print("\n" + "-" * 100)
    print("LATENCY (wall-clock seconds per call)")
    print("-" * 100)
    for label, tg in timed.items():
        if not tg.timings_seconds:
            print(f"  {label}: no successful calls timed")
            continue
        times = tg.timings_seconds
        print(
            f"  {label}: n={len(times)} "
            f"min={min(times):.1f}s max={max(times):.1f}s "
            f"mean={sum(times) / len(times):.1f}s "
            f"all={[f'{t:.1f}' for t in times]}"
        )


def main() -> int:
    api_key = os.environ.get("OLLAMA_API_KEY", "").strip()
    if not api_key:
        print(
            "Set OLLAMA_API_KEY in the repo-root .env "
            "(create one at https://ollama.com/settings/keys).",
            file=sys.stderr,
        )
        return 1

    raw_generators: dict[str, Generator] = {
        "gemini": build_generator("gemini"),
        "ollama-local-qwen3:4b": build_generator("ollama:qwen3:4b"),
    }
    for label, model in CLOUD_CANDIDATES:
        raw_generators[label] = build_cloud_generator(model, api_key)

    timed = {label: TimedGenerator(gen) for label, gen in raw_generators.items()}

    try:
        result = compare_generators(timed, top_k=3)
    except Exception as exc:  # noqa: BLE001 - spike script, surface anything
        print(f"Comparison run failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    _print_results(result, timed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
