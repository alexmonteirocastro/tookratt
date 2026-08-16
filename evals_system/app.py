"""ALE-163: Human-aided eval review UI (Streamlit).

Local-only tool. Bootstrap repo root on sys.path so ``db`` / ``evals`` /
``llm_client`` import the same way as scripts/*.py.

Review is the landing page; Compare holds the occasional-use harness tabs.
"""

from __future__ import annotations

import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import streamlit as st

from evals_system.judgments import ensure_db

st.set_page_config(
    page_title="Töökratt eval review",
    layout="wide",
)

ensure_db()

with st.sidebar:
    st.markdown("### Notes")
    st.markdown(
        "- Review uses `query_jobs_in_qdrant` + `get_generator` "
        "(not HTTP `/chat`).\n"
        "- Sweep: **Run retrieval** once, then drag the threshold slider "
        "against cached scores.\n"
        "- Judgments: `evals_system/data/judgments.db` (gitignored)."
    )

page = st.navigation(
    [
        st.Page(
            "app_pages/review.py",
            title="Review",
            icon=":material/rate_review:",
            default=True,
        ),
        st.Page(
            "app_pages/compare.py",
            title="Compare",
            icon=":material/compare:",
        ),
    ],
    position="top",
)
page.run()
