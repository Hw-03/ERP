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
    IoBatch,
    IoBundle,
    IoLine,
    StockRequest,
    StockRequestStatusEnum,
)
from app.schemas.io import IoBundlePayload
from app.services.io_preview import APPROVAL_SUB_TYPES, _enum_value, _new_id


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
        "included": line.included,
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
                "included": True,
                "origin": "bom_fallback",
                "edited": False,
                "has_children": False,
                "shortage": 0,
                "exclusion_note": None,
            }
        )
    return fallback


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
                "lines": lines_payload,
            }
        )
    # 승인자: stock_request 가 있으면 그 request 의 approved_by (창고 결재자). 없거나 NULL 이면 요청자 자신
    # (정/부 직원 직접 처리 시 결재 없이 바로 — 사용자 정의로는 요청자=승인자).
    approver_employee_id: Optional[uuid.UUID] = batch.requester_employee_id
    approver_name: Optional[str] = batch.requester_name
    if db is not None and batch.stock_request_id is not None:
        sr = db.query(StockRequest).filter(StockRequest.request_id == batch.stock_request_id).first()
        if sr is not None and sr.approved_by_employee_id is not None:
            approver_employee_id = sr.approved_by_employee_id
            approver_name = sr.approved_by_name or batch.requester_name
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
        "reference_no": batch.reference_no,
        "notes": batch.notes,
        "created_at": batch.created_at,
        "updated_at": batch.updated_at,
        "submitted_at": batch.submitted_at,
        "completed_at": batch.completed_at,
        "bundles": bundles_payload,
    }


def _persist_batch(
    db: Session,
    *,
    requester: Employee,
    payload,
    status: str,
    submitted_at: Optional[datetime] = None,
) -> IoBatch:
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
                    included=incoming_line.included,
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


def sync_batch_from_stock_request(db: Session, request: StockRequest) -> None:
    batch_id = getattr(request, "operation_batch_id", None)
    if not batch_id:
        return
    batch = db.query(IoBatch).filter(IoBatch.batch_id == batch_id).first()
    if batch is None:
        return
    if request.status == StockRequestStatusEnum.COMPLETED:
        batch.status = "completed"
        batch.completed_at = request.completed_at or datetime.utcnow()
    elif request.status == StockRequestStatusEnum.REJECTED:
        batch.status = "rejected"
    elif request.status == StockRequestStatusEnum.CANCELLED:
        batch.status = "cancelled"
    elif request.status == StockRequestStatusEnum.FAILED_APPROVAL:
        batch.status = "failed"
    elif request.status == StockRequestStatusEnum.RESERVED:
        batch.status = "reserved"
    else:
        batch.status = "submitted"
    batch.updated_at = datetime.utcnow()
    db.flush()
