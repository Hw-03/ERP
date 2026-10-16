from __future__ import annotations

import uuid
import json
from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Employee, IoBatch, TransactionLog, TransactionTypeEnum
from app.routers.daily_work_reports import _operation_for


WORK_DATE = "2026-07-27"


@pytest.mark.parametrize("linked_batch", [False, True])
@pytest.mark.parametrize("approval_role", ["department", "warehouse"])
def test_daily_activity_preserves_same_history_request_approval_and_memo(
    client: TestClient, db_session: Session, make_item: Callable[..., Any],
    linked_batch: bool, approval_role: str,
) -> None:
    """같은 거래의 저장된 결재 정보를 일보에서 잃거나 다른 사람으로 추정하지 않는다."""
    from app.models import StockRequest, StockRequestStatusEnum, StockRequestTypeEnum

    requester = _employee(db_session, name="일보 요청자", department="튜브")
    approver = _employee(db_session, name="일보 실제 승인자", department="튜브")
    item = make_item(process_type_code="TR")
    submitted_at = datetime(2026, 7, 27, 0, 4)
    approved_at = datetime(2026, 7, 27, 0, 5)
    request = StockRequest(
        request_code=f"DAILY-{uuid.uuid4().hex[:8]}", requester_employee_id=requester.employee_id,
        requester_name=requester.name, requester_department=requester.department,
        request_type=StockRequestTypeEnum.MANUAL_ADJUSTMENT, status=StockRequestStatusEnum.COMPLETED,
        requires_warehouse_approval=approval_role == "warehouse", requires_department_approval=approval_role == "department",
        submitted_at=submitted_at, notes="같은 거래 실제 메모",
        **({"department_approved_by_employee_id": approver.employee_id, "department_approved_by_name": approver.name, "department_approved_at": approved_at}
           if approval_role == "department" else {"approved_by_employee_id": approver.employee_id, "approved_by_name": approver.name, "approved_at": approved_at}),
    )
    db_session.add(request)
    db_session.flush()
    batch = None
    if linked_batch:
        batch = IoBatch(work_type="process", sub_type="adjust_in", status="completed",
                        requester_employee_id=requester.employee_id, requester_name=requester.name,
                        requester_department=requester.department, stock_request_id=request.request_id,
                        submitted_at=submitted_at)
        db_session.add(batch)
        db_session.flush()
    log = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.ADJUST,
                         quantity_change=1, department="튜브", producer_employee_id=requester.employee_id,
                         produced_by=approver.name, notes=request.notes, reference_no=request.request_code,
                         operation_batch_id=batch.batch_id if batch else None,
                         created_at=datetime(2026, 7, 27, 0, 6))
    db_session.add(log)
    db_session.commit()
    before = (db_session.query(TransactionLog).count(), db_session.query(StockRequest).count(), request.status)
    history = client.get("/api/inventory/transactions", params={"log_id": str(log.log_id)})
    assert history.status_code == 200, history.text
    original = history.json()[0]
    assert original["approver_name"] == approver.name
    response = client.get(f"/api/daily-work-reports/{requester.employee_id}/{WORK_DATE}/activity")
    assert response.status_code == 200, response.text
    observed = next(entry for group in response.json()["details"] for entry in group["logs"] if entry["log_id"] == str(log.log_id))
    assert observed["approver_name"] == approver.name
    for field in ["log_id", "requester_name", "approver_name", "requested_at", "approved_at", "notes", "inventory_effect", "history_batch"]:
        assert observed[field] == original[field], field
    assert (db_session.query(TransactionLog).count(), db_session.query(StockRequest).count(), request.status) == before


@pytest.mark.parametrize("existing", [False, True])
def test_daily_report_inactive_department_blocks_new_save_but_preserves_history(client, db_session, existing):
    from app.models import ActivityAuditLog, DailyWorkReport, Department

    department = Department(name="일보 사용중지 검수", is_active=True)
    db_session.add(department)
    employee = _employee(db_session, name="부서 일보 검수", department=department.name)
    db_session.commit()
    if existing:
        assert _put(client, employee, "기존 보존 본문").status_code == 200
    before_audits = db_session.query(ActivityAuditLog).filter_by(action_key="daily_work_report.save").count()
    department.is_active = False
    db_session.commit()

    rejected = _put(client, employee, "중지 후 저장 금지")
    assert rejected.status_code == 422, rejected.text
    assert "사용 중지된 부서" in rejected.json()["detail"]["message"]
    db_session.expire_all()
    rows = db_session.query(DailyWorkReport).filter_by(employee_id=employee.employee_id).all()
    assert [row.content for row in rows] == (["기존 보존 본문"] if existing else [])
    assert db_session.query(ActivityAuditLog).filter_by(action_key="daily_work_report.save").count() == before_audits
    for url in [f"/api/daily-work-reports?work_date={WORK_DATE}", f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}", f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}/activity"]:
        assert client.get(url).status_code == 200
    if existing:
        assert client.get(f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}").json()["content"] == "기존 보존 본문"
        removed = client.delete(f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}", params={"actor_employee_id": employee.employee_id})
        assert removed.status_code == 204



@pytest.mark.parametrize("endpoint", ["list", "detail", "activity"])
def test_daily_report_future_read_is_rejected_without_returning_report_data(client, db_session, endpoint):
    employee = _employee(db_session, name="미래 조회 검수")
    db_session.commit()
    url = "/api/daily-work-reports?work_date=2099-01-01" if endpoint == "list" else f"/api/daily-work-reports/{employee.employee_id}/2099-01-01" + ("/activity" if endpoint == "activity" else "")
    response = client.get(url)
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["message"] == "미래 날짜의 일보는 조회할 수 없습니다."


def test_daily_report_keeps_before_after_and_current_actor_for_every_successful_save(client, db_session):
    from app.models import ActivityAuditLog

    employee = _employee(db_session, name="수정 감사 검수")
    db_session.commit()
    report_id = None
    for content in ["첫 내용\n ", "최종 내용", ""]:
        response = _put(client, employee, content)
        assert response.status_code == 200, response.text
        report_id = response.json()["report_id"]
    rows = db_session.query(ActivityAuditLog).filter(ActivityAuditLog.action_key == "daily_work_report.save").order_by(ActivityAuditLog.occurred_at).all()
    assert len(rows) == 3
    transitions = [json.loads(row.target_summary) for row in rows]
    assert [(entry["before"], entry["after"]) for entry in transitions] == [(None, "첫 내용\n "), ("첫 내용\n ", "최종 내용"), ("최종 내용", "")]
    assert all(entry["work_date"] == WORK_DATE for entry in transitions)
    assert all(row.related_id == report_id and row.actor_employee_code == employee.employee_code and row.actor_employee_name == employee.name for row in rows)
    latest = client.get(f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}").json()
    assert latest["content"] == ""
    assert latest["updated_at"]


def test_daily_report_audit_failure_cannot_commit_changed_content(client, db_session, monkeypatch):
    from app.models import DailyWorkReport, ActivityAuditLog
    employee = _employee(db_session, name="감사 원자성 검수")
    db_session.commit()
    assert _put(client, employee, "보존할 내용").status_code == 200
    before_count = db_session.query(ActivityAuditLog).filter(ActivityAuditLog.action_key == "daily_work_report.save").count()

    def fail_record(*args, **kwargs):
        raise RuntimeError("daily audit unavailable")

    monkeypatch.setattr("app.services.activity_audit.record", fail_record)
    with pytest.raises(RuntimeError, match="daily audit unavailable"):
        _put(client, employee, "기록되면 안 되는 수정")
    db_session.rollback()
    assert db_session.query(DailyWorkReport).filter_by(employee_id=employee.employee_id).one().content == "보존할 내용"
    assert db_session.query(ActivityAuditLog).filter(ActivityAuditLog.action_key == "daily_work_report.save").count() == before_count


def test_daily_activity_classifies_warehouse_adjust_as_warehouse():
    log = TransactionLog(transaction_type=TransactionTypeEnum.ADJUST)

    for sub_type in ("warehouse_adjust_in", "warehouse_adjust_out"):
        batch = IoBatch(work_type="warehouse_adjust", sub_type=sub_type)
        assert _operation_for(log, batch) == ("warehouse", "창고")


def test_daily_activity_counts_one_completed_work_for_multiple_logs_and_keeps_units_separate(client, db_session, make_item):
    worker = _employee(db_session, name="묶음 단위 검수")
    ea = make_item(name="묶음 EA")
    box = make_item(name="묶음 BOX")
    box.unit = "BOX"
    batch = IoBatch(work_type="process", sub_type="produce", status="completed", requester_employee_id=worker.employee_id, requester_name=worker.name, requester_department=worker.department)
    db_session.add(batch)
    db_session.flush()
    for item, quantity in [(ea, 2), (box, 3)]:
        db_session.add(TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.PRODUCE, quantity_change=Decimal(quantity), operation_batch_id=batch.batch_id, created_at=datetime(2026, 7, 26, 16, 0)))
    db_session.commit()
    response = client.get(f"/api/daily-work-reports/{worker.employee_id}/{WORK_DATE}/activity")
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body["details"]) == 1
    assert len(body["details"][0]["logs"]) == 2
    assert body["summary"] == [{"operation_key": "process", "operation_label": "공정", "work_count": 1, "quantity_by_unit": {"EA": 2, "BOX": 3}}]


@pytest.mark.parametrize("legacy_cancelled", [False, True])
def test_daily_activity_keeps_reversal_detail_without_counting_it_as_completed_work(client, db_session, make_item, legacy_cancelled):
    from app.models import InventoryOperation, InventoryOperationKindEnum
    worker = _employee(db_session, name="역거래 검수")
    item = make_item(name="취소 입고품")
    business = InventoryOperation(kind=InventoryOperationKindEnum.BUSINESS, domain="WAREHOUSE", action="RECEIVE", display_label="원자재 입고", actor_employee_id=worker.employee_id, actor_name=worker.name, effective_at=datetime(2026, 7, 26, 16, 0))
    db_session.add(business)
    db_session.flush()
    operation = InventoryOperation(kind=InventoryOperationKindEnum.CANCELLATION, domain="WAREHOUSE", action="RECEIVE", display_label="원자재 입고 취소", actor_employee_id=worker.employee_id, actor_name=worker.name, reverses_operation_id=business.operation_id, effective_at=datetime(2026, 7, 26, 17, 0))
    db_session.add(operation)
    db_session.flush()
    original = TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE, quantity_change=Decimal(3), producer_employee_id=worker.employee_id, cancelled=legacy_cancelled, operation_id=business.operation_id, created_at=datetime(2026, 7, 26, 16, 0))
    db_session.add(original)
    db_session.flush()
    db_session.add(TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE, quantity_change=Decimal(-3), producer_employee_id=worker.employee_id, operation_id=operation.operation_id, reverses_log_id=original.log_id, created_at=datetime(2026, 7, 26, 17, 0)))
    db_session.commit()
    response = client.get(f"/api/daily-work-reports/{worker.employee_id}/{WORK_DATE}/activity")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"] == []
    assert body["cancelled_count"] == 1
    assert sum(len(group["logs"]) for group in body["details"]) == 2
    logs = [log for group in body["details"] for log in group["logs"]]
    assert {log["operation_kind"] for log in logs} == {"BUSINESS", "CANCELLATION"}
    assert {log["operation_effective_status"] for log in logs} == {"cancelled", "cancellation"}
    assert next(log for log in logs if log["operation_kind"] == "CANCELLATION")["executor_name"] == worker.name


@pytest.mark.parametrize(
    ("original_at", "cancel_at", "work_date", "expected_count", "expected_log_count"),
    [
        (datetime(2026, 7, 26, 14, 59, 59), datetime(2026, 7, 26, 15), "2026-07-26", 1, 2),
        (datetime(2026, 7, 26, 14, 59, 59), datetime(2026, 7, 26, 15), "2026-07-27", 1, 2),
        (datetime(2026, 7, 26, 14, 59, 59), datetime(2026, 7, 26, 15), "2026-07-28", 0, 0),
        (datetime(2026, 7, 27, 0), datetime(2026, 7, 27, 1), "2026-07-27", 1, 4),
    ],
)
def test_daily_activity_counts_cancellation_once_and_preserves_original_day_status(
    client: TestClient, db_session: Session, make_item: Callable[..., Any],
    original_at: datetime, cancel_at: datetime, work_date: str,
    expected_count: int, expected_log_count: int,
) -> None:
    """원본 날짜의 취소 상태와 취소 발생 날짜를 보존하고 같은 작업은 한 건으로 센다."""
    from app.models import InventoryOperation, InventoryOperationKindEnum

    worker = _employee(db_session, name="취소 날짜 검수")
    business = InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS, domain="inventory_io", action="receive_supplier",
        display_label="원자재 입고", actor_employee_id=worker.employee_id,
        actor_name=worker.name, effective_at=original_at,
    )
    db_session.add(business)
    db_session.flush()
    cancellation = InventoryOperation(
        kind=InventoryOperationKindEnum.CANCELLATION, domain="inventory_io", action="receive_supplier",
        display_label="원자재 입고 취소", actor_employee_id=worker.employee_id,
        actor_name=worker.name, reverses_operation_id=business.operation_id, effective_at=cancel_at,
    )
    db_session.add(cancellation)
    db_session.flush()
    for index in range(2):
        item = make_item(name=f"취소 날짜 검수품 {index}")
        original = TransactionLog(
            item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=2, producer_employee_id=worker.employee_id,
            operation_id=business.operation_id, created_at=original_at,
        )
        db_session.add(original)
        db_session.flush()
        db_session.add(TransactionLog(
            item_id=item.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
            quantity_change=-2, producer_employee_id=worker.employee_id,
            operation_id=cancellation.operation_id, reverses_log_id=original.log_id,
            created_at=cancel_at,
        ))
    db_session.commit()

    response = client.get(f"/api/daily-work-reports/{worker.employee_id}/{work_date}/activity")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"] == []
    assert body["cancelled_count"] == expected_count
    assert sum(len(group["logs"]) for group in body["details"]) == expected_log_count


def test_daily_activity_counts_legacy_cancelled_batch_once(
    client: TestClient, db_session: Session, make_item: Callable[..., Any],
) -> None:
    """역거래가 없는 과거 취소도 품목 행 수가 아닌 저장된 작업 묶음 수로 센다."""
    worker = _employee(db_session, name="과거 취소 묶음")
    batch = IoBatch(
        work_type="warehouse_io", sub_type="warehouse_to_dept", status="completed",
        requester_employee_id=worker.employee_id, requester_name=worker.name,
        requester_department=worker.department,
    )
    db_session.add(batch)
    db_session.flush()
    for index in range(2):
        item = make_item(name=f"과거 취소 묶음 품목 {index}")
        db_session.add(TransactionLog(
            item_id=item.item_id, transaction_type=TransactionTypeEnum.TRANSFER_TO_PROD,
            quantity_change=0, transfer_qty=2, producer_employee_id=worker.employee_id,
            operation_batch_id=batch.batch_id, cancelled=True, created_at=datetime(2026, 7, 27, 1),
        ))
    db_session.commit()

    response = client.get(f"/api/daily-work-reports/{worker.employee_id}/{WORK_DATE}/activity")
    assert response.status_code == 200, response.text
    assert response.json()["summary"] == []
    assert response.json()["cancelled_count"] == 1
    assert len(response.json()["details"]) == 1


def test_daily_activity_detail_preserves_actual_warehouse_adjust_batch_context(client, db_session, make_item):
    employee = _employee(db_session, name="창고 조정 문맥 검수")
    item = make_item()
    batch = IoBatch(work_type="warehouse_adjust", sub_type="warehouse_adjust_in", status="completed", requester_employee_id=employee.employee_id, requester_name=employee.name, requester_department=employee.department)
    db_session.add(batch)
    db_session.flush()
    db_session.add(TransactionLog(item_id=item.item_id, transaction_type=TransactionTypeEnum.ADJUST, quantity_change=2, operation_batch_id=batch.batch_id, producer_employee_id=employee.employee_id, created_at=datetime(2026, 7, 27, 1)))
    db_session.commit()
    response = client.get(f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}/activity")
    assert response.status_code == 200, response.text
    assert response.json()["summary"][0]["operation_key"] == "warehouse"
    context = response.json()["details"][0]["logs"][0]["history_batch"]
    assert context["work_type"] == "warehouse_adjust"
    assert context["sub_type"] == "warehouse_adjust_in"


def _employee(
    db_session,
    *,
    name: str,
    active: bool = True,
    department: str = "조립",
    display_order: int = 0,
) -> Employee:
    employee = Employee(
        employee_code=f"DWR-{uuid.uuid4().hex[:8]}",
        name=name,
        role="작업자",
        department=department,
        display_order=display_order,
        is_active=active,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def _put(client, employee: Employee, content: str, *, actor_id: uuid.UUID | None = None):
    return client.put(
        f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}",
        json={
            "actor_employee_id": str(actor_id or employee.employee_id),
            "content": content,
        },
    )


@pytest.mark.parametrize("content", ["  생산 등록 완료  ", "생산 등록 완료\n\n", " \n "])
def test_daily_work_report_put_preserves_whitespace_and_snapshot_on_update(client, db_session, content):
    employee = _employee(db_session, name="김작성")
    db_session.commit()

    created = _put(client, employee, content)
    assert created.status_code == 200, created.text
    assert created.json()["content"] == content
    loaded = client.get(f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}")
    assert loaded.status_code == 200
    assert loaded.json()["content"] == content
    assert created.json()["employee_name"] == "김작성"
    assert created.json()["department"] == "조립"

    employee.name = "개명후"
    employee.department = "출하"
    db_session.commit()
    updated = _put(client, employee, content + "수정 내용 \n")

    assert updated.status_code == 200, updated.text
    assert updated.json()["report_id"] == created.json()["report_id"]
    assert updated.json()["content"] == content + "수정 내용 \n"
    assert updated.json()["employee_name"] == "김작성"
    assert updated.json()["department"] == "조립"


def test_daily_work_report_get_returns_null_when_not_written_and_list_returns_all_written(client, db_session):
    employee = _employee(db_session, name="작성자")
    other = _employee(db_session, name="다른작성자")
    db_session.commit()

    missing = client.get(f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}")
    assert missing.status_code == 200, missing.text
    assert missing.json() is None

    assert _put(client, employee, "나의 일지").status_code == 200
    assert _put(client, other, "다른 일지").status_code == 200

    listed = client.get("/api/daily-work-reports", params={"work_date": WORK_DATE})
    assert listed.status_code == 200, listed.text
    assert {row["employee_id"] for row in listed.json()} == {str(employee.employee_id), str(other.employee_id)}


def test_daily_work_reports_follow_production_line_and_employee_display_order(client, db_session):
    employees = [
        _employee(db_session, name="조립 늦은", department="조립", display_order=20),
        _employee(db_session, name="출하 첫째", department="출하", display_order=10),
        _employee(db_session, name="튜브 첫째", department="튜브", display_order=10),
        _employee(db_session, name="고압 첫째", department="고압", display_order=10),
        _employee(db_session, name="진공 첫째", department="진공", display_order=10),
        _employee(db_session, name="튜닝 첫째", department="튜닝", display_order=10),
        _employee(db_session, name="조립 앞", department="조립", display_order=10),
        _employee(db_session, name="기타 직원", department="기타", display_order=10),
    ]
    db_session.commit()

    for employee in employees:
        assert _put(client, employee, f"{employee.name} 일보").status_code == 200

    listed = client.get("/api/daily-work-reports", params={"work_date": WORK_DATE})

    assert listed.status_code == 200, listed.text
    assert [row["employee_name"] for row in listed.json()] == [
        "튜브 첫째",
        "고압 첫째",
        "진공 첫째",
        "튜닝 첫째",
        "조립 앞",
        "조립 늦은",
        "출하 첫째",
        "기타 직원",
    ]


def test_daily_work_report_put_rejects_impersonation_inactive_and_oversized_content(client, db_session):
    employee = _employee(db_session, name="본인")
    other = _employee(db_session, name="타인")
    inactive = _employee(db_session, name="비활성", active=False)
    db_session.commit()

    impersonation = _put(client, employee, "권한 없음", actor_id=other.employee_id)
    inactive_response = _put(client, inactive, "비활성 저장")
    blank = _put(client, employee, "   ")
    too_long = _put(client, employee, "x" * 5001)

    assert impersonation.status_code == 403
    assert impersonation.json()["detail"]["message"] == "본인 일보만 작성할 수 있습니다."
    assert inactive_response.status_code == 403
    assert inactive_response.json()["detail"]["message"] == "비활성 직원은 일보를 작성할 수 없습니다."
    assert blank.status_code == 200
    assert blank.json()["content"] == "   "
    assert too_long.status_code == 422
    assert too_long.json()["detail"]["message"] == "일보 내용은 5,000자 이하여야 합니다."
    future = client.put(
        f"/api/daily-work-reports/{employee.employee_id}/2099-01-01",
        json={"actor_employee_id": str(employee.employee_id), "content": "미래"},
    )
    assert future.status_code == 422


def test_daily_work_report_put_clears_existing_report_without_deleting_it(client, db_session):
    employee = _employee(db_session, name="공백 저장")
    db_session.commit()
    assert _put(client, employee, "기존 내용").status_code == 200

    cleared = _put(client, employee, "")

    assert cleared.status_code == 200
    assert cleared.json()["content"] == ""
    detail = client.get(f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}")
    assert detail.json()["content"] == ""
    reports = client.get("/api/daily-work-reports", params={"work_date": WORK_DATE}).json()
    assert [entry["employee_id"] for entry in reports] == [str(employee.employee_id)]


def test_daily_work_report_put_can_restore_blank_after_legacy_delete(client, db_session):
    employee = _employee(db_session, name="빈 일보 복원")
    db_session.commit()
    assert _put(client, employee, "기존 내용").status_code == 200
    deleted = client.delete(
        f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}",
        params={"actor_employee_id": str(employee.employee_id)},
    )
    assert deleted.status_code == 204

    blank = _put(client, employee, "")

    assert blank.status_code == 200
    assert blank.json()["content"] == ""
    assert client.get(f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}").json()["content"] == ""


def test_daily_work_report_delete_removes_own_report_and_rejects_impersonation(client, db_session):
    employee = _employee(db_session, name="삭제작성자")
    other = _employee(db_session, name="다른작업자")
    db_session.commit()
    assert _put(client, employee, "삭제할 내용").status_code == 200

    forbidden = client.delete(
        f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}",
        params={"actor_employee_id": str(other.employee_id)},
    )
    assert forbidden.status_code == 403

    deleted = client.delete(
        f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}",
        params={"actor_employee_id": str(employee.employee_id)},
    )
    assert deleted.status_code == 204
    assert client.get(f"/api/daily-work-reports/{employee.employee_id}/{WORK_DATE}").json() is None
    assert client.get("/api/daily-work-reports", params={"work_date": WORK_DATE}).json() == []


def test_daily_work_report_content_limit_counts_whitespace(client, db_session):
    employee = _employee(db_session, name="공백검증")
    db_session.commit()

    content = f"  {'x' * 4996}  "
    response = _put(client, employee, content)

    assert response.status_code == 200, response.text
    assert response.json()["content"] == content
    assert _put(client, employee, content + " ").status_code == 422


def test_daily_activity_uses_kst_day_id_ownership_and_excludes_archived(client, db_session, make_item):
    worker = _employee(db_session, name="같은이름")
    same_name_other = _employee(db_session, name="같은이름")
    item = make_item(name="일지 활동 품목")
    batch = IoBatch(
        work_type="process",
        sub_type="produce",
        status="completed",
        requester_employee_id=worker.employee_id,
        requester_name=worker.name,
        requester_department=worker.department,
    )
    db_session.add(batch)
    db_session.flush()
    db_session.add_all(
        [
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.PRODUCE,
                quantity_change=Decimal("2"),
                producer_employee_id=worker.employee_id,
                produced_by=worker.name,
                created_at=datetime(2026, 7, 26, 15, 0),  # KST 자정
            ),
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.BACKFLUSH,
                quantity_change=Decimal("-2"),
                operation_batch_id=batch.batch_id,
                producer_employee_id=worker.employee_id,
                created_at=datetime(2026, 7, 27, 14, 59, 59),
            ),
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.PRODUCE,
                quantity_change=Decimal("1"),
                operation_batch_id=batch.batch_id,
                created_at=datetime(2026, 7, 27, 14, 59, 59),
            ),
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=Decimal("9"),
                produced_by=worker.name,
                created_at=datetime(2026, 7, 26, 16, 0),
            ),
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=Decimal("8"),
                producer_employee_id=same_name_other.employee_id,
                created_at=datetime(2026, 7, 26, 16, 0),
            ),
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=Decimal("7"),
                producer_employee_id=worker.employee_id,
                archived_at=datetime(2026, 7, 26, 16, 0),
                created_at=datetime(2026, 7, 26, 16, 0),
            ),
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=Decimal("6"),
                producer_employee_id=worker.employee_id,
                created_at=datetime(2026, 7, 26, 14, 59, 59),
            ),
        ]
    )
    db_session.commit()

    response = client.get(f"/api/daily-work-reports/{worker.employee_id}/{WORK_DATE}/activity")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cancelled_count"] == 0
    assert sum(summary["work_count"] for summary in body["summary"]) == 2
    assert {group["type"] for group in body["details"]} == {"solo", "op_batch"}
    assert sum(len(group["logs"]) for group in body["details"]) == 3


def test_daily_activity_keeps_cancelled_details_but_excludes_them_from_summary(client, db_session, make_item):
    worker = _employee(db_session, name="취소작업자")
    item = make_item(name="취소 활동 품목")
    db_session.add_all(
        [
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=Decimal("3"),
                producer_employee_id=worker.employee_id,
                created_at=datetime(2026, 7, 26, 16, 0),
            ),
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=Decimal("5"),
                producer_employee_id=worker.employee_id,
                cancelled=True,
                created_at=datetime(2026, 7, 26, 17, 0),
            ),
        ]
    )
    db_session.commit()

    response = client.get(f"/api/daily-work-reports/{worker.employee_id}/{WORK_DATE}/activity")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["cancelled_count"] == 1
    assert sum(summary["work_count"] for summary in body["summary"]) == 1
    assert body["summary"][0]["quantity_by_unit"] == {"EA": 3}
    assert sum(len(group["logs"]) for group in body["details"]) == 2


def test_daily_activity_adds_exact_before_after_quantities_to_each_inventory_effect(
    client,
    db_session,
    make_item,
    make_location,
):
    worker = _employee(db_session, name="재고흐름작업자")
    item = make_item(name="재고 흐름 품목", warehouse_qty=Decimal("3"))
    make_location(item.item_id, quantity=Decimal("4"))
    db_session.add(
        TransactionLog(
            item_id=item.item_id,
            transaction_type=TransactionTypeEnum.TRANSFER_TO_PROD,
            quantity_change=Decimal("0"),
            transfer_qty=Decimal("1"),
            producer_employee_id=worker.employee_id,
            inventory_effect=[
                {"scope": "warehouse", "delta": -1},
                {
                    "scope": "location",
                    "department": "조립",
                    "status": "PRODUCTION",
                    "delta": 1,
                },
            ],
            created_at=datetime(2026, 7, 26, 16, 0),
        )
    )
    db_session.commit()

    response = client.get(f"/api/daily-work-reports/{worker.employee_id}/{WORK_DATE}/activity")

    assert response.status_code == 200, response.text
    effects = response.json()["details"][0]["logs"][0]["inventory_effect"]
    assert effects == [
        {
            "scope": "warehouse",
            "delta": -1,
            "quantity_before": 4,
            "quantity_after": 3,
        },
        {
            "scope": "location",
            "department": "조립",
            "status": "PRODUCTION",
            "delta": 1,
            "quantity_before": 3,
            "quantity_after": 4,
        },
    ]


def test_daily_activity_hides_draft_and_submitted_batch_logs(client, db_session, make_item):
    worker = _employee(db_session, name="배치가시성")
    item = make_item(name="배치 가시성 품목")
    batches = [
        IoBatch(
            work_type="process",
            sub_type="produce",
            status=status,
            requester_employee_id=worker.employee_id,
            requester_name=worker.name,
            requester_department=worker.department,
        )
        for status in ("draft", "submitted", "completed")
    ]
    db_session.add_all(batches)
    db_session.flush()
    db_session.add_all(
        [
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.PRODUCE,
                quantity_change=Decimal("1"),
                operation_batch_id=batch.batch_id,
                created_at=datetime(2026, 7, 26, 16, 0),
            )
            for batch in batches
        ]
        + [
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=Decimal("1"),
                producer_employee_id=worker.employee_id,
                created_at=datetime(2026, 7, 26, 16, 0),
            )
        ]
    )
    db_session.commit()

    response = client.get(f"/api/daily-work-reports/{worker.employee_id}/{WORK_DATE}/activity")

    assert response.status_code == 200, response.text
    assert sum(len(group["logs"]) for group in response.json()["details"]) == 2


def test_daily_activity_classifies_legacy_defect_rework_reference_as_defect(client, db_session, make_item):
    worker = _employee(db_session, name="레거시불량")
    item = make_item(name="레거시 불량 재작업 품목")
    db_session.add_all(
        [
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.DISASSEMBLE,
                quantity_change=Decimal("-1"),
                producer_employee_id=worker.employee_id,
                reference_no="defect-disassemble:legacy-rework",
                created_at=datetime(2026, 7, 26, 16, 0),
            ),
            TransactionLog(
                item_id=item.item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=Decimal("1"),
                producer_employee_id=worker.employee_id,
                reference_no="defect-disassemble:legacy-rework",
                created_at=datetime(2026, 7, 26, 17, 0),
            ),
        ]
    )
    db_session.commit()

    response = client.get(f"/api/daily-work-reports/{worker.employee_id}/{WORK_DATE}/activity")

    assert response.status_code == 200, response.text
    assert response.json()["summary"][0]["operation_key"] == "defect"


def test_daily_work_report_first_write_recovers_after_unique_conflict(client, db_session, monkeypatch):
    employee = _employee(db_session, name="동시작성")
    db_session.commit()
    from app.services._tx import commit_and_refresh as real_commit_and_refresh

    first_attempt = True

    def _concurrent_insert_then_conflict(db, report):
        nonlocal first_attempt
        if not first_attempt:
            return real_commit_and_refresh(db, report)
        first_attempt = False
        db.rollback()
        from app.models import DailyWorkReport

        db.add(
            DailyWorkReport(
                work_date=report.work_date,
                employee_id=report.employee_id,
                employee_name=report.employee_name,
                department=report.department,
                content="다른 요청",
            )
        )
        db.commit()
        raise IntegrityError("INSERT", {}, Exception("unique"))

    monkeypatch.setattr(
        "app.routers.daily_work_reports.commit_and_refresh",
        _concurrent_insert_then_conflict,
    )

    response = _put(client, employee, "내 요청")

    assert response.status_code == 200, response.text
    assert response.json()["content"] == "내 요청"
    listed = client.get("/api/daily-work-reports", params={"work_date": WORK_DATE})
    assert len(listed.json()) == 1


def test_employee_with_daily_work_report_is_deactivated_instead_of_deleted(client, db_session):
    employee = _employee(db_session, name="이력보존")
    db_session.commit()
    assert _put(client, employee, "보존 일지").status_code == 200

    deleted = client.delete(
        f"/api/employees/{employee.employee_id}",
        headers={"X-Admin-Pin": "0000"},
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json() == {"result": "deactivated"}
    db_session.refresh(employee)
    assert employee.is_active is False


def test_daily_work_reports_are_in_openapi(client):
    paths = client.app.openapi()["paths"]
    assert "/api/daily-work-reports" in paths
    assert "/api/daily-work-reports/{employee_id}/{work_date}" in paths
    assert "delete" in paths["/api/daily-work-reports/{employee_id}/{work_date}"]
    assert "/api/daily-work-reports/{employee_id}/{work_date}/activity" in paths
