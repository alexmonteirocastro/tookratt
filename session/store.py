from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from threading import Lock
from uuid import uuid4

from db.query_filters import ExtractedFilters
from db.settings import get_settings
from llm_client.base import ChatTurn
from session.models import SessionState

Clock = Callable[[], datetime]


def _utc_now() -> datetime:
    return datetime.now(UTC)


class SessionStore:
    """Bounded in-memory session store (ADR-0008 Decision 6).

    Eviction is lazy: expired sessions are dropped on access, and the
    least-recently-touched session is dropped when inserting would exceed
    ``max_sessions``.

    A ``threading.Lock`` serializes mutating access. FastAPI runs sync
    ``/chat`` handlers on a thread pool, so concurrent requests in a
    *single* worker can race on the shared dict — distinct from the
    multi-worker Redis revisit trigger in ADR-0008.
    """

    def __init__(
        self,
        *,
        ttl_seconds: int,
        max_sessions: int,
        max_turns: int,
        clock: Clock | None = None,
    ) -> None:
        self._ttl = timedelta(seconds=ttl_seconds)
        self._max_sessions = max_sessions
        self._max_turns = max_turns
        self._clock = clock or _utc_now
        self._sessions: dict[str, SessionState] = {}
        self._lock = Lock()

    def __len__(self) -> int:
        with self._lock:
            return len(self._sessions)

    def get_or_create(self, session_id: str | None) -> tuple[str, SessionState]:
        """Return ``(session_id, state)``, minting a new session when needed.

        A missing, blank, expired, or otherwise unrecognized ``session_id``
        always starts a fresh session with a server-issued id. The returned
        ``SessionState`` is a snapshot — callers must not mutate it.
        """
        with self._lock:
            self._evict_expired()
            if session_id:
                state = self._sessions.get(session_id)
                if state is not None:
                    state.last_seen = self._clock()
                    return session_id, self._snapshot(state)
            return self._create_session()

    def record_turn(
        self,
        session_id: str,
        turn: ChatTurn,
        filters: ExtractedFilters,
    ) -> None:
        """Append a turn, trim to ``max_turns``, and store last-applied filters.

        If ``session_id`` was evicted between ``get_or_create`` and this call
        (another request hitting ``CHAT_MAX_SESSIONS``), reinsert under the
        same id so the id already issued to the caller stays valid.
        """
        with self._lock:
            state = self._sessions.get(session_id)
            if state is None:
                self._evict_expired()
                self._evict_oldest_if_full()
                state = SessionState(last_seen=self._clock())
                self._sessions[session_id] = state
            state.turns.append(turn)
            if len(state.turns) > self._max_turns:
                state.turns = state.turns[-self._max_turns :]
            state.last_filters = filters
            state.last_seen = self._clock()

    def _create_session(self) -> tuple[str, SessionState]:
        self._evict_oldest_if_full()
        session_id = uuid4().hex
        state = SessionState(last_seen=self._clock())
        self._sessions[session_id] = state
        return session_id, self._snapshot(state)

    def _snapshot(self, state: SessionState) -> SessionState:
        return SessionState(
            turns=list(state.turns),
            last_filters=state.last_filters,
            last_seen=state.last_seen,
        )

    def _is_expired(self, state: SessionState) -> bool:
        return self._clock() - state.last_seen >= self._ttl

    def _evict_expired(self) -> None:
        expired = [
            session_id
            for session_id, state in self._sessions.items()
            if self._is_expired(state)
        ]
        for session_id in expired:
            del self._sessions[session_id]

    def _evict_oldest_if_full(self) -> None:
        if len(self._sessions) < self._max_sessions:
            return
        oldest_id = min(
            self._sessions,
            key=lambda session_id: self._sessions[session_id].last_seen,
        )
        del self._sessions[oldest_id]


@lru_cache
def get_session_store() -> SessionStore:
    settings = get_settings()
    return SessionStore(
        ttl_seconds=settings.chat_session_ttl_seconds,
        max_sessions=settings.chat_max_sessions,
        max_turns=settings.chat_history_max_turns,
    )


def reset_session_store() -> None:
    get_session_store.cache_clear()
