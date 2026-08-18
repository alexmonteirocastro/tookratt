from dataclasses import dataclass, field
from datetime import UTC, datetime

from db.query_filters import ExtractedFilters
from llm_client.base import ChatTurn


@dataclass
class SessionState:
    """In-memory conversation state for one `/chat` session (ADR-0008)."""

    turns: list[ChatTurn] = field(default_factory=list)
    last_filters: ExtractedFilters = field(default_factory=ExtractedFilters)
    last_seen: datetime = field(default_factory=lambda: datetime.now(UTC))
