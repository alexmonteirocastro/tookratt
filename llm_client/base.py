from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class ChatTurn:
    """One prior question/answer pair passed into generation."""

    question: str
    answer: str


class Generator(ABC):
    """Provider-agnostic text generation interface."""

    @abstractmethod
    def generate(
        self,
        context: str,
        question: str,
        history: Sequence[ChatTurn] | None = None,
    ) -> str:
        """Generate an answer grounded in the supplied job context."""

    def max_chars_per_job(self) -> int | None:
        """Optional per-job truncation for ``format_job_context``.

        Return ``None`` for no truncation (Gemini / stub). Ollama overrides
        with ``OLLAMA_MAX_CHARS_PER_JOB`` to match ``POST /chat``.
        """
        return None
