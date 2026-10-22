"""Atomic draft ledger replacement, version guards and creation replay checks."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
import hashlib
import json
from typing import Any
import uuid

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import IoBatch, IoDraftReservation, IoWorkReservationEvent, LocationStatusEnum
from app.services import inventory as inventory_svc
from app.services.stock_availability import AvailabilityCell, figures_for_cells
from app.services.work_reservation_errors import WorkReservationError


def creation_hash(payload: Any, command: str = "draft") -> str:
    """Hash user intent, excluding preview identity, derived stock and server tokens."""
    excluded = {"batch_id", "expected_revision", "client_request_id", "bundle_id", "line_id",
                "shortage", "bom_auto_token", "item_name", "mes_code", "title", "unit",
                "has_children", "bom_expected", "bom_stock_exempt", "edited"}

    def canonical(value: Any) -> Any:
        if isinstance(value, dict):
            return {key: canonical(part) for key, part in value.items() if key not in excluded}
        if isinstance(value, list):
            return sorted((canonical(part) for part in value), key=lambda part: json.dumps(part, sort_keys=True))
        return value

    value = {"command": command, "intent": canonical(payload.model_dump(mode="json"))}
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def lock_owned_batch(db: Session, batch_id: uuid.UUID, owner_id: uuid.UUID) -> IoBatch | None:
    """Refresh under the batch lock before disclosing version or state."""
    batch = db.query(IoBatch).filter_by(batch_id=batch_id).populate_existing().with_for_update().first()
    if batch is not None and batch.requester_employee_id != owner_id:
        raise PermissionError("본인 작업만 변경할 수 있습니다.")
    return batch


def check_revision(batch: IoBatch, expected_revision: int | None) -> None:
    """A stale command cannot overwrite a newer reservation or state transition."""
    if expected_revision is None:
        raise WorkReservationError("VALIDATION_ERROR", "작업 버전이 필요합니다.", 422)
    if batch.revision != expected_revision:
        raise WorkReservationError("WORK_REVISION_CONFLICT", "다른 작업에서 변경되었습니다. 최신 내용을 확인해 주세요.", extra={
            "batch_id": str(batch.batch_id), "current_revision": batch.revision, "current_status": batch.status})


def check_draft(batch: IoBatch) -> None:
    """Only active drafts may own a draft reservation ledger."""
    if batch.status != "draft":
        raise WorkReservationError("WORK_STATE_CONFLICT", "작업 중 상태에서만 변경할 수 있습니다.", extra={
            "batch_id": str(batch.batch_id), "current_revision": batch.revision, "current_status": batch.status})


def validate_saved_plan(db: Session, batch: IoBatch) -> dict[str, Any]:
    """Recompute without changing stored lines; changed routing keeps the old reservation intact."""
    from app.services.io_effective_plan import build_effective_plan
    if batch.effective_plan is None:
        raise WorkReservationError("WORK_RESAVE_REQUIRED", "다시 저장해 작업 재고를 확보해 주세요.")
    try:
        current = build_effective_plan(db, batch)
    except ValueError as exc:
        raise WorkReservationError("WORK_PLAN_CHANGED", "작업 구성이 변경되었습니다. 내용을 확인하고 다시 저장해 주세요.", extra={
            "batch_id": str(batch.batch_id), "current_revision": batch.revision}) from exc
    if current["fingerprint"] != batch.effective_plan.get("fingerprint"):
        raise WorkReservationError("WORK_PLAN_CHANGED", "작업 구성이 변경되었습니다. 내용을 확인하고 다시 저장해 주세요.", extra={
            "batch_id": str(batch.batch_id), "current_revision": batch.revision})
    return current


def advance_revision(db: Session, batch: IoBatch, expected_revision: int) -> None:
    """Use CAS even on SQLite, where FOR UPDATE provides no row lock."""
    result = db.execute(update(IoBatch).where(
        IoBatch.batch_id == batch.batch_id, IoBatch.revision == expected_revision, IoBatch.status == "draft",
    ).values(revision=expected_revision + 1, updated_at=datetime.utcnow()).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        db.refresh(batch)
        check_revision(batch, expected_revision)
        check_draft(batch)
        raise WorkReservationError("WORK_STATE_CONFLICT", "작업이 변경되었습니다. 최신 내용을 확인해 주세요.")
    db.refresh(batch)


def reservation_cell(row: IoDraftReservation) -> AvailabilityCell:
    """Convert the ledger's non-null storage key to the shared physical cell key."""
    return (AvailabilityCell.warehouse(row.item_id) if row.source_bucket == "warehouse"
            else AvailabilityCell.location(row.item_id, row.source_department))


def ledger_quantities(db: Session, batch_id: uuid.UUID) -> dict[AvailabilityCell, Decimal]:
    """Read only actual active ledger rows; expected outputs never give credit."""
    return {reservation_cell(row): Decimal(row.quantity) for row in
            db.query(IoDraftReservation).filter_by(batch_id=batch_id).all()}


def replace_reservations(db: Session, batch: IoBatch, plan: dict[str, Any] | None) -> None:
    """Validate all sources first, then atomically apply only each cell's delta."""
    rows = db.query(IoDraftReservation).filter_by(batch_id=batch.batch_id).all()
    old = {reservation_cell(row): Decimal(row.quantity) for row in rows}
    needed: dict[AvailabilityCell, Decimal] = {}
    identities: dict[AvailabilityCell, dict[str, Any]] = {}
    for effect in (plan or {}).get("effects", []):
        source = effect["from"]
        if source is None:
            continue
        cell = (AvailabilityCell.warehouse(uuid.UUID(effect["item_id"])) if source["bucket"] == "warehouse"
                else AvailabilityCell.location(uuid.UUID(effect["item_id"]), source["department"]))
        needed[cell] = needed.get(cell, Decimal(0)) + Decimal(effect["quantity"])
        identities[cell] = {key: effect[key] for key in ("item_id", "item_name", "mes_code", "unit")}
    cells = sorted(set(old) | set(needed), key=lambda cell: cell.sort_key)
    affected_items = {cell.item_id for cell in cells}
    for snapshot in [batch.effective_plan, plan]:
        affected_items.update(uuid.UUID(effect["item_id"]) for effect in (snapshot or {}).get("effects", []))
    inventory_svc.ensure_and_lock_inventories(db, affected_items)
    for cell in cells:
        if cell.department is not None:
            inventory_svc._lock_location(db, cell.item_id, cell.department, cell.status)
    figures = figures_for_cells(db, cells, lock_allocations=True)
    shortages = []
    for cell, quantity in needed.items():
        available = figures[cell].available + old.get(cell, Decimal(0))
        if available < quantity:
            shortages.append({**identities[cell], "location": {
                "bucket": "warehouse" if cell.department is None else "production", "department": cell.department},
                "required_quantity": int(quantity), "available_quantity": int(available),
                "shortage_quantity": int(quantity - available)})
    if shortages:
        bundle_names = {str(bundle.bundle_id): bundle.title_snapshot for bundle in batch.bundles}
        messages = []
        for row in shortages:
            contributors = [f"{bundle_names.get(effect['bundle_id'], '')} {effect['quantity']}" for effect in
                (plan or {}).get("effects", []) if effect["item_id"] == row["item_id"] and effect["from"] == row["location"]]
            messages.append(f"{row['item_name']}: {row['shortage_quantity']} 부족 ({', '.join(contributors)})")
        raise WorkReservationError("STOCK_SHORTAGE", "재고 부족으로 예약할 수 없습니다.", 422,
                                   {"shortages": messages, "reservation_shortages": shortages})
    for cell in cells:
        delta = needed.get(cell, Decimal(0)) - old.get(cell, Decimal(0))
        if not delta:
            continue
        if cell.department is None:
            (inventory_svc.reserve if delta > 0 else inventory_svc.release)(db, cell.item_id, abs(delta))
        else:
            (inventory_svc.reserve_location if delta > 0 else inventory_svc.release_location)(
                db, cell.item_id, abs(delta), department=cell.department, status=LocationStatusEnum.PRODUCTION)
    for row in rows:
        db.delete(row)
    db.flush()
    for cell, quantity in needed.items():
        db.add(IoDraftReservation(batch_id=batch.batch_id, item_id=cell.item_id,
            source_bucket="warehouse" if cell.department is None else "production",
            source_department=cell.department or "", quantity=int(quantity)))
    batch.effective_plan = plan
    batch.reservation_status = "inactive" if plan is None else "reserved" if needed else "not_required"
    batch.reservation_issue = None
    db.flush()


def record_event(db: Session, batch: IoBatch, action: str, previous_revision: int,
                 actor_id: uuid.UUID | None, actor_name: str, reason: str | None = None) -> None:
    """Audit the same committed command as its ledger and version changes."""
    db.add(IoWorkReservationEvent(batch_id=batch.batch_id, action=action, from_revision=previous_revision,
        to_revision=batch.revision, actor_employee_id=actor_id, actor_name=actor_name, reason=reason))
    db.flush()
