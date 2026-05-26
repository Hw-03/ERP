"""Production router for production receipts and BOM-based backflush."""

import logging
import uuid
from decimal import Decimal
from typing import Dict, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import BOM, Inventory, Item, ProcessType, TransactionLog, TransactionTypeEnum
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

    # 5.4-E: bulk 사전 로드 — Items / Inventory 각 1회 IN 쿼리.
    # 기존엔 component 마다 db.query 가 반복되어 N+1 였음.
    comp_ids = list(merged.keys())
    items_map = {i.item_id: i for i in db.query(Item).filter(Item.item_id.in_(comp_ids)).all()}
    # 다품목 동시 backflush TOCTOU 방지 — 한 번에 FOR UPDATE 잠금
    invs_map = inventory_svc.lock_inventories(db, comp_ids)

    shortage_errors = []
    for comp_item_id, required_qty in merged.items():
        inv = invs_map.get(comp_item_id)
        # 생산 BACKFLUSH는 창고 가용분 기준으로 사전 검사 (warehouse - pending)
        current_avail = (
            (inv.warehouse_qty or Decimal("0")) - (inv.pending_quantity or Decimal("0"))
            if inv else Decimal("0")
        )
        if current_avail < required_qty:
            comp_item = items_map.get(comp_item_id)
            shortage_errors.append(
                f"[{comp_item.item_code}] {comp_item.item_name}: 필요 {required_qty} {comp_item.unit}, "
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
            # items_map 재사용 (5.4-E)
            comp_item = items_map.get(comp_item_id)
            if comp_item is None:
                raise http_error(
                    status.HTTP_404_NOT_FOUND,
                    ErrorCode.NOT_FOUND,
                    f"부품 {comp_item_id} 을 찾을 수 없습니다.",
                )

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
                    item_code=comp_item.item_code,
                    item_name=comp_item.item_name,
                    process_type_code=comp_item.process_type_code,
                    required_quantity=required_qty,
                    stock_before=qty_before,
                    stock_after=inv.quantity,
                )
            )

        # 생산 결과: process_type_code 기반 부서의 PRODUCTION으로 적재 (R 시리즈/없음 → 창고 폴백)
        target_dept = inventory_svc.dept_for_process_type(produced_item.process_type_code)
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
                "item_code": comp_item.item_code,
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
    """BOM 최상위 완제품들에 대해 즉시/최대 생산 가능수량을 계산한다.

    - **immediate**: 시작 재고를 stage_order ≥ 60(NF) 인 품목에서만 인정.
      NF 미만(원자재 등)은 추가 생산 안 함 → 현실 도달 가능 수량.
    - **maximum**: 맨 아래 원자재(TR, stage_order 10)까지 전부 재귀, 모든 재고 사용.

    응답 status 4단계:
      no_target / bom_not_registered / not_producible / producible.
    """

    def _buildable(
        item_id: uuid.UUID,
        *,
        bom_cache: BomCache,
        fig_by_id: Dict[uuid.UUID, stock_math.StockFigures],
        stage_by_item: Dict[uuid.UUID, int | None],
        immediate_mode: bool,
        memo: Dict[uuid.UUID, int],
        visiting: frozenset,
        depth: int = 0,
    ) -> Tuple[int, uuid.UUID | None]:
        """재귀 누적 가용 생산량(buildable).

        Returns: (qty, bottleneck_item_id)
        """
        MAX_DEPTH = 10

        if item_id in memo:
            return memo[item_id], None

        # 사이클 체크
        if depth > MAX_DEPTH or item_id in visiting:
            own = max(int(fig_by_id.get(item_id, stock_math.StockFigures()).available), 0)
            return own, None

        # 현재 아이템의 가용 재고
        own = max(int(fig_by_id.get(item_id, stock_math.StockFigures()).available), 0)
        stage = stage_by_item.get(item_id)

        # immediate_mode에서 stage < 60이면 자식 전개 안 함 (원자재는 추가 생산 안 함)
        if immediate_mode and stage is not None and stage < 60:
            memo[item_id] = own
            return own, None

        children = bom_cache.get(item_id, [])
        if not children:
            memo[item_id] = own
            return own, None

        # 각 자식 재귀
        new_visiting = visiting | frozenset([item_id])
        extra_qty = float("inf")
        bottleneck_id: uuid.UUID | None = None

        for child_id, per_unit in children:
            child_qty, _ = _buildable(
                child_id,
                bom_cache=bom_cache,
                fig_by_id=fig_by_id,
                stage_by_item=stage_by_item,
                immediate_mode=immediate_mode,
                memo=memo,
                visiting=new_visiting,
                depth=depth + 1,
            )
            if per_unit > 0:
                can_make = int(child_qty / per_unit)
                if can_make < extra_qty:
                    extra_qty = can_make
                    bottleneck_id = child_id

        if extra_qty == float("inf"):
            extra_qty = 0

        total = own + int(extra_qty)
        memo[item_id] = total
        return total, bottleneck_id

    empty_response = {
        "immediate": 0,
        "maximum": 0,
        "limiting_item": None,
        "status": "no_target",
        "top_items": [],
        "representative_items": [],
    }

    # BOM parent 중 다른 BOM의 child가 아닌 것 = 최상위 품목
    all_parent_ids = {row[0] for row in db.query(BOM.parent_item_id).distinct().all()}
    all_child_ids = {row[0] for row in db.query(BOM.child_item_id).distinct().all()}
    top_level_ids = all_parent_ids - all_child_ids

    if not top_level_ids:
        return empty_response

    # 모든 top-level PF 조회 (limit 제거).
    # process_type_code='PF' 추가 필터 — BOM 트리 최상위에 AF/AA 등 중간 단계가
    # 잡혀도 시연/대시보드에서는 완성품(PF)만 의미가 있음. KPI 합산도 PF 기준.
    top_items_db = (
        db.query(Item)
        .filter(Item.item_id.in_(list(top_level_ids)), Item.process_type_code == "PF")
        .all()
    )

    if not top_items_db:
        return empty_response

    # 1) BOM 전체를 한 번만 읽어 캐시
    bom_cache = build_bom_cache(db)

    # 2) top_item 및 BOM 구조의 모든 item에 대해 재고 조회
    all_item_ids: set[uuid.UUID] = {item.item_id for item in top_items_db}

    def _collect_all_items(iid: uuid.UUID, visited: set[uuid.UUID] | None = None) -> None:
        if visited is None:
            visited = set()
        if iid in visited:
            return
        visited.add(iid)
        all_item_ids.add(iid)
        for child_id, _ in bom_cache.get(iid, []):
            _collect_all_items(child_id, visited)

    for item in top_items_db:
        _collect_all_items(item.item_id)

    # 3) bulk으로 재고 + 품목 정보 조회 (N+1 제거)
    fig_by_id = stock_math.bulk_compute(db, all_item_ids)
    items_map = {i.item_id: i for i in db.query(Item).filter(Item.item_id.in_(list(all_item_ids))).all()}

    # 4) 각 item의 stage_order 맵
    stage_by_item: Dict[uuid.UUID, int | None] = {}
    for iid in all_item_ids:
        item = items_map.get(iid)
        if item and item.process_type_code:
            pt = db.query(ProcessType).filter(ProcessType.code == item.process_type_code).first()
            if pt:
                stage_by_item[iid] = pt.stage_order
        stage_by_item.setdefault(iid, None)

    # 5) top 각각에 대해 immediate/maximum 계산
    top_results = []
    for item in top_items_db:
        imm, imm_btl = _buildable(
            item.item_id,
            bom_cache=bom_cache,
            fig_by_id=fig_by_id,
            stage_by_item=stage_by_item,
            immediate_mode=True,
            memo={},
            visiting=frozenset(),
        )
        mx, _ = _buildable(
            item.item_id,
            bom_cache=bom_cache,
            fig_by_id=fig_by_id,
            stage_by_item=stage_by_item,
            immediate_mode=False,
            memo={},
            visiting=frozenset(),
        )

        bottleneck_name: str | None = None
        if imm_btl:
            btl_item = items_map.get(imm_btl)
            if btl_item:
                bottleneck_name = btl_item.item_name

        top_results.append({
            "item_id": str(item.item_id),
            "item_name": item.item_name,
            "item_code": item.item_code,
            "model_symbol": item.model_symbol,
            "is_representative": False,
            "immediate": imm,
            "maximum": mx,
            "limiting_item": bottleneck_name,
        })

    if not top_results:
        return {
            "immediate": 0,
            "maximum": 0,
            "limiting_item": None,
            "status": "bom_not_registered",
            "top_items": [],
            "representative_items": [],
        }

    # 모델별 대표 PF 선정: model_symbol 별 그룹화 → 자연 정렬 첫 PF.
    # 정렬 키는 item_code (있으면), 없으면 item_name.
    representatives: Dict[str, dict] = {}
    for r in top_results:
        ms = r.get("model_symbol")
        if not ms:
            continue
        sort_key = (r.get("item_code") or r.get("item_name") or "")
        cur = representatives.get(ms)
        if cur is None:
            representatives[ms] = r
        else:
            cur_key = (cur.get("item_code") or cur.get("item_name") or "")
            if sort_key < cur_key:
                representatives[ms] = r
    for r in representatives.values():
        r["is_representative"] = True

    representative_items = sorted(
        representatives.values(),
        key=lambda r: (r.get("model_symbol") or ""),
    )

    total_immediate = sum(r["immediate"] for r in top_results)
    total_maximum = sum(r["maximum"] for r in top_results)

    # 전체 병목: immediate 가 가장 작은 top_item 의 병목 부품
    min_item = min(top_results, key=lambda r: r["immediate"])
    bottleneck_name = min_item.get("limiting_item")

    is_producible = any(r["immediate"] > 0 or r["maximum"] > 0 for r in top_results)
    status_value = "producible" if is_producible else "not_producible"

    return {
        "immediate": total_immediate,
        "maximum": total_maximum,
        "limiting_item": bottleneck_name,
        "status": status_value,
        "top_items": sorted(top_results, key=lambda r: r["immediate"]),
        "representative_items": representative_items,
    }
