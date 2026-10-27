from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app._evt import emit
from app._actor import _clean_log_employee_code
from app.database import get_db
from app.models import Employee
from app.services import activity_audit
from app.services.realtime import suppress_realtime_revision
from app.services.audit_actor_session import clear_audit_actor_cookie, get_verified_audit_actor_code
from app.services.operator_session import resolve_session

router = APIRouter()

ALLOWED_EVENTS = {"ui_login", "ui_logout", "ui_nav", "ui_action_cancel", "ui_error"}
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
ERROR_FIELD_LENGTHS = {"occurred_at": 40, "error_source": 40, "error_type": 120, "error_message": 500, "error_stack": 4000}
EVENT_LABELS = {
    "ui_login": "로그인",
    "ui_logout": "로그아웃",
    "ui_nav": "화면 이동",
    "ui_action_cancel": "작업 취소",
    "ui_error": "화면 오류",
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


def _clean_error_text(value: str, limit: int) -> str:
    """Keep each diagnostic on one log line without common credential values."""
    value = re.sub(r"((?:https?://|/)[^\s?#]*)[?#][^\s)]*", r"\1", value, flags=re.I)
    value = re.sub(r'''\b(?:[a-z0-9]+[-_])*(?:pin|password|token|secret|authorization|cookie|storage|operator[-_]session|api[-_]key)(?:[-_][a-z0-9]+)*\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|(?:Bearer|Basic)\s+[^\s,;]+|[^\s,;]+)''', "[redacted]", value, flags=re.I)
    value = re.sub(r"\bBearer\s+\S+", "[redacted]", value, flags=re.I)
    return re.sub(r"[\x00-\x1f\x7f]+", " ", value)[:limit]


def _record_ui_error(db: Session, request: Request, fields: dict[str, str], source: str) -> None:
    """Attribute failures to the verified tab actor; never authenticate display headers."""
    reported_code = _clean_log_employee_code(request.headers.get("X-MES-Employee-Code"))
    bearer = request.headers.get("X-Operator-Session")
    actor = None
    if bearer is not None:
        resolved = resolve_session(db, bearer)
        actor = resolved[0] if resolved else None
    else:
        cookie_code = get_verified_audit_actor_code(request)
        if cookie_code and cookie_code == reported_code:
            actor = db.query(Employee).filter(Employee.employee_code == cookie_code, Employee.is_active == "true").first()
    request.state.actor_emp = actor.employee_code if actor else "-"
    fields["received_at"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
    fields["employee_name"] = _clean_error_text(actor.name, 100) if actor else "-"
    if reported_code:
        fields["reported_employee_code"] = reported_code
    activity_audit.record(
        db, request=None, request_id=str(getattr(request.state, "request_id", "")) or None,
        actor_employee_code=actor.employee_code if actor else None,
        source=source, action_key="ui_error", action_label=EVENT_LABELS["ui_error"], outcome="failed",
        terminal_id=fields.get("terminal_id"), session_id=fields.get("session_id"),
        screen_key=fields.get("screen_key"), screen_label=fields.get("screen_label"),
        target_summary=fields.get("error_message"),
    )
    with suppress_realtime_revision(db):
        db.commit()
    emit("ui_error", request=request, level="error", **fields)


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

    if event == "ui_error":
        # Error reports use only diagnostics and location, never arbitrary action/input fields.
        log_fields = {key: _clean_error_text(value, FIELD_LENGTHS.get(key, MAX_FIELD_LENGTH))
                      for key, value in log_fields.items()
                      if key in {"path", "source", "session_id", "terminal_id", "screen_key", "screen_label"}}
        for key, limit in ERROR_FIELD_LENGTHS.items():
            value = payload.get(key)
            if isinstance(value, str):
                log_fields[key] = _clean_error_text(value, limit)
        _record_ui_error(db, request, log_fields, source)
        response.status_code = 204
        return response

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
    with suppress_realtime_revision(db):
        db.commit()
    if event == "ui_logout":
        clear_audit_actor_cookie(response)
    response.status_code = 204
    return response
