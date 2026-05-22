---
type: file-explanation
source_path: "backend/tests/services/test_audit_csv.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_audit_csv.py — test_audit_csv.py 설명

## 이 파일은 무엇을 책임지나

`test_audit_csv.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `csv_dir`
- `_mk_log`
- `test_audit_tx_types_excludes_production`
- `test_audit_tx_types_includes_material_movement`
- `test_row_from_log_columns_in_order`
- `test_row_from_log_strips_newlines_in_notes`
- `test_path_for_month_uses_env_dir`
- `test_backfill_writes_monthly_files`
- `test_backfill_excludes_produce`
- `test_backfill_idempotent`
- 그 외 3개 항목

## 연결되는 파일

- [[ERP/backend/tests/services/📁_services]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
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
    return tmp_path


def _mk_log(item_id, *, tx: TransactionTypeEnum, qty, when: datetime) -> TransactionLog:
    log = TransactionLog(
        log_id=_uuid.uuid4(),
        item_id=item_id,
        transaction_type=tx,
        quantity_change=qty,
        quantity_before=D("0"),
        quantity_after=qty,
        reference_no="RX-001",
        produced_by="홍길동",
        notes="단위 테스트",
        created_at=when,
    )
    return log


def test_audit_tx_types_excludes_production():
    """생산/백플러시는 명시적으로 제외."""
    assert TransactionTypeEnum.PRODUCE not in audit_csv.AUDIT_TX_TYPES
    assert TransactionTypeEnum.BACKFLUSH not in audit_csv.AUDIT_TX_TYPES
```
