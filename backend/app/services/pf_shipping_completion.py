"""출하 탭의 최종 PF 픽업 완료 원장을 보고서용으로 조회한다."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import or_
from sqlalchemy.orm import Session, aliased

from app.models import Item, ShippingRequest, TransactionLog, TransactionTypeEnum


PICKUP_PHASE = "PICKUP"


@dataclass(frozen=True)
class PfShippingCompletion:
    """취소되지 않은 최종 PF 한 건의 실제 픽업 완료 수량."""

    item_id: uuid.UUID
    model_symbol: str | None
    quantity: Decimal
    completed_at: datetime


def list_pf_shipping_completions(
    db: Session,
    *,
    start_at: datetime,
    end_at: datetime,
    cancellation_as_of: datetime | None = None,
) -> list[PfShippingCompletion]:
    """기간 안 최종 PF 픽업을 취소 시점 기준으로 재구성한다."""
    reversal = aliased(TransactionLog)
    cancellation_filters = [
        or_(
            reversal.log_id.is_(None),
            reversal.created_at > cancellation_as_of,
        ),
        or_(
            TransactionLog.cancelled.is_(False),
            TransactionLog.cancelled_at > cancellation_as_of,
        ),
    ] if cancellation_as_of is not None else [
        reversal.log_id.is_(None),
        TransactionLog.cancelled.is_(False),
    ]
    rows = (
        db.query(
            TransactionLog.item_id,
            Item.model_symbol,
            TransactionLog.quantity_change,
            TransactionLog.created_at,
        )
        .join(ShippingRequest, ShippingRequest.request_id == TransactionLog.shipping_request_id)
        .join(Item, Item.item_id == TransactionLog.item_id)
        .outerjoin(reversal, reversal.reverses_log_id == TransactionLog.log_id)
        .filter(
            TransactionLog.transaction_type == TransactionTypeEnum.SHIP,
            TransactionLog.shipping_phase == PICKUP_PHASE,
            TransactionLog.item_id == ShippingRequest.final_pf_item_id,
            Item.process_type_code == "PF",
            TransactionLog.quantity_change < 0,
            TransactionLog.created_at >= start_at,
            TransactionLog.created_at < end_at,
            *cancellation_filters,
        )
        .order_by(TransactionLog.created_at, TransactionLog.log_id)
        .all()
    )
    return [
        PfShippingCompletion(
            item_id=row.item_id,
            model_symbol=row.model_symbol,
            quantity=abs(Decimal(str(row.quantity_change))),
            completed_at=row.created_at,
        )
        for row in rows
    ]
