---
type: file-explanation
source_path: "scripts/ops/preflight_30_users.py"
importance: important
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# preflight_30_users.py — preflight_30_users.py 설명

## 이 파일은 무엇을 책임지나

`preflight_30_users.py`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.

## 업무 흐름에서의 의미

운영 중 장애 대응, 백업, 복구, 정합성 점검처럼 실제 데이터 안전과 연결됩니다.

## 언제 보면 좋나

- 운영 점검, 백업, 복구, 정합성 확인이 필요할 때
- 장애 대응 절차를 검토할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `CheckResult`
- `record`
- `check_server_reachable`
- `check_db_engine_from_server`
- `check_db_write`
- `check_health_detailed`
- `check_inventory_negative`
- `check_pending_consistency`
- `check_inventory_invariant`
- `check_open_requests`
- 그 외 8개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/docs/operations/DAILY_OPERATION_CHECKLIST.md]] — `DAILY_OPERATION_CHECKLIST.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/docs/operations/INCIDENT_RESPONSE.md]] — `INCIDENT_RESPONSE.md`는 프로젝트 기준이나 운영 방법을 설명하는 원본 문서입니다.
- [[ERP/backend/app/services/integrity.py]] — `integrity.py`는 `integrity` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 조심할 점

운영 스크립트는 실제 DB 파일이나 백업 파일을 건드릴 수 있습니다. 실행 전 대상 경로를 확인해야 합니다.

## 핵심 발췌

```python
#!/usr/bin/env python3
"""30명 동시 운영 사전 점검 스크립트 (100점 기준).

사용법:
    python scripts/ops/preflight_30_users.py --url http://localhost:8000

각 점검 항목을 ✅ PASS / ⚠️  WARN / ❌ FAIL 로 출력하고,
마지막에 전체 판정을 보고합니다.

종료 코드:
    0 = 전체 PASS
    1 = FAIL 항목 있음
    2 = WARN만 있음 (FAIL 없음)
"""

import argparse
import asyncio
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

try:
    import httpx
except ImportError:
    print("httpx 미설치: pip install httpx")
    sys.exit(1)


CheckLevel = Literal["PASS", "WARN", "FAIL"]


@dataclass
class CheckResult:
    name: str
    level: CheckLevel
    message: str


results: list[CheckResult] = []


def record(name: str, level: CheckLevel, message: str) -> None:
    icon = {"PASS": "✅", "WARN": "⚠️ ", "FAIL": "❌"}[level]
    print(f"  {icon} {name}: {message}")
    results.append(CheckResult(name, level, message))


# ---------------------------------------------------------------------------
# 점검 함수 (15개)
# ---------------------------------------------------------------------------

async def check_server_reachable(client: httpx.AsyncClient, base_url: str) -> bool:
```
