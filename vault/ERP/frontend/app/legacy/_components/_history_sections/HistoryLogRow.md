---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_history_sections/HistoryLogRow.tsx
tags: [vault, code-note, frontend, b-tier]
---

# HistoryLogRow — 거래 이력 행

> [!summary] 역할
> TransactionLog 하나를 테이블 행으로 렌더. 아이콘·날짜·메모·이동 요약.

## 1. 이 파일의 역할

HistoryTable의 각 거래 기록 행. 트랜잭션 타입별 아이콘(TX_ICON 맵), 날짜 포맷, 부서별 배경 색상(rowTint), 개편 작업 여부 표시. memo 및 movement summary cell 포함. memo 객체 재사용으로 성능 최적화(useMemo).

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_history_sections/HistoryLogRow.tsx` ([[erp/frontend/app/legacy\_components\_history_sections/HistoryLogRow.tsx|원본]])

## 3. 주요 import

- React: `memo`
- `TransactionLog` from `@/lib/api`
- Icons: `Activity`, `AlertCircle`, `ArrowDownToLine` 등 lucide-react
- Utilities: `transactionColor`, `transactionIconName` from `@/lib/mes-status`
- `formatHistoryDate`, `rowTint` from local history 모듈
- `getHistoryDisplayLabel`, `getSingleLogMovement` from `./historyBatchInterpreter`
- `isReworkOperation` from `./transactionTaxonomy`

## 4. 어디서 쓰이는지

- HistoryTable 반복 렌더 (memo로 최적화)
- 부모: 거래 이력 목록 테이블

## 5. ⚠️ 위험 포인트

> [!warning] TX_ICON 맵 누락 시 undefined icon 참조 → 에러
> memo optimization — props 얕은 비교 주의

## 6. 수정 전 체크

- [ ] transactionIconName 반환값과 TX_ICON 키 일치 확인
- [ ] 새 거래 유형 추가 시 icon 및 color 동시 등록
