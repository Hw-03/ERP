"""PIN 검증을 통과한 직원만 작업 감사 행위자로 연결하는 서명 쿠키."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from typing import Optional

from fastapi import Request, Response


AUDIT_ACTOR_COOKIE = "dexcowin_audit_actor"
AUDIT_ACTOR_SESSION_TTL_SECONDS = 12 * 60 * 60
_SECRET = os.environ.get("AUDIT_ACTOR_SESSION_SECRET", "").encode("utf-8") or secrets.token_bytes(32)


def _signature(payload: bytes) -> str:
    return hmac.new(_SECRET, payload, hashlib.sha256).hexdigest()


def _encode_payload(employee_code: str, expires_at: int) -> str:
    raw = f"{employee_code}:{expires_at}".encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_payload(token: str) -> tuple[str, int] | None:
    try:
        encoded, signature = token.split(".", 1)
        payload = encoded.encode("ascii")
        if not hmac.compare_digest(_signature(payload), signature):
            return None
        decoded = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4)).decode("utf-8")
        employee_code, expires_text = decoded.rsplit(":", 1)
        expires_at = int(expires_text)
    except (UnicodeDecodeError, ValueError):
        return None
    if not employee_code or expires_at < int(time.time()):
        return None
    return employee_code, expires_at


def set_audit_actor_cookie(response: Response, employee_code: str) -> None:
    """PIN 검증 응답에 HttpOnly 감사 행위자 쿠키를 발급한다."""
    expires_at = int(time.time()) + AUDIT_ACTOR_SESSION_TTL_SECONDS
    encoded = _encode_payload(employee_code, expires_at)
    response.set_cookie(
        AUDIT_ACTOR_COOKIE,
        f"{encoded}.{_signature(encoded.encode('ascii'))}",
        max_age=AUDIT_ACTOR_SESSION_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=os.environ.get("APP_ENV", "").strip().lower() == "production",
        path="/",
    )


def clear_audit_actor_cookie(response: Response) -> None:
    response.delete_cookie(AUDIT_ACTOR_COOKIE, path="/")


def get_verified_audit_actor_code(request: Optional[Request]) -> str | None:
    """PIN 검증 뒤 발급된 유효한 서명 쿠키의 직원 코드만 반환한다."""
    if request is None:
        return None
    token = request.cookies.get(AUDIT_ACTOR_COOKIE)
    decoded = _decode_payload(token) if token else None
    return decoded[0] if decoded else None
