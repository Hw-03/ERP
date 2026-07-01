"""생산 입고(Production Receipt) 오케스트레이션 서비스.

routers/production.py 의 production_receipt 엔드포인트에서 추출했다. BOM 전개 →
사전 재고검사 → 부품 창고 차감(BACKFLUSH) → 완제품 적재(PRODUCE) 흐름을 한 업무
단위로 묶는다. HTTP/예외 매핑·트랜잭션 커밋은 라우터(Adapter)가 담당하고, 여기서는
http_error 를 쓰지 않고 도메인 예외만 raise 한다(io_dispatch 패턴).

동작 보존: 라우터에 인라인돼 있던 로직을 그대로 옮겼다. 재고 변경 primitive
(consume_from_item_department / receive_to_item_department / lock_inventories)와 BOM 전개(explode_bom)는
기존대로 하위 서비스에 위임한다.
"""

import uuid
from decimal import Decimal
from typing import Dict, List, Tuple

from sqlalchemy.orm import Session

from app.models import Inventory, Item, TransactionLog, TransactionTypeEnum
from app.schemas import BackflushDetail, ProductionReceiptRequest
from app.services import inventory as inventory_svc
from app.services import inv_effect
from app.services.bom import explode_bom, merge_requirements


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


def _preload_components(
    db: Session,
    merged: Dict[uuid.UUID, Decimal],
) -> Tuple[Dict[uuid.UUID, Item], Dict[uuid.UUID, Inventory]]:
    """부품 Item / Inventory 를 bulk 로드.

    Items / Inventory 각 1회 IN 쿼리. Inventory 는 다품목 동시 backflush
    TOCTOU 방지를 위해 한 번에 FOR UPDATE 로 잠근다.
    """
    comp_ids = list(merged.keys())
    items_map = {i.item_id: i for i in db.query(Item).filter(Item.item_id.in_(comp_ids)).all()}
    invs_map = inventory_svc.lock_inventories(db, comp_ids)
    return items_map, invs_map


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
    producer_name: str | None,
    producer_id,
    transaction_ids: List[uuid.UUID],
    backflushed: List[BackflushDetail],
) -> None:
    """각 부품의 창고 차감 + BACKFLUSH 로그 기록 (transaction_ids/backflushed 누적)."""
    for comp_item_id, required_qty in merged.items():
        comp_item = items_map.get(comp_item_id)
        if comp_item is None:
            raise ProductionItemNotFound(f"부품 {comp_item_id} 을 찾을 수 없습니다.")

        # 재고 변경은 서비스 레이어로 위임 (창고 차감 + _sync_total 은 내부 책임)
        comp_cells_before = inv_effect.snapshot_cells(db, comp_item_id)
        inv, qty_before, dept = inventory_svc.consume_from_item_department(db, comp_item, required_qty)

        log = TransactionLog(
            item_id=comp_item_id,
            transaction_type=TransactionTypeEnum.BACKFLUSH,
            quantity_change=-required_qty,
            quantity_before=qty_before,
            quantity_after=inv.quantity,
            reference_no=payload.reference_no,
            produced_by=producer_name or payload.produced_by,
            producer_employee_id=producer_id,
            department=dept.value,
            notes=f"생산 입고 Backflush: {produced_item.item_name} x {payload.quantity}",
            inventory_effect=inv_effect.capture_effect(db, comp_item_id, comp_cells_before),
        )
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
    producer_name: str | None,
    producer_id,
    transaction_ids: List[uuid.UUID],
) -> None:
    """Receive produced item into its process-code PRODUCTION location and log PRODUCE."""
    prod_cells_before = inv_effect.snapshot_cells(db, payload.item_id)
    produced_inv, prod_qty_before, dept = inventory_svc.receive_to_item_department(
        db, produced_item, payload.quantity
    )

    produce_log = TransactionLog(
        item_id=payload.item_id,
        transaction_type=TransactionTypeEnum.PRODUCE,
        quantity_change=payload.quantity,
        quantity_before=prod_qty_before,
        quantity_after=produced_inv.quantity,
        reference_no=payload.reference_no,
        produced_by=producer_name or payload.produced_by,
        producer_employee_id=producer_id,
        department=dept.value,
        notes=payload.notes or f"생산 입고: {produced_item.item_name} x {payload.quantity}",
        inventory_effect=inv_effect.capture_effect(db, payload.item_id, prod_cells_before),
    )
    db.add(produce_log)
    db.flush()
    transaction_ids.append(produce_log.log_id)


def execute_production_receipt(
    db: Session,
    payload: ProductionReceiptRequest,
    produced_item: Item,
    producer_name: str | None,
    producer_id,
) -> dict:
    """생산 입고 전체 흐름. **commit 하지 않는다**(트랜잭션 경계는 라우터 책임).

    raise:
      - ProductionBadRequest  : BOM 순환참조/빈 BOM (→ 400)
      - ProductionShortage    : 사전 재고 부족 (→ 422, shortages 보유)
      - ProductionItemNotFound: 부품 미존재 (→ 404)
      - ValueError            : ?? ?? ?? ??? ?? ?? ?? (? 422)
    """
    merged = _load_and_merge_requirements(db, payload, produced_item)
    items_map, invs_map = _preload_components(db, merged)
    _assert_no_shortage(db, merged, items_map, invs_map)

    transaction_ids: List[uuid.UUID] = []
    backflushed: List[BackflushDetail] = []
    _backflush_components(
        db, payload, produced_item, merged, items_map,
        producer_name, producer_id, transaction_ids, backflushed,
    )
    _record_production(
        db, payload, produced_item, producer_name, producer_id, transaction_ids,
    )
    return {"transaction_ids": transaction_ids, "backflushed": backflushed}
