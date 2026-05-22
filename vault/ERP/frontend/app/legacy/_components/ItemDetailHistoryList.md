---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/ItemDetailHistoryList.tsx
tags: [vault, code-note, frontend, b-tier]
---

# ItemDetailHistoryList — 품목 최근 입출고 이력

> [!summary] 역할
> TransactionLog 최근 이력. 입/출 색상 구분. ItemDetailSheet에서 사용.

## 1. 이 파일의 역할

ItemDetailSheet의 "최근 입출고" 리스트 섹션. TransactionLog 배열 표시. 입(RECEIVE) vs 출(non-RECEIVE) 색상 구분(rgba). transactionColor 적용. empty state("최근 이력이 없습니다").

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/ItemDetailHistoryList.tsx` ([[erp/frontend/app/legacy/_components/ItemDetailHistoryList.tsx|원본]])

## 3. 주요 import

- `TransactionLog` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `getTransactionLabel`, `transactionColor` from `@/lib/mes-status`
- `formatQty` from `@/lib/mes/format`

## 4. 어디서 쓰이는지

- ItemDetailSheet에서 tab="history" 시 렌더
- 부모: 품목 상세 view

## 5. ⚠️ 위험 포인트

> [!warning] logs array length 0 — "이력 없음" 표시
> transaction_type hardcoded RECEIVE 비교 — 로직 명확화

## 6. 수정 전 체크

- [ ] TransactionLog.transaction_type enum 변경 시 색상 매핑 갱신
- [ ] 이력 정렬 순서(최신순) 검증
