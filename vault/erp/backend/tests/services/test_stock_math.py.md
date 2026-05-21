---
type: code-note
project: DEXCOWIN MES
layer: backend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/backend/tests/services/test_stock_math.py
tags: [vault, code-note, b-tier]
---

# test_stock_math.py — services/stock_math.py 단위 테스트

> [!summary] 역할
> StockFigures(재고 수량) 계산 로직 검증. warehouse_qty/pending/production/defective 합산 및 available 계산 테스트.

## 1. 이 파일의 역할
- compute_for(item_id) — 특정 Item의 모든 재고 지표 계산 (warehouse/pending/production/defective/total/available)
- test_compute_for_inventory_missing — Inventory 행 없으면 모두 0
- test_compute_for_warehouse_only — 창고 재고만 있는 경우
- test_compute_for_with_pending — pending(선점 예약) 제감 로직
- bulk_compute() 대량 계산 테스트는 생략

## 2. 실제 원본 위치
`backend/tests/services/test_stock_math.py` — 약 80줄

## 3. 주요 import
```python
from decimal import Decimal
import pytest
from app.services.stock_math import StockFigures, bulk_compute, compute_for, figures_from_inventory
```

## 4. 어디서 쓰이는지
- pytest 수행 시 (python -m pytest backend/tests/services/test_stock_math.py)
- CI/CD 파이프라인
- 재고 계산 로직 변경 시 회귀 테스트

## 5. ⚠️ 위험 포인트
- **compute_for 반복 호출은 N+1** — bulk_compute로 개선 필요하지만 단위 테스트라 무관
- Decimal 정밀도 — D("0.1") + D("0.2") != D("0.3") 가능 (부동소수 주의)
- pending 선점 로직 — available = warehouse_qty - pending (다른 부서 재고는 미차감)

## 6. 수정 전 체크
- compute_for(nonexistent_uuid) 호출 후 모든 필드 0 확인
- warehouse_qty=10, pending=3 → available=7 확인
- Decimal 계산 후 문자열 비교 (!=, < 연산 확인)
