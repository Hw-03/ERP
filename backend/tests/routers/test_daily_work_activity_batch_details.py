"""일보 감사 정보는 보존하고 소비하지 않는 배치 라인 표시 유형은 읽지 않는다."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import datetime
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models import (
    Employee, IoBatch, IoBundle, IoLine, StockRequest, StockRequestStatusEnum,
    StockRequestTypeEnum, TransactionLog, TransactionTypeEnum,
)
from app.routers import daily_work_reports
from app.routers.inventory._tx_filters import _BatchInfo


@pytest.mark.parametrize("reference_request", [False, True])
def test_daily_activity_skips_unused_line_details_with_identical_audit_response(
    client: TestClient,
    db_session: Session,
    make_item: Callable[..., Any],
    monkeypatch: pytest.MonkeyPatch,
    reference_request: bool,
) -> None:
    """기존 상세 조회 전체 응답과 비교해 배치·참조 결재 우선순위도 보존한다."""
    requester, approver = [
        Employee(
            employee_code=f"DWBD-{uuid.uuid4().hex[:8]}", name=name,
            role="작업자", department="조립", display_order=0, is_active=True,
        )
        for name in ("일보 작업자", "일보 승인자")
    ]
    db_session.add_all([requester, approver])
    item = make_item(warehouse_qty=1)
    db_session.flush()
    submitted_at = datetime(2026, 7, 27, 0, 4)
    approved_at = datetime(2026, 7, 27, 0, 5)
    request = StockRequest(
        request_code=f"DWBD-{uuid.uuid4().hex[:8]}",
        requester_employee_id=requester.employee_id, requester_name="참조 요청자",
        requester_department=requester.department,
        request_type=StockRequestTypeEnum.MANUAL_ADJUSTMENT,
        status=StockRequestStatusEnum.COMPLETED, requires_warehouse_approval=True,
        requires_department_approval=False, submitted_at=submitted_at,
        approved_by_employee_id=approver.employee_id, approved_by_name=approver.name,
        approved_at=approved_at,
    )
    db_session.add(request)
    db_session.flush()
    batch = IoBatch(
        work_type="process", sub_type="produce", status="completed",
        requester_employee_id=requester.employee_id, requester_name="배치 요청자",
        requester_department=requester.department, to_department=requester.department,
        stock_request_id=request.request_id, submitted_at=submitted_at,
    )
    db_session.add(batch)
    db_session.flush()
    bundle = IoBundle(
        batch_id=batch.batch_id, source_kind="manual", title_snapshot="수동 생산",
        quantity=1,
    )
    db_session.add(bundle)
    db_session.flush()
    db_session.add(IoLine(
        bundle_id=bundle.bundle_id, item_id=item.item_id, item_name_snapshot=item.item_name,
        direction="in", from_bucket="none", to_bucket="production",
        quantity=1, origin="manual", included=True,
    ))
    log = TransactionLog(
        item_id=item.item_id, transaction_type=TransactionTypeEnum.PRODUCE,
        quantity_change=1, producer_employee_id=requester.employee_id,
        operation_batch_id=batch.batch_id,
        reference_no=request.request_code if reference_request else None,
        notes="일보 감사 메모", created_at=datetime(2026, 7, 27, 0, 6),
    )
    db_session.add(log)
    db_session.commit()
    employee_id, batch_id, log_id = requester.employee_id, batch.batch_id, log.log_id
    approver_name = approver.name
    db_session.expunge_all()
    original_map = daily_work_reports._batch_name_map
    computed_display_types: list[str | None] = []

    def original_details(
        db: Session, batch_ids: set[uuid.UUID], *, include_line_details: bool = True,
    ) -> dict[uuid.UUID, _BatchInfo]:
        """최적화 이후에도 비교 기준은 원래 SQL과 표시 유형 계산을 사용한다."""
        result = original_map(db, batch_ids, include_line_details=True)
        computed_display_types.append(result[batch_id].display_transaction_type)
        return result

    detail_queries: list[str] = []

    def record_detail_query(
        connection: Any, cursor: Any, statement: str, parameters: Any,
        context: Any, executemany: bool,
    ) -> None:
        """실행된 SQL만 세고 결과 행이나 처리 값에는 손대지 않는다."""
        normalized = " ".join(statement.lower().split())
        if "from io_bundles" in normalized and "join io_lines" in normalized:
            detail_queries.append(statement)

    bind = db_session.get_bind()
    event.listen(bind, "after_cursor_execute", record_detail_query)
    try:
        url = f"/api/daily-work-reports/{employee_id}/2026-07-27/activity"
        monkeypatch.setattr(daily_work_reports, "_batch_name_map", original_details)
        baseline = client.get(url)
        assert baseline.status_code == 200, baseline.text
        assert computed_display_types == ["ADJUST"]
        assert len(detail_queries) == 1
        body = baseline.json()
        observed = [entry for group in body["details"] for entry in group["logs"]]
        assert len(observed) == 1
        entry = observed[0]
        assert entry["log_id"] == str(log_id)
        assert entry["requester_name"] == ("참조 요청자" if reference_request else "배치 요청자")
        assert entry["approver_name"] == approver_name
        assert datetime.fromisoformat(entry["requested_at"]).replace(tzinfo=None) == submitted_at
        assert datetime.fromisoformat(entry["approved_at"]).replace(tzinfo=None) == approved_at
        assert entry["history_batch"] == {
            "work_type": "process", "sub_type": "produce", "to_department": "조립",
            "display_transaction_type": None,
        }
        assert body["summary"] == [{
            "operation_key": "process", "operation_label": "공정", "work_count": 1,
            "quantity_by_unit": {"EA": 1},
        }]
        monkeypatch.setattr(daily_work_reports, "_batch_name_map", original_map)
        detail_queries.clear()
        current = client.get(url)
        assert current.status_code == 200, current.text
        assert current.json() == body
        assert detail_queries == [], "일보가 소비하지 않는 배치 라인 표시 유형 SQL"
    finally:
        event.remove(bind, "after_cursor_execute", record_detail_query)
