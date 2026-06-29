"""Shipping request workflow service."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Iterable

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    BOM,
    DepartmentEnum,
    Inventory,
    Item,
    ShippingRequest,
    ShippingRequestBomLine,
    ShippingRequestChecklistLine,
    ShippingRequestCompanionLine,
    ShippingRequestEvent,
    ShippingRequestStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.repositories import item_repository
from app.services import inv_effect
from app.services import inventory as inventory_svc
from app.services.inv_calc import _sync_total
from app.utils.mes_code import next_serial_no

PREPARE_PHASE = "PREPARE"
PICKUP_PHASE = "PICKUP"


class ShippingError(ValueError):
    """Base shipping workflow error."""


def _get_request(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    req = db.query(ShippingRequest).filter(ShippingRequest.request_id == request_id).first()
    if req is None:
        raise ShippingError("출하 요청을 찾을 수 없습니다.")
    return req


def _get_item(db: Session, item_id: uuid.UUID) -> Item:
    item = item_repository.get(db, item_id)
    if item is None:
        raise ShippingError("품목을 찾을 수 없습니다.")
    return item


def _record_event(db: Session, req: ShippingRequest, event_type: str, message: str | None = None) -> None:
    db.add(ShippingRequestEvent(request_id=req.request_id, event_type=event_type, message=message))


def _direct_children(db: Session, parent_item_id: uuid.UUID) -> list[tuple[uuid.UUID, int, str]]:
    rows = (
        db.query(BOM)
        .filter(BOM.parent_item_id == parent_item_id)
        .order_by(BOM.bom_id)
        .all()
    )
    return [(row.child_item_id, int(row.quantity or 0), row.unit or "EA") for row in rows]


def _signature(rows: Iterable[tuple[uuid.UUID, int]]) -> tuple[tuple[str, int], ...]:
    return tuple(sorted((str(item_id), int(qty)) for item_id, qty in rows))


def _item_signature(db: Session, item_id: uuid.UUID) -> tuple[tuple[str, int], ...]:
    return _signature((child_id, qty) for child_id, qty, _ in _direct_children(db, item_id))


def _request_stage_lines(
    req: ShippingRequest,
    stage: str,
    *,
    included_only: bool = True,
) -> list[ShippingRequestBomLine]:
    return [
        line
        for line in req.bom_lines
        if line.parent_stage == stage and (not included_only or bool(line.included))
    ]


def _request_stage_signature(req: ShippingRequest, stage: str) -> tuple[tuple[str, int], ...]:
    return _signature((line.child_item_id, line.quantity) for line in _request_stage_lines(req, stage))


def _find_item_by_signature(
    db: Session,
    *,
    process_type_code: str,
    signature: tuple[tuple[str, int], ...],
) -> Item | None:
    candidates = (
        db.query(Item)
        .filter(Item.process_type_code == process_type_code, Item.deleted_at.is_(None))
        .order_by(Item.created_at.asc(), Item.item_name.asc())
        .all()
    )
    for candidate in candidates:
        if _item_signature(db, candidate.item_id) == signature:
            return candidate
    return None


def _default_lines_from_base_pf(db: Session, base_pf: Item) -> list[dict]:
    lines: list[dict] = []
    pf_children = _direct_children(db, base_pf.item_id)
    base_pa_id: uuid.UUID | None = None
    for idx, (child_id, qty, unit) in enumerate(pf_children):
        lines.append(
            {
                "parent_stage": "PF",
                "child_item_id": child_id,
                "quantity": qty,
                "unit": unit,
                "included": True,
                "origin": "DEFAULT",
                "sort_order": idx,
            }
        )
        child = _get_item(db, child_id)
        if child.process_type_code == "PA" and base_pa_id is None:
            base_pa_id = child_id
    if base_pa_id is not None:
        for idx, (child_id, qty, unit) in enumerate(_direct_children(db, base_pa_id)):
            lines.append(
                {
                    "parent_stage": "PA",
                    "child_item_id": child_id,
                    "quantity": qty,
                    "unit": unit,
                    "included": True,
                    "origin": "DEFAULT",
                    "sort_order": idx,
                }
            )
    return lines


def _normalize_bom_lines(db: Session, base_pf: Item, payload_lines: list[dict] | None) -> list[dict]:
    default_lines = _default_lines_from_base_pf(db, base_pf)
    if not payload_lines:
        return default_lines
    normalized: list[dict] = []
    for idx, raw in enumerate(payload_lines):
        stage = str(raw.get("parent_stage") or "PA").upper()
        if stage not in {"PA", "PF"}:
            raise ShippingError("BOM 라인의 parent_stage는 PA 또는 PF여야 합니다.")
        qty = int(raw.get("quantity") or 0)
        if qty <= 0:
            raise ShippingError("BOM 수량은 1 이상이어야 합니다.")
        child_id = raw.get("child_item_id")
        _get_item(db, child_id)
        normalized.append(
            {
                "parent_stage": stage,
                "child_item_id": child_id,
                "quantity": qty,
                "unit": raw.get("unit") or "EA",
                "included": bool(raw.get("included", True)),
                "origin": str(raw.get("origin") or "CUSTOM").upper(),
                "sort_order": int(raw.get("sort_order", idx)),
            }
        )
    if not any(line["parent_stage"] == "PF" for line in normalized):
        normalized.extend(line for line in default_lines if line["parent_stage"] == "PF")
    return normalized


def _replace_bom_lines(db: Session, req: ShippingRequest, lines: list[dict]) -> None:
    db.query(ShippingRequestBomLine).filter(
        ShippingRequestBomLine.request_id == req.request_id
    ).delete(synchronize_session=False)
    db.flush()
    seen: set[tuple[str, uuid.UUID]] = set()
    for idx, raw in enumerate(lines):
        key = (raw["parent_stage"], raw["child_item_id"])
        if key in seen:
            raise ShippingError("같은 단계 안에 동일 품목이 중복되어 있습니다.")
        seen.add(key)
        db.add(
            ShippingRequestBomLine(
                request_id=req.request_id,
                parent_stage=raw["parent_stage"],
                child_item_id=raw["child_item_id"],
                quantity=raw["quantity"],
                unit=raw.get("unit") or "EA",
                included=bool(raw.get("included", True)),
                origin=raw.get("origin") or "CUSTOM",
                sort_order=int(raw.get("sort_order", idx)),
            )
        )
    db.flush()


def _sync_checklist(db: Session, req: ShippingRequest) -> None:
    existing = {
        line.item_id: bool(line.checked)
        for line in db.query(ShippingRequestChecklistLine)
        .filter(ShippingRequestChecklistLine.request_id == req.request_id)
        .all()
    }
    db.query(ShippingRequestChecklistLine).filter(
        ShippingRequestChecklistLine.request_id == req.request_id
    ).delete(synchronize_session=False)
    db.flush()
    sort_order = 0
    seen: set[uuid.UUID] = set()
    for stage in ("PF", "PA"):
        for line in _request_stage_lines(req, stage):
            item = _get_item(db, line.child_item_id)
            if item.process_type_code == "AF" or item.item_id in seen:
                continue
            seen.add(item.item_id)
            db.add(
                ShippingRequestChecklistLine(
                    request_id=req.request_id,
                    item_id=item.item_id,
                    label_snapshot=item.item_name,
                    quantity=line.quantity,
                    checked=existing.get(item.item_id, False),
                    sort_order=sort_order,
                )
            )
            sort_order += 1
    db.flush()


def create_request(db: Session, payload: dict) -> ShippingRequest:
    base_pf = _get_item(db, payload["base_pf_item_id"])
    if base_pf.process_type_code != "PF":
        raise ShippingError("기준 품목은 PF여야 합니다.")
    req = ShippingRequest(
        base_pf_item_id=base_pf.item_id,
        requested_by_name=payload.get("requested_by_name"),
        custom_pa_name=payload.get("custom_pa_name"),
        custom_pf_name=payload.get("custom_pf_name"),
        notes=payload.get("notes"),
    )
    db.add(req)
    db.flush()
    _replace_bom_lines(db, req, _normalize_bom_lines(db, base_pf, payload.get("bom_lines")))
    db.refresh(req)
    _sync_checklist(db, req)
    _record_event(db, req, "REQUEST_CREATED", "출하 요청 생성")
    db.flush()
    return req


def update_request(db: Session, request_id: uuid.UUID, payload: dict) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status not in {ShippingRequestStatusEnum.REQUESTED, ShippingRequestStatusEnum.PREPARING}:
        raise ShippingError("준비 완료된 요청은 먼저 준비 완료 취소 후 수정할 수 있습니다.")
    if "requested_by_name" in payload:
        req.requested_by_name = payload.get("requested_by_name")
    if "custom_pa_name" in payload:
        req.custom_pa_name = payload.get("custom_pa_name")
    if "custom_pf_name" in payload:
        req.custom_pf_name = payload.get("custom_pf_name")
    if "notes" in payload:
        req.notes = payload.get("notes")
    if "bom_lines" in payload:
        _replace_bom_lines(db, req, _normalize_bom_lines(db, req.base_pf_item, payload.get("bom_lines")))
        db.refresh(req)
        _sync_checklist(db, req)
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "REQUEST_UPDATED", "출하 요청 수정")
    db.flush()
    return req


def send_to_prep(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.REQUESTED:
        raise ShippingError("요청 상태에서만 준비 중으로 전환할 수 있습니다.")
    req.status = ShippingRequestStatusEnum.PREPARING
    req.updated_at = datetime.utcnow()
    _sync_checklist(db, req)
    _record_event(db, req, "SENT_TO_PREP", "출하 준비 중 전환")
    db.flush()
    return req


def update_checklist(db: Session, request_id: uuid.UUID, checks: dict[uuid.UUID, bool]) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARING:
        raise ShippingError("준비 중 상태에서만 체크리스트를 수정할 수 있습니다. 준비 완료 후에는 먼저 준비 완료 취소가 필요합니다.")
    rows = (
        db.query(ShippingRequestChecklistLine)
        .filter(ShippingRequestChecklistLine.request_id == req.request_id)
        .all()
    )
    for row in rows:
        if row.item_id in checks:
            row.checked = bool(checks[row.item_id])
    req.updated_at = datetime.utcnow()
    db.flush()
    return req


def clear_checklist(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARING:
        raise ShippingError("준비 중 상태에서만 체크리스트를 전체 해제할 수 있습니다. 준비 완료 후에는 먼저 준비 완료 취소가 필요합니다.")
    db.query(ShippingRequestChecklistLine).filter(
        ShippingRequestChecklistLine.request_id == req.request_id
    ).update({"checked": False}, synchronize_session=False)
    db.flush()
    return req


def _create_item(db: Session, *, name: str, process_type_code: str, model_symbol: str | None) -> Item:
    duplicate = (
        db.query(Item)
        .filter(
            Item.item_name == name,
            Item.process_type_code == process_type_code,
            Item.deleted_at.is_(None),
        )
        .first()
    )
    if duplicate is not None:
        raise ShippingError(f"같은 이름의 {process_type_code} 품목이 이미 있습니다: {name}")
    next_sort = (db.query(func.max(Item.sort_order)).scalar() or 0) + 1
    item = Item(
        item_name=name,
        process_type_code=process_type_code,
        model_symbol=model_symbol or "",
        serial_no=next_serial_no(model_symbol or "", process_type_code, db),
        unit="EA",
        sort_order=next_sort,
    )
    db.add(item)
    db.flush()
    inventory_svc.get_or_create_inventory(db, item.item_id)
    return item


def _replace_item_bom(db: Session, parent: Item, lines: list[tuple[uuid.UUID, int, str]]) -> None:
    db.query(BOM).filter(BOM.parent_item_id == parent.item_id).delete(synchronize_session=False)
    db.flush()
    for child_id, qty, unit in lines:
        db.add(BOM(parent_item_id=parent.item_id, child_item_id=child_id, quantity=qty, unit=unit))
    parent.bom_completed_at = datetime.utcnow()
    db.flush()


def _pf_lines_with_final_pa(req: ShippingRequest, final_pa: Item) -> list[tuple[uuid.UUID, int, str]]:
    out: list[tuple[uuid.UUID, int, str]] = []
    replaced_pa = False
    for line in _request_stage_lines(req, "PF"):
        item = line.child_item
        if item is not None and item.process_type_code == "PA" and not replaced_pa:
            out.append((final_pa.item_id, int(line.quantity or 1), line.unit or "EA"))
            replaced_pa = True
        else:
            out.append((line.child_item_id, int(line.quantity), line.unit or "EA"))
    if not replaced_pa:
        out.insert(0, (final_pa.item_id, 1, "EA"))
    return out


def _stage_signature_from_lines(lines: list[dict], stage: str) -> tuple[tuple[str, int], ...]:
    return _signature(
        (line["child_item_id"], line["quantity"])
        for line in lines
        if line["parent_stage"] == stage and bool(line.get("included", True))
    )


def _pf_lines_with_final_pa_from_lines(db: Session, lines: list[dict], final_pa: Item) -> list[tuple[uuid.UUID, int, str]]:
    out: list[tuple[uuid.UUID, int, str]] = []
    replaced_pa = False
    for line in lines:
        if line["parent_stage"] != "PF" or not bool(line.get("included", True)):
            continue
        item = _get_item(db, line["child_item_id"])
        if item.process_type_code == "PA" and not replaced_pa:
            out.append((final_pa.item_id, int(line.get("quantity") or 1), line.get("unit") or "EA"))
            replaced_pa = True
        else:
            out.append((line["child_item_id"], int(line["quantity"]), line.get("unit") or "EA"))
    if not replaced_pa:
        out.insert(0, (final_pa.item_id, 1, "EA"))
    return out


def match_bom(db: Session, bom_lines: list[dict], base_pf_item_id: uuid.UUID) -> dict:
    base_pf = _get_item(db, base_pf_item_id)
    normalized = _normalize_bom_lines(db, base_pf, bom_lines)
    pa_sig = _stage_signature_from_lines(normalized, "PA")
    pa = _find_item_by_signature(db, process_type_code="PA", signature=pa_sig)
    pf = None
    if pa is not None:
        pf_sig = _signature((child_id, qty) for child_id, qty, _ in _pf_lines_with_final_pa_from_lines(db, normalized, pa))
        pf = _find_item_by_signature(db, process_type_code="PF", signature=pf_sig)
    return {
        "matched_pa_item_id": pa.item_id if pa else None,
        "matched_pf_item_id": pf.item_id if pf else None,
        "matched_pa_item_name": pa.item_name if pa else None,
        "matched_pf_item_name": pf.item_name if pf else None,
        "requires_pa_name": pa is None,
        "requires_pf_name": pf is None,
    }


def _resolve_or_create_pa(db: Session, req: ShippingRequest) -> Item:
    pa_lines = [(line.child_item_id, int(line.quantity), line.unit or "EA") for line in _request_stage_lines(req, "PA")]
    if not pa_lines:
        raise ShippingError("PA 구성 BOM이 비어 있습니다.")
    sig = _signature((child_id, qty) for child_id, qty, _ in pa_lines)
    found = _find_item_by_signature(db, process_type_code="PA", signature=sig)
    if found is not None:
        return found
    if not (req.custom_pa_name and req.custom_pa_name.strip()):
        raise ShippingError("동일 BOM이 없으므로 새 PA/PF 이름을 입력해야 합니다.")
    name = req.custom_pa_name
    pa = _create_item(db, name=name, process_type_code="PA", model_symbol=req.base_pf_item.model_symbol)
    _replace_item_bom(db, pa, pa_lines)
    return pa


def _resolve_or_create_pf(db: Session, req: ShippingRequest, final_pa: Item) -> Item:
    pf_lines = _pf_lines_with_final_pa(req, final_pa)
    sig = _signature((child_id, qty) for child_id, qty, _ in pf_lines)
    found = _find_item_by_signature(db, process_type_code="PF", signature=sig)
    if found is not None:
        return found
    if not (req.custom_pf_name and req.custom_pf_name.strip()):
        raise ShippingError("동일 BOM이 없으므로 새 PA/PF 이름을 입력해야 합니다.")
    name = req.custom_pf_name
    pf = _create_item(db, name=name, process_type_code="PF", model_symbol=req.base_pf_item.model_symbol)
    _replace_item_bom(db, pf, pf_lines)
    return pf


def _log_inventory_change(
    db: Session,
    *,
    item: Item,
    tx_type: TransactionTypeEnum,
    quantity_change: int,
    quantity_before: int,
    reference_no: str,
    produced_by: str | None,
    notes: str,
    before_cells: dict,
    request_id: uuid.UUID,
    phase: str,
) -> TransactionLog:
    inv = db.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=tx_type,
        quantity_change=quantity_change,
        quantity_before=quantity_before,
        quantity_after=int(inv.quantity or 0) if inv else None,
        warehouse_qty_before=before_cells.get(("warehouse", None, None), 0),
        warehouse_qty_after=int(inv.warehouse_qty or 0) if inv else None,
        reference_no=reference_no,
        produced_by=produced_by,
        notes=notes,
        inventory_effect=inv_effect.capture_effect(db, item.item_id, before_cells),
        shipping_request_id=request_id,
        shipping_phase=phase,
    )
    db.add(log)
    db.flush()
    return log


def _backflush_warehouse(
    db: Session,
    req: ShippingRequest,
    item: Item,
    qty: int,
    reference_no: str,
    notes: str,
) -> None:
    before = inv_effect.snapshot_cells(db, item.item_id)
    inv, qty_before = inventory_svc.consume_warehouse(db, item.item_id, Decimal(qty))
    _log_inventory_change(
        db,
        item=item,
        tx_type=TransactionTypeEnum.BACKFLUSH,
        quantity_change=-qty,
        quantity_before=int(qty_before),
        reference_no=reference_no,
        produced_by=req.requested_by_name,
        notes=notes,
        before_cells=before,
        request_id=req.request_id,
        phase=PREPARE_PHASE,
    )


def _produce_to_shipping_dept(db: Session, req: ShippingRequest, item: Item, reference_no: str, notes: str) -> None:
    inv = inventory_svc.get_or_create_inventory(db, item.item_id)
    before_total = int(inv.quantity or 0)
    before = inv_effect.snapshot_cells(db, item.item_id)
    inventory_svc.receive_confirmed(db, item.item_id, Decimal(1), bucket="production", dept=DepartmentEnum.SHIPPING)
    _log_inventory_change(
        db,
        item=item,
        tx_type=TransactionTypeEnum.PRODUCE,
        quantity_change=1,
        quantity_before=before_total,
        reference_no=reference_no,
        produced_by=req.requested_by_name,
        notes=notes,
        before_cells=before,
        request_id=req.request_id,
        phase=PREPARE_PHASE,
    )


def _consume_pa_from_shipping(db: Session, req: ShippingRequest, item: Item, qty: int, reference_no: str) -> None:
    inv = inventory_svc.get_or_create_inventory(db, item.item_id)
    before_total = int(inv.quantity or 0)
    before = inv_effect.snapshot_cells(db, item.item_id)
    inventory_svc.consume_from_department(db, item.item_id, Decimal(qty), DepartmentEnum.SHIPPING)
    _log_inventory_change(
        db,
        item=item,
        tx_type=TransactionTypeEnum.BACKFLUSH,
        quantity_change=-qty,
        quantity_before=before_total,
        reference_no=reference_no,
        produced_by=req.requested_by_name,
        notes=f"출하 준비 PF 생산 투입: {item.item_name} x {qty}",
        before_cells=before,
        request_id=req.request_id,
        phase=PREPARE_PHASE,
    )


def _produce_pf_to_warehouse(db: Session, req: ShippingRequest, item: Item, reference_no: str) -> None:
    inv = inventory_svc.get_or_create_inventory(db, item.item_id)
    before_total = int(inv.quantity or 0)
    before = inv_effect.snapshot_cells(db, item.item_id)
    inventory_svc.receive_confirmed(db, item.item_id, Decimal(1))
    _log_inventory_change(
        db,
        item=item,
        tx_type=TransactionTypeEnum.PRODUCE,
        quantity_change=1,
        quantity_before=before_total,
        reference_no=reference_no,
        produced_by=req.requested_by_name,
        notes=f"출하 준비 PF 완료: {item.item_name}",
        before_cells=before,
        request_id=req.request_id,
        phase=PREPARE_PHASE,
    )


def _replace_companions(db: Session, req: ShippingRequest, companion_lines: list[dict]) -> None:
    db.query(ShippingRequestCompanionLine).filter(
        ShippingRequestCompanionLine.request_id == req.request_id
    ).delete(synchronize_session=False)
    db.flush()
    for idx, raw in enumerate(companion_lines):
        qty = int(raw.get("quantity") or 0)
        if qty <= 0:
            raise ShippingError("동반 출하 품목 수량은 1 이상이어야 합니다.")
        item = _get_item(db, raw["item_id"])
        db.add(
            ShippingRequestCompanionLine(
                request_id=req.request_id,
                item_id=item.item_id,
                quantity=qty,
                unit=raw.get("unit") or item.unit or "EA",
                sort_order=idx,
            )
        )
    db.flush()


def prepare_complete(
    db: Session,
    request_id: uuid.UUID,
    *,
    companion_lines: list[dict],
) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARING:
        raise ShippingError("준비 중 상태에서만 준비 완료할 수 있습니다.")
    final_pa = _resolve_or_create_pa(db, req)
    final_pf = _resolve_or_create_pf(db, req, final_pa)
    req.final_pa_item_id = final_pa.item_id
    req.final_pf_item_id = final_pf.item_id
    reference_no = f"SHIP-{req.request_id.hex[:8]}"

    for line in _request_stage_lines(req, "PA"):
        child = _get_item(db, line.child_item_id)
        _backflush_warehouse(
            db,
            req,
            child,
            int(line.quantity),
            reference_no,
            f"출하 준비 PA 생산 투입: {child.item_name} x {int(line.quantity)}",
        )
    _produce_to_shipping_dept(db, req, final_pa, reference_no, f"출하 준비 PA 완료: {final_pa.item_name}")

    for child_id, qty, _unit in _pf_lines_with_final_pa(req, final_pa):
        child = _get_item(db, child_id)
        if child.item_id == final_pa.item_id:
            _consume_pa_from_shipping(db, req, child, qty, reference_no)
        else:
            _backflush_warehouse(
                db,
                req,
                child,
                qty,
                reference_no,
                f"출하 준비 PF 생산 투입: {child.item_name} x {qty}",
            )
    _produce_pf_to_warehouse(db, req, final_pf, reference_no)

    _replace_companions(db, req, companion_lines)
    req.status = ShippingRequestStatusEnum.PREPARED
    req.prepared_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "PREPARED", "출하 준비 완료")
    db.flush()
    return req


def prepare_cancel(db: Session, request_id: uuid.UUID, reason: str | None = None) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARED:
        raise ShippingError("준비 완료 상태에서만 취소할 수 있습니다.")
    logs = (
        db.query(TransactionLog)
        .filter(
            TransactionLog.shipping_request_id == req.request_id,
            TransactionLog.shipping_phase == PREPARE_PHASE,
            TransactionLog.cancelled.is_(False),
        )
        .order_by(TransactionLog.created_at.desc(), TransactionLog.log_id.desc())
        .all()
    )
    if not logs:
        raise ShippingError("취소할 준비 완료 입출고 로그가 없습니다.")
    for log in logs:
        inv_effect.apply_effect_reverse(db, log.item_id, log.inventory_effect)
        inv = db.query(Inventory).filter(Inventory.item_id == log.item_id).first()
        if inv is not None:
            _sync_total(db, inv)
        log.cancelled = True
        log.cancel_reason = reason or "출하 준비 완료 취소"
        log.cancelled_at = datetime.utcnow()
    req.status = ShippingRequestStatusEnum.PREPARING
    req.prepared_at = None
    req.final_pa_item_id = None
    req.final_pf_item_id = None
    req.updated_at = datetime.utcnow()
    db.query(ShippingRequestCompanionLine).filter(
        ShippingRequestCompanionLine.request_id == req.request_id
    ).delete(synchronize_session=False)
    _record_event(db, req, "PREPARE_CANCELLED", reason or "출하 준비 완료 취소")
    db.flush()
    return req


def _ship_from_warehouse(db: Session, req: ShippingRequest, item: Item, qty: int, notes: str) -> None:
    reference_no = f"SHIP-{req.request_id.hex[:8]}"
    before = inv_effect.snapshot_cells(db, item.item_id)
    inv, qty_before = inventory_svc.consume_warehouse(db, item.item_id, Decimal(qty))
    _log_inventory_change(
        db,
        item=item,
        tx_type=TransactionTypeEnum.SHIP,
        quantity_change=-qty,
        quantity_before=int(qty_before),
        reference_no=reference_no,
        produced_by=req.requested_by_name,
        notes=notes,
        before_cells=before,
        request_id=req.request_id,
        phase=PICKUP_PHASE,
    )


def pickup_complete(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARED:
        raise ShippingError("준비 완료 상태에서만 픽업 완료할 수 있습니다.")
    if req.final_pf_item is None:
        raise ShippingError("최종 PF가 정해지지 않았습니다.")
    _ship_from_warehouse(db, req, req.final_pf_item, 1, f"출하 픽업 완료: {req.final_pf_item.item_name}")
    for line in req.companion_lines:
        _ship_from_warehouse(db, req, line.item, int(line.quantity), f"출하 동반 품목: {line.item.item_name}")
    req.status = ShippingRequestStatusEnum.PICKED_UP
    req.picked_up_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "PICKED_UP", "배송업체 픽업 완료")
    db.flush()
    return req



