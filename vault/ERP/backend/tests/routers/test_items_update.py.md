---
type: file-explanation
source_path: "backend/tests/routers/test_items_update.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_items_update.py — test_items_update.py 설명

## 이 파일은 무엇을 책임지나

`test_items_update.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `test_update_item_changes_process_type_code`
- `test_update_item_does_not_clear_process_type_code_when_omitted`
- `test_update_item_legacy_fields`
- `test_update_item_supplier`
- `test_update_item_min_stock_decimal`
- `test_update_item_empty_payload_no_change`

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""PUT /api/items/{item_id} — process_type_code 갱신 회귀 테스트.

이전 버그: ItemUpdate 스키마와 update_item 루프 모두 process_type_code 를
포함하지 않아 프론트에서 PUT 으로 보내도 백엔드가 무시했다. 이 테스트는
프론트와 백엔드 계약이 일치하는지 보장한다.

라우트는 @router.put — PATCH 가 아니라 PUT 으로 호출한다.
"""

from __future__ import annotations


def test_update_item_changes_process_type_code(client, make_item):
    item = make_item(name="공정변경대상", process_type_code="TR")

    # 변경 전 baseline
    res = client.get(f"/api/items/{item.item_id}")
    assert res.status_code == 200
    assert res.json()["process_type_code"] == "TR"

    # PUT 으로 process_type_code 만 변경
    res = client.put(
        f"/api/items/{item.item_id}",
        json={"process_type_code": "HF"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["process_type_code"] == "HF"

    # 재조회 시에도 유지되는지
    res = client.get(f"/api/items/{item.item_id}")
    assert res.status_code == 200
    assert res.json()["process_type_code"] == "HF"


def test_update_item_does_not_clear_process_type_code_when_omitted(client, make_item):
    """다른 필드 갱신 시 process_type_code 가 유지되는지."""
    item = make_item(name="유지대상", process_type_code="VA")

    res = client.put(
        f"/api/items/{item.item_id}",
        json={"item_name": "이름만 변경"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["item_name"] == "이름만 변경"
    assert body["process_type_code"] == "VA"


def test_update_item_legacy_fields(client, make_item):
    """legacy_part / legacy_item_type 갱신 (legacy_file_type 제거됨)."""
    item = make_item(name="레거시필드", process_type_code="TR")

    res = client.put(
        f"/api/items/{item.item_id}",
        json={
```
