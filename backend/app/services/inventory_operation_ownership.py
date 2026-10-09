"""Resolve request ownership without trusting editable history display fields."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import InventoryOperation, InventoryOperationEffect, InventoryOperationEffectKindEnum, StockRequest


def operation_requester_id(db: Session, operation: InventoryOperation) -> uuid.UUID | None:
    """A stock-request executor does not replace its immutable request owner."""
    if operation.domain != "stock_request":
        return operation.actor_employee_id
    effects = db.query(InventoryOperationEffect).filter(
        InventoryOperationEffect.operation_id == operation.operation_id,
        InventoryOperationEffect.effect_kind == InventoryOperationEffectKindEnum.WORKFLOW,
        InventoryOperationEffect.subject_type == "StockRequest",
        InventoryOperationEffect.role == "EXECUTION_STATUS",
    ).all()
    if len(effects) != 1:
        return None
    try:
        request_id = uuid.UUID(effects[0].subject_id)
    except ValueError:
        return None
    request = db.get(StockRequest, request_id)
    return request.requester_employee_id if request is not None else None
