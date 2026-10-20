"""Explicit, oldest-first legacy conversion; dry runs use an in-memory stock budget."""
from __future__ import annotations

from decimal import Decimal
from typing import Any
import uuid

from sqlalchemy.orm import Session

from app.models import Employee, IoBatch, SystemSetting
from app.schemas.work_reservations import WorkReservationIssue
from app.services import io_preview, io_reservations as reservations
from app.services.io_effective_plan import build_effective_plan
from app.services.io_persist import ensure_batch_is_mutable
from app.services.item_write_validation import validate_io_items
from app.services.stock_availability import AvailabilityCell, figures_for_cells
from app.services.supplier import validate_supplier_for_operation
from app.services.work_reservation_errors import WorkReservationError


def _required_inputs(plan: dict[str, Any] | None) -> dict[AvailabilityCell, Decimal]:
    """Aggregate inputs without letting future outputs fund a current reservation."""
    result: dict[AvailabilityCell, Decimal] = {}
    for effect in (plan or {}).get("effects", []):
        source = effect["from"]
        if source is None:
            continue
        if source["bucket"] not in {"warehouse", "production"}:
            raise WorkReservationError("WORK_UNSUPPORTED_SOURCE", "지원하지 않는 예약 출발지입니다.", 422)
        cell = (AvailabilityCell.warehouse(uuid.UUID(effect["item_id"])) if source["bucket"] == "warehouse"
                else AvailabilityCell.location(uuid.UUID(effect["item_id"]), source["department"]))
        quantity = Decimal(effect["quantity"])
        if not quantity.is_finite() or quantity <= 0 or quantity != quantity.to_integral_value():
            raise ValueError("예약 수량은 양의 정수여야 합니다.")
        result[cell] = result.get(cell, Decimal(0)) + quantity
    return result


def _validated_plan(db: Session, batch: IoBatch) -> dict[str, Any]:
    """Recheck stored business input without minting tokens or silently repairing legacy BOMs."""
    ensure_batch_is_mutable(batch)
    from app.services.bom_stock_policy import BOM_AUTO_TOKEN_SETTING_KEY
    if any(line.origin == "bom_auto" for bundle in batch.bundles for line in bundle.lines):
        if db.query(SystemSetting).filter_by(setting_key=BOM_AUTO_TOKEN_SETTING_KEY).first() is None:
            raise ValueError("자동 BOM 근거를 읽기 전용으로 검증할 수 없습니다.")
    requester = db.get(Employee, batch.requester_employee_id)
    if requester is None or not requester.is_active:
        raise WorkReservationError("INACTIVE_OWNER", "비활성 담당자 작업입니다.", 422)
    # Reject defective sources before route normalization can replace their meaning.
    if any(line.included and line.from_bucket == "defective" for bundle in batch.bundles for line in bundle.lines):
        raise WorkReservationError("WORK_UNSUPPORTED_SOURCE", "불량 출발 재고는 전환할 수 없습니다.", 422)
    validate_io_items(db, batch.bundles, sub_type=batch.sub_type)
    operation = {"work_type": batch.work_type, "sub_type": batch.sub_type}
    io_preview.validate_receive_requester(requester, **operation, db=db)
    io_preview.validate_material_outbound(**operation, bundles=batch.bundles, notes=batch.notes, require_reason=False)
    io_preview.validate_saved_operation_sources(**operation, bundles=batch.bundles, requested_department=batch.to_department)
    io_preview.validate_internal_use_requester(requester, **operation)
    io_preview.validate_internal_use_bundles(**operation, bundles=batch.bundles, db=db)
    io_preview.validate_internal_use_operation(**operation, to_department=batch.to_department,
        lines=(line for bundle in batch.bundles for line in bundle.lines), db=db)
    io_preview.validate_warehouse_adjust_requester(requester, **operation)
    io_preview.validate_warehouse_adjust_operation(**operation,
        from_department=batch.from_department, to_department=batch.to_department,
        lines=(line for bundle in batch.bundles for line in bundle.lines))
    validate_supplier_for_operation(db, **operation, supplier_id=batch.supplier_id)
    return build_effective_plan(db, batch)


def _existing_reservation_matches(batch: IoBatch, old: dict[AvailabilityCell, Decimal]) -> bool:
    """Already secured drafts remain secured even after their owner becomes inactive."""
    if batch.effective_plan is None or batch.reservation_status not in {"reserved", "not_required"}:
        return False
    needed = _required_inputs(batch.effective_plan)
    return old == needed and batch.reservation_status == ("reserved" if needed else "not_required")


def _error_issue(exc: WorkReservationError) -> WorkReservationIssue:
    """Keep business failure details in the same DTO used by every work-status response."""
    return WorkReservationIssue.model_validate({
        "code": {"INACTIVE_OWNER": "inactive_owner", "WORK_UNSUPPORTED_SOURCE": "unsupported_source",
                 "STOCK_SHORTAGE": "stock_shortage"}.get(exc.code, "plan_invalid"),
        "message": str(exc),
        "shortages": (exc.extra or {}).get("reservation_shortages", []),
    })


def _assess(db: Session, batch: IoBatch, simulated: dict[AvailabilityCell, Decimal]) -> tuple[dict | None, WorkReservationIssue | None]:
    """Use the live availability plus own ledger, minus earlier dry-run commitments."""
    try:
        plan = _validated_plan(db, batch)
        needed = _required_inputs(plan)
        old = reservations.ledger_quantities(db, batch.batch_id)
        figures = figures_for_cells(db, needed)
        identities = {}
        for effect in plan["effects"]:
            source = effect["from"]
            if source is not None:
                cell = (AvailabilityCell.warehouse(uuid.UUID(effect["item_id"])) if source["bucket"] == "warehouse"
                        else AvailabilityCell.location(uuid.UUID(effect["item_id"]), source["department"]))
                identities[cell] = {key: effect[key] for key in ("item_id", "item_name", "mes_code", "unit")}
        shortages = []
        for cell, quantity in sorted(needed.items(), key=lambda pair: pair[0].sort_key):
            available = figures[cell].available + old.get(cell, Decimal(0)) - simulated.get(cell, Decimal(0))
            if available < quantity:
                shortages.append({**identities[cell], "location": {
                    "bucket": "warehouse" if cell.department is None else "production", "department": cell.department},
                    "required_quantity": int(quantity), "available_quantity": int(available),
                    "shortage_quantity": int(quantity - available)})
        if shortages:
            return None, WorkReservationIssue.model_validate({
                "code": "stock_shortage", "message": "예약할 재고가 부족합니다.", "shortages": shortages})
        return plan, None
    except WorkReservationError as exc:
        return None, _error_issue(exc)
    except (ValueError, PermissionError, KeyError, TypeError) as exc:
        return None, WorkReservationIssue(code="plan_invalid", message=str(exc) or "작업 계획을 검증할 수 없습니다.", shortages=[])


def _mark_needs_reservation(db: Session, batch: IoBatch, issue: WorkReservationIssue) -> bool:
    """Record only a changed conversion outcome, leaving repeated failures idempotent."""
    old = reservations.ledger_quantities(db, batch.batch_id)
    stored_issue = issue.model_dump(mode="json")
    if (batch.reservation_status == "needs_reservation" and batch.reservation_issue == stored_issue
            and batch.effective_plan is None and not old):
        return False
    revision = batch.revision
    reservations.advance_revision(db, batch, revision)
    reservations.replace_reservations(db, batch, None)
    batch.reservation_status = "needs_reservation"
    batch.reservation_issue = stored_issue
    reservations.record_event(db, batch, "backfilled", revision, None, "기존 작업 전환", issue.code)
    return True


def backfill_work_reservations(db: Session, *, apply: bool = False) -> list[dict[str, Any]]:
    """Convert each draft in its own transaction; default dry-run performs no writes.

    Call with a dedicated session and no unrelated pending changes. Expected input
    failures become short issue codes; unexpected failures roll back that batch.
    """
    ids = [row[0] for row in db.query(IoBatch.batch_id).filter_by(status="draft")
           .order_by(IoBatch.created_at.asc(), IoBatch.batch_id.asc()).all()]
    simulated: dict[AvailabilityCell, Decimal] = {}
    report = []
    for batch_id in ids:
        try:
            if apply:
                hint = db.get(IoBatch, batch_id)
                if hint is not None and hint.sub_type == "internal_use_out":
                    from app.services.internal_use_approval import lock_approver_roster
                    lock_approver_roster(db)
            query = db.query(IoBatch).filter_by(batch_id=batch_id).populate_existing()
            batch = (query.with_for_update() if apply else query).first()
            if batch is None or batch.status != "draft":
                report.append({"batch_id": str(batch_id), "status": "skipped", "issue": "state_changed"})
                if apply:
                    db.rollback()
                continue
            old = reservations.ledger_quantities(db, batch_id)
            if _existing_reservation_matches(batch, old):
                report.append({"batch_id": str(batch_id), "status": "unchanged", "issue": None})
                if apply:
                    db.commit()
                continue
            plan, issue = _assess(db, batch, simulated)
            status = "needs_reservation" if issue else "would_reserve"
            if apply:
                if issue:
                    if not _mark_needs_reservation(db, batch, issue):
                        status = "unchanged"
                else:
                    try:
                        with db.begin_nested():
                            revision = batch.revision
                            reservations.advance_revision(db, batch, revision)
                            reservations.replace_reservations(db, batch, plan)
                            reservations.record_event(db, batch, "backfilled", revision, None, "기존 작업 전환")
                        status = batch.reservation_status
                    except WorkReservationError as exc:
                        if exc.code != "STOCK_SHORTAGE":
                            raise
                        issue = _error_issue(exc)
                        status = "needs_reservation" if _mark_needs_reservation(db, batch, issue) else "unchanged"
                db.commit()
            elif issue is None:
                needed = _required_inputs(plan)
                for cell in set(needed) | set(old):
                    simulated[cell] = simulated.get(cell, Decimal(0)) + needed.get(cell, Decimal(0)) - old.get(cell, Decimal(0))
            report.append({"batch_id": str(batch_id), "status": status, "issue": issue.code if issue else None})
        except Exception as exc:
            if apply:
                db.rollback()
            report.append({"batch_id": str(batch_id), "status": "error", "issue": type(exc).__name__})
    return report
