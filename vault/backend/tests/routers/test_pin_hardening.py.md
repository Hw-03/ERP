---
layer: backend
---

# test_pin_hardening.py — PIN 경화 (레이트 리미팅)

> [!summary] WS7: PIN 실패 시 429 레이트 리미팅 + 성공 시 리셋

## 1. 역할
작업자 PIN 검증 실패-시도 레이트 리미터. request body PIN 전달 하위호환 경로. Employee PIN 기본값 DEFAULT_PIN_HASH.

## 2. 실제 원본 위치
`erp/backend/tests/routers/test_pin_hardening.py`

## 3. 관련 형제 파일
- [[test_employee_pin.py.md|직원 PIN 로그인]]
- [[../conftest.py.md|공용 픽스처]]
