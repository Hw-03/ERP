"""Resolve legacy draft effects without reserving or changing their saved content."""
from __future__ import annotations

import uuid
import json
from collections.abc import Sequence
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import DefectQuarantineRecord, DefectStockPool, InventoryScope, Item, RequestBucketEnum, StockRequest, StockRequestTypeEnum
from app.services.inv_transfer import department_for_item
from app.services.sr_validation import LineInput


def validate_remaining_stock(db: Session, request_type: StockRequestTypeEnum, lines: Sequence[LineInput]) -> None:
    """Check aggregate live inputs because resuming a legacy draft does not reserve stock.

    The caller has locked the stocktake targets and item inventories. Future outputs
    cannot fund these inputs, and other work/shipping reservations remain unavailable.
    """
    from app.services.stock_availability import AvailabilityCell, figures_for_cells

    needed: dict[AvailabilityCell, Decimal] = {}
    for line in lines:
        if line.from_bucket == RequestBucketEnum.WAREHOUSE:
            cell = AvailabilityCell.warehouse(line.item_id)
        elif line.from_bucket == RequestBucketEnum.PRODUCTION:
            department = line.from_department
            if request_type in {StockRequestTypeEnum.REWORK_NORMAL, StockRequestTypeEnum.SCRAP_NORMAL,
                                StockRequestTypeEnum.DEPT_TO_WAREHOUSE}:
                item = db.get(Item, line.item_id)
                if item is None:
                    raise ValueError(f"품목을 찾을 수 없습니다: {line.item_id}")
                department = department_for_item(item)
            cell = AvailabilityCell.location(line.item_id, department)
        else:
            continue
        needed[cell] = needed.get(cell, Decimal(0)) + Decimal(str(line.quantity))
    figures = figures_for_cells(db, needed, lock_allocations=True)
    for cell, quantity in needed.items():
        available = figures[cell].available
        if available < quantity:
            item = db.get(Item, cell.item_id)
            name = item.item_name if item is not None else str(cell.item_id)
            raise ValueError(f"재고 부족: {name} / {cell.department or '창고'} 가용 {available}개, 남은 작업 {quantity}개.")


def required_cells(db: Session, request: StockRequest) -> list[dict[str, str]]:
    """Include saved routes, live automatic routes, and physical rework descendants.

    An unresolved legacy decision stays visibly blocked rather than silently losing
    its dependency or preventing the entire stocktake round from starting.
    """
    from app.services.dept_adjustment import rework_inventory_item_ids
    from app.services.sr_execution import _child_decisions_from_notes

    scopes = {scope.physical_department: scope.scope_key for scope in db.query(InventoryScope).all()}
    cells: set[tuple[str, str]] = set()

    def add(item_id: uuid.UUID, bucket: object, department: object) -> None:
        value = str(getattr(bucket, "value", bucket))
        if value == "none":
            return
        name = "창고" if value == "warehouse" else str(getattr(department, "value", department) or "미지정")
        cells.add((str(item_id), scopes.get(name, f"unmapped:{name}")))

    for line in request.lines:
        add(line.item_id, line.from_bucket, line.from_department)
        add(line.item_id, line.to_bucket, line.to_department)
        if getattr(line, "pool_id", None):
            pool = db.get(DefectStockPool, line.pool_id)
            if pool is not None:
                cells.add((str(pool.item_id), pool.scope_key))
        elif record_id := (getattr(line, "defect_quarantine_record_id", None) or getattr(line, "record_id", None)):
            record = db.get(DefectQuarantineRecord, record_id)
            if record is not None:
                add(record.item_id, "defective", record.department)

        # These execution handlers resolve the current item department again.
        if request.request_type in {StockRequestTypeEnum.WAREHOUSE_TO_DEPT, StockRequestTypeEnum.DEPT_TO_WAREHOUSE} or (
            request.request_type in {StockRequestTypeEnum.REWORK_NORMAL, StockRequestTypeEnum.SCRAP_NORMAL}
            and str(getattr(line.from_bucket, "value", line.from_bucket)) == "production"
        ):
            item = db.get(Item, line.item_id)
            if item is not None:
                add(line.item_id, "production", department_for_item(item))

    if request.request_type in {StockRequestTypeEnum.REWORK_NORMAL, StockRequestTypeEnum.DEFECT_DISASSEMBLE}:
        try:
            decisions = _child_decisions_from_notes(request)
            if not decisions:
                raise ValueError("Missing rework decisions")
            for line in request.lines:
                item_ids = rework_inventory_item_ids(line.item_id, decisions, db=db,
                    require_bom_template_token=request.request_type == StockRequestTypeEnum.REWORK_NORMAL)
                for item_id in item_ids:
                    if item_id == line.item_id:
                        continue
                    item = db.get(Item, item_id)
                    if item is None:
                        raise ValueError("Missing rework item")
                    add(item_id, "production", department_for_item(item))
        except (KeyError, TypeError, ValueError):
            cells.update((str(line.item_id), "unresolved_rework") for line in request.lines)

    return [{"item_id": item_id, "scope_key": scope} for item_id, scope in sorted(cells)]


def refresh_resume_notes(db: Session, request: StockRequest, lines: Sequence[LineInput], notes: str | None) -> str | None:
    """Retain proven BOM exemptions when a worker confirms smaller remaining amounts.

    Quantities and category splits are supplied by the worker. Only the server's
    original signed BOM identity may receive a fresh quantity-specific token.
    """
    from types import SimpleNamespace
    from app.services.bom_stock_policy import bom_template_claims, has_valid_bom_auto_token, issue_bom_auto_token
    from app.services.dept_adjustment import _validate_decision_tree_against_bom
    from app.services.sr_execution import _child_decisions_from_notes

    if request.request_type not in {StockRequestTypeEnum.REWORK_NORMAL, StockRequestTypeEnum.DEFECT_DISASSEMBLE}:
        return notes
    decisions = _child_decisions_from_notes(SimpleNamespace(notes=notes))
    original = _child_decisions_from_notes(request)
    raw = json.loads(notes or "{}")

    def refresh(parent_id: uuid.UUID, previous: list[dict], current: list[dict]) -> None:
        old_by_id = {str(row["item_id"]): row for row in previous}
        for decision in current:
            item_id = uuid.UUID(str(decision["item_id"]))
            old = old_by_id.get(str(item_id))
            if old is None:
                continue
            if has_valid_bom_auto_token(db, flow="bom_template",
                claims=bom_template_claims(parent_item_id=parent_id, item_id=item_id, quantity=old.get("qty")),
                token=old.get("bom_auto_token")):
                decision["bom_auto_token"] = issue_bom_auto_token(db, flow="bom_template",
                    claims=bom_template_claims(parent_item_id=parent_id, item_id=item_id, quantity=decision["qty"]))
            refresh(item_id, old.get("children") or [], decision.get("children") or [])

    for line in lines:
        _validate_decision_tree_against_bom(db, line.item_id, Decimal(str(line.quantity)), decisions)
        refresh(line.item_id, original, decisions)
    raw["child_decisions"] = decisions
    return json.dumps(raw, ensure_ascii=False)
