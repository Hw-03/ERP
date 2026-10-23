"""Preserve work intent while a stocktake establishes its current physical cells."""
from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
import uuid

from sqlalchemy import tuple_
from sqlalchemy.orm import Session

from app.models import (InventoryScope, IoBatch, IoDraftReservation, StockRequest,
                        StockRequestStatusEnum, StocktakeCount, StocktakeGate,
                        StocktakeTarget, StocktakeTargetSet, StocktakeWorkPause)
from app.services import io_reservations, stocktake_guard
from app.services.work_reservation_errors import WorkReservationError


def _cells(cells: Iterable[dict]) -> list[dict[str, str]]:
    """Canonical identities make unions stable and keep JSON independent of ORM UUIDs."""
    return [{"item_id": item, "scope_key": scope} for item, scope in sorted({
        (str(cell["item_id"]), str(cell["scope_key"])) for cell in cells})]


def io_required_cells(db: Session, batch: IoBatch, plan: dict | None = None) -> list[dict[str, str]]:
    """Use frozen execution endpoints, with conservative included-line legacy fallback."""
    scopes = {scope.physical_department: scope.scope_key for scope in db.query(InventoryScope).all()}
    snapshot = plan if plan is not None else batch.effective_plan
    if snapshot is not None:
        effects = snapshot.get("effects", [])
    else:
        effects = [{"item_id": line.item_id,
                    "from": {"bucket": line.from_bucket, "department": line.from_department},
                    "to": {"bucket": line.to_bucket, "department": line.to_department}}
                   for bundle in batch.bundles for line in bundle.lines if line.included and line.quantity > 0]
    result = []
    for effect in effects:
        for endpoint in (effect.get("from"), effect.get("to")):
            if endpoint is None or endpoint.get("bucket") == "none":
                continue
            bucket = endpoint.get("bucket")
            department = endpoint.get("department")
            department = getattr(department, "value", department)
            scope = ("warehouse" if bucket == "warehouse" else scopes.get(department)
                     if bucket in {"production", "defective"} else None)
            result.append({"item_id": str(effect["item_id"]),
                           "scope_key": scope or f"unresolved:{bucket}:{department}"})
    return _cells(result)


def _readiness(db: Session, requests: Iterable[tuple[uuid.UUID, list[dict]]], *, lock: bool = False) -> dict:
    """Only each target's latest APPLIED attempt with a released gate is sufficient."""
    requests = list(requests)
    round_ids = {round_id for round_id, _ in requests}
    ids = {uuid.UUID(cell["item_id"]) for _, cells in requests for cell in cells}
    query = db.query(StocktakeTarget, StocktakeTargetSet.round_id).join(StocktakeTargetSet).filter(
        StocktakeTargetSet.round_id.in_(round_ids), StocktakeTarget.item_id.in_(ids)).order_by(StocktakeTarget.target_id)
    if lock and db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update(of=StocktakeTarget)
    targets = {(round_id, str(target.item_id), target.scope_key): target
               for target, round_id in query.populate_existing().all()}
    count_ids = {target.latest_count_id for target in targets.values() if target.latest_count_id}
    counts = {count.count_id: count for count in db.query(StocktakeCount).filter(
        StocktakeCount.count_id.in_(count_ids)).populate_existing().all()}
    gates = {(str(gate.item_id), gate.scope_key): gate for gate in db.query(StocktakeGate).filter(
        StocktakeGate.item_id.in_(ids)).populate_existing().all()}
    result = {}
    for round_id, cells in requests:
        pending = missing = 0
        for cell in cells:
            key = (cell["item_id"], cell["scope_key"])
            target = targets.get((round_id, *key))
            if target is None:
                missing += 1
                continue
            count = counts.get(target.latest_count_id)
            gate = gates.get(key)
            if count is None or count.status != "APPLIED" or (gate and gate.active_count_id is not None):
                pending += 1
        result[(round_id, tuple((cell["item_id"], cell["scope_key"]) for cell in cells))] = (pending, missing)
    return result


def _counts(readiness: dict, round_id: uuid.UUID, cells: list[dict]) -> tuple[int, int]:
    """Share the exact canonical key between individual and batched read paths."""
    return readiness[(round_id, tuple((cell["item_id"], cell["scope_key"]) for cell in cells))]


def batch_pause_payloads(db: Session, works: Iterable[tuple[str, uuid.UUID]]) -> dict[tuple[str, uuid.UUID], dict]:
    """Read pause badges in bounded queries, without introducing list-query N+1 work."""
    keys = {(kind, uuid.UUID(str(work_id))) for kind, work_id in works}
    if not keys:
        return {}
    pauses = db.query(StocktakeWorkPause).filter(tuple_(StocktakeWorkPause.kind, StocktakeWorkPause.work_id).in_(keys)).all()
    if not pauses:
        return {}
    readiness = _readiness(db, [(pause.round_id, pause.required_cells) for pause in pauses])
    result = {}
    for pause in pauses:
        pending, missing = _counts(readiness, pause.round_id, pause.required_cells)
        result[(pause.kind, pause.work_id)] = {"token": str(pause.token), "round_id": str(pause.round_id),
            "state": "blocked" if pending or missing else "ready", "paused_at": pause.paused_at.isoformat() + "Z",
            "pending_target_count": pending, "missing_target_count": missing}
    return result


def pause_payload(db: Session, kind: str, work_id: uuid.UUID) -> dict | None:
    """Expose a current pause without changing the draft or inferring physical progress."""
    return batch_pause_payloads(db, [(kind, work_id)]).get((kind, uuid.UUID(str(work_id))))


def _set_pause(db: Session, kind: str, work_id: uuid.UUID, round_id: uuid.UUID, cells: list[dict]) -> StocktakeWorkPause:
    """Each new boundary invalidates stale resume buttons, including a later round."""
    pause = db.get(StocktakeWorkPause, (kind, work_id))
    if pause is None:
        pause = StocktakeWorkPause(kind=kind, work_id=work_id)
        db.add(pause)
    pause.round_id, pause.required_cells = round_id, _cells(cells)
    pause.token, pause.paused_at = uuid.uuid4(), datetime.utcnow()
    db.flush()
    return pause


def remove_pause(db: Session, kind: str, work_id: uuid.UUID) -> bool:
    """Deletion and successful resume discard only the active boundary, never work data."""
    pause = db.get(StocktakeWorkPause, (kind, work_id))
    if pause is None:
        return False
    db.delete(pause)
    db.flush()
    return True


def complete_work_save(db: Session, kind: str, work_id: uuid.UUID) -> bool:
    """Call only after the replacement reservation/save has succeeded atomically."""
    return remove_pause(db, kind, work_id)


def _blocked() -> WorkReservationError:
    """Use one actionable boundary error across old and new work interfaces."""
    return WorkReservationError("WORK_STOCKTAKE_PAUSED", "관련 품목의 재고 조사 반영 후 작업을 이어갈 수 있습니다.")


def ensure_work_save(db: Session, kind: str, work_id: uuid.UUID, cells: list[dict],
                     resume_token: uuid.UUID | None = None, *, direct_submit: bool = False) -> bool:
    """Return whether to reserve; an existing pause requires explicit token and old/new readiness."""
    control = stocktake_guard.lock_control(db)
    pause = db.get(StocktakeWorkPause, (kind, work_id))
    cells = _cells([*(pause.required_cells if pause else []), *cells])
    if pause is None and resume_token is not None:
        raise _blocked()
    if pause is not None and (resume_token is None or str(resume_token) != str(pause.token)):
        raise _blocked()
    round_id = pause.round_id if pause is not None else control.active_round_id if control is not None else None
    if round_id is None:
        return True
    readiness = _readiness(db, [(round_id, cells)], lock=True)
    stocktake_guard.prepare_items(db, [uuid.UUID(cell["item_id"]) for cell in cells])
    pending, missing = _counts(readiness, round_id, cells)
    if pending or missing:
        if pause is not None or direct_submit:
            raise _blocked()
        _set_pause(db, kind, work_id, round_id, cells)
        return False
    return True


def ensure_work_submit(db: Session, kind: str, work_id: uuid.UUID, cells: list[dict]) -> None:
    """No submission path may treat an inactive reservation as implicit consent to resume."""
    control = stocktake_guard.lock_control(db)
    if db.get(StocktakeWorkPause, (kind, work_id)) is not None:
        raise _blocked()
    if control is None or control.active_round_id is None:
        return
    cells = _cells(cells)
    readiness = _readiness(db, [(control.active_round_id, cells)], lock=True)
    stocktake_guard.prepare_items(db, [uuid.UUID(cell["item_id"]) for cell in cells])
    if any(_counts(readiness, control.active_round_id, cells)):
        raise _blocked()


def has_unapplied_cells(db: Session, cells: list[dict]) -> bool:
    """Read-only backfill checks must not create inventories or gates during a dry run."""
    control = stocktake_guard.lock_control(db)
    if control is None or control.active_round_id is None:
        return False
    cells = _cells(cells)
    return any(_counts(_readiness(db, [(control.active_round_id, cells)]), control.active_round_id, cells))


def pause_returned_draft(db: Session, batch: IoBatch) -> None:
    """Rejection already released its reservation; avoid acquiring target locks after leaves."""
    control = stocktake_guard.lock_control(db)
    if control is None or control.active_round_id is None:
        return
    pause = db.get(StocktakeWorkPause, ("io", batch.batch_id))
    if pause is not None and pause.round_id == control.active_round_id:
        return
    _set_pause(db, "io", batch.batch_id, control.active_round_id, io_required_cells(db, batch))


def pause_drafts(db: Session, round_id: uuid.UUID, *, affected_cells: list[dict] | None = None,
                 extra_item_ids: Iterable[uuid.UUID] = ()) -> None:
    """An exclusive Control boundary releases all matching reservations as one transaction."""
    stocktake_guard.lock_control(db, exclusive=True)
    from app.services.work_stocktake_legacy import required_cells
    affected = {(cell["item_id"], cell["scope_key"]) for cell in _cells(affected_cells or [])}
    batches = db.query(IoBatch).filter_by(status="draft").order_by(IoBatch.batch_id).with_for_update().populate_existing().all()
    requests = db.query(StockRequest).filter(StockRequest.status == StockRequestStatusEnum.DRAFT,
        StockRequest.operation_batch_id.is_(None)).order_by(StockRequest.request_id).with_for_update().populate_existing().all()
    jobs = [("io", batch.batch_id, batch, io_required_cells(db, batch)) for batch in batches]
    jobs += [("stock_request", request.request_id, request, required_cells(db, request)) for request in requests]
    if affected_cells is not None:
        jobs = [job for job in jobs if affected.intersection((cell["item_id"], cell["scope_key"]) for cell in job[3])]
    item_ids = set(extra_item_ids) | {uuid.UUID(cell["item_id"]) for *_, cells in jobs for cell in cells}
    item_ids.update(uuid.UUID(effect["item_id"]) for kind, _, work, _ in jobs if kind == "io"
                    for effect in (work.effective_plan or {}).get("effects", []))
    batch_ids = [work_id for kind, work_id, *_ in jobs if kind == "io"]
    item_ids.update(row.item_id for row in db.query(IoDraftReservation).filter(IoDraftReservation.batch_id.in_(batch_ids)).all())
    stocktake_guard.prepare_items(db, item_ids)
    for kind, work_id, work, cells in jobs:
        _set_pause(db, kind, work_id, round_id, cells)
        if kind == "io":
            previous_revision, plan = work.revision, work.effective_plan
            io_reservations.advance_revision(db, work, previous_revision)
            io_reservations.replace_reservations(db, work, None)
            work.effective_plan = plan
            io_reservations.record_event(db, work, "stocktake_paused", previous_revision, None, "전수조사")
        else:
            work.updated_at = datetime.utcnow()
    db.flush()
