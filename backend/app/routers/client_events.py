from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request, Response

from app._evt import emit

router = APIRouter()

ALLOWED_EVENTS = {"ui_login", "ui_logout", "ui_nav"}
ALLOWED_KEYS = {"event", "from", "to", "path", "source"}
DENIED_KEY_PARTS = ("pin", "password", "token", "secret", "hash")
MAX_FIELD_LENGTH = 120


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


def _clean_field(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    cleaned = value.strip()
    if not cleaned:
        return None
    return cleaned[:MAX_FIELD_LENGTH]


@router.post("/client-events", status_code=204)
def client_event(request: Request, payload: dict[str, Any] = Body(...)) -> Response:
    if _has_denied_key(payload):
        raise HTTPException(status_code=422, detail="client event contains denied keys")

    event = payload.get("event")
    if event not in ALLOWED_EVENTS:
        raise HTTPException(status_code=422, detail="unsupported client event")

    log_fields: dict[str, str] = {}
    for key in ALLOWED_KEYS - {"event"}:
        cleaned = _clean_field(payload.get(key))
        if cleaned is not None:
            log_fields[key] = cleaned

    emit(str(event), request=request, **log_fields)
    return Response(status_code=204)
