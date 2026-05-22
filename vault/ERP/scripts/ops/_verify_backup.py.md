---
layer: scripts
---

# _verify_backup.py — 백업 파일 검증 헬퍼

> [!summary] verify_backup.bat가 호출. integrity_check + 핵심 테이블 행수

## 1. 역할
.db 파일 경로 인수. PRAGMA integrity_check 실행. TABLES(items/inventory/transaction_logs/bom/admin_audit_logs) 각 행수. 종료: integrity ok→0, 아니면 1.

## 2. 실제 원본 위치
erp/scripts/ops/_verify_backup.py

## 3. 관련 형제 파일
- [[check_inventory_integrity.py.md|재고 무결성 점검]]
- [[restore_db.py.md|DB 복구]]
