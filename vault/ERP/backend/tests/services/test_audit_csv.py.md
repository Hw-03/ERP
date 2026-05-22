---
type: code-note
project: DEXCOWIN MES
layer: backend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/tests/services/test_audit_csv.py
tags: [vault, code-note, auto-generated, stub]
---

# test_audit_csv.py

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/backend/tests/services/test_audit_csv.py]]

## 원본 첫 줄

```
"""services/audit_csv.py 단위 테스트.

이벤트 리스너는 app.database.SessionLocal 에 묶여 있어 fixture 의 in-memory
세션과 다른 connection 을 사용하므로 별도 통합 테스트로 다룬다. 본 파일은
pure helper (row_from_log, path_for_month, AUDIT_TX_TYPES) 와 DB-backed
backfill_all 의 idempotency 만 검증한다.
"""

from __future__ import annotations

import csv
import uuid as _uuid
from datetime import datetime
from decimal import Decimal
from pathlib import Path

import pytest

from app.models import Item, TransactionLog, TransactionTypeEnum
from app.services import audit_csv


D = Decimal


@pytest.fixture()
def csv_dir(tmp_path, monkeypatch) -> Path:
    """AUDIT_CSV_DIR 을 tmp 경로로 강제."""
    monkeypatch.setenv("AUDIT_CSV_DIR", str(tmp_path))
    # backend Path import 후 캐싱 우려 없음 — get_csv_dir() 매번 환경변수 읽음
```
