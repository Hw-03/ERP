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
    InventoryOperation,
    InventoryOperationEffectKindEnum,
    InventoryOperationRoleEnum,
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
from app.services import inv_effect
from app.services import inventory_operations as operation_svc
from app.services import stock_requests as stock_request_svc
from app.services import notifications as notif_svc
from app.services.approval_rules import MEMO_REQUIRED_SUB_TYPES
from app.services.io_preview import (
    APPROVAL_SUB_TYPES,
    INTERNAL_USE_SUB_TYPE,
    MANUAL_LINE_ORIGINS,
    _bucket_available,
    _d,
    _get_item,
    validate_operation_sources,
    validate_internal_use_bundles,
    validate_internal_use_operation,
    validate_internal_use_requester,
    validate_warehouse_adjust_operation,
    validate_warehouse_adjust_requester,
)
from app.services.io_persist import (
    _batch_to_payload,
    ensure_batch_is_mutable,
    _load_requester,
    _persist_batch,
    normalize_batch_bom_stock_exempt,
    sync_batch_from_stock_requests,
)


def _included_lines(batch: IoBatch) -> list[IoLine]:
    return [line for bundle in batch.bundles for line in bundle.lines if line.included]


def _validate_required_memo(*, work_type: str, sub_type: str, notes: str | None) -> None:
    """부서 낱개 입출고 제출은 공백이 아닌 메모를 요구한다."""
    if (
        work_type == "process"
        and sub_type in MEMO_REQUIRED_SUB_TYPES
        and not (notes or "").strip()
    ):
        raise ValueError("낱개 부서 입출고는 메모를 입력해야 합니다.")


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
    if sub_type == INTERNAL_USE_SUB_TYPE:
        return StockRequestTypeEnum.INTERNAL_USE
    if sub_type == "defect_quarantine":
        # _resolve_line_route(defect_quarantine) 가 부서 격리는 PRODUCTION, 창고 격리는 WAREHOUSE 로 분기.
        if from_bucket == "production":
            return StockRequestTypeEnum.MARK_DEFECTIVE_PROD
        return StockRequestTypeEnum.MARK_DEFECTIVE_WH
    raise ValueError(f"승인 요청으로 처리할 수 없는 작업입니다: {sub_type}")


def _request_bucket(value: str) -> RequestBucketEnum:
    return RequestBucketEnum(value)


def _link_stock_request(
    db: Session,
    *,
    batch: IoBatch,
    request: StockRequest,
    lines: Sequence[IoLine],
    update_batch: bool = True,
) -> None:
    request.operation_batch_id = batch.batch_id
    if update_batch:
        batch.stock_request_id = request.request_id
        if request.request_code and not batch.reference_no:
            batch.reference_no = request.request_code
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


def _prelock_line_inventories(db: Session, lines: Sequence[IoLine]) -> None:
    """다품목 실행 전에 부모 Inventory를 전역 순서로 잠근다."""
    item_ids = sorted({line.item_id for line in lines})
    inventory_svc.ensure_and_lock_inventories(db, item_ids)


def _submit_internal_use_approvals(
    db: Session,
    *,
    requester: Employee,
    batch: IoBatch,
) -> None:
    """사용출고 라인을 출고 원본별 요청과 재입고 대상 부서별 요청으로 분리한다."""
    lines = _included_lines(batch)
    _validate_included_lines(db, lines)
    outbound_lines = [line for line in lines if line.direction == "out"]
    return_lines = [line for line in lines if line.direction == "in"]
    grouped: dict[tuple[str, Optional[str]], list[IoLine]] = {}
    for line in outbound_lines:
        key = (line.from_bucket, line.from_department)
        grouped.setdefault(key, []).append(line)

    requests: list[StockRequest] = []
    ordered_groups = sorted(
        grouped.items(),
        key=lambda entry: (
            0 if entry[0][0] == "warehouse" else 1,
            entry[0][1] or "",
        ),
    )
    for (from_bucket, _from_department), group_lines in ordered_groups:
        inputs = [
            stock_request_svc.LineInput(
                item_id=line.item_id,
                quantity=line.quantity,
                from_bucket=_request_bucket(line.from_bucket),
                from_department=line.from_department,
                to_bucket=_request_bucket(line.to_bucket),
                to_department=line.to_department,
            )
            for line in group_lines
        ]
        request = stock_request_svc.create_request(
            db,
            requester=requester,
            request_type=StockRequestTypeEnum.INTERNAL_USE,
            lines_input=inputs,
            reference_no=batch.reference_no,
            notes=batch.notes,
            requires_department_approval=from_bucket == "production",
            allow_internal_use=True,
        )
        _link_stock_request(
            db,
            batch=batch,
            request=request,
            lines=group_lines,
            update_batch=False,
        )
        requests.append(request)
        notif_svc.notify_request_arrived(db, request)

    returns_by_department: dict[str, list[IoLine]] = {}
    for line in return_lines:
        if line.to_bucket != "production" or not line.to_department:
            raise ValueError("사용출고 재입고 대상 부서가 올바르지 않습니다.")
        returns_by_department.setdefault(line.to_department, []).append(line)

    for approval_department, group_lines in sorted(returns_by_department.items()):
        inputs = [
            stock_request_svc.LineInput(
                item_id=line.item_id,
                quantity=line.quantity,
                from_bucket=_request_bucket(line.from_bucket),
                from_department=line.from_department,
                to_bucket=_request_bucket(line.to_bucket),
                to_department=line.to_department,
            )
            for line in group_lines
        ]
        request = stock_request_svc.create_manual_adjustment_request(
            db,
            requester=requester,
            lines_input=inputs,
            reference_no=batch.reference_no,
            notes=batch.notes,
            approval_department=approval_department,
        )
        _link_stock_request(
            db,
            batch=batch,
            request=request,
            lines=group_lines,
            update_batch=False,
        )
        if request.department_approved_by_employee_id is not None:
            batch_status_before = batch.status
            request_status_before = request.status
            _prelock_line_inventories(db, group_lines)
            operation = _create_execution_operation(
                db,
                batch=batch,
                actor=requester,
                execution_key=f"request:{request.request_id}",
            )
            for line in group_lines:
                _apply_line(
                    db,
                    batch=batch,
                    line=line,
                    requester=requester,
                    operation=operation,
                )
            now = datetime.utcnow()
            request.status = StockRequestStatusEnum.COMPLETED
            request.completed_at = now
            for request_line in request.lines:
                request_line.status = StockRequestStatusEnum.COMPLETED
            _record_execution_workflow(
                db,
                operation=operation,
                batch=batch,
                batch_status_before=batch_status_before,
                request=request,
                request_status_before=request_status_before,
            )
        requests.append(request)
        notif_svc.notify_request_arrived(db, request)

    sync_batch_from_stock_requests(db, batch, requests)


def _submit_approval(
    db: Session, *, requester: Employee, batch: IoBatch, force_dept_approval: bool = False
) -> None:
    if batch.sub_type == INTERNAL_USE_SUB_TYPE:
        _submit_internal_use_approvals(db, requester=requester, batch=batch)
        return
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
        allow_internal_use=True,
    )
    _link_stock_request(db, batch=batch, request=request, lines=lines)
    # 창고 결재 대기 요청 도착 → 창고 정/부에게 알림 (io 라우터가 커밋).
    notif_svc.notify_request_arrived(db, request)


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
        batch_status_before = batch.status
        request_status_before = request.status
        _prelock_line_inventories(db, lines)
        operation = _create_execution_operation(
            db,
            batch=batch,
            actor=requester,
            execution_key=f"request:{request.request_id}",
        )
        for line in sorted(lines, key=lambda line: 0 if line.direction == "out" else 1):
            _apply_line(
                db,
                batch=batch,
                line=line,
                requester=requester,
                operation=operation,
            )
        now = datetime.utcnow()
        request.status = StockRequestStatusEnum.COMPLETED
        request.completed_at = now
        for req_line in request.lines:
            req_line.status = StockRequestStatusEnum.COMPLETED
        batch.status = "completed"
        batch.completed_at = now
        batch.updated_at = now
        _record_execution_workflow(
            db,
            operation=operation,
            batch=batch,
            batch_status_before=batch_status_before,
            request=request,
            request_status_before=request_status_before,
        )
        db.flush()

    # 자가승인으로 즉시 완료된 경우엔 notify_request_arrived 가 상태 가드로 아무 것도 안 한다.
    # 부서 결재 대기로 남은 경우에만 부서 승인자에게 도착 알림 (io 라우터가 커밋).
    notif_svc.notify_request_arrived(db, request)


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
    ensure_batch_is_mutable(batch)
    if not batch.stock_request_id:
        batch.stock_request_id = request.request_id
    if request.request_code and not batch.reference_no:
        batch.reference_no = request.request_code

    if batch.sub_type == INTERNAL_USE_SUB_TYPE:
        operation_line_ids = {
            request_line.operation_line_id
            for request_line in request.lines
            if request_line.operation_line_id is not None
        }
        if len(operation_line_ids) != len(request.lines):
            raise ValueError("결재 요청과 작업 라인의 연결 정보가 올바르지 않습니다.")
        lines = [
            line
            for line in _included_lines(batch)
            if line.line_id in operation_line_ids
        ]
        if len(lines) != len(operation_line_ids):
            raise ValueError("결재 요청에 연결된 작업 라인을 찾을 수 없습니다.")
    else:
        lines = _included_lines(batch)
    _validate_included_lines(db, lines)
    batch_status_before = batch.status
    request_status_before = request.status
    _prelock_line_inventories(db, lines)
    operation = _create_execution_operation(
        db,
        batch=batch,
        actor=approver,
        execution_key=f"request:{request.request_id}",
    )
    # 부서 결재로 권한 검증이 이미 완료된 시점이므로 ship 권한 재검증 생략.
    for line in sorted(lines, key=lambda line: 0 if line.direction == "out" else 1):
        _apply_line(
            db,
            batch=batch,
            line=line,
            requester=approver,
            operation=operation,
        )
    now = datetime.utcnow()
    if batch.sub_type != INTERNAL_USE_SUB_TYPE:
        batch.status = "completed"
        batch.completed_at = now
    batch.updated_at = now
    _record_execution_workflow(
        db,
        operation=operation,
        batch=batch,
        batch_status_before=batch_status_before,
        request=request,
        request_status_before=request_status_before,
    )
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
    stock_snapshot: inv_effect.TransactionStockSnapshot,
    producer_employee_id: uuid.UUID | None = None,
    department: str | None = None,
    defect_quarantine_record_id: uuid.UUID | None = None,
    operation: InventoryOperation | None = None,
    operation_role: InventoryOperationRoleEnum = InventoryOperationRoleEnum.PRIMARY,
) -> None:
    db.add(
        operation_svc.attach_transaction(TransactionLog(
            item_id=line.item_id,
            transaction_type=tx_type,
            quantity_change=quantity_change,
            quantity_before=before,
            quantity_after=after,
            transfer_qty=line.quantity if line.direction in ("move", "defective") else None,
            department=department,
            reference_no=batch.reference_no,
            produced_by=operator_name,
            producer_employee_id=producer_employee_id,
            notes=batch.notes,
            operation_batch_id=batch.batch_id,
            operation_line_id=line.line_id,
            defect_quarantine_record_id=defect_quarantine_record_id,
            **stock_snapshot,
        ), operation, operation_role)
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
        inventory_svc.DefectSource(
            kind=line.from_bucket,
            source_dept=line.from_department,
            target_dept=line.to_department,
        ),
    )
    return TransactionTypeEnum.MARK_DEFECTIVE, Decimal("0")


def _apply_adjust(db: Session, line: IoLine, qty: Decimal) -> tuple[TransactionTypeEnum, Decimal]:
    if line.to_bucket == _BUCKET_WAREHOUSE and line.from_bucket == _BUCKET_NONE:
        inventory_svc.receive_confirmed(
            db,
            line.item_id,
            qty,
            bucket=_BUCKET_WAREHOUSE,
            dept=None,
        )
        quantity_change = qty
    elif line.from_bucket == _BUCKET_WAREHOUSE and line.to_bucket == _BUCKET_NONE:
        inventory_svc.consume_warehouse(db, line.item_id, qty)
        quantity_change = -qty
    elif line.to_bucket == _BUCKET_PRODUCTION and line.from_bucket == _BUCKET_NONE:
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


def _dept_for_line(line: IoLine, tx_type: TransactionTypeEnum) -> str | None:
    """로그에 기록할 부서명 — 취소 롤백 시 어느 부서를 되돌릴지 결정하는 핵심 필드."""
    def _val(v: object) -> str | None:
        if v is None:
            return None
        return v.value if hasattr(v, "value") else str(v)

    if tx_type in (TransactionTypeEnum.PRODUCE,):
        return _val(line.to_department)
    if tx_type in (TransactionTypeEnum.BACKFLUSH, TransactionTypeEnum.SUPPLIER_RETURN):
        return _val(line.from_department)
    if tx_type == TransactionTypeEnum.TRANSFER_TO_PROD:
        return _val(line.to_department)
    if tx_type == TransactionTypeEnum.TRANSFER_TO_WH:
        return _val(line.from_department)
    if tx_type == TransactionTypeEnum.TRANSFER_DEPT:
        return _val(line.from_department)
    if tx_type == TransactionTypeEnum.MARK_DEFECTIVE:
        return _val(line.to_department)
    if tx_type == TransactionTypeEnum.ADJUST and (
        line.from_bucket == _BUCKET_WAREHOUSE or line.to_bucket == _BUCKET_WAREHOUSE
    ):
        return "창고"
    return None


def _operation_role_for_line(
    batch: IoBatch,
    line: IoLine,
) -> InventoryOperationRoleEnum:
    """입출고 라인의 업무 의미를 취소·주간집계가 재추정하지 않게 고정한다."""
    if line.direction == "adjust":
        return InventoryOperationRoleEnum.CORRECTION
    if line.direction == "move":
        return InventoryOperationRoleEnum.TRANSFER
    if batch.sub_type == "produce":
        return (
            InventoryOperationRoleEnum.COMPONENT_INPUT
            if line.direction == "out"
            else InventoryOperationRoleEnum.PRODUCT_OUTPUT
        )
    return InventoryOperationRoleEnum.PRIMARY


def _create_execution_operation(
    db: Session,
    *,
    batch: IoBatch,
    actor: Employee,
    execution_key: str,
) -> InventoryOperation | None:
    """실재고가 반영되는 한 번의 입출고 실행 작업을 만든다."""
    return operation_svc.create_business_operation(
        db,
        domain="inventory_io",
        action=batch.sub_type,
        display_label=batch.sub_type,
        actor_name=actor.name,
        actor_employee_id=actor.employee_id,
        department=batch.requester_department,
        reason=batch.notes,
        idempotency_key=f"io:{batch.batch_id}:{execution_key}",
    )


def _record_execution_workflow(
    db: Session,
    *,
    operation: InventoryOperation | None,
    batch: IoBatch,
    batch_status_before: str,
    request: StockRequest | None = None,
    request_status_before: StockRequestStatusEnum | None = None,
) -> None:
    """실행에 연결된 배치·요청을 취소 시 최종 종료할 근거로 남긴다."""
    operation_svc.record_effect(
        db,
        operation=operation,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="IoBatch",
        subject_id=batch.batch_id,
        role="EXECUTION_STATUS",
        before_state={"status": batch_status_before},
        after_state={"status": "completed"},
    )
    if request is not None and request_status_before is not None:
        operation_svc.record_effect(
            db,
            operation=operation,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="StockRequest",
            subject_id=request.request_id,
            role="EXECUTION_STATUS",
            before_state={"status": request_status_before.value},
            after_state={"status": StockRequestStatusEnum.COMPLETED.value},
        )


def _apply_line(
    db: Session,
    *,
    batch: IoBatch,
    line: IoLine,
    requester: Employee,
    operation: InventoryOperation | None = None,
) -> None:
    qty = _d(line.quantity)
    inv = inventory_svc.get_or_create_inventory(db, line.item_id)
    before = _d(inv.quantity)
    # 취소 역재생용 — mutation 전 재고 셀 스냅샷.
    cells_before = inv_effect.snapshot_cells(db, line.item_id)

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

    quarantine_record = None
    if line.direction == "defective":
        from app.services import defect_records as defect_records_svc

        quarantine_record = defect_records_svc.create_record(
            db,
            item_id=line.item_id,
            department=line.to_department,
            quantity=qty,
            actor_employee_id=requester.employee_id,
            actor_name=requester.name,
            reason_category=None,
            memo=batch.notes,
        )

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
        producer_employee_id=requester.employee_id,
        department=_dept_for_line(line, tx_type),
        stock_snapshot=inv_effect.capture_log_stock_snapshot(db, line.item_id, cells_before),
        defect_quarantine_record_id=(
            quarantine_record.record_id if quarantine_record else None
        ),
        operation=operation,
        operation_role=_operation_role_for_line(batch, line),
    )
    if quarantine_record is not None:
        operation_svc.record_defect_movement(
            db,
            operation=operation,
            record_id=quarantine_record.record_id,
            item_id=line.item_id,
            department=str(line.to_department),
            movement_type="QUARANTINE",
            quantity_delta=qty,
            role="IO_DEFECTIVE",
            actor_name=requester.name,
            actor_employee_id=requester.employee_id,
        )


def _submit_immediate(db: Session, *, requester: Employee, batch: IoBatch) -> None:
    lines = _included_lines(batch)
    status_before = batch.status
    _validate_included_lines(db, lines)
    _prelock_line_inventories(db, lines)
    operation = _create_execution_operation(
        db,
        batch=batch,
        actor=requester,
        execution_key="immediate",
    )
    for line in sorted(lines, key=lambda line: 0 if line.direction == "out" else 1):
        _apply_line(
            db,
            batch=batch,
            line=line,
            requester=requester,
            operation=operation,
        )
    now = datetime.utcnow()
    batch.status = "completed"
    batch.completed_at = now
    batch.updated_at = now
    operation_svc.record_effect(
        db,
        operation=operation,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="IoBatch",
        subject_id=batch.batch_id,
        role="EXECUTION_STATUS",
        before_state={"status": status_before},
        after_state={"status": "completed"},
    )
    db.flush()


def _complete_without_inventory(batch: IoBatch) -> None:
    """BOM 자동 자재가 모두 재고 미반영일 때 이력만 완료 상태로 남긴다."""
    now = datetime.utcnow()
    batch.requires_approval = False
    batch.status = "completed"
    batch.completed_at = now
    batch.updated_at = now


def _execute_submission(db: Session, *, requester: Employee, batch: IoBatch) -> dict:
    ensure_batch_is_mutable(batch)
    normalize_batch_bom_stock_exempt(db, batch)
    validate_internal_use_requester(
        requester,
        work_type=batch.work_type,
        sub_type=batch.sub_type,
    )
    validate_internal_use_bundles(
        work_type=batch.work_type,
        sub_type=batch.sub_type,
        bundles=batch.bundles,
        require_bom_mode=True,
        db=db,
    )
    validate_internal_use_operation(
        work_type=batch.work_type,
        sub_type=batch.sub_type,
        to_department=batch.to_department,
        lines=(line for bundle in batch.bundles for line in bundle.lines),
        db=db,
    )
    validate_warehouse_adjust_requester(
        requester,
        work_type=batch.work_type,
        sub_type=batch.sub_type,
    )
    validate_warehouse_adjust_operation(
        work_type=batch.work_type,
        sub_type=batch.sub_type,
        from_department=batch.from_department,
        to_department=batch.to_department,
        lines=(line for bundle in batch.bundles for line in bundle.lines),
    )
    validate_operation_sources(
        batch.sub_type,
        (bundle.source_kind for bundle in batch.bundles),
    )
    try:
        included_lines = _included_lines(batch)
        if not included_lines:
            _complete_without_inventory(batch)
        elif batch.sub_type in APPROVAL_SUB_TYPES:
            # 창고 승인 sub_type — manual line 유무 무관, 창고 승인 1회로만.
            # 새 정책: 모든 요청은 창고 또는 부서 중 하나로만 결재.
            _submit_approval(db, requester=requester, batch=batch)
        elif _has_manual_line(included_lines):
            # 부서 승인만 필요 — manual_adjustment 등.
            _submit_dept_only_approval(db, requester=requester, batch=batch)
        else:
            _submit_immediate(db, requester=requester, batch=batch)
    except Exception:
        # 어느 분기서 실패하든 batch 를 failed 로 확정(flush)한 뒤 그대로 전파 — 부분상태 방지.
        batch.status = "failed"
        db.flush()
        raise

    message = (
        "승인 요청이 생성되었습니다."
        if batch.status in {"submitted", "reserved"}
        else (
            "BOM 재고 미반영 품목만 포함되어 재고 변동 없이 처리되었습니다."
            if not _included_lines(batch)
            else "입출고가 반영되었습니다."
        )
    )
    batch_payload = _batch_to_payload(batch, db=db)
    return {
        "batch": batch_payload,
        "status": batch.status,
        "requires_approval": batch.requires_approval,
        "stock_request_id": batch.stock_request_id,
        "stock_requests": batch_payload["stock_requests"],
        "message": message,
    }


def submit(db: Session, payload) -> dict:
    _validate_required_memo(
        work_type=payload.work_type,
        sub_type=payload.sub_type,
        notes=payload.notes,
    )
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
    ensure_batch_is_mutable(batch)
    _validate_required_memo(
        work_type=batch.work_type,
        sub_type=batch.sub_type,
        notes=batch.notes,
    )
    requester = _load_requester(db, requester_employee_id)
    normalize_batch_bom_stock_exempt(db, batch)
    batch.status = "submitted"
    batch.submitted_at = datetime.utcnow()
    db.flush()
    return _execute_submission(db, requester=requester, batch=batch)
