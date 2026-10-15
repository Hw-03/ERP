"""일보의 거래 수가 늘어도 사용하지 않는 품목·요청 본문을 반복 전송하지 않는다."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models import Employee, IoBatch, TransactionLog, TransactionTypeEnum


@pytest.mark.parametrize("linked_batch", [False, True])
@pytest.mark.parametrize("historical_identity", [False, True])
def test_activity_reads_only_used_joined_fields_without_losing_logs(
    client: TestClient,
    db_session: Session,
    make_item: Callable[..., Any],
    linked_batch: bool,
    historical_identity: bool,
) -> None:
    """NULL/연결 요청과 과거/현재 품목 표시를 보존하면서 중복 읽기 폭을 제한한다."""
    worker = Employee(
        employee_code=f"DWP-{uuid.uuid4().hex[:8]}", name="일보 성능 검수",
        role="작업자", department="조립", display_order=0, is_active=True,
    )
    db_session.add(worker)
    item = make_item(name="현재 품목", warehouse_qty=16)
    item.purchase_memo = "읽지 않는 구매 메모" * 60
    item.supplier = "읽지 않는 공급처"
    db_session.flush()
    batch = None
    if linked_batch:
        batch = IoBatch(
            work_type="process", sub_type="adjust_in", status="completed",
            requester_employee_id=worker.employee_id, requester_name=worker.name,
            requester_department=worker.department, to_department=worker.department,
            notes="읽지 않는 요청 메모" * 1000,
            client_request_id=f"daily-perf-{uuid.uuid4()}",
        )
        db_session.add(batch)
        db_session.flush()
    logs = [
        TransactionLog(
            item_id=item.item_id, transaction_type=TransactionTypeEnum.ADJUST,
            quantity_change=1, quantity_before=index, quantity_after=index + 1,
            producer_employee_id=worker.employee_id,
            operation_batch_id=batch.batch_id if batch else None,
            created_at=datetime(2026, 7, 27, 0) + timedelta(minutes=index),
            item_snapshot={
                "item_name": "거래 당시 품목", "mes_code": "OLD-001",
                "process_type_code": "TR", "unit": "BOX",
            } if historical_identity else None,
        )
        for index in range(16)
    ]
    db_session.add_all(logs)
    db_session.flush()
    if not historical_identity:
        # 신규 거래의 자동 스냅샷 생성 이후 NULL로 바꿔 실제 구자료도 확인한다.
        for log in logs:
            log.item_snapshot = None
    db_session.commit()
    expected_ids = {str(log.log_id) for log in logs}
    employee_id, current_code = worker.employee_id, item.mes_code
    db_session.expunge_all()
    joined_columns: list[set[str]] = []

    def record_joined_columns(
        connection: Any, cursor: Any, statement: str, parameters: Any,
        context: Any, executemany: bool,
    ) -> None:
        """실행 시간 대신 DB가 실제로 반환한 주 JOIN의 열을 검사한다."""
        if "FROM transaction_logs JOIN items" in statement:
            joined_columns.append({column[0] for column in cursor.description})

    bind = db_session.get_bind()
    event.listen(bind, "after_cursor_execute", record_joined_columns)
    try:
        response = client.get(f"/api/daily-work-reports/{employee_id}/2026-07-27/activity")
    finally:
        event.remove(bind, "after_cursor_execute", record_joined_columns)
    assert response.status_code == 200, response.text
    body = response.json()
    observed = [log for group in body["details"] for log in group["logs"]]
    assert {log["log_id"] for log in observed} == expected_ids
    assert len(observed) == 16
    expected_unit = "BOX" if historical_identity else "EA"
    assert all(log["item_name"] == ("거래 당시 품목" if historical_identity else "현재 품목") for log in observed)
    assert all(log["mes_code"] == ("OLD-001" if historical_identity else current_code) for log in observed)
    assert all(log["item_unit"] == expected_unit for log in observed)
    assert all(log["history_batch"] == ({"work_type": "process", "sub_type": "adjust_in", "to_department": "조립", "display_transaction_type": None} if linked_batch else None) for log in observed)
    assert all(log["requester_name"] == ("일보 성능 검수" if linked_batch else None) for log in observed)
    assert sum(entry["quantity_by_unit"][expected_unit] for entry in body["summary"]) == 16
    assert len(joined_columns) == 1
    assert not joined_columns[0] & {
        "items_purchase_memo", "items_supplier", "io_batches_notes", "io_batches_client_request_id",
    }
