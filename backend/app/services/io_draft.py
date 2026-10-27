"""임시저장(draft) CRUD + 멱등 재제출 응답.

io_persist 의 _load_requester / _persist_batch / _batch_to_payload 를 재사용한다.
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import Optional
from types import SimpleNamespace

from sqlalchemy.orm import Session

from datetime import datetime

from app.models import IoBatch, IoWorkReservationEvent, LocationStatusEnum
from app.schemas.io import IoDraftUpsert
from app.services import io_reservations as reservations
from app.services.work_reservation_errors import WorkReservationError
from app.services.io_preview import (
    APPROVAL_SUB_TYPES,
    automatic_department_headers,
    _bucket_available,
    _d,
    has_included_manual_line,
    normalize_process_sub_type,
    validate_internal_use_bundles,
    validate_internal_use_operation,
    validate_internal_use_requester,
    validate_saved_operation_sources,
    validate_warehouse_adjust_operation,
    validate_warehouse_adjust_requester,
)
from app.services.io_persist import (
    _add_bundles_and_lines,
    _batch_to_payload,
    ensure_batch_is_mutable,
    _load_requester,
    _persist_batch,
    normalize_payload_bom_stock_exempt,
    normalize_automatic_routes_with_bom_token_refresh,
)
from app.services.supplier import validate_supplier_for_operation
from app.services.io_draft_reads import DraftReadContext, draft_read_context, load_draft_graph
from app.services.stock_availability import AvailabilityCell


def _draft_available(db: Session, *, item_id: uuid.UUID, bucket: str, department: str | None,
                     context: DraftReadContext | None) -> Decimal:
    """Legacy route normalization can discover an extra cell; read it at most once."""
    if context is None:
        return _bucket_available(db, item_id=item_id, bucket=bucket, department=department)
    if bucket == "warehouse":
        cell = AvailabilityCell.warehouse(item_id)
    elif bucket in {"production", "defective"} and department:
        cell = AvailabilityCell.location(item_id, department,
            LocationStatusEnum.DEFECTIVE if bucket == "defective" else LocationStatusEnum.PRODUCTION)
    else:
        return Decimal(0)
    if cell not in context.available:
        context.available[cell] = _bucket_available(db, item_id=item_id, bucket=bucket, department=department)
    return context.available[cell]


def _draft_to_current_stock_payload(db: Session, batch: IoBatch, context: DraftReadContext | None = None) -> dict:
    """저장 내용은 보존하고 자동 부서 경로·부족 수량만 현재 기준으로 계산한다."""
    payload = _batch_to_payload(batch, db=db, linked_requests=context.requests[batch.batch_id] if context else None,
                                pause_payloads=context.pauses if context else None)
    credit = context.credits[batch.batch_id] if context else reservations.ledger_quantities(db, batch.batch_id)
    if batch.effective_plan is not None:
        _apply_preview_shortages(db, payload, credit, batch.effective_plan, context)
        return payload
    bundle_views = []
    for bundle in payload["bundles"]:
        lines = [SimpleNamespace(**line) for line in bundle["lines"]]
        bundle_views.append(
            SimpleNamespace(
                bundle_id=bundle["bundle_id"],
                source_kind=bundle["source_kind"],
                source_item_id=bundle["source_item_id"],
                lines=lines,
            )
        )
    normalized = normalize_automatic_routes_with_bom_token_refresh(
        db,
        work_type=batch.work_type,
        sub_type=batch.sub_type,
        bundles=bundle_views,
    )
    if batch.sub_type in {"warehouse_to_dept", "dept_to_warehouse", "produce", "disassemble", "adjust_in", "adjust_out"}:
        payload["from_department"], payload["to_department"] = automatic_department_headers(
            bundle_views
        )
    for bundle, view in zip(payload["bundles"], bundle_views):
        for line, line_view in zip(bundle["lines"], view.lines):
            line.update(vars(line_view))
    payload["department_routes_normalized"] = normalized
    for bundle in payload["bundles"]:
        for line in bundle["lines"]:
            if not line["included"] or line["from_bucket"] == "none":
                line["shortage"] = Decimal("0")
                continue
            available = _draft_available(
                db,
                item_id=line["item_id"],
                bucket=line["from_bucket"],
                department=line["from_department"],
                context=context,
            )
            cell = (AvailabilityCell.warehouse(line["item_id"]) if line["from_bucket"] == "warehouse"
                    else AvailabilityCell.location(line["item_id"], line["from_department"]))
            available += credit.get(cell, Decimal(0))
            line["shortage"] = max(Decimal("0"), _d(line["quantity"]) - available)
    return payload


def _apply_preview_shortages(db: Session, preview: dict, credit: dict, plan: dict | None = None,
                             context: DraftReadContext | None = None) -> None:
    """Allocate availability once per source cell, optionally using frozen effective routes."""
    effects = {effect["operation_line_id"]: effect for effect in (plan or {}).get("effects", [])}
    used: dict[AvailabilityCell, Decimal] = {}
    for bundle in preview["bundles"]:
        for line in bundle["lines"]:
            effect = effects.get(str(line["line_id"]))
            source = effect["from"] if effect else None
            if plan is not None and source is None:
                line["shortage"] = 0
                continue
            bucket = source["bucket"] if source else line["from_bucket"]
            department = source["department"] if source else line["from_department"]
            if (plan is None and not line["included"]) or bucket not in {"warehouse", "production"}:
                line["shortage"] = 0
                continue
            item_id = uuid.UUID(str(line["item_id"]))
            cell = AvailabilityCell.warehouse(item_id) if bucket == "warehouse" else AvailabilityCell.location(item_id, department)
            quantity = _d(effect["quantity"] if effect else line["quantity"])
            available = _draft_available(db, item_id=item_id, bucket=bucket, department=department, context=context) + credit.get(cell, Decimal(0))
            line["shortage"] = max(Decimal(0), quantity - max(Decimal(0), available - used.get(cell, Decimal(0))))
            used[cell] = used.get(cell, Decimal(0)) + quantity


def apply_owned_preview_credit(db: Session, preview: dict, batch_id: uuid.UUID,
                               requester_employee_id: uuid.UUID | None) -> None:
    """Only an active owner preview may reuse its actual draft ledger, without writes."""
    from app.models import Employee
    batch = db.get(IoBatch, batch_id)
    owner = db.get(Employee, requester_employee_id) if requester_employee_id is not None else None
    if batch is None or owner is None or batch.requester_employee_id != requester_employee_id or not owner.is_active:
        raise PermissionError("본인의 작업 예약만 미리보기에 사용할 수 있습니다.")
    reservations.check_draft(batch)
    credit = reservations.ledger_quantities(db, batch.batch_id)
    _apply_preview_shortages(db, preview, credit)


def save_draft(db: Session, payload: IoDraftUpsert, *, creation_command: str = "draft") -> dict:
    """임시저장. batch_id 가 오면 해당 draft 를 제자리 갱신, 없으면 새 슬롯 누적.

    덮어쓰기(이전 동작) 제거 — 같은 (work_type, sub_type) 라도 batch_id 가 없으면
    새 draft 가 쌓여 '작업 중' 탭에서 여러 작업을 이어서 진행할 수 있다.
    """
    from app.services.io_preview import validate_receive_requester, validate_material_outbound
    from app.services.item_write_validation import validate_io_items
    from app.services.io_effective_plan import build_effective_plan
    from app.services import stocktake_guard, work_stocktake_pause as stocktake_pause

    stocktake_guard.lock_control(db)
    payload = payload.model_copy(deep=True)
    incoming_batch_id = getattr(payload, "batch_id", None)
    expected_revision = getattr(payload, "expected_revision", None)
    if incoming_batch_id is None and not (payload.client_request_id or "").strip():
        raise WorkReservationError("VALIDATION_ERROR", "새 작업의 요청 키가 필요합니다.", 422)
    if incoming_batch_id is not None and expected_revision is None:
        raise WorkReservationError("VALIDATION_ERROR", "수정할 작업 버전이 필요합니다.", 422)
    fingerprint = reservations.creation_hash(payload, command=creation_command)
    requester = _load_requester(db, payload.requester_employee_id)
    # Acquire the roster lock before batch locks whenever either old or new intent uses it.
    old_hint = db.get(IoBatch, incoming_batch_id) if incoming_batch_id is not None else None
    if payload.sub_type == "internal_use_out" or (old_hint is not None and old_hint.sub_type == "internal_use_out"):
        from app.services.internal_use_approval import lock_approver_roster
        lock_approver_roster(db)
    batch = None
    if incoming_batch_id is not None:
        batch = reservations.lock_owned_batch(db, incoming_batch_id, payload.requester_employee_id)
        if batch is None:
            raise WorkReservationError("NOT_FOUND", "작업을 찾을 수 없습니다.", 404)
        reservations.check_revision(batch, expected_revision)
        reservations.check_draft(batch)
        ensure_batch_is_mutable(batch)
    else:
        replay = find_by_client_request_id(db, payload.client_request_id)
        if replay is not None:
            return validate_creation_replay(replay, payload, fingerprint)

    validate_io_items(db, payload.bundles, sub_type=payload.sub_type)
    from app.services.defect_reason_categories import resolve_reason_category
    reason_category_id, reason_category, _ = resolve_reason_category(
        db, reason_category_id=getattr(payload, "reason_category_id", None),
        reason_category=getattr(payload, "reason_category", None), reason_memo=payload.notes, required=False,
    )
    validate_receive_requester(requester, work_type=payload.work_type, sub_type=payload.sub_type, db=db)
    validate_material_outbound(work_type=payload.work_type, sub_type=payload.sub_type, bundles=payload.bundles, notes=payload.notes, require_reason=False)
    payload.sub_type = normalize_process_sub_type(
        work_type=payload.work_type,
        sub_type=payload.sub_type,
        bundles=payload.bundles,
    )
    normalize_payload_bom_stock_exempt(db, payload)
    validate_io_items(db, payload.bundles, sub_type=payload.sub_type)
    normalize_automatic_routes_with_bom_token_refresh(
        db,
        work_type=payload.work_type,
        sub_type=payload.sub_type,
        bundles=payload.bundles,
    )
    if payload.sub_type in {"warehouse_to_dept", "dept_to_warehouse", "produce", "disassemble", "adjust_in", "adjust_out"}:
        payload.from_department, payload.to_department = automatic_department_headers(
            payload.bundles
        )
    validate_saved_operation_sources(
        work_type=payload.work_type,
        sub_type=payload.sub_type,
        bundles=payload.bundles,
        requested_department=payload.to_department,
    )
    validate_internal_use_requester(
        requester,
        work_type=payload.work_type,
        sub_type=payload.sub_type,
    )
    validate_internal_use_bundles(
        work_type=payload.work_type,
        sub_type=payload.sub_type,
        bundles=payload.bundles,
        db=db,
        require_bom_mode=creation_command == "direct_submit",
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
    if incoming_batch_id is not None:
        reservations.advance_revision(db, batch, expected_revision)
        supplier = validate_supplier_for_operation(
            db,
            work_type=payload.work_type,
            sub_type=payload.sub_type,
            supplier_id=payload.supplier_id,
        )
        # 메타 갱신 + 자식 교체. client_request_id 는 보존(submit 멱등성).
        batch.work_type = payload.work_type
        batch.sub_type = payload.sub_type
        batch.from_department = payload.from_department
        batch.to_department = payload.to_department
        batch.supplier_id = supplier.supplier_id if supplier is not None else None
        batch.supplier_name_snapshot = supplier.name if supplier is not None else None
        batch.requires_approval = (
            payload.sub_type in APPROVAL_SUB_TYPES
            or has_included_manual_line(payload.bundles)
        )
        batch.reference_no = payload.reference_no
        batch.notes = payload.notes
        batch.reason_category_id = reason_category_id
        batch.reason_category = reason_category
        batch.updated_at = datetime.utcnow()
        # cascade='all, delete-orphan' — 비우고 flush 해서 기존 자식을 INSERT 전에 DELETE.
        batch.bundles.clear()
        db.flush()
        _add_bundles_and_lines(db, batch, payload)
        db.refresh(batch)
        plan = build_effective_plan(db, batch)
        cells = stocktake_pause.io_required_cells(db, batch) + stocktake_pause.io_required_cells(db, batch, plan)
        can_reserve = stocktake_pause.ensure_work_save(db, "io", batch.batch_id, cells,
            getattr(payload, "stocktake_resume_token", None))
        reservations.replace_reservations(db, batch, plan if can_reserve else None, allow_partial=True)
        batch.effective_plan = plan
        resumed = can_reserve and stocktake_pause.complete_work_save(db, "io", batch.batch_id)
        reservations.record_event(db, batch, "stocktake_resumed" if resumed else "saved", expected_revision, requester.employee_id, requester.name)
        return _draft_to_current_stock_payload(db, batch)

    batch = _persist_batch(db, requester=requester, payload=payload, status="draft")
    batch.revision = 1
    batch.creation_payload_hash = fingerprint
    if creation_command == "direct_submit":
        from app.services.io_dispatch import _custom_process_bom_bundle_ids, requires_department_approval
        if requires_department_approval(batch, _custom_process_bom_bundle_ids(db, batch)) and not (batch.notes or "").strip():
            raise ValueError("부서 결재 요청에는 메모를 입력해야 합니다.")
    plan = build_effective_plan(db, batch)
    can_reserve = stocktake_pause.ensure_work_save(db, "io", batch.batch_id,
        stocktake_pause.io_required_cells(db, batch, plan), getattr(payload, "stocktake_resume_token", None),
        direct_submit=creation_command == "direct_submit")
    reservations.replace_reservations(db, batch, plan if can_reserve else None,
                                     allow_partial=creation_command == "draft")
    batch.effective_plan = plan
    if creation_command == "draft":
        reservations.record_event(db, batch, "saved", 0, requester.employee_id, requester.name)
    return _draft_to_current_stock_payload(db, batch)


def validate_creation_replay(batch: IoBatch, payload: IoDraftUpsert, fingerprint: str | None = None) -> dict:
    """A creation key can return current state but can never revive or overwrite it."""
    if batch.requester_employee_id != payload.requester_employee_id:
        raise PermissionError("다른 직원이 사용한 요청 키입니다.")
    if batch.creation_payload_hash != (fingerprint or reservations.creation_hash(payload)):
        raise WorkReservationError("WORK_CREATE_KEY_CONFLICT", "같은 요청 키로 다른 내용을 저장할 수 없습니다.")
    return _batch_to_payload(batch)


def get_draft(
    db: Session,
    *,
    requester_employee_id: uuid.UUID,
    work_type: str,
    sub_type: Optional[str] = None,
) -> Optional[dict]:
    query = db.query(IoBatch).filter(
        IoBatch.requester_employee_id == requester_employee_id,
        IoBatch.work_type == work_type,
        IoBatch.status == "draft",
    )
    if sub_type:
        query = query.filter(IoBatch.sub_type == sub_type)
    batch = query.order_by(IoBatch.updated_at.desc()).first()
    return _draft_to_current_stock_payload(db, batch) if batch else None


def list_drafts(db: Session, *, requester_employee_id: uuid.UUID) -> list[dict]:
    rows = load_draft_graph(
        db.query(IoBatch)
        .filter(
            IoBatch.requester_employee_id == requester_employee_id,
            IoBatch.status == "draft",
        )
        .order_by(IoBatch.updated_at.desc())
    )
    context = draft_read_context(db, rows)
    return [_draft_to_current_stock_payload(db, row, context) for row in rows]


def get_owned_draft(db: Session, *, batch_id: uuid.UUID, requester_employee_id: uuid.UUID) -> dict | None:
    """Never restore another owner's or a no-longer-draft operation."""
    rows = load_draft_graph(db.query(IoBatch).filter(
        IoBatch.batch_id == batch_id, IoBatch.requester_employee_id == requester_employee_id, IoBatch.status == "draft"))
    return _draft_to_current_stock_payload(db, rows[0], draft_read_context(db, rows)) if rows else None


def delete_draft(db: Session, *, batch_id: uuid.UUID, requester_employee_id: uuid.UUID,
                 expected_revision: int | None = None) -> None:
    """임시저장을 삭제하며, 이미 없는 대상은 성공한 재시도로 간주한다."""
    from app.services import stocktake_guard
    from app.services.work_stocktake_pause import remove_pause
    stocktake_guard.lock_control(db)
    batch = reservations.lock_owned_batch(db, batch_id, requester_employee_id)
    if batch is None:
        return
    requester = _load_requester(db, requester_employee_id)
    if batch.status == "cancelled" and db.query(IoWorkReservationEvent).filter_by(
        batch_id=batch_id, action="owner_deleted", from_revision=expected_revision,
        to_revision=batch.revision, actor_employee_id=requester_employee_id,
    ).first() is not None:
        return
    reservations.check_revision(batch, expected_revision)
    reservations.check_draft(batch)
    ensure_batch_is_mutable(batch)
    reservations.advance_revision(db, batch, expected_revision)
    original_plan = batch.effective_plan
    reservations.replace_reservations(db, batch, None)
    batch.effective_plan = original_plan
    batch.status = "cancelled"
    remove_pause(db, "io", batch.batch_id)
    reservations.record_event(db, batch, "owner_deleted", expected_revision, requester.employee_id, requester.name)
    db.flush()


def find_by_client_request_id(db: Session, client_request_id: str) -> Optional[IoBatch]:
    """멱등 retry 시 기존 batch 조회. submit IntegrityError 후 라우터가 사용."""
    return (
        db.query(IoBatch)
        .filter(IoBatch.client_request_id == client_request_id)
        .first()
    )


def build_idempotent_response(batch: IoBatch) -> dict:
    """이미 처리 완료된 batch에 대해 IoSubmitResponse 모양 dict 생성 (재제출 멱등 응답)."""
    if batch.requires_approval:
        message = "승인 요청이 생성되었습니다."
    else:
        message = "입출고가 반영되었습니다."
    return {
        "batch": _batch_to_payload(batch),
        "status": batch.status,
        "requires_approval": batch.requires_approval,
        "stock_request_id": batch.stock_request_id,
        "message": message,
    }
