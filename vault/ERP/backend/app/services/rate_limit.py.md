---
type: file-explanation
source_path: "backend/app/services/rate_limit.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# rate_limit.py — rate_limit.py 설명

## 이 파일은 무엇을 책임지나

`rate_limit.py`는 `rate_limit` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_now`
- `_prune`
- `is_blocked`
- `record_failure`
- `record_success`
- `reset_all`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

서비스는 DB 변경을 포함할 수 있습니다. 같은 도메인의 라우터, 모델, 테스트를 함께 확인해야 합니다.

## 핵심 발췌

```python
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
```
