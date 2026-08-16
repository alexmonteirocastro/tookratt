"""Human review UI: live query + golden-set walkthrough, tag, history, replay."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any, cast

import streamlit as st
from qdrant_client.http.exceptions import UnexpectedResponse

from db import get_qdrant_client, get_settings, query_jobs_in_qdrant
from evals.fixtures import GOLDEN_QUERIES_PATH
from evals.generation import format_context_for_generator
from evals_system.golden_cases import (
    FIXTURE_COLLECTION_NAME,
    GoldenJobSummary,
    GoldenWalkthroughCase,
    load_walkthrough_cases,
    walkthrough_top_k,
)
from evals_system.judgments import (
    Judgment,
    Tag,
    ensure_db,
    get_judgment,
    insert_judgment,
    list_judgments,
)
from evals_system.review_collections import (
    REVIEW_COLLECTION_CANDIDATES,
    existing_review_collections,
)
from evals_system.tag_shortcuts import consume_tag_shortcut
from llm_client import NO_MATCHING_JOBS_MESSAGE, get_generator
from llm_client.context import filter_chat_retrieval_points, sanitize_answer_links
from llm_client.exceptions import (
    GenerationConfigurationError,
    GenerationRateLimitError,
    GenerationUnavailableError,
)
from the_hub_client.models import CountryCode
from the_hub_client.utils import build_job_url

_GROUP_LABELS = {
    "queries": "Golden queries",
    "role_confusion_cases": "Role confusion",
    "tech_stack_adversarial_cases": "Tech-stack adversarial",
}


def _payload_source(score: float, payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(payload.get("job_url_identifier", ""))
    return {
        "job_id": job_id,
        "score": float(score),
        "job_url": build_job_url(job_id) if job_id else "",
        "job_title": payload.get("job_title"),
        "company": payload.get("company"),
        "document_text": payload.get("document_text", ""),
        "job_role": payload.get("job_role"),
        "country": payload.get("Country"),
        "location": payload.get("location"),
    }


def _compact_sources_for_storage(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "job_id": s.get("job_id"),
            "score": s.get("score"),
            "job_url": s.get("job_url"),
            "job_title": s.get("job_title"),
            "company": s.get("company"),
        }
        for s in sources
    ]


def run_review_query(
    *,
    query: str,
    collection_name: str,
    country: CountryCode | None,
    remote: bool | None,
    limit: int,
) -> dict[str, Any]:
    """Retrieve + generate against an explicit collection (mirrors /chat)."""
    settings = get_settings()
    client = get_qdrant_client()
    search_results = query_jobs_in_qdrant(
        db_client=client,
        collection_name=collection_name,
        query_text=query,
        limit=limit,
        country=country,
        remote=remote,
    )
    usable_points = filter_chat_retrieval_points(
        search_results.points,
        min_score=settings.chat_source_min_score,
    )
    sources = [
        _payload_source(point.score, dict(point.payload or {}))
        for point in usable_points
    ]
    if not usable_points:
        return {
            "answer": NO_MATCHING_JOBS_MESSAGE,
            "sources": sources,
            "generated": False,
        }

    payloads = [dict(point.payload or {}) for point in usable_points]
    generator = get_generator()
    context = format_context_for_generator(payloads, generator)
    answer = generator.generate(context=context, question=query)
    allowed_urls = {str(s["job_url"]) for s in sources if s.get("job_url")}
    answer = sanitize_answer_links(answer, allowed_urls)
    return {
        "answer": answer,
        "sources": sources,
        "generated": True,
    }


def review_mode_label(mode: str) -> str:
    return "Live query" if mode == "live" else "Golden set"


def consume_review_flash() -> None:
    message = st.session_state.pop("review_flash", None)
    if isinstance(message, str) and message:
        st.success(message)


def _set_flash(message: str) -> None:
    st.session_state["review_flash"] = message


def _render_sources(sources: list[dict[str, Any]]) -> None:
    if not sources:
        st.info("No sources above the min-score floor.")
        return
    for src in sources:
        title = src.get("job_title") or src.get("job_role") or src.get("job_id")
        company = src.get("company") or "?"
        score = src.get("score")
        if isinstance(score, float):
            st.markdown(f"**{title}** @ {company} — score `{score:.4f}`")
        else:
            st.markdown(f"**{title}** @ {company}")
        url = src.get("job_url")
        if url:
            st.caption(str(url))
        doc = src.get("document_text")
        if isinstance(doc, str) and doc.strip():
            with st.expander("document_text"):
                st.text(doc)


def _source_id_score_pairs(
    sources: list[dict[str, Any]],
) -> list[tuple[str, float | None]]:
    pairs: list[tuple[str, float | None]] = []
    for s in sources:
        job_id = str(s.get("job_id", ""))
        score_raw = s.get("score")
        score = float(score_raw) if isinstance(score_raw, (int, float)) else None
        pairs.append((job_id, score))
    return pairs


def _diff_sources(
    stored: list[dict[str, Any]],
    current: list[dict[str, Any]],
) -> None:
    stored_pairs = _source_id_score_pairs(stored)
    current_pairs = _source_id_score_pairs(current)
    stored_ids = [p[0] for p in stored_pairs]
    current_ids = [p[0] for p in current_pairs]
    if stored_ids == current_ids:
        st.success("Source job ids match stored judgment.")
    else:
        st.warning(f"Source ids differ.\nStored: {stored_ids}\nCurrent: {current_ids}")
    score_lines: list[str] = []
    stored_by_id = {jid: score for jid, score in stored_pairs}
    for jid, score in current_pairs:
        old = stored_by_id.get(jid)
        if old is not None and score is not None and abs(old - score) > 1e-6:
            score_lines.append(f"{jid}: {old:.4f} → {score:.4f}")
    if score_lines:
        st.write("Score changes:")
        for line in score_lines:
            st.write(f"- {line}")


def _render_job_summaries(jobs: tuple[GoldenJobSummary, ...], *, empty: str) -> None:
    if not jobs:
        st.caption(empty)
        return
    for job in jobs:
        remote = "remote" if job.remote else "on-site"
        st.markdown(
            f"**{job.job_title}** @ {job.company} — `{job.job_id}` · "
            f"{job.locality}, {job.country} · {remote}"
        )
        if job.job_description.strip():
            st.caption(job.job_description)


def _fixture_sources(case: GoldenWalkthroughCase) -> list[dict[str, Any]]:
    return [
        {
            "job_id": job.job_id,
            "job_title": job.job_title,
            "company": job.company,
        }
        for job in case.expected_jobs
    ]


def _render_judgment_controls(
    *,
    note_key: str,
    shortcut_key: str,
    on_tag: Callable[[Tag], None],
) -> None:
    consume_tag_shortcut(key=shortcut_key, on_tag=on_tag)
    st.markdown("#### Judgment")
    st.caption(
        "Shortcuts: `g` good · `b` bad · `p` partial. Ignored while typing a note."
    )
    st.text_area("Note (optional)", key=note_key, height=60)
    with st.container(horizontal=True):
        st.button(
            "Good",
            on_click=on_tag,
            args=("good",),
            icon=":material/thumb_up:",
            key=f"{note_key}_good",
        )
        st.button(
            "Bad",
            on_click=on_tag,
            args=("bad",),
            icon=":material/thumb_down:",
            key=f"{note_key}_bad",
        )
        st.button(
            "Partial",
            on_click=on_tag,
            args=("partial",),
            icon=":material/thumbs_up_down:",
            key=f"{note_key}_partial",
        )


def _clear_live_form() -> None:
    st.session_state.pop("review_result", None)
    st.session_state["review_query"] = ""
    st.session_state["review_note"] = ""


def _save_live_judgment(tag: Tag) -> None:
    result_state = st.session_state.get("review_result")
    if not isinstance(result_state, dict):
        _set_flash("Run a query before tagging.")
        return
    result = cast(dict[str, Any], result_state)
    note_raw = st.session_state.get("review_note", "")
    note = str(note_raw).strip() if note_raw else ""
    row_id = insert_judgment(
        collection_name=result["collection_name"],
        query=result["query"],
        answer=result["answer"],
        sources=_compact_sources_for_storage(result["sources"]),
        tag=tag,
        country=result.get("country"),
        remote=result.get("remote"),
        note=note or None,
    )
    _clear_live_form()
    _set_flash(f"Saved judgment #{row_id}")


def _save_golden_judgment(tag: Tag) -> None:
    cases = load_walkthrough_cases()
    if not cases:
        return
    idx = int(st.session_state.get("golden_index", 0))
    idx = max(0, min(idx, len(cases) - 1))
    case = cases[idx]
    collection_name = FIXTURE_COLLECTION_NAME
    cache_key = f"{collection_name}:{case.id}"
    cached = st.session_state.get("golden_results", {}).get(cache_key)
    if isinstance(cached, dict):
        answer = str(cached.get("answer", ""))
        sources = _compact_sources_for_storage(
            cast(list[dict[str, Any]], cached.get("sources", []))
        )
        country = cached.get("country")
        remote = cached.get("remote")
    else:
        answer = ""
        sources = _fixture_sources(case)
        country = case.country
        remote = None
    note_raw = st.session_state.get("golden_note", "")
    note = str(note_raw).strip() if note_raw else ""
    row_id = insert_judgment(
        collection_name=collection_name,
        query=case.query,
        answer=answer,
        sources=sources,
        tag=tag,
        country=country if isinstance(country, str) else None,
        remote=remote if isinstance(remote, bool) else None,
        note=note or None,
    )
    st.session_state["golden_note"] = ""
    if idx < len(cases) - 1:
        st.session_state["golden_index"] = idx + 1
    _set_flash(f"Saved judgment #{row_id} for `{case.id}`")


def _list_review_collections() -> list[str] | None:
    try:
        collections = existing_review_collections()
    except (UnexpectedResponse, ConnectionError, TimeoutError, OSError) as exc:
        st.error(f"Cannot list Qdrant collections: {exc}")
        return None
    return collections


def render_live_query_mode() -> None:
    ensure_db()
    st.caption(
        "Type a query, inspect sources + answer, then tag. Input clears after save."
    )
    collections = _list_review_collections()
    if collections is None:
        return
    if not collections:
        st.warning(
            "None of "
            + ", ".join(REVIEW_COLLECTION_CANDIDATES)
            + " exist on this Qdrant cluster. "
            "Seed with `uv run python main.py --seed-dev` or sync production."
        )
        return

    query = st.text_area("Query", height=80, key="review_query")
    col_a, col_b, col_c = st.columns(3)
    with col_a:
        collection_name = st.selectbox(
            "Collection",
            options=collections,
            key="review_collection",
        )
    with col_b:
        country_label = st.selectbox(
            "Country (optional)",
            options=["(none)", *[c.value for c in CountryCode]],
            key="review_country",
        )
    with col_c:
        remote_label = st.selectbox(
            "Remote (optional)",
            options=["(none)", "true", "false"],
            key="review_remote",
        )
    limit = st.number_input(
        "Limit",
        min_value=1,
        max_value=50,
        value=5,
        key="review_limit",
    )

    country: CountryCode | None = None
    if country_label != "(none)":
        country = CountryCode(country_label)
    remote: bool | None = None
    if remote_label == "true":
        remote = True
    elif remote_label == "false":
        remote = False

    if st.button("Run query", type="primary", key="review_run"):
        if not query.strip():
            st.error("Query is required.")
        else:
            try:
                with st.spinner("Retrieving and generating..."):
                    result = run_review_query(
                        query=query.strip(),
                        collection_name=collection_name,
                        country=country,
                        remote=remote,
                        limit=int(limit),
                    )
                st.session_state["review_result"] = {
                    **result,
                    "query": query.strip(),
                    "collection_name": collection_name,
                    "country": country.value if country else None,
                    "remote": remote,
                }
            except (UnexpectedResponse, ConnectionError, TimeoutError, OSError) as exc:
                st.error(f"Qdrant error: {exc}")
            except (
                GenerationRateLimitError,
                GenerationConfigurationError,
                GenerationUnavailableError,
            ) as exc:
                st.error(f"Generation error: {exc}")
            except Exception as exc:
                st.error(f"Run failed: {exc}")

    result_state = st.session_state.get("review_result")
    if isinstance(result_state, dict):
        result = cast(dict[str, Any], result_state)
        left, right = st.columns(2)
        with left:
            st.markdown("#### Sources")
            _render_sources(result["sources"])
        with right:
            st.markdown("#### Answer")
            generated = result.get("generated", False)
            st.caption("generated" if generated else "fallback (no matching jobs)")
            st.markdown(result["answer"])

        _render_judgment_controls(
            note_key="review_note",
            shortcut_key="live_tag_shortcuts",
            on_tag=_save_live_judgment,
        )


def _golden_cache_key(collection_name: str, case_id: str) -> str:
    return f"{collection_name}:{case_id}"


def _golden_prev() -> None:
    st.session_state["golden_index"] = max(
        0, int(st.session_state.get("golden_index", 0)) - 1
    )
    st.session_state["golden_note"] = ""


def _golden_next() -> None:
    cases = load_walkthrough_cases()
    last = max(0, len(cases) - 1)
    st.session_state["golden_index"] = min(
        last, int(st.session_state.get("golden_index", 0)) + 1
    )
    st.session_state["golden_note"] = ""


def _country_from_case(case: GoldenWalkthroughCase) -> CountryCode | None:
    if not case.country:
        return None
    return CountryCode(case.country)


def render_golden_walkthrough_mode() -> None:
    ensure_db()
    cases = load_walkthrough_cases()
    if not cases:
        st.warning(f"No cases found in `{GOLDEN_QUERIES_PATH}`.")
        return

    st.session_state.setdefault("golden_index", 0)
    st.session_state.setdefault("golden_results", {})
    idx = int(st.session_state["golden_index"])
    idx = max(0, min(idx, len(cases) - 1))
    st.session_state["golden_index"] = idx
    case = cases[idx]
    n = len(cases)
    group_label = _GROUP_LABELS.get(case.group, case.group)

    collections = _list_review_collections()
    if collections is None:
        collections = []
    collection_name = FIXTURE_COLLECTION_NAME
    can_run_live = collection_name in collections

    st.caption(
        f"{idx + 1} of {n} · `{case.id}` · {group_label}. "
        f"Judgments persist with `collection_name={FIXTURE_COLLECTION_NAME}`."
    )
    st.progress((idx + 1) / n)

    with st.container(horizontal=True):
        st.button(
            "Previous",
            on_click=_golden_prev,
            disabled=idx == 0,
            icon=":material/arrow_back:",
            key="golden_prev",
        )
        st.button(
            "Next",
            on_click=_golden_next,
            disabled=idx >= n - 1,
            icon=":material/arrow_forward:",
            key="golden_next",
        )

    st.markdown(f"### {case.query}")
    if case.country:
        st.caption(f"Country filter: `{case.country}`")
    if case.notes:
        st.info(case.notes)

    fixture_left, fixture_right = st.columns(2)
    with fixture_left:
        with st.container(border=True):
            st.markdown("#### Expected jobs")
            _render_job_summaries(
                case.expected_jobs,
                empty="No expected jobs in fixture.",
            )
    with fixture_right:
        with st.container(border=True):
            st.markdown("#### Confusers")
            _render_job_summaries(
                case.confuser_jobs,
                empty="No confuser jobs for this case.",
            )

    cache_key = _golden_cache_key(collection_name, case.id)
    results_cache = cast(dict[str, Any], st.session_state["golden_results"])

    if can_run_live and cache_key not in results_cache:
        try:
            with st.spinner("Retrieving and generating..."):
                live = run_review_query(
                    query=case.query,
                    collection_name=collection_name,
                    country=_country_from_case(case),
                    remote=None,
                    limit=walkthrough_top_k(),
                )
            results_cache[cache_key] = {
                **live,
                "query": case.query,
                "collection_name": collection_name,
                "country": case.country,
                "remote": None,
            }
        except (
            UnexpectedResponse,
            ConnectionError,
            TimeoutError,
            OSError,
            GenerationRateLimitError,
            GenerationConfigurationError,
            GenerationUnavailableError,
        ) as exc:
            st.warning(f"Live retrieval unavailable: {exc}")
        except Exception as exc:
            st.warning(f"Live retrieval unavailable: {exc}")

    cached = results_cache.get(cache_key)
    if isinstance(cached, dict):
        live_left, live_right = st.columns(2)
        with live_left:
            st.markdown("#### Retrieved sources")
            _render_sources(cast(list[dict[str, Any]], cached["sources"]))
        with live_right:
            st.markdown("#### Generated answer")
            generated = cached.get("generated", False)
            st.caption("generated" if generated else "fallback (no matching jobs)")
            st.markdown(cached["answer"])
        if st.button("Re-run this case", key="golden_rerun"):
            results_cache.pop(cache_key, None)
            st.rerun()
    elif not can_run_live:
        st.info(
            f"`{FIXTURE_COLLECTION_NAME}` is not on this Qdrant cluster — "
            "showing fixture jobs only. Seed with `uv run python main.py --seed-dev` "
            "to retrieve and generate."
        )

    _render_judgment_controls(
        note_key="golden_note",
        shortcut_key="golden_tag_shortcuts",
        on_tag=_save_golden_judgment,
    )


def render_history() -> None:
    st.subheader("History")
    filter_tag = st.selectbox(
        "Filter by tag",
        options=["(all)", "good", "bad", "partial"],
        key="history_tag_filter",
    )
    tag_filter: Tag | None = None
    if filter_tag != "(all)":
        tag_filter = cast(Tag, filter_tag)
    history = list_judgments(tag=tag_filter)
    if not history:
        st.caption("No judgments yet.")
        return

    for item in history:
        _render_history_row(item)


def _render_history_row(item: Judgment) -> None:
    header = (
        f"#{item.id} [{item.tag}] {item.created_at[:19]} — "
        f"{item.collection_name} — {item.query[:60]}"
    )
    with st.expander(header):
        st.write(f"Country: `{item.country}` · Remote: `{item.remote}`")
        if item.note:
            st.write(f"Note: {item.note}")
        st.markdown("**Stored answer**")
        st.markdown(item.answer)
        st.markdown("**Stored sources**")
        for s in item.sources:
            st.write(
                f"- `{s.get('job_id')}` score={s.get('score')} "
                f"{s.get('job_title')} @ {s.get('company')}"
            )
        if st.button("Replay", key=f"replay_{item.id}"):
            stored = get_judgment(item.id)
            if stored is None:
                st.error("Judgment disappeared.")
                return
            country = CountryCode(stored.country) if stored.country else None
            try:
                with st.spinner("Replaying..."):
                    current = run_review_query(
                        query=stored.query,
                        collection_name=stored.collection_name,
                        country=country,
                        remote=stored.remote,
                        limit=5,
                    )
            except Exception as exc:
                st.error(f"Replay failed: {exc}")
                return
            st.markdown("**Current answer**")
            st.markdown(current["answer"])
            if current["answer"] == stored.answer:
                st.success("Answer text matches stored judgment.")
            else:
                st.warning("Answer text differs from stored judgment.")
            st.markdown("**Source diff**")
            _diff_sources(stored.sources, current["sources"])
