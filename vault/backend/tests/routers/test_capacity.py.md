---
layer: backend
---

# test_capacity.py — 생산 용량 계산 (F1)

> [!summary] 재귀 buildable 용량. immediate/maximum + top_items

## 1. 역할
PF + simple part BOM → immediate=maximum=stock. 복잡 BOM, 부족 시나리오, 불가능 상황 검증. GET /api/production/capacity 200.

## 2. 실제 원본 위치
`erp/backend/tests/routers/test_capacity.py`

## 3. 관련 형제 파일
- [[test_bom_smoke.py.md|BOM API]]
- [[../conftest.py.md|공용 픽스처]]
