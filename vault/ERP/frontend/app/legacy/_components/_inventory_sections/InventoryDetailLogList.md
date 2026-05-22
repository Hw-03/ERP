---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_inventory_sections/InventoryDetailLogList.tsx
tags: [vault, code-note, frontend, b-tier]
---

# InventoryDetailLogList — 최근 거래 이력 목록

> [!summary] 역할
> TransactionLog 목록을 행 카드로 표시. 거래유형·수량·메모.

## 1. 이 파일의 역할

InventoryDetailPanel의 "최근 이력" 섹션. TransactionLog 배열을 행 카드로 표시. getTransactionLabel + transactionColor로 거래 타입 표시. quantity_change 수량, notes 메모. empty state("최근 거래 이력이 없습니다").

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_inventory_sections/InventoryDetailLogList.tsx` ([[erp/frontend/app/legacy\_components\_inventory_sections/InventoryDetailLogList.tsx|원본]])

## 3. 주요 import

- `TransactionLog` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `getTransactionLabel`, `transactionColor` from `@/lib/mes-status`
- `formatQty` from `@/lib/mes/format`

## 4. 어디서 쓰이는지

- InventoryDetailPanel의 자식 섹션
- 부모: 재고 상세 view

## 5. ⚠️ 위험 포인트

> [!warning] logs 배열 empty — "거래 없음" 메시지
> quantity_change 부호 — 입/출 구분

## 6. 수정 전 체크

- [ ] TransactionLog.transaction_type enum 변경 시 getTransactionLabel 동기화
- [ ] 거래 메모 길이 제한 (overflow 방지)
