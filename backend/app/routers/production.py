"""Production router for production receipts and BOM-based backflush."""

import logging
import uuid
from decimal import Decimal
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Inventory, Item, TransactionLog, TransactionTypeEnum
from app.schemas import (
    BackflushDetail,
    BomCheckResponse,
    CapacityResponse,
    ProductionReceiptRequest,
    ProductionReceiptResponse,
)
from app.services import inventory as inventory_svc
from app.services import inv_effect
from app.services import stock_math
from app.services.bom import BomCache
from app.services.bom import explode_bom as _explode_bom_svc
from app.services.bom import merge_requirements
from app.services.production_capacity import compute_capacity
from app.routers._errors import ErrorCode, http_error
from app.routers.inventory._tx_helper import resolve_producer
from app.repositories import item_repository

router = APIRouter()

logger = logging.getLogger("mes")


@router.post(
    "/receipt",
    response_model=ProductionReceiptResponse,
    status_code=status.HTTP_201_CREATED,
    summary="생산 입고 처리 (BOM 전개 + 자동 차감)",
)
def production_receipt(
    payload: ProductionReceiptRequest,
    db: Session = Depends(get_db),
):
    produced_item = item_repository.get(db, payload.item_id)
    if not produced_item:
        raise http_error(404, ErrorCode.NOT_FOUND, "생산 대상 품목을 찾을 수 없습니다.")

    producer_name, producer_id = resolve_producer(db, payload.producer_employee_code)

    merged = _load_and_merge_requirements(db, payload, produced_item)

    items_map, invs_map = _preload_components(db, merged)
    _assert_no_shortage(merged, items_map, invs_map)

    transaction_ids: List[uuid.UUID] = []
    backflushed: List[BackflushDetail] = []

    try:
        _backflush_components(
            db, payload, produced_item, merged, items_map,
            producer_name, producer_id, transaction_ids, backflushed,
        )
        _record_production(
            db, payload, produced_item, producer_name, producer_id, transaction_ids,
        )
        db.commit()
    except HTTPException:
        # WS9: 엔드포인트가 의도적으로 던진 404/4xx(예: 부품 미존재, 위 분기)를
        # 아래 except Exception 이 500 으로 재포장하지 않도록 그대로 통과.
        raise
    except ValueError as exc:
        # WS9: 동시 같은-부품 입고 경합에서 진 쪽 — consume_warehouse 의
        # 원자적 가드(UPDATE ... WHERE qty>=n)가 늦게 ValueError 를 던진다.
        # 사전 검사와 동일하게 깨끗한 422 STOCK_SHORTAGE 로 매핑(기존엔 아래
        # except Exception 이 삼켜 500 으로 나갔음). db 는 롤백되어 loser 의
        # 부분 배치/orphan TransactionLog 가 남지 않는다.
        db.rollback()
        raise http_error(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code=ErrorCode.STOCK_SHORTAGE,
            message="재고 부족으로 생산 입고를 진행할 수 없습니다.",
            shortages=[str(exc)],
        )
    except Exception as exc:
        # WS8: 재던지기 전 풀스택 보존(기존엔 str(exc) 만 남고 트레이스 소실).
        logger.exception("생산 처리 중 예기치 못한 오류")
        db.rollback()
        raise http_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            ErrorCode.INTERNAL,
            f"생산 처리 중 오류가 발생했습니다: {exc}",
        )

    return ProductionReceiptResponse(
        success=True,
        message=(
            f"'{produced_item.item_name}' {payload.quantity} {produced_item.unit} 생산 입고 완료. "
            f"{len(backflushed)}개 부품을 자동 차감했습니다."
        ),
        produced_item_id=produced_item.item_id,
        produced_item_name=produced_item.item_name,
        produced_quantity=payload.quantity,
        reference_no=payload.reference_no,
        backflushed_components=backflushed,
        transaction_ids=transaction_ids,
    )


def _load_and_merge_requirements(
    db: Session,
    payload: ProductionReceiptRequest,
    produced_item: Item,
) -> Dict[uuid.UUID, Decimal]:
    """BOM 전개 → 순환참조/빈 BOM 검증 → 부품별 소요량 합산."""
    try:
        component_requirements = _explode_bom(db, payload.item_id, payload.quantity)
    except RecursionError:
        raise http_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.BAD_REQUEST,
            "BOM 구조에 순환 참조가 있습니다. BOM 구성을 확인해 주세요.",
        )

    if not component_requirements:
        raise http_error(
            status.HTTP_400_BAD_REQUEST,
            ErrorCode.BAD_REQUEST,
            f"'{produced_item.item_name}'에 등록된 BOM이 없습니다.",
        )

    merged: Dict[uuid.UUID, Decimal] = {}
    for item_id, req_qty in component_requirements:
        merged[item_id] = merged.get(item_id, Decimal("0")) + req_qty
    return merged


def _preload_components(
    db: Session,
    merged: Dict[uuid.UUID, Decimal],
) -> Tuple[Dict[uuid.UUID, Item], Dict[uuid.UUID, Inventory]]:
    """부품 Item / Inventory 를 bulk 로드.

    5.4-E: Items / Inventory 각 1회 IN 쿼리. 기존엔 component 마다
    db.query 가 반복되어 N+1 였음. Inventory 는 다품목 동시 backflush
    TOCTOU 방지를 위해 한 번에 FOR UPDATE 로 잠근다.
    """
    comp_ids = list(merged.keys())
    items_map = {i.item_id: i for i in db.query(Item).filter(Item.item_id.in_(comp_ids)).all()}
    invs_map = inventory_svc.lock_inventories(db, comp_ids)
    return items_map, invs_map


def _assert_no_shortage(
    merged: Dict[uuid.UUID, Decimal],
    items_map: Dict[uuid.UUID, Item],
    invs_map: Dict[uuid.UUID, Inventory],
) -> None:
    """창고 가용분 기준 사전 재고 검사 — 부족 시 422 STOCK_SHORTAGE."""
    shortage_errors = []
    for comp_item_id, required_qty in merged.items():
        inv = invs_map.get(comp_item_id)
        # 생산 BACKFLUSH는 창고 가용분(warehouse - pending) 기준 사전 검사 — stock_math 단일 소스.
        current_avail = stock_math.figures_from_inventory(inv).warehouse_available
        if current_avail < required_qty:
            comp_item = items_map.get(comp_item_id)
            shortage_errors.append(
                f"[{comp_item.mes_code}] {comp_item.item_name}: 필요 {required_qty} {comp_item.unit}, "
                f"가용 {current_avail} {comp_item.unit}, 부족 {required_qty - current_avail}"
            )

    if shortage_errors:
        raise http_error(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code=ErrorCode.STOCK_SHORTAGE,
            message="재고 부족으로 생산 입고를 진행할 수 없습니다.",
            shortages=shortage_errors,
        )


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
        # items_map 재사용 (5.4-E)
        comp_item = items_map.get(comp_item_id)
        if comp_item is None:
            raise http_error(
                status.HTTP_404_NOT_FOUND,
                ErrorCode.NOT_FOUND,
                f"부품 {comp_item_id} 을 찾을 수 없습니다.",
            )

        # 재고 변경은 서비스 레이어로 위임 (창고 차감 + _sync_total 은 내부 책임)
        comp_cells_before = inv_effect.snapshot_cells(db, comp_item_id)
        inv, qty_before = inventory_svc.consume_warehouse(db, comp_item_id, required_qty)

        log = TransactionLog(
            item_id=comp_item_id,
            transaction_type=TransactionTypeEnum.BACKFLUSH,
            quantity_change=-required_qty,
            quantity_before=qty_before,
            quantity_after=inv.quantity,
            reference_no=payload.reference_no,
            produced_by=producer_name or payload.produced_by,
            producer_employee_id=producer_id,
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
    """생산 결과 적재 + PRODUCE 로그 기록.

    process_type_code 기반 부서의 PRODUCTION 으로 적재 (R 시리즈/없음 → 창고 폴백).
    """
    target_dept = inventory_svc.dept_for_process_type(produced_item.process_type_code)
    produced_inv = inventory_svc.get_or_create_inventory(db, payload.item_id)
    prod_qty_before = produced_inv.quantity or Decimal("0")
    prod_cells_before = inv_effect.snapshot_cells(db, payload.item_id)
    if target_dept is not None:
        inventory_svc.receive_confirmed(
            db, payload.item_id, payload.quantity,
            bucket="production", dept=target_dept,
        )
    else:
        inventory_svc.receive_confirmed(db, payload.item_id, payload.quantity)

    produce_log = TransactionLog(
        item_id=payload.item_id,
        transaction_type=TransactionTypeEnum.PRODUCE,
        quantity_change=payload.quantity,
        quantity_before=prod_qty_before,
        quantity_after=produced_inv.quantity,
        reference_no=payload.reference_no,
        produced_by=producer_name or payload.produced_by,
        producer_employee_id=producer_id,
        notes=payload.notes or f"생산 입고: {produced_item.item_name} x {payload.quantity}",
        inventory_effect=inv_effect.capture_effect(db, payload.item_id, prod_cells_before),
    )
    db.add(produce_log)
    db.flush()
    transaction_ids.append(produce_log.log_id)


@router.get(
    "/bom-check/{item_id}",
    response_model=BomCheckResponse,
    summary="생산 가능 여부 사전 확인",
)
def check_production_feasibility(
    item_id: uuid.UUID,
    quantity: Decimal = 1,
    db: Session = Depends(get_db),
):
    item = item_repository.get(db, item_id)
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    component_requirements = _explode_bom(db, item_id, quantity)
    merged: Dict[uuid.UUID, Decimal] = {}
    for cid, qty in component_requirements:
        merged[cid] = merged.get(cid, Decimal("0")) + qty

    result = []
    all_ok = True

    # bulk 로 전 품목 재고 수치 한 번에 확보 (N+1 제거)
    comp_ids = list(merged.keys())
    figures_map = stock_math.bulk_compute(db, comp_ids)
    comps_map = {
        c.item_id: c
        for c in db.query(Item).filter(Item.item_id.in_(comp_ids)).all()
    }

    for comp_item_id, required_qty in merged.items():
        comp_item = comps_map.get(comp_item_id)
        if comp_item is None:
            continue
        fig = figures_map.get(comp_item_id) or stock_math.StockFigures()
        # Backflush 는 창고만 소비하므로 feasibility 도 warehouse_available (wh - pending) 기준.
        # 이렇게 해야 production_receipt 의 실제 검사식과 일치.
        current_total = fig.total
        current_pending = fig.pending
        current_avail = fig.warehouse_available
        ok = current_avail >= required_qty
        if not ok:
            all_ok = False
        result.append(
            {
                "mes_code": comp_item.mes_code,
                "item_name": comp_item.item_name,
                "process_type_code": comp_item.process_type_code,
                "unit": comp_item.unit,
                "required": float(required_qty),
                "current_stock": float(current_total),
                "pending": float(current_pending),
                "available": float(current_avail),
                "shortage": float(max(required_qty - current_avail, Decimal("0"))),
                "ok": ok,
            }
        )

    return {
        "item_id": str(item_id),
        "item_name": item.item_name,
        "quantity_to_produce": float(quantity),
        "can_produce": all_ok,
        "components": result,
    }


def _explode_bom(
    db: Session,
    parent_item_id: uuid.UUID,
    qty_to_produce: Decimal,
    depth: int = 0,
    visited: frozenset = frozenset(),
    *,
    cache: BomCache | None = None,
) -> List[Tuple[uuid.UUID, Decimal]]:
    """Thin wrapper kept for backward compatibility; delegates to services/bom."""
    return _explode_bom_svc(db, parent_item_id, qty_to_produce, depth, visited, cache=cache)


@router.get(
    "/capacity",
    response_model=CapacityResponse,
    summary="전체 생산 가능수량 조회",
)
@router.get("/possible", response_model=CapacityResponse, summary="Production capacity alias")
def get_production_capacity(db: Session = Depends(get_db)):
    """생산 가능 수량 — legacy(PF 합산) + AF 기준 블록을 함께 반환.

    - **immediate / maximum / top_items / representative_items**: 기존 PF 합산 기준(호환 유지).
    - **af**: AF(조립 완제품) 기준 신규 블록(ship_ready / fast_assembly / total_production).

    계산 로직은 services/production_capacity.compute_capacity 로 분리되어 있다.
    """
    return compute_capacity(db)
