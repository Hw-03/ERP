---
layer: backend
---

# test_health_smoke.py — 시스템 헬스 체크

> [!summary] /health + /health/detailed. DB ok + 행 카운트 + inventory 정합성

## 1. 역할
GET /health → 200 {status: ok}. GET /health/detailed → DB ok, rows 카운트, inventory_mismatch_count, last_transaction_at.

## 2. 실제 원본 위치
`erp/backend/tests/routers/test_health_smoke.py`

## 3. 관련 형제 파일
- [[test_settings_integrity.py.md|설정 정합성]]
- [[../conftest.py.md|공용 픽스처]]
