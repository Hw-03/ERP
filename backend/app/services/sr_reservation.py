"""Source-aware stock request reservation aggregation and mutation."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable, Sequence
import uuid

from sqlalchemy.orm import Session

from app.models import (
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
)
from app.services import inventory as inventory_svc


@dataclass(frozen=True)
class ReservationGroup:
    bucket: RequestBucketEnum
    item_id: uuid.UUID
    quantity: Decimal
    department: str | None
    status: LocationStatusEnum | None

    @property
    def sort_key(self) -> tuple[str, str, str, str]:
        return (
            self.bucket.value,
            str(self.item_id),
            str(self.department or ""),
            self.status.value if self.status else "",
        )


def _source_key(line) -> tuple[RequestBucketEnum, uuid.UUID, str | None, LocationStatusEnum | None] | None:
    bucket = RequestBucketEnum(line.from_bucket)
    if bucket in (RequestBucketEnum.NONE,):
        return None
    if bucket == RequestBucketEnum.WAREHOUSE:
        return bucket, line.item_id, None, None
    if bucket in (RequestBucketEnum.PRODUCTION, RequestBucketEnum.DEFECTIVE):
        department = getattr(line.from_department, "value", line.from_department)
        if not department:
            raise ValueError(f"{bucket.value} 출고 예약에는 from_department가 필요합니다.")
        status = (
            LocationStatusEnum.PRODUCTION
            if bucket == RequestBucketEnum.PRODUCTION
            else LocationStatusEnum.DEFECTIVE
        )
        return bucket, line.item_id, str(department), status
    return None


def aggregate_reservations(lines: Iterable) -> list[ReservationGroup]:
    """Aggregate every outgoing source into a stable lock/update order."""
    quantities: dict[
        tuple[RequestBucketEnum, uuid.UUID, str | None, LocationStatusEnum | None],
        Decimal,
    ] = {}
    for line in lines:
        key = _source_key(line)
        if key is None:
            continue
        quantity = Decimal(str(line.quantity or 0))
        if quantity <= 0:
            raise ValueError("예약 수량은 0보다 커야 합니다.")
        quantities[key] = quantities.get(key, Decimal("0")) + quantity

    groups = [
        ReservationGroup(
            bucket=bucket,
            item_id=item_id,
            quantity=quantity,
            department=department,
            status=status,
        )
        for (bucket, item_id, department, status), quantity in quantities.items()
    ]
    return sorted(groups, key=lambda group: group.sort_key)


def _prelock_inventories(
    db: Session,
    groups: Sequence[ReservationGroup],
) -> None:
    """Ensure then lock every source item's Inventory before any source mutation."""
    item_ids = sorted({group.item_id for group in groups})
    inventory_svc.ensure_and_lock_inventories(db, item_ids)


def _group_key(
    group: ReservationGroup,
) -> tuple[RequestBucketEnum, uuid.UUID, str | None, LocationStatusEnum | None]:
    return group.bucket, group.item_id, group.department, group.status


def _other_reserved_quantities(
    db: Session,
    request_id: uuid.UUID,
) -> dict[
    tuple[RequestBucketEnum, uuid.UUID, str | None, LocationStatusEnum | None],
    Decimal,
]:
    """Return reservations that must remain for other active requests."""
    lines = (
        db.query(StockRequestLine)
        .join(StockRequest, StockRequestLine.request_id == StockRequest.request_id)
        .filter(
            StockRequest.request_id != request_id,
            StockRequest.status == StockRequestStatusEnum.RESERVED,
            StockRequestLine.status == StockRequestStatusEnum.RESERVED,
        )
        .all()
    )
    return {
        _group_key(group): group.quantity
        for group in aggregate_reservations(lines)
    }


def _current_pending(db: Session, group: ReservationGroup) -> Decimal:
    if group.bucket == RequestBucketEnum.WAREHOUSE:
        inventory = (
            db.query(Inventory)
            .filter(Inventory.item_id == group.item_id)
            .one()
        )
        return Decimal(str(inventory.pending_quantity or 0))
    location = (
        db.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == group.item_id,
            InventoryLocation.department == group.department,
            InventoryLocation.status == group.status,
        )
        .one_or_none()
    )
    return Decimal(str(location.pending_quantity or 0)) if location else Decimal("0")


def _release_group(
    db: Session,
    group: ReservationGroup,
    quantity: Decimal,
) -> None:
    if group.bucket == RequestBucketEnum.WAREHOUSE:
        inventory_svc.release(db, group.item_id, quantity)
    else:
        inventory_svc.release_location(
            db,
            group.item_id,
            quantity,
            department=group.department,
            status=group.status,
        )


def _reconciled_release_quantity(
    db: Session,
    group: ReservationGroup,
    other_reserved: dict[
        tuple[RequestBucketEnum, uuid.UUID, str | None, LocationStatusEnum | None],
        Decimal,
    ],
) -> Decimal:
    """Release only pending not required by another active request."""
    current = _current_pending(db, group)
    protected = other_reserved.get(_group_key(group), Decimal("0"))
    return min(group.quantity, max(Decimal("0"), current - protected))


def reserve_lines(db: Session, lines: Iterable, *, employee=None) -> None:
    lines = list(lines)
    from app.services import defect_records as defect_records_svc

    record_groups: dict[uuid.UUID, tuple[object, Decimal]] = {}
    for line in lines:
        record_id = getattr(
            line,
            "defect_quarantine_record_id",
            getattr(line, "record_id", None),
        )
        if (
            RequestBucketEnum(line.from_bucket) != RequestBucketEnum.DEFECTIVE
            or record_id is None
        ):
            continue
        exemplar, quantity = record_groups.get(
            record_id,
            (line, Decimal("0")),
        )
        record_groups[record_id] = (
            exemplar,
            quantity + Decimal(str(line.quantity)),
        )

    for record_id in sorted(record_groups, key=str):
        line, quantity = record_groups[record_id]
        record = defect_records_svc.get_record_for_action(
            db,
            record_id=record_id,
            item_id=line.item_id,
            department=line.from_department,
        )
        if record is None:
            raise ValueError("선택한 격리 기록을 찾을 수 없습니다.")
        defect_records_svc.ensure_available(db, record, quantity)

    groups = aggregate_reservations(lines)
    _prelock_inventories(db, groups)
    for group in groups:
        if group.bucket == RequestBucketEnum.WAREHOUSE:
            inventory_svc.reserve(
                db,
                group.item_id,
                group.quantity,
                employee=employee,
            )
        else:
            inventory_svc.reserve_location(
                db,
                group.item_id,
                group.quantity,
                department=group.department,
                status=group.status,
            )


def release_lines(
    db: Session,
    lines: Iterable,
    *,
    request_id: uuid.UUID | None = None,
) -> None:
    groups = aggregate_reservations(lines)
    _prelock_inventories(db, groups)
    other_reserved = (
        _other_reserved_quantities(db, request_id)
        if request_id is not None
        else {}
    )
    for group in groups:
        quantity = (
            _reconciled_release_quantity(db, group, other_reserved)
            if request_id is not None
            else group.quantity
        )
        if quantity > 0:
            _release_group(db, group, quantity)


def release_lines_best_effort(
    db: Session,
    lines: Iterable,
    *,
    request_id: uuid.UUID | None = None,
) -> None:
    """Release safe source excess independently, tolerating legacy gaps."""
    groups = aggregate_reservations(lines)
    _prelock_inventories(db, groups)
    other_reserved = (
        _other_reserved_quantities(db, request_id)
        if request_id is not None
        else {}
    )
    for group in groups:
        try:
            quantity = (
                _reconciled_release_quantity(db, group, other_reserved)
                if request_id is not None
                else group.quantity
            )
            if quantity > 0:
                _release_group(db, group, quantity)
        except ValueError:
            continue
