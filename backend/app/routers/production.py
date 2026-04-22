"""Production router for production receipts and BOM-based backflush."""

import uuid
from decimal import Decimal
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BOM, Inventory, Item, TransactionLog, TransactionTypeEnum
from app.schemas import BackflushDetail, ProductionReceiptRequest, ProductionReceiptResponse
from app.services import inventory as inventory_svc
from app.services.bom import explode_bom as _explode_bom_svc

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
        raise HTTPException(status_code=404, detail="생산 대상 품목을 찾을 수 없습니다.")

    try:
        component_requirements = _explode_bom(db, payload.item_id, payload.quantity)
    except RecursionError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="BOM 구조에 순환 참조가 있습니다. BOM 구성을 확인해 주세요.",
        )

    if not component_requirements:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{produced_item.item_name}'에 등록된 BOM이 없습니다.",
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
                f"[{comp_item.item_code}] {comp_item.item_name}: 필요 {required_qty} {comp_item.unit}, "
                f"가용 {current_avail} {comp_item.unit}, 부족 {required_qty - current_avail}"
            )

    if shortage_errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "재고 부족으로 생산 입고를 진행할 수 없습니다.",
                "shortages": shortage_errors,
            },
        )

    transaction_ids: List[uuid.UUID] = []
    backflushed: List[BackflushDetail] = []

    try:
        for comp_item_id, required_qty in merged.items():
            inv = (
                db.query(Inventory)
                .filter(Inventory.item_id == comp_item_id)
                .with_for_update()
                .first()
            )

            comp_item = db.query(Item).filter(Item.item_id == comp_item_id).first()
            qty_before = inv.quantity or Decimal("0")
            wh = inv.warehouse_qty or Decimal("0")
            inv.warehouse_qty = wh - required_qty
            inventory_svc._sync_total(db, comp_item_id)

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
                    item_code=comp_item.item_code,
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"생산 처리 중 오류가 발생했습니다: {exc}",
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
    summary="생산 가능 여부 사전 확인",
)
def check_production_feasibility(
    item_id: uuid.UUID,
    quantity: Decimal = 1,
    db: Session = Depends(get_db),
):
    item = db.query(Item).filter(Item.item_id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

    component_requirements = _explode_bom(db, item_id, quantity)
    merged: Dict[uuid.UUID, Decimal] = {}
    for cid, qty in component_requirements:
        merged[cid] = merged.get(cid, Decimal("0")) + qty

    result = []
    all_ok = True

    for comp_item_id, required_qty in merged.items():
        inv = db.query(Inventory).filter(Inventory.item_id == comp_item_id).first()
        comp_item = db.query(Item).filter(Item.item_id == comp_item_id).first()
        current_total = inv.quantity if inv else Decimal("0")
        current_pending = (inv.pending_quantity if inv else None) or Decimal("0")
        current_avail = current_total - current_pending
        ok = current_avail >= required_qty
        if not ok:
            all_ok = False
        result.append(
            {
                "item_code": comp_item.item_code,
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
) -> List[Tuple[uuid.UUID, Decimal]]:
    """Thin wrapper kept for backward compatibility; delegates to services/bom."""
    return _explode_bom_svc(db, parent_item_id, qty_to_produce, depth, visited)
