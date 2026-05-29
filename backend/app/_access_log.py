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

import os
import time
from typing import Callable

from fastapi import Request
from fastapi.responses import Response

from app._actor import get_actor_emp
from app._logging import get_logger


_log = get_logger()


def _slow_threshold_ms() -> int:
    try:
        return int(os.environ.get("SLOW_REQUEST_MS", "500"))
    except ValueError:
        return 500


SLOW_REQUEST_MS = _slow_threshold_ms()


_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


async def access_log_middleware(request: Request, call_next: Callable) -> Response:
    """액세스 로그 분기. 본문(body)은 절대 읽지 않음 — StreamingResponse 안전."""
    t0 = time.perf_counter()
    response = await call_next(request)
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

    return response
