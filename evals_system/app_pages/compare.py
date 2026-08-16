"""Compare page: embedding, generation, and min-score sweep tabs."""

import streamlit as st

from evals_system.embeddings_tab import render_embeddings_tab
from evals_system.generation_tab import render_generation_tab
from evals_system.sweep_tab import render_sweep_tab

st.caption(
    "Embedding, generation, and min-score sweep tooling. Explicit Run only — "
    "changing controls does not auto-rerun. Sweep: run retrieval once, then "
    "drag the threshold slider against cached scores."
)

tab_embed, tab_gen, tab_sweep = st.tabs(["Embeddings", "Generation", "Min-score sweep"])
with tab_embed:
    render_embeddings_tab()
with tab_gen:
    render_generation_tab()
with tab_sweep:
    render_sweep_tab()
