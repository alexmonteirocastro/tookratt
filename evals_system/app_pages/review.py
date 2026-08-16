"""Review landing page: live query or golden-set walkthrough."""

import streamlit as st

from evals_system.review import (
    consume_review_flash,
    render_golden_walkthrough_mode,
    render_history,
    render_live_query_mode,
    review_mode_label,
)

consume_review_flash()

REVIEW_MODES = ["live", "golden"]
mode = st.segmented_control(
    "Mode",
    options=REVIEW_MODES,
    format_func=review_mode_label,
    default="live",
    required=True,
    key="review_mode",
    width="stretch",
)

if mode == "golden":
    render_golden_walkthrough_mode()
else:
    render_live_query_mode()

st.divider()
render_history()
