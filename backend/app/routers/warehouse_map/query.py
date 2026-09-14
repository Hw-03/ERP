"""창고 지도 조회 — /structure, /map, /reconcile, /jari (공개 GET)."""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import WarehouseAngle, WarehouseBox
from app.schemas import (
    BoxTrackingResponse,
    ReconcileResponse,
    WarehouseAngleResponse,
    WarehouseBoxResponse,
    WarehouseMapResponse,
)
from app.services import warehouse_map as wm_service

router = APIRouter()


@router.get("/box-tracking", response_model=BoxTrackingResponse)
def get_box_tracking(db: Session = Depends(get_db)):
    """창고 박스 자동 차감 활성 여부 — 프론트가 편집/경고 UI 노출 결정에 사용."""
    return BoxTrackingResponse(enabled=wm_service.is_box_tracking_enabled(db))


@router.get("/structure", response_model=List[WarehouseAngleResponse])
def get_structure(db: Session = Depends(get_db)):
    """앵글 구조(평면도 좌표·크기 포함)."""
    return (
        db.query(WarehouseAngle)
        .order_by(WarehouseAngle.display_order.asc(), WarehouseAngle.id.asc())
        .all()
    )


@router.get("/map", response_model=WarehouseMapResponse)
def get_map(db: Session = Depends(get_db)):
    """지도 통합 데이터 — 구조 + 박스 배치 + 품목/부서색. 프론트가 이 하나로 전부 렌더."""
    return wm_service.build_map_payload(db)


@router.get("/reconcile", response_model=ReconcileResponse)
def get_reconcile(
    item_id: Optional[str] = Query(None, description="특정 품목만 대조"),
    db: Session = Depends(get_db),
):
    """배치 수량 합 vs 창고 재고(warehouse_qty) 대조 — 불일치 경고용."""
    return wm_service.reconcile_inventory(db, item_id=item_id)


@router.get("/jari", response_model=List[WarehouseBoxResponse])
def get_jari(
    angle_id: int = Query(...),
    row: int = Query(..., ge=1),
    layer: int = Query(..., ge=1),
    jari: int = Query(..., ge=0),
    db: Session = Depends(get_db),
):
    """특정 자리의 박스 스택 — 위치 배정 입력 폼에서 현재 상태 확인용."""
    boxes = (
        db.query(WarehouseBox)
        .filter(
            WarehouseBox.angle_id == angle_id,
            WarehouseBox.row_no == row,
            WarehouseBox.layer_no == layer,
            WarehouseBox.jari_index == jari,
        )
        .order_by(WarehouseBox.stack_order.asc())
        .all()
    )
    payload = wm_service.build_map_payload(db)
    by_id = {str(b["box_id"]): b for b in payload["boxes"]}
    return [by_id[str(b.box_id)] for b in boxes if str(b.box_id) in by_id]
