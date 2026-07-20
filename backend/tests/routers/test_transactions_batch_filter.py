from decimal import Decimal

from app.models import Employee, IoBatch, TransactionLog, TransactionTypeEnum


def _make_batch(db_session, suffix: str) -> IoBatch:
    employee = Employee(
        employee_code=f"BATCH-FILTER-{suffix}",
        name=f"Batch filter {suffix}",
        role="operator",
        department="assembly",
    )
    db_session.add(employee)
    db_session.flush()
    batch = IoBatch(
        work_type="process",
        sub_type="produce",
        status="completed",
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department,
    )
    db_session.add(batch)
    db_session.flush()
    return batch


def _make_log(db_session, item, batch: IoBatch, quantity: str) -> TransactionLog:
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.PRODUCE,
        quantity_change=Decimal(quantity),
        quantity_before=Decimal("0"),
        quantity_after=Decimal(quantity),
        operation_batch_id=batch.batch_id,
    )
    db_session.add(log)
    db_session.flush()
    return log


def test_list_transactions_filters_exact_operation_batch_id(client, db_session, make_item):
    item = make_item(name="batch-filter-item", warehouse_qty=Decimal("0"))
    target_batch = _make_batch(db_session, "target")
    other_batch = _make_batch(db_session, "other")
    target_logs = [
        _make_log(db_session, item, target_batch, "1"),
        _make_log(db_session, item, target_batch, "2"),
    ]
    _make_log(db_session, item, other_batch, "3")
    db_session.commit()

    response = client.get(
        "/api/inventory/transactions",
        params={"operation_batch_id": str(target_batch.batch_id), "limit": 2000},
    )

    assert response.status_code == 200, response.text
    assert {row["log_id"] for row in response.json()} == {
        str(log.log_id) for log in target_logs
    }


def test_history_endpoints_only_include_completed_batches_and_legacy_logs(
    client, db_session, make_item
):
    """이력 조회는 완료 배치와 배치 없는 기존 로그만 감사 이력으로 취급한다."""
    item = make_item(name="history-visibility-item", warehouse_qty=Decimal("0"))
    visible_batch = _make_batch(db_session, "visible")
    visible_log = _make_log(db_session, item, visible_batch, "1")
    legacy_log = TransactionLog(
        item_id=item.item_id,
        transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=Decimal("1"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("1"),
        reference_no="LEGACY-REFERENCE",
    )
    db_session.add(legacy_log)

    hidden_logs = []
    for status in ("submitted", "reserved", "draft", "rejected", "cancelled", "failed"):
        batch = _make_batch(db_session, status)
        batch.status = status
        hidden_logs.append(_make_log(db_session, item, batch, "1"))
    db_session.commit()

    visible_ids = {str(visible_log.log_id), str(legacy_log.log_id)}
    for endpoint in ("/transactions", "/transactions/display-groups"):
        response = client.get(f"/api/inventory{endpoint}")
        assert response.status_code == 200, response.text
        if endpoint == "/transactions":
            returned_ids = {row["log_id"] for row in response.json()}
        else:
            returned_ids = {
                row["log_id"]
                for group in response.json()["groups"]
                for row in group["logs"]
            }
        assert returned_ids == visible_ids

    summary = client.get("/api/inventory/transactions/summary")
    assert summary.status_code == 200, summary.text
    assert summary.json()["total"] == 2

    references = client.get("/api/inventory/transactions/reference-summaries")
    assert references.status_code == 200, references.text
    assert references.json() == [
        {
            "reference_no": "LEGACY-REFERENCE",
            "shipping_phase": None,
            "log_count": 1,
            "item_count": 1,
            "total_quantity": 1,
            "unit": "EA",
        }
    ]
