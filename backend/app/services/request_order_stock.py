"""실제 원장을 검증한 뒤 요청 순서의 표시 잔고만 재구성한다. DB 쓰기 없음."""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import LargeBinary, String, and_, case, cast, func, literal_column, or_, select
from sqlalchemy.orm import Session, aliased
from sqlalchemy.sql.elements import ColumnElement

from app.models import Inventory, InventoryLocation, IoBatch, LocationStatusEnum, TransactionLog
from app.schemas.transaction import RequestOrderStockReason, RequestOrderStockResponse
from app.services.inv_effect import StockTotals
from app.services.sqlite_datetime_contract import canonical_datetime, supports_datetime_guard


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


@dataclass(frozen=True)
class _LegacyCancellationState:
    """조회 구간 밖의 취소도 보존하는 품목별 전체 원장 경계다."""

    missing_timestamp: bool = False
    latest_at: datetime | None = None


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
    *,
    target_log_ids: Collection[UUID] | None = None,
    legacy_cancellation_state: _LegacyCancellationState | None = None,
) -> dict[UUID, RequestOrderStockResponse]:
    """현재 재고까지 연결되는 실제 원장의 연속 구간만 요청순으로 역산한다.

    불확실 경계는 실제 시각으로 잡는다. 이후에 승인됐어도 그 경계 이전에 요청한
    거래는 표시하지 않아, 누락된 과거 효과를 건너뛰어 숫자를 만드는 일을 막는다.
    """
    targets = entries if target_log_ids is None else [entry for entry in entries if entry.log_id in target_log_ids]
    if current is None:
        return {entry.log_id: _unavailable("missing_history") for entry in targets}
    if min(current) < 0:
        return {entry.log_id: _unavailable("negative_balance") for entry in targets}

    if legacy_cancellation_state is None:
        reversed_ids = {entry.reverses_log_id for entry in entries if entry.reverses_log_id}
        legacy_cancellations = [entry for entry in entries if entry.cancelled and entry.log_id not in reversed_ids]
        legacy_cancellation_state = _LegacyCancellationState(
            missing_timestamp=any(entry.cancelled_at is None for entry in legacy_cancellations),
            latest_at=max((entry.cancelled_at for entry in legacy_cancellations if entry.cancelled_at is not None), default=None),
        )
    if legacy_cancellation_state.missing_timestamp:
        return {entry.log_id: _unavailable("missing_history") for entry in targets}
    boundary = legacy_cancellation_state.latest_at
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

    result = {entry.log_id: _unavailable(reason) for entry in targets}
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
                if older.log_id in result:
                    result[older.log_id] = _unavailable("negative_balance")
            break
        if entry.log_id in result:
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
    target_log_ids: Collection[UUID] | None = None,
) -> dict[UUID, RequestOrderStockResponse]:
    """표적의 실행·요청 시각부터 읽되 전체 원장의 취소 경계를 보존한다.

    더 오래된 정상 거래의 요청 시각은 표적보다 앞서고, 불완전 거래의 경계도
    표적 요청보다 앞선다. 따라서 그 구간은 표적 결과를 바꾸지 않는다.
    같은 시각은 모두 포함하며, 표적 미지정 호출은 기존 전체 조회를 유지한다.
    """
    if not item_ids or (target_log_ids is not None and not target_log_ids):
        return {}
    cutoff = None
    cancellation_states: dict[UUID, _LegacyCancellationState] = {}
    if target_log_ids is not None:
        target_log_ids = set(target_log_ids)
    bounded = target_log_ids is not None
    dialect = db.get_bind().dialect.name
    if bounded and dialect == "sqlite":
        # MIN과 MAX도 원문을 비교하므로 suffix를 읽기 전에 세 경계를 함께 검증한다.
        bounded = supports_datetime_guard(db)
        if bounded:
            dates = select(
                TransactionLog.log_id, TransactionLog.created_at, TransactionLog.cancelled_at,
                case((TransactionLog.log_id.in_(target_log_ids), request_date_expr)).label("requested_at"),
            ).outerjoin(IoBatch, TransactionLog.operation_batch_id == IoBatch.batch_id)\
                .where(TransactionLog.item_id.in_(item_ids)).cte("request_stock_dates").prefix_with("MATERIALIZED")
            bounded = not db.query(select(literal_column("1")).select_from(dates).where(or_(
                # UUIDString의 읽기·bind 정규화로 다른 원문 PK가 합쳐지면 MIN 대상을 제한할 수 없다.
                func.typeof(dates.c.log_id) != literal_column("'text'"),
                func.length(cast(dates.c.log_id, LargeBinary)) != literal_column("32"),
                dates.c.log_id.op("GLOB")(literal_column("'*[^0-9a-f]*'")),
                canonical_datetime(dates.c.created_at).is_not(True),
                and_(dates.c.cancelled_at.is_not(None), canonical_datetime(dates.c.cancelled_at).is_not(True)),
                and_(dates.c.requested_at.is_not(None), canonical_datetime(dates.c.requested_at).is_not(True)),
            )).exists()).scalar()
    if bounded:
        target_dates = (
            db.query(func.min(TransactionLog.created_at), func.min(request_date_expr))
            .outerjoin(IoBatch, TransactionLog.operation_batch_id == IoBatch.batch_id)
            .filter(TransactionLog.item_id.in_(item_ids), TransactionLog.log_id.in_(target_log_ids))
        )
        if dialect == "postgresql":
            # PostgreSQL의 VARCHAR UUIDString도 대문자를 저장할 수 있다. 기존 MIN과 같은 왕복에서 검사한다.
            identity = aliased(TransactionLog)
            target_dates = target_dates.add_columns(db.query(identity.log_id).filter(
                identity.item_id.in_(item_ids),
                cast(identity.log_id, String).op("!~")(literal_column("'^[0-9a-f]{32}$'")),
            ).exists())
        created_at, requested_at, *unsafe_identity = target_dates.one()
        if unsafe_identity and unsafe_identity[0]:
            bounded = False
        elif created_at is None:
            return {}
        else:
            cutoff = min(created_at, requested_at)
    if bounded:
        reversal = aliased(TransactionLog)
        has_reversal = db.query(reversal.log_id).filter(
            reversal.item_id == TransactionLog.item_id,
            reversal.reverses_log_id == TransactionLog.log_id,
        ).exists()
        if db.get_bind().dialect.name == "sqlite":
            # 과거 NUMERIC PK와 문자열 역참조의 비교는 인덱스를 사용하지 못한다.
            # 실제 문자열 PK만 그대로 캐스팅하고 숫자 PK의 기존 비교는 보존한다.
            indexed_reversal = db.query(reversal.log_id).filter(
                reversal.item_id == TransactionLog.item_id,
                reversal.reverses_log_id == cast(TransactionLog.log_id, String),
            ).exists()
            has_reversal = case(
                (func.typeof(TransactionLog.log_id) == literal_column("'text'"), indexed_reversal),
                else_=has_reversal,
            )
        cancellation_states = {
            item_id: _LegacyCancellationState(bool(missing), latest_at)
            for item_id, latest_at, missing in (
                db.query(TransactionLog.item_id, func.max(TransactionLog.cancelled_at),
                         func.count(case((TransactionLog.cancelled_at.is_(None), 1))))
                .filter(TransactionLog.item_id.in_(item_ids), TransactionLog.cancelled.is_(True), ~has_reversal)
                .group_by(TransactionLog.item_id)
                .all()
            )
        }
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
    query = (
        db.query(
            TransactionLog.log_id, TransactionLog.item_id, TransactionLog.created_at,
            TransactionLog.warehouse_qty_before, TransactionLog.department_qty_before,
            TransactionLog.warehouse_qty_after, TransactionLog.department_qty_after,
            TransactionLog.inventory_effect, TransactionLog.cancelled,
            TransactionLog.cancelled_at, TransactionLog.reverses_log_id,
            request_date_expr.label("request_order_at"),
        )
        .outerjoin(IoBatch, TransactionLog.operation_batch_id == IoBatch.batch_id)
        .filter(TransactionLog.item_id.in_(item_ids))
    )
    if cutoff is not None:
        query = query.filter(TransactionLog.created_at >= cutoff)
    rows = query.all()
    histories: dict[UUID, list[StockHistoryEntry]] = defaultdict(list)
    for log in rows:
        histories[log.item_id].append(StockHistoryEntry(
            log_id=log.log_id,
            created_at=log.created_at,
            requested_at=log.request_order_at,
            before=_totals(log.warehouse_qty_before, log.department_qty_before),
            after=_totals(log.warehouse_qty_after, log.department_qty_after),
            inventory_effect=log.inventory_effect,
            cancelled=bool(log.cancelled),
            cancelled_at=log.cancelled_at,
            reverses_log_id=log.reverses_log_id,
        ))
    result: dict[UUID, RequestOrderStockResponse] = {}
    for item_id, entries in histories.items():
        result.update(recalculate_request_order_stock(
            entries, currents.get(item_id), target_log_ids=target_log_ids,
            legacy_cancellation_state=(cancellation_states.get(item_id, _LegacyCancellationState())
                                       if bounded else None),
        ))
    return result
