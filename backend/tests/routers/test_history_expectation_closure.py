"""History filters must select the same population in lists, cursors and totals."""

from datetime import datetime
from typing import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Employee, Inventory, InventoryLocation, InventoryOperation, InventoryOperationKindEnum, Item, ProductSymbol, SystemSetting, TransactionLog, TransactionTypeEnum
from app.services.pin_auth import DEFAULT_PIN_HASH


@pytest.mark.parametrize("with_reverse", [False, True])
def test_legacy_rework_reference_counts_one_work_across_result_rows(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], with_reverse: bool,
) -> None:
    """Restored rework keeps one work count despite normal/defect/scrap outputs."""
    kinds = [TransactionTypeEnum.DISASSEMBLE, TransactionTypeEnum.RECEIVE,
             TransactionTypeEnum.MARK_DEFECTIVE, TransactionTypeEnum.DEFECT_SCRAP]
    for index, kind in enumerate(kinds):
        item = make_item(name=f"legacy-rework-{index}", process_type_code="AR")
        original = TransactionLog(item_id=item.item_id, transaction_type=kind,
            quantity_before=2, quantity_after=1, quantity_change=-1,
            reference_no="defect-disassemble:legacy-work", department="조립",
            created_at=datetime(2026, 10, 6, 2))
        db_session.add(original)
        db_session.flush()
        if with_reverse:
            db_session.add(TransactionLog(item_id=item.item_id, transaction_type=kind,
                quantity_before=1, quantity_after=2, quantity_change=1,
                reference_no=original.reference_no, department="조립", reverses_log_id=original.log_id,
                created_at=datetime(2026, 11, 6, 2)))
    db_session.commit()
    params = {"search": "legacy-rework"}
    groups = client.get("/api/inventory/transactions/display-groups", params=params)
    assert groups.status_code == 200, groups.text
    assert len(groups.json()["groups"]) == 1
    assert len(groups.json()["groups"][0]["logs"]) == (8 if with_reverse else 4)
    summary = client.get("/api/inventory/transactions/summary", params=params)
    assert summary.status_code == 200, summary.text
    assert summary.json()["total"] == (2 if with_reverse else 1)
    monthly = client.get("/api/inventory/transactions/monthly-counts", params={"year": 2026})
    assert monthly.json()["2026-10"] == 1
    assert monthly.json()["2026-11"] == (1 if with_reverse else 0)


@pytest.mark.parametrize(
    ("filters", "expected_keys"),
    [
        ({"department": "조립", "model": "검수모델A", "operation_keys": "process"}, {"a1", "a2"}),
        ({"department": "조립,고압", "model": "검수모델A", "operation_keys": "process"}, {"a1", "a2", "high"}),
        ({"department": "조립", "model": "검수모델A,검수모델B", "operation_keys": "process"}, {"a1", "a2", "b"}),
        ({"department": "조립", "model": "검수모델A", "operation_keys": "process,defect"}, {"a1", "a2", "defect"}),
        ({"department": "조립", "model": "검수모델A", "operation_keys": "defect"}, {"defect"}),
        ({"department": "조립", "model": "검수모델A", "operation_keys": "warehouse"}, set()),
    ],
)
def test_history_combines_filter_groups_and_preserves_population_across_cursor_pages(
    client: TestClient,
    db_session: Session,
    make_item: Callable[..., Item],
    filters: dict[str, str],
    expected_keys: set[str],
) -> None:
    """A partial filter match must never leak into a list page or its summary."""
    db_session.add_all([
        ProductSymbol(slot=1, symbol="A", model_name="검수모델A"),
        ProductSymbol(slot=2, symbol="B", model_name="검수모델B"),
    ])
    a = make_item(name="검수공용품", model_symbol="A", process_type_code="AR", serial_no=9811)
    b = make_item(name="검수비교품", model_symbol="B", process_type_code="AR", serial_no=9812)
    rows: dict[str, TransactionLog] = {}
    for key, item, department, kind, instant in [
        ("a1", a, "조립", TransactionTypeEnum.PRODUCE, datetime(2026, 10, 5, 15)),
        ("a2", a, "조립", TransactionTypeEnum.PRODUCE, datetime(2026, 10, 6, 14, 59)),
        ("high", a, "고압", TransactionTypeEnum.PRODUCE, datetime(2026, 10, 6, 1)),
        ("b", b, "조립", TransactionTypeEnum.PRODUCE, datetime(2026, 10, 6, 2)),
        ("defect", a, "조립", TransactionTypeEnum.MARK_DEFECTIVE, datetime(2026, 10, 6, 3)),
        ("before", a, "조립", TransactionTypeEnum.PRODUCE, datetime(2026, 10, 5, 14, 59)),
        ("after", a, "조립", TransactionTypeEnum.PRODUCE, datetime(2026, 10, 6, 15)),
    ]:
        row = TransactionLog(item_id=item.item_id, transaction_type=kind, department=department,
                             quantity_change=1, quantity_before=0, quantity_after=1, created_at=instant)
        db_session.add(row)
        rows[key] = row
    db_session.commit()
    expected_ids = {str(rows[key].log_id) for key in expected_keys}
    params = {**filters, "date_from": "2026-10-06", "date_to": "2026-10-06"}
    listed = client.get("/api/inventory/transactions", params=params)
    assert listed.status_code == 200, listed.text
    assert {row["log_id"] for row in listed.json()} == expected_ids
    summary = client.get("/api/inventory/transactions/summary", params=params)
    assert summary.status_code == 200, summary.text
    assert summary.json()["total"] == len(expected_ids)

    paged_ids: list[str] = []
    cursor = None
    for _ in range(len(rows) + 1):
        page_params = {**params, "limit": 1}
        if cursor:
            page_params["cursor"] = cursor
        response = client.get("/api/inventory/transactions/display-groups", params=page_params)
        assert response.status_code == 200, response.text
        page = response.json()
        paged_ids.extend(row["log_id"] for group in page["groups"] for row in group["logs"])
        if not page["has_more"]:
            break
        assert page["next_cursor"] and page["next_cursor"] != cursor
        cursor = page["next_cursor"]
    else:
        pytest.fail("history pagination did not terminate")
    assert len(paged_ids) == len(set(paged_ids))
    assert set(paged_ids) == expected_ids


def test_history_exact_log_lookup_composes_with_existing_filters(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
) -> None:
    """Original-work details retrieve one immutable ID without paging all history."""
    item = make_item(process_type_code="AR")
    other = make_item(process_type_code="AR")
    rows = [TransactionLog(item_id=value.item_id, transaction_type=TransactionTypeEnum.PRODUCE,
                           quantity_change=1, quantity_before=0, quantity_after=1) for value in (item, other)]
    db_session.add_all(rows)
    db_session.commit()
    response = client.get("/api/inventory/transactions", params={"log_id": str(rows[0].log_id)})
    assert response.status_code == 200
    assert [row["log_id"] for row in response.json()] == [str(rows[0].log_id)]
    excluded = client.get("/api/inventory/transactions", params={"log_id": str(rows[0].log_id), "item_id": str(other.item_id)})
    assert excluded.json() == []
    assert client.get("/api/inventory/transactions", params={"log_id": "invalid"}).status_code == 422


@pytest.mark.parametrize(("action", "label", "types"), [
    ("quarantine", "불량 격리", [TransactionTypeEnum.MARK_DEFECTIVE]),
    ("restore", "정상 복귀", [TransactionTypeEnum.UNMARK_DEFECTIVE]),
    ("rework", "불량 재작업", [TransactionTypeEnum.DISASSEMBLE, TransactionTypeEnum.RECEIVE]),
])
def test_defect_original_and_reverse_filter_search_and_group_population(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    action: str, label: str, types: list[TransactionTypeEnum],
) -> None:
    """Visible work labels and defect filters retain parent, children and reversals."""
    item = make_item(process_type_code="AR")
    original = InventoryOperation(kind=InventoryOperationKindEnum.BUSINESS, domain="defect", action=action,
                                  display_label=label, actor_name="history actor", department="조립")
    db_session.add(original)
    db_session.flush()
    reverse = InventoryOperation(kind=InventoryOperationKindEnum.CANCELLATION, domain="defect", action=action,
                                 display_label=f"{label} 취소", actor_name="history actor", department="조립",
                                 reverses_operation_id=original.operation_id)
    db_session.add(reverse)
    db_session.flush()
    ids = []
    reversal_ids = []
    for kind in types:
        reference = f"defect-disassemble:{original.operation_id}" if action == "rework" else None
        row = TransactionLog(item_id=item.item_id, operation_id=original.operation_id, transaction_type=kind,
                             quantity_before=5, quantity_after=4, quantity_change=-1, department="조립", reference_no=reference)
        db_session.add(row)
        db_session.flush()
        inverse = TransactionLog(item_id=item.item_id, operation_id=reverse.operation_id, transaction_type=kind,
                                 quantity_before=4, quantity_after=5, quantity_change=1, department="조립",
                                 reference_no=reference, reverses_log_id=row.log_id)
        db_session.add(inverse)
        db_session.flush()
        ids.extend([str(row.log_id), str(inverse.log_id)])
        reversal_ids.append(str(inverse.log_id))
    db_session.commit()
    filtered = client.get("/api/inventory/transactions", params={"operation_keys": "defect"})
    assert filtered.status_code == 200, filtered.text
    assert {row["log_id"] for row in filtered.json()} == set(ids)
    summary = client.get("/api/inventory/transactions/summary", params={"operation_keys": "defect"})
    assert summary.json()["total"] == 2
    searched = client.get("/api/inventory/transactions", params={"search": label, "operation_keys": "defect"})
    assert {row["log_id"] for row in searched.json()} == set(ids)
    cancelled = client.get("/api/inventory/transactions", params={"search": f"{label} 취소", "operation_keys": "defect"})
    assert {row["log_id"] for row in cancelled.json()} == set(reversal_ids)
    pages = []
    cursor = None
    while True:
        params = {"search": label, "operation_keys": "defect", "limit": 1}
        if cursor:
            params["cursor"] = cursor
        page = client.get("/api/inventory/transactions/display-groups", params=params).json()
        pages.extend(row["log_id"] for group in page["groups"] for row in group["logs"])
        if not page["has_more"]:
            break
        assert page["next_cursor"] and page["next_cursor"] != cursor
        cursor = page["next_cursor"]
    assert set(pages) == set(ids)
    assert len(pages) == len(ids)


@pytest.mark.parametrize("endpoint", ["transaction", "operation"])
def test_requester_cancels_approved_transfer_using_immutable_request_link(
    client: TestClient, db_session: Session, make_item: Callable[..., Item], endpoint: str,
) -> None:
    """The approver executes a request without taking ownership from its requester."""
    actors = []
    for code, role in [("HIST-REQUEST", "none"), ("HIST-APPROVE", "primary"), ("HIST-OTHER", "none")]:
        employee = Employee(employee_code=code, name=code, department="조립", role="조립/staff",
                            warehouse_role=role, department_role="none", is_active=True, pin_hash=DEFAULT_PIN_HASH)
        db_session.add(employee)
        actors.append(employee)
    requester, approver, outsider = actors
    db_session.add(SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2026-01-01T00:00:00"))
    item = make_item(process_type_code="AR", warehouse_qty=10)
    db_session.commit()
    created = client.post("/api/stock-requests", json={"requester_employee_id": str(requester.employee_id),
        "request_type": "warehouse_to_dept", "lines": [{"item_id": str(item.item_id), "quantity": "3",
        "from_bucket": "warehouse", "to_bucket": "production", "to_department": "조립"}]})
    assert created.status_code == 201, created.text
    approved = client.post(f"/api/stock-requests/{created.json()['request_id']}/approve",
                           json={"actor_employee_id": str(approver.employee_id), "pin": "0000"})
    assert approved.status_code == 200, approved.text
    log = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).one()
    assert log.operation_id is not None
    # Mutable display metadata cannot confer ownership on another employee.
    log.produced_by = outsider.name
    log.reference_no = "untrusted-display-only"
    db_session.commit()
    if endpoint == "transaction":
        url = f"/api/inventory/transactions/{log.log_id}/cancel"
        extra = {}
    else:
        url = f"/api/inventory/operations/{log.operation_id}/cancel"
        preview = client.post(f"{url}/preview")
        assert preview.status_code == 200, preview.text
        extra = {"plan_hash": preview.json()["plan_hash"]}
    denied = client.post(url, json={**extra, "employee_code": outsider.employee_code, "pin": "0000", "reason": "attempt"})
    assert denied.status_code == 403, denied.text
    db_session.expire_all()
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 7
    cancelled = client.post(url, json={**extra, "employee_code": requester.employee_code, "pin": "0000", "reason": "withdraw"})
    assert cancelled.status_code == 200, cancelled.text
    db_session.expire_all()
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 10
    assert sum(row.quantity for row in db_session.query(InventoryLocation).filter_by(item_id=item.item_id)) == 0
    assert db_session.query(TransactionLog).filter(TransactionLog.reverses_log_id == log.log_id).count() == 1
