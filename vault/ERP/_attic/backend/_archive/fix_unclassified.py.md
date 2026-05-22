---
type: file-explanation
source_path: "_attic/backend/_archive/fix_unclassified.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# fix_unclassified.py — fix_unclassified.py 설명

## 이 파일은 무엇을 책임지나

`fix_unclassified.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `pick_symbol`
- `main`

## 연결되는 파일

- [[ERP/_attic/backend/_archive/📁__archive]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""category 제거 전 레거시 보정 스크립트이며, 현재 process_type_code 단일 구조에서는 사용하지 않는다.

원본: backend/fix_unclassified.py
아카이브 이유: Item.category / CategoryEnum 제거 이후 더 이상 실행 불가.
"""
# ── 이하 원본 코드 (참조용, 실행 금지) ──────────────────────────────────────

import random
import sys
import os
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import SessionLocal
from app.models import (
    Item, Inventory, InventoryLocation, LocationStatusEnum, DepartmentEnum
)

random.seed(42)

ALL_SYMBOLS = ["3", "4", "6", "7", "8"]

LEGACY_TO_SYMBOL: dict[str, str] = {
    "DX3000":    "3",
    "COCOON":    "7",
    "SOLO":      "8",
    "ADX4000W":  "4",
    "ADX6000FB": "6",
    "ADX6000":   "6",
}

PROCESS_TO_DEPT: dict[str, DepartmentEnum] = {
    "TR": DepartmentEnum.TUBE,    "TA": DepartmentEnum.TUBE,    "TF": DepartmentEnum.TUBE,
    "HR": DepartmentEnum.HIGH_VOLTAGE, "HA": DepartmentEnum.HIGH_VOLTAGE, "HF": DepartmentEnum.HIGH_VOLTAGE,
    "VR": DepartmentEnum.VACUUM,  "VA": DepartmentEnum.VACUUM,  "VF": DepartmentEnum.VACUUM,
    "NR": DepartmentEnum.TUNING,  "NA": DepartmentEnum.TUNING,  "NF": DepartmentEnum.TUNING,
    "AR": DepartmentEnum.ASSEMBLY, "AA": DepartmentEnum.ASSEMBLY, "AF": DepartmentEnum.ASSEMBLY,
    "PR": DepartmentEnum.SHIPPING, "PA": DepartmentEnum.SHIPPING, "PF": DepartmentEnum.SHIPPING,
}


def pick_symbol(process_type_code: str | None, legacy_model: str | None, erp_code: str | None) -> str:
    if erp_code:
        parts = erp_code.split("-")
        if parts and all(c in ALL_SYMBOLS for c in parts[0]):
            return parts[0]
    if legacy_model and legacy_model in LEGACY_TO_SYMBOL:
        return LEGACY_TO_SYMBOL[legacy_model]
    k = random.randint(1, 2)
    return "".join(sorted(random.sample(ALL_SYMBOLS, k)))


def main():
    db = SessionLocal()
```
