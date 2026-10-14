"""Shared dashboard and stocktake inventory projections, batched by item."""
import uuid
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import DefectQuarantineRecord, InventoryLocation, LocationStatusEnum
from app.schemas import InventoryLocationResponse
from app.schemas.item import DefectiveStockBreakdown
from app.services import stock_availability, stock_math


def bulk_defective_breakdown(
    db: Session,
    item_ids: list[uuid.UUID],
    locations_by_item: dict[uuid.UUID, list[InventoryLocationResponse]],
) -> dict[uuid.UUID, list[DefectiveStockBreakdown]]:
    """남은 원장을 일괄 집계하고, 원장 없는 기존 위치만 불량으로 보완한다."""
    if not item_ids:
        return {}
    from app.services import defect_pool
    if defect_pool.is_pool_mode(db):
        from app.models import DefectStockPool, InventoryScope
        pooled: dict[uuid.UUID, list[DefectiveStockBreakdown]] = {}
        rows = db.query(DefectStockPool, InventoryScope).join(
            InventoryScope, DefectStockPool.scope_key == InventoryScope.scope_key,
        ).filter(DefectStockPool.item_id.in_(item_ids), DefectStockPool.quantity > 0).order_by(
            DefectStockPool.item_id, DefectStockPool.scope_key, DefectStockPool.category,
        ).all()
        for pool, scope in rows:
            pooled.setdefault(pool.item_id, []).append(DefectiveStockBreakdown(
                department=scope.physical_department, management_category=pool.category, quantity=pool.quantity,
            ))
        return pooled
    record = DefectQuarantineRecord
    category = func.coalesce(record.management_category, "DEFECT")
    rows = (
        db.query(record.item_id, record.department, category, func.sum(record.remaining_quantity))
        .filter(record.item_id.in_(item_ids), record.remaining_quantity > 0)
        .group_by(record.item_id, record.department, category)
        .order_by(record.item_id, record.department, category)
        .all()
    )
    result: dict[uuid.UUID, list[DefectiveStockBreakdown]] = {}
    covered_cells: set[tuple[uuid.UUID, str]] = set()
    for item_id, department, management_category, quantity in rows:
        result.setdefault(item_id, []).append(DefectiveStockBreakdown(
            department=department,
            management_category=management_category,
            quantity=quantity,
        ))
        covered_cells.add((item_id, department))
    for item_id in item_ids:
        for location in locations_by_item.get(item_id, []):
            if (
                location.status == LocationStatusEnum.DEFECTIVE
                and location.quantity > 0
                and (item_id, location.department) not in covered_cells
            ):
                result.setdefault(item_id, []).append(DefectiveStockBreakdown(
                    department=location.department,
                    management_category="DEFECT",
                    quantity=location.quantity,
                ))
    return result


def inventory_summaries(db: Session, item_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict]:
    """Use the dashboard's stock formulas and managed buckets without per-item reads."""
    ids = list(set(item_ids))
    if not ids:
        return {}
    figures = stock_math.bulk_compute(db, ids)
    reserved = stock_availability.bulk_reserved_by_cell(db, ids)
    locations = {}
    for row in db.query(InventoryLocation).filter(InventoryLocation.item_id.in_(ids),
                                                 InventoryLocation.quantity > 0).all():
        locations.setdefault(row.item_id, []).append(InventoryLocationResponse(
            department=row.department, status=row.status, quantity=row.quantity or Decimal(0),
            pending_quantity=row.pending_quantity or Decimal(0),
            available_quantity=stock_availability.location_available_quantity(row, reserved)))
    managed = bulk_defective_breakdown(db, ids, locations)
    return {item_id: {
        "quantity": figures[item_id].total, "warehouse_qty": figures[item_id].warehouse_qty,
        "pending_quantity": figures[item_id].pending,
        "department_pending_quantity": figures[item_id].department_pending,
        "available_quantity": figures[item_id].available,
        "locations": [location.model_dump(mode="json") for location in locations.get(item_id, [])],
        "defective_breakdown": [entry.model_dump(mode="json") for entry in managed.get(item_id, [])],
    } for item_id in ids}
