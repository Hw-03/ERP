"""Read-only reservation snapshots; physical locations and stored plans are never created here."""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable
import uuid

from pydantic import ValidationError
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Employee, Item, IoBatch, IoBundle, IoLine, IoDraftReservation,
    IoWorkReservationEvent, ShippingAllocation, StockRequest, StockRequestLine,
)
from app.schemas.work_reservations import WorkEffectivePlan
from app.services.work_reservation_errors import WorkReservationError
from app.services.work_stocktake_pause import batch_pause_payloads, pause_payload


OPEN_STATUSES = {"submitted", "reserved"}
OPEN_BATCH_STATUSES = {"draft", "submitted", "reserved", "partially_completed"}
RESERVATION_FIELDS = ("work_reserved_quantity", "approval_reserved_quantity", "shipping_reserved_quantity")
FORECAST_FIELDS = ("expected_in_quantity", "expected_out_quantity", "transfer_in_quantity", "transfer_out_quantity")
LEGACY_DIRECT_SUB_TYPES = {
    "warehouse_io": {"warehouse_to_dept", "dept_to_warehouse", "dept_transfer"},
    "receive": {"receive_supplier", "outbound_supplier"},
    "tube_material": {"tube_receive_supplier", "tube_outbound_supplier"},
}
# Match the compose/admin vocabulary in frontend/lib/io/glossary.ts, not transaction labels.
WORK_TYPE_LABELS = {
    "receive": "원자재 입출고",
    "tube_material": "튜브 원자재 입출고",
    "warehouse_io": "창고 입출고",
    "warehouse_adjust": "창고 수량 보정",
    "process": "부서 입출고",
    "defect": "불량",
    "internal_use": "AS·연구 사용출고",
}
SUB_TYPE_LABELS = {
    "receive_supplier": "원자재 입고",
    "outbound_supplier": "원자재 출고",
    "tube_receive_supplier": "튜브 원자재 입고",
    "tube_outbound_supplier": "튜브 원자재 출고",
    "warehouse_to_dept": "창고 → 부서",
    "dept_to_warehouse": "부서 → 창고",
    "dept_transfer": "부서 → 부서",
    "produce": "생산",
    "disassemble": "분해",
    "adjust_in": "수량보정 입고",
    "adjust_out": "출고",
    "warehouse_adjust_in": "보정 입고",
    "warehouse_adjust_out": "보정 출고",
    "defect_quarantine": "새 불량",
    "defect_restore": "불량 해제",
    "defect_process": "불량 처리",
    "supplier_return": "원자재 반품",
    "internal_use_out": "AS·연구 사용출고",
}


def _value(value: Any) -> Any:
    """Normalize enum columns without changing their persisted meaning."""
    return getattr(value, "value", value)


def _identity(item: Item) -> dict[str, Any]:
    """Use master identity for ledger-only rows that have no line snapshot."""
    return {"item_id": str(item.item_id), "item_name": item.item_name, "mes_code": item.mes_code, "unit": item.unit}


def _location(bucket: str, department: str | None) -> dict[str, Any]:
    """Warehouse has a null department even though the draft ledger uses an empty key."""
    return {"bucket": _value(bucket), "department": None if _value(bucket) == "warehouse" else _value(department)}


def _load_batches(db: Session, query: Any) -> list[IoBatch]:
    """Fetch bundles, lines, and source identities in a fixed number of queries."""
    return query.options(
        selectinload(IoBatch.bundles).joinedload(IoBundle.source_item),
        selectinload(IoBatch.bundles).selectinload(IoBundle.lines),
    ).all()


def _summary(batch: IoBatch, owners: dict[uuid.UUID, Employee]) -> dict[str, Any]:
    """Use the current source/reference line; the bundle quantity may be a BOM preview basis."""
    owner = owners.get(batch.requester_employee_id)
    targets = []
    for bundle in batch.bundles:
        if bundle.source_item is not None:
            source_origin = "manual" if bundle.source_kind == "manual" else "direct"
            source_line = next((line for line in bundle.lines
                                if line.item_id == bundle.source_item_id and line.origin == source_origin), None)
            # Reference-only parents still describe the purpose; child effects do not.
            quantity = source_line.quantity if source_line is not None else bundle.quantity
            targets.append({**_identity(bundle.source_item), "quantity": int(quantity)})
    return {
        "batch_id": str(batch.batch_id), "revision": batch.revision, "status": batch.status,
        "stocktake_pause": None,
        "reservation_status": batch.reservation_status, "reservation_issue": batch.reservation_issue,
        "work_type": batch.work_type, "sub_type": batch.sub_type, "reference_no": batch.reference_no,
        "requester_employee_id": str(batch.requester_employee_id), "requester_name": batch.requester_name,
        "requester_department": batch.requester_department, "requester_active": bool(owner and owner.is_active),
        "targets": targets, "created_at": batch.created_at, "updated_at": batch.updated_at,
    }


def _legacy_direct_effects(batch: IoBatch, items: dict[uuid.UUID, Item]) -> list[dict[str, Any]]:
    """Reconstruct only direct routes using the planner's pure primitives and prefetched items.

    BOM, manual, process and internal-use work need policy/approval-plan interpretation;
    they require a stored snapshot instead of invoking the query-heavy write planner on GET.
    """
    from app.services.io_effective_plan import _clone_batch, _effect
    from app.services.io_preview import AUTOMATIC_DEPARTMENT_SUB_TYPES, _route_for_sub_type

    if batch.sub_type not in LEGACY_DIRECT_SUB_TYPES.get(batch.work_type, set()):
        raise ValueError("Legacy work requires a stored effective plan")
    clone = _clone_batch(batch)
    effects = []
    for bundle in clone.bundles:
        if bundle.source_kind != "direct_item" or bundle.source_item_id is None:
            raise ValueError("Legacy bundle requires BOM or manual interpretation")
        for line in bundle.lines:
            if (line.origin != "direct" or line.item_id != bundle.source_item_id
                    or line.bom_stock_exempt or line.bom_auto_token):
                raise ValueError("Legacy line requires BOM policy interpretation")
            item = items.get(line.item_id)
            if item is None or item.deleted_at is not None:
                raise ValueError("Legacy item is no longer available for the current planner")
            if batch.sub_type == "receive_supplier" and not (item.process_type_code or "").endswith("R"):
                raise ValueError("Legacy raw receipt item no longer has a raw process code")
            if batch.work_type == "tube_material" and item.process_type_code != "TR":
                raise ValueError("Legacy tube material no longer has the TR process code")
            route = _route_for_sub_type(
                batch.sub_type, item=item, from_department=line.from_department,
                to_department=line.to_department, role="result",
            )
            fields = ("direction", "from_bucket", "from_department", "to_bucket", "to_department")
            if batch.sub_type in AUTOMATIC_DEPARTMENT_SUB_TYPES:
                for field, value in zip(fields, route):
                    setattr(line, field, value)
            elif tuple(getattr(line, field) for field in fields) != route:
                raise ValueError("Legacy line does not match its direct operation route")
            if line.included:
                effects.append(_effect(line))
    return sorted(effects, key=lambda effect: effect["effect_id"])


def _open_effects(batch: IoBatch, items: dict[uuid.UUID, Item]) -> tuple[list[dict[str, Any]], dict[str, str] | None]:
    """Use stored snapshots or bounded pure legacy reconstruction, never the write planner."""
    try:
        if batch.effective_plan is not None:
            plan = WorkEffectivePlan.model_validate(batch.effective_plan).model_dump(by_alias=True)
            return plan["effects"], None
        if batch.status != "draft":
            return _legacy_direct_effects(batch, items), None
    except (WorkReservationError, ValueError, ValidationError):
        pass
    return [], {"code": "unsupported_legacy_plan", "message": "저장 계획이 없거나 안전한 직접 품목 작업 복원 범위를 벗어나 예정량을 계산할 수 없습니다."}


def _is_open(request: StockRequest, line: StockRequestLine) -> bool:
    """Approval timestamps do not settle a still-reserved internal-use request."""
    return _value(request.status) in OPEN_STATUSES and _value(line.status) in OPEN_STATUSES


def _is_reserved(request: StockRequest, line: StockRequestLine) -> bool:
    """Only RESERVED rows have changed the physical source's pending counter."""
    return _value(request.status) == "reserved" and _value(line.status) == "reserved"


def _closed_in_current_submission(batch: IoBatch, request: StockRequest, line: StockRequestLine) -> bool:
    """Old cancelled/rejected rounds cannot explain a missing current execution mapping."""
    statuses = {_value(request.status), _value(line.status)}
    if not statuses & {"completed", "cancelled", "rejected", "failed_approval"}:
        return False
    if batch.submitted_at is None:
        # Legacy completion is physical evidence; cancellation alone cannot prove a round.
        return "completed" in statuses
    return request.created_at >= batch.submitted_at


def _matches_effect(line: StockRequestLine, effect: dict[str, Any]) -> bool:
    """A legacy reconstruction is safe only when the execution row still describes that effect."""
    source = None if _value(line.from_bucket) == "none" else _location(line.from_bucket, line.from_department)
    target = None if _value(line.to_bucket) == "none" else _location(line.to_bucket, line.to_department)
    return (str(line.item_id) == effect["item_id"] and line.quantity == effect["quantity"]
            and source == effect["from"] and target == effect["to"])


def _related_work(db: Session, batch: IoBatch, owners: dict[uuid.UUID, Employee],
                  ledger: list[IoDraftReservation], requests: list[StockRequest],
                  items: dict[uuid.UUID, Item]) -> dict[str, Any]:
    """Project actual reservations and uniquely mapped currently open effects."""
    result = {**_summary(batch, owners), "reserved_inputs": [], "expected_effects": [], "forecast_issue": None}
    if batch.status not in OPEN_BATCH_STATUSES:
        return result
    if batch.status == "draft" and batch.reservation_status not in {"reserved", "not_required"}:
        return result
    effects, issue = _open_effects(batch, items)
    result["forecast_issue"] = issue
    if batch.status == "draft":
        result["expected_effects"] = effects
        for row in ledger:
            location = _location(row.source_bucket, row.source_department)
            result["reserved_inputs"].append({
                **_identity(items[row.item_id]), "location": location, "quantity": int(row.quantity),
                "source": "draft", "stock_request_id": None,
                "operation_line_ids": sorted({effect["operation_line_id"] for effect in effects
                    if effect["item_id"] == str(row.item_id) and effect["from"] == location}),
            })
        return result

    active: dict[str, list[StockRequestLine]] = defaultdict(list)
    closed: set[str] = set()
    mapping_issue = False
    effect_operations = {effect["operation_line_id"] for effect in effects}
    for request in requests:
        for line in request.lines:
            operation_id = str(line.operation_line_id) if line.operation_line_id else None
            if not _is_open(request, line):
                if operation_id and _closed_in_current_submission(batch, request, line):
                    closed.add(operation_id)
                continue
            if operation_id:
                active[operation_id].append(line)
            else:
                mapping_issue = True
            if _is_reserved(request, line) and _value(line.from_bucket) in {"warehouse", "production"}:
                result["reserved_inputs"].append({
                    "item_id": str(line.item_id), "item_name": line.item_name_snapshot,
                    "mes_code": line.mes_code_snapshot, "unit": items[line.item_id].unit,
                    "location": _location(line.from_bucket, line.from_department), "quantity": int(line.quantity),
                    "source": "approval", "stock_request_id": str(request.request_id),
                    "operation_line_ids": [operation_id] if operation_id else [],
                })
    for effect in effects:
        matches = active.get(effect["operation_line_id"], [])
        if len(matches) == 1 and _matches_effect(matches[0], effect):
            result["expected_effects"].append(effect)
        elif matches or effect["operation_line_id"] not in closed:
            mapping_issue = True
    # Mapped reference-only lines intentionally have no physical effect.
    known_line_ids = {str(line.line_id) for bundle in batch.bundles for line in bundle.lines}
    if any(operation not in known_line_ids | effect_operations for operation in active):
        mapping_issue = True
    if any(operation not in effect_operations and any(
        _value(line.from_bucket) != "none" or _value(line.to_bucket) != "none" for line in lines
    ) for operation, lines in active.items()):
        mapping_issue = True
    if mapping_issue and issue is None:
        result["forecast_issue"] = {"code": "missing_effect_mapping", "message": "현재 승인 라인과 작업 효과의 연결이 누락되거나 중복되었습니다."}
    return result


def _context(db: Session, batches: list[IoBatch], item_ids: Iterable[uuid.UUID] = ()) -> tuple[dict, list, list, dict, dict]:
    """Load all current stock sources together, including independent requests for requested items."""
    batch_ids = [batch.batch_id for batch in batches]
    ids = list(item_ids)
    owners = {row.employee_id: row for row in db.query(Employee).filter(
        Employee.employee_id.in_({batch.requester_employee_id for batch in batches})).all()}
    ledger_rows = db.query(IoDraftReservation, IoBatch.requester_department).join(IoBatch).filter(
        IoBatch.status == "draft", IoBatch.reservation_status == "reserved",
        or_(IoDraftReservation.batch_id.in_(batch_ids), IoDraftReservation.item_id.in_(ids)),
    ).all()
    ledger = [row for row, _ in ledger_rows]
    ledger_departments = {row.batch_id: department for row, department in ledger_rows}
    requests = db.query(StockRequest).filter(or_(
        StockRequest.operation_batch_id.in_(batch_ids),
        StockRequest.lines.any(StockRequestLine.item_id.in_(ids)),
    )).options(selectinload(StockRequest.lines)).all()
    identity_ids = {row.item_id for row in ledger} | {line.item_id for request in requests for line in request.lines}
    identity_ids.update(line.item_id for batch in batches for bundle in batch.bundles for line in bundle.lines)
    items = {row.item_id: row for row in db.query(Item).filter(Item.item_id.in_(identity_ids)).all()}
    return owners, ledger, requests, items, ledger_departments


def empty_summary() -> dict[str, Any]:
    """Return fresh arrays for an item with no reservation or forecast sources."""
    return {**dict.fromkeys(RESERVATION_FIELDS + FORECAST_FIELDS, 0), "forecast_complete": True,
            "reservation_by_location": [], "forecast_by_location": [], "reservation_by_requester_department": []}


def bulk_inventory_work_status(db: Session, item_ids: Iterable[uuid.UUID]) -> dict[uuid.UUID, dict[str, Any]]:
    """Aggregate a page of item IDs without per-item queries or writes."""
    ids = list(dict.fromkeys(item_ids))
    if not ids:
        return {}
    with db.no_autoflush:
        batches = _load_batches(db, db.query(IoBatch).filter(
            IoBatch.status.in_(OPEN_BATCH_STATUSES),
            IoBatch.bundles.any(or_(IoBundle.source_item_id.in_(ids), IoBundle.lines.any(IoLine.item_id.in_(ids)))),
        ).order_by(IoBatch.updated_at, IoBatch.batch_id))
        owners, ledger, requests, items, ledger_departments = _context(db, batches, ids)
        shipping = db.query(ShippingAllocation).filter(ShippingAllocation.item_id.in_(ids), ShippingAllocation.status == "RESERVED").all()
        by_batch_ledger: dict[uuid.UUID, list] = defaultdict(list)
        by_batch_request: dict[uuid.UUID, list] = defaultdict(list)
        for row in ledger:
            by_batch_ledger[row.batch_id].append(row)
        for request in requests:
            by_batch_request[request.operation_batch_id].append(request)
        result = {iid: {"item_id": str(iid), "summary": empty_summary(), "works": []} for iid in ids}
        by_string = {str(iid): iid for iid in ids}
        reservation_cells: dict[uuid.UUID, dict] = defaultdict(dict)
        requester_cells: dict[uuid.UUID, dict] = defaultdict(dict)
        forecast_cells: dict[uuid.UUID, dict] = defaultdict(dict)

        def add(iid: uuid.UUID, location: dict, field: str, quantity: int, *, forecast: bool = False) -> None:
            """Accumulate a selected item into both the total and its separate location projection."""
            if iid not in result:
                return
            result[iid]["summary"][field] += quantity
            cells = forecast_cells[iid] if forecast else reservation_cells[iid]
            key = (location["bucket"], location["department"] or "")
            cell = cells.setdefault(key, {"location": location, **dict.fromkeys(FORECAST_FIELDS if forecast else RESERVATION_FIELDS, 0)})
            cell[field] += quantity

        def add_requester(iid: uuid.UUID, department: str | None, field: str, quantity: int) -> None:
            """Group existing reservation amounts by requester snapshot, never source stock."""
            if iid not in result:
                return
            department = department.strip() if department else None
            key = department or ""
            cell = requester_cells[iid].setdefault(key, {
                "requester_department": department or None, **dict.fromkeys(RESERVATION_FIELDS, 0),
            })
            cell[field] += quantity

        for row in ledger:
            add(row.item_id, _location(row.source_bucket, row.source_department), "work_reserved_quantity", int(row.quantity))
            add_requester(row.item_id, ledger_departments[row.batch_id], "work_reserved_quantity", int(row.quantity))
        for request in requests:
            for line in request.lines:
                if not _is_open(request, line):
                    continue
                if _is_reserved(request, line) and _value(line.from_bucket) in {"warehouse", "production"}:
                    add(line.item_id, _location(line.from_bucket, line.from_department), "approval_reserved_quantity", int(line.quantity))
                    add_requester(line.item_id, request.requester_department, "approval_reserved_quantity", int(line.quantity))
                if request.operation_batch_id is None and line.item_id in result:
                    result[line.item_id]["summary"]["forecast_complete"] = False
        for row in shipping:
            add(row.item_id, _location("production" if row.department else "warehouse", row.department), "shipping_reserved_quantity", int(row.quantity))
            # Shipping stores a stock department, but no reserving employee department snapshot.
            add_requester(row.item_id, None, "shipping_reserved_quantity", int(row.quantity))
        pauses = batch_pause_payloads(db, [("io", batch.batch_id) for batch in batches if batch.status == "draft"])
        for batch in batches:
            work = _related_work(db, batch, owners, by_batch_ledger[batch.batch_id], by_batch_request[batch.batch_id], items)
            work["stocktake_pause"] = pauses.get(("io", batch.batch_id))
            related_ids = {str(line.item_id) for bundle in batch.bundles for line in bundle.lines}
            related_ids.update(target["item_id"] for target in work["targets"])
            related_ids.update(effect["item_id"] for effect in work["expected_effects"])
            for item_id in related_ids & by_string.keys():
                result[by_string[item_id]]["works"].append(work)
                if work["forecast_issue"]:
                    result[by_string[item_id]]["summary"]["forecast_complete"] = False
            for effect in work["expected_effects"]:
                iid = by_string.get(effect["item_id"])
                if iid is None:
                    continue
                quantity = effect["quantity"]
                if effect["kind"] == "move":
                    add(iid, effect["from"], "transfer_out_quantity", quantity, forecast=True)
                    add(iid, effect["to"], "transfer_in_quantity", quantity, forecast=True)
                else:
                    incoming = effect["kind"] == "in"
                    add(iid, effect["to"] if incoming else effect["from"],
                        "expected_in_quantity" if incoming else "expected_out_quantity", quantity, forecast=True)
        for iid, row in result.items():
            row["summary"]["reservation_by_location"] = [cell for _, cell in sorted(reservation_cells[iid].items())]
            row["summary"]["reservation_by_requester_department"] = [cell for _, cell in sorted(requester_cells[iid].items())]
            row["summary"]["forecast_by_location"] = [cell for _, cell in sorted(forecast_cells[iid].items())]
        return result


def batch_detail(db: Session, batch: IoBatch, include_history: bool = False) -> dict[str, Any]:
    """Provide a shared detail projection; audit reasons are opt-in for administrators only."""
    with db.no_autoflush:
        _load_batches(db, db.query(IoBatch).filter(IoBatch.batch_id == batch.batch_id))
        owners, ledger, requests, items, _ = _context(db, [batch])
        result = _related_work(db, batch, owners, ledger, requests, items)
        if batch.status == "draft":
            result["stocktake_pause"] = pause_payload(db, "io", batch.batch_id)
        if include_history:
            events = db.query(IoWorkReservationEvent).filter_by(batch_id=batch.batch_id).order_by(
                IoWorkReservationEvent.created_at, IoWorkReservationEvent.event_id).all()
            result.update(notes=batch.notes, effective_plan=batch.effective_plan, history=[{
                "event_id": str(event.event_id), "action": event.action, "revision": event.to_revision,
                "occurred_at": event.created_at, "actor_employee_id": str(event.actor_employee_id) if event.actor_employee_id else None,
                "actor_name": event.actor_name, "reason": event.reason,
            } for event in events])
        return result


def list_admin_work_reservations(db: Session, **filters: Any) -> dict[str, Any]:
    """List draft work in oldest-saved order while preserving cancellation history in detail reads."""
    skip, limit = filters.get("skip", 0), filters.get("limit", 50)
    with db.no_autoflush:
        query = db.query(IoBatch).filter(IoBatch.status == "draft")
        for name in ("requester_department", "requester_employee_id"):
            if filters.get(name) is not None:
                query = query.filter(getattr(IoBatch, name) == filters[name])
        if search := (filters.get("search") or "").strip():
            try:
                search_batch_id = uuid.UUID(search)
            except ValueError:
                search_batch_id = None
            pattern = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            query = query.filter(or_(
                *(column.ilike(pattern, escape="\\") for column in (
                    IoBatch.requester_name, IoBatch.work_type, IoBatch.sub_type, IoBatch.reference_no)),
                IoBatch.batch_id == search_batch_id if search_batch_id is not None else False,
                IoBatch.work_type.in_([value for value, label in WORK_TYPE_LABELS.items() if search.casefold() in label.casefold()]),
                IoBatch.sub_type.in_([value for value, label in SUB_TYPE_LABELS.items() if search.casefold() in label.casefold()]),
                IoBatch.bundles.any(IoBundle.source_item.has(or_(Item.item_name.ilike(pattern, escape="\\"), Item.mes_code.ilike(pattern, escape="\\")))),
            ))
        total = query.count()
        batches = _load_batches(db, query.order_by(IoBatch.updated_at.asc(), IoBatch.batch_id.asc()).offset(skip).limit(limit))
        owners = {row.employee_id: row for row in db.query(Employee).filter(Employee.employee_id.in_({batch.requester_employee_id for batch in batches})).all()}
        pauses = batch_pause_payloads(db, [("io", batch.batch_id) for batch in batches])
        return {"items": [{**_summary(batch, owners), "stocktake_pause": pauses.get(("io", batch.batch_id))}
            for batch in batches], "total": total, "skip": skip, "limit": limit}
