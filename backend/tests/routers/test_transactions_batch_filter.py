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
