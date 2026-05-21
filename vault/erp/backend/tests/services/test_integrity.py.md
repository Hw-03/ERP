---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/tests/services/test_integrity.py
tags: [vault, code-note, b-tier]
---

# test_integrity.py — services/integrity.py 무결성 검사 테스트

> [!summary] 역할
> Inventory 데이터 일관성 검사. quantity = warehouse_qty + Σ(InventoryLocation.quantity) 검증.

## 1. 이 파일의 역할
- check_inventory_consistency() — 모든 Item의 quantity vs 계산값 미스매치 감지
- repair_inventory_totals() — quantity 값 자동 정정
- test_check_consistency_no_mismatch — 정상 케이스
- test_check_consistency_with_locations_balanced — 위치 포함 정상
- test_check_consistency_quantity_too_high — recorded > computed (과다 계산)

## 2. 실제 원본 위치
`backend/tests/services/test_integrity.py` — 약 70줄

## 3. 주요 import
```python
from decimal import Decimal
import pytest
from app.services.integrity import check_inventory_consistency, repair_inventory_totals
from app.models import LocationStatusEnum
```

## 4. 어디서 쓰이는지
- pytest 단위 테스트
- DAILY_OPERATION_CHECKLIST.md: 아침 8시 전 무결성 점검 (실제: check_inventory_integrity.py CLI)
- 거래 생성/수정 후 검증

## 5. ⚠️ 위험 포인트
- **InventoryLocation 추가 후 Inventory.quantity 동기화 미실행** — 테스트에서 수동 동기화 (inv.quantity = D("7"))
- repair_inventory_totals()는 quantity 만 수정 — warehouse_qty 개별 실패는 감지 안 함
- 다중 부서 위치(PRODUCTION/DEFECTIVE)가 섞여 있을 때 합산 로직 정확성 확인 필수

## 6. 수정 전 체크
- make_item(warehouse_qty=D("10")) → check_inventory_consistency() → [] (미스매치 0)
- quantity를 D("8")로 과다 설정 → check_inventory_consistency() → 미스매치 감지 확인
- repair_inventory_totals(item_id) 후 quantity 자동 수정 확인
