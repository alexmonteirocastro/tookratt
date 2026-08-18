from db.query_filters import ExtractedFilters
from session.filters import apply_filter_carry_forward
from the_hub_client.models import CountryCode


def test_carry_forward_inherits_when_current_turn_resolves_nothing():
    resolved = ExtractedFilters()
    last = ExtractedFilters(country=CountryCode.SWEDEN, remote=True)

    result = apply_filter_carry_forward(resolved, last)

    assert result == ExtractedFilters(country=CountryCode.SWEDEN, remote=True)


def test_carry_forward_current_turn_signal_overrides_session():
    resolved = ExtractedFilters(country=CountryCode.DENMARK)
    last = ExtractedFilters(country=CountryCode.SWEDEN, remote=True)

    result = apply_filter_carry_forward(resolved, last)

    assert result == ExtractedFilters(country=CountryCode.DENMARK, remote=True)


def test_carry_forward_fills_only_unresolved_fields():
    resolved = ExtractedFilters(remote=False)
    last = ExtractedFilters(country=CountryCode.FINLAND, remote=True)

    result = apply_filter_carry_forward(resolved, last)

    assert result == ExtractedFilters(country=CountryCode.FINLAND, remote=False)


def test_carry_forward_stays_unfiltered_when_neither_side_has_a_value():
    result = apply_filter_carry_forward(ExtractedFilters(), ExtractedFilters())

    assert result == ExtractedFilters()
