"""StockRequest 서비스 — 작업자 결재 요청 흐름.

원칙:
- 창고 재고가 움직이는 모든 작업(`from_bucket=='warehouse'` 또는 `to_bucket=='warehouse'`)은
  창고 담당자(`warehouse_role in ('primary','deputy')`)의 승인 후에만 실재고 반영.
- 점유는 `Inventory.pending_quantity` 컬럼으로 관리하고, origin 구분은
  `StockRequestLine` 조회로 한다 (별도 컬럼 추가하지 않음).
- 승인은 한 트랜잭션 내에서 release + 실재고 이동 + TransactionLog 기록을 모두 수행한다.
  성공하면 `completed`, 검증 실패하면 `failed_approval` 로 저장하고 pending 을 안전하게 원복.
- 승인 불필요 작업(`production ↔ production`)은 즉시 실행되고 `completed` 상태로 기록.
"""

from __future__ import annotations

import secrets
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Iterable, List, Optional, Sequence

from sqlalchemy.orm import Session

from app.models import (
    DepartmentEnum,
    Employee,
    InventoryLocation,
    Item,
    LocationStatusEnum,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.database import _is_sqlite
from app.services import inventory as inventory_svc
from app.services.dept_hierarchy import can_approve_department
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
    # 불량 처리 흐름 — 결재 필요 액션 (세부 로그는 서비스 함수가 직접 생성)
    StockRequestTypeEnum.DEFECT_SCRAP: TransactionTypeEnum.DEFECT_SCRAP,
    StockRequestTypeEnum.DEFECT_RETURN: TransactionTypeEnum.SUPPLIER_RETURN,
    StockRequestTypeEnum.DEFECT_DISASSEMBLE: TransactionTypeEnum.DISASSEMBLE,
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


def _generate_request_code(ts: datetime) -> str:
    """SR-YYYYMMDD-HHMMSS-XXXXXXXX 형식 (8자리 랜덤 hex, 32비트 엔트로피).

    충돌 확률 약 1/4,294,967,296 수준.
    unique constraint 충돌 시 라우터가 1회 retry 한다.
    """
    suffix = secrets.token_hex(4).upper()
    return f"SR-{ts.strftime('%Y%m%d-%H%M%S')}-{suffix}"


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
    # 낱개(manual/adjust) 라인 — 어떤 bucket/dept 조합이든 허용 (요청 유형 다양).
    # 실제 재고 변동은 io.py 의 _submit_immediate 가 dept 승인 후 실행한다.
    StockRequestTypeEnum.MANUAL_ADJUSTMENT: None,  # 검증 건너뜀
    # 불량 처리 흐름 — bucket 조합 임의 허용 (서비스 함수가 재고 검증)
    StockRequestTypeEnum.DEFECT_SCRAP: None,
    StockRequestTypeEnum.DEFECT_RETURN: None,
    StockRequestTypeEnum.DEFECT_DISASSEMBLE: None,
}


# 낱개 라인 origin — io.py 의 IoLine.origin 과 동기화.
MANUAL_LINE_ORIGINS = frozenset({"manual", "adjust_in", "adjust_out"})


def validate_line_shape_for_request_type(
    request_type: StockRequestTypeEnum,
    line: LineInput,
) -> None:
    """request_type 과 라인 bucket/department 조합 정합성 검증.

    실패 시 ValueError. 호출자(create_request)가 DB row 생성 전에 호출해야 한다.
    이 검증을 통과하지 못하면 StockRequest row 도, pending_quantity 변경도 발생하지 않는다.
    """
    if request_type not in _ALLOWED_SHAPES:
        # 새 request_type 이 추가됐는데 사양표에 없으면 명시적으로 거부 (안전 우선).
        raise ValueError(f"지원하지 않는 요청 유형: {request_type}")
    spec = _ALLOWED_SHAPES[request_type]
    if spec is None:
        # MANUAL_ADJUSTMENT — bucket/dept 조합 임의 허용
        return

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
# 내부 헬퍼 — create_request / submit_draft_request 공통 단계
# ---------------------------------------------------------------------------


def _validate_lines(
    request_type: StockRequestTypeEnum,
    lines_input: Sequence[LineInput],
    *,
    allow_empty: bool = False,
) -> None:
    """quantity > 0 + shape 검증. 실패 시 ValueError.

    allow_empty=True 면 lines_input 가 비어 있어도 통과 (DRAFT 저장 도중 단계용).
    """
    if not lines_input:
        if allow_empty:
            return
        raise ValueError("요청 라인이 비어 있습니다.")
    for li in lines_input:
        if li.quantity <= 0:
            raise ValueError("수량은 0보다 커야 합니다.")
        validate_line_shape_for_request_type(request_type, li)


def _preflight_inventory_check(
    db: Session,
    request_type: StockRequestTypeEnum,
    lines_input: Sequence[LineInput],
) -> None:
    """제출 시점 재고 사전 검증.

    from_bucket==PRODUCTION 이고 승인 필요 라인(dept_to_warehouse 등)에 대해
    부서 생산 재고가 충분한지 확인한다. 부족 시 ValueError.
    창고→부서(from_bucket==WAREHOUSE) 라인은 reserve() 로 이미 보호되므로 제외.
    """
    # (item_id, department) → 요청 합산 수량
    needed: dict[tuple, Decimal] = {}
    for li in lines_input:
        if (
            li.from_bucket == RequestBucketEnum.PRODUCTION
            and line_requires_approval(li.from_bucket, li.to_bucket)
            and li.from_department is not None
        ):
            key = (li.item_id, li.from_department)
            needed[key] = needed.get(key, Decimal("0")) + li.quantity

    if not needed:
        return

    for (item_id, dept), qty in needed.items():
        loc = (
            db.query(InventoryLocation)
            .filter(
                InventoryLocation.item_id == item_id,
                InventoryLocation.department == dept,
                InventoryLocation.status == LocationStatusEnum.PRODUCTION,
            )
            .first()
        )
        avail = loc.quantity if loc else Decimal("0")
        if avail < qty:
            item = db.query(Item).filter(Item.item_id == item_id).first()
            item_name = item.item_name if item else str(item_id)
            raise ValueError(
                f"부서 생산 재고 부족: {item_name} / {dept} 생산 {avail}개, 요청 {qty}개."
            )


def _build_request_and_lines(
    db: Session,
    *,
    requester: Employee,
    request_type: StockRequestTypeEnum,
    lines_input: Sequence[LineInput],
    reference_no: Optional[str],
    notes: Optional[str],
    status: StockRequestStatusEnum,
    request_code: Optional[str],
    submitted_at: Optional[datetime],
    client_request_id: Optional[str] = None,
    requires_warehouse_approval_override: Optional[bool] = None,
    requires_department_approval: bool = False,
    reason_category: Optional[str] = None,
    reason_memo: Optional[str] = None,
) -> StockRequest:
    """StockRequest + StockRequestLine row 생성. 호출자가 사전 검증 책임.

    inventory_svc 호출 / TransactionLog 생성은 절대 하지 않는다 (DRAFT 안전성 보장).
    """
    if requires_warehouse_approval_override is None:
        requires_approval = any(
            line_requires_approval(li.from_bucket, li.to_bucket) for li in lines_input
        )
    else:
        requires_approval = requires_warehouse_approval_override

    request = StockRequest(
        request_code=request_code,
        client_request_id=client_request_id,
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=requester.department,
        request_type=request_type,
        status=status,
        requires_warehouse_approval=requires_approval,
        requires_department_approval=requires_department_approval,
        submitted_at=submitted_at,
        reference_no=reference_no,
        notes=notes,
        reason_category=reason_category,
        reason_memo=reason_memo,
    )
    db.add(request)
    db.flush()

    for li in lines_input:
        item = db.query(Item).filter(Item.item_id == li.item_id).first()
        if item is None:
            raise ValueError(f"품목을 찾을 수 없습니다: {li.item_id}")
        line = StockRequestLine(
            request_id=request.request_id,
            item_id=li.item_id,
            item_name_snapshot=item.item_name,
            item_code_snapshot=item.item_code,
            quantity=li.quantity,
            from_bucket=li.from_bucket,
            from_department=li.from_department,
            to_bucket=li.to_bucket,
            to_department=li.to_department,
            status=status,
        )
        db.add(line)
    db.flush()
    return request


def _finalize_submission(
    db: Session,
    *,
    request: StockRequest,
    requester: Employee,
    now: datetime,
) -> StockRequest:
    """제출 시점 분기 — request 와 lines 가 SUBMITTED 상태로 flush 된 직후 호출.

    - 승인 불필요 → 즉시 실행 + COMPLETED
    - 요청자가 자가승인 가능(창고 + 부서 모두 충족) → 즉시 실행 + COMPLETED
      (requires_*_approval 컬럼은 그대로 True 로 유지하여 감사 추적 보존)
    - 승인 필요 + pending 필요 → reserve + RESERVED
    - 승인 필요 + pending 불필요 → SUBMITTED 유지
    """
    lines = list(request.lines)
    requester_role = (requester.warehouse_role or "none").lower()
    requester_dept_role = (getattr(requester, "department_role", None) or "none").lower()
    requester_level = getattr(getattr(requester, "level", None), "value", requester.level)
    is_admin = requester_level == "admin"

    warehouse_ok = (
        (not request.requires_warehouse_approval)
        or is_admin
        or requester_role in ("primary", "deputy")
    )
    dept_ok = (
        (not request.requires_department_approval)
        or is_admin
        or requester_dept_role in ("primary", "deputy")
    )
    if warehouse_ok and dept_ok:
        _execute_all_lines(
            db, request, lines, operator_name=requester.name, approver=requester
        )
        request.status = StockRequestStatusEnum.COMPLETED
        # 기존 관례: 즉시 완료 시 approved_at 은 무조건 채워 감사 추적용으로 사용한다.
        request.approved_by_employee_id = requester.employee_id
        request.approved_by_name = requester.name
        request.approved_at = now
        if request.requires_department_approval:
            request.department_approved_by_employee_id = requester.employee_id
            request.department_approved_by_name = requester.name
            request.department_approved_at = now
        request.completed_at = now
        for line in lines:
            line.status = StockRequestStatusEnum.COMPLETED
        return request

    pending_lines = [
        li for li in lines if line_requires_pending(li.from_bucket, li.to_bucket)
    ]
    if pending_lines:
        agg: dict[uuid.UUID, Decimal] = {}
        for li in pending_lines:
            agg[li.item_id] = agg.get(li.item_id, Decimal("0")) + (
                li.quantity or Decimal("0")
            )
        for item_id, qty in agg.items():
            inventory_svc.reserve(db, item_id, qty, employee=requester)
        request.status = StockRequestStatusEnum.RESERVED
        request.reserved_at = now
        for line in lines:
            line.status = StockRequestStatusEnum.RESERVED
    else:
        request.status = StockRequestStatusEnum.SUBMITTED
        for line in lines:
            line.status = StockRequestStatusEnum.SUBMITTED
    return request


# ---------------------------------------------------------------------------
# 요청 생성 (즉시 제출 흐름)
# ---------------------------------------------------------------------------


def create_request(
    db: Session,
    *,
    requester: Employee,
    request_type: StockRequestTypeEnum,
    lines_input: Sequence[LineInput],
    reference_no: Optional[str],
    notes: Optional[str],
    client_request_id: Optional[str] = None,
    requires_department_approval: bool = False,
    reason_category: Optional[str] = None,
    reason_memo: Optional[str] = None,
) -> StockRequest:
    """요청 생성. 호출자가 db.commit() 책임.

    - 승인 필요 + 점유 필요 → 모든 라인을 한 번에 reserve. 하나라도 실패하면 ValueError.
      (호출자 라우터가 rollback)
    - 승인 필요 + 점유 불필요 → SUBMITTED 상태로 저장.
    - 승인 불필요 → 즉시 실행 후 COMPLETED.
    - requires_department_approval=True 면 부서 결재까지 통과해야 COMPLETED.
    """
    # 불량 처리 흐름은 항상 부서 결재 필요.
    _DEFECT_TYPES = {
        StockRequestTypeEnum.DEFECT_SCRAP,
        StockRequestTypeEnum.DEFECT_RETURN,
        StockRequestTypeEnum.DEFECT_DISASSEMBLE,
    }
    if request_type in _DEFECT_TYPES:
        requires_department_approval = True

    _validate_lines(request_type, lines_input)
    _preflight_inventory_check(db, request_type, lines_input)
    now = datetime.utcnow()
    code = _generate_request_code(now)
    request = _build_request_and_lines(
        db,
        requester=requester,
        request_type=request_type,
        lines_input=lines_input,
        reference_no=reference_no,
        notes=notes,
        status=StockRequestStatusEnum.SUBMITTED,
        request_code=code,
        submitted_at=now,
        client_request_id=client_request_id,
        requires_department_approval=requires_department_approval,
        reason_category=reason_category,
        reason_memo=reason_memo,
    )
    return _finalize_submission(db, request=request, requester=requester, now=now)


def create_manual_adjustment_request(
    db: Session,
    *,
    requester: Employee,
    lines_input: Sequence[LineInput],
    reference_no: Optional[str],
    notes: Optional[str],
    client_request_id: Optional[str] = None,
) -> StockRequest:
    """낱개(manual/adjust) 라인 전용 부서 결재 요청.

    - request_type = MANUAL_ADJUSTMENT (bucket/dept 검증 생략)
    - requires_warehouse_approval=False, requires_department_approval=True
    - reserve / 즉시실행 모두 하지 않음. 부서 결재 통과 후 io.py 가 실재고 반영.
    - 자가승인 가능: 요청자가 부서 정/부 또는 admin 이면 즉시 dept_approved 기록 + 라우터가 io.py 호출
      (단 이 함수는 dept_approved 만 마크하고 batch 실행은 호출자가 처리)
    """
    if not lines_input:
        raise ValueError("요청 라인이 비어 있습니다.")
    for li in lines_input:
        if li.quantity <= 0:
            raise ValueError("수량은 0보다 커야 합니다.")

    now = datetime.utcnow()
    code = _generate_request_code(now)
    request = _build_request_and_lines(
        db,
        requester=requester,
        request_type=StockRequestTypeEnum.MANUAL_ADJUSTMENT,
        lines_input=lines_input,
        reference_no=reference_no,
        notes=notes,
        status=StockRequestStatusEnum.SUBMITTED,
        request_code=code,
        submitted_at=now,
        client_request_id=client_request_id,
        requires_warehouse_approval_override=False,
        requires_department_approval=True,
    )
    # 자가승인: 요청자가 부서 결재 권한자라면 dept_approved 즉시 기록.
    # 실제 batch 실행은 호출자(io.py)가 status 보고 진행.
    dept_role = (getattr(requester, "department_role", None) or "none").lower()
    level = getattr(getattr(requester, "level", None), "value", requester.level)
    if dept_role in ("primary", "deputy") or level == "admin":
        request.department_approved_by_employee_id = requester.employee_id
        request.department_approved_by_name = requester.name
        request.department_approved_at = now
    return request


# ---------------------------------------------------------------------------
# 직원별 저장형 입출고 장바구니 (DRAFT)
# ---------------------------------------------------------------------------
# 핵심 제약:
# - DRAFT 저장은 inventory_svc.* 호출 / TransactionLog 생성을 절대 하지 않는다.
# - request_code 는 NULL 로 유지 — submit 시점에만 생성한다.
# - 직원 + request_type 기준 active draft 는 1개만 유지한다.


def upsert_draft_request(
    db: Session,
    *,
    requester: Employee,
    request_type: StockRequestTypeEnum,
    lines_input: Sequence[LineInput],
    reference_no: Optional[str],
    notes: Optional[str],
) -> StockRequest:
    """직원 + request_type 기준 active draft 를 upsert.

    - lines_input 은 비어 있어도 허용 (저장 도중 단계).
    - lines_input 이 비어 있지 않으면 1차 shape 검증 통과 필수.
    - 기존 DRAFT 가 있으면 lines 전체 교체 + notes/reference_no 갱신, 신규 row 생성 금지.
    """
    _validate_lines(request_type, lines_input, allow_empty=True)

    existing = (
        db.query(StockRequest)
        .filter(
            StockRequest.requester_employee_id == requester.employee_id,
            StockRequest.request_type == request_type,
            StockRequest.status == StockRequestStatusEnum.DRAFT,
        )
        .first()
    )
    if existing is not None:
        # 기존 lines 명시 삭제 (cascade 의존하지 않음).
        # bulk delete 로 ORM 추적 우회 → cascade 재진입에 의한 중복 DELETE 회피.
        db.query(StockRequestLine).filter(
            StockRequestLine.request_id == existing.request_id
        ).delete(synchronize_session=False)
        db.flush()
        db.expire(existing, ["lines"])

        existing.reference_no = reference_no
        existing.notes = notes
        existing.requires_warehouse_approval = any(
            line_requires_approval(li.from_bucket, li.to_bucket) for li in lines_input
        )
        # request_code 는 DRAFT 동안 NULL 유지 — submit 시점에만 발급.

        for li in lines_input:
            item = db.query(Item).filter(Item.item_id == li.item_id).first()
            if item is None:
                raise ValueError(f"품목을 찾을 수 없습니다: {li.item_id}")
            db.add(
                StockRequestLine(
                    request_id=existing.request_id,
                    item_id=li.item_id,
                    item_name_snapshot=item.item_name,
                    item_code_snapshot=item.item_code,
                    quantity=li.quantity,
                    from_bucket=li.from_bucket,
                    from_department=li.from_department,
                    to_bucket=li.to_bucket,
                    to_department=li.to_department,
                    status=StockRequestStatusEnum.DRAFT,
                )
            )
        db.flush()
        return existing

    # 신규 DRAFT 생성 — request_code=None, submitted_at=None.
    return _build_request_and_lines(
        db,
        requester=requester,
        request_type=request_type,
        lines_input=lines_input,
        reference_no=reference_no,
        notes=notes,
        status=StockRequestStatusEnum.DRAFT,
        request_code=None,
        submitted_at=None,
    )


def get_draft_request(
    db: Session,
    *,
    requester_employee_id: uuid.UUID,
    request_type: StockRequestTypeEnum,
) -> Optional[StockRequest]:
    """직원 + request_type 기준 단일 DRAFT 조회. 없으면 None."""
    return (
        db.query(StockRequest)
        .filter(
            StockRequest.requester_employee_id == requester_employee_id,
            StockRequest.request_type == request_type,
            StockRequest.status == StockRequestStatusEnum.DRAFT,
        )
        .first()
    )


def list_draft_requests(
    db: Session,
    *,
    requester_employee_id: uuid.UUID,
) -> List[StockRequest]:
    """해당 직원의 DRAFT 목록만 (updated_at 내림차순)."""
    return (
        db.query(StockRequest)
        .filter(
            StockRequest.requester_employee_id == requester_employee_id,
            StockRequest.status == StockRequestStatusEnum.DRAFT,
        )
        .order_by(StockRequest.updated_at.desc())
        .all()
    )


def delete_draft_request(
    db: Session,
    *,
    request_id: uuid.UUID,
    requester_employee_id: uuid.UUID,
) -> None:
    """DRAFT 삭제. cascade 의존하지 않고 lines 명시 삭제 후 request 삭제."""
    request = (
        db.query(StockRequest).filter(StockRequest.request_id == request_id).first()
    )
    if request is None:
        raise ValueError("장바구니를 찾을 수 없습니다.")
    if request.requester_employee_id != requester_employee_id:
        raise PermissionError("본인 장바구니만 삭제할 수 있습니다.")
    if request.status != StockRequestStatusEnum.DRAFT:
        raise ValueError("장바구니(DRAFT) 상태가 아닙니다.")

    # Lines 명시 삭제 — bulk delete 로 ORM 추적 우회 (cascade 재진입 방지).
    db.query(StockRequestLine).filter(
        StockRequestLine.request_id == request.request_id
    ).delete(synchronize_session=False)
    db.flush()
    # request.lines 는 stale — expire 후 request 삭제.
    db.expire(request, ["lines"])
    db.delete(request)
    db.flush()


def submit_draft_request(
    db: Session,
    *,
    request_id: uuid.UUID,
    requester_employee_id: uuid.UUID,
) -> StockRequest:
    """DRAFT 제출. 본인 검증 → shape 재검증 → request_code 발급 → _finalize_submission."""
    request = (
        db.query(StockRequest).filter(StockRequest.request_id == request_id).first()
    )
    if request is None:
        raise RequestNotFoundError("요청을 찾을 수 없습니다.")
    if request.requester_employee_id != requester_employee_id:
        raise PermissionError("본인 장바구니만 제출할 수 있습니다.")
    if request.status != StockRequestStatusEnum.DRAFT:
        raise ValueError("장바구니(DRAFT) 상태가 아닙니다.")

    requester = (
        db.query(Employee)
        .filter(Employee.employee_id == request.requester_employee_id)
        .first()
    )
    if requester is None:
        raise ValueError("요청자(직원) 정보가 없습니다.")
    if not bool(requester.is_active):
        raise ValueError("비활성 직원의 장바구니는 제출할 수 없습니다.")

    db_lines = list(request.lines)
    if not db_lines:
        raise ValueError("요청 라인이 비어 있습니다.")

    # DB 라인 → LineInput 으로 환원하여 1차 shape 검증 재사용.
    line_inputs = [
        LineInput(
            item_id=line.item_id,
            quantity=line.quantity,
            from_bucket=line.from_bucket,
            from_department=line.from_department,
            to_bucket=line.to_bucket,
            to_department=line.to_department,
        )
        for line in db_lines
    ]
    _validate_lines(request.request_type, line_inputs)
    _preflight_inventory_check(db, request.request_type, line_inputs)

    now = datetime.utcnow()
    if not request.request_code:
        request.request_code = _generate_request_code(now)
    request.submitted_at = now
    # lines 가 DRAFT 동안 변경됐을 가능성에 대비해 requires_warehouse_approval 재계산.
    request.requires_warehouse_approval = any(
        line_requires_approval(li.from_bucket, li.to_bucket) for li in line_inputs
    )

    # status 를 SUBMITTED 로 옮긴 뒤 분기 실행.
    request.status = StockRequestStatusEnum.SUBMITTED
    for line in db_lines:
        line.status = StockRequestStatusEnum.SUBMITTED
    db.flush()

    return _finalize_submission(db, request=request, requester=requester, now=now)


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


def _bucket_label(bucket: RequestBucketEnum, dept: Optional[str]) -> str:
    if bucket == RequestBucketEnum.WAREHOUSE:
        return "창고"
    if bucket == RequestBucketEnum.PRODUCTION:
        return f"{dept} 생산" if dept else "생산"
    if bucket == RequestBucketEnum.DEFECTIVE:
        return f"{dept} 불량" if dept else "불량"
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
    elif rt == StockRequestTypeEnum.DEFECT_SCRAP:
        # 격리 항목 폐기 — from_department 에서 DEFECTIVE 차감
        if line.from_department is None:
            raise ValueError("격리 항목 폐기는 from_department 가 필요합니다.")
        reason_cat = request.reason_category or ""
        reason_memo = request.reason_memo or (request.notes or "")
        actor_name = approver.name
        inventory_svc.scrap_defective(
            db, item_id, qty, line.from_department,
            reason_category=reason_cat or "기타",
            reason_memo=reason_memo,
            actor=actor_name,
        )
        quantity_change = -qty
    elif rt == StockRequestTypeEnum.DEFECT_RETURN:
        # 격리 항목 공급처 반품 — from_department 에서 DEFECTIVE 차감
        if line.from_department is None:
            raise ValueError("격리 항목 공급처 반품은 from_department 가 필요합니다.")
        reason_cat = request.reason_category or ""
        reason_memo_val = request.reason_memo or (request.notes or "")
        actor_name = approver.name
        inventory_svc.return_to_supplier(db, item_id, qty, line.from_department)
        quantity_change = -qty
    elif rt == StockRequestTypeEnum.DEFECT_DISASSEMBLE:
        # 분해 처리 — notes 에서 child_decisions JSON 추출 후 submit_defective_disassemble 호출.
        # 분해 시 부모 1라인만 있고 자식 결정은 request.notes 에 JSON 직렬화되어 있다.
        import json
        from app.services.dept_adjustment import submit_defective_disassemble
        if line.from_department is None:
            raise ValueError("분해 처리는 from_department 가 필요합니다.")
        reason_cat = request.reason_category or ""
        reason_memo_val = request.reason_memo or (request.notes or "")
        # child_decisions 는 request.notes 에 JSON으로 저장됨
        try:
            raw = json.loads(request.notes or "{}") if request.notes else {}
            child_decisions = raw.get("child_decisions", [])
        except (json.JSONDecodeError, TypeError):
            child_decisions = []
        # child qty default → qty (부모와 동일 비율)
        for cd in child_decisions:
            if "qty" not in cd:
                cd["qty"] = str(qty)
            else:
                cd["qty"] = str(cd["qty"])
        if child_decisions:
            submit_defective_disassemble(
                db, item_id, qty, line.from_department,
                child_decisions,
                reason_category=reason_cat or "기타",
                reason_memo=reason_memo_val,
                actor=approver.name,
            )
        else:
            # child_decisions 없으면 단순 scrap_defective (전부 폐기)
            inventory_svc.scrap_defective(
                db, item_id, qty, line.from_department,
                reason_category=reason_cat or "기타",
                reason_memo=reason_memo_val,
                actor=approver.name,
            )
        quantity_change = -qty
        # 분해는 서비스 함수가 자체 로그 생성 — 추가 TransactionLog 불필요
        # (아래 TransactionLog 생성 구문은 _TX_TYPE_BY_REQUEST 로 DISASSEMBLE 로 기록됨)
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
            operation_batch_id=getattr(request, "operation_batch_id", None),
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
    lines = list(lines)
    # 정렬된 순서로 모든 아이템 선락 → 교착 방지 (PostgreSQL only; SQLite는 WAL 직렬화)
    if not _is_sqlite:
        all_item_ids = sorted({line.item_id for line in lines})
        inventory_svc.lock_inventories(db, all_item_ids)
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

    # 이미 완료된 경우 멱등 반환 (중복 승인 클릭 / 동시 승인 2번째 요청)
    if request.status == StockRequestStatusEnum.COMPLETED:
        return request
    if request.status not in (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED):
        raise ValueError(f"승인할 수 없는 상태입니다: {request.status.value}")
    if not request.requires_warehouse_approval:
        raise ValueError("승인이 필요하지 않은 요청입니다.")

    now = datetime.utcnow()
    # 창고 결재 기록 (감사용 — dept 결재 대기 중에도 노출).
    request.approved_by_employee_id = approver.employee_id
    request.approved_by_name = approver.name
    request.approved_at = now

    # 부서 결재가 아직 필요한 경우 — 실행 없이 status 유지 (SUBMITTED/RESERVED).
    if (
        request.requires_department_approval
        and request.department_approved_by_employee_id is None
    ):
        return request

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
    request.completed_at = now
    for line in request.lines:
        line.status = StockRequestStatusEnum.COMPLETED

    from app.services import io as io_svc

    io_svc.sync_batch_from_stock_request(db, request)

    return request


def approve_request_department(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
) -> StockRequest:
    """부서 결재 승인.

    - actor: department_role in {primary, deputy} 또는 admin
    - actor.department == request.requester_department (다른 부서 결재 불가)
    - MANUAL_ADJUSTMENT 단독: 승인 즉시 io_svc.execute_batch_after_dept_approval 호출
    - 듀얼(창고+부서): 양쪽 모두 충족 시 _execute_all_lines, 아니면 status 유지
    """
    if not request.requires_department_approval:
        raise ValueError("부서 결재가 필요하지 않은 요청입니다.")

    # 결재 권한 (그릴 합의 — docs/defect-handling-redesign.md):
    #   - 부서 정/부: 생산 라인 6개(튜브/고압/진공/튜닝/조립/출하) 결재
    #   - 창고 정/부: 모든 부서 결재
    #   - admin: 모든 부서 결재
    # 사람 이름 박지 않음. 자세한 룰은 `dept_hierarchy.can_approve_department`.
    if not can_approve_department(approver, request.requester_department):
        raise PermissionError(
            "결재 권한이 없습니다 (부서 정/부 또는 창고 정/부 필요)."
        )
    if not verify_pin(approver.pin_hash, pin):
        raise PermissionError("PIN이 일치하지 않습니다.")

    if request.status == StockRequestStatusEnum.COMPLETED:
        return request
    if request.status not in (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED):
        raise ValueError(f"승인할 수 없는 상태입니다: {request.status.value}")
    if request.department_approved_by_employee_id is not None:
        raise ValueError("이미 부서 결재가 완료된 요청입니다.")

    now = datetime.utcnow()
    request.department_approved_by_employee_id = approver.employee_id
    request.department_approved_by_name = approver.name
    request.department_approved_at = now

    # 창고 결재가 아직 필요한 경우 — 실행 없이 status 유지.
    if (
        request.requires_warehouse_approval
        and request.approved_by_employee_id is None
    ):
        return request

    # 실행 경로 분기
    from app.services import io as io_svc

    if request.request_type == StockRequestTypeEnum.MANUAL_ADJUSTMENT:
        # io.py 가 원본 IoBatch 라인을 _apply_line 식으로 실행.
        io_svc.execute_batch_after_dept_approval(db, request=request, approver=approver)
    else:
        # 듀얼 승인 케이스 — _execute_all_lines.
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
            raise FailedApprovalError(str(exc))

    request.status = StockRequestStatusEnum.COMPLETED
    request.completed_at = now
    for line in request.lines:
        line.status = StockRequestStatusEnum.COMPLETED

    io_svc.sync_batch_from_stock_request(db, request)
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
    from app.services import io as io_svc

    io_svc.sync_batch_from_stock_request(db, request)
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
    # 이미 반려된 경우 멱등 반환
    if request.status == StockRequestStatusEnum.REJECTED:
        return request
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
    from app.services import io as io_svc

    io_svc.sync_batch_from_stock_request(db, request)
    return request


def reject_request_department(
    db: Session,
    request: StockRequest,
    *,
    approver: Employee,
    pin: str,
    reason: str,
) -> StockRequest:
    """부서 결재 반려. 권한/부서 매칭 + PIN + 사유 필수."""
    if not request.requires_department_approval:
        raise ValueError("부서 결재가 필요하지 않은 요청입니다.")

    dept_role = (getattr(approver, "department_role", None) or "none").lower()
    level = getattr(getattr(approver, "level", None), "value", approver.level)
    if dept_role not in ("primary", "deputy") and level != "admin":
        raise PermissionError("부서 결재 정/부 권한이 없습니다.")
    if approver.department != request.requester_department:
        raise PermissionError("다른 부서의 요청은 반려할 수 없습니다.")
    if not verify_pin(approver.pin_hash, pin):
        raise PermissionError("PIN이 일치하지 않습니다.")
    if not reason or not reason.strip():
        raise ValueError("반려 사유를 입력하세요.")

    if request.status == StockRequestStatusEnum.REJECTED:
        return request
    if request.status not in (StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.SUBMITTED):
        raise ValueError(f"반려할 수 없는 상태입니다: {request.status.value}")

    # warehouse-reserved 라인 점유 원복 (MANUAL_ADJUSTMENT 는 점유 없음 — release_reservation 가 no-op).
    release_reservation(db, request)

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.REJECTED
    request.rejected_by_employee_id = approver.employee_id
    request.rejected_by_name = approver.name
    request.rejected_at = now
    request.rejected_reason = reason.strip()
    for line in request.lines:
        line.status = StockRequestStatusEnum.REJECTED
    from app.services import io as io_svc

    io_svc.sync_batch_from_stock_request(db, request)
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
    # 이미 취소된 경우 멱등 반환
    if request.status == StockRequestStatusEnum.CANCELLED:
        return request
    if request.status in (
        StockRequestStatusEnum.COMPLETED,
        StockRequestStatusEnum.REJECTED,
        StockRequestStatusEnum.FAILED_APPROVAL,
    ):
        raise ValueError(f"취소할 수 없는 상태입니다: {request.status.value}")

    release_reservation(db, request)

    now = datetime.utcnow()
    request.status = StockRequestStatusEnum.CANCELLED
    request.cancelled_at = now
    for line in request.lines:
        line.status = StockRequestStatusEnum.CANCELLED
    from app.services import io as io_svc

    io_svc.sync_batch_from_stock_request(db, request)
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


class RequestNotFoundError(LookupError):
    """request_id 가 존재하지 않을 때."""
