"""services/sr_approval.py 회귀 그물 단위 테스트.

검증 초점:
  - approve_request          : RESERVED→COMPLETED + pending 해제 + 실재고 이동
  - approve_request_department: 듀얼(창고+부서) 결재 실행 분기
  - reject_request           : pending 원복 + REJECTED
  - reject_request_department : pending 원복 + REJECTED
  - 권한(warehouse_role / can_approve_department) + PIN
  - 이미 처리된 요청 재처리 방지 (멱등 / ValueError)
  - 재고 불변식 (warehouse_qty / pending / production location)

서비스 코드는 수정하지 않는다. 현재 동작을 고정하는 회귀 테스트만 작성한다.
StockRequest 구성은 실제 생성 경로(create_request)를 그대로 사용해 현실성을 보장한다.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.services import sr_approval as svc
from app.services import stock_requests as sr_svc
from app.services.sr_validation import LineInput
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin

D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY


# ──────────────────────────── helpers ────────────────────────────


def _make_employee(
    db_session,
    *,
    code: str,
    name: str = "직원",
    department: DepartmentEnum = ASSEMBLY,
    warehouse_role: str = "none",
    department_role: str = "none",
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF,
    pin: str = "0000",
) -> Employee:
    emp = Employee(
        employee_code=code,
        name=name,
        role=f"{department.value}/사원",
        department=department,
        level=level,
        warehouse_role=warehouse_role,
        department_role=department_role,
        display_order=0,
        is_active="true",
        pin_hash=hash_pin(pin) if pin != "0000" else DEFAULT_PIN_HASH,
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _wh_to_dept_line(item_id, qty: Decimal = D("3"), dept: DepartmentEnum = ASSEMBLY) -> LineInput:
    from app.models import RequestBucketEnum

    return LineInput(
        item_id=item_id,
        quantity=qty,
        from_bucket=RequestBucketEnum.WAREHOUSE,
        from_department=None,
        to_bucket=RequestBucketEnum.PRODUCTION,
        to_department=dept.value,
    )


def _make_reserved_request(db_session, requester, item, *, qty: Decimal = D("3")):
    """non-warehouse 요청자의 warehouse_to_dept 요청 → RESERVED + pending 점유."""
    req = sr_svc.create_request(
        db_session,
        requester=requester,
        request_type=StockRequestTypeEnum.WAREHOUSE_TO_DEPT,
        lines_input=[_wh_to_dept_line(item.item_id, qty)],
        reference_no=None,
        notes=None,
    )
    db_session.flush()
    return req


def _inv(db_session, item_id) -> Inventory:
    return db_session.query(Inventory).filter(Inventory.item_id == item_id).first()


def _prod_qty(db_session, item_id, dept: DepartmentEnum = ASSEMBLY) -> Decimal:
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


# ════════════════════════ approve_request ════════════════════════


def test_approve_transitions_reserved_to_completed_and_moves_stock(
    db_session, make_item
):
    """승인: RESERVED→COMPLETED + pending 해제 + 창고 차감 + 부서 생산 입고."""
    item = make_item(name="A001", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="RQ1", name="요청자")
    approver = _make_employee(db_session, code="WH1", name="창고정", warehouse_role="primary")
    req = _make_reserved_request(db_session, requester, item, qty=D("3"))

    # 선행 상태: RESERVED + pending 3 + 창고 10 불변.
    assert req.status == StockRequestStatusEnum.RESERVED
    assert _inv(db_session, item.item_id).pending_quantity == D("3")
    assert _inv(db_session, item.item_id).warehouse_qty == D("10")

    out = svc.approve_request(db_session, req, approver=approver, pin="0000")
    db_session.flush()

    assert out.status == StockRequestStatusEnum.COMPLETED
    assert out.approved_by_name == "창고정"
    assert out.completed_at is not None
    assert all(l.status == StockRequestStatusEnum.COMPLETED for l in out.lines)

    inv = _inv(db_session, item.item_id)
    assert inv.warehouse_qty == D("7")        # 10 - 3
    assert inv.pending_quantity == D("0")     # 점유 해제
    assert _prod_qty(db_session, item.item_id) == D("3")  # 부서 생산 입고


def test_approve_completed_request_is_idempotent(db_session, make_item):
    """이미 COMPLETED 인 요청 재승인 → 멱등 반환, 재고 이중 처리 없음."""
    item = make_item(name="A002", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="RQ2")
    approver = _make_employee(db_session, code="WH2", warehouse_role="primary")
    req = _make_reserved_request(db_session, requester, item, qty=D("4"))

    svc.approve_request(db_session, req, approver=approver, pin="0000")
    db_session.flush()
    wh_after_first = _inv(db_session, item.item_id).warehouse_qty

    out = svc.approve_request(db_session, req, approver=approver, pin="0000")
    db_session.flush()

    assert out.status == StockRequestStatusEnum.COMPLETED
    assert _inv(db_session, item.item_id).warehouse_qty == wh_after_first  # 재차감 없음


def test_approve_rejects_non_warehouse_role(db_session, make_item):
    """warehouse_role=none 직원 승인 시도 → PermissionError, 상태/재고 불변."""
    item = make_item(name="A003", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="RQ3")
    intruder = _make_employee(db_session, code="X1", warehouse_role="none")
    req = _make_reserved_request(db_session, requester, item, qty=D("2"))

    with pytest.raises(PermissionError):
        svc.approve_request(db_session, req, approver=intruder, pin="0000")

    assert req.status == StockRequestStatusEnum.RESERVED
    assert _inv(db_session, item.item_id).pending_quantity == D("2")
    assert _inv(db_session, item.item_id).warehouse_qty == D("10")


def test_approve_rejects_wrong_pin(db_session, make_item):
    """PIN 불일치 → PermissionError, 상태/재고 불변."""
    item = make_item(name="A004", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="RQ4")
    approver = _make_employee(db_session, code="WH4", warehouse_role="deputy", pin="1234")
    req = _make_reserved_request(db_session, requester, item, qty=D("2"))

    with pytest.raises(PermissionError):
        svc.approve_request(db_session, req, approver=approver, pin="9999")

    assert req.status == StockRequestStatusEnum.RESERVED
    assert _inv(db_session, item.item_id).pending_quantity == D("2")


# ════════════════════════ reject_request ════════════════════════


def test_reject_releases_pending_and_marks_rejected(db_session, make_item):
    """반려: pending 원복 + 창고 불변 + status/lines=REJECTED + 사유 저장."""
    item = make_item(name="R001", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="RQ5")
    approver = _make_employee(db_session, code="WH5", warehouse_role="primary")
    req = _make_reserved_request(db_session, requester, item, qty=D("4"))

    out = svc.reject_request(
        db_session, req, approver=approver, pin="0000", reason="수량 오기재"
    )
    db_session.flush()

    assert out.status == StockRequestStatusEnum.REJECTED
    assert out.rejected_reason == "수량 오기재"
    assert out.rejected_by_name == approver.name
    assert all(l.status == StockRequestStatusEnum.REJECTED for l in out.lines)

    inv = _inv(db_session, item.item_id)
    assert inv.pending_quantity == D("0")   # 점유 원복
    assert inv.warehouse_qty == D("10")     # 실재고 불변
    # 반려는 생산 이동을 하지 않는다.
    assert _prod_qty(db_session, item.item_id) == D("0")


def test_reject_requires_reason(db_session, make_item):
    """빈 반려 사유 → ValueError, 상태/재고 불변."""
    item = make_item(name="R002", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="RQ6")
    approver = _make_employee(db_session, code="WH6", warehouse_role="primary")
    req = _make_reserved_request(db_session, requester, item, qty=D("2"))

    with pytest.raises(ValueError):
        svc.reject_request(db_session, req, approver=approver, pin="0000", reason="   ")

    assert req.status == StockRequestStatusEnum.RESERVED
    assert _inv(db_session, item.item_id).pending_quantity == D("2")


def test_reject_rejects_non_warehouse_role(db_session, make_item):
    """warehouse_role=none 직원 반려 시도 → PermissionError."""
    item = make_item(name="R003", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="RQ7")
    intruder = _make_employee(db_session, code="X2", warehouse_role="none")
    req = _make_reserved_request(db_session, requester, item, qty=D("2"))

    with pytest.raises(PermissionError):
        svc.reject_request(
            db_session, req, approver=intruder, pin="0000", reason="안됨"
        )

    assert req.status == StockRequestStatusEnum.RESERVED
    assert _inv(db_session, item.item_id).pending_quantity == D("2")


def test_completed_request_cannot_be_rejected(db_session, make_item):
    """완료된 요청 반려 시도 → ValueError (재처리 방지)."""
    item = make_item(name="R004", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="RQ8")
    approver = _make_employee(db_session, code="WH8", warehouse_role="primary")
    req = _make_reserved_request(db_session, requester, item, qty=D("3"))

    svc.approve_request(db_session, req, approver=approver, pin="0000")
    db_session.flush()
    assert req.status == StockRequestStatusEnum.COMPLETED

    with pytest.raises(ValueError):
        svc.reject_request(
            db_session, req, approver=approver, pin="0000", reason="너무 늦음"
        )
    # 승인 결과 불변.
    assert req.status == StockRequestStatusEnum.COMPLETED
    assert _inv(db_session, item.item_id).warehouse_qty == D("7")


# ════════════ 듀얼(창고+부서) 결재 — approve_request_department ════════════


def _make_dual_reserved_request(db_session, requester, item, *, qty: Decimal = D("3")):
    """창고+부서 양쪽 결재가 모두 필요한 RESERVED 요청 (과거 데이터 시뮬레이션)."""
    req = _make_reserved_request(db_session, requester, item, qty=qty)
    req.requires_department_approval = True
    db_session.flush()
    return req


def test_warehouse_approve_holds_when_department_pending(db_session, make_item):
    """듀얼 결재: 창고 승인만 들어와도 부서 결재 전이면 RESERVED 유지 + pending 미해제."""
    item = make_item(name="DUAL1", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="DRQ1")
    wh = _make_employee(db_session, code="DWH1", warehouse_role="primary")
    req = _make_dual_reserved_request(db_session, requester, item, qty=D("3"))

    out = svc.approve_request(db_session, req, approver=wh, pin="0000")
    db_session.flush()

    # 부서 결재가 아직이므로 status 유지, 실재고 미이동.
    assert out.status == StockRequestStatusEnum.RESERVED
    assert out.approved_by_name == wh.name  # 창고 결재 기록은 남음
    assert _inv(db_session, item.item_id).pending_quantity == D("3")
    assert _inv(db_session, item.item_id).warehouse_qty == D("10")
    assert _prod_qty(db_session, item.item_id) == D("0")


def test_department_approve_completes_after_warehouse(db_session, make_item):
    """듀얼 결재: 창고→부서 순서로 모두 충족되면 COMPLETED + 실재고 이동."""
    item = make_item(name="DUAL2", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="DRQ2")
    wh = _make_employee(db_session, code="DWH2", warehouse_role="primary")
    dept = _make_employee(db_session, code="DDP2", department_role="primary")
    req = _make_dual_reserved_request(db_session, requester, item, qty=D("3"))

    # 1) 창고 승인 — 아직 RESERVED.
    svc.approve_request(db_session, req, approver=wh, pin="0000")
    db_session.flush()
    assert req.status == StockRequestStatusEnum.RESERVED

    # 2) 부서 승인 — 양쪽 충족 → 실행 + COMPLETED.
    out = svc.approve_request_department(db_session, req, approver=dept, pin="0000")
    db_session.flush()

    assert out.status == StockRequestStatusEnum.COMPLETED
    assert out.department_approved_by_name == dept.name
    inv = _inv(db_session, item.item_id)
    assert inv.warehouse_qty == D("7")
    assert inv.pending_quantity == D("0")
    assert _prod_qty(db_session, item.item_id) == D("3")


def test_department_approve_rejects_unauthorized(db_session, make_item):
    """부서 결재 권한 없는 직원(role 전무) → PermissionError."""
    item = make_item(name="DUAL3", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="DRQ3")
    nobody = _make_employee(
        db_session, code="DNO3", warehouse_role="none", department_role="none"
    )
    req = _make_dual_reserved_request(db_session, requester, item, qty=D("2"))

    with pytest.raises(PermissionError):
        svc.approve_request_department(db_session, req, approver=nobody, pin="0000")

    assert req.status == StockRequestStatusEnum.RESERVED
    assert req.department_approved_by_employee_id is None


def test_department_approve_twice_rejected(db_session, make_item):
    """이미 부서 결재된 요청 재승인 → ValueError (재처리 방지)."""
    item = make_item(name="DUAL4", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="DRQ4")
    dept = _make_employee(db_session, code="DDP4", department_role="primary")
    req = _make_dual_reserved_request(db_session, requester, item, qty=D("2"))

    # 창고 결재는 아직 — 부서 결재만 먼저 마킹 (status 유지).
    svc.approve_request_department(db_session, req, approver=dept, pin="0000")
    db_session.flush()
    assert req.department_approved_by_employee_id is not None
    assert req.status == StockRequestStatusEnum.RESERVED  # 창고 결재 대기

    with pytest.raises(ValueError):
        svc.approve_request_department(db_session, req, approver=dept, pin="0000")


# ════════════ 부서 결재 반려 — reject_request_department ════════════


def test_department_reject_releases_pending(db_session, make_item):
    """부서 결재 반려: pending 원복 + REJECTED + 사유 저장."""
    item = make_item(name="DREJ1", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="DJ1")
    dept = _make_employee(db_session, code="DDJ1", department_role="primary")
    req = _make_dual_reserved_request(db_session, requester, item, qty=D("4"))

    out = svc.reject_request_department(
        db_session, req, approver=dept, pin="0000", reason="부서 반려"
    )
    db_session.flush()

    assert out.status == StockRequestStatusEnum.REJECTED
    assert out.rejected_reason == "부서 반려"
    assert out.rejected_by_name == dept.name
    inv = _inv(db_session, item.item_id)
    assert inv.pending_quantity == D("0")
    assert inv.warehouse_qty == D("10")


def test_department_reject_rejects_unauthorized(db_session, make_item):
    """부서 결재 권한 없는 직원 반려 시도 → PermissionError, pending 불변."""
    item = make_item(name="DREJ2", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="DJ2")
    nobody = _make_employee(
        db_session, code="DNO2", warehouse_role="none", department_role="none"
    )
    req = _make_dual_reserved_request(db_session, requester, item, qty=D("3"))

    with pytest.raises(PermissionError):
        svc.reject_request_department(
            db_session, req, approver=nobody, pin="0000", reason="권한없음"
        )

    assert req.status == StockRequestStatusEnum.RESERVED
    assert _inv(db_session, item.item_id).pending_quantity == D("3")


# ════════════ cancel_open_stock_requests ════════════


def test_cancel_open_requests_pending_zero_safe(db_session, make_item):
    """고아 요청(pending=0) CANCELLED → 재고 음수 없음."""
    item = make_item(name="COQ1", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="COQ1")
    req = _make_reserved_request(db_session, requester, item, qty=D("5"))
    db_session.flush()

    assert req.status == StockRequestStatusEnum.RESERVED
    assert _inv(db_session, item.item_id).pending_quantity == D("5")

    # 고아 시뮬레이션: pending을 강제로 0으로 초기화
    _inv(db_session, item.item_id).pending_quantity = D("0")
    db_session.flush()

    count = svc.cancel_open_stock_requests(db_session, reason="테스트 정리")
    db_session.flush()

    assert count >= 1
    assert req.status == StockRequestStatusEnum.CANCELLED
    assert req.cancelled_at is not None
    assert all(l.status == StockRequestStatusEnum.CANCELLED for l in req.lines)
    # pending이 이미 0이었으므로 음수가 되면 안 됨.
    assert _inv(db_session, item.item_id).pending_quantity >= D("0")


def test_cancel_open_requests_normal_pending_released(db_session, make_item):
    """정상 요청(pending>0)도 취소 시 pending 회수된다."""
    item = make_item(name="COQ2", warehouse_qty=D("20"))
    requester = _make_employee(db_session, code="COQ2")
    req = _make_reserved_request(db_session, requester, item, qty=D("7"))
    db_session.flush()

    assert _inv(db_session, item.item_id).pending_quantity == D("7")

    count = svc.cancel_open_stock_requests(db_session, reason="테스트 정리")
    db_session.flush()

    assert count >= 1
    assert req.status == StockRequestStatusEnum.CANCELLED
    assert _inv(db_session, item.item_id).pending_quantity == D("0")
    assert _inv(db_session, item.item_id).warehouse_qty == D("20")  # 실재고 불변


def test_cancel_open_requests_skips_already_cancelled(db_session, make_item):
    """이미 CANCELLED인 요청은 대상 아님 (멱등)."""
    item = make_item(name="COQ3", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="COQ3")
    req = _make_reserved_request(db_session, requester, item, qty=D("3"))
    db_session.flush()

    # 먼저 취소
    count_first = svc.cancel_open_stock_requests(db_session, reason="1차 정리")
    db_session.flush()
    assert req.status == StockRequestStatusEnum.CANCELLED

    # 재실행 — 이미 취소된 건은 카운트에 포함되지 않아야 함
    count_second = svc.cancel_open_stock_requests(db_session, reason="2차 정리")
    db_session.flush()

    assert count_second == 0
    assert req.status == StockRequestStatusEnum.CANCELLED  # 상태 유지


def test_cancel_open_requests_does_not_touch_completed_rejected(db_session, make_item):
    """COMPLETED / REJECTED 요청은 변경하지 않는다."""
    item = make_item(name="COQ4", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="COQ4")
    approver = _make_employee(db_session, code="COQA4", warehouse_role="primary")

    req_completed = _make_reserved_request(db_session, requester, item, qty=D("2"))
    svc.approve_request(db_session, req_completed, approver=approver, pin="0000")
    db_session.flush()
    assert req_completed.status == StockRequestStatusEnum.COMPLETED

    item2 = make_item(name="COQ4B", warehouse_qty=D("10"))
    req_rejected = _make_reserved_request(db_session, requester, item2, qty=D("2"))
    svc.reject_request(db_session, req_rejected, approver=approver, pin="0000", reason="반려")
    db_session.flush()
    assert req_rejected.status == StockRequestStatusEnum.REJECTED

    count = svc.cancel_open_stock_requests(db_session, reason="테스트 정리")
    db_session.flush()

    assert count == 0
    assert req_completed.status == StockRequestStatusEnum.COMPLETED
    assert req_rejected.status == StockRequestStatusEnum.REJECTED
