"""실제 원장을 검증한 뒤 요청 순서의 표시 잔고만 재구성한다. DB 쓰기 없음."""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models import Inventory, InventoryLocation, IoBatch, LocationStatusEnum, TransactionLog
from app.schemas.transaction import RequestOrderStockReason, RequestOrderStockResponse
from app.services.inv_effect import StockTotals


@dataclass(frozen=True)
class StockHistoryEntry:
    """단일 품목의 검증 입력. before/after는 창고와 전체 정상 부서의 독립 합계다."""

    log_id: UUID
    created_at: datetime
    requested_at: datetime
    before: StockTotals | None
    after: StockTotals | None
    inventory_effect: object
    cancelled: bool = False
    cancelled_at: datetime | None = None
    reverses_log_id: UUID | None = None


def _effect_delta(effect: object) -> StockTotals | None:
    """불명확한 JSON은 추정하지 않고, 박스·불량 효과는 정상 재고에 중복 합산하지 않는다."""
    if not isinstance(effect, list):
        return None
    warehouse = department = 0
    for cell in effect:
        if not isinstance(cell, dict) or type(cell.get("delta")) is not int:
            return None
        if cell.get("scope") == "warehouse":
            warehouse += cell["delta"]
        elif cell.get("scope") == "location":
            if not isinstance(cell.get("department"), str) or not cell["department"].strip():
                return None
            if cell.get("status") == "PRODUCTION":
                department += cell["delta"]
            elif cell.get("status") != "DEFECTIVE":
                return None
        elif cell.get("scope") == "warehouse_box":
            if not isinstance(cell.get("box_id"), str) or not cell["box_id"].strip():
                return None
        else:
            return None
    return StockTotals(warehouse, department)


def _unavailable(reason: RequestOrderStockReason) -> RequestOrderStockResponse:
    """불가 결과에는 원본 수량을 섞지 않는다."""
    return RequestOrderStockResponse(status="unavailable", reason=reason)


def recalculate_request_order_stock(
    entries: Sequence[StockHistoryEntry],
    current: StockTotals | None,
) -> dict[UUID, RequestOrderStockResponse]:
    """현재 재고까지 연결되는 실제 원장의 연속 구간만 요청순으로 역산한다.

    불확실 경계는 실제 시각으로 잡는다. 이후에 승인됐어도 그 경계 이전에 요청한
    거래는 표시하지 않아, 누락된 과거 효과를 건너뛰어 숫자를 만드는 일을 막는다.
    """
    if current is None:
        return {entry.log_id: _unavailable("missing_history") for entry in entries}
    if min(current) < 0:
        return {entry.log_id: _unavailable("negative_balance") for entry in entries}

    reversed_ids = {entry.reverses_log_id for entry in entries if entry.reverses_log_id}
    legacy_cancellations = [entry for entry in entries if entry.cancelled and entry.log_id not in reversed_ids]
    if any(entry.cancelled_at is None for entry in legacy_cancellations):
        return {entry.log_id: _unavailable("missing_history") for entry in entries}
    boundary = max((entry.cancelled_at for entry in legacy_cancellations), default=None)
    reason: RequestOrderStockReason = "missing_history"
    timestamp_counts = Counter(entry.created_at for entry in entries)
    running = current
    verified: list[tuple[StockHistoryEntry, StockTotals]] = []

    for entry in sorted(entries, key=lambda row: (row.created_at, str(row.log_id)), reverse=True):
        if boundary is not None and entry.created_at <= boundary:
            break
        failure: RequestOrderStockReason | None = None
        delta = _effect_delta(entry.inventory_effect)
        if timestamp_counts[entry.created_at] > 1:
            failure = "ambiguous_order"
        elif entry.before is None or entry.after is None or entry.inventory_effect is None:
            failure = "missing_history"
        elif delta is None or entry.requested_at > entry.created_at:
            failure = "inconsistent_history"
        elif min(entry.before + entry.after) < 0:
            failure = "negative_balance"
        elif entry.after != running or StockTotals(
            entry.after.warehouse - entry.before.warehouse,
            entry.after.department - entry.before.department,
        ) != delta:
            failure = "inconsistent_history"
        if failure is not None:
            boundary, reason = entry.created_at, failure
            break
        assert entry.before is not None and delta is not None
        verified.append((entry, delta))
        running = entry.before

    result = {entry.log_id: _unavailable(reason) for entry in entries}
    running = current
    ordered = sorted(
        verified,
        key=lambda pair: (pair[0].requested_at, pair[0].created_at, str(pair[0].log_id)),
        reverse=True,
    )
    for index, (entry, delta) in enumerate(ordered):
        if boundary is not None and entry.requested_at <= boundary:
            break
        before = StockTotals(running.warehouse - delta.warehouse, running.department - delta.department)
        if min(before) < 0:
            for older, _ in ordered[index:]:
                result[older.log_id] = _unavailable("negative_balance")
            break
        result[entry.log_id] = RequestOrderStockResponse(
            status="available",
            warehouse_qty_before=before.warehouse,
            warehouse_qty_after=running.warehouse,
            department_qty_before=before.department,
            department_qty_after=running.department,
        )
        running = before
    return result


def _totals(warehouse: int | None, department: int | None) -> StockTotals | None:
    """한쪽 기록의 누락을 0으로 간주하지 않고 원본의 불완전 상태를 보존한다."""
    if warehouse is None or department is None:
        return None
    return StockTotals(warehouse, department)


def load_request_order_stock(
    db: Session,
    item_ids: Collection[UUID],
    *,
    request_date_expr: ColumnElement,
) -> dict[UUID, RequestOrderStockResponse]:
    """페이지 대상 품목을 일괄 조회하며 호출부의 요청 시각 식과 읽기 트랜잭션을 공유한다."""
    if not item_ids:
        return {}
    department_totals = (
        db.query(InventoryLocation.item_id, func.sum(InventoryLocation.quantity).label("quantity"))
        .filter(InventoryLocation.item_id.in_(item_ids), InventoryLocation.status == LocationStatusEnum.PRODUCTION)
        .group_by(InventoryLocation.item_id)
        .subquery()
    )
    currents = {
        item_id: StockTotals(warehouse, int(department or 0))
        for item_id, warehouse, department in (
            db.query(Inventory.item_id, Inventory.warehouse_qty, department_totals.c.quantity)
            .outerjoin(department_totals, department_totals.c.item_id == Inventory.item_id)
            .filter(Inventory.item_id.in_(item_ids))
            .all()
        )
    }
    rows = (
        db.query(TransactionLog, request_date_expr.label("request_order_at"))
        .outerjoin(IoBatch, TransactionLog.operation_batch_id == IoBatch.batch_id)
        .filter(TransactionLog.item_id.in_(item_ids))
        .all()
    )
    histories: dict[UUID, list[StockHistoryEntry]] = defaultdict(list)
    for log, requested_at in rows:
        histories[log.item_id].append(StockHistoryEntry(
            log_id=log.log_id,
            created_at=log.created_at,
            requested_at=requested_at,
            before=_totals(log.warehouse_qty_before, log.department_qty_before),
            after=_totals(log.warehouse_qty_after, log.department_qty_after),
            inventory_effect=log.inventory_effect,
            cancelled=bool(log.cancelled),
            cancelled_at=log.cancelled_at,
            reverses_log_id=log.reverses_log_id,
        ))
    result: dict[UUID, RequestOrderStockResponse] = {}
    for item_id, entries in histories.items():
        result.update(recalculate_request_order_stock(entries, currents.get(item_id)))
    return result
