"""내 내역은 이름·승인자가 아닌 작업 등록/요청 직원 ID로 일관되게 조회한다."""
from __future__ import annotations

from datetime import datetime
from typing import Any
import uuid

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.models import Employee, InventoryOperation, InventoryOperationEffect, StockRequest
from tests.routers.test_transaction_display_groups import _add_batch, _add_log


@pytest.mark.parametrize("source", ["legacy", "batch", "request", "request_batch", "workflow_request", "workflow_multi_request", "submission_request", "operation", "cancellation", "missing_id"])
def test_requester_filter_is_identical_across_history_queries(client: TestClient, db_session: Session, make_item: Any, source: str) -> None:
    """요청자 우선순위와 취소 등록자 예외가 모든 조회와 페이지에 동일하게 적용된다."""
    mine = Employee(employee_code="MY-HISTORY", name="동명이인", role="operator", department="조립")
    other = Employee(employee_code="OTHER-HISTORY", name="동명이인", role="operator", department="조립")
    db_session.add_all([mine, other])
    db_session.flush()
    item = make_item(name="requester filter item")
    at = datetime(2026, 7, 15, 3)
    foreign_request = StockRequest(request_code="FOREIGN-REQUEST", requester_employee_id=other.employee_id,
        requester_name=other.name, requester_department="조립", request_type="raw_receive",
        status="completed", approved_by_employee_id=mine.employee_id, approved_by_name=mine.name, submitted_at=at)
    db_session.add(foreign_request)
    db_session.flush()
    foreign = _add_log(db_session, item, created_at=at, reference_no=foreign_request.request_code)
    foreign.producer_employee_id = mine.employee_id
    log = _add_log(db_session, item, created_at=at, reference_no="OWN-REQUEST", produced_by=mine.name)
    log.producer_employee_id = mine.employee_id if source == "legacy" else other.employee_id
    expected = {str(log.log_id)}
    if source in {"request", "request_batch", "workflow_request", "workflow_multi_request", "submission_request", "cancellation"}:
        request = StockRequest(request_code="OWN-REQUEST", requester_employee_id=mine.employee_id if source != "cancellation" else other.employee_id,
            requester_name=mine.name, requester_department="조립", request_type="raw_receive", status="completed",
            approved_by_employee_id=other.employee_id, approved_by_name=other.name, submitted_at=at)
        db_session.add(request)
        db_session.flush()
        if source in {"workflow_request", "workflow_multi_request", "submission_request"}:
            log.reference_no = f"defect-disassemble:{uuid.uuid4()}"
            request.submission_id = log.submission_id = uuid.uuid4()
            if source in {"workflow_request", "workflow_multi_request"}:
                operation = InventoryOperation(kind="BUSINESS", domain="stock_request", action="defect_disassemble",
                    display_label="재작업", actor_employee_id=other.employee_id, actor_name=other.name, effective_at=at)
                db_session.add(operation)
                db_session.flush()
                log.operation_id = operation.operation_id
                # 이 경우는 원장 effect만으로 요청자를 찾는 경로를 별도로 검증한다.
                log.submission_id = None
                db_session.add(InventoryOperationEffect(operation_id=operation.operation_id, effect_kind="WORKFLOW",
                    subject_type="StockRequest", subject_id=str(request.request_id), role="EXECUTION_STATUS",
                    before_state={"status": "submitted"}, after_state={"status": "completed"}))
                if source == "workflow_multi_request":
                    second = StockRequest(request_code="OWN-SECOND", requester_employee_id=mine.employee_id,
                        requester_name=mine.name, requester_department="고압", request_type="internal_use", status="completed", submitted_at=at)
                    db_session.add(second)
                    db_session.flush()
                    db_session.add(InventoryOperationEffect(operation_id=operation.operation_id, effect_kind="WORKFLOW",
                        subject_type="StockRequest", subject_id=str(second.request_id), role="EXECUTION_STATUS",
                        before_state={"status": "submitted"}, after_state={"status": "completed"}))
    if source in {"batch", "request_batch", "cancellation"}:
        batch = _add_batch(db_session, source)
        batch.submitted_at = at
        batch.requester_employee_id = mine.employee_id if source == "batch" else other.employee_id
        if source == "request_batch":
            batch.stock_request_id = request.request_id
            log.reference_no = None
        log.operation_batch_id = batch.batch_id
    if source in {"operation", "cancellation"}:
        operation = InventoryOperation(kind="CANCELLATION" if source == "cancellation" else "BUSINESS",
            domain="inventory_io", action="receive", display_label="등록 작업", actor_employee_id=mine.employee_id,
            actor_name=mine.name, effective_at=at)
        db_session.add(operation)
        db_session.flush()
        log.operation_id = operation.operation_id
        companion = _add_log(db_session, item, created_at=at, reference_no=log.reference_no,
            operation_batch_id=log.operation_batch_id)
        companion.operation_id = operation.operation_id
        companion.producer_employee_id = other.employee_id
        expected.add(str(companion.log_id))
    if source == "missing_id":
        log.producer_employee_id = None
        expected = set()
    db_session.commit()
    params = {"requester_employee_id": str(mine.employee_id), "date_from": "2026-07-15", "date_to": "2026-07-15"}
    page = client.get("/api/inventory/transactions/display-groups", params={**params, "limit": 1})
    assert page.status_code == 200, page.text
    groups = page.json()["groups"]
    assert {row["log_id"] for group in groups for row in group["logs"]} == expected
    assert not page.json()["has_more"]
    summary = client.get("/api/inventory/transactions/summary", params=params)
    assert summary.status_code == 200, summary.text
    assert summary.json()["total"] == len(groups)
    calendar = client.get("/api/inventory/transactions/display-calendar", params={"year": 2026, "month": 7, "requester_employee_id": str(mine.employee_id)})
    assert calendar.status_code == 200, calendar.text
    assert calendar.json()["days"]["2026-07-15"]["total"] == len(groups)
    references = client.get("/api/inventory/transactions/reference-summaries", params=params)
    assert references.status_code == 200, references.text
    assert all(row["reference_no"] != foreign_request.request_code for row in references.json())


def test_requester_pagination_has_no_foreign_records_or_gaps(client: TestClient, db_session: Session, make_item: Any) -> None:
    """직원 필터는 페이지 크기에 앞서 적용되어 모든 본인 작업을 끝까지 읽는다."""
    mine = Employee(employee_code="MY-PAGES", name="페이지", role="operator")
    other = Employee(employee_code="OTHER-PAGES", name="페이지", role="operator")
    db_session.add_all([mine, other])
    db_session.flush()
    item = make_item()
    expected = set()
    for index in range(8):
        log = _add_log(db_session, item, created_at=datetime(2026, 7, 15, 3, index))
        log.producer_employee_id = mine.employee_id if index % 2 == 0 else other.employee_id
        if index % 2 == 0:
            expected.add(str(log.log_id))
    db_session.commit()
    params = {"requester_employee_id": str(mine.employee_id), "limit": 1}
    actual = []
    while True:
        response = client.get("/api/inventory/transactions/display-groups", params=params)
        assert response.status_code == 200, response.text
        page = response.json()
        actual.extend(row["log_id"] for group in page["groups"] for row in group["logs"])
        if not page["has_more"]:
            break
        params["cursor"] = page["next_cursor"]
        assert len(actual) <= 8
    assert set(actual) == expected and len(actual) == len(expected)


def test_requester_calendar_counts_beyond_one_page_at_kst_year_boundary(client: TestClient, db_session: Session, make_item: Any) -> None:
    """달력은 본인의 모든 작업을 KST 날짜로 세고 목록 페이지 제한을 따르지 않는다."""
    mine = Employee(employee_code="MY-CALENDAR", name="달력", role="operator")
    other = Employee(employee_code="OTHER-CALENDAR", name="달력", role="operator")
    db_session.add_all([mine, other])
    db_session.flush()
    item = make_item()
    for index in range(106):
        log = _add_log(db_session, item, created_at=datetime(2025, 12, 31, 15))
        log.producer_employee_id = mine.employee_id if index < 105 else other.employee_id
    db_session.commit()
    params = {"requester_employee_id": str(mine.employee_id)}
    response = client.get("/api/inventory/transactions/display-calendar", params={**params, "year": 2026, "month": 1})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["days"]["2026-01-01"]["total"] == body["months"]["2026-01"] == 105
    assert len(body["months"]) == 12 and len(body["days"]) == 31
    assert client.get("/api/inventory/transactions/display-groups", params={**params, "limit": 2}).json()["has_more"]
    assert client.get("/api/inventory/transactions/summary", params=params).json()["total"] == 105
    assert client.get("/api/inventory/transactions/display-calendar", params={**params, "year": 2025, "month": 12}).json()["months"]["2025-12"] == 0


def test_requester_filter_covers_unchanged_stocktake_work(client: TestClient, db_session: Session, make_item: Any) -> None:
    """거래 로그가 없는 전수조사도 실제 등록 직원에게만 표시한다."""
    from tests.services.test_stocktake_counts import setup_round
    from tests.services.test_stocktake_application import confirm, preview, apply
    env = setup_round(db_session, make_item)
    count = confirm(db_session, env)
    apply(db_session, env, preview(db_session, env, count))
    for employee_id, expected_count in [(env[1].employee_id, 1), (uuid.uuid4(), 0)]:
        params = {"requester_employee_id": str(employee_id)}
        page = client.get("/api/inventory/transactions/display-groups", params=params)
        assert page.status_code == 200, page.text
        assert len(page.json()["groups"]) == expected_count
        assert client.get("/api/inventory/transactions/summary", params=params).json()["total"] == expected_count


@pytest.mark.parametrize("endpoint", ["display-groups", "display-calendar", "summary", "reference-summaries"])
def test_requester_filter_validates_uuid(client: TestClient, endpoint: str) -> None:
    response = client.get(f"/api/inventory/transactions/{endpoint}", params={"requester_employee_id": "invalid", "year": 2026, "month": 7})
    assert response.status_code == 422


def test_cancellation_without_actor_is_not_attributed_to_original_author(client: TestClient, db_session: Session, make_item: Any) -> None:
    """취소 등록 ID가 없으면 원 거래 작성자 이름·ID로 취소를 추정하지 않는다."""
    actor = Employee(employee_code="CANCEL-UNKNOWN", name="취소 원작성자", role="operator")
    db_session.add(actor)
    db_session.flush()
    item = make_item()
    operation = InventoryOperation(kind="CANCELLATION", domain="inventory_io", action="receive",
        display_label="입고 취소", actor_name=actor.name, effective_at=datetime(2026, 7, 15, 3))
    db_session.add(operation)
    db_session.flush()
    log = _add_log(db_session, item, created_at=datetime(2026, 7, 15, 3))
    log.operation_id = operation.operation_id
    log.producer_employee_id = actor.employee_id
    db_session.commit()
    params = {"requester_employee_id": str(actor.employee_id)}
    assert client.get("/api/inventory/transactions/display-groups", params=params).json()["groups"] == []
    assert client.get("/api/inventory/transactions/summary", params=params).json()["total"] == 0


def test_requester_filter_cannot_be_combined_with_item_operation_only_mode(client: TestClient, make_item: Any) -> None:
    """품목 최근 이력의 필터 미지원 모드로 조회 조건을 우회할 수 없다."""
    item = make_item()
    response = client.get("/api/inventory/transactions/display-groups", params={"item_id": str(item.item_id),
        "include_operation_only": True, "requester_employee_id": str(uuid.uuid4())})
    assert response.status_code == 400
