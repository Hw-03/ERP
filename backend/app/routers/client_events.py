from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app._evt import emit
from app.database import get_db
from app.services import activity_audit
from app.services.audit_actor_session import clear_audit_actor_cookie

router = APIRouter()

ALLOWED_EVENTS = {"ui_login", "ui_logout", "ui_nav", "ui_action_cancel"}
ALLOWED_KEYS = {
    "event", "from", "to", "path", "source", "session_id", "terminal_id",
    "screen_key", "screen_label", "action_key", "action_label",
    "target_summary", "related_id",
}
DENIED_KEY_PARTS = ("pin", "password", "token", "secret", "hash")
MAX_FIELD_LENGTH = 120
MAX_TARGET_SUMMARY_LENGTH = 500
FIELD_LENGTHS = {"terminal_id": 36, "target_summary": MAX_TARGET_SUMMARY_LENGTH}
ALLOWED_SOURCES = {"desktop", "mobile"}
EVENT_LABELS = {
    "ui_login": "로그인",
    "ui_logout": "로그아웃",
    "ui_nav": "화면 이동",
    "ui_action_cancel": "작업 취소",
}


def _has_denied_key(value: Any) -> bool:
    if isinstance(value, dict):
        for key, child in value.items():
            lowered = str(key).lower()
            if any(part in lowered for part in DENIED_KEY_PARTS):
                return True
            if _has_denied_key(child):
                return True
    elif isinstance(value, list):
        return any(_has_denied_key(child) for child in value)
    return False


def _clean_field(value: Any, *, max_length: int = MAX_FIELD_LENGTH) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    cleaned = value.strip()
    if not cleaned:
        return None
    return cleaned[:max_length]


@router.post("/client-events", status_code=204)
def client_event(
    response: Response,
    request: Request,
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
) -> Response:
    if _has_denied_key(payload):
        raise HTTPException(status_code=422, detail="client event contains denied keys")

    event = payload.get("event")
    if event not in ALLOWED_EVENTS:
        raise HTTPException(status_code=422, detail="unsupported client event")

    source = _clean_field(payload.get("source")) or "desktop"
    if source not in ALLOWED_SOURCES:
        raise HTTPException(status_code=422, detail="unsupported client source")

    log_fields: dict[str, str] = {}
    for key in ALLOWED_KEYS - {"event"}:
        limit = FIELD_LENGTHS.get(key, MAX_FIELD_LENGTH)
        cleaned = _clean_field(payload.get(key), max_length=limit)
        if cleaned is not None:
            log_fields[key] = cleaned

    emit(str(event), request=request, **log_fields)
    event_is_navigation = event == "ui_nav"
    screen_key = (
        log_fields.get("to") if event_is_navigation else log_fields.get("screen_key")
    ) or log_fields.get("screen_key")
    screen_label = log_fields.get("screen_label")
    if event_is_navigation and log_fields.get("screen_key") != screen_key:
        screen_label = screen_key
    activity_audit.record(
        db,
        request=request,
        source=source,
        terminal_id=log_fields.get("terminal_id"),
        session_id=log_fields.get("session_id"),
        screen_key=screen_key,
        screen_label=screen_label or screen_key,
        action_key=log_fields.get("action_key") or str(event),
        action_label=log_fields.get("action_label") or EVENT_LABELS[str(event)],
        outcome="cancelled" if event == "ui_action_cancel" else "success",
        target_summary=log_fields.get("target_summary"),
        related_id=log_fields.get("related_id"),
    )
    db.commit()
    if event == "ui_logout":
        clear_audit_actor_cookie(response)
    response.status_code = 204
    return response
