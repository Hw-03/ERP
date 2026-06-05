---
type: file-explanation
source_path: "backend/app/services/inventory.py"
importance: critical
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# inventory.py — 재고 수량 변경의 핵심 규칙

## 이 파일은 무엇을 책임지나

입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.

## 업무 흐름에서의 의미

창고 수량, 부서 사용 수량, 불량 격리 수량이 맞는지 결정하는 매우 중요한 위치입니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `dept_for_process_type`
- `get_or_create_inventory`
- `_lock_inventory`
- `_lock_location`
- `_get_or_create_location`
- `production_total`
- `defective_total`
- `available`
- `_sync_total`
- `reserve`
- 그 외 8개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.
- [[ERP/backend/app/schemas.py]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/database.py]] — `database.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/database.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 조심할 점

수량 계산 오류는 실제 재고 불일치로 이어집니다. 수정 전후로 정합성 점검과 거래 로그 확인이 필요합니다.

## 핵심 발췌

```python
"""Inventory service helpers.

3-bucket 모델:
- warehouse_qty (창고)
- production: InventoryLocation rows where status=PRODUCTION (부서별)
- defective: InventoryLocation rows where status=DEFECTIVE (부서별)

Inventory.quantity = warehouse_qty + Σ InventoryLocation.quantity (불변식).
가용 재고 available = warehouse_qty + Σ(PRODUCTION) − pending_quantity. 불량 제외.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional
import uuid

from sqlalchemy import func, update as sa_update
from sqlalchemy.orm import Session

from app.database import _is_sqlite
from app.models import (
    DepartmentEnum,
    Employee,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
)


# ---------------------------------------------------------------------------
# process_type_code → 부서 자동 매핑 (PRODUCE 결과물 적재용)
# 18개 공정코드(README 기준): prefix 1글자(T/H/V/N/A/P)가 부서 계열을 결정.
# R 시리즈(원자재)는 창고 폴백 — None 반환.
# ---------------------------------------------------------------------------
PROCESS_TYPE_TO_DEPT: dict[str, DepartmentEnum] = {
    # 튜브
    "TA": DepartmentEnum.TUBE,
    "TF": DepartmentEnum.TUBE,
    # 고압
    "HA": DepartmentEnum.HIGH_VOLTAGE,
    "HF": DepartmentEnum.HIGH_VOLTAGE,
    # 진공
    "VA": DepartmentEnum.VACUUM,
    "VF": DepartmentEnum.VACUUM,
    # 튜닝
    "NA": DepartmentEnum.TUNING,
    "NF": DepartmentEnum.TUNING,
    # 조립
    "AA": DepartmentEnum.ASSEMBLY,
    "AF": DepartmentEnum.ASSEMBLY,
    # 출하
    "PA": DepartmentEnum.SHIPPING,
    "PF": DepartmentEnum.SHIPPING,
```
