"""HTTP 액세스 로그 미들웨어.

정책:
- GET 성공(2xx/3xx) + non-slow → 침묵
- 모든 실패(4xx/5xx) → evt=req_failed
- POST/PUT/PATCH/DELETE 성공 → evt=req_ok (도메인 이벤트 1줄과 쌍, 같은 rid)
- 모든 메서드 ≥ SLOW_REQUEST_MS → evt=slow_req WARN (req_ok/failed 와 함께)

미들웨어 순서: 이 함수가 OUTERMOST 가 되도록 main.py 에서 가장 마지막에 등록.
request.state.request_id 는 INNER 인 _request_id_middleware 가 박은 값을 그대로 사용.
"""

from __future__ import annotations

import asyncio
import os
import re
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Iterator
from typing import Callable
from urllib.parse import unquote

from fastapi import Request
from fastapi.responses import Response
from starlette.background import BackgroundTask, BackgroundTasks
from sqlalchemy.orm import sessionmaker

from app._actor import get_actor_emp
from app._logging import get_logger
from app.database import SessionLocal, get_db
from app.services import activity_audit
from app.services.realtime import suppress_realtime_revision


_log = get_logger()


def _slow_threshold_ms() -> int:
    try:
        return int(os.environ.get("SLOW_REQUEST_MS", "500"))
    except ValueError:
        return 500


SLOW_REQUEST_MS = _slow_threshold_ms()


_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_CLIENT_EVENT_PATH = "/api/client-events"
_ACTION_LABELS = {
    ("POST", "/api/io/submit"): "입출고 제출",
    ("PUT", "/api/admin/activity-audit/terminals/current"): "감사 단말 등록/변경",
}
_MAX_HEADER_LENGTH = 120
_UUID_PATH_SEGMENT_RE = re.compile(
    r"/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?=/|$)",
    re.IGNORECASE,
)


def _clean_header(request: Request, name: str, *, max_length: int = _MAX_HEADER_LENGTH) -> str | None:
    value = request.headers.get(name)
    if not value:
        return None
    cleaned = unquote(value).strip()
    return cleaned[:max_length] if cleaned else None


def _write_action_metadata(method: str, path: str) -> tuple[str, str, str | None, str]:
    """동적 식별자를 노출하지 않는 안정적인 write 감사 작업 정보를 만든다."""
    related_match = _UUID_PATH_SEGMENT_RE.search(path)
    related_id = related_match.group(1) if related_match else None
    normalized_path = _UUID_PATH_SEGMENT_RE.sub("/:id", path)
    action_key = (
        f"http.{method.lower()}."
        + normalized_path.removeprefix("/api/").replace("/", ".").replace(":", "")
    )[:160]
    action_label = _ACTION_LABELS.get((method, normalized_path))
    if action_label is None:
        action_label = f"{method} {normalized_path}"[:120]
    return action_key, action_label, related_id, normalized_path


@dataclass(frozen=True)
class _WriteAuditEntry:
    method: str
    path: str
    status: int
    source: str
    terminal_id: str | None
    session_id: str | None
    screen_key: str | None
    screen_label: str | None
    actor_employee_code: str | None
    request_id: str | None
    action_key: str
    action_label: str
    target_summary: str
    related_id: str | None


@contextmanager
def _audit_session(app) -> Iterator:
    """운영에서는 독립 세션, 테스트에서는 앱의 DB override를 사용한다."""
    override = app.dependency_overrides.get(get_db)
    if override is None:
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()
        return

    dependency = override()
    test_db = next(dependency)
    db = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_db.get_bind(),
    )()
    try:
        yield db
    finally:
        db.close()
        dependency.close()


def _build_write_audit_entry(
    request: Request, *, method: str, path: str, status: int
) -> _WriteAuditEntry | None:
    if bool(getattr(request.state, "activity_audit_skip", False)):
        return None
    if method not in _WRITE_METHODS or path == _CLIENT_EVENT_PATH:
        return None
    actor_employee_code = get_actor_emp(request)
    if actor_employee_code == "-":
        return None
    action_key, action_label, path_related_id, normalized_path = _write_action_metadata(
        method, path
    )
    source = _clean_header(request, "X-MES-Audit-Source") or "desktop"
    if source not in {"desktop", "mobile"}:
        source = "desktop"
    return _WriteAuditEntry(
        method=method,
        path=path,
        status=status,
        source=source,
        terminal_id=(
            _clean_header(request, "X-MES-Terminal-Id", max_length=36)
            or getattr(request.state, "audit_terminal_id", None)
        ),
        session_id=_clean_header(request, "X-MES-Audit-Session"),
        screen_key=_clean_header(request, "X-MES-Audit-Screen"),
        screen_label=_clean_header(request, "X-MES-Audit-Screen-Label"),
        actor_employee_code=actor_employee_code,
        request_id=str(getattr(request.state, "request_id", ""))[:64] or None,
        action_key=action_key,
        action_label=action_label,
        target_summary=(
            getattr(request.state, "activity_audit_target_summary", None)
            or normalized_path
        ),
        related_id=(
            getattr(request.state, "activity_audit_related_id", None)
            or path_related_id
        ),
    )


def _record_write_audit(app, entry: _WriteAuditEntry) -> None:
    try:
        with _audit_session(app) as db:
            activity_audit.record(
                db,
                request=None,
                source=entry.source,
                terminal_id=entry.terminal_id,
                session_id=entry.session_id,
                screen_key=entry.screen_key,
                screen_label=entry.screen_label,
                action_key=entry.action_key,
                action_label=entry.action_label,
                outcome="failed" if entry.status >= 400 else "success",
                target_summary=entry.target_summary,
                related_id=entry.related_id,
                actor_employee_code=entry.actor_employee_code,
                request_id=entry.request_id,
            )
            with suppress_realtime_revision(db):
                db.commit()
    except Exception as exc:  # noqa: BLE001 - 감사 실패는 업무 응답을 바꾸면 안 된다.
        _log.warning(
            "evt=activity_audit_failed method=%s path=%s status=%d err=%s",
            entry.method,
            entry.path,
            entry.status,
            str(exc)[:160],
        )


def _schedule_write_audit(
    response: Response, request: Request, *, method: str, path: str, status: int
) -> None:
    """응답 본문 전송 뒤 threadpool에서 감사 DB 기록을 실행한다."""
    entry = _build_write_audit_entry(request, method=method, path=path, status=status)
    if entry is None:
        return
    task = BackgroundTask(_record_write_audit, request.app, entry)
    if response.background is None:
        response.background = task
    elif isinstance(response.background, BackgroundTasks):
        response.background.add_task(_record_write_audit, request.app, entry)
    else:
        response.background = BackgroundTasks([response.background, task])


async def access_log_middleware(request: Request, call_next: Callable) -> Response:
    """액세스 로그 분기. 본문(body)은 절대 읽지 않음 — StreamingResponse 안전."""
    t0 = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        dur_ms = int((time.perf_counter() - t0) * 1000)
        _log.info(
            "evt=req_failed rid=%s emp=%s method=%s path=%s status=500 dur_ms=%d",
            getattr(request.state, "request_id", "-"),
            get_actor_emp(request),
            request.method,
            request.url.path,
            dur_ms,
        )
        entry = _build_write_audit_entry(
            request, method=request.method, path=request.url.path, status=500
        )
        if entry is not None:
            asyncio.create_task(asyncio.to_thread(_record_write_audit, request.app, entry))
        raise
    dur_ms = int((time.perf_counter() - t0) * 1000)

    method = request.method
    path = request.url.path
    status = response.status_code
    rid = getattr(request.state, "request_id", "-")
    emp = get_actor_emp(request)

    is_failure = status >= 400
    is_write = method in _WRITE_METHODS
    is_slow = dur_ms >= SLOW_REQUEST_MS

    if is_failure:
        _log.info(
            "evt=req_failed rid=%s emp=%s method=%s path=%s status=%d dur_ms=%d",
            rid, emp, method, path, status, dur_ms,
        )
    elif is_write:
        _log.info(
            "evt=req_ok rid=%s emp=%s method=%s path=%s status=%d dur_ms=%d",
            rid, emp, method, path, status, dur_ms,
        )

    if is_slow:
        _log.warning(
            "evt=slow_req rid=%s emp=%s method=%s path=%s status=%d dur_ms=%d",
            rid, emp, method, path, status, dur_ms,
        )

    _schedule_write_audit(response, request, method=method, path=path, status=status)

    return response
