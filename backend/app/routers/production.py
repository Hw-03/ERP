"""Production router for production receipts and BOM-based backflush."""

import logging
import uuid
from decimal import Decimal
from typing import List, Tuple

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item
from app.schemas import (
    BomCheckResponse,
    CapacityResponse,
    ProductionReceiptRequest,
    ProductionReceiptResponse,
)
from app.services import production_receipt as production_receipt_svc
from app.services import inventory as inventory_svc
from app.services.production_receipt import (
    ProductionBadRequest,
    ProductionItemNotFound,
    ProductionShortage,
)
from app.services.bom import BomCache
from app.services.bom import explode_bom as _explode_bom_svc
from app.services.bom import merge_requirements
from app.services.production_capacity import compute_capacity
from app.routers._errors import ErrorCode, http_error
from app.routers.inventory._tx_helper import resolve_producer
from app.repositories import item_repository


class PfPinPayload(BaseModel):
    pf_item_id: uuid.UUID

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

    try:
        result = production_receipt_svc.execute_production_receipt(
            db, payload, produced_item, producer_name, producer_id,
        )
    except ProductionItemNotFound as exc:
        raise http_error(status.HTTP_404_NOT_FOUND, ErrorCode.NOT_FOUND, str(exc))
    except ProductionBadRequest as exc:
        raise http_error(status.HTTP_400_BAD_REQUEST, ErrorCode.BAD_REQUEST, str(exc))
    except ProductionShortage as exc:
        # 사전 재고 부족 — 상세 목록(shortages)을 그대로 422 로 전달.
        raise http_error(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code=ErrorCode.STOCK_SHORTAGE,
            message=str(exc),
            shortages=exc.shortages,
        )
    except ValueError as exc:
        # WS9: 동시 같은-부품 입고 경합에서 진 쪽 — consume_warehouse 의 원자적
        # 가드(UPDATE ... WHERE qty>=n)가 늦게 ValueError 를 던진다. 사전 검사와
        # 동일하게 깨끗한 422 STOCK_SHORTAGE 로 매핑. db 는 롤백되어 loser 의
        # 부분 배치/orphan TransactionLog 가 남지 않는다.
        raise http_error(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code=ErrorCode.STOCK_SHORTAGE,
            message="재고 부족으로 생산 입고를 진행할 수 없습니다.",
            shortages=[str(exc)],
        )
    except Exception as exc:
        # WS8: 재던지기 전 풀스택 보존(기존엔 str(exc) 만 남고 트레이스 소실).
        logger.exception("생산 처리 중 예기치 못한 오류")
        raise http_error(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            ErrorCode.INTERNAL,
            f"생산 처리 중 오류가 발생했습니다: {exc}",
        )

    backflushed = result["backflushed"]
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
        transaction_ids=result["transaction_ids"],
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
    item = item_repository.get(db, item_id)
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    component_requirements = _explode_bom(db, item_id, quantity)
    merged = merge_requirements(component_requirements)

    result = []
    all_ok = True

    comp_ids = list(merged.keys())
    comps_map = {
        c.item_id: c
        for c in db.query(Item).filter(Item.item_id.in_(comp_ids)).all()
    }

    for comp_item_id, required_qty in merged.items():
        comp_item = comps_map.get(comp_item_id)
        if comp_item is None:
            continue
        try:
            dept, current_avail = inventory_svc.item_department_stock(db, comp_item)
        except ValueError:
            dept = None
            current_avail = Decimal("0")
        ok = current_avail >= required_qty
        if not ok:
            all_ok = False
        current_total = current_avail
        current_pending = Decimal("0")
        result.append(
            {
                "mes_code": comp_item.mes_code,
                "item_name": comp_item.item_name,
                "process_type_code": comp_item.process_type_code,
                "unit": comp_item.unit,
                "department": dept.value if dept is not None else None,
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
    - **af**: AF(조립 완제품) 기준 신규 블록(ship_ready / fast_production / total_production).

    계산 로직은 services/production_capacity.compute_capacity 로 분리되어 있다.
    """
    return compute_capacity(db)


@router.get(
    "/capacity/pf-pins",
    response_model=dict[str, str],
    summary="모델별 기준 PF 조회",
)
def get_pf_pins(db: Session = Depends(get_db)):
    """model_symbol → pf_item_id 전체 맵 반환. 지정 없으면 빈 dict."""
    rows = db.execute(text("SELECT model_symbol, pf_item_id FROM model_pf_pins")).fetchall()
    return {r[0]: str(uuid.UUID(r[1])) for r in rows}


@router.put(
    "/capacity/pf-pins/{model_symbol}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="모델 기준 PF 지정",
)
def set_pf_pin(
    model_symbol: str,
    payload: PfPinPayload,
    db: Session = Depends(get_db),
):
    """주어진 model_symbol 에 pf_item_id 를 기준 PF 로 지정한다."""
    pf_id = payload.pf_item_id.hex  # DB stores item_id without dashes
    row = db.execute(
        text("SELECT item_id FROM items WHERE item_id = :id AND process_type_code = 'PF'"),
        {"id": pf_id},
    ).fetchone()
    if not row:
        raise http_error(status.HTTP_400_BAD_REQUEST, ErrorCode.BAD_REQUEST, "PF 품목을 찾을 수 없습니다.")
    db.execute(
        text("DELETE FROM model_pf_pins WHERE model_symbol = :ms"),
        {"ms": model_symbol},
    )
    db.execute(
        text(
            "INSERT INTO model_pf_pins (model_symbol, pf_item_id, updated_at) "
            "VALUES (:ms, :pid, CURRENT_TIMESTAMP)"
        ),
        {"ms": model_symbol, "pid": pf_id},
    )
    db.commit()


@router.delete(
    "/capacity/pf-pins/{model_symbol}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="모델 기준 PF 해제",
)
def clear_pf_pin(model_symbol: str, db: Session = Depends(get_db)):
    """model_symbol 의 기준 PF 지정을 제거한다. 없어도 OK."""
    db.execute(
        text("DELETE FROM model_pf_pins WHERE model_symbol = :ms"),
        {"ms": model_symbol},
    )
    db.commit()
