"""StockRequest 실행 함수 — 점유 해제, 라인 실행(재고 이동 + TransactionLog), 제출 분기."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.database import _is_sqlite
from app.models import (
    Employee,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestTypeEnum,
    StockRequestStatusEnum,
    TransactionLog,
)
from app.services import inventory as inventory_svc
from app.services import inv_effect
from app.services.sr_validation import (
    _TX_TYPE_BY_REQUEST,
    line_requires_pending,
)


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


# ---------------------------------------------------------------------------
# 요청 타입별 라인 핸들러 — 실재고 이동 후 quantity_change(재고 증감) 반환.
# 각 핸들러는 동일 시그니처(db, request, line, approver, qty, item_id) → Decimal.
# 디스패치 테이블 _LINE_HANDLERS 로 request_type → 핸들러를 매핑한다.
# ---------------------------------------------------------------------------

_NO_QTY_CHANGE = Decimal("0")  # 총량 보존 이동(부서/격리 간 이동)의 quantity_change
_DEFAULT_REASON_CATEGORY = "기타"  # reason_category 미지정 시 폐기/반품 로그 기본값


def _source_from_bucket(line: StockRequestLine) -> str:
    """from_bucket 이 창고면 'warehouse', 그 외(생산)면 'production'."""
    return "warehouse" if line.from_bucket == RequestBucketEnum.WAREHOUSE else "production"


def _handle_raw_receive(db, request, line, approver, qty, item_id) -> Decimal:
    inventory_svc.receive_confirmed(db, item_id, qty, bucket="warehouse")
    return qty


def _handle_raw_ship(db, request, line, approver, qty, item_id) -> Decimal:
    inventory_svc.consume_warehouse(db, item_id, qty)
    return -qty


def _handle_warehouse_to_dept(db, request, line, approver, qty, item_id) -> Decimal:
    if line.to_department is None:
        raise ValueError("창고→부서 이동은 도착 부서가 필요합니다.")
    inventory_svc.transfer_to_production(db, item_id, qty, line.to_department)
    return _NO_QTY_CHANGE


def _handle_dept_to_warehouse(db, request, line, approver, qty, item_id) -> Decimal:
    if line.from_department is None:
        raise ValueError("부서→창고 복귀는 출발 부서가 필요합니다.")
    inventory_svc.transfer_to_warehouse(db, item_id, qty, line.from_department)
    return _NO_QTY_CHANGE


def _handle_dept_internal(db, request, line, approver, qty, item_id) -> Decimal:
    if line.from_department is None or line.to_department is None:
        raise ValueError("부서 내부 이동은 출발/도착 부서가 모두 필요합니다.")
    inventory_svc.transfer_between_departments(
        db, item_id, qty, line.from_department, line.to_department
    )
    return _NO_QTY_CHANGE


def _handle_mark_defective_wh(db, request, line, approver, qty, item_id) -> Decimal:
    if line.to_department is None:
        raise ValueError("창고발 불량 등록은 격리 부서가 필요합니다.")
    inventory_svc.mark_defective(
        db, item_id, qty,
        inventory_svc.DefectSource(kind="warehouse", target_dept=line.to_department),
    )
    return _NO_QTY_CHANGE


def _handle_mark_defective_prod(db, request, line, approver, qty, item_id) -> Decimal:
    if line.from_department is None or line.to_department is None:
        raise ValueError("생산발 불량 등록은 출발/격리 부서가 필요합니다.")
    inventory_svc.mark_defective(
        db,
        item_id,
        qty,
        inventory_svc.DefectSource(
            kind="production",
            source_dept=line.from_department,
            target_dept=line.to_department,
        ),
    )
    return _NO_QTY_CHANGE


def _handle_supplier_return(db, request, line, approver, qty, item_id) -> Decimal:
    if line.from_department is None:
        raise ValueError("공급업체 반품은 출발 부서가 필요합니다.")
    inventory_svc.return_to_supplier(db, item_id, qty, line.from_department)
    return -qty


def _handle_package_out(db, request, line, approver, qty, item_id) -> Decimal:
    # 라인별로 창고에서 출고
    inventory_svc.consume_warehouse(db, item_id, qty)
    return -qty


def _handle_defect_scrap(db, request, line, approver, qty, item_id) -> Decimal:
    # 격리 항목 폐기 — from_department 에서 DEFECTIVE 차감
    if line.from_department is None:
        raise ValueError("격리 항목 폐기는 from_department 가 필요합니다.")
    reason_cat = request.reason_category or ""
    reason_memo = request.reason_memo or (request.notes or "")
    actor_name = approver.name
    inventory_svc.scrap_defective(
        db, item_id, qty, line.from_department,
        inventory_svc.ReasonContext(
            category=reason_cat or _DEFAULT_REASON_CATEGORY,
            memo=reason_memo,
            actor=actor_name,
        ),
    )
    return -qty


def _handle_defect_return(db, request, line, approver, qty, item_id) -> Decimal:
    # 격리 항목 공급처 반품 — from_department 에서 DEFECTIVE 차감
    if line.from_department is None:
        raise ValueError("격리 항목 공급처 반품은 from_department 가 필요합니다.")
    reason_cat = request.reason_category or ""
    reason_memo_val = request.reason_memo or (request.notes or "")
    actor_name = approver.name
    inventory_svc.return_to_supplier(db, item_id, qty, line.from_department)
    return -qty


def _handle_scrap_normal(db, request, line, approver, qty, item_id) -> Decimal:
    # R 정상 재고 바로 폐기 — 격리 미경유. 창고면 warehouse, 부서면 PRODUCTION 차감.
    source = _source_from_bucket(line)
    inventory_svc.scrap_normal(
        db, item_id, qty,
        inventory_svc.NormalSource(kind=source, dept_or_warehouse=line.from_department),
        inventory_svc.ReasonContext(
            category=request.reason_category or _DEFAULT_REASON_CATEGORY,
            memo=request.reason_memo or (request.notes or ""),
            actor=approver.name,
            actor_employee_id=approver.employee_id,
        ),
    )
    return -qty


def _handle_return_normal(db, request, line, approver, qty, item_id) -> Decimal:
    # R 정상 재고 바로 공급처 반품 — 격리 미경유.
    source = _source_from_bucket(line)
    inventory_svc.return_to_supplier_from_normal(
        db, item_id, qty,
        inventory_svc.NormalSource(
            kind=source, dept_or_warehouse=line.from_department, supplier_name=""
        ),
        inventory_svc.ReasonContext(
            category=request.reason_category or _DEFAULT_REASON_CATEGORY,
            memo=request.reason_memo or (request.notes or ""),
            actor=approver.name,
        ),
    )
    return -qty


def _handle_defect_disassemble(db, request, line, approver, qty, item_id) -> Decimal:
    # 분해 처리 — notes 에서 child_decisions JSON 추출 후 submit_defective_disassemble 호출.
    # 분해 시 부모 1라인만 있고 자식 결정은 request.notes 에 JSON 직렬화되어 있다.
    import json
    from app.services.dept_adjustment import submit_defective_disassemble
    if line.from_department is None:
        raise ValueError("분해 처리는 from_department 가 필요합니다.")
    reason_cat = request.reason_category or ""
    reason_memo_val = request.reason_memo or ""
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
            reason_category=reason_cat or _DEFAULT_REASON_CATEGORY,
            reason_memo=reason_memo_val,
            actor=approver.name,
        )
    else:
        # child_decisions 없으면 단순 scrap_defective (전부 폐기)
        inventory_svc.scrap_defective(
            db, item_id, qty, line.from_department,
            inventory_svc.ReasonContext(
                category=reason_cat or _DEFAULT_REASON_CATEGORY,
                memo=reason_memo_val,
                actor=approver.name,
            ),
        )
    # 분해는 서비스 함수가 자체 로그 생성 — 추가 TransactionLog 불필요
    # (아래 TransactionLog 생성 구문은 _TX_TYPE_BY_REQUEST 로 DISASSEMBLE 로 기록됨)
    return -qty


# request_type → 라인 핸들러 디스패치 테이블.
_LINE_HANDLERS = {
    StockRequestTypeEnum.RAW_RECEIVE: _handle_raw_receive,
    StockRequestTypeEnum.RAW_SHIP: _handle_raw_ship,
    StockRequestTypeEnum.WAREHOUSE_TO_DEPT: _handle_warehouse_to_dept,
    StockRequestTypeEnum.DEPT_TO_WAREHOUSE: _handle_dept_to_warehouse,
    StockRequestTypeEnum.DEPT_INTERNAL: _handle_dept_internal,
    StockRequestTypeEnum.MARK_DEFECTIVE_WH: _handle_mark_defective_wh,
    StockRequestTypeEnum.MARK_DEFECTIVE_PROD: _handle_mark_defective_prod,
    StockRequestTypeEnum.SUPPLIER_RETURN: _handle_supplier_return,
    StockRequestTypeEnum.PACKAGE_OUT: _handle_package_out,
    StockRequestTypeEnum.DEFECT_SCRAP: _handle_defect_scrap,
    StockRequestTypeEnum.DEFECT_RETURN: _handle_defect_return,
    StockRequestTypeEnum.SCRAP_NORMAL: _handle_scrap_normal,
    StockRequestTypeEnum.RETURN_NORMAL: _handle_return_normal,
    StockRequestTypeEnum.DEFECT_DISASSEMBLE: _handle_defect_disassemble,
}


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
    cells_before = inv_effect.snapshot_cells(db, item_id)

    handler = _LINE_HANDLERS.get(rt)
    if handler is None:
        raise ValueError(f"지원하지 않는 요청 유형: {rt}")
    quantity_change: Decimal = handler(db, request, line, approver, qty, item_id)

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
    if request.notes and rt != StockRequestTypeEnum.DEFECT_DISASSEMBLE:
        note += f" / 비고: {request.notes}"

    # DEFECT_DISASSEMBLE: submit_defective_disassemble 이 이미 부모 DISASSEMBLE 로그를 생성함.
    # 여기서 중복 생성하면 "분해|출고" 행이 별도로 나타남 — 건너뜀.
    if rt == StockRequestTypeEnum.DEFECT_DISASSEMBLE:
        return

    db.add(
        TransactionLog(
            item_id=item_id,
            transaction_type=_TX_TYPE_BY_REQUEST[rt],
            quantity_change=quantity_change,
            quantity_before=qty_before,
            quantity_after=qty_after,
            reference_no=request.request_code,
            produced_by=approver.name,
            producer_employee_id=approver.employee_id,
            notes=note,
            operation_batch_id=getattr(request, "operation_batch_id", None),
            department=str(line.from_department) if line.from_department else None,
            inventory_effect=inv_effect.capture_effect(db, item_id, cells_before),
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
# 제출 분기 — create_request / submit_draft_request 공통
# ---------------------------------------------------------------------------


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
        # 결재권자가 본인 요청을 자가승인한 경우(창고 primary/deputy, 부서장 등)만 approved_by 기록.
        # 결재 자체가 불필요한 타입(불량 전체 등 requires_*=False)은 approved_by = null 유지 —
        # 같은 사람이 요청자·승인자로 동시에 표시되는 혼란 방지.
        requester_self_approved = (
            (request.requires_warehouse_approval and requester_role in ("primary", "deputy"))
            or (request.requires_department_approval and requester_dept_role in ("primary", "deputy"))
            or is_admin
        )
        if requester_self_approved:
            request.approved_by_employee_id = requester.employee_id
            request.approved_by_name = requester.name
            if request.requires_department_approval:
                request.department_approved_by_employee_id = requester.employee_id
                request.department_approved_by_name = requester.name
                request.department_approved_at = now
        request.approved_at = now
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
