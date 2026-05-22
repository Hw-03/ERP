---
type: file-explanation
source_path: "scripts/ops/load_test_30_users.py"
importance: important
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# load_test_30_users.py — load_test_30_users.py 설명

## 이 파일은 무엇을 책임지나

`load_test_30_users.py`는 운영자가 백업, 복구, 헬스체크, 정합성 확인에 쓰는 운영 스크립트입니다.

## 업무 흐름에서의 의미

운영 중 장애 대응, 백업, 복구, 정합성 점검처럼 실제 데이터 안전과 연결됩니다.

## 언제 보면 좋나

- 운영 점검, 백업, 복구, 정합성 확인이 필요할 때
- 장애 대응 절차를 검토할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ScenarioResult`
- `LoadTestReport`
- `_summarize`
- `_write_markdown_report`
- `parse_args`
- `scenario_health_check`
- `scenario_create_request`
- `scenario_list_inventory`
- `scenario_fullflow_create_and_cancel`
- `scenario_duplicate_submit`
- 그 외 6개 항목

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
"""30명 동시 입출고 부하 테스트.

사용법:
    python scripts/ops/load_test_30_users.py --url http://localhost:8000
    python scripts/ops/load_test_30_users.py --url http://localhost:8000 --users 10 --rounds 3
    python scripts/ops/load_test_30_users.py --url http://localhost:8000 --dry-run

경고:
    - 운영 DB에 실제 데이터가 생성/변경됩니다.
    - 반드시 테스트용 품목(item_code가 'TEST-'로 시작)과 테스트용 직원만 사용합니다.
    - --confirm 없이는 실행되지 않습니다.

결과:
    outputs/load_test/YYYYMMDD_HHMMSS_report.json 에 저장됩니다.
"""

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

try:
    import httpx
except ImportError:
    print("httpx 미설치. pip install httpx 후 재실행하세요.")
    sys.exit(1)


# ---------------------------------------------------------------------------
# 결과 데이터 구조
# ---------------------------------------------------------------------------

@dataclass
class ScenarioResult:
    user_id: int
    scenario: str
    status_code: int
    latency_ms: float
    success: bool
    error: Optional[str] = None


@dataclass
class LoadTestReport:
    test_at: str
    base_url: str
```
