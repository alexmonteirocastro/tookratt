from db.query_filters import ExtractedFilters


def apply_filter_carry_forward(
    resolved: ExtractedFilters,
    last_filters: ExtractedFilters,
) -> ExtractedFilters:
    """Fill unresolved country/remote fields from the session's last filters.

    Precedence is already applied by ``resolve_chat_filters`` (explicit request
    param, then this turn's text extraction). This function adds ADR-0008
    Decision 5's third rung: the session's last-applied filter, independently
    per field. ``None`` on both sides remains unfiltered.
    """
    return ExtractedFilters(
        country=(
            resolved.country if resolved.country is not None else last_filters.country
        ),
        remote=(
            resolved.remote if resolved.remote is not None else last_filters.remote
        ),
    )
