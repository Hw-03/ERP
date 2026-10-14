"""Validate typed application evidence against confirmations and actual stock effects."""
from collections import defaultdict
import uuid

from sqlalchemy.orm import Session

from app.models import (DefectStockMovement, DefectStockPool, InventoryOperation, InventoryScope,
                        StocktakeApplication, StocktakeApplicationLine, StocktakeCount, StocktakeEvent,
                        StocktakeGate, StocktakePreview, StocktakeReceipt, TransactionLog)
from app.services.inventory_integrity_engine import OperationEvidenceState
from app.services.stocktake_common import CATEGORIES, fingerprint


def _quantities(value: object) -> bool:
    """JSON presence is insufficient: all four exact nonnegative integer values are required."""
    return (isinstance(value, dict) and set(value) == set(CATEGORIES)
            and all(type(q) is int and 0 <= q <= 2147483647 for q in value.values())
            and sum(value.values()) <= 2147483647)


def _bulk_bound(db: Session, application: StocktakeApplication, preview: StocktakePreview,
                operation: InventoryOperation) -> bool:
    """A scope seal is evidence only through its completed bulk command and parent seal."""
    if preview.actor_id != application.actor_id:
        return False
    receipts = db.query(StocktakeReceipt).filter_by(
        actor_id=application.actor_id, command_kind="application_bulk_apply").all()
    for receipt in receipts:
        if (not receipt.completed_at or not isinstance(receipt.response, dict)
                or operation.idempotency_key != f"stocktake:{uuid.uuid5(receipt.receipt_id, application.scope_key)}"):
            continue
        response = receipt.response
        entries = preview.payload.get("entries", [])
        selected = [entry["confirmation_revision_id"] for entry in entries]
        if (response.get("receipt_id") != str(receipt.receipt_id)
                or not any(isinstance(row, dict)
                           and row.get("application_id") == str(application.application_id)
                           and row.get("operation_id") == str(application.operation_id)
                           and row.get("confirmation_revision_ids") == selected
                           for row in response.get("applications", []))):
            return False
        masters = db.query(StocktakePreview).filter_by(
            kind="application_bulk", round_id=application.round_id, actor_id=application.actor_id).all()
        for master in masters:
            if (master.preview_hash != fingerprint(master.payload)
                    or receipt.request_hash != fingerprint({"round_id": str(application.round_id),
                        "preview_id": str(master.preview_id), "preview_hash": master.preview_hash})):
                continue
            manifests = master.payload.get("applications", [])
            refs = master.payload.get("scope_previews", [])
            if (len(manifests) != len(refs)
                    or response.get("confirmation_revision_ids") != [entry["confirmation_revision_id"]
                        for value in manifests for entry in value.get("entries", [])]):
                return False
            return any(ref == {"preview_id": str(preview.preview_id), "preview_hash": preview.preview_hash}
                       and value == preview.payload for value, ref in zip(manifests, refs))
        return False
    return False


def _valid(db: Session, application: StocktakeApplication) -> bool:
    """Compare the immutable observed four values with the operation's real projections."""
    operation = db.get(InventoryOperation, application.operation_id)
    preview = db.get(StocktakePreview, application.preview_id)
    lines = db.query(StocktakeApplicationLine).filter_by(application_id=application.application_id).all()
    if not operation or (operation.domain, operation.action) != ("stocktake", "apply") or operation.actor_employee_id != application.actor_id:
        return False
    if (not preview or preview.kind not in {"application", "application_bulk_scope"}
            or preview.round_id != application.round_id
            or preview.preview_hash != fingerprint(preview.payload) or not lines
            or preview.payload.get("round_id") != str(application.round_id)
            or preview.payload.get("scope_id") != application.scope_key):
        return False
    if preview.kind == "application_bulk_scope" and not _bulk_bound(db, application, preview, operation):
        return False
    selected = {entry["confirmation_revision_id"]: entry for entry in preview.payload.get("entries", [])}
    if set(selected) != {str(line.confirmation_revision_id) for line in lines}:
        return False
    physical, pooled = {}, {}
    scope = db.get(InventoryScope, application.scope_key)
    for line in lines:
        count = db.get(StocktakeCount, line.count_id)
        event = db.get(StocktakeEvent, line.confirmation_revision_id)
        gate = db.get(StocktakeGate, (line.item_id, line.scope_key))
        entry = selected[str(line.confirmation_revision_id)]
        if (line.scope_key != application.scope_key or not count or count.status != "APPLIED"
                or count.round_id != application.round_id or count.confirmation_revision_id != line.confirmation_revision_id
                or not event or event.kind != "COUNT_CONFIRMED" or event.count_id != count.count_id
                or event.actor_id != count.owner_id or event.payload.get("quantities") != line.after_quantities
                or not gate or gate.observation_epoch < line.observation_epoch_after
                or line.observation_epoch_after != line.observation_epoch_before + 1
                or not all(_quantities(v) for v in (line.before_quantities, line.after_quantities, line.reservations))
                or entry.get("before") != line.before_quantities or entry.get("after") != line.after_quantities
                or entry.get("reservations") != line.reservations or entry.get("observation_epoch") != line.observation_epoch_before
                or any(line.after_quantities[c] < line.reservations[c] for c in CATEGORIES)):
            return False
        deltas = {c: line.after_quantities[c] - line.before_quantities[c] for c in CATEGORIES}
        if deltas["normal"]:
            normal_key = (str(line.item_id), "warehouse", None, None) if application.scope_key == "warehouse" else (str(line.item_id), "location", scope.physical_department, "PRODUCTION")
            physical[normal_key] = deltas["normal"]
        if sum(deltas[c] for c in CATEGORIES[1:]):
            physical[(str(line.item_id), "location", scope.physical_department, "DEFECTIVE")] = sum(deltas[c] for c in CATEGORIES[1:])
        for category in CATEGORIES[1:]:
            if deltas[category]:
                pooled[(str(line.item_id), line.scope_key, category.upper())] = deltas[category]
    actual_physical, actual_pooled = defaultdict(int), defaultdict(int)
    for log in db.query(TransactionLog).filter_by(operation_id=application.operation_id).all():
        if not isinstance(log.inventory_effect, list) or not log.inventory_effect:
            return False
        for effect in log.inventory_effect:
            actual_physical[(str(log.item_id), effect.get("scope"), effect.get("department"), effect.get("status"))] += effect.get("delta", 0)
    for movement in db.query(DefectStockMovement).filter_by(operation_id=application.operation_id).all():
        pool = db.get(DefectStockPool, movement.pool_id)
        actual_pooled[(str(pool.item_id), pool.scope_key, pool.category)] += int(movement.delta)
    return dict(actual_physical) == physical and dict(actual_pooled) == pooled


def application_evidence(db: Session) -> list[OperationEvidenceState]:
    """Expose zero-difference observations to the existing ledger integrity engine."""
    return [OperationEvidenceState(evidence_id=str(row.application_id), operation_id=str(row.operation_id),
                                   kind="stocktake_application", valid=_valid(db, row))
            for row in db.query(StocktakeApplication).all()]
