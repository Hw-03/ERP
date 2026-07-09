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
    ShippingAllocation,
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
COMPONENT_CHANGE_PHASE = "COMPONENT_CHANGE"
ALLOCATION_RESERVED = "RESERVED"
ALLOCATION_RELEASED = "RELEASED"
ALLOCATION_CONSUMED = "CONSUMED"
ITEM_CONVERSION_ALLOWED_PROCESS_TYPES = {"PA", "AF", "AA"}


class ShippingError(ValueError):
    """Base shipping workflow error."""


def _get_request(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    req = db.query(ShippingRequest).filter(ShippingRequest.request_id == request_id).first()
    if req is None:
        raise ShippingError("異쒗븯 ?붿껌??李얠쓣 ???놁뒿?덈떎.")
    return req


def _get_item(db: Session, item_id: uuid.UUID) -> Item:
    item = item_repository.get(db, item_id)
    if item is None:
        raise ShippingError("?덈ぉ??李얠쓣 ???놁뒿?덈떎.")
    return item


def _record_event(db: Session, req: ShippingRequest, event_type: str, message: str | None = None) -> None:
    db.add(ShippingRequestEvent(request_id=req.request_id, event_type=event_type, message=message))


def _request_quantity(req: ShippingRequest) -> int:
    qty = int(req.request_quantity or 1)
    if qty <= 0:
        raise ShippingError("출하 요청 수량은 1 이상이어야 합니다.")
    return qty


def _payload_request_quantity(payload: dict) -> int:
    qty = int(payload.get("request_quantity") or 1)
    if qty <= 0:
        raise ShippingError("출하 요청 수량은 1 이상이어야 합니다.")
    return qty


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
            raise ShippingError("BOM ?쇱씤??parent_stage??PA ?먮뒗 PF?ъ빞 ?⑸땲??")
        qty = int(raw.get("quantity") or 0)
        if qty <= 0:
            raise ShippingError("BOM ?섎웾? 1 ?댁긽?댁뼱???⑸땲??")
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
            raise ShippingError("媛숈? ?④퀎 ?덉뿉 ?숈씪 ?덈ぉ??以묐났?섏뼱 ?덉뒿?덈떎.")
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
        raise ShippingError("湲곗? ?덈ぉ? PF?ъ빞 ?⑸땲??")
    req = ShippingRequest(
        base_pf_item_id=base_pf.item_id,
        request_quantity=_payload_request_quantity(payload),
        requested_by_name=payload.get("requested_by_name"),
        custom_pa_name=payload.get("custom_pa_name"),
        custom_pf_name=payload.get("custom_pf_name"),
        notes=payload.get("notes"),
    )
    db.add(req)
    db.flush()
    _replace_bom_lines(db, req, _normalize_bom_lines(db, base_pf, payload.get("bom_lines")))
    if payload.get("companion_lines") is not None:
        _replace_companions(db, req, payload.get("companion_lines") or [])
    db.refresh(req)
    _resolve_final_items(db, req)
    db.refresh(req)
    _sync_checklist(db, req)
    _record_event(db, req, "REQUEST_CREATED", "異쒗븯 ?붿껌 ?앹꽦")
    db.flush()
    return req


def update_request(db: Session, request_id: uuid.UUID, payload: dict) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status not in {ShippingRequestStatusEnum.REQUESTED, ShippingRequestStatusEnum.PREPARING}:
        raise ShippingError("以鍮??꾨즺???붿껌? 癒쇱? 以鍮??꾨즺 痍⑥냼 ???섏젙?????덉뒿?덈떎.")
    if "request_quantity" in payload:
        req.request_quantity = _payload_request_quantity(payload)
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
    if "companion_lines" in payload:
        _replace_companions(db, req, payload.get("companion_lines") or [])
    db.refresh(req)
    _resolve_final_items(db, req)
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "REQUEST_UPDATED", "異쒗븯 ?붿껌 ?섏젙")
    db.flush()
    return req



def delete_request(db: Session, request_id: uuid.UUID) -> None:
    req = _get_request(db, request_id)
    if req.status not in {ShippingRequestStatusEnum.REQUESTED, ShippingRequestStatusEnum.PREPARING}:
        raise ShippingError("?붿껌 ?먮뒗 以鍮?以??곹깭?먯꽌留?異쒗븯 ?붿껌??痍⑥냼?????덉뒿?덈떎.")
    db.delete(req)
    db.flush()

def send_to_prep(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.REQUESTED:
        raise ShippingError("?붿껌 ?곹깭?먯꽌留?以鍮?以묒쑝濡??꾪솚?????덉뒿?덈떎.")
    req.status = ShippingRequestStatusEnum.PREPARING
    req.updated_at = datetime.utcnow()
    _sync_checklist(db, req)
    _record_event(db, req, "SENT_TO_PREP", "異쒗븯 以鍮?以??꾪솚")
    db.flush()
    return req


def update_checklist(db: Session, request_id: uuid.UUID, checks: dict[uuid.UUID, bool]) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARING:
        raise ShippingError("以鍮?以??곹깭?먯꽌留?泥댄겕由ъ뒪?몃? ?섏젙?????덉뒿?덈떎. 以鍮??꾨즺 ?꾩뿉??癒쇱? 以鍮??꾨즺 痍⑥냼媛 ?꾩슂?⑸땲??")
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
        raise ShippingError("以鍮?以??곹깭?먯꽌留?泥댄겕由ъ뒪?몃? ?꾩껜 ?댁젣?????덉뒿?덈떎. 以鍮??꾨즺 ?꾩뿉??癒쇱? 以鍮??꾨즺 痍⑥냼媛 ?꾩슂?⑸땲??")
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
        raise ShippingError(f"媛숈? ?대쫫??{process_type_code} ?덈ぉ???대? ?덉뒿?덈떎: {name}")
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
        raise ShippingError("PA 援ъ꽦 BOM??鍮꾩뼱 ?덉뒿?덈떎.")
    sig = _signature((child_id, qty) for child_id, qty, _ in pa_lines)
    found = _find_item_by_signature(db, process_type_code="PA", signature=sig)
    if found is not None:
        return found
    if not (req.custom_pa_name and req.custom_pa_name.strip()):
        raise ShippingError("?숈씪 BOM???놁쑝誘濡???PA/PF ?대쫫???낅젰?댁빞 ?⑸땲??")
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
        raise ShippingError("?숈씪 BOM???놁쑝誘濡???PA/PF ?대쫫???낅젰?댁빞 ?⑸땲??")
    name = req.custom_pf_name
    pf = _create_item(db, name=name, process_type_code="PF", model_symbol=req.base_pf_item.model_symbol)
    _replace_item_bom(db, pf, pf_lines)
    return pf


def _resolve_final_items(db: Session, req: ShippingRequest) -> tuple[Item, Item]:
    final_pa = _resolve_or_create_pa(db, req)
    final_pf = _resolve_or_create_pf(db, req, final_pa)
    req.final_pa_item_id = final_pa.item_id
    req.final_pf_item_id = final_pf.item_id
    db.flush()
    return final_pa, final_pf


def _require_final_items(db: Session, req: ShippingRequest) -> tuple[Item, Item]:
    if req.final_pa_item is None or req.final_pf_item is None:
        return _resolve_final_items(db, req)
    return req.final_pa_item, req.final_pf_item


def _active_allocation_quantity(db: Session, item_id: uuid.UUID) -> int:
    total = (
        db.query(func.coalesce(func.sum(ShippingAllocation.quantity), 0))
        .filter(
            ShippingAllocation.item_id == item_id,
            ShippingAllocation.status == ALLOCATION_RESERVED,
        )
        .scalar()
    )
    return int(total or 0)


def _active_allocations_for_request(db: Session, req: ShippingRequest) -> list[ShippingAllocation]:
    return (
        db.query(ShippingAllocation)
        .filter(
            ShippingAllocation.request_id == req.request_id,
            ShippingAllocation.status == ALLOCATION_RESERVED,
        )
        .order_by(ShippingAllocation.created_at.asc(), ShippingAllocation.allocation_id.asc())
        .all()
    )


def _item_location_available_after_shipping_allocations(db: Session, item: Item) -> tuple[DepartmentEnum, int, int]:
    dept, current = inventory_svc.item_department_stock(db, item)
    reserved = _active_allocation_quantity(db, item.item_id)
    return dept, int(current or 0), int(current or 0) - reserved


def _require_item_location_available(db: Session, item: Item, required: int) -> DepartmentEnum:
    dept, current, available = _item_location_available_after_shipping_allocations(db, item)
    if available < required:
        code = item.mes_code or str(item.item_id)
        raise ShippingError(
            f"?? ?? ?? ??: {code} / {item.item_name} / ?? {dept.value} / "
            f"?? {current} / ?? {_active_allocation_quantity(db, item.item_id)} / ?? {available} / ?? {required}"
        )
    return dept


def prepare_stock_shortages(db: Session, req: ShippingRequest) -> list[dict]:
    if req.status != ShippingRequestStatusEnum.PREPARING:
        return []
    try:
        request_qty = _request_quantity(req)
        final_pa, _final_pf = _require_final_items(db, req)
    except ShippingError:
        return []

    checks_by_item: dict[uuid.UUID, tuple[Item, int, str]] = {}

    def add_check(item: Item, required: int, phase: str = PREPARE_PHASE) -> None:
        if required <= 0:
            return
        existing = checks_by_item.get(item.item_id)
        if existing is None:
            checks_by_item[item.item_id] = (item, required, phase)
        else:
            checks_by_item[item.item_id] = (item, existing[1] + required, phase)

    add_check(final_pa, request_qty)
    for line in req.bom_lines:
        if not line.included or line.child_item_id == final_pa.item_id:
            continue
        add_check(line.child_item, int(line.quantity or 0) * request_qty)
    for line in req.companion_lines:
        qty = int(line.quantity or 0)
        add_check(line.item, qty)

    shortages: list[dict] = []
    for item, required, phase in checks_by_item.values():
        dept, current, available = _item_location_available_after_shipping_allocations(db, item)
        allocated = max(current - available, 0)
        shortage = max(required - available, 0)
        if shortage <= 0:
            continue
        shortages.append(
            {
                "item_id": item.item_id,
                "item_name": item.item_name,
                "mes_code": item.mes_code,
                "process_type_code": item.process_type_code,
                "department": dept.value,
                "required_quantity": required,
                "current_quantity": current,
                "allocated_quantity": allocated,
                "available_quantity": available,
                "shortage_quantity": shortage,
                "phase": phase,
            }
        )
    return shortages


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
    department: DepartmentEnum | None = None,
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
        department=department.value if department is not None else None,
    )
    db.add(log)
    db.flush()
    return log


def _backflush_item_location(
    db: Session,
    req: ShippingRequest,
    item: Item,
    qty: int,
    reference_no: str,
    notes: str,
    phase: str = PREPARE_PHASE,
) -> None:
    before = inv_effect.snapshot_cells(db, item.item_id)
    inv, qty_before, dept = inventory_svc.consume_from_item_department(db, item, Decimal(qty))
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
        phase=phase,
        department=dept,
    )


def _produce_to_item_location(
    db: Session,
    req: ShippingRequest,
    item: Item,
    qty: int,
    reference_no: str,
    notes: str,
    phase: str = PREPARE_PHASE,
    tx_type: TransactionTypeEnum = TransactionTypeEnum.PRODUCE,
) -> None:
    before = inv_effect.snapshot_cells(db, item.item_id)
    inv, qty_before, dept = inventory_svc.receive_to_item_department(db, item, Decimal(qty))
    _log_inventory_change(
        db,
        item=item,
        tx_type=tx_type,
        quantity_change=qty,
        quantity_before=int(qty_before),
        reference_no=reference_no,
        produced_by=req.requested_by_name,
        notes=notes,
        before_cells=before,
        request_id=req.request_id,
        phase=phase,
        department=dept,
    )


def _consume_pa_from_item_location(db: Session, req: ShippingRequest, item: Item, qty: int, reference_no: str) -> None:
    before = inv_effect.snapshot_cells(db, item.item_id)
    inv, qty_before, dept = inventory_svc.consume_from_item_department(db, item, Decimal(qty))
    _log_inventory_change(
        db,
        item=item,
        tx_type=TransactionTypeEnum.BACKFLUSH,
        quantity_change=-qty,
        quantity_before=int(qty_before),
        reference_no=reference_no,
        produced_by=req.requested_by_name,
        notes=f"異쒗븯 以鍮?PF ?앹궛 ?ъ엯: {item.item_name} x {qty}",
        before_cells=before,
        request_id=req.request_id,
        phase=PREPARE_PHASE,
        department=dept,
    )


def _produce_pf_to_item_location(db: Session, req: ShippingRequest, item: Item, qty: int, reference_no: str) -> None:
    _produce_to_item_location(db, req, item, qty, reference_no, f"출하 준비 PF 완료: {item.item_name} x {qty}")


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


def _bom_qty_map(rows: list[tuple[uuid.UUID, int, str]]) -> dict[uuid.UUID, tuple[int, str]]:
    out: dict[uuid.UUID, tuple[int, str]] = {}
    for item_id, qty, unit in rows:
        out[item_id] = (out.get(item_id, (0, unit))[0] + int(qty), unit or "EA")
    return out


def _expanded_leaf_qty_map(
    db: Session,
    item_id: uuid.UUID,
    *,
    multiplier: int = 1,
    seen: tuple[uuid.UUID, ...] = (),
) -> dict[uuid.UUID, tuple[int, str]]:
    if item_id in seen:
        item = _get_item(db, item_id)
        raise ShippingError(f"BOM 순환 참조가 있어 품목 전환을 할 수 없습니다: {item.item_name}")
    children = _direct_children(db, item_id)
    if not children:
        item = _get_item(db, item_id)
        return {item_id: (int(multiplier), item.unit or "EA")}
    out: dict[uuid.UUID, tuple[int, str]] = {}
    for child_id, qty, unit in children:
        child_children = _direct_children(db, child_id)
        if not child_children:
            out[child_id] = (out.get(child_id, (0, unit))[0] + int(qty) * multiplier, unit or "EA")
            continue
        nested = _expanded_leaf_qty_map(
            db,
            child_id,
            multiplier=int(qty) * multiplier,
            seen=seen + (item_id,),
        )
        for nested_id, (nested_qty, nested_unit) in nested.items():
            out[nested_id] = (out.get(nested_id, (0, nested_unit))[0] + nested_qty, nested_unit)
    return out


def _item_has_bom(db: Session, item_id: uuid.UUID) -> bool:
    return bool(_direct_children(db, item_id))


def _component_change_lines(db: Session, source_pa: Item, target_pa: Item, quantity: int) -> list[dict]:
    source_map = _expanded_leaf_qty_map(db, source_pa.item_id)
    target_map = _expanded_leaf_qty_map(db, target_pa.item_id)
    item_ids = sorted(set(source_map) | set(target_map), key=lambda item_id: _get_item(db, item_id).item_name)
    lines: list[dict] = []
    for item_id in item_ids:
        item = _get_item(db, item_id)
        source_qty, source_unit = source_map.get(item_id, (0, item.unit or "EA"))
        target_qty, target_unit = target_map.get(item_id, (0, item.unit or "EA"))
        delta = int(target_qty) - int(source_qty)
        total_delta = delta * quantity
        dept, current, available = _item_location_available_after_shipping_allocations(db, item)
        shortage = max(total_delta - available, 0) if total_delta > 0 else 0
        if total_delta == 0:
            continue
        lines.append(
            {
                "item_id": item.item_id,
                "item_name": item.item_name,
                "mes_code": item.mes_code,
                "process_type_code": item.process_type_code,
                "source_quantity": int(source_qty),
                "target_quantity": int(target_qty),
                "delta_per_unit": delta,
                "total_delta": total_delta,
                "unit": target_unit or source_unit or item.unit or "EA",
                "department": dept.value,
                "current_quantity": current,
                "available_quantity": available,
                "shortage_quantity": shortage,
                "line_kind": "consume" if total_delta > 0 else "recover",
            }
        )
    return lines


def _component_change_preview_core(
    db: Session,
    source_pa_item_id: uuid.UUID,
    target_pa_item_id: uuid.UUID,
    quantity: int,
    request_id: uuid.UUID | None = None,
    requested_mode: str | None = "BOM",
) -> dict:
    explicit_requested_mode = requested_mode is not None and str(requested_mode).strip() != ""
    normalized_requested_mode = str(requested_mode).upper() if explicit_requested_mode else None
    if normalized_requested_mode is not None and normalized_requested_mode not in {"SPEC", "BOM"}:
        raise ShippingError("품목 전환 방식은 SPEC 또는 BOM이어야 합니다.")
    if quantity <= 0:
        raise ShippingError("변경 수량은 1 이상이어야 합니다.")
    source_pa = _get_item(db, source_pa_item_id)
    target_pa = _get_item(db, target_pa_item_id)
    if source_pa.item_id == target_pa.item_id:
        raise ShippingError("소스 품목과 대상 품목은 달라야 합니다.")
    if source_pa.process_type_code not in ITEM_CONVERSION_ALLOWED_PROCESS_TYPES:
        raise ShippingError("품목 전환은 PA, AF, AA 품목만 가능합니다.")
    if target_pa.process_type_code not in ITEM_CONVERSION_ALLOWED_PROCESS_TYPES:
        raise ShippingError("품목 전환은 PA, AF, AA 품목만 가능합니다.")
    if source_pa.process_type_code != target_pa.process_type_code:
        raise ShippingError("소스와 대상은 같은 품목 단계끼리만 전환할 수 있습니다.")
    if not _item_has_bom(db, source_pa.item_id) or not _item_has_bom(db, target_pa.item_id):
        raise ShippingError("소스와 대상은 모두 BOM이 등록된 품목이어야 합니다.")
    source_dept, source_current, source_available = _item_location_available_after_shipping_allocations(db, source_pa)
    lines = _component_change_lines(db, source_pa, target_pa, quantity)
    resolved_mode = "BOM" if lines else "SPEC"
    response_requested_mode = normalized_requested_mode or resolved_mode
    source_shortage = max(quantity - source_available, 0)
    line_shortages = [line for line in lines if line["shortage_quantity"] > 0]
    blocking_reason = None
    if normalized_requested_mode == "SPEC" and resolved_mode == "BOM":
        blocking_reason = "BOM 차이가 있어 사양 전환으로 처리할 수 없습니다. 구성 전환으로 진행하세요."
    elif source_shortage > 0:
        blocking_reason = "소스 품목 재고가 부족합니다."
    elif line_shortages:
        blocking_reason = "추가 구성품 재고가 부족합니다."
    return {
        "request_id": request_id,
        "requested_mode": response_requested_mode,
        "resolved_mode": resolved_mode,
        "executable": blocking_reason is None,
        "blocking_reason": blocking_reason,
        "source_item_id": source_pa.item_id,
        "source_item_name": source_pa.item_name,
        "source_mes_code": source_pa.mes_code,
        "target_item_id": target_pa.item_id,
        "target_item_name": target_pa.item_name,
        "target_mes_code": target_pa.mes_code,
        "quantity": quantity,
        "source_department": source_dept.value,
        "source_current_quantity": source_current,
        "source_available_quantity": source_available,
        "source_shortage_quantity": source_shortage,
        "lines": lines,
    }


def component_change_preview(
    db: Session,
    request_id: uuid.UUID,
    source_pa_item_id: uuid.UUID,
    quantity: int,
    requested_mode: str | None = "BOM",
) -> dict:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARING:
        raise ShippingError("준비 중 요청에서만 구성품 변경을 할 수 있습니다.")
    final_pa, _final_pf = _require_final_items(db, req)
    return _component_change_preview_core(db, source_pa_item_id, final_pa.item_id, quantity, req.request_id, requested_mode)


def component_change_preview_independent(
    db: Session,
    source_pa_item_id: uuid.UUID,
    target_pa_item_id: uuid.UUID,
    quantity: int,
    requested_mode: str | None = "BOM",
) -> dict:
    return _component_change_preview_core(db, source_pa_item_id, target_pa_item_id, quantity, requested_mode=requested_mode)


def _backflush_component_location(
    db: Session,
    item: Item,
    qty: int,
    reference_no: str,
    notes: str,
    request_id: uuid.UUID | None,
) -> TransactionLog:
    before = inv_effect.snapshot_cells(db, item.item_id)
    inv, qty_before, dept = inventory_svc.consume_from_item_department(db, item, Decimal(qty))
    return _log_inventory_change(
        db,
        item=item,
        tx_type=TransactionTypeEnum.BACKFLUSH,
        quantity_change=-qty,
        quantity_before=int(qty_before),
        reference_no=reference_no,
        produced_by="구성품 변경",
        notes=notes,
        before_cells=before,
        request_id=request_id,
        phase=COMPONENT_CHANGE_PHASE,
        department=dept,
    )


def _receive_component_location(
    db: Session,
    item: Item,
    qty: int,
    reference_no: str,
    notes: str,
    request_id: uuid.UUID | None,
    tx_type: TransactionTypeEnum = TransactionTypeEnum.PRODUCE,
) -> TransactionLog:
    before = inv_effect.snapshot_cells(db, item.item_id)
    inv, qty_before, dept = inventory_svc.receive_to_item_department(db, item, Decimal(qty))
    return _log_inventory_change(
        db,
        item=item,
        tx_type=tx_type,
        quantity_change=qty,
        quantity_before=int(qty_before),
        reference_no=reference_no,
        produced_by="구성품 변경",
        notes=notes,
        before_cells=before,
        request_id=request_id,
        phase=COMPONENT_CHANGE_PHASE,
        department=dept,
    )


def _execute_component_change_core(
    db: Session,
    source_pa_item_id: uuid.UUID,
    target_pa_item_id: uuid.UUID,
    quantity: int,
    memo: str | None = None,
    request_id: uuid.UUID | None = None,
    requested_mode: str | None = "BOM",
) -> dict:
    preview = _component_change_preview_core(
        db,
        source_pa_item_id,
        target_pa_item_id,
        quantity,
        request_id,
        requested_mode,
    )
    if not preview["executable"]:
        raise ShippingError(preview["blocking_reason"] or "품목 전환을 실행할 수 없습니다.")
    if preview["resolved_mode"] == "BOM" and not (memo and memo.strip()):
        raise ShippingError("구성 전환은 메모를 입력해야 합니다.")
    if preview["source_shortage_quantity"] > 0:
        raise ShippingError("소스 품목 재고가 부족해 품목 전환을 할 수 없습니다.")
    shortages = [line for line in preview["lines"] if line["shortage_quantity"] > 0]
    if shortages:
        names = ", ".join(f"{line['item_name']} {line['shortage_quantity']}" for line in shortages)
        raise ShippingError(f"추가 구성품 재고가 부족합니다: {names}")

    source_pa = _get_item(db, source_pa_item_id)
    target_pa = _get_item(db, target_pa_item_id)
    reference_no = (
        f"SHIP-COMP-{request_id.hex[:8]}"
        if request_id
        else f"ITEM-CONV-{uuid.uuid4().hex[:8]}"
    )
    notes_suffix = f" / {memo}" if memo else ""
    logs: list[TransactionLog] = []
    source_label = source_pa.process_type_code or "품목"
    target_label = target_pa.process_type_code or "품목"

    logs.append(_backflush_component_location(
        db,
        source_pa,
        quantity,
        reference_no,
        f"품목 전환 소스 {source_label} 사용: {source_pa.item_name} x {quantity}{notes_suffix}",
        request_id,
    ))
    for line in preview["lines"]:
        delta = int(line["total_delta"])
        if delta > 0:
            item = _get_item(db, line["item_id"])
            logs.append(_backflush_component_location(
                db,
                item,
                delta,
                reference_no,
                f"품목 전환 추가 차감: {item.item_name} x {delta}{notes_suffix}",
                request_id,
            ))

    logs.append(_receive_component_location(
        db,
        target_pa,
        quantity,
        reference_no,
        f"품목 전환 대상 {target_label} 입고: {target_pa.item_name} x {quantity}{notes_suffix}",
        request_id,
    ))
    for line in preview["lines"]:
        delta = int(line["total_delta"])
        if delta < 0:
            item = _get_item(db, line["item_id"])
            recovered = abs(delta)
            logs.append(_receive_component_location(
                db,
                item,
                recovered,
                reference_no,
                f"품목 전환 회수 입고: {item.item_name} x {recovered}{notes_suffix}",
                request_id,
                TransactionTypeEnum.RECEIVE,
            ))

    completed_at = datetime.utcnow()
    db.flush()
    return {
        **preview,
        "reference_no": reference_no,
        "memo": memo,
        "completed_at": completed_at,
        "transactions": logs,
    }


def execute_component_change_independent(
    db: Session,
    source_pa_item_id: uuid.UUID,
    target_pa_item_id: uuid.UUID,
    quantity: int,
    memo: str | None = None,
    requested_mode: str | None = "BOM",
) -> dict:
    return _execute_component_change_core(db, source_pa_item_id, target_pa_item_id, quantity, memo, requested_mode=requested_mode)


def execute_component_change(
    db: Session,
    request_id: uuid.UUID,
    source_pa_item_id: uuid.UUID,
    quantity: int,
    requested_mode: str | None = "BOM",
    memo: str | None = None,
) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARING:
        raise ShippingError("준비 중 요청에서만 구성품 변경을 할 수 있습니다.")
    final_pa, _final_pf = _require_final_items(db, req)
    _execute_component_change_core(
        db,
        source_pa_item_id,
        final_pa.item_id,
        quantity,
        memo,
        request_id=req.request_id,
        requested_mode=requested_mode,
    )
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "COMPONENT_CHANGED", f"품목 전환 {quantity} EA")
    db.flush()
    return req


def _reserve_companions(db: Session, req: ShippingRequest, reference_no: str) -> None:
    for line in req.companion_lines:
        qty = int(line.quantity or 0)
        if qty <= 0:
            continue
        dept = _require_item_location_available(db, line.item, qty)
        db.add(
            ShippingAllocation(
                request_id=req.request_id,
                item_id=line.item_id,
                quantity=qty,
                unit=line.unit or line.item.unit or "EA",
                department=dept.value,
                status=ALLOCATION_RESERVED,
                reference_no=reference_no,
            )
        )
    db.flush()


def _release_companion_allocations(db: Session, req: ShippingRequest, reason: str | None) -> None:
    now = datetime.utcnow()
    for allocation in _active_allocations_for_request(db, req):
        allocation.status = ALLOCATION_RELEASED
        allocation.released_at = now
        allocation.released_reason = reason or "?? ?? ?? ??"
    db.flush()


def _consume_companion_allocations(db: Session, req: ShippingRequest) -> None:
    allocations = _active_allocations_for_request(db, req)
    if not allocations:
        for line in req.companion_lines:
            _ship_from_item_location(db, req, line.item, int(line.quantity), f"?? ?? ??: {line.item.item_name}")
        return
    now = datetime.utcnow()
    for allocation in allocations:
        item = allocation.item
        qty = int(allocation.quantity or 0)
        _ship_from_item_location(db, req, item, qty, f"?? ?? ??: {item.item_name}")
        allocation.status = ALLOCATION_CONSUMED
        allocation.consumed_at = now
    db.flush()



def prepare_complete(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARING:
        raise ShippingError("?? ? ????? ?? ??? ? ????.")
    request_qty = _request_quantity(req)
    final_pa, final_pf = _require_final_items(db, req)
    _require_item_location_available(db, final_pa, request_qty)
    reference_no = f"SHIP-PREP-{req.request_id.hex[:8]}"

    _backflush_item_location(
        db,
        req,
        final_pa,
        request_qty,
        reference_no,
        f"?? ?? final PA ??: {final_pa.item_name} x {request_qty}",
    )
    _produce_pf_to_item_location(db, req, final_pf, request_qty, reference_no)
    _reserve_companions(db, req, reference_no)

    req.status = ShippingRequestStatusEnum.PREPARED
    req.prepared_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "PREPARED", "?? ?? ??")
    db.flush()
    return req


def prepare_cancel(db: Session, request_id: uuid.UUID, reason: str | None = None) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARED:
        raise ShippingError("?? ?? ????? ??? ? ????.")
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
        raise ShippingError("??? ?? ?? ??? ??? ????.")
    for log in logs:
        inv_effect.apply_effect_reverse(db, log.item_id, log.inventory_effect)
        inv = db.query(Inventory).filter(Inventory.item_id == log.item_id).first()
        if inv is not None:
            _sync_total(db, inv)
        log.cancelled = True
        log.cancel_reason = reason or "?? ?? ?? ??"
        log.cancelled_at = datetime.utcnow()
    _release_companion_allocations(db, req, reason)
    req.status = ShippingRequestStatusEnum.PREPARING
    req.prepared_at = None
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "PREPARE_CANCELLED", reason or "?? ?? ?? ??")
    db.flush()
    return req

def _ship_from_item_location(db: Session, req: ShippingRequest, item: Item, qty: int, notes: str) -> None:
    reference_no = f"SHIP-{req.request_id.hex[:8]}"
    before = inv_effect.snapshot_cells(db, item.item_id)
    inv, qty_before, dept = inventory_svc.consume_from_item_department(db, item, Decimal(qty))
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
        department=dept,
    )



def pickup_complete(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARED:
        raise ShippingError("?? ?? ????? ?? ??? ? ????.")
    if req.final_pf_item is None:
        raise ShippingError("?? PF? ???? ?????.")
    request_qty = _request_quantity(req)
    _ship_from_item_location(db, req, req.final_pf_item, request_qty, f"?? ?? ??: {req.final_pf_item.item_name} x {request_qty}")
    _consume_companion_allocations(db, req)
    req.status = ShippingRequestStatusEnum.PICKED_UP
    req.picked_up_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "PICKED_UP", "???? ?? ??")
    db.flush()
    return req
