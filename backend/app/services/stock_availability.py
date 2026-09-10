"""Source-cell availability shared by every inventory consumer.

Mutation callers lock Item/Inventory and the physical warehouse or location rows
before asking this module to lock active shipping allocations.  That preserves
the global owner -> item/inventory -> physical -> reservation order.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Mapping
import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    ShippingAllocation,
)


ALLOCATION_RESERVED = "RESERVED"
_ZERO = Decimal("0")


def _decimal(value: object) -> Decimal:
    return Decimal(str(value or 0))


def _department_value(value: object | None) -> str | None:
    if value is None:
        return None
    return str(getattr(value, "value", value))


@dataclass(frozen=True)
class AvailabilityCell:
    """Stable identity for one warehouse or InventoryLocation stock cell."""

    item_id: uuid.UUID
    department: str | None = None
    status: LocationStatusEnum | None = None

    @classmethod
    def warehouse(cls, item_id: uuid.UUID) -> "AvailabilityCell":
        return cls(item_id=item_id)

    @classmethod
    def location(
        cls,
        item_id: uuid.UUID,
        department: object,
        status: LocationStatusEnum = LocationStatusEnum.PRODUCTION,
    ) -> "AvailabilityCell":
        return cls(
            item_id=item_id,
            department=_department_value(department),
            status=status,
        )

    @property
    def sort_key(self) -> tuple[str, str, str]:
        return (
            str(self.item_id),
            self.department or "",
            self.status.value if self.status is not None else "",
        )


@dataclass(frozen=True)
class AvailabilityFigure:
    """Physical stock minus StockRequest pending and active shipping reserved."""

    physical: Decimal
    stock_request_pending: Decimal
    active_shipping_reserved: Decimal
    owner_shipping_reserved: Decimal = _ZERO

    @property
    def available(self) -> Decimal:
        return calculate_available(
            self.physical,
            self.stock_request_pending,
            self.active_shipping_reserved,
            owner_shipping_reserved=self.owner_shipping_reserved,
        )


def calculate_available(
    physical: Decimal,
    stock_request_pending: Decimal,
    active_shipping_reserved: Decimal,
    *,
    owner_shipping_reserved: Decimal = _ZERO,
) -> Decimal:
    """Return canonical availability, optionally exempting the caller's reservation."""

    return (
        physical
        - stock_request_pending
        - active_shipping_reserved
        + owner_shipping_reserved
    )


def _allocation_cell(allocation: ShippingAllocation) -> AvailabilityCell:
    if allocation.department is None:
        return AvailabilityCell.warehouse(allocation.item_id)
    return AvailabilityCell.location(
        allocation.item_id,
        allocation.department,
        LocationStatusEnum.PRODUCTION,
    )


def _active_allocations(
    db: Session,
    item_ids: Iterable[uuid.UUID],
    *,
    lock: bool,
) -> list[ShippingAllocation]:
    ordered_item_ids = sorted(set(item_ids))
    if not ordered_item_ids:
        return []
    query = (
        db.query(ShippingAllocation)
        .filter(
            ShippingAllocation.item_id.in_(ordered_item_ids),
            ShippingAllocation.status == ALLOCATION_RESERVED,
        )
        .order_by(
            ShippingAllocation.item_id.asc(),
            ShippingAllocation.department.asc(),
            ShippingAllocation.allocation_id.asc(),
        )
    )
    if lock and db.get_bind().dialect.name == "postgresql":
        query = query.with_for_update()
    return query.all()


def figures_for_cells(
    db: Session,
    cells: Iterable[AvailabilityCell],
    *,
    owner_request_id: uuid.UUID | None = None,
    lock_allocations: bool = False,
) -> dict[AvailabilityCell, AvailabilityFigure]:
    """Read figures for already locked cells, then optionally lock allocations."""

    ordered_cells = sorted(set(cells), key=lambda cell: cell.sort_key)
    allocations = _active_allocations(
        db,
        (cell.item_id for cell in ordered_cells),
        lock=lock_allocations,
    )
    reserved: dict[AvailabilityCell, Decimal] = {}
    owner_reserved: dict[AvailabilityCell, Decimal] = {}
    target_cells = set(ordered_cells)
    for allocation in allocations:
        cell = _allocation_cell(allocation)
        if cell not in target_cells:
            continue
        quantity = _decimal(allocation.quantity)
        reserved[cell] = reserved.get(cell, _ZERO) + quantity
        if owner_request_id is not None and allocation.request_id == owner_request_id:
            owner_reserved[cell] = owner_reserved.get(cell, _ZERO) + quantity

    figures: dict[AvailabilityCell, AvailabilityFigure] = {}
    for cell in ordered_cells:
        if cell.department is None:
            inventory = db.query(Inventory).filter(Inventory.item_id == cell.item_id).one()
            physical = _decimal(inventory.warehouse_qty)
            pending = _decimal(inventory.pending_quantity)
        else:
            location = (
                db.query(InventoryLocation)
                .filter(
                    InventoryLocation.item_id == cell.item_id,
                    InventoryLocation.department == cell.department,
                    InventoryLocation.status == cell.status,
                )
                .one_or_none()
            )
            physical = _decimal(location.quantity if location is not None else None)
            pending = _decimal(
                location.pending_quantity if location is not None else None
            )
        figures[cell] = AvailabilityFigure(
            physical=physical,
            stock_request_pending=pending,
            active_shipping_reserved=reserved.get(cell, _ZERO),
            owner_shipping_reserved=owner_reserved.get(cell, _ZERO),
        )
    return figures


def figure_for_cell(
    db: Session,
    cell: AvailabilityCell,
    *,
    owner_request_id: uuid.UUID | None = None,
    lock_allocations: bool = False,
) -> AvailabilityFigure:
    """Return one cell figure through the same batch policy."""

    return figures_for_cells(
        db,
        [cell],
        owner_request_id=owner_request_id,
        lock_allocations=lock_allocations,
    )[cell]


def bulk_reserved_by_cell(
    db: Session,
    item_ids: Iterable[uuid.UUID],
) -> dict[AvailabilityCell, Decimal]:
    """Return active shipping reservation totals keyed by physical stock cell."""

    ids = list(dict.fromkeys(item_ids))
    if not ids:
        return {}
    rows = (
        db.query(
            ShippingAllocation.item_id,
            ShippingAllocation.department,
            func.coalesce(func.sum(ShippingAllocation.quantity), 0),
        )
        .filter(
            ShippingAllocation.item_id.in_(ids),
            ShippingAllocation.status == ALLOCATION_RESERVED,
        )
        .group_by(ShippingAllocation.item_id, ShippingAllocation.department)
        .all()
    )
    reserved: dict[AvailabilityCell, Decimal] = {}
    for item_id, department, quantity in rows:
        cell = (
            AvailabilityCell.warehouse(item_id)
            if department is None
            else AvailabilityCell.location(
                item_id,
                department,
                LocationStatusEnum.PRODUCTION,
            )
        )
        reserved[cell] = reserved.get(cell, _ZERO) + _decimal(quantity)
    return reserved


def location_available_quantity(
    location: InventoryLocation,
    reserved_by_cell: Mapping[AvailabilityCell, Decimal],
) -> Decimal:
    """Return canonical availability for one location response row."""

    cell = AvailabilityCell.location(
        location.item_id,
        location.department,
        location.status,
    )
    return calculate_available(
        _decimal(location.quantity),
        _decimal(location.pending_quantity),
        reserved_by_cell.get(cell, _ZERO),
    )


def bulk_reserved_by_item(
    db: Session,
    item_ids: Iterable[uuid.UUID],
) -> tuple[dict[uuid.UUID, Decimal], dict[uuid.UUID, Decimal]]:
    """Return total and warehouse-only active shipping reservation aggregates."""

    total: dict[uuid.UUID, Decimal] = {}
    warehouse: dict[uuid.UUID, Decimal] = {}
    for cell, value in bulk_reserved_by_cell(db, item_ids).items():
        total[cell.item_id] = total.get(cell.item_id, _ZERO) + value
        if cell.department is None:
            warehouse[cell.item_id] = warehouse.get(cell.item_id, _ZERO) + value
    return total, warehouse
