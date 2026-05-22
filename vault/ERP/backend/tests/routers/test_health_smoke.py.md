---
type: file-explanation
source_path: "backend/tests/routers/test_health_smoke.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_health_smoke.py — test_health_smoke.py 설명

## 이 파일은 무엇을 책임지나

`test_health_smoke.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `test_health_and_detailed_health_are_ok`
- `test_detailed_health_reports_degraded_on_inventory_mismatch`

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""System health smoke tests."""

from __future__ import annotations

from decimal import Decimal

from app.models import Inventory


def test_health_and_detailed_health_are_ok(client, make_item):
    make_item(name="헬스 스모크", warehouse_qty=Decimal("4"))

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    detailed = client.get("/health/detailed")
    assert detailed.status_code == 200, detailed.text
    body = detailed.json()
    assert body["status"] == "ok"
    assert body["db"]["ok"] is True
    assert body["rows"]["items"] == 1
    assert body["rows"]["inventory"] == 1
    assert body["inventory_mismatch_count"] == 0
    assert "last_transaction_at" in body


def test_detailed_health_reports_degraded_on_inventory_mismatch(client, db_session, make_item):
    item = make_item(name="헬스 미스매치", warehouse_qty=Decimal("4"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = Decimal("99")
    db_session.commit()

    detailed = client.get("/health/detailed")
    assert detailed.status_code == 200, detailed.text
    body = detailed.json()
    assert body["status"] == "degraded"
    assert body["inventory_mismatch_count"] == 1
```
