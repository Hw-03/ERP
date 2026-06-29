"""StockRequest 서비스 — 작업자 결재 요청 흐름.

원칙:
- 창고 재고가 움직이는 모든 작업(`from_bucket=='warehouse'` 또는 `to_bucket=='warehouse'`)은
  창고 담당자(`warehouse_role in ('primary','deputy')`)의 승인 후에만 실재고 반영.
- 점유는 `Inventory.pending_quantity` 컬럼으로 관리하고, origin 구분은
  `StockRequestLine` 조회로 한다 (별도 컬럼 추가하지 않음).
- 승인은 한 트랜잭션 내에서 release + 실재고 이동 + TransactionLog 기록을 모두 수행한다.
  성공하면 `completed`, 검증 실패하면 `failed_approval` 로 저장하고 pending 을 안전하게 원복.
- 승인 불필요 작업(`production ↔ production`)은 즉시 실행되고 `completed` 상태로 기록.

구현은 책임별 서브모듈로 분리됨:
  sr_validation  — 정책 상수/함수, LineInput, shape/수량 검증, preflight 재고 확인
  sr_execution   — 점유 해제, 라인 실행(재고 이동 + TransactionLog), 제출 분기
  sr_draft       — DRAFT 장바구니 CRUD
  sr_approval    — 승인/반려/취소

이 모듈은 하위 호환성을 위한 re-export 레이어이며,
라우터는 `from app.services import stock_requests as svc` 패턴을 그대로 사용한다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from app.models import (
    Employee,
    Item,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.services import inventory as inventory_svc
from app.repositories import item_repository

# ---------------------------------------------------------------------------
# re-export: sr_validation
# ---------------------------------------------------------------------------
from app.services.sr_validation import (  # noqa: F401
    _TX_TYPE_BY_REQUEST,
    _ALLOWED_SHAPES,
    MANUAL_LINE_ORIGINS,
    LineInput,
    _generate_request_code,
    _validate_lines,
    _preflight_defective_check,
    _preflight_inventory_check,
    line_requires_approval,
    line_requires_pending,
    request_requires_approval,
    validate_line_shape_for_request_type,
)

# ---------------------------------------------------------------------------
# re-export: sr_execution
# ---------------------------------------------------------------------------
from app.services.sr_execution import (  # noqa: F401
    _bucket_label,
    _execute_all_lines,
    _execute_line,
    _finalize_submission,
    release_reservation,
)

# ---------------------------------------------------------------------------
# re-export: sr_draft
# ---------------------------------------------------------------------------
from app.services.sr_draft import (  # noqa: F401
    RequestNotFoundError,
    delete_draft_request,
    get_draft_request,
    list_draft_requests,
    submit_draft_request,
    upsert_draft_request,
)

# ---------------------------------------------------------------------------
# re-export: sr_approval
# ---------------------------------------------------------------------------
from app.services.sr_approval import (  # noqa: F401
    FailedApprovalError,
    approve_request,
    approve_request_department,
    cancel_open_stock_requests,
    cancel_request,
    mark_failed_approval,
    reject_request,
    reject_request_department,
)


# ---------------------------------------------------------------------------
# 내부 헬퍼 — create_request / submit_draft_request 공통 단계
# ---------------------------------------------------------------------------


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
        item = item_repository.get(db, li.item_id)
        if item is None:
            raise ValueError(f"품목을 찾을 수 없습니다: {li.item_id}")
        line = StockRequestLine(
            request_id=request.request_id,
            item_id=li.item_id,
            item_name_snapshot=item.item_name,
            mes_code_snapshot=item.mes_code,
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
    # 불량 격리/처리 결재 룰: 격리 출처가 "창고" 면 창고 정/부 결재, 그 외 부서면 그 부서 정/부 결재.
    # 정/부 권한자 직접 처리 시 _finalize_submission 이 즉시 완료로 흡수 — 별도 분기 불필요.
    _DEFECT_TYPES = {
        StockRequestTypeEnum.MARK_DEFECTIVE_WH,
        StockRequestTypeEnum.MARK_DEFECTIVE_PROD,
        StockRequestTypeEnum.DEFECT_SCRAP,
        StockRequestTypeEnum.DEFECT_RETURN,
        StockRequestTypeEnum.DEFECT_DISASSEMBLE,
        # R 정상 재고 바로 폐기/반품 — 기존 불량 처리와 동일하게 즉시 처리(결재 없음)로 통일.
        StockRequestTypeEnum.SCRAP_NORMAL,
        StockRequestTypeEnum.RETURN_NORMAL,
        StockRequestTypeEnum.REWORK_NORMAL,
    }
    warehouse_override: Optional[bool] = None
    if request_type in _DEFECT_TYPES:
        warehouse_override = False
        requires_department_approval = False

    _validate_lines(request_type, lines_input)
    _preflight_inventory_check(db, request_type, lines_input)
    _preflight_defective_check(db, lines_input)
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
        requires_warehouse_approval_override=warehouse_override,
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
# 점유 조회
# ---------------------------------------------------------------------------


def list_active_reservations(db: Session, item_id: uuid.UUID) -> list[StockRequestLine]:
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
