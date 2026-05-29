"""도메인 이벤트 로그 표준 emit 헬퍼.

용법:
    from app._evt import emit
    emit("io_submit", request=request, txn_id=tid, kind="OUT", lines=3)
    emit("neg_block", request=request, level="warning", item=code, attempted=-3, current=2)

표준 출력:
    evt=<action> rid=<rid> emp=<emp> key=val key=val ...

규칙:
- rid·emp 는 request 에서 자동 부착. request 가 None 이면 '-'.
- 값에 공백이 있으면 "" 로 쿼팅.
- DENY 키워드(pin/password/token/secret 등)는 RuntimeError 로 차단.
- commit 직후에만 호출 (rollback 시 거짓 로그 방지).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

from app._actor import get_actor_emp
from app._logging import get_logger

if TYPE_CHECKING:
    from fastapi import Request


_log = get_logger()


_DENY_SUBSTR = ("pin", "password", "token", "secret", "hash")


def _is_denied_key(key: str) -> bool:
    k = key.lower()
    return any(d in k for d in _DENY_SUBSTR)


def _fmt_value(v: Any) -> str:
    if v is None:
        return "-"
    if isinstance(v, bool):
        return "true" if v else "false"
    s = str(v)
    if not s:
        return "-"
    if any(c in s for c in (" ", "\t", "=", '"')):
        return '"' + s.replace('"', "'") + '"'
    return s


def emit(
    action: str,
    request: "Optional[Request]" = None,
    level: str = "info",
    **kv: Any,
) -> None:
    """도메인 이벤트 1줄. rid/emp 자동 부착, deny-list 검사."""
    for k in kv:
        if _is_denied_key(k):
            raise RuntimeError(f"_evt.emit: denied key '{k}' (PII/credential)")

    rid = "-"
    if request is not None:
        rid = getattr(request.state, "request_id", "-") or "-"
    emp = get_actor_emp(request)

    parts = [f"evt={action}", f"rid={rid}", f"emp={emp}"]
    for k, v in kv.items():
        parts.append(f"{k}={_fmt_value(v)}")
    msg = " ".join(parts)

    lvl = level.lower()
    if lvl == "warning" or lvl == "warn":
        _log.warning(msg)
    elif lvl == "error":
        _log.error(msg)
    else:
        _log.info(msg)
