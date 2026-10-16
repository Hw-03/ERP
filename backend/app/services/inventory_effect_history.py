"""현재 재고에서 역산해 거래 효과 셀의 정확한 전·후 수량을 보강한다."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import datetime
from itertools import groupby
import json
import sqlite3
from typing import TypeAlias
from uuid import UUID

from sqlalchemy import LargeBinary, Text, and_, cast, func, literal_column, null, or_, select, type_coerce, union_all
from sqlalchemy.exc import DataError, OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.types import NullType

from app.models import Inventory, InventoryLocation, TransactionLog, WarehouseBoxItem
from app.services.sqlite_datetime_contract import canonical_datetime, supports_datetime_guard


CellKey: TypeAlias = tuple[str, str | None, str | None]
_HistoryRow: TypeAlias = tuple[object, object, object, object]
_HISTORY_PACK_ROWS = 64
_HISTORY_RAW_BYTES = 1024
# Four escaped text fields plus the original scan ordinal and JSON punctuation.
_HISTORY_PACK_BOUND = _HISTORY_PACK_ROWS * (_HISTORY_RAW_BYTES * 6 + 33) + _HISTORY_PACK_ROWS + 1


@dataclass(frozen=True)
class EffectHistoryEntry:
    """위치별 역산에 필요한 거래 원장의 최소 필드."""

    log_id: UUID
    item_id: UUID
    created_at: datetime
    inventory_effect: object


def _cell_key(cell: dict) -> CellKey | None:
    """효과 셀을 현재 재고 조회와 동일한 안정적 식별자로 바꾼다."""
    scope = cell.get("scope")
    if scope == "warehouse":
        return ("warehouse", None, None)
    if scope == "location":
        department = cell.get("department")
        status = cell.get("status")
        if not isinstance(department, str) or not department.strip():
            return None
        if not isinstance(status, str) or not status.strip():
            return None
        return ("location", department, status)
    if scope == "warehouse_box":
        box_id = cell.get("box_id")
        if not isinstance(box_id, str) or not box_id.strip():
            return None
        return ("warehouse_box", box_id, None)
    return None


def _parsed_effect(effect: object) -> list[tuple[dict, CellKey, int]] | None:
    """불완전한 원장은 추정하지 않도록 검증된 셀만 반환한다."""
    if not isinstance(effect, list):
        return None
    parsed: list[tuple[dict, CellKey, int]] = []
    for cell in effect:
        if not isinstance(cell, dict) or type(cell.get("delta")) is not int:
            return None
        key = _cell_key(cell)
        if key is None:
            return None
        parsed.append((cell, key, cell["delta"]))
    return parsed


def reconstruct_effect_quantities(
    entries: Sequence[EffectHistoryEntry],
    current: dict[CellKey, int],
    target_log_ids: Collection[UUID],
) -> dict[UUID, list[dict]]:
    """현재 셀 수량에서 최신 거래부터 역산해 대상 로그만 보강한다.

    같은 시각에 같은 셀을 여러 로그가 바꿨다면 개별 순서를 만들지 않고 해당
    로그의 전·후 수량을 생략한다. 그룹 합계는 역산해 더 오래된 기록은 계속 검증한다.
    """
    targets = set(target_log_ids)
    running = dict(current)
    result: dict[UUID, list[dict]] = {}
    ordered = sorted(entries, key=lambda entry: (entry.created_at, str(entry.log_id)), reverse=True)

    for _created_at, same_time_iter in groupby(ordered, key=lambda entry: entry.created_at):
        same_time = list(same_time_iter)
        parsed_by_log: dict[UUID, list[tuple[dict, CellKey, int]]] = {}
        total_delta: dict[CellKey, int] = defaultdict(int)
        occurrence_count: dict[CellKey, int] = defaultdict(int)
        invalid = False

        for entry in same_time:
            parsed = _parsed_effect(entry.inventory_effect)
            if parsed is None:
                invalid = True
                break
            parsed_by_log[entry.log_id] = parsed
            for _cell, key, delta in parsed:
                total_delta[key] += delta
                occurrence_count[key] += 1

        if invalid:
            break

        before_by_key = {
            key: running.get(key, 0) - delta
            for key, delta in total_delta.items()
        }
        if any(quantity < 0 for quantity in before_by_key.values()):
            break

        for entry in same_time:
            if entry.log_id not in targets:
                continue
            enriched: list[dict] = []
            for cell, key, delta in parsed_by_log[entry.log_id]:
                output = dict(cell)
                stored_before = cell.get("quantity_before")
                stored_after = cell.get("quantity_after")
                has_valid_stored_snapshot = (
                    type(stored_before) is int
                    and type(stored_after) is int
                    and stored_after - stored_before == delta
                )
                if not has_valid_stored_snapshot and occurrence_count[key] == 1:
                    output["quantity_before"] = before_by_key[key]
                    output["quantity_after"] = running.get(key, 0)
                enriched.append(output)
            result[entry.log_id] = enriched

        running.update(before_by_key)

    return result


def _history_rows(
    db: Session,
    item_ids: Collection[UUID],
    earliest_target_at: datetime,
) -> list[_HistoryRow]:
    """같은 조회의 원문을 작은 묶음으로 운반하고 원래 타입 처리·스캔 순서를 복원한다.

    비정상 UUID 등 기존 타입 처리기가 원문을 반환하는 경우도 보존하므로
    반환 필드는 object로 선언한다. 효과 JSON은 SQL에서 해석하지 않는다.
    """
    c = TransactionLog.__table__.c
    columns = (c.log_id, c.item_id, c.created_at, c.inventory_effect)
    predicate = (c.item_id.in_(item_ids), c.created_at >= earliest_target_at)
    dialect = db.get_bind().dialect
    if dialect.name == "sqlite":
        if supports_datetime_guard(db):
            guard = TransactionLog.__table__.alias("history_date_guard")
            # Compiler-quoted UUID literals preserve the original SQLite bind budget.
            guarded_items = literal_column(str(guard.c.item_id.in_(item_ids).compile(
                dialect=dialect, compile_kwargs={"literal_binds": True},
            )))
            unsafe = select(literal_column("1")).select_from(guard).where(
                guarded_items, canonical_datetime(guard.c.created_at).is_not(True),
            ).exists()
            predicate = (predicate[0], or_(predicate[1], unsafe))
        else:
            predicate = (predicate[0],)

    def core_rows() -> list[_HistoryRow]:
        """묶음 조회를 지원하지 않는 환경에는 기존 컬럼 처리를 그대로 적용한다."""
        return [(row[0], row[1], row[2], row[3])
                for row in db.execute(select(*columns).where(*predicate)).all()]

    if dialect.name != "sqlite" or getattr(dialect, "_json_deserializer", None) is not None:
        return core_rows()
    if getattr(dialect.dbapi, "sqlite_version_info", (0,)) < (3, 25, 0):
        return core_rows()
    connection = db.connection().connection.driver_connection
    getlimit = getattr(connection, "getlimit", None)
    if (getlimit is None or getlimit(sqlite3.SQLITE_LIMIT_LENGTH) < _HISTORY_PACK_BOUND + 1024
            or getlimit(sqlite3.SQLITE_LIMIT_FUNCTION_ARG) < 5):
        return core_rows()

    # Trusted literals add no binds beyond the original item IDs and date.
    zero = literal_column("0")
    raw_bytes = sum((func.coalesce(func.length(cast(column, LargeBinary)), zero)
                     for column in columns), zero)
    packable = and_(*(func.typeof(column) == literal_column("'text'") for column in columns),
                   raw_bytes <= literal_column(str(_HISTORY_RAW_BYTES)))
    rows = select(*columns, packable.label("packable"),
                  func.row_number().over().label("scan_ordinal"))\
        .where(*predicate).cte("history_rows")
    eligible = select(*(rows.c[column.key] for column in columns), rows.c.scan_ordinal,
                      func.row_number().over().label("chunk_ordinal"))\
        .where(rows.c.packable).cte("packed_history")
    block = (eligible.c.chunk_ordinal - literal_column("1")).self_group()\
        .op("/")(literal_column(str(_HISTORY_PACK_ROWS)))
    # Defer every row's processors until scan order is restored, including errors.
    raw = select(*(type_coerce(rows.c[column.key], NullType()) for column in columns),
                 type_coerce(null(), Text()).label("metadata"), rows.c.scan_ordinal)\
        .where(~rows.c.packable)
    packed = select(*(null() for _column in columns),
                    func.json_group_array(func.json_array(
                        *(eligible.c[column.key] for column in columns), eligible.c.scan_ordinal,
                    )), zero).group_by(block)
    try:
        fetched = db.execute(union_all(raw, packed)).all()
    except DataError as error:
        # CTE bookkeeping can exceed a record limit that the original row fits.
        if getattr(error.orig, "sqlite_errorcode", None) == sqlite3.SQLITE_TOOBIG:
            return core_rows()
        raise
    except OperationalError as error:
        message = str(error.orig).lower()
        if "no such function: json_" in message or "no such function: row_number" in message:
            return core_rows()
        raise

    raw_rows: list[tuple[int, _HistoryRow]] = []
    for log_id, item_id, created_at, effect, metadata, ordinal in fetched:
        if metadata is None:
            raw_rows.append((ordinal, (log_id, item_id, created_at, effect)))
        else:
            raw_rows.extend((row[4], (row[0], row[1], row[2], row[3]))
                            for row in json.loads(metadata))
    raw_rows.sort(key=lambda row: row[0])
    processors = [column.type.dialect_impl(dialect).result_processor(dialect, None)
                  for column in columns]
    restored: list[_HistoryRow] = []
    for _ordinal, raw_row in raw_rows:
        values = [processor(value) if processor else value
                  for value, processor in zip(raw_row, processors, strict=True)]
        restored.append((values[0], values[1], values[2], values[3]))
    return restored


def load_inventory_effect_quantities(
    db: Session,
    target_logs: Sequence[TransactionLog],
) -> dict[UUID, list[dict]]:
    """가장 오래된 대상 시각부터 현재까지 읽어 전·후 수량을 역산한다.

    대상보다 오래된 거래는 최신 수량 역산에 영향을 주지 않는다. 경계 시각의
    거래는 전부 포함해 같은 시각·같은 셀의 불명확한 순서를 그대로 보존한다.
    """
    if not target_logs:
        return {}
    item_ids = {log.item_id for log in target_logs}
    earliest_target_at = min(log.created_at for log in target_logs)
    current_by_item: dict[UUID, dict[CellKey, int]] = {
        item_id: {} for item_id in item_ids
    }

    for item_id, quantity in (
        db.query(Inventory.item_id, Inventory.warehouse_qty)
        .filter(Inventory.item_id.in_(item_ids))
        .all()
    ):
        current_by_item[item_id][("warehouse", None, None)] = int(quantity or 0)

    for item_id, department, status, quantity in (
        db.query(
            InventoryLocation.item_id,
            InventoryLocation.department,
            InventoryLocation.status,
            InventoryLocation.quantity,
        )
        .filter(InventoryLocation.item_id.in_(item_ids))
        .all()
    ):
        status_value = status.value if hasattr(status, "value") else str(status)
        current_by_item[item_id][("location", department, status_value)] = int(quantity or 0)

    for item_id, box_id, quantity in (
        db.query(WarehouseBoxItem.item_id, WarehouseBoxItem.box_id, WarehouseBoxItem.quantity)
        .filter(WarehouseBoxItem.item_id.in_(item_ids))
        .all()
    ):
        current_by_item[item_id][("warehouse_box", str(box_id), None)] = int(quantity or 0)

    histories: dict[UUID, list[EffectHistoryEntry]] = defaultdict(list)
    for log_id, item_id, created_at, inventory_effect in _history_rows(db, item_ids, earliest_target_at):
        histories[item_id].append(EffectHistoryEntry(
            log_id=log_id,
            item_id=item_id,
            created_at=created_at,
            inventory_effect=inventory_effect,
        ))

    target_ids_by_item: dict[UUID, set[UUID]] = defaultdict(set)
    for log in target_logs:
        target_ids_by_item[log.item_id].add(log.log_id)

    result: dict[UUID, list[dict]] = {}
    for item_id, entries in histories.items():
        result.update(reconstruct_effect_quantities(
            entries,
            current_by_item.get(item_id, {}),
            target_ids_by_item[item_id],
        ))
    return result
