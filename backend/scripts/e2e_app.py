"""Playwright 전용 ASGI 진입점.

제품 앱을 그대로 위임하되, 이번 테스트 프로세스만 아는 nonce를 별도 경로에서
응답해 포트 선점 경쟁 중 다른 서버의 health를 신뢰하지 않게 한다.
"""

from __future__ import annotations

import json
import os

from app.main import app as mes_app


async def app(scope, receive, send) -> None:
    if scope["type"] == "http" and scope["path"] == "/__e2e__/identity":
        nonce = os.environ.get("E2E_RUN_NONCE")
        status = 200 if nonce else 503
        body = json.dumps(
            {"nonce": nonce, "pid": os.getpid()}, separators=(",", ":")
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"cache-control", b"no-store"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
        return

    await mes_app(scope, receive, send)
