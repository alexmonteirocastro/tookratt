"""Keyboard shortcuts for good/bad/partial tagging (Streamlit CCv2)."""

from __future__ import annotations

from collections.abc import Callable

import streamlit as st

from evals_system.judgments import Tag

_TAG_SHORTCUTS = st.components.v2.component(
    "tag_shortcuts",
    html="<div aria-hidden='true'></div>",
    js="""
export default function (component) {
  const { setTriggerValue } = component
  const TAGS = { g: "good", b: "bad", p: "partial" }

  function isTypingTarget(el) {
    if (!el) return false
    const tag = el.tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
    if (el.isContentEditable) return true
    return false
  }

  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (isTypingTarget(e.target)) return
    const tag = TAGS[e.key.toLowerCase()]
    if (!tag) return
    e.preventDefault()
    setTriggerValue("tag", tag)
  }

  document.addEventListener("keydown", onKeyDown)
  return () => document.removeEventListener("keydown", onKeyDown)
}
""",
)


def _trigger_value(state: object, name: str) -> object:
    if state is None:
        return None
    if isinstance(state, dict):
        return state.get(name)
    return getattr(state, name, None)


def consume_tag_shortcut(
    *,
    key: str,
    on_tag: Callable[[Tag], None],
) -> None:
    """Mount a hidden key listener; ``g``/``b``/``p`` invoke ``on_tag``."""

    def _on_tag_change() -> None:
        raw = _trigger_value(st.session_state.get(key), "tag")
        if raw in ("good", "bad", "partial"):
            on_tag(raw)

    _TAG_SHORTCUTS(
        key=key,
        height=1,
        width="content",
        on_tag_change=_on_tag_change,
    )
