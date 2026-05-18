"""경량 in-process 실패-시도 레이트 리미터.

용도: 작업자 PIN 검증의 무차별 대입(brute-force) 완화.
- 실패한 시도만 카운트한다 (성공은 키를 리셋).
- 슬라이딩 윈도우: window 초 안에서 max_failures 회 실패하면 차단.
- 프로세스 메모리에만 존재 (멀티 워커/재시작 시 초기화) — 경량 MES 프로토타입 수준의 방어.

테스트 안전성:
- 임계치가 넉넉(기본 10)해 정상 테스트(케이스당 실패 1~2회)는 트립하지 않는다.
- ``reset_all()`` 모듈 훅을 conftest autouse fixture 가 매 테스트마다 호출해
  테스트 간 상태 누수를 차단한다.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Deque, Dict

# 윈도우(초) 안에서 이 횟수만큼 실패하면 차단.
DEFAULT_MAX_FAILURES = 10
DEFAULT_WINDOW_SECONDS = 300

_lock = threading.Lock()
_failures: Dict[str, Deque[float]] = {}


def _now() -> float:
    return time.monotonic()


def _prune(key: str, window: float, now: float) -> Deque[float]:
    dq = _failures.get(key)
    if dq is None:
        dq = deque()
        _failures[key] = dq
    cutoff = now - window
    while dq and dq[0] < cutoff:
        dq.popleft()
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
        dq = _prune(key, window_seconds, now)
        return len(dq) >= max_failures


def record_failure(
    key: str,
    *,
    window_seconds: int = DEFAULT_WINDOW_SECONDS,
) -> None:
    """실패 1건 기록."""
    now = _now()
    with _lock:
        dq = _prune(key, window_seconds, now)
        dq.append(now)


def record_success(key: str) -> None:
    """성공 시 해당 키의 실패 이력을 비운다 (정상 사용자 페널티 방지)."""
    with _lock:
        _failures.pop(key, None)


def reset_all() -> None:
    """모든 상태 초기화 — 테스트 fixture 전용 훅."""
    with _lock:
        _failures.clear()
