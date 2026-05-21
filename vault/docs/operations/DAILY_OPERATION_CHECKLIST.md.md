---
type: code-note
project: DEXCOWIN MES
layer: docs
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/docs/operations/DAILY_OPERATION_CHECKLIST.md
tags: [vault, code-note, auto-generated, stub]
---

# DAILY_OPERATION_CHECKLIST.md

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/docs/operations/DAILY_OPERATION_CHECKLIST.md]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
# 일일 운영 체크리스트 — DEXCOWIN MES

> 30명 동시 운영 기준. 매 근무일 시작 전, 운영 중, 종료 시 수행.

---

## 1. 아침 시작 점검 (오전 8시 전)

`` `
[ ] 서버 상태 확인
    python scripts/ops/preflight_30_users.py --url http://localhost:8000

[ ] 재고 무결성 점검 (서버 없이 직접 DB)
    python scripts/ops/check_inventory_integrity.py

[ ] 미처리 요청 확인 (전일 잔여 RESERVED 요청)
    - GET /api/stock-requests?status=reserved
    - 50건 초과 시 창고 담당자에게 알림

[ ] DB 백업 실행
    python scripts/ops/backup_db.py
`` `

**판정 기준:**
- preflight 전 항목 PASS → 운영 가능
- FAIL 1건 이상 → 장애 대응 절차 참조: docs/operations/INCIDENT_RESPONSE.md

---

## 2. 운영 전 확인 (첫 작업 시작 시)
```
