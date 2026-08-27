"""품목 소프트 삭제 전에 활성 업무 참조를 수집한다."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    BOM,
    DefectQuarantineRecord,
    HandoverDoc,
    HandoverLine,
    HandoverStatusEnum,
    IoBatch,
    IoBundle,
    IoLine,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestBomLine,
    ShippingRequestChecklistLine,
    ShippingRequestCompanionLine,
    ShippingRequestStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
)


ACTIVE_IO_STATUSES = frozenset(
    {"draft", "submitted", "reserved", "partially_completed"}
)
ACTIVE_STOCK_REQUEST_STATUSES = frozenset(
    {
        StockRequestStatusEnum.DRAFT,
        StockRequestStatusEnum.SUBMITTED,
        StockRequestStatusEnum.RESERVED,
    }
)
ACTIVE_HANDOVER_STATUSES = frozenset(
    {
        HandoverStatusEnum.DRAFT,
        HandoverStatusEnum.SUBMITTED,
    }
)
ACTIVE_SHIPPING_STATUSES = frozenset(
    {
        ShippingRequestStatusEnum.PREPARING,
        ShippingRequestStatusEnum.PREPARED,
        ShippingRequestStatusEnum.PICKED_UP,
    }
)


def _status_value(value: Any) -> str:
    return str(getattr(value, "value", value))


def active_item_references(
    db: Session,
    item_id: uuid.UUID,
) -> tuple[int, list[dict[str, str]]]:
    """삭제를 막는 참조 전체 수와 안정 정렬된 앞 50개를 반환한다."""
    references: dict[tuple[str, str, str], dict[str, str]] = {}

    def add(kind: str, owner_id: uuid.UUID, status: Any) -> None:
        ref = {
            "kind": kind,
            "id": str(owner_id),
            "status": _status_value(status),
        }
        references[(ref["kind"], ref["id"], ref["status"])] = ref

    io_source_rows = (
        db.query(IoBatch.batch_id, IoBatch.status)
        .join(IoBundle, IoBundle.batch_id == IoBatch.batch_id)
        .filter(
            IoBatch.status.in_(ACTIVE_IO_STATUSES),
            IoBundle.source_item_id == item_id,
        )
        .all()
    )
    io_line_rows = (
        db.query(IoBatch.batch_id, IoBatch.status)
        .join(IoBundle, IoBundle.batch_id == IoBatch.batch_id)
        .join(IoLine, IoLine.bundle_id == IoBundle.bundle_id)
        .filter(
            IoBatch.status.in_(ACTIVE_IO_STATUSES),
            IoLine.item_id == item_id,
        )
        .all()
    )
    for owner_id, status in (*io_source_rows, *io_line_rows):
        add("io_batch", owner_id, status)

    stock_rows = (
        db.query(StockRequest.request_id, StockRequest.status)
        .join(
            StockRequestLine,
            StockRequestLine.request_id == StockRequest.request_id,
        )
        .filter(
            StockRequest.status.in_(ACTIVE_STOCK_REQUEST_STATUSES),
            StockRequestLine.item_id == item_id,
        )
        .all()
    )
    for owner_id, status in stock_rows:
        add("stock_request", owner_id, status)

    handover_rows = (
        db.query(HandoverDoc.handover_id, HandoverDoc.status)
        .join(HandoverLine, HandoverLine.handover_id == HandoverDoc.handover_id)
        .filter(
            HandoverDoc.status.in_(ACTIVE_HANDOVER_STATUSES),
            HandoverLine.item_id == item_id,
        )
        .all()
    )
    for owner_id, status in handover_rows:
        add("handover", owner_id, status)

    defect_rows = (
        db.query(DefectQuarantineRecord.record_id)
        .filter(
            DefectQuarantineRecord.item_id == item_id,
            DefectQuarantineRecord.remaining_quantity > 0,
        )
        .all()
    )
    for (owner_id,) in defect_rows:
        add("defect_quarantine", owner_id, "active")

    shipping_direct_fields = (
        ("shipping_base", ShippingRequest.base_pf_item_id),
        ("shipping_final_pa", ShippingRequest.final_pa_item_id),
        ("shipping_final_pf", ShippingRequest.final_pf_item_id),
        ("shipping_reuse", ShippingRequest.reuse_pf_item_id),
    )
    for kind, field in shipping_direct_fields:
        rows = (
            db.query(ShippingRequest.request_id, ShippingRequest.status)
            .filter(
                ShippingRequest.status.in_(ACTIVE_SHIPPING_STATUSES),
                field == item_id,
            )
            .all()
        )
        for owner_id, status in rows:
            add(kind, owner_id, status)

    shipping_relation_fields = (
        ("shipping_bom", ShippingRequestBomLine, ShippingRequestBomLine.child_item_id),
        (
            "shipping_companion",
            ShippingRequestCompanionLine,
            ShippingRequestCompanionLine.item_id,
        ),
        (
            "shipping_allocation",
            ShippingAllocation,
            ShippingAllocation.item_id,
        ),
        (
            "shipping_checklist",
            ShippingRequestChecklistLine,
            ShippingRequestChecklistLine.item_id,
        ),
    )
    for kind, relation_model, item_field in shipping_relation_fields:
        rows = (
            db.query(ShippingRequest.request_id, ShippingRequest.status)
            .join(
                relation_model,
                relation_model.request_id == ShippingRequest.request_id,
            )
            .filter(
                ShippingRequest.status.in_(ACTIVE_SHIPPING_STATUSES),
                item_field == item_id,
            )
            .all()
        )
        for owner_id, status in rows:
            add(kind, owner_id, status)

    for bom_id, parent_item_id, child_item_id in db.query(
        BOM.bom_id,
        BOM.parent_item_id,
        BOM.child_item_id,
    ).filter(
        (BOM.parent_item_id == item_id) | (BOM.child_item_id == item_id)
    ).all():
        if parent_item_id == item_id:
            add("bom_parent", bom_id, "active")
        if child_item_id == item_id:
            add("bom_child", bom_id, "active")

    ordered = [references[key] for key in sorted(references)]
    return len(ordered), ordered[:50]
