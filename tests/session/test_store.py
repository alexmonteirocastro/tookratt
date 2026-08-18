import threading
from datetime import UTC, datetime, timedelta

from db.query_filters import ExtractedFilters
from llm_client.base import ChatTurn
from session.store import SessionStore, get_session_store, reset_session_store
from the_hub_client.models import CountryCode


class FakeClock:
    def __init__(self, instant: datetime) -> None:
        self.instant = instant

    def __call__(self) -> datetime:
        return self.instant


def _store(**overrides) -> tuple[SessionStore, FakeClock]:
    clock = FakeClock(datetime(2026, 1, 1, tzinfo=UTC))
    defaults = {
        "ttl_seconds": 1800,
        "max_sessions": 10,
        "max_turns": 5,
        "clock": clock,
    }
    defaults.update(overrides)
    return SessionStore(**defaults), clock


def test_get_or_create_mints_id_when_session_id_absent():
    store, _clock = _store()

    session_id, state = store.get_or_create(None)

    assert len(session_id) == 32
    assert state.turns == []
    assert state.last_filters == ExtractedFilters()


def test_get_or_create_returns_existing_session():
    store, _clock = _store()
    session_id, _ = store.get_or_create(None)
    store.record_turn(
        session_id,
        ChatTurn(question="q1", answer="a1"),
        ExtractedFilters(country=CountryCode.SWEDEN),
    )

    same_id, state = store.get_or_create(session_id)

    assert same_id == session_id
    assert state.turns == [ChatTurn(question="q1", answer="a1")]
    assert state.last_filters.country == CountryCode.SWEDEN


def test_unrecognized_session_id_starts_fresh_session():
    store, _clock = _store()

    new_id, state = store.get_or_create("deadbeef" * 4)

    assert new_id != "deadbeef" * 4
    assert state.turns == []


def test_blank_session_id_starts_fresh_session():
    store, _clock = _store()

    new_id, state = store.get_or_create("")

    assert new_id
    assert state.turns == []


def test_expired_session_no_longer_returns_history():
    store, clock = _store(ttl_seconds=30)
    session_id, _ = store.get_or_create(None)
    store.record_turn(
        session_id,
        ChatTurn(question="q1", answer="a1"),
        ExtractedFilters(),
    )
    clock.instant = clock.instant + timedelta(seconds=30)

    new_id, state = store.get_or_create(session_id)

    assert new_id != session_id
    assert state.turns == []
    assert len(store) == 1


def test_max_sessions_evicts_oldest_touched():
    store, clock = _store(max_sessions=2)
    id_a, _ = store.get_or_create(None)
    clock.instant += timedelta(seconds=1)
    id_b, _ = store.get_or_create(None)
    clock.instant += timedelta(seconds=1)
    store.get_or_create(id_a)
    clock.instant += timedelta(seconds=1)
    id_c, _ = store.get_or_create(None)

    assert len(store) == 2
    assert store.get_or_create(id_a)[0] == id_a
    assert store.get_or_create(id_c)[0] == id_c
    evicted_id, evicted_state = store.get_or_create(id_b)
    assert evicted_id != id_b
    assert evicted_state.turns == []


def test_record_turn_trims_to_max_turns():
    store, _clock = _store(max_turns=2)
    session_id, _ = store.get_or_create(None)
    for index in range(3):
        store.record_turn(
            session_id,
            ChatTurn(question=f"q{index}", answer=f"a{index}"),
            ExtractedFilters(),
        )

    _sid, state = store.get_or_create(session_id)

    assert [turn.question for turn in state.turns] == ["q1", "q2"]


def test_get_session_store_is_a_singleton():
    reset_session_store()
    try:
        assert get_session_store() is get_session_store()
    finally:
        reset_session_store()


def test_record_turn_reinserts_session_evicted_between_lookup_and_record():
    store, _clock = _store(max_sessions=1)
    session_id, _ = store.get_or_create(None)
    store.get_or_create(None)

    store.record_turn(
        session_id,
        ChatTurn(question="q1", answer="a1"),
        ExtractedFilters(),
    )

    same_id, state = store.get_or_create(session_id)
    assert same_id == session_id
    assert state.turns == [ChatTurn(question="q1", answer="a1")]
    assert len(store) == 1


def test_concurrent_get_or_create_and_record_turn_stay_within_bounds():
    max_sessions = 32
    store = SessionStore(ttl_seconds=1800, max_sessions=max_sessions, max_turns=5)
    n_threads = 24
    iterations = 80
    errors: list[BaseException] = []
    start = threading.Barrier(n_threads)
    shared_id, _ = store.get_or_create(None)

    def worker(worker_id: int) -> None:
        try:
            start.wait(timeout=5)
            for index in range(iterations):
                if worker_id % 2 == 0:
                    session_id, _state = store.get_or_create(shared_id)
                else:
                    session_id, _state = store.get_or_create(None)
                store.record_turn(
                    session_id,
                    ChatTurn(question=f"q{worker_id}-{index}", answer="a"),
                    ExtractedFilters(),
                )
        except BaseException as exc:
            errors.append(exc)

    threads = [
        threading.Thread(target=worker, args=(worker_id,))
        for worker_id in range(n_threads)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert errors == []
    assert len(store) <= max_sessions
