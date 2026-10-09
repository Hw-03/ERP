"""Approved weekly boundaries use the same KST interval for every legacy column."""

from datetime import date, datetime, timedelta

import pytest

from app.models import ProductSymbol, TransactionTypeEnum
from app.routers.inventory import weekly_report
from tests.routers.test_weekly_report import _add_log, _dec, _make_prod_item


@pytest.mark.parametrize("week_start", [date(2026, 5, 4), date(2025, 12, 29)])
@pytest.mark.parametrize("tx_type,column,sign", [
    (TransactionTypeEnum.PRODUCE, "produce_qty", 1),
    (TransactionTypeEnum.RECEIVE, "receive_qty", 1),
    (TransactionTypeEnum.SHIP, "out_qty", -1),
])
def test_legacy_columns_use_kst_monday_inclusive_next_monday_exclusive(
    client, db_session, week_start, tx_type, column, sign,
) -> None:
    """Subsecond end-of-week activity is included, but either adjacent week is not."""
    db_session.add(ProductSymbol(slot=1, symbol="3", model_name="DX3000"))
    item = _make_prod_item(db_session, name="KST boundary", process_code="TF", model_symbol="3", qty=_dec(20))
    start = datetime.combine(week_start, datetime.min.time()) - timedelta(hours=9)
    end = start + timedelta(days=7)
    for at, quantity in [
        (start - timedelta(microseconds=1), 11),
        (start, 2),
        (end - timedelta(microseconds=1), 3),
        (end, 7),
    ]:
        _add_log(db_session, item.item_id, tx_type=tx_type, qty=_dec(sign * quantity), at=at)
    db_session.commit()

    response = client.get("/api/inventory/weekly-report", params={
        "week_start": week_start.isoformat(), "week_end": (week_start + timedelta(days=6)).isoformat(),
    })

    assert response.status_code == 200, response.text
    body = response.json()
    row = next(row for group in body["groups"] for row in group["items"] if row["item_id"] == str(item.item_id))
    assert row[column] == 5
    assert row["delta"] == sign * 5
    assert row["prev_qty"] == 20 - sign * 5
    assert body["summary"][f"total_{column}"] == 5
    matrix = next(row for row in body["production_matrix"] if row["model_key"] == "DX3000")
    assert matrix["tf_qty"] == (5 if tx_type == TransactionTypeEnum.PRODUCE else 0)


def test_omitted_week_uses_kst_current_week_across_year(client, db_session, monkeypatch) -> None:
    """The server's local timezone must not move the default reporting week."""
    monkeypatch.setattr(weekly_report, "_today_kst", lambda: date(2026, 1, 1))
    response = client.get("/api/inventory/weekly-report")
    assert response.status_code == 200, response.text
    assert response.json()["week_start"] == "2025-12-29"
    assert response.json()["week_end"] == "2026-01-04"
