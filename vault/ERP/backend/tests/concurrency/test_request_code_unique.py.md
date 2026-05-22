---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_request_code_unique.py — request_code 중복 방지

> [!summary] 1000건 동시 생성해도 request_code (SR-YYYYMMDD-HHMMSS-XXXXXXXX) unique

## 1. 역할
32비트 엔트로피 + IntegrityError retry로 중복 없는 요청 코드 생성. 동시 다중 요청에서 유일성 검증.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_request_code_unique.py`

## 3. 관련 형제 파일
- [[test_submit_concurrent.py.md|동시 제출]]
- [[test_approve_concurrent.py.md|동시 승인]]
