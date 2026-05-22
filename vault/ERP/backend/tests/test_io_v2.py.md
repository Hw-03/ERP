---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_io_v2.py — IO 테스트 헬퍼

> [!summary] IoBatch/IoLine, Employee, Inventory 생성 헬퍼 모음

## 1. 역할
_make_employee, _make_item, _setup_inventory 등 IO 테스트용 공용 헬퍼. TransactionLog, IoBatch 검증용.

## 2. 실제 원본 위치
`erp/backend/tests/test_io_v2.py`

## 3. 관련 형제 파일
- [[conftest.py.md|공용 픽스처]]
- [[test_stock_requests.py.md|스톡 요청 워크플로]]
