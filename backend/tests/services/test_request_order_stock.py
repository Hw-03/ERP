"""화면용 잔고 계산의 안전 경계와 독립적인 창고·정상 부서 합계 계약."""

from dataclasses import replace
from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from app.services.inv_effect import StockTotals
from app.services.request_order_stock import StockHistoryEntry, recalculate_request_order_stock


BASE = datetime(2026, 9, 8, 5)


def entry(minute, before, after, *, requested=None, **changes):
    effects = []
    if after[0] != before[0]:
        effects.append({"scope": "warehouse", "delta": after[0] - before[0]})
    if after[1] != before[1]:
        effects.append({"scope": "location", "department": "조립", "status": "PRODUCTION", "delta": after[1] - before[1]})
    return StockHistoryEntry(
        log_id=uuid4(), created_at=BASE + timedelta(minutes=minute),
        requested_at=BASE + timedelta(minutes=minute if requested is None else requested),
        before=StockTotals(*before), after=StockTotals(*after), inventory_effect=effects,
        **changes,
    )


def test_latest_warehouse_and_department_balances_are_independent():
    move = entry(1, (50, 0), (0, 50))
    use = entry(2, (0, 50), (0, 44))
    result = recalculate_request_order_stock([use, move], StockTotals(0, 44))
    assert result[move.log_id].model_dump() == {
        "status": "available", "reason": None,
        "warehouse_qty_before": 50, "warehouse_qty_after": 0,
        "department_qty_before": 0, "department_qty_after": 50,
    }
    assert result[use.log_id].department_qty_after == 44


def test_box_and_defective_movements_do_not_duplicate_normal_stock():
    log = entry(1, (50, 50), (40, 45))
    log = replace(log, inventory_effect=log.inventory_effect + [
        {"scope": "warehouse_box", "box_id": "box", "delta": -2},
        {"scope": "warehouse_zone", "row_id": "zone-row", "zone_id": 1, "delta": -3},
        {"scope": "warehouse_unplaced", "row_id": "unplaced-row", "delta": -5},
        {"scope": "location", "department": "조립", "status": "DEFECTIVE", "delta": 5},
    ])
    stock = recalculate_request_order_stock([log], StockTotals(40, 45))[log.log_id]
    assert (stock.warehouse_qty_before, stock.department_qty_before) == (50, 50)


def test_reversed_original_and_reversal_both_count_once():
    original = entry(1, (0, 44), (0, 50), cancelled=True, cancelled_at=BASE + timedelta(minutes=3))
    next_log = entry(2, (0, 50), (0, 60))
    reversal = entry(3, (0, 60), (0, 54), reverses_log_id=original.log_id)
    result = recalculate_request_order_stock([original, next_log, reversal], StockTotals(0, 54))
    assert all(stock.status == "available" for stock in result.values())
    assert result[original.log_id].department_qty_before == 44
    assert result[reversal.log_id].department_qty_after == 54


def test_legacy_cancellation_boundary_uses_cancellation_time_not_original_time():
    original = entry(1, (0, 44), (0, 50), cancelled=True, cancelled_at=BASE + timedelta(minutes=3))
    middle = entry(2, (0, 50), (0, 60))
    newer = entry(4, (0, 54), (0, 55))
    late = entry(5, (0, 55), (0, 51), requested=2.5)
    result = recalculate_request_order_stock([original, middle, newer, late], StockTotals(0, 51))
    assert result[newer.log_id].status == "available"
    assert (result[newer.log_id].department_qty_before, result[newer.log_id].department_qty_after) == (50, 51)
    for log in (original, middle, late):
        assert result[log.log_id].status == "unavailable"
        assert result[log.log_id].department_qty_after is None


@pytest.mark.parametrize("changes,reason", [
    ({"inventory_effect": None}, "missing_history"),
    ({"before": None}, "missing_history"),
    ({"inventory_effect": [{"scope": "warehouse", "delta": True}]}, "inconsistent_history"),
    ({"inventory_effect": [{"scope": "unknown", "delta": 1}]}, "inconsistent_history"),
    ({"inventory_effect": [{"scope": "warehouse", "delta": -99}]}, "inconsistent_history"),
    ({"after": StockTotals(0, 999)}, "inconsistent_history"),
])
def test_incomplete_older_record_does_not_poison_verified_newer_records(changes, reason):
    older = replace(entry(1, (0, 0), (0, 50)), **changes)
    newer = entry(2, (0, 50), (0, 44))
    result = recalculate_request_order_stock([older, newer], StockTotals(0, 44))
    assert result[newer.log_id].status == "available"
    assert result[older.log_id].reason == reason
    assert result[older.log_id].department_qty_before is None


def test_snapshot_gap_blocks_late_approval_requested_before_gap():
    broken = entry(1, (0, 0), (0, 49))
    newer = entry(2, (0, 50), (0, 60))
    delayed = entry(3, (0, 60), (0, 50), requested=0.5)
    result = recalculate_request_order_stock([broken, newer, delayed], StockTotals(0, 50))
    assert result[newer.log_id].status == "available"
    assert result[delayed.log_id].reason == "inconsistent_history"


def test_same_execution_timestamp_is_not_ordered_by_random_uuid():
    first = entry(1, (0, 0), (0, 10))
    second = entry(1, (0, 10), (0, 20))
    newest = entry(2, (0, 20), (0, 25))
    result = recalculate_request_order_stock([second, first, newest], StockTotals(0, 25))
    assert result[newest.log_id].status == "available"
    assert result[first.log_id].reason == result[second.log_id].reason == "ambiguous_order"


def test_request_order_negative_is_not_clamped_or_shown_as_normal_stock():
    received = entry(2, (0, 0), (0, 5))
    outgoing = entry(3, (0, 5), (0, 0), requested=1)
    latest = entry(4, (0, 0), (0, 1))
    result = recalculate_request_order_stock([received, outgoing, latest], StockTotals(0, 1))
    assert result[latest.log_id].status == "available"
    for log in (received, outgoing):
        assert result[log.log_id].reason == "negative_balance"
        assert result[log.log_id].department_qty_before is None


def test_missing_anchor_and_unknown_legacy_cancellation_time_are_unavailable():
    log = entry(1, (0, 0), (0, 5))
    assert recalculate_request_order_stock([log], None)[log.log_id].reason == "missing_history"
    cancelled = replace(log, cancelled=True)
    assert recalculate_request_order_stock([cancelled], StockTotals(0, 0))[log.log_id].reason == "missing_history"


def test_empty_effect_is_known_zero_not_missing_history():
    log = entry(1, (50, 44), (50, 44))
    result = recalculate_request_order_stock([log], StockTotals(50, 44))[log.log_id]
    assert result.status == "available"
    assert result.warehouse_qty_before == result.warehouse_qty_after == 50


def test_box_effect_without_identifier_is_not_a_verified_ledger():
    log = replace(entry(1, (0, 0), (0, 0)), inventory_effect=[{"scope": "warehouse_box", "delta": 1}])
    assert recalculate_request_order_stock([log], StockTotals(0, 0))[log.log_id].reason == "inconsistent_history"


def test_recalculation_does_not_mutate_input_snapshots_or_effects():
    log = entry(1, (0, 0), (0, 50))
    original = replace(log, inventory_effect=[dict(effect) for effect in log.inventory_effect])
    recalculate_request_order_stock([log], StockTotals(0, 50))
    assert log == original


def test_delayed_approval_followed_by_multiple_cancellations_keeps_one_continuous_balance():
    produced = entry(2, (0, 44), (0, 94), requested=1.5)
    adjusted = entry(3, (0, 94), (0, 50), requested=1)
    cancel_production = entry(4, (0, 50), (0, 0), reverses_log_id=produced.log_id)
    cancel_adjustment = entry(5, (0, 0), (0, 44), reverses_log_id=adjusted.log_id)
    next_production = entry(6, (0, 44), (0, 64))
    logs = [adjusted, produced, cancel_production, cancel_adjustment, next_production]
    result = recalculate_request_order_stock(logs, StockTotals(0, 64))
    assert [(result[log.log_id].department_qty_before, result[log.log_id].department_qty_after) for log in logs] == [
        (44, 0), (0, 50), (50, 0), (0, 44), (44, 64),
    ]
    assert produced.after.department == 94
    assert adjusted.before.department == 94
