"""Operator-authenticated census API; credentials never enter command receipts."""
from typing import Annotated, Literal
import uuid

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Query as ORMQuery, Session
from sqlalchemy.sql.dml import Insert

from app._actor import set_actor
from app.database import get_db
from app.models import (Employee, OperatorSession, StocktakeCloseChunk, StocktakeCloseCommit,
                        StocktakeCloseManifest, StocktakeCloseSeal, StocktakeCount, StocktakeEvent,
                        StocktakeGate, StocktakeRound, StocktakeTarget, SystemSetting)
from app.routers.operator_sessions import require_operator_session
from app.routers.employees import _effective_hidden_sidebar_tabs, _serialize_hidden_sidebar_tabs
from app.routers.settings import require_admin_readonly
from app.schemas import stocktake as schema
from app.services import audit, stocktake, stocktake_counts, stocktake_reads
from app.services._tx import commit_only
from app.services.inventory_conflicts import InventoryConflict
from app.services.stocktake_common import ROUND_COMMANDS, require_admin, require_round_manager

router = APIRouter()
Database = Annotated[Session, Depends(get_db)]
Operator = Annotated[tuple[Employee, OperatorSession], Depends(require_operator_session)]
Key = Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=128)]
MENU_VISIBILITY_KEY = "stocktake_menu_visible"
PARTICIPANT_DEPARTMENTS = ("창고", "튜브", "고압", "진공", "튜닝", "조립", "출하")


def admin_actor(operator: Operator, db: Database, pin: Annotated[str, Header(alias="X-Admin-Pin")]) -> Employee:
    """Require the current department approver and a fresh existing admin PIN check."""
    actor = operator[0]
    require_admin(actor)
    require_admin_readonly(db, pin)
    return actor


Admin = Annotated[Employee, Depends(admin_actor)]


def round_manager(operator: Operator) -> Employee:
    """Authorize the session employee's current department approval role without a shared PIN."""
    actor = operator[0]
    require_round_manager(actor)
    return actor


RoundManager = Annotated[Employee, Depends(round_manager)]


def _menu_participants(db: Session) -> ORMQuery[Employee]:
    """Only active participant workers receive bulk edits; managers keep personal choices."""
    return db.query(Employee).filter(
        Employee.is_active == "true", Employee.department.in_(PARTICIPANT_DEPARTMENTS),
        Employee.department_role.notin_(("primary", "deputy")),
    )


def _menu_visibility_response(db: Session, actor: Employee) -> schema.MenuVisibilityResponse:
    """Report the last bulk value separately from this actor's current personal visibility."""
    setting = db.get(SystemSetting, MENU_VISIBILITY_KEY)
    return schema.MenuVisibilityResponse(
        enabled=bool(setting and setting.setting_value == "true"),
        employee_visible="stocktake" not in _effective_hidden_sidebar_tabs(actor),
        participant_departments=list(PARTICIPANT_DEPARTMENTS), participant_count=_menu_participants(db).count(),
    )


@router.get("/menu-visibility", response_model=schema.MenuVisibilityResponse)
def get_menu_visibility(db: Database, operator: Operator) -> schema.MenuVisibilityResponse:
    """Every authenticated worker can resolve menu visibility before entering census."""
    return _menu_visibility_response(db, operator[0])


def _menu_visibility_upsert(dialect_name: str, value: str) -> Insert:
    """Concurrent first saves resolve on the single setting key without a read/insert race."""
    insert = sqlite_insert if dialect_name == "sqlite" else pg_insert
    statement = insert(SystemSetting).values(setting_key=MENU_VISIBILITY_KEY, setting_value=value)
    return statement.on_conflict_do_update(
        index_elements=[SystemSetting.setting_key],
        set_={"setting_value": statement.excluded.setting_value, "updated_at": func.now()},
    )


@router.put("/menu-visibility", response_model=schema.MenuVisibilityResponse)
def update_menu_visibility(payload: schema.MenuVisibilityUpdate, request: Request,
                           db: Database, actor: RoundManager) -> schema.MenuVisibilityResponse:
    """Reapply each participant's menu bit atomically; later personal edits remain independent."""
    value = "true" if payload.enabled else "false"
    try:
        db.execute(_menu_visibility_upsert(db.get_bind().dialect.name, value))
        participants = _menu_participants(db).populate_existing().with_for_update().all()
        for employee in participants:
            tabs = [tab for tab in _effective_hidden_sidebar_tabs(employee) if tab != "stocktake"]
            if not payload.enabled:
                tabs.append("stocktake")
            employee.hidden_sidebar_tabs = _serialize_hidden_sidebar_tabs(tabs)
        set_actor(request, actor)
        audit.record(db, request=request, action="stocktake.menu_visibility", target_type="settings",
                     target_id=MENU_VISIBILITY_KEY, payload_summary=f"enabled={value}",
                     actor_pin_role="department_approver")
        commit_only(db)
    except Exception:
        db.rollback()
        raise
    return _menu_visibility_response(db, actor)


def readable_round(db: Session, round_id: uuid.UUID, actor: Employee) -> StocktakeRound:
    """Workers need active census reads; past rounds belong to department approvers."""
    row = stocktake_reads.get_round(db, round_id)
    if row.status != "ACTIVE":
        require_round_manager(actor)
    return row


def _execute(request: Request, db: Session, actor: Employee, kind: str, key: str, payload: dict) -> dict:
    """Bind audit identity to the verified session, never a caller's employee field."""
    set_actor(request, actor)
    return stocktake.execute(db, actor, kind, key, payload)


@router.get("/rounds")
def rounds(db: Database, operator: Operator, limit: int = Query(50, ge=1, le=200), active_only: bool = False) -> dict:
    """Workers bootstrap active rounds; department approvers may also list history."""
    query = db.query(StocktakeRound)
    if active_only:
        query = query.filter(StocktakeRound.status == "ACTIVE")
    else:
        require_round_manager(operator[0])
    return {"items": [stocktake_reads.round_response(r) for r in query.order_by(StocktakeRound.started_at.desc(), StocktakeRound.round_id).limit(limit).all()]}


@router.get("/rounds/latest-summary")
def latest_round_summary(db: Database, operator: Operator) -> dict:
    """Expose only committed aggregate results; historic detail stays role-protected."""
    row = db.query(StocktakeRound).filter(StocktakeRound.status != "ACTIVE").order_by(
        StocktakeRound.closed_at.desc(), StocktakeRound.round_id.desc()).first()
    if row is None:
        return {"summary": None}
    committed = db.get(StocktakeCloseCommit, row.round_id)
    manifest = db.get(StocktakeCloseManifest, committed.manifest_id) if committed else None
    counts = manifest.header.get("projected_item_summary") if manifest else None
    return {"summary": {
        "round_id": str(row.round_id), "title": row.title, "status": row.status,
        "closed_at": row.closed_at.isoformat() + "Z" if row.closed_at else None,
        "item_summary": {key: counts[key] for key in ("total", "confirmed", "applied", "unconfirmed")}
        if counts is not None else None,
    }}


@router.get("/rounds/{round_id}")
def get_round(round_id: uuid.UUID, db: Database, operator: Operator) -> dict:
    """Expose the active boundary and admitted target generation."""
    return stocktake_reads.round_response(readable_round(db, round_id, operator[0]))


@router.get("/rounds/{round_id}/targets")
def targets(round_id: uuid.UUID, db: Database, operator: Operator, scope_id: str | None = None,
            status: str | None = None, search: str = Query("", max_length=200), cursor: str | None = Query(None, max_length=1000),
            limit: int = Query(50, ge=1, le=200), scope_kind: Literal["code", "warehouse"] | None = None,
            model_slots: Annotated[list[int] | None, Query()] = None,
            departments: Annotated[list[Literal["튜브", "고압", "진공", "튜닝", "조립", "출하"]] | None, Query()] = None,
            process_steps: Annotated[list[Literal["R", "A", "F", "DEFECT", "OBSOLETE"]] | None, Query()] = None,
            logic: Literal["AND", "OR"] = "AND", status_group: Literal["UNCONFIRMED", "CONFIRMED_ALL", "CONFIRMED_WAITING"] | None = None,
            group_by_item: bool = False) -> dict:
    """Filters affect the page, never the round's denominator."""
    readable_round(db, round_id, operator[0])
    return stocktake_reads.targets(db, round_id, scope_id=scope_id, status=status, search=search, cursor=cursor, limit=limit,
        scope_kind=scope_kind, model_slots=model_slots, process_steps=process_steps, logic=logic, status_group=status_group,
        group_by_item=group_by_item, departments=departments)


def waiting_filters(search: str = Query("", max_length=200),
                    departments: Annotated[list[Literal["튜브", "고압", "진공", "튜닝", "조립", "출하"]] | None, Query()] = None,
                    model_slots: Annotated[list[int] | None, Query()] = None,
                    process_steps: Annotated[list[Literal["R", "A", "F", "DEFECT", "OBSOLETE"]] | None, Query()] = None,
                    logic: Literal["AND", "OR"] = "AND") -> dict:
    """Share the exact item filters between waiting pages and whole-result selection."""
    return {"search": search, "departments": departments, "model_slots": model_slots,
            "process_steps": process_steps, "logic": logic}


@router.get("/rounds/{round_id}/waiting-targets")
def waiting_targets(round_id: uuid.UUID, db: Database, operator: Operator,
                    filters: Annotated[dict, Depends(waiting_filters)],
                    cursor: str | None = Query(None, max_length=1000),
                    limit: int = Query(50, ge=1, le=200)) -> dict:
    """A caller cannot select someone else's identity through query parameters."""
    readable_round(db, round_id, operator[0])
    return stocktake_reads.targets(db, round_id, group_by_item=True, waiting_owner_id=operator[0].employee_id,
                                   cursor=cursor, limit=limit, **filters)


@router.get("/rounds/{round_id}/waiting-selection")
def waiting_selection(round_id: uuid.UUID, db: Database, operator: Operator,
                      filters: Annotated[dict, Depends(waiting_filters)]) -> dict:
    """Select every matching owned confirmation without a page-size boundary."""
    readable_round(db, round_id, operator[0])
    return stocktake_reads.waiting_selection(db, round_id, operator[0].employee_id, **filters)


@router.post("/round-start-previews")
def start_preview(payload: schema.RoundStartPreview, request: Request, db: Database, actor: RoundManager, key: Key) -> dict:
    """Prepare all target rows before acquiring the short activation lock."""
    return _execute(request, db, actor, "round_start_preview", key, payload.model_dump(mode="json"))


@router.post("/rounds")
def start_round(payload: schema.PreviewRef, request: Request, db: Database, actor: RoundManager, key: Key) -> dict:
    """Activate the sealed set with an exclusive Control lock from the outset."""
    return _execute(request, db, actor, "round_start", key, payload.model_dump(mode="json"))


@router.post("/rounds/{round_id}/target-append-previews")
def append_preview(round_id: uuid.UUID, request: Request, db: Database, actor: RoundManager, key: Key) -> dict:
    """Prepare additions under the round's frozen membership policy, including zero cells."""
    return _execute(request, db, actor, "target_append_preview", key, {"round_id": str(round_id)})


@router.post("/rounds/{round_id}/target-appends")
def append_targets(round_id: uuid.UUID, payload: schema.PreviewRef, request: Request, db: Database, actor: RoundManager, key: Key) -> dict:
    """Publish an unchanged prepared addition as one target generation."""
    return _execute(request, db, actor, "target_append", key, {"round_id": str(round_id), **payload.model_dump(mode="json")})


@router.post("/targets/{target_id}/counts")
def start_count(target_id: uuid.UUID, payload: schema.CountStartBody, request: Request, db: Database, operator: Operator, key: Key) -> dict:
    """Count and recount are available to every active authenticated employee."""
    return _execute(request, db, operator[0], "count_start", key, {"target_id": str(target_id), **payload.model_dump(mode="json")})


@router.get("/counts/{count_id}")
def get_count(count_id: uuid.UUID, db: Database, operator: Operator) -> dict:
    """Read the current attempt and its previous-attempt link after release as well."""
    count = db.get(StocktakeCount, count_id)
    if count is None:
        raise InventoryConflict("NOT_FOUND", "계수를 찾을 수 없습니다.", status_code=404)
    target = db.get(StocktakeTarget, count.target_id)
    gate = db.get(StocktakeGate, (target.item_id, target.scope_key))
    result = stocktake_counts.response(count, gate)
    if stocktake_reads.get_round(db, count.round_id).status != "ACTIVE" and count.status != "APPLIED":
        result["status"] = "CLOSED_UNAPPLIED"
    return {**result, "previous_count_id": str(count.previous_count_id) if count.previous_count_id else None}


@router.patch("/counts/{count_id}")
def save_count(count_id: uuid.UUID, payload: schema.CountSaveBody, request: Request, db: Database, operator: Operator, key: Key) -> dict:
    """A successful save advances only the draft, never inventory."""
    return _execute(request, db, operator[0], "count_save", key, {"count_id": str(count_id), **payload.model_dump(mode="json")})


@router.post("/counts/{count_id}/confirm")
def confirm_count(count_id: uuid.UUID, payload: schema.CountVersionBody, request: Request, db: Database, operator: Operator, key: Key) -> dict:
    """Freeze a complete four-category count for a later selected application."""
    return _execute(request, db, operator[0], "count_confirm", key, {"count_id": str(count_id), **payload.model_dump(mode="json")})


@router.post("/counts/{count_id}/resume")
def resume_count(count_id: uuid.UUID, payload: schema.CountReleaseBody, request: Request, db: Database, operator: Operator, key: Key) -> dict:
    """Invalidate the previous confirmation while retaining the entered quantities."""
    return _execute(request, db, operator[0], "count_resume", key, {"count_id": str(count_id), **payload.model_dump(mode="json")})


@router.post("/counts/{count_id}/abandon")
def abandon_count(count_id: uuid.UUID, payload: schema.CountReleaseBody, request: Request, db: Database, operator: Operator, key: Key) -> dict:
    """The owner releases a count with an immutable reason and invalidated revision."""
    return _execute(request, db, operator[0], "count_abandon", key, {"count_id": str(count_id), **payload.model_dump(mode="json")})


@router.post("/counts/{count_id}/force-release")
def force_release(count_id: uuid.UUID, payload: schema.CountReleaseBody, request: Request, db: Database, actor: Admin, key: Key) -> dict:
    """Only an authenticated administrator may force another employee's count release."""
    return _execute(request, db, actor, "count_force_release", key, {"count_id": str(count_id), **payload.model_dump(mode="json")})


@router.post("/rounds/{round_id}/application-previews")
def application_preview(round_id: uuid.UUID, payload: schema.SelectionBody, request: Request, db: Database, operator: Operator, key: Key) -> dict:
    """Expose exact selected differences, reservations and per-category hold reasons."""
    return _execute(request, db, operator[0], "application_preview", key, {"round_id": str(round_id), **payload.model_dump(mode="json")})


@router.post("/rounds/{round_id}/applications")
def apply_counts(round_id: uuid.UUID, payload: schema.PreviewRef, request: Request, db: Database, operator: Operator, key: Key) -> dict:
    """Apply the entire sealed selection or roll back it together with the receipt."""
    return _execute(request, db, operator[0], "application_apply", key, {"round_id": str(round_id), **payload.model_dump(mode="json")})


@router.post("/rounds/{round_id}/application-bulk-previews")
def bulk_application_preview(round_id: uuid.UUID, payload: schema.BulkSelectionBody,
                             request: Request, db: Database, operator: Operator, key: Key) -> dict:
    """Seal one employee's exact selection across all admitted locations."""
    return _execute(request, db, operator[0], "application_bulk_preview", key,
                    {"round_id": str(round_id), **payload.model_dump(mode="json")})


@router.post("/rounds/{round_id}/bulk-applications")
def bulk_apply_counts(round_id: uuid.UUID, payload: schema.PreviewRef,
                      request: Request, db: Database, operator: Operator, key: Key) -> dict:
    """Commit all selected scopes together with one recoverable receipt."""
    return _execute(request, db, operator[0], "application_bulk_apply", key,
                    {"round_id": str(round_id), **payload.model_dump(mode="json")})


@router.post("/rounds/{round_id}/close-previews")
def close_preview(round_id: uuid.UUID, payload: schema.ClosePreviewBody, request: Request, db: Database, actor: RoundManager, key: Key) -> dict:
    """Prepare all close exclusions without holding the exclusive inventory boundary."""
    return _execute(request, db, actor, "round_close_preview", key, {"round_id": str(round_id), **payload.model_dump(mode="json")})


@router.post("/rounds/{round_id}/close")
def close_round(round_id: uuid.UUID, payload: schema.PreviewRef, request: Request, db: Database, actor: RoundManager, key: Key) -> dict:
    """Close and optionally apply up to 100 confirmations in at most three scopes."""
    return _execute(request, db, actor, "round_close", key, {"round_id": str(round_id), **payload.model_dump(mode="json")})


@router.get("/rounds/{round_id}/progress")
def round_progress(round_id: uuid.UUID, db: Database, operator: Operator) -> dict:
    """Closed rounds retain their actual closing statistics, including exclusions."""
    from app.services.stocktake_closing import projected_report
    from app.services.stocktake_reports import snapshot, worker_progress
    row = readable_round(db, round_id, operator[0])
    if row.status != "ACTIVE":
        committed = db.get(StocktakeCloseCommit, round_id)
        manifest = db.get(StocktakeCloseManifest, committed.manifest_id)
        entries = [entry for chunk in db.query(StocktakeCloseChunk).filter_by(manifest_id=manifest.manifest_id)
                   .order_by(StocktakeCloseChunk.chunk_index).all() for entry in chunk.entries]
        return {"round_id": str(round_id), "status": row.status, "manifest_id": str(manifest.manifest_id),
                **projected_report(manifest.header), "my_waiting": {"items": 0, "locations": 0},
                "worker_items": worker_progress(db, round_id, entries, project_selected=True)}
    result = snapshot(db, round_id, set())
    result["worker_items"] = worker_progress(db, round_id, result.pop("entries"))
    return {"round_id": str(round_id), "status": row.status, **result,
            "my_waiting": stocktake_reads.owned_waiting_summary(db, round_id, operator[0].employee_id)}


@router.get("/rounds/{round_id}/events")
def round_events(round_id: uuid.UUID, db: Database, operator: Operator,
                 count_id: uuid.UUID | None = None, cursor: str | None = Query(None, max_length=1000),
                 limit: int = Query(50, ge=1, le=200), order: Literal["legacy", "latest"] = "legacy",
                 include_saves: bool = True) -> dict:
    """Immutable count releases and closing reasons remain readable after invalidation."""
    readable_round(db, round_id, operator[0])
    from app.services.stocktake_events import event_page
    return event_page(db, round_id, count_id, cursor, limit, order, include_saves)


@router.get("/close-previews/{preview_id}/entries")
def close_entries(preview_id: uuid.UUID, db: Database, operator: Operator,
                  offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=200)) -> dict:
    """Only sealed chunks are exposed; expired previews remain historical evidence."""
    require_round_manager(operator[0])
    from app.services.stocktake_closing import CHUNK_SIZE
    published = db.query(StocktakeCloseSeal).filter_by(preview_id=preview_id).one_or_none()
    if published is None:
        raise InventoryConflict("NOT_FOUND", "봉인된 종료 증빙을 찾을 수 없습니다.", status_code=404)
    manifest = db.get(StocktakeCloseManifest, published.manifest_id)
    chunks = db.query(StocktakeCloseChunk).filter(StocktakeCloseChunk.manifest_id == published.manifest_id,
        StocktakeCloseChunk.chunk_index >= offset // CHUNK_SIZE,
        StocktakeCloseChunk.chunk_index <= (offset + limit - 1) // CHUNK_SIZE).order_by(StocktakeCloseChunk.chunk_index).all()
    entries = [entry for chunk in chunks for entry in chunk.entries]
    return {"manifest_id": str(manifest.manifest_id), "items": entries[offset % CHUNK_SIZE:offset % CHUNK_SIZE + limit],
            "total": manifest.row_count, "next_offset": offset + limit if offset + limit < manifest.row_count else None}


@router.get("/rounds/{round_id}/close-evidence")
def close_evidence(round_id: uuid.UUID, db: Database, operator: Operator) -> dict:
    """Resolve the committed seal and actor without scanning any target rows."""
    require_round_manager(operator[0])
    row = db.get(StocktakeCloseCommit, round_id)
    if row is None:
        raise InventoryConflict("NOT_FOUND", "종료된 회차의 증빙이 없습니다.", status_code=404)
    manifest = db.get(StocktakeCloseManifest, row.manifest_id)
    published = db.get(StocktakeCloseSeal, row.manifest_id)
    return {"manifest_id": str(row.manifest_id), "preview_id": str(published.preview_id),
            "actor_id": str(row.actor_id), "actor_name": row.actor_name, "reason": manifest.header["reason"],
            "mode": manifest.header["mode"], "closed_at": row.created_at.isoformat() + "Z", "applications": row.applications}


@router.get("/commands/{key}")
def receipt(key: str, db: Database, operator: Operator, kind: str = Query(...)) -> dict:
    """Resolve an uncertain response with the same employee, kind and external key."""
    if kind not in schema.COMMANDS:
        raise InventoryConflict("VALIDATION_ERROR", "지원하지 않는 명령 종류입니다.", status_code=422)
    return stocktake_reads.receipt(db, operator[0].employee_id, kind, key)


@router.post("/commands/{key}/resolve")
def resolve_command(key: str, body: schema.CommandResolution, request: Request, db: Database,
                    operator: Operator, pin: Annotated[str | None, Header(alias="X-Admin-Pin")] = None) -> dict:
    """Resolve only this authenticated actor's original key; never cancel completed work."""
    from app.services.stocktake_resolution import ADMIN_COMMANDS, resolve
    from app.services.inventory_conflicts import InventoryConflict
    actor = operator[0]
    if body.kind in ROUND_COMMANDS:
        require_round_manager(actor)
    if body.kind in ADMIN_COMMANDS:
        require_admin(actor)
        if not pin:
            raise InventoryConflict("ADMIN_PIN_REQUIRED", "관리자 PIN을 다시 입력해 주세요.", status_code=403)
        require_admin_readonly(db, pin)
    set_actor(request, actor)
    return resolve(db, actor, body.kind, key, body.command_payload, body.reason)
