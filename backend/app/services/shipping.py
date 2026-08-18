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
    ShippingRequestRevision,
    ShippingFinalizationModeEnum,
    ShippingRequestStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
    Employee,
)
from app.repositories import item_repository
from app.services import inv_effect
from app.services import inventory as inventory_svc
from app.services.bom import bom_child_item_ordering
from app.services.bom_stock_policy import should_skip_bom_inventory
from app.services.inv_calc import _sync_total
from app.utils.mes_code import make_mes_code, next_serial_no

PREPARE_PHASE = "PREPARE"
PICKUP_PHASE = "PICKUP"
COMPONENT_CHANGE_PHASE = "COMPONENT_CHANGE"
ALLOCATION_RESERVED = "RESERVED"
ALLOCATION_RELEASED = "RELEASED"
ALLOCATION_CONSUMED = "CONSUMED"
FINAL_PF_ALLOCATION_SUFFIX = ":PF"
ITEM_CONVERSION_ALLOWED_PROCESS_TYPES = {"PA", "AF", "AA"}


class ShippingError(ValueError):
    """Base shipping workflow error."""


class ShippingConflictError(ShippingError):
    """Shipping request conflict."""


def _get_request(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    req = db.query(ShippingRequest).filter(ShippingRequest.request_id == request_id).first()
    if req is None:
        raise ShippingError("출하 요청을 찾을 수 없습니다.")
    return req


def get_request(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    """상태와 무관하게 출하 요청 상세를 반환한다."""
    return _get_request(db, request_id)


def _get_item(db: Session, item_id: uuid.UUID) -> Item:
    item = item_repository.get(db, item_id)
    if item is None:
        raise ShippingError("품목을 찾을 수 없습니다.")
    return item


def _record_event(db: Session, req: ShippingRequest, event_type: str, message: str | None = None) -> None:
    db.add(ShippingRequestEvent(request_id=req.request_id, event_type=event_type, message=message))


def _normalize_invoice_number(value: str | None) -> str | None:
    normalized = (value or "").strip().upper()
    return normalized or None


def _require_actor(actor: Employee | None) -> Employee:
    if actor is None:
        raise ShippingError("작업자 정보가 필요합니다.")
    if not actor.is_active:
        raise ShippingError("비활성 작업자는 출하 요청을 변경할 수 없습니다.")
    return actor


def _has_preparation_history(req: ShippingRequest) -> bool:
    """현재 상태와 무관하게 준비 완료가 있었던 요청인지 판별한다."""
    return req.prepared_at is not None or any(event.event_type == "PREPARED" for event in req.events)


def _ensure_invoice_can_be_cleared(req: ShippingRequest, invoice_number: str | None) -> None:
    if invoice_number is None and (
        req.status in {ShippingRequestStatusEnum.PREPARED, ShippingRequestStatusEnum.PICKED_UP}
        or _has_preparation_history(req)
    ):
        raise ShippingError("준비 완료 이력이 있는 요청의 인보이스 번호는 비울 수 없습니다.")


def _revision_snapshot(req: ShippingRequest) -> dict:
    return {
        "request_quantity": int(req.request_quantity or 1),
        "requested_by_name": req.requested_by_name,
        "custom_pa_name": req.custom_pa_name,
        "custom_pf_name": req.custom_pf_name,
        "notes": req.notes,
        "invoice_number": req.invoice_number,
        "bom_lines": [
            {
                "parent_stage": line.parent_stage,
                "child_item_id": str(line.child_item_id),
                "item_name": line.child_item.item_name,
                "mes_code": line.child_item.mes_code,
                "quantity": int(line.quantity),
                "unit": line.unit,
                "included": bool(line.included),
                "origin": line.origin,
            }
            for line in req.bom_lines
        ],
        "companion_lines": [
            {
                "item_id": str(line.item_id),
                "item_name": line.item.item_name,
                "mes_code": line.item.mes_code,
                "quantity": int(line.quantity),
                "unit": line.unit,
            }
            for line in req.companion_lines
        ],
    }


_PREPARATION_REVISION_FIELDS = {
    "request_quantity",
    "custom_pa_name",
    "custom_pf_name",
    "notes",
    "bom_lines",
    "companion_lines",
}


def _snapshot_changes(before: dict, after: dict) -> list[dict]:
    return [
        {"field": field, "before": before[field], "after": after[field]}
        for field in before
        if before[field] != after[field]
    ]


def _record_revision(
    db: Session,
    req: ShippingRequest,
    actor: Employee,
    changes: list[dict],
) -> None:
    if not changes:
        return
    fields = [change["field"] for change in changes]
    db.add(
        ShippingRequestRevision(
            request_id=req.request_id,
            edited_by_employee_id=actor.employee_id,
            edited_by_name=actor.name,
            summary=f"출하 요청 수정: {', '.join(fields)}",
            affects_preparation=any(field in _PREPARATION_REVISION_FIELDS for field in fields),
            changes=changes,
        )
    )


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
        .join(Item, BOM.child_item_id == Item.item_id)
        .filter(BOM.parent_item_id == parent_item_id)
        .order_by(*bom_child_item_ordering())
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


def _matching_pf_candidates(db: Session, normalized: list[dict]) -> list[dict]:
    """Find every active PF whose direct PA/PF BOM matches the request draft."""
    pa_signature = _stage_signature_from_lines(normalized, "PA")
    candidates: list[dict] = []
    pf_items = (
        db.query(Item)
        .filter(Item.process_type_code == "PF", Item.deleted_at.is_(None))
        .all()
    )
    if not pf_items:
        return candidates

    pf_ids = [item.item_id for item in pf_items]
    pf_children: dict[uuid.UUID, list[tuple[uuid.UUID, int, str]]] = {item_id: [] for item_id in pf_ids}
    for row in db.query(BOM).filter(BOM.parent_item_id.in_(pf_ids)).all():
        pf_children[row.parent_item_id].append((row.child_item_id, int(row.quantity or 0), row.unit or "EA"))

    child_ids = {child_id for rows in pf_children.values() for child_id, _qty, _unit in rows}
    child_items = {
        item.item_id: item
        for item in db.query(Item).filter(Item.item_id.in_(child_ids)).all()
    }
    pa_ids = {
        child_id
        for child_id, item in child_items.items()
        if item.process_type_code == "PA" and item.deleted_at is None
    }
    pa_children: dict[uuid.UUID, list[tuple[uuid.UUID, int]]] = {item_id: [] for item_id in pa_ids}
    if pa_ids:
        for row in db.query(BOM).filter(BOM.parent_item_id.in_(pa_ids)).all():
            pa_children[row.parent_item_id].append((row.child_item_id, int(row.quantity or 0)))

    normalized_item_ids = {line["child_item_id"] for line in normalized if line.get("included", True)}
    normalized_items = {
        item.item_id: item
        for item in db.query(Item).filter(Item.item_id.in_(normalized_item_ids)).all()
    }

    def expected_pf_signature(final_pa_id: uuid.UUID) -> tuple[tuple[str, int], ...]:
        rows: list[tuple[uuid.UUID, int]] = []
        replaced = False
        for line in normalized:
            if line["parent_stage"] != "PF" or not bool(line.get("included", True)):
                continue
            child_id = line["child_item_id"]
            if normalized_items[child_id].process_type_code == "PA" and not replaced:
                rows.append((final_pa_id, int(line["quantity"])))
                replaced = True
            else:
                rows.append((child_id, int(line["quantity"])))
        if not replaced:
            rows.insert(0, (final_pa_id, 1))
        return _signature(rows)

    for pf in pf_items:
        pf_signature = _signature((child_id, quantity) for child_id, quantity, _unit in pf_children[pf.item_id])
        for pa_id, _quantity, _unit in pf_children[pf.item_id]:
            pa = child_items.get(pa_id)
            if pa is None or pa.process_type_code != "PA" or pa.deleted_at is not None:
                continue
            if _signature(pa_children.get(pa.item_id, [])) != pa_signature:
                continue
            if pf_signature != expected_pf_signature(pa.item_id):
                continue
            candidates.append(
                {
                    "pf_item_id": pf.item_id,
                    "pf_item_name": pf.item_name,
                    "pf_mes_code": pf.mes_code,
                    "pa_item_id": pa.item_id,
                    "pa_item_name": pa.item_name,
                    "pa_mes_code": pa.mes_code,
                }
            )
            break
    return sorted(
        candidates,
        key=lambda row: (row["pf_mes_code"] or "", row["pf_item_name"], str(row["pf_item_id"])),
    )


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
    defaults_by_key = {
        (line["parent_stage"], line["child_item_id"]): line for line in default_lines
    }
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
        unit = raw.get("unit") or "EA"
        default_line = defaults_by_key.get((stage, child_id))
        is_default_line = (
            default_line is not None
            and qty == int(default_line["quantity"])
            and unit == (default_line.get("unit") or "EA")
        )
        normalized.append(
            {
                "parent_stage": stage,
                "child_item_id": child_id,
                "quantity": qty,
                "unit": unit,
                "included": bool(raw.get("included", True)),
                "origin": "DEFAULT" if is_default_line else "CUSTOM",
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
    invoice_number = _normalize_invoice_number(payload.get("invoice_number"))
    base_pf = _get_item(db, payload["base_pf_item_id"])
    if base_pf.process_type_code != "PF":
        raise ShippingError("기준 품목은 PF여야 합니다.")
    req = ShippingRequest(
        base_pf_item_id=base_pf.item_id,
        request_quantity=_payload_request_quantity(payload),
        requested_by_name=payload.get("requested_by_name"),
        custom_pa_name=payload.get("custom_pa_name"),
        custom_pf_name=payload.get("custom_pf_name"),
        notes=payload.get("notes"),
        invoice_number=invoice_number,
    )
    db.add(req)
    db.flush()
    _replace_bom_lines(db, req, _normalize_bom_lines(db, base_pf, payload.get("bom_lines")))
    _apply_finalization_choice(db, req, payload, infer_when_missing=True)
    if payload.get("companion_lines") is not None:
        _replace_companions(db, req, payload.get("companion_lines") or [])
    db.refresh(req)
    _resolve_final_items(db, req)
    db.refresh(req)
    _sync_checklist(db, req)
    _record_event(db, req, "REQUEST_CREATED", "출하 요청 생성")
    db.flush()
    return req


def update_request(
    db: Session,
    request_id: uuid.UUID,
    payload: dict,
    actor: Employee,
) -> ShippingRequest:
    actor = _require_actor(actor)
    req = _get_request(db, request_id)
    if req.status not in {ShippingRequestStatusEnum.REQUESTED, ShippingRequestStatusEnum.PREPARING}:
        raise ShippingError("준비 완료된 요청은 먼저 준비 완료 취소 후 수정할 수 있습니다.")
    before = _revision_snapshot(req)
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
    if "invoice_number" in payload:
        invoice_number = _normalize_invoice_number(payload.get("invoice_number"))
        _ensure_invoice_can_be_cleared(req, invoice_number)
        req.invoice_number = invoice_number
    if "bom_lines" in payload:
        _replace_bom_lines(db, req, _normalize_bom_lines(db, req.base_pf_item, payload.get("bom_lines")))
        db.refresh(req)
        _sync_checklist(db, req)
    if "finalization_mode" in payload or "reuse_pf_item_id" in payload:
        _apply_finalization_choice(db, req, payload, infer_when_missing=False)
    elif "bom_lines" in payload:
        _apply_finalization_choice(db, req, payload, infer_when_missing=True)
    if "companion_lines" in payload:
        _replace_companions(db, req, payload.get("companion_lines") or [])
    db.flush()
    db.refresh(req)
    _resolve_final_items(db, req)
    db.refresh(req)
    after = _revision_snapshot(req)
    changes = _snapshot_changes(before, after)
    if not changes:
        db.flush()
        return req
    _record_revision(db, req, actor, changes)
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "REQUEST_UPDATED", "출하 요청 수정")
    db.flush()
    return req



def delete_request(
    db: Session,
    request_id: uuid.UUID,
    actor: Employee,
) -> None:
    actor = _require_actor(actor)
    req = _get_request(db, request_id)
    if req.status not in {ShippingRequestStatusEnum.REQUESTED, ShippingRequestStatusEnum.PREPARING}:
        raise ShippingError("요청 또는 준비 중 상태에서만 출하 요청을 취소할 수 있습니다.")
    req.status = ShippingRequestStatusEnum.CANCELLED
    req.cancelled_at = datetime.utcnow()
    req.cancelled_by_employee_id = actor.employee_id
    req.cancelled_by_name = actor.name
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "CANCELLED", "출하 요청 취소")
    db.flush()


def update_invoice(
    db: Session,
    request_id: uuid.UUID,
    invoice_number: str | None,
    actor: Employee,
) -> ShippingRequest:
    actor = _require_actor(actor)
    req = _get_request(db, request_id)
    normalized = _normalize_invoice_number(invoice_number)
    _ensure_invoice_can_be_cleared(req, normalized)
    before = _revision_snapshot(req)
    req.invoice_number = normalized
    changes = _snapshot_changes(before, _revision_snapshot(req))
    if changes:
        req.updated_at = datetime.utcnow()
        _record_revision(db, req, actor, changes)
        _record_event(db, req, "INVOICE_UPDATED", "인보이스 번호 수정")
    db.flush()
    return req

def send_to_prep(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.REQUESTED:
        raise ShippingError("요청 상태에서만 준비 중으로 전환할 수 있습니다.")
    _resolve_final_items(db, req)
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


def _request_owned_final_item(db: Session, req: ShippingRequest, *, process_type_code: str, name: str) -> Item | None:
    current_id = req.final_pa_item_id if process_type_code == "PA" else req.final_pf_item_id
    if current_id is None:
        return None
    current = _get_item(db, current_id)
    if current.process_type_code != process_type_code or current.item_name != name:
        return None
    if req.created_at is not None and current.created_at is not None and current.created_at < req.created_at:
        return None

    field = ShippingRequest.final_pa_item_id if process_type_code == "PA" else ShippingRequest.final_pf_item_id
    other_request_count = (
        db.query(func.count(ShippingRequest.request_id))
        .filter(field == current.item_id, ShippingRequest.request_id != req.request_id)
        .scalar()
        or 0
    )
    if int(other_request_count) > 0:
        return None
    return current


def _request_bom_payload(req: ShippingRequest) -> list[dict]:
    """Expose persisted request lines in the same shape used by BOM matching."""
    return [
        {
            "parent_stage": line.parent_stage,
            "child_item_id": line.child_item_id,
            "quantity": int(line.quantity),
            "unit": line.unit or "EA",
            "included": bool(line.included),
            "origin": line.origin,
        }
        for line in req.bom_lines
    ]


def _matching_candidate_for_pf(db: Session, req: ShippingRequest, pf_item_id: uuid.UUID) -> dict | None:
    return next(
        (candidate for candidate in _matching_pf_candidates(db, _request_bom_payload(req)) if candidate["pf_item_id"] == pf_item_id),
        None,
    )


def _apply_finalization_choice(
    db: Session,
    req: ShippingRequest,
    payload: dict,
    *,
    infer_when_missing: bool,
) -> None:
    """Persist an explicit choice, or retain safe behavior for legacy callers."""
    raw_mode = payload.get("finalization_mode")
    raw_candidate_id = payload.get("reuse_pf_item_id")
    if raw_mode is None and infer_when_missing:
        raw_mode = (
            ShippingFinalizationModeEnum.KEEP_BASE
            if _matching_candidate_for_pf(db, req, req.base_pf_item_id) is not None
            else ShippingFinalizationModeEnum.CREATE_NEW
        )
    if raw_mode is None:
        return
    try:
        mode = raw_mode if isinstance(raw_mode, ShippingFinalizationModeEnum) else ShippingFinalizationModeEnum(raw_mode)
    except ValueError as exc:
        raise ShippingError("최종 출하품 처리 방식을 확인할 수 없습니다.") from exc
    candidate_id = uuid.UUID(str(raw_candidate_id)) if raw_candidate_id else None
    if mode == ShippingFinalizationModeEnum.REUSE_CANDIDATE and candidate_id is None:
        raise ShippingError("재사용할 기존 품목을 선택하세요.")
    if mode != ShippingFinalizationModeEnum.REUSE_CANDIDATE:
        candidate_id = None
    req.finalization_mode = mode
    req.reuse_pf_item_id = candidate_id
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
    pf_candidates = _matching_pf_candidates(db, normalized)
    base_pf_matches = any(candidate["pf_item_id"] == base_pf.item_id for candidate in pf_candidates)
    pa_sig = _stage_signature_from_lines(normalized, "PA")
    pa = _find_item_by_signature(db, process_type_code="PA", signature=pa_sig)
    pf = None
    if pa is not None:
        pf_sig = _signature((child_id, qty) for child_id, qty, _ in _pf_lines_with_final_pa_from_lines(db, normalized, pa))
        pf = _find_item_by_signature(db, process_type_code="PF", signature=pf_sig)
    preview_pa_mes_code = None if base_pf_matches else make_mes_code(
        base_pf.model_symbol,
        "PA",
        next_serial_no(base_pf.model_symbol, "PA", db),
    )
    preview_pf_mes_code = None if base_pf_matches else make_mes_code(
        base_pf.model_symbol,
        "PF",
        next_serial_no(base_pf.model_symbol, "PF", db),
    )
    return {
        "base_pf_matches": base_pf_matches,
        "pf_candidates": [] if base_pf_matches else pf_candidates,
        "matched_pa_item_id": pa.item_id if pa else None,
        "matched_pf_item_id": pf.item_id if pf else None,
        "matched_pa_item_name": pa.item_name if pa else None,
        "matched_pf_item_name": pf.item_name if pf else None,
        "requires_pa_name": pa is None,
        "requires_pf_name": pf is None,
        "preview_pa_mes_code": preview_pa_mes_code,
        "preview_pf_mes_code": preview_pf_mes_code,
    }


def _create_or_update_request_pa(db: Session, req: ShippingRequest) -> Item:
    pa_lines = [(line.child_item_id, int(line.quantity), line.unit or "EA") for line in _request_stage_lines(req, "PA")]
    if not pa_lines:
        raise ShippingError("PA 구성 BOM이 비어 있습니다.")
    if not (req.custom_pa_name and req.custom_pa_name.strip()):
        raise ShippingError("동일 BOM이 없으므로 새 PA/PF 이름을 입력해야 합니다.")
    name = req.custom_pa_name.strip()
    existing_final = _request_owned_final_item(db, req, process_type_code="PA", name=name)
    if existing_final is not None:
        _replace_item_bom(db, existing_final, pa_lines)
        return existing_final
    pa = _create_item(db, name=name, process_type_code="PA", model_symbol=req.base_pf_item.model_symbol)
    _replace_item_bom(db, pa, pa_lines)
    return pa


def _create_or_update_request_pf(db: Session, req: ShippingRequest, final_pa: Item) -> Item:
    pf_lines = _pf_lines_with_final_pa(req, final_pa)
    if not (req.custom_pf_name and req.custom_pf_name.strip()):
        raise ShippingError("동일 BOM이 없으므로 새 PA/PF 이름을 입력해야 합니다.")
    name = req.custom_pf_name.strip()
    existing_final = _request_owned_final_item(db, req, process_type_code="PF", name=name)
    if existing_final is not None:
        _replace_item_bom(db, existing_final, pf_lines)
        return existing_final
    pf = _create_item(db, name=name, process_type_code="PF", model_symbol=req.base_pf_item.model_symbol)
    _replace_item_bom(db, pf, pf_lines)
    return pf


def _resolve_final_items(db: Session, req: ShippingRequest) -> tuple[Item, Item]:
    if req.finalization_mode == ShippingFinalizationModeEnum.KEEP_BASE:
        candidate = _matching_candidate_for_pf(db, req, req.base_pf_item_id)
        if candidate is None:
            raise ShippingError("기준 PF의 BOM이 변경되었습니다. 기존 품목 재사용 또는 신규 생성을 선택하세요.")
        final_pa = _get_item(db, candidate["pa_item_id"])
        final_pf = req.base_pf_item
    elif req.finalization_mode == ShippingFinalizationModeEnum.REUSE_CANDIDATE:
        if req.reuse_pf_item_id is None:
            raise ShippingError("재사용할 기존 품목을 선택하세요.")
        candidate = _matching_candidate_for_pf(db, req, req.reuse_pf_item_id)
        if candidate is None:
            raise ShippingError("선택한 기존 품목의 BOM이 변경되었습니다. 후보를 다시 선택하세요.")
        final_pa = _get_item(db, candidate["pa_item_id"])
        final_pf = _get_item(db, candidate["pf_item_id"])
    else:
        final_pa = _create_or_update_request_pa(db, req)
        final_pf = _create_or_update_request_pf(db, req, final_pa)
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
            f"출하 준비 재고 부족: {code} / {item.item_name} / 부서 {dept.value} / "
            f"현재 {current} / 예약 {_active_allocation_quantity(db, item.item_id)} / 가용 {available} / 필요 {required}"
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
        if should_skip_bom_inventory(
            line.child_item,
            bom_generated=line.origin == "DEFAULT",
        ):
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
    producer_employee_id: uuid.UUID | None = None,
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
        producer_employee_id=producer_employee_id,
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
        notes=f"출하 준비 PF 생산 입고: {item.item_name} x {qty}",
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
        bom_stock_exempt = should_skip_bom_inventory(item, bom_generated=True)
        shortage = max(total_delta - available, 0) if total_delta > 0 and not bom_stock_exempt else 0
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
                "bom_stock_exempt": bom_stock_exempt,
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
    produced_by: str = "구성품 변경",
    producer_employee_id: uuid.UUID | None = None,
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
        produced_by=produced_by,
        notes=notes,
        before_cells=before,
        request_id=request_id,
        phase=COMPONENT_CHANGE_PHASE,
        department=dept,
        producer_employee_id=producer_employee_id,
    )


def _receive_component_location(
    db: Session,
    item: Item,
    qty: int,
    reference_no: str,
    notes: str,
    request_id: uuid.UUID | None,
    tx_type: TransactionTypeEnum = TransactionTypeEnum.PRODUCE,
    produced_by: str = "구성품 변경",
    producer_employee_id: uuid.UUID | None = None,
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
        produced_by=produced_by,
        notes=notes,
        before_cells=before,
        request_id=request_id,
        phase=COMPONENT_CHANGE_PHASE,
        department=dept,
        producer_employee_id=producer_employee_id,
    )


def _execute_component_change_core(
    db: Session,
    source_pa_item_id: uuid.UUID,
    target_pa_item_id: uuid.UUID,
    quantity: int,
    memo: str | None = None,
    request_id: uuid.UUID | None = None,
    requested_mode: str | None = "BOM",
    requester_name: str | None = None,
    requester_employee_id: uuid.UUID | None = None,
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
    applied_lines = [line for line in preview["lines"] if not line.get("bom_stock_exempt")]
    shortages = [line for line in applied_lines if line["shortage_quantity"] > 0]
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
    produced_by = requester_name or "구성품 변경"
    source_label = source_pa.process_type_code or "품목"
    target_label = target_pa.process_type_code or "품목"
    item_ids = sorted(
        {
            source_pa.item_id,
            target_pa.item_id,
            *(line["item_id"] for line in applied_lines),
        }
    )
    inventory_svc.ensure_and_lock_inventories(db, item_ids)

    logs.append(_backflush_component_location(
        db,
        source_pa,
        quantity,
        reference_no,
        f"품목 전환 소스 {source_label} 사용: {source_pa.item_name} x {quantity}{notes_suffix}",
        request_id,
        produced_by=produced_by,
        producer_employee_id=requester_employee_id,
    ))
    for line in applied_lines:
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
                produced_by=produced_by,
                producer_employee_id=requester_employee_id,
            ))

    logs.append(_receive_component_location(
        db,
        target_pa,
        quantity,
        reference_no,
        f"품목 전환 대상 {target_label} 입고: {target_pa.item_name} x {quantity}{notes_suffix}",
        request_id,
        produced_by=produced_by,
        producer_employee_id=requester_employee_id,
    ))
    for line in applied_lines:
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
                tx_type=TransactionTypeEnum.RECEIVE,
                produced_by=produced_by,
                producer_employee_id=requester_employee_id,
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
    requester_name: str | None = None,
    requester_employee_id: uuid.UUID | None = None,
) -> dict:
    return _execute_component_change_core(
        db,
        source_pa_item_id,
        target_pa_item_id,
        quantity,
        memo,
        requested_mode=requested_mode,
        requester_name=requester_name,
        requester_employee_id=requester_employee_id,
    )


def execute_component_change(
    db: Session,
    request_id: uuid.UUID,
    source_pa_item_id: uuid.UUID,
    quantity: int,
    requested_mode: str | None = "BOM",
    memo: str | None = None,
    requester_name: str | None = None,
    requester_employee_id: uuid.UUID | None = None,
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
        requester_name=requester_name,
        requester_employee_id=requester_employee_id,
    )
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "COMPONENT_CHANGED", f"품목 전환 {quantity} EA")
    db.flush()
    return req


def _final_pf_allocation_reference(reference_no: str) -> str:
    """Distinguish the final-PF reservation from companion reservations without a schema change."""
    return f"{reference_no}{FINAL_PF_ALLOCATION_SUFFIX}"


def _reserve_pickup_items(
    db: Session,
    req: ShippingRequest,
    final_pf: Item,
    request_qty: int,
    reference_no: str,
) -> None:
    """Validate and reserve the pre-produced final PF with every companion item."""
    reservations: list[tuple[Item, int, str, str]] = [
        (
            final_pf,
            request_qty,
            final_pf.unit or "EA",
            _final_pf_allocation_reference(reference_no),
        )
    ]
    reservations.extend(
        (
            line.item,
            int(line.quantity or 0),
            line.unit or line.item.unit or "EA",
            reference_no,
        )
        for line in req.companion_lines
    )

    required_by_item: dict[uuid.UUID, int] = {}
    item_by_id: dict[uuid.UUID, Item] = {}
    for item, quantity, _unit, _item_reference in reservations:
        if quantity <= 0:
            continue
        item_by_id[item.item_id] = item
        required_by_item[item.item_id] = required_by_item.get(item.item_id, 0) + quantity
    departments = {
        item_id: _require_item_location_available(db, item_by_id[item_id], quantity)
        for item_id, quantity in required_by_item.items()
    }
    for item, quantity, unit, item_reference in reservations:
        if quantity <= 0:
            continue
        db.add(
            ShippingAllocation(
                request_id=req.request_id,
                item_id=item.item_id,
                quantity=quantity,
                unit=unit,
                department=departments[item.item_id].value,
                status=ALLOCATION_RESERVED,
                reference_no=item_reference,
            )
        )
    db.flush()


def _release_pickup_allocations(db: Session, req: ShippingRequest, reason: str | None) -> None:
    now = datetime.utcnow()
    for allocation in _active_allocations_for_request(db, req):
        allocation.status = ALLOCATION_RELEASED
        allocation.released_at = now
        allocation.released_reason = reason or "출하 준비 취소"
    db.flush()


def _consume_pickup_allocations(
    db: Session,
    req: ShippingRequest,
    final_pf: Item,
    request_qty: int,
) -> None:
    """Deduct reserved pickup items, with a direct-deduction fallback for legacy requests."""
    allocations = _active_allocations_for_request(db, req)
    item_ids = {final_pf.item_id, *(allocation.item_id for allocation in allocations)}
    if not allocations:
        item_ids.update(line.item_id for line in req.companion_lines)
    sorted_item_ids = sorted(item_ids)
    inventory_svc.ensure_and_lock_inventories(db, sorted_item_ids)
    if not allocations:
        _ship_from_item_location(db, req, final_pf, request_qty, f"출하 픽업: {final_pf.item_name} x {request_qty}")
        for line in req.companion_lines:
            _ship_from_item_location(db, req, line.item, int(line.quantity), f"동반 출하: {line.item.item_name}")
        return

    final_pf_reference = _final_pf_allocation_reference(f"SHIP-PREP-{req.request_id.hex[:8]}")
    final_pf_allocations = [
        allocation for allocation in allocations if allocation.reference_no == final_pf_reference
    ]
    now = datetime.utcnow()
    if final_pf_allocations:
        for allocation in final_pf_allocations:
            _ship_from_item_location(
                db,
                req,
                allocation.item,
                int(allocation.quantity or 0),
                f"출하 픽업: {allocation.item.item_name} x {int(allocation.quantity or 0)}",
            )
            allocation.status = ALLOCATION_CONSUMED
            allocation.consumed_at = now
    else:
        _ship_from_item_location(db, req, final_pf, request_qty, f"출하 픽업: {final_pf.item_name} x {request_qty}")

    for allocation in allocations:
        if allocation.reference_no == final_pf_reference:
            continue
        _ship_from_item_location(
            db,
            req,
            allocation.item,
            int(allocation.quantity or 0),
            f"동반 출하: {allocation.item.item_name}",
        )
        allocation.status = ALLOCATION_CONSUMED
        allocation.consumed_at = now
    db.flush()


def prepare_complete(
    db: Session,
    request_id: uuid.UUID,
    serial_numbers: str,
    *,
    prepared_by_employee_id: uuid.UUID | None = None,
    prepared_by_name: str | None = None,
) -> ShippingRequest:
    normalized_serial_numbers = serial_numbers.strip()
    if not normalized_serial_numbers:
        raise ShippingError("출하 SN을 입력해야 합니다.")
    req = _get_request(db, request_id)
    if req.invoice_number is None:
        raise ShippingError("준비 완료 전에 인보이스 번호를 입력해야 합니다.")
    if req.status != ShippingRequestStatusEnum.PREPARING:
        raise ShippingError("준비 중 요청에서만 준비 완료할 수 있습니다.")
    request_qty = _request_quantity(req)
    _final_pa, final_pf = _require_final_items(db, req)
    reference_no = f"SHIP-PREP-{req.request_id.hex[:8]}"

    _reserve_pickup_items(db, req, final_pf, request_qty, reference_no)
    req.serial_numbers = normalized_serial_numbers
    req.status = ShippingRequestStatusEnum.PREPARED
    req.prepared_at = datetime.utcnow()
    req.prepared_by_employee_id = prepared_by_employee_id
    req.prepared_by_name = prepared_by_name
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "PREPARED", "출하 준비 완료")
    db.flush()
    return req


def prepare_cancel(db: Session, request_id: uuid.UUID, reason: str | None = None) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARED:
        raise ShippingError("준비 완료 요청에서만 취소할 수 있습니다.")
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
    legacy_logs = [log for log in logs if log.operation_batch_id is None]
    inventory_svc.lock_inventories(
        db,
        sorted({log.item_id for log in legacy_logs}),
    )
    for log in legacy_logs:
        inv_effect.apply_effect_reverse(db, log.item_id, log.inventory_effect)
        inv = db.query(Inventory).filter(Inventory.item_id == log.item_id).first()
        if inv is not None:
            _sync_total(db, inv)
        log.cancelled = True
        log.cancel_reason = reason or "출하 준비 취소"
        log.cancelled_at = datetime.utcnow()
    _release_pickup_allocations(db, req, reason)
    req.status = ShippingRequestStatusEnum.PREPARING
    req.prepared_at = None
    req.prepared_by_employee_id = None
    req.prepared_by_name = None
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "PREPARE_CANCELLED", reason or "출하 준비 취소")
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
        produced_by=req.prepared_by_name or req.requested_by_name,
        producer_employee_id=req.prepared_by_employee_id,
        notes=notes,
        before_cells=before,
        request_id=req.request_id,
        phase=PICKUP_PHASE,
        department=dept,
    )



def pickup_complete(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PREPARED:
        raise ShippingError("준비 완료 요청에서만 픽업 완료할 수 있습니다.")
    if req.final_pf_item is None:
        raise ShippingError("최종 PF가 생성되지 않았습니다.")
    request_qty = _request_quantity(req)
    _consume_pickup_allocations(db, req, req.final_pf_item, request_qty)
    req.status = ShippingRequestStatusEnum.PICKED_UP
    req.picked_up_at = datetime.utcnow()
    req.updated_at = datetime.utcnow()
    _record_event(db, req, "PICKED_UP", "픽업 완료 처리")
    db.flush()
    return req


def pickup_cancel(db: Session, request_id: uuid.UUID) -> ShippingRequest:
    """실수로 처리한 픽업 완료를 준비 완료 상태로 되돌린다."""
    req = _get_request(db, request_id)
    if req.status != ShippingRequestStatusEnum.PICKED_UP:
        raise ShippingError("픽업 완료 요청에서만 픽업 완료를 취소할 수 있습니다.")
    if req.final_pf_item is None:
        raise ShippingError("최종 PF가 생성되지 않았습니다.")

    pickup_logs = (
        db.query(TransactionLog)
        .filter(
            TransactionLog.shipping_request_id == req.request_id,
            TransactionLog.shipping_phase == PICKUP_PHASE,
            TransactionLog.cancelled.is_(False),
        )
        .order_by(TransactionLog.created_at.desc(), TransactionLog.log_id.desc())
        .all()
    )
    if not pickup_logs:
        raise ShippingError("취소할 픽업 완료 재고 이력이 없습니다.")

    inventory_svc.lock_inventories(
        db,
        sorted({log.item_id for log in pickup_logs}),
    )
    now = datetime.utcnow()
    for log in pickup_logs:
        inv_effect.apply_effect_reverse(db, log.item_id, log.inventory_effect)
        inv = db.query(Inventory).filter(Inventory.item_id == log.item_id).first()
        if inv is not None:
            _sync_total(db, inv)
        log.cancelled = True
        log.cancel_reason = "픽업 완료 취소"
        log.cancelled_at = now

    consumed_allocations = (
        db.query(ShippingAllocation)
        .filter(
            ShippingAllocation.request_id == req.request_id,
            ShippingAllocation.status == ALLOCATION_CONSUMED,
        )
        .all()
    )
    if consumed_allocations:
        for allocation in consumed_allocations:
            allocation.status = ALLOCATION_RESERVED
            allocation.consumed_at = None
    else:
        _reserve_pickup_items(
            db,
            req,
            req.final_pf_item,
            _request_quantity(req),
            f"SHIP-PREP-{req.request_id.hex[:8]}",
        )

    req.status = ShippingRequestStatusEnum.PREPARED
    req.picked_up_at = None
    req.updated_at = now
    _record_event(db, req, "PICKUP_CANCELLED", "픽업 완료 취소")
    db.flush()
    return req
