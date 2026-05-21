---
layer: backend
---
type: code-note
status: active
updated: 2026-05-21
project: DEXCOWIN MES
---

# test_admin_audit_csv.py — 감사 CSV 내보내기

> [!summary] admin_audit_csv 라우터. TransactionLog CSV 방출 + AUDIT_CSV_DIR

## 1. 역할
CSV 환경 설정(tmp_path monkeypatch). TransactionLog 생성 후 CSV 내보내기. CSV 형식 + 파일 위치 검증.

## 2. 실제 원본 위치
`erp/backend/tests/routers/test_admin_audit_csv.py`

## 3. 관련 형제 파일
- [[test_admin_audit.py.md|감사 로그 조회]]
- [[../conftest.py.md|공용 픽스처]]
