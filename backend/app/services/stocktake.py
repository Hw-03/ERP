"""Authenticated command boundary and exact replay for stocktake workflows."""
import uuid
from datetime import datetime

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.models import Employee, StocktakeCount, StocktakeGate, StocktakeReceipt, StocktakeRound, StocktakeTarget
from app.schemas.stocktake import COMMANDS
from app.services import stocktake_counts, stocktake_guard, stocktake_targets
from app.services.inventory_conflicts import InventoryConflict
from app.services.stocktake_common import ROUND_COMMANDS, fingerprint, receipt_response, require_round_manager

EXCLUSIVE_COMMANDS = {"round_start", "target_append", "round_close"}
PREPARATION_COMMANDS = {"round_start_preview", "target_append_preview"}


def _bulk_unknown() -> InventoryConflict:
    """A lost bulk acknowledgement must keep the original key pending."""
    return InventoryConflict("COMMAND_RESULT_UNKNOWN", "일괄 처리 결과를 확인할 수 없습니다. 원래 요청의 영수증을 조회해 주세요.",
        status_code=503, extra={"retryable": False, "receipt_lookup_required": True})


def execute(db: Session, actor: Employee, kind: str, key: str, payload: dict) -> dict:
    """Claim → validate/change → receipt in one commit; retries precede state validation."""
    if not actor.is_active:
        raise InventoryConflict("OPERATOR_SESSION_INVALID", "활성 작업자로 다시 인증해 주세요.", status_code=401)
    if kind not in COMMANDS or not key or len(key) > 128:
        raise InventoryConflict("VALIDATION_ERROR", "명령 종류 또는 멱등 키가 올바르지 않습니다.", status_code=422)
    if kind in ROUND_COMMANDS:
        require_round_manager(actor)
    data = COMMANDS[kind].model_validate(payload).model_dump(mode="json")
    request_hash = fingerprint(data)
    commit_attempted = False
    try:
        if kind == "round_close_preview":
            from app.services.stocktake_closing import prepare
            return prepare(db, actor, key, data, request_hash)
        if kind not in PREPARATION_COMMANDS:
            stocktake_guard.lock_control(db, exclusive=kind in EXCLUSIVE_COMMANDS)
        if kind == "round_close":
            from app.services.stocktake_deadline import limit_acquired
            limit_acquired(db.connection())
        receipt = claim_receipt(db, actor.employee_id, kind, key, request_hash)
        if receipt.response is not None:
            result = receipt_response(receipt)
            db.rollback()
            return result
        if kind == "round_close":
            from app.services.stocktake_closing import close
            result = close(db, actor, data, receipt.receipt_id)
        elif kind in PREPARATION_COMMANDS:
            result = stocktake_targets.prepare_set(db, actor, data, append=kind == "target_append_preview")
        elif kind in EXCLUSIVE_COMMANDS:
            result = stocktake_targets.activate_set(db, actor, data, append=kind == "target_append")
        elif kind.startswith("correction_"):
            from app.services import business_corrections
            result = business_corrections.dispatch(db, actor, kind, data, receipt.receipt_id)
        elif kind == "count_start":
            result = stocktake_counts.start(db, actor, data)
        elif kind.startswith("count_"):
            result = stocktake_counts.change(db, actor, kind, data)
        elif kind.startswith("application_bulk_"):
            from app.services import stocktake_bulk_application
            result = stocktake_bulk_application.execute(db, actor, kind, data, receipt.receipt_id)
        else:
            from app.services import stocktake_application
            result = stocktake_application.execute(db, actor, kind, data, receipt.receipt_id)
        receipt.response = {**result, "receipt_id": str(receipt.receipt_id)}
        receipt.completed_at = datetime.utcnow()
        result = dict(receipt.response)
        commit_attempted = True
        db.commit()
        return result
    except Exception as exc:
        try:
            db.rollback()
        except Exception as rollback_error:
            if kind.startswith("application_bulk_"):
                raise _bulk_unknown() from rollback_error
            if kind == "round_close":
                from app.services.stocktake_deadline import unknown_result
                raise unknown_result() from rollback_error
            raise
        if kind.startswith("application_bulk_") and commit_attempted and isinstance(exc, DBAPIError):
            raise _bulk_unknown() from exc
        if kind == "round_close":
            from app.services.stocktake_deadline import busy, is_timeout, unknown_result
            if commit_attempted and isinstance(exc, DBAPIError):
                raise unknown_result() from exc
            if is_timeout(exc):
                raise busy() from exc
        raise


def claim_receipt(db: Session, actor_id: uuid.UUID, kind: str, key: str, request_hash: str) -> StocktakeReceipt:
    """Serialize a successful command seal; unfinished claims roll back with its work."""
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
    db.execute(insert(StocktakeReceipt).values(receipt_id=uuid.uuid4(), actor_id=actor_id,
        command_kind=kind, idempotency_key=key, request_hash=request_hash).on_conflict_do_nothing(
            index_elements=[StocktakeReceipt.actor_id, StocktakeReceipt.command_kind, StocktakeReceipt.idempotency_key]))
    query = db.query(StocktakeReceipt).filter_by(actor_id=actor_id, command_kind=kind, idempotency_key=key)
    if db.get_bind().dialect.name != "sqlite":
        query = query.with_for_update()
    receipt = query.populate_existing().one()
    if receipt.request_hash != request_hash:
        raise InventoryConflict("IDEMPOTENCY_CONFLICT", "동일한 키에 다른 요청이 사용되었습니다.")
    return receipt


def list_targets(db: Session, round_id: uuid.UUID) -> dict:
    """Return admitted snapshot identity and the latest attempt, including empty cells."""
    rows = stocktake_targets.round_targets(db, round_id).order_by(StocktakeTarget.target_id).limit(200).all()
    result = []
    for row in rows:
        count = db.get(StocktakeCount, row.latest_count_id) if row.latest_count_id else None
        gate = db.get(StocktakeGate, (row.item_id, row.scope_key))
        result.append({"target_id": str(row.target_id), "item_id": str(row.item_id), "scope_id": row.scope_key,
            "item_code": row.item_code, "item_name": row.item_name, "unit": row.unit, "scope_name": row.scope_name,
            "version": row.version, "fence": gate.fence if gate else 0, "status": count.status if count else "UNCOUNTED",
            "count": stocktake_counts.response(count, gate) if count and gate else None})
    return {"items": result, "next_cursor": None}
