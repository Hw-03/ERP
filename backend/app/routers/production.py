"""Production router for production receipts and BOM-based backflush."""

import uuid
from decimal import Decimal
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BOM, CategoryEnum, Inventory, Item, TransactionLog, TransactionTypeEnum
from app.schemas import (
    BackflushDetail,
    BomCheckResponse,
    CapacityResponse,
    ProductionReceiptRequest,
    ProductionReceiptResponse,
)
from app.services import inventory as inventory_svc
from app.services import stock_math
from app.services.bom import BomCache, build_bom_cache
from app.services.bom import explode_bom as _explode_bom_svc
from app.services.bom import merge_requirements
from app.routers._errors import ErrorCode, http_error

router = APIRouter()


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
    produced_item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not produced_item:
        raise http_error(404, ErrorCode.NOT_FOUND, "생산 대상 품목을 찾을 수 없습니다.")

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

    shortage_errors = []
    for comp_item_id, required_qty in merged.items():
        inv = db.query(Inventory).filter(Inventory.item_id == comp_item_id).first()
        # 생산 BACKFLUSH는 창고 가용분 기준으로 사전 검사 (warehouse - pending)
        current_avail = (
            (inv.warehouse_qty or Decimal("0")) - (inv.pending_quantity or Decimal("0"))
            if inv else Decimal("0")
        )
        if current_avail < required_qty:
            comp_item = db.query(Item).filter(Item.item_id == comp_item_id).first()
            shortage_errors.append(
                f"[{comp_item.erp_code}] {comp_item.item_name}: 필요 {required_qty} {comp_item.unit}, "
                f"가용 {current_avail} {comp_item.unit}, 부족 {required_qty - current_avail}"
            )

    if shortage_errors:
        raise http_error(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code=ErrorCode.STOCK_SHORTAGE,
            message="재고 부족으로 생산 입고를 진행할 수 없습니다.",
            shortages=shortage_errors,
        )

    transaction_ids: List[uuid.UUID] = []
    backflushed: List[BackflushDetail] = []

    try:
        for comp_item_id, required_qty in merged.items():
            comp_item = db.query(Item).filter(Item.item_id == comp_item_id).first()

            # 재고 변경은 서비스 레이어로 위임 (창고 차감 + _sync_total 은 내부 책임)
            inv, qty_before = inventory_svc.consume_warehouse(db, comp_item_id, required_qty)

            log = TransactionLog(
                item_id=comp_item_id,
                transaction_type=TransactionTypeEnum.BACKFLUSH,
                quantity_change=-required_qty,
                quantity_before=qty_before,
                quantity_after=inv.quantity,
                reference_no=payload.reference_no,
                produced_by=payload.produced_by,
                notes=f"생산 입고 Backflush: {produced_item.item_name} x {payload.quantity}",
            )
            db.add(log)
            db.flush()

            transaction_ids.append(log.log_id)
            backflushed.append(
                BackflushDetail(
                    item_id=comp_item_id,
                    erp_code=comp_item.erp_code,
                    item_name=comp_item.item_name,
                    category=comp_item.category,
                    required_quantity=required_qty,
                    stock_before=qty_before,
                    stock_after=inv.quantity,
                )
            )

        # 생산 결과: 카테고리 매핑 부서의 PRODUCTION으로 적재 (없으면 창고)
        target_dept = inventory_svc.dept_for_category(produced_item.category)
        produced_inv = inventory_svc.get_or_create_inventory(db, payload.item_id)
        prod_qty_before = produced_inv.quantity or Decimal("0")
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
            produced_by=payload.produced_by,
            notes=payload.notes or f"생산 입고: {produced_item.item_name} x {payload.quantity}",
        )
        db.add(produce_log)
        db.flush()
        transaction_ids.append(produce_log.log_id)

        db.commit()
    except Exception as exc:
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
    item = db.query(Item).filter(Item.item_id == item_id).first()
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
                "erp_code": comp_item.erp_code,
                "item_name": comp_item.item_name,
                "category": comp_item.category,
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
def get_production_capacity(db: Session = Depends(get_db)):
    """BOM이 등록된 BA 품목들에 대해 즉시/최대 생산 가능수량을 계산한다.

    - immediate: warehouse_available (= warehouse_qty - pending) 기준 최소 생산 가능량
      → production_receipt 의 실제 차감 검사식과 일치 (부서 생산재고/불량은 제외)
    - maximum: total (= warehouse + production + defective) 기준 최소 생산 가능량
    """
    # BOM parent 중 다른 BOM의 child가 아닌 것 = 최상위 품목
    all_parent_ids = {row[0] for row in db.query(BOM.parent_item_id).distinct().all()}
    all_child_ids = {row[0] for row in db.query(BOM.child_item_id).distinct().all()}
    top_level_ids = all_parent_ids - all_child_ids

    if not top_level_ids:
        return {"immediate": 0, "maximum": 0, "limiting_item": None, "top_items": []}

    top_items_db = (
        db.query(Item)
        .filter(Item.item_id.in_(list(top_level_ids)))
        .filter(Item.category == CategoryEnum.BA)
        .limit(15)
        .all()
    )

    # 1) BOM 전체를 한 번만 읽어 캐시 만들고 모든 top item 을 펼친다 (N+1 제거)
    bom_cache = build_bom_cache(db)
    explode_cache: Dict[uuid.UUID, Dict[uuid.UUID, Decimal]] = {}
    all_comp_ids: set[uuid.UUID] = set()
    for item in top_items_db:
        merged = merge_requirements(_explode_bom(db, item.item_id, Decimal("1"), cache=bom_cache))
        if not merged:
            continue
        explode_cache[item.item_id] = merged
        all_comp_ids.update(merged.keys())

    if not explode_cache:
        return {"immediate": 0, "maximum": 0, "limiting_item": None, "top_items": []}

    # 2) bulk 로 한 번에 재고 + 품목 정보 조회 (N+1 제거)
    figures_map = stock_math.bulk_compute(db, all_comp_ids)
    items_map = {
        i.item_id: i
        for i in db.query(Item).filter(Item.item_id.in_(list(all_comp_ids))).all()
    }

    top_results = []
    bottleneck_by_top: Dict[uuid.UUID, str | None] = {}
    for item in top_items_db:
        merged = explode_cache.get(item.item_id)
        if not merged:
            continue

        min_immediate = float("inf")
        min_maximum = float("inf")
        limiting_item: str | None = None

        for comp_id, req_qty in merged.items():
            req = float(req_qty)
            if req <= 0:
                continue
            fig = figures_map.get(comp_id) or stock_math.StockFigures()
            wh_avail = float(fig.warehouse_available)
            total = float(fig.total)
            imm_can = wh_avail / req
            max_can = total / req
            if imm_can < min_immediate:
                min_immediate = imm_can
                comp_item = items_map.get(comp_id)
                limiting_item = comp_item.item_name if comp_item else None
            if max_can < min_maximum:
                min_maximum = max_can

        bottleneck_by_top[item.item_id] = limiting_item
        top_results.append({
            "item_id": str(item.item_id),
            "item_name": item.item_name,
            "erp_code": item.erp_code,
            "immediate": int(min_immediate) if min_immediate != float("inf") else 0,
            "maximum": int(min_maximum) if min_maximum != float("inf") else 0,
        })

    if not top_results:
        return {"immediate": 0, "maximum": 0, "limiting_item": None, "top_items": []}

    total_immediate = sum(r["immediate"] for r in top_results)
    total_maximum = sum(r["maximum"] for r in top_results)

    # 가장 즉시 생산 가능량이 작은 top item 의 병목 부품 (이미 위에서 캐시됨)
    min_item = min(top_results, key=lambda r: r["immediate"])
    bottleneck_name = bottleneck_by_top.get(uuid.UUID(min_item["item_id"]))

    return {
        "immediate": total_immediate,
        "maximum": total_maximum,
        "limiting_item": bottleneck_name,
        "top_items": sorted(top_results, key=lambda r: r["immediate"]),
    }
