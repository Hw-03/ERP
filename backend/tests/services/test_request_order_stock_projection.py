"""Selecting output rows must keep hidden ledger evidence and safety boundaries."""

from dataclasses import replace

import pytest

from app.services.inv_effect import StockTotals
from app.services.request_order_stock import recalculate_request_order_stock
from tests.services.test_request_order_stock import BASE, entry


@pytest.mark.parametrize("case", [
    "valid", "missing_current", "negative_current", "missing_snapshot",
    "unknown_cancellation", "broken_chain", "ambiguous_time", "delayed_request", "reversal",
    "negative_reordering",
])
def test_selected_outputs_match_complete_ledger_with_hidden_boundaries(case: str) -> None:
    """An unselected row can still invalidate or alter a visible row's stock."""
    first = entry(1, (0, 0), (0, 10))
    hidden = entry(2, (0, 10), (0, 7))
    last = entry(3, (0, 7), (0, 9))
    current = StockTotals(0, 9)
    if case == "missing_current":
        current = None
    elif case == "negative_current":
        current = StockTotals(0, -1)
    elif case == "missing_snapshot":
        hidden = replace(hidden, before=None)
    elif case == "unknown_cancellation":
        hidden = replace(hidden, cancelled=True)
    elif case == "broken_chain":
        hidden = replace(hidden, after=StockTotals(0, 6))
    elif case == "ambiguous_time":
        hidden = replace(hidden, created_at=last.created_at)
    elif case == "delayed_request":
        hidden = replace(hidden, before=None)
        last = replace(last, requested_at=BASE)
    elif case == "reversal":
        first = replace(first, cancelled=True, cancelled_at=last.created_at)
        last = replace(last, reverses_log_id=first.log_id)
    elif case == "negative_reordering":
        first = entry(2, (0, 0), (0, 5))
        hidden = entry(3, (0, 5), (0, 0), requested=1)
        last = entry(4, (0, 0), (0, 1))
        current = StockTotals(0, 1)

    entries = [last, first, hidden]
    expected = recalculate_request_order_stock(entries, current)
    selected_ids = {first.log_id, last.log_id}

    actual = recalculate_request_order_stock(entries, current, output_log_ids=selected_ids)

    assert {key: value.model_dump() for key, value in actual.items()} == {
        key: expected[key].model_dump() for key in selected_ids
    }
    assert recalculate_request_order_stock(entries, current, output_log_ids=set()) == {}
