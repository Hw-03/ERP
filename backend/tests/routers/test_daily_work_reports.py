from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy.exc import IntegrityError

from app.models import Employee, IoBatch, TransactionLog, TransactionTypeEnum


WORK_DATE = "2026-07-27"


def _employee(db_session, *, name: str, active: bool = True) -> Employee:
    employee = Employee(
        employee_code=f"DWR-{uuid.uuid4().hex[:8]}",
        name=name,
        role="작업자",
        department="조립",
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


def test_daily_work_report_put_creates_trimmed_snapshot_and_retains_it_on_update(client, db_session):
    employee = _employee(db_session, name="김작성")
    db_session.commit()

    created = _put(client, employee, "  생산 등록 완료  ")
    assert created.status_code == 200, created.text
    assert created.json()["content"] == "생산 등록 완료"
    assert created.json()["employee_name"] == "김작성"
    assert created.json()["department"] == "조립"

    employee.name = "개명후"
    employee.department = "출하"
    db_session.commit()
    updated = _put(client, employee, "수정 내용")

    assert updated.status_code == 200, updated.text
    assert updated.json()["report_id"] == created.json()["report_id"]
    assert updated.json()["content"] == "수정 내용"
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


def test_daily_work_report_put_rejects_impersonation_inactive_and_invalid_content(client, db_session):
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
    assert blank.status_code == 422
    assert blank.json()["detail"]["message"] == "일보 내용을 입력해 주세요."
    assert too_long.status_code == 422
    assert too_long.json()["detail"]["message"] == "일보 내용은 5,000자 이하여야 합니다."
    future = client.put(
        f"/api/daily-work-reports/{employee.employee_id}/2099-01-01",
        json={"actor_employee_id": str(employee.employee_id), "content": "미래"},
    )
    assert future.status_code == 422


def test_daily_work_report_content_limit_applies_after_trimming(client, db_session):
    employee = _employee(db_session, name="공백검증")
    db_session.commit()

    response = _put(client, employee, f"  {'x' * 5000}  ")

    assert response.status_code == 200, response.text
    assert response.json()["content"] == "x" * 5000


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
    assert "/api/daily-work-reports/{employee_id}/{work_date}/activity" in paths
