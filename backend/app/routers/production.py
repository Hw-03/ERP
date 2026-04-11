"""
Production Router — 생산 입고 + BOM 역전개 Backflush (핵심 비즈니스 로직)

ERPNext Manufacturing 모듈 사상 참고:
- Work Order → Production Entry → Stock Entry (Backflush)
- 여기서는 단일 API 호출로 위 전체 흐름을 원자적 트랜잭션으로 처리
"""

import uuid
from decimal import Decimal
from typing import List, Tuple, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, BOM, Inventory, TransactionLog, TransactionTypeEnum
from app.schemas import (
    ProductionReceiptRequest,
    ProductionReceiptResponse,
    BackflushDetail,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /api/production/receipt — 생산 입고 + 자동 Backflush
# ---------------------------------------------------------------------------

@router.post(
    "/receipt",
    response_model=ProductionReceiptResponse,
    status_code=status.HTTP_201_CREATED,
    summary="생산 입고 처리 (BOM 역전개 + 자동 차감)",
    description="""
    ## 생산 입고 + BOM Backflush

    1. 지정된 품목의 BOM을 재귀적으로 역전개하여 모든 소요 부품 계산
    2. 각 부품의 현재 재고가 소요량을 충족하는지 사전 검증
    3. **단일 데이터베이스 트랜잭션**으로 원자적 처리:
       - 모든 하위 부품 재고 차감 (BACKFLUSH)
       - 생산 완성품 재고 증가 (PRODUCE)
       - 전체 TransactionLog 기록
    4. 재고 부족 시 전체 롤백 + 상세 오류 반환
    """,
)
def production_receipt(
    payload: ProductionReceiptRequest,
    db: Session = Depends(get_db),
):
    # -----------------------------------------------------------------------
    # 1. 생산 품목 확인
    # -----------------------------------------------------------------------
    produced_item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not produced_item:
        raise HTTPException(status_code=404, detail="생산 품목을 찾을 수 없습니다.")

    # -----------------------------------------------------------------------
    # 2. BOM 역전개 — 소요 부품 목록 계산
    # -----------------------------------------------------------------------
    try:
        component_requirements = _explode_bom(db, payload.item_id, payload.quantity)
    except RecursionError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="BOM 구조에 순환 참조가 있습니다. BOM을 확인하세요."
        )

    if not component_requirements:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{produced_item.item_name}'에 등록된 BOM이 없습니다. BOM을 먼저 등록하세요."
        )

    # 동일 item_id가 여러 경로에서 나오면 합산
    merged: Dict[uuid.UUID, Decimal] = {}
    for item_id, req_qty in component_requirements:
        merged[item_id] = merged.get(item_id, Decimal("0")) + req_qty

    # -----------------------------------------------------------------------
    # 3. 재고 충분 여부 사전 검증 (트랜잭션 시작 전 빠른 실패)
    # -----------------------------------------------------------------------
    shortage_errors = []
    for comp_item_id, required_qty in merged.items():
        inv = db.query(Inventory).filter(Inventory.item_id == comp_item_id).first()
        current_qty = inv.quantity if inv else Decimal("0")
        if current_qty < required_qty:
            comp_item = db.query(Item).filter(Item.item_id == comp_item_id).first()
            shortage_errors.append(
                f"[{comp_item.item_code}] {comp_item.item_name}: "
                f"필요 {required_qty} {comp_item.unit}, "
                f"현재 재고 {current_qty} {comp_item.unit} (부족: {required_qty - current_qty})"
            )

    if shortage_errors:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "재고 부족으로 생산 입고를 처리할 수 없습니다.",
                "shortages": shortage_errors,
            }
        )

    # -----------------------------------------------------------------------
    # 4. 원자적 트랜잭션: 차감 + 입고 + 로그
    # -----------------------------------------------------------------------
    transaction_ids: List[uuid.UUID] = []
    backflushed: List[BackflushDetail] = []

    try:
        # 4-a. 하위 부품 재고 BACKFLUSH 차감
        for comp_item_id, required_qty in merged.items():
            inv = db.query(Inventory).filter(
                Inventory.item_id == comp_item_id
            ).with_for_update().first()  # 행 잠금

            comp_item = db.query(Item).filter(Item.item_id == comp_item_id).first()
            qty_before = inv.quantity
            inv.quantity = qty_before - required_qty

            log = TransactionLog(
                item_id=comp_item_id,
                transaction_type=TransactionTypeEnum.BACKFLUSH,
                quantity_change=-required_qty,
                quantity_before=qty_before,
                quantity_after=inv.quantity,
                reference_no=payload.reference_no,
                produced_by=payload.produced_by,
                notes=f"생산 입고 Backflush: {produced_item.item_name} × {payload.quantity}",
            )
            db.add(log)
            db.flush()

            transaction_ids.append(log.log_id)
            backflushed.append(BackflushDetail(
                item_id=comp_item_id,
                item_code=comp_item.item_code,
                item_name=comp_item.item_name,
                category=comp_item.category,
                required_quantity=required_qty,
                stock_before=qty_before,
                stock_after=inv.quantity,
            ))

        # 4-b. 완성품 재고 PRODUCE 입고
        produced_inv = db.query(Inventory).filter(
            Inventory.item_id == payload.item_id
        ).with_for_update().first()

        if not produced_inv:
            produced_inv = Inventory(item_id=payload.item_id, quantity=Decimal("0"))
            db.add(produced_inv)
            db.flush()

        prod_qty_before = produced_inv.quantity
        produced_inv.quantity = prod_qty_before + payload.quantity

        produce_log = TransactionLog(
            item_id=payload.item_id,
            transaction_type=TransactionTypeEnum.PRODUCE,
            quantity_change=payload.quantity,
            quantity_before=prod_qty_before,
            quantity_after=produced_inv.quantity,
            reference_no=payload.reference_no,
            produced_by=payload.produced_by,
            notes=payload.notes or f"생산 입고: {produced_item.item_name} × {payload.quantity}",
        )
        db.add(produce_log)
        db.flush()
        transaction_ids.append(produce_log.log_id)

        # 4-c. 최종 커밋
        db.commit()

    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"생산 처리 중 오류가 발생하여 롤백되었습니다: {str(exc)}"
        )

    return ProductionReceiptResponse(
        success=True,
        message=f"'{produced_item.item_name}' {payload.quantity} {produced_item.unit} 생산 입고 완료. "
                f"{len(backflushed)}개 부품 자동 차감.",
        produced_item_id=produced_item.item_id,
        produced_item_name=produced_item.item_name,
        produced_quantity=payload.quantity,
        reference_no=payload.reference_no,
        backflushed_components=backflushed,
        transaction_ids=transaction_ids,
    )


# ---------------------------------------------------------------------------
# GET /api/production/bom-check — 생산 가능 여부 사전 확인
# ---------------------------------------------------------------------------

@router.get(
    "/bom-check/{item_id}",
    summary="생산 가능 여부 사전 확인 (재고 검증만)",
)
def check_production_feasibility(
    item_id: uuid.UUID,
    quantity: Decimal = 1,
    db: Session = Depends(get_db),
):
    """실제 차감 없이 BOM 역전개 후 재고 충분 여부만 확인."""
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
        current = inv.quantity if inv else Decimal("0")
        ok = current >= required_qty
        if not ok:
            all_ok = False
        result.append({
            "item_code": comp_item.item_code,
            "item_name": comp_item.item_name,
            "category": comp_item.category,
            "unit": comp_item.unit,
            "required": float(required_qty),
            "current_stock": float(current),
            "shortage": float(max(required_qty - current, Decimal("0"))),
            "ok": ok,
        })

    return {
        "item_id": str(item_id),
        "item_name": item.item_name,
        "quantity_to_produce": float(quantity),
        "can_produce": all_ok,
        "components": result,
    }


# ---------------------------------------------------------------------------
# BOM 역전개 (Explosion) — 핵심 내부 함수
# ---------------------------------------------------------------------------

def _explode_bom(
    db: Session,
    parent_item_id: uuid.UUID,
    qty_to_produce: Decimal,
    depth: int = 0,
    visited: frozenset = frozenset(),
) -> List[Tuple[uuid.UUID, Decimal]]:
    """
    ERPNext Manufacturing 방식 BOM 역전개.

    다단계 BOM 구조에서 최하위 구성부품(leaf node)까지 재귀 전개.
    중간 반제품(TA, HA, VA 등)도 자체 BOM이 있으면 계속 전개.

    Args:
        parent_item_id: 생산하려는 품목
        qty_to_produce: 생산 수량
        depth: 재귀 깊이 (10단계 초과 시 중단)
        visited: 순환 참조 방지용 방문 품목 집합

    Returns:
        [(child_item_id, required_quantity), ...] — 소요 부품 목록
    """
    if depth > 10 or parent_item_id in visited:
        return []

    visited = visited | {parent_item_id}
    bom_entries = db.query(BOM).filter(BOM.parent_item_id == parent_item_id).all()
    result = []

    for entry in bom_entries:
        required_qty = entry.quantity * qty_to_produce

        # 하위 부품에도 BOM이 있는지 확인 (반제품인 경우)
        child_bom_exists = db.query(BOM).filter(
            BOM.parent_item_id == entry.child_item_id
        ).first()

        if child_bom_exists:
            # 반제품: 하위로 계속 전개
            result.extend(
                _explode_bom(db, entry.child_item_id, required_qty, depth + 1, visited)
            )
        else:
            # 최하위 부품(leaf): 직접 차감 대상
            result.append((entry.child_item_id, required_qty))

    return result
