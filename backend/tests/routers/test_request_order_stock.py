"""요청순 잔고는 실제 승인 당시 원본과 별개이며 조회 필터에 영향받지 않는다."""

from datetime import datetime, timedelta

import pytest

from app.models import Employee, Inventory, InventoryLocation, IoBatch, TransactionLog, TransactionTypeEnum


@pytest.fixture
def delayed_adjustment(db_session, make_item):
    item = make_item(name="COCOON 지연 승인 재현", warehouse_qty=0)
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    inventory.quantity = 50
    db_session.add(InventoryLocation(item_id=item.item_id, department="조립", status="PRODUCTION", quantity=50))
    employee = Employee(employee_code="ORDER-STOCK", name="재현 요청자", role="operator", department="조립")
    db_session.add(employee)
    db_session.flush()
    base = datetime(2026, 9, 8, 5, 20)
    logs = []
    for index, (requested, executed, before, after, tx_type) in enumerate([
        (base - timedelta(minutes=2), base - timedelta(minutes=2), 50, 44, TransactionTypeEnum.ADJUST),
        (base + timedelta(seconds=19), base + timedelta(minutes=20), 94, 50, TransactionTypeEnum.ADJUST),
        (base + timedelta(seconds=42), base + timedelta(seconds=43), 44, 94, TransactionTypeEnum.PRODUCE),
    ]):
        batch = IoBatch(
            work_type="process", sub_type="adjust_out" if index != 2 else "produce", status="completed",
            requester_employee_id=employee.employee_id, requester_name=employee.name,
            requester_department="조립", submitted_at=requested, created_at=requested,
        )
        db_session.add(batch)
        db_session.flush()
        log = TransactionLog(
            item_id=item.item_id, transaction_type=tx_type, quantity_change=after - before,
            quantity_before=before, quantity_after=after,
            warehouse_qty_before=0, warehouse_qty_after=0,
            department_qty_before=before, department_qty_after=after,
            inventory_effect=[{"scope": "location", "department": "조립", "status": "PRODUCTION", "delta": after - before}],
            operation_batch_id=batch.batch_id, created_at=executed, department="조립",
        )
        db_session.add(log)
        logs.append(log)
    db_session.commit()
    return item, logs


def _rows(client, **params):
    response = client.get("/api/inventory/transactions/display-groups", params=params)
    assert response.status_code == 200, response.text
    return [row for group in response.json()["groups"] for row in group["logs"]], response.json()


def test_delayed_approval_recalculates_request_order_without_changing_records(client, db_session, delayed_adjustment):
    item, logs = delayed_adjustment
    rows, _ = _rows(client, item_id=str(item.item_id))

    assert [row["log_id"] for row in rows] == [str(logs[i].log_id) for i in (2, 1, 0)]
    assert all(row.get("request_order_stock") for row in rows), "조회용 요청순 잔고가 필요하다"
    assert [(row["request_order_stock"]["department_qty_before"], row["request_order_stock"]["department_qty_after"]) for row in rows] == [(0, 50), (44, 0), (50, 44)]
    assert [(row["department_qty_before"], row["department_qty_after"]) for row in rows] == [(44, 94), (94, 50), (50, 44)]
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().quantity == 50
    assert db_session.get(TransactionLog, logs[1].log_id).quantity_before == 94


def test_request_order_stock_survives_filters_and_page_boundaries(client, delayed_adjustment):
    item, logs = delayed_adjustment
    all_rows, _ = _rows(client, item_id=str(item.item_id))
    expected = {row["log_id"]: row.get("request_order_stock") for row in all_rows}
    assert all(expected.values()), "재고 계산이 페이지나 검색 결과에 한정되면 안 된다"
    for params in (
        {"search": "지연승인"},
        {"date_from": "2026-09-08", "date_to": "2026-09-08"},
        {"transaction_type": "PRODUCE"},
        {"operation_batch_id": str(logs[2].operation_batch_id)},
    ):
        rows, _ = _rows(client, **params)
        assert rows
        assert all(row["request_order_stock"] == expected[row["log_id"]] for row in rows)
    first, page = _rows(client, item_id=str(item.item_id), limit=1)
    second, _ = _rows(client, item_id=str(item.item_id), limit=1, cursor=page["next_cursor"])
    assert first[0]["request_order_stock"] == expected[first[0]["log_id"]]
    assert second[0]["request_order_stock"] == expected[second[0]["log_id"]]


def test_archived_approval_is_hidden_but_still_part_of_current_balance(client, db_session, delayed_adjustment):
    item, logs = delayed_adjustment
    logs[1].archived_at = datetime(2026, 9, 8, 6)
    db_session.commit()
    rows, _ = _rows(client, item_id=str(item.item_id))
    assert str(logs[1].log_id) not in {row["log_id"] for row in rows}
    assert rows[0]["request_order_stock"]["department_qty_after"] == 50
    assert rows[0]["request_order_stock"]["department_qty_before"] == 0


def test_ordinary_transaction_response_keeps_actual_snapshot(client, delayed_adjustment):
    item, logs = delayed_adjustment
    response = client.get("/api/inventory/transactions", params={"item_id": str(item.item_id)})
    assert response.status_code == 200, response.text
    produced = next(row for row in response.json() if row["log_id"] == str(logs[2].log_id))
    assert produced["request_order_stock"] is None
    assert (produced["department_qty_before"], produced["department_qty_after"]) == (44, 94)


def test_read_service_uses_fixed_query_count_for_multiple_items(db_session, make_item):
    from sqlalchemy import event
    from app.routers.inventory._tx_filters import _history_request_date_expr
    from app.services.request_order_stock import load_request_order_stock

    items = [make_item(name=f"묶음 조회 {i}") for i in range(8)]
    db_session.flush()
    connection = db_session.connection()
    statements = []

    def record_sql(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(connection, "before_cursor_execute", record_sql)
    try:
        for ids in ({items[0].item_id}, {item.item_id for item in items}):
            statements.clear()
            assert load_request_order_stock(db_session, ids, request_date_expr=_history_request_date_expr()) == {}
            assert len(statements) == 2
            assert all(statement.lstrip().upper().startswith("SELECT") for statement in statements)
    finally:
        event.remove(connection, "before_cursor_execute", record_sql)


@pytest.mark.parametrize("decision", ["approve", "reject"])
def test_pending_and_rejected_requests_never_enter_projection(db_session, make_item, decision):
    """실제 요청 서비스가 만드는 예약은 원장에 넣지 않고 승인으로 생긴 거래만 읽는다."""
    from decimal import Decimal
    from app.models import DepartmentEnum, StockRequestTypeEnum
    from app.routers.inventory._tx_filters import _history_request_date_expr
    from app.services import sr_approval, stock_requests
    from app.services.pin_auth import DEFAULT_PIN_HASH
    from app.services.request_order_stock import load_request_order_stock
    from app.services.sr_validation import LineInput

    item = make_item(name="결재 상태별 표시", warehouse_qty=10, process_type_code="AR")
    requester = Employee(employee_code="STATE-REQ", name="요청자", role="operator", department=DepartmentEnum.ASSEMBLY)
    approver = Employee(employee_code="STATE-APP", name="승인자", role="operator", department=DepartmentEnum.ASSEMBLY,
                        warehouse_role="primary", pin_hash=DEFAULT_PIN_HASH)
    db_session.add_all([requester, approver])
    db_session.flush()
    request = stock_requests.create_request(
        db_session, requester=requester, request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        lines_input=[LineInput(item_id=item.item_id, quantity=Decimal("3"), from_bucket="warehouse",
                              from_department=None, to_bucket="production", to_department=DepartmentEnum.ASSEMBLY.value)],
        reference_no=None, notes=None,
    )
    db_session.flush()
    expression = _history_request_date_expr()
    assert load_request_order_stock(db_session, {item.item_id}, request_date_expr=expression) == {}
    if decision == "reject":
        sr_approval.reject_request(db_session, request, approver=approver, pin="0000", reason="반려 검증")
    else:
        sr_approval.approve_request(db_session, request, approver=approver, pin="0000")
    db_session.flush()
    projected = load_request_order_stock(db_session, {item.item_id}, request_date_expr=expression)
    if decision == "reject":
        assert projected == {}
        assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().warehouse_qty == 10
    else:
        assert len(projected) == 1
        stock = next(iter(projected.values()))
        assert stock.status == "available"
        assert (stock.warehouse_qty_before, stock.warehouse_qty_after) == (10, 7)
        assert (stock.department_qty_before, stock.department_qty_after) == (0, 3)
