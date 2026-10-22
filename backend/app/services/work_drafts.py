"""Read combined draft pages before loading only the selected work graphs."""
from __future__ import annotations

from typing import Any, Literal
import uuid

from sqlalchemy import String, case, cast, func, literal, or_, select, union_all
from sqlalchemy.orm import Session, defer, selectinload

from app.models import Employee, IoBatch, IoBundle, IoLine, Item, StockRequest, StockRequestLine, StockRequestStatusEnum
from app.services.io_dispatch import _dept_for_line, _operation_role_for_line, _transaction_type_for_line
from app.services.sr_validation import _TX_TYPE_BY_REQUEST
from app.services.work_reservation_queries import (
    SUB_TYPE_LABELS, WORK_TYPE_LABELS, _load_batches, _open_effects, _summary, _value, batch_detail,
)


# Keep the existing request vocabulary; these labels are search aliases only.
REQUEST_TYPE_LABELS = {
    "raw_receive": "원자재 입고", "raw_ship": "원자재 출고",
    "warehouse_to_dept": "창고 → 부서", "dept_to_warehouse": "부서 → 창고",
    "dept_internal": "부서 내부 이동", "mark_defective_wh": "창고 불량 등록",
    "mark_defective_prod": "생산 불량 등록", "supplier_return": "원자재 반품",
    "internal_use": "AS·연구 사용출고", "manual_adjustment": "수동 조정",
    "package_out": "출하", "defect_scrap": "불량 처리", "defect_return": "원자재 반품",
    "defect_disassemble": "불량 분해", "scrap_normal": "정상 폐기",
    "rework_normal": "정상 재작업", "return_normal": "정상 반품",
}
PUBLIC_SUMMARY_FIELDS = (
    "requester_employee_id", "requester_name", "requester_department", "requester_active",
    "work_type", "sub_type", "targets", "created_at", "updated_at",
)
PUBLIC_RESERVATION_FIELDS = (
    "reservation_status", "reservation_issue", "reserved_inputs", "expected_effects", "forecast_issue",
)
DEPARTMENT_SORT_ORDER = ("창고", "튜브", "고압", "진공", "튜닝", "조립", "출하")


def _history_lines(batch: IoBatch, effects: list[dict[str, Any]]) -> list[IoLine]:
    """Read canonical snapshot routes without mutating pre-finalization ORM lines."""
    by_line = {effect["operation_line_id"]: effect for effect in effects}
    lines = []
    for bundle in batch.bundles:
        for line in bundle.lines:
            effect = by_line.get(str(line.line_id))
            if effect is None:
                continue
            source, target = effect["from"], effect["to"]
            # A physical out snapshot has no destination, but internal use logs its recipient.
            to_department = target["department"] if target else (
                line.to_department if batch.sub_type == "internal_use_out" else None)
            lines.append(IoLine(
                line_id=line.line_id,
                direction=line.direction if line.direction in {"adjust", "defective"} else effect["kind"],
                from_bucket=source["bucket"] if source else "none",
                from_department=source["department"] if source else None,
                to_bucket=target["bucket"] if target else "none",
                to_department=to_department,
            ))
    return list(reversed(sorted(lines, key=lambda line: 0 if line.direction == "out" else 1)))


def _history_operation(batch: IoBatch, effects: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Match completed operation groups using saved lines, without loading log graphs."""
    logs = [(line, _transaction_type_for_line(batch, line), _value(_operation_role_for_line(batch, line)))
            for line in _history_lines(batch, effects)]
    mapped_ids = {str(log[0].line_id) for log in logs}
    if (not logs or any(log[1] is None for log in logs)
            or any(effect["operation_line_id"] not in mapped_ids for effect in effects)):
        return None
    produced = [log for log in logs if _value(log[1]) == "PRODUCE"]
    consumed = [log for log in logs if _value(log[1]) == "BACKFLUSH"]
    representative = None
    if batch.sub_type.startswith("disassemble") and consumed:
        representative = consumed[0]
    elif len(logs) > 1 and all(log[2] == "PRIMARY" for log in logs) and produced and consumed:
        representative = consumed[0] if len(consumed) < len(produced) else produced[0]
    if representative is None:
        for role in ("PRIMARY", "REWORK_PARENT_NORMAL", "REWORK_PARENT_DEFECTIVE", "PRODUCT_OUTPUT"):
            representative = next((log for log in logs if log[2] == role), None)
            if representative is not None:
                break
    line, tx_type, _ = representative or logs[0]
    display_type = _value(tx_type)
    if batch.sub_type.startswith("disassemble") and produced and consumed:
        display_type = "DISASSEMBLE"
    elif batch.sub_type.startswith(("produce", "disassemble")) and bool(produced) != bool(consumed):
        display_type = "ADJUST"
    return {"transaction_type": display_type, "department": _dept_for_line(line, tx_type)}


def _history_effects(batch: IoBatch, effects: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Order mapped public effects like completed logs, retaining unknown effects at the end."""
    ranks = {str(line.line_id): rank for rank, line in enumerate(_history_lines(batch, effects))}
    return sorted(effects, key=lambda effect: ranks.get(effect["operation_line_id"], len(ranks)))


def _io_summary(summary: dict[str, Any], batch: IoBatch) -> dict[str, Any]:
    """Expose only public fields and saved effect counts; missing plans stay unknown."""
    effects, issue = _open_effects(batch, {})
    movement_summary = None if issue is not None else {
        "increase": sum(effect["kind"] == "in" for effect in effects),
        "decrease": sum(effect["kind"] == "out" for effect in effects),
        "move": sum(effect["kind"] == "move" for effect in effects),
    }
    return {"kind": "io", "id": summary["batch_id"], "request_type": None,
        "movement_summary": movement_summary,
        "history_operation": _history_operation(batch, effects),
        **{field: summary[field] for field in PUBLIC_SUMMARY_FIELDS}}


def _stock_summary(request: StockRequest, owners: dict[uuid.UUID, Employee]) -> dict[str, Any]:
    """Legacy names/codes are saved snapshots; legacy lines have no stored unit column."""
    owner = owners.get(request.requester_employee_id)
    return {
        "kind": "stock_request", "id": str(request.request_id),
        "requester_employee_id": str(request.requester_employee_id), "requester_name": request.requester_name,
        "requester_department": request.requester_department, "requester_active": bool(owner and owner.is_active),
        "work_type": None, "sub_type": None, "request_type": _value(request.request_type),
        "movement_summary": None,
        "history_operation": _stock_history_operation(request),
        "targets": [{"item_id": str(line.item_id) if line.item_id else None,
            "item_name": line.item_name_snapshot, "mes_code": line.mes_code_snapshot,
            "unit": line.item.unit if line.item else "EA", "quantity": int(line.quantity)} for line in request.lines],
        "created_at": request.created_at, "updated_at": request.updated_at,
    }


def _stock_history_operation(request: StockRequest) -> dict[str, Any] | None:
    """Reuse approval execution's type table and log department for legacy requests."""
    tx_type = _TX_TYPE_BY_REQUEST.get(request.request_type)
    if tx_type is None or not request.lines:
        return None
    line = request.lines[-1]
    department = line.to_department if _value(request.request_type) in {
        "internal_use", "mark_defective_wh", "mark_defective_prod",
    } else line.from_department
    return {"transaction_type": _value(tx_type), "department": _value(department)}


def _stock_query(db: Session) -> Any:
    """Load line identities in one bounded eager query, including optional item masters."""
    return db.query(StockRequest).options(
        defer(StockRequest.notes), defer(StockRequest.reason_memo),
        selectinload(StockRequest.lines).joinedload(StockRequestLine.item))


def list_work_drafts(
    db: Session, *, search: str | None = None, requester_department: str | None = None,
    requester_employee_id: uuid.UUID | None = None, skip: int = 0, limit: int = 30,
    sort: Literal["updated_desc", "updated_asc", "department"] = "updated_desc",
) -> dict[str, Any]:
    """Filter/count/page both kinds together; load no off-page bundles, lines, or forecasts."""
    io = select(literal("io").label("kind"), IoBatch.batch_id.label("id"), IoBatch.updated_at, IoBatch.requester_department).where(IoBatch.status == "draft")
    stock = select(literal("stock_request").label("kind"), StockRequest.request_id.label("id"), StockRequest.updated_at, StockRequest.requester_department).where(
        StockRequest.status == StockRequestStatusEnum.DRAFT)
    for name, value in (("requester_department", requester_department), ("requester_employee_id", requester_employee_id)):
        if value is not None:
            io = io.where(getattr(IoBatch, name) == value)
            stock = stock.where(getattr(StockRequest, name) == value)
    if term := (search or "").strip():
        pattern = "%" + term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        io = io.where(or_(
            *(column.ilike(pattern, escape="\\") for column in (
                IoBatch.requester_name, IoBatch.requester_department, IoBatch.work_type, IoBatch.sub_type)),
            IoBatch.work_type.in_([key for key, label in WORK_TYPE_LABELS.items() if term.casefold() in label.casefold()]),
            IoBatch.sub_type.in_([key for key, label in SUB_TYPE_LABELS.items() if term.casefold() in label.casefold()]),
            IoBatch.bundles.any(IoBundle.source_item.has(or_(
                Item.item_name.ilike(pattern, escape="\\"), Item.mes_code.ilike(pattern, escape="\\")))),
        ))
        stock = stock.where(or_(
            *(column.ilike(pattern, escape="\\") for column in (
                StockRequest.requester_name, StockRequest.requester_department, cast(StockRequest.request_type, String))),
            StockRequest.request_type.in_([key for key, label in REQUEST_TYPE_LABELS.items() if term.casefold() in label.casefold()]),
            StockRequest.lines.any(or_(StockRequestLine.item_name_snapshot.ilike(pattern, escape="\\"),
                StockRequestLine.mes_code_snapshot.ilike(pattern, escape="\\"))),
        ))
    with db.no_autoflush:
        combined = union_all(io, stock).subquery()
        total = db.scalar(select(func.count()).select_from(combined))
        order = [combined.c.updated_at.asc() if sort == "updated_asc" else combined.c.updated_at.desc()]
        if sort == "department":
            order = [case({name: index for index, name in enumerate(DEPARTMENT_SORT_ORDER)},
                value=combined.c.requester_department, else_=len(DEPARTMENT_SORT_ORDER)),
                combined.c.requester_department, combined.c.updated_at.desc()]
        page = db.execute(select(combined).order_by(*order, combined.c.kind, combined.c.id).offset(skip).limit(limit)).all()
        if not page:
            return {"items": [], "total": total, "skip": skip, "limit": limit}
        io_ids = [row.id for row in page if row.kind == "io"]
        stock_ids = [row.id for row in page if row.kind == "stock_request"]
        batches = _load_batches(db, db.query(IoBatch).options(defer(IoBatch.notes)).filter(IoBatch.batch_id.in_(io_ids))) if io_ids else []
        requests = _stock_query(db).filter(StockRequest.request_id.in_(stock_ids)).all() if stock_ids else []
        owner_ids = {work.requester_employee_id for work in [*batches, *requests]}
        owners = {owner.employee_id: owner for owner in db.query(Employee).filter(Employee.employee_id.in_(owner_ids)).all()}
        summaries = {("io", batch.batch_id): _io_summary(_summary(batch, owners), batch) for batch in batches}
        summaries.update({("stock_request", request.request_id): _stock_summary(request, owners) for request in requests})
        return {"items": [summaries[(row.kind, row.id)] for row in page], "total": total, "skip": skip, "limit": limit}


def get_work_draft(db: Session, kind: Literal["io", "stock_request"], work_id: uuid.UUID) -> dict[str, Any] | None:
    """Return public draft detail only; unavailable legacy reservations stay explicitly unknown."""
    with db.no_autoflush:
        if kind == "io":
            batch = db.query(IoBatch).filter(IoBatch.batch_id == work_id, IoBatch.status == "draft").first()
            if batch is None:
                return None
            detail = batch_detail(db, batch, include_history=False)
            detail["expected_effects"] = _history_effects(batch, detail["expected_effects"])
            return {**_io_summary(detail, batch), **{field: detail[field] for field in PUBLIC_RESERVATION_FIELDS}}
        request = _stock_query(db).filter(StockRequest.request_id == work_id, StockRequest.status == StockRequestStatusEnum.DRAFT).first()
        if request is None:
            return None
        owner = db.get(Employee, request.requester_employee_id)
        return {**_stock_summary(request, {owner.employee_id: owner} if owner else {}),
            **dict.fromkeys(PUBLIC_RESERVATION_FIELDS)}
