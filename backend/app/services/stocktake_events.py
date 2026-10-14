"""Read immutable activity with sealed target names and filter-bound page cursors."""
import base64
from datetime import datetime
import json
import uuid

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models import StocktakeCount, StocktakeEvent, StocktakeTarget
from app.services.inventory_conflicts import InventoryConflict
from app.services.stocktake_common import fingerprint
from app.services.stocktake_reads import get_round


def event_page(db: Session, round_id: uuid.UUID, count_id: uuid.UUID | None,
               cursor: str | None, limit: int, order: str, include_saves: bool) -> dict:
    """Keep legacy UUID ordering by default; latest pages use time plus UUID ties."""
    get_round(db, round_id)
    context = fingerprint([str(round_id), str(count_id)] if order == "legacy" and include_saves
                          else [str(round_id), str(count_id), order, include_saves])
    last = None
    if cursor:
        try:
            envelope = json.loads(base64.b64decode(cursor, altchars=b"-_", validate=True))
            if envelope.get("v") != 2 or envelope.get("context") != context:
                raise InventoryConflict("TARGET_CURSOR_STALE", "조회 조건이 변경되었습니다. 처음부터 다시 조회해 주세요.")
            last = envelope["last"]
            if order == "latest":
                if not isinstance(last, list) or len(last) != 2:
                    raise ValueError("Invalid chronological cursor")
                last = (datetime.fromisoformat(last[0]), uuid.UUID(last[1]))
            else:
                last = uuid.UUID(last)
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            raise InventoryConflict("VALIDATION_ERROR", "활동 커서가 올바르지 않습니다.", status_code=422) from exc
    query = db.query(StocktakeEvent, StocktakeTarget).outerjoin(
        StocktakeCount, StocktakeCount.count_id == StocktakeEvent.count_id).outerjoin(
        StocktakeTarget, StocktakeTarget.target_id == StocktakeCount.target_id).filter(StocktakeEvent.round_id == round_id)
    if count_id:
        query = query.filter(StocktakeEvent.count_id == count_id)
    if not include_saves:
        query = query.filter(StocktakeEvent.kind != "DRAFT_SAVED")
    if order == "latest":
        if last:
            query = query.filter(or_(StocktakeEvent.created_at < last[0],
                and_(StocktakeEvent.created_at == last[0], StocktakeEvent.event_id < last[1])))
        query = query.order_by(StocktakeEvent.created_at.desc(), StocktakeEvent.event_id.desc())
    else:
        if last:
            query = query.filter(StocktakeEvent.event_id > last)
        query = query.order_by(StocktakeEvent.event_id)
    rows = query.limit(limit + 1).all()
    items = [{"event_id": str(event.event_id), "count_id": str(event.count_id) if event.count_id else None,
        "kind": event.kind, "actor_id": str(event.actor_id), "actor_name": event.actor_name,
        "payload": event.payload, "created_at": event.created_at.isoformat() + "Z",
        "item_name": target.item_name if target else None, "item_code": target.item_code if target else None,
        "scope_name": target.scope_name if target else None, "unit": target.unit if target else None}
        for event, target in rows[:limit]]
    next_cursor = None
    if len(rows) > limit:
        event = rows[limit - 1][0]
        key = [event.created_at.isoformat(), str(event.event_id)] if order == "latest" else str(event.event_id)
        next_cursor = base64.urlsafe_b64encode(json.dumps(
            {"v": 2, "context": context, "last": key}, separators=(",", ":")
        ).encode()).decode()
    return {"items": items, "next_cursor": next_cursor}
