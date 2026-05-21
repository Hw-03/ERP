---
layer: backend
---

# test_settings_integrity.py — 설정 정합성 (PIN 기반)

> [!summary] POST /api/settings/integrity/inventory. 재고 정합 검사 + PIN 인증

## 1. 역할
POST {pin, limit} → checked, mismatched_count, samples. PIN 9999 → 403. 하위호환 GET 경로도 유지.

## 2. 실제 원본 위치
`erp/backend/tests/routers/test_settings_integrity.py`

## 3. 관련 형제 파일
- [[test_health_smoke.py.md|헬스 체크]]
- [[test_pin_hardening.py.md|PIN 경화]]
