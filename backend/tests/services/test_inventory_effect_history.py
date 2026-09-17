from datetime import datetime, timedelta
from uuid import uuid4

from app.services.inventory_effect_history import (
    EffectHistoryEntry,
    reconstruct_effect_quantities,
)


WAREHOUSE = ("warehouse", None, None)


def _entry(created_at: datetime, effect: object) -> EffectHistoryEntry:
    return EffectHistoryEntry(
        log_id=uuid4(),
        item_id=uuid4(),
        created_at=created_at,
        inventory_effect=effect,
    )


def test_reconstruction_stops_at_missing_history_without_guessing_older_stock():
    now = datetime(2026, 9, 17, 9, 0)
    newest = _entry(now, [{"scope": "warehouse", "delta": 1}])
    missing = _entry(now - timedelta(minutes=1), None)
    older = _entry(now - timedelta(minutes=2), [{"scope": "warehouse", "delta": 1}])

    result = reconstruct_effect_quantities(
        [older, missing, newest],
        {WAREHOUSE: 5},
        {newest.log_id, older.log_id},
    )

    assert result[newest.log_id][0]["quantity_before"] == 4
    assert result[newest.log_id][0]["quantity_after"] == 5
    assert older.log_id not in result


def test_reconstruction_omits_ambiguous_same_time_snapshots_but_continues_with_group_delta():
    now = datetime(2026, 9, 17, 9, 0)
    tied_a = _entry(now, [{"scope": "warehouse", "delta": 1}])
    tied_b = _entry(now, [{"scope": "warehouse", "delta": 1}])
    older = _entry(now - timedelta(minutes=1), [{"scope": "warehouse", "delta": 1}])

    result = reconstruct_effect_quantities(
        [older, tied_a, tied_b],
        {WAREHOUSE: 5},
        {tied_a.log_id, tied_b.log_id, older.log_id},
    )

    assert "quantity_before" not in result[tied_a.log_id][0]
    assert "quantity_before" not in result[tied_b.log_id][0]
    assert result[older.log_id][0]["quantity_before"] == 2
    assert result[older.log_id][0]["quantity_after"] == 3
