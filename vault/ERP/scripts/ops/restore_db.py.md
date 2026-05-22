---
layer: scripts
---

# restore_db.py — DB 복구 유틸리티

> [!summary] SQLite/.sql 덤프 복구. 복구 전 .pre-restore 자동 백업. --check 플래그

## 1. 역할
--sqlite 파일 → backend/mes.db. --postgres 덤프 → Docker 컨테이너(DROP→CREATE→import). --check 플래그로 복구 후 무결성 점검.

## 2. 실제 원본 위치
erp/scripts/ops/restore_db.py

## 3. 관련 형제 파일
- [[check_inventory_integrity.py.md|재고 무결성 점검]]
- [[_verify_backup.py.md|백업 검증]]
