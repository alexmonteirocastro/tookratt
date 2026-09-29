"""Pure helpers for the ALE-190 probe. No network."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

_PATH = Path(__file__).resolve().parents[2] / "scripts" / "analyze_skill_aggregation.py"
_spec = importlib.util.spec_from_file_location("analyze_skill_aggregation", _PATH)
assert _spec is not None and _spec.loader is not None
probe = importlib.util.module_from_spec(_spec)
sys.modules["analyze_skill_aggregation"] = probe
_spec.loader.exec_module(probe)


def test_date_like_fields_keep_iso_values_and_named_keys() -> None:
    node = {
        "title": "Engineer",
        "createdAt": "2026-09-01T12:00:00.000Z",
        "views": 3,
        "meta": {"published": True},
    }
    paths = {row["path"] for row in probe.date_like_fields(node)}
    assert "createdAt" in paths
    assert "meta.published" in paths
    assert "title" not in paths
    assert "views" not in paths


def test_go_match_requires_the_capitalized_token() -> None:
    text = "We go to market. The backend is in Go and Golang. Go deep on the problem."
    assert [m.group(0) for m in probe.match_skill(text, "Go")] == ["Go"]
    assert probe.match_skill(text, "R") == []


def test_precision_recall_counts_misses() -> None:
    score = probe.precision_recall({"react", "css"}, {"react", "figma"})
    assert score["tp"] == 1
    assert score["fp"] == 1
    assert score["fn"] == 1
    assert score["precision"] == 0.5
    assert score["recall"] == 0.5
