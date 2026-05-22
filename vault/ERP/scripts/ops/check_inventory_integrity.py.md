---
layer: scripts
---

# check_inventory_integrity.py — 재고 무결성 직접 점검

> [!summary] 서버 없이 DB 직접 접속. SQLite/PostgreSQL 지원. 종료 0=PASS, 1=위반

## 1. 역할
DATABASE_URL(기본 SQLite mes.db) 또는 --db-url 인수. inventory.quantity 검증. 무결성 점검(PRAGMA integrity_check).

## 2. 실제 원본 위치
erp/scripts/ops/check_inventory_integrity.py

## 3. 관련 형제 파일
- [[_verify_backup.py.md|백업 검증]]
- [[restore_db.py.md|DB 복구]]
