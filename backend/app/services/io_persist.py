"""배치 영속화 + 응답 페이로드 직렬화 + 외부 결재 상태 동기화.

io_preview 의 헬퍼(_enum_value, _new_id, APPROVAL_SUB_TYPES)를 재사용한다.
io_draft / io_dispatch 가 이 모듈의 _persist_batch / _batch_to_payload / _load_requester 를 호출한다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Employee,
    Item,
    IoBatch,
    IoBundle,
    IoLine,
    StockRequest,
    StockRequestStatusEnum,
)
from app.schemas.io import IoBundlePayload
from app.services.bom_stock_policy import (
    BOM_STOCK_EXEMPT_NOTE,
    BOM_AUTO_ORIGIN,
    is_bom_generated_line,
    should_skip_bom_inventory,
)
from app.services.io_preview import (
    APPROVAL_SUB_TYPES,
    _enum_value,
    _new_id,
    validate_internal_use_bundles,
    validate_internal_use_operation,
    validate_internal_use_requester,
    validate_operation_sources,
    validate_warehouse_adjust_operation,
    validate_warehouse_adjust_requester,
)


LEGACY_SHIPPING_LINK_READ_ONLY_MESSAGE = "폐기된 출하 준비 연결 작업은 조회만 가능합니다."


def _normalize_bom_stock_exempt_line(
    db: Session,
    bundle: object,
    line: object,
    item: Item,
    *,
    work_type: object,
    sub_type: object,
) -> None:
    """자동 BOM 라인의 재고 미반영 스냅샷을 현재 품목 설정으로 정규화한다."""
    bom_generated = is_bom_generated_line(
        db,
        bundle_id=getattr(bundle, "bundle_id", None),
        line_id=getattr(line, "line_id", None),
        source_kind=getattr(bundle, "source_kind", None),
        source_item_id=getattr(bundle, "source_item_id", None),
        item_id=getattr(line, "item_id", None),
        work_type=work_type,
        sub_type=sub_type,
        direction=getattr(line, "direction", None),
        from_bucket=getattr(line, "from_bucket", None),
        from_department=getattr(line, "from_department", None),
        to_bucket=getattr(line, "to_bucket", None),
        to_department=getattr(line, "to_department", None),
        bom_auto_token=getattr(line, "bom_auto_token", None),
    )
    was_auto_excluded = (
        bool(getattr(line, "bom_stock_exempt", False))
        and getattr(line, "exclusion_note", None) == BOM_STOCK_EXEMPT_NOTE
    )
    if should_skip_bom_inventory(item, bom_generated=bom_generated):
        line.origin = BOM_AUTO_ORIGIN
        line.bom_stock_exempt = True
        line.included = False
        line.shortage = 0
        line.exclusion_note = BOM_STOCK_EXEMPT_NOTE
        return
    line.bom_stock_exempt = False
    if was_auto_excluded:
        line.included = True
        line.exclusion_note = None


def _normalize_payload_bom_stock_exempt(db: Session, payload: object) -> None:
    """새 제출·임시저장 payload의 자동 BOM 자재 정책을 서버 기준으로 강제한다."""
    bundle_lines = [
        (bundle, line)
        for bundle in getattr(payload, "bundles", [])
        for line in bundle.lines
    ]
    _normalize_bom_stock_exempt_lines(
        db,
        bundle_lines,
        work_type=getattr(payload, "work_type", None),
        sub_type=getattr(payload, "sub_type", None),
    )


def _normalize_batch_bom_stock_exempt(db: Session, batch: IoBatch) -> None:
    """미제출 draft를 제출할 때 현재 품목 설정으로 스냅샷을 다시 계산한다."""
    bundle_lines = [(bundle, line) for bundle in batch.bundles for line in bundle.lines]
    _normalize_bom_stock_exempt_lines(
        db,
        bundle_lines,
        work_type=batch.work_type,
        sub_type=batch.sub_type,
    )


def _normalize_bom_stock_exempt_lines(
    db: Session,
    bundle_lines: list[tuple[object, object]],
    *,
    work_type: object,
    sub_type: object,
) -> None:
    item_ids = {
        line.item_id
        for _, line in bundle_lines
        if getattr(line, "bom_auto_token", None)
    }
    if not item_ids:
        for _, line in bundle_lines:
            line.bom_stock_exempt = False
        return
    items = db.query(Item).filter(Item.item_id.in_(item_ids)).all()
    items_by_id = {item.item_id: item for item in items}
    for bundle, line in bundle_lines:
        item = items_by_id.get(line.item_id)
        if item is None:
            line.bom_stock_exempt = False
            continue
        _normalize_bom_stock_exempt_line(
            db,
            bundle,
            line,
            item,
            work_type=work_type,
            sub_type=sub_type,
        )


def ensure_batch_is_mutable(batch: IoBatch) -> None:
    """과거 출하 연결 배치는 이력 조회 외의 변경을 차단한다."""
    if batch.shipping_request_id is not None:
        raise ValueError(LEGACY_SHIPPING_LINK_READ_ONLY_MESSAGE)


def ensure_stock_request_batch_is_mutable(db: Session, request: StockRequest) -> None:
    batch_id = getattr(request, "operation_batch_id", None)
    if batch_id is None:
        return
    batch = db.query(IoBatch).filter(IoBatch.batch_id == batch_id).first()
    if batch is not None:
        ensure_batch_is_mutable(batch)


def _line_to_dict(line: IoLine) -> dict:
    return {
        "line_id": line.line_id,
        "item_id": line.item_id,
        "item_name": line.item_name_snapshot,
        "mes_code": line.mes_code_snapshot,
        "unit": line.unit,
        "direction": line.direction,
        "from_bucket": line.from_bucket,
        "from_department": line.from_department,
        "to_bucket": line.to_bucket,
        "to_department": line.to_department,
        "quantity": line.quantity,
        "bom_expected": line.bom_expected,
        "bom_stock_exempt": line.bom_stock_exempt,
        "bom_auto_token": line.bom_auto_token,
        "included": line.included,
        "selected": line.selected,
        "origin": line.origin,
        "edited": line.edited,
        "has_children": line.has_children_snapshot,
        "shortage": line.shortage,
        "exclusion_note": line.exclusion_note,
    }


def _bom_fallback_child_lines(
    db: Optional[Session],
    bundle: IoBundle,
    parent_line: IoLine,
) -> list[dict]:
    """옛 BOM bundle 의 자식 라인이 저장되지 않은 케이스 보충.

    - 시연 D-5 회귀(#1) — 과거 입출고 중 BOM 자식 IoLine 이 저장 안 된 데이터가 다수 존재.
    - 응답 시점에 BOM 마스터를 조회해 표시용 자식 라인을 생성. DB 는 건드리지 않음.
    - origin="bom_fallback" 으로 표시해 프론트가 식별 가능 (현재는 그대로 표시).
    """
    if db is None or bundle.source_item_id is None:
        return []
    from app.models import BOM

    rows = (
        db.query(BOM)
        .filter(BOM.parent_item_id == bundle.source_item_id)
        .all()
    )
    if not rows:
        return []
    qty_decimal = Decimal(str(parent_line.quantity or 0))
    fallback: list[dict] = []
    for r in rows:
        child = r.child_item
        if child is None:
            continue
        expected = Decimal(str(r.quantity or 0)) * qty_decimal
        fallback.append(
            {
                "line_id": uuid.uuid4(),
                "item_id": r.child_item_id,
                "item_name": child.item_name,
                "mes_code": child.mes_code,
                "unit": r.unit or "EA",
                "direction": parent_line.direction,
                "from_bucket": parent_line.from_bucket,
                "from_department": parent_line.from_department,
                "to_bucket": parent_line.to_bucket,
                "to_department": parent_line.to_department,
                "quantity": expected,
                "bom_expected": expected,
                "bom_auto_token": None,
                "included": True,
                "selected": True,
                "origin": "bom_fallback",
                "edited": False,
                "has_children": False,
                "shortage": 0,
                "exclusion_note": None,
            }
        )
    return fallback


def _stock_request_summary(request: StockRequest) -> dict:
    first_line = request.lines[0] if request.lines else None
    if request.requires_warehouse_approval:
        approval_kind = "warehouse"
        approver_employee_id = request.approved_by_employee_id
        approver_name = request.approved_by_name
    elif request.requires_department_approval:
        approval_kind = "department"
        approver_employee_id = request.department_approved_by_employee_id
        approver_name = request.department_approved_by_name
    else:
        approval_kind = "none"
        approver_employee_id = request.approved_by_employee_id
        approver_name = request.approved_by_name
    return {
        "stock_request_id": request.request_id,
        "request_code": request.request_code,
        "status": _enum_value(request.status),
        "from_bucket": (
            _enum_value(first_line.from_bucket) if first_line is not None else "none"
        ),
        "from_department": first_line.from_department if first_line is not None else None,
        "approval_kind": approval_kind,
        "requires_warehouse_approval": bool(request.requires_warehouse_approval),
        "requires_department_approval": bool(request.requires_department_approval),
        "approver_employee_id": approver_employee_id,
        "approver_name": approver_name,
        "rejected_by_name": request.rejected_by_name,
        "rejected_at": request.rejected_at,
        "rejected_reason": request.rejected_reason,
        "operation_line_ids": [
            line.operation_line_id
            for line in request.lines
            if line.operation_line_id is not None
        ],
    }


def _batch_to_payload(batch: IoBatch, db: Optional[Session] = None) -> dict:
    bundles_payload: list[dict] = []
    for bundle in batch.bundles:
        lines_payload = [_line_to_dict(line) for line in bundle.lines]
        # 옛 데이터 회귀 보완 — BOM 부모 bundle 인데 자식 라인이 누락된 경우 BOM 마스터로 보충.
        if (
            db is not None
            and bundle.source_kind == "bom_parent"
            and bundle.source_item_id is not None
        ):
            parent_line = next(
                (line for line in bundle.lines if line.origin == "direct"),
                None,
            )
            has_children = any(line.origin != "direct" for line in bundle.lines)
            if parent_line is not None and not has_children:
                lines_payload.extend(_bom_fallback_child_lines(db, bundle, parent_line))
        bundles_payload.append(
            {
                "bundle_id": bundle.bundle_id,
                "source_kind": bundle.source_kind,
                "title": bundle.title_snapshot,
                "source_item_id": bundle.source_item_id,
                "source_mes_code": bundle.source_item.mes_code if bundle.source_item else None,
                "quantity": bundle.quantity,
                "expanded_level": bundle.expanded_level,
                "internal_use_bom_mode": bundle.internal_use_bom_mode,
                "source_location": bundle.source_location,
                "lines": lines_payload,
            }
        )
    linked_requests: list[StockRequest] = []
    if db is not None:
        linked_requests = (
            db.query(StockRequest)
            .filter(StockRequest.operation_batch_id == batch.batch_id)
            .order_by(StockRequest.created_at.asc(), StockRequest.request_id.asc())
            .all()
        )
        if not linked_requests and batch.stock_request_id is not None:
            legacy_request = (
                db.query(StockRequest)
                .filter(StockRequest.request_id == batch.stock_request_id)
                .first()
            )
            if legacy_request is not None:
                linked_requests = [legacy_request]

    # 복수 결재 요청의 승인자를 하나로 대표하지 않는다. 단일·즉시처리는 기존 호환 규칙 유지.
    approver_employee_id: Optional[uuid.UUID] = batch.requester_employee_id
    approver_name: Optional[str] = batch.requester_name
    if len(linked_requests) > 1:
        approver_employee_id = None
        approver_name = None
    elif len(linked_requests) == 1:
        summary = _stock_request_summary(linked_requests[0])
        if summary["approver_employee_id"] is not None:
            approver_employee_id = summary["approver_employee_id"]
            approver_name = summary["approver_name"] or batch.requester_name
    return {
        "batch_id": batch.batch_id,
        "work_type": batch.work_type,
        "sub_type": batch.sub_type,
        "status": batch.status,
        "requester_employee_id": batch.requester_employee_id,
        "requester_name": batch.requester_name,
        "requester_department": batch.requester_department,
        "approver_employee_id": approver_employee_id,
        "approver_name": approver_name,
        "from_department": batch.from_department,
        "to_department": batch.to_department,
        "requires_approval": batch.requires_approval,
        "stock_request_id": batch.stock_request_id,
        "shipping_request_id": batch.shipping_request_id,
        "reference_no": batch.reference_no,
        "notes": batch.notes,
        "created_at": batch.created_at,
        "updated_at": batch.updated_at,
        "submitted_at": batch.submitted_at,
        "completed_at": batch.completed_at,
        "bundles": bundles_payload,
        "stock_requests": [
            _stock_request_summary(request) for request in linked_requests
        ],
    }


def _persist_batch(
    db: Session,
    *,
    requester: Employee,
    payload,
    status: str,
    submitted_at: Optional[datetime] = None,
    request_fingerprint: Optional[str] = None,
) -> IoBatch:
    validate_internal_use_requester(
        requester,
        work_type=payload.work_type,
        sub_type=payload.sub_type,
    )
    _normalize_payload_bom_stock_exempt(db, payload)
    validate_internal_use_bundles(
        work_type=payload.work_type,
        sub_type=payload.sub_type,
        bundles=payload.bundles,
        require_bom_mode=status != "draft",
        db=db,
    )
    validate_internal_use_operation(
        work_type=payload.work_type,
        sub_type=payload.sub_type,
        to_department=payload.to_department,
        lines=(line for bundle in payload.bundles for line in bundle.lines),
        db=db,
    )
    validate_warehouse_adjust_requester(
        requester,
        work_type=payload.work_type,
        sub_type=payload.sub_type,
    )
    validate_warehouse_adjust_operation(
        work_type=payload.work_type,
        sub_type=payload.sub_type,
        from_department=payload.from_department,
        to_department=payload.to_department,
        lines=(line for bundle in payload.bundles for line in bundle.lines),
    )
    validate_operation_sources(
        payload.sub_type,
        (bundle.source_kind for bundle in payload.bundles),
    )
    now = datetime.utcnow()
    batch = IoBatch(
        batch_id=_new_id(),
        work_type=payload.work_type,
        sub_type=payload.sub_type,
        status=status,
        requester_employee_id=requester.employee_id,
        requester_name=requester.name,
        requester_department=_enum_value(requester.department) or "",
        from_department=payload.from_department,
        to_department=payload.to_department,
        requires_approval=payload.sub_type in APPROVAL_SUB_TYPES,
        reference_no=payload.reference_no,
        notes=payload.notes,
        client_request_id=getattr(payload, "client_request_id", None),
        request_fingerprint=request_fingerprint,
        submitted_at=submitted_at,
        created_at=now,
        updated_at=now,
    )
    db.add(batch)
    db.flush()

    _add_bundles_and_lines(db, batch, payload)
    db.refresh(batch)
    return batch


def _manual_single_bundle_key(bundle: IoBundlePayload) -> tuple | None:
    """동일 클릭으로 중복 생성된 수동 단품 묶음만 병합할 수 있게 식별한다."""
    if bundle.source_kind != "manual" or len(bundle.lines) != 1:
        return None
    line = bundle.lines[0]
    if line.origin != "manual":
        return None
    return (
        bundle.title,
        bundle.source_item_id,
        bundle.source_mes_code,
        bundle.expanded_level,
        line.item_id,
        line.item_name,
        line.mes_code,
        line.unit,
        line.direction,
        line.from_bucket,
        line.from_department,
        line.to_bucket,
        line.to_department,
        line.included,
        line.origin,
        line.edited,
        line.has_children,
        line.exclusion_note,
    )


def _merge_duplicate_manual_bundles(
    bundles: list[IoBundlePayload],
) -> list[IoBundlePayload]:
    """중복 수동 단품 묶음의 의도한 수량은 보존하고 저장 행만 하나로 합친다."""
    merged: list[IoBundlePayload] = []
    index_by_key: dict[tuple, int] = {}
    for bundle in bundles:
        key = _manual_single_bundle_key(bundle)
        existing_index = index_by_key.get(key) if key is not None else None
        if key is None or existing_index is None:
            if key is not None:
                index_by_key[key] = len(merged)
            merged.append(bundle)
            continue

        existing = merged[existing_index]
        existing_line = existing.lines[0]
        incoming_line = bundle.lines[0]
        merged_line = existing_line.model_copy(
            update={
                "quantity": existing_line.quantity + incoming_line.quantity,
                "bom_expected": (
                    existing_line.bom_expected + incoming_line.bom_expected
                    if existing_line.bom_expected is not None
                    and incoming_line.bom_expected is not None
                    else None
                ),
                "shortage": existing_line.shortage + incoming_line.shortage,
            }
        )
        merged[existing_index] = existing.model_copy(
            update={
                "quantity": existing.quantity + bundle.quantity,
                "lines": [merged_line],
            }
        )
    return merged


def _add_bundles_and_lines(db: Session, batch: IoBatch, payload) -> None:
    """payload.bundles → IoBundle/IoLine 적재. 신규 생성(_persist_batch)과
    draft in-place 갱신(io_draft.save_draft)이 공유하는 단일 적재 루프."""
    for incoming_bundle in _merge_duplicate_manual_bundles(payload.bundles):
        bundle = IoBundle(
            bundle_id=incoming_bundle.bundle_id,
            batch_id=batch.batch_id,
            source_kind=incoming_bundle.source_kind,
            source_item_id=incoming_bundle.source_item_id,
            title_snapshot=incoming_bundle.title,
            quantity=incoming_bundle.quantity,
            expanded_level=incoming_bundle.expanded_level,
            internal_use_bom_mode=incoming_bundle.internal_use_bom_mode,
            source_location=incoming_bundle.source_location,
        )
        db.add(bundle)
        db.flush()
        for incoming_line in incoming_bundle.lines:
            db.add(
                IoLine(
                    line_id=incoming_line.line_id,
                    bundle_id=bundle.bundle_id,
                    item_id=incoming_line.item_id,
                    item_name_snapshot=incoming_line.item_name,
                    mes_code_snapshot=incoming_line.mes_code,
                    unit=incoming_line.unit,
                    direction=incoming_line.direction,
                    from_bucket=incoming_line.from_bucket,
                    from_department=incoming_line.from_department,
                    to_bucket=incoming_line.to_bucket,
                    to_department=incoming_line.to_department,
                    quantity=incoming_line.quantity,
                    bom_expected=incoming_line.bom_expected,
                    bom_stock_exempt=incoming_line.bom_stock_exempt,
                    bom_auto_token=incoming_line.bom_auto_token,
                    included=incoming_line.included,
                    selected=incoming_line.selected,
                    origin=incoming_line.origin,
                    edited=incoming_line.edited,
                    has_children_snapshot=incoming_line.has_children,
                    shortage=incoming_line.shortage,
                    exclusion_note=incoming_line.exclusion_note,
                )
            )
    db.flush()


def _load_requester(db: Session, employee_id: uuid.UUID) -> Employee:
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if employee is None:
        raise ValueError("요청자 직원을 찾을 수 없습니다.")
    if not bool(employee.is_active):
        raise PermissionError("비활성 직원은 입출고 작업을 제출할 수 없습니다.")
    return employee


def get_batch(db: Session, *, batch_id: uuid.UUID) -> Optional[dict]:
    batch = db.query(IoBatch).filter(IoBatch.batch_id == batch_id).first()
    return _batch_to_payload(batch, db=db) if batch else None


def _sync_batch_from_stock_requests(
    db: Session,
    batch: IoBatch,
    requests: Optional[list[StockRequest]] = None,
) -> None:
    """연결된 모든 결재 요청을 집계해 배치 상태와 단일 호환 필드를 갱신한다."""
    linked_requests = requests
    if linked_requests is None:
        linked_requests = (
            db.query(StockRequest)
            .filter(StockRequest.operation_batch_id == batch.batch_id)
            .order_by(StockRequest.created_at.asc(), StockRequest.request_id.asc())
            .all()
        )
    if not linked_requests:
        return

    statuses = {_enum_value(request.status) for request in linked_requests}
    is_rejected_adjust_resubmission = (
        batch.work_type == "process"
        and batch.sub_type in {"adjust_in", "adjust_out"}
        and statuses == {
            StockRequestStatusEnum.REJECTED.value,
            StockRequestStatusEnum.COMPLETED.value,
        }
        and all(request.requires_department_approval for request in linked_requests)
    )
    if statuses == {StockRequestStatusEnum.COMPLETED.value} or is_rejected_adjust_resubmission:
        batch.status = "completed"
        batch.completed_at = max(
            (request.completed_at or datetime.utcnow()) for request in linked_requests
        )
    elif StockRequestStatusEnum.COMPLETED.value in statuses:
        batch.status = "partially_completed"
        batch.completed_at = max(
            (request.completed_at for request in linked_requests if request.completed_at),
            default=datetime.utcnow(),
        )
    elif StockRequestStatusEnum.RESERVED.value in statuses:
        batch.status = "reserved"
        batch.completed_at = None
    elif StockRequestStatusEnum.SUBMITTED.value in statuses:
        batch.status = "submitted"
        batch.completed_at = None
    elif StockRequestStatusEnum.FAILED_APPROVAL.value in statuses:
        batch.status = "failed"
        batch.completed_at = None
    elif statuses == {StockRequestStatusEnum.CANCELLED.value}:
        batch.status = "cancelled"
        batch.completed_at = None
    elif (
        statuses == {StockRequestStatusEnum.REJECTED.value}
        and batch.work_type == "process"
        and batch.sub_type in {"adjust_in", "adjust_out"}
        and all(request.requires_department_approval for request in linked_requests)
    ):
        # 부서 낱개 입출고 조정만 반려 뒤 같은 작성 중 batch로 복귀한다.
        # StockRequest 자체는 REJECTED 감사 이력을 유지하며, 재제출 때 새 요청을 만든다.
        batch.status = "draft"
        batch.completed_at = None
    else:
        batch.status = "rejected"
        batch.completed_at = None

    batch.requires_approval = any(
        request.requires_warehouse_approval or request.requires_department_approval
        for request in linked_requests
    )
    if len(linked_requests) == 1:
        request = linked_requests[0]
        batch.stock_request_id = request.request_id
        if request.request_code and not batch.reference_no:
            batch.reference_no = request.request_code
    else:
        batch.stock_request_id = None
    batch.updated_at = datetime.utcnow()
    db.flush()


def _sync_batch_from_stock_request(db: Session, request: StockRequest) -> None:
    batch_id = getattr(request, "operation_batch_id", None)
    if not batch_id:
        return
    batch = db.query(IoBatch).filter(IoBatch.batch_id == batch_id).first()
    if batch is None:
        return
    _sync_batch_from_stock_requests(db, batch)
