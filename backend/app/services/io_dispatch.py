"""제출 분기 — 창고 결재 / 부서 결재 / 즉시 반영 + 실재고 적용 + 로그.

io_preview / io_persist 의 헬퍼와 inventory / stock_requests 서비스를 모두 조합한다.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Iterable, Optional, Sequence
import uuid

from sqlalchemy.orm import Session

from app.models import (
    Employee,
    IoBatch,
    IoLine,
    RequestBucketEnum,
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services import inventory as inventory_svc
from app.services import stock_requests as stock_request_svc
from app.services.io_preview import (
    APPROVAL_SUB_TYPES,
    MANUAL_LINE_ORIGINS,
    _bucket_available,
    _d,
    _get_item,
)
from app.services.io_persist import (
    _batch_to_payload,
    _load_requester,
    _persist_batch,
)


def _included_lines(batch: IoBatch) -> list[IoLine]:
    return [line for bundle in batch.bundles for line in bundle.lines if line.included]


def _fmt_qty(d: Decimal) -> str:
    """Decimal → 사용자 표시용 문자열. 소수점 trailing 0 제거. 예: 2.0000 → '2', 1.5000 → '1.5'."""
    n = d.normalize()
    s = format(n, "f")
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s or "0"


def _validate_included_lines(db: Session, lines: Sequence[IoLine]) -> None:
    if not lines:
        raise ValueError("실제 반영할 품목이 없습니다.")
    needed: dict[tuple[str, Optional[str], uuid.UUID], Decimal] = {}
    # 같은 (bucket, dept, item) 키에 기여한 (bundle_title, quantity) 목록 — 부족 시 출처 표시용.
    contributors: dict[tuple[str, Optional[str], uuid.UUID], list[tuple[str, Decimal]]] = {}
    for line in lines:
        qty = _d(line.quantity)
        if qty <= 0:
            raise ValueError("체크된 라인의 수량은 0보다 커야 합니다.")
        if line.from_bucket == "none":
            continue
        key = (line.from_bucket, line.from_department, line.item_id)
        needed[key] = needed.get(key, Decimal("0")) + qty
        bundle_title = line.bundle.title_snapshot if line.bundle else "?"
        contributors.setdefault(key, []).append((bundle_title, qty))
    for (bucket, department, item_id), qty in needed.items():
        available = _bucket_available(db, item_id=item_id, bucket=bucket, department=department)
        if available < qty:
            item = _get_item(db, item_id)
            # 합산 출처 — bundle 단위로 다시 묶어 큰 순으로 정렬, 상위 3개 까지만 노출.
            by_bundle: dict[str, Decimal] = {}
            for title, q in contributors.get((bucket, department, item_id), []):
                by_bundle[title] = by_bundle.get(title, Decimal("0")) + q
            ordered = sorted(by_bundle.items(), key=lambda kv: kv[1], reverse=True)
            shortfall = _fmt_qty(qty - available)
            header = (
                f"재고 부족: {item.item_name}\n"
                f"가능 {_fmt_qty(available)} / 요청 {_fmt_qty(qty)} ({shortfall} 부족)"
            )
            if ordered:
                bullets = "\n".join(f"  • {t}: {_fmt_qty(q)}" for t, q in ordered[:3])
                more = f"\n  • 외 {len(ordered) - 3}건" if len(ordered) > 3 else ""
                raise ValueError(f"{header}\n{bullets}{more}")
            raise ValueError(header)


def _stock_request_type(sub_type: str, *, from_bucket: Optional[str] = None) -> StockRequestTypeEnum:
    if sub_type == "warehouse_to_dept":
        return StockRequestTypeEnum.WAREHOUSE_TO_DEPT
    if sub_type == "dept_to_warehouse":
        return StockRequestTypeEnum.DEPT_TO_WAREHOUSE
    if sub_type == "defect_quarantine":
        # _resolve_line_route(defect_quarantine) 가 부서 격리는 PRODUCTION, 창고 격리는 WAREHOUSE 로 분기.
        if from_bucket == "production":
            return StockRequestTypeEnum.MARK_DEFECTIVE_PROD
        return StockRequestTypeEnum.MARK_DEFECTIVE_WH
    raise ValueError(f"승인 요청으로 처리할 수 없는 작업입니다: {sub_type}")


def _request_bucket(value: str) -> RequestBucketEnum:
    return RequestBucketEnum(value)


def _link_stock_request(db: Session, *, batch: IoBatch, request: StockRequest, lines: Sequence[IoLine]) -> None:
    request.operation_batch_id = batch.batch_id
    batch.stock_request_id = request.request_id
    # 창고 또는 부서 결재 어느 쪽이든 필요하면 결재 대기로 표시.
    batch.requires_approval = bool(
        request.requires_warehouse_approval or request.requires_department_approval
    )
    if request.status == StockRequestStatusEnum.COMPLETED:
        batch.status = "completed"
        batch.completed_at = request.completed_at or datetime.utcnow()
    elif request.status == StockRequestStatusEnum.RESERVED:
        batch.status = "reserved"
    else:
        batch.status = "submitted"

    included_by_order = list(lines)
    for request_line, io_line in zip(request.lines, included_by_order):
        request_line.operation_line_id = io_line.line_id

    if request.request_code:
        # SessionLocal(autoflush=False) — _execute_all_lines 의 마지막 라인이 db.add() 만 하고
        # 아직 INSERT 전인 상태로 세션에 떠 있다(직전 라인들은 다음 iteration 의 inventory 함수
        # db.flush() 가 강제로 보냈지만 last 만 flush 트리거가 없음). UPDATE 전에 명시적
        # flush 해야 마지막 TransactionLog 까지 INSERT 되어 매치 대상이 됨.
        db.flush()
        db.query(TransactionLog).filter(
            TransactionLog.reference_no == request.request_code,
            TransactionLog.operation_batch_id.is_(None),
        ).update(
            {TransactionLog.operation_batch_id: batch.batch_id},
            synchronize_session=False,
        )
    db.flush()


def _has_manual_line(lines: Iterable[IoLine]) -> bool:
    return any((getattr(line, "origin", None) or "") in MANUAL_LINE_ORIGINS for line in lines)


def _submit_approval(
    db: Session, *, requester: Employee, batch: IoBatch, force_dept_approval: bool = False
) -> None:
    lines = _included_lines(batch)
    _validate_included_lines(db, lines)
    inputs = [
        stock_request_svc.LineInput(
            item_id=line.item_id,
            quantity=line.quantity,
            from_bucket=_request_bucket(line.from_bucket),
            from_department=line.from_department,
            to_bucket=_request_bucket(line.to_bucket),
            to_department=line.to_department,
        )
        for line in lines
    ]
    request = stock_request_svc.create_request(
        db,
        requester=requester,
        request_type=_stock_request_type(
            batch.sub_type,
            from_bucket=lines[0].from_bucket if lines else None,
        ),
        lines_input=inputs,
        reference_no=batch.reference_no,
        notes=batch.notes,
        requires_department_approval=force_dept_approval,
    )
    _link_stock_request(db, batch=batch, request=request, lines=lines)


def _submit_dept_only_approval(db: Session, *, requester: Employee, batch: IoBatch) -> None:
    """낱개(manual/adjust) 라인이 포함된 비-APPROVAL_SUB_TYPES 배치 — 부서 결재만 필요.

    실재고 반영은 부서 결재 통과 후 execute_batch_after_dept_approval 가 수행.
    요청자 본인이 부서 결재 정/부 권한자라면 즉시 실행한다.
    """
    lines = _included_lines(batch)
    _validate_included_lines(db, lines)
    inputs = [
        stock_request_svc.LineInput(
            item_id=line.item_id,
            quantity=line.quantity,
            from_bucket=_request_bucket(line.from_bucket),
            from_department=line.from_department,
            to_bucket=_request_bucket(line.to_bucket),
            to_department=line.to_department,
        )
        for line in lines
    ]
    request = stock_request_svc.create_manual_adjustment_request(
        db,
        requester=requester,
        lines_input=inputs,
        reference_no=batch.reference_no,
        notes=batch.notes,
    )
    _link_stock_request(db, batch=batch, request=request, lines=lines)

    # 자가승인 경로 — create_manual_adjustment_request 가 dept_approved 를 이미 마크했으면 즉시 실행.
    if request.department_approved_by_employee_id is not None:
        for line in sorted(lines, key=lambda line: 0 if line.direction == "out" else 1):
            _apply_line(db, batch=batch, line=line, requester=requester)
        now = datetime.utcnow()
        request.status = StockRequestStatusEnum.COMPLETED
        request.completed_at = now
        for req_line in request.lines:
            req_line.status = StockRequestStatusEnum.COMPLETED
        batch.status = "completed"
        batch.completed_at = now
        batch.updated_at = now
        db.flush()


def execute_batch_after_dept_approval(
    db: Session, *, request: StockRequest, approver: Employee
) -> None:
    """MANUAL_ADJUSTMENT StockRequest 의 부서 결재 통과 후 실재고 반영.

    stock_requests.approve_request_department 가 status/completed 마킹 직전에 호출.
    """
    batch_id = getattr(request, "operation_batch_id", None)
    if batch_id is None:
        raise ValueError("배치가 연결되지 않은 결재 요청입니다.")
    batch = db.query(IoBatch).filter(IoBatch.batch_id == batch_id).first()
    if batch is None:
        raise ValueError("작업 묶음을 찾을 수 없습니다.")

    lines = _included_lines(batch)
    _validate_included_lines(db, lines)
    # 부서 결재로 권한 검증이 이미 완료된 시점이므로 ship 권한 재검증 생략.
    for line in sorted(lines, key=lambda line: 0 if line.direction == "out" else 1):
        _apply_line(db, batch=batch, line=line, requester=approver)
    now = datetime.utcnow()
    batch.status = "completed"
    batch.completed_at = now
    batch.updated_at = now
    db.flush()


def _log_immediate(
    db: Session,
    *,
    batch: IoBatch,
    line: IoLine,
    tx_type: TransactionTypeEnum,
    quantity_change: Decimal,
    before: Decimal,
    after: Decimal,
    operator_name: str,
) -> None:
    db.add(
        TransactionLog(
            item_id=line.item_id,
            transaction_type=tx_type,
            quantity_change=quantity_change,
            quantity_before=before,
            quantity_after=after,
            transfer_qty=line.quantity if line.direction in ("move", "defective") else None,
            reference_no=batch.reference_no,
            produced_by=operator_name,
            notes=batch.notes,
            operation_batch_id=batch.batch_id,
        )
    )


# 버킷 이름 — IoLine.from_bucket / to_bucket 가 가질 수 있는 값.
_BUCKET_PRODUCTION = "production"
_BUCKET_WAREHOUSE = "warehouse"
_BUCKET_DEFECTIVE = "defective"
_BUCKET_NONE = "none"


def _apply_in(db: Session, line: IoLine, qty: Decimal) -> tuple[TransactionTypeEnum, Decimal]:
    bucket = _BUCKET_PRODUCTION if line.to_bucket == _BUCKET_PRODUCTION else _BUCKET_WAREHOUSE
    inventory_svc.receive_confirmed(
        db,
        line.item_id,
        qty,
        bucket=bucket,
        dept=line.to_department,
    )
    tx_type = (
        TransactionTypeEnum.PRODUCE if bucket == _BUCKET_PRODUCTION else TransactionTypeEnum.RECEIVE
    )
    return tx_type, qty


def _apply_out(db: Session, line: IoLine, qty: Decimal) -> tuple[TransactionTypeEnum, Decimal]:
    if line.from_bucket == _BUCKET_WAREHOUSE:
        inventory_svc.consume_warehouse(db, line.item_id, qty)
        tx_type = TransactionTypeEnum.SHIP
    elif line.from_bucket == _BUCKET_DEFECTIVE:
        inventory_svc.return_to_supplier(db, line.item_id, qty, line.from_department)
        tx_type = TransactionTypeEnum.SUPPLIER_RETURN
    else:
        inventory_svc.consume_from_department(db, line.item_id, qty, line.from_department)
        tx_type = TransactionTypeEnum.BACKFLUSH
    return tx_type, -qty


def _apply_move(db: Session, line: IoLine, qty: Decimal) -> tuple[TransactionTypeEnum, Decimal]:
    if line.from_bucket == _BUCKET_PRODUCTION and line.to_bucket == _BUCKET_PRODUCTION:
        inventory_svc.transfer_between_departments(
            db, line.item_id, qty, line.from_department, line.to_department
        )
        tx_type = TransactionTypeEnum.TRANSFER_DEPT
    elif line.from_bucket == _BUCKET_WAREHOUSE:
        inventory_svc.transfer_to_production(db, line.item_id, qty, line.to_department)
        tx_type = TransactionTypeEnum.TRANSFER_TO_PROD
    else:
        inventory_svc.transfer_to_warehouse(db, line.item_id, qty, line.from_department)
        tx_type = TransactionTypeEnum.TRANSFER_TO_WH
    return tx_type, Decimal("0")


def _apply_defective(db: Session, line: IoLine, qty: Decimal) -> tuple[TransactionTypeEnum, Decimal]:
    inventory_svc.mark_defective(
        db,
        line.item_id,
        qty,
        source=line.from_bucket,
        source_dept=line.from_department,
        target_dept=line.to_department,
    )
    return TransactionTypeEnum.MARK_DEFECTIVE, Decimal("0")


def _apply_adjust(db: Session, line: IoLine, qty: Decimal) -> tuple[TransactionTypeEnum, Decimal]:
    if line.to_bucket == _BUCKET_PRODUCTION and line.from_bucket == _BUCKET_NONE:
        inventory_svc.receive_confirmed(
            db,
            line.item_id,
            qty,
            bucket=_BUCKET_PRODUCTION,
            dept=line.to_department,
        )
        quantity_change = qty
    elif line.from_bucket == _BUCKET_PRODUCTION and line.to_bucket == _BUCKET_NONE:
        inventory_svc.consume_from_department(
            db, line.item_id, qty, line.from_department
        )
        quantity_change = -qty
    else:
        raise ValueError(
            f"잘못된 adjust 라인 구성: from={line.from_bucket} to={line.to_bucket}"
        )
    return TransactionTypeEnum.ADJUST, quantity_change


def _apply_line(db: Session, *, batch: IoBatch, line: IoLine, requester: Employee) -> None:
    qty = _d(line.quantity)
    inv = inventory_svc.get_or_create_inventory(db, line.item_id)
    before = _d(inv.quantity)

    if line.direction == "in":
        tx_type, quantity_change = _apply_in(db, line, qty)
    elif line.direction == "out":
        tx_type, quantity_change = _apply_out(db, line, qty)
    elif line.direction == "move":
        tx_type, quantity_change = _apply_move(db, line, qty)
    elif line.direction == "defective":
        tx_type, quantity_change = _apply_defective(db, line, qty)
    elif line.direction == "adjust":
        tx_type, quantity_change = _apply_adjust(db, line, qty)
    else:
        raise ValueError(f"지원하지 않는 라인 방향입니다: {line.direction}")

    db.flush()
    inv = inventory_svc.get_or_create_inventory(db, line.item_id)
    after = _d(inv.quantity)
    _log_immediate(
        db,
        batch=batch,
        line=line,
        tx_type=tx_type,
        quantity_change=quantity_change,
        before=before,
        after=after,
        operator_name=requester.name,
    )


def _submit_immediate(db: Session, *, requester: Employee, batch: IoBatch) -> None:
    lines = _included_lines(batch)
    _validate_included_lines(db, lines)
    for line in sorted(lines, key=lambda line: 0 if line.direction == "out" else 1):
        _apply_line(db, batch=batch, line=line, requester=requester)
    now = datetime.utcnow()
    batch.status = "completed"
    batch.completed_at = now
    batch.updated_at = now
    db.flush()


def _execute_submission(db: Session, *, requester: Employee, batch: IoBatch) -> dict:
    try:
        included_lines = _included_lines(batch)
        if batch.sub_type in APPROVAL_SUB_TYPES:
            # 창고 승인 sub_type — manual line 유무 무관, 창고 승인 1회로만.
            # 새 정책: 모든 요청은 창고 또는 부서 중 하나로만 결재.
            _submit_approval(db, requester=requester, batch=batch)
        elif _has_manual_line(included_lines):
            # 부서 승인만 필요 — manual_adjustment 등.
            _submit_dept_only_approval(db, requester=requester, batch=batch)
        else:
            _submit_immediate(db, requester=requester, batch=batch)
    except Exception:
        batch.status = "failed"
        db.flush()
        raise

    message = "승인 요청이 생성되었습니다." if batch.status in {"submitted", "reserved"} else "입출고가 반영되었습니다."
    return {
        "batch": _batch_to_payload(batch),
        "status": batch.status,
        "requires_approval": batch.requires_approval,
        "stock_request_id": batch.stock_request_id,
        "message": message,
    }


def submit(db: Session, payload) -> dict:
    requester = _load_requester(db, payload.requester_employee_id)
    batch = _persist_batch(
        db,
        requester=requester,
        payload=payload,
        status="submitted",
        submitted_at=datetime.utcnow(),
    )
    return _execute_submission(db, requester=requester, batch=batch)


def submit_existing_draft(
    db: Session,
    *,
    batch_id: uuid.UUID,
    requester_employee_id: uuid.UUID,
) -> dict:
    """저장된 draft를 재제출. 새 batch 생성 없이 기존 라인을 그대로 실행."""
    batch = db.query(IoBatch).filter(IoBatch.batch_id == batch_id).first()
    if batch is None:
        raise ValueError("작업 묶음을 찾을 수 없습니다.")
    if batch.requester_employee_id != requester_employee_id:
        raise PermissionError("본인 임시저장 작업만 제출할 수 있습니다.")
    if batch.status != "draft":
        raise ValueError("임시저장 상태가 아닙니다.")
    requester = _load_requester(db, requester_employee_id)
    batch.status = "submitted"
    batch.submitted_at = datetime.utcnow()
    db.flush()
    return _execute_submission(db, requester=requester, batch=batch)
