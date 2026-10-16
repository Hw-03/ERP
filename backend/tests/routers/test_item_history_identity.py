"""Renaming a master cannot rewrite the identity displayed for an earlier transaction."""
from collections.abc import Callable
import csv
from datetime import datetime, timedelta
from io import BytesIO, StringIO
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy.orm import Session

from app.models import AdminAuditLog, Item, ProductSymbol, TransactionLog, TransactionTypeEnum
from app.utils.mes_code import refresh_symbol_cache

ADMIN = {"X-Admin-Pin": "0000"}


def test_item_rename_preserves_transaction_time_identity_and_current_item_link(
    client: TestClient, db_session: Session,
) -> None:
    """Read the same persisted log after a name/category edit and follow its stable item ID."""
    db_session.add(ProductSymbol(slot=1, symbol="3", model_name="History", is_finished_good=False, is_reserved=False))
    db_session.commit()
    refresh_symbol_cache(db_session)
    created = client.post("/api/items", headers=ADMIN, json={
        "item_name": "transaction-time name", "process_type_code": "TR", "model_slots": [1],
        "unit": "EA", "initial_quantity": 5,
    })
    assert created.status_code == 201, created.text
    item_id = created.json()["item_id"]
    original = client.get("/api/inventory/transactions", params={"item_id": item_id}).json()
    assert len(original) == 1
    updated = client.put(f"/api/items/{item_id}", headers=ADMIN, json={
        "item_name": "current master name", "process_type_code": "HR",
    })
    assert updated.status_code == 200, updated.text
    history = client.get("/api/inventory/transactions", params={"item_id": item_id}).json()
    assert history[0]["log_id"] == original[0]["log_id"]
    assert history[0]["item_id"] == item_id
    assert history[0]["item_name"] == "transaction-time name"
    assert history[0]["mes_code"] == original[0]["mes_code"]
    assert history[0]["item_process_type_code"] == "TR"
    assert history[0]["item_snapshot_preserved"] is True
    assert history[0]["current_item_name"] == "current master name"
    assert history[0]["current_mes_code"] == updated.json()["mes_code"]
    current = client.get(f"/api/items/{history[0]['item_id']}").json()
    assert current["item_name"] == "current master name"
    assert current["process_type_code"] == "HR"
    assert current["quantity"] == 5
    searched = client.get("/api/inventory/transactions", params={"search": "transaction-time name"}).json()
    assert [row["log_id"] for row in searched] == [original[0]["log_id"]]
    groups = client.get("/api/inventory/transactions/display-groups", params={"item_id": item_id}).json()
    assert groups["groups"][0]["logs"][0]["item_name"] == "transaction-time name"
    operation = client.get(f"/api/inventory/operations/{history[0]['operation_id']}").json()
    assert operation["lines"][0]["item_name"] == "transaction-time name"
    assert operation["lines"][0]["history_log"]["item_snapshot_preserved"] is True
    audit = db_session.query(AdminAuditLog).filter_by(action="item.update", target_id=item_id).one()
    assert "transaction-time name" in audit.payload_summary
    assert "current master name" in audit.payload_summary
    assert original[0]["mes_code"] in audit.payload_summary
    assert updated.json()["mes_code"] in audit.payload_summary
    _assert_export_identity(client, history[0], True)


def test_legacy_transaction_identity_remains_unknown_without_invented_backfill(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    """A pre-migration NULL is current master fallback, explicitly not a historical claim."""
    item = make_item(name="legacy current", process_type_code="TR")
    log = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
                         quantity_change=1, quantity_before=0, quantity_after=1)
    db_session.add(log)
    db_session.commit()
    # Simulate the nullable value of an actual migrated record, not a new write.
    db_session.query(TransactionLog).filter_by(log_id=log.log_id).update({"item_snapshot": None})
    db_session.commit()
    result = client.get("/api/inventory/transactions", params={"item_id": str(item.item_id)}).json()
    assert result[0]["item_name"] == "legacy current"
    assert result[0]["item_snapshot_preserved"] is False
    _assert_export_identity(client, result[0], False)
    db_session.refresh(log)
    assert log.item_snapshot is None


def test_model_display_rename_keeps_all_transaction_snapshot_columns(
    client: TestClient, db_session: Session,
) -> None:
    """A current model display edit cannot rewrite a persisted transaction or its item identity."""
    db_session.add(ProductSymbol(slot=1, symbol="3", model_name="snapshot model", is_reserved=False))
    db_session.commit()
    refresh_symbol_cache(db_session)
    created = client.post("/api/items", headers=ADMIN, json={
        "item_name": "model snapshot item", "process_type_code": "TR", "model_slots": [1],
        "initial_quantity": 5,
    })
    assert created.status_code == 201, created.text
    before = [tuple(row) for row in db_session.execute(TransactionLog.__table__.select()).all()]
    snapshot = db_session.query(TransactionLog).one().item_snapshot.copy()
    renamed = client.put("/api/models/1", headers=ADMIN, json={"model_name": "current model name", "pin": "0000"})
    assert renamed.status_code == 200, renamed.text
    assert renamed.json()["model_name"] == "current model name"
    assert [tuple(row) for row in db_session.execute(TransactionLog.__table__.select()).all()] == before
    assert db_session.query(TransactionLog).one().item_snapshot == snapshot
    history = client.get("/api/inventory/transactions", params={"item_id": created.json()["item_id"]}).json()
    assert history[0]["mes_code"] == snapshot["mes_code"]
    assert history[0]["item_name"] == snapshot["item_name"]


def _assert_export_identity(client: TestClient, log: dict, preserved: bool) -> None:
    """CSV and Excel both distinguish time-of-transaction labels from linked current labels."""
    date = (datetime.fromisoformat(log["created_at"].replace("Z", "+00:00")) + timedelta(hours=9)).date().isoformat()
    params = {"search": log["item_name"], "start_date": date, "end_date": date}
    response = client.get("/api/inventory/transactions/export.csv", params=params)
    assert response.status_code == 200, response.text
    row = next(csv.DictReader(StringIO(response.content.decode("utf-8-sig"))))
    assert row["item_name"] == log["item_name"]
    assert row["mes_code"] == log["mes_code"]
    assert row["item_identity_basis"] == ("거래 당시" if preserved else "현재 품목 (당시 정보 미보존)")
    assert row["current_item_name"] == log["current_item_name"]
    assert row["current_mes_code"] == log["current_mes_code"]
    excel = client.get("/api/inventory/transactions/export.xlsx", params=params)
    assert excel.status_code == 200, excel.text
    workbook = load_workbook(BytesIO(excel.content), data_only=True)
    try:
        rows = list(workbook.active.values)
        values = dict(zip(rows[0], rows[1]))
        assert values["품목명"] == log["item_name"]
        assert values["품목 정보 기준"] == row["item_identity_basis"]
        assert values["현재 품목명"] == log["current_item_name"]
        assert values["현재 품목 코드"] == log["current_mes_code"]
    finally:
        workbook.close()
