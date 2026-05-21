---
layer: backend
---

# test_employee_pin.py — 직원 PIN 로그인

> [!summary] 작업자 식별용 PIN. 기본값 0000 + 커스텀 PIN + 활성 상태

## 1. 역할
Employee PIN 검증. DEFAULT_PIN_HASH, hash_pin(). 직원 생성(pin_hash=None → 0000). is_active 상태 체크.

## 2. 실제 원본 위치
`erp/backend/tests/routers/test_employee_pin.py`

## 3. 관련 형제 파일
- [[test_pin_hardening.py.md|PIN 경화]]
- [[../conftest.py.md|공용 픽스처]]
