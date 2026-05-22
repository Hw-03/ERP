---
type: file-explanation
source_path: "backend/tests/routers/test_admin_audit_csv.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_admin_audit_csv.py — test_admin_audit_csv.py 설명

## 이 파일은 무엇을 책임지나

`test_admin_audit_csv.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `csv_env`
- `_add_log`
- `test_files_endpoint_empty`
- `test_backfill_then_list_and_download`
- `test_invalid_month_format_rejected`
- `test_missing_month_returns_404`

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""admin_audit_csv 라우터 smoke 테스트."""

from __future__ import annotations

import csv as _csv
import uuid
from datetime import datetime
from decimal import Decimal

import pytest

from app.models import TransactionLog, TransactionTypeEnum


@pytest.fixture()
def csv_env(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIT_CSV_DIR", str(tmp_path))
    return tmp_path


def _add_log(db_session, item_id, *, tx, qty, when):
    db_session.add(
        TransactionLog(
            log_id=uuid.uuid4(),
            item_id=item_id,
            transaction_type=tx,
            quantity_change=qty,
            quantity_before=Decimal("0"),
            quantity_after=qty,
            reference_no="R-1",
            produced_by="tester",
            notes="api smoke",
            created_at=when,
        )
    )


def test_files_endpoint_empty(client, csv_env):
    res = client.get("/api/admin/audit-csv/files")
    assert res.status_code == 200
    assert res.json() == []


def test_backfill_then_list_and_download(client, db_session, make_item, csv_env):
    item = make_item(name="API 품목")
    _add_log(db_session, item.item_id, tx=TransactionTypeEnum.RECEIVE, qty=Decimal("4"),
             when=datetime(2026, 5, 10, 9, 0))
    _add_log(db_session, item.item_id, tx=TransactionTypeEnum.SHIP, qty=Decimal("-2"),
             when=datetime(2026, 5, 11, 10, 0))
    db_session.commit()

    backfill = client.post("/api/admin/audit-csv/backfill")
    assert backfill.status_code == 200, backfill.text
    body = backfill.json()
    assert body["total_rows"] == 2
```
