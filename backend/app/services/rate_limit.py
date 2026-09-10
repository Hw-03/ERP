"""경량 in-process 인증 시도·자원 예산 레이트 리미터.

용도: 작업자 PIN 검증의 무차별 대입과 인증 자원 고갈 완화.
- credential 실패 예산은 성공 시 리셋한다.
- 로그인 KDF·세션 발급 자원 예산은 성공도 카운트하며 리셋하지 않는다.
- 슬라이딩 윈도우 안에서 각 예산의 임계 횟수에 도달하면 차단한다.
- 프로세스 메모리에만 존재 (멀티 워커/재시작 시 초기화) — 경량 MES 프로토타입 수준의 방어.

테스트 안전성:
- 임계치가 넉넉(기본 10)해 정상 테스트(케이스당 실패 1~2회)는 트립하지 않는다.
- ``reset_all()`` 모듈 훅을 conftest autouse fixture 가 매 테스트마다 호출해
  테스트 간 상태 누수를 차단한다.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import os
import threading
import time
from collections import deque
from typing import Deque, Dict

from app.models import Employee
from app.services.pin_auth import verify_pin

# 윈도우(초) 안에서 이 횟수만큼 실패하면 차단.
DEFAULT_MAX_FAILURES = 10
DEFAULT_WINDOW_SECONDS = 300
OPERATOR_RESOURCE_WINDOW_SECONDS = 5 * 60
OPERATOR_LOGIN_KDF_MAX_ATTEMPTS = 60
OPERATOR_SESSION_ISSUANCE_MAX_ATTEMPTS = 10
MAX_TRACKED_KEYS = 4096
PROXY_SHARED_SECRET_ENV = "MES_PROXY_SHARED_SECRET"
PROXY_CLIENT_IP_HEADER = "X-MES-Proxy-Client-IP"
PROXY_CLIENT_IP_TIMESTAMP_HEADER = "X-MES-Proxy-Client-IP-Timestamp"
PROXY_CLIENT_IP_SIGNATURE_HEADER = "X-MES-Proxy-Client-IP-Signature"
PROXY_ASSERTION_MAX_AGE_SECONDS = 60
PROXY_SHARED_SECRET_MIN_BYTES = 32

_lock = threading.Lock()
_failures: Dict[str, Deque[float]] = {}


class OperatorPinRateLimitExceeded(RuntimeError):
    """동일 작업자·IP의 개인 PIN 시도가 공통 한도를 초과했다."""


def _canonical_ip(value: object) -> str | None:
    """IP literal만 정규화하며 hostname/header list는 거부한다."""
    if not isinstance(value, str) or not value or len(value) > 64:
        return None
    try:
        parsed = ipaddress.ip_address(value)
    except ValueError:
        return None
    if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped is not None:
        return str(parsed.ipv4_mapped)
    return parsed.compressed


def _has_valid_proxy_signature(
    *,
    client_ip: str,
    timestamp_value: object,
    signature: object,
) -> bool:
    """Docker hop assertion의 짧은 수명 HMAC을 검증한다."""
    secret = os.environ.get(PROXY_SHARED_SECRET_ENV, "")
    if len(secret.encode()) < PROXY_SHARED_SECRET_MIN_BYTES:
        return False
    if (
        not isinstance(timestamp_value, str)
        or not timestamp_value.isascii()
        or not timestamp_value.isdigit()
        or len(timestamp_value) > 12
        or not isinstance(signature, str)
        or len(signature) != 64
    ):
        return False
    timestamp = int(timestamp_value)
    if abs(int(time.time()) - timestamp) > PROXY_ASSERTION_MAX_AGE_SECONDS:
        return False
    message = f"v1\n{timestamp}\n{client_ip}".encode()
    expected = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


def effective_client_ip(request: object) -> str:
    """검증된 Next assertion 또는 실제 TCP peer만 rate-limit 정본으로 사용한다."""
    peer_value = getattr(getattr(request, "client", None), "host", None)
    peer_ip = _canonical_ip(peer_value)
    peer_key = peer_ip or (str(peer_value).strip() if peer_value else "unknown")
    headers = getattr(request, "headers", {})
    asserted_ip = _canonical_ip(headers.get(PROXY_CLIENT_IP_HEADER))
    if asserted_ip is None:
        return peer_key
    if peer_ip is not None and ipaddress.ip_address(peer_ip).is_loopback:
        return asserted_ip
    if _has_valid_proxy_signature(
        client_ip=asserted_ip,
        timestamp_value=headers.get(PROXY_CLIENT_IP_TIMESTAMP_HEADER),
        signature=headers.get(PROXY_CLIENT_IP_SIGNATURE_HEADER),
    ):
        return asserted_ip
    return peer_key


def credential_key(namespace: str, credential_id: object, request: object) -> str:
    """서버 정본 credential 식별자와 client IP로 endpoint 공통 키를 만든다.

    ``credential_id``에는 PIN이나 body/header claim이 아니라 검증된 직원 ID 또는
    고정된 관리자 credential 식별자만 전달해야 한다.
    """
    client_ip = effective_client_ip(request)
    return f"{namespace}:{credential_id}:{client_ip}"


def admin_credential_key(request: object, actor_employee_id: object) -> str:
    """검증된 작업자별로 모든 관리자 PIN 경계가 공유하는 credential key."""
    return credential_key("admin_pin", actor_employee_id, request)


def operator_login_ip_key(request: object) -> str:
    """미존재 직원 ID의 dummy-KDF 시도만 공유하는 bounded client-IP 키."""
    return credential_key("operator_login_ip", "all", request)


def operator_login_kdf_ip_key(request: object) -> str:
    """직원 존재·성공 여부와 무관하게 모든 로그인 KDF가 공유하는 IP 키."""
    return credential_key("operator_login_kdf_ip", "all", request)


def operator_session_issuance_key(request: object, employee_id: object) -> str:
    """새 operator 세션 행 발급이 공유하는 직원·검증 IP 키."""
    return credential_key("operator_session_issue", employee_id, request)


def verify_operator_pin(actor: Employee, pin: str, request: object) -> bool:
    """모든 개인 PIN step-up이 공유하는 원자적 10회/5분 검증 경계."""
    if not isinstance(actor, Employee):
        raise TypeError("actor must be an Employee")
    key = credential_key("operator_pin", actor.employee_id, request)
    if not admit_attempt(key):
        raise OperatorPinRateLimitExceeded("PIN 시도 횟수를 초과했습니다.")
    if not verify_pin(actor.pin_hash, pin):
        return False
    record_success(key)
    return True


def _now() -> float:
    return time.monotonic()


def _evict_for_new_key(window: float, now: float) -> None:
    """만료 키를 지우고 오래된 키부터 제거해 메모리 사용을 제한한다."""
    cutoff = now - window
    stale_keys = [
        key for key, attempts in _failures.items() if not attempts or attempts[-1] < cutoff
    ]
    for key in stale_keys:
        _failures.pop(key, None)
    while len(_failures) >= MAX_TRACKED_KEYS:
        oldest_key = min(_failures, key=lambda key: _failures[key][-1])
        _failures.pop(oldest_key, None)


def _prune(
    key: str,
    window: float,
    now: float,
    *,
    create: bool,
) -> Deque[float]:
    dq = _failures.get(key)
    if dq is None:
        if not create:
            return deque()
        _evict_for_new_key(window, now)
        dq = deque()
        _failures[key] = dq
    cutoff = now - window
    while dq and dq[0] < cutoff:
        dq.popleft()
    if not dq and not create:
        _failures.pop(key, None)
    return dq


def is_blocked(
    key: str,
    *,
    max_failures: int = DEFAULT_MAX_FAILURES,
    window_seconds: int = DEFAULT_WINDOW_SECONDS,
) -> bool:
    """현재 키가 차단 상태인지 — 시도 전에 확인한다."""
    now = _now()
    with _lock:
        dq = _prune(key, window_seconds, now, create=False)
        return len(dq) >= max_failures


def admit_attempt(
    key: str,
    *,
    max_failures: int = DEFAULT_MAX_FAILURES,
    window_seconds: int = DEFAULT_WINDOW_SECONDS,
) -> bool:
    """검증 1회를 원자적으로 예약하며, 실패하면 예약 자체가 실패 기록이 된다."""
    now = _now()
    with _lock:
        dq = _prune(key, window_seconds, now, create=True)
        if len(dq) >= max_failures:
            return False
        dq.append(now)
        return True


def record_failure(
    key: str,
    *,
    window_seconds: int = DEFAULT_WINDOW_SECONDS,
) -> None:
    """실패 1건 기록."""
    now = _now()
    with _lock:
        dq = _prune(key, window_seconds, now, create=True)
        dq.append(now)


def release_attempt(
    key: str,
    *,
    window_seconds: int = DEFAULT_WINDOW_SECONDS,
) -> None:
    """성공한 요청이 예약한 1회를 빼되 같은 IP의 과거 실패는 유지한다."""
    now = _now()
    with _lock:
        dq = _prune(key, window_seconds, now, create=False)
        if dq:
            dq.pop()
        if not dq:
            _failures.pop(key, None)


def record_success(key: str) -> None:
    """성공 시 해당 키의 실패 이력을 비운다 (정상 사용자 페널티 방지)."""
    with _lock:
        _failures.pop(key, None)


def reset_all() -> None:
    """모든 상태 초기화 — 테스트 fixture 전용 훅."""
    with _lock:
        _failures.clear()
