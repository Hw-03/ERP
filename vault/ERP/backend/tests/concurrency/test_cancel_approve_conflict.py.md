---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_cancel_approve_conflict.py — 취소/승인/반려 조합 충돌

> [!summary] 요청 취소+승인, 취소+반려 동시 실행하기. 터미널 상태 1개 + 멱등 검증

## 1. 역할
4가지 충돌 시나리오: approve+cancel, reject+cancel, 중복 승인, 중복 반려. 각 경우 터미널 상태 하나만 유지, 에러 없음.

## 2. 실제 원본 위치
`erp/backend/tests/concurrency/test_cancel_approve_conflict.py`

## 3. 관련 형제 파일
- [[test_approve_reject_conflict.py.md|승인-반려 충돌]]
- [[conftest.py.md|동시성 픽스처]]
