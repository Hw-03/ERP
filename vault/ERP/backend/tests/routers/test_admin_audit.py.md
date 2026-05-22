---
layer: backend
---

# test_admin_audit.py — 감사 로그 조회

> [!summary] GET /api/admin/audit-logs smoke. limit 검증 + prefix 필터

## 1. 역할
empty list 반환, limit ≤2000, action prefix 필터(bom.* 등). AdminAuditLog 모델 기본 동작.

## 2. 실제 원본 위치
erp/backend/tests/routers/test_admin_audit.py

## 3. 관련 형제 파일
- [[test_admin_audit_csv.py.md|감사 CSV 내보내기]]
- [[../conftest.py.md|공용 픽스처]]
