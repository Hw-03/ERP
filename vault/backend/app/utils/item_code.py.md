---
type: code-note
project: DEXCOWIN MES
layer: backend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/app/utils/item_code.py
tags: [vault, code-note, auto-generated, stub]
---

# item_code.py

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/backend/app/utils/item_code.py]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"""4-part item code generation utility.

Format: {model_symbol}-{process_type}-{serial:04d}[-{option}]
Example: 346-AR-0001, 3-PA-0001-BG, 34-TR-0023
model_symbol = 각 제품 기호를 오름차순 정렬해 연결 (DX3000→"3", ADX4000W→"4", ADX6000→"6")

품목 분류 단일 기준은 process_type_code 18개 (README/docs/ITEM_CODE_RULES.md).
suffix 'F' = F타입(완성/출하성 — 창고 배치 불가).
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

# slot → 표시 기호 (ProductSymbol 테이블의 새 값과 동기화)
SLOT_TO_SYMBOL: dict[int, str] = {
    1: "3",   # DX3000
    2: "7",   # COCOON
    3: "8",   # SOLO
    4: "4",   # ADX4000W
    5: "6",   # ADX6000FB
}


def slots_to_model_symbol(slots: list[int]) -> str:
    """슬롯 목록 → 정렬된 기호 문자열.
    예: [1, 4, 5] → "346" (DX3000 기호"3" + ADX4000W 기호"4" + ADX6000 기호"6")
    """
    symbols = sorted(SLOT_TO_SYMBOL[s] for s in slots if s in SLOT_TO_SYMBOL)
    return "".join(symbols)

```
