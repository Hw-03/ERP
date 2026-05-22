---
type: file-explanation
source_path: "scripts/dev/seed_history_cases.py"
importance: normal
layer: scripts
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# seed_history_cases.py — seed_history_cases.py 설명

## 이 파일은 무엇을 책임지나

`seed_history_cases.py`는 개발/검증/데이터 정리에 쓰는 보조 스크립트입니다.

## 업무 흐름에서의 의미

개발자가 변경 전후 품질을 확인하거나 데이터 작업을 준비할 때 사용합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_ensure_queue_batches_stub`
- `_notes`
- `_pick_items`
- `_pick_employee`
- `_new_batch`
- `_new_bundle`
- `_new_line`
- `_new_log`
- `main`

## 연결되는 파일

- [[ERP/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
#!/usr/bin/env python3
"""우측 상세 카드 15 시각 케이스 시드 스크립트 (phase4 검수 전용).

phase4 우측 카드 재정비 직후, MCP 수동 클릭 대신 한 번 실행으로
15개 거래 케이스를 DB 에 시드한다.

낱개 9건: RECEIVE / SHIP / TRANSFER_TO_PROD / TRANSFER_TO_WH /
         TRANSFER_DEPT / ADJUST+ / ADJUST- / MARK_DEFECTIVE / SUPPLIER_RETURN
묶음 6건: PRODUCE BOM / DISASSEMBLE BOM / BACKFLUSH 단일 /
         PRODUCE BOM(제외 자식 포함) / ADJUST+ + 수정 이력 / legacy(batch null)

실행: python scripts/dev/seed_history_cases.py
"""

from __future__ import annotations

import datetime
import json
import sys
import uuid
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

from app.database import SessionLocal, engine  # noqa: E402

# 다른 세션의 queue 도메인 삭제 작업이 transaction_logs.batch_id FK 가 참조하는
# queue_batches 테이블을 drop 했지만 transaction_logs 의 DDL 에는 그대로 잔재.
# SQLite 가 NULL FK 도 referenced 테이블 존재를 검사하므로 빈 stub 추가.
import sqlite3 as _sqlite3  # noqa: E402
def _ensure_queue_batches_stub():
    if engine.url.drivername.startswith("sqlite"):
        con = _sqlite3.connect(engine.url.database)
        con.execute("CREATE TABLE IF NOT EXISTS queue_batches (batch_id TEXT PRIMARY KEY)")
        con.commit()
        con.close()
_ensure_queue_batches_stub()
from app.models import (  # noqa: E402
    Employee,
    IoBatch,
    IoBundle,
    IoLine,
    Item,
    TransactionEditLog,
    TransactionLog,
    TransactionTypeEnum,
)


MARKER = f"HISTORY-CASES-{datetime.datetime.utcnow():%Y%m%d%H%M%S}"
```
