---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_stock_requests.py — StockRequest 워크플로

> [!summary] 8가지 시나리오: 생성→승인→반려→취소→접근 제어 + 자동 처리

## 1. 역할
wh-to-dept, 가용 부족, 다라인 롤백, 승인(pending 차감+이동), 반려, 본인취소, DEPT_INTERNAL 즉시처리, 403. PIN 오류 + FAILED_APPROVAL + 완료 후 재처리 거부.

## 2. 실제 원본 위치
`erp/backend/tests/test_stock_requests.py`

## 3. 관련 형제 파일
- [[conftest.py.md|공용 픽스처]]
- [[test_get_db_rollback.py.md|세션 롤백 검증]]
