"""StockRequest 서비스 — 작업자 결재 요청 흐름.

원칙:
- 창고 재고가 움직이는 모든 작업(`from_bucket=='warehouse'` 또는 `to_bucket=='warehouse'`)은
  창고 담당자(`warehouse_role in ('primary','deputy')`)의 승인 후에만 실재고 반영.
- 점유는 `Inventory.pending_quantity` 컬럼을 큐 배치(QueueBatch)와 공유하며, origin 구분은
  `StockRequestLine` 조회로 한다 (별도 컬럼 추가하지 않음).
- 승인은 한 트랜잭션 내에서 release + 실재고 이동 + TransactionLog 기록을 모두 수행한다.
  성공하면 `completed`, 검증 실패하면 `failed_approval` 로 저장하고 pending 을 안전하게 원복.
- 승인 불필요 작업(`production ↔ production`)은 즉시 실행되고 `completed` 상태로 기록.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Iterable, List, Optional, Sequence

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    Employee,
    Item,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import inventory as inventory_svc
from app.services.pin_auth import verify_pin


# ---------------------------------------------------------------------------
# 정책 상수
# ---------------------------------------------------------------------------

# request_type → 승인 시 호출할 거래 유형 (TransactionLog.transaction_type)
_TX_TYPE_BY_REQUEST: dict[StockRequestTypeEnum, TransactionTypeEnum] = {
    StockRequestTypeEnum.RAW_RECEIVE: TransactionTypeEnum.RECEIVE,
    StockRequestTypeEnum.RAW_SHIP: TransactionTypeEnum.SHIP,
    StockRequestTypeEnum.WAREHOUSE_TO_DEPT: TransactionTypeEnum.TRANSFER_TO_PROD,
    StockRequestTypeEnum.DEPT_TO_WAREHOUSE: TransactionTypeEnum.TRANSFER_TO_WH,
    StockRequestTypeEnum.DEPT_INTERNAL: TransactionTypeEnum.TRANSFER_DEPT,
    StockRequestTypeEnum.MARK_DEFECTIVE_WH: TransactionTypeEnum.MARK_DEFECTIVE,
    StockRequestTypeEnum.MARK_DEFECTIVE_PROD: TransactionTypeEnum.MARK_DEFECTIVE,
    StockRequestTypeEnum.SUPPLIER_RETURN: TransactionTypeEnum.SUPPLIER_RETURN,
    StockRequestTypeEnum.PACKAGE_OUT: TransactionTypeEnum.SHIP,
}


# ---------------------------------------------------------------------------
# 정책 함수
# ---------------------------------------------------------------------------


def line_requires_approval(from_bucket: RequestBucketEnum, to_bucket: RequestBucketEnum) -> bool:
    """from/to 중 하나라도 warehouse면 창고 담당자 승인 필요.

    production ↔ production (DEFECTIVE 포함) 만 승인 불필요.
    """
    return RequestBucketEnum.WAREHOUSE in (from_bucket, to_bucket)


def line_requires_pending(from_bucket: RequestBucketEnum, to_bucket: RequestBucketEnum) -> bool:
    """창고 재고를 선점해야 하는 라인은 from_bucket=='warehouse' 인 경우.

    창고 입고(to=warehouse)는 점유 불필요. 부서→창고는 부서 production 점유가 필요하나
    1차 구현에서는 부서 점유를 생략하고 승인 시점 재검증으로 갈음한다.
    """
    return from_bucket == RequestBucketEnum.WAREHOUSE


def request_requires_approval(lines: Sequence[StockRequestLine]) -> bool:
    return any(line_requires_approval(line.from_bucket, line.to_bucket) for line in lines)


# ---------------------------------------------------------------------------
# request_code 생성
# ---------------------------------------------------------------------------


def _generate_request_code(db: Session, ts: datetime) -> str:
    """`SR-YYYYMMDD-NNNN` 형식. 단일 사용자 환경 가정 (race condition 무시)."""
    prefix = f"SR-{ts.strftime('%Y%m%d')}"
    existing = (
        db.query(func.count(StockRequest.request_id))
        .filter(StockRequest.request_code.like(f"{prefix}-%"))
        .scalar()
        or 0
    )
    return f"{prefix}-{existing + 1:04d}"


# ---------------------------------------------------------------------------
# 라인 페이로드
# ---------------------------------------------------------------------------


class LineInput:
    """라우터 ↔ 서비스 인터페이스용 단순 컨테이너."""

    __slots__ = ("item_id", "quantity", "from_bucket", "from_department", "to_bucket", "to_department")

    def __init__(
        self,
        *,
        item_id: uuid.UUID,
        quantity: Decimal,
        from_bucket: RequestBucketEnum,
        from_department: Optional[DepartmentEnum],
        to_bucket: RequestBucketEnum,
        to_department: Optional[DepartmentEnum],
    ) -> None:
        self.item_id = item_id
        self.quantity = Decimal(str(quantity))
        self.from_bucket = from_bucket
        self.from_department = from_department
        self.to_bucket = to_bucket
        self.to_department = to_department


# ---------------------------------------------------------------------------
# request_type ↔ bucket/department 조합 사양표
# ---------------------------------------------------------------------------
# 각 request_type 별로 허용되는 from/to bucket 과 department 필수/금지 규칙.
# create_request() 진입부에서 라인별로 검증해 잘못된 조합으로 승인 정책을 우회하는
# 페이로드(예: raw_ship + bucket=none)를 차단한다.

_ALLOWED_SHAPES: dict[StockRequestTypeEnum, dict] = {
    StockRequestTypeEnum.RAW_RECEIVE: {
        "from_bucket": RequestBucketEnum.NONE,
        "to_bucket": RequestBucketEnum.WAREHOUSE,
        "from_dept_required": False,
        "to_dept_required": False,
    },
    StockRequestTypeEnum.RAW_SHIP: {
        "from_bucket": RequestBucketEnum.WAREHOUSE,
        "to_bucket": RequestBucketEnum.NONE,
        "from_dept_required": False,
        "to_dept_required": False,
    },
    StockRequestTypeEnum.WAREHOUSE_TO_DEPT: {
        "from_bucket": RequestBucketEnum.WAREHOUSE,
        "to_bucket": RequestBucketEnum.PRODUCTION,
        "from_dept_required": False,
        "to_dept_required": True,
    },
    StockRequestTypeEnum.DEPT_TO_WAREHOUSE: {
        "from_bucket": RequestBucketEnum.PRODUCTION,
        "to_bucket": RequestBucketEnum.WAREHOUSE,
        "from_dept_required": True,
        "to_dept_required": False,
    },
    StockRequestTypeEnum.DEPT_INTERNAL: {
        "from_bucket": RequestBucketEnum.PRODUCTION,
        "to_bucket": RequestBucketEnum.PRODUCTION,
        "from_dept_required": True,
        "to_dept_required": True,
    },
    StockRequestTypeEnum.MARK_DEFECTIVE_WH: {
        "from_bucket": RequestBucketEnum.WAREHOUSE,
        "to_bucket": RequestBucketEnum.DEFECTIVE,
        "from_dept_required": False,
        "to_dept_required": True,
    },
    StockRequestTypeEnum.MARK_DEFECTIVE_PROD: {
        "from_bucket": RequestBucketEnum.PRODUCTION,
        "to_bucket": RequestBucketEnum.DEFECTIVE,
        "from_dept_required": True,
        "to_dept_required": True,
    },
    StockRequestTypeEnum.SUPPLIER_RETURN: {
        "from_bucket": RequestBucketEnum.DEFECTIVE,
        "to_bucket": RequestBucketEnum.NONE,
        "from_dept_required": True,
        "to_dept_required": False,
    },
    StockRequestTypeEnum.PACKAGE_OUT: {
        "from_bucket": RequestBucketEnum.WAREHOUSE,
        "to_bucket": RequestBucketEnum.NONE,
        "from_dept_required": False,
        "to_dept_required": False,
    },
}


def validate_line_shape_for_request_type(
    request_type: StockRequestTypeEnum,
    line: LineInput,
) -> None:
    """request_type 과 라인 bucket/department 조합 정합성 검증.

    실패 시 ValueError. 호출자(create_request)가 DB row 생성 전에 호출해야 한다.
    이 검증을 통과하지 못하면 StockRequest row 도, pending_quantity 변경도 발생하지 않는다.
    """
    spec = _ALLOWED_SHAPES.get(request_type)
    if spec is None:
        # 새 request_type 이 추가됐는데 사양표에 없으면 명시적으로 거부 (안전 우선).
        raise ValueError(f"지원하지 않는 요청 유형: {request_type}")

    expected_from = spec["from_bucket"]
    expected_to = spec["to_bucket"]
    if line.from_bucket != expected_from or line.to_bucket != expected_to:
        raise ValueError(
            f"요청 유형 '{request_type.value}' 은 from_bucket='{expected_from.value}', "
            f"to_bucket='{expected_to.value}' 만 허용합니다 "
            f"(받음: from='{line.from_bucket.value}', to='{line.to_bucket.value}')."
        )

    from_dept_required: bool = spec["from_dept_required"]
    if from_dept_required and line.from_department is None:
        raise ValueError(
            f"요청 유형 '{request_type.value}' 은 from_department 가 필수입니다."
        )
    if not from_dept_required and line.from_department is not None:
        raise ValueError(
            f"요청 유형 '{request_type.value}' 은 from_department 를 받지 않습니다."
        )

    to_dept_required: bool = spec["to_dept_required"]
    if to_dept_required and line.to_department is None:
        raise ValueError(
            f"요청 유형 '{request_type.value}' 은 to_department 가 필수입니다."
        )
    if not to_dept_required and line.to_department is not None:
        raise ValueError(
            f"요청 유형 '{request_type.value}' 은 to_department 를 받지 않습니다."
        )

    # dept_internal 만 추가 규칙: 출발/도착 부서가 같으면 의미 없는 이동.
    if request_type == StockRequestTypeEnum.DEPT_INTERNAL:
        if line.from_department == line.to_department:
            raise ValueError("부서 내부 이동의 출발/도착 부서가 동일합니다.")


# ---------------------------------------------------------------------------
# 요청 생성
# ---------------------------------------------------------------------------


def create_request(
    db: Session,
    *,
    requester: Employee,
    request_type: StockRequestTypeEnum,
    lines_input: Sequence[LineInput],
    reference_no: Optional[str],
    notes: Optional[str],
) -> StockRequest:
    """요청 생성. 호출자가 db.commit() 책임.

    - 승인 필요 + 점유 필요 → 모든 라인을 한 번에 reserve. 하나라도 실패하면 ValueError.
      (호출자 라우터가 rollback)
    - 승인 필요 + 점유 불필요 → SUBMITTED 상태로 저장.
    - 승인 불필요 → 즉시 실행 후 COMPLETED.
    """
    if not lines_input:
        raise ValueError("요청 라인이 비어 있습니다.")

    # request_type ↔ bucket/department 조합 정합성 + quantity 양수 — DB row 생성 전 일괄 검증.
    # 검증 실패 시 StockRequest row 도, Inventory.pending_quantity 변경도 발생하지 않는다.
    for li in lines_input:
        if li.quantity <= 0:
            raise ValueError("수량은 0보다 커야 합니다.")
        validate_line_shape_for_request_type(request_type, li)

    now = datetime.utcnow()
    code = _generate_request_code(db, now)

    requires_approval = any(
        line_requires_approval(li.from_bucket, li.to_bucket) for li in lines_input
    )

    request = StockRequest(
        request_code=code,
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department,
        request_type=request_type,
        status=StockRequestStatusEnum.SUBMITTED,
        requires_warehouse_approval=requires_approval,
        submitted_at=now,
        reference_no=reference_no,
        notes=notes,
    )
    db.add(request)
    db.flush()

    # 라인 객체 생성 (item 스냅샷 포함)
    lines: List[StockRequestLine] = []
    for li in lines_input:
        if li.quantity <= 0:
            raise ValueError("수량은 0보다 커야 합니다.")
        item = db.query(Item).filter(Item.item_id == li.item_id).first()
        if item is None:
            raise ValueError(f"품목을 찾을 수 없습니다: {li.item_id}")
        line = StockRequestLine(
            request_id=request.request_id,
            item_id=li.item_id,
            item_name_snapshot=item.item_name,
            erp_code_snapshot=item.erp_code,
            quantity=li.quantity,
            from_bucket=li.from_bucket,
            from_department=li.from_department,
            to_bucket=li.to_bucket,
            to_department=li.to_department,
            status=StockRequestStatusEnum.SUBMITTED,
        )
        db.add(line)
        lines.append(line)
    db.flush()

    if not requires_approval:
        # 즉시 실행 — 한 트랜잭션 내에서 모든 라인 처리.
        try:
            _execute_all_lines(db, request, lines, operator_name=requester.name, approver=requester)
        except ValueError:
            # 즉시 실행 실패 시 호출측 rollback 으로 전체 무효화.
            raise
        request.status = StockRequestStatusEnum.COMPLETED
        request.approved_by_employee_id = requester.employee_id
        request.approved_by_name = requester.name
        request.approved_at = now
        request.completed_at = now
        for line in lines:
            line.status = StockRequestStatusEnum.COMPLETED
        return request

    # 승인 필요 — 점유 처리.
    pending_lines = [li for li in lines if line_requires_pending(li.from_bucket, li.to_bucket)]
    if pending_lines:
        # 동일 품목이 여러 라인에 등장하면 합산하여 한 번에 reserve.
        agg: dict[uuid.UUID, Decimal] = {}
        for li in pending_lines:
            agg[li.item_id] = agg.get(li.item_id, Decimal("0")) + (li.quantity or Decimal("0"))
        for item_id, qty in agg.items():
            inventory_svc.reserve(db, item_id, qty, employee=requester)
        request.status = StockRequestStatusEnum.RESERVED
        request.reserved_at = now
        for line in lines:
            line.status = StockRequestStatusEnum.RESERVED
    else:
        # 점유는 안 하지만 창고 담당자 승인은 필요 (예: dept_to_warehouse, raw_receive)
        request.status = StockRequestStatusEnum.SUBMITTED
        for line in lines:
            line.status = StockRequestStatusEnum.SUBMITTED

    return request


# ---------------------------------------------------------------------------
# 점유 해제
# ---------------------------------------------------------------------------


def release_reservation(db: Session, request: StockRequest) -> None:
    """RESERVED 상태 라인의 pending 원복. 이미 release 된 라인은 건너뜀."""
    if request.status != StockRequestStatusEnum.RESERVED:
        return
    pending_lines = [
        line for line in request.lines if line_requires_pending(line.from_bucket, line.to_bucket)
    ]
    agg: dict[uuid.UUID, Decimal] = {}
    for line in pending_lines:
        agg[line.item_id] = agg.get(line.item_id, Decimal("0")) + (line.quantity or Decimal("0"))
    for item_id, qty in agg.items():
        if qty > 0:
            inventory_svc.release(db, item_id, qty)


# ---------------------------------------------------------------------------
# 라인 실행 (실재고 이동 + TransactionLog)
# ---------------------------------------------------------------------------


def _bucket_label(bucket: RequestBucketEnum, dept: Optional[DepartmentEnum]) -> str:
    if bucket == RequestBucketEnum.WAREHOUSE:
        return "창고"
    if bucket == RequestBucketEnum.PRODUCTION:
        return f"{dept.value} 생산" if dept else "생산"
    if bucket == RequestBucketEnum.DEFECTIVE:
        return f"{dept.value} 불량" if dept else "불량"
    return "외부"


def _execute_line(
    db: Session,
    request: StockRequest,
    line: StockRequestLine,
    *,
    approver: Employee,
    is_approval: bool,
) -> None:
    """단일 라인의 재고 이동 + TransactionLog 생성.

    is_approval=True 면 RESERVED 라인의 pending 을 release 한 뒤 실재고를 움직인다.
    is_approval=False 는 즉시 실행(승인 불필요) 경로.
    """
    qty = line.quantity or Decimal("0")
    item_id = line.item_id
    rt = request.request_type

    # pending 점유 해제 (있다면)
    if is_approval and line_requires_pending(line.from_bucket, line.to_bucket):
        inventory_svc.release(db, item_id, qty)

    inv = inventory_svc.get_or_create_inventory(db, item_id)
    qty_before = inv.quantity or Decimal("0")
    quantity_change: Decimal = Decimal("0")

    if rt == StockRequestTypeEnum.RAW_RECEIVE:
        inventory_svc.receive_confirmed(db, item_id, qty, bucket="warehouse")
        quantity_change = qty
    elif rt == StockRequestTypeEnum.RAW_SHIP:
        inventory_svc.consume_warehouse(db, item_id, qty)
        quantity_change = -qty
    elif rt == StockRequestTypeEnum.WAREHOUSE_TO_DEPT:
        if line.to_department is None:
            raise ValueError("창고→부서 이동은 도착 부서가 필요합니다.")
        inventory_svc.transfer_to_production(db, item_id, qty, line.to_department)
        quantity_change = Decimal("0")
    elif rt == StockRequestTypeEnum.DEPT_TO_WAREHOUSE:
        if line.from_department is None:
            raise ValueError("부서→창고 복귀는 출발 부서가 필요합니다.")
        inventory_svc.transfer_to_warehouse(db, item_id, qty, line.from_department)
        quantity_change = Decimal("0")
    elif rt == StockRequestTypeEnum.DEPT_INTERNAL:
        if line.from_department is None or line.to_department is None:
            raise ValueError("부서 내부 이동은 출발/도착 부서가 모두 필요합니다.")
        inventory_svc.transfer_between_departments(
            db, item_id, qty, line.from_department, line.to_department
        )
        quantity_change = Decimal("0")
    elif rt == StockRequestTypeEnum.MARK_DEFECTIVE_WH:
        if line.to_department is None:
            raise ValueError("창고발 불량 등록은 격리 부서가 필요합니다.")
        inventory_svc.mark_defective(
            db, item_id, qty, source="warehouse", target_dept=line.to_department
        )
        quantity_change = Decimal("0")
    elif rt == StockRequestTypeEnum.MARK_DEFECTIVE_PROD:
        if line.from_department is None or line.to_department is None:
            raise ValueError("생산발 불량 등록은 출발/격리 부서가 필요합니다.")
        inventory_svc.mark_defective(
            db,
            item_id,
            qty,
            source="production",
            source_dept=line.from_department,
            target_dept=line.to_department,
        )
        quantity_change = Decimal("0")
    elif rt == StockRequestTypeEnum.SUPPLIER_RETURN:
        if line.from_department is None:
            raise ValueError("공급업체 반품은 출발 부서가 필요합니다.")
        inventory_svc.return_to_supplier(db, item_id, qty, line.from_department)
        quantity_change = -qty
    elif rt == StockRequestTypeEnum.PACKAGE_OUT:
        # 라인별로 창고에서 출고
        inventory_svc.consume_warehouse(db, item_id, qty)
        quantity_change = -qty
    else:
        raise ValueError(f"지원하지 않는 요청 유형: {rt}")

    db.flush()
    inv = inventory_svc.get_or_create_inventory(db, item_id)
    qty_after = inv.quantity or Decimal("0")

    # TransactionLog 작성 — 결재 흐름 맥락을 notes 에 기록.
    from_label = _bucket_label(line.from_bucket, line.from_department)
    to_label = _bucket_label(line.to_bucket, line.to_department)
    note_prefix = "요청 승인 처리" if is_approval else "요청 즉시 처리"
    note = (
        f"{note_prefix}: {request.request_code} / "
        f"{from_label} → {to_label} / {qty}개 / "
        f"요청자 {request.requester_name}"
    )
    if request.notes:
        note += f" / 비고: {request.notes}"

    db.add(
        TransactionLog(
            item_id=item_id,
            transaction_type=_TX_TYPE_BY_REQUEST[rt],
            quantity_change=quantity_change,
            quantity_before=qty_before,
            quantity_after=qty_after,
            reference_no=request.request_code,
            produced_by=approver.name,
            notes=note,
        )
    )


def _execute_all_lines(
    db: Session,
    request: StockRequest,
    lines: Iterable[StockRequestLine],
    *,
    operator_name: str,
    approver: Employee,
    is_approval: bool = False,
) -> None:
    for line in lines:
        _execute_line(db, request, line, approver=approver, is_approval=is_approval)


# ---------------------------------------------------------------------------
# 승인 / 반려 / 취소
# ---------------------------------------------------------------------------


def approve_request(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
) -> StockRequest:
    """승인 + 재고 반영을 한 트랜잭션에서 처리.

    Raises:
        PermissionError: PIN 불일치 또는 warehouse_role 권한 없음.
        ValueError: 승인 불가능한 상태 (이미 처리됨).
        FailedApprovalError: 시스템 검증 실패 — pending 안전 원복 후 status=failed_approval.
    """
    role = (approver.warehouse_role or "none").lower()
    if role not in ("primary", "deputy"):
        raise PermissionError("창고 담당자만 승인할 수 있습니다.")
    if not verify_pin(approver.pin_hash, pin):
        raise PermissionError("PIN이 일치하지 않습니다.")

    if request.status not in (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED):
        raise ValueError(f"승인할 수 없는 상태입니다: {request.status.value}")
    if not request.requires_warehouse_approval:
        raise ValueError("승인이 필요하지 않은 요청입니다.")

    now = datetime.utcnow()
    try:
        _execute_all_lines(
            db,
            request,
            list(request.lines),
            operator_name=approver.name,
            approver=approver,
            is_approval=True,
        )
    except ValueError as exc:
        # 시스템 검증 실패 — pending 을 안전하게 원복하고 failed_approval 로 저장.
        # 부분 release 가능성: 일부 라인은 이미 release+이동 완료, 일부는 미처리.
        # 호출측 라우터가 rollback 하므로 DB 변경은 모두 무효화된다 → 원본 RESERVED 상태로 복귀.
        # 우리는 별도 트랜잭션으로 status=failed_approval 만 기록.
        raise FailedApprovalError(str(exc))

    request.status = StockRequestStatusEnum.COMPLETED
    request.approved_by_employee_id = approver.employee_id
    request.approved_by_name = approver.name
    request.approved_at = now
    request.completed_at = now
    for line in request.lines:
        line.status = StockRequestStatusEnum.COMPLETED

    return request


def mark_failed_approval(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    reason: str,
) -> StockRequest:
    """승인 실패 처리: pending 원복 + status=failed_approval 기록.

    원래 트랜잭션이 rollback 된 직후 별도 트랜잭션에서 호출. release 는 다시 시도한다.
    이미 release 된 상태이거나 pending 이 부족하면 release() 가 ValueError → 무시.
    """
    pending_lines = [
        line for line in request.lines if line_requires_pending(line.from_bucket, line.to_bucket)
    ]
    agg: dict[uuid.UUID, Decimal] = {}
    for line in pending_lines:
        agg[line.item_id] = agg.get(line.item_id, Decimal("0")) + (line.quantity or Decimal("0"))
    for item_id, qty in agg.items():
        try:
            inventory_svc.release(db, item_id, qty)
        except ValueError:
            # 이미 release 됨 — 무시.
            pass

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.FAILED_APPROVAL
    request.rejected_by_employee_id = approver.employee_id
    request.rejected_by_name = approver.name
    request.rejected_at = now
    request.rejected_reason = f"승인 실패: {reason}"
    return request


def reject_request(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    reason: str,
) -> StockRequest:
    role = (approver.warehouse_role or "none").lower()
    if role not in ("primary", "deputy"):
        raise PermissionError("창고 담당자만 반려할 수 있습니다.")
    if not verify_pin(approver.pin_hash, pin):
        raise PermissionError("PIN이 일치하지 않습니다.")
    if not reason or not reason.strip():
        raise ValueError("반려 사유를 입력하세요.")
    if request.status not in (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED):
        raise ValueError(f"반려할 수 없는 상태입니다: {request.status.value}")

    release_reservation(db, request)

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.REJECTED
    request.rejected_by_employee_id = approver.employee_id
    request.rejected_by_name = approver.name
    request.rejected_at = now
    request.rejected_reason = reason.strip()
    for line in request.lines:
        line.status = StockRequestStatusEnum.REJECTED
    return request


def cancel_request(
    db: Session,
    request: StockRequest,
    *,
    requester: Employee,
    pin: str,
) -> StockRequest:
    """요청자 본인 또는 관리자(level=admin) 취소."""
    is_self = request.requester_employee_id == requester.employee_id
    is_admin = (
        getattr(requester, "level", None)
        and getattr(requester.level, "value", str(requester.level)) == "admin"
    )
    if not (is_self or is_admin):
        raise PermissionError("본인 요청 또는 관리자만 취소할 수 있습니다.")
    if not verify_pin(requester.pin_hash, pin):
        raise PermissionError("PIN이 일치하지 않습니다.")
    if request.status in (
        StockRequestStatusEnum.COMPLETED,
        StockRequestStatusEnum.REJECTED,
        StockRequestStatusEnum.CANCELLED,
        StockRequestStatusEnum.FAILED_APPROVAL,
    ):
        raise ValueError(f"취소할 수 없는 상태입니다: {request.status.value}")

    release_reservation(db, request)

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.CANCELLED
    request.cancelled_at = now
    for line in request.lines:
        line.status = StockRequestStatusEnum.CANCELLED
    return request


# ---------------------------------------------------------------------------
# 점유 조회
# ---------------------------------------------------------------------------


def list_active_reservations(db: Session, item_id: uuid.UUID) -> List[StockRequestLine]:
    """품목별 RESERVED 상태 라인 목록 (창고 점유 라인만)."""
    return (
        db.query(StockRequestLine)
        .filter(
            StockRequestLine.item_id == item_id,
            StockRequestLine.status == StockRequestStatusEnum.RESERVED,
            StockRequestLine.from_bucket == RequestBucketEnum.WAREHOUSE,
        )
        .all()
    )


# ---------------------------------------------------------------------------
# 사용자 정의 예외
# ---------------------------------------------------------------------------


class FailedApprovalError(Exception):
    """승인 시점 시스템 검증 실패. 라우터가 catch 해서 별도 트랜잭션으로 status 기록."""
