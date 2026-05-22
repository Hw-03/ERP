---
type: file-explanation
source_path: "backend/tests/routers/test_dept_adjustment.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_dept_adjustment.py — test_dept_adjustment.py 설명

## 이 파일은 무엇을 책임지나

`test_dept_adjustment.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_prod_qty`
- `test_get_bom_template_production`
- `test_get_bom_template_disassembly`
- `test_get_bom_template_item_not_found`
- `test_get_bom_template_invalid_sub_type`
- `test_expand_component_endpoint`
- `test_expand_component_no_children_422`
- `test_submit_production_api`
- `test_submit_correction_api`
- `test_submit_stock_shortage_422`
- 그 외 2개 항목

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""routers/dept_adjustment.py 통합 테스트."""

from __future__ import annotations

from decimal import Decimal

from app.models import DepartmentEnum, LocationStatusEnum

D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY


def _prod_qty(db_session, item_id, dept=ASSEMBLY) -> Decimal:
    from app.models import InventoryLocation
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


# ──────────────────────────── bom-template ────────────────────────────

def test_get_bom_template_production(client, db_session, make_item, make_bom):
    parent = make_item(name="AF")
    child = make_item(name="AR")
    make_bom(parent.item_id, child.item_id, D("2"))
    db_session.commit()

    resp = client.get(
        "/api/dept-adjustment/bom-template",
        params={"item_id": str(parent.item_id), "sub_type": "production", "quantity": "1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["sub_type"] == "production"
    lines = data["lines"]
    directions = {l["direction"] for l in lines}
    assert "out" in directions
    assert "in" in directions

    in_lines = [l for l in lines if l["direction"] == "in"]
    assert in_lines[0]["item_id"] == str(parent.item_id)


def test_get_bom_template_disassembly(client, db_session, make_item, make_bom):
    parent = make_item(name="AF")
    child = make_item(name="AR")
    make_bom(parent.item_id, child.item_id, D("3"))
    db_session.commit()
```
