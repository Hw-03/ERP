---
layer: backend
---

# test_items_update.py — 품목 갱신 (process_type_code)

> [!summary] PUT /api/items/{id} 회귀. process_type_code 변경 반영

## 1. 역할
ItemUpdate 스키마 + update_item 루프에서 process_type_code 포함 확인. 프론트 PUT 요청과 백엔드 계약 일치.

## 2. 실제 원본 위치
`erp/backend/tests/routers/test_items_update.py`

## 3. 관련 형제 파일
- [[test_bom_smoke.py.md|BOM API]]
- [[../conftest.py.md|공용 픽스처]]
