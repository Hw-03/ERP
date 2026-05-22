---
type: file-explanation
source_path: "_attic/scripts/dev/randomize_inventory.py"
importance: reference
layer: archive
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# randomize_inventory.py — randomize_inventory.py 설명

## 이 파일은 무엇을 책임지나

`randomize_inventory.py`는 현재 운영 코드가 아니라 과거 자료나 실험 결과를 보관한 참고 파일입니다.

## 업무 흐름에서의 의미

과거 맥락을 이해하는 데 도움은 되지만, 현재 운영 기준으로 바로 사용하면 안 됩니다.

## 언제 보면 좋나

- 과거 자료의 의미를 확인할 때
- 현재 코드와 비교할 참고 근거가 필요할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `weighted_sample`
- `split_quantity`
- `randomize`

## 연결되는 파일

- [[ERP/_attic/scripts/dev/📁_dev]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

보관 자료입니다. 현재 코드처럼 믿고 수정하거나 실행하지 않습니다.

## 핵심 발췌

```python
"""
창고/부서 랜덤 재고 분배 + 안전재고 설정 스크립트.

Usage:
    python scripts/dev/randomize_inventory.py           # dry-run (미리보기만)
    python scripts/dev/randomize_inventory.py --apply   # 실제 DB 반영

규칙:
- 각 품목의 현재 총 수량을 창고 + 1~3개 부서로 랜덤 분배
- process_type_code 별 주요 부서 가중치 반영 (TR/TA/TF→튜브, AA/AF→조립, PA/PF→출하, ...)
- 10% 확률로 불량 재고 추가 (총량의 2-8%)
- 안전재고: 70% 품목에 설정, 그 중 30%는 현재 재고 이하로 설정해 경보 테스트
"""
from __future__ import annotations

import os
import random
import sys
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DATABASE_URL"] = f"sqlite:///{(BACKEND_DIR / 'erp.db').as_posix()}"

from app.database import SessionLocal
from app.models import (
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
)

random.seed(42)

# process_type_code 별 가중 부서 목록 (앞쪽이 더 높은 확률)
# 키는 18종 공정 코드. 사용 0건인 코드(NA, TA)도 정의해 둔다.
PROCESS_TYPE_DEPT_WEIGHTS: dict[str, list[tuple[DepartmentEnum, int]]] = {
    # 튜브 (T)
    "TR": [(DepartmentEnum.TUBE, 4), (DepartmentEnum.ASSEMBLY, 2), (DepartmentEnum.TUNING, 1)],
    "TA": [(DepartmentEnum.TUBE, 5), (DepartmentEnum.ASSEMBLY, 2), (DepartmentEnum.TUNING, 1)],
    "TF": [(DepartmentEnum.TUBE, 5), (DepartmentEnum.ASSEMBLY, 2)],
    # 고압 (H)
    "HR": [(DepartmentEnum.HIGH_VOLTAGE, 4), (DepartmentEnum.ASSEMBLY, 2)],
    "HA": [(DepartmentEnum.HIGH_VOLTAGE, 5), (DepartmentEnum.ASSEMBLY, 2), (DepartmentEnum.RESEARCH, 1)],
    "HF": [(DepartmentEnum.HIGH_VOLTAGE, 5), (DepartmentEnum.ASSEMBLY, 2)],
    # 진공 (V)
    "VR": [(DepartmentEnum.VACUUM, 4), (DepartmentEnum.ASSEMBLY, 2), (DepartmentEnum.TUNING, 1)],
    "VA": [(DepartmentEnum.VACUUM, 5), (DepartmentEnum.ASSEMBLY, 2), (DepartmentEnum.TUNING, 1)],
    "VF": [(DepartmentEnum.VACUUM, 5), (DepartmentEnum.ASSEMBLY, 2)],
    # 튜닝 (N)
    "NR": [(DepartmentEnum.TUNING, 4), (DepartmentEnum.VACUUM, 2), (DepartmentEnum.ASSEMBLY, 1)],
    "NA": [(DepartmentEnum.TUNING, 5), (DepartmentEnum.VACUUM, 2)],
    "NF": [(DepartmentEnum.TUNING, 5), (DepartmentEnum.ASSEMBLY, 2)],
```
