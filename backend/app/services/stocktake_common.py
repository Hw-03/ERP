"""Small shared contracts for sealed previews, actor identity and round fences."""
from datetime import datetime, timedelta
import hashlib
import json
import uuid

from sqlalchemy.orm import Session

from app.models import Employee, StocktakeControl, StocktakeEvent, StocktakePreview, StocktakeReceipt, StocktakeRound
from app.services.inventory_conflicts import InventoryConflict

CATEGORIES = ("normal", "defect", "b_grade", "obsolete")
PREVIEW_SECONDS = 600
ROUND_COMMANDS = frozenset({"round_start_preview", "round_start", "target_append_preview",
                            "target_append", "round_close_preview", "round_close"})


def receipt_response(receipt: StocktakeReceipt) -> dict:
    """A fenced key is definitive non-application, never a successful replay."""
    result = dict(receipt.response)
    if result.get("_command_resolution") == "NOT_APPLIED":
        raise InventoryConflict("COMMAND_NOT_APPLIED", "이 요청은 미반영으로 확정되어 다시 실행할 수 없습니다.",
            status_code=409, extra={"definitive": True, "receipt_id": str(receipt.receipt_id)})
    return result


def fingerprint(value: object) -> str:
    """Canonical JSON binds exact sets without credentials or presentation order."""
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str).encode()).hexdigest()


def require_admin(actor: Employee) -> None:
    """Sensitive census commands require a current active department approver."""
    if not actor.is_active or actor.department_role not in {"primary", "deputy"}:
        raise InventoryConflict("FORBIDDEN", "활성 부서 정·부 결재자만 실행할 수 있습니다.", status_code=403)


def require_round_manager(actor: Employee) -> None:
    """Department primary/deputy roles authorize rounds independently of other roles."""
    if actor.department_role not in {"primary", "deputy"}:
        raise InventoryConflict("FORBIDDEN", "부서 결재 역할이 있는 직원만 회차와 이력을 관리할 수 있습니다.", status_code=403)


def active_round(db: Session, round_id: uuid.UUID) -> StocktakeRound:
    """A stale gate or an old round object cannot authorize new counting work."""
    control = db.get(StocktakeControl, 1)
    row = db.get(StocktakeRound, round_id)
    if row is None:
        raise InventoryConflict("NOT_FOUND", "조사 회차를 찾을 수 없습니다.", status_code=404)
    if control is None or control.active_round_id != row.round_id or control.epoch != row.epoch or row.status != "ACTIVE":
        raise InventoryConflict("ROUND_CLOSED", "활성 조사 회차가 아닙니다.")
    return row


def seal(db: Session, actor: Employee, kind: str, payload: dict, round_id: uuid.UUID | None = None) -> StocktakePreview:
    """Save an immutable proposal; only a later command may apply its effects."""
    row = StocktakePreview(preview_id=uuid.uuid4(), kind=kind, actor_id=actor.employee_id, round_id=round_id,
                           payload=payload, preview_hash=fingerprint(payload), expires_at=datetime.utcnow() + timedelta(seconds=PREVIEW_SECONDS))
    db.add(row)
    db.flush()
    return row


def preview_response(row: StocktakePreview) -> dict:
    """Return the seal and review data, excluding internal prepared target rows."""
    return {"preview_id": str(row.preview_id), "preview_hash": row.preview_hash,
            "expires_at": row.expires_at.isoformat() + "Z", **row.payload}


def open_preview(db: Session, payload: dict, kind: str) -> StocktakePreview:
    """Verify kind, content and expiry before using a client-supplied seal."""
    row = db.get(StocktakePreview, uuid.UUID(payload["preview_id"]))
    if row is None or row.kind != kind or row.preview_hash != payload["preview_hash"] or row.preview_hash != fingerprint(row.payload) or row.expires_at <= datetime.utcnow():
        raise InventoryConflict("PREVIEW_STALE", "미리보기가 변경되었거나 만료되었습니다. 다시 확인해 주세요.")
    return row


def append_event(db: Session, actor: Employee, round_id: uuid.UUID, kind: str, payload: dict,
                 count_id: uuid.UUID | None = None, event_id: uuid.UUID | None = None) -> StocktakeEvent:
    """Keep the acting employee and invalidated version independently of current state."""
    row = StocktakeEvent(event_id=event_id or uuid.uuid4(), round_id=round_id, count_id=count_id,
                         kind=kind, actor_id=actor.employee_id, actor_name=actor.name, payload=payload)
    db.add(row)
    db.flush()
    return row
