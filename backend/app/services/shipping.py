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
        phase=PREPARE_PHASE,
        department=dept,
    )


def _produce_to_item_location(db: Session, req: ShippingRequest, item: Item, qty: int, reference_no: str, notes: str) -> None:
    before = inv_effect.snapshot_cells(db, item.item_id)
    inv, qty_before, dept = inventory_svc.receive_to_item_department(db, item, Decimal(qty))
    _log_inventory_change(
        db,
        item=item,
        tx_type=TransactionTypeEnum.PRODUCE,
        quantity_change=qty,
        quantity_before=int(qty_before),
        reference_no=reference_no,
        produced_by=req.requested_by_name,
        notes=notes,
        before_cells=before,
        request_id=req.request_id,
        phase=PREPARE_PHASE,
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


def prepare_complete(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARING:
        raise ShippingError("준비 중 상태에서만 준비 완료할 수 있습니다.")
    request_qty = _request_quantity(req)
    final_pa = _resolve_or_create_pa(db, req)
    final_pf = _resolve_or_create_pf(db, req, final_pa)
    req.final_pa_item_id = final_pa.item_id
    req.final_pf_item_id = final_pf.item_id
    reference_no = f"SHIP-{req.request_id.hex[:8]}"

    for line in _request_stage_lines(req, "PA"):
        child = _get_item(db, line.child_item_id)
        total_qty = int(line.quantity) * request_qty
        _backflush_item_location(
            db,
            req,
            child,
            total_qty,
            reference_no,
            f"출하 준비 PA 생산 투입: {child.item_name} x {total_qty}",
        )
    _produce_to_item_location(db, req, final_pa, request_qty, reference_no, f"출하 준비 PA 완료: {final_pa.item_name} x {request_qty}")

    for child_id, qty, _unit in _pf_lines_with_final_pa(req, final_pa):
        child = _get_item(db, child_id)
        total_qty = int(qty) * request_qty
        if child.item_id == final_pa.item_id:
            _consume_pa_from_item_location(db, req, child, total_qty, reference_no)
        else:
            _backflush_item_location(
                db,
                req,
                child,
                total_qty,
                reference_no,
                f"출하 준비 PF 생산 투입: {child.item_name} x {total_qty}",
            )
    _produce_pf_to_item_location(db, req, final_pf, request_qty, reference_no)

    req.status = ShippingRequestStatusEnum.PREPARED
    req.prepared_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "PREPARED", "출하 준비 완료")
    db.flush()
    return req


def prepare_cancel(db: Session, request_id: uuid.UUID, reason: str | None = None) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARED:
        raise ShippingError("以鍮??꾨즺 ?곹깭?먯꽌留?痍⑥냼?????덉뒿?덈떎.")
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
        raise ShippingError("痍⑥냼??以鍮??꾨즺 ?낆텧怨?濡쒓렇媛 ?놁뒿?덈떎.")
    for log in logs:
        inv_effect.apply_effect_reverse(db, log.item_id, log.inventory_effect)
        inv = db.query(Inventory).filter(Inventory.item_id == log.item_id).first()
        if inv is not None:
            _sync_total(db, inv)
        log.cancelled = True
        log.cancel_reason = reason or "異쒗븯 以鍮??꾨즺 痍⑥냼"
        log.cancelled_at = datetime.utcnow()
    req.status = ShippingRequestStatusEnum.PREPARING
    req.prepared_at = None
    req.final_pa_item_id = None
    req.final_pf_item_id = None
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "PREPARE_CANCELLED", reason or "異쒗븯 以鍮??꾨즺 痍⑥냼")
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
        raise ShippingError("以鍮??꾨즺 ?곹깭?먯꽌留??쎌뾽 ?꾨즺?????덉뒿?덈떎.")
    if req.final_pf_item is None:
        raise ShippingError("理쒖쥌 PF媛 ?뺥빐吏吏 ?딆븯?듬땲??")
    request_qty = _request_quantity(req)
    _ship_from_item_location(db, req, req.final_pf_item, request_qty, f"異쒗븯 ?쎌뾽 ?꾨즺: {req.final_pf_item.item_name} x {request_qty}")
    for line in req.companion_lines:
        _ship_from_item_location(db, req, line.item, int(line.quantity), f"異쒗븯 ?숇컲 ?덈ぉ: {line.item.item_name}")
    req.status = ShippingRequestStatusEnum.PICKED_UP
    req.picked_up_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "PICKED_UP", "諛곗넚?낆껜 ?쎌뾽 ?꾨즺")
    db.flush()
    return req
