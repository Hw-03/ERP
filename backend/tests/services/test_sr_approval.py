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
    IoBatch,
    IoBundle,
    IoLine,
    LocationStatusEnum,
    ShippingRequest,
    ShippingRequestStatusEnum,
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


def _make_location_reserved_request(
    db_session, requester, item, *, qty: Decimal = D("3")
):
    from app.models import RequestBucketEnum

    return sr_svc.create_request(
        db_session,
        requester=requester,
        request_type=StockRequestTypeEnum.DEPT_TO_WAREHOUSE,
        lines_input=[
            LineInput(
                item_id=item.item_id,
                quantity=qty,
                from_bucket=RequestBucketEnum.PRODUCTION,
                from_department=ASSEMBLY,
                to_bucket=RequestBucketEnum.WAREHOUSE,
                to_department=None,
            )
        ],
        reference_no=None,
        notes=None,
    )


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


def _make_process_adjust_batch(
    db_session,
    *,
    requester: Employee,
    items: list,
    sub_type: str = "adjust_out",
) -> IoBatch:
    """부서 낱개 조정 요청과 연결할, 내용 보존 검증용 다품목 batch."""
    batch = IoBatch(
        work_type="process", sub_type=sub_type, status="reserved",
        requester_employee_id=requester.employee_id, requester_name=requester.name,
        requester_department=requester.department.value,
        from_department=ASSEMBLY.value, to_department=ASSEMBLY.value,
        requires_approval=True, reference_no="ADJ-REF-01",
        notes="반려 후 수정할 다품목 메모",
    )
    db_session.add(batch)
    db_session.flush()
    for index, item in enumerate(items, start=1):
        bundle = IoBundle(
            batch_id=batch.batch_id, source_kind="direct_item",
            title_snapshot=f"조정 품목 {index}", quantity=D(str(index)), expanded_level=0,
        )
        db_session.add(bundle)
        db_session.flush()
        db_session.add(IoLine(
            bundle_id=bundle.bundle_id, item_id=item.item_id,
            item_name_snapshot=item.item_name, mes_code_snapshot=item.mes_code, unit="EA",
            direction="adjust", from_bucket="production", from_department=ASSEMBLY.value,
            to_bucket="none", to_department=None, quantity=D(str(index)),
            included=True, origin=sub_type,
        ))
    db_session.flush()
    return batch


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


def test_legacy_submitted_department_request_can_be_approved_without_reservation(
    db_session, make_item, make_location
):
    from app.services import sr_reservation

    item = make_item(name="legacy-department-source")
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, code="LEGACY-REQ")
    approver = _make_employee(
        db_session, code="LEGACY-APP", warehouse_role="primary"
    )
    request = _make_location_reserved_request(db_session, requester, item, qty=D("3"))
    sr_reservation.release_lines(db_session, request.lines)
    request.status = StockRequestStatusEnum.SUBMITTED
    for line in request.lines:
        line.status = StockRequestStatusEnum.SUBMITTED
    db_session.flush()

    svc.approve_request(db_session, request, approver=approver, pin="0000")
    db_session.flush()
    db_session.refresh(location)

    assert request.status == StockRequestStatusEnum.COMPLETED
    assert location.quantity == D("2")
    assert location.pending_quantity == D("0")
    assert _inv(db_session, item.item_id).warehouse_qty == D("3")


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


def test_department_approve_releases_location_reservation_before_execution(
    db_session, make_item, make_location
):
    from app.models import RequestBucketEnum

    item = make_item(name="department-approved-source")
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, code="DREQ-SOURCE")
    approver = _make_employee(
        db_session,
        code="DAPP-SOURCE",
        department_role="primary",
    )
    request = sr_svc.create_request(
        db_session,
        requester=requester,
        request_type=StockRequestTypeEnum.DEPT_TO_WAREHOUSE,
        lines_input=[
            LineInput(
                item_id=item.item_id,
                quantity=D("3"),
                from_bucket=RequestBucketEnum.PRODUCTION,
                from_department=ASSEMBLY,
                to_bucket=RequestBucketEnum.WAREHOUSE,
                to_department=None,
            )
        ],
        reference_no=None,
        notes=None,
    )
    request.requires_warehouse_approval = False
    request.requires_department_approval = True
    db_session.flush()
    db_session.refresh(location)
    assert request.status == StockRequestStatusEnum.RESERVED
    assert location.pending_quantity == D("3")

    svc.approve_request_department(
        db_session,
        request,
        approver=approver,
        pin="0000",
    )
    db_session.flush()
    db_session.refresh(location)

    assert request.status == StockRequestStatusEnum.COMPLETED
    assert location.quantity == D("2")
    assert location.pending_quantity == D("0")
    assert _inv(db_session, item.item_id).warehouse_qty == D("3")


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


def test_department_reject_releases_location_pending(
    db_session, make_item, make_location
):
    item = make_item(name="department-reject")
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, code="DLOC-REQ")
    approver = _make_employee(
        db_session, code="DLOC-APP", department_role="primary"
    )
    request = _make_location_reserved_request(db_session, requester, item)
    request.requires_department_approval = True
    db_session.flush()

    svc.reject_request_department(
        db_session,
        request,
        approver=approver,
        pin="0000",
        reason="department reject",
    )
    db_session.flush()
    db_session.refresh(location)

    assert request.status == StockRequestStatusEnum.REJECTED
    assert location.pending_quantity == D("0")
    assert location.quantity == D("5")


def test_department_reject_returns_process_single_adjustment_to_same_draft(
    db_session, make_item, make_location
):
    """부서 낱개 조정 반려는 요청 이력은 남기고 기존 다품목 batch만 draft로 되돌린다."""
    first = make_item(name="반려 복귀 A")
    second = make_item(name="반려 복귀 B")
    first_location = make_location(first.item_id, department=ASSEMBLY, quantity=D("5"))
    second_location = make_location(second.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, code="ADJ-REQ")
    other = _make_employee(db_session, code="ADJ-OTHER")
    approver = _make_employee(
        db_session, code="ADJ-APP", name="조립 부서장", department_role="primary"
    )
    batch = _make_process_adjust_batch(db_session, requester=requester, items=[first, second])
    request = sr_svc.create_manual_adjustment_request(
        db_session,
        requester=requester,
        lines_input=[
            LineInput(
                item_id=first.item_id, quantity=D("1"), from_bucket="production",
                from_department=ASSEMBLY.value, to_bucket="none", to_department=None,
            ),
            LineInput(
                item_id=second.item_id, quantity=D("2"), from_bucket="production",
                from_department=ASSEMBLY.value, to_bucket="none", to_department=None,
            ),
        ],
        reference_no=batch.reference_no,
        notes=batch.notes,
        approval_department=ASSEMBLY.value,
    )
    request.operation_batch_id = batch.batch_id
    db_session.flush()
    assert request.status == StockRequestStatusEnum.RESERVED
    assert first_location.pending_quantity == D("1")
    assert second_location.pending_quantity == D("2")

    svc.reject_request_department(
        db_session, request, approver=approver, pin="0000", reason="수량 근거 확인 필요"
    )
    db_session.flush()
    db_session.refresh(batch)

    assert request.status == StockRequestStatusEnum.REJECTED
    assert request.rejected_by_name == "조립 부서장"
    assert request.rejected_at is not None
    assert request.rejected_reason == "수량 근거 확인 필요"
    assert first_location.pending_quantity == D("0")
    assert second_location.pending_quantity == D("0")
    assert batch.status == "draft"
    assert batch.completed_at is None
    assert batch.notes == "반려 후 수정할 다품목 메모"
    assert batch.reference_no == "ADJ-REF-01"
    assert [(line.item_name_snapshot, line.quantity) for bundle in batch.bundles for line in bundle.lines] == [
        ("반려 복귀 A", D("1")), ("반려 복귀 B", D("2")),
    ]

    from app.services import io_draft

    drafts = io_draft.list_drafts(db_session, requester_employee_id=requester.employee_id)
    assert [draft["batch_id"] for draft in drafts] == [batch.batch_id]
    assert drafts[0]["stock_requests"][0]["rejected_reason"] == "수량 근거 확인 필요"
    assert io_draft.list_drafts(db_session, requester_employee_id=other.employee_id) == []

    # 같은 batch 재제출은 새 결재 요청을 만들고, 더는 작성 중 반려 배너 대상이 아니다.
    from app.services import io_dispatch

    result = io_dispatch.submit_existing_draft(
        db_session,
        batch_id=batch.batch_id,
        requester_employee_id=requester.employee_id,
    )
    db_session.flush()
    db_session.refresh(batch)
    linked_requests = (
        db_session.query(type(request))
        .filter(type(request).operation_batch_id == batch.batch_id)
        .order_by(type(request).created_at)
        .all()
    )
    assert len(linked_requests) == 2
    assert linked_requests[0].request_id == request.request_id
    assert linked_requests[1].request_id != request.request_id
    assert batch.status == "reserved"
    assert result["batch"]["status"] == "reserved"
    assert result["batch"]["stock_requests"][0]["rejected_reason"] == "수량 근거 확인 필요"

    svc.approve_request_department(
        db_session, linked_requests[1], approver=approver, pin="0000"
    )
    db_session.refresh(batch)
    db_session.refresh(first_location)
    db_session.refresh(second_location)
    assert batch.status == "completed"
    assert batch.completed_at is not None
    assert first_location.quantity == D("4")
    assert second_location.quantity == D("3")

    active_request = sr_svc.create_manual_adjustment_request(
        db_session,
        requester=requester,
        lines_input=[LineInput(
            item_id=first.item_id, quantity=D("1"), from_bucket="production",
            from_department=ASSEMBLY.value, to_bucket="none", to_department=None,
        )],
        reference_no=batch.reference_no,
        notes=batch.notes,
        approval_department=ASSEMBLY.value,
    )
    active_request.operation_batch_id = batch.batch_id
    db_session.flush()
    from app.services.io_persist import sync_batch_from_stock_requests

    sync_batch_from_stock_requests(db_session, batch)
    db_session.refresh(batch)
    assert active_request.status == StockRequestStatusEnum.RESERVED
    assert batch.status == "partially_completed"


def test_department_reject_keeps_non_adjust_process_batch_rejected(db_session, make_item):
    """BOM 등 다른 부서 결재 반려에는 draft 복귀 규칙을 적용하지 않는다."""
    item = make_item(name="BOM 반려 유지", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="BOM-REQ")
    approver = _make_employee(db_session, code="BOM-APP", department_role="primary")
    batch = _make_process_adjust_batch(
        db_session, requester=requester, items=[item], sub_type="produce"
    )
    request = _make_dual_reserved_request(db_session, requester, item, qty=D("1"))
    request.operation_batch_id = batch.batch_id
    db_session.flush()

    svc.reject_request_department(
        db_session, request, approver=approver, pin="0000", reason="BOM 반려"
    )
    db_session.flush()
    db_session.refresh(batch)

    assert request.status == StockRequestStatusEnum.REJECTED
    assert batch.status == "rejected"
    assert batch.completed_at is None


def test_department_reject_does_not_restore_adjust_batch_with_non_department_request(
    db_session, make_item, make_location
):
    """같은 batch에 부서 결재가 아닌 반려 요청이 섞이면 draft 복귀 대상이 아니다."""
    item = make_item(name="혼합 결재 반려", warehouse_qty=D("5"))
    make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, code="MIX-REQ")
    approver = _make_employee(db_session, code="MIX-APP", department_role="primary")
    batch = _make_process_adjust_batch(db_session, requester=requester, items=[item])
    department_request = sr_svc.create_manual_adjustment_request(
        db_session,
        requester=requester,
        lines_input=[LineInput(
            item_id=item.item_id, quantity=D("1"), from_bucket="production",
            from_department=ASSEMBLY.value, to_bucket="none", to_department=None,
        )],
        reference_no=batch.reference_no,
        notes=batch.notes,
        approval_department=ASSEMBLY.value,
    )
    department_request.operation_batch_id = batch.batch_id
    other_request = _make_reserved_request(db_session, requester, item, qty=D("1"))
    other_request.operation_batch_id = batch.batch_id
    db_session.flush()

    svc.reject_request_department(
        db_session, department_request, approver=approver, pin="0000", reason="부서 반려"
    )
    other_request.status = StockRequestStatusEnum.REJECTED
    for line in other_request.lines:
        line.status = StockRequestStatusEnum.REJECTED
    from app.services.io_persist import sync_batch_from_stock_requests

    sync_batch_from_stock_requests(db_session, batch)
    db_session.refresh(batch)

    assert batch.status == "rejected"


def test_failed_approval_releases_location_pending(
    db_session, make_item, make_location
):
    item = make_item(name="department-failed")
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, code="DFAL-REQ")
    approver = _make_employee(db_session, code="DFAL-APP", warehouse_role="primary")
    request = _make_location_reserved_request(db_session, requester, item)
    db_session.flush()

    svc.mark_failed_approval(
        db_session,
        request,
        approver=approver,
        reason="execution failed",
    )
    db_session.flush()
    db_session.refresh(location)

    assert request.status == StockRequestStatusEnum.FAILED_APPROVAL
    assert all(
        line.status == StockRequestStatusEnum.FAILED_APPROVAL
        for line in request.lines
    )
    assert location.pending_quantity == D("0")


def test_failed_legacy_submitted_request_does_not_release_another_reservation(
    db_session, make_item, make_location
):
    from app.services import sr_reservation

    item = make_item(name="legacy-failure-shared-source")
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    owner = _make_employee(db_session, code="FLEG-OWNER")
    legacy_requester = _make_employee(db_session, code="FLEG-OLD")
    approver = _make_employee(
        db_session, code="FLEG-APP", warehouse_role="primary"
    )
    owner_request = _make_location_reserved_request(
        db_session, owner, item, qty=D("2")
    )
    legacy = _make_location_reserved_request(
        db_session, legacy_requester, item, qty=D("1")
    )
    sr_reservation.release_lines(db_session, legacy.lines)
    legacy.status = StockRequestStatusEnum.SUBMITTED
    for line in legacy.lines:
        line.status = StockRequestStatusEnum.SUBMITTED
    db_session.flush()
    db_session.refresh(location)
    assert owner_request.status == StockRequestStatusEnum.RESERVED
    assert location.pending_quantity == D("2")

    svc.mark_failed_approval(
        db_session,
        legacy,
        approver=approver,
        reason="legacy execution failed",
    )
    db_session.flush()
    db_session.refresh(location)

    assert legacy.status == StockRequestStatusEnum.FAILED_APPROVAL
    assert location.pending_quantity == D("2")


def test_active_reservations_excludes_stale_reserved_line_under_failed_parent(
    db_session, make_item, make_location
):
    item = make_item(name="failed-parent-reservation")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, code="FAR-REQ")
    request = _make_location_reserved_request(
        db_session, requester, item, qty=D("2")
    )
    request.status = StockRequestStatusEnum.FAILED_APPROVAL
    db_session.flush()

    assert request.lines[0].status == StockRequestStatusEnum.RESERVED
    assert sr_svc.list_active_reservations(db_session, item.item_id) == []


def test_requester_cancel_releases_location_pending(
    db_session, make_item, make_location
):
    item = make_item(name="department-cancel")
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, code="DCANCEL-REQ")
    request = _make_location_reserved_request(db_session, requester, item)
    db_session.flush()

    svc.cancel_request(
        db_session,
        request,
        requester=requester,
        pin="0000",
    )
    db_session.flush()
    db_session.refresh(location)

    assert request.status == StockRequestStatusEnum.CANCELLED
    assert location.pending_quantity == D("0")
    assert location.quantity == D("5")


def test_cancel_open_releases_location_and_tolerates_legacy_submitted(
    db_session, make_item, make_location, monkeypatch
):
    item = make_item(name="department-cleanup")
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, code="DCLEAN-REQ")
    legacy = _make_location_reserved_request(db_session, requester, item, qty=D("1"))
    # Simulate a pre-deployment request whose status was submitted without a reservation.
    from app.services import sr_reservation

    sr_reservation.release_lines(db_session, legacy.lines)
    legacy.status = StockRequestStatusEnum.SUBMITTED
    for line in legacy.lines:
        line.status = StockRequestStatusEnum.SUBMITTED
    # Legacy row must be visited first; otherwise the old best-effort release bug is hidden.
    reserved = _make_location_reserved_request(db_session, requester, item, qty=D("2"))
    db_session.flush()
    db_session.refresh(location)
    assert location.pending_quantity == D("2")

    released_statuses = []
    real_release = svc._release_pending_best_effort

    def track_release(db, request):
        released_statuses.append(request.status)
        real_release(db, request)

    monkeypatch.setattr(svc, "_release_pending_best_effort", track_release)

    count = svc.cancel_open_stock_requests(db_session, reason="cleanup")
    db_session.flush()
    db_session.refresh(location)

    assert count == 2
    assert reserved.status == StockRequestStatusEnum.CANCELLED
    assert legacy.status == StockRequestStatusEnum.CANCELLED
    assert released_statuses == [StockRequestStatusEnum.RESERVED]
    assert location.pending_quantity == D("0")


def test_cancel_ghost_reserved_request_preserves_other_request_pending(
    db_session, make_item, make_location
):
    item = make_item(name="ghost-reservation-cancel")
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("10"))
    requester = _make_employee(db_session, code="GHOST-CANCEL")
    ghost = _make_location_reserved_request(
        db_session,
        requester,
        item,
        qty=D("2"),
    )
    from app.services import sr_reservation

    sr_reservation.release_lines(db_session, ghost.lines)
    owner = _make_location_reserved_request(
        db_session,
        requester,
        item,
        qty=D("3"),
    )
    db_session.flush()
    db_session.refresh(location)
    assert location.pending_quantity == D("3")

    svc.cancel_request(
        db_session,
        ghost,
        requester=requester,
        pin="0000",
    )
    db_session.flush()
    db_session.refresh(location)

    assert ghost.status == StockRequestStatusEnum.CANCELLED
    assert owner.status == StockRequestStatusEnum.RESERVED
    assert location.pending_quantity == D("3")


def test_cancel_ghost_warehouse_request_preserves_other_request_pending(
    db_session, make_item
):
    item = make_item(name="ghost-warehouse-cancel", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="GHOST-WH-CANCEL")
    ghost = _make_reserved_request(db_session, requester, item, qty=D("2"))
    from app.services import sr_reservation

    sr_reservation.release_lines(db_session, ghost.lines)
    owner = _make_reserved_request(db_session, requester, item, qty=D("3"))
    db_session.flush()
    inventory = _inv(db_session, item.item_id)
    assert inventory.pending_quantity == D("3")

    svc.cancel_request(
        db_session,
        ghost,
        requester=requester,
        pin="0000",
    )
    db_session.flush()
    db_session.refresh(inventory)

    assert ghost.status == StockRequestStatusEnum.CANCELLED
    assert owner.status == StockRequestStatusEnum.RESERVED
    assert inventory.pending_quantity == D("3")


def test_cancel_open_reconciles_ghost_reserved_request_without_leak(
    db_session, make_item, make_location
):
    item = make_item(name="ghost-reservation-cleanup")
    location = make_location(item.item_id, department=ASSEMBLY, quantity=D("10"))
    requester = _make_employee(db_session, code="GHOST-CLEANUP")
    ghost = _make_location_reserved_request(
        db_session,
        requester,
        item,
        qty=D("2"),
    )
    from app.services import sr_reservation

    sr_reservation.release_lines(db_session, ghost.lines)
    owner = _make_location_reserved_request(
        db_session,
        requester,
        item,
        qty=D("3"),
    )
    db_session.flush()

    count = svc.cancel_open_stock_requests(db_session, reason="cleanup")
    db_session.flush()
    db_session.refresh(location)

    assert count == 2
    assert ghost.status == StockRequestStatusEnum.CANCELLED
    assert owner.status == StockRequestStatusEnum.CANCELLED
    assert location.pending_quantity == D("0")


def test_cancel_open_prelocks_all_request_items_in_global_order(
    db_session, make_item, make_location, monkeypatch
):
    from app.services import inventory as inventory_svc

    first = make_item(name="cleanup-global-lock-first")
    second = make_item(name="cleanup-global-lock-second")
    make_location(first.item_id, department=ASSEMBLY, quantity=D("5"))
    make_location(second.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, code="CLEANUP-GLOBAL-LOCK")
    _make_location_reserved_request(db_session, requester, second, qty=D("1"))
    _make_location_reserved_request(db_session, requester, first, qty=D("1"))
    events = []

    monkeypatch.setattr(
        inventory_svc,
        "ensure_and_lock_inventories",
        lambda _db, item_ids: events.append(("lock", item_ids)) or {},
    )
    monkeypatch.setattr(
        svc,
        "_release_pending_best_effort",
        lambda _db, request: events.append(("release", request.request_id)),
    )

    count = svc.cancel_open_stock_requests(db_session, reason="cleanup")

    assert count == 2
    assert events[0] == ("lock", sorted({first.item_id, second.item_id}))


def test_cancel_open_locks_requests_before_inventories(
    db_session, make_item, make_location, monkeypatch
):
    from sqlalchemy.orm import Query
    from app.services import inventory as inventory_svc

    item = make_item(name="cleanup-request-first-lock")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("5"))
    requester = _make_employee(db_session, code="CLEANUP-REQUEST-LOCK")
    _make_location_reserved_request(db_session, requester, item, qty=D("1"))
    events = []
    real_with_for_update = Query.with_for_update

    def with_for_update(query, *args, **kwargs):
        events.append(("request_lock", None))
        return real_with_for_update(query, *args, **kwargs)

    monkeypatch.setattr(Query, "with_for_update", with_for_update)
    monkeypatch.setattr(
        inventory_svc,
        "ensure_and_lock_inventories",
        lambda _db, item_ids: events.append(("inventory_lock", item_ids)) or {},
    )
    monkeypatch.setattr(svc, "_release_pending_best_effort", lambda *_args: None)

    svc.cancel_open_stock_requests(db_session, reason="cleanup")

    assert events[:2] == [
        ("request_lock", None),
        ("inventory_lock", [item.item_id]),
    ]


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


def test_cancel_open_requests_rejects_legacy_shipping_link_before_any_state_change(
    db_session, make_item
):
    normal_item = make_item(name="COQ-NORMAL", process_type_code="PR", warehouse_qty=D("10"))
    item = make_item(name="COQ-LEGACY-SHIP", process_type_code="PF", warehouse_qty=D("10"))
    requester = _make_employee(db_session, code="COQ-LEGACY-SHIP")
    normal_req = _make_reserved_request(db_session, requester, normal_item, qty=D("2"))
    req = _make_reserved_request(db_session, requester, item, qty=D("3"))
    shipping_request = ShippingRequest(
        base_pf_item_id=item.item_id,
        status=ShippingRequestStatusEnum.PREPARING,
    )
    db_session.add(shipping_request)
    db_session.flush()
    batch = IoBatch(
        work_type="process",
        sub_type="produce",
        status="submitted",
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=ASSEMBLY.value,
        requires_approval=True,
        stock_request_id=req.request_id,
        shipping_request_id=shipping_request.request_id,
    )
    db_session.add(batch)
    db_session.flush()
    req.operation_batch_id = batch.batch_id
    db_session.flush()

    with pytest.raises(ValueError, match="조회만"):
        svc.cancel_open_stock_requests(db_session, reason="시스템 정리")

    assert req.status == StockRequestStatusEnum.RESERVED
    assert req.cancelled_at is None
    assert all(line.status == StockRequestStatusEnum.RESERVED for line in req.lines)
    assert batch.status == "submitted"
    assert _inv(db_session, item.item_id).pending_quantity == D("3")
    assert normal_req.status == StockRequestStatusEnum.RESERVED
    assert normal_req.cancelled_at is None
    assert all(line.status == StockRequestStatusEnum.RESERVED for line in normal_req.lines)
    assert _inv(db_session, normal_item.item_id).pending_quantity == D("2")


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
