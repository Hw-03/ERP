---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_warehouse_sections/WarehouseQueueRow.tsx
tags: [vault, code-note, frontend, b-tier]
---

# WarehouseQueueRow — 전체 큐 요청 행 (승인/반려)

> [!summary] 역할
> WarehouseQueuePanel의 요청 카드. 승인/반려 인라인 폼 포함.

## 1. 이 파일의 역할

제출된 StockRequest를 행으로 표시하되, inline 승인(PIN)/반려(이유+PIN) 폼을 포함. 부모(WarehouseQueuePanel)에서 전체 state 관리(busyId, approvePinFor, rejectPin 등), 행에서는 UI만 담당.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_warehouse_sections/WarehouseQueueRow.tsx` ([[erp/frontend/app/legacy\_components\_warehouse_sections/WarehouseQueueRow.tsx|원본]])

## 3. 주요 import

- `StockRequest` from `@/lib/api`
- `LEGACY_COLORS`, `normalizeDepartment`, `formatQty`
- `REQUEST_TYPE_LABEL`

## 4. 어디서 쓰이는지

- WarehouseQueuePanel 반복 렌더
- 부모: 전체 요청 승인/반려 큐

## 5. ⚠️ 위험 포인트

> [!warning] 부모 state 다다익선 — prop 드릴링 심함
> PIN 입력 실패 시 approveError/rejectError 상태 해제 필요

## 6. 수정 전 체크

- [ ] 승인/반려 흐름 PIN 검증 순서 확인
- [ ] busyId 상태 동기화 (경합 방지)
