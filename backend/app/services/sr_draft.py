"""StockRequest 드래프트(장바구니) 관련 함수."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Sequence

from sqlalchemy.orm import Session

from app.models import (
    Employee,
    Item,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)
from app.services.sr_validation import (
    LineInput,
    _generate_request_code,
    _validate_lines,
    _preflight_inventory_check,
    _preflight_defective_check,
    line_requires_approval,
)


class RequestNotFoundError(LookupError):
    """request_id 가 존재하지 않을 때."""


def upsert_draft_request(
    db: Session,
    *,
    requester: Employee,
    request_type: StockRequestTypeEnum,
    lines_input: Sequence[LineInput],
    reference_no: Optional[str],
    notes: Optional[str],
    reason_category: Optional[str] = None,
    reason_memo: Optional[str] = None,
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
        existing.reason_category = reason_category
        existing.reason_memo = reason_memo
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
                    mes_code_snapshot=item.mes_code,
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
    # _build_request_and_lines 는 stock_requests.py 에 있으나 순환 import 방지를 위해
    # 지연 import 사용.
    from app.services.stock_requests import _build_request_and_lines
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
        reason_category=reason_category,
        reason_memo=reason_memo,
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
    _preflight_defective_check(db, line_inputs)

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

    from app.services.sr_execution import _finalize_submission
    return _finalize_submission(db, request=request, requester=requester, now=now)
