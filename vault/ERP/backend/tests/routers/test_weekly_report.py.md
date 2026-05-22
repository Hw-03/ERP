---
type: file-explanation
source_path: "backend/tests/routers/test_weekly_report.py"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# test_weekly_report.py — test_weekly_report.py 설명

## 이 파일은 무엇을 책임지나

`test_weekly_report.py`는 백엔드 동작이 깨지지 않았는지 자동으로 확인하는 테스트 파일입니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `_dec`
- `_seed_product_symbols`
- `_make_prod_item`
- `_add_log`
- `test_production_matrix_basic`
- `test_production_matrix_includes_tf_pf`
- `test_production_matrix_always_has_seeded_models`
- `test_production_matrix_excludes_out_of_week`
- `test_production_matrix_excludes_non_produce`
- `test_production_matrix_excludes_unmapped_symbol`
- 그 외 3개 항목

## 연결되는 파일

- [[ERP/backend/tests/routers/📁_routers]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```python
"""주간보고 /weekly-report 엔드포인트 테스트 — production_matrix 집계 검증.

매칭 규칙(2026-05-20~): `Item.model_symbol` 단일 글자만 매트릭스에 노출.
다중 글자(예: "346" 공용 부품)/None 은 비노출. 모델 라벨/순서는 `ProductSymbol` DB 동적.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import pytest
from app.models import Inventory, Item, ProductSymbol, TransactionLog, TransactionTypeEnum


WEEK_START = "2026-05-04"  # 월요일
WEEK_END = "2026-05-10"    # 일요일
_WEEK_MID = datetime(2026, 5, 6, 12, 0, 0)
_WEEK_BEFORE = datetime(2026, 4, 27, 12, 0, 0)


def _dec(v) -> Decimal:
    return Decimal(str(v))


@pytest.fixture(autouse=True)
def _seed_product_symbols(db_session):
    """매 테스트에 5개 정규 모델 symbol seed (slot 순서가 매트릭스 행 순서)."""
    seeds = [
        (1, "3", "DX3000"),
        (2, "4", "ADX4000W"),
        (3, "6", "ADX6000"),
        (4, "7", "COCOON"),
        (5, "8", "SOLO"),
    ]
    for slot, symbol, name in seeds:
        db_session.add(ProductSymbol(slot=slot, symbol=symbol, model_name=name))
    db_session.flush()


def _make_prod_item(db_session, *, name: str, process_code: str,
                    model_symbol: str | None = None,
                    qty: Decimal = Decimal("0")) -> Item:
    item = Item(item_name=name, process_type_code=process_code, unit="EA",
                model_symbol=model_symbol)
    db_session.add(item)
    db_session.flush()
    db_session.add(Inventory(
        item_id=item.item_id,
        quantity=qty,
        warehouse_qty=qty,
        pending_quantity=Decimal("0"),
    ))
    db_session.flush()
    return item
```
