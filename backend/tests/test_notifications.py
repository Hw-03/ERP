"""결재 알림 통합/단위 테스트.

- 요청 도착 → 승인 담당자(들), 요청자 제외
- 승인/반려 → 요청자
- 수신자 계산(창고/부서) 단일 원천(can_approve_department)
- mark-read 는 본인 알림만
"""

from __future__ import annotations

from decimal import Decimal

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Notification,
)
from app.services import notifications as notif_svc
from app.services.pin_auth import DEFAULT_PIN_HASH


def _make_employee(
    db_session,
    *,
    code: str,
    name: str = "직원",
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
    warehouse_role: str = "none",
    department_role: str = "none",
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF,
) -> Employee:
    emp = Employee(
        employee_code=code,
        name=name,
        role=f"{department.value}/staff",
        department=department.value if isinstance(department, DepartmentEnum) else department,
        level=level,
        warehouse_role=warehouse_role,
        department_role=department_role,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _w2d_request(client, requester, item, to_dept: str = "조립") -> dict:
    """창고→부서 입출고 제출 → 창고 결재 대기 StockRequest 생성."""
    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "warehouse_to_dept",
            "to_department": to_dept,
            "targets": [
                {"source_kind": "direct_item", "item_id": str(item.item_id), "quantity": "2"}
            ],
        },
    )
    assert preview.status_code == 200, preview.json()
    res = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "warehouse_to_dept",
            "to_department": to_dept,
            "bundles": preview.json()["bundles"],
        },
    )
    assert res.status_code == 201, res.json()
    return res.json()


def _unread(client, emp) -> int:
    return client.get(
        f"/api/notifications?recipient_employee_id={emp.employee_id}"
    ).json()["unread_count"]


# ---------------------------------------------------------------------------
# 수신자 계산 (단위)
# ---------------------------------------------------------------------------


def test_warehouse_recipients_are_warehouse_roles(db_session):
    wp = _make_employee(db_session, code="WP", warehouse_role="primary")
    wd = _make_employee(db_session, code="WD", warehouse_role="deputy")
    _make_employee(db_session, code="DP", department_role="primary")
    _make_employee(db_session, code="PL")
    db_session.commit()

    codes = {e.employee_code for e in notif_svc.recipients_for_warehouse_approval(db_session)}
    assert codes == {"WP", "WD"}


def test_department_recipients_follow_can_approve_rule(db_session):
    _make_employee(db_session, code="DP", department_role="primary")
    _make_employee(db_session, code="WP", warehouse_role="primary")
    _make_employee(db_session, code="AD", level=EmployeeLevelEnum.ADMIN)
    _make_employee(db_session, code="PL")
    db_session.commit()

    line_codes = {
        e.employee_code for e in notif_svc.recipients_for_department_approval(db_session, "조립")
    }
    assert line_codes == {"DP", "WP", "AD"}  # 일반 직원(PL) 제외

    # 창고 부서 대상이면 부서 정/부는 제외(can_approve_department 룰), 창고 정/부는 포함
    wh_codes = {
        e.employee_code for e in notif_svc.recipients_for_department_approval(db_session, "창고")
    }
    assert "DP" not in wh_codes
    assert "WP" in wh_codes


# ---------------------------------------------------------------------------
# 도착 / 승인 / 반려 (E2E)
# ---------------------------------------------------------------------------


def test_warehouse_request_notifies_approvers_excluding_requester(client, db_session, make_item):
    item = make_item(name="W001", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="REQ1", name="요청자")
    wh_primary = _make_employee(db_session, code="WHP", name="창고정", warehouse_role="primary")
    wh_deputy = _make_employee(db_session, code="WHD", name="창고부", warehouse_role="deputy")
    bystander = _make_employee(db_session, code="BYS", name="무관")
    db_session.commit()

    out = _w2d_request(client, requester, item)
    assert out["stock_request_id"] is not None

    assert _unread(client, wh_primary) == 1
    assert _unread(client, wh_deputy) == 1
    assert _unread(client, requester) == 0   # 요청자 본인 제외
    assert _unread(client, bystander) == 0   # 결재권 없음


def test_approve_notifies_requester(client, db_session, make_item):
    item = make_item(name="W002", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="REQ2", name="요청자2")
    wh_primary = _make_employee(db_session, code="WHP2", name="창고정2", warehouse_role="primary")
    db_session.commit()

    out = _w2d_request(client, requester, item)
    sr_id = out["stock_request_id"]

    approve = client.post(
        f"/api/stock-requests/{sr_id}/approve",
        json={"actor_employee_id": str(wh_primary.employee_id), "pin": "0000"},
    )
    assert approve.status_code == 200, approve.json()
    assert approve.json()["status"] == "completed"

    items = client.get(
        f"/api/notifications?recipient_employee_id={requester.employee_id}"
    ).json()["items"]
    assert any(n["type"] == "approval_approved" for n in items)


def test_reject_notifies_requester(client, db_session, make_item):
    item = make_item(name="W003", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="REQ3", name="요청자3")
    wh_primary = _make_employee(db_session, code="WHP3", name="창고정3", warehouse_role="primary")
    db_session.commit()

    out = _w2d_request(client, requester, item)
    sr_id = out["stock_request_id"]

    reject = client.post(
        f"/api/stock-requests/{sr_id}/reject",
        json={"actor_employee_id": str(wh_primary.employee_id), "pin": "0000", "reason": "재고 확인 필요"},
    )
    assert reject.status_code == 200, reject.json()

    items = client.get(
        f"/api/notifications?recipient_employee_id={requester.employee_id}"
    ).json()["items"]
    assert any(n["type"] == "approval_rejected" for n in items)


# ---------------------------------------------------------------------------
# 읽음 처리 (본인만)
# ---------------------------------------------------------------------------


def test_mark_read_only_affects_owner(client, db_session, make_item):
    item = make_item(name="W004", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="REQ4", name="요청자4")
    wh_primary = _make_employee(db_session, code="WHP4", name="창고정4", warehouse_role="primary")
    wh_deputy = _make_employee(db_session, code="WHD4", name="창고부4", warehouse_role="deputy")
    db_session.commit()

    _w2d_request(client, requester, item)
    assert _unread(client, wh_primary) == 1
    assert _unread(client, wh_deputy) == 1

    res = client.post(
        "/api/notifications/mark-read",
        json={"recipient_employee_id": str(wh_primary.employee_id)},
    )
    assert res.status_code == 200, res.json()
    assert res.json()["unread_count"] == 0

    # 본인만 읽음 — 타인(부)은 그대로
    assert _unread(client, wh_primary) == 0
    assert _unread(client, wh_deputy) == 1


def test_arrived_notification_rolls_back_with_request(client, db_session, make_item):
    """요청 트랜잭션이 실패하면 알림도 함께 롤백(유령 알림 없음)."""
    # 재고 부족으로 제출 실패 시키기 — 알림이 커밋되지 않아야 함
    item = make_item(name="W005", warehouse_qty=Decimal("0"))
    requester = _make_employee(db_session, code="REQ5", name="요청자5")
    wh_primary = _make_employee(db_session, code="WHP5", name="창고정5", warehouse_role="primary")
    db_session.commit()

    preview = client.post(
        "/api/io/preview",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "warehouse_to_dept",
            "to_department": "조립",
            "targets": [
                {"source_kind": "direct_item", "item_id": str(item.item_id), "quantity": "2"}
            ],
        },
    )
    res = client.post(
        "/api/io/submit",
        json={
            "requester_employee_id": str(requester.employee_id),
            "work_type": "warehouse_io",
            "sub_type": "warehouse_to_dept",
            "to_department": "조립",
            "bundles": preview.json()["bundles"],
        },
    )
    assert res.status_code == 422, res.json()  # 재고 부족

    db_session.expire_all()
    assert db_session.query(Notification).count() == 0
