---
type: file-explanation
source_path: "backend/tests/routers/test_settings_integrity.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_settings_integrity.py — test_settings_integrity.py 설명

## 이 파일은 무엇을 책임지나

`test_settings_integrity.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `test_integrity_inventory_post_uses_body_pin`
- `test_integrity_inventory_post_rejects_wrong_pin`
- `test_integrity_inventory_get_compatibility_is_kept`

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""Settings integrity endpoint smoke tests."""

from __future__ import annotations

from decimal import Decimal


def test_integrity_inventory_post_uses_body_pin(client, make_item):
    make_item(name="정합성 POST", warehouse_qty=Decimal("3"))

    resp = client.post(
        "/api/settings/integrity/inventory",
        json={"pin": "0000", "limit": 50},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["checked"] == 1
    assert body["mismatched_count"] == 0
    assert body["samples"] == []


def test_integrity_inventory_post_rejects_wrong_pin(client):
    resp = client.post(
        "/api/settings/integrity/inventory",
        json={"pin": "9999", "limit": 50},
    )
    assert resp.status_code == 403


def test_integrity_inventory_get_compatibility_is_kept(client, make_item):
    make_item(name="정합성 GET 호환", warehouse_qty=Decimal("2"))

    resp = client.get("/api/settings/integrity/inventory", params={"pin": "0000", "limit": 10})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["checked"] == 1
    assert body["mismatched_count"] == 0
```
