"""Production router for production receipts and BOM-based backflush."""

import logging
import uuid
from decimal import Decimal
from typing import List, Tuple

from fastapi import Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.verified_actor import (
    VerifiedActor,
    VerifiedActorRouter,
    ensure_actor_employee_code,
    ensure_actor_employee_name,
)
from app.models import Item, LocationStatusEnum
from app.schemas import (
    BomCheckResponse,
    CapacityResponse,
    ProductionReceiptRequest,
    ProductionReceiptResponse,
)
from app.services import production_receipt as production_receipt_svc
from app.services import inventory as inventory_svc
from app.services import stock_availability
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
from app.repositories import item_repository


router = VerifiedActorRouter()

logger = logging.getLogger("mes")


@router.post(
    "/receipt",
    response_model=ProductionReceiptResponse,
    status_code=status.HTTP_201_CREATED,
    summary="생산 입고 처리 (BOM 전개 + 자동 차감)",
)
def production_receipt(
    payload: ProductionReceiptRequest,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    ensure_actor_employee_code(actor, payload.producer_employee_code)
    ensure_actor_employee_name(actor, payload.produced_by)
    payload = payload.model_copy(
        update={
            "producer_employee_code": actor.employee_code,
            "produced_by": actor.name,
        }
    )

    produced_item = item_repository.get_active(db, payload.item_id)
    if not produced_item:
        raise http_error(404, ErrorCode.NOT_FOUND, "생산 대상 품목을 찾을 수 없습니다.")

    try:
        result = production_receipt_svc.execute_production_receipt(
            db,
            payload,
            produced_item,
            actor=actor,
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
    item = item_repository.get_active(db, item_id)
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    component_requirements = _explode_bom(db, item_id, quantity)
    merged = merge_requirements(component_requirements)

    result = []
    all_ok = True

    comp_ids = list(merged.keys())
    comps_map = {
        c.item_id: c
        for c in db.query(Item)
        .filter(Item.item_id.in_(comp_ids), Item.deleted_at.is_(None))
        .all()
    }
    if set(comp_ids) != set(comps_map):
        raise http_error(404, ErrorCode.NOT_FOUND, "BOM 구성품을 찾을 수 없습니다.")

    for comp_item_id, required_qty in merged.items():
        comp_item = comps_map.get(comp_item_id)
        if comp_item is None:
            continue
        try:
            dept = inventory_svc.department_for_item(comp_item)
            figure = stock_availability.figure_for_cell(
                db,
                stock_availability.AvailabilityCell.location(
                    comp_item.item_id,
                    dept,
                    LocationStatusEnum.PRODUCTION,
                ),
            )
            current_total = figure.physical
            current_pending = figure.stock_request_pending
            current_avail = figure.available
        except ValueError:
            dept = None
            current_total = Decimal("0")
            current_pending = Decimal("0")
            current_avail = Decimal("0")
        ok = current_avail >= required_qty
        if not ok:
            all_ok = False
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
    summary="생산 가능 수량 조회",
    description="현재 재고와 BOM을 기준으로 즉시·최대 생산 가능 수량을 조회합니다.",
)
@router.get(
    "/possible",
    response_model=CapacityResponse,
    summary="생산 가능 수량 조회 (호환)",
    description="기존 호출자 호환용 경로입니다. 신규 연동은 /api/production/capacity를 사용하세요.",
    deprecated=True,
)
def get_production_capacity(db: Session = Depends(get_db)):
    """생산 가능 수량 — legacy(PF 합산) + AF 기준 블록을 함께 반환.

    - **immediate / maximum / top_items / representative_items**: 기존 PF 합산 기준(호환 유지).
    - **af**: AF(조립 완제품) 기준 신규 블록(ship_ready / fast_production / total_production).

    계산 로직은 services/production_capacity.compute_capacity 로 분리되어 있다.
    """
    return compute_capacity(db)
