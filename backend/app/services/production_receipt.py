"""생산 입고(Production Receipt) 오케스트레이션 서비스.

routers/production.py 의 production_receipt 엔드포인트에서 추출했다. BOM 전개 →
사전 재고검사 → 부품 창고 차감(BACKFLUSH) → 완제품 적재(PRODUCE) 흐름을 한 업무
단위로 묶는다. 서비스가 트랜잭션 커밋/롤백을 담당하고, 라우터(Adapter)는
HTTP/예외 매핑만 수행한다. 여기서는 http_error를 쓰지 않고 도메인 예외만 raise 한다.

동작 보존: 라우터에 인라인돼 있던 로직을 그대로 옮겼다. 재고 변경 primitive
(consume_from_item_department / receive_to_item_department / lock_inventories)와 BOM 전개(explode_bom)는
기존대로 하위 서비스에 위임한다.
"""

import uuid
from decimal import Decimal
from typing import Dict, List, Tuple

from sqlalchemy.orm import Session

from app.models import (
    BOM,
    Employee,
    Inventory,
    InventoryOperation,
    InventoryOperationRoleEnum,
    Item,
    TransactionLog,
    TransactionTypeEnum,
)
from app.repositories import item_repository
from app.schemas import BackflushDetail, ProductionReceiptRequest
from app.services import inventory as inventory_svc
from app.services import inv_effect
from app.services import inventory_operations as operation_svc
from app.services._tx import transactional
from app.services.bom import explode_bom, merge_requirements
from app.services.bom_stock_policy import should_skip_bom_inventory


class ProductionReceiptError(Exception):
    """생산 입고 도메인 오류 베이스."""


class ProductionItemNotFound(ProductionReceiptError):
    """부품(또는 대상) 미존재 → 라우터에서 404."""


class ProductionBadRequest(ProductionReceiptError):
    """BOM 순환참조/빈 BOM 등 잘못된 요청 → 라우터에서 400."""


class ProductionShortage(ProductionReceiptError):
    """사전 재고 부족 → 라우터에서 422. shortages 는 사람이 읽는 상세 목록."""

    def __init__(self, shortages: List[str]):
        super().__init__("재고 부족으로 생산 입고를 진행할 수 없습니다.")
        self.shortages = shortages


def _load_and_merge_requirements(
    db: Session,
    payload: ProductionReceiptRequest,
    produced_item: Item,
) -> Dict[uuid.UUID, Decimal]:
    """BOM 전개 → 순환참조/빈 BOM 검증 → 부품별 소요량 합산."""
    try:
        component_requirements: List[Tuple[uuid.UUID, Decimal]] = explode_bom(
            db, payload.item_id, payload.quantity
        )
    except RecursionError:
        raise ProductionBadRequest(
            "BOM 구조에 순환 참조가 있습니다. BOM 구성을 확인해 주세요."
        )

    if not component_requirements:
        raise ProductionBadRequest(f"'{produced_item.item_name}'에 등록된 BOM이 없습니다.")

    return merge_requirements(component_requirements)


def _bom_graph_snapshot(
    db: Session,
    produced_item_id: uuid.UUID,
) -> tuple[set[uuid.UUID], tuple[tuple[str, str, Decimal, str], ...]]:
    """생산품부터 도달 가능한 BOM 품목과 정확한 edge fingerprint를 만든다."""
    rows = db.query(
        BOM.parent_item_id,
        BOM.child_item_id,
        BOM.quantity,
        BOM.unit,
    ).all()
    children: dict[uuid.UUID, list[tuple[uuid.UUID, Decimal, str]]] = {}
    for parent_id, child_id, quantity, unit in rows:
        children.setdefault(parent_id, []).append(
            (child_id, Decimal(str(quantity)), unit or "EA")
        )
    item_ids = {produced_item_id}
    edges: set[tuple[str, str, Decimal, str]] = set()
    visited: set[uuid.UUID] = set()
    stack = [produced_item_id]
    while stack:
        parent_id = stack.pop()
        if parent_id in visited:
            continue
        visited.add(parent_id)
        for child_id, quantity, unit in children.get(parent_id, []):
            edges.add((str(parent_id), str(child_id), quantity, unit))
            item_ids.add(child_id)
            if child_id in children:
                stack.append(child_id)
    return item_ids, tuple(sorted(edges))


def _lock_and_reload_requirements(
    db: Session,
    payload: ProductionReceiptRequest,
    produced_item: Item,
    initial_graph_item_ids: set[uuid.UUID],
    initial_bom_fingerprint: tuple[tuple[str, str, Decimal, str], ...],
) -> tuple[Item, Dict[uuid.UUID, Decimal], dict[uuid.UUID, Item]]:
    """전체 BOM 품목을 한 번에 잠근 뒤 최신 BOM 소요량을 다시 계산한다."""
    active_items = item_repository.lock_active_many(
        db,
        initial_graph_item_ids,
    )
    if produced_item.item_id not in active_items:
        raise ProductionItemNotFound("생산 대상 품목을 찾을 수 없습니다.")
    missing = sorted(initial_graph_item_ids - set(active_items), key=str)
    if missing:
        raise ProductionItemNotFound(f"구성품을 찾을 수 없습니다: {missing[0]}")

    db.expire_all()
    locked_produced_item = item_repository.get_active(db, produced_item.item_id)
    if locked_produced_item is None:
        raise ProductionItemNotFound("생산 대상 품목을 찾을 수 없습니다.")
    current_graph_item_ids, current_bom_fingerprint = _bom_graph_snapshot(
        db,
        produced_item.item_id,
    )
    if (
        current_graph_item_ids != initial_graph_item_ids
        or current_bom_fingerprint != initial_bom_fingerprint
    ):
        raise ProductionBadRequest("BOM이 변경되었습니다. 다시 시도해 주세요.")
    current_merged = _load_and_merge_requirements(
        db,
        payload,
        locked_produced_item,
    )
    return locked_produced_item, current_merged, active_items


def _preload_components(
    db: Session,
    merged: Dict[uuid.UUID, Decimal],
    produced_item_id: uuid.UUID,
    active_items: dict[uuid.UUID, Item],
) -> Tuple[Dict[uuid.UUID, Item], Dict[uuid.UUID, Inventory]]:
    """잠근 부품 Item을 재사용하고 Inventory를 한 번에 잠근다.

    Inventory 는 다품목 동시 backflush TOCTOU 방지를 위해 한 번에
    FOR UPDATE 로 잠근다.
    """
    comp_ids = set(merged)
    items_map = {item_id: active_items[item_id] for item_id in comp_ids}
    invs_map = inventory_svc._ensure_and_lock_inventories(
        db,
        sorted({*comp_ids, produced_item_id}),
    )
    return items_map, invs_map


def _stock_tracked_requirements(
    db: Session,
    merged: Dict[uuid.UUID, Decimal],
) -> Dict[uuid.UUID, Decimal]:
    """생산 BOM의 미반영 자재를 부족 검사·잠금·차감 대상에서 제외한다."""
    if not merged:
        return {}
    items_map = {
        item.item_id: item
        for item in db.query(Item)
        .filter(Item.item_id.in_(merged), Item.deleted_at.is_(None))
        .all()
    }
    return {
        item_id: quantity
        for item_id, quantity in merged.items()
        if item_id not in items_map
        or not should_skip_bom_inventory(items_map[item_id], bom_generated=True)
    }


def _assert_no_shortage(
    db: Session,
    merged: Dict[uuid.UUID, Decimal],
    items_map: Dict[uuid.UUID, Item],
    invs_map: Dict[uuid.UUID, Inventory],
) -> None:
    """Check process-code department PRODUCTION stock before backflush."""
    shortage_errors = []
    for comp_item_id, required_qty in merged.items():
        comp_item = items_map.get(comp_item_id)
        if comp_item is None:
            shortage_errors.append(f"구성품 {comp_item_id} 을 찾을 수 없습니다.")
            continue
        try:
            dept, current_avail = inventory_svc.item_department_stock(db, comp_item)
        except ValueError as exc:
            shortage_errors.append(str(exc))
            continue
        if current_avail < required_qty:
            shortage_errors.append(
                inventory_svc.format_item_location_shortage(
                    comp_item, dept, current_avail, required_qty
                )
            )

    if shortage_errors:
        raise ProductionShortage(shortage_errors)


def _backflush_components(
    db: Session,
    payload: ProductionReceiptRequest,
    produced_item: Item,
    merged: Dict[uuid.UUID, Decimal],
    items_map: Dict[uuid.UUID, Item],
    producer_name: str,
    producer_id: uuid.UUID,
    transaction_ids: List[uuid.UUID],
    backflushed: List[BackflushDetail],
    operation: InventoryOperation | None,
) -> None:
    """각 부품의 창고 차감 + BACKFLUSH 로그 기록 (transaction_ids/backflushed 누적)."""
    for comp_item_id, required_qty in merged.items():
        comp_item = items_map.get(comp_item_id)
        if comp_item is None:
            raise ProductionItemNotFound(f"부품 {comp_item_id} 을 찾을 수 없습니다.")

        # 재고 변경은 서비스 레이어로 위임 (창고 차감 + _sync_total 은 내부 책임)
        comp_cells_before = inv_effect._snapshot_cells(db, comp_item_id)
        inv, qty_before, dept = inventory_svc._consume_from_item_department(db, comp_item, required_qty)

        log = operation_svc._attach_transaction(TransactionLog(
            item_id=comp_item_id,
            transaction_type=TransactionTypeEnum.BACKFLUSH,
            quantity_change=-required_qty,
            quantity_before=qty_before,
            quantity_after=inv.quantity,
            reference_no=payload.reference_no,
            produced_by=producer_name,
            producer_employee_id=producer_id,
            department=dept.value,
            notes=f"생산 입고 Backflush: {produced_item.item_name} x {payload.quantity}",
            **inv_effect._capture_log_stock_snapshot(db, comp_item_id, comp_cells_before),
        ), operation, InventoryOperationRoleEnum.COMPONENT_INPUT)
        db.add(log)
        db.flush()

        transaction_ids.append(log.log_id)
        backflushed.append(
            BackflushDetail(
                item_id=comp_item_id,
                mes_code=comp_item.mes_code,
                item_name=comp_item.item_name,
                process_type_code=comp_item.process_type_code,
                required_quantity=required_qty,
                stock_before=qty_before,
                stock_after=inv.quantity,
            )
        )


def _record_production(
    db: Session,
    payload: ProductionReceiptRequest,
    produced_item: Item,
    producer_name: str,
    producer_id: uuid.UUID,
    transaction_ids: List[uuid.UUID],
    operation: InventoryOperation | None,
) -> None:
    """Receive produced item into its process-code PRODUCTION location and log PRODUCE."""
    prod_cells_before = inv_effect._snapshot_cells(db, payload.item_id)
    produced_inv, prod_qty_before, dept = inventory_svc._receive_to_item_department(
        db, produced_item, payload.quantity
    )

    produce_log = operation_svc._attach_transaction(TransactionLog(
        item_id=payload.item_id,
        transaction_type=TransactionTypeEnum.PRODUCE,
        quantity_change=payload.quantity,
        quantity_before=prod_qty_before,
        quantity_after=produced_inv.quantity,
        reference_no=payload.reference_no,
        produced_by=producer_name,
        producer_employee_id=producer_id,
        department=dept.value,
        notes=payload.notes or f"생산 입고: {produced_item.item_name} x {payload.quantity}",
        **inv_effect._capture_log_stock_snapshot(db, payload.item_id, prod_cells_before),
    ), operation, InventoryOperationRoleEnum.PRODUCT_OUTPUT)
    db.add(produce_log)
    db.flush()
    transaction_ids.append(produce_log.log_id)


def _execute_production_receipt(
    db: Session,
    payload: ProductionReceiptRequest,
    produced_item: Item,
    producer_name: str,
    producer_id: uuid.UUID,
) -> dict:
    """생산 입고 변경을 현재 트랜잭션에 적용한다.

    raise:
      - ProductionBadRequest  : BOM 순환참조/빈 BOM (→ 400)
      - ProductionShortage    : 사전 재고 부족 (→ 422, shortages 보유)
      - ProductionItemNotFound: 부품 미존재 (→ 404)
      - ValueError            : ?? ?? ?? ??? ?? ?? ?? (? 422)
    """
    _load_and_merge_requirements(db, payload, produced_item)
    initial_graph_item_ids, initial_bom_fingerprint = _bom_graph_snapshot(
        db,
        produced_item.item_id,
    )
    produced_item, merged, active_items = _lock_and_reload_requirements(
        db,
        payload,
        produced_item,
        initial_graph_item_ids,
        initial_bom_fingerprint,
    )
    tracked_requirements = _stock_tracked_requirements(db, merged)
    items_map, invs_map = _preload_components(
        db,
        tracked_requirements,
        produced_item.item_id,
        active_items,
    )
    _assert_no_shortage(db, tracked_requirements, items_map, invs_map)

    transaction_ids: List[uuid.UUID] = []
    backflushed: List[BackflushDetail] = []
    operation = operation_svc._create_business_operation(
        db,
        domain="production",
        action="receipt",
        display_label="생산",
        actor_name=producer_name or payload.produced_by or "시스템",
        actor_employee_id=producer_id,
        reason=payload.notes,
    )
    _backflush_components(
        db, payload, produced_item, tracked_requirements, items_map,
        producer_name, producer_id, transaction_ids, backflushed, operation,
    )
    _record_production(
        db, payload, produced_item, producer_name, producer_id, transaction_ids, operation,
    )
    return {"transaction_ids": transaction_ids, "backflushed": backflushed}


def execute_production_receipt(
    db: Session,
    payload: ProductionReceiptRequest,
    produced_item: Item,
    *,
    actor: Employee,
) -> dict:
    """서버가 검증한 작업자로 생산 입고의 재고·원장 변경을 확정한다."""
    if not isinstance(actor, Employee):
        raise TypeError("actor must be an Employee")
    with transactional(db):
        return _execute_production_receipt(
            db,
            payload,
            produced_item,
            actor.name,
            actor.employee_id,
        )
