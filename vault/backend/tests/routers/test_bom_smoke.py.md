---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_bom_smoke.py — BOM API smoke

> [!summary] 생성/조회/트리/역추적. POST 201 + GET 200 + JSON 검증

## 1. 역할
POST /api/bom로 부모-자식 관계 생성. GET /api/bom/{id}로 flat rows 조회. JSON body(parent_item_id, child_item_id, quantity, unit).

## 2. 실제 원본 위치
`erp/backend/tests/routers/test_bom_smoke.py`

## 3. 관련 형제 파일
- [[test_capacity.py.md|생산 용량 계산]]
- [[../conftest.py.md|공용 픽스처]]
