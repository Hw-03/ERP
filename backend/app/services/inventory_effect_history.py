"""현재 재고에서 역산해 거래 효과 셀의 정확한 전·후 수량을 보강한다."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Collection, Sequence
from dataclasses import dataclass
from datetime import datetime
from itertools import groupby
from typing import TypeAlias
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import Inventory, InventoryLocation, TransactionLog, WarehouseBoxItem


CellKey: TypeAlias = tuple[str, str | None, str | None]


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


def load_inventory_effect_quantities(
    db: Session,
    target_logs: Sequence[TransactionLog],
) -> dict[UUID, list[dict]]:
    """일보 대상 품목의 현재 셀과 실제 원장을 한 번씩 읽어 전·후 수량을 만든다."""
    if not target_logs:
        return {}
    item_ids = {log.item_id for log in target_logs}
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
    for log_id, item_id, created_at, inventory_effect in (
        db.query(
            TransactionLog.log_id,
            TransactionLog.item_id,
            TransactionLog.created_at,
            TransactionLog.inventory_effect,
        )
        .filter(TransactionLog.item_id.in_(item_ids))
        .all()
    ):
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
