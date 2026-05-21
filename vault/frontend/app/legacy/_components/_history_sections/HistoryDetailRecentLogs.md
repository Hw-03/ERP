---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_history_sections/HistoryDetailRecentLogs.tsx
tags: [vault, code-note, frontend, b-tier]
---

# HistoryDetailRecentLogs — 최근 거래 목록

> [!summary] 역할
> 선택 품목의 최근 거래 목록. 클릭 가능한 행, 거래유형별 색상.

## 1. 이 파일의 역할

거래 상세 패널의 "이 품목의 최근 거래" 섹션. TransactionLog 목록을 클릭 가능한 행 카드로 표시. 거래유형별 색상 태그, 날짜, 수량. onSelectLog로 행 클릭 시 콜백. empty state 표시("최근 거래 없음").

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_history_sections/HistoryDetailRecentLogs.tsx` ([[erp/frontend/app/legacy\_components\_history_sections/HistoryDetailRecentLogs.tsx|원본]])

## 3. 주요 import

- `TransactionLog` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `transactionColor` from `@/lib/mes-status`
- `formatQty` from `@/lib/mes/format`
- `formatHistoryDate` from `./historyFormat`
- `getHistoryDisplayLabel` from `./historyBatchInterpreter`

## 4. 어디서 쓰이는지

- HistoryDetailPanel (Collapsible 섹션)
- 부모: 거래 상세 view

## 5. ⚠️ 위험 포인트

> [!warning] onSelectLog 콜백 — 부모에서 다시 로드 필요 시 의존성 확인

## 6. 수정 전 체크

- [ ] TransactionLog.transaction_type 변경 시 색상 매핑 확인
- [ ] 최근 거래 정렬 순서(최신순) 검증
