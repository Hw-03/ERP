"""Serialize explicit recovery decisions against the original command's receipt."""
from datetime import datetime

from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from app.models import Employee
from app.schemas.stocktake import COMMANDS
from app.services import stocktake, stocktake_deadline, stocktake_guard
from app.services.inventory_conflicts import InventoryConflict
from app.services.stocktake_common import ROUND_COMMANDS, fingerprint, receipt_response, require_admin, require_round_manager

ADMIN_COMMANDS = frozenset({"count_force_release", "correction_preview", "correction_approve", "correction_reject"})


def resolve(db: Session, actor: Employee, kind: str, key: str, payload: dict, reason: str) -> dict:
    """Fence an uncompleted key; rollback/acknowledgement ambiguity keeps it unresolved."""
    if not actor.is_active:
        raise InventoryConflict("OPERATOR_SESSION_INVALID", "활성 작업자로 다시 인증해 주세요.", status_code=401)
    if kind not in COMMANDS or not key or len(key) > 128 or not reason.strip() or len(reason) > 1000:
        raise InventoryConflict("VALIDATION_ERROR", "명령 종류, 키 또는 정리 사유가 올바르지 않습니다.", status_code=422)
    if kind in ADMIN_COMMANDS:
        require_admin(actor)
    if kind in ROUND_COMMANDS:
        require_round_manager(actor)
    data = COMMANDS[kind].model_validate(payload).model_dump(mode="json")
    commit_attempted = False
    try:
        stocktake_guard.lock_control(db)
        stocktake_deadline.limit_acquired(db.connection())
        receipt = stocktake.claim_receipt(db, actor.employee_id, kind, key, fingerprint(data))
        identity = {"receipt_id": str(receipt.receipt_id)}
        if receipt.response is not None:
            result = ({"resolution": "NOT_APPLIED", **identity}
                if receipt.response.get("_command_resolution") == "NOT_APPLIED"
                else {"resolution": "COMPLETED", **identity, "result": receipt_response(receipt)})
            db.rollback()
            return result
        receipt.response = {"_command_resolution": "NOT_APPLIED", **identity, "reason": reason.strip()}
        receipt.completed_at = datetime.utcnow()
        result = {"resolution": "NOT_APPLIED", **identity}
        commit_attempted = True
        db.commit()
        return result
    except Exception as exc:
        try:
            db.rollback()
        except Exception as rollback_error:
            raise _unknown() from rollback_error
        if commit_attempted and isinstance(exc, DBAPIError):
            raise _unknown() from exc
        if stocktake_deadline.is_timeout(exc):
            raise InventoryConflict("STOCKTAKE_BUSY", "요청 결과 확인이 혼잡합니다. 같은 요청으로 다시 시도해 주세요.", status_code=503,
                extra={"retryable": True, "retry_delays_seconds": [1, 2, 4], "max_retries": 3}) from exc
        raise


def _unknown() -> InventoryConflict:
    """A lost acknowledgement must not erase the browser's original request key."""
    return InventoryConflict("COMMAND_RESULT_UNKNOWN", "요청 정리 결과를 확인할 수 없습니다. 영수증을 다시 조회해 주세요.",
        status_code=503, extra={"retryable": False, "receipt_lookup_required": True})
