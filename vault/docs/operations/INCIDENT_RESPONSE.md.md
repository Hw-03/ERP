---
type: code-note
project: DEXCOWIN MES
layer: docs
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/docs/operations/INCIDENT_RESPONSE.md
tags: [vault, code-note, auto-generated, stub]
---

# INCIDENT_RESPONSE.md

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/docs/operations/INCIDENT_RESPONSE.md]]

## 원본 첫 줄

```
# 장애 대응 매뉴얼
**작성일**: 2026-05-08 | **대상**: DEXCOWIN MES 서버 담당자

---

## 즉시 연락처

> 담당자 정보를 여기에 기재하세요.

---

## 1. 재고 음수 발생

**증상**: preflight 또는 check_inventory_integrity.py 에서 음수 재고 감지

### 즉시 조치

`` `bash
# 1. 서버 즉시 중단 (추가 손상 방지)
# Ctrl+C 또는 프로세스 종료

# 2. 백업 생성
python scripts/ops/backup_db.py

# 3. 무결성 상세 점검
python scripts/ops/check_inventory_integrity.py

# 4. 음수 품목 조회 (SQLite)
sqlite3 backend/mes.db "SELECT i.item_id, it.item_code, i.warehouse_qty, i.quantity FROM inventory i JOIN item it ON it.item_id = i.item_id WHERE i.warehouse_qty < 0 OR i.quantity < 0;"
`` `
```
