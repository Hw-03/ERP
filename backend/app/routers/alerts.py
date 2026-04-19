"""Stock alert router: 안전재고 미달 및 실사 편차 알림.

현재 전략: 호출 시점에 on-demand 스캔(`POST /api/alerts/scan`)으로 SAFETY
알림을 생성한다. 스캔은 `items.min_stock`이 설정된 품목 중 available가
임계값 미만인 경우 미acknowledged 알림이 없으면 새로 추가한다. COUNT_VARIANCE
알림은 `/api/counts` 제출 시 자동 생성된다(감지 임계값: |diff| > 0).
"""

from __future__ import annotations

import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AlertKindEnum, Inventory, Item, StockAlert
from app.schemas import StockAlertAcknowledgeRequest, StockAlertResponse
from app.services import inventory as inv_svc
from datetime import datetime

router = APIRouter()


def _to_response(db: Session, alert: StockAlert) -> StockAlertResponse:
    item = db.query(Item).filter(Item.item_id == alert.item_id).first()
    return StockAlertResponse(
        alert_id=alert.alert_id,
        item_id=alert.item_id,
        item_code=(item.erp_code or item.item_code) if item else None,
        item_name=item.item_name if item else None,
        kind=alert.kind,
        threshold=alert.threshold,
        observed_value=alert.observed_value,
        message=alert.message,
        triggered_at=alert.triggered_at,
        acknowledged_at=alert.acknowledged_at,
        acknowledged_by=alert.acknowledged_by,
    )


@router.post(
    "/scan",
    response_model=List[StockAlertResponse],
    summary="안전재고 미달 스캔 → 신규 SAFETY 알림 생성",
)
def scan_safety_alerts(db: Session = Depends(get_db)):
    """전 품목 순회: min_stock 보유 품목 중 available < min_stock 이고,
    같은 품목의 미확인 SAFETY 알림이 없으면 신규 생성."""
    created: List[StockAlert] = []
    items = (
        db.query(Item)
        .filter(Item.min_stock.isnot(None))
        .all()
    )
    for item in items:
        inv = db.query(Inventory).filter(Inventory.item_id == item.item_id).first()
        avail = inv_svc.available(inv) if inv else Decimal("0")
        min_stock = item.min_stock or Decimal("0")
        if avail >= min_stock:
            continue
        # Skip if an unacked SAFETY alert already exists
        exists = (
            db.query(StockAlert)
            .filter(
                StockAlert.item_id == item.item_id,
                StockAlert.kind == AlertKindEnum.SAFETY,
                StockAlert.acknowledged_at.is_(None),
            )
            .first()
        )
        if exists:
            continue
        alert = StockAlert(
            item_id=item.item_id,
            kind=AlertKindEnum.SAFETY,
            threshold=min_stock,
            observed_value=avail,
            message=f"{item.item_name}: 가용 {avail} < 안전재고 {min_stock}",
        )
        db.add(alert)
        created.append(alert)
    db.commit()
    return [_to_response(db, a) for a in created]


@router.get(
    "/",
    response_model=List[StockAlertResponse],
    summary="알림 조회 (미확인 기본)",
)
def list_alerts(
    kind: Optional[AlertKindEnum] = Query(None),
    include_acknowledged: bool = Query(False),
    item_id: Optional[uuid.UUID] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    q = db.query(StockAlert)
    if kind is not None:
        q = q.filter(StockAlert.kind == kind)
    if not include_acknowledged:
        q = q.filter(StockAlert.acknowledged_at.is_(None))
    if item_id is not None:
        q = q.filter(StockAlert.item_id == item_id)
    rows = (
        q.order_by(StockAlert.triggered_at.desc()).offset(skip).limit(limit).all()
    )
    return [_to_response(db, r) for r in rows]


@router.post(
    "/{alert_id}/acknowledge",
    response_model=StockAlertResponse,
    summary="알림 확인 처리",
)
def acknowledge_alert(
    alert_id: uuid.UUID,
    payload: StockAlertAcknowledgeRequest,
    db: Session = Depends(get_db),
):
    alert = db.query(StockAlert).filter(StockAlert.alert_id == alert_id).first()
    if alert is None:
        raise HTTPException(status_code=404, detail="알림을 찾을 수 없습니다.")
    if alert.acknowledged_at is not None:
        raise HTTPException(status_code=400, detail="이미 확인된 알림입니다.")
    alert.acknowledged_at = datetime.utcnow()
    alert.acknowledged_by = payload.acknowledged_by
    db.commit()
    db.refresh(alert)
    return _to_response(db, alert)
