---
layer: scripts
---

# seed_history_cases.py — 거래 내역 15케이스 시드

> [!summary] phase4 우측 카드 검수용. TransactionLog 15건(낱개 9 + 묶음 6)

## 1. 역할
낱개 9: RECEIVE/SHIP/TRANSFER_TO_PROD/TRANSFER_TO_WH/TRANSFER_DEPT/ADJUST+/ADJUST-/MARK_DEFECTIVE/SUPPLIER_RETURN. 묶음 6: PRODUCE BOM / DISASSEMBLE / BACKFLUSH / (제외 자식) / 수정 이력 / legacy.

## 2. 실제 원본 위치
erp/scripts/dev/seed_history_cases.py

## 3. 관련 형제 파일
- [[../ops/check_inventory_integrity.py.md|재고 무결성 점검]]
- [[../ops/restore_db.py.md|DB 복구]]
