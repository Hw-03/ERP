---
type: code-note
project: DEXCOWIN MES
layer: backend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/services/rate_limit.py
tags: [vault, code-note, auto-generated, stub]
---

# rate_limit.py

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/backend/app/services/rate_limit.py]]

## 원본 첫 줄

```
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
```
