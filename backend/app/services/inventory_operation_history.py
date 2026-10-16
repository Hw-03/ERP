"""Shared read projection and proven item membership for operation history."""
from __future__ import annotations

import uuid
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models import (BusinessCorrection, BusinessCorrectionSource, DefectInventoryMovement,
    DefectStockMovement, DefectStockPool, InventoryOperation, InventoryOperationEffect,
    InventoryOperationKindEnum, InventoryScope, Item, ShippingAllocation, StocktakeApplication,
    StocktakeApplicationLine, TransactionLog)
from app.schemas import RequestOrderStockResponse, TransactionLogResponse
from app.routers.inventory._tx_filters import (_batch_name_map, _history_batch_response,
    _history_request_date_expr, _stock_request_info_map, _to_log_response)
from app.services import inventory_operation_cancellation as cancellation_svc
from app.services.request_order_stock import load_request_order_stock
from app.services.inventory_effect_history import load_inventory_effect_quantities


def item_operation_ids(db: Session, item_id: uuid.UUID) -> set[uuid.UUID]:
    """Use transaction, pool, observation and correction-source evidence only."""
    matching_ids = {
        operation_id for (operation_id,) in db.query(TransactionLog.operation_id).filter(
            TransactionLog.item_id == item_id, TransactionLog.operation_id.isnot(None)
        ).distinct().all()
    }
    matching_ids.update(operation_id for (operation_id,) in db.query(DefectStockMovement.operation_id).join(
        DefectStockPool, DefectStockPool.pool_id == DefectStockMovement.pool_id
    ).filter(DefectStockPool.item_id == item_id).distinct().all())
    matching_ids.update(operation_id for (operation_id,) in db.query(StocktakeApplication.operation_id).join(
        StocktakeApplicationLine, StocktakeApplicationLine.application_id == StocktakeApplication.application_id
    ).filter(StocktakeApplicationLine.item_id == item_id).distinct().all())
    correction_ids = {
        correction_id for (correction_id,) in db.query(BusinessCorrectionSource.correction_id).join(
            TransactionLog, TransactionLog.log_id == BusinessCorrectionSource.source_id
        ).filter(BusinessCorrectionSource.source_kind == "transaction", TransactionLog.item_id == item_id).all()
    }
    correction_ids.update(correction_id for (correction_id,) in db.query(BusinessCorrectionSource.correction_id).join(
        ShippingAllocation, ShippingAllocation.allocation_id == BusinessCorrectionSource.source_id
    ).filter(BusinessCorrectionSource.source_kind == "allocation", ShippingAllocation.item_id == item_id).all())
    correction_ids.update(correction_id for (correction_id,) in db.query(BusinessCorrectionSource.correction_id).join(
        DefectStockMovement, DefectStockMovement.movement_id == BusinessCorrectionSource.source_id
    ).join(DefectStockPool, DefectStockPool.pool_id == DefectStockMovement.pool_id).filter(
        BusinessCorrectionSource.source_kind == "pool_movement", DefectStockPool.item_id == item_id
    ).all())
    if matching_ids:
        correction_ids.update(correction_id for (correction_id,) in db.query(BusinessCorrectionSource.correction_id).filter(
            BusinessCorrectionSource.source_kind == "operation",
            BusinessCorrectionSource.source_id.in_(matching_ids),
        ).all())
    if correction_ids:
        matching_ids.update(operation_id for (operation_id,) in db.query(BusinessCorrection.application_operation_id).filter(
            BusinessCorrection.correction_id.in_(correction_ids),
            BusinessCorrection.application_operation_id.isnot(None),
        ).all())
    return matching_ids


def _correction_operation_ids(db: Session, correction: BusinessCorrection) -> list[str]:
    """Keep every proven workflow phase, including the active document operation."""
    source_ids = {str(source_id) for (source_id,) in db.query(BusinessCorrectionSource.source_id).filter(
        BusinessCorrectionSource.correction_id == correction.correction_id,
        BusinessCorrectionSource.source_kind.in_(["operation", "workflow_operation"]),
    ).all()}
    if correction.source_type == "InventoryOperation":
        source_ids.add(str(correction.source_id))
    return sorted(source_ids)


def _line_payload(
    log: TransactionLog,
    item: Item | None,
    *,
    movement_quantity: object | None = None,
    history_log: TransactionLogResponse | None = None,
) -> dict:
    transfer_qty = log.transfer_qty if log.transfer_qty is not None else movement_quantity
    return {
        "log_id": str(log.log_id),
        "item_id": str(log.item_id),
        "item_name": history_log.item_name if history_log else item.item_name if item else None,
        "mes_code": history_log.mes_code if history_log else item.mes_code if item else None,
        "transaction_type": log.transaction_type.value,
        "quantity_change": str(log.quantity_change),
        "quantity_before": (
            str(log.quantity_before) if log.quantity_before is not None else None
        ),
        "quantity_after": (
            str(log.quantity_after) if log.quantity_after is not None else None
        ),
        "transfer_qty": str(transfer_qty) if transfer_qty is not None else None,
        "department": log.department,
        "operation_role": log.operation_role.value if log.operation_role else None,
        "reverses_log_id": str(log.reverses_log_id) if log.reverses_log_id else None,
        "reference_no": log.reference_no,
        "notes": log.notes,
        "created_at": log.created_at,
        "history_log": history_log,
    }


def _history_log_map(
    db: Session,
    logs: list[TransactionLog],
    items: dict[uuid.UUID, Item],
    operation: InventoryOperation,
    reversal: InventoryOperation | None,
    request_order_stock: dict[uuid.UUID, RequestOrderStockResponse],
) -> dict[uuid.UUID, TransactionLogResponse]:
    """작업 행을 기존 거래 이력과 동일한 감사 응답으로 보강한다."""
    batch_map = _batch_name_map(
        db, {log.operation_batch_id for log in logs if log.operation_batch_id}
    )
    stock_request_map = _stock_request_info_map(
        db, {log.reference_no for log in logs if log.reference_no}
    )
    response_by_log_id: dict[uuid.UUID, TransactionLogResponse] = {}
    effect_quantities = load_inventory_effect_quantities(db, logs)
    for log in logs:
        item = items.get(log.item_id)
        if item is None:
            continue
        info = stock_request_map.get(log.reference_no) if log.reference_no else None
        if info is None:
            info = batch_map.get(log.operation_batch_id)
        response = _to_log_response(
            log,
            item,
            requester_name=info.requester_name if info else None,
            approver_name=info.approver_name if info else None,
            requested_at=info.requested_at if info else None,
            approved_at=info.approved_at if info else None,
            operation=operation,
            reversal=reversal,
            history_batch=_history_batch_response(batch_map.get(log.operation_batch_id)),
        )
        response.request_order_stock = request_order_stock.get(log.log_id)
        if log.log_id in effect_quantities:
            response.inventory_effect = effect_quantities[log.log_id]
        response_by_log_id[log.log_id] = response
    return response_by_log_id


def operation_payload(
    db: Session,
    operation: InventoryOperation,
    *,
    selected_item_id: uuid.UUID | None = None,
    request_order_stock: dict[uuid.UUID, RequestOrderStockResponse] | None = None,
) -> dict:
    logs = (
        db.query(TransactionLog)
        .filter(TransactionLog.operation_id == operation.operation_id)
        .order_by(TransactionLog.created_at.asc(), TransactionLog.log_id.asc())
        .all()
    )
    item_ids = {log.item_id for log in logs}
    items = {
        item.item_id: item
        for item in db.query(Item).filter(Item.item_id.in_(item_ids)).all()
    } if item_ids else {}
    reversal = (
        db.query(InventoryOperation)
        .filter(InventoryOperation.reverses_operation_id == operation.operation_id)
        .one_or_none()
    )
    effects = (
        db.query(InventoryOperationEffect)
        .filter(InventoryOperationEffect.operation_id == operation.operation_id)
        .order_by(
            InventoryOperationEffect.created_at.asc(),
            InventoryOperationEffect.effect_id.asc(),
        )
        .all()
    )
    movement_quantities = {
        item_id: abs(quantity)
        for item_id, quantity in (
            db.query(
                DefectInventoryMovement.item_id,
                func.sum(DefectInventoryMovement.quantity_delta),
            )
            .filter(DefectInventoryMovement.operation_id == operation.operation_id)
            .group_by(DefectInventoryMovement.item_id)
            .all()
        )
        if quantity is not None and quantity != 0
    }
    if operation.kind == InventoryOperationKindEnum.CANCELLATION:
        effective_status = "cancellation"
    elif reversal is not None:
        effective_status = "cancelled"
    else:
        effective_status = "active"
    if request_order_stock is None:
        request_order_stock = load_request_order_stock(
            db,
            item_ids,
            request_date_expr=_history_request_date_expr(),
            target_log_ids={log.log_id for log in logs},
        )
    history_logs = _history_log_map(
        db,
        logs,
        items,
        operation,
        reversal,
        request_order_stock,
    )
    matching_lines = [
        _line_payload(
            log,
            items.get(log.item_id),
            movement_quantity=movement_quantities.get(log.item_id),
            history_log=history_logs.get(log.log_id),
        )
        for log in logs
        if selected_item_id is None or log.item_id == selected_item_id
    ]
    observations = (
        db.query(StocktakeApplicationLine, StocktakeApplication, Item)
        .join(StocktakeApplication, StocktakeApplication.application_id == StocktakeApplicationLine.application_id)
        .join(Item, Item.item_id == StocktakeApplicationLine.item_id)
        .filter(StocktakeApplication.operation_id == operation.operation_id)
        .order_by(StocktakeApplicationLine.scope_key, StocktakeApplicationLine.item_id)
        .all()
    )
    observation_lines = [
        {
            "row_type": "STOCKTAKE_OBSERVATION",
            "application_id": str(application.application_id),
            "count_id": str(line.count_id),
            "confirmation_revision_id": str(line.confirmation_revision_id),
            "item_id": str(line.item_id),
            "item_name": item.item_name,
            "mes_code": item.mes_code,
            "scope_key": line.scope_key,
            "before_quantities": line.before_quantities,
            "after_quantities": line.after_quantities,
            "reservations": line.reservations,
            "observation_epoch_before": line.observation_epoch_before,
            "observation_epoch_after": line.observation_epoch_after,
        }
        for line, application, item in observations
    ]
    correction = db.query(BusinessCorrection).filter_by(application_operation_id=operation.operation_id).one_or_none()
    source_operation_ids = _correction_operation_ids(db, correction) if correction is not None else []
    source_operation_id = source_operation_ids[0] if len(source_operation_ids) == 1 else None
    try:
        cancel_plan = cancellation_svc.preview_cancellation(
            db,
            operation.operation_id,
        )
        can_cancel = cancel_plan.can_cancel
        cancel_blockers = list(cancel_plan.blockers)
    except cancellation_svc.CancellationError as exc:
        can_cancel = False
        cancel_blockers = [str(exc)]
    return {
        "operation_id": str(operation.operation_id),
        "kind": operation.kind.value,
        "domain": operation.domain,
        "action": operation.action,
        "display_label": operation.display_label,
        "effective_status": effective_status,
        "actor_employee_id": (
            str(operation.actor_employee_id) if operation.actor_employee_id else None
        ),
        "actor_name": operation.actor_name,
        "department": operation.department,
        "reason": operation.reason,
        "effective_at": operation.effective_at,
        "reverses_operation_id": (
            str(operation.reverses_operation_id)
            if operation.reverses_operation_id
            else None
        ),
        "reversal_operation_id": str(reversal.operation_id) if reversal else None,
        "can_cancel": can_cancel,
        "cancel_blockers": cancel_blockers,
        "lines": [
            _line_payload(
                log,
                items.get(log.item_id),
                movement_quantity=movement_quantities.get(log.item_id),
                history_log=history_logs.get(log.log_id),
            )
            for log in logs
        ],
        "matching_lines": matching_lines,
        "observation_lines": observation_lines,
        "matching_observation_lines": [
            line for line in observation_lines
            if selected_item_id is None or line["item_id"] == str(selected_item_id)
        ],
        "business_correction": (
            {
                "correction_id": str(correction.correction_id),
                "source_type": correction.source_type,
                "source_id": str(correction.source_id),
                "source_operation_id": source_operation_id,
                "source_operation_ids": source_operation_ids,
            }
            if correction is not None else None
        ),
        "pool_movements": [
            {"movement_id": str(movement.movement_id), "pool_id": str(pool.pool_id),
             "item_id": str(pool.item_id), "scope_key": pool.scope_key, "category": pool.category,
             "item_name": item.item_name, "mes_code": item.mes_code,
             "physical_department": scope.physical_department,
             "delta": int(movement.delta), "before_quantity": int(movement.before_quantity),
             "after_quantity": int(movement.after_quantity), "reason": movement.reason}
            for movement, pool, item, scope in db.query(DefectStockMovement, DefectStockPool, Item, InventoryScope).join(
                DefectStockPool, DefectStockPool.pool_id == DefectStockMovement.pool_id,
            ).join(Item, Item.item_id == DefectStockPool.item_id).join(
                InventoryScope, InventoryScope.scope_key == DefectStockPool.scope_key,
            ).filter(DefectStockMovement.operation_id == operation.operation_id).order_by(
                DefectStockMovement.effect_ordinal).all()
        ],
        "effects": [
            {
                "effect_id": str(effect.effect_id),
                "effect_kind": effect.effect_kind.value,
                "subject_type": effect.subject_type,
                "subject_id": effect.subject_id,
                "role": effect.role,
                "before_state": effect.before_state,
                "after_state": effect.after_state,
                "reverses_effect_id": (
                    str(effect.reverses_effect_id)
                    if effect.reverses_effect_id
                    else None
                ),
            }
            for effect in effects
        ],
    }
