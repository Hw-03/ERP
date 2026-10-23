"""One request-local snapshot replaces per-line stock and relationship reads."""
from dataclasses import dataclass
from decimal import Decimal
import uuid

from sqlalchemy import or_
from sqlalchemy.orm import Query, Session, selectinload

from app.models import Inventory, InventoryLocation, IoBatch, IoBundle, IoDraftReservation, LocationStatusEnum, StockRequest
from app.services.io_reservations import reservation_cell
from app.services.stock_availability import AvailabilityCell, bulk_reserved_by_cell, calculate_available


@dataclass
class DraftReadContext:
    """Only a single read response may reuse these values; never cache for commands."""
    requests: dict[uuid.UUID, list[StockRequest]]
    credits: dict[uuid.UUID, dict[AvailabilityCell, Decimal]]
    available: dict[AvailabilityCell, Decimal]


def load_draft_graph(query: Query[IoBatch]) -> list[IoBatch]:
    """Eager load the same graph for a list and a single owned draft."""
    return query.options(
        selectinload(IoBatch.bundles).joinedload(IoBundle.source_item),
        selectinload(IoBatch.bundles).selectinload(IoBundle.lines),
    ).all()


def draft_read_context(db: Session, batches: list[IoBatch]) -> DraftReadContext:
    """Read all physical cells, reservations and approval links in bounded queries."""
    ids = [batch.batch_id for batch in batches]
    requests: dict[uuid.UUID, list[StockRequest]] = {key: [] for key in ids}
    credits: dict[uuid.UUID, dict[AvailabilityCell, Decimal]] = {key: {} for key in ids}
    if not ids:
        return DraftReadContext(requests, credits, {})
    linked = db.query(StockRequest).filter(or_(
        StockRequest.operation_batch_id.in_(ids),
        StockRequest.request_id.in_([batch.stock_request_id for batch in batches if batch.stock_request_id]),
    )).options(selectinload(StockRequest.lines)).order_by(StockRequest.created_at, StockRequest.request_id).all()
    by_id = {request.request_id: request for request in linked}
    for request in linked:
        if request.operation_batch_id in requests:
            requests[request.operation_batch_id].append(request)
    for batch in batches:
        if not requests[batch.batch_id] and batch.stock_request_id in by_id:
            requests[batch.batch_id] = [by_id[batch.stock_request_id]]
    for row in db.query(IoDraftReservation).filter(IoDraftReservation.batch_id.in_(ids)).all():
        credits[row.batch_id][reservation_cell(row)] = Decimal(row.quantity)
    item_ids = {line.item_id for batch in batches for bundle in batch.bundles for line in bundle.lines}
    reserved = bulk_reserved_by_cell(db, item_ids)
    available = {}
    # An absent department row is a real zero, not a reason for N extra reads.
    for batch in batches:
        for bundle in batch.bundles:
            for line in bundle.lines:
                if line.from_bucket in {"production", "defective"} and line.from_department:
                    cell = AvailabilityCell.location(line.item_id, line.from_department,
                        LocationStatusEnum.DEFECTIVE if line.from_bucket == "defective" else LocationStatusEnum.PRODUCTION)
                    available[cell] = -reserved.get(cell, Decimal(0))
        for effect in (batch.effective_plan or {}).get("effects", []):
            source = effect.get("from")
            if source and source["bucket"] == "production" and source.get("department"):
                cell = AvailabilityCell.location(uuid.UUID(effect["item_id"]), source["department"])
                available[cell] = -reserved.get(cell, Decimal(0))
    for row in db.query(Inventory).filter(Inventory.item_id.in_(item_ids)).all():
        cell = AvailabilityCell.warehouse(row.item_id)
        available[cell] = calculate_available(Decimal(row.warehouse_qty or 0), Decimal(row.pending_quantity or 0), reserved.get(cell, Decimal(0)))
    for row in db.query(InventoryLocation).filter(InventoryLocation.item_id.in_(item_ids)).all():
        cell = AvailabilityCell.location(row.item_id, row.department, row.status)
        available[cell] = calculate_available(Decimal(row.quantity or 0), Decimal(row.pending_quantity or 0), reserved.get(cell, Decimal(0)))
    return DraftReadContext(requests, credits, available)
