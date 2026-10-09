"""Server-only defect contracts not established by historical text-ID bindings."""
from decimal import Decimal
from datetime import date, datetime, timedelta
from collections.abc import Callable
from typing import Any
import json
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    DefectInventoryMovement, DefectQuarantineManagementCategoryRevision,
    DefectQuarantineMemoRevision, DefectQuarantineRecord, DepartmentEnum, Inventory,
    InventoryLocation, InventoryOperation, TransactionLog,
    SystemSetting, TransactionTypeEnum, Item, LocationStatusEnum,
    StockRequest, StockRequestLine, StockRequestStatusEnum, StockRequestTypeEnum, RequestBucketEnum,
)
from tests.test_defect_flow import _make_employee
from tests.test_defect_return_supplier import _supplier, _return_payload
from tests.test_io_expectation_closure import _cells
from tests.services.test_defect_statistics import _add_record, _kst_naive


def _set_fixture_totals(db: Session) -> None:
    """Location factories do not recalculate the inventory aggregate themselves."""
    for inventory in db.query(Inventory).all():
        inventory.quantity = inventory.warehouse_qty + sum(
            (location.quantity for location in db.query(InventoryLocation).filter_by(item_id=inventory.item_id).all()),
            Decimal("0"),
        )
    db.flush()


@pytest.mark.parametrize("source", ["warehouse", "production"])
@pytest.mark.parametrize("action", ["quarantine", "quarantine/bulk", "unquarantine", "unquarantine/bulk"])
def test_inactive_employee_cannot_mutate_defect_stock_or_origins(
    client, db_session, make_item, make_location, source: str, action: str,
) -> None:
    """Disabling an employee must stop each direct and bulk defect write boundary."""
    actor = _make_employee(db_session, code="INACTIVE-DEFECT", name="inactive defect actor")
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("8"))
    make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("6"))
    department = "창고" if source == "warehouse" else "튜브"
    line = {"item_id": str(item.item_id), "qty": 1, "source": source, "target_dept": department,
            "reason_category": "외관 불량"}
    if source == "production":
        line["source_dept"] = department
    for _ in range(2):
        seeded = client.post("/api/defects/quarantine", json={**line, "actor_employee_id": str(actor.employee_id)})
        assert seeded.status_code == 200, seeded.text
    records = db_session.query(DefectQuarantineRecord).all()
    actor.is_active = False
    db_session.commit()
    tables = [model.__table__ for model in (
        Inventory, InventoryLocation, DefectQuarantineRecord, DefectQuarantineMemoRevision,
        DefectQuarantineManagementCategoryRevision, InventoryOperation, TransactionLog, DefectInventoryMovement,
    )]

    def snapshot() -> dict:
        return {table.name: [tuple(row) for row in db_session.execute(table.select()).all()] for table in tables}

    before = snapshot()
    payload = {"actor_employee_id": str(actor.employee_id), "reason_category": "외관 불량"}
    if action == "quarantine":
        payload.update(line)
    elif action == "quarantine/bulk":
        payload["lines"] = [line]
    elif action == "unquarantine":
        payload.update(item_id=str(item.item_id), record_id=str(records[0].record_id), qty=1, dept=department)
    else:
        payload["lines"] = [{"record_id": str(r.record_id), "item_id": str(item.item_id),
                             "department": department, "quantity": 1} for r in records]
    response = client.post(f"/api/defects/{action}", json=payload)
    assert response.status_code == 403, response.text
    db_session.expire_all()
    assert snapshot() == before


def test_supplier_return_cancel_preserves_normal_cells_other_origins_and_retries(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation],
) -> None:
    """A return and its cancellation change only the selected defective origin."""
    actor = _make_employee(db_session, code="EXACT-RETURN", name="return actor")
    supplier = _supplier(db_session, name="original supplier")
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("8"))
    other = make_item(process_type_code="VR", warehouse_qty=Decimal("9"))
    make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("6"))
    make_location(other.item_id, department=DepartmentEnum.VACUUM, quantity=Decimal("7"))
    db_session.add(SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2026-01-01T00:00:00"))
    db_session.commit()
    for quantity in (2, 3):
        response = client.post("/api/defects/quarantine", json={
            "item_id": str(item.item_id), "qty": quantity, "source": "warehouse", "target_dept": "창고",
            "reason_category": "외관 불량", "actor_employee_id": str(actor.employee_id),
        })
        assert response.status_code == 200, response.text
    records = db_session.query(DefectQuarantineRecord).order_by(DefectQuarantineRecord.original_quantity).all()
    before = _cells(db_session)
    payload = _return_payload(employee=actor, item_id=item.item_id, record_id=str(records[0].record_id),
                              supplier_id=supplier.supplier_id, client_request_id="exact-return-once")
    created = client.post("/api/stock-requests", json=payload)
    assert created.status_code == 201, created.text
    expected = dict(before)
    expected[(str(item.item_id), "창고", "DEFECTIVE", "quantity")] -= Decimal("1")
    expected[(str(item.item_id), "total")] -= Decimal("1")
    assert _cells(db_session) == expected
    db_session.expire_all()
    assert [r.remaining_quantity for r in records] == [Decimal("1"), Decimal("3")]
    log = db_session.query(TransactionLog).filter_by(transaction_type=TransactionTypeEnum.SUPPLIER_RETURN).one()
    original_id = log.log_id
    operation_id = log.operation_id
    assert db_session.get(InventoryOperation, operation_id).display_label == "반품"
    assert log.inventory_effect == [{"scope": "location", "department": "창고", "status": "DEFECTIVE", "delta": -1}]
    again = client.post("/api/stock-requests", json=payload)
    assert again.status_code == 201
    assert again.json()["request_id"] == created.json()["request_id"]
    assert _cells(db_session) == expected
    assert db_session.query(TransactionLog).filter_by(transaction_type=TransactionTypeEnum.SUPPLIER_RETURN).count() == 1
    supplier.name = "renamed supplier"
    db_session.commit()
    preview = client.post(f"/api/inventory/operations/{operation_id}/cancel/preview")
    assert preview.status_code == 200, preview.text
    cancel_body = {"reason": "return cancel", "employee_code": actor.employee_code, "pin": "0000",
                   "plan_hash": preview.json()["plan_hash"]}
    for invalid in ({**cancel_body, "reason": ""}, {**cancel_body, "pin": "1111"}):
        rejected = client.post(f"/api/inventory/operations/{operation_id}/cancel", json=invalid)
        assert rejected.status_code in (403, 422), rejected.text
        assert _cells(db_session) == expected
        assert db_session.query(TransactionLog).filter_by(reverses_log_id=original_id).count() == 0
    cancelled = client.post(f"/api/inventory/operations/{operation_id}/cancel", json=cancel_body)
    assert cancelled.status_code == 200, cancelled.text
    assert _cells(db_session) == before
    db_session.expire_all()
    assert [r.remaining_quantity for r in records] == [Decimal("2"), Decimal("3")]
    original = db_session.get(TransactionLog, original_id)
    assert original.quantity_change == Decimal("-1")
    assert original.supplier_name_snapshot == "original supplier"
    reversal = db_session.query(TransactionLog).filter_by(reverses_log_id=original_id).one()
    assert reversal.log_id != original_id
    assert reversal.quantity_change == Decimal("1")
    assert reversal.inventory_effect == [{"scope": "location", "department": "창고", "status": "DEFECTIVE", "delta": 1}]
    assert reversal.supplier_name_snapshot == "original supplier"
    assert db_session.get(InventoryOperation, reversal.operation_id).display_label == "반품 취소"
    history_rows = client.get(f"/api/inventory/transactions?item_id={item.item_id}&limit=1000").json()
    assert next(row for row in history_rows if row["log_id"] == str(original_id))["operation_display_label"] == "반품"
    assert next(row for row in history_rows if row["log_id"] == str(reversal.log_id))["operation_display_label"] == "반품 취소"
    retry_cancel = client.post(f"/api/inventory/operations/{operation_id}/cancel", json=cancel_body)
    assert retry_cancel.status_code == 409, retry_cancel.text
    assert _cells(db_session) == before
    assert db_session.query(TransactionLog).filter_by(reverses_log_id=original_id).count() == 1


@pytest.mark.parametrize("mode", ["missing_supplier", "hidden_supplier", "department_return"])
def test_invalid_return_has_no_stock_origin_request_or_ledger_changes(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], mode: str,
) -> None:
    """Each independent return validation failure must precede every persistent write."""
    actor = _make_employee(db_session, code="INVALID-RETURN", name="return actor")
    supplier = _supplier(db_session, name="supplier", is_active=mode != "hidden_supplier")
    item = make_item(process_type_code="AR", warehouse_qty=Decimal("8"))
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("6"))
    source = "production" if mode == "department_return" else "warehouse"
    department = "조립" if source == "production" else "창고"
    quarantine = {"item_id": str(item.item_id), "qty": 2, "source": source, "target_dept": department,
                  "reason_category": "외관 불량", "actor_employee_id": str(actor.employee_id)}
    if source == "production":
        quarantine["source_dept"] = department
    db_session.commit()
    assert client.post("/api/defects/quarantine", json=quarantine).status_code == 200
    record = db_session.query(DefectQuarantineRecord).one()
    payload = _return_payload(employee=actor, item_id=item.item_id, record_id=str(record.record_id),
                              supplier_id=None if mode == "missing_supplier" else supplier.supplier_id)
    payload["lines"][0]["from_department"] = department
    from app.models import StockRequest, StockRequestLine
    tables = [model.__table__ for model in (Inventory, InventoryLocation, DefectQuarantineRecord,
              TransactionLog, InventoryOperation, DefectInventoryMovement, StockRequest, StockRequestLine)]
    before = {t.name: [tuple(r) for r in db_session.execute(t.select()).all()] for t in tables}
    response = client.post("/api/stock-requests", json=payload)
    assert response.status_code == 422, response.text
    db_session.expire_all()
    after = {t.name: [tuple(r) for r in db_session.execute(t.select()).all()] for t in tables}
    assert after == before


@pytest.mark.parametrize("source", ["warehouse", "production"])
@pytest.mark.parametrize("category", ["DEFECT", "B_GRADE", "OBSOLETE"])
def test_quarantine_exact_cells_and_classification_audit_preserve_unselected_data(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], source: str, category: str,
) -> None:
    """Quarantine moves only the chosen cell; classification moves no stock at all."""
    actor = _make_employee(db_session, code="CLASSIFY-CELLS", name="classification actor")
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("8"))
    other = make_item(process_type_code="VR", warehouse_qty=Decimal("9"))
    for target, department in ((item, DepartmentEnum.TUBE), (item, DepartmentEnum.RESEARCH), (other, DepartmentEnum.VACUUM)):
        make_location(target.item_id, department=department, quantity=Decimal("6"))
        make_location(target.item_id, department=department, status=LocationStatusEnum.DEFECTIVE, quantity=Decimal("1"))
    department = "창고" if source == "warehouse" else "튜브"
    _set_fixture_totals(db_session)
    db_session.commit()
    for target in (item, other):
        seeded = client.post("/api/defects/quarantine", json={
            "item_id": str(target.item_id), "qty": 1, "source": "warehouse", "target_dept": "창고",
            "reason_category": "외관 불량", "actor_employee_id": str(actor.employee_id),
        })
        assert seeded.status_code == 200, seeded.text
    existing_ids = [record.record_id for record in db_session.query(DefectQuarantineRecord).all()]
    records_table = DefectQuarantineRecord.__table__
    existing_origins = list(db_session.execute(records_table.select().where(records_table.c.record_id.in_(existing_ids))).all())
    before = _cells(db_session)
    payload = {"item_id": str(item.item_id), "qty": 2, "source": source, "target_dept": department,
               "reason_category": "외관 불량", "reason_memo": "separate memo", "management_category": category,
               "actor_employee_id": str(actor.employee_id)}
    if source == "production":
        payload["source_dept"] = department
    response = client.post("/api/defects/quarantine", json=payload)
    assert response.status_code == 200, response.text
    expected = dict(before)
    normal_key = ((str(item.item_id), "warehouse") if source == "warehouse"
                  else (str(item.item_id), department, "PRODUCTION", "quantity"))
    expected[normal_key] -= Decimal("2")
    defect_key = (str(item.item_id), department, "DEFECTIVE", "quantity")
    expected[defect_key] = expected.get(defect_key, Decimal("0")) + Decimal("2")
    expected.setdefault((str(item.item_id), department, "DEFECTIVE", "pending"), Decimal("0"))
    assert _cells(db_session) == expected
    assert list(db_session.execute(records_table.select().where(records_table.c.record_id.in_(existing_ids))).all()) == existing_origins
    record = db_session.query(DefectQuarantineRecord).filter(DefectQuarantineRecord.record_id.not_in(existing_ids)).one()
    assert record.department == department
    assert record.original_quantity == record.remaining_quantity == Decimal("2")
    assert record.management_category == category
    assert record.quarantined_by_employee_id == actor.employee_id
    assert record.quarantined_at is not None
    transactions = client.get(f"/api/inventory/transactions?item_id={item.item_id}")
    assert transactions.status_code == 200
    transaction = transactions.json()[0]
    assert transaction["item_id"] == str(item.item_id)
    assert transaction["transaction_type"] == "MARK_DEFECTIVE"
    assert transaction["produced_by"] == actor.name
    assert transaction["producer_employee_id"] == str(actor.employee_id)
    assert transaction["created_at"] is not None
    locations = client.get("/api/defects/locations").json()
    origin = next(row for row in locations if row["record_id"] == str(record.record_id))
    assert origin["reason_category"] == "외관 불량"
    assert origin["defective_at"] is not None
    selected_ids = {str(row.record_id) for row in db_session.query(DefectQuarantineRecord).all()
                    if row.management_category == category and row.remaining_quantity > 0}
    filtered = client.get("/api/defects/locations", params={"management_category": category})
    assert {row["record_id"] for row in filtered.json() if row["record_id"] in selected_ids} == selected_ids
    assert all(row["management_category"] == category for row in filtered.json())
    assert client.get("/api/defects/kpi", params={"management_category": category}).json()["quarantined"] == len(selected_ids)
    next_category = "B_GRADE" if category != "B_GRADE" else "OBSOLETE"
    ledger_ids = {log.log_id for log in db_session.query(TransactionLog).all()}
    start = datetime.utcnow() - timedelta(seconds=1)
    changed = client.put(f"/api/defects/records/{record.record_id}/management-category", json={
        "expected_management_category": category, "management_category": next_category,
        "memo": "classification memo", "actor_employee_id": str(actor.employee_id), "pin": "0000",
    })
    assert changed.status_code == 200, changed.text
    assert _cells(db_session) == expected
    assert {log.log_id for log in db_session.query(TransactionLog).all()} == ledger_ids
    history = client.get(f"/api/defects/records/{record.record_id}/management-category-history")
    assert history.status_code == 200
    edit = next(entry for entry in history.json() if not entry["is_initial"])
    assert (edit["previous_category"], edit["next_category"], edit["memo"]) == (category, next_category, "classification memo")
    assert (edit["edited_by_employee_id"], edit["edited_by_name"]) == (str(actor.employee_id), actor.name)
    assert start <= datetime.fromisoformat(edit["edited_at"]).replace(tzinfo=None) <= datetime.utcnow() + timedelta(seconds=1)
    db_session.expire_all()
    assert record.original_quantity == record.remaining_quantity == Decimal("2")
    assert list(db_session.execute(records_table.select().where(records_table.c.record_id.in_(existing_ids))).all()) == existing_origins


@pytest.mark.parametrize("late_failure", [False, True])
def test_normal_rework_four_ar_children_match_original_assembly_fixture(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], make_bom: Callable[..., Any],
    monkeypatch: pytest.MonkeyPatch, late_failure: bool,
) -> None:
    """8.8-05's four AR children belong to assembly by their own process codes."""
    actor = _make_employee(db_session, code="REWORK-4AR", name="normal rework actor")
    parent = make_item(process_type_code="AA", warehouse_qty=Decimal("8"))
    make_location(parent.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("3"))
    children = [make_item(name=f"AR child {index}", process_type_code="AR", warehouse_qty=Decimal("9")) for index in range(4)]
    for child in children:
        make_bom(parent.item_id, child.item_id, Decimal("1"))
        make_location(child.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal("2"))
        make_location(child.item_id, department=DepartmentEnum.ASSEMBLY, status=LocationStatusEnum.DEFECTIVE, quantity=Decimal("1"))
        make_location(child.item_id, department=DepartmentEnum.RESEARCH, quantity=Decimal("4"))
    db_session.add(SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2026-01-01T00:00:00"))
    _set_fixture_totals(db_session)
    db_session.commit()
    before = _cells(db_session)
    if late_failure:
        from app.services import inv_effect
        actual_capture = inv_effect.capture_log_stock_snapshot
        calls = []

        def fail_after_first_child(db: Session, item_id: Any, previous: dict) -> dict:
            calls.append(item_id)
            if len(calls) == 2:
                assert _cells(db) != before
                raise ValueError("late rework capture failure")
            return actual_capture(db, item_id, previous)

        monkeypatch.setattr(inv_effect, "capture_log_stock_snapshot", fail_after_first_child)
    response = client.post("/api/stock-requests", json={
        "requester_employee_id": str(actor.employee_id), "request_type": "rework_normal", "reason_category": "외관 불량",
        "notes": json.dumps({"child_decisions": [{"item_id": str(child.item_id), "qty": "1", "normal_qty": "1", "defective_qty": "0", "scrap_qty": "0"} for child in children]}),
        "lines": [{"item_id": str(parent.item_id), "quantity": 1, "from_bucket": "production", "from_department": "조립", "to_bucket": "none"}],
    })
    if late_failure:
        assert response.status_code == 422, response.text
        assert len(calls) == 2
        assert _cells(db_session) == before
        assert db_session.query(TransactionLog).count() == 0
        assert db_session.query(InventoryOperation).count() == 0
        assert db_session.query(DefectQuarantineRecord).count() == 0
        assert db_session.query(DefectInventoryMovement).count() == 0
        return
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "completed"
    expected = dict(before)
    expected[(str(parent.item_id), "조립", "PRODUCTION", "quantity")] -= Decimal("1")
    expected[(str(parent.item_id), "total")] -= Decimal("1")
    for child in children:
        expected[(str(child.item_id), "조립", "PRODUCTION", "quantity")] += Decimal("1")
        expected[(str(child.item_id), "total")] += Decimal("1")
    assert _cells(db_session) == expected
    logs = db_session.query(TransactionLog).all()
    assert len(logs) == 5
    assert {log.item_id for log in logs} == {parent.item_id, *(child.item_id for child in children)}
    assert len({log.operation_id for log in logs}) == 1
    assert all(log.operation_id is not None for log in logs)
    assert all(log.department == "조립" for log in logs)


@pytest.mark.parametrize("period", ["week", "month", "year"])
def test_statistics_all_filtered_aggregates_and_tied_ranks_match_occurrences(
    db_session: Session, make_item: Callable[..., Item], period: str,
) -> None:
    """Every returned group must use the same department-filtered occurrences."""
    from app.schemas.defect_statistics import DefectStatisticsFilters
    from app.services.defect_statistics import get_defect_statistics
    included = [make_item(name=f"tied tube {index}", process_type_code="TR") for index in range(2)]
    excluded = make_item(name="unselected department", process_type_code="HR")
    for index, item in enumerate(included):
        _add_record(db_session, item, quantity=4, at=_kst_naive(2026, 9, 2 + index), department="튜브", reason=f"reason {index}")
    _add_record(db_session, excluded, quantity=99, at=_kst_naive(2026, 9, 2), department="고압")
    db_session.flush()
    query = dict(period=period, anchor=date(2026, 9, 4), filters=DefectStatisticsFilters(departments=("튜브",)))
    result = get_defect_statistics(db_session, **query)
    assert result.summary.quantity == 8
    assert result.summary.record_count == 2
    for group in (result.categories, result.items, result.reasons, result.departments, result.timeline):
        assert sum(entry.quantity for entry in group) == 8
        assert sum(entry.record_count for entry in group) == 2
    assert {entry.item_id for entry in result.items} == {item.item_id for item in included}
    assert [entry.label for entry in result.departments] == ["튜브"]
    assert {entry.label for entry in result.reasons} == {"reason 0", "reason 1"}
    again = get_defect_statistics(db_session, **query)
    assert [(entry.item_id, entry.quantity) for entry in again.items] == [(entry.item_id, entry.quantity) for entry in result.items]


@pytest.mark.parametrize("action", ["quarantine", "unquarantine"])
def test_bulk_defect_validation_reports_every_invalid_line_without_mutation(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], action: str,
) -> None:
    """A bulk rejection must identify both invalid rows before any write occurs."""
    actor = _make_employee(db_session, code="BULK-ALL-ERRORS", name="bulk actor")
    items = [make_item(name=f"invalid stock {index}", process_type_code="TR", warehouse_qty=Decimal("5")) for index in range(2)]
    db_session.commit()
    if action == "unquarantine":
        for quantity in (2, 3):
            assert client.post("/api/defects/quarantine", json={
                "item_id": str(items[0].item_id), "qty": quantity, "source": "warehouse", "target_dept": "창고",
                "reason_category": "외관 불량", "actor_employee_id": str(actor.employee_id),
            }).status_code == 200
        records = db_session.query(DefectQuarantineRecord).order_by(DefectQuarantineRecord.original_quantity).all()
        lines = [{"record_id": str(record.record_id), "item_id": str(items[0].item_id), "department": "창고", "quantity": 1} for record in records]
        identifiers = [f"선택 기록 {index + 1}" for index in range(len(records))]
    else:
        lines = [{"item_id": str(item.item_id), "qty": 6, "source": "warehouse", "target_dept": "창고", "reason_category": "외관 불량"} for item in items]
        identifiers = [item.item_name for item in items]
    tables = [model.__table__ for model in (Inventory, InventoryLocation, DefectQuarantineRecord,
              TransactionLog, InventoryOperation, DefectInventoryMovement)]
    before = {t.name: [tuple(r) for r in db_session.execute(t.select()).all()] for t in tables}
    response = client.post(f"/api/defects/{action}/bulk", json={"lines": lines, "actor_employee_id": str(actor.employee_id), "reason_category": "외관 불량"})
    assert response.status_code == 422, response.text
    for identifier in identifiers:
        assert identifier in response.json()["detail"]["message"]
    db_session.expire_all()
    assert {t.name: [tuple(r) for r in db_session.execute(t.select()).all()] for t in tables} == before


@pytest.mark.parametrize("source", ["warehouse", "production"])
def test_normal_scrap_changes_only_selected_normal_cell_and_one_log(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], source: str,
) -> None:
    """Normal scrap bypasses quarantine and preserves every unselected physical cell."""
    actor = _make_employee(db_session, code="NORMAL-SCRAP", name="scrap actor")
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("8"))
    other = make_item(process_type_code="VR", warehouse_qty=Decimal("9"))
    for target, department in ((item, DepartmentEnum.TUBE), (item, DepartmentEnum.RESEARCH), (other, DepartmentEnum.VACUUM)):
        make_location(target.item_id, department=department, quantity=Decimal("6"))
        make_location(target.item_id, department=department, status=LocationStatusEnum.DEFECTIVE, quantity=Decimal("1"))
    _set_fixture_totals(db_session)
    db_session.commit()
    before = _cells(db_session)
    line = {"item_id": str(item.item_id), "quantity": 2, "from_bucket": source, "to_bucket": "none"}
    if source == "production":
        line["from_department"] = "튜브"
    response = client.post("/api/stock-requests", json={"requester_employee_id": str(actor.employee_id),
                           "request_type": "scrap_normal", "reason_category": "외관 불량", "lines": [line]})
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "completed"
    expected = dict(before)
    normal_key = ((str(item.item_id), "warehouse") if source == "warehouse"
                  else (str(item.item_id), "튜브", "PRODUCTION", "quantity"))
    expected[normal_key] -= Decimal("2")
    expected[(str(item.item_id), "total")] -= Decimal("2")
    assert _cells(db_session) == expected
    logs = db_session.query(TransactionLog).all()
    assert len(logs) == 1
    assert logs[0].transaction_type == TransactionTypeEnum.DEFECT_SCRAP
    assert db_session.query(DefectQuarantineRecord).count() == 0


def test_defect_processing_draft_accepts_unselected_reason_but_submit_requires_it(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    """The approved reason policy distinguishes drafting from actual submission."""
    actor = _make_employee(db_session, code="DRAFT-NO-REASON", name="draft actor")
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("5"))
    db_session.commit()
    before = _cells(db_session)
    saved = client.put("/api/stock-requests/draft", json={"requester_employee_id": str(actor.employee_id),
                       "request_type": "scrap_normal", "lines": [{"item_id": str(item.item_id), "quantity": 1,
                       "from_bucket": "warehouse", "to_bucket": "none"}]})
    assert saved.status_code == 200, saved.text
    assert saved.json()["status"] == "draft"
    assert saved.json()["reason_category"] is None
    assert _cells(db_session) == before
    submitted = client.post(f"/api/stock-requests/{saved.json()['request_id']}/submit",
                            json={"requester_employee_id": str(actor.employee_id)})
    assert submitted.status_code == 422, submitted.text
    assert _cells(db_session) == before
    assert db_session.query(TransactionLog).count() == 0


@pytest.mark.parametrize("invalid", ["duplicate", "mixed_item", "mixed_department", "pending", "missing", "exhausted", "stale_quantity"])
def test_bulk_restore_revalidates_exact_group_and_live_origin_without_other_invalid_fields(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], invalid: str,
) -> None:
    """Each rejected group has valid actor/reason and only its named invalid boundary."""
    actor = _make_employee(db_session, code="EXACT-GROUP", name="group actor")
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("10"))
    other = make_item(process_type_code="VR", warehouse_qty=Decimal("5"))
    make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("4"))
    for selected, source in [(item, "warehouse"), (item, "warehouse"), (other, "warehouse"), (item, "production")]:
        department = "창고" if source == "warehouse" else "튜브"
        payload = {"item_id": str(selected.item_id), "qty": 2, "source": source, "target_dept": department,
                   "reason_category": "외관 불량", "actor_employee_id": str(actor.employee_id)}
        if source == "production":
            payload["source_dept"] = department
        assert client.post("/api/defects/quarantine", json=payload).status_code == 200
    records = db_session.query(DefectQuarantineRecord).order_by(DefectQuarantineRecord.quarantined_at).all()
    selected = [records[0], records[1]]
    if invalid == "duplicate":
        selected[1] = selected[0]
    elif invalid == "mixed_item":
        selected[1] = records[2]
    elif invalid == "mixed_department":
        selected[1] = records[3]
    elif invalid == "pending":
        request = StockRequest(requester_employee_id=actor.employee_id, requester_name=actor.name,
                               requester_department="창고", request_type=StockRequestTypeEnum.DEFECT_SCRAP,
                               status=StockRequestStatusEnum.RESERVED)
        db_session.add(request)
        db_session.flush()
        db_session.add(StockRequestLine(request_id=request.request_id, item_id=item.item_id,
                                       item_name_snapshot=item.item_name, quantity=1,
                                       from_bucket=RequestBucketEnum.DEFECTIVE, from_department="창고",
                                       to_bucket=RequestBucketEnum.NONE, status=StockRequestStatusEnum.RESERVED,
                                       defect_quarantine_record_id=selected[1].record_id))
    elif invalid == "exhausted":
        selected[1].remaining_quantity = 0
    db_session.commit()
    lines = [{"record_id": str(record.record_id), "item_id": str(record.item_id),
              "department": record.department, "quantity": 2} for record in selected]
    if invalid == "missing":
        lines[1]["record_id"] = str(uuid.uuid4())
    elif invalid == "stale_quantity":
        lines[1]["quantity"] = 1
    tables = [model.__table__ for model in (Inventory, InventoryLocation, DefectQuarantineRecord,
                                           TransactionLog, InventoryOperation, DefectInventoryMovement,
                                           StockRequest, StockRequestLine)]
    before = {table.name: [tuple(row) for row in db_session.execute(table.select()).all()] for table in tables}
    response = client.post("/api/defects/unquarantine/bulk", json={
        "actor_employee_id": str(actor.employee_id), "reason_category": "외관 불량", "lines": lines,
    })
    assert response.status_code == 422, response.text
    messages = {"duplicate": "중복", "mixed_item": "같은 품목", "mixed_department": "같은 부서",
                "pending": "대기 또는 예약", "missing": "찾을 수 없습니다",
                "exhausted": "수량이 변경", "stale_quantity": "수량이 변경"}
    assert messages[invalid] in response.json()["detail"]["message"]
    db_session.expire_all()
    assert {table.name: [tuple(row) for row in db_session.execute(table.select()).all()] for table in tables} == before


def test_origin_list_preserves_each_distinct_quarantine_timestamp_and_reason(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    """Timestamp serialization must follow each origin rather than the aggregate location."""
    actor = _make_employee(db_session, code="EXACT-TIMES", name="time actor")
    item = make_item(process_type_code="TR", warehouse_qty=Decimal("8"))
    for memo in ["first origin", "second origin"]:
        response = client.post("/api/defects/quarantine", json={
            "item_id": str(item.item_id), "qty": 1, "source": "warehouse", "target_dept": "창고",
            "actor_employee_id": str(actor.employee_id), "reason_category": "외관 불량", "reason_memo": memo,
        })
        assert response.status_code == 200, response.text
    records = db_session.query(DefectQuarantineRecord).order_by(DefectQuarantineRecord.quarantined_at).all()
    records[0].quarantined_at = datetime(2026, 9, 2, 1, 2, 3)
    records[1].quarantined_at = datetime(2026, 9, 3, 4, 5, 6)
    db_session.commit()
    response = client.get("/api/defects/locations")
    assert response.status_code == 200, response.text
    rows = {row["record_id"]: row for row in response.json() if row["item_id"] == str(item.item_id)}
    assert set(rows) == {str(record.record_id) for record in records}
    for record in records:
        row = rows[str(record.record_id)]
        assert datetime.fromisoformat(row["defective_at"]).replace(tzinfo=None) == record.quarantined_at
        assert row["reason_category"] == record.reason_category
        assert row["reason_memo"] == record.current_memo
