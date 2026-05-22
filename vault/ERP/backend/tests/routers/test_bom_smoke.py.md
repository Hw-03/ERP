---
type: file-explanation
source_path: "backend/tests/routers/test_bom_smoke.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_bom_smoke.py — test_bom_smoke.py 설명

## 이 파일은 무엇을 책임지나

`test_bom_smoke.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `test_bom_create_query_tree_and_where_used_smoke`
- `test_bom_duplicate_and_circular_references_are_blocked`

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""BOM API smoke tests for direct rows, tree, and where-used lookups."""

from __future__ import annotations

from decimal import Decimal


def test_bom_create_query_tree_and_where_used_smoke(client, make_item):
    parent = make_item(name="스모크 상위", process_type_code="AF")
    child = make_item(name="스모크 하위", process_type_code="TR")

    created = client.post(
        "/api/bom",
        json={
            "parent_item_id": str(parent.item_id),
            "child_item_id": str(child.item_id),
            "quantity": "2.5",
            "unit": "EA",
            "notes": "smoke",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["parent_item_id"] == str(parent.item_id)
    assert body["child_item_id"] == str(child.item_id)
    assert Decimal(str(body["quantity"])) == Decimal("2.5")

    flat = client.get(f"/api/bom/{parent.item_id}")
    assert flat.status_code == 200, flat.text
    assert len(flat.json()) == 1

    all_rows = client.get("/api/bom")
    assert all_rows.status_code == 200, all_rows.text
    assert any(row["child_item_id"] == str(child.item_id) for row in all_rows.json())

    tree = client.get(f"/api/bom/{parent.item_id}/tree")
    assert tree.status_code == 200, tree.text
    tree_body = tree.json()
    assert tree_body["item_id"] == str(parent.item_id)
    assert len(tree_body["children"]) == 1
    assert tree_body["children"][0]["item_id"] == str(child.item_id)

    where_used = client.get(f"/api/bom/where-used/{child.item_id}")
    assert where_used.status_code == 200, where_used.text
    assert len(where_used.json()) == 1
    assert where_used.json()[0]["parent_item_id"] == str(parent.item_id)


def test_bom_duplicate_and_circular_references_are_blocked(client, make_item):
    parent = make_item(name="스모크 부모", process_type_code="AF")
    child = make_item(name="스모크 자식", process_type_code="TR")

    payload = {
        "parent_item_id": str(parent.item_id),
        "child_item_id": str(child.item_id),
```
